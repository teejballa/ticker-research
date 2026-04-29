'use client';

// src/components/TechnicalSignalsCard.tsx
// Phase 16-04 — Technical Signals card embedded in the research report between
// the Sentiment Intelligence section and the EngineCalibrationPanel. Renders
// 4 cells: RSI(14) gauge / MACD direction / MA Stack / Volume Ratio + a
// footer with the TechPattern label and one-line explainer.
//
// All copy + classNames are verbatim per UI-SPEC §B (lines 175-224) and
// Copywriting Contract (lines 322-359).

import type { TechPattern, TechnicalSnapshot } from '@/lib/types';

interface TechnicalSignalsCardProps {
  tech: TechnicalSnapshot | null;
}

// UI-SPEC Copywriting Contract lines 350-359 — locked label + explainer per pattern.
const TECH_PATTERN_LABELS: Record<TechPattern, { label: string; explainer: string }> = {
  breakout_uptrend:    { label: 'BREAKOUT UPTREND',    explainer: 'Price punching through resistance with confirming volume.' },
  overbought_uptrend:  { label: 'OVERBOUGHT UPTREND',  explainer: 'Trend intact but RSI elevated — reversal risk rising.' },
  pullback_in_uptrend: { label: 'PULLBACK IN UPTREND', explainer: 'Healthy retracement in a longer-term uptrend.' },
  consolidation:       { label: 'CONSOLIDATION',       explainer: 'Price compressing in a range; awaiting catalyst.' },
  breakdown:           { label: 'BREAKDOWN',           explainer: 'Price falling through support with confirming volume.' },
  oversold_downtrend:  { label: 'OVERSOLD DOWNTREND',  explainer: 'Trend intact but RSI depressed — bounce risk rising.' },
  death_cross:         { label: 'DEATH CROSS',         explainer: 'SMA50 just crossed below SMA200 — long-term momentum flip.' },
  golden_cross:        { label: 'GOLDEN CROSS',        explainer: 'SMA50 just crossed above SMA200 — long-term momentum flip.' },
};

function formatNum(n: number | null | undefined, decimals = 2): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toFixed(decimals);
}

