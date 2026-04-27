'use client';

// src/components/ResearchReport.tsx
// Cipher research report — Stitch 12-column layout.

import { formatTimestamp, formatMarketCap as formatMarketCapLib, formatPercent, formatPrice } from '@/lib/formatters';
import type { AnalysisResult, MarketSnapshot } from '@/lib/types';
import NavBar from '@/components/NavBar';
import FooterTicker from '@/components/FooterTicker';
import EngineCalibrationPanel from '@/components/EngineCalibrationPanel';

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

  const s = market_snapshot;
  const confidencePct = confidenceToPercent(confidence_level);
  const confidenceBlocks = Math.round(confidencePct / 10);

  const fs = s?.field_sources;
  const sourceLabel = (origin: 'yahoo' | 'finnhub' | 'polygon' | null | undefined): string | null => {
    if (origin === 'finnhub') return 'via Finnhub';
    if (origin === 'polygon') return 'via Polygon';
    if (origin === 'yahoo')   return 'via Yahoo';
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

        {/* Financial Disclaimer */}
        <section className="border-l-4 border-tertiary bg-surface-container-low p-4 flex gap-4 items-start">
          <span className="material-symbols-outlined text-tertiary text-lg shrink-0 mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>warning</span>
          <div>
            <h4 className="text-[11px] font-bold tracking-widest uppercase text-tertiary mb-1">Financial Disclaimer</h4>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              This AI-generated research report is for informational purposes only. Information is sourced from real-time market data and historical filings. Cipher does not provide financial advice. Consult with a certified professional before making investment decisions.
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
                    <h3 className="text-[10px] font-bold tracking-widest uppercase text-on-surface-variant">Sentiment Intelligence</h3>
                  </div>
                  {sentiment_intelligence.stocktwits_is_trending && (
                    <span className="text-[10px] font-bold tracking-widest uppercase text-tertiary">TRENDING</span>
                  )}
                </div>
                <div className="flex gap-2">
                  {/* Bull % chip */}
                  <div className="bg-surface-container-highest px-4 py-2 rounded flex flex-col items-center gap-1 flex-1">
                    <span className="text-[10px] font-bold tracking-widest uppercase text-on-surface-variant">BULL</span>
                    <span className={`text-sm font-mono font-bold ${sentiment_intelligence.stocktwits_bull_pct != null ? 'text-secondary' : 'text-on-surface-variant'}`}>
                      {sentiment_intelligence.stocktwits_bull_pct != null ? `${sentiment_intelligence.stocktwits_bull_pct}%` : '—'}
                    </span>
                  </div>
                  {/* Bear % chip */}
                  <div className="bg-surface-container-highest px-4 py-2 rounded flex flex-col items-center gap-1 flex-1">
                    <span className="text-[10px] font-bold tracking-widest uppercase text-on-surface-variant">BEAR</span>
                    <span className={`text-sm font-mono font-bold ${sentiment_intelligence.stocktwits_bear_pct != null ? 'text-error' : 'text-on-surface-variant'}`}>
                      {sentiment_intelligence.stocktwits_bear_pct != null ? `${sentiment_intelligence.stocktwits_bear_pct}%` : '—'}
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
                {/* Annotation row */}
                <div className="border-t border-surface-container-highest pt-2 mt-2">
                  <span className="text-[11px] text-on-surface-variant">
                    {community_sources_scraped != null && community_sources_scraped > 0
                      ? `${community_sources_scraped} community sources scraped`
                      : 'Community sources unavailable'}
                  </span>
                </div>
              </div>
            )}

            {/* Bullish/Bearish Factors */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Bullish */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-bold tracking-widest uppercase text-secondary flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">trending_up</span> Growth Catalysts
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
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {/* Bearish */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-bold tracking-widest uppercase text-error flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">trending_down</span> Risk Vectors
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
              <h3 className="text-[11px] font-bold tracking-widest uppercase text-on-surface-variant">Strategic Assessment</h3>
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

        {/* Community Intelligence — Full Width */}
        {community_highlights && community_highlights.length > 0 && (
          <section className="space-y-6">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-tertiary" style={{ fontVariationSettings: "'FILL' 1" }}>groups</span>
              <h2 className="text-xs font-bold tracking-widest uppercase text-on-surface-variant">Community Intelligence</h2>
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
                      &ldquo;{h.standout_quote}&rdquo;
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
            Verified Intelligence Sources
            <span className="ml-2 font-mono text-tertiary">[{sources_used.length} indexed]</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {sources_used.map((src, i) => (
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
              </div>
            ))}
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

      </main>

      <FooterTicker />
    </div>
  );
}
