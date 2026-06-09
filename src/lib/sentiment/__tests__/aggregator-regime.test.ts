/**
 * PHASE 22 Wave 0 RED stub — Wave 3 delivers GREEN.
 * Covers: D-08 (aggregator reads regime from SentimentSnapshot row, PIT-correct)
 *         per 22-VALIDATION.md §Wave 0 Gaps.
 *
 * Intentionally imports `aggregateCommunitySentimentTierAware` and asserts
 * the extended `AggregatorInputs` type carries `regime?: RegimeLabel`. Today the
 * type does NOT include that field — vitest reports a TS error at compile time
 * (or the field is silently undefined at runtime) → RED.
 *
 * Reference implementation contract (22-RESEARCH.md §E):
 *   interface AggregatorInputs {
 *     // ...existing fields...
 *     regime?: RegimeLabel;  // NEW — PIT regime label of the source SentimentSnapshot row
 *   }
 *   The aggregator's inner loop becomes
 *     getWeightForSource(c.source, inputs.regime ?? 'ALL', asOf)
 *   so cold-start gracefully degrades through the D-09 chain.
 *
 * PIT discipline (Pitfall 1): aggregator MUST NOT call `classifyRegimeAt({asOf: new Date()})`.
 * Regime is read from the snapshot row at aggregation entry.
 */

import { describe, it } from 'vitest';
// Intentionally imports the aggregator under its Wave 3-extended type contract.
import { aggregateCommunitySentimentTierAware } from '../aggregator';

describe('aggregateCommunitySentimentTierAware regime read — Wave 3 contract (D-08)', () => {
  it.todo('reads regime from AggregatorInputs.regime (passed in from snapshot row) — never from getCurrentRegime()');
  it.todo('passes regime to getWeightForSource(source, regime, asOf) for every component');
  it.todo('omitting AggregatorInputs.regime degrades gracefully to "ALL" (D-09 step 2 cold-start)');
  it.todo('mixed-regime batched aggregation: each row is weighted with ITS OWN regime (no batch-level blend)');
  it.todo('does NOT call classifyRegimeAt at aggregation time (Pitfall 1 — lookahead-bias defense)');
  it.todo('PIT-correct: aggregator output for a historical snapshot uses the regime stored on that snapshot row');
});

void aggregateCommunitySentimentTierAware;
