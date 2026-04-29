import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getCurrentWatchlist } from '@/lib/data/ticker-watchlist';
import { lightweightCommunityScan } from '@/lib/data/lightweight-community-scan';
import { computeTechnicalSnapshot } from '@/lib/data/technical';
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

      // Phase 16-03: parallelize community + technical sensors so the new
      // technical fetch adds 0 wall-clock time vs the existing community scan
      // (Pitfall 6 — RESEARCH §8 lines 932-937). Both are best-effort: each
      // returns null on failure rather than throwing.
      const [communityData, technicalData] = await Promise.all([
        lightweightCommunityScan(ticker),
        computeTechnicalSnapshot(ticker),
      ]);
      if (!communityData && !technicalData) { results.failed++; continue; }

      await prisma.sentimentSnapshot.create({
        data: {
          ticker,
          scanned_at: new Date(),
          price_at_scan: price,
          community_data: (communityData ?? {}) as Prisma.InputJsonValue,        // Json column is non-null at the schema level; coerce a missing scan to {}
          technical_data: technicalData
            ? (technicalData as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,                                                    // nullable Json column on the schema
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
