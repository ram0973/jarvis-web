import { getMe } from '@/lib/auth/server'
import { root } from '@/lib/root'

/**
 * The current visitor, as the client sees it. One query for the whole app, kept never-stale (`staleTime: Infinity`):
 * after a sign-in or sign-out we refetch it by hand, so every consumer flips together and the header cannot show a
 * stale "signed in" state.
 *
 * Reads the `HttpOnly` session cookie server-side — the browser never touches the cookie itself.
 *
 * @tags auth, query
 * @related getMe, mePlugin
 */
export const getMeQuery = root.lets
  .query()
  .loader(async ({ request }) => ({ me: await getMe({ request }) }))
  .query({ staleTime: Infinity })
