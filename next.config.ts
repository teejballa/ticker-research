import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

// Pin the workspace root so Next.js does not climb up to /Users/tj/package-lock.json
// when it auto-detects the monorepo root. Without this, the build emits a warning
// every time it boots.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
