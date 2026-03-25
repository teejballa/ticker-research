// src/app/api/market-snapshot/route.ts
// GET /api/market-snapshot
// Returns live quotes for the landing page market snapshot section.

import { NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';

export const dynamic = 'force-dynamic';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

const SNAPSHOT_TICKERS = ['AAPL', 'MSFT', 'TSLA', 'NVDA', 'GOOGL', 'AMZN', 'META', 'JPM'];

const STATIC_NAMES: Record<string, string> = {
  AAPL:  'Apple Inc.',
  MSFT:  'Microsoft Corp.',
  TSLA:  'Tesla, Inc.',
  NVDA:  'NVIDIA Corp.',
  GOOGL: 'Alphabet Inc.',
  AMZN:  'Amazon.com',
  META:  'Meta Platforms',
  JPM:   'JPMorgan Chase',
};

export async function GET() {
  try {
    const results = await Promise.allSettled(
      SNAPSHOT_TICKERS.map((ticker) => yf.quote(ticker)),
    );

    const items = results.map((result, i) => {
      const sym = SNAPSHOT_TICKERS[i];
      if (result.status === 'rejected' || !result.value) {
        return { sym, name: STATIC_NAMES[sym] ?? sym, price: null, chg: null, up: true };
      }
      const q = result.value;
      const price = q.regularMarketPrice ?? null;
      const changePercent = q.regularMarketChangePercent ?? null;
      const chgFormatted = changePercent != null
        ? `${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%`
        : null;
      return {
        sym,
        name: STATIC_NAMES[sym] ?? q.longName ?? q.shortName ?? sym,
        price: price != null ? price.toFixed(2) : null,
        chg: chgFormatted,
        up: (changePercent ?? 0) >= 0,
      };
    });

    return NextResponse.json({ items, fetched_at: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'market-snapshot failed' },
      { status: 500 },
    );
  }
}
