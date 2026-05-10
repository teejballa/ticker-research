/**
 * Post-Phase-19 P0 — Finnhub structured analyst sentiment.
 *
 * Slots into the new-ladder analyst cascade between Yahoo and Anthropic-search:
 *   exa → yahoo → finnhub → anthropic-search.
 *
 * Key value-add over Yahoo: Finnhub exposes `targetMean` / `targetMedian` on
 * `/stock/price-target`, which Yahoo's `recommendationTrend` does not. So
 * even when Yahoo wins the consensus + analyst_count fields, Finnhub fills
 * `avg_price_target` via the merge pattern (caller is expected to apply
 * shallow object merge — but for now the cascade returns the first non-null
 * AnalystSentimentSection).
 *
 * Three Finnhub endpoints fired in parallel:
 *   - /stock/recommendation     — Buy/Hold/Sell counts month-by-month
 *   - /stock/price-target       — targetMean / High / Low / Median
 *   - /stock/upgrade-downgrade  — chronological upgrade / downgrade feed
 *
 * Returns null when the recommendation endpoint surfaces nothing — without
 * a consensus number the section provides no signal over the next-tier
 * Anthropic search fallback. Price-target and upgrade endpoint failures
 * degrade gracefully (avg_price_target null, recent_changes []).
 */

import type { AnalystSentimentSection, AnalystChange } from '@/lib/types';

const FINNHUB_BASE = 'https://finnhub.io/api/v1';

interface RecommendationCell {
  period?: string;
  strongBuy?: number;
  buy?: number;
  hold?: number;
  sell?: number;
  strongSell?: number;
  symbol?: string;
}

interface PriceTargetResp {
  symbol?: string;
  targetHigh?: number;
  targetLow?: number;
  targetMean?: number;
  targetMedian?: number;
  lastUpdated?: string;
}

interface UpgradeDowngradeRow {
  symbol?: string;
  gradeTime?: number;
  fromGrade?: string;
  toGrade?: string;
  company?: string;
  action?: string;
}

function classifyConsensus(cell: RecommendationCell): 'Buy' | 'Hold' | 'Sell' | null {
  const sb = cell.strongBuy ?? 0;
  const b = cell.buy ?? 0;
  const h = cell.hold ?? 0;
  const s = cell.sell ?? 0;
  const ss = cell.strongSell ?? 0;
  const total = sb + b + h + s + ss;
  if (total === 0) return null;
  const buyish = sb + b;
  const sellish = s + ss;
  if (buyish > h && buyish > sellish) return 'Buy';
  if (sellish > h && sellish > buyish) return 'Sell';
  return 'Hold';
}

function epochToYmd(epochSeconds: number | undefined): string {
  if (typeof epochSeconds !== 'number' || !Number.isFinite(epochSeconds)) return '';
  const d = new Date(epochSeconds * 1000);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Fetch Finnhub structured analyst sentiment via three endpoints in parallel.
 *
 * Returns null on:
 *   - Missing FINNHUB_API_KEY (graceful degrade — same pattern as fetchFinnhub)
 *   - Empty recommendation list (no consensus signal worth surfacing)
 *
 * Network failures on any single endpoint are absorbed — the section still
 * returns whatever fields were available.
 */
export async function fetchFinnhubAnalystSentiment(
  ticker: string,
): Promise<AnalystSentimentSection | null> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return null;

  const symbol = encodeURIComponent(ticker.toUpperCase());
  const auth = `&token=${encodeURIComponent(key)}`;

  const [recRows, priceTarget, upDowns] = await Promise.all([
    getJson<RecommendationCell[]>(`${FINNHUB_BASE}/stock/recommendation?symbol=${symbol}${auth}`),
    getJson<PriceTargetResp>(`${FINNHUB_BASE}/stock/price-target?symbol=${symbol}${auth}`),
    getJson<UpgradeDowngradeRow[]>(`${FINNHUB_BASE}/stock/upgrade-downgrade?symbol=${symbol}${auth}`),
  ]);

  if (!recRows || recRows.length === 0) return null;

  // Most recent month is rows[0] per Finnhub convention. Cell could still be
  // a zero row (e.g. brand-new IPO); classifyConsensus returns null and we
  // surface the section anyway so price-target + recent_changes can still
  // populate downstream prompt fields.
  const cell = recRows[0]!;
  const consensus = classifyConsensus(cell);
  const analyst_count =
    (cell.strongBuy ?? 0) +
    (cell.buy ?? 0) +
    (cell.hold ?? 0) +
    (cell.sell ?? 0) +
    (cell.strongSell ?? 0);

  const avg_price_target =
    typeof priceTarget?.targetMean === 'number'
      ? priceTarget.targetMean
      : typeof priceTarget?.targetMedian === 'number'
        ? priceTarget.targetMedian
        : null;

  const recent_changes: AnalystChange[] = Array.isArray(upDowns)
    ? upDowns.map((row) => ({
        analyst: 'Finnhub',
        firm: row.company ?? '',
        action:
          row.fromGrade && row.toGrade
            ? `${row.fromGrade} → ${row.toGrade}`
            : (row.action ?? '').toString(),
        date: epochToYmd(row.gradeTime),
      }))
    : [];

  return {
    collected_at: new Date().toISOString(),
    consensus,
    avg_price_target,
    analyst_count: analyst_count > 0 ? analyst_count : null,
    recent_changes,
  };
}
