/**
 * Phase 22 Wave 1 — Live integration smoke test for the regime classifier.
 *
 * Default skipped: only runs when `RUN_LIVE_INTEGRATION=true` (mirrors
 * src/lib/__tests__/learned-pattern-regime.test.ts gating).
 *
 * Hits real Yahoo `^VIX` + `^GSPC` (and Polygon I:VIX/SPY fallback if Yahoo
 * is down). asOf is a known-historical date so the result is reproducible
 * up to data-vendor-revision noise but the *shape* of the result is
 * deterministic — it MUST be one of the 5 RegimeLabel literals.
 *
 * Does NOT assert WHICH label — that depends on live data Yahoo serves at
 * test time and we don't want a flaky CI failure when Yahoo revises old VIX
 * closes. Asserting the union membership is enough to prove the helper
 * composes end-to-end against real upstream APIs.
 */

import { describe, it, expect } from 'vitest';
import { classifyRegimeAt } from '../classify';
import type { RegimeLabel } from '../types';

const RUN_LIVE = process.env.RUN_LIVE_INTEGRATION === 'true';

const ALL_LABELS: ReadonlySet<RegimeLabel> = new Set([
  'bull-low-vol',
  'bull-high-vol',
  'bear-low-vol',
  'bear-high-vol',
  'ALL',
]);

describe.skipIf(!RUN_LIVE)('classifyRegimeAt — live integration smoke (RUN_LIVE_INTEGRATION=true)', () => {
  it('returns a member of the 5-literal RegimeLabel union for asOf=2024-01-15', async () => {
    const result = await classifyRegimeAt({ asOf: new Date('2024-01-15T00:00:00Z') });
    expect(ALL_LABELS.has(result.regime)).toBe(true);
    // If the live providers responded, audit fields must be populated. If they
    // failed, all three must be null (cold-start). NEVER half-populated.
    const allNull =
      result.vix_level === null &&
      result.vix_60d_percentile === null &&
      result.spy_ma_50_minus_200 === null;
    const allPopulated =
      typeof result.vix_level === 'number' &&
      typeof result.vix_60d_percentile === 'number' &&
      typeof result.spy_ma_50_minus_200 === 'number';
    expect(allNull || allPopulated).toBe(true);
  }, 30_000);
});
