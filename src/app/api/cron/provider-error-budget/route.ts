/**
 * Phase 30 D-17 — Daily provider error-budget alerter.
 *
 * For each provider_id in ProviderCallLog over the last 24h, compute
 * error_rate = SUM(status='error') / COUNT(*). When error_rate > 0.10
 * AND total_count >= 50, INSERT one row into ProviderHealthAlert.
 *
 * Mirrors src/app/api/cron/cost-budget-check/route.ts verbatim — same
 * bearer auth, same insufficient_history short-circuit pattern (with
 * total_calls < 50 instead of days_observed < 7), same alerts[] shape
 * in the JSON response.
 *
 * Idempotency: if an unresolved alert (resolved_at IS NULL) already
 * exists for that provider, do NOT insert a second row. Conversely,
 * when error_rate drops below 0.10, UPDATE the open alert's resolved_at.
 *
 * dominant_error_class is derived from the most-frequent `error_class`
 * value among status='error' rows for that provider in the 24h window
 * (Postgres GROUP BY + COUNT + DISTINCT ON pattern — equivalent to
 * MODE() WITHIN GROUP but portable across Neon Postgres versions).
 *
 * Cron schedule: `15 9 * * *` — between cost-budget-check (09:00) and
 * provider-call-log-retention (09:30). No collision (verified vercel.json).
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ERROR_RATE_THRESHOLD = 0.10;
const MIN_CALLS_FOR_GATE = 50;

interface AlertRow {
  provider_id: string;
  error_rate: number;
  error_count: number;
  total_count: number;
  dominant_error_class: string | null;
  status: 'alert' | 'ok' | 'insufficient_history';
}

export async function GET(request: Request) {
  const auth = request.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Per-provider error_rate over rolling 24h + most-frequent error_class for
  // error rows (the "dominant" classification used for operator triage).
  // Mirrors cost-budget-check's $queryRawUnsafe pattern.
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      provider_id: string;
      total_count: bigint;
      error_count: bigint;
      dominant_error_class: string | null;
    }>
  >(`
    WITH per_provider AS (
      SELECT
        provider_id,
        COUNT(*)::bigint                                         AS total_count,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END)::bigint AS error_count
      FROM "provider_call_logs"
      WHERE started_at >= NOW() - INTERVAL '24 hours'
      GROUP BY provider_id
    ),
    error_class_counts AS (
      SELECT
        provider_id,
        error_class,
        COUNT(*)::bigint AS n
      FROM "provider_call_logs"
      WHERE started_at >= NOW() - INTERVAL '24 hours'
        AND status = 'error'
        AND error_class IS NOT NULL
      GROUP BY provider_id, error_class
    ),
    modes AS (
      SELECT DISTINCT ON (provider_id)
        provider_id,
        error_class AS dominant_error_class
      FROM error_class_counts
      ORDER BY provider_id, n DESC, error_class ASC
    )
    SELECT
      p.provider_id,
      p.total_count,
      p.error_count,
      m.dominant_error_class
    FROM per_provider p
    LEFT JOIN modes m ON p.provider_id = m.provider_id
  `);

  const alerts: AlertRow[] = [];
  const now = new Date();

  for (const r of rows) {
    const total = Number(r.total_count);
    const errors = Number(r.error_count);
    if (total < MIN_CALLS_FOR_GATE) {
      alerts.push({
        provider_id: r.provider_id,
        error_rate: 0,
        error_count: errors,
        total_count: total,
        dominant_error_class: null,
        status: 'insufficient_history',
      });
      continue;
    }
    const rate = total > 0 ? errors / total : 0;
    const breach = rate > ERROR_RATE_THRESHOLD;
    alerts.push({
      provider_id: r.provider_id,
      error_rate: rate,
      error_count: errors,
      total_count: total,
      dominant_error_class: r.dominant_error_class ?? null,
      status: breach ? 'alert' : 'ok',
    });

    if (breach) {
      // Phase 30 D-17 idempotency: skip INSERT if an unresolved alert exists.
      const existing = await prisma.providerHealthAlert.findFirst({
        where: { provider_id: r.provider_id, resolved_at: null },
        select: { id: true },
      });
      if (!existing) {
        await prisma.providerHealthAlert.create({
          data: {
            provider_id: r.provider_id,
            breached_at: now,
            error_rate: rate,
            error_count: errors,
            total_count: total,
            dominant_error_class: r.dominant_error_class ?? null,
          },
        });
        console.warn(
          `[provider-error-budget] ALERT provider=${r.provider_id} ` +
            `error_rate=${rate.toFixed(4)} ` +
            `errors=${errors}/${total} ` +
            `dominant=${r.dominant_error_class ?? 'unknown'}`,
        );
      }
    } else {
      // Phase 30 D-17 resolution: clear any open alert for this provider.
      await prisma.providerHealthAlert.updateMany({
        where: { provider_id: r.provider_id, resolved_at: null },
        data: { resolved_at: now },
      });
    }
  }

  return NextResponse.json({
    generated_at: now.toISOString(),
    error_rate_threshold: ERROR_RATE_THRESHOLD,
    min_calls_for_gate: MIN_CALLS_FOR_GATE,
    alerts,
  });
}
