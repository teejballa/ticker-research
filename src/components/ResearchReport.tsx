'use client';

// src/components/ResearchReport.tsx
// Equinfo research report — premium terminal-intelligence aesthetic.

import Link from 'next/link';
import { formatTimestamp, formatMarketCap, formatPercent, formatPrice } from '@/lib/formatters';
import type { AnalysisResult, MarketSnapshot } from '@/lib/types';

interface ResearchReportProps {
  analysisResult: AnalysisResult;
  ticker: string;
}

// ── Inline markdown renderer (bold + newlines only) ────────
// Gemini returns **bold** text and bullet lists — strip asterisks cleanly.
function Md({ text }: { text: string }) {
  // Split on **...** to extract bold spans
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1
          ? <strong key={i} className="text-[#c9d4e0] font-semibold">{part}</strong>
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

// ── Section header ────────────────────────────────────────

function SectionHeader({ label, badge }: { label: string; badge?: string }) {
  return (
    <div className="flex items-center gap-3 mt-10 mb-5">
      <span className="text-[#f59e0b]/30 text-xs select-none">▶</span>
      <span className="text-[10px] text-[#3a5070] tracking-[0.4em] font-semibold">{label}</span>
      {badge && (
        <span className="text-[9px] text-[#1a2a3a] border border-[#0d1a27] px-2 py-0.5">{badge}</span>
      )}
      <div className="flex-1 h-px bg-[#0a1520]" />
    </div>
  );
}

// ── Assessment bar ────────────────────────────────────────

interface AssessmentBarProps {
  label: string;
  pct: number;
  fillColor: string;
  glowColor: string;
  textColor: string;
  rationale: string;
}

function AssessmentBar({ label, pct, fillColor, glowColor, textColor, rationale }: AssessmentBarProps) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-3 mb-1.5">
        <span className="text-[10px] tracking-[0.3em] font-bold w-9 shrink-0" style={{ color: textColor }}>
          {label}
        </span>
        <div className="flex-1 h-1.5 bg-[#0a1520] overflow-hidden">
          <div
            className="h-full transition-all duration-1000 ease-out"
            style={{
              width: `${pct}%`,
              backgroundColor: fillColor,
              boxShadow: `0 0 10px ${glowColor}`,
            }}
          />
        </div>
        <span className="text-sm font-bold tabular-nums w-10 text-right" style={{ color: textColor }}>
          {pct}%
        </span>
      </div>
      <p className="text-[11px] text-[#3a5060] pl-12 leading-relaxed"><Md text={rationale} /></p>
    </div>
  );
}

// ── Stats grid ────────────────────────────────────────────

interface StatCellProps {
  label: string;
  value: string;
  color?: string;
}

function StatCell({ label, value, color = '#5a7a8a' }: StatCellProps) {
  return (
    <div className="panel px-3 py-2.5">
      <div className="text-[9px] text-[#1a2a3a] tracking-[0.28em] mb-1">{label}</div>
      <div className="text-sm font-bold tabular-nums" style={{ color }}>{value}</div>
    </div>
  );
}

