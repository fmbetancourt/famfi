import 'dotenv/config'
import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'npx tsx prisma/seed.ts',
  },
  datasource: {
    // Use process.env directly (with fallback) instead of the strict env() helper
    // so that `prisma generate` (postinstall) works in CI environments where
    // DATABASE_URL is not set. The real URL is always present at runtime.
    url: process.env.DATABASE_URL ?? 'postgresql://localhost/prisma',
  },
})
