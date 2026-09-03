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

    // Filter by quoteType (stable uppercase constant) — typeDisp casing changed in Yahoo's API
    const equities = searchResult.quotes
      .filter(
        (r) => r.isYahooFinance === true && 'quoteType' in r && r.quoteType === 'EQUITY'
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

    return NextResponse.json(results, {
      // Symbol search results for a given query are stable; cache at the edge
      // so repeated/typeahead queries don't re-hit Yahoo each keystroke.
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=86400' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Search failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
