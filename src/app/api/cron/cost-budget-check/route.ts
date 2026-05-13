/**
 * Plan 20-Z-03 — Daily cost-budget alerter.
 *
 * For each provider with at least 7 days of data, compare today's cost (last 24h)
 * against the rolling-7d MEAN-of-DAILY-COST baseline. Alert when today > 1.5x
 * baseline (CONTEXT.md line 91 — verbatim literal multiplier).
 *
 * T-20-Z-03-04 mitigation: short-circuits with status='insufficient_history'
 * for providers with <7 days of observations to prevent cold-start alert spam.
 *
 * Auth: same Bearer CRON_SECRET pattern as sentiment-scan / learn / price-followup.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface AlertRow {
  provider_id: string;
  today_cost_usd: number;
  baseline_7d_mean_usd: number;
  ratio: number;
  status: 'alert' | 'ok' | 'insufficient_history';
  days_observed: number;
}

export async function GET(request: Request) {
  const auth = request.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Per-provider: today's total cost + last-7-day daily mean (excluding today).
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      provider_id: string;
      today_cost: number | null;
      baseline_mean: number | null;
      days_observed: bigint;
    }>
  >(`
    WITH per_day AS (
      SELECT provider_id, DATE_TRUNC('day', started_at) AS day, SUM(cost_usd) AS day_cost
      FROM "provider_call_logs"
      WHERE started_at >= NOW() - INTERVAL '8 days'
      GROUP BY provider_id, DATE_TRUNC('day', started_at)
    ),
    today AS (
      SELECT provider_id, SUM(cost_usd) AS today_cost
      FROM "provider_call_logs"
      WHERE started_at >= NOW() - INTERVAL '24 hours'
      GROUP BY provider_id
    ),
    baseline AS (
      SELECT provider_id,
             AVG(day_cost) AS baseline_mean,
             COUNT(DISTINCT day)::bigint AS days_observed
      FROM per_day
      WHERE day < DATE_TRUNC('day', NOW())
      GROUP BY provider_id
    )
    SELECT
      COALESCE(t.provider_id, b.provider_id) AS provider_id,
      t.today_cost,
      b.baseline_mean,
      COALESCE(b.days_observed, 0::bigint) AS days_observed
    FROM today t
    FULL OUTER JOIN baseline b ON t.provider_id = b.provider_id
  `);

  const alerts: AlertRow[] = [];
  for (const r of rows) {
    const today = r.today_cost ?? 0;
    const baseline = r.baseline_mean ?? 0;
    const days = Number(r.days_observed);
    if (days < 7) {
      alerts.push({
        provider_id: r.provider_id,
        today_cost_usd: today,
        baseline_7d_mean_usd: baseline,
        ratio: 0,
        status: 'insufficient_history',
        days_observed: days,
      });
      continue;
    }
    const ratio = baseline > 0 ? today / baseline : 0;
    alerts.push({
      provider_id: r.provider_id,
      today_cost_usd: today,
      baseline_7d_mean_usd: baseline,
      ratio,
      status: ratio > 1.5 ? 'alert' : 'ok',
      days_observed: days,
    });
  }

  // Log to console — Vercel Functions logs surface these automatically.
  // Future plan can graduate to email/slack via env-var hook.
  for (const a of alerts) {
    if (a.status === 'alert') {
      console.warn(
        `[cost-budget-check] ALERT provider=${a.provider_id} ` +
          `today=$${a.today_cost_usd.toFixed(4)} ` +
          `baseline=$${a.baseline_7d_mean_usd.toFixed(4)} ` +
          `ratio=${a.ratio.toFixed(2)}x`,
      );
    }
  }

  // Plan 20-B-06 T-20-B-06-04 — degradation_alert block.
  // Sustained NLP fallback rate > 5% over last 24h indicates upstream system
  // breakage (HF endpoint outage, @xenova OOM). Denominator restricted to
  // NLP-classifier providers so quiet days for other providers don't dilute.
  const degradationResult = await prisma.$queryRawUnsafe<
    Array<{ rate: number | null; total: bigint | number; lm: bigint | number }>
  >(`
    SELECT
      COUNT(*) FILTER (WHERE provider_id = 'lm-fallback')::float
        / NULLIF(COUNT(*), 0) AS rate,
      COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE provider_id = 'lm-fallback')::bigint AS lm
    FROM "provider_call_logs"
    WHERE started_at >= NOW() - INTERVAL '24 hours'
      AND provider_id IN ('finbert-hf', 'lm-fallback')
      AND status = 'ok'
  `);
  const DEGRADATION_THRESHOLD = 0.05; // CONTEXT.md spec — 5%
  const degradationRate = degradationResult[0]?.rate ?? 0;
  let degradationAlert:
    | {
        type: 'degradation_alert';
        message: string;
        severity: 'warning';
        rate: number;
        threshold: number;
      }
    | null = null;
  if (degradationRate > DEGRADATION_THRESHOLD) {
    const msg =
      `NLP fallback rate ${(degradationRate * 100).toFixed(1)}% exceeds ` +
      `${(DEGRADATION_THRESHOLD * 100).toFixed(0)}% threshold over last 24h. ` +
      `Check /insights/sentiment-health for failing upstream (HF endpoint, @xenova).`;
    degradationAlert = {
      type: 'degradation_alert',
      message: msg,
      severity: 'warning',
      rate: degradationRate,
      threshold: DEGRADATION_THRESHOLD,
    };
    console.warn(`[cost-budget-check] degradation_alert ${msg}`);
  }

  return NextResponse.json({
    generated_at: new Date().toISOString(),
    threshold_multiplier: 1.5,
    alerts,
    degradation_alert: degradationAlert,
  });
}
