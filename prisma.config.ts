// prisma.config.ts
// Prisma 7 configuration file — connection URLs live here instead of prisma/schema.prisma.
// DATABASE_URL: pooled Neon connection for runtime queries (via @neondatabase/serverless adapter).
// DIRECT_URL: direct Neon connection for migrations (prisma migrate dev/deploy).
import { defineConfig } from 'prisma/config';
import { config as loadEnv } from 'dotenv';

// Prisma 7 dropped the implicit .env autoload that Prisma 6 had. We use .env.local
// as the canonical secrets file (mirrors Next.js convention + matches all three Vercel
// scopes per env-parity discipline). Load .env.local first, then .env as fallback for
// keys it doesn't define. CI/Preview builds inherit DIRECT_URL from Vercel env vars
// and don't need a file — `override: false` keeps already-set values.
loadEnv({ path: '.env.local', override: false });
loadEnv({ path: '.env', override: false });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    // Fall back to empty string so `prisma generate` (which doesn't need a
    // real DB URL) succeeds in Preview/CI builds where DIRECT_URL is absent.
    // Migrations still require the real DIRECT_URL at runtime.
    url: process.env.DIRECT_URL ?? '',
  },
});
