// prisma.config.ts
// Prisma 7 configuration file — connection URLs live here instead of prisma/schema.prisma.
// DATABASE_URL: pooled Neon connection for runtime queries (via @neondatabase/serverless adapter).
// DIRECT_URL: direct Neon connection for migrations (prisma migrate dev/deploy).
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DIRECT_URL'),
  },
});
