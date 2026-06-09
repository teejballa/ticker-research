/**
 * PHASE 22 Wave 0 RED stub — Wave 1 delivers GREEN.
 * Covers: CORE-ML-07 per 22-VALIDATION.md §Wave 0 Gaps.
 * Decision refs: D-02 (4-bucket), D-03 (trend axis), D-04 (vol axis), D-09 (cold-start) per 22-CONTEXT.md.
 *
 * Intentionally imports the target module so the file fails to resolve
 * until Wave 1 lands `src/lib/regime/classify.ts`. Vitest will report a
 * "Cannot find module '../classify'" error proving RED state.
 *
 * Reference implementation contract (22-RESEARCH.md §B):
 *   export interface RegimeResult {
 *     regime: RegimeLabel;
 *     vix_level: number | null;
 *     vix_60d_percentile: number | null;
 *     spy_ma_50_minus_200: number | null;
 *   }
 *   export async function classifyRegimeAt(args: { asOf: Date }): Promise<RegimeResult>
 *
 * No `@knowable_at` on test files — only on production code per CLAUDE.md rule #6.
 */

import { describe, it } from 'vitest';
// Intentionally imports the target module so the file fails to resolve until Wave 1 lands.
import { classifyRegimeAt } from '../classify';

describe('classifyRegimeAt — Wave 1 contract', () => {
  it.todo('returns regime="ALL" when VIX history is null (D-09 cold-start)');
  it.todo('returns regime="ALL" when SPY MA history is null (D-09 cold-start)');
  it.todo('returns "bull-low-vol" when MA50 > MA200 AND VIX < 60d 50th-pct (D-02 + D-03 + D-04)');
  it.todo('returns "bull-high-vol" when MA50 > MA200 AND VIX >= 60d 50th-pct');
  it.todo('returns "bear-low-vol" when MA50 < MA200 AND VIX < 60d 50th-pct');
  it.todo('returns "bear-high-vol" when MA50 < MA200 AND VIX >= 60d 50th-pct');
  it.todo('treats MA50 == MA200 boundary as "bull" axis (sign(0) = +) per D-03');
  it.todo('annotates result with vix_level, vix_60d_percentile, and spy_ma_50_minus_200 for audit trail');
  it.todo('is PIT-correct: classifyRegimeAt({asOf: pastDate}) uses ONLY data knowable at pastDate (CLAUDE.md rule #6)');
});

// Reference the import so TypeScript does not tree-shake it.
void classifyRegimeAt;
