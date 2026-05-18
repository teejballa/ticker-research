// src/app/api/sectors/route.ts
// GET /api/sectors
// Live data for the landing-page "Coverage map" sector grid. For each sector
// we fetch the lead ticker's quote so the tile can show a live delta. Mirrors
// the pattern in market-snapshot/route.ts.

import { NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';

export const dynamic = 'force-dynamic';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

interface SectorDef {
  label: string;
  hex: string;
  glyph: string;
  tickers: string[]; // first entry is the lead ticker
}

const SECTORS: SectorDef[] = [
  { label: 'Semiconductors',  hex: '#1B27A0', glyph: 'Σ', tickers: ['NVDA', 'AMD', 'TSM'] },
  { label: 'Consumer Tech',   hex: '#D97757', glyph: '↗', tickers: ['AAPL', 'SONY', 'DELL'] },
  { label: 'Enterprise SaaS', hex: '#0F8A5B', glyph: '▲', tickers: ['MSFT', 'CRM', 'NOW'] },
  { label: 'Energy',          hex: '#C76B2E', glyph: '◐', tickers: ['XOM', 'CVX', 'BP'] },
  { label: 'Biotech',         hex: '#7A5AE0', glyph: 'α', tickers: ['LLY', 'REGN', 'VRTX'] },
  { label: 'Banking',         hex: '#3D5C8E', glyph: '$', tickers: ['JPM', 'BAC', 'C'] },
];

export async function GET() {
  try {
    const results = await Promise.allSettled(
      SECTORS.map((s) => yf.quote(s.tickers[0])),
    );

    const sectors = SECTORS.map((s, i) => {
      const result = results[i];
      let leadChange: number | null = null;
      if (result.status === 'fulfilled' && result.value) {
        const pct = result.value.regularMarketChangePercent;
        if (typeof pct === 'number' && Number.isFinite(pct)) leadChange = pct;
      }
      return { ...s, leadChange };
    });

    return NextResponse.json({ sectors, fetched_at: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'sectors failed' },
      { status: 500 },
    );
  }
}
