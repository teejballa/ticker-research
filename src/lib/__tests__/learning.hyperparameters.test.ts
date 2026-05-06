import { describe, it, expect } from 'vitest';
import { HYPERPARAMETERS, HYPERPARAMETERS_DEFERRED_RETUNE } from '@/lib/learning';

// D-01 grid (lambda_days winners must come from this set; no global default)
const LAMBDA_GRID = new Set([14, 30, 60, 90, 180, 365]);
// D-07 grid (Page-Hinkley parameter winners must come from this product)
const PH_DELTA_GRID = new Set([0.001, 0.005, 0.01]);
const PH_LAMBDA_GRID = new Set([30, 50, 100]);

const REQUIRED_CLASSES = ['diffusion', 'technical', 'insider', 'institutional'] as const;

describe('HYPERPARAMETERS sanity (Pitfall 3 / D-01 / D-07 enforcement)', () => {
  it('contains all 4 required signal classes', () => {
    for (const cls of REQUIRED_CLASSES) {
      expect(HYPERPARAMETERS[cls]).toBeDefined();
    }
  });

  it('every class has all 5 typed fields populated', () => {
    for (const cls of REQUIRED_CLASSES) {
      const h = HYPERPARAMETERS[cls];
      expect(typeof h.lambda_days).toBe('number');
      expect(typeof h.ph_delta).toBe('number');
      expect(typeof h.ph_lambda).toBe('number');
      expect(typeof h.tuned_at).toBe('string');
      // cv_brier_oos may be null per Plan 18-06 step 5 escape hatch (low-N path).
      const brier = h.cv_brier_oos;
      expect(brier === null || typeof brier === 'number').toBe(true);
    }
  });

  it('every lambda_days winner is from the D-01 grid', () => {
    for (const cls of REQUIRED_CLASSES) {
      expect(LAMBDA_GRID.has(HYPERPARAMETERS[cls].lambda_days)).toBe(true);
    }
  });

  it('every ph_delta and ph_lambda winner is from the D-07 grid', () => {
    for (const cls of REQUIRED_CLASSES) {
      expect(PH_DELTA_GRID.has(HYPERPARAMETERS[cls].ph_delta)).toBe(true);
      expect(PH_LAMBDA_GRID.has(HYPERPARAMETERS[cls].ph_lambda)).toBe(true);
    }
  });

  it('every class with cv_brier_oos >= 0.25 is in HYPERPARAMETERS_DEFERRED_RETUNE (Pitfall 3 escape hatch)', () => {
    for (const cls of REQUIRED_CLASSES) {
      const brier = HYPERPARAMETERS[cls].cv_brier_oos;
      // Plan 18-06 step 5 escape hatch: cv_brier_oos === null means tuning was deferred
      // (low-N forced placeholder retention). Such classes MUST be enumerated in
      // HYPERPARAMETERS_DEFERRED_RETUNE so the audit trail of "this class did NOT
      // pass the Brier gate at merge time" is greppable from the constant.
      if (brier === null) {
        expect(HYPERPARAMETERS_DEFERRED_RETUNE.has(cls)).toBe(true);
        continue;
      }
      // Pitfall 3 LOOKS-DONE-BUT-ISN'T bar: a tuned signal class must beat the
      // 50/50 baseline (Brier of an uninformative coin flip is 0.25).
      if (brier >= 0.25) {
        expect(HYPERPARAMETERS_DEFERRED_RETUNE.has(cls)).toBe(true);
      }
    }
  });
});
