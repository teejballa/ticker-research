'use client';

// src/components/ResearchReport.tsx
// Cipher research report — Stitch 12-column layout.

import { useState } from 'react';
import { formatTimestamp, formatMarketCap as formatMarketCapLib, formatPercent, formatPrice } from '@/lib/formatters';
import {
  DISCLAIMER_FOOTER_V1_BODY,
  PRICE_TARGET_HEDGE_V1_BODY,
  applyDisclaimerVars,
} from '@/lib/prompts/client-disclaimers';
import type { AnalysisResult, MarketSnapshot, InstitutionalSnapshot, InsiderSnapshot, InstitutionalBucket, InsiderBucket } from '@/lib/types';
import { FEATURES } from '@/lib/features';
import NavBar from '@/components/NavBar';
import FooterTicker from '@/components/FooterTicker';
import EngineCalibrationPanel from '@/components/EngineCalibrationPanel';
import TechnicalSignalsCard from '@/components/TechnicalSignalsCard';
import { PerAspectChips } from '@/components/PerAspectChips';
import {
  dismissBanner as dismissManipulationBanner,
  isDismissed as isManipulationBannerDismissed,
} from '@/components/manipulation-banner-dismiss';

interface ResearchReportProps {
  analysisResult: AnalysisResult;
  ticker: string;
}

// ── Inline markdown renderer (bold + newlines only) ────────
function Md({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1
          ? <strong key={i} className="text-on-surface font-semibold">{part}</strong>
          : part.split('\n').map((line, j) => (
              <span key={`${i}-${j}`}>
                {j > 0 && <br />}
                {line}
              </span>
            ))
      )}
    </>
  );
}

// ── Helper formatters ──────────────────────────────────────

function formatVolume(vol: number): string {
  if (vol >= 1e9)  return `${(vol / 1e9).toFixed(1)}B`;
  if (vol >= 1e6)  return `${(vol / 1e6).toFixed(1)}M`;
  if (vol >= 1e3)  return `${(vol / 1e3).toFixed(1)}K`;
  return vol.toLocaleString();
}

function getSentimentLabel(sentiment: string | undefined): string {
  if (!sentiment) return 'NEUTRAL';
  const lower = sentiment.toLowerCase();
  if (lower.includes('bullish')) return 'BULLISH';
  if (lower.includes('bearish')) return 'BEARISH';
  return 'NEUTRAL';
}

function getSentimentBadgeClass(sentiment: string | undefined): string {
  const label = getSentimentLabel(sentiment);
  if (label === 'BULLISH') return 'bg-secondary/20 text-secondary border-secondary/30';
  if (label === 'BEARISH') return 'bg-error/20 text-error border-error/30';
  return 'bg-outline/20 text-outline border-outline/30';
}

function getPutCallColor(interpretation: 'bullish' | 'bearish' | 'neutral' | null | undefined): string {
  if (interpretation === 'bullish') return 'text-secondary';
  if (interpretation === 'bearish') return 'text-error';
  return 'text-on-surface-variant';
}

// confidence_level is 'Low' | 'Medium' | 'High' — map to 0-100
function confidenceToPercent(level: 'Low' | 'Medium' | 'High'): number {
  if (level === 'High')   return 90;
  if (level === 'Medium') return 60;
  return 30;
}

// ── Phase 17-04: Smart Money Intelligence section (UI-SPEC §E) ───────────
// Bucket → display label maps (UI-SPEC §A Pattern label maps — full bucket names)
const INSTITUTIONAL_BUCKET_LABEL: Record<InstitutionalBucket, string> = {
  net_accumulation:          'NET ACCUMULATION',
  net_distribution:          'NET DISTRIBUTION',
  new_initiation:            'NEW INITIATION',
  complete_exit:             'COMPLETE EXIT',
  smart_money_concentration: 'SMART MONEY CONC.',
  smart_money_dispersion:    'SMART MONEY DISP.',
  contrarian_inflow:         'CONTRARIAN INFLOW',
  contrarian_outflow:        'CONTRARIAN OUTFLOW',
};

const INSIDER_BUCKET_LABEL: Record<InsiderBucket, string> = {
  cluster_buying:      'CLUSTER BUYING',
  lone_buy:            'LONE BUY',
  ceo_buy:             'CEO BUY',
  cfo_buy:             'CFO BUY',
  director_buy:        'DIRECTOR BUY',
  cluster_selling:     'CLUSTER SELLING',
  planned_sell_10b5_1: '10b5-1 PLAN SELL',
  lone_sell:           'LONE SELL',
};

