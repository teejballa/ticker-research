// src/app/api/cron/alpha-decay-watch/route.ts
//
// Phase 19-A-05 (D-21): Daily cron — compute the rolling 20-day Spearman
// rank-IC per LearnedPattern cell and toggle ic_decay_flag based on the
// confirmed/cleared state machine in src/lib/reasoning/alpha-decay-monitor.ts.
//
// Auth: identical to /api/cron/learn — Authorization: Bearer ${CRON_SECRET}.
// Schedule: 06:00 UTC daily (vercel.json crons array).
// maxDuration: 300s (Hobby/default ceiling per CLAUDE.md note).
//
// IC scope (per CONTEXT.md D-21): "rolling 20-day Spearman rank-IC computed
// per signal class". One IC value per signal class — broadcast to every
// LearnedPattern cell in that class so /insights and EngineCalibrationPanel
// can surface it via the existing per-cell rolling_ic_20d column.
//
// Why per-class, not per-cell: within a single cell every prediction is the
// same posterior mean (the cell's α/(α+β)). Pearson denominator collapses to
// 0 → IC degenerate. Rank-IC is meaningful only when predictions vary, which
// they do across cells within a signal class.
//
// State machine per cell:
//   1. Compute today's IC for the entire signal class — pairs are
//      (prediction = source-cell posterior mean, realized = ticker alpha vs
//      SPY) across every resolved outcome in the last 20 days.
//   2. Build a per-day rolling IC series across the history window so the
//      isDecayConfirmed (5 of 5) / isDecayCleared (3 of 3) state machine
//      has data to consume.
//   3. If currently flagged: clear when isDecayCleared.
//      Else: set when isDecayConfirmed.
//   4. Persist today's IC + the new flag to every cell in the signal class
//      (so the dashboard shows the same monitor state for every cell of a
//      class — they all rise and fall together by definition of per-class IC).
//
// PURITY BOUNDARY: this route is the ONLY caller that touches Prisma. The
// monitor module at src/lib/reasoning/alpha-decay-monitor.ts is DB-free.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  rollingSpearmanIC,
  isDecayConfirmed,
  isDecayCleared,
} from '@/lib/reasoning/alpha-decay-monitor';
import { posteriorMean } from '@/lib/learning';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const SIGNAL_CLASSES = ['diffusion', 'technical', 'insider', 'institutional'] as const;
type SignalClass = (typeof SIGNAL_CLASSES)[number];

// Rolling window for the IC computation itself.
const IC_WINDOW_DAYS = 20;
// History window for the confirmed/cleared state machine (must be ≥ 5
// to satisfy the 5-consecutive-day decay rule and ≥ 3 for clearance).
const HISTORY_WINDOW_DAYS = 30;
const MS_PER_DAY = 86_400_000;

interface ClassResult {
  signal_class: string;
  rolling_ic_20d: number | null;
  ic_decay_flag: boolean;
  cells_updated: number;
  reason: 'updated' | 'too-few-events' | 'set' | 'cleared' | 'no-cells';
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const results: ClassResult[] = [];
  let totalCellsUpdated = 0;
  let classesSetFlag = 0;
  let classesClearedFlag = 0;

  try {
    for (const signalClass of SIGNAL_CLASSES) {
      const result = await processOneSignalClass(signalClass, now);
      results.push(result);
      totalCellsUpdated += result.cells_updated;
      if (result.reason === 'set') classesSetFlag++;
      if (result.reason === 'cleared') classesClearedFlag++;
    }

    return NextResponse.json({
      ok: true,
      scanned_at: now.toISOString(),
      results,
      total_cells_updated: totalCellsUpdated,
      classes_set_flag: classesSetFlag,
      classes_cleared_flag: classesClearedFlag,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : 'alpha-decay-watch failed',
        results,
      },
      { status: 500 },
    );
  }
}

