/**
 * Plan 20-Z-03 — per-provider USD cost constants.
 *
 * QUARTERLY REVIEW CADENCE (T-20-Z-03-03 mitigation):
 *   - Gemini    — https://ai.google.dev/pricing
 *   - Anthropic — https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/web-search-tool
 *   - Firecrawl — https://www.firecrawl.dev/pricing
 *   - HF        — https://huggingface.co/pricing
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
  | 'firecrawl'
  | 'gemini'
  | 'finbert-hf'
  | 'apewisdom'
  | 'lm-fallback' // Plan 20-B-06 — Loughran-McDonald last-resort fallback (in-process; $0 marginal)
  | 'reddit' // Plan 30.1 — legacy Reddit OAuth provider_id; preserved for DB compatibility on historical rows
  | 'reddit-xpoz' // Plan 30.1-pivot — Xpoz Pro Reddit endpoint (D-32). 2 credits/call ≈ $0.001
  | 'twitter-xpoz' // Plan 30.1-pivot — Xpoz Pro Twitter endpoint (D-35). 2 credits/call ≈ $0.001
  | 'hackernews'; // Plan 30.1 — HackerNews Algolia public search API (free, no auth)

// Per-provider per-call USD cost constants. CITED above. Quarterly review per T-20-Z-03-03.
//   gemini   — https://ai.google.dev/pricing (Gemini 2.5 Flash via Vercel AI Gateway, 2026-Q1)
//   anthropic-search — https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/web-search-tool ($10/1k = $0.01/call)
//   firecrawl        — https://www.firecrawl.dev/pricing ($1/1k pages = $0.001/call)
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
  'firecrawl': 0.001,
  'gemini': 0, // computed via cost_usd_estimator + GEMINI_TOKEN_RATES
  'finbert-hf': 0.0001,
  'apewisdom': 0,
  'lm-fallback': 0, // in-process bag-of-words; $0 marginal cost (Plan 20-B-06)
  'reddit': 0, // legacy provider_id (historical DB rows from Reddit OAuth era; superseded by reddit-xpoz)
  'reddit-xpoz': 0.001, // Xpoz Pro — 2 credits/call, ~$0.80/1K overage credits → $0.001/call (Plan 30.1-pivot D-32)
  'twitter-xpoz': 0.001, // Xpoz Pro — 2 credits/call, ~$0.80/1K overage credits → $0.001/call (Plan 30.1-pivot D-35)
  'hackernews': 0, // HackerNews Algolia public search — free, no auth. https://hn.algolia.com/api
};

export const GEMINI_TOKEN_RATES = {
  input: 0.000125, // USD per input token   (Gemini 2.5 Flash, 2026-Q1)
  output: 0.000375, // USD per output token  (Gemini 2.5 Flash, 2026-Q1)
} as const;
