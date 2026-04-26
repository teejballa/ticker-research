import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import YahooFinance from 'yahoo-finance2';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
const TARGET_DAYS = [3, 7, 14] as const;

function ageInDays(date: Date): number {
  return (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
}

async function fetchPrice(ticker: string): Promise<number | null> {
  try {
    const quote = await yf.quote(ticker);
    return typeof quote.regularMarketPrice === 'number' ? quote.regularMarketPrice : null;
  } catch { return null; }
}

export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results = { outcomes_recorded: 0, skipped: 0, failed: 0 };
  const windowMs = 15 * 24 * 60 * 60 * 1000;
  const minAgeMs = 2 * 24 * 60 * 60 * 1000;

  const reports = await prisma.report.findMany({
    where: { price_at_report: { not: null }, analyzed_at: { gte: new Date(Date.now() - windowMs), lte: new Date(Date.now() - minAgeMs) } },
    include: { outcomes: true },
  });

  for (const report of reports) {
    const age = ageInDays(report.analyzed_at);
    for (const day of TARGET_DAYS) {
      if (Math.abs(age - day) > 0.6) continue;
      if (report.outcomes.some(o => o.days_after === day)) { results.skipped++; continue; }
      const price = await fetchPrice(report.ticker);
      if (!price || !report.price_at_report) { results.failed++; continue; }
      await prisma.priceOutcome.create({
        data: {
          report_id: report.id,
          days_after: day,
          price,
          pct_change: ((price - report.price_at_report) / report.price_at_report) * 100,
          recorded_at: new Date(),
        },
      });
      results.outcomes_recorded++;
    }
  }

  const snapshots = await prisma.sentimentSnapshot.findMany({
    where: { scanned_at: { gte: new Date(Date.now() - windowMs), lte: new Date(Date.now() - minAgeMs) } },
    include: { outcomes: true },
  });

  for (const snap of snapshots) {
    const age = ageInDays(snap.scanned_at);
    for (const day of [3, 7] as const) {
      if (Math.abs(age - day) > 0.6) continue;
      if (snap.outcomes.some(o => o.days_after === day)) { results.skipped++; continue; }
      const price = await fetchPrice(snap.ticker);
      if (!price) { results.failed++; continue; }
      await prisma.priceOutcome.create({
        data: {
          snapshot_id: snap.id,
          days_after: day,
          price,
          pct_change: ((price - snap.price_at_scan) / snap.price_at_scan) * 100,
          recorded_at: new Date(),
        },
      });
      results.outcomes_recorded++;
    }
  }

  return NextResponse.json({ ok: true, ...results });
}
