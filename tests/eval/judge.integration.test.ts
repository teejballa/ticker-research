// tests/eval/judge.integration.test.ts
//
// Plan 20-Z-05 — LIVE judge integration test.
//
// Gated behind RUN_LIVE_JUDGE=true so CI never burns Claude Opus 4.7 tokens
// (T-20-Z-05-02). To exercise:
//
//   RUN_LIVE_JUDGE=true ANTHROPIC_API_KEY=... \
//     npx vitest run tests/eval/judge.integration.test.ts
//
// When RUN_LIVE_JUDGE is not "true" we register a no-op `describe.skip` so
// vitest reports the suite as SKIPPED rather than failing on missing env.
// This pattern lets the file live in the main vitest tree without polluting
// `npm test` with a live network dependency.
//
// What this asserts (only when LIVE):
//   1. judge() returns a real JudgeResult with all 5 dimensions
//   2. judge_model is the pinned 'claude-opus-4-7' literal
//   3. Scores are integers in [0,5] and rationale is non-empty
//   4. overall is the arithmetic mean of the 5 scores
//   5. Wall-clock for a single call is < 30 seconds (sanity ceiling)

import { describe, it, expect } from 'vitest';
import { judge } from '@/lib/eval/judge';
import { JUDGE_DIMENSIONS } from '@/lib/eval/types';

const RUN_LIVE_JUDGE = process.env.RUN_LIVE_JUDGE === 'true';

const maybeDescribe = RUN_LIVE_JUDGE ? describe : describe.skip;

maybeDescribe('judge() — LIVE Claude Opus 4.7 (RUN_LIVE_JUDGE=true)', () => {
  const baseline = [
    'AAPL trades at $185 (yahoo). P/E 28 (yahoo). 52w range $164-$199 (yahoo).',
    'iPhone 17 cycle confirmed bullish by analyst commentary (anthropic-search).',
    'StockTwits bull/bear 70/30 (stocktwits).',
  ].join(' ');

  const candidate = [
    'AAPL trades at $185 (yahoo). P/E 28 (yahoo). 52w range $164-$199 (yahoo).',
    'iPhone 17 cycle confirmed bullish by analyst commentary (anthropic-search).',
    'StockTwits bull/bear 70/30 (stocktwits).',
    'Forward outlook: $200 PT consensus (anthropic-search).',
    'Note: bear case (China revenue -12%) acknowledged but does not invalidate the bull thesis.',
    'NET BUY with moderate conviction (3 of 4 source classes bullish, dispersion low).',
  ].join(' ');

  it('judges a real baseline/candidate pair with all 5 dimensions', async () => {
    const t0 = Date.now();
    const result = await judge(baseline, candidate, {
      baselineId: 'live-aapl-baseline',
      candidateId: 'live-aapl-candidate',
    });
    const dt = Date.now() - t0;

    expect(result.scores).toHaveLength(5);
    expect(result.scores.map((s) => s.dimension)).toEqual([...JUDGE_DIMENSIONS]);
    expect(result.judge_model).toBe('claude-opus-4-7');
    expect(result.judge_prompt_version).toBe('v1');

    for (const s of result.scores) {
      expect(Number.isInteger(s.score)).toBe(true);
      expect(s.score).toBeGreaterThanOrEqual(0);
      expect(s.score).toBeLessThanOrEqual(5);
      expect(s.rationale.length).toBeGreaterThan(0);
    }

    const expectedOverall =
      result.scores.reduce((sum, s) => sum + s.score, 0) / result.scores.length;
    expect(result.overall).toBeCloseTo(expectedOverall, 6);

    expect(dt).toBeLessThan(30_000);
  }, 60_000);
});
