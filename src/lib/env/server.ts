import { sharedEnvShape } from '@/lib/env/shared'
import { createEnv } from '@/lib/env/utils'
import '@point0/core/server-only'
import { z } from 'zod'

const isProdNodeEnv = process.env.NODE_ENV === 'production'

/**
 * Server-side env (the shared shape plus server-only config and secrets). Lazily validated — `app.server.ts` calls
 * `serverEnv.validate()` at startup to fail fast; reading a single variable validates just that one.
 *
 * Read server config via `serverEnv` — never `process.env` directly in features; it's schema-validated and typed. To
 * add a variable: extend the shape below and add it to `.env`.
 *
 * @tags env, zod
 * @related sharedEnvShape, clientEnv
 */
export const serverEnv = createEnv('server', {
  ...sharedEnvShape,
  // Locally we set SERVER_PORT / CLIENT_PORT; in prod the platform injects PORT instead. The engine binds
  // `SERVER_PORT || PORT`, so either works depending on what's provided.
  SERVER_PORT: isProdNodeEnv ? z.string().optional() : z.string().min(1),
  CLIENT_PORT: isProdNodeEnv ? z.string().optional() : z.string().min(1),
  PORT: z.string().optional(),
  DATABASE_URL: z.string().min(1),
  // `user:password` for the basic-auth guard in front of the OpenAPI routes — see `lib/root.tsx`.
  OPENAPI_CREDENTIALS: z.string().min(1),
  // better-auth's signing key. Keep it stable across restarts — a new value invalidates every session.
  // Generate one with `openssl rand -hex 32` (or `bun -e "..."`), never reuse the example value in production.
  BETTER_AUTH_SECRET: z.string().min(32),
  // `email:password` of the first admin, created or promoted on startup — see `lib/auth/init.ts`.
  ADMIN_CREDENTIALS: z.string().optional(),
  // Where uploaded files live. Relative paths resolve against the process cwd; the container sets `/data/uploads`.
  UPLOADS_DIR: z.string().optional(),
})
