'use client';

// src/components/ResearchReport.tsx
// Cipher research report — Stitch 12-column layout.

import { formatTimestamp, formatMarketCap as formatMarketCapLib, formatPercent, formatPrice } from '@/lib/formatters';
import type { AnalysisResult, MarketSnapshot } from '@/lib/types';
import NavBar from '@/components/NavBar';
import FooterTicker from '@/components/FooterTicker';

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

  // Stats grid data — adapted to actual MarketSnapshot field names
  const stats = [
    {
      label: 'Last Price',
      value: formatPrice(s?.price ?? null),
      extra: 'USD',
      colorClass: 'text-on-surface',
    },
    {
      label: '24H Change',
      value: s?.percent_change_today != null
        ? formatPercent(s.percent_change_today)
        : '—',
      colorClass: s?.percent_change_today != null
        ? s.percent_change_today >= 0 ? 'text-secondary' : 'text-error'
        : 'text-on-surface',
    },
    {
      label: 'MKT Cap',
      value: formatMarketCapLib(s?.market_cap ?? null),
      colorClass: 'text-on-surface',
    },
    {
      label: 'P/E Ratio',
      value: s?.pe_ratio != null ? s.pe_ratio.toFixed(2) : '—',
      colorClass: 'text-on-surface',
    },
    {
      label: '52W High',
      value: formatPrice(s?.fifty_two_week_high ?? null),
      colorClass: 'text-secondary',
    },
    {
      label: '52W Low',
      value: formatPrice(s?.fifty_two_week_low ?? null),
      colorClass: 'text-error',
    },
    {
      label: 'EPS',
      value: s?.eps != null ? `$${s.eps.toFixed(2)}` : '—',
      colorClass: 'text-on-surface',
    },
    {
      label: 'Revenue',
      value: formatMarketCapLib(s?.revenue ?? null),
      colorClass: 'text-on-surface',
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

      </main>

      <FooterTicker />
    </div>
  );
}
