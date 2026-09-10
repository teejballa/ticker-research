#!/usr/bin/env tsx
// @ts-nocheck
/**
 * Local LearningEvent backfill for Phase 27 historical outcomes.
 *
 * Phase 27's direct-write backfill incremented alpha/beta/sample_size in
 * learned_patterns WITHOUT calling processOneOutcome. No LearningEvents were
 * created. evaluateOneCell gets rawEvents=[1 row] → ESS=1.0 → all 5 ACTIVE
 * gates fail permanently for diffusion/technical cells.
 *
 * Strategy: group outcomes by ticker, bulk-load all snapshots per ticker into
 * memory, process all outcomes for that ticker locally, then batch-write
 * LearningEvents. Reduces Neon round-trips from 154k×3 to N_tickers×1 + 154k/500.
 *
 * Does NOT update alpha/beta — already correct from Phase 27.
 * SPY return: omitted (null) — sector_relative_pct drives hit classification.
 *
 * Usage: npx tsx scripts/backfill-learning-events.ts
 * Env:   DIRECT_URL or DATABASE_URL (loaded from .env.local)
 * Idempotent: skips outcomes already linked to a LearningEvent; writes a
 *             'learning_event_backfill_complete' marker at the end.
 */

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local', override: false });
loadEnv({ path: '.env', override: false });

import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import {
  computeDiffusionTrace,
  classifyCapClass,
} from '../src/lib/diffusion-trace';
import { classifyHit, filterSnapshotsForEmbargo } from '../src/lib/learning';

const WRITE_BATCH = 500;
const MARKER = 'learning_event_backfill_complete';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Outcome {
  outcome_id: string;
  ticker: string;
  scanned_at: Date;
  recorded_at: Date;
  ticker_return_pct: number;
  sector_relative_pct: number | null;
  days_after: number;
  snapshot_id: string | null;
  snapshot_source: string;
}

