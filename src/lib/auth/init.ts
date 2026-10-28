import { authServer } from '@/lib/auth/server'
import { serverEnv } from '@/lib/env/server'
import { prisma } from '@/lib/prisma'

/**
 * Make sure the first admin exists, so there is a way in before any sign-in UI lands. Reads `ADMIN_CREDENTIALS`
 * (`email:password`): creates the user when missing, or promotes an existing user with that email to `role: 'admin'`.
 * Idempotent — safe to run on every start. Called from `app.server.ts` before the server starts serving.
 *
 * @tags auth, admin, bootstrap
 * @related authServer
 */
export const ensureInitialAdmin = async () => {
  const credentials = serverEnv.ADMIN_CREDENTIALS
  if (!credentials) {
    console.warn('[auth] ADMIN_CREDENTIALS is not set — skipping the initial admin')
    return
  }

  const separator = credentials.indexOf(':')
  if (separator <= 0) {
    throw new Error('ADMIN_CREDENTIALS must look like "email:password"')
  }

  const email = credentials.slice(0, separator).trim().toLowerCase()
  const password = credentials.slice(separator + 1)

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    if (existing.role !== 'admin') {
      await prisma.user.update({ where: { id: existing.id }, data: { role: 'admin' } })
      console.info(`[auth] Promoted ${email} to admin`)
    }
    return
  }

  // Through better-auth itself, so the password is hashed the same way a sign-up would hash it.
  await authServer.api.signUpEmail({ body: { email, password, name: 'Admin' } })
  await prisma.user.update({ where: { email }, data: { role: 'admin' } })
  console.info(`[auth] Created initial admin ${email}`)
}
