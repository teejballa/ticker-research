import { NextRequest, NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';
import type { ChartDataPoint } from '@/lib/types';

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

export interface ChartRouteResponse {
  points: ChartDataPoint[];
  companyName: string;
  currentPrice: number | null;
  percentChange: number | null;
  marketCap: number | null;
  exchange: string | null;
  sector: string | null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');

  if (!symbol || symbol.trim().length === 0) {
    return NextResponse.json({ error: 'Missing required query parameter: symbol' }, { status: 400 });
  }

  const ticker = symbol.trim().toUpperCase();

  try {
    const period1 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const period2 = new Date();

    const [chartResult, summaryResult] = await Promise.all([
      yahooFinance.chart(ticker, { period1, period2, interval: '1d' }),
      yahooFinance.quoteSummary(ticker, { modules: ['price', 'summaryProfile'] }),
    ]);

    const points: ChartDataPoint[] = (chartResult.quotes ?? [])
      .filter((q) => q.close != null)
      .map((q) => ({
        time: q.date.toISOString().split('T')[0],
        value: q.close as number,
      }));

    const priceData = summaryResult.price;
    const profileData = summaryResult.summaryProfile;

    const companyName =
      priceData?.longName ?? priceData?.shortName ?? ticker;
    const currentPrice = priceData?.regularMarketPrice ?? null;
    const percentChange = priceData?.regularMarketChangePercent ?? null;
    const marketCap = priceData?.marketCap ?? null;
    const exchange = priceData?.exchangeName ?? null;
    const sector =
      (profileData && 'sector' in profileData ? profileData.sector : null) ?? null;

    const response: ChartRouteResponse = {
      points,
      companyName,
      currentPrice,
      percentChange,
      marketCap,
      exchange,
      sector,
    };

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ticker not found';
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
