// Plan 20-Z-03 — /insights/sentiment-health
//
// Per-provider observability dashboard. Server component, force-dynamic.
// Mirrors src/app/insights/page.tsx pattern: queries Postgres directly via
// dynamic import of @/lib/db so missing DATABASE_URL degrades gracefully
// (renders the empty state).

import NavBar from '@/components/NavBar';
import { ProviderTile } from './components/ProviderTile';
import { CalibrationTile } from './components/CalibrationTile';
import {
  resolveFinBERTClassifierVersion,
  resolveGeminiPerDocClassifierVersion,
} from '@/lib/sentiment/temperature-runtime';

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

interface PageData {
  rows: ProviderRow[];
  /** Plan 20-B-06 — share of NLP-classifier calls that fell to L&M lexicon over last 24h. */
  degradation_rate_24h: number;
}

async function load(): Promise<PageData> {
  if (!process.env.DATABASE_URL) return { rows: [], degradation_rate_24h: 0 };
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
  const mappedRows: ProviderRow[] = rows.map((r) => {
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

  // Plan 20-B-06 — degradation_rate_24h tile. Same SQL as
  // /api/insights/sentiment-health route so JSON + UI agree.
  const degRows = await prisma.$queryRawUnsafe<Array<{ rate: number | null }>>(`
    SELECT
      COUNT(*) FILTER (WHERE provider_id = 'lm-fallback')::float
        / NULLIF(COUNT(*), 0) AS rate
    FROM "provider_call_logs"
    WHERE started_at >= NOW() - INTERVAL '24 hours'
      AND provider_id IN ('finbert-hf', 'lm-fallback')
      AND status = 'ok'
  `);
  const degradation_rate_24h = degRows[0]?.rate ?? 0;

  return { rows: mappedRows, degradation_rate_24h };
}

/**
 * Plan 20-B-06 — degradation_rate_24h tile.
 *
 *   green if rate ≤ 1%
 *   amber if rate ≤ 5%
 *   red   if rate >  5%   (= T-20-B-06-04 cost-budget cron alert threshold)
 */
function DegradationRateTile({ rate }: { rate: number }) {
  const pct = rate * 100;
  const color =
    pct <= 1
      ? 'text-emerald-600 dark:text-emerald-400'
      : pct <= 5
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-red-600 dark:text-red-400';
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 mb-6">
      <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        NLP fallback rate (last 24h)
      </div>
      <div className={`text-4xl font-bold ${color}`} data-testid="degradation-rate-24h">
        {pct.toFixed(1)}%
      </div>
      <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
        L&apos;m-fallback share of (finbert-hf + lm-fallback) successful NLP calls. Alert at &gt; 5%.
      </div>
    </div>
  );
}

export default async function SentimentHealthPage() {
  const { rows, degradation_rate_24h } = await load();
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
        {/* Plan 20-B-06 — degradation_rate_24h tile (T-20-B-06-04 observability). */}
        <DegradationRateTile rate={degradation_rate_24h} />

        {/* Plan 20-B-03 — per-classifier temperature-calibration tiles. */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3">Calibration (Plan 20-B-03)</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <CalibrationTile classifierVersion={resolveFinBERTClassifierVersion()} />
            <CalibrationTile classifierVersion={resolveGeminiPerDocClassifierVersion('v1')} />
          </div>
        </section>

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
