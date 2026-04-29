// scripts/backfill-technical.ts
// Phase 16-05 — One-shot CLI to backfill technical_data on every existing
// SentimentSnapshot row whose ticker has ≥200 daily bars, AND backfill
// PriceOutcome rows at days_after IN (30, 60, 90) for snapshots/reports
// past those thresholds.
//
// Trust boundary: runs locally via `npx tsx`, NOT inside a Vercel Function
// (RESEARCH §10 / Pitfall 4 — backfill writes ~2000 rows over ~33 min, way
// past the 300s function ceiling).
//
// Usage:
//   npx tsx scripts/backfill-technical.ts --dry-run   # preview only, no writes
//   npx tsx scripts/backfill-technical.ts             # live writes
//
// After this completes, manually call /api/cron/learn with $CRON_SECRET so
// the recompute pass runs over all 288 cells (4 flow × 4 cap × 6 horizons +
// 8 tech × 4 cap × 6 horizons).

import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '.env.local' });

import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import YahooFinance from 'yahoo-finance2';
import { computeTechnicalSnapshot } from '../src/lib/data/technical';

const DRY_RUN = process.argv.includes('--dry-run');
const HAS_DB = !!process.env.DATABASE_URL;

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

// 1s throttle between technical_data writes (yahoo-finance2 fetches ~1y of bars
// per call). 500ms throttle for historical price lookups (lighter — single bar).
const TECH_THROTTLE_MS = 1000;
const PRICE_THROTTLE_MS = 500;
const NEW_HORIZONS = [30, 60, 90] as const;

async function fetchHistoricalPrice(ticker: string, target: Date): Promise<number | null> {
  // Pull a 5-day window centered on `target` and pick the closest bar.
  const period1 = new Date(target.getTime() - 3 * 86400_000);
  const period2 = new Date(target.getTime() + 3 * 86400_000);
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = (await (yf as any).chart(ticker, {
      period1,
      period2,
      interval: '1d',
    })) as { quotes?: Array<{ date?: Date; close?: number | null }> };
    const quotes = raw?.quotes ?? [];
    if (quotes.length === 0) return null;
    let best: { date: Date; close: number } | null = null;
    let bestDelta = Number.POSITIVE_INFINITY;
    for (const q of quotes) {
      if (q.date == null || q.close == null) continue;
      const delta = Math.abs(q.date.getTime() - target.getTime());
      if (delta < bestDelta) {
        bestDelta = delta;
        best = { date: q.date, close: q.close };
      }
    }
    return best?.close ?? null;
  } catch {
    return null;
  }
}

