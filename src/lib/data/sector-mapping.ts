/**
 * Phase 21 — Sector-Relative Outcome Labels
 *
 * Maps a ticker (with optional as-of-date for backfill) to its SPDR sector
 * ETF. Used by /api/cron/relabel and /api/cron/price-followup to compute
 * sector-relative forward returns, replacing alpha-vs-SPY as the primary
 * outcome label.
 *
 * Snapshot discipline: when called from price-followup at outcome creation
 * time, the resolved ETF is persisted to PriceOutcome.sector_etf — never
 * re-resolved later. For backfilled rows, the SECTOR_RECONSTITUTIONS
 * override table protects against sector-reconstitution drift (META moved
 * from XLK to XLC on 2018-09-28).
 *
 * Fallback: any ticker whose Yahoo `quoteSummary.sector` is null,
 * unrecognized, or whose lookup fails returns 'SPY' so the engine still
 * grades the outcome (just against the broad market) rather than throwing.
 *
 * Resolution order in getSectorETF:
 *   1. SECTOR_RECONSTITUTIONS override (if asOfDate provided and ticker has
 *      a historical reclassification entry) — bypasses the cache entirely
 *      because (ticker, asOfDate) is pure-functional.
 *   2. Upstash cache (24h TTL) wrapping yf.quoteSummary → YAHOO_SECTOR_TO_ETF
 *      lookup → SPY on any null / unrecognized / thrown error.
 *
 * Implementation: 21-1-03 (replaces the 21-0-01 stub).
 */

import YahooFinance from 'yahoo-finance2';
import { cached } from '@/lib/data/cache';
import { CACHE_KEYS, TTL_SECONDS } from '@/lib/data/cache/cache-keys';

export type SectorETF =
  | 'XLK'   // Technology Select Sector SPDR
  | 'XLF'   // Financial Select Sector SPDR
  | 'XLE'   // Energy Select Sector SPDR
  | 'XLV'   // Health Care Select Sector SPDR
  | 'XLY'   // Consumer Discretionary Select Sector SPDR
  | 'XLP'   // Consumer Staples Select Sector SPDR
  | 'XLI'   // Industrial Select Sector SPDR
  | 'XLU'   // Utilities Select Sector SPDR
  | 'XLB'   // Materials Select Sector SPDR
  | 'XLRE'  // Real Estate Select Sector SPDR
  | 'XLC'   // Communication Services Select Sector SPDR
  | 'SPY';  // Fallback (no sector data, sentinel for unmapped)

export interface GetSectorETFArgs {
  ticker: string;
  /** For backfill: snapshot the sector as it would have been knowable at this date. Omitted → uses today. */
  asOfDate?: Date;
}

/**
 * Canonical Yahoo-Finance `summaryProfile.sector` string → SPDR sector ETF.
 * 11 entries covering the GICS sectors. Anything else (null / unmapped /
 * Yahoo invents a new string we haven't seen) falls back to 'SPY'.
 */
const YAHOO_SECTOR_TO_ETF: Record<string, SectorETF> = {
  Technology:               'XLK',
  'Financial Services':     'XLF',
  Energy:                   'XLE',
  Healthcare:               'XLV',
  'Consumer Cyclical':      'XLY',
  'Consumer Defensive':     'XLP',
  Industrials:              'XLI',
  Utilities:                'XLU',
  'Basic Materials':        'XLB',
  'Real Estate':            'XLRE',
  'Communication Services': 'XLC',
};

