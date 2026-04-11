// prisma.config.ts
// Prisma 7 configuration file — connection URLs live here instead of prisma/schema.prisma.
// DATABASE_URL: pooled Neon connection for runtime queries (via @neondatabase/serverless adapter).
// DIRECT_URL: direct Neon connection for migrations (prisma migrate dev/deploy).
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    // Fall back to empty string so `prisma generate` (which doesn't need a
    // real DB URL) succeeds in Preview/CI builds where DIRECT_URL is absent.
    // Migrations still require the real DIRECT_URL at runtime.
    url: process.env.DIRECT_URL ?? '',
  },
});
