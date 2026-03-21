import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/generated/prisma/client'

function createPrismaClient(): PrismaClient {
  // Use the pooled connection (PgBouncer) in serverless environments (Vercel)
  // to avoid exhausting PostgreSQL's connection limit across function invocations.
  // Fall back to the direct connection for local dev (where POOL_URL may be unset).
  const connectionString =
    process.env.DATABASE_POOL_URL ?? process.env.DATABASE_URL
  const adapter = new PrismaPg({ connectionString })
  return new PrismaClient({ adapter })
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