async function main() {
  console.log(`backfill-technical — DRY_RUN=${DRY_RUN}`);

  if (!HAS_DB) {
    console.log('No DATABASE_URL set — nothing to backfill, exiting cleanly.');
    return;
  }

  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  // ────────────────────────────────────────────────────────────────────
  // Step 1: technical_data on every SentimentSnapshot whose technical_data IS NULL
  // ────────────────────────────────────────────────────────────────────
  const snaps = await prisma.sentimentSnapshot.findMany({
    where: { technical_data: { equals: undefined } },
    orderBy: { scanned_at: 'asc' },
  });

  // Defensive secondary filter — Prisma's JSON null handling can vary between
  // adapters; keep only rows where technical_data is actually unset.
  const pendingSnaps = snaps.filter((s) => s.technical_data == null);
  console.log(`\nStep 1: ${pendingSnaps.length} snapshots missing technical_data`);

  const histogram: Record<string, number> = {};
  let writes = 0;
  let errors = 0;

  for (const snap of pendingSnaps) {
    try {
      const tech = await computeTechnicalSnapshot(snap.ticker, snap.scanned_at);
      const key = tech?.tech_pattern ?? 'null';
      histogram[key] = (histogram[key] ?? 0) + 1;

      if (!DRY_RUN && tech != null) {
        await prisma.sentimentSnapshot.update({
          where: { id: snap.id },
          data: { technical_data: tech as object },
        });
        writes++;
      }
      const stamp = snap.scanned_at.toISOString().slice(0, 10);
      console.log(`  ${DRY_RUN ? '·' : '✓'} ${snap.ticker} ${stamp} → ${tech?.tech_pattern ?? 'null'}`);
    } catch (err) {
      errors++;
      console.error(`  ✗ ${snap.ticker}: ${(err as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, TECH_THROTTLE_MS));
  }

  console.log('\nTechPattern distribution:');
  for (const [k, v] of Object.entries(histogram).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(22)} ${v}`);
  }
  console.log(`\nStep 1 complete: ${writes} writes, ${errors} errors`);

  // ────────────────────────────────────────────────────────────────────
  // Step 2: PriceOutcome rows at days_after IN (30, 60, 90) for snapshots
  // ────────────────────────────────────────────────────────────────────
  const now = Date.now();
  const oldEnoughSnaps = await prisma.sentimentSnapshot.findMany({
    where: { scanned_at: { lte: new Date(now - 30 * 86400_000) } },
    include: { outcomes: true },
    orderBy: { scanned_at: 'asc' },
  });
  console.log(`\nStep 2: ${oldEnoughSnaps.length} snapshots ≥30d old — checking new horizons`);

  let snapHorizonWrites = 0;
  for (const snap of oldEnoughSnaps) {
    for (const day of NEW_HORIZONS) {
      const target = new Date(snap.scanned_at.getTime() + day * 86400_000);
      if (target.getTime() > now) continue;
      if (snap.outcomes.some((o) => o.days_after === day)) continue;
      const price = await fetchHistoricalPrice(snap.ticker, target);
      if (price == null) continue;
      const baseline = snap.price_at_scan;
      if (baseline == null || baseline === 0) continue;
      const pct = ((price - baseline) / baseline) * 100;
      if (!DRY_RUN) {
        await prisma.priceOutcome.create({
          data: {
            snapshot_id: snap.id,
            days_after: day,
            price,
            pct_change: pct,
            recorded_at: new Date(),
          },
        });
        snapHorizonWrites++;
      }
      console.log(`  ${DRY_RUN ? '·' : '✓'} ${snap.ticker} +${day}d → ${pct.toFixed(2)}%`);
      await new Promise((r) => setTimeout(r, PRICE_THROTTLE_MS));
    }
  }
  console.log(`Step 2 complete: ${snapHorizonWrites} new snapshot horizon outcomes`);

  // ────────────────────────────────────────────────────────────────────
  // Step 3: Same for Reports — backfill 30/60/90 horizons
  // ────────────────────────────────────────────────────────────────────
  const oldEnoughReports = await prisma.report.findMany({
    where: {
      analyzed_at: { lte: new Date(now - 30 * 86400_000) },
      price_at_report: { not: null },
    },
    include: { outcomes: true },
    orderBy: { analyzed_at: 'asc' },
  });
  console.log(`\nStep 3: ${oldEnoughReports.length} reports ≥30d old — checking new horizons`);

  let reportHorizonWrites = 0;
  for (const report of oldEnoughReports) {
    for (const day of NEW_HORIZONS) {
      const target = new Date(report.analyzed_at.getTime() + day * 86400_000);
      if (target.getTime() > now) continue;
      if (report.outcomes.some((o) => o.days_after === day)) continue;
      const price = await fetchHistoricalPrice(report.ticker, target);
      if (price == null) continue;
      const baseline = report.price_at_report;
      if (baseline == null || baseline === 0) continue;
      const pct = ((price - baseline) / baseline) * 100;
      if (!DRY_RUN) {
        await prisma.priceOutcome.create({
          data: {
            report_id: report.id,
            days_after: day,
            price,
            pct_change: pct,
            recorded_at: new Date(),
          },
        });
        reportHorizonWrites++;
      }
      console.log(`  ${DRY_RUN ? '·' : '✓'} ${report.ticker} (report) +${day}d → ${pct.toFixed(2)}%`);
      await new Promise((r) => setTimeout(r, PRICE_THROTTLE_MS));
    }
  }
  console.log(`Step 3 complete: ${reportHorizonWrites} new report horizon outcomes`);

  console.log('\nDone. Now manually trigger /api/cron/learn with $CRON_SECRET so the recompute pass runs over 288 cells.');
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
