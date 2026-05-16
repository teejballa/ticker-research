import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getCurrentWatchlist } from '@/lib/data/ticker-watchlist';
import { lightweightCommunityScan } from '@/lib/data/lightweight-community-scan';
// Phase 30 D-12 — classify breaker-tripped fetches as soft skips, not errors.
import { BreakerOpenError } from '@/lib/data/circuit-breaker';
import { computeTechnicalSnapshot } from '@/lib/data/technical';
import { fetchInsiderData } from '@/lib/data/insider';
import { fetchInstitutionalData } from '@/lib/data/institutional';
import YahooFinance from 'yahoo-finance2';
import { insertObservation, SentimentObservationDuplicateError } from '@/lib/sentiment/observation-store';
import { computeCrowdedConsensus } from '@/lib/sentiment/aggregator';
import { cresciBotScore, type CresciReason } from '@/lib/sentiment/bot-filter';
import { detectCoordinatedPosting, COORDINATION_SIMILARITY } from '@/lib/sentiment/coordination';
import { runPerMessagePass, type PerMessagePassMode } from '@/lib/sentiment/per-message-pass';
// Plan 30.1-04 (D-15 / D-16 / D-17) — Reddit + HN observation writers wired in
// after the existing StockTwits writer block. Both writers honor the Crons-never-500
// invariant (every error caught + logged-and-continued) and PIT discipline
// (fetched_at = upstream-claimed creation timestamp). Type-only import of
// EnrichedSnapshot keeps the cron's runtime surface unchanged.
import {
  writeRedditObservations,
  writeHackerNewsObservations,
} from '@/lib/sentiment/community-observation-writers';
import type { EnrichedSnapshot } from '@/lib/data/lightweight-community-scan';
import { createHash } from 'crypto';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Phase 30 D-13 — per-batch counters surfaced for done-gate inputs.
  // `failed` was renamed to `skipped_no_data` (semantic preservation: ticker
  // had no usable upstream data) and `errors` was added for genuine throws.
  // BreakerOpenError increments its own bucket so a tripped breaker isn't
  // miscounted as a server error.
  const results = {
    scanned: 0,
    skipped_no_data: 0,      // ticker had no usable upstream data (was `failed`)
    skipped_breaker_open: 0, // Phase 30 D-12 — any sensor breaker was open
    skipped: 0,              // already-scanned-recently path
    errors: 0,               // top-level try/catch increments (was `failed++` in catch)
  };

  const tickers = getCurrentWatchlist();
  for (const ticker of tickers) {
    try {
      const recent = await prisma.sentimentSnapshot.findFirst({
        where: { ticker, scanned_at: { gte: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) } },
      });
      if (recent) { results.skipped++; continue; }

      let price: number | null = null;
      try {
        const quote = await yf.quote(ticker);
        price = typeof quote.regularMarketPrice === 'number' ? quote.regularMarketPrice : null;
      } catch { /* skip */ }
      if (price === null) { results.skipped_no_data++; continue; }

      // Phase 17-03: extends Phase 16's parallel sensor pattern from 2 → 4.
      // All 4 fetchers are best-effort: each returns null on failure; we
      // only fail the snapshot if ALL 4 return null. (D-19 empty-data policy
      // + D-20 cadence — both new fetches happen on every scan.)
      const [communityData, technicalData, insiderData, institutionalData] = await Promise.all([
        lightweightCommunityScan(ticker),
        computeTechnicalSnapshot(ticker),
        fetchInsiderData(ticker),
        fetchInstitutionalData(ticker),
      ]);
      if (!communityData && !technicalData && !insiderData && !institutionalData) {
        results.skipped_no_data++;
        continue;
      }

      // ── Plan 20-A-01 — compute crowded_consensus (off / shadow / on) ──
      // Off mode: function short-circuits; flag/features are undefined.
      // Shadow mode: flag is persisted into community_aggregated.crowded_consensus_shadow
      // JSONB key below (additive — community_data is already Json?).
      // On mode: also flows through the per-request analysis path via SentimentIntelligenceSection.
      const cc = await computeCrowdedConsensus({
        components: [],                    // populated once cross-source mention counts wired in 20-A-05
        messageTagCounts: { bull: 0, bear: 0, neutral: 0 }, // populated when 20-B-01 tags each message
        messagesByAuthor: new Map(),       // populated when 20-A-04 emits the rolling window
        observations: [],                  // forward-ref for 20-A-02's mentionZ
      });
      console.log('[crowded_consensus]', ticker, cc.mode, cc.flag);

      const communityDataBase = (communityData ?? {}) as Record<string, unknown>;
      const communityDataWithShadow: Record<string, unknown> =
        cc.mode === 'shadow' && cc.flag !== undefined
          ? {
              ...communityDataBase,
              crowded_consensus_shadow: {
                flag: cc.flag,
                features: cc.features,
                computed_at: new Date().toISOString(),
                mode: cc.mode,
              },
            }
          : communityDataBase;

      await prisma.sentimentSnapshot.create({
        data: {
          ticker,
          scanned_at: new Date(),
          price_at_scan: price,
          community_data: communityDataWithShadow as Prisma.InputJsonValue,
          technical_data: technicalData
            ? (technicalData as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          insider_data: insiderData
            ? (insiderData as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          institutional_data: institutionalData
            ? (institutionalData as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        },
      });

      // Plan 20-Z-01 — write per-message SentimentObservation rows in PARALLEL with the
      // SentimentSnapshot above. This is the PIT-immutable row-level grain that
      // 20-A-03 (time decay), 20-B-01 (per-doc NLP), 20-B-04 (source-tier weight),
      // and 20-C-01 (per-source ICIR) will join on. Failure here is logged-and-continued —
      // it MUST NOT block the snapshot writer that serves current readers.
      //
      // Plan 20-Z-04 follow-up (2026-05-13) — lightweightCommunityScan now returns
      // `stocktwits.messages: StockTwitsRawMessage[]` via fetchStockTwitsRaw(). The
      // optional-chained cast below is kept defensive so the route still no-ops if
      // a future caller (or test fixture) hands in a snapshot without the field.
      const stocktwitsMessages =
        (communityData as { stocktwits?: { messages?: Array<{ id?: string | number; body?: string; created_at?: string; user?: { username?: string; followers?: number; ideas?: number; created_at?: string; identity?: string } }> } } | null | undefined)
          ?.stocktwits?.messages ?? [];

      const MODEL_VERSION_BOOTSTRAP = 'stocktwits-tag-v1';      // initial classifier version; backfills bump this
      const CLASSIFIER_VERSION_BOOTSTRAP = 'stocktwits-tag-v1'; // same as model_version for the initial write

      let obs_written = 0;
      let obs_dupes = 0;
      let obs_errors = 0;
      for (const m of stocktwitsMessages) {
        if (!m.id || !m.body) continue;
        const handle = m.user?.username ?? 'anonymous';
        const author_id = createHash('sha256').update(`stocktwits:${handle}`, 'utf8').digest('hex');
        const account_age_days = m.user?.created_at
          ? Math.max(0, Math.floor((Date.now() - new Date(m.user.created_at).getTime()) / 86_400_000))
          : null;
        try {
          await insertObservation({
            ticker,
            source: 'stocktwits',
            message_id: String(m.id),
            raw_body: m.body,                          // hashed inside the DAO; never persisted raw
            classifier_version: CLASSIFIER_VERSION_BOOTSTRAP,
            classifier_score: null,                    // bootstrap row — Phase 20-B-01 fills this in via a new model_version
            model_version: MODEL_VERSION_BOOTSTRAP,
            decay_weight: null,                        // populated by 20-A-03 via new model_version
            author_id,
            author_features_snapshot: {
              account_age_days,
              follower_count: m.user?.followers ?? null,
              is_verified: m.user?.identity ? m.user.identity === 'Official' : null,
              message_count_30d: m.user?.ideas ?? null,
            },
            // LOOKAHEAD-OK: cron writer passes upstream-claimed StockTwits timestamp into the DAO; the DAO writes it to an informational-only schema column carrying // PIT-INVARIANT. No backtest join uses it. The PIT key is fetched_at (defaulted by Prisma).
            published_at: m.created_at ? new Date(m.created_at) : null,
            // fetched_at omitted — DB defaults to now() (PIT-INVARIANT)
          });
          obs_written++;
        } catch (e) {
          if (e instanceof SentimentObservationDuplicateError) {
            obs_dupes++;                               // expected on re-scan of the same ticker within the dedupe window
          } else {
            obs_errors++;                              // logged-and-continued; does NOT fail the cron
          }
        }
      }
      // (We attach the counters to the route response below for telemetry; 20-Z-03 will
      // graduate this to ProviderCallLog.)
      (results as Record<string, number>)[`obs_written_${ticker}`] = obs_written;
      (results as Record<string, number>)[`obs_dupes_${ticker}`]   = obs_dupes;
      (results as Record<string, number>)[`obs_errors_${ticker}`]  = obs_errors;

      // ── Phase 30.1-04 (D-15) — Reddit posts → SentimentObservation PIT feature store ──
      // The orchestrator surfaces communityData.reddit_posts only on the
      // 'reddit'/'shadow' branch of FEATURES.community_scan_source. On the
      // 'firecrawl' branch it's undefined and the writer is a no-op.
      // The writer:
      //  - hashes raw Reddit usernames via SHA-256(pepper + lowercased author)
      //    so PII never persists (T-30.1-04-02) and Phase 20-C-03 Cresci
      //    clustering sees deterministic author IDs across rescans.
      //  - sets fetched_at = post.created_utc*1000 (LOOKAHEAD-OK inside the
      //    helper — backtest joins in Phase 20-C-02 use fetched_at as the
      //    PIT key per CLAUDE.md §Statistical-Methods Reference rule #6).
      //  - catches every error per the Crons-never-500 invariant; duplicate
      //    errors increment reddit_obs_dupes_${ticker}, all others increment
      //    reddit_obs_errors_${ticker} and log a console.warn.
      const _enriched = communityData as EnrichedSnapshot | null;
      await writeRedditObservations(
        ticker,
        _enriched?.reddit_posts,
        results as Record<string, number>,
      );

      // ── Phase 30.1-04 (D-16) — HackerNews stories → SentimentObservation PIT feature store ──
      // Mirrors the Reddit writer above. fetched_at = story.created_at_i*1000.
      await writeHackerNewsObservations(
        ticker,
        _enriched?.hackernews_stories,
        results as Record<string, number>,
      );

      // Plan 20-C-03 — per-author Cresci scoring + aggregate-level coordinated-posting detection.
      // Persistence ALWAYS runs (off|shadow|on); the consumer-side weight gate in
      // src/lib/sentiment/aggregator.ts is what graduates via FEATURE_BOT_FILTER.
      // Failures here are logged-and-continued — they MUST NOT block the snapshot
      // path that serves current readers.
      try {
        const byAuthor = new Map<
          string,
          { messages: string[]; hashtag_counts: number[]; account_age_days: number | null }
        >();
        for (const m of stocktwitsMessages) {
          if (!m.id || !m.body) continue;
          const handle = m.user?.username ?? 'anonymous';
          const author_id = createHash('sha256').update(`stocktwits:${handle}`, 'utf8').digest('hex');
          const account_age_days = m.user?.created_at
            ? Math.max(0, Math.floor((Date.now() - new Date(m.user.created_at).getTime()) / 86_400_000))
            : null;
          const hashtag_count = (m.body.match(/#[A-Za-z0-9_]+/g) ?? []).length;
          const entry = byAuthor.get(author_id) ?? {
            messages: [],
            hashtag_counts: [],
            account_age_days,
          };
          entry.messages.push(m.body);
          entry.hashtag_counts.push(hashtag_count);
          entry.account_age_days = account_age_days;
          byAuthor.set(author_id, entry);
        }

        let authors_flagged = 0;
        for (const [author_id, data] of byAuthor) {
          const result = cresciBotScore({
            account_age_days: data.account_age_days ?? 9999, // null treated as "old enough"
            messages: data.messages,
            hashtag_counts: data.hashtag_counts,
          });
          try {
            await prisma.botFilterFlag.create({
              data: {
                author_id,
                ticker,
                // computed_at defaults to now() — PIT-INVARIANT
                account_age_days: data.account_age_days,
                max_text_cosine_similarity: result.features.max_text_cosine_similarity,
                pump_phrase_density: result.features.pump_phrase_density,
                hashtag_count_max: result.features.hashtag_count_max,
                is_bot_flagged: result.is_bot,
                bot_reason: result.reason as CresciReason,
              },
            });
            if (result.is_bot) authors_flagged++;
          } catch {
            // logged-and-continued — does NOT fail the cron tick
          }
        }

        // Aggregate-level coordinated-posting detection on the 24h message bag.
        const now = new Date();
        const window_start = new Date(now.getTime() - 24 * 3600 * 1000);
        const window_end = now;
        const cluster = detectCoordinatedPosting(
          ticker,
          window_start,
          window_end,
          stocktwitsMessages
            .filter((m): m is { id: string | number; body: string } => !!m.id && !!m.body)
            .map((m) => ({ id: String(m.id), text: m.body })),
        );
        if (cluster) {
          try {
            await prisma.coordinationCluster.create({
              data: {
                ticker: cluster.ticker,
                window_start: cluster.window_start,
                window_end: cluster.window_end,
                n_messages: cluster.n_messages,
                similarity_threshold: cluster.similarity_threshold,
                cluster_size: cluster.cluster_size,
                is_flagged: cluster.is_flagged,
                member_ids: cluster.member_ids,
              },
            });
          } catch {
            // logged-and-continued
          }
        }

        (results as Record<string, number>)[`authors_flagged_${ticker}`] = authors_flagged;
        (results as Record<string, number>)[`coord_cluster_${ticker}`] = cluster?.cluster_size ?? 0;
        void COORDINATION_SIMILARITY; // referenced for grep traceability
      } catch {
        // outer catch — never block the snapshot path
      }

      // Plan 20-B-02 — per-message FinBERT pass when message_volume > 50.
      // Gated by PER_MESSAGE_PASS_MODE env (off | shadow | on). Each classification
      // persists as a SentimentObservation row (20-Z-01) with classifier_version
      // 'finbert-prosus-{sha8}'. Consumer reads land in 20-A-03 / 20-B-04.
      // Failure mode is logged-and-continue — must NOT block the snapshot path.
      const perMessageMode = (process.env.PER_MESSAGE_PASS_MODE ?? 'off') as PerMessagePassMode;
      if (perMessageMode !== 'off' && stocktwitsMessages.length > 50) {
        try {
          const pmResult = await runPerMessagePass({
            ticker,
            messages: stocktwitsMessages
              .filter((m): m is typeof m & { id: string | number; body: string } => !!m.id && !!m.body)
              .map((m) => {
                const handle = m.user?.username ?? 'anonymous';
                const account_age_days = m.user?.created_at
                  ? Math.max(0, Math.floor((Date.now() - new Date(m.user.created_at).getTime()) / 86_400_000))
                  : null;
                return {
                  message_id: String(m.id),
                  body: m.body,
                  author_handle: handle,
                  // LOOKAHEAD-OK: passthrough of upstream-claimed StockTwits timestamp into PerMessagePassInput; the 20-Z-01 DAO writes it to an informational-only schema column (// PIT-INVARIANT marker on prisma/schema.prisma forbids backtest joins). The PIT join key is fetched_at, defaulted by Prisma.
                  published_at: m.created_at ? new Date(m.created_at) : null,
                  author_features: {
                    account_age_days,
                    follower_count: m.user?.followers ?? null,
                    is_verified: m.user?.identity ? m.user.identity === 'Official' : null,
                    message_count_30d: m.user?.ideas ?? null,
                  },
                };
              }),
          }, perMessageMode);
          console.log(`[cron:sentiment-scan] per-message pass for ${ticker}:`, pmResult);
          (results as Record<string, number>)[`pm_primary_${ticker}`] = pmResult.primary_path_count;
          (results as Record<string, number>)[`pm_secondary_${ticker}`] = pmResult.secondary_path_count;
          (results as Record<string, number>)[`pm_tertiary_${ticker}`] = pmResult.tertiary_path_count;
          (results as Record<string, number>)[`pm_capped_${ticker}`] = pmResult.cost_capped_count;
        } catch (err) {
          console.error(`[cron:sentiment-scan] per-message pass failed for ${ticker}:`, err);
        }
      }

      results.scanned++;

      await new Promise(r => setTimeout(r, 2000));
    } catch (err) {
      // Phase 30 D-12 / D-13 — classify BreakerOpenError as a soft skip
      // (not an error) so a tripped breaker doesn't inflate the errors
      // counter. Every other throw counts as an error and gets logged.
      if (err instanceof BreakerOpenError) {
        results.skipped_breaker_open++;
      } else {
        results.errors++;
        console.warn('[sentiment-scan] ticker error', { err: String(err) });
      }
    }
  }

  // Phase 30 D-13 — structured summary line for done-gate alerting.
  console.log(
    `[sentiment-scan] scanned=${results.scanned} ` +
      `skipped_no_data=${results.skipped_no_data} ` +
      `skipped_breaker_open=${results.skipped_breaker_open} ` +
      `skipped=${results.skipped} ` +
      `errors=${results.errors}`,
  );

  return NextResponse.json({ ok: true, ...results });
}
