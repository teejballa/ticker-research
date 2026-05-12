// Plan 20-Z-03 — per-provider tile rendered on /insights/sentiment-health.
// Server component (no 'use client'). Pure presentational.

interface Props {
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

export function ProviderTile(p: Props) {
  const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const fmtUsd = (n: number) => `$${n.toFixed(4)}`;
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 bg-white dark:bg-zinc-900">
      <h3 className="font-semibold text-lg">{p.provider_id}</h3>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        {p.count_24h.toLocaleString()} calls / 24h
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt className="text-zinc-500 dark:text-zinc-400">p50</dt>
        <dd>{p.latency_p50_ms} ms</dd>
        <dt className="text-zinc-500 dark:text-zinc-400">p95</dt>
        <dd>{p.latency_p95_ms} ms</dd>
        <dt className="text-zinc-500 dark:text-zinc-400">p99</dt>
        <dd>{p.latency_p99_ms} ms</dd>
        <dt className="text-zinc-500 dark:text-zinc-400">error</dt>
        <dd>{fmtPct(p.error_rate)}</dd>
        <dt className="text-zinc-500 dark:text-zinc-400">cache hit</dt>
        <dd>{fmtPct(p.cache_hit_rate)}</dd>
        <dt className="text-zinc-500 dark:text-zinc-400">fallback</dt>
        <dd>{fmtPct(p.fallback_rate)}</dd>
        <dt className="text-zinc-500 dark:text-zinc-400">cost / call</dt>
        <dd>{fmtUsd(p.cost_per_call_usd_24h)}</dd>
        <dt className="text-zinc-500 dark:text-zinc-400">cost / 24h</dt>
        <dd>{fmtUsd(p.total_cost_usd_24h)}</dd>
      </dl>
    </div>
  );
}
