/**
 * Plan 20-Z-03 — /api/insights/sentiment-health
 *
 * JSON endpoint computing per-provider stats over the last 24h from
 * provider_call_logs. Uses Postgres percentile_cont via $queryRawUnsafe —
 * Prisma has no native percentile aggregator.
 *
 * Response shape pinned in 20-Z-03-PLAN.md <interfaces> SentimentHealthResponse.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import type { ProviderId } from '@/lib/telemetry/cost-estimators';

export const dynamic = 'force-dynamic';

interface ProviderHealthRow {
  provider_id: ProviderId;
  count_24h: number;
  latency_p50_ms: number;
  latency_p95_ms: number;
  latency_p99_ms: number;
  error_rate: number;
  cache_hit_rate: number;
  fallback_rate: number;
  total_cost_usd_24h: number;
  cost_per_call_usd_24h: number;
}

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({
      generated_at: new Date().toISOString(),
      window_hours: 24,
      providers: [],
    });
  }

  // Raw SQL — Prisma does not expose percentile_cont natively.
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      provider_id: string;
      count_24h: bigint;
      p50: number | null;
      p95: number | null;
      p99: number | null;
      errors: bigint;
      cache_hits: bigint;
      fallbacks: bigint;
      total_cost: number | null;
    }>
  >(`
    SELECT
      provider_id,
      COUNT(*)::bigint                                                AS count_24h,
      percentile_cont(0.50) WITHIN GROUP (ORDER BY duration_ms)       AS p50,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)       AS p95,
      percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_ms)       AS p99,
      SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END)::bigint       AS errors,
      SUM(CASE WHEN cache_hit          THEN 1 ELSE 0 END)::bigint     AS cache_hits,
      SUM(CASE WHEN fallback_used      THEN 1 ELSE 0 END)::bigint     AS fallbacks,
      SUM(cost_usd)                                                   AS total_cost
    FROM "provider_call_logs"
    WHERE started_at >= NOW() - INTERVAL '24 hours'
    GROUP BY provider_id
    ORDER BY provider_id
  `);

  const providers: ProviderHealthRow[] = rows.map((r) => {
    const n = Number(r.count_24h);
    return {
      provider_id: r.provider_id as ProviderId,
      count_24h: n,
      latency_p50_ms: Math.round(r.p50 ?? 0),
      latency_p95_ms: Math.round(r.p95 ?? 0),
      latency_p99_ms: Math.round(r.p99 ?? 0),
      error_rate: n > 0 ? Number(r.errors) / n : 0,
      cache_hit_rate: n > 0 ? Number(r.cache_hits) / n : 0,
      fallback_rate: n > 0 ? Number(r.fallbacks) / n : 0,
      total_cost_usd_24h: r.total_cost ?? 0,
      cost_per_call_usd_24h: n > 0 ? (r.total_cost ?? 0) / n : 0,
    };
  });

  return NextResponse.json({
    generated_at: new Date().toISOString(),
    window_hours: 24,
    providers,
  });
}
