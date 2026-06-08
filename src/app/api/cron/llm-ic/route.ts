/**
 * Phase 21.1 CORE-ML-20 — /api/cron/llm-ic
 *
 * Daily cron at 09:30 UTC (after baseline-eval at 09:00 UTC).
 * For each Report in the last 60 days, computes the LLM's confidence-weighted
 * directional score per D-08 and inserts one LLMEvaluation row per horizon
 * (7d / 14d / 30d). On subsequent runs, resolves forward_return from
 * PriceOutcome when the horizon has elapsed and writes brier_buy_prob.
 *
 * D-08 scoring:
 *   s ∈ [-1, +1]  where  Buy → +buy_pct/100, Sell → -sell_pct/100, Hold → 0
 *   (D-09: score every prediction; no confidence filter)
 *
 * D-10: the rolling 30d IC tile on /insights reads from LLMEvaluation rows
 * via engine-context.ts getLLMICRolling(30).
 *
 * Auth: Bearer ${CRON_SECRET} (same as all other /api/cron/* routes).
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const HORIZONS = [7, 14, 30] as const;
const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;

/**
 * Map the LLM's assessment percentages to a directional score s ∈ [-1, +1].
 * Per D-08: s = buy_pct/100 - sell_pct/100  (net directional confidence).
 * Hold% is captured by the gap (buy - sell → 0 when symmetric).
 *
 * For confidence_level string ('Low'|'Medium'|'High'), we convert to pct:
 *   Low=33%, Medium=66%, High=85% — but the analysis JSON's buy_pct/sell_pct
 *   fields are the authoritative source. We prefer those.
 */
function extractSignedScore(analysisJson: unknown): number | null {
  if (typeof analysisJson !== 'object' || analysisJson === null) return null;
  const a = analysisJson as Record<string, unknown>;

  // Prefer structured assessment.buy_pct / sell_pct from the Zod schema
  const assessment = a['assessment'] as Record<string, unknown> | undefined;
  if (assessment && typeof assessment['buy_pct'] === 'number' && typeof assessment['sell_pct'] === 'number') {
    // s = (buy - sell) / 100  clamped to [-1, +1]
    const s = (assessment['buy_pct'] - assessment['sell_pct']) / 100;
    return Math.max(-1, Math.min(1, s));
  }

  // Fallback: confidence_level string + market_sentiment direction
  const sentiment = typeof a['market_sentiment'] === 'string' ? a['market_sentiment'].toLowerCase() : '';
  const confidenceLevel = typeof a['confidence_level'] === 'string' ? a['confidence_level'] : 'Low';
  const confMap: Record<string, number> = { Low: 0.33, Medium: 0.66, High: 0.85 };
  const conf = confMap[confidenceLevel] ?? 0.33;
  if (sentiment.includes('bullish')) return conf;
  if (sentiment.includes('bearish')) return -conf;
  return 0;
}

export async function GET(request: Request) {
  // Bearer auth — STRIDE T-21.1-05-01: spoofing mitigation
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const startedAt = Date.now();
  console.log('[cron:llm-ic] starting');

  // ── Step A: Insert new LLMEvaluation rows for recent reports ──────────
  const since = new Date(Date.now() - SIXTY_DAYS_MS);
  const recentReports = await prisma.report.findMany({
    where: { analyzed_at: { gte: since } },
    select: {
      id: true,
      ticker: true,
      analyzed_at: true,
      analysis: true,
      market_sentiment: true,
      confidence_level: true,
    },
  });

  let n_new_predictions = 0;

  for (const report of recentReports) {
    const s = extractSignedScore(report.analysis);
    if (s === null) continue;

    for (const h of HORIZONS) {
      // Idempotency guard: check for existing row before inserting
      const existing = await prisma.lLMEvaluation.findFirst({
        where: { report_id: report.id, horizon_days: h },
        select: { id: true },
      });
      if (existing) continue;

      await prisma.lLMEvaluation.create({
        data: {
          ticker: report.ticker,
          report_id: report.id,
          horizon_days: h,
          ll_signed_score: s,
          ic_contribution: s,   // persisted for rolling-IC aggregation in engine-context.ts
          is_resolved: false,
        },
      });
      n_new_predictions++;
    }
  }

  // ── Step B: Resolve forward_return + brier_buy_prob for elapsed rows ──
  const unresolvedRows = await prisma.lLMEvaluation.findMany({
    where: { is_resolved: false },
    select: {
      id: true,
      ticker: true,
      report_id: true,
      recorded_at: true,
      horizon_days: true,
      ll_signed_score: true,
    },
  });

  let n_resolved = 0;

  for (const ev of unresolvedRows) {
    const horizonMs = ev.horizon_days * 24 * 60 * 60 * 1000;
    if (Date.now() - ev.recorded_at.getTime() < horizonMs) continue; // horizon not elapsed yet

    // Look up the matching PriceOutcome
    const outcome = ev.report_id
      ? await prisma.priceOutcome.findFirst({
          where: {
            report_id: ev.report_id,
            days_after: ev.horizon_days,
          },
          select: {
            forward_return_sector_rel: true,
            pct_change: true,
            is_sigma_hit_k1: true,
          },
        })
      : null;

    if (!outcome) continue; // PriceOutcome not yet written — price-followup cron handles this

    const fwd = outcome.forward_return_sector_rel ?? outcome.pct_change;
    const hit = outcome.is_sigma_hit_k1;

    // Buy-probability from signed score: p_buy = (s + 1) / 2 maps [-1,+1] → [0,1]
    const p_buy = (ev.ll_signed_score + 1) / 2;
    const brier_buy_prob = hit != null ? (p_buy - (hit ? 1 : 0)) ** 2 : null;

    await prisma.lLMEvaluation.update({
      where: { id: ev.id },
      data: {
        forward_return: fwd,
        brier_buy_prob,
        is_resolved: true,
      },
    });
    n_resolved++;
  }

  const n_total_active = await prisma.lLMEvaluation.count({ where: { is_resolved: true } });

  const ms = Date.now() - startedAt;
  console.log('[cron:llm-ic] complete', { ms, n_new_predictions, n_resolved, n_total_active });

  return NextResponse.json({ ok: true, n_new_predictions, n_resolved, n_total_active });
}
