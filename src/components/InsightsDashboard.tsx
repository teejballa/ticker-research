'use client';

import { useEffect, useState } from 'react';

interface InsightsData {
  total_data_points: number;
  resolved_outcomes: number;
  thesis: { statement: string; high_gap_resolved: number; pct: number | null };
  diffusion_signals: Array<{
    ticker: string; diffusion_gap: number; direction: number;
    tier_breakdown: { mainstream: number; middle: number; niche: number };
    recorded_at: string;
  }>;
  outcome_log: Array<{
    ticker: string; diffusion_gap: number; direction: number;
    price_change_3d: number | null; price_change_7d: number | null; recorded_at: string;
  }>;
  signal_correlation: Record<string, { signal_positive_pct: number; avg_7d_return: number; sample_size: number }>;
}

export function InsightsDashboard() {
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/insights')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setError('Failed to load insights'); setLoading(false); });
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center min-h-64">
      <div className="text-sm text-zinc-500 animate-pulse">Loading research data...</div>
    </div>
  );
  if (error || !data) return <div className="text-sm text-red-500 p-4">{error ?? 'No data'}</div>;

  return (
    <div className="space-y-8 max-w-5xl mx-auto px-4 py-8">
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Data Points', value: data.total_data_points.toLocaleString() },
          { label: 'Resolved Outcomes', value: data.resolved_outcomes.toLocaleString() },
          { label: 'Thesis Confidence', value: data.thesis.pct !== null ? `${data.thesis.pct}%` : 'Accumulating...' },
        ].map(s => (
          <div key={s.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="text-2xl font-bold text-white">{s.value}</div>
            <div className="text-xs text-zinc-500 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-widest mb-3">Live Research Thesis</h2>
        <p className="text-white text-base leading-relaxed">{data.thesis.statement}</p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-widest mb-4">
          Diffusion Tracker — Niche Active Before Mainstream
        </h2>
        {data.diffusion_signals.length === 0 ? (
          <p className="text-zinc-500 text-sm">No early signals detected yet — check back after first scan cycle.</p>
        ) : (
          <div className="space-y-3">
            {data.diffusion_signals.map((s, i) => (
              <div key={i} className="flex items-center justify-between border-b border-zinc-800 pb-3 last:border-0">
                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold text-white">{s.ticker}</span>
                  <span className="text-xs text-zinc-500">
                    niche:{s.tier_breakdown.niche} · mid:{s.tier_breakdown.middle} · main:{s.tier_breakdown.mainstream}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-amber-400">gap {s.diffusion_gap.toFixed(1)}x</span>
                  <span className={s.direction > 0.6 ? 'text-emerald-400' : s.direction < 0.4 ? 'text-red-400' : 'text-zinc-400'}>
                    {s.direction > 0.6 ? 'bullish' : s.direction < 0.4 ? 'bearish' : 'neutral'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-widest mb-4">
          Signal Quality — Which Dimension Predicts Best?
        </h2>
        <div className="grid grid-cols-2 gap-4">
          {Object.entries(data.signal_correlation).map(([key, val]) => (
            <div key={key} className="border border-zinc-800 rounded-lg p-4">
              <div className="text-sm font-medium text-white capitalize mb-2">{key.replace(/_/g, ' ')}</div>
              <div className="flex justify-between text-xs text-zinc-400">
                <span>{val.signal_positive_pct}% positive</span>
                <span>avg {val.avg_7d_return > 0 ? '+' : ''}{val.avg_7d_return}% 7d</span>
              </div>
              <div className="text-xs text-zinc-600 mt-1">n={val.sample_size}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-widest mb-4">
          Outcome Log — Every Prediction Checked
        </h2>
        {data.outcome_log.length === 0 ? (
          <p className="text-zinc-500 text-sm">Outcomes appear 3–7 days after data collection begins.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-zinc-500 border-b border-zinc-800">
                  {['Ticker','Gap','Direction','3d %','7d %','Date'].map(h => (
                    <th key={h} className="text-left pb-2 pr-4">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {data.outcome_log.map((row, i) => (
                  <tr key={i} className="text-zinc-300">
                    <td className="py-2 pr-4 font-mono font-semibold text-white">{row.ticker}</td>
                    <td className="py-2 pr-4 text-amber-400">{row.diffusion_gap.toFixed(1)}x</td>
                    <td className="py-2 pr-4">{(row.direction * 100).toFixed(0)}% bull</td>
                    <td className={`py-2 pr-4 ${(row.price_change_3d ?? 0) > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {row.price_change_3d != null ? `${row.price_change_3d > 0 ? '+' : ''}${row.price_change_3d.toFixed(1)}%` : '—'}
                    </td>
                    <td className={`py-2 pr-4 ${(row.price_change_7d ?? 0) > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {row.price_change_7d != null ? `${row.price_change_7d > 0 ? '+' : ''}${row.price_change_7d.toFixed(1)}%` : '—'}
                    </td>
                    <td className="py-2 text-zinc-500">{new Date(row.recorded_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
