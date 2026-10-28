import { root } from '@/lib/root'

/**
 * Readiness probe for whatever sits in front of the app: kamal-proxy in production, a compose healthcheck locally.
 * It touches the database on purpose — a server that is up but cannot reach Postgres would otherwise pass the check
 * and keep answering 500s. `SELECT 1` is cheap enough to run every few seconds.
 *
 * @tags ops, action
 */
export const healthAction = root.lets.action('GET', '/health').action(async () => {
  const { prisma } = await import('@/lib/prisma')
  try {
    await prisma.$queryRaw`SELECT 1`
  } catch {
    return new Response(JSON.stringify({ ok: false, database: 'unreachable' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    })
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
})
