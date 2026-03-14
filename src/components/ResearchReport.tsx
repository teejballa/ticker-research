'use client';

// src/components/ResearchReport.tsx
// Bloomberg terminal-styled research report component.
// Renders the complete AnalysisResult as a formatted single-scroll page with:
//   - Sticky top bar (ticker, company, download button)
//   - Financial disclaimer
//   - Stats header block (market_snapshot)
//   - Market Sentiment
//   - Bullish Factors
//   - Bearish Factors
//   - Buy/Hold/Sell Assessment (terminal bars)
//   - Confidence Level (terminal bar)
//   - Sources Used

import { formatTimestamp, formatMarketCap, formatPercent, formatPrice } from '@/lib/formatters';
import type { AnalysisResult, MarketSnapshot } from '@/lib/types';

interface ResearchReportProps {
  analysisResult: AnalysisResult;
  ticker: string;
}

// ---- Section header ----

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="text-xs font-mono font-semibold text-zinc-400 uppercase tracking-widest border-b border-zinc-700 pb-2 mb-4 mt-8">
      {label}
    </div>
  );
}

// ---- Terminal bar (Buy/Hold/Sell) ----

interface TerminalBarProps {
  label: string;
  pct: number;
  colorClass: string;    // text-emerald-400 / text-amber-400 / text-red-400
  rationale: string;
}

function TerminalBar({ label, pct, colorClass, rationale }: TerminalBarProps) {
  const filled = Math.round(pct / 10);
  const blocks = '█'.repeat(filled) + '░'.repeat(10 - filled);

  return (
    <div className="mb-4">
      <div className={`font-mono text-sm ${colorClass}`}>
        <span className="font-bold w-5 inline-block">{label}:</span>
        <span className="text-zinc-400 mx-2">{blocks}</span>
        <span className="text-amber-300">{pct}%</span>
      </div>
      <div className="font-mono text-xs text-zinc-400 mt-1 pl-2">{rationale}</div>
    </div>
  );
}

// ---- Stats header ----

interface StatCellProps {
  label: string;
  value: string;
  valueColorClass?: string;
}

function StatCell({ label, value, valueColorClass = 'text-amber-300' }: StatCellProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-zinc-400 text-xs font-mono uppercase tracking-widest">{label}</span>
      <span className={`${valueColorClass} font-mono font-bold text-sm`}>{value}</span>
    </div>
  );
}

function StatsHeader({ snapshot }: { snapshot: MarketSnapshot | undefined }) {
  const s = snapshot;

  const pctValue = s?.percent_change_today ?? null;
  const pctFormatted = formatPercent(pctValue);
  const pctColor =
    pctValue == null ? 'text-amber-300' : pctValue >= 0 ? 'text-emerald-400' : 'text-red-400';

  const epsValue = s?.eps != null ? `$${s.eps.toFixed(2)}` : '—';
  const peValue = s?.pe_ratio != null ? s.pe_ratio.toFixed(1) : '—';

  return (
    <div className="bg-zinc-900 border border-zinc-700 p-4 mb-6">
      <div className="text-xs font-mono font-semibold text-zinc-400 uppercase tracking-widest border-b border-zinc-700 pb-2 mb-4">
        TICKER OVERVIEW
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCell label="PRICE" value={formatPrice(s?.price ?? null)} />
        <StatCell label="CHG%" value={pctFormatted} valueColorClass={pctColor} />
        <StatCell label="MKT CAP" value={formatMarketCap(s?.market_cap ?? null)} />
        <StatCell label="P/E" value={peValue} />
        <StatCell label="52W HIGH" value={formatPrice(s?.fifty_two_week_high ?? null)} />
        <StatCell label="52W LOW" value={formatPrice(s?.fifty_two_week_low ?? null)} />
        <StatCell label="EPS" value={epsValue} />
        <StatCell label="REVENUE" value={formatMarketCap(s?.revenue ?? null)} />
      </div>
    </div>
  );
}

