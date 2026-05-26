// scripts/backfill-historical.ts
// Phase 27 D-06 — One-shot local CLI for historical technical-signal backfill.
//
// Trust boundary: runs locally via `npx tsx`, NOT inside a Vercel Function.
// Rationale: writing ~31,200 SentimentSnapshot + ~187,200 PriceOutcome rows
// far exceeds the 300s Vercel Function ceiling (D-06).
//
// Usage:
//   npx tsx scripts/backfill-historical.ts --dry-run               # preview counts, no writes
//   npx tsx scripts/backfill-historical.ts --dry-run --max-tickers 5
//   npx tsx scripts/backfill-historical.ts                          # live writes
//   npx tsx scripts/backfill-historical.ts --probe-sector           # verify sector-prices OQ1
//
// Survivorship caveat (D-03): Yahoo returns nothing for delisted tickers; this universe
// is effectively currently-listed names. See docs/paper/methodology.md.
//
// After live backfill completes, trigger the recompute pass:
//   curl -H "Authorization: Bearer $CRON_SECRET" https://ciphersearch.app/api/cron/learn

import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '.env.local' });

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import YahooFinance from 'yahoo-finance2';
import type { OhlcvBar } from '../src/lib/backtest/ohlcv-cache';

// installChartCache must be imported BEFORE technical.ts loads so the prototype
// patch covers the module-scope YahooFinance instance in technical.ts.
import { installChartCache, fetchOrLoadOhlcv } from '../src/lib/backtest/ohlcv-cache';
import { BACKFILL_UNIVERSE } from '../src/lib/backtest/universe';
import { classifyCapClass } from '../src/lib/diffusion-trace';
import { buildWeeklyAsOfDates, computeOutcomeRecordedAt } from '../src/lib/backtest/windowing';
import { getSectorETF } from '../src/lib/data/sector-mapping';
import { fetchSectorETFReturn } from '../src/lib/data/sector-prices';

// ─── Flags ───────────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes('--dry-run');
const PROBE_SECTOR = process.argv.includes('--probe-sector');

const maxTickersArg = process.argv.indexOf('--max-tickers');
const MAX_TICKERS =
  maxTickersArg !== -1 && process.argv[maxTickersArg + 1]
    ? parseInt(process.argv[maxTickersArg + 1], 10)
    : null;

// ─── Constants ───────────────────────────────────────────────────────────────

const YEARS = 5;
const FETCH_THROTTLE_MS = 1000;
// 95d safety window: snapshots older than 95d have all 6 horizons (3/7/14/30/60/90)
// resolved in history. Mirrors price-followup/route.ts's 95d windowMs.
const SAFETY_DAYS = 95;
const HORIZONS = [3, 7, 14, 30, 60, 90] as const;
const CACHE_DIR = path.join(os.homedir(), '.cipher', 'backfill-cache');
const CHECKPOINT_FILE = path.join(CACHE_DIR, 'checkpoint.json');
const BATCH_SIZE = 1000;

// ─── Checkpoint helpers ───────────────────────────────────────────────────────

function loadCheckpoint(): Set<string> {
  if (!fs.existsSync(CHECKPOINT_FILE)) return new Set<string>();
  try {
    return new Set<string>(JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8')) as string[]);
  } catch {
    return new Set<string>();
  }
}

function markDone(ticker: string, done: Set<string>): void {
  done.add(ticker);
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify([...done]));
}

// ─── Forward close lookup (from disk-cached bars) ────────────────────────────

function nearestClose(bars: OhlcvBar[], when: Date): number | null {
  let best: OhlcvBar | null = null;
  let bestDelta = Infinity;
  for (const b of bars) {
    const delta = Math.abs(b.date.getTime() - when.getTime());
    if (delta < bestDelta) {
      bestDelta = delta;
      best = b;
    }
  }
  // Reject if nearest bar is more than 7 calendar days away (holidays / weekends).
  if (best == null || bestDelta > 7 * 86_400_000) return null;
  return best.close;
}

// ─── --probe-sector mode (RESEARCH Open Question 1 / A4) ─────────────────────
// Confirms fetchSectorETFReturn supports arbitrary historical date ranges
// (month-keyed yf.chart() in sector-prices.ts is historical-range-capable).
// This resolves OQ1 before wiring the outcome path.

