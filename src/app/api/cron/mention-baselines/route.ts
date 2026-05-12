/**
 * Plan 20-A-02 — Nightly cron: recompute per-ticker mention-volume baselines.
 *
 * Schedule: '30 4 * * *' (04:30 UTC daily — well before NY market open).
 * Auth: CRON_SECRET Bearer header (project convention).
 *
 * Invokes scripts/recompute-mention-baselines.ts:computeBaselinesForAllTickers,
 * which iterates active (ticker, source_class) pairs over the trailing 90d of
 * SentimentObservation, computes median + MAD on daily counts (PIT-safe
 * fetched_at joins per S2 / 20-Z-07), and inserts MentionBaseline rows.
 *
 * Wall-clock budget: < 8 min (50% headroom on CONTEXT.md's 5-min cron budget).
 */
import { NextResponse } from 'next/server';
import { computeBaselinesForAllTickers } from '@/../scripts/recompute-mention-baselines';

export const dynamic = 'force-dynamic';
export const maxDuration = 480; // 8 min — matches plan's wall-clock ceiling

export async function GET(request: Request) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  const result = await computeBaselinesForAllTickers();
  return NextResponse.json(result, { status: 200 });
}
