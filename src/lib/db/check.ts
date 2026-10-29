import { PrismaClient } from '@/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { serverEnv } from '@/lib/env/server'
import '@point0/core/server-only'

// Startup probe for Postgres. The server refuses to boot when the database is unreachable, and the reason is printed as
// a short, actionable message instead of a Prisma stack trace — the common case is simply "Docker is not running".
//
// The probe uses its own client with `log: []`: the shared client logs every failed query, which would bury the readable
// message under five `prisma:error` blocks.

const ATTEMPTS = 5
const RETRY_DELAY_MS = 1000
const QUERY_TIMEOUT_MS = 3000

/** `postgresql://user:password@host:port/db` with the password removed — safe to print in logs. */
const describeTarget = (databaseUrl: string) => {
  try {
    const parsed = new URL(databaseUrl)
    const user = parsed.username ? `${parsed.username}@` : ''
    return `${parsed.protocol}//${user}${parsed.host}${parsed.pathname}`
  } catch {
    return '(DATABASE_URL is not a valid URL)'
  }
}

/** Prisma wraps the useful text in `Message: ...` / `Can't reach database server at host:port`; surface that part. */
const reasonOf = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  const wrapped = /Message:\s*`([^`]+)`/.exec(message)
  if (wrapped) {
    return wrapped[1]
  }
  const lines = message
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  return (
    lines.find((line) => /ECONNREFUSED|ETIMEDOUT|timeout|reach database|authentication/i.test(line)) ??
    lines[0] ??
    message
  )
}

/** Turns the usual connection failures into what the operator should actually do. */
const hintFor = (reason: string) => {
  if (/ECONNREFUSED|P1001|reach database server/i.test(reason)) {
    return 'nothing is listening on that host:port — start the database: `docker compose up -d db` (dev), or check the db service (prod)'
  }
  if (/28P01|P1000|authentication failed/i.test(reason)) {
    return 'wrong credentials — POSTGRES_PASSWORD and the password inside DATABASE_URL must match'
  }
  if (/P1002|timeout/i.test(reason)) {
    return 'the connection timed out — check the host/port and that nothing blocks access (firewall, docker network)'
  }
  if (/does not exist|database .* not found/i.test(reason)) {
    return 'the database itself is missing — create it once (`bun run setup`) or check POSTGRES_DB'
  }
  return 'check DATABASE_URL and that PostgreSQL is running'
}

/** Rejects if the probe hangs (a firewalled host, for example) instead of blocking startup for minutes. */
const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout after ${timeoutMs} ms`)), timeoutMs)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    clearTimeout(timer)
  }
}

const probe = async () => {
  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: serverEnv.DATABASE_URL }),
    log: [],
  })
  try {
    await withTimeout(client.$queryRaw`SELECT 1`, QUERY_TIMEOUT_MS)
  } finally {
    await client.$disconnect().catch(() => undefined)
  }
}

/**
 * Waits for Postgres before the server starts serving. A few short retries cover the case where the database container
 * is still booting; after that the process exits with a readable diagnosis. Called from `app.server.ts`.
 *
 * @tags db, startup
 * @related prisma
 */
export const waitForDatabase = async () => {
  const target = describeTarget(serverEnv.DATABASE_URL)

  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      await probe()
      console.info(`[db] connected to ${target}`)
      return
    } catch (error) {
      const reason = reasonOf(error)

      if (attempt < ATTEMPTS) {
        console.warn(`[db] attempt ${attempt}/${ATTEMPTS} failed: ${reason} — retrying in ${RETRY_DELAY_MS} ms`)
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
        continue
      }

      console.error(
        [
          '',
          `[db] cannot reach PostgreSQL at ${target}`,
          `[db] reason: ${reason}`,
          `[db] hint: ${hintFor(reason)}`,
          '[db] the server will not start until the database is reachable',
          '',
        ].join('\n'),
      )
      throw new Error('database is not reachable')
    }
  }
}
