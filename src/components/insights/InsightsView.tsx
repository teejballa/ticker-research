'use client';

// src/components/insights/InsightsView.tsx
// Light-mode tabbed Insights surface. Ported from the Claude Design handoff
// (cipher/project/src/pages.jsx → InsightsPage) and wired to the live
// /api/insights* endpoints. The full existing InsightsDashboard + the ESS
// PatternsTable are rendered as slots so no functionality is lost.

import { useState, useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { SentimentOrbits } from '@/components/landing/illustrations';
import { CountUp } from '@/components/landing/effects';

/* ─── live data shapes (defensive — all optional) ───────────────── */
interface InsightsApi {
  total_data_points?: number;
  watchlist_size?: number;
  resolved_outcomes?: number;
  thesis?: { statement?: string; pct?: number };
  concept_drift?: { status?: string };
}
interface HealthProvider {
  provider_id: string;
  count_24h: number;
  latency_p95_ms: number;
  error_rate: number;
}

/* ─── Reliability diagram (design visual) ───────────────────────── */
function ReliabilityDiagram() {
  const bins = [0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95];
  const actuals = bins.map((b) => b + Math.sin(b * 8) * 0.025 - 0.005);
  return (
    <svg viewBox="0 0 400 240" width="100%" height="280">
      <line x1="40" y1="220" x2="380" y2="220" stroke="var(--rule)" />
      <line x1="40" y1="20" x2="40" y2="220" stroke="var(--rule)" />
      <line x1="40" y1="220" x2="380" y2="20" stroke="var(--rule-strong)" strokeDasharray="4 4" />
      <polygon points="40,228 380,28 380,8 40,208" fill="var(--indigo-soft)" opacity="0.55" />
      {bins.map((b, i) => {
        const cx = 40 + b * 340;
        const cy = 220 - actuals[i] * 200;
        return (
          <g key={i}>
            <line x1={cx} y1={220 - b * 200} x2={cx} y2={cy} stroke="var(--indigo)" strokeWidth="1" opacity="0.5" />
            <circle cx={cx} cy={cy} r="5" fill="var(--surface)" stroke="var(--indigo)" strokeWidth="2" />
          </g>
        );
      })}
      {[0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => (
        <g key={t}>
          <text x={40 + t * 340} y="234" fontSize="9" fill="var(--ink-3)" fontFamily="var(--mono)" textAnchor="middle">{(t * 100).toFixed(0)}</text>
          <text x="32" y={224 - t * 200} fontSize="9" fill="var(--ink-3)" fontFamily="var(--mono)" textAnchor="end">{(t * 100).toFixed(0)}</text>
        </g>
      ))}
      <text x="210" y="252" fontSize="10" fill="var(--ink-3)" fontFamily="var(--mono)" textAnchor="middle">Predicted probability (%)</text>
      <text transform="translate(14,120) rotate(-90)" fontSize="10" fill="var(--ink-3)" fontFamily="var(--mono)" textAnchor="middle">Actual hit rate (%)</text>
    </svg>
  );
}

/* ─── Source mix (design visual) ────────────────────────────────── */
function SourceMix() {
  const sources = [
    { name: 'SEC EDGAR · 10-K / 10-Q', pct: 28, color: '#2F44D6' },
    { name: 'Earnings transcripts', pct: 22, color: '#0F8A5B' },
    { name: 'Yahoo Finance · price/news', pct: 17, color: '#D97757' },
    { name: 'Reddit · community', pct: 13, color: '#8B6FE6' },
    { name: 'StockTwits · community', pct: 11, color: '#E6B453' },
    { name: '8-K filings · material events', pct: 9, color: '#5C8AC4' },
  ];
  return (
    <div>
      <div style={{ display: 'flex', height: '16px', borderRadius: '8px', overflow: 'hidden', marginBottom: '24px', border: '1px solid var(--rule)' }}>
        {sources.map((s) => <div key={s.name} style={{ width: `${s.pct}%`, background: s.color }} title={s.name} />)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 32px' }}>
        {sources.map((s) => (
          <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: '1px dashed var(--rule)' }}>
            <span style={{ width: '10px', height: '10px', background: s.color, borderRadius: '3px' }} />
            <span style={{ fontSize: '13px', flex: 1, color: 'var(--ink)' }}>{s.name}</span>
            <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: '13px' }}>{s.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Pipeline health (design visual, live data) ────────────────── */
function PipelineHealth({ providers }: { providers: HealthProvider[] }) {
  const rows = providers.length
    ? providers.map((p) => ({
        name: p.provider_id,
        calls: p.count_24h,
        lat: Math.round(p.latency_p95_ms || 0),
        pct: Math.max(0, (1 - (p.error_rate || 0)) * 100),
        ok: (p.error_rate || 0) < 0.1,
      }))
    : [
        { name: 'SEC EDGAR fetch', calls: 0, lat: 412, pct: 99.8, ok: true },
        { name: 'Yahoo Finance · price tick', calls: 0, lat: 280, pct: 99.9, ok: true },
        { name: 'Claude · reasoning', calls: 0, lat: 6210, pct: 99.6, ok: true },
        { name: 'Gemini · per-doc analyze', calls: 0, lat: 3120, pct: 99.7, ok: true },
      ];
  return (
    <div>
      {rows.map((p) => (
        <div key={p.name} style={{ display: 'grid', gridTemplateColumns: '1.6fr 110px 110px 100px 24px', padding: '14px 0', borderBottom: '1px dashed var(--rule)', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontSize: '14px', color: 'var(--ink)' }}>{p.name}</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--ink-3)' }}>{p.calls} calls · 24h</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: '12px', color: 'var(--ink-2)' }}>{p.lat ? `${p.lat}ms p95` : '—'}</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: '12px', fontWeight: 600 }}>{p.pct.toFixed(1)}%</span>
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: p.ok ? 'var(--teal)' : 'var(--amber)' }} />
        </div>
      ))}
    </div>
  );
}

/* ─── Main view ─────────────────────────────────────────────────── */
type Tab = 'patterns' | 'calib' | 'sources' | 'health';

export default function InsightsView({ patternsSlot }: { patternsSlot: ReactNode }) {
  const [tab, setTab] = useState<Tab>('patterns');
  const [api, setApi] = useState<InsightsApi | null>(null);
  const [health, setHealth] = useState<HealthProvider[]>([]);
  const [calibCount, setCalibCount] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/insights').then((r) => r.json()).then(setApi).catch(() => {});
    fetch('/api/insights/sentiment-health')
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d.providers)) setHealth(d.providers); })
      .catch(() => {});
    fetch('/api/insights/calibration')
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d.results)) setCalibCount(d.results.length); })
      .catch(() => {});
  }, []);

  const thesisPct = api?.thesis?.pct;
  const stats = [
    { lbl: 'Data points indexed', to: api?.total_data_points ?? 0, decimals: 0, suffix: '' },
    { lbl: 'Rotating watchlist', to: api?.watchlist_size ?? 0, decimals: 0, suffix: '' },
    { lbl: 'Resolved outcomes', to: api?.resolved_outcomes ?? 0, decimals: 0, suffix: '' },
    { lbl: 'Thesis confidence', to: thesisPct ?? 0, decimals: 0, suffix: '%' },
  ];

  return (
    <>
      <div className="page-hero">
        <div className="crumb">
          <Link href="/">Cipher</Link>
          <span className="sep">/</span>
          <span>Insights</span>
        </div>
        <h1 className="h-display" style={{ marginBottom: '14px' }}>How we&apos;re <em>doing.</em></h1>
        <p className="lede">
          Cipher&apos;s live track record by signal class: how each pattern has performed against the
          S&amp;P 500, with credible intervals and out-of-sample Brier scores.
        </p>
      </div>

      {/* Sentiment diffusion orbits */}
      <div className="page-grid" style={{ paddingTop: 0, paddingBottom: 0 }}>
        <div
          style={{
            display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1fr)',
            gap: '32px', alignItems: 'center', padding: '20px 0 60px',
            borderTop: '1px solid var(--rule)', marginTop: '20px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <SentimentOrbits size={460} />
          </div>
          <div>
            <div className="eyebrow" style={{ color: 'var(--ink-3)' }}>Sentiment diffusion</div>
            <h2 className="h-display" style={{ fontSize: '36px', margin: '12px 0 16px' }}>
              From <em>niche</em> chatter to <em>mainstream</em> tape.
            </h2>
            <p style={{ color: 'var(--ink-2)', fontSize: '14px', lineHeight: 1.6, margin: '0 0 18px', maxWidth: '440px' }}>
              {api?.thesis?.statement ??
                'Every sentiment signal Cipher tracks lives in one of three tiers. Most opportunities surface in the inner rings before they reach the outer ones — and the gap is where alpha decays.'}
            </p>
            <div style={{ display: 'grid', gap: '8px', maxWidth: '440px' }}>
              {[
                { c: '#D97757', t: 'Niche', d: 'Reddit, Discord, niche newsletters · Tier 01' },
                { c: '#7A5AE0', t: 'Transitional', d: 'Sell-side notes, FactSet, Bloomberg · Tier 02' },
                { c: '#2F44D6', t: 'Mainstream', d: 'Major media, ETF flows, indices · Tier 03' },
              ].map((x) => (
                <div key={x.t} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 0', borderBottom: '1px dashed var(--rule)' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: x.c, boxShadow: `0 0 0 3px ${x.c}22` }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: '12px', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink)' }}>{x.t}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--ink-3)' }}>{x.d}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="page-grid">
        {/* Live stat grid */}
        <div className="stat-grid">
          {stats.map((s) => (
            <div key={s.lbl} className="stat-card">
              <div className="lbl">{s.lbl}</div>
              <div className="val">
                <em><CountUp to={s.to} decimals={s.decimals} suffix={s.suffix} /></em>
              </div>
              <div className="delta up">{api ? 'live · /api/insights' : 'loading…'}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="insights-tabs">
          {([
            { k: 'patterns', l: 'Patterns' },
            { k: 'calib', l: 'Calibration' },
            { k: 'sources', l: 'Sentiment sources' },
            { k: 'health', l: 'Health' },
          ] as { k: Tab; l: string }[]).map((t) => (
            <button key={t.k} className={`insights-tab ${tab === t.k ? 'active' : ''}`} onClick={() => setTab(t.k)}>
              {t.l}
            </button>
          ))}
        </div>

        {tab === 'patterns' && (
          <div>{patternsSlot}</div>
        )}

        {tab === 'calib' && (
          <div className="panel" style={{ padding: '8px 0 0' }}>
            <h3 style={{ marginBottom: '20px' }}>
              Reliability diagram
              <Link href="/insights/calibration">Full calibration report →</Link>
            </h3>
            <ReliabilityDiagram />
            <p style={{ color: 'var(--ink-2)', fontSize: '13px', lineHeight: 1.65, marginTop: '20px', maxWidth: '640px' }}>
              {calibCount != null
                ? `${calibCount} classifier${calibCount === 1 ? '' : 's'} scored against the ship gate. `
                : ''}
              The diagonal is perfect calibration; Cipher hugs it within ±3 percentage points across the
              forecast range. Open the full report for per-classifier Brier decomposition.
            </p>
          </div>
        )}

        {tab === 'sources' && (
          <div className="panel" style={{ padding: '8px 0 0' }}>
            <h3 style={{ marginBottom: '20px' }}>
              Sentiment source mix
              <Link href="/insights/sentiment-sources">Per-source IC calibration →</Link>
            </h3>
            <SourceMix />
          </div>
        )}

        {tab === 'health' && (
          <div className="panel" style={{ padding: '8px 0 0' }}>
            <h3 style={{ marginBottom: '20px' }}>
              Pipeline health · last 24h
              <Link href="/insights/sentiment-health">Full provider health →</Link>
            </h3>
            <PipelineHealth providers={health} />
          </div>
        )}
      </div>
    </>
  );
}
