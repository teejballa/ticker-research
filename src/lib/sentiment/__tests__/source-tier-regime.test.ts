/**
 * PHASE 22 Wave 0 RED stub — Wave 3 delivers GREEN.
 * Covers: D-06 (extend SourceTier with regime) + D-09 (3-step cold-start chain)
 *         per 22-VALIDATION.md §Wave 0 Gaps.
 *
 * Intentionally imports the Wave 3 extended `getWeightForSource` signature
 * `(source_id, regime, asOf)` from `../source-tier`. Today's signature is
 * `(source_id, asOf)` so the new 3-arg call is a compile-time mismatch →
 * vitest reports a "Expected 2 arguments, but got 3" type error OR a runtime
 * `regime` argument being silently dropped — the assertions then fail.
 *
 * Reference implementation contract (22-RESEARCH.md §F):
 *   export async function getWeightForSource(
 *     source_id: string,
 *     regime: RegimeLabel,
 *     asOf: Date
 *   ): Promise<number>
 *
 * Cold-start chain (D-09):
 *   1. query (source_id, regime, computed_at <= asOf)         — regime-specific row
 *   2. fall through to (source_id, 'ALL', computed_at <= asOf) — unconditional row
 *   3. fall through to 1.0                                     — full cold start
 */

import { describe, it, expect } from 'vitest';
// Intentionally probes the extended 3-arg signature so the file fails until Wave 3 lands.
import * as sourceTierModule from '../source-tier';

// Module-level RED guard: assert the Wave 3 extended signature exists with arity 3
// (source_id, regime, asOf). The current Wave 0 signature is arity 2 (source_id, asOf),
// so this assertion fires until Wave 3 widens the signature for D-06 + D-09.
describe('getWeightForSource arity — Wave 3 RED guard', () => {
  it('Wave 3 must widen getWeightForSource to (source_id, regime, asOf) — arity 3 (D-06)', () => {
    const fn = (sourceTierModule as Record<string, unknown>).getWeightForSource;
    expect(typeof fn, 'getWeightForSource is not exported from src/lib/sentiment/source-tier.ts').toBe('function');
    expect(
      (fn as (...args: unknown[]) => unknown).length,
      'Wave 3 must extend getWeightForSource to arity 3 (source_id, regime, asOf) per 22-RESEARCH §F + D-09',
    ).toBeGreaterThanOrEqual(3);
  });
});

describe('getWeightForSource(source_id, regime, asOf) — Wave 3 contract (D-06 + D-09)', () => {
  it.todo('returns regime-specific weight when (source_id, regime) row exists (D-09 step 1)');
  it.todo('falls back to (source_id, "ALL") weight when no (source_id, regime) row exists (D-09 step 2)');
  it.todo('falls back to 1.0 when neither (source_id, regime) nor (source_id, "ALL") exists (D-09 step 3, cold start)');
  it.todo('returns LATEST row by computed_at when multiple rows for same (source_id, regime) exist (append-only history)');
  it.todo('is PIT-correct: getWeightForSource({asOf: pastDate}) ignores rows with computed_at > pastDate');
  it.todo('treats unknown source_id as cold-start (1.0) without falling back to a different source');
});