// ---- Main component ----

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

  // PDF download — use onafterprint to restore title (avoids race condition with print dialog)
  function handleDownloadPDF() {
    const date = new Date(analyzed_at).toISOString().slice(0, 10);
    const originalTitle = document.title;
    document.title = `${ticker}-${date}`;
    window.onafterprint = () => {
      document.title = originalTitle;
      window.onafterprint = null;
    };
    window.print();
  }

  // Sentiment badge color
  const sentimentColor =
    market_sentiment === 'bullish'
      ? 'text-emerald-400'
      : market_sentiment === 'bearish'
        ? 'text-red-400'
        : 'text-amber-400';

  // Confidence blocks: Low=3, Medium=6, High=10
  const confidenceBlocks =
    confidence_level === 'High' ? 10 : confidence_level === 'Medium' ? 6 : 3;
  const confidenceBar = '█'.repeat(confidenceBlocks) + '░'.repeat(10 - confidenceBlocks);

  return (
    <div>
      {/* STICKY TOP BAR */}
      <div className="sticky top-0 z-10 bg-zinc-950 border-b border-zinc-700 px-6 py-3 flex items-center justify-between print:hidden">
        <div className="flex items-center gap-3">
          <span className="font-mono font-bold text-amber-400 text-lg">{ticker}</span>
          <span className="text-zinc-400 text-sm">{company_name}</span>
        </div>
        <button
          onClick={handleDownloadPDF}
          className="font-mono text-xs border border-amber-400 text-amber-400 px-3 py-1 hover:bg-amber-400 hover:text-black transition-colors"
        >
          DOWNLOAD PDF
        </button>
      </div>

      {/* SCROLLABLE CONTENT */}
      <div className="min-h-screen bg-zinc-950 text-zinc-200 px-6 py-8 max-w-4xl mx-auto">

        {/* FINANCIAL DISCLAIMER */}
        <div className="border border-zinc-700 bg-zinc-900 p-4 text-xs text-zinc-400 font-mono mb-6">
          <div className="text-xs font-mono text-zinc-400 uppercase tracking-widest mb-2">
            DISCLAIMER
          </div>
          This report is for informational purposes only and does not constitute financial advice.
          Not financial advice. Past performance does not guarantee future results. Consult a
          qualified financial advisor before making investment decisions.
        </div>

        {/* DATA TIMESTAMP */}
        <div className="text-xs text-zinc-600 font-mono mb-8">
          Data collected {formatTimestamp(analyzed_at)}
        </div>

        {/* STATS HEADER BLOCK */}
        <StatsHeader snapshot={market_snapshot} />

        {/* MARKET SENTIMENT */}
        <SectionHeader label="MARKET SENTIMENT" />
        <div className="mb-2">
          <span className={`font-mono font-bold ${sentimentColor}`}>
            {market_sentiment.toUpperCase()}
          </span>
        </div>
        <p className="text-zinc-300 text-sm leading-relaxed">{sentiment_reasoning}</p>

        {/* BULLISH FACTORS */}
        <SectionHeader label="BULLISH FACTORS" />
        <div className="space-y-2">
          {bullish_signals.map((s, i) => (
            <div key={i} className="font-mono text-sm">
              <span className="text-emerald-400">▲</span>{' '}
              <span className="text-zinc-200">{s.signal}</span>{' '}
              <span className="text-zinc-500 text-xs">[{s.source_citation}]</span>
            </div>
          ))}
        </div>

        {/* BEARISH FACTORS */}
        <SectionHeader label="BEARISH FACTORS" />
        <div className="space-y-2">
          {bearish_signals.map((s, i) => (
            <div key={i} className="font-mono text-sm">
              <span className="text-red-400">▼</span>{' '}
              <span className="text-zinc-200">{s.signal}</span>{' '}
              <span className="text-zinc-500 text-xs">[{s.source_citation}]</span>
            </div>
          ))}
        </div>

        {/* BUY/HOLD/SELL ASSESSMENT */}
        <SectionHeader label="ASSESSMENT" />
        <TerminalBar
          label="BUY"
          pct={assessment.buy_pct}
          colorClass="text-emerald-400"
          rationale={assessment.buy_rationale}
        />
        <TerminalBar
          label="HOLD"
          pct={assessment.hold_pct}
          colorClass="text-amber-400"
          rationale={assessment.hold_rationale}
        />
        <TerminalBar
          label="SELL"
          pct={assessment.sell_pct}
          colorClass="text-red-400"
          rationale={assessment.sell_rationale}
        />

        {/* CONFIDENCE */}
        <SectionHeader label="CONFIDENCE" />
        <div className="font-mono text-sm mb-2">
          <span className="text-amber-400 font-bold">CONFIDENCE: {confidence_level.toUpperCase()}</span>
          <span className="text-zinc-400 ml-3">[{confidenceBar}]</span>
        </div>
        <div className="font-mono text-xs text-zinc-400">{confidence_explanation}</div>

        {/* SOURCES USED */}
        <SectionHeader label="SOURCES USED" />
        <div className="space-y-2">
          {sources_used.map((src, i) => (
            <div key={i} className="font-mono text-sm text-zinc-300">
              <span className="text-zinc-500 mr-2">{i + 1}.</span>
              <span className="text-zinc-200">{src.name}</span>
              <span className="text-zinc-500"> — </span>
              <span className="text-zinc-400">{src.key_fact}</span>
            </div>
          ))}
        </div>
        {source_warnings.length > 0 && (
          <div className="font-mono text-xs text-zinc-600 mt-3">
            Note: {source_warnings.length} source(s) could not be loaded during analysis
          </div>
        )}

      </div>
    </div>
  );
}
