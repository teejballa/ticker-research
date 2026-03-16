'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import PriceLineChart from './PriceLineChart';
import type { ChartDataPoint } from '@/lib/types';

interface ChartMeta {
  companyName: string;
  currentPrice: number | null;
  percentChange: number | null;
  marketCap: number | null;
  exchange: string | null;
  sector: string | null;
}

interface ChartConfirmationProps {
  ticker: string;
  chartData: ChartDataPoint[];
  meta: ChartMeta;
}

function formatMarketCap(value: number | null): string {
  if (value == null) return '—';
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9)  return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6)  return `$${(value / 1e6).toFixed(1)}M`;
  return `$${value.toLocaleString()}`;
}

interface StatCellProps {
  label: string;
  value: string;
  accent?: boolean;
  positive?: boolean;
  negative?: boolean;
}

function StatCell({ label, value, accent, positive, negative }: StatCellProps) {
  const valueColor = accent
    ? 'text-[#f59e0b]'
    : positive
    ? 'text-emerald-400'
    : negative
    ? 'text-red-400'
    : 'text-[#5a7a8a]';

  return (
    <div className="panel px-3 py-2.5">
      <div className="text-[9px] text-[#1a2a3a] tracking-[0.28em] mb-1">{label}</div>
      <div className={`text-sm font-bold tabular-nums ${valueColor}`}>{value}</div>
    </div>
  );
}

export default function ChartConfirmation({ ticker, chartData, meta }: ChartConfirmationProps) {
  const router = useRouter();
  const { companyName, currentPrice, percentChange, marketCap, exchange, sector } = meta;

  const [isRunning, setIsRunning] = useState(false);
  const [pipelineError, setPipelineError] = useState<string | null>(null);

  const priceUp = percentChange != null && percentChange >= 0;
  const pctSign = priceUp ? '+' : '';
  const pctFormatted = percentChange != null ? `${pctSign}${(percentChange * 100).toFixed(2)}%` : '—';

  async function handleConfirm() {
    setIsRunning(true);
    setPipelineError(null);
    try {
      const res = await fetch(`/api/research/${ticker}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmed: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPipelineError(data.error ?? 'Pipeline failed');
      } else {
        router.push(`/research/${encodeURIComponent(ticker)}?file=${encodeURIComponent(data.filePath)}`);
      }
    } catch (err) {
      setPipelineError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="w-full max-w-2xl mx-auto fade-in">

      {/* ── INSTRUMENT HEADER ── */}
      <div className="panel p-4 mb-1.5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <span className="font-bold text-xl tracking-[0.18em] text-[#f59e0b] glow-amber-text">
                {ticker}
              </span>
              <span className="text-[#0d1a27] text-sm select-none">│</span>
              <span className="text-[#3a5060] text-sm">{companyName}</span>
            </div>
            <div className="flex items-baseline gap-3">
              <span className="text-2xl font-bold tabular-nums text-[#c9d4e0]">
                {currentPrice != null ? `$${currentPrice.toFixed(2)}` : '—'}
              </span>
              <span className={`text-sm font-semibold tabular-nums ${priceUp ? 'text-emerald-400' : 'text-red-400'}`}>
                {priceUp ? '▲' : '▼'} {pctFormatted}
              </span>
            </div>
          </div>
          <div className="text-right text-[10px] space-y-0.5">
            <div className="text-[#0d1a27] tracking-[0.28em]">1M CHART</div>
            <div className="text-[#1a2a3a] tabular-nums">DAILY CLOSE</div>
          </div>
        </div>
      </div>

      {/* ── STATS GRID ── */}
      <div className="grid grid-cols-3 gap-0.5 mb-1.5">
        <StatCell label="MARKET CAP"    value={formatMarketCap(marketCap)} />
        <StatCell label="EXCHANGE"      value={exchange ?? '—'} />
        <StatCell label="SECTOR"        value={sector ?? '—'} />
      </div>

      {/* ── CHART ── */}
      <div className="panel mb-1.5 overflow-hidden">
        <div className="px-3.5 pt-2.5 pb-1 border-b border-[#0a1520] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-[#f59e0b] rounded-full opacity-70" />
            <span className="text-[9px] text-[#1a2a3a] tracking-[0.3em]">PRICE / 1 MONTH</span>
          </div>
          <span className="text-[9px] text-[#0d1a27]">EQUINFO CHART</span>
        </div>
        <PriceLineChart data={chartData} />
      </div>

      {/* ── PIPELINE ERROR ── */}
      {pipelineError && (
        <div className="mb-1.5 px-3.5 py-2 bg-[#0d1117] border border-red-500/25">
          <span className="text-[10px] text-red-400/70">// ERR: {pipelineError}</span>
        </div>
      )}

      {/* ── ACTION PANEL ── */}
      <div className="panel p-3.5">
        <p className="text-[9px] text-[#0d1a27] tracking-[0.3em] text-center mb-3 select-none">
          CONFIRM INSTRUMENT TO BEGIN RESEARCH PIPELINE
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isRunning}
            className="flex-1 py-2.5 bg-[#f59e0b] hover:bg-[#fbbf24] active:bg-[#d97706] disabled:bg-[#131e2b] disabled:text-[#1a2a3a] disabled:cursor-not-allowed text-black font-bold text-xs tracking-[0.2em] uppercase transition-colors duration-150"
          >
            {isRunning ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-3 h-3 border border-black/40 border-t-transparent rounded-full animate-spin" />
                COLLECTING DATA...
              </span>
            ) : (
              'RUN ANALYSIS →'
            )}
          </button>
          <button
            type="button"
            onClick={() => router.push('/')}
            className="px-5 py-2.5 border border-[#131e2b] hover:border-[#f59e0b]/25 text-[#2a3a4a] hover:text-[#f59e0b]/50 text-xs tracking-[0.2em] uppercase transition-all duration-150"
          >
            ← BACK
          </button>
        </div>
      </div>

    </div>
  );
}
