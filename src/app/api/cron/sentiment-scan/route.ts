import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getCurrentWatchlist } from '@/lib/data/ticker-watchlist';
import { lightweightCommunityScan } from '@/lib/data/lightweight-community-scan';
import { computeTechnicalSnapshot } from '@/lib/data/technical';
import { fetchInsiderData } from '@/lib/data/insider';
import { fetchInstitutionalData } from '@/lib/data/institutional';
import YahooFinance from 'yahoo-finance2';
import { insertObservation, SentimentObservationDuplicateError } from '@/lib/sentiment/observation-store';
import { createHash } from 'crypto';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results = { scanned: 0, failed: 0, skipped: 0 };

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
      if (price === null) { results.failed++; continue; }

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
        results.failed++;
        continue;
      }

      await prisma.sentimentSnapshot.create({
        data: {
          ticker,
          scanned_at: new Date(),
          price_at_scan: price,
          community_data: (communityData ?? {}) as Prisma.InputJsonValue,
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
      // NOTE: lightweightCommunityScan currently returns EnrichedSnapshot (sentiment
      // dimensions + highlights), not raw StockTwits messages. The shape cast below
      // gracefully handles either future-state — once an upstream returns raw messages
      // (Phase 20-C-01 wires this), this loop starts populating rows without further
      // edits to the cron route.
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

      results.scanned++;

      await new Promise(r => setTimeout(r, 2000));
    } catch {
      results.failed++;
    }
  }

  return NextResponse.json({ ok: true, ...results });
}
