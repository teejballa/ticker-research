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
  | 'apewisdom';

// Per-provider per-call USD cost constants. CITED above. Quarterly review per T-20-Z-03-03.
//   gemini   — https://ai.google.dev/pricing (Gemini 2.5 Flash via Vercel AI Gateway, 2026-Q1)
//   anthropic-search — https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/web-search-tool ($10/1k = $0.01/call)
//   firecrawl        — https://www.firecrawl.dev/pricing ($1/1k pages = $0.001/call)
//   finbert-hf       — https://huggingface.co/pricing ($0.033/hr CPU, ~330 inferences/hr → ~$0.0001/call)
//   yahoo / polygon / finnhub / stocktwits / apewisdom — free-tier or fixed-monthly ($0 marginal)
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
};

export const GEMINI_TOKEN_RATES = {
  input: 0.000125, // USD per input token   (Gemini 2.5 Flash, 2026-Q1)
  output: 0.000375, // USD per output token  (Gemini 2.5 Flash, 2026-Q1)
} as const;