function formatSigned(n: number | null | undefined, decimals = 2): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(decimals)}`;
}

// ── Cell 1: RSI(14) gauge ─────────────────────────────────────────────

function RsiGauge({ rsi }: { rsi: number | null }) {
  const value = rsi ?? null;
  const segments = Array.from({ length: 10 }).map((_, i) => {
    // Each segment spans 10 RSI points.
    const rangeStart = i * 10;
    const rangeEnd = (i + 1) * 10;
    let bg = 'bg-surface-container-highest';
    if (rangeEnd <= 30) bg = 'bg-error/30';
    else if (rangeStart >= 70) bg = 'bg-secondary/30';
    return { i, bg, rangeStart, rangeEnd };
  });
  const markerLeftPct = value != null ? Math.max(0, Math.min(100, value)) : null;
  const markerColor = value == null
    ? 'bg-on-surface-variant'
    : value < 30 ? 'bg-error'
    : value > 70 ? 'bg-secondary'
    : 'bg-on-surface';

  return (
    <div className="flex flex-col gap-2" title="RSI(14): 14-day Relative Strength Index. <30 = oversold, >70 = overbought.">
      <span className="text-[10px] tracking-widest uppercase text-on-surface-variant">RSI(14)</span>
      <span className="text-2xl font-mono tabular-nums text-on-surface">{value != null ? value.toFixed(0) : '—'}</span>
      <div className="relative">
        <div className="flex gap-0.5">
          {segments.map(s => (
            <div key={s.i} className={`flex-1 h-3 rounded-sm ${s.bg}`} aria-hidden="true" />
          ))}
        </div>
        {markerLeftPct != null && (
          <div
            className={`absolute top-0 h-3 w-0.5 ${markerColor}`}
            style={{ left: `${markerLeftPct}%` }}
            aria-label={`RSI marker at ${markerLeftPct.toFixed(0)}`}
          />
        )}
      </div>
      <div className="flex justify-between text-xs font-mono text-on-surface-variant">
        <span>30</span>
        <span>───</span>
        <span>70</span>
      </div>
    </div>
  );
}

// ── Cell 2: MACD direction ────────────────────────────────────────────

function MacdDirection({
  histogram, line, signal,
}: { histogram: number | null; line: number | null; signal: number | null }) {
  const arrow =
    histogram == null ? 'remove' :
    histogram > 0.05 ? 'trending_up' :
    histogram < -0.05 ? 'trending_down' :
    'trending_flat';
  const arrowColor =
    histogram == null ? 'text-on-surface-variant' :
    histogram > 0.05 ? 'text-secondary' :
    histogram < -0.05 ? 'text-error' :
    'text-on-surface-variant';

  return (
    <div className="flex flex-col gap-2" title="MACD(12,26,9). Positive histogram = bullish momentum. Negative = bearish momentum.">
      <span className="text-[10px] tracking-widest uppercase text-on-surface-variant">MACD</span>
      <div className="flex items-center gap-2">
        <span className={`material-symbols-outlined text-base ${arrowColor}`} aria-hidden="true">{arrow}</span>
        <span className="text-xs font-mono tabular-nums text-on-surface">{formatSigned(histogram, 2)}</span>
      </div>
      <span className="text-xs font-mono text-on-surface-variant">
        line: {formatNum(line, 2)} · sig: {formatNum(signal, 2)}
      </span>
    </div>
  );
}

// ── Cell 3: MA Stack ──────────────────────────────────────────────────

function MaStack({
  price, sma50, sma200,
}: { price: number | null; sma50: number | null; sma200: number | null }) {
  const items: Array<{ label: string; v: number | null; barColor: string }> = [
    { label: 'PRICE',  v: price,  barColor: 'bg-on-surface' },
    { label: 'SMA50',  v: sma50,  barColor: 'bg-primary' },
    { label: 'SMA200', v: sma200, barColor: 'bg-tertiary' },
  ];
  // Sort desc by value (nulls sink to bottom)
  const sorted = [...items].sort((a, b) => {
    if (a.v == null && b.v == null) return 0;
    if (a.v == null) return 1;
    if (b.v == null) return -1;
    return b.v - a.v;
  });

  // Regime: BULLISH if PRICE > SMA50 > SMA200 strict; BEARISH if reverse strict; else MIXED
  let regime: string = 'MIXED';
  if (price != null && sma50 != null && sma200 != null) {
    if (price > sma50 && sma50 > sma200) regime = 'BULLISH STACK';
    else if (price < sma50 && sma50 < sma200) regime = 'BEARISH STACK';
    else regime = 'MIXED';
  }
  const regimeColor =
    regime === 'BULLISH STACK' ? 'text-secondary' :
    regime === 'BEARISH STACK' ? 'text-error' :
    'text-on-surface-variant';

  return (
    <div className="flex flex-col gap-2" title="Price > SMA50 > SMA200 = bullish trend regime. Reverse = bearish. Mixed = transitional.">
      <span className="text-[10px] tracking-widest uppercase text-on-surface-variant">MA STACK</span>
      <div className="flex flex-col gap-1">
        {sorted.map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <div className={`w-12 h-0.5 ${item.barColor}`} aria-hidden="true" />
            <span className="text-xs font-mono text-on-surface-variant min-w-[3.5rem]">{item.label}</span>
            <span className="text-xs font-mono tabular-nums text-on-surface">{formatNum(item.v, 2)}</span>
          </div>
        ))}
      </div>
      <span className={`text-[10px] tracking-widest uppercase ${regimeColor}`}>{regime}</span>
    </div>
  );
}

// ── Cell 4: Volume Ratio ──────────────────────────────────────────────

function VolumeRatio({ ratio }: { ratio: number | null }) {
  const v = ratio ?? null;

  // Bar fill: anchored at center (50%, =1.0×). Right fill if >1.0 (max-out at 3.0×),
  // left fill if <1.0 (max-out at 0.0×).
  let fillStyle: React.CSSProperties = {};
  let fillColor = '';
  if (v != null) {
    if (v >= 1.0) {
      const pct = Math.min((v - 1.0) / 2.0, 1) * 50; // 0..50%
      fillStyle = { left: '50%', width: `${pct}%` };
      fillColor = 'bg-secondary';
    } else {
      const pct = Math.min((1.0 - v) / 1.0, 1) * 50; // 0..50%
      fillStyle = { right: '50%', width: `${pct}%` };
      fillColor = 'bg-error/60';
    }
  }

  return (
    <div className="flex flex-col gap-2" title="Today's volume / 20-day average. Confirming volume on a breakout = >1.5×. <0.5× on a price move is suspicious.">
      <span className="text-[10px] tracking-widest uppercase text-on-surface-variant">VOLUME RATIO</span>
      <div>
        <span className="text-2xl font-mono tabular-nums text-on-surface">{v != null ? v.toFixed(1) : '—'}</span>
        <span className="text-on-surface-variant ml-0.5">×</span>
      </div>
      <div className="relative w-full h-2 bg-surface-container-highest rounded-sm">
        {v != null && (
          <div className={`absolute top-0 h-2 ${fillColor} rounded-sm`} style={fillStyle} aria-hidden="true" />
        )}
        {/* Center divider at 1.0× */}
        <div
          className="absolute top-0 h-2 w-0.5 bg-outline"
          style={{ left: '50%' }}
          aria-hidden="true"
        />
      </div>
      <span className="text-[10px] font-mono text-on-surface-variant">vs 20-day avg</span>
    </div>
  );
}

// ── Card body ─────────────────────────────────────────────────────────

export function TechnicalSignalsCard({ tech }: TechnicalSignalsCardProps) {
  if (!tech) return null;

  const insufficient = tech.bar_count < 200;
  const patternInfo = tech.tech_pattern ? TECH_PATTERN_LABELS[tech.tech_pattern] : null;

  return (
    <section
      className={`bg-surface-container border border-surface-container-high p-6 rounded-lg ${insufficient ? 'opacity-50' : ''}`}
      data-testid="technical-signals-card"
    >
      <header className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-base" aria-hidden="true">show_chart</span>
          <h2 className="text-[10px] tracking-widest uppercase font-bold">TECHNICAL SIGNALS</h2>
        </div>
        <span className="text-[10px] font-mono text-on-surface-variant">via Yahoo · {tech.bar_count} daily bars</span>
      </header>

      {insufficient ? (
        <div className="text-center py-6 text-xs font-mono text-on-surface-variant">
          INSUFFICIENT DATA — need 200+ bars for SMA(200)
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <RsiGauge rsi={tech.rsi_14} />
            <MacdDirection
              histogram={tech.macd_histogram}
              line={tech.macd_line}
              signal={tech.macd_signal}
            />
            <MaStack
              // The TechnicalSnapshot doesn't carry the spot price separately;
              // use sma_50 as a proxy when SMA50 ≈ price isn't possible. The
              // upstream pipeline passes the live price via tech.sma_50 ≈ close
              // is NOT guaranteed — we use null when the snapshot does not
              // expose a separate close, falling back to MIXED regime.
              price={null}
              sma50={tech.sma_50}
              sma200={tech.sma_200}
            />
            <VolumeRatio ratio={tech.volume_ratio} />
          </div>

          {patternInfo && (
            <footer className="border-t border-surface-container-high pt-4 mt-4 flex justify-between items-baseline gap-4">
              <span className="text-base font-bold tracking-widest uppercase text-on-surface">{patternInfo.label}</span>
              <span className="text-xs text-on-surface-variant text-right">{patternInfo.explainer}</span>
            </footer>
          )}
        </>
      )}
    </section>
  );
}

export default TechnicalSignalsCard;
