// src/lib/reasoning/router.ts
//
// Phase 19 / Plan 19-C-09 — Model cascade router (D-41).
//
// Pure function: routeModel(args) → 'haiku' | 'gemini-flash' | 'gemini-pro'.
// No I/O, no DB, no environment reads. Deterministic for unit testing.
//
// Decision tree (design §4 step 6c, pinned by tests/lib/reasoning/router.test.ts):
//
//   1. High-stakes triggers (any one trips → 'gemini-pro'):
//        - ic_decay_flag === true                 (alpha-decay tripwire from Plan 19-A-05)
//        - controversy ≥ 0.7                       (engine-context controversy score)
//        - market_cap_class === 'mega'             (size-class heuristic)
//   2. Low-stakes shortcut (both must hold → 'haiku'):
//        - market_cap_class === 'small'
//        - controversy < 0.3
//   3. Default: 'gemini-flash'.
//
// Cost telemetry helper: estimateCost(model, tokens) returns USD cost using
// fixed per-1M-token pricing pinned from Vercel AI Gateway as of 2026-05-08.
// Pricing constants sit in this file so the model→price contract is testable
// without env reads. Tweak only via PR — the unit suite validates the
// monotonic ordering (haiku < gemini-flash < gemini-pro per same token count).
//
// Telemetry persistence (writing the LearningEvent row with the per-call cost)
// lives in src/lib/gemini-analysis.ts at the call site — this file only owns
// the deterministic routing + cost arithmetic.

export type ModelChoice = 'haiku' | 'gemini-flash' | 'gemini-pro';

/**
 * Per-1M-token USD cost for each routable model. Pinned from Vercel AI
 * Gateway pricing 2026-05-08. The unit suite asserts haiku < gemini-pro at
 * a fixed token count — adjust here to track gateway price moves.
 */
const COST_PER_M_TOKENS: Record<ModelChoice, number> = {
  'haiku': 0.25,
  'gemini-flash': 0.30,
  'gemini-pro': 1.25,
};

/**
 * Pure router. Same input always returns the same output (D-41 spec).
 *
 * @param args.ticker            symbol (passthrough — not consulted by the
 *                                decision tree, included for caller-side
 *                                logging context)
 * @param args.controversy       0–1 controversy score from engine-context
 * @param args.ic_decay_flag     Plan 19-A-05 rolling-IC decay flag
 * @param args.market_cap_class  'mega' | 'large' | 'mid' | 'small' | 'unknown'
 *                                — defaults to 'unknown' when omitted
 */
export function routeModel(args: {
  ticker: string;
  controversy: number;
  ic_decay_flag: boolean;
  market_cap_class?: 'mega' | 'large' | 'mid' | 'small' | 'unknown';
}): ModelChoice {
  const { controversy, ic_decay_flag, market_cap_class } = args;

  // High-stakes triggers (any one trips → gemini-pro).
  if (ic_decay_flag) return 'gemini-pro';
  if (controversy >= 0.7) return 'gemini-pro';
  if (market_cap_class === 'mega') return 'gemini-pro';

  // Low-stakes shortcut: small cap + low controversy → haiku.
  if (market_cap_class === 'small' && controversy < 0.3) return 'haiku';

  // Default standard tier.
  return 'gemini-flash';
}

/**
 * Estimated USD cost for `tokens` tokens at `model`'s pinned rate.
 * Linear in tokens; rate table is COST_PER_M_TOKENS.
 */
export function estimateCost(model: ModelChoice, tokens: number): number {
  return (tokens / 1_000_000) * COST_PER_M_TOKENS[model];
}