/**
 * Reconstitution override table — handles known historical sector
 * reclassifications so backfilled PriceOutcome rows resolve to the sector
 * ETF that was active at Report.analyzed_at / SentimentSnapshot.scanned_at,
 * not today's classification.
 *
 * Schema: each entry is a chronologically-sorted list of
 * { effective_date, etf } tuples. Lookup: walk the list; the active ETF for
 * `asOfDate` is the entry whose effective_date is the latest one ≤ asOfDate.
 * If asOfDate predates the first entry, use the FIRST entry's ETF
 * (pre-history is treated as "the entry before the cutover").
 *
 * Source: S&P Dow Jones Indices / SPDR Communication Services Select Sector
 * Index — 2018-09-28 GICS reclassification of Telecommunication Services
 * into Communication Services. Reference:
 *   https://www.spglobal.com/spdji/en/documents/index-news-and-announcements/20180920-press-release-gics-changes.pdf
 *
 * Convention used here: the LAST DAY of pre-cutover indexing was 2018-09-28
 * (Friday). XLC indexing began 2018-09-29 (Saturday — but the next trading
 * day was 2018-10-01 Monday). For the purposes of the override:
 *   asOfDate ≤ 2018-09-28  → pre-cutover ETF (XLK or XLY)
 *   asOfDate ≥ 2018-09-29  → XLC
 *
 * To append a future reconstitution: add a new entry below with the
 * (ticker, sorted_timeline) shape and document its source URL in a comment.
 */
const SECTOR_RECONSTITUTIONS: Record<string, Array<{ effective_date: Date; etf: SectorETF }>> = {
  // 2018-09-28 GICS Telecom → Communication Services event. The following
  // tickers moved INTO XLC on 2018-09-29 from their prior XLK or XLY
  // classifications.
  META:  [{ effective_date: new Date('2018-09-28'), etf: 'XLK' }, { effective_date: new Date('2018-09-29'), etf: 'XLC' }],
  GOOGL: [{ effective_date: new Date('2018-09-28'), etf: 'XLK' }, { effective_date: new Date('2018-09-29'), etf: 'XLC' }],
  GOOG:  [{ effective_date: new Date('2018-09-28'), etf: 'XLK' }, { effective_date: new Date('2018-09-29'), etf: 'XLC' }],
  NFLX:  [{ effective_date: new Date('2018-09-28'), etf: 'XLY' }, { effective_date: new Date('2018-09-29'), etf: 'XLC' }],
  DIS:   [{ effective_date: new Date('2018-09-28'), etf: 'XLY' }, { effective_date: new Date('2018-09-29'), etf: 'XLC' }],
  T:     [{ effective_date: new Date('2018-09-28'), etf: 'XLK' }, { effective_date: new Date('2018-09-29'), etf: 'XLC' }], // AT&T
  VZ:    [{ effective_date: new Date('2018-09-28'), etf: 'XLK' }, { effective_date: new Date('2018-09-29'), etf: 'XLC' }],
};

function resolveReconstitutionOverride(ticker: string, asOfDate: Date): SectorETF | null {
  const timeline = SECTOR_RECONSTITUTIONS[ticker];
  if (!timeline || timeline.length === 0) return null;
  // Walk from the END back: return the latest entry whose effective_date ≤ asOfDate.
  // If asOfDate predates the first entry, fall through to the FIRST entry
  // (pre-history baseline).
  for (let i = timeline.length - 1; i >= 0; i--) {
    if (asOfDate.getTime() >= timeline[i].effective_date.getTime()) {
      return timeline[i].etf;
    }
  }
  return timeline[0].etf;
}

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

export async function getSectorETF(args: GetSectorETFArgs): Promise<SectorETF> {
  const ticker = args.ticker.toUpperCase();

  // 1. Reconstitution override (snapshot-at-prediction discipline for backfill).
  if (args.asOfDate) {
    const override = resolveReconstitutionOverride(ticker, args.asOfDate);
    if (override) return override;
  }

  // 2. Cache + Yahoo fallback (today's classification, or tickers without
  //    an override entry).
  return cached<SectorETF>(
    CACHE_KEYS.sectorEtf(ticker),
    async () => {
      try {
        const summary = await yf.quoteSummary(ticker, { modules: ['summaryProfile'] });
        const yahooSector: string | undefined = (summary as { summaryProfile?: { sector?: string } } | undefined)
          ?.summaryProfile?.sector;
        if (!yahooSector) return 'SPY';
        return YAHOO_SECTOR_TO_ETF[yahooSector] ?? 'SPY';
      } catch {
        return 'SPY';
      }
    },
    { ttlSeconds: TTL_SECONDS.sector_etf },
  );
}
