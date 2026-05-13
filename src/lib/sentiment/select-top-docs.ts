// src/lib/sentiment/select-top-docs.ts
// Plan 20-B-01 — top-N doc selector for the per-doc classifier (cost defense T-20-B-01-02).
//
// Hard caps: 20 news + 10 community = 30 docs/ticker. Constants are documented in
// HYPERPARAMETERS.md under "20-B-01: Gemini per-document sentiment classifier".
//
// SourcePackage shape today (Phase 19):
//   - pkg.news.items: NewsItem[] = { headline, url, published_date, source }
//     (recency from published_date; no relevance score yet — recency-only sort).
//   - pkg.sentiment_intelligence.* — aggregate metrics, NOT raw community text.
//     Community-doc text isn't on SourcePackage today; it lives in the
//     CommunityChatter DB table (20-Z-02 D-48). To stay graceful, this selector
//     accepts an OPTIONAL `pkg._raw_community_docs` shim — callers wiring 20-Z-01
//     community persistence can populate it; the v1 path is news-only.
//
// Deterministic doc_id derivation:
//   - news:      sha256(url).slice(0,16)
//   - community: `${source}:${message_id}`
// IDs feed into SentimentObservation.message_id — must be stable across reruns
// so the (ticker, message_id, model_version) composite unique stays meaningful.

import { createHash } from 'crypto';
import type { SourcePackage, NewsItem } from '@/lib/types';
import type { PerDocInput } from './per-doc-classifier';

export const TOP_NEWS = 20;
export const TOP_COMMUNITY = 10;
export const COST_CAP_DOCS_PER_TICKER = TOP_NEWS + TOP_COMMUNITY; // 30
export const MAX_TEXT_CHARS = 2000;

/** Optional shim — community text is not on the canonical SourcePackage shape today.
 *  Callers persisting CommunityChatter rows may pass docs here; the selector
 *  applies the same recency/upvotes ranking the spec calls for. */
export interface RawCommunityDoc {
  message_id: string;
  body: string;
  source?: string; // 'reddit' | 'x' | 'stocktwits' | etc.
  upvotes?: number | null;
  fetched_at?: string | Date | null;
}

/** Accept the canonical SourcePackage; additionally read a sidecar `_raw_community_docs`
 *  property if the caller attaches one (kept off the type contract so we don't break
 *  every existing call site that builds SourcePackage). */
type SourcePackageWithCommunity = SourcePackage & {
  _raw_community_docs?: RawCommunityDoc[];
};

function newsTextOf(n: NewsItem): string {
  // Today's NewsItem doesn't carry a summary — use the headline. When future
  // plans add `summary`, prefer it over the headline. Bounded by MAX_TEXT_CHARS.
  const text = ((n as NewsItem & { summary?: string }).summary ?? n.headline ?? '').toString();
  return text.slice(0, MAX_TEXT_CHARS);
}

function parseDateMs(d: string | Date | null | undefined): number {
  if (!d) return 0;
  const ms = d instanceof Date ? d.getTime() : Date.parse(d);
  return Number.isFinite(ms) ? ms : 0;
}

function pickTopNews(items: NewsItem[]): PerDocInput[] {
  const filtered = items.filter((n) => !!n.url && !!(n.headline || (n as NewsItem & { summary?: string }).summary));
  // Stable recency-DESC sort. Equal-date items keep their input order (relevance proxy).
  const sorted = filtered
    .map((n, idx) => ({ n, idx, ts: parseDateMs(n.published_date) }))
    .sort((a, b) => (b.ts - a.ts) || (a.idx - b.idx))
    .slice(0, TOP_NEWS);
  return sorted.map(({ n }) => ({
    doc_id: createHash('sha256').update(n.url).digest('hex').slice(0, 16),
    text: newsTextOf(n),
    source: 'news',
  }));
}

function pickTopCommunity(docs: RawCommunityDoc[]): PerDocInput[] {
  const filtered = docs.filter((d) => !!d.message_id && !!d.body);
  const sorted = filtered
    .map((d, idx) => ({ d, idx, up: d.upvotes ?? 0, ts: parseDateMs(d.fetched_at) }))
    .sort((a, b) => (b.up - a.up) || (b.ts - a.ts) || (a.idx - b.idx))
    .slice(0, TOP_COMMUNITY);
  return sorted.map(({ d }) => ({
    doc_id: `${d.source ?? 'community'}:${d.message_id}`,
    text: d.body.slice(0, MAX_TEXT_CHARS),
    source: 'community',
  }));
}

/**
 * Select the top-N docs per source class for per-doc classification.
 *  - Top 20 news (recency DESC; input-order tie-break)
 *  - Top 10 community (upvotes DESC, then recency DESC; input-order tie-break)
 *  - Hard cap 30 total (T-20-B-01-02 cost defense)
 *
 * Returns [] when the package carries no news AND no community docs. Graceful
 * when SourcePackage.news is absent (e.g., partial fetch failure).
 */
export function selectTopDocs(pkg: SourcePackage): PerDocInput[] {
  const withCommunity = pkg as SourcePackageWithCommunity;
  const newsItems = pkg?.news?.items ?? [];
  const commDocs = withCommunity._raw_community_docs ?? [];
  const news = pickTopNews(newsItems);
  const community = pickTopCommunity(commDocs);
  return [...news, ...community];
}
