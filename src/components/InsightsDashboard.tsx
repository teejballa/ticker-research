'use client';

import { useEffect, useState } from 'react';

interface InsightsData {
  total_data_points: number;
  resolved_outcomes: number;
  thesis: { statement: string; high_gap_resolved: number; pct: number | null };
  diffusion_signals: Array<{
    ticker: string;
    diffusion_gap: number;
    direction: number;
    tier_breakdown: { mainstream: number; middle: number; niche: number };
    recorded_at: string;
  }>;
  outcome_log: Array<{
    ticker: string;
    diffusion_gap: number;
    direction: number;
    price_change_3d: number | null;
    price_change_7d: number | null;
    recorded_at: string;
  }>;
  signal_correlation: Record<
    string,
    { signal_positive_pct: number; avg_7d_return: number; sample_size: number }
  >;
}

const SIGNAL_LABELS: Record<string, string> = {
  diffusion_gap: 'Diffusion Gap',
  direction: 'Direction',
  quality: 'Quality',
  quantity: 'Quantity',
};

const SIGNAL_DESCRIPTIONS: Record<string, string> = {
  diffusion_gap: 'Niche-vs-mainstream activity ratio',
  direction: 'Bullish weighting across communities',
  quality: 'Analytical-tier engagement share',
  quantity: 'Total cross-community volume',
};

