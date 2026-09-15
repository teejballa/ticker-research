/**
 * Plan 20-Z-03 — per-provider USD cost constants.
 *
 * QUARTERLY REVIEW CADENCE (T-20-Z-03-03 mitigation):
 *   - Muse (Meta) — https://ai-gateway.vercel.sh/v1/models (meta/muse-spark-1.3-contributor)
 *   - Anthropic   — https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/web-search-tool
 *   - Xpoz        — https://xpoz.ai pricing (Pro plan + per-credit overage)
 *   - HF          — https://huggingface.co/pricing
 *
 * Edits to these constants require a corresponding update to
 * tests/telemetry/cost-estimators.unit.test.ts (which pins the literal values).
 */

export type ProviderId =
  | 'yahoo'
  | 'polygon'
  | 'finnhub'
  | 'anthropic-search'
  | 'stocktwits'
  | 'gemini'
  | 'finbert-hf'
  | 'apewisdom'
  | 'lm-fallback' // Plan 20-B-06 — Loughran-McDonald last-resort fallback (in-process; $0 marginal)
  | 'reddit' // Plan 30.1 — legacy Reddit OAuth provider_id; preserved for DB compatibility on historical rows
  | 'reddit-xpoz' // Plan 30.1-pivot — Xpoz Pro Reddit endpoint (D-32). 2 credits/call ≈ $0.001
  | 'twitter-xpoz' // Plan 30.1-pivot — Xpoz Pro Twitter endpoint (D-35). 2 credits/call ≈ $0.001
  | 'hackernews'; // Plan 30.1 — HackerNews Algolia public search API (free, no auth)

// Per-provider per-call USD cost constants. CITED above. Quarterly review per T-20-Z-03-03.
//   gemini   — 'gemini' provider slot now routes to meta/muse-spark-1.3-contributor via Vercel AI Gateway.
//              Legacy slot name preserved for DB compatibility on historical ProviderCallLog rows.
//              Rates: $0.10/M input, $0.20/M output (see MUSE_TOKEN_RATES below).
//   anthropic-search — https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/web-search-tool ($10/1k = $0.01/call)
//   finbert-hf       — https://huggingface.co/pricing ($0.033/hr CPU, ~330 inferences/hr → ~$0.0001/call)
//   reddit-xpoz      — https://xpoz.ai pricing (Pro plan $16/mo + $0.80/1K overage credits ≈ $0.001/call at 2 credits/call)
//   twitter-xpoz     — same Xpoz Pro plan; same per-call cost.
//   yahoo / polygon / finnhub / stocktwits / apewisdom / reddit / hackernews — free-tier or fixed-monthly ($0 marginal)
export const COST_PER_CALL_USD: Record<ProviderId, number> = {
  'yahoo': 0,
  'polygon': 0,
  'finnhub': 0,
  'anthropic-search': 0.01,
  'stocktwits': 0,
  'gemini': 0, // computed via cost_usd_estimator + MUSE_TOKEN_RATES (slot re-pointed at Muse Spark 1.3 in Sep 2026)
  'finbert-hf': 0.0001,
  'apewisdom': 0,
  'lm-fallback': 0, // in-process bag-of-words; $0 marginal cost (Plan 20-B-06)
  'reddit': 0, // legacy provider_id (historical DB rows from Reddit OAuth era; superseded by reddit-xpoz)
  'reddit-xpoz': 0.001, // Xpoz Pro — 2 credits/call, ~$0.80/1K overage credits → $0.001/call (Plan 30.1-pivot D-32)
  'twitter-xpoz': 0.001, // Xpoz Pro — 2 credits/call, ~$0.80/1K overage credits → $0.001/call (Plan 30.1-pivot D-35)
  'hackernews': 0, // HackerNews Algolia public search — free, no auth. https://hn.algolia.com/api
};

// Sep 2026: swapped from Gemini (google/gemini-2.5-pro at $1.25/M in, $10/M out) to
// Muse Spark 1.3 Contributor (meta/muse-spark-1.3-contributor). Rates are ~1250×/1875×
// lower per token, though Muse is a reasoning model and burns more output tokens per call.
export const MUSE_TOKEN_RATES = {
  input: 0.0000001, // USD per input token  ($0.10/M — meta/muse-spark-1.3-contributor)
  output: 0.0000002, // USD per output token ($0.20/M — meta/muse-spark-1.3-contributor)
} as const;
