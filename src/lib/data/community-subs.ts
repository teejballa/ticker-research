/**
 * Phase 30.1 — Subreddit roster for community-scan ingestion (D-10, D-11).
 *
 * Plan 30.1-pivot (D-33) — trimmed from 16 to 10 entries. The 6 dropped
 * (dividends, FinancialIndependence, Vitards, pennystocks, biotech_stocks,
 * Bogleheads) overlapped heavily with the surviving mainstream/middle subs
 * and contributed noise rather than signal under Xpoz Pro's credit-metered
 * pricing.
 *
 * The per-ticker niche sub `r/{TICKER}` (D-11) is NOT in this config —
 * it is computed at orchestrator time in lightweight-community-scan.ts
 * (plan 30.1-03) so a roster edit doesn't touch ticker-specific logic.
 *
 * Tier definitions:
 *   mainstream — large subs covering the full equity universe (highest volume, lowest precision)
 *   middle     — methodology-focused subs (value/quant/dividends/passive)
 *   niche      — narrow-audience subs (cyclicals, meme, biotech, micro-cap)
 *
 * Adding a sub is a 1-line config edit; no adapter changes required.
 */

export interface CommunitySubConfig {
  readonly name: string;                                         // bare sub name; no leading r/
  readonly community_type: 'mainstream' | 'middle' | 'niche';
  readonly audience: string;
  readonly theme: string;
}

export const COMMUNITY_SUBS: readonly CommunitySubConfig[] = [
  { name: 'wallstreetbets',       community_type: 'mainstream', audience: 'retail momentum traders',   theme: 'meme + options momentum' },
  { name: 'stocks',               community_type: 'mainstream', audience: 'general retail',             theme: 'general discussion' },
  { name: 'investing',            community_type: 'mainstream', audience: 'general retail (long-term)', theme: 'buy-and-hold + portfolio' },
  { name: 'StockMarket',          community_type: 'mainstream', audience: 'general retail',             theme: 'macro + sectors' },
  { name: 'options',              community_type: 'mainstream', audience: 'options-focused retail',     theme: 'volatility + IV plays' },
  { name: 'Daytrading',           community_type: 'mainstream', audience: 'short-horizon retail',       theme: 'intraday + swing setups' },
  { name: 'SecurityAnalysis',     community_type: 'middle',     audience: 'value/fundamentals analysts',theme: 'DCF + intrinsic value' },
  { name: 'algotrading',          community_type: 'middle',     audience: 'quant/systematic traders',   theme: 'systematic + quant' },
  { name: 'ValueInvesting',       community_type: 'middle',     audience: 'value-focused',              theme: 'Buffett-school deep value' },
  { name: 'Superstonk',           community_type: 'niche',      audience: 'meme-stock',                 theme: 'GME-adjacent' },
] as const;
