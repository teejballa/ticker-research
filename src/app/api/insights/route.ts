import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import type { SentimentDimensions } from '@/lib/sentiment-dimensions';

export const dynamic = 'force-dynamic';

interface DataPoint {
  ticker: string;
  diffusion_gap: number;
  direction: number;
  quality: number;
  quantity: number;
  tier_breakdown: SentimentDimensions['tier_breakdown'];
  price_change_3d: number | null;
  price_change_7d: number | null;
  source: 'report' | 'snapshot';
  recorded_at: string;
}

function correlationScore(points: DataPoint[], signalFn: (d: DataPoint) => boolean) {
  const ws = points.filter(d => signalFn(d) && d.price_change_7d !== null);
  if (ws.length === 0) return { signal_positive_pct: 0, avg_7d_return: 0, sample_size: 0 };
  const positive = ws.filter(d => (d.price_change_7d ?? 0) > 0);
  const avg = ws.reduce((s, d) => s + (d.price_change_7d ?? 0), 0) / ws.length;
  return {
    signal_positive_pct: Math.round((positive.length / ws.length) * 100),
    avg_7d_return: Math.round(avg * 10) / 10,
    sample_size: ws.length,
  };
}

export async function GET() {
  try {
    const [reports, snapshots] = await Promise.all([
      prisma.report.findMany({
        where: { price_at_report: { not: null } },
        include: { outcomes: true },
        orderBy: { analyzed_at: 'desc' },
        take: 500,
      }),
      prisma.sentimentSnapshot.findMany({
        include: { outcomes: true },
        orderBy: { scanned_at: 'desc' },
        take: 1000,
      }),
    ]);

    const dataPoints: DataPoint[] = [];

    for (const r of reports) {
      if (!r.community_data) continue;
      const dims = r.community_data as unknown as SentimentDimensions;
      dataPoints.push({
        ticker: r.ticker,
        diffusion_gap: dims.diffusion_gap,
        direction: dims.direction,
        quality: dims.quality,
        quantity: dims.quantity,
        tier_breakdown: dims.tier_breakdown,
        price_change_3d: r.outcomes.find(o => o.days_after === 3)?.pct_change ?? null,
        price_change_7d: r.outcomes.find(o => o.days_after === 7)?.pct_change ?? null,
        source: 'report',
        recorded_at: r.analyzed_at.toISOString(),
      });
    }

    for (const s of snapshots) {
      const dims = s.community_data as unknown as SentimentDimensions;
      dataPoints.push({
        ticker: s.ticker,
        diffusion_gap: dims.diffusion_gap,
        direction: dims.direction,
        quality: dims.quality,
        quantity: dims.quantity,
        tier_breakdown: dims.tier_breakdown,
        price_change_3d: s.outcomes.find(o => o.days_after === 3)?.pct_change ?? null,
        price_change_7d: s.outcomes.find(o => o.days_after === 7)?.pct_change ?? null,
        source: 'snapshot',
        recorded_at: s.scanned_at.toISOString(),
      });
    }

    const resolved = dataPoints.filter(d => d.price_change_7d !== null);
    const highGap = resolved.filter(d => d.diffusion_gap > 2);
    const highGapBullish = highGap.filter(d => d.direction > 0.6 && (d.price_change_7d ?? 0) > 3);
    const thesisPct = highGap.length > 0 ? Math.round((highGapBullish.length / highGap.length) * 100) : null;

    const diffusionSignals = dataPoints
      .filter(d => d.diffusion_gap > 2.5 && d.price_change_7d === null)
      .sort((a, b) => b.diffusion_gap - a.diffusion_gap)
      .slice(0, 10);

    return NextResponse.json({
      total_data_points: dataPoints.length,
      resolved_outcomes: resolved.length,
      thesis: {
        statement: thesisPct !== null
          ? `In ${highGap.length} resolved data points where niche activity exceeded mainstream (diffusion gap >2x), ${thesisPct}% showed >3% price gain within 7 days.`
          : 'Accumulating data — thesis will appear once outcomes resolve (3–7 days after first scans).',
        high_gap_resolved: highGap.length,
        pct: thesisPct,
      },
      diffusion_signals: diffusionSignals,
      outcome_log: resolved.slice(0, 50),
      signal_correlation: {
        diffusion_gap: correlationScore(resolved, d => d.diffusion_gap > 2),
        direction: correlationScore(resolved, d => d.direction > 0.6),
        quality: correlationScore(resolved, d => d.quality > 0.5),
        quantity: correlationScore(resolved, d => d.quantity > 10),
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Insights query failed' }, { status: 500 });
  }
}
