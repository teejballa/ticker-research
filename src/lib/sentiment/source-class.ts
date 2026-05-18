/**
 * Plan 20-A-03 — Source-class taxonomy for time-decay calibration.
 *
 * Maps every Cipher data source to one of 5 classes. Each class has its own
 * λ in src/lib/sentiment/decay-hyperparameters.ts; tune-decay calibrates
 * one λ per class against forward 7d alpha-vs-SPY.
 *
 * Why per-class λ matters: Tetlock 2007 showed retail chatter mean-reverts
 * within ~5 trading days; analyst notes survive 1-2 weeks; SEC filings
 * carry ~7d-30d signal. A single λ blurs these characteristic time scales.
 */

export type SourceClass = 'retail' | 'news' | 'sec' | 'analyst' | 'social-other';

export type CipherSource =
  | 'stocktwits'
  | 'anthropic-search-news'
  | 'finnhub-analyst'
  | 'sec'
  | 'apewisdom'
  | 'swaggystocks'
  | 'x'
  | 'reddit'       // Plan 30.1 D-15 — Reddit ingestion (via Xpoz Pro) → retail
  | 'twitter'      // Plan 30.1-pivot D-38 — Twitter ingestion (via Xpoz Pro) → retail
  | 'hackernews';  // Plan 30.1 D-16 — HackerNews Algolia search → social-other

export class SourceClassUnknownError extends Error {
  constructor(public readonly source: string) {
    super(
      `Unknown sentiment source "${source}". Add it to CipherSource union ` +
        `and sourceToClass() in src/lib/sentiment/source-class.ts before persisting.`,
    );
    this.name = 'SourceClassUnknownError';
  }
}

export function sourceToClass(source: CipherSource): SourceClass {
  switch (source) {
    case 'stocktwits':
      return 'retail'; // per CONTEXT line 105 mapping
    case 'apewisdom':
      return 'retail'; // retail aggregator over WSB
    case 'swaggystocks':
      return 'retail'; // retail aggregator
    case 'x':
    case 'twitter':
      return 'retail'; // retail microblog (treated as retail until 20-C-03 author-credibility scoring lands)
    case 'anthropic-search-news':
      return 'news'; // per spec
    case 'finnhub-analyst':
      return 'analyst'; // per spec
    case 'sec':
      return 'sec'; // reserved for 20-B SEC fetcher
    case 'reddit':
      return 'retail'; // Plan 30.1 D-15 — Reddit ingestion is retail-tier
    case 'hackernews':
      return 'social-other'; // Plan 30.1 D-16 — HN technical/analytical audience, between retail and analyst
    default: {
      // Exhaustiveness guard — adding a new CipherSource without extending
      // this switch fails compilation here.
      const _exhaustive: never = source;
      throw new SourceClassUnknownError(_exhaustive as unknown as string);
    }
  }
}

/**
 * Runtime-safe variant for non-typed callers (e.g. data coming from DB strings).
 * 20-Z-01's SentimentObservation.source column accepts a SUPERSET of CipherSource
 * (historic strings predate the typed union). This helper maps the legacy
 * strings to the closest class so backfill + tune-decay can iterate over real
 * historical rows without throwing on every legacy row. Unknown strings still
 * throw SourceClassUnknownError (signals upstream bug).
 */
const LEGACY_SOURCE_TO_CLASS: Record<string, SourceClass> = {
  reddit: 'retail',
  news: 'news',
  hackernews: 'social-other', // Plan 30.1 D-16 — historic DB string callers
};

export function sourceToClassUnsafe(source: string): SourceClass {
  const legacy = LEGACY_SOURCE_TO_CLASS[source];
  if (legacy !== undefined) return legacy;
  return sourceToClass(source as CipherSource);
}
