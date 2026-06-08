/**
 * Phase 21.1 D-10 — /api/insights/llm-ic-rolling
 *
 * JSON API endpoint serving rolling LLM IC data for the RollingLLMICTile.
 * Wraps getLLMICRolling(windowDays) from engine-context.ts.
 * Accepts `?window=30` (default 30, range 7–90).
 *
 * The tile is server-rendered; this endpoint exists for future client-side
 * refresh or polling by the CI band chart.
 *
 * Auth: none (read-only public metrics dashboard).
 */

import { NextResponse } from 'next/server';
import { getLLMICRolling } from '@/lib/engine-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = parseInt(searchParams.get('window') ?? '30', 10);
  // Clamp to [7, 90] — avoid excessively small or large windows
  const windowDays = Math.max(7, Math.min(90, isNaN(raw) ? 30 : raw));

  try {
    const data = await getLLMICRolling(windowDays);
    return NextResponse.json(data);
  } catch (err) {
    console.error('[/api/insights/llm-ic-rolling] error:', err);
    return NextResponse.json(
      { error: 'Failed to load rolling LLM IC data' },
      { status: 500 },
    );
  }
}
