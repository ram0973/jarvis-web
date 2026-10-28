import { adminOnlyPlugin } from '@/lib/auth/plugins'
import { root } from '@/lib/root'
import * as z from 'zod'

// This module is imported by the browser too (the editor calls the mutation), so it must stay free of server-only
// imports at module scope: the storage helpers are pulled in dynamically inside the loader/action bodies, which the
// compiler cuts from the client bundle together with their imports.

/**
 * Image upload for the wiki editor. The `File` arrives as a regular point0 input field; the loader stores it under
 * `uploads/wiki/<year>/<month>/` and returns the URL to insert into the markdown.
 *
 * @tags wiki, uploads, mutation
 */
export const wikiImageUploadMutation = root.lets
  .mutation()
  .use(adminOnlyPlugin)
  .input(z.object({ file: z.file() }))
  .loader(async ({ input }) => {
    const { saveUpload } = await import('@/lib/wiki/storage')
    return await saveUpload('wiki', input.file)
  })
  .mutation()

/**
 * Serves `/uploads/*` from disk. Runtime files cannot live under `public/` — the build copies that directory once —
 * so they get their own route, generic over apps (`/uploads/<app>/<year>/<month>/<file>`).
 *
 * @tags uploads, action
 */
export const uploadsAction = root.lets.action('GET', '/uploads/*').action(async ({ request }) => {
  const { serveUpload } = await import('@/lib/wiki/storage')
  const pathname = new URL(request.original.url).pathname
  return await serveUpload(decodeURIComponent(pathname.replace(/^\/uploads\/?/, '')))
})
