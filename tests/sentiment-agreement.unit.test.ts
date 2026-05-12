// Plan 20-A-05 Task 1 — agreement signal pure-functions unit tests.
//
// Asserts the canonical formula 1 - std(bull_pct)/50, clamped [0,1], single-source null,
// strict-less-than threshold gate, bucket trichotomy, and exported default constant.

import { describe, expect, it } from 'vitest';
import {
  AGREEMENT_DEFAULT_THRESHOLD,
  agreementBucket,
  agreementScore,
  lowAgreement,
  std,
} from '@/lib/sentiment/agreement';

describe('std', () => {
  it('returns 0 on a constant vector', () => {
    expect(std([50, 50, 50])).toBeCloseTo(0, 9);
  });

  it('returns sample (Bessel-corrected) std on [0, 100]', () => {
    // n=2: variance = ((-50)^2 + 50^2)/(2-1) = 5000 → std = sqrt(5000) ≈ 70.71
    expect(std([0, 100])).toBeCloseTo(Math.sqrt(5000), 9);
  });

  it('returns 0 for length < 2', () => {
    expect(std([42])).toBe(0);
    expect(std([])).toBe(0);
  });
});

describe('agreementScore', () => {
  it('returns 1 when all sources agree at neutral', () => {
    expect(agreementScore([50, 50, 50])).toBeCloseTo(1, 9);
  });

  it('returns 0 when sources are at the extremes (clamped from negative)', () => {
    // std([0,100]) ≈ 70.71 → 1 - 70.71/50 ≈ -0.414 → clamped to 0
    expect(agreementScore([0, 100])).toBe(0);
  });

  it('returns 0.8 for std=10 (Bessel-corrected for [60,40] is sqrt(200)≈14.14 → 1-14.14/50≈0.717)', () => {
    // Use population-equivalent fixture: [60,40,60,40] gives sample std≈11.547 → 1 - 11.547/50 ≈ 0.769
    // For exact 0.8 check, use a 3-point fixture: [50,60,40] → variance = ((0)+(100)+(100))/2 = 100 → std=10 → 1 - 10/50 = 0.8
    expect(agreementScore([50, 60, 40])).toBeCloseTo(0.8, 9);
  });

  it('returns null when only a single source contributed', () => {
    expect(agreementScore([75])).toBeNull();
  });

  it('returns null when the vector is empty', () => {
    expect(agreementScore([])).toBeNull();
  });

  it('returns 1 when ≥2 sources all agree at neutral (n=6)', () => {
    expect(agreementScore([50, 50, 50, 50, 50, 50])).toBeCloseTo(1, 9);
  });

  it('returns 1 when sources agree at an extreme (consensus, not disagreement)', () => {
    expect(agreementScore([100, 100, 100])).toBeCloseTo(1, 9);
  });

  it('clamps any floating-point drift to [0, 1]', () => {
    // Worst case: [0,0,100,100] → variance = (50^2 * 4)/3 ≈ 3333 → std ≈ 57.74 → 1 - 57.74/50 ≈ -0.155 → 0
    const s = agreementScore([0, 0, 100, 100]);
    expect(s).not.toBeNull();
    expect(s!).toBeGreaterThanOrEqual(0);
    expect(s!).toBeLessThanOrEqual(1);
  });
});

describe('lowAgreement', () => {
  it('returns true when score < threshold', () => {
    expect(lowAgreement(0.4, 0.5)).toBe(true);
  });

  it('uses strict less-than (equality is NOT low)', () => {
    expect(lowAgreement(0.5, 0.5)).toBe(false);
  });

  it('returns false when score > threshold', () => {
    expect(lowAgreement(0.6, 0.5)).toBe(false);
  });
});

describe('agreementBucket', () => {
  it("returns 'na' when score is null (legacy / single-source)", () => {
    expect(agreementBucket(null, 0.5)).toBe('na');
  });

  it("returns 'mixed' when score < threshold", () => {
    expect(agreementBucket(0.4, 0.5)).toBe('mixed');
  });

  it("returns 'aligned' when score >= threshold", () => {
    expect(agreementBucket(0.7, 0.5)).toBe('aligned');
    expect(agreementBucket(0.5, 0.5)).toBe('aligned'); // strict-less-than → equality is aligned
  });
});

describe('AGREEMENT_DEFAULT_THRESHOLD', () => {
  it('is 0.5 per Cookson & Engelberg "Echo Chambers" literature default', () => {
    expect(AGREEMENT_DEFAULT_THRESHOLD).toBe(0.5);
  });
});
