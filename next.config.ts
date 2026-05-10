import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

// Pin the workspace root so Next.js does not climb up to /Users/tj/package-lock.json
// when it auto-detects the monorepo root. Without this, the build emits a warning
// every time it boots.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  outputFileTracingRoot: __dirname,
  // Plan 19-B-07 (D-30) — Enable Next.js cache components so the `'use cache'`
  // directive used by `src/lib/data/cache/runtime-cache.ts` compiles. In
  // production this transparently routes cached values into the Vercel Runtime
  // Cache; locally it falls back to the in-memory default cache handler.
  //
  // Note (executor 2026-05-08): Next 16's `'use cache: remote'` directive
  // variant does not exist in our pinned Next 15.5.15. We use the plain
  // `'use cache'` directive (also enabled by `useCache: true`) + the
  // forthcoming `cacheComponents` flag so the wrapper compiles cleanly today
  // and is forward-compatible with the 16.x upgrade tracked in 19-B-08.
  experimental: {
    cacheComponents: true,
    useCache: true,
  },
};

export default nextConfig;
