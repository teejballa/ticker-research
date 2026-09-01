import { describe, it, expect } from 'vitest';

// Wave 1: applied in src/lib/gemini-analysis.ts post-process block.
// applyPriceTargetGuard(parsed) mutates parsed in-place, nulling both fields
// when price_target_horizon_days is not in [3,7,14,30,60,90].
describe('price_target_pct post-process guard (DEMO-07)', () => {
  it('nulls both fields when price_target_horizon_days = 5 (not in [3,7,14,30,60,90])', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { applyPriceTargetGuard } = require('@/lib/gemini-analysis');
    const parsed = { price_target_pct: 5.0, price_target_horizon_days: 5 };
    applyPriceTargetGuard(parsed);
    expect(parsed.price_target_pct).toBeNull();
    expect(parsed.price_target_horizon_days).toBeNull();
  });

  it('nulls both fields when price_target_horizon_days = 100', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { applyPriceTargetGuard } = require('@/lib/gemini-analysis');
    const parsed = { price_target_pct: 8.5, price_target_horizon_days: 100 };
    applyPriceTargetGuard(parsed);
    expect(parsed.price_target_pct).toBeNull();
    expect(parsed.price_target_horizon_days).toBeNull();
  });

  it('leaves both fields intact when price_target_horizon_days = 14 (valid)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { applyPriceTargetGuard } = require('@/lib/gemini-analysis');
    const parsed = { price_target_pct: 5.0, price_target_horizon_days: 14 };
    applyPriceTargetGuard(parsed);
    expect(parsed.price_target_pct).toBe(5.0);
    expect(parsed.price_target_horizon_days).toBe(14);
  });
});

// Wave 2: read from report.analysis inside price-followup route.
// Pure helper computeMagnitudeError() extracted to @/lib/magnitude-calibration.
describe('magnitude_error computation (DEMO-09)', () => {
  it('magnitude_error = forward_return_raw - expected_pct when days_after === expected_horizon_days', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { computeMagnitudeError } = require('@/lib/magnitude-calibration');
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
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { computeMagnitudeError } = require('@/lib/magnitude-calibration');
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
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { computeMagnitudeError } = require('@/lib/magnitude-calibration');
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
// live in src/lib/magnitude-calibration.ts.
describe('bucketing logic (DEMO-10)', () => {
  it('expected_pct = -8 falls in bucket "< -5%"', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { assignBucket } = require('@/lib/magnitude-calibration');
    expect(assignBucket(-8).label).toBe('< -5%');
  });

  it('expected_pct = -3 falls in bucket "-5→0%"', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { assignBucket } = require('@/lib/magnitude-calibration');
    expect(assignBucket(-3).label).toBe('-5→0%');
  });

  it('expected_pct = 2 falls in bucket "0→5%"', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { assignBucket } = require('@/lib/magnitude-calibration');
    expect(assignBucket(2).label).toBe('0→5%');
  });

  it('expected_pct = 7 falls in bucket "5→10%"', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { assignBucket } = require('@/lib/magnitude-calibration');
    expect(assignBucket(7).label).toBe('5→10%');
  });

  it('expected_pct = 15 falls in bucket "> 10%"', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { assignBucket } = require('@/lib/magnitude-calibration');
    expect(assignBucket(15).label).toBe('> 10%');
  });

  it('mean_actual_pct computed correctly over mock outcomes in a bucket', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { computeBucketMean } = require('@/lib/magnitude-calibration');
    expect(computeBucketMean([1, 2, 3, 4, 5])).toBe(3);
  });
});

describe('ESS gate N>=20 (DEMO-10)', () => {
  it('bucket with n = 19 excluded from write output', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { applyEssGate } = require('@/lib/magnitude-calibration');
    expect(applyEssGate([{ n: 19 }], 20)).toEqual([]);
  });

  it('bucket with n = 20 included in write output', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { applyEssGate } = require('@/lib/magnitude-calibration');
    expect(applyEssGate([{ n: 20 }], 20)).toEqual([{ n: 20 }]);
  });
});

describe('chart hide condition (DEMO-11)', () => {
  it('returns "insufficient" render decision when buckets.length = 2', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { chartRenderDecision } = require('@/lib/magnitude-calibration');
    expect(chartRenderDecision([{}, {}])).toBe('insufficient');
  });

  it('returns "render" decision when buckets.length = 3', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { chartRenderDecision } = require('@/lib/magnitude-calibration');
    expect(chartRenderDecision([{}, {}, {}])).toBe('render');
  });
});

// Wave 2 integration coverage — expanded when writeReportToDb wiring lands.
describe('expected_pct write path (DEMO-08)', () => {
  it.todo(
    'writes expected_pct + expected_horizon_days when report.analysis.price_target_pct = 5.0 and price_target_horizon_days = 14'
  );
  it.todo(
    'writes expected_pct = null on snapshot-originated PriceOutcome rows (no report.analysis)'
  );
});