async function processOneSignalClass(
  signalClass: SignalClass,
  now: Date,
): Promise<ClassResult> {
  // 1. Load every non-EXPLORATORY cell in the class. EXPLORATORY cells
  //    (raw N + ESS too low) carry too much sampling noise — we don't write
  //    rolling_ic_20d to them and don't include their events in the IC.
  const cells = await prisma.learnedPattern.findMany({
    where: {
      signal_class: signalClass,
      status: { not: 'EXPLORATORY' },
    },
  });

  if (cells.length === 0) {
    return {
      signal_class: signalClass,
      rolling_ic_20d: null,
      ic_decay_flag: false,
      cells_updated: 0,
      reason: 'no-cells',
    };
  }

  // Build a (pattern_key, cap_class, horizon_days) → posteriorMean map so we
  // can attach a meaningful prediction to each event. Predictions vary
  // across cells within the class — exactly the input variance Pearson-of-
  // ranks needs to compute a non-zero IC.
  const cellPrediction = new Map<string, number>();
  for (const c of cells) {
    cellPrediction.set(
      cellKey(c.pattern_key, c.cap_class, c.horizon_days),
      posteriorMean({ alpha: c.alpha, beta: c.beta }),
    );
  }

  // Existing flag state — assume stable across the class (we always write
  // the same flag value to every cell, so cells of a class can only diverge
  // if external code wrote them; we trust the most-common value).
  const wasFlagged = cells.filter((c) => c.ic_decay_flag === true).length > cells.length / 2;

  // 2. Pull all posterior_update events for this class within the history
  //    window. Filter to those whose source cell is non-EXPLORATORY (the
  //    cellPrediction map captures exactly that subset).
  const historyStart = new Date(now.getTime() - HISTORY_WINDOW_DAYS * MS_PER_DAY);
  const events = await prisma.learningEvent.findMany({
    where: {
      event_type: 'posterior_update',
      signal_class: signalClass,
      occurred_at: { gte: historyStart },
    },
    orderBy: { occurred_at: 'asc' },
  });

  const observations: Array<{ pred: number; realized: number; at: Date }> = [];
  for (const ev of events) {
    if (ev.pattern_key == null || ev.cap_class == null || ev.horizon_days == null) continue;
    const pred = cellPrediction.get(cellKey(ev.pattern_key, ev.cap_class, ev.horizon_days));
    if (pred === undefined) continue; // event from an EXPLORATORY cell — exclude
    const d = ev.delta as
      | { ticker_return_pct?: number; spy_return_pct?: number }
      | null;
    if (!d || typeof d.ticker_return_pct !== 'number' || typeof d.spy_return_pct !== 'number') {
      continue;
    }
    observations.push({
      pred,
      realized: d.ticker_return_pct - d.spy_return_pct,
      at: ev.occurred_at,
    });
  }

  if (observations.length < 5) {
    // Not enough events to compute even one IC point — leave flag state alone.
    // We still write the existing flag back to keep cells uniform across class.
    await broadcastToCells(signalClass, null, wasFlagged);
    return {
      signal_class: signalClass,
      rolling_ic_20d: null,
      ic_decay_flag: wasFlagged,
      cells_updated: cells.length,
      reason: 'too-few-events',
    };
  }

  // 3. Build the rolling-IC time series: for each day in the history window,
  //    compute the IC across all observations within [d - IC_WINDOW_DAYS, d].
  const rollingICs: number[] = [];
  for (let dayOffset = HISTORY_WINDOW_DAYS - 1; dayOffset >= 0; dayOffset--) {
    const windowEnd = new Date(now.getTime() - dayOffset * MS_PER_DAY);
    const windowStart = new Date(windowEnd.getTime() - IC_WINDOW_DAYS * MS_PER_DAY);
    const windowObs = observations.filter((o) => o.at >= windowStart && o.at <= windowEnd);
    // Need at least 5 obs AND >1 distinct prediction to avoid the constant-
    // prediction degeneracy that drives Pearson denominator → 0.
    if (windowObs.length < 5) continue;
    const distinctPreds = new Set(windowObs.map((o) => o.pred));
    if (distinctPreds.size < 2) continue;
    rollingICs.push(
      rollingSpearmanIC({
        predictions: windowObs.map((o) => o.pred),
        realizedReturns: windowObs.map((o) => o.realized),
      }),
    );
  }

  if (rollingICs.length === 0) {
    await broadcastToCells(signalClass, null, wasFlagged);
    return {
      signal_class: signalClass,
      rolling_ic_20d: null,
      ic_decay_flag: wasFlagged,
      cells_updated: cells.length,
      reason: 'too-few-events',
    };
  }

  const todayIC = rollingICs[rollingICs.length - 1];

  // 4. Asymmetric (sticky) state machine — prevents single-day thrashing.
  //    Only check the relevant transition for the current state.
  const cleared = wasFlagged && isDecayCleared(rollingICs);
  const confirmed = !wasFlagged && isDecayConfirmed(rollingICs);
  const newFlag = wasFlagged ? !cleared : confirmed;

  // 5. Broadcast to every cell of this class — they share the same per-class
  //    rolling_ic_20d + ic_decay_flag.
  await broadcastToCells(signalClass, todayIC, newFlag);

  let reason: ClassResult['reason'] = 'updated';
  if (!wasFlagged && newFlag) reason = 'set';
  else if (wasFlagged && !newFlag) reason = 'cleared';

  return {
    signal_class: signalClass,
    rolling_ic_20d: todayIC,
    ic_decay_flag: newFlag,
    cells_updated: cells.length,
    reason,
  };
}

async function broadcastToCells(
  signalClass: SignalClass,
  rollingIc: number | null,
  flag: boolean,
): Promise<void> {
  // Single updateMany — broadcasts the same rolling_ic_20d + ic_decay_flag
  // to every non-EXPLORATORY cell of this signal class.
  await prisma.learnedPattern.updateMany({
    where: {
      signal_class: signalClass,
      status: { not: 'EXPLORATORY' },
    },
    data: {
      rolling_ic_20d: rollingIc,
      ic_decay_flag: flag,
    },
  });
}

function cellKey(patternKey: string, capClass: string, horizonDays: number): string {
  return `${patternKey}|${capClass}|${horizonDays}`;
}
