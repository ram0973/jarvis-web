import { clientEnv } from '@/lib/env/client'
import { queryClient } from '@/lib/query-client'
import { env } from '@point0/core'
import { createAuthClient } from 'better-auth/react'

/**
 * Browser-side better-auth client, used only for mutations: sign in, sign up, sign out. Session *reads* go through
 * `getMeQuery` instead, so every consumer shares one cache and one source of truth.
 *
 * Importing this module on the server is allowed, calling it there throws — the server talks to `authServer` directly.
 * The session cookie is `HttpOnly` and `SameSite=Lax`, so it rides along automatically (`credentials: 'include'`);
 * nothing about the token is exposed to JS.
 *
 * @tags auth, client
 * @related getMeQuery, signOut
 */
export const authClient = env.side.define({
  client: createAuthClient({
    // In dev this is CLIENT_URL (the browser's origin): the client dev server proxies `/api/auth/*` to the server.
    baseURL: clientEnv.SERVER_URL,
    fetchOptions: {
      credentials: 'include',
    },
  }),
  server: new Proxy(
    {},
    {
      get() {
        throw new Error('authClient is browser-only — use authServer on the server')
      },
    },
  ) as never,
})

/**
 * Sign out everywhere this browser is concerned: clear the session cookie via better-auth, then drop every cached
 * query — the next render starts from a clean, anonymous state.
 *
 * @tags auth
 * @related authClient, getMeQuery
 */
export const signOut = async () => {
  await authClient.signOut()
  queryClient.clear()
}
