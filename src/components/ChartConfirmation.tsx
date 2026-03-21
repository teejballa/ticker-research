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
    ? 'text-primary'
    : positive
    ? 'text-secondary'
    : negative
    ? 'text-error'
    : 'text-on-surface-variant';

  return (
    <div className="bg-surface-container-high px-3 py-2.5">
      <div className="text-[9px] text-outline/60 tracking-[0.28em] mb-1">{label}</div>
      <div className={`text-sm font-bold tabular-nums font-mono ${valueColor}`}>{value}</div>
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
      <div className="bg-surface-container border border-outline-variant/20 p-4 mb-1.5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <span className="font-bold text-xl tracking-[0.18em] text-primary font-mono">
                {ticker}
              </span>
              <span className="text-outline-variant text-sm select-none">│</span>
              <span className="text-on-surface-variant text-sm">{companyName}</span>
            </div>
            <div className="flex items-baseline gap-3">
              <span className="text-2xl font-bold tabular-nums text-on-surface font-mono">
                {currentPrice != null ? `$${currentPrice.toFixed(2)}` : '—'}
              </span>
              <span className={`text-sm font-semibold tabular-nums font-mono ${priceUp ? 'text-secondary' : 'text-error'}`}>
                {priceUp ? '▲' : '▼'} {pctFormatted}
              </span>
            </div>
          </div>
          <div className="text-right text-[10px] space-y-0.5">
            <div className="text-outline/60 tracking-[0.28em]">1M CHART</div>
            <div className="text-outline/40 tabular-nums">DAILY CLOSE</div>
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
      <div className="bg-surface-container border border-outline-variant/20 mb-1.5 overflow-hidden">
        <div className="px-3.5 pt-2.5 pb-1 border-b border-outline-variant/20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-primary rounded-full opacity-70" />
            <span className="text-[9px] text-outline/60 tracking-[0.3em]">PRICE / 1 MONTH</span>
          </div>
          <span className="text-[9px] text-outline/40">EQUINFO CHART</span>
        </div>
        <PriceLineChart data={chartData} />
      </div>

      {/* ── PIPELINE ERROR ── */}
      {pipelineError && (
        <div className="mb-1.5 px-3.5 py-2 bg-surface-container border border-error/25">
          <span className="text-[10px] text-error/70">// ERR: {pipelineError}</span>
        </div>
      )}

      {/* ── ACTION PANEL ── */}
      <div className="bg-surface-container border border-outline-variant/20 p-3.5">
        <p className="text-[9px] text-outline/50 tracking-[0.3em] text-center mb-3 select-none">
          CONFIRM INSTRUMENT TO BEGIN RESEARCH PIPELINE
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isRunning}
            className="flex-1 py-2.5 bg-primary-container hover:opacity-90 active:opacity-80 disabled:opacity-30 disabled:cursor-not-allowed text-on-primary-container font-bold text-xs tracking-[0.2em] uppercase transition-opacity duration-150"
          >
            {isRunning ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-3 h-3 border border-on-primary-container/40 border-t-transparent rounded-full animate-spin" />
                COLLECTING DATA...
              </span>
            ) : (
              'RUN ANALYSIS →'
            )}
          </button>
          <button
            type="button"
            onClick={() => router.push('/')}
            className="px-5 py-2.5 border border-outline-variant/30 hover:border-outline text-on-surface-variant hover:text-on-surface text-xs tracking-[0.2em] uppercase transition-all duration-150"
          >
            ← BACK
          </button>
        </div>
      </div>

    </div>
  );
}
