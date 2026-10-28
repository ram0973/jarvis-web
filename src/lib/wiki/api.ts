import { adminOnlyPlugin } from '@/lib/auth/plugins'
import { AppError } from '@/lib/error'
import { prisma } from '@/lib/prisma'
import { root } from '@/lib/root'
import { buildTree } from '@/lib/wiki/tree'
import * as z from 'zod'

// Everything Prisma touches lives inside loader bodies on purpose: the compiler cuts those bodies (and their imports)
// out of the client bundle, but it cannot cut a module-level helper, so one such helper would drag `pg` into the
// browser build. Pure helpers (`tree.ts`) stay at module scope — they are client-safe.

const pageFields = { id: true, slug: true, title: true, parentId: true, position: true } as const
const pageOrder = [{ position: 'asc' as const }, { title: 'asc' as const }]

/**
 * The whole sidebar tree. Small enough to load at once (a wiki's navigation is hundreds of rows at most), and one
 * query keeps the public pages and the admin list consistent.
 *
 * @tags wiki, query
 */
export const wikiTreeQuery = root.lets
  .query()
  .loader(async () => {
    const pages = await prisma.wikiPage.findMany({ orderBy: pageOrder, select: pageFields })
    return { tree: buildTree(pages) }
  })
  .query({ staleTime: 60 * 1000 })

/** Flat list with parents — the admin table renders it indented, so it needs the whole set at once. */
export const adminWikiListQuery = root.lets
  .query()
  .use(adminOnlyPlugin)
  .loader(async () => ({
    pages: await prisma.wikiPage.findMany({
      orderBy: pageOrder,
      select: { ...pageFields, updatedAt: true },
    }),
  }))
  .query()

/** Everything the editor needs for one page (`null` for the "new page" route). */
export const adminWikiPageQuery = root.lets
  .query()
  .use(adminOnlyPlugin)
  .input(z.object({ id: z.string() }))
  .loader(async ({ input }) => {
    if (!input.id) {
      return { page: null }
    }
    const page = await prisma.wikiPage.findUnique({ where: { id: input.id } })
    if (!page) {
      throw new AppError('Page not found', { code: 'NOT_FOUND' })
    }
    return {
      page: {
        id: page.id,
        slug: page.slug,
        title: page.title,
        content: page.content,
        parentId: page.parentId,
        position: page.position,
      },
    }
  })
  .query()

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase latin letters, digits and dashes')

const isUniqueViolation = (cause: unknown) =>
  typeof cause === 'object' && cause !== null && (cause as { code?: unknown }).code === 'P2002'

const isRelationViolation = (cause: unknown) =>
  typeof cause === 'object' && cause !== null && (cause as { code?: unknown }).code === 'P2003'

/**
 * Create a page. `parentId` decides where it lands in the tree; the slug becomes the public URL.
 *
 * @tags wiki, mutation
 */
export const wikiPageCreateMutation = root.lets
  .mutation()
  .use(adminOnlyPlugin)
  .input(
    z.object({
      title: z.string().trim().min(1).max(200),
      slug: slugSchema,
      parentId: z.string().min(1).nullable(),
      content: z.string().default(''),
      position: z.number().int().default(0),
    }),
  )
  .loader(async ({ input }) => {
    try {
      const page = await prisma.wikiPage.create({
        data: {
          title: input.title,
          slug: input.slug,
          parentId: input.parentId,
          content: input.content,
          position: input.position,
        },
        select: { id: true },
      })
      return { page }
    } catch (cause) {
      if (isUniqueViolation(cause)) {
        throw new AppError('Another page already uses this slug', { code: 'CONFLICT' })
      }
      throw cause
    }
  })
  .mutation({
    onSuccess: async () => {
      void adminWikiListQuery.invalidateQuery(true)
      void wikiTreeQuery.invalidateQuery(true)
    },
  })

/**
 * Update a page. Moving it in the tree is just a new `parentId`.
 *
 * @tags wiki, mutation
 */
export const wikiPageUpdateMutation = root.lets
  .mutation()
  .use(adminOnlyPlugin)
  .input(
    z.object({
      id: z.string().min(1),
      title: z.string().trim().min(1).max(200),
      slug: slugSchema,
      parentId: z.string().min(1).nullable(),
      content: z.string(),
      position: z.number().int(),
    }),
  )
  .loader(async ({ input }) => {
    if (input.parentId === input.id) {
      throw new AppError('A page cannot be its own parent', { code: 'FORBIDDEN' })
    }
    try {
      const page = await prisma.wikiPage.update({
        where: { id: input.id },
        data: {
          title: input.title,
          slug: input.slug,
          parentId: input.parentId,
          content: input.content,
          position: input.position,
        },
        select: { id: true, slug: true },
      })
      return { page }
    } catch (cause) {
      if (isUniqueViolation(cause)) {
        throw new AppError('Another page already uses this slug', { code: 'CONFLICT' })
      }
      throw cause
    }
  })
  .mutation({
    onSuccess: async () => {
      void adminWikiListQuery.invalidateQuery(true)
      void wikiTreeQuery.invalidateQuery(true)
    },
  })

/**
 * Delete a leaf page. A page with children is refused by the foreign key (`Restrict`) — a whole section must be
 * dismantled deliberately, not lost with one click.
 *
 * @tags wiki, mutation
 */
export const wikiPageDeleteMutation = root.lets
  .mutation()
  .use(adminOnlyPlugin)
  .input(z.object({ id: z.string().min(1) }))
  .loader(async ({ input }) => {
    try {
      await prisma.wikiPage.delete({ where: { id: input.id } })
      return { ok: true }
    } catch (cause) {
      if (isRelationViolation(cause)) {
        throw new AppError('Delete or move its child pages first', { code: 'CONFLICT' })
      }
      throw cause
    }
  })
  .mutation({
    onSuccess: async () => {
      void adminWikiListQuery.invalidateQuery(true)
      void wikiTreeQuery.invalidateQuery(true)
    },
  })
