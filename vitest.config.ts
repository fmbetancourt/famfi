import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      // Only report coverage for TypeScript source files (not .tsx UI components,
      // which cannot be tested in the node environment per project conventions).
      include: ['src/**/*.ts'],
      exclude: [
        // Test files themselves
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        // Generated code
        'src/generated/**',
        // Type declaration files (no runtime code)
        'src/types/**',
        'src/lib/auth.d.ts',
        // Next.js app layer: pages, route handlers, manifest
        // These are framework integration points with no standalone logic.
        'src/app/**',
        // Pure TypeScript interface files (compile to no runtime code)
        'src/domain/repositories/**',
        // Framework singletons / environment-dependent modules
        'src/lib/auth.ts', // NextAuth config (framework integration)
        'src/lib/prisma.ts', // Prisma singleton (DB-dependent at module level)
        // Browser-only tRPC client ('use client' — runs in Next.js RSC boundary)
        'src/infrastructure/trpc/client.ts',
        // Server-only caller (requires 'server-only' + NextAuth session at runtime)
        'src/infrastructure/trpc/server.ts',
        // Barrel re-export — only imports, no logic
        'src/infrastructure/trpc/routers/index.ts',
        // Pure constants with no logic (LucideIcon references, href strings)
        'src/components/layout/nav-items.ts',
      ],
      reporter: ['text', 'lcov'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
