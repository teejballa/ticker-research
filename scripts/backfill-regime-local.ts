#!/usr/bin/env tsx
/**
 * Phase 22 Wave 2 — LOCAL backfill workaround.
 *
 * Why this script exists:
 *   The production `/api/cron/backfill-regime` cron is blocked because Yahoo
 *   Finance is rate-limiting / IP-blocking Vercel's egress IPs (every
 *   `query2.finance.yahoo.com` call from prod returns an error). Polygon's
 *   free tier doesn't include `I:VIX` (NOT_AUTHORIZED) or historical SPY bars
 *   (timeframe-locked). So the production cron can never advance.
 *
 *   This script runs the same logic from a developer machine where Yahoo IS
 *   reachable, writes the resolved regime labels directly to Neon via
 *   DIRECT_URL, and walks every legacy `regime='ALL'` row to completion.
 *
 *   Once a production-safe provider (FRED + API key, Tiingo paid, or Polygon
 *   paid tier) is wired into the regime classifier as a Tier-3 fallback,
 *   re-enable the prod cron by clearing `BACKFILL_REGIME_DISABLED` and let
 *   it sweep any new rows added since this local pass.
 *
 * Usage:
 *   npx tsx scripts/backfill-regime-local.ts
 *
 * Env:
 *   DIRECT_URL — Neon direct connection (loaded from .env.local).
 *
 * Idempotent: only touches rows where regime='ALL'. Safe to re-run.
 */

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local', override: false });
loadEnv({ path: '.env', override: false });

import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { classifyRegimeAt } from '../src/lib/regime/classify';

const BATCH = 250;
const THROTTLE_MS = 200;
const MAX_RETRIES = 100;  // retries on Neon WebSocket drops

async function runPass() {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DIRECT_URL/DATABASE_URL missing — load .env.local first.');
    process.exit(1);
  }

  const adapter = new PrismaNeon({ connectionString });
  const prisma = new PrismaClient({ adapter });

  try {
    // ── Pass 1: SentimentSnapshot ───────────────────────────────────────────
    const totalSnapshots = await prisma.sentimentSnapshot.count({
      where: { regime: 'ALL' },
    });
    console.log(`[backfill-local] sentiment_snapshots regime='ALL' rows: ${totalSnapshots}`);

    let snapProcessed = 0;
    let snapDualNull = 0;
    let snapCursor: string | undefined = undefined;

    while (true) {
      const batch = await prisma.sentimentSnapshot.findMany({
        where: {
          regime: 'ALL',
          ...(snapCursor ? { id: { gt: snapCursor } } : {}),
        },
        orderBy: { id: 'asc' },
        take: BATCH,
        select: { id: true, scanned_at: true },
      });
      if (batch.length === 0) break;

      for (const row of batch) {
        const result = await classifyRegimeAt({ asOf: row.scanned_at });
        if (result.regime === 'ALL') {
          snapDualNull++;
        } else {
          await prisma.sentimentSnapshot.update({
            where: { id: row.id },
            data: {
              regime: result.regime,
              regime_vix_level: result.vix_level,
              regime_vix_pctile: result.vix_60d_percentile,
              regime_ma_diff: result.spy_ma_50_minus_200,
            },
          });
          snapProcessed++;
        }
        snapCursor = row.id;
        if (THROTTLE_MS > 0) await new Promise((r) => setTimeout(r, THROTTLE_MS));
      }
      console.log(
        `[backfill-local] snapshots: processed=${snapProcessed} dual_null=${snapDualNull} cursor=${snapCursor?.slice(0, 8)}`,
      );
    }

    // ── Pass 2: PerSourceIC ─────────────────────────────────────────────────
    const totalIc = await prisma.perSourceIC.count({ where: { regime: 'ALL' } });
    console.log(`[backfill-local] per_source_ic regime='ALL' rows: ${totalIc}`);

    let icProcessed = 0;
    let icDualNull = 0;
    let icCursor: string | undefined = undefined;

    while (true) {
      const batch = await prisma.perSourceIC.findMany({
        where: {
          regime: 'ALL',
          ...(icCursor ? { id: { gt: icCursor } } : {}),
        },
        orderBy: { id: 'asc' },
        take: BATCH,
        select: { id: true, computed_at: true },
      });
      if (batch.length === 0) break;

      for (const row of batch) {
        const result = await classifyRegimeAt({ asOf: row.computed_at });
        if (result.regime === 'ALL') {
          icDualNull++;
        } else {
          await prisma.perSourceIC.update({
            where: { id: row.id },
            data: { regime: result.regime },
          });
          icProcessed++;
        }
        icCursor = row.id;
        if (THROTTLE_MS > 0) await new Promise((r) => setTimeout(r, THROTTLE_MS));
      }
      console.log(
        `[backfill-local] per_source_ic: processed=${icProcessed} dual_null=${icDualNull} cursor=${icCursor?.slice(0, 8)}`,
      );
    }

    // ── Final distribution snapshot ─────────────────────────────────────────
    const snapDist = await prisma.sentimentSnapshot.groupBy({
      by: ['regime'],
      _count: { _all: true },
    });
    console.log('[backfill-local] sentiment_snapshots final distribution:');
    for (const r of snapDist) console.log(`  ${r.regime}: ${r._count._all}`);

    const icDist = await prisma.perSourceIC.groupBy({
      by: ['regime'],
      _count: { _all: true },
    });
    console.log('[backfill-local] per_source_ic final distribution:');
    for (const r of icDist) console.log(`  ${r.regime}: ${r._count._all}`);

    console.log('[backfill-local] DONE');
  } finally {
    await prisma.$disconnect();
  }
}

// Wraps runPass with retry-on-drop so transient Neon WebSocket closures don't
// require manual restarts. Each retry reconnects via a fresh PrismaClient and
// resumes from cursor (idempotent: WHERE regime='ALL' excludes done rows).
async function main() {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await runPass();
      console.log(`[backfill-local] runPass completed successfully on attempt ${attempt}`);
      return;
    } catch (e) {
      const msg = (e as { message?: string })?.message ?? String(e);
      console.error(`[backfill-local] attempt ${attempt}/${MAX_RETRIES} dropped:`, msg.slice(0, 200));
      if (attempt === MAX_RETRIES) throw e;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

main().catch((e) => {
  console.error('[backfill-local] fatal:', e);
  process.exit(1);
});
