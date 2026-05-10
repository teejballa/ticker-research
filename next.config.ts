import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

// Pin the workspace root so Next.js does not climb up to /Users/tj/package-lock.json
// when it auto-detects the monorepo root. Without this, the build emits a warning
// every time it boots.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  outputFileTracingRoot: __dirname,
  // Plan 19-B-07 (D-30) — Vercel Runtime Cache via 'use cache' directive
  // requires Next canary (`experimental.cacheComponents`); on pinned Next
  // 15.5.15 stable the build rejects that flag. The runtime-cache.ts wrapper
  // remains in place as a passthrough; caching for source-package idempotency
  // is handled at the upstream layer via 19-B-01 Upstash `cached()`.
  // Re-enable cacheComponents when 19-B-08 ships the Next 16 upgrade.
};

export default nextConfig;