function formatPct(n: number | null): string {
  if (n == null) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

function directionLabel(d: number): { label: string; tone: 'bull' | 'bear' | 'neutral' } {
  if (d > 0.6) return { label: 'BULLISH', tone: 'bull' };
  if (d < 0.4) return { label: 'BEARISH', tone: 'bear' };
  return { label: 'NEUTRAL', tone: 'neutral' };
}

export function InsightsDashboard() {
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<Date>(new Date());

  useEffect(() => {
    fetch('/api/insights')
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => { setError('Failed to load insights'); setLoading(false); });
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="border border-outline-variant/30 bg-surface-container-low/40 p-12 text-center">
          <div className="text-[10px] tracking-[0.4em] text-outline uppercase font-mono mb-3">
            Initializing Research Layer
          </div>
          <div className="text-on-surface-variant text-sm font-mono animate-pulse">
            Loading sentiment cohort data…
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="border border-error/30 bg-error/5 p-6 text-error text-sm font-mono">
          {error ?? 'No data available'}
        </div>
      </div>
    );
  }

  const utcStamp = now.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

  return (
    <div className="max-w-7xl mx-auto px-6 pb-24">
      {/* ─────────────────────── Header ─────────────────────── */}
      <header className="border-b border-outline-variant/30 pb-6 mb-10">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
          <div className="flex items-center gap-3">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-secondary opacity-60" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-secondary" />
            </span>
            <span className="text-[10px] tracking-[0.4em] text-secondary font-mono uppercase font-bold">
              Engine Live
            </span>
          </div>
          <div className="flex items-center gap-4 text-[10px] tracking-[0.3em] text-outline font-mono uppercase">
            <span>Cycle 3D · Watchlist 26</span>
            <span className="hidden sm:inline">{utcStamp}</span>
          </div>
        </div>

        <div className="flex items-end justify-between flex-wrap gap-6">
          <div>
            <div className="text-[10px] tracking-[0.4em] text-primary/60 font-mono uppercase mb-2">
              Cipher Research Layer · v1.0
            </div>
            <h1 className="text-4xl md:text-5xl font-black text-on-surface tracking-tight leading-[0.95]">
              Behavioral Sentiment
              <span className="block text-primary">Diffusion Study</span>
            </h1>
            <p className="text-on-surface-variant text-sm max-w-2xl mt-4 leading-relaxed">
              Cipher continuously tracks investor discussion across niche, middle, and mainstream
              communities — then verifies which sentiment signals actually preceded price movement.
              This page is the live evidence base.
            </p>
          </div>

          <a
            href="https://github.com/teejballa/ticker-research"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden md:flex items-center gap-2 text-[10px] tracking-[0.3em] text-outline hover:text-primary transition-colors font-mono uppercase border-l border-outline-variant/30 pl-4"
          >
            Methodology
            <span className="material-symbols-outlined text-sm">arrow_outward</span>
          </a>
        </div>
      </header>

      {/* ─────────────────────── Stat strip ─────────────────────── */}
      <section
        className="grid grid-cols-2 md:grid-cols-4 gap-px bg-outline-variant/30 border border-outline-variant/30 mb-12 overflow-hidden"
        aria-label="Top-line research statistics"
      >
        <Stat
          label="Data Points"
          value={data.total_data_points.toLocaleString()}
          sublabel="Reports + scans"
          accent="primary"
        />
        <Stat
          label="Resolved"
          value={data.resolved_outcomes.toLocaleString()}
          sublabel="With 7d outcome"
          accent="default"
        />
        <Stat
          label="Thesis Hit Rate"
          value={data.thesis.pct !== null ? `${data.thesis.pct}%` : '—'}
          sublabel={
            data.thesis.pct !== null
              ? `${data.thesis.high_gap_resolved} samples`
              : 'Outcomes resolving'
          }
          accent={data.thesis.pct !== null ? 'tertiary' : 'default'}
        />
        <Stat
          label="Active Signals"
          value={data.diffusion_signals.length.toLocaleString()}
          sublabel="Diffusion gap > 2.5x"
          accent={data.diffusion_signals.length > 0 ? 'secondary' : 'default'}
        />
      </section>

      {/* ─────────────────────── Live Thesis ─────────────────────── */}
      <section className="mb-12 grid md:grid-cols-[1fr_auto] gap-8 items-start border border-outline-variant/30 bg-gradient-to-br from-primary-container/[0.06] to-transparent p-6 md:p-10">
        <div>
          <div className="text-[10px] tracking-[0.4em] text-primary/70 font-mono uppercase mb-3">
            Live Research Thesis
          </div>
          <p className="text-on-surface text-xl md:text-2xl leading-snug font-light tracking-tight">
            {data.thesis.statement}
          </p>
          <div className="mt-6 flex items-center gap-4 text-[10px] tracking-[0.3em] text-outline font-mono uppercase">
            <span>Hypothesis Test</span>
            <span className="h-px bg-outline-variant/40 flex-1 hidden sm:block" />
            <span>Price gain &gt; 3% in 7d when diffusion gap &gt; 2x</span>
          </div>
        </div>

        <div className="border-l-0 md:border-l md:pl-8 border-outline-variant/30 self-stretch flex flex-col justify-center min-w-[180px]">
          <div className="text-[10px] tracking-[0.4em] text-outline font-mono uppercase mb-2">
            Confidence
          </div>
          <div className="font-mono text-5xl font-black text-primary leading-none tabular-nums">
            {data.thesis.pct !== null ? `${data.thesis.pct}` : '—'}
            {data.thesis.pct !== null && <span className="text-2xl text-outline ml-0.5">%</span>}
          </div>
          <div className="text-xs text-on-surface-variant mt-2 font-mono">
            n = {data.thesis.high_gap_resolved}
          </div>
        </div>
      </section>

      {/* ─────────────────────── Two-col: Diffusion + Signal Quality ─────────────────────── */}
      <div className="grid lg:grid-cols-5 gap-px bg-outline-variant/30 border border-outline-variant/30 mb-12">
        {/* Diffusion Tracker */}
        <section className="bg-surface lg:col-span-3 p-6 md:p-8" aria-label="Diffusion Tracker">
          <div className="flex items-end justify-between mb-6 pb-4 border-b border-outline-variant/20">
            <div>
              <div className="text-[10px] tracking-[0.4em] text-primary/70 font-mono uppercase mb-1">
                Diffusion Tracker
              </div>
              <h2 className="text-on-surface text-lg font-bold tracking-tight">
                Niche active before mainstream
              </h2>
            </div>
            <span className="text-[10px] tracking-[0.3em] text-outline font-mono uppercase">
              Top 10 · Live
            </span>
          </div>

          {data.diffusion_signals.length === 0 ? (
            <EmptyState
              icon="radar"
              title="No early signals detected"
              body="A new scan completes every 3 days. Diffusion signals will appear when niche-tier engagement exceeds 2.5× mainstream activity."
            />
          ) : (
            <div className="divide-y divide-outline-variant/20">
              {data.diffusion_signals.map((s, i) => {
                const total = s.tier_breakdown.mainstream + s.tier_breakdown.middle + s.tier_breakdown.niche;
                const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);
                const dir = directionLabel(s.direction);
                return (
                  <div key={i} className="py-4 grid grid-cols-[64px_1fr_auto] gap-4 items-center group hover:bg-surface-container-low/40 -mx-3 px-3 transition-colors">
                    <div className="font-mono font-black text-on-surface tracking-tighter text-base">
                      {s.ticker}
                    </div>

                    {/* Stacked bar */}
                    <div>
                      <div className="flex h-2 w-full overflow-hidden rounded-sm bg-surface-container-low">
                        <div
                          className="bg-secondary"
                          style={{ width: `${pct(s.tier_breakdown.niche)}%` }}
                          title={`Niche · ${s.tier_breakdown.niche}`}
                        />
                        <div
                          className="bg-tertiary"
                          style={{ width: `${pct(s.tier_breakdown.middle)}%` }}
                          title={`Middle · ${s.tier_breakdown.middle}`}
                        />
                        <div
                          className="bg-error/70"
                          style={{ width: `${pct(s.tier_breakdown.mainstream)}%` }}
                          title={`Mainstream · ${s.tier_breakdown.mainstream}`}
                        />
                      </div>
                      <div className="flex gap-4 mt-1.5 text-[10px] font-mono tracking-wide text-outline">
                        <span><span className="text-secondary">●</span> N {s.tier_breakdown.niche}</span>
                        <span><span className="text-tertiary">●</span> M {s.tier_breakdown.middle}</span>
                        <span><span className="text-error/80">●</span> S {s.tier_breakdown.mainstream}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 text-right">
                      <span className="font-mono text-tertiary text-sm font-bold tabular-nums">
                        {s.diffusion_gap.toFixed(1)}×
                      </span>
                      <DirectionPill tone={dir.tone} label={dir.label} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Signal Quality */}
        <section className="bg-surface lg:col-span-2 p-6 md:p-8" aria-label="Signal Correlation">
          <div className="flex items-end justify-between mb-6 pb-4 border-b border-outline-variant/20">
            <div>
              <div className="text-[10px] tracking-[0.4em] text-primary/70 font-mono uppercase mb-1">
                Signal Quality
              </div>
              <h2 className="text-on-surface text-lg font-bold tracking-tight">
                Which dimension predicts best?
              </h2>
            </div>
          </div>

          <div className="space-y-5">
            {Object.entries(data.signal_correlation).map(([key, val]) => (
              <SignalRow key={key} signal={key} val={val} />
            ))}
          </div>
        </section>
      </div>

      {/* ─────────────────────── Outcome Log ─────────────────────── */}
      <section className="border border-outline-variant/30" aria-label="Outcome log">
        <div className="flex items-end justify-between p-6 md:p-8 border-b border-outline-variant/20">
          <div>
            <div className="text-[10px] tracking-[0.4em] text-primary/70 font-mono uppercase mb-1">
              Outcome Log
            </div>
            <h2 className="text-on-surface text-lg font-bold tracking-tight">
              Every prediction, checked against price
            </h2>
            <p className="text-on-surface-variant text-xs mt-2 max-w-xl leading-relaxed">
              Every report and scan is auto-verified at 3, 7, and 14 days. No manual curation —
              this is the raw evidence base.
            </p>
          </div>
          <span className="hidden sm:block text-[10px] tracking-[0.3em] text-outline font-mono uppercase">
            Showing {data.outcome_log.length}
          </span>
        </div>

        {data.outcome_log.length === 0 ? (
          <div className="p-12">
            <EmptyState
              icon="schedule"
              title="Outcomes appear after 3 days"
              body="The first scan ran today. Once 3-day price outcomes resolve, predictions will start appearing here. The dataset grows continuously without user input."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] tracking-[0.3em] text-outline font-mono uppercase border-b border-outline-variant/30">
                  <th className="text-left font-medium px-6 py-3">Ticker</th>
                  <th className="text-right font-medium px-3 py-3">Gap</th>
                  <th className="text-right font-medium px-3 py-3">Direction</th>
                  <th className="text-right font-medium px-3 py-3">3d</th>
                  <th className="text-right font-medium px-3 py-3">7d</th>
                  <th className="text-right font-medium px-6 py-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {data.outcome_log.map((row, i) => {
                  const dir = directionLabel(row.direction);
                  const c3 = (row.price_change_3d ?? 0);
                  const c7 = (row.price_change_7d ?? 0);
                  return (
                    <tr
                      key={i}
                      className="border-b border-outline-variant/10 hover:bg-surface-container-low/40 transition-colors"
                    >
                      <td className="px-6 py-3 font-mono font-black text-on-surface tracking-tighter">
                        {row.ticker}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums text-tertiary">
                        {row.diffusion_gap.toFixed(1)}×
                      </td>
                      <td className="px-3 py-3 text-right">
                        <span
                          className={
                            dir.tone === 'bull'
                              ? 'text-secondary'
                              : dir.tone === 'bear'
                                ? 'text-error'
                                : 'text-on-surface-variant'
                          }
                        >
                          <span className="font-mono tabular-nums mr-1">
                            {(row.direction * 100).toFixed(0)}
                          </span>
                          <span className="text-[10px] tracking-widest uppercase font-mono opacity-70">
                            {dir.label}
                          </span>
                        </span>
                      </td>
                      <td
                        className={`px-3 py-3 text-right font-mono tabular-nums font-bold ${
                          row.price_change_3d == null
                            ? 'text-outline'
                            : c3 > 0
                              ? 'text-secondary'
                              : 'text-error'
                        }`}
                      >
                        {formatPct(row.price_change_3d)}
                      </td>
                      <td
                        className={`px-3 py-3 text-right font-mono tabular-nums font-bold ${
                          row.price_change_7d == null
                            ? 'text-outline'
                            : c7 > 0
                              ? 'text-secondary'
                              : 'text-error'
                        }`}
                      >
                        {formatPct(row.price_change_7d)}
                      </td>
                      <td className="px-6 py-3 text-right font-mono text-[11px] text-outline">
                        {new Date(row.recorded_at).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ─────────────────────── Footer rule ─────────────────────── */}
      <footer className="mt-10 pt-6 border-t border-outline-variant/30 flex flex-wrap items-center gap-4 text-[10px] tracking-[0.3em] text-outline font-mono uppercase">
        <span>Cipher Engine</span>
        <span>·</span>
        <span>Sentiment scan every 3d</span>
        <span>·</span>
        <span>Outcome verification daily</span>
        <span>·</span>
        <span className="text-on-surface-variant">Data is research-only, not investment advice</span>
      </footer>
    </div>
  );
}

/* ───────────────────────── Subcomponents ───────────────────────── */

function Stat({
  label,
  value,
  sublabel,
  accent,
}: {
  label: string;
  value: string;
  sublabel: string;
  accent: 'primary' | 'secondary' | 'tertiary' | 'default';
}) {
  const accentClass =
    accent === 'primary'
      ? 'text-primary'
      : accent === 'secondary'
        ? 'text-secondary'
        : accent === 'tertiary'
          ? 'text-tertiary'
          : 'text-on-surface';

  return (
    <div className="bg-surface px-5 py-5 md:px-6 md:py-6 group hover:bg-surface-container-low/40 transition-colors">
      <div className="text-[10px] tracking-[0.4em] text-outline font-mono uppercase mb-2">
        {label}
      </div>
      <div className={`font-mono text-3xl md:text-4xl font-black tabular-nums leading-none ${accentClass}`}>
        {value}
      </div>
      <div className="text-[11px] text-on-surface-variant mt-2 font-mono">
        {sublabel}
      </div>
    </div>
  );
}

function DirectionPill({ tone, label }: { tone: 'bull' | 'bear' | 'neutral'; label: string }) {
  const cls =
    tone === 'bull'
      ? 'text-secondary border-secondary/40 bg-secondary/10'
      : tone === 'bear'
        ? 'text-error border-error/40 bg-error/10'
        : 'text-on-surface-variant border-outline-variant/40 bg-surface-container-low';
  return (
    <span
      className={`text-[10px] font-bold tracking-widest uppercase font-mono px-2 py-0.5 border ${cls}`}
    >
      {label}
    </span>
  );
}

function SignalRow({
  signal,
  val,
}: {
  signal: string;
  val: { signal_positive_pct: number; avg_7d_return: number; sample_size: number };
}) {
  const label = SIGNAL_LABELS[signal] ?? signal;
  const desc = SIGNAL_DESCRIPTIONS[signal] ?? '';
  const positiveTone = val.signal_positive_pct >= 60 ? 'text-secondary' : val.signal_positive_pct >= 40 ? 'text-on-surface' : 'text-error';
  const returnTone = val.avg_7d_return > 0 ? 'text-secondary' : val.avg_7d_return < 0 ? 'text-error' : 'text-outline';

  return (
    <div className="group">
      <div className="flex items-center justify-between mb-1.5">
        <div>
          <div className="text-on-surface text-sm font-bold tracking-tight">{label}</div>
          <div className="text-[10px] text-outline font-mono uppercase tracking-widest mt-0.5">
            {desc}
          </div>
        </div>
        <div className="text-right">
          <div className={`font-mono font-black text-xl tabular-nums ${positiveTone}`}>
            {val.signal_positive_pct}%
          </div>
          <div className="text-[10px] text-outline font-mono tracking-widest uppercase">
            n={val.sample_size}
          </div>
        </div>
      </div>
      <div className="h-1 bg-surface-container-low overflow-hidden">
        <div
          className={
            val.signal_positive_pct >= 60
              ? 'h-full bg-secondary'
              : val.signal_positive_pct >= 40
                ? 'h-full bg-primary'
                : 'h-full bg-error'
          }
          style={{ width: `${Math.max(2, val.signal_positive_pct)}%` }}
        />
      </div>
      <div className={`text-[11px] font-mono mt-1 ${returnTone}`}>
        avg 7d return · {val.avg_7d_return > 0 ? '+' : ''}{val.avg_7d_return}%
      </div>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  body,
}: {
  icon: string;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col items-center text-center py-10 px-6">
      <span
        className="material-symbols-outlined text-outline mb-3"
        style={{ fontSize: '32px' }}
        aria-hidden="true"
      >
        {icon}
      </span>
      <div className="text-on-surface-variant text-sm font-medium mb-2">{title}</div>
      <p className="text-outline text-xs max-w-md leading-relaxed">{body}</p>
    </div>
  );
}
