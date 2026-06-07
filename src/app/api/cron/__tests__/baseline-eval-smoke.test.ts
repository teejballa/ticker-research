/**
 * Phase 21.1 D-11 — smoke test for /api/cron/baseline-eval handler.
 *
 * Tests the underlying baseline training/scoring logic on synthetic data
 * without any live DB or network calls. The cron handler's DB path is
 * exercised by integration tests (RUN_LIVE_INTEGRATION=true gate).
 *
 * Goals:
 *   1. Both baselines (engine36 + canonical7) return finite Brier on
 *      synthetic labeled rows — no exceptions thrown.
 *   2. Ridge sweep picks a valid prior from the grid.
 *   3. scoreBaseline returns null Brier on empty eval set (not an exception).
 *   4. BCa bootstrap CI runs without error on a small sample.
 *   5. Verify the canonical feature names are locked to the 7-item spec (D-11).
 */

import { describe, it, expect } from 'vitest';
import {
  trainBaseline,
  scoreBaseline,
  sweepPriorPrecision,
  type TrainingRow,
} from '@/lib/baselines/logistic';
import {
  buildCanonicalFeatures,
  CANONICAL_FEATURE_NAMES,
  type CanonicalSnapshot,
} from '@/lib/baselines/canonical-features';
import { bootstrapBCa } from '@/lib/evaluation';
import { purgedKFold } from '@/lib/cv';

// ---------------------------------------------------------------------------
// Synthetic data builders
// ---------------------------------------------------------------------------

/**
 * Build N synthetic TrainingRows for canonical7 baseline.
 * Canonical features are seeded deterministically so the test is reproducible.
 */
function syntheticCanonicalRows(n: number): TrainingRow[] {
  const rows: TrainingRow[] = [];
  for (let i = 0; i < n; i++) {
    const canonical: CanonicalSnapshot = {
      rsi_14: 30 + (i % 50),           // 30..79
      macd_hist: (i % 10) - 5,         // -5..4
      sentiment_pct: 40 + (i % 30),    // 40..69
      insider_net_flow: (i % 3) - 1,   // -1, 0, 1
      institutional_net_flow: (i % 5) - 2,
      put_call_ratio: 0.7 + (i % 10) * 0.05,
      sector_return: (i % 7) - 3,
    };
    rows.push({
      canonical,
      hit: (i % 3 === 0 ? 1 : 0) as 0 | 1,
      forward_return: (i % 7) - 3,
    });
  }
  return rows;
}

/**
 * Build N synthetic TrainingRows for engine36 baseline.
 * features36 are all zeros (cold-start path) — avoids needing real snapshots.
 */
function syntheticEngine36Rows(n: number): TrainingRow[] {
  const rows: TrainingRow[] = [];
  for (let i = 0; i < n; i++) {
    rows.push({
      features36: new Array(36).fill(0).map((_, j) => (i + j) % 5 - 2),
      hit: (i % 4 === 0 ? 1 : 0) as 0 | 1,
      forward_return: (i % 6) - 3,
    });
  }
  return rows;
}

/**
 * Build cv.ts Observation[] parallel to a row set (same indices).
 */