interface SnapCache {
  id: string;
  scanned_at: Date;
  community_data: any;
  technical_data: any;
  insider_data: any;
  institutional_data: any;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildTrace(snapshotsByScannedAt: SnapCache[], outcome: Outcome) {
  const before = snapshotsByScannedAt
    .filter((s) => s.scanned_at <= outcome.scanned_at)
    .slice(-4); // take up to 4 most recent before scanned_at (array is asc-sorted)
  if (before.length < 2) return null;

  const embargoed = filterSnapshotsForEmbargo(before, outcome.recorded_at, outcome.days_after);
  if (embargoed.length < 2) return null;

  const histQuantity: number[] = [];
  const histQuality: number[] = [];
  for (const s of snapshotsByScannedAt) {
    const cd = s.community_data;
    if (cd && typeof cd.quantity === 'number') histQuantity.push(cd.quantity);
    if (cd && typeof cd.quality === 'number') histQuality.push(cd.quality);
  }

  const inputs = embargoed.map((s) => ({
    scanned_at: s.scanned_at,
    community_data: s.community_data ?? {},
  }));

  return computeDiffusionTrace(inputs, histQuantity, histQuality) ?? null;
}

function buildEvent(outcome: Outcome, snaps: SnapCache[]) {
  const trace = buildTrace(snaps, outcome);

  // Snapshot-level signals
  let techPattern: string | null = null;
  let insiderBucket: string | null = null;
  let institutionalBucket: string | null = null;
  let resolvedCap: string | null = trace?.cap_class ?? null;

  if (outcome.snapshot_id) {
    const snap = snaps.find((s) => s.id === outcome.snapshot_id);
    if (snap) {
      techPattern = snap.technical_data?.tech_pattern ?? null;
      insiderBucket = snap.insider_data?.insider_bucket ?? null;
      institutionalBucket = snap.institutional_data?.institutional_bucket ?? null;

      if (!resolvedCap) {
        const cd = snap.community_data;
        if (cd?.cap_class && cd.cap_class !== 'unknown') {
          resolvedCap = cd.cap_class;
        } else if (cd?.market_cap != null) {
          const d = classifyCapClass(cd.market_cap);
          if (d !== 'unknown') resolvedCap = d;
        }
      }
    }
  }

  const hit = classifyHit({
    ticker_return_pct: outcome.ticker_return_pct,
    spy_return_pct: null,
    sector_relative_pct: outcome.sector_relative_pct,
  });

  return {
    event_type: 'posterior_update' as const,
    ticker: outcome.ticker,
    outcome_id: outcome.outcome_id,
    occurred_at: outcome.recorded_at,
    signal_class: insiderBucket
      ? 'insider'
      : institutionalBucket
        ? 'institutional'
        : techPattern
          ? 'technical'
          : trace
            ? 'diffusion'
            : null,
    pattern_key: insiderBucket ?? institutionalBucket ?? techPattern ?? trace?.flow_pattern ?? null,
    cap_class: resolvedCap,
    horizon_days: outcome.days_after,
    delta: {
      diffusion_hit: trace && trace.flow_pattern !== 'flat' ? hit : null,
      tech_hit: techPattern ? hit : null,
      insider_hit: insiderBucket ? hit : null,
      institutional_hit: institutionalBucket ? hit : null,
      hit,
      ticker_return_pct: outcome.ticker_return_pct,
      spy_return_pct: null,
      horizon: outcome.days_after,
      tech_pattern: techPattern,
      flow_pattern: trace?.flow_pattern ?? null,
      insider_bucket: insiderBucket,
      institutional_bucket: institutionalBucket,
      source: 'backfill',
      snapshot_regime: null,
      outcome_regime: null,
    },
    message: `[backfill] ${outcome.ticker} @${outcome.days_after}d: ${hit ? 'HIT' : 'MISS'} — ticker ${outcome.ticker_return_pct.toFixed(2)}%`,
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DIRECT_URL/DATABASE_URL missing — load .env.local first.');
    process.exit(1);
  }

  const adapter = new PrismaNeon({ connectionString });
  const prisma = new PrismaClient({ adapter } as any);

  // Idempotency check
  const marker = await prisma.learningEvent.findFirst({ where: { event_type: MARKER } });
  if (marker) {
    console.log('[backfill-le] Already complete:', marker.message);
    await (prisma as any).$disconnect();
    return;
  }

  // ── 1. Load all processed outcome IDs ──────────────────────────────────────
  console.log('[backfill-le] Loading processed outcome IDs...');
  const processedRows = await (prisma as any).learningEvent.findMany({
    where: { outcome_id: { not: null } },
    select: { outcome_id: true },
  });
  const processed = new Set(processedRows.map((r: any) => r.outcome_id).filter(Boolean));
  console.log(`[backfill-le] Already processed: ${processed.size}`);

  // ── 2. Load ALL resolved PriceOutcomes ────────────────────────────────────
  console.log('[backfill-le] Loading resolved outcomes...');
  const allOutcomeRows = await (prisma as any).priceOutcome.findMany({
    include: { snapshot: { select: { id: true, ticker: true, scanned_at: true, price_at_scan: true, source: true } }, report: { select: { id: true, ticker: true, analyzed_at: true, price_at_report: true } } },
    orderBy: { recorded_at: 'asc' },
  });

  // Map to Outcome shape, skip already-processed and invalid rows
  const outcomes: Outcome[] = [];
  for (const o of allOutcomeRows) {
    if (processed.has(o.id)) continue;
    if (o.snapshot) {
      outcomes.push({
        outcome_id: o.id,
        ticker: o.snapshot.ticker,
        scanned_at: o.snapshot.scanned_at,
        recorded_at: o.recorded_at,
        ticker_return_pct: o.pct_change,
        sector_relative_pct: o.forward_return_sector_rel,
        days_after: o.days_after,
        snapshot_id: o.snapshot.id,
        snapshot_source: o.snapshot.source ?? 'live',
      });
    } else if (o.report && o.report.price_at_report != null) {
      outcomes.push({
        outcome_id: o.id,
        ticker: o.report.ticker,
        scanned_at: o.report.analyzed_at,
        recorded_at: o.recorded_at,
        ticker_return_pct: o.pct_change,
        sector_relative_pct: o.forward_return_sector_rel,
        days_after: o.days_after,
        snapshot_id: null,
        snapshot_source: 'live',
      });
    }
  }
  console.log(`[backfill-le] Outcomes to process: ${outcomes.length}`);

  // ── 3. Group outcomes by ticker ───────────────────────────────────────────
  const byTicker = new Map<string, Outcome[]>();
  for (const o of outcomes) {
    if (!byTicker.has(o.ticker)) byTicker.set(o.ticker, []);
    byTicker.get(o.ticker)!.push(o);
  }
  const tickers = [...byTicker.keys()];
  console.log(`[backfill-le] Unique tickers: ${tickers.length}`);

  // ── 4. Process ticker by ticker ───────────────────────────────────────────
  const eventBuffer: any[] = [];
  let written = 0;
  let errors = 0;
  let tickersDone = 0;

  async function flushBuffer() {
    if (eventBuffer.length === 0) return;
    const chunk = eventBuffer.splice(0, eventBuffer.length);
    await (prisma as any).learningEvent.createMany({ data: chunk });
    written += chunk.length;
  }

  for (const ticker of tickers) {
    tickersDone++;

    // Load ALL snapshots for this ticker (ascending by scanned_at for trace building)
    const snaps: SnapCache[] = await (prisma as any).sentimentSnapshot.findMany({
      where: { ticker },
      select: {
        id: true,
        scanned_at: true,
        community_data: true,
        technical_data: true,
        insider_data: true,
        institutional_data: true,
      },
      orderBy: { scanned_at: 'asc' },
    });

    const tickerOutcomes = byTicker.get(ticker)!;
    for (const outcome of tickerOutcomes) {
      try {
        const ev = buildEvent(outcome, snaps);
        eventBuffer.push(ev);
      } catch (err: any) {
        errors++;
        console.error(`[backfill-le] error ${outcome.outcome_id}: ${err?.message ?? err}`);
      }
    }

    // Flush when buffer is large enough
    if (eventBuffer.length >= WRITE_BATCH) {
      await flushBuffer();
    }

    if (tickersDone % 50 === 0 || tickersDone === tickers.length) {
      const pct = Math.round((tickersDone / tickers.length) * 100);
      console.log(`[backfill-le] tickers ${tickersDone}/${tickers.length} (${pct}%) — written=${written} errors=${errors} buffered=${eventBuffer.length}`);
    }
  }

  // Final flush
  await flushBuffer();

  // ── 5. Write completion marker ────────────────────────────────────────────
  await (prisma as any).learningEvent.create({
    data: {
      event_type: MARKER,
      ticker: 'SYSTEM',
      delta: { written, errors, outcomes_total: outcomes.length },
      message: `LearningEvent backfill complete: ${written} events written, ${errors} errors`,
    },
  });

  console.log(`\n[backfill-le] DONE. written=${written} errors=${errors}`);
  await (prisma as any).$disconnect();
}

main().catch((err) => {
  console.error('[backfill-le] fatal:', err);
  process.exit(1);
});
