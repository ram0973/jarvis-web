import { prisma } from '@/lib/prisma'
import { serverEnv } from '@/lib/env/server'
import { getRequest } from '@point0/core'
import type { Request0 } from '@point0/core/request0'
import '@point0/core/server-only'
import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { admin } from 'better-auth/plugins'

/**
 * The better-auth server instance. Its schema lives in the four `User` / `Session` / `Account` / `Verification` models
 * of `prisma/schema.prisma`; the whole `/api/auth/*` route set is mounted in `src/lib/root.tsx` as one middleware, so
 * every auth endpoint (sign-up, sign-in, get-session, …) comes from better-auth rather than from us.
 *
 * Server-only — importing this module from client code fails the build on purpose.
 *
 * @tags auth, better-auth
 * @related ensureInitialAdmin, root
 */
export const authServer = betterAuth({
  secret: serverEnv.BETTER_AUTH_SECRET,
  // Public origin of the app. In dev the browser uses CLIENT_URL and the client dev server proxies `/api/auth/*` to the
  // server, so both origins are trusted.
  baseURL: serverEnv.SERVER_URL,
  trustedOrigins: [serverEnv.CLIENT_URL, serverEnv.SERVER_URL],
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  advanced: {
    database: {
      // The schema also defaults ids to uuid — keep both in sync so a row created by either side looks the same.
      generateId: 'uuid',
    },
    ipAddress: {
      // Behind the proxy every request arrives from a private address (Caddy's container, or localhost in dev), so the
      // rightmost `x-forwarded-for` hops can be trusted. Without this, better-auth cannot name a client and rate
      // limiting collapses into one shared bucket for every visitor.
      ipAddressHeaders: ['x-forwarded-for'],
      trustedProxies: ['127.0.0.1', '::1', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'],
    },
  },
  emailAndPassword: {
    enabled: true,
  },
  // `sn` is ours, not better-auth's: declaring it here teaches the session read about the column (otherwise it never
  // appears in `me.user`) and marks it as server-owned — a sign-up form cannot set it.
  user: {
    additionalFields: {
      sn: { type: 'number', input: false },
    },
  },
  // Roles, bans, and impersonation. Gives `User.role` / `banned` / `banReason` / `banExpires` and
  // `Session.impersonatedBy` their meaning; the admin UI itself is ours (see later steps).
  plugins: [admin()],
})

/**
 * Re-read the session and bypass the per-request cache. Use it after mutating the user (role, ban, …) when the next
 * read inside the same request must already see the change.
 *
 * @tags auth, better-auth
 * @related getMe, getMeCached
 */
export const getMeFresh = async ({ request }: { request?: Request0 } = {}) => {
  request ??= getRequest()
  const result = await authServer.api.getSession({ headers: request.original.headers })
  if (!result) {
    request.cache.me = null
    return null
  }
  // The session row carries the raw cookie value. Never hand it to the render: everything a loader returns is
  // serialized into the page for hydration, which would publish an `HttpOnly` token in the HTML. Server code that
  // genuinely needs the token must call `authServer.api.getSession` itself.
  const { token: _token, ...session } = result.session
  const me = { session, user: result.user, admin: result.user.role === 'admin' }
  request.cache.me = me
  return me
}

// The session lives on the request, not in a module variable: one process serves many users at once.
declare module '@point0/core/request0' {
  interface RequestCache {
    me?: Me | null
  }
}

export type Me = NonNullable<Awaited<ReturnType<typeof getMeFresh>>>

/**
 * Read whatever `getMe` already stored on the current request without running it: `undefined` when it hasn't run,
 * `null` for an anonymous visitor, `Me` otherwise.
 *
 * @tags auth
 * @related getMe
 */
export const getMeCached = ({ request }: { request?: Request0 } = {}): Me | undefined | null => {
  request ??= getRequest()
  return request.cache.me
}

/**
 * Canonical server-side session read, cached per request. `null` means anonymous — it is not an error. The cookie is
 * `HttpOnly`, so the browser cannot read it from JS: every session check comes through here (server) or through
 * `getMeQuery` (client), never through `document.cookie`.
 *
 * @tags auth
 * @related getMeFresh, getMeCached, getMeQuery
 */
export const getMe = async ({ request }: { request?: Request0 } = {}) => {
  request ??= getRequest()
  if (request.cache.me !== undefined) {
    return request.cache.me
  }
  return await getMeFresh({ request })
}
