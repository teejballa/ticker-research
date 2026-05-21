// Phase 21 — Sector-Relative Outcome Labels.
// Green as of 21-3-06: classifyHit widened to accept sector_relative_pct +
// nullable spy_return_pct + optional sector_sigma/k σ-driven threshold.
//
// The current classifyHit signature (src/lib/learning.ts:95) is:
//   classifyHit({ ticker_return_pct, spy_return_pct, threshold_pct? }): boolean
//
// 21-3-06 will extend it to:
//   classifyHit({
//     ticker_return_pct,
//     spy_return_pct: number | null,
//     sector_relative_pct: number | null,
//     threshold_pct?
//   }): boolean
//
// Primary path: when sector_relative_pct is non-null, hit = sector_relative_pct > threshold
// Fallback path: when sector_relative_pct is null, hit = (ticker - spy) > threshold
// No-data guard: when both spy_return_pct and sector_relative_pct are null, hit = false
//
// 4 it() blocks below cover this contract.

import { describe, it, expect } from 'vitest';
import { classifyHit } from '../learning';

describe('classifyHit (sector-relative primary, 21-3-06 extended signature)', () => {
  it('uses sector_relative_pct when provided and > threshold → hit=true (sector path wins where SPY-alpha would say miss)', () => {
    const hit = classifyHit({
      ticker_return_pct: 5,
      spy_return_pct: 4.5,         // (5-4.5)=0.5, NOT > 1% — SPY-alpha says miss
      sector_relative_pct: 2.5,    // > 1% — sector path says hit; sector wins
      threshold_pct: 1,
    });
    expect(hit).toBe(true);
  });

  it('uses sector_relative_pct when provided and < threshold → hit=false (sector path wins over SPY excess)', () => {
    const hit = classifyHit({
      ticker_return_pct: 10, // would be hit on SPY-alpha (10-3=7 > 1)
      spy_return_pct: 3,
      sector_relative_pct: 0.5, // but sector-rel < 1% → miss; sector wins
      threshold_pct: 1,
    });
    expect(hit).toBe(false);
  });

  it('falls back to SPY-alpha when sector_relative_pct is null → (ticker - spy) > threshold', () => {
    const hit = classifyHit({
      ticker_return_pct: 5,
      spy_return_pct: 3,
      sector_relative_pct: null,
      threshold_pct: 1,
    });
    expect(hit).toBe(true); // (5 - 3) = 2 > 1
  });

  it('returns false when both sector_relative_pct and spy_return_pct are null (no-data guard)', () => {
    const hit = classifyHit({
      ticker_return_pct: 5,
      spy_return_pct: null,
      sector_relative_pct: null,
      threshold_pct: 1,
    });
    expect(hit).toBe(false);
  });

  // WARNING-1 — k·σ_sector volatility-aware threshold path.

  it('uses k·σ_sector threshold when sector_sigma + k provided (1.8σ-alpha > 1.2σ gate → hit)', () => {
    const hit = classifyHit({
      ticker_return_pct: 5,
      spy_return_pct: 3,
      sector_relative_pct: 1.8,   // 1.8% sector alpha
      sector_sigma: 1.2,          // sector stdev = 1.2%
      k: 1,                       // 1-σ gate → threshold = 1.2
    });
    expect(hit).toBe(true); // 1.8 > 1.2
  });

  it('uses k·σ_sector threshold when sector_sigma + k provided (1.0σ-alpha < 1.2σ gate → miss)', () => {
    const hit = classifyHit({
      ticker_return_pct: 5,
      spy_return_pct: 3,
      sector_relative_pct: 1.0,   // 1.0% sector alpha
      sector_sigma: 1.2,          // sector stdev = 1.2%
      k: 1,                       // 1-σ gate → threshold = 1.2
    });
    expect(hit).toBe(false); // 1.0 < 1.2
  });
});
