#!/usr/bin/env tsx
// scripts/alpha-decay-cron-benchmark.ts
//
// Phase 19-A-05 Task 5b: One-shot benchmark of the alpha-decay-watch cron
// against the live Neon universe. Measures elapsed_ms and gates against
// the 300s Vercel function ceiling with safety margin.
//
// Run:
//   npm run alpha-decay-cron-benchmark
// or:
//   npx tsx scripts/alpha-decay-cron-benchmark.ts
//
// Operator decision thresholds (per plan):
//   < 100s   → safe within 300s ceiling, large headroom; SHIP
//   100-200s → tight; document and proceed but monitor production logs
//   > 200s   → fallback REQUIRED before deploy:
//                a) batch + index hints (preferred, no schema change), or
//                b) add rolling_ic_history JSONB column to LearnedPattern
//                   via 19-Z-02 reissue
//
// Records elapsed_ms in stdout JSON for the SUMMARY commit message.

import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '.env.local' });
import { NextRequest } from 'next/server';

async function main() {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('FATAL: CRON_SECRET not set in .env.local — cannot authenticate against the route handler.');
    process.exit(2);
  }
  if (!process.env.DATABASE_URL) {
    console.error('FATAL: DATABASE_URL not set — cannot run a realistic-universe benchmark.');
    process.exit(2);
  }

  // Lazy-import the route AFTER env is loaded so prisma adapter sees
  // DATABASE_URL on construction.
  const { GET } = await import('../src/app/api/cron/alpha-decay-watch/route');
  const req = new NextRequest('http://localhost/api/cron/alpha-decay-watch', {
    headers: { authorization: `Bearer ${cronSecret}` },
  });

  const t0 = Date.now();
  const res = await GET(req);
  const elapsedMs = Date.now() - t0;
  const body = await res.json();

  const report = {
    elapsed_ms: elapsedMs,
    status: res.status,
    body,
  };
  console.log(JSON.stringify(report, null, 2));

  if (elapsedMs > 200_000) {
    console.error(
      `FAIL: cron benchmark took ${elapsedMs}ms > 200000ms — activate fallback (see plan 19-A-05 Task 5b notes) before deploy.`,
    );
    process.exit(1);
  }
  if (elapsedMs > 100_000) {
    console.warn(
      `WARN: cron benchmark took ${elapsedMs}ms > 100000ms — within ceiling but document and monitor in production.`,
    );
  } else {
    console.log(`OK: cron benchmark elapsed_ms=${elapsedMs} < 100s — safe within 300s ceiling, ship.`);
  }
}

main().catch((e) => {
  console.error('Benchmark errored:', e);
  process.exit(2);
});