function StatsGrid({ snapshot }: { snapshot: MarketSnapshot | undefined }) {
  const s = snapshot;
  const pctRaw = s?.percent_change_today ?? null;
  const pctColor = pctRaw == null ? '#5a7a8a' : pctRaw >= 0 ? '#10b981' : '#ef4444';

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-0.5 mb-6">
      <StatCell label="LAST PRICE" value={formatPrice(s?.price ?? null)}                       color="#f59e0b" />
      <StatCell label="CHG %"      value={formatPercent(pctRaw)}                               color={pctColor} />
      <StatCell label="MKT CAP"    value={formatMarketCap(s?.market_cap ?? null)} />
      <StatCell label="P/E RATIO"  value={s?.pe_ratio != null ? s.pe_ratio.toFixed(1) : '—'} />
      <StatCell label="52W HIGH"   value={formatPrice(s?.fifty_two_week_high ?? null)} />
      <StatCell label="52W LOW"    value={formatPrice(s?.fifty_two_week_low ?? null)} />
      <StatCell label="EPS"        value={s?.eps != null ? `$${s.eps.toFixed(2)}` : '—'} />
      <StatCell label="REVENUE"    value={formatMarketCap(s?.revenue ?? null)} />
    </div>
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
  } = analysisResult;

  function handleDownloadPDF() {
    const date          = new Date(analyzed_at).toISOString().slice(0, 10);
    const originalTitle = document.title;
    document.title      = `${ticker}-equinfo-${date}`;
    window.onafterprint = () => {
      document.title      = originalTitle;
      window.onafterprint = null;
    };
    window.print();
  }

  const sentimentColor =
    market_sentiment === 'bullish' ? '#10b981' :
    market_sentiment === 'bearish' ? '#ef4444' :
    '#f59e0b';

  const sentimentBorderClass =
    market_sentiment === 'bullish' ? 'border-emerald-500/25 bg-emerald-500/5' :
    market_sentiment === 'bearish' ? 'border-red-500/25 bg-red-500/5' :
    'border-amber-500/25 bg-amber-500/5';

  const confidenceBlocks =
    confidence_level === 'High' ? 10 :
    confidence_level === 'Medium' ? 6 :
    3;

  return (
    <div>

      {/* ── STICKY TOP BAR ── */}
      <div className="sticky top-0 z-10 bg-[#080a0f]/96 backdrop-blur-sm border-b border-[#0a1520] print:hidden">
        <div className="max-w-4xl mx-auto px-5 h-11 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="font-bold text-[#f59e0b] text-base tracking-[0.2em] glow-amber-text">
              {ticker}
            </span>
            <span className="text-[#0d1a27] hidden sm:block">│</span>
            <span className="text-[#2a3d50] text-xs hidden sm:block truncate">{company_name}</span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="text-[10px] border border-[#131e2b] text-[#1e2d3d] px-3 py-1 hover:border-[#f59e0b]/25 hover:text-[#f59e0b]/60 transition-all tracking-wider"
            >
              ← NEW RESEARCH
            </Link>
            <button
              onClick={handleDownloadPDF}
              className="text-[10px] border border-[#f59e0b]/35 text-[#f59e0b]/60 px-3 py-1 hover:bg-[#f59e0b] hover:text-black hover:border-[#f59e0b] transition-all tracking-wider"
            >
              EXPORT PDF
            </button>
          </div>
        </div>
      </div>

      {/* ── PAGE CONTENT ── */}
      <div className="min-h-screen bg-[#080a0f] text-[#c9d4e0] px-5 py-8 max-w-4xl mx-auto fade-in">

        {/* Disclaimer */}
        <div className="border border-[#0a1520] bg-[#09101a] px-4 py-2.5 mb-5 flex gap-3 items-start">
          <span className="text-[#1a2a3a] text-xs shrink-0 mt-0.5">⚠</span>
          <p className="text-[10px] text-[#1a2a3a] leading-relaxed tracking-wide">
            DISCLAIMER — This report is for informational purposes only and does not constitute financial advice or a
            recommendation to buy, sell, or hold any security. Past performance does not guarantee future results.
            Consult a qualified financial advisor before making investment decisions.
          </p>
        </div>

        {/* Timestamp row */}
        <div className="flex items-center gap-3 mb-6 text-[10px] text-[#0d1a27]">
          <span className="tracking-widest">ANALYSIS TIMESTAMP</span>
          <div className="flex-1 h-px bg-[#080e17]" />
          <span className="tabular-nums text-[#1a2a3a]">{formatTimestamp(analyzed_at)}</span>
        </div>

        {/* Stats */}
        <StatsGrid snapshot={market_snapshot} />

        {/* ── SENTIMENT ── */}
        <SectionHeader label="MARKET SENTIMENT" />
        <div className="flex items-center gap-3 mb-3">
          <span
            className={`text-xs border px-3 py-1 font-bold tracking-[0.35em] ${sentimentBorderClass}`}
            style={{ color: sentimentColor }}
          >
            {market_sentiment.toUpperCase()}
          </span>
        </div>
        <p className="text-sm text-[#4a6a7a] leading-relaxed"><Md text={sentiment_reasoning} /></p>

        {/* ── BULLISH FACTORS ── */}
        <SectionHeader label="BULLISH FACTORS" badge={`${bullish_signals.length} signals`} />
        <div className="space-y-2.5">
          {bullish_signals.map((s, i) => (
            <div key={i} className="flex gap-3">
              <span className="text-emerald-500/50 text-xs mt-0.5 shrink-0 font-bold">▲</span>
              <div>
                <span className="text-sm text-[#7a9a8a] leading-snug"><Md text={s.signal} /></span>
                {s.source_citation && (
                  <span className="text-[10px] text-[#1e2d3d] ml-2">[{s.source_citation}]</span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* ── BEARISH FACTORS ── */}
        <SectionHeader label="BEARISH FACTORS" badge={`${bearish_signals.length} signals`} />
        <div className="space-y-2.5">
          {bearish_signals.map((s, i) => (
            <div key={i} className="flex gap-3">
              <span className="text-red-500/50 text-xs mt-0.5 shrink-0 font-bold">▼</span>
              <div>
                <span className="text-sm text-[#7a6a6a] leading-snug"><Md text={s.signal} /></span>
                {s.source_citation && (
                  <span className="text-[10px] text-[#1e2d3d] ml-2">[{s.source_citation}]</span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* ── ASSESSMENT ── */}
        <SectionHeader label="ASSESSMENT" />
        <div className="panel p-5">
          <AssessmentBar
            label="BUY"
            pct={assessment.buy_pct}
            fillColor="#10b981"
            glowColor="rgba(16,185,129,0.3)"
            textColor="#10b981"
            rationale={assessment.buy_rationale}
          />
          <AssessmentBar
            label="HOLD"
            pct={assessment.hold_pct}
            fillColor="#f59e0b"
            glowColor="rgba(245,158,11,0.3)"
            textColor="#f59e0b"
            rationale={assessment.hold_rationale}
          />
          <AssessmentBar
            label="SELL"
            pct={assessment.sell_pct}
            fillColor="#ef4444"
            glowColor="rgba(239,68,68,0.3)"
            textColor="#ef4444"
            rationale={assessment.sell_rationale}
          />
        </div>

        {/* ── CONFIDENCE ── */}
        <SectionHeader label="CONFIDENCE LEVEL" />
        <div className="panel p-4">
          <div className="flex items-center gap-4 mb-3">
            <span className="text-xs tracking-[0.3em] text-[#f59e0b] font-bold">
              {confidence_level.toUpperCase()}
            </span>
            <div className="flex gap-0.5">
              {Array.from({ length: 10 }).map((_, i) => (
                <div
                  key={i}
                  className="h-2 w-5 transition-all duration-700"
                  style={{
                    backgroundColor: i < confidenceBlocks ? '#f59e0b' : '#0a1520',
                    boxShadow: i < confidenceBlocks ? '0 0 5px rgba(245,158,11,0.3)' : 'none',
                  }}
                />
              ))}
            </div>
            <span className="text-xs text-[#2a3d52] tabular-nums">{confidenceBlocks * 10}%</span>
          </div>
          <p className="text-xs text-[#3a5060] leading-relaxed"><Md text={confidence_explanation} /></p>
        </div>

        {/* ── SOURCES ── */}
        <SectionHeader label="SOURCES" badge={`${sources_used.length} indexed`} />
        <div className="space-y-0.5">
          {sources_used.map((src, i) => (
            <div key={i} className="panel px-3.5 py-2.5 flex gap-3 items-start">
              <span className="text-[#1a2a3a] text-[10px] tabular-nums shrink-0 w-5 text-right mt-0.5">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div>
                <div className="text-xs text-[#3a5a6a] font-semibold">{src.name}</div>
                {src.key_fact && (
                  <p className="text-[10px] text-[#1e2d3d] mt-0.5 leading-snug">{src.key_fact}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        {source_warnings.length > 0 && (
          <p className="text-[10px] text-[#0d1a27] mt-2 tracking-wider">
            ⚠ {source_warnings.length} source(s) failed to load during analysis
          </p>
        )}

        {/* Footer */}
        <div className="mt-14 pt-4 border-t border-[#080e17] flex flex-wrap items-center justify-between gap-2 text-[9px] text-[#0a1520] select-none">
          <span>EQUINFO RESEARCH TERMINAL</span>
          <span>ANALYSIS ENGINE: ANTHROPIC × GEMINI</span>
          <span className="tabular-nums">{new Date(analyzed_at).toISOString().slice(0, 10)}</span>
        </div>

      </div>
    </div>
  );
}
