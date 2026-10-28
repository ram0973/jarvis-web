import { PrismaClient } from '@/generated/prisma/client'
import { serverEnv } from '@/lib/env/server'
import '@point0/core/server-only'
import { PrismaPg } from '@prisma/adapter-pg'

// Postgres through Prisma's driver adapter (`pg` under the hood). The URL is schema-validated in `lib/env/server.ts`,
// so a missing DATABASE_URL fails at startup rather than on the first query.
export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: serverEnv.DATABASE_URL }),
  log: ['error'],
})
