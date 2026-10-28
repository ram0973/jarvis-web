import { adminOnlyPlugin } from '@/lib/auth/plugins'
import { authServer } from '@/lib/auth/server'
import { AppError } from '@/lib/error'
import { prisma } from '@/lib/prisma'
import { root } from '@/lib/root'
import type { Prisma } from '@/generated/prisma/client'
import * as z from 'zod'

export const usersPerPage = 20

/** Three numbers for the admin overview — cheap enough to keep in one query. */
export const adminStatsQuery = root.lets
  .query()
  .use(adminOnlyPlugin)
  .loader(async () => {
    const [users, admins, banned] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: 'admin' } }),
      prisma.user.count({ where: { banned: true } }),
    ])
    return { users, admins, banned }
  })
  .query()

/**
 * One page of users, optionally filtered by name or email. The select is explicit on purpose: a row must never carry
 * the whole user record (and `Account.password` is a different table we simply never touch here).
 *
 * @tags admin, query
 */
export const adminUserListQuery = root.lets
  .query()
  .use(adminOnlyPlugin)
  .input(
    z.object({
      search: z.string().trim().max(100),
      page: z.number().int().min(1),
    }),
  )
  .loader(async ({ input }) => {
    const where: Prisma.UserWhereInput = input.search
      ? {
          OR: [{ name: { contains: input.search } }, { email: { contains: input.search } }],
        }
      : {}

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (input.page - 1) * usersPerPage,
        take: usersPerPage,
        select: {
          id: true,
          sn: true,
          name: true,
          email: true,
          role: true,
          banned: true,
          banReason: true,
          emailVerified: true,
          createdAt: true,
        },
      }),
      prisma.user.count({ where }),
    ])

    return {
      users,
      total,
      page: input.page,
      perPage: usersPerPage,
      pageCount: Math.max(1, Math.ceil(total / usersPerPage)),
    }
  })
  .query()

/**
 * Promote or demote a user. Refuses to touch the caller's own role: an admin who demotes themselves locks the panel
 * for everyone, and there is no separate super-admin to undo it.
 *
 * @tags admin, mutation
 */
export const adminUserSetRoleMutation = root.lets
  .mutation()
  .use(adminOnlyPlugin)
  .input(z.object({ userId: z.string().min(1), role: z.enum(['user', 'admin']) }))
  .loader(async ({ input, ctx }) => {
    if (ctx.me.user.id === input.userId) {
      throw new AppError('You cannot change your own role', { code: 'FORBIDDEN' })
    }
    const user = await prisma.user.update({
      where: { id: input.userId },
      data: { role: input.role },
      select: { id: true, role: true },
    })
    return { user }
  })
  .mutation({
    onSuccess: async () => {
      void adminUserListQuery.invalidateQuery(true)
      void adminStatsQuery.invalidateQuery(true)
    },
  })

/** Prisma's code for "unique constraint failed" — checked structurally so the error module stays dependency-free. */
const isUniqueViolation = (cause: unknown) =>
  typeof cause === 'object' && cause !== null && (cause as { code?: unknown }).code === 'P2002'

/**
 * Edit the profile fields an admin is allowed to touch. The email is unique in the schema, so a clash comes back as a
 * Prisma `P2002` — turned into a readable 409 here instead of a 500 with a database message.
 *
 * @tags admin, mutation
 */
export const adminUserUpdateMutation = root.lets
  .mutation()
  .use(adminOnlyPlugin)
  .input(
    z.object({
      userId: z.string().min(1),
      name: z.string().trim().min(1).max(100),
      email: z.email().trim().max(200),
    }),
  )
  .loader(async ({ input }) => {
    try {
      const user = await prisma.user.update({
        where: { id: input.userId },
        data: { name: input.name, email: input.email.toLowerCase() },
        select: { id: true, name: true, email: true },
      })
      return { user }
    } catch (cause) {
      if (isUniqueViolation(cause)) {
        throw new AppError('That email is already taken', { code: 'CONFLICT' })
      }
      throw cause
    }
  })
  .mutation({
    onSuccess: async () => {
      void adminUserListQuery.invalidateQuery(true)
    },
  })

/**
 * Ban or unban. Goes through better-auth's admin API rather than a bare Prisma update, because banning must also
 * revoke the user's live sessions — that is the whole point of a ban.
 *
 * @tags admin, mutation
 */
export const adminUserSetBannedMutation = root.lets
  .mutation()
  .use(adminOnlyPlugin)
  .input(
    z.object({
      userId: z.string().min(1),
      banned: z.boolean(),
      reason: z.string().trim().max(200).optional(),
    }),
  )
  .loader(async ({ input, ctx, request }) => {
    if (ctx.me.user.id === input.userId) {
      throw new AppError('You cannot ban yourself', { code: 'FORBIDDEN' })
    }
    const headers = request.original.headers
    if (input.banned) {
      await authServer.api.banUser({
        body: { userId: input.userId, banReason: input.reason ?? 'Banned from the admin panel' },
        headers,
      })
    } else {
      await authServer.api.unbanUser({ body: { userId: input.userId }, headers })
    }
    return { ok: true }
  })
  .mutation({
    onSuccess: async () => {
      void adminUserListQuery.invalidateQuery(true)
      void adminStatsQuery.invalidateQuery(true)
    },
  })
