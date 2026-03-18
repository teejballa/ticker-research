// src/app/api/research/[ticker]/route.ts
// POST /api/research/[ticker]
// Runs the full data collection pipeline for a confirmed ticker.
// TICK-03: Requires { confirmed: true } in request body — no pipeline without confirmation.
// DATA-08: Calls collectAllData(), writes SourcePackage to temp file, returns file path.

import { NextRequest, NextResponse } from 'next/server';
import { collectAllData } from '@/lib/data/source-package';
import { writeSourcePackage } from '@/lib/temp-file';
import YahooFinance from 'yahoo-finance2';

// Force dynamic evaluation so Vercel reads env vars at request time, not build time.
export const dynamic = 'force-dynamic';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const { ticker } = await params;

  // TICK-03: Require explicit confirmation before running pipeline
  const body = await request.json().catch(() => ({}));
  if (!body.confirmed) {
    return NextResponse.json(
      { error: 'Ticker must be confirmed before research pipeline runs.' },
      { status: 400 },
    );
  }

  if (!ticker || typeof ticker !== 'string') {
    return NextResponse.json({ error: 'Invalid ticker' }, { status: 400 });
  }

  const upperTicker = ticker.toUpperCase();

  try {
    // Resolve company name and exchange for the source package metadata
    let companyName = upperTicker;
    let exchange: string | null = null;
    try {
      const quote = await yf.quote(upperTicker);
      companyName = quote.longName ?? quote.shortName ?? upperTicker;
      exchange = quote.fullExchangeName ?? null;
    } catch {
      // Non-fatal — use ticker as company name if quote lookup fails
    }

    // Run parallel data collection — DATA-08
    const sourcePackage = await collectAllData(upperTicker, companyName, exchange);

    // Write to temp file — never in project directory
    const filePath = await writeSourcePackage(sourcePackage);

    return NextResponse.json({
      ticker: upperTicker,
      assembled_at: sourcePackage.assembled_at,
      filePath,
      collection_errors: sourcePackage.collection_errors,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Pipeline failed' },
      { status: 500 },
    );
  }
}
