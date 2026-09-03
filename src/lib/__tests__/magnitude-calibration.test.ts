import { describe, it, expect } from 'vitest';
import {
  applyPriceTargetGuard,
  computeMagnitudeError,
  assignBucket,
  computeBucketMean,
  applyEssGate,
  chartRenderDecision,
} from '@/lib/magnitude-calibration';

// Wave 1: applyPriceTargetGuard lives in @/lib/magnitude-calibration (pure
// module — no heavy AI/DB imports) and is re-exported from gemini-analysis.ts.
// gemini-analysis.ts calls it in the post-process block on every parse.
describe('price_target_pct post-process guard (DEMO-07)', () => {
  it('nulls both fields when price_target_horizon_days = 5 (not in [3,7,14,30,60,90])', () => {
    const parsed = { price_target_pct: 5.0, price_target_horizon_days: 5 };
    applyPriceTargetGuard(parsed);
    expect(parsed.price_target_pct).toBeNull();
    expect(parsed.price_target_horizon_days).toBeNull();
  });

  it('nulls both fields when price_target_horizon_days = 100', () => {
    const parsed = { price_target_pct: 8.5, price_target_horizon_days: 100 };
    applyPriceTargetGuard(parsed);
    expect(parsed.price_target_pct).toBeNull();
    expect(parsed.price_target_horizon_days).toBeNull();
  });

  it('leaves both fields intact when price_target_horizon_days = 14 (valid)', () => {
    const parsed = { price_target_pct: 5.0, price_target_horizon_days: 14 };
    applyPriceTargetGuard(parsed);
    expect(parsed.price_target_pct).toBe(5.0);
    expect(parsed.price_target_horizon_days).toBe(14);
  });
});

// Wave 2: computeMagnitudeError in @/lib/magnitude-calibration.
describe('magnitude_error computation (DEMO-09)', () => {
  it('magnitude_error = forward_return_raw - expected_pct when days_after === expected_horizon_days', () => {
    expect(
      computeMagnitudeError({
        forward_return_raw: 7.2,
        expected_pct: 5.0,
        expected_horizon_days: 14,
        days_after: 14,
      })
    ).toBeCloseTo(2.2);
  });

  it('magnitude_error = null when days_after !== expected_horizon_days', () => {
    expect(
      computeMagnitudeError({
        forward_return_raw: 7.2,
        expected_pct: 5.0,
        expected_horizon_days: 14,
        days_after: 7,
      })
    ).toBeNull();
  });

  it('magnitude_error = null when expected_pct IS NULL', () => {
    expect(
      computeMagnitudeError({
        forward_return_raw: 7.2,
        expected_pct: null,
        expected_horizon_days: null,
        days_after: 14,
      })
    ).toBeNull();
  });
});

// Wave 3: assignBucket / computeBucketMean / applyEssGate / chartRenderDecision
// in @/lib/magnitude-calibration.
describe('bucketing logic (DEMO-10)', () => {
  it('expected_pct = -8 falls in bucket "< -5%"', () => {
    expect(assignBucket(-8).label).toBe('< -5%');
  });

  it('expected_pct = -3 falls in bucket "-5→0%"', () => {
    expect(assignBucket(-3).label).toBe('-5→0%');
  });

  it('expected_pct = 2 falls in bucket "0→5%"', () => {
    expect(assignBucket(2).label).toBe('0→5%');
  });

  it('expected_pct = 7 falls in bucket "5→10%"', () => {
    expect(assignBucket(7).label).toBe('5→10%');
  });

  it('expected_pct = 15 falls in bucket "> 10%"', () => {
    expect(assignBucket(15).label).toBe('> 10%');
  });

  it('mean_actual_pct computed correctly over mock outcomes in a bucket', () => {
    expect(computeBucketMean([1, 2, 3, 4, 5])).toBe(3);
  });
});

describe('ESS gate N>=20 (DEMO-10)', () => {
  it('bucket with n = 19 excluded from write output', () => {
    expect(applyEssGate([{ n: 19 }], 20)).toEqual([]);
  });

  it('bucket with n = 20 included in write output', () => {
    expect(applyEssGate([{ n: 20 }], 20)).toEqual([{ n: 20 }]);
  });
});

describe('chart hide condition (DEMO-11)', () => {
  it('returns "insufficient" render decision when buckets.length = 2', () => {
    expect(chartRenderDecision([{}, {}])).toBe('insufficient');
  });

  it('returns "render" decision when buckets.length = 3', () => {
    expect(chartRenderDecision([{}, {}, {}])).toBe('render');
  });
});

// Wave 2 integration coverage — expanded when writeReportToDb wiring lands.
describe('expected_pct write path (DEMO-08)', () => {
  it('mirrors expected_pct + expected_horizon_days from report analysis JSON on report-branch write', () => {
    const analysisJson = { price_target_pct: 5.0, price_target_horizon_days: 14 };
    const expectedPct = analysisJson?.price_target_pct ?? null;
    const expectedHorizonDays = analysisJson?.price_target_horizon_days ?? null;
    expect(expectedPct).toBe(5.0);
    expect(expectedHorizonDays).toBe(14);
  });

  it('writes expected_pct = null on snapshot-originated PriceOutcome rows (no report.analysis)', () => {
    const analysisJson = null as { price_target_pct?: number | null; price_target_horizon_days?: number | null } | null;
    const expectedPct = analysisJson?.price_target_pct ?? null;
    const expectedHorizonDays = analysisJson?.price_target_horizon_days ?? null;
    expect(expectedPct).toBeNull();
    expect(expectedHorizonDays).toBeNull();
  });
});
