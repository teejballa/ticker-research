import { NextRequest, NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';
import type { TickerSearchResult } from '@/lib/types';

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');

  if (!q || q.trim().length === 0) {
    return NextResponse.json({ error: 'Missing required query parameter: q' }, { status: 400 });
  }

  try {
    const searchResult = await yahooFinance.search(q.trim());

    // yahoo-finance2 v3: typeDisp is lowercase ('equity', not 'Equity')
    const equities = searchResult.quotes
      .filter(
        (r) => r.isYahooFinance === true && 'typeDisp' in r && r.typeDisp === 'equity'
      )
      .slice(0, 8);

    // Fetch current price for each equity
    const results: TickerSearchResult[] = await Promise.all(
      equities.map(async (r) => {
        const symbol = r.symbol;
        let currentPrice: number | null = null;

        try {
          const quote = await yahooFinance.quote(symbol);
          currentPrice = quote.regularMarketPrice ?? null;
        } catch {
          // Price fetch is best-effort — don't fail the whole search
        }

        return {
          symbol,
          shortname: 'shortname' in r ? (r.shortname ?? null) : null,
          longname: 'longname' in r ? (r.longname ?? null) : null,
          exchDisp: 'exchDisp' in r ? (r.exchDisp ?? null) : null,
          typeDisp: 'typeDisp' in r ? (r.typeDisp ?? null) : null,
          currentPrice,
        };
      })
    );

    return NextResponse.json(results);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Search failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
