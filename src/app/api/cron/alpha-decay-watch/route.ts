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
// State machine per cell:
//   1. Compute today's IC across the last 20 days of resolved outcomes for
//      this cell (predictions = current posterior mean; realized = ticker
//      alpha vs SPY recovered from LearningEvent.delta).
//   2. Append today's IC to a derived rolling-IC history for this cell —
//      computed from the chronologically-ordered LearningEvent traces
//      (no JSON history column needed; we re-derive each cron tick).
//   3. If currently flagged: clear when isDecayCleared (last 3d >= 0.02).
//      Else: set when isDecayConfirmed (last 5d < 0.02).
//   4. Persist rolling_ic_20d (today's value) + ic_decay_flag.
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

interface CellUpdate {
  id: string;
  signal_class: string;
  pattern_key: string;
  cap_class: string;
  horizon_days: number;
  rolling_ic_20d: number | null;
  ic_decay_flag: boolean;
  reason: 'updated' | 'too-few-events' | 'set' | 'cleared';
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const updates: CellUpdate[] = [];
  let cellsScanned = 0;
  let cellsUpdated = 0;
  let cellsSetFlag = 0;
  let cellsClearedFlag = 0;

  try {
    for (const signalClass of SIGNAL_CLASSES) {
      // Only run the monitor on cells that have actually graduated past
      // first-touch — EXPLORATORY cells with insufficient sample size will
      // produce noise-only IC values that thrash the flag.
      const cells = await prisma.learnedPattern.findMany({
        where: {
          signal_class: signalClass,
          status: { not: 'EXPLORATORY' },
        },
      });

      for (const cell of cells) {
        cellsScanned++;
        const result = await processOneCell(cell, signalClass, now);
        updates.push(result);
        if (result.reason !== 'too-few-events') cellsUpdated++;
        if (result.reason === 'set') cellsSetFlag++;
        if (result.reason === 'cleared') cellsClearedFlag++;
      }
    }

    return NextResponse.json({
      ok: true,
      scanned_at: now.toISOString(),
      cells_scanned: cellsScanned,
      cells_updated: cellsUpdated,
      cells_set_flag: cellsSetFlag,
      cells_cleared_flag: cellsClearedFlag,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : 'alpha-decay-watch failed',
        cells_scanned: cellsScanned,
      },
      { status: 500 },
    );
  }
}

async function processOneCell(
  cell: {
    id: string;
    signal_class: string;
    pattern_key: string;
    cap_class: string;
    horizon_days: number;
    alpha: number;
    beta: number;
    ic_decay_flag: boolean | null;
  },
  signalClass: SignalClass,
  now: Date,
): Promise<CellUpdate> {
  // Fetch this cell's resolved outcomes from the last HISTORY_WINDOW_DAYS.
  // We reconstruct the IC history by re-binning events into daily buckets
  // and computing the trailing-20d IC for each day in the history window.
  // This keeps the cron stateless (no rolling_ic_history JSONB column).
  const historyStart = new Date(now.getTime() - HISTORY_WINDOW_DAYS * MS_PER_DAY);
  const events = await prisma.learningEvent.findMany({
    where: {
      event_type: 'posterior_update',
      signal_class: cell.signal_class,
      pattern_key: cell.pattern_key,
      cap_class: cell.cap_class,
      horizon_days: cell.horizon_days,
      occurred_at: { gte: historyStart },
    },
    orderBy: { occurred_at: 'asc' },
  });

  const observations: Array<{ pred: number; realized: number; at: Date }> = [];
  // Use the cell's current posterior mean as the prediction proxy for every
  // historical event in the window (mirrors recomputeOneCell's approach in
  // /api/cron/learn). This biases the IC toward 0 / -∞ when the cell is
  // poorly calibrated — exactly the regime the IC monitor needs to catch.
  const predictionProxy = posteriorMean({ alpha: cell.alpha, beta: cell.beta });

  for (const ev of events) {
    const d = ev.delta as
      | { ticker_return_pct?: number; spy_return_pct?: number; hit?: boolean }
      | null;
    if (!d || typeof d.ticker_return_pct !== 'number' || typeof d.spy_return_pct !== 'number') {
      continue;
    }
    observations.push({
      pred: predictionProxy,
      realized: d.ticker_return_pct - d.spy_return_pct,
      at: ev.occurred_at,
    });
  }

  // Need at least 5 paired observations within the rolling window to make
  // even a single IC value meaningful. Same lower bound as recomputeOneCell.
  if (observations.length < 5) {
    return {
      id: cell.id,
      signal_class: cell.signal_class,
      pattern_key: cell.pattern_key,
      cap_class: cell.cap_class,
      horizon_days: cell.horizon_days,
      rolling_ic_20d: null,
      ic_decay_flag: cell.ic_decay_flag === true,
      reason: 'too-few-events',
    };
  }

  // Build the rolling-IC history: for each day d in the history window,
  // compute the IC across all observations within [d - 20d, d]. The "today"
  // IC is the last entry; the full series feeds isDecayConfirmed/Cleared.
  const rollingICs: number[] = [];
  for (let dayOffset = HISTORY_WINDOW_DAYS - 1; dayOffset >= 0; dayOffset--) {
    const windowEnd = new Date(now.getTime() - dayOffset * MS_PER_DAY);
    const windowStart = new Date(windowEnd.getTime() - IC_WINDOW_DAYS * MS_PER_DAY);
    const windowObs = observations.filter((o) => o.at >= windowStart && o.at <= windowEnd);
    if (windowObs.length < 5) {
      // Not enough data for a meaningful IC at this day — skip (don't push
      // a misleading 0 that would falsely trigger the < 0.02 confirmation).
      continue;
    }
    const ic = rollingSpearmanIC({
      predictions: windowObs.map((o) => o.pred),
      realizedReturns: windowObs.map((o) => o.realized),
    });
    rollingICs.push(ic);
  }

  if (rollingICs.length === 0) {
    return {
      id: cell.id,
      signal_class: cell.signal_class,
      pattern_key: cell.pattern_key,
      cap_class: cell.cap_class,
      horizon_days: cell.horizon_days,
      rolling_ic_20d: null,
      ic_decay_flag: cell.ic_decay_flag === true,
      reason: 'too-few-events',
    };
  }

  const todayIC = rollingICs[rollingICs.length - 1];
  const wasFlagged = cell.ic_decay_flag === true;
  // Asymmetric state machine:
  //   if currently flagged → only check isDecayCleared (3 consecutive recoveries)
  //   if currently clear   → only check isDecayConfirmed (5 consecutive < 0.02)
  // Sticky / hysteresis: prevents single-day thrashing of the flag.
  const cleared = wasFlagged && isDecayCleared(rollingICs);
  const confirmed = !wasFlagged && isDecayConfirmed(rollingICs);
  const newFlag = wasFlagged ? !cleared : confirmed;

  void signalClass; // kept in signature for future per-class threshold tuning

  await prisma.learnedPattern.update({
    where: { id: cell.id },
    data: {
      rolling_ic_20d: todayIC,
      ic_decay_flag: newFlag,
    },
  });

  let reason: CellUpdate['reason'] = 'updated';
  if (!wasFlagged && newFlag) reason = 'set';
  else if (wasFlagged && !newFlag) reason = 'cleared';

  return {
    id: cell.id,
    signal_class: cell.signal_class,
    pattern_key: cell.pattern_key,
    cap_class: cell.cap_class,
    horizon_days: cell.horizon_days,
    rolling_ic_20d: todayIC,
    ic_decay_flag: newFlag,
    reason,
  };
}
