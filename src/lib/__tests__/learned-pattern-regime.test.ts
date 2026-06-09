/**
 * PHASE 22 Wave 0 RED stub — Wave 4 delivers GREEN (write path);
 *                            Wave 5 delivers GREEN (unique-constraint flip).
 * Covers: CORE-ML-06 (LearnedPattern.regime writable + readable)
 *         per 22-VALIDATION.md §Wave 0 Gaps.
 *
 * Live-DB integration test gated on RUN_LIVE_INTEGRATION=true (mirrors
 * src/app/api/cron/__tests__/learn-promotion-event.test.ts §6 precedent).
 * Default `npm test` SKIPS this suite — it only runs when an operator
 * explicitly sets the env var against a populated Neon branch.
 *
 * Intentionally imports the Wave 4 helper `upsertLearnedPatternForRegime`
 * (the per-regime cell writer that Wave 4 wires into the relearn cron).
 * The export does NOT exist yet → RED.
 *
 * Reference contract:
 *   - Schema column `LearnedPattern.regime` ships in Wave 0 (THIS plan) with
 *     DEFAULT 'ALL'; this stub asserts the column is writable + readable.
 *   - The Wave 5 unique-constraint flip (D-11 step 4) is what allows multiple
 *     rows per (signal_class, pattern_key, cap_class, horizon_days) — one per regime.
 *   - Before Wave 5: writes must respect the legacy unique constraint
 *     (one row per cell, regime carries 'ALL').
 */

import { describe, it } from 'vitest';
// Intentionally imports the Wave 4 helper so the file fails until it lands.
import { upsertLearnedPatternForRegime } from '@/lib/learning';

const RUN_LIVE = process.env.RUN_LIVE_INTEGRATION === 'true';

describe.skipIf(!RUN_LIVE)('LearnedPattern.regime live-DB schema — Wave 4/5 contract (CORE-ML-06)', () => {
  it.todo('LearnedPattern.regime column accepts the 5-value union {ALL, bull-low-vol, bull-high-vol, bear-low-vol, bear-high-vol}');
  it.todo('default-ALL semantics: a row inserted without specifying regime defaults to "ALL"');
  it.todo('pre-Wave-5 constraint: cannot insert two rows with same (signal_class, pattern_key, cap_class, horizon_days) regardless of regime');
  it.todo('post-Wave-5 constraint (when D-11 step 4 lands): per-regime rows coexist for the same cell key');
  it.todo('upsertLearnedPatternForRegime writes regime alongside Beta posterior parameters atomically');
});

void upsertLearnedPatternForRegime;
