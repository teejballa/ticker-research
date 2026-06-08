/**
 * Phase 21.1 D-28 — /api/insights/baselines
 *
 * JSON API endpoint serving pre-computed baseline comparison data.
 * Wraps getBaselineComparison() from engine-context.ts for client-side
 * consumption. Accepts `?horizon=7` (numeric days: 3 | 7 | 14 | 30).
 *
 * The page itself is server-rendered; this endpoint exists for any
 * future client-side refreshes or external tooling.
 *
 * Auth: none (read-only public metrics dashboard — same as /api/insights).
 */

import { NextResponse } from 'next/server';
import { getBaselineComparison } from '@/lib/engine-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_HORIZONS = new Set([3, 7, 14, 30] as const);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = parseInt(searchParams.get('horizon') ?? '7', 10);
  const horizon = VALID_HORIZONS.has(raw as 3 | 7 | 14 | 30)
    ? (raw as 3 | 7 | 14 | 30)
    : 7;

  try {
    const data = await getBaselineComparison(horizon);
    return NextResponse.json(data);
  } catch (err) {
    console.error('[/api/insights/baselines] error:', err);
    return NextResponse.json(
      { error: 'Failed to load baseline comparison data' },
      { status: 500 },
    );
  }
}