function rowsToObservations(n: number) {
  const base = new Date('2025-01-01').getTime();
  const dayMs = 86_400_000;
  return Array.from({ length: n }, (_, i) => ({
    recorded_at: new Date(base + i * dayMs),
    horizon_days: 7,
    hit: i % 3 === 0,
    cell_key: 'smoke',
  }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('baseline-eval smoke — canonical7', () => {
  const rows = syntheticCanonicalRows(120);

  it('trainBaseline canonical7 returns 7 weights from 120 synthetic rows', () => {
    const state = trainBaseline('canonical7', rows, { priorPrecision: 1.0 });
    expect(state.weights).toHaveLength(7);
    expect(state.feature_names).toEqual([...CANONICAL_FEATURE_NAMES]);
    // Weights should not all be zero after 120 updates
    const nonZero = state.weights.filter((w) => w !== 0).length;
    expect(nonZero).toBeGreaterThan(0);
  });

  it('scoreBaseline canonical7 returns finite Brier on 40-row eval set', () => {
    const trainRows = rows.slice(0, 80);
    const evalRows = rows.slice(80);
    const state = trainBaseline('canonical7', trainRows, { priorPrecision: 1.0 });
    const result = scoreBaseline(state, evalRows, 'canonical7');
    expect(result.n).toBe(40);
    expect(typeof result.brier).toBe('number');
    expect(Number.isFinite(result.brier)).toBe(true);
    expect(result.brier).toBeGreaterThanOrEqual(0);
    expect(result.brier).toBeLessThanOrEqual(1);
    expect(typeof result.log_loss).toBe('number');
    expect(Number.isFinite(result.log_loss)).toBe(true);
    expect(result.predictions).toHaveLength(40);
  });

  it('scoreBaseline returns null Brier (not exception) on empty eval set', () => {
    const state = trainBaseline('canonical7', [], { priorPrecision: 1.0 });
    const result = scoreBaseline(state, [], 'canonical7');
    expect(result.brier).toBeNull();
    expect(result.log_loss).toBeNull();
    expect(result.n).toBe(0);
  });

  it('sweepPriorPrecision canonical7 picks a valid prior from grid', () => {
    const obs = rowsToObservations(120);
    const folds = purgedKFold(obs, 5, 1, 1); // tiny purge for fast test
    const grid = [0.5, 1, 2, 4];
    const result = sweepPriorPrecision('canonical7', rows, grid, folds);
    expect(grid).toContain(result.chosen_prior);
    expect(result.sweep_table).toHaveLength(grid.length);
    expect(Number.isFinite(result.best_brier) || isNaN(result.best_brier)).toBe(true);
  });
});

describe('baseline-eval smoke — engine36', () => {
  const rows = syntheticEngine36Rows(120);

  it('trainBaseline engine36 returns 36 weights from 120 synthetic rows', () => {
    const state = trainBaseline('engine36', rows, { priorPrecision: 2.0 });
    expect(state.weights).toHaveLength(36);
    expect(state.feature_names).toHaveLength(36);
  });

  it('scoreBaseline engine36 returns finite Brier on 40-row eval set', () => {
    const trainRows = rows.slice(0, 80);
    const evalRows = rows.slice(80);
    const state = trainBaseline('engine36', trainRows, { priorPrecision: 2.0 });
    const result = scoreBaseline(state, evalRows, 'engine36');
    expect(result.n).toBe(40);
    expect(Number.isFinite(result.brier)).toBe(true);
    expect(Number.isFinite(result.log_loss)).toBe(true);
  });

  it('sweepPriorPrecision engine36 picks valid prior from [1, 2, 4, 8, 16]', () => {
    const obs = rowsToObservations(120);
    const folds = purgedKFold(obs, 5, 1, 1);
    const grid = [1, 2, 4, 8, 16];
    const result = sweepPriorPrecision('engine36', rows, grid, folds);
    expect(grid).toContain(result.chosen_prior);
    expect(result.sweep_table).toHaveLength(grid.length);
  });
});

describe('baseline-eval smoke — BCa bootstrap CI', () => {
  it('bootstrapBCa runs on 40 squared-error samples without throwing', () => {
    const rows = syntheticCanonicalRows(60);
    const trainRows = rows.slice(0, 40);
    const evalRows = rows.slice(40);
    const state = trainBaseline('canonical7', trainRows, { priorPrecision: 1.0 });
    const result = scoreBaseline(state, evalRows, 'canonical7');

    expect(result.predictions).toHaveLength(20);
    const squaredErrors = result.predictions.map(
      (p, i) => (p - evalRows[i].hit) ** 2,
    );
    const ci = bootstrapBCa(
      squaredErrors,
      (s) => s.reduce((a, b) => a + b, 0) / s.length,
      { nResamples: 500 }, // small count for fast test
    );
    expect(ci.low).toBeLessThanOrEqual(ci.high);
    expect(Number.isFinite(ci.low) || isNaN(ci.low)).toBe(true);
    expect(Number.isFinite(ci.high) || isNaN(ci.high)).toBe(true);
  });
});

describe('baseline-eval smoke — canonical feature names locked', () => {
  it('CANONICAL_FEATURE_NAMES has exactly 7 entries in D-11 order', () => {
    expect(CANONICAL_FEATURE_NAMES).toEqual([
      'rsi_14',
      'macd_hist',
      'sentiment_pct',
      'insider_net_flow',
      'institutional_net_flow',
      'put_call_ratio',
      'sector_return',
    ]);
  });

  it('buildCanonicalFeatures returns 7-element vector from full snapshot', () => {
    const snap: CanonicalSnapshot = {
      rsi_14: 55,
      macd_hist: 0.5,
      sentiment_pct: 62,
      insider_net_flow: 1000000,
      institutional_net_flow: -500000,
      put_call_ratio: 0.85,
      sector_return: 1.2,
    };
    const vec = buildCanonicalFeatures(snap);
    expect(vec).toHaveLength(7);
    expect(vec[0]).toBe(55);       // rsi_14
    expect(vec[1]).toBe(0.5);      // macd_hist
    expect(vec[6]).toBe(1.2);      // sector_return
  });

  it('buildCanonicalFeatures substitutes 0 for null fields (cold-start safety)', () => {
    const snap: CanonicalSnapshot = {
      rsi_14: null,
      macd_hist: null,
      sentiment_pct: 60,
      insider_net_flow: null,
      institutional_net_flow: null,
      put_call_ratio: 0.9,
      sector_return: null,
    };
    const vec = buildCanonicalFeatures(snap);
    expect(vec).toHaveLength(7);
    expect(vec[0]).toBe(0);  // rsi_14 null → 0
    expect(vec[2]).toBe(60); // sentiment_pct present
    expect(vec[5]).toBe(0.9); // put_call_ratio present
  });
});

// ---------------------------------------------------------------------------
// Live integration gate (skipped unless RUN_LIVE_INTEGRATION=true)
// ---------------------------------------------------------------------------
describe('baseline-eval smoke — live integration (skipped in CI)', () => {
  const skip = process.env.RUN_LIVE_INTEGRATION !== 'true';

  it.skipIf(skip)(
    'cron handler returns ok=true with finite Brier on live Neon data',
    async () => {
      // Dynamic import to avoid prisma initialization in unit test context
      const { GET } = await import('@/app/api/cron/baseline-eval/route');
      const req = new Request('http://localhost/api/cron/baseline-eval', {
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET ?? 'test'}` },
      });
      const res = await GET(req);
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      // Either got results or insufficient rows
      if (body.message === 'insufficient_rows') {
        expect(body.n).toBeGreaterThanOrEqual(0);
      } else {
        expect(body.canonical7).toBeDefined();
        expect(body.engine36).toBeDefined();
        const c7Brier = body.canonical7.brier;
        const e36Brier = body.engine36.brier;
        expect(c7Brier === null || Number.isFinite(c7Brier)).toBe(true);
        expect(e36Brier === null || Number.isFinite(e36Brier)).toBe(true);
      }
    },
  );
});
