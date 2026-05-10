/**
 * Post-Phase-19 P0 — Yahoo `recommendationTrend` + `upgradeDowngradeHistory`
 * as a free, structured analyst-sentiment source.
 *
 * Slots into the new-ladder analyst cascade as:
 *   exa → yahoo-analyst → finnhub-analyst → anthropic-search.fetchAnalystSentiment
 *
 * Free, no key, no rate-limit risk — pulled via the `yahoo-finance2` SDK from
 * the same `quoteSummary` endpoint already used by `fetchFundamentals`.
 *
 * Returns `AnalystSentimentSection | null` so the merge ladder can use the
 * `??` cascade pattern that 19-B-06 already established for Exa news.
 *
 * Returns null on:
 *   - Network / SDK failure
 *   - Missing `recommendationTrend` module on the response
 *
 * `avg_price_target` is ALWAYS null here — Yahoo's `recommendationTrend` does
 * not surface price targets. The Finnhub layer (`fetchFinnhubAnalystSentiment`)
 * fills that in via `/stock/price-target`. The merge precedence in the cascade
 * means Yahoo's null does not overwrite Finnhub's value.
 */

import YahooFinance from 'yahoo-finance2';
import type { AnalystSentimentSection, AnalystChange } from '@/lib/types';

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

interface RecommendationTrendCell {
  period?: string;
  strongBuy?: number;
  buy?: number;
  hold?: number;
  sell?: number;
  strongSell?: number;
}

interface UpgradeDowngradeRow {
  firm?: string;
  toGrade?: string;
  fromGrade?: string;
  action?: string;
  epochGradeDate?: number;
}

interface QuoteSummaryShape {
  recommendationTrend?: { trend?: RecommendationTrendCell[] };
  upgradeDowngradeHistory?: { history?: UpgradeDowngradeRow[] };
}

/**
 * Maps a recommendationTrend cell → 'Buy' | 'Hold' | 'Sell' | null.
 *   - null when total cell counts are zero (no analysts cover this name)
 *   - 'Buy'  when (strongBuy + buy)   > (hold) AND > (sell + strongSell)
 *   - 'Sell' when (sell + strongSell) > (hold) AND > (strongBuy + buy)
 *   - 'Hold' otherwise
 */
function classifyConsensus(cell: RecommendationTrendCell): 'Buy' | 'Hold' | 'Sell' | null {
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

function mapHistoryRow(row: UpgradeDowngradeRow): AnalystChange {
  const from = row.fromGrade ?? '';
  const to = row.toGrade ?? '';
  const action =
    from && to
      ? `${from} → ${to}`
      : (row.action ?? '').trim();
  return {
    analyst: 'Yahoo',
    firm: row.firm ?? '',
    action,
    date: epochToYmd(row.epochGradeDate),
  };
}

/**
 * Fetch Yahoo's analyst module pair via `quoteSummary`. Returns null on any
 * failure or when the `recommendationTrend` module is absent.
 *
 * Note: Yahoo's `recommendationTrend.trend[0]` is the current month; `[1]` is
 * the prior month, etc. We classify off `[0]` only (the live read).
 */
export async function fetchYahooAnalystSentiment(
  ticker: string,
): Promise<AnalystSentimentSection | null> {
  let summary: QuoteSummaryShape;
  try {
    summary = (await yahooFinance.quoteSummary(ticker, {
      modules: ['recommendationTrend', 'upgradeDowngradeHistory'],
    })) as unknown as QuoteSummaryShape;
  } catch {
    return null;
  }

  const trend = summary.recommendationTrend?.trend;
  if (!Array.isArray(trend) || trend.length === 0) return null;

  const cell = trend[0]!;
  const consensus = classifyConsensus(cell);
  const analyst_count =
    (cell.strongBuy ?? 0) +
    (cell.buy ?? 0) +
    (cell.hold ?? 0) +
    (cell.sell ?? 0) +
    (cell.strongSell ?? 0);

  const history = summary.upgradeDowngradeHistory?.history ?? [];
  const recent_changes: AnalystChange[] = Array.isArray(history)
    ? history.map(mapHistoryRow)
    : [];

  return {
    collected_at: new Date().toISOString(),
    consensus,
    avg_price_target: null,
    analyst_count: analyst_count > 0 ? analyst_count : null,
    recent_changes,
  };
}
