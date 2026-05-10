/**
 * Post-Phase-19 — multi-source community sentiment aggregator.
 *
 * Fixes the "100% bullish" failure mode where a single echo-chamber source
 * (StockTwits on meme stocks like GME) drives the headline sentiment number
 * to an extreme that doesn't reflect the broader sentiment landscape.
 *
 * Algorithm:
 *   - Each source contributes (bullish_pct, weight) where weight is min(mention_count, WEIGHT_CAP).
 *   - Beta(α=5, β=5) prior — equivalent to 10 pseudo-mentions at 50% — smooths small samples
 *     toward neutral so 100% bullish on N=20 messages doesn't read as "definitely bullish".
 *   - Aggregated bull_pct = (Σ(bull_i × w_i) + α*100) / (Σw_i + α + β) where α=β=5
 *
 * 8 tests:
 *   1. All-null sources → returns nulls.
 *   2. Single source (StockTwits 100%, n=20) gets pulled toward 50 by the prior — ~80%, not 100%.
 *   3. Two sources agree at 70% → aggregate ~70% (prior nudge minimal at high N).
 *   4. Two sources disagree (95% vs 30%) → aggregate near weighted middle.
 *   5. Sources with 0 mentions are excluded.
 *   6. The components breakdown lists each contributing source with its bull_pct + weight.
 *   7. WEIGHT_CAP prevents one massive source dominating.
 *   8. source_count reflects only sources with non-null bullish_pct AND mention_count > 0.
 */

import { describe, it, expect } from 'vitest';
import { aggregateCommunitySentiment } from '@/lib/sentiment/aggregator';

describe('aggregateCommunitySentiment', () => {
  it('returns nulls when all sources null', () => {
    const r = aggregateCommunitySentiment({
      stocktwits: null,
      swaggystocks: null,
      apewisdom: null,
    });
    expect(r.aggregated_bull_pct).toBeNull();
    expect(r.aggregated_bear_pct).toBeNull();
    expect(r.source_count).toBe(0);
    expect(r.components).toEqual([]);
  });

  it('pulls a 100% StockTwits sample toward 50 via Beta(5,5) prior', () => {
    const r = aggregateCommunitySentiment({
      stocktwits: { bullish_pct: 100, mention_count: 20 },
      swaggystocks: null,
      apewisdom: null,
    });
    // (100*20 + 5*100) / (20 + 10) = 2500/30 ≈ 83.3%
    expect(r.aggregated_bull_pct).not.toBeNull();
    expect(r.aggregated_bull_pct!).toBeGreaterThan(75);
    expect(r.aggregated_bull_pct!).toBeLessThan(90);
    expect(r.aggregated_bear_pct).toBe(100 - r.aggregated_bull_pct!);
    expect(r.source_count).toBe(1);
    expect(r.components.length).toBe(1);
    expect(r.components[0]!.source).toBe('stocktwits');
  });

  it('two sources agreeing at 70% with high N → aggregate ~70%', () => {
    const r = aggregateCommunitySentiment({
      stocktwits: { bullish_pct: 70, mention_count: 500 },
      swaggystocks: { bullish_pct: 70, mention_count: 300 },
      apewisdom: null,
    });
    // (70*500 + 70*300 + 5*100) / (500+300+10) = 56500/810 ≈ 69.75
    expect(r.aggregated_bull_pct).toBeCloseTo(69.75, 0);
    expect(r.source_count).toBe(2);
  });

  it('two sources disagreeing → aggregate is weighted middle', () => {
    const r = aggregateCommunitySentiment({
      stocktwits: { bullish_pct: 95, mention_count: 100 },
      swaggystocks: { bullish_pct: 30, mention_count: 100 },
      apewisdom: null,
    });
    // (95*100 + 30*100 + 5*100) / (100+100+10) = 13000/210 ≈ 61.9%
    expect(r.aggregated_bull_pct).toBeGreaterThan(55);
    expect(r.aggregated_bull_pct).toBeLessThan(70);
    expect(r.source_count).toBe(2);
  });

  it('sources with 0 mentions are excluded from the count and weighting', () => {
    const r = aggregateCommunitySentiment({
      stocktwits: { bullish_pct: 80, mention_count: 50 },
      swaggystocks: { bullish_pct: 90, mention_count: 0 },
      apewisdom: { bullish_pct: 60, mention_count: 0 },
    });
    expect(r.source_count).toBe(1);
    // (80*50 + 500) / (50+10) = 4500/60 = 75
    expect(r.aggregated_bull_pct).toBe(75);
  });

  it('components breakdown lists each contributing source', () => {
    const r = aggregateCommunitySentiment({
      stocktwits: { bullish_pct: 70, mention_count: 100 },
      swaggystocks: { bullish_pct: 60, mention_count: 50 },
      apewisdom: null,
    });
    expect(r.components.length).toBe(2);
    expect(r.components.map((c) => c.source).sort()).toEqual(['stocktwits', 'swaggystocks']);
    const st = r.components.find((c) => c.source === 'stocktwits');
    expect(st!.bullish_pct).toBe(70);
    expect(st!.weight).toBe(100);
  });

  it('WEIGHT_CAP prevents one massive source dominating', () => {
    // Without cap: (100*1_000_000 + 0*100 + 500) / (1_000_010) ≈ 99.999 — extreme.
    // With cap (10000): (100*10000 + 0*100 + 500) / (10100 + 10) ≈ 99.0
    // Then with 0% from the second source (cap not relevant): both contribute,
    // we just want to confirm the massive source doesn't fully dominate.
    const r = aggregateCommunitySentiment({
      stocktwits: { bullish_pct: 100, mention_count: 1_000_000 },
      swaggystocks: { bullish_pct: 20, mention_count: 100 },
      apewisdom: null,
    });
    // With WEIGHT_CAP=10000: (100*10000 + 20*100 + 500) / (10000+100+10) = 102500/10110 ≈ 101% capped
    // Actually: numerator = 100_000 + 2000 + 500 = 102500; denominator = 10110; result ≈ 10.14 — wait
    // Let me recompute: 100*10000 = 1_000_000, +20*100 = 2000, +5*100 = 500 → numerator = 1_002_500
    // denominator = 10000 + 100 + 10 = 10110 → 1002500/10110 ≈ 99.16%
    // OK so with cap, it's still ~99% because StockTwits cap dwarfs swaggystocks. That's expected
    // — cap prevents one user from inflating to 1M weight, but a 100x weight differential is real.
    // The test should just confirm the cap is APPLIED — if uncapped, we'd get 99.998%; capped, 99.16%.
    expect(r.aggregated_bull_pct).toBeLessThan(99.5);
    // And the component weight is shown as the capped value, not the raw mention_count
    const st = r.components.find((c) => c.source === 'stocktwits')!;
    expect(st.weight).toBeLessThanOrEqual(10000);
    expect(st.raw_mention_count).toBe(1_000_000);
  });

  it('source_count reflects only sources with non-null bullish_pct AND mention_count > 0', () => {
    const r = aggregateCommunitySentiment({
      stocktwits: { bullish_pct: null, mention_count: 100 }, // null pct → excluded
      swaggystocks: { bullish_pct: 60, mention_count: 50 },
      apewisdom: { bullish_pct: 40, mention_count: 0 }, // 0 mentions → excluded
    });
    expect(r.source_count).toBe(1);
    expect(r.components.length).toBe(1);
    expect(r.components[0]!.source).toBe('swaggystocks');
  });
});
