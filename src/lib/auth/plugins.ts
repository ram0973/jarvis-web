import { getMeQuery } from '@/lib/auth/api'
import { getMe } from '@/lib/auth/server'
import { AppError } from '@/lib/error'
import { redirect } from '@/lib/navigation'
import { Point0 } from '@point0/core'

/**
 * Loads the current user into `ctx` (server) and `props` (render), and prefetches `getMeQuery`.
 *
 * Building block for the gates below — use one of them, not this plugin directly.
 *
 * @tags auth, plugin
 */
export const mePlugin = Point0.lets
  .plugin()
  .onPrefetchPage(async () => {
    await getMeQuery.prefetchQuery()
  })
  .ctx(async ({ request }) => ({ me: await getMe({ request }) }))
  .with(({ resolve }) => resolve(getMeQuery.useQuery(), ({ data }) => ({ me: data.me })))
  .plugin()

/**
 * Gate for signed-in users that should see an error page when anonymous. After it, `me` is non-null in `ctx` and
 * `props`.
 *
 * Note the asymmetry, it is deliberate: `.ctx` **throws** (rejects the server load), `.with` **returns** the error
 * (short-circuits to the error component during render, client included).
 *
 * @tags rule, auth, plugin
 * @related redirectUnauthorizedPlugin, adminOnlyPlugin
 */
export const authorizedOnlyPlugin = Point0.lets
  .plugin()
  .use(mePlugin)
  .ctx(({ ctx: { me } }) => {
    if (!me) {
      throw new AppError('Only for authorized users', { code: 'UNAUTHORIZED' })
    }
    return { me }
  })
  .with(({ props: { me } }) => {
    if (!me) {
      return new AppError('Only for authorized users', { code: 'UNAUTHORIZED' })
    }
    return { me }
  })
  .plugin()

/**
 * Gate for signed-in pages that are friendlier to redirect than to error on: anonymous visitors go to `signIn`.
 *
 * @tags auth, plugin
 * @related authorizedOnlyPlugin
 */
export const redirectUnauthorizedPlugin = Point0.lets
  .plugin()
  .use(mePlugin)
  .ctx(({ ctx: { me } }) => {
    if (!me) {
      return redirect('signIn')
    }
    return { me }
  })
  .with(({ props: { me } }) => {
    if (!me) {
      return redirect('signIn')
    }
    return { me }
  })
  .plugin()

/**
 * The mirror image: keeps already signed-in users off `signIn` / `signUp`.
 *
 * @tags auth, plugin
 */
export const redirectAuthorizedPlugin = Point0.lets
  .plugin()
  .use(mePlugin)
  .ctx(({ ctx: { me } }) => {
    if (me) {
      return redirect('home')
    }
    return { me }
  })
  .with(({ props: { me } }) => {
    if (me) {
      return redirect('home')
    }
    return { me }
  })
  .plugin()

/**
 * Admin-only gate. `redirectUnauthorizedPlugin` is not its parent on purpose: an anonymous visitor gets the same
 * `FORBIDDEN` as a signed-in non-admin, and the UI never reveals that an admin area exists.
 *
 * @tags rule, auth, plugin, admin
 */
export const adminOnlyPlugin = Point0.lets
  .plugin()
  .use(mePlugin)
  .ctx(({ ctx: { me } }) => {
    if (!me?.admin) {
      throw new AppError('Only for admins', { code: 'FORBIDDEN' })
    }
    return { me }
  })
  .with(({ props: { me } }) => {
    if (!me?.admin) {
      return new AppError('Only for admins', { code: 'FORBIDDEN' })
    }
    return { me }
  })
  .plugin()
