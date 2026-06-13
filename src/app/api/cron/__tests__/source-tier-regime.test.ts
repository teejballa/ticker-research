/**
 * PHASE 22 Wave 3 Task 2 — source-tier-recompute cron emits per-regime
 * SourceTier rows + the unconditional `'ALL'` row, after EB shrinkage.
 *
 * Exercises the pure-function shrinkage pipeline directly via
 * `computePerRegimeWeights` (no DB mock churn for the deterministic math)
 * and exercises `runRecompute` with a mocked Prisma client to assert
 * INSERT shapes + transactional semantics.
 *
 * Contract (22-PLAN §Task 2):
 *   - Per-regime independent softmax: weights within bull-low-vol sum to a
 *     constant ≠ within bear-high-vol.
 *   - Sparse cells (n=0) skip + log; no row inserted.
 *   - shrinkage_strength persisted; null on the 'ALL' row (it IS the baseline).
 *   - All writes in one $transaction.
 *   - Pitfall 2: order is IC → SHRINK → SOFTMAX, not the reverse.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks for the Prisma client used by runRecompute ───────────────
const { queryRawMock, createMock, transactionMock, findFirstMock } = vi.hoisted(() => {
  return {
    queryRawMock: vi.fn(),
    createMock: vi.fn(),
    transactionMock: vi.fn(),
    findFirstMock: vi.fn(),
  };
});

vi.mock('@/lib/db', () => ({
  prisma: {
    $queryRaw: queryRawMock,
    $transaction: transactionMock,
    sourceTier: {
      create: createMock,
      findFirst: findFirstMock,
    },
  },
}));

import { runRecompute, computePerRegimeWeights } from '../../../../../scripts/recompute-source-tiers';
import {
  shrinkSourceIcEmpiricalBayes,
  softmaxWithCaps,
} from '@/lib/sentiment/source-tier';
import { ACTIVE_REGIME_LABELS } from '@/lib/regime/types';

const REGIME_PANEL_FIXTURE = [
  // (source, regime, mean_ic, var_ic, n)
  { source_id: 'stocktwits', regime: 'ALL', mean_ic: 0.20, variance_ic: 0.01, n_observations: 500 },
  { source_id: 'reddit',     regime: 'ALL', mean_ic: 0.10, variance_ic: 0.02, n_observations: 500 },
  { source_id: 'apewisdom',  regime: 'ALL', mean_ic: 0.05, variance_ic: 0.03, n_observations: 500 },
  // Dense bull-low-vol cells — three sources with clear ordering.
  { source_id: 'stocktwits', regime: 'bull-low-vol', mean_ic: 0.30, variance_ic: 0.01, n_observations: 200 },
  { source_id: 'reddit',     regime: 'bull-low-vol', mean_ic: 0.15, variance_ic: 0.02, n_observations: 200 },
  { source_id: 'apewisdom',  regime: 'bull-low-vol', mean_ic: 0.05, variance_ic: 0.03, n_observations: 200 },
  // Dense bear-high-vol — different ordering, so weights diverge from bull-low-vol.
  { source_id: 'stocktwits', regime: 'bear-high-vol', mean_ic: 0.05, variance_ic: 0.01, n_observations: 200 },
  { source_id: 'reddit',     regime: 'bear-high-vol', mean_ic: 0.30, variance_ic: 0.02, n_observations: 200 },
  { source_id: 'apewisdom',  regime: 'bear-high-vol', mean_ic: 0.15, variance_ic: 0.03, n_observations: 200 },
  // Sparse reddit bull-high-vol — n=5, will produce strong shrinkage strength.
  { source_id: 'reddit',     regime: 'bull-high-vol', mean_ic: 0.40, variance_ic: 0.05, n_observations: 5 },
  // Sparse cell: NO bear-low-vol rows at all for any source → entire regime skipped.
];

describe('computePerRegimeWeights — pure pipeline (D-07 + per-regime softmax independence)', () => {
  const { payloads, sparse_cells_skipped } = computePerRegimeWeights(REGIME_PANEL_FIXTURE as never);

  it('emits per-regime payloads + an "ALL" row per source (per-regime + baseline)', () => {
    const regimes = new Set(payloads.map((p) => p.regime));
    // 'ALL' baseline ALWAYS emitted; per-regime emitted only when there's at least one dense cell.
    expect(regimes.has('ALL')).toBe(true);
    expect(regimes.has('bull-low-vol')).toBe(true);
    expect(regimes.has('bear-high-vol')).toBe(true);
    // bear-low-vol had no panel rows at all — no per-regime payload emitted.
    expect(regimes.has('bear-low-vol')).toBe(false);
  });

  it('marks the bear-low-vol regime as fully sparse — every source skipped', () => {
    const bearLowSkipped = sparse_cells_skipped.filter((c) => c.regime === 'bear-low-vol');
    // 3 distinct sources × 1 regime = 3 skips.
    expect(bearLowSkipped.length).toBe(3);
    // Sparse cell log path also covers the reddit bull-high-vol cell only when n=0 — n=5 is NOT sparse.
  });

  it('per-regime softmax independence — bull-low-vol weight ordering differs from bear-high-vol', () => {
    const bullLow = payloads.filter((p) => p.regime === 'bull-low-vol');
    const bearHigh = payloads.filter((p) => p.regime === 'bear-high-vol');
    const sortedBullLow = [...bullLow].sort((a, b) => b.weight - a.weight);
    const sortedBearHigh = [...bearHigh].sort((a, b) => b.weight - a.weight);
    // In bull-low-vol, stocktwits has the highest IC → highest weight.
    expect(sortedBullLow[0].source_id).toBe('stocktwits');
    // In bear-high-vol, reddit has the highest IC → highest weight.
    expect(sortedBearHigh[0].source_id).toBe('reddit');
    // Per-regime independence: the top-source differs.
    expect(sortedBullLow[0].source_id).not.toBe(sortedBearHigh[0].source_id);
  });

  it('within a regime, weights respect the bounded softmax caps [0.5, 5.0]', () => {
    for (const p of payloads) {
      expect(p.weight).toBeGreaterThanOrEqual(0.5);
      expect(p.weight).toBeLessThanOrEqual(5.0);
    }
  });

  it('sparse cell (reddit, bull-high-vol, n=5) produces shrinkage_strength > 0.7', () => {
    const bullHighReddit = payloads.find(
      (p) => p.regime === 'bull-high-vol' && p.source_id === 'reddit',
    );
    expect(bullHighReddit).toBeDefined();
    expect(bullHighReddit!.shrinkage_strength).toBeGreaterThan(0.7);
  });

  it('dense cells (n=200) produce smaller shrinkage_strength than sparse cells', () => {
    const denseRow = payloads.find(
      (p) => p.regime === 'bull-low-vol' && p.source_id === 'stocktwits',
    );
    const sparseRow = payloads.find(
      (p) => p.regime === 'bull-high-vol' && p.source_id === 'reddit',
    );
    expect(denseRow).toBeDefined();
    expect(sparseRow).toBeDefined();
    expect(denseRow!.shrinkage_strength!).toBeLessThan(sparseRow!.shrinkage_strength!);
  });

  it('"ALL" rows are emitted with shrinkage_strength === null (baseline, no shrinkage)', () => {
    const allRows = payloads.filter((p) => p.regime === 'ALL');
    expect(allRows.length).toBeGreaterThanOrEqual(3);
    for (const r of allRows) {
      expect(r.shrinkage_strength).toBeNull();
    }
  });

  it('Pitfall 2: order is IC → SHRINK → SOFTMAX (not SOFTMAX → SHRINK)', () => {
    // Spy on shrinkSourceIcEmpiricalBayes by reconstructing the math:
    // dense bull-low-vol stocktwits has mean_ic=0.30, n=200, n_ALL=500, var=0.01.
    // λ_raw = 500 / max(1, 0.01/200) = 500 / 1 = 500 → clamped to 50.
    // shrunk_ic = (200*0.30 + 50*0.20) / 250 = (60 + 10)/250 = 0.28.
    const stocktwitsBullLow = payloads.find(
      (p) => p.regime === 'bull-low-vol' && p.source_id === 'stocktwits',
    )!;
    // mean_ic_90d carries the shrunk IC (post-shrink, pre-softmax-clamp).
    expect(stocktwitsBullLow.mean_ic_90d).toBeCloseTo(0.28, 2);

    // Reconstruct the per-regime softmax over the SHRUNK ICs to confirm the
    // weights came from shrunk values, not raw values.
    const reconstructedShrunks = [
      shrinkSourceIcEmpiricalBayes({
        regime_ic: 0.30,
        regime_n: 200,
        unconditional_ic: 0.20,
        lambda: 500 / Math.max(1, 0.01 / 200),
      }).shrunk_ic,
      shrinkSourceIcEmpiricalBayes({
        regime_ic: 0.15,
        regime_n: 200,
        unconditional_ic: 0.10,
        lambda: 500 / Math.max(1, 0.02 / 200),
      }).shrunk_ic,
      shrinkSourceIcEmpiricalBayes({
        regime_ic: 0.05,
        regime_n: 200,
        unconditional_ic: 0.05,
        lambda: 500 / Math.max(1, 0.03 / 200),
      }).shrunk_ic,
    ];
    const reconstructedWeights = softmaxWithCaps(reconstructedShrunks);
    const bullLowSorted = payloads
      .filter((p) => p.regime === 'bull-low-vol')
      .sort((a, b) => {
        // align with reconstructedShrunks order: stocktwits, reddit, apewisdom
        const ord = { stocktwits: 0, reddit: 1, apewisdom: 2 } as Record<string, number>;
        return ord[a.source_id] - ord[b.source_id];
      });
    for (let i = 0; i < bullLowSorted.length; i++) {
      expect(bullLowSorted[i].weight).toBeCloseTo(reconstructedWeights[i], 6);
    }
  });
});

describe('runRecompute — cron entry point (transactional INSERT + per-regime row counts)', () => {
  beforeEach(() => {
    queryRawMock.mockReset();
    createMock.mockReset();
    transactionMock.mockReset();
    findFirstMock.mockReset();
    // `prisma.sourceTier.create(...)` returns a thenable; the script collects
    // them into an array and passes to `$transaction([...])`.  Our mock makes
    // create() return a token so the array assembly compiles, and $transaction
    // returns a resolved Promise.
    createMock.mockImplementation((args: unknown) => ({
      __create: true,
      args,
    }));
    transactionMock.mockResolvedValue(undefined);
  });

  it('INSERTs per-regime + "ALL" rows in a single $transaction', async () => {
    queryRawMock.mockResolvedValue(REGIME_PANEL_FIXTURE);

    const result = await runRecompute({ modelVersion: 'test-v1' });

    // Per-regime + ALL row counts.
    expect(result.rows_written).toBeGreaterThan(0);
    expect(result.per_regime_rows_written.ALL).toBe(3); // 3 distinct sources
    expect(result.per_regime_rows_written['bull-low-vol']).toBe(3);
    expect(result.per_regime_rows_written['bear-high-vol']).toBe(3);
    expect(result.per_regime_rows_written['bull-high-vol']).toBe(1); // only reddit had data
    expect(result.per_regime_rows_written['bear-low-vol']).toBe(0);  // fully sparse

    // Transactional atomicity.
    expect(transactionMock).toHaveBeenCalledTimes(1);
    const txArg = transactionMock.mock.calls[0][0] as unknown[];
    expect(Array.isArray(txArg)).toBe(true);
    expect(txArg.length).toBe(result.rows_written);

    // No half-written rows: createMock count equals rows_written.
    expect(createMock).toHaveBeenCalledTimes(result.rows_written);
  });

  it('records sparse cells in result.sparse_cells_skipped', async () => {
    queryRawMock.mockResolvedValue(REGIME_PANEL_FIXTURE);
    const result = await runRecompute({ modelVersion: 'test-v1' });
    // bear-low-vol regime is fully empty → 3 skipped (one per distinct source).
    const bearLowSkipped = result.sparse_cells_skipped.filter((c) => c.regime === 'bear-low-vol');
    expect(bearLowSkipped.length).toBe(3);
  });

  it('persists shrinkage_strength per row (audit visibility for the EngineCalibrationPanel)', async () => {
    queryRawMock.mockResolvedValue(REGIME_PANEL_FIXTURE);
    await runRecompute({ modelVersion: 'test-v1' });

    // Inspect every create call — each must carry a shrinkage_strength field.
    for (const call of createMock.mock.calls) {
      const data = call[0].data;
      expect(data).toHaveProperty('shrinkage_strength');
      if (data.regime === 'ALL') {
        expect(data.shrinkage_strength).toBeNull();
      } else {
        expect(typeof data.shrinkage_strength).toBe('number');
        expect(data.shrinkage_strength).toBeGreaterThan(0);
        expect(data.shrinkage_strength).toBeLessThanOrEqual(1);
      }
    }
  });

  it('panel empty → legacy fallback: no rows written, per_source_ic_table_empty=true', async () => {
    queryRawMock.mockResolvedValue([]); // both regime + legacy raw-IC queries return []
    const result = await runRecompute({ modelVersion: 'test-v1' });
    expect(result.per_source_ic_table_empty).toBe(true);
    expect(result.rows_written).toBe(0);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('covers all four active regimes plus ALL when panel has dense rows everywhere', async () => {
    // Build a fully-populated fixture so all 5 regime labels are exercised.
    const fullPanel = [
      { source_id: 'stocktwits', regime: 'ALL', mean_ic: 0.20, variance_ic: 0.01, n_observations: 500 },
      { source_id: 'reddit',     regime: 'ALL', mean_ic: 0.10, variance_ic: 0.02, n_observations: 500 },
      ...ACTIVE_REGIME_LABELS.flatMap((r) => [
        { source_id: 'stocktwits', regime: r, mean_ic: 0.25, variance_ic: 0.01, n_observations: 150 },
        { source_id: 'reddit',     regime: r, mean_ic: 0.10, variance_ic: 0.02, n_observations: 150 },
      ]),
    ];
    queryRawMock.mockResolvedValue(fullPanel);
    const result = await runRecompute({ modelVersion: 'test-v1' });
    for (const r of ACTIVE_REGIME_LABELS) {
      expect(result.per_regime_rows_written[r]).toBe(2);
    }
    expect(result.per_regime_rows_written.ALL).toBe(2);
    expect(result.sparse_cells_skipped.length).toBe(0);
  });
});
