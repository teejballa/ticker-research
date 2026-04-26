import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { WATCHLIST_TICKERS } from '@/lib/data/ticker-watchlist';
import { lightweightCommunityScan } from '@/lib/data/lightweight-community-scan';
import YahooFinance from 'yahoo-finance2';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results = { scanned: 0, failed: 0, skipped: 0 };

  for (const ticker of WATCHLIST_TICKERS) {
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

      const communityData = await lightweightCommunityScan(ticker);
      if (!communityData) { results.failed++; continue; }

      await prisma.sentimentSnapshot.create({
        data: { ticker, scanned_at: new Date(), price_at_scan: price, community_data: communityData as object },
      });
      results.scanned++;

      await new Promise(r => setTimeout(r, 2000));
    } catch {
      results.failed++;
    }
  }

  return NextResponse.json({ ok: true, ...results });
}
