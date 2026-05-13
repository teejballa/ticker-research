// Plan 20-Z-03 — /insights/sentiment-health
//
// Per-provider observability dashboard. Server component, force-dynamic.
// Mirrors src/app/insights/page.tsx pattern: queries Postgres directly via
// dynamic import of @/lib/db so missing DATABASE_URL degrades gracefully
// (renders the empty state).

import NavBar from '@/components/NavBar';
import { ProviderTile } from './components/ProviderTile';

export const metadata = {
  title: 'Provider health',
  description: 'Per-provider latency, cost, and reliability over the last 24 hours.',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

interface ProviderRow {
  provider_id: string;
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

async function load(): Promise<ProviderRow[]> {
  if (!process.env.DATABASE_URL) return [];
  // Dynamic import — same pattern as /insights/page.tsx — keeps @/lib/db
  // (which throws on missing DATABASE_URL) out of static analysis paths.
  const { prisma } = await import('@/lib/db');
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
      COUNT(*)::bigint AS count_24h,
      percentile_cont(0.50) WITHIN GROUP (ORDER BY duration_ms) AS p50,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95,
      percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_ms) AS p99,
      SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END)::bigint AS errors,
      SUM(CASE WHEN cache_hit       THEN 1 ELSE 0 END)::bigint AS cache_hits,
      SUM(CASE WHEN fallback_used   THEN 1 ELSE 0 END)::bigint AS fallbacks,
      SUM(cost_usd) AS total_cost
    FROM "provider_call_logs"
    WHERE started_at >= NOW() - INTERVAL '24 hours'
    GROUP BY provider_id
    ORDER BY provider_id
  `);
  return rows.map((r) => {
    const n = Number(r.count_24h);
    return {
      provider_id: r.provider_id,
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
}

export default async function SentimentHealthPage() {
  const rows = await load();
  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <NavBar />
      <main className="max-w-6xl mx-auto px-6 py-10">
        <h1 className="text-3xl font-bold mb-2">Provider health</h1>
        <p className="text-zinc-500 dark:text-zinc-400 mb-2">
          Latency, error rate, and cost per provider over the last 24 hours.
        </p>
        {/* Plan 20-C-02 — link tile to the Brier calibration dashboard. */}
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-6">
          See also:{' '}
          <a
            href="/insights/calibration"
            className="underline hover:text-zinc-300"
            data-testid="link-to-calibration"
          >
            /insights/calibration
          </a>{' '}
          — weekly Brier + CORP reliability per classifier_version.
        </p>
        {rows.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No telemetry yet. Providers appear here after the first instrumented call.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {rows.map((r) => (
              <ProviderTile key={r.provider_id} {...r} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
