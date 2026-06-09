/**
 * PHASE 22 Wave 0 RED stub — Wave 1 delivers GREEN.
 * Covers: CORE-ML-07 (rolling-60d VIX percentile helper) per 22-VALIDATION.md §Wave 0 Gaps.
 * Decision refs: D-04 (rolling 60d 50th-percentile), D-12 (Yahoo primary + Polygon fallback) per 22-CONTEXT.md.
 *
 * Intentionally imports the target module so the file fails to resolve until
 * Wave 1 lands `src/lib/regime/vix-percentile.ts`. Vitest reports
 * "Cannot find module '../vix-percentile'" → RED.
 *
 * Reference implementation contract (22-RESEARCH.md §B):
 *   export async function getVix60dPercentile(asOf: Date):
 *     Promise<{ level: number; percentile_60d: number } | null>
 *
 * Determinism: Wave 1's full test suite reads `tests/fixtures/regime/vix-history.json`
 * (created in Wave 0 alongside this stub) so the percentile assertion is offline-runnable.
 */

import { describe, it } from 'vitest';
// Intentionally imports the target module so the file fails to resolve until Wave 1 lands.
import { getVix60dPercentile } from '../vix-percentile';

describe('getVix60dPercentile — Wave 1 contract', () => {
  it.todo('returns { level, percentile_60d } shaped object when Yahoo ^VIX history is available (D-12 primary)');
  it.todo('falls back to Polygon I:VIX when Yahoo returns null (D-12 fallback chain)');
  it.todo('returns null when both Yahoo and Polygon return null (cold-start fed to D-09 chain)');
  it.todo('computes percentile over the trailing 60 calendar days excluding the asOf day itself');
  it.todo('matches deterministic golden percentile from tests/fixtures/regime/vix-history.json at boundary index 31 (≈ 50th-pct cross)');
  it.todo('is PIT-correct: getVix60dPercentile({asOf: pastDate}) uses ONLY closes <= pastDate');
});

void getVix60dPercentile;