function formatShareCount(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${n > 0 ? '+' : ''}${(n / 1_000_000).toFixed(1)}M shares`;
  if (Math.abs(n) >= 1_000)     return `${n > 0 ? '+' : ''}${(n / 1_000).toFixed(0)}K shares`;
  return `${n > 0 ? '+' : ''}${n} shares`;
}

function formatUSD(n: number | null): string {
  if (n == null) return '—';
  const sign = n > 0 ? '+' : '';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)     return `${sign}$${(n / 1_000).toFixed(0)}K`;
  return `${sign}$${n.toFixed(0)}`;
}

function filingAgeDays(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const t = new Date(dateStr).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24));
}

function FilingAgeChip({ days, label }: { days: number | null; label: string }) {
  if (days == null) return null;
  const colorClass = days < 30 ? 'text-on-surface-variant' : days < 60 ? 'text-tertiary' : 'text-error';
  return (
    <span className={`text-[10px] font-mono ${colorClass}`}>{label}: {days}d ago</span>
  );
}

function InstitutionalFlowCard({ snap }: { snap: InstitutionalSnapshot }) {
  const ageDays = filingAgeDays(snap.filing_date);
  const bucketLabel = snap.institutional_bucket ? (INSTITUTIONAL_BUCKET_LABEL[snap.institutional_bucket] ?? snap.institutional_bucket.toUpperCase()) : null;
  const badgeClass = snap.institutional_bucket && (
    snap.institutional_bucket === 'net_accumulation' || snap.institutional_bucket === 'new_initiation' || snap.institutional_bucket === 'contrarian_inflow' || snap.institutional_bucket === 'smart_money_concentration'
      ? 'bg-secondary/20 text-secondary border-secondary/40'
      : snap.institutional_bucket === 'net_distribution' || snap.institutional_bucket === 'complete_exit' || snap.institutional_bucket === 'contrarian_outflow'
        ? 'bg-error/20 text-error border-error/40'
        : 'bg-surface-container-highest text-on-surface-variant border-outline/30'
  ) || 'bg-surface-container-highest text-on-surface-variant border-outline/30';

  return (
    <div
      className="bg-surface-container-high p-4 rounded-lg border border-surface-container-highest"
      data-testid="institutional-flow-card"
    >
      {/* Sub-card header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-secondary text-sm">account_balance</span>
          <span className="text-[10px] font-bold tracking-widest uppercase text-secondary">INSTITUTIONAL FLOW</span>
        </div>
        <FilingAgeChip days={ageDays} label="Latest 13F" />
      </div>

      {/* Bucket pill */}
      {bucketLabel && (
        <div className="mb-3">
          <span className={`font-mono text-xs font-bold px-2 py-0.5 rounded-full border ${badgeClass}`}>
            {bucketLabel}
          </span>
        </div>
      )}

      {/* Key metrics */}
      <div className="space-y-1.5 text-xs text-on-surface-variant">
        <div className="flex justify-between">
          <span>Share change</span>
          <span className="font-mono font-bold text-on-surface">{formatShareCount(snap.net_share_change)}</span>
        </div>
        <div className="flex justify-between">
          <span>Fund count</span>
          <span className="font-mono font-bold text-on-surface">
            {snap.fund_count_current}
            {snap.fund_count_prev != null && snap.fund_count_current != null
              ? <span className={`ml-1 ${snap.fund_count_current >= snap.fund_count_prev ? 'text-secondary' : 'text-error'}`}>
                  ({snap.fund_count_current - snap.fund_count_prev >= 0 ? '+' : ''}{snap.fund_count_current - snap.fund_count_prev})
                </span>
              : null}
          </span>
        </div>
        {snap.top10_concentration_pct != null && (
          <div className="flex justify-between">
            <span>Top-10 concentration</span>
            <span className="font-mono font-bold text-on-surface">{(snap.top10_concentration_pct * 100).toFixed(0)}%</span>
          </div>
        )}
      </div>

      {/* Engine bucket reference */}
      {bucketLabel && (
        <p className="mt-3 text-[10px] text-on-surface-variant tracking-widest uppercase">
          Engine bucket: {bucketLabel}
        </p>
      )}
    </div>
  );
}

function InsiderActivityCard({ snap }: { snap: InsiderSnapshot }) {
  const ageDays = filingAgeDays(snap.latest_filing_date);
  const bucketLabel = snap.insider_bucket ? (INSIDER_BUCKET_LABEL[snap.insider_bucket] ?? snap.insider_bucket.toUpperCase()) : null;
  const netValue = snap.buy_value_usd != null && snap.sell_value_usd != null
    ? snap.buy_value_usd - snap.sell_value_usd
    : snap.buy_value_usd != null ? snap.buy_value_usd : snap.sell_value_usd != null ? -snap.sell_value_usd : null;
  const badgeClass = snap.insider_bucket && (
    snap.insider_bucket === 'cluster_buying' || snap.insider_bucket === 'ceo_buy' || snap.insider_bucket === 'cfo_buy' || snap.insider_bucket === 'director_buy' || snap.insider_bucket === 'lone_buy'
      ? 'bg-secondary/20 text-secondary border-secondary/40'
      : snap.insider_bucket === 'cluster_selling' || snap.insider_bucket === 'lone_sell' || snap.insider_bucket === 'planned_sell_10b5_1'
        ? 'bg-error/20 text-error border-error/40'
        : 'bg-surface-container-highest text-on-surface-variant border-outline/30'
  ) || 'bg-surface-container-highest text-on-surface-variant border-outline/30';

  return (
    <div
      className="bg-surface-container-high p-4 rounded-lg border border-surface-container-highest"
      data-testid="insider-activity-card"
    >
      {/* Sub-card header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-tertiary text-sm">person_search</span>
          <span className="text-[10px] font-bold tracking-widest uppercase text-tertiary">INSIDER ACTIVITY</span>
        </div>
        <FilingAgeChip days={ageDays} label="Latest Form 4" />
      </div>

      {/* Bucket pill */}
      {bucketLabel && (
        <div className="mb-3">
          <span className={`font-mono text-xs font-bold px-2 py-0.5 rounded-full border ${badgeClass}`}>
            {bucketLabel}
          </span>
        </div>
      )}

      {/* Key metrics */}
      <div className="space-y-1.5 text-xs text-on-surface-variant">
        <div className="flex justify-between">
          <span>Distinct buyers</span>
          <span className="font-mono font-bold text-on-surface">{snap.distinct_buyers}</span>
        </div>
        <div className="flex justify-between">
          <span>Distinct sellers</span>
          <span className="font-mono font-bold text-on-surface">{snap.distinct_sellers}</span>
        </div>
        {netValue != null && (
          <div className="flex justify-between">
            <span>Net value</span>
            <span className={`font-mono font-bold ${netValue >= 0 ? 'text-secondary' : 'text-error'}`}>
              {formatUSD(netValue)}
            </span>
          </div>
        )}
        <div className="flex justify-between">
          <span className={snap.has_ceo_buy ? 'font-bold text-on-surface' : ''}>CEO buy</span>
          <span className={`font-mono font-bold ${snap.has_ceo_buy ? 'text-secondary' : 'text-on-surface-variant'}`}>
            {snap.has_ceo_buy ? 'yes' : 'no'}
          </span>
        </div>
      </div>

      {/* Engine bucket reference */}
      {bucketLabel && (
        <p className="mt-3 text-[10px] text-on-surface-variant tracking-widest uppercase">
          Engine bucket: {bucketLabel}
        </p>
      )}
    </div>
  );
}

function SmartMoneyIntelligence({
  institutionalAtReport,
  insiderAtReport,
}: {
  institutionalAtReport: InstitutionalSnapshot | null;
  insiderAtReport: InsiderSnapshot | null;
}) {
  const bothNull = institutionalAtReport == null && insiderAtReport == null;

  return (
    <section
      className="bg-surface-container border border-surface-container-high p-6 rounded-lg"
      data-testid="smart-money-intelligence"
    >
      {/* Section header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-secondary text-base" style={{ fontVariationSettings: "'FILL' 1" }}>
            account_balance
          </span>
          <h3 className="text-[11px] font-bold tracking-widest uppercase text-secondary">
            Institutional &amp; Insider Activity
          </h3>
        </div>
        <span className="text-[10px] text-on-surface-variant">
          13F flows and Form 4 transactions from the most recent filing window.
        </span>
      </div>

      {bothNull ? (
        /* Both-null state: explain what was checked and why nothing surfaced */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div
            className="bg-surface-container-high p-4 rounded-lg border border-error/10"
            data-testid="institutional-flow-placeholder"
          >
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-secondary text-sm">account_balance</span>
              <span className="text-[10px] font-bold tracking-widest uppercase text-secondary">INSTITUTIONAL FLOW</span>
            </div>
            <p className="text-xs font-bold text-on-surface mb-1">No recent 13F filings</p>
            <p className="text-xs text-on-surface-variant leading-relaxed mb-3">
              No institutional ownership change found for this ticker in the most recent 13F window.
              13Fs are filed quarterly and lag ~45 days, so this can mean either no change or no fund holds the position.
            </p>
            <p className="text-[10px] text-on-surface-variant/70 leading-relaxed">
              Sources checked: Finnhub institutional ownership (primary) · SEC EDGAR 13F filings (fallback).
            </p>
          </div>
          <div
            className="bg-surface-container-high p-4 rounded-lg border border-error/10"
            data-testid="insider-activity-placeholder"
          >
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-tertiary text-sm">person_search</span>
              <span className="text-[10px] font-bold tracking-widest uppercase text-tertiary">INSIDER ACTIVITY</span>
            </div>
            <p className="text-xs font-bold text-on-surface mb-1">No recent Form 4 filings</p>
            <p className="text-xs text-on-surface-variant leading-relaxed mb-3">
              No officer or director transactions filed in the past 30 days. Form 4s must be filed within 2 business days,
              so a clean window usually means no insiders bought or sold.
            </p>
            <p className="text-[10px] text-on-surface-variant/70 leading-relaxed">
              Sources checked: Finnhub insider transactions (primary) · SEC EDGAR Form 4 filings (fallback).
            </p>
          </div>
        </div>
      ) : (
        /* AC4 asymmetric grid — always 2 columns even when one is null */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Institutional Flow sub-card */}
          {institutionalAtReport != null ? (
            <InstitutionalFlowCard snap={institutionalAtReport} />
          ) : (
            <div
              className="bg-surface-container-high p-4 rounded-lg border border-error/10"
              data-testid="institutional-flow-placeholder"
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="material-symbols-outlined text-secondary text-sm">account_balance</span>
                <span className="text-[10px] font-bold tracking-widest uppercase text-secondary">INSTITUTIONAL FLOW</span>
              </div>
              <p className="text-xs font-bold text-on-surface mb-1">No recent 13F filings</p>
              <p className="text-xs text-on-surface-variant leading-relaxed mb-3">
                No institutional ownership data found for this ticker in the current quarterly cycle. Engine skips institutional priors for this report.
              </p>
              <p className="text-[10px] text-on-surface-variant/70 leading-relaxed">
                Sources checked: Finnhub institutional ownership · SEC EDGAR 13F.
              </p>
            </div>
          )}

          {/* Insider Activity sub-card */}
          {insiderAtReport != null ? (
            <InsiderActivityCard snap={insiderAtReport} />
          ) : (
            <div
              className="bg-surface-container-high p-4 rounded-lg border border-error/10"
              data-testid="insider-activity-placeholder"
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="material-symbols-outlined text-tertiary text-sm">person_search</span>
                <span className="text-[10px] font-bold tracking-widest uppercase text-tertiary">INSIDER ACTIVITY</span>
              </div>
              <p className="text-xs font-bold text-on-surface mb-1">No recent Form 4 filings</p>
              <p className="text-xs text-on-surface-variant leading-relaxed mb-3">
                No officer or director transactions filed in the past 30 days. Engine skips insider priors for this report.
              </p>
              <p className="text-[10px] text-on-surface-variant/70 leading-relaxed">
                Sources checked: Finnhub insider transactions · SEC EDGAR Form 4.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ── Main component ────────────────────────────────────────

export default function ResearchReport({ analysisResult, ticker }: ResearchReportProps) {
  const {
    company_name,
    analyzed_at,
    market_sentiment,
    sentiment_reasoning,
    bullish_signals,
    bearish_signals,
    assessment,
    confidence_level,
    confidence_explanation,
    sources_used,
    source_warnings,
    market_snapshot,
    // New Wall Street fields
    executive_summary,
    business_description,
    financial_analysis,
    competitive_landscape,
    investment_thesis,
    key_risks,
    valuation_context,
    catalyst_watch,
    future_projection,          // D-15
    community_sources_scraped,  // D-18
    sentiment_intelligence,     // D-17
    community_highlights,   // community intelligence
    community_analysis,     // community narrative
    engine_calibration,     // diffusion-engine prior
    technical_at_report,    // Phase 16-04 — live technical snapshot
    institutional_at_report, // Phase 17-04 — institutional filing snapshot
    insider_at_report,       // Phase 17-04 — insider activity snapshot
  } = analysisResult;

  function handleExportPdf() {
    const date          = new Date(analyzed_at).toISOString().slice(0, 10);
    const originalTitle = document.title;
    document.title      = `${ticker}-cipher-${date}`;
    window.onafterprint = () => {
      document.title      = originalTitle;
      window.onafterprint = null;
    };
    window.print();
  }

  // ── Plan 20-C-04 — Pump-and-dump manipulation banner ────────
  // Dismissal state is a client-only counter; toggling it forces a re-read of
  // localStorage via isManipulationBannerDismissed(ticker) on the next render.
  // The initial `false` matches the SSR no-window branch of the helper so the
  // banner renders consistently on first paint, then hydrates.
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const manipulationWarning = sentiment_intelligence?.manipulation_warning;
  const showManipulationBanner =
    process.env.NEXT_PUBLIC_FEATURE_PUMP_DUMP_DETECTOR_UI === 'on'
    && manipulationWarning?.is_warning === true
    && !bannerDismissed
    && !isManipulationBannerDismissed(ticker);
  function handleDismissManipulationBanner() {
    dismissManipulationBanner(ticker);
    setBannerDismissed(true);
  }

  const s = market_snapshot;
  const confidencePct = confidenceToPercent(confidence_level);
  const confidenceBlocks = Math.round(confidencePct / 10);

  const fs = s?.field_sources;
  // Plan 19-B-06 (D-29): FieldOrigin union extended additively — accept the
  // new ladder origins so this UI renders the correct provenance badge once
  // the new ladder graduates past shadow.
  // Phase 30 (D-11): 'unavailable' added to FieldOrigin additively; rendered
  // as no badge here (Plan 30-03 introduces the "—" rendering case alongside
  // the merge.ts emission of 'unavailable').
  const sourceLabel = (
    origin:
      | 'yahoo'
      | 'finnhub'
      | 'polygon'
      | 'edgar'
      | 'twelvedata'
      | 'exa'
      | 'anthropic-search'
      | 'unavailable'
      | null
      | undefined,
  ): string | null => {
    // Phase 30 D-11 — 'unavailable' (FieldOrigin set when every cascade source
    // returned null) renders no badge. Legacy persisted records use `null`
    // for the same case; both are mapped to no-badge here. The em-dash render
    // for the field's VALUE is handled by the per-stat formatters in the
    // `stats` grid below (each `value` already falls back to '—' on null).
    if (origin === 'unavailable' || origin == null) return null;
    if (origin === 'finnhub') return 'via Finnhub';
    if (origin === 'polygon') return 'via Polygon';
    if (origin === 'yahoo')   return 'via Yahoo';
    if (origin === 'edgar')   return 'via EDGAR';
    if (origin === 'twelvedata') return 'via Twelve Data';
    if (origin === 'exa')     return 'via Exa';
    if (origin === 'anthropic-search') return 'via Anthropic Search';
    return null;
  };

  // Stats grid data — adapted to actual MarketSnapshot field names
  const stats = [
    {
      label: 'Last Price',
      value: formatPrice(s?.price ?? null),
      extra: 'USD',
      colorClass: 'text-on-surface',
      source: sourceLabel(fs?.price),
    },
    {
      label: '24H Change',
      value: s?.percent_change_today != null
        ? formatPercent(s.percent_change_today)
        : '—',
      colorClass: s?.percent_change_today != null
        ? s.percent_change_today >= 0 ? 'text-secondary' : 'text-error'
        : 'text-on-surface',
      source: sourceLabel(fs?.percent_change_today),
    },
    {
      label: 'MKT Cap',
      value: formatMarketCapLib(s?.market_cap ?? null),
      colorClass: 'text-on-surface',
      source: sourceLabel(fs?.market_cap),
    },
    {
      label: 'P/E Ratio',
      value: s?.pe_ratio != null ? s.pe_ratio.toFixed(2) : '—',
      colorClass: 'text-on-surface',
      source: sourceLabel(fs?.pe_ratio),
    },
    {
      label: '52W High',
      value: formatPrice(s?.fifty_two_week_high ?? null),
      colorClass: 'text-secondary',
      source: sourceLabel(fs?.fifty_two_week_high),
    },
    {
      label: '52W Low',
      value: formatPrice(s?.fifty_two_week_low ?? null),
      colorClass: 'text-error',
      source: sourceLabel(fs?.fifty_two_week_low),
    },
    {
      label: 'EPS',
      value: s?.eps != null ? `$${s.eps.toFixed(2)}` : '—',
      colorClass: 'text-on-surface',
      source: sourceLabel(fs?.eps),
    },
    {
      label: 'Revenue',
      value: formatMarketCapLib(s?.revenue ?? null),
      colorClass: 'text-on-surface',
      source: sourceLabel(fs?.revenue),
    },
  ];

  return (
    <div className="bg-surface text-on-surface font-body selection:bg-primary/30 min-h-screen pb-12">
      {/* Plan 20-C-04 — Pump-and-dump manipulation warning banner.
          Renders at the TOP of the report (before NavBar) so a user sees the
          non-advisory warning before any sentiment-bearing content. Gated by
          NEXT_PUBLIC_FEATURE_PUMP_DUMP_DETECTOR_UI=on AND the aggregator's
          manipulation_warning.is_warning === true AND 24h-localStorage dismissal
          unset. Copy is FIXED (T-20-C-04-01) — Playwright asserts zero
          occurrences of forbidden substrings ['buy','sell','advise','recommend','should'].
          role=alert + aria-live=polite for screen-reader announcement without
          stealing focus. */}
      {showManipulationBanner && (
        <div
          role="alert"
          aria-live="polite"
          data-banner="manipulation-warning"
          data-testid="manipulation-warning-banner"
          className="w-full bg-error text-on-error px-4 py-3 flex items-center gap-3 border-b-2 border-error"
        >
          <span className="text-xl" aria-hidden="true">⚠</span>
          <div className="flex-1 text-sm">
            Possible market manipulation pattern detected (Nam/Yang 2023).
            This warning does NOT constitute investment advice.
            {' '}
            <a
              href="/docs/model-cards/pump-dump-detector"
              className="underline hover:no-underline"
            >
              Methodology
            </a>
            .
          </div>
          <button
            type="button"
            aria-label="Dismiss manipulation warning for 24 hours"
            onClick={handleDismissManipulationBanner}
            className="text-on-error hover:opacity-75 rounded px-2 py-1"
          >
            ×
          </button>
        </div>
      )}

      <NavBar
        ticker={ticker}
        companyName={company_name}
        showSubBar
        onNewResearch={() => { window.location.href = '/'; }}
        onExportPdf={handleExportPdf}
        securityType={analysisResult.security_type ?? null}
      />

      <main className="mt-[100px] max-w-6xl mx-auto px-6 space-y-8 pb-20">

        {/* Timestamp row */}
        <div className="flex items-center gap-3 text-[10px] text-on-surface-variant">
          <span className="tracking-widest uppercase">Analysis Timestamp</span>
          <div className="flex-1 h-px bg-surface-container" />
          <span className="tabular-nums font-mono">{formatTimestamp(analyzed_at)}</span>
        </div>

        {/* Financial Disclaimer — 20-D-05 regulatory hygiene (S10).
            Body is sourced from src/lib/prompts/_v1/disclaimer-footer.md via the
            20-Z-04 prompt registry. Edits require a _v2/ bump per registry rules. */}
        <section className="border-l-4 border-tertiary bg-surface-container-low p-4 flex gap-4 items-start">
          <span className="material-symbols-outlined text-tertiary text-lg shrink-0 mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>warning</span>
          <div>
            <h4 className="text-[11px] font-bold tracking-widest uppercase text-tertiary mb-1">Financial Disclaimer</h4>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              {applyDisclaimerVars(DISCLAIMER_FOOTER_V1_BODY, { data_as_of_timestamp: analyzed_at.slice(0, 10) })}
            </p>
          </div>
        </section>

        {/* Executive Summary */}
        {executive_summary && (
          <section className="bg-surface-container p-6 rounded-lg border-l-4 border-primary relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 blur-[100px]" />
            <div className="flex items-center gap-3 mb-4">
              <span className="material-symbols-outlined text-primary text-base" style={{ fontVariationSettings: "'FILL' 1" }}>analyst_insights</span>
              <h3 className="text-[11px] font-bold tracking-widest uppercase text-primary">Executive Summary</h3>
            </div>
            <p className="text-sm text-on-surface leading-relaxed max-w-4xl">
              <Md text={executive_summary} />
            </p>
          </section>
        )}

        {/* Phase 16-04: Technical Signals — placed immediately BEFORE the Engine
            Calibration panel so the reader sees raw technical readings, then the
            engine's learned interpretation of them. UI-SPEC §B locks this position. */}
        {technical_at_report && (
          <TechnicalSignalsCard tech={technical_at_report} />
        )}

        {/* Engine Calibration — diffusion-engine prior carried by the report */}
        {engine_calibration && (
          <EngineCalibrationPanel calibration={engine_calibration} />
        )}

        {/* Business Description */}
        {business_description && (
          <section className="bg-surface-container-low border border-surface-container-high p-6 rounded-lg">
            <h3 className="text-[10px] font-bold tracking-widest uppercase text-on-surface-variant flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-sm text-tertiary">domain</span>
              About the Company
            </h3>
            <p className="text-sm text-on-surface-variant leading-relaxed max-w-4xl">
              <Md text={business_description} />
            </p>
          </section>
        )}

        {/* Main Dashboard Grid (Asymmetric) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* Left Column: Metrics & Sentiment (col-span-8) */}
          <div className="lg:col-span-8 space-y-6">

            {/* Stats Grid: 2x4 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {stats.map((stat, i) => (
                <div key={i} className="bg-surface-container-high p-4 rounded-lg">
                  <span className="text-[10px] font-bold tracking-widest uppercase text-on-surface-variant block mb-2">{stat.label}</span>
                  <div className={`font-mono text-xl font-bold ${stat.colorClass}`}>
                    {stat.value}
                    {stat.extra && (
                      <span className="text-xs font-medium text-on-surface-variant ml-1">{stat.extra}</span>
                    )}
                  </div>
                  {stat.source && stat.value !== '—' && (
                    <span className="mt-2 inline-block text-[9px] font-medium tracking-wide text-on-surface-variant/70 uppercase">
                      {stat.source}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Market Sentiment Card */}
            <div className="bg-surface-container p-6 rounded-lg relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-secondary/5 blur-[80px]" />
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-headline font-bold text-lg">Market Sentiment</h3>
                <div className={`px-4 py-1 rounded-full text-[10px] font-black tracking-widest uppercase border ${getSentimentBadgeClass(market_sentiment)}`}>
                  {getSentimentLabel(market_sentiment)}
                </div>
              </div>
              <p className="text-sm text-on-surface-variant leading-relaxed max-w-2xl">
                <Md text={sentiment_reasoning} />
              </p>
            </div>

            {/* Sentiment Intelligence Card — D-18 */}
            {(sentiment_intelligence != null) && (
              <div className="bg-surface-container p-4 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm text-tertiary">monitoring</span>
                    <h3 className="text-[10px] font-bold tracking-widest uppercase text-on-surface-variant">Sentiment Snapshot</h3>
                  </div>
                  {sentiment_intelligence.stocktwits_is_trending && (
                    <span className="text-[10px] font-bold tracking-widest uppercase text-tertiary">TRENDING</span>
                  )}
                  {/* Plan 20-A-05 — MIXED · LOW AGREEMENT amber badge.
                      Amber (warning), NOT red (action) per T-20-A-05-05.
                      Tooltip cites Cookson & Engelberg as a volatility-regime
                      indicator — NOT a directional sell signal. */}
                  {sentiment_intelligence.low_agreement_warning === true &&
                    process.env.NEXT_PUBLIC_FEATURE_AGREEMENT_SIGNAL_UI === 'on' && (
                      <span
                        data-testid="agreement-low-badge"
                        className="text-[10px] font-bold tracking-widest uppercase text-amber-600 bg-amber-50 px-2 py-0.5 rounded"
                        title="Cross-platform sources disagree; per Cookson & Engelberg historically predicts higher subsequent volatility, NOT a directional signal."
                      >
                        MIXED · LOW AGREEMENT
                      </span>
                    )}
                </div>
                {/* Plan 20-C-03 — bot-filter subtext.
                    Renders ONLY when FEATURE_BOT_FILTER === 'on' AND counts > 0.
                    Amber signals advisory, NOT silencing (T-20-C-03-05). Flagged
                    messages REMAIN displayed in any per-message list rendered below. */}
                {FEATURES.bot_filter_mode === 'on'
                  && sentiment_intelligence.bot_filter_summary
                  && ((sentiment_intelligence.bot_filter_summary.authors_flagged > 0)
                      || (sentiment_intelligence.bot_filter_summary.messages_flagged_coordinated > 0)) && (
                    <p
                      data-testid="bot-filter-subtext"
                      className="mt-2 text-xs text-amber-600"
                    >
                      {sentiment_intelligence.bot_filter_summary.authors_flagged} authors flagged as bots;{' '}
                      {sentiment_intelligence.bot_filter_summary.messages_flagged_coordinated} messages flagged as coordinated
                    </p>
                  )}
                {(() => {
                  // Post-Phase-19 — prefer the cross-source aggregated number
                  // (Beta-smoothed, multi-venue) over the raw StockTwits %.
                  // Single-source extremes like "100% bullish" are an artifact
                  // of echo chambers; the aggregate calibrates against
                  // sample size + cross-source disagreement.
                  const agg = sentiment_intelligence.aggregated_bull_pct;
                  const aggBear = sentiment_intelligence.aggregated_bear_pct;
                  const showAggregated = agg != null && (sentiment_intelligence.sentiment_source_count ?? 0) > 0;
                  const bullDisplay = showAggregated ? agg.toFixed(0) : (sentiment_intelligence.stocktwits_bull_pct ?? null);
                  const bearDisplay = showAggregated ? aggBear!.toFixed(0) : (sentiment_intelligence.stocktwits_bear_pct ?? null);
                  return (
                    <div className="flex gap-2">
                      {/* Bull % chip */}
                      <div className="bg-surface-container-highest px-4 py-2 rounded flex flex-col items-center gap-1 flex-1">
                        <span className="text-[10px] font-bold tracking-widest uppercase text-on-surface-variant">BULL</span>
                        <span className={`text-sm font-mono font-bold ${bullDisplay != null ? 'text-secondary' : 'text-on-surface-variant'}`}>
                          {bullDisplay != null ? `${bullDisplay}%` : '—'}
                        </span>
                        {showAggregated && (
                          <span className="text-[9px] tracking-widest uppercase text-on-surface-variant">SMOOTHED · {sentiment_intelligence.sentiment_source_count} src</span>
                        )}
                      </div>
                      {/* Bear % chip */}
                      <div className="bg-surface-container-highest px-4 py-2 rounded flex flex-col items-center gap-1 flex-1">
                        <span className="text-[10px] font-bold tracking-widest uppercase text-on-surface-variant">BEAR</span>
                        <span className={`text-sm font-mono font-bold ${bearDisplay != null ? 'text-error' : 'text-on-surface-variant'}`}>
                          {bearDisplay != null ? `${bearDisplay}%` : '—'}
                        </span>
                      </div>
                      {/* P/C Ratio chip */}
                      <div className="bg-surface-container-highest px-4 py-2 rounded flex flex-col items-center gap-1 flex-1">
                        <span className="text-[10px] font-bold tracking-widest uppercase text-on-surface-variant">P/C RATIO</span>
                        <span className={`text-sm font-mono font-bold ${sentiment_intelligence.put_call_ratio != null ? 'text-tertiary' : 'text-on-surface-variant'}`}>
                          {sentiment_intelligence.put_call_ratio != null ? sentiment_intelligence.put_call_ratio.toFixed(2) : '—'}
                        </span>
                        {sentiment_intelligence.put_call_interpretation && sentiment_intelligence.put_call_ratio != null && (
                          <span className="text-[10px] text-tertiary tracking-widest uppercase">
                            {sentiment_intelligence.put_call_interpretation.toUpperCase()}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })()}
                {/* Plan 20-B-05 — Per-aspect bull% chip stack.
                    Gated behind NEXT_PUBLIC_FEATURE_PER_ASPECT_AGGREGATE so
                    the chip stack ships dark until 20-B-01 per-doc classifier
                    populates analysisResult.per_aspect_sentiment. Empty-aspect
                    chips render '—' (NOT '0%') — see PerAspectChips. */}
                {process.env.NEXT_PUBLIC_FEATURE_PER_ASPECT_AGGREGATE === 'on' &&
                  analysisResult.per_aspect_sentiment != null &&
                  analysisResult.per_aspect_sentiment.length > 0 && (
                    <PerAspectChips entries={analysisResult.per_aspect_sentiment} />
                  )}
                {/* Per-source breakdown — visible when ≥1 source contributed */}
                {sentiment_intelligence.sentiment_components && sentiment_intelligence.sentiment_components.length > 0 && (
                  <div className="border-t border-surface-container-highest pt-2 mt-2">
                    <div className="text-[10px] font-bold tracking-widest uppercase text-on-surface-variant mb-1">
                      Per-source breakdown
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
                      {sentiment_intelligence.sentiment_components.map((c) => {
                        // Plan 20-B-04 — show 'wt: X.XX' when source-tier weight differs from 1.0
                        // by >= weight_diff_display_threshold (0.01). Hides cold-start visual noise.
                        const tierW = sentiment_intelligence.tier_weights_applied?.[c.source];
                        const showTierW = tierW != null && Math.abs(tierW - 1.0) >= 0.01;
                        return (
                        <div key={c.source} className="flex items-center justify-between text-[11px] font-mono text-on-surface-variant">
                          <span>{c.source}</span>
                          <span>
                            <span className={c.bullish_pct >= 50 ? 'text-secondary' : 'text-error'}>
                              {c.bullish_pct}%
                            </span>
                            <span className="text-on-surface-variant ml-2">n={c.raw_mention_count}</span>
                            {showTierW && (
                              <span
                                className="text-on-surface-variant ml-2"
                                data-testid={`source-tier-weight-${c.source}`}
                              >
                                wt: {tierW!.toFixed(2)}
                              </span>
                            )}
                          </span>
                        </div>
                        );
                      })}
                    </div>
                    {/* Plan 20-A-05 — Agreement chip. Renders the agreement_score
                        numeric (or '—' when null). Visible whenever the
                        per-source breakdown is, so it sits next to the data
                        that produced it. */}
                    {sentiment_intelligence.agreement_score !== undefined && (
                      <div
                        data-testid="agreement-score-chip"
                        className="flex items-center justify-between text-[11px] font-mono text-on-surface-variant mt-1"
                      >
                        <span className="tracking-widest uppercase text-[10px]">Agreement</span>
                        <span>
                          {sentiment_intelligence.agreement_score == null
                            ? '—'
                            : sentiment_intelligence.agreement_score.toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                )}
                {/* Plan 20-A-04 — Top author concentration sub-card. Renders ONLY
                    when (UI flag === 'on' AND gini_coefficient != null AND
                    author_concentration != null). Hashed prefixes only — raw
                    handles NEVER reach the rendered HTML (T-20-A-04-01). */}
                {process.env.NEXT_PUBLIC_FEATURE_AUTHOR_GINI_UI === 'on' &&
                  sentiment_intelligence.gini_coefficient != null &&
                  sentiment_intelligence.author_concentration != null && (
                    <div className="border-t border-surface-container-highest pt-2 mt-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold tracking-widest uppercase text-on-surface-variant">
                          Top author concentration
                        </span>
                        <span className="text-[10px] font-mono text-on-surface-variant">
                          Gini {sentiment_intelligence.gini_coefficient.toFixed(2)}
                        </span>
                      </div>
                      <div className="space-y-1">
                        {sentiment_intelligence.author_concentration.slice(0, 5).map((a) => (
                          <div
                            key={a.author_hash_prefix}
                            className="flex items-center gap-2 text-[11px] font-mono"
                          >
                            <span
                              className="text-on-surface-variant w-20 truncate"
                              data-author-hash-prefix={a.author_hash_prefix}
                            >
                              {a.author_hash_prefix}…
                            </span>
                            <div className="flex-1 bg-surface-container-highest rounded-full h-2 overflow-hidden">
                              <div
                                className="bg-tertiary h-full"
                                style={{ width: `${Math.round(a.share * 100)}%` }}
                                aria-label={`Author ${a.author_hash_prefix} contributed ${Math.round(a.share * 100)}% of messages (n=${a.message_count})`}
                              />
                            </div>
                            <span className="w-12 text-right text-on-surface-variant">
                              {Math.round(a.share * 100)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                {/* Annotation row */}
                <div className="border-t border-surface-container-highest pt-2 mt-2">
                  <span className="text-[11px] text-on-surface-variant">
                    {community_sources_scraped != null && community_sources_scraped > 0
                      ? `${community_sources_scraped} community sources scraped`
                      : 'Community sources unavailable'}
                  </span>
                </div>
                {/* Plan 20-A-01 — Crowded-consensus warning badge.
                    Renders ONLY when (flag fires AND mode === 'on'). In 'shadow'
                    or 'off' modes the badge is suppressed even if flag === true. */}
                {sentiment_intelligence.crowded_consensus === true &&
                  sentiment_intelligence.crowded_consensus_mode === 'on' && (
                    <div
                      role="alert"
                      data-testid="crowded-consensus-badge"
                      className="mt-3 px-4 py-2 rounded-md border border-error/40 bg-error/5 flex flex-col gap-1"
                    >
                      <span className="text-[10px] font-bold tracking-widest uppercase text-error">
                        Crowded consensus
                      </span>
                      <span className="text-xs text-on-surface-variant leading-relaxed">
                        High agreement on unusually high mention volume from a small number of authors.
                        Historical base-rate of mean-reversion within 14d.
                        {' '}
                        <a
                          href="https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3873189"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline text-on-surface-variant hover:text-on-surface"
                        >
                          Cookson &amp; Engelberg 2022
                        </a>
                      </span>
                    </div>
                  )}
              </div>
            )}

            {/* Bullish/Bearish Factors */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Bullish */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-bold tracking-widest uppercase text-secondary flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">trending_up</span> Bull Case
                </h4>
                <div className="space-y-2">
                  {bullish_signals.map((s, i) => (
                    <div key={i} className="flex items-start p-3 bg-surface-container-low hover:bg-surface-container-high transition-colors rounded gap-3">
                      <span className="material-symbols-outlined text-secondary text-sm mt-0.5 shrink-0">change_history</span>
                      <div>
                        <span className="text-xs"><Md text={s.signal} /></span>
                        {s.source_citation && (
                          <span className="block text-[10px] text-on-surface-variant mt-0.5">[{s.source_citation}]</span>
                        )}
                        {/* Plan 20-D-03 — per-claim CoVe (?) badge.
                            Gated on NEXT_PUBLIC_FEATURE_PER_CLAIM_VERIFIED === 'on' AND
                            verified ∈ {'false', 'null'}. Clean default (no badge on 'true'
                            or undefined) per T-20-D-03-03. Tooltip text per S10 uses
                            factual-contradiction language, NOT investment-advice language. */}
                        {process.env.NEXT_PUBLIC_FEATURE_PER_CLAIM_VERIFIED === 'on' &&
                          s.verified !== undefined &&
                          s.verified !== 'true' && (
                          <span
                            data-testid="per-claim-verified-badge"
                            role="img"
                            aria-label={s.verified === 'false'
                              ? 'Source data contradicts this claim'
                              : 'Insufficient source data to verify'}
                            title={s.verified === 'false'
                              ? 'Source data contradicts this claim'
                              : 'Insufficient source data to verify'}
                            className="inline-flex items-center justify-center w-4 h-4 ml-1 text-[10px] font-bold text-on-surface-variant bg-surface-container-high rounded-full cursor-help"
                          >
                            ?
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {/* Bearish */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-bold tracking-widest uppercase text-error flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">trending_down</span> Bear Case
                </h4>
                <div className="space-y-2">
                  {bearish_signals.map((s, i) => (
                    <div key={i} className="flex items-start p-3 bg-surface-container-low hover:bg-surface-container-high transition-colors rounded gap-3">
                      <span className="material-symbols-outlined text-error text-sm mt-0.5 shrink-0" style={{ transform: 'rotate(180deg)' }}>change_history</span>
                      <div>
                        <span className="text-xs"><Md text={s.signal} /></span>
                        {s.source_citation && (
                          <span className="block text-[10px] text-on-surface-variant mt-0.5">[{s.source_citation}]</span>
                        )}
                        {/* Plan 20-D-03 — per-claim CoVe (?) badge — bearish parity with bullish block. */}
                        {process.env.NEXT_PUBLIC_FEATURE_PER_CLAIM_VERIFIED === 'on' &&
                          s.verified !== undefined &&
                          s.verified !== 'true' && (
                          <span
                            data-testid="per-claim-verified-badge"
                            role="img"
                            aria-label={s.verified === 'false'
                              ? 'Source data contradicts this claim'
                              : 'Insufficient source data to verify'}
                            title={s.verified === 'false'
                              ? 'Source data contradicts this claim'
                              : 'Insufficient source data to verify'}
                            className="inline-flex items-center justify-center w-4 h-4 ml-1 text-[10px] font-bold text-on-surface-variant bg-surface-container-high rounded-full cursor-help"
                          >
                            ?
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Investment Thesis + Key Risks */}
            {(investment_thesis || key_risks) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {investment_thesis && (
                  <div className="bg-secondary/5 border border-secondary/20 p-5 rounded-lg">
                    <h4 className="text-[10px] font-bold tracking-widest uppercase text-secondary flex items-center gap-2 mb-3">
                      <span className="material-symbols-outlined text-sm">rocket_launch</span> Investment Thesis
                    </h4>
                    <p className="text-xs text-on-surface-variant leading-relaxed">
                      <Md text={investment_thesis} />
                    </p>
                  </div>
                )}
                {key_risks && (
                  <div className="bg-error/5 border border-error/20 p-5 rounded-lg">
                    <h4 className="text-[10px] font-bold tracking-widest uppercase text-error flex items-center gap-2 mb-3">
                      <span className="material-symbols-outlined text-sm">shield_with_heart</span> Key Risks
                    </h4>
                    <p className="text-xs text-on-surface-variant leading-relaxed">
                      <Md text={key_risks} />
                    </p>
                  </div>
                )}
              </div>
            )}
            {/* Financial Analysis */}
            {financial_analysis && (
              <div className="bg-surface-container-low border border-surface-container-high p-5 rounded-lg">
                <h4 className="text-[10px] font-bold tracking-widest uppercase text-on-surface-variant flex items-center gap-2 mb-3">
                  <span className="material-symbols-outlined text-sm text-tertiary">monitoring</span>
                  Financial Analysis
                </h4>
                <p className="text-sm text-on-surface-variant leading-relaxed">
                  <Md text={financial_analysis} />
                </p>
              </div>
            )}

            {/* Competitive Landscape */}
            {competitive_landscape && (
              <div className="bg-surface-container-low border border-surface-container-high p-5 rounded-lg">
                <h4 className="text-[10px] font-bold tracking-widest uppercase text-on-surface-variant flex items-center gap-2 mb-3">
                  <span className="material-symbols-outlined text-sm text-tertiary">leaderboard</span>
                  Competitive Landscape
                </h4>
                <p className="text-sm text-on-surface-variant leading-relaxed">
                  <Md text={competitive_landscape} />
                </p>
              </div>
            )}

          </div>

          {/* Right Column: Assessment & Confidence (col-span-4) */}
          <div className="lg:col-span-4 space-y-6">

            {/* Strategic Assessment: Fill Bars */}
            <div className="bg-surface-container p-6 rounded-lg space-y-6">
              <h3 className="text-[11px] font-bold tracking-widest uppercase text-on-surface-variant">Recommendation</h3>
              <div className="space-y-5">
                {[
                  { label: 'BUY',  value: assessment.buy_pct,  barClass: 'bg-secondary' },
                  { label: 'HOLD', value: assessment.hold_pct, barClass: 'bg-outline-variant' },
                  { label: 'SELL', value: assessment.sell_pct, barClass: 'bg-error' },
                ].map((item) => (
                  <div key={item.label} className="space-y-1">
                    <div className="flex justify-between text-[10px] font-bold tracking-wide">
                      <span>{item.label}</span>
                      <span className="font-mono">{Math.round(item.value)}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-surface-container-highest rounded-full overflow-hidden">
                      <div
                        data-testid={`assessment-bar-fill-${item.label.toLowerCase()}`}
                        className={`h-full ${item.barClass} bar-fill`}
                        style={{ '--bar-target': `${item.value}%` } as React.CSSProperties}
                      />
                    </div>
                  </div>
                ))}
              </div>
              {/* Rationales */}
              <div className="space-y-3 pt-2 border-t border-surface-container-highest">
                <p className="text-[11px] text-on-surface-variant leading-relaxed">
                  <span className="font-bold text-secondary">Buy: </span><Md text={assessment.buy_rationale} />
                </p>
                <p className="text-[11px] text-on-surface-variant leading-relaxed">
                  <span className="font-bold text-on-surface-variant">Hold: </span><Md text={assessment.hold_rationale} />
                </p>
                <p className="text-[11px] text-on-surface-variant leading-relaxed">
                  <span className="font-bold text-error">Sell: </span><Md text={assessment.sell_rationale} />
                </p>
              </div>
            </div>

            {/* Confidence Level: Segmented 10-block */}
            <div className="bg-surface-container-high p-6 rounded-lg">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-[11px] font-bold tracking-widest uppercase text-on-surface-variant">Confidence Level</h3>
                <span className="font-mono text-lg font-bold text-secondary">{confidence_level}</span>
              </div>
              <div className="flex gap-1 mb-4">
                {Array.from({ length: 10 }).map((_, i) => {
                  const isLit = i < confidenceBlocks;
                  return (
                    <div
                      key={i}
                      data-testid={`conf-block-${i}`}
                      className={`h-4 flex-1 rounded-sm conf-block ${isLit ? 'conf-block-active bg-secondary' : 'bg-surface-container-highest'}`}
                      style={{ '--block-delay': `${i * 50}ms` } as React.CSSProperties}
                    />
                  );
                })}
              </div>
              <p className="text-[11px] text-on-surface-variant leading-tight">
                <Md text={confidence_explanation} />
              </p>
            </div>

            {/* Valuation Context */}
            {valuation_context && (
              <div className="bg-surface-container-high p-5 rounded-lg">
                <h3 className="text-[11px] font-bold tracking-widest uppercase text-on-surface-variant mb-3 flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm text-tertiary">finance_mode</span>
                  Valuation
                </h3>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  <Md text={valuation_context} />
                </p>
              </div>
            )}

            {/* Price Target block — 20-D-05 regulatory hygiene (S10).
                Raw numbers are never acceptable on their own; every price_target
                is rendered with EITHER a conformal CI band (19-C-12 forward-ref,
                when the AnalysisResult exposes conformal_ci) OR the literal
                "(implied range)" qualifier. Hedge body sourced from the
                20-Z-04 registry via renderPrompt('price-target-hedge'). */}
            {analysisResult.price_target != null && (
              <div className="bg-surface-container-high p-5 rounded-lg" data-testid="price-target-block">
                <h3 className="text-[11px] font-bold tracking-widest uppercase text-on-surface-variant mb-3 flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm text-tertiary">target</span>
                  Price Target
                </h3>
                <p className="text-sm font-mono text-on-surface mb-2" data-testid="price-target-value">
                  {analysisResult.price_target}
                </p>
                {(() => {
                  const dataAsOfDate = analyzed_at.slice(0, 10);
                  // 19-C-12 forward-ref: prefer conformal CI when present, else literal "(implied range)".
                  // Field is not yet on the AnalysisResult schema — guarded via runtime cast.
                  const ci = (analysisResult as unknown as {
                    conformal_ci?: { lower: number; upper: number; coverage: number };
                  }).conformal_ci;
                  let hedgeStr: string;
                  if (
                    ci != null &&
                    typeof ci.lower === 'number' &&
                    typeof ci.upper === 'number' &&
                    typeof ci.coverage === 'number'
                  ) {
                    const halfWidth = ((ci.upper - ci.lower) / 2).toFixed(2);
                    const coveragePct = Math.round(ci.coverage * 100);
                    hedgeStr = `\u00b1 $${halfWidth} (${coveragePct}% CI)`;
                  } else {
                    hedgeStr = '(implied range)';
                  }
                  const body = applyDisclaimerVars(PRICE_TARGET_HEDGE_V1_BODY, {
                    data_as_of_timestamp: dataAsOfDate,
                    ci_band_or_implied_range: hedgeStr,
                  });
                  return <p className="text-[11px] text-on-surface-variant leading-tight">{body}</p>;
                })()}
              </div>
            )}

            {/* Source Warnings */}
            {source_warnings.length > 0 && (
              <div className="bg-surface-container-low border-l-2 border-error p-4 rounded-r">
                <p className="text-[10px] text-on-surface-variant tracking-wider">
                  <span className="material-symbols-outlined text-error text-sm align-middle mr-1">warning</span>
                  {source_warnings.length} source(s) failed to load during analysis
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Smart Money Intelligence — Phase 17-04 (UI-SPEC §E)
            Promoted above Community Intelligence so institutional + insider activity
            surface before crowd sentiment. Handles all AC4 asymmetric cases:
              - both null → section header + neutral placeholder
              - one null → full sub-card + null placeholder side-by-side
              - both populated → two full sub-cards */}
        <SmartMoneyIntelligence
          institutionalAtReport={institutional_at_report ?? null}
          insiderAtReport={insider_at_report ?? null}
        />

        {/* Community Intelligence — Full Width */}
        {community_highlights && community_highlights.length > 0 && (
          <section className="space-y-6">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-tertiary" style={{ fontVariationSettings: "'FILL' 1" }}>groups</span>
              <h2 className="text-xs font-bold tracking-widest uppercase text-on-surface-variant">Community Discussion</h2>
              <div className="flex-1 h-px bg-surface-container" />
              <span className="text-[10px] text-on-surface-variant/60">
                {community_highlights.length} {community_highlights.length === 1 ? 'source' : 'sources'} analyzed
              </span>
            </div>

            {community_analysis && (
              <p className="text-sm text-on-surface-variant leading-relaxed max-w-4xl">{community_analysis}</p>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {community_highlights.map((h, i) => (
                <div key={i} className="bg-surface-container rounded-lg p-6 space-y-4">
                  {/* Header */}
                  <div className="flex items-start gap-3">
                    <span className={`material-symbols-outlined text-lg mt-0.5 shrink-0 ${
                      h.sentiment === 'bullish' ? 'text-secondary' :
                      h.sentiment === 'bearish' ? 'text-error' :
                      'text-on-surface-variant'
                    }`}>
                      {h.sentiment === 'bullish' ? 'trending_up' : h.sentiment === 'bearish' ? 'trending_down' : 'remove'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-mono text-sm font-bold text-on-surface">{h.community_name}</span>
                        <span className={`text-[9px] font-bold tracking-widest uppercase px-1.5 py-0.5 rounded ${
                          h.community_type === 'niche'
                            ? 'bg-tertiary/10 text-tertiary border border-tertiary/20'
                            : 'bg-surface-container-highest text-on-surface-variant border border-outline/20'
                        }`}>{h.community_type}</span>
                        <span className={`text-[9px] font-bold tracking-widest uppercase px-1.5 py-0.5 rounded ${
                          h.sentiment === 'bullish' ? 'bg-secondary/10 text-secondary border border-secondary/20' :
                          h.sentiment === 'bearish' ? 'bg-error/10 text-error border border-error/20' :
                          'bg-outline/10 text-on-surface-variant border border-outline/20'
                        }`}>{h.sentiment}</span>
                      </div>
                      <span className="text-[10px] text-on-surface-variant/70">{h.audience}</span>
                    </div>
                  </div>

                  {/* Main prose — analysis_paragraph if available, else standout quote */}
                  {h.analysis_paragraph ? (
                    <p className="text-sm text-on-surface-variant leading-relaxed">
                      <Md text={h.analysis_paragraph} />
                    </p>
                  ) : (
                    <blockquote className="text-sm text-on-surface leading-relaxed italic border-l-2 border-outline/30 pl-3">
                      {/* Plan 30.1-04 Task 3 (D-24) — render standout_quote as a
                          clickable external anchor when standout_url is present
                          (Reddit permalink or HN item URL). Security: both
                          `target="_blank"` AND `rel="noopener noreferrer"` are
                          MANDATORY — without `noopener`, the linked page can
                          access window.opener (tabnabbing surface — T-30.1-04-05).
                          React attribute-escaping handles any URL-string surface,
                          but the URLs themselves are constructed by typed adapter
                          outputs (https://www.reddit.com{permalink} or
                          https://news.ycombinator.com/item?id={objectID}), not
                          from user input. */}
                      {h.standout_url ? (
                        <a
                          href={h.standout_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-on-surface hover:text-primary underline-offset-2 hover:underline"
                        >
                          &ldquo;{h.standout_quote}&rdquo;
                        </a>
                      ) : (
                        <>&ldquo;{h.standout_quote}&rdquo;</>
                      )}
                    </blockquote>
                  )}

                  {/* Pulled quotes */}
                  {h.quotes && h.quotes.length > 0 && (
                    <div className="space-y-2 pt-3 border-t border-surface-container-high">
                      {h.quotes.slice(0, 3).map((q, qi) => (
                        <blockquote key={qi} className="text-xs text-on-surface-variant/80 leading-relaxed italic border-l-2 border-tertiary/30 pl-3">
                          &ldquo;{q}&rdquo;
                        </blockquote>
                      ))}
                    </div>
                  )}

                  {/* Unique signals callout */}
                  {h.unique_to_community && h.unique_to_community.length > 0 && (
                    <div className="bg-tertiary/5 border border-tertiary/20 rounded p-3 space-y-1">
                      <span className="text-[9px] font-bold tracking-widest uppercase text-tertiary block">Only discussed here</span>
                      {h.unique_to_community.map((signal, si) => (
                        <p key={si} className="text-xs text-on-surface-variant flex items-start gap-2">
                          <span className="text-tertiary shrink-0 mt-0.5">·</span>
                          {signal}
                        </p>
                      ))}
                    </div>
                  )}

                  {/* Footer: theme + engagement */}
                  <div className="flex items-center justify-between text-[10px] text-on-surface-variant/50 pt-1">
                    <span className="uppercase tracking-wide">{h.theme}</span>
                    <span className={`font-bold uppercase tracking-wide ${
                      h.engagement_signal === 'high' ? 'text-secondary' :
                      h.engagement_signal === 'medium' ? 'text-on-surface-variant' :
                      'text-on-surface-variant/40'
                    }`}>{h.engagement_signal} engagement</span>
                  </div>
                </div>
              ))}
            </div>

            {/* 3-tier community breakdown — diffusion at a glance */}
            {(() => {
              const mainstream = community_highlights.filter((h: { community_type: string }) => h.community_type === 'mainstream');
              const middle = community_highlights.filter((h: { community_type: string }) => h.community_type === 'middle');
              const niche = community_highlights.filter((h: { community_type: string }) => h.community_type === 'niche');

              return (
                <div className="mt-6 grid grid-cols-3 gap-3">
                  {[
                    { label: 'Mainstream', communities: mainstream, color: 'text-red-400', desc: 'r/WallStreetBets, Yahoo Finance' },
                    { label: 'Middle', communities: middle, color: 'text-amber-400', desc: 'r/investing, SeekingAlpha' },
                    { label: 'Niche', communities: niche, color: 'text-emerald-400', desc: 'Sector-specific communities' },
                  ].map(tier => (
                    <div key={tier.label} className="bg-zinc-900/50 rounded-lg p-4 border border-zinc-800">
                      <div className={`text-xs font-semibold uppercase tracking-widest mb-1 ${tier.color}`}>{tier.label}</div>
                      <div className="text-2xl font-bold text-white mb-1">{tier.communities.length}</div>
                      <div className="text-xs text-zinc-500">{tier.desc}</div>
                      {tier.communities.length > 0 && (
                        <div className="text-xs text-zinc-400 mt-1 truncate">
                          {tier.communities.map((c: { community_name: string }) => c.community_name).join(', ')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}
          </section>
        )}

        {/* Catalyst Watch */}
        {catalyst_watch && catalyst_watch.length > 0 && (
          <section className="space-y-4">
            <h3 className="text-xs font-bold tracking-widest uppercase text-on-surface-variant flex items-center gap-2">
              <span className="material-symbols-outlined text-sm text-tertiary">event_upcoming</span>
              Catalyst Watch
              <span className="ml-1 font-mono text-tertiary">[{catalyst_watch.length} events]</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {catalyst_watch.map((catalyst, i) => {
                const impactColor =
                  catalyst.impact === 'positive' ? 'border-secondary text-secondary' :
                  catalyst.impact === 'negative' ? 'border-error text-error' :
                  'border-outline text-on-surface-variant';
                const impactBg =
                  catalyst.impact === 'positive' ? 'bg-secondary/5' :
                  catalyst.impact === 'negative' ? 'bg-error/5' :
                  'bg-surface-container-low';
                return (
                  <div key={i} className={`${impactBg} border-l-2 ${impactColor} p-4 rounded-r`}>
                    <span className={`text-[9px] font-black tracking-widest uppercase block mb-1 ${impactColor.split(' ')[1]}`}>
                      {catalyst.impact}
                    </span>
                    <h5 className="text-xs font-bold text-on-surface mb-1">{catalyst.event}</h5>
                    <p className="text-[10px] text-on-surface-variant">{catalyst.timing}</p>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Sources Section */}
        <section className="space-y-4">
          <h3 className="text-xs font-bold tracking-widest uppercase text-on-surface-variant">
            Sources
            <span className="ml-2 font-mono text-tertiary">[{sources_used.length} cited]</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {sources_used.map((src, i) => {
              // 20-D-05 — per-source "as of YYYY-MM-DD" timestamp. Prefer the
              // citations_v2 per-citation date_retrieved when present (true
              // per-source provenance); fall back to the report-level
              // analyzed_at (coarser, but the audit accepts either). Note:
              // citations_v2 and sources_used may not be index-aligned —
              // citations_v2 is a citation log; sources_used is a curated list.
              // When not aligned, the fallback applies.
              const perSourceDate =
                analysisResult.citations_v2?.[i]?.date_retrieved?.slice(0, 10) ??
                analyzed_at.slice(0, 10);
              return (
                <div
                  key={i}
                  data-testid={`source-item-${i}`}
                  className="bg-surface-container-low border-l-2 border-tertiary p-4 hover:-translate-y-0.5 transition-all duration-300"
                >
                  <span className="font-mono text-tertiary text-xs block mb-1">{String(i + 1).padStart(2, '0')}</span>
                  <h5 className="text-xs font-bold mb-1">{src.name}</h5>
                  {src.key_fact && (
                    <p className="text-[10px] text-on-surface-variant leading-snug">{src.key_fact}</p>
                  )}
                  <p className="text-[10px] text-on-surface-variant/70 mt-1">as of {perSourceDate}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Forward Outlook Section — D-19 (final section, after Sources) */}
        {future_projection && future_projection.length > 0 && (
          <section className="bg-surface-container p-6 rounded-lg border-l-4 border-primary relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 blur-[100px]" />
            <div className="flex items-center gap-3 mb-4">
              <span className="material-symbols-outlined text-primary text-base" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
              <h3 className="text-[11px] font-bold tracking-widest uppercase text-primary">Forward Outlook</h3>
            </div>
            <p className="text-sm text-on-surface leading-relaxed max-w-4xl relative z-10">
              <Md text={future_projection} />
            </p>
          </section>
        )}

        {/* Source list footer — 20-D-05 regulatory hygiene (S10).
            Compact source-list footer renders adjacent to the existing
            Verified Intelligence Sources cards above. The audit greps
            data-testid="sources-footer-list" + at least one <li> child. */}
        <section className="border-t border-surface-container-high pt-6 mt-12">
          <h4 className="text-[10px] font-bold tracking-widest uppercase text-on-surface-variant/70 mb-3">
            Source List
          </h4>
          <ul data-testid="sources-footer-list" className="space-y-1 text-[10px] text-on-surface-variant/80">
            {sources_used.map((src, i) => {
              const perSourceDate =
                analysisResult.citations_v2?.[i]?.date_retrieved?.slice(0, 10) ??
                analyzed_at.slice(0, 10);
              return (
                <li key={`footer-${i}`} className="flex items-baseline gap-2">
                  <span className="font-mono text-tertiary">{String(i + 1).padStart(2, '0')}.</span>
                  <span className="flex-1">{src.name}</span>
                  {src.url && (
                    <a href={src.url} className="text-tertiary hover:underline truncate max-w-xs">{src.url}</a>
                  )}
                  <span className="text-on-surface-variant/60">as of {perSourceDate}</span>
                </li>
              );
            })}
          </ul>
        </section>

      </main>

      <FooterTicker />
    </div>
  );
}
