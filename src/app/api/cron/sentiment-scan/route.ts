import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getCurrentWatchlist } from '@/lib/data/ticker-watchlist';
import { lightweightCommunityScan } from '@/lib/data/lightweight-community-scan';
import { computeTechnicalSnapshot } from '@/lib/data/technical';
import { fetchInsiderData } from '@/lib/data/insider';
import { fetchInstitutionalData } from '@/lib/data/institutional';
import YahooFinance from 'yahoo-finance2';

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
      results.scanned++;

      await new Promise(r => setTimeout(r, 2000));
    } catch {
      results.failed++;
    }
  }

  return NextResponse.json({ ok: true, ...results });
}
