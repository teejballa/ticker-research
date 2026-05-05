// One-shot admin backfill: repair SentimentSnapshot rows whose price_at_scan is 0
// or NULL (legacy cold-start writes from before engine-context.ts started fetching
// the live price). Without a non-zero price_at_scan, the price-followup cron
// permanently skips the row, so the learning engine never sees the outcome.
//
// Strategy: for each broken snapshot, fetch the daily OHLCV close on the
// scanned_at date using yahoo-finance2.chart() and write it back. Skips rows
// that already have a real price.
//
// Auth: Bearer ${CRON_SECRET}, same convention as the scheduled crons.
// Trigger:
//   curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/admin/backfill-snapshot-prices

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import YahooFinance from 'yahoo-finance2';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

async function fetchHistoricalClose(ticker: string, asOf: Date): Promise<number | null> {
  // Walk a 7-day window centered on asOf to handle weekends/holidays. yahoo-finance2
  // chart() requires period1 < period2 and returns daily bars within that range.
  const period1 = new Date(asOf.getTime() - 4 * 24 * 60 * 60 * 1000);
  const period2 = new Date(asOf.getTime() + 3 * 24 * 60 * 60 * 1000);
  try {
    const result = await yf.chart(ticker, { period1, period2, interval: '1d' });
    const bars = (result.quotes ?? [])
      .filter((q): q is typeof q & { close: number } => typeof q.close === 'number' && q.close > 0)
      .sort(
        (a, b) =>
          Math.abs(a.date.getTime() - asOf.getTime()) -
          Math.abs(b.date.getTime() - asOf.getTime()),
      );
    return bars[0]?.close ?? null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const broken = await prisma.sentimentSnapshot.findMany({
    where: { price_at_scan: 0 },
    select: { id: true, ticker: true, scanned_at: true },
    orderBy: { scanned_at: 'desc' },
  });

  const stats = { scanned: broken.length, repaired: 0, no_data: 0, errors: 0 };

  for (const snap of broken) {
    try {
      const price = await fetchHistoricalClose(snap.ticker, snap.scanned_at);
      if (price == null) {
        stats.no_data++;
        continue;
      }
      await prisma.sentimentSnapshot.update({
        where: { id: snap.id },
        data: { price_at_scan: price },
      });
      stats.repaired++;
    } catch {
      stats.errors++;
    }
  }

  return NextResponse.json({ ok: true, ...stats });
}