async function runProbe(): Promise<void> {
  const from = new Date(Date.now() - YEARS * 365 * 86_400_000);
  const to = new Date(from.getTime() + 30 * 86_400_000);
  const etf = await getSectorETF({ ticker: 'AAPL', asOfDate: from });
  const ret = await fetchSectorETFReturn(etf, from, to);
  console.log(
    `probe: ${etf} ${from.toISOString().slice(0, 10)}→${to.toISOString().slice(0, 10)} return=${ret}`,
  );
  process.exit(ret == null ? 1 : 0);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (PROBE_SECTOR) {
    await runProbe();
    return;
  }

  // T-27-06: guard — NEVER echo the DATABASE_URL value.
  if (!process.env.DATABASE_URL) {
    console.log('No DATABASE_URL — exiting cleanly.');
    return;
  }

  console.log(`backfill-historical — DRY_RUN=${DRY_RUN}, MAX_TICKERS=${MAX_TICKERS ?? 'all'}`);

  // Patch YahooFinance.prototype.chart BEFORE dynamically importing technical.ts
  // so the module-scope `new YahooFinance(...)` in technical.ts is already covered.
  // (RESEARCH Pitfall 3 — fetch-once mechanism; no edits to technical.ts needed.)
  const { uninstall } = installChartCache({ cacheDir: CACHE_DIR });

  // Dynamic import AFTER the prototype patch — static imports hoist above the patch.
  // import type { OhlcvBar } stays static (types erase at runtime).
  const { computeTechnicalSnapshot } = await import('../src/lib/data/technical');

  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  const done = loadCheckpoint();
  const universe = MAX_TICKERS
    ? BACKFILL_UNIVERSE.slice(0, MAX_TICKERS)
    : BACKFILL_UNIVERSE;

  const now = Date.now();
  const endDate = new Date(now - SAFETY_DAYS * 86_400_000);
  const startDate = new Date(now - YEARS * 365 * 86_400_000);

  let totalSnapshots = 0;
  let totalOutcomes = 0;
  let totalSectorFallback = 0;
  const globalHistogram: Record<string, number> = {};

  // COVERAGE-09: OQ1 confirmed — sector-prices.ts fetches via month-keyed yf.chart(),
  // which works for arbitrary historical date ranges. No new fetch layer needed.
  // The existing 30-day TTL cache in sector-prices.ts covers backfill re-runs.

  for (const entry of universe) {
    const ticker = entry.ticker;

    if (done.has(ticker)) {
      console.log(`  skip ${ticker} (checkpoint)`);
      continue;
    }

    console.log(`\n→ ${ticker}`);

    try {
      // ── Step 1: As-of cap_class (D-08) ──────────────────────────────────────
      // Yahoo quoteSummary returns CURRENT market cap (RESEARCH A1 — historical
      // market cap not available free). Current-cap is the documented simplification.
      const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
      let mc: number | null = null;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const q = await (yf as any).quoteSummary(ticker, { modules: ['summaryDetail', 'price'] });
        mc = q?.summaryDetail?.marketCap ?? q?.price?.marketCap ?? null;
      } catch {
        // ETF or unknown — fall through to large_cap default.
      }
      // ETFs + null marketCap → large_cap (mirrors backfill-snapshot-cap.ts line 35).
      const capClass = mc != null ? classifyCapClass(mc) : 'large_cap';

      // ── Step 2: Pre-warm disk cache (one Yahoo chart() call for the full 5y) ──
      const allBars = await fetchOrLoadOhlcv(ticker, { cacheDir: CACHE_DIR });
      console.log(`  cached ${allBars.length} bars`);

      // ── Step 3: Weekly windows ────────────────────────────────────────────────
      const asOfs = buildWeeklyAsOfDates(startDate, endDate);

      // Per-ticker accumulators.
      let scanned = 0;
      let kept = 0;
      let nullPatternSkipped = 0;
      let outcomes = 0;
      let sectorFallback = 0;

      // Batch accumulators (for non-dry-run DB writes).
      const snapBatch: Array<{
        ticker: string;
        scanned_at: Date;
        price_at_scan: number;
        community_data: object;
        technical_data: object;
        source: string;
      }> = [];

      const outcomeBatch: Array<{
        snapshot_id?: string;
        days_after: number;
        price: number;
        pct_change: number;
        recorded_at: Date;
        sector_etf: string;
        forward_return_raw: number;
        forward_return_sector_rel: number | null;
      }> = [];

      // Track which asOf dates produced valid snapshots (for snapshot_id lookup).
      const keptAsOfs: Date[] = [];

      for (const asOf of asOfs) {
        scanned++;

        // Single feature path (D-11): computeTechnicalSnapshot uses the
        // disk-cached bars via the prototype patch, so no extra Yahoo calls.
        const tech = await computeTechnicalSnapshot(ticker, asOf);

        // RESEARCH Pitfall 4: skip windows where tech == null or tech_pattern == null
        // (bar_count < 200 — insufficient warmup for SMA-200; useless for cells).
        if (tech == null || tech.tech_pattern == null) {
          nullPatternSkipped++;
          continue;
        }

        // Price at scan: use `close` (split-adjusted, per D-02) from the
        // last bar in the technical snapshot window. Avoids the forward
        // dividend-adjustment lookahead bias that the adjusted-close series carries.
        const latestBar = allBars
          .filter((b) => b.date.getTime() <= asOf.getTime())
          .at(-1);
        const priceAtScan = latestBar?.close ?? null;
        if (priceAtScan == null) {
          nullPatternSkipped++;
          continue;
        }

        kept++;
        keptAsOfs.push(asOf);

        globalHistogram[tech.tech_pattern] = (globalHistogram[tech.tech_pattern] ?? 0) + 1;

        // Build SentimentSnapshot row. scanned_at = historical window date (COVERAGE-07 / Pitfall 1).
        snapBatch.push({
          ticker,
          scanned_at: asOf, // PIT: historical date, never the run date
          price_at_scan: priceAtScan,
          community_data: { cap_class: capClass, market_cap: mc },
          technical_data: tech as object,
          source: 'backfill', // COVERAGE-09
        });

        // ── Step 4: Three outcome labels per horizon (D-12) ───────────────────
        for (const day of HORIZONS) {
          // recorded_at = scanned_at + days_after (PIT — never the run date).
          const recordedAt = computeOutcomeRecordedAt(asOf, day);

          // Skip outcomes that haven't resolved yet in history.
          if (recordedAt.getTime() > now) continue;

          // Forward close from disk-cached bars (nearest bar to recordedAt).
          const fwdClose = nearestClose(allBars, recordedAt);
          if (fwdClose == null) continue; // T-27-07: no null/NaN rows

          const absPct = ((fwdClose - priceAtScan) / priceAtScan) * 100;

          // Sector labels — replicate computeSectorLabels from price-followup/route.ts.
          // RESEARCH OQ1: fetchSectorETFReturn uses month-keyed yf.chart() internally,
          // so arbitrary historical ranges work. No new fetch layer needed.
          const sectorEtf = await getSectorETF({ ticker, asOfDate: asOf });
          let sectorReturn = await fetchSectorETFReturn(sectorEtf, asOf, recordedAt);
          let usedEtf = sectorEtf;

          if (sectorReturn == null) {
            // RESEARCH Pitfall 5: XLRE/XLC pre-inception dates → fall back to SPY.
            sectorReturn = await fetchSectorETFReturn('SPY', asOf, recordedAt);
            usedEtf = 'SPY';
            sectorFallback++;
            totalSectorFallback++;
          }

          outcomeBatch.push({
            // snapshot_id is set after DB write (see step 5)
            days_after: day,
            price: fwdClose,
            pct_change: absPct, // backward-compat column (same as forward_return_raw)
            recorded_at: recordedAt,
            sector_etf: usedEtf,
            forward_return_raw: absPct,
            forward_return_sector_rel: sectorReturn != null ? absPct - sectorReturn : null,
          });
          outcomes++;
        }
      }

      console.log(
        `  scanned=${scanned} kept=${kept} null_pattern_skipped=${nullPatternSkipped} outcomes=${outcomes} sector_fallback_to_spy=${sectorFallback}`,
      );

      totalSnapshots += kept;
      totalOutcomes += outcomes;

      if (!DRY_RUN && snapBatch.length > 0) {
        // ── Step 5: Batched idempotent writes (RESEARCH Pattern 4) ─────────────

        // Write snapshots via createMany + skipDuplicates on @@unique([ticker, scanned_at]).
        // This is idempotent across re-runs (Plan 01 applied the unique constraint).
        for (let i = 0; i < snapBatch.length; i += BATCH_SIZE) {
          await prisma.sentimentSnapshot.createMany({
            data: snapBatch.slice(i, i + BATCH_SIZE),
            skipDuplicates: true,
          });
        }

        // Re-query to map scanned_at → snapshot.id so outcomes can reference them.
        const keptAsOfStrings = keptAsOfs.map((d) => d.toISOString());
        const insertedSnaps = await prisma.sentimentSnapshot.findMany({
          where: {
            ticker,
            scanned_at: { in: keptAsOfs },
          },
          select: { id: true, scanned_at: true },
        });
        const asOfToId = new Map<string, string>(
          insertedSnaps.map((s) => [s.scanned_at.toISOString(), s.id]),
        );

        // Attach snapshot_id to each outcome.
        let snapBatchIdx = 0;
        let outcomeBatchIdx = 0;

        for (let wi = 0; wi < keptAsOfs.length; wi++) {
          const asOfStr = keptAsOfs[wi].toISOString();
          if (!keptAsOfStrings.includes(asOfStr)) continue;

          const snapId = asOfToId.get(asOfStr);
          if (!snapId) continue;

          // Outcomes for this window are contiguous (one entry per horizon per kept asOf).
          // Count them: up to HORIZONS.length outcomes per window (some may be skipped).
          const windowOutcomes: Array<(typeof outcomeBatch)[number] & { snapshot_id: string }> = [];

          // Walk outcomeBatch forward from outcomeBatchIdx, collecting outcomes
          // that belong to this window (matched by recorded_at being in the right range).
          // Since we push in order (asOf loop then horizon loop), we track outcomeBatchIdx.
          const asOfTime = keptAsOfs[wi].getTime();
          const nextAsOfTime =
            wi + 1 < keptAsOfs.length
              ? keptAsOfs[wi + 1].getTime()
              : asOfTime + 100 * 86_400_000; // last window sentinel

          while (outcomeBatchIdx < outcomeBatch.length) {
            const o = outcomeBatch[outcomeBatchIdx];
            const recAt = o.recorded_at.getTime();
            // recorded_at = asOfTime + daysAfter*86400000
            // For horizon 3d: recAt >= asOfTime+3d; for 90d: recAt <= asOfTime+90d
            const isForThisWindow =
              recAt >= asOfTime + 3 * 86_400_000 - 86_400_000 && // allow 1d tolerance
              recAt <= asOfTime + 95 * 86_400_000 && // 90d max horizon + small buffer
              recAt < nextAsOfTime + 95 * 86_400_000; // doesn't bleed into next window
            if (isForThisWindow) {
              windowOutcomes.push({ ...o, snapshot_id: snapId });
              outcomeBatchIdx++;
            } else {
              break;
            }
          }

          // Write PriceOutcome in batches.
          for (let i = 0; i < windowOutcomes.length; i += BATCH_SIZE) {
            await prisma.priceOutcome.createMany({
              data: windowOutcomes.slice(i, i + BATCH_SIZE),
              skipDuplicates: true,
            });
          }
          snapBatchIdx++;
        }

        console.log(`  wrote ${snapBatch.length} snapshots, ${outcomes} outcomes`);
      }

      markDone(ticker, done);
    } catch (err) {
      console.error(`  ERROR ${ticker}: ${(err as Error).message}`);
      // Do NOT markDone — ticker resumes on next run.
    }

    await new Promise((r) => setTimeout(r, FETCH_THROTTLE_MS));
  }

  // ─── Final summary ────────────────────────────────────────────────────────

  console.log('\n── Tech-pattern distribution ──');
  for (const [k, v] of Object.entries(globalHistogram).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(22)} ${v}`);
  }
  console.log(`\nTotal snapshots written: ${totalSnapshots}`);
  console.log(`Total outcomes written:  ${totalOutcomes}`);
  console.log(`Sector fallback to SPY:  ${totalSectorFallback}`);
  console.log(
    '\nDone. Now trigger the recompute pass: curl -H "Authorization: Bearer $CRON_SECRET" https://ciphersearch.app/api/cron/learn',
  );

  uninstall();
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
