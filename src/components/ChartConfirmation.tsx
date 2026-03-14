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

interface PipelineResult {
  filePath: string;
  assembled_at: string;
  collection_errors: string[];
}

function formatMarketCap(value: number | null): string {
  if (value == null) return '—';
  if (value >= 1e12) return `$${(value / 1e12).toFixed(1)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  return `$${value.toLocaleString()}`;
}

export default function ChartConfirmation({ ticker, chartData, meta }: ChartConfirmationProps) {
  const router = useRouter();
  const { companyName, currentPrice, percentChange, marketCap, exchange, sector } = meta;

  const [isRunning, setIsRunning] = useState(false);
  const [pipelineResult, setPipelineResult] = useState<PipelineResult | null>(null);
  const [pipelineError, setPipelineError] = useState<string | null>(null);

  const priceChangePositive = percentChange != null && percentChange >= 0;
  const priceChangeColor = priceChangePositive ? 'text-emerald-600' : 'text-red-500';
  const priceChangeSign = priceChangePositive ? '+' : '';

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
        setPipelineResult(data);
      }
    } catch (err) {
      setPipelineError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-4">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="text-2xl font-bold text-gray-900">{companyName}</h1>
          <span className="font-mono text-sm font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
            {ticker}
          </span>
        </div>
        <div className="flex items-baseline gap-2 mt-1">
          {currentPrice != null ? (
            <>
              <span className="text-3xl font-bold text-gray-900">
                ${currentPrice.toFixed(2)}
              </span>
              {percentChange != null && (
                <span className={`text-base font-semibold ${priceChangeColor}`}>
                  {priceChangeSign}{(percentChange * 100).toFixed(2)}%
                </span>
              )}
            </>
          ) : (
            <span className="text-gray-400">Price unavailable</span>
          )}
        </div>
      </div>

      {/* Chart */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4">
        <PriceLineChart data={chartData} />
        <p className="text-xs text-gray-400 mt-2 text-right">1-month price history</p>
      </div>

      {/* Metadata */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">Market Cap</p>
          <p className="text-sm font-semibold text-gray-800">{formatMarketCap(marketCap)}</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">Exchange</p>
          <p className="text-sm font-semibold text-gray-800">{exchange ?? '—'}</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">Sector</p>
          <p className="text-sm font-semibold text-gray-800 truncate">{sector ?? '—'}</p>
        </div>
      </div>

      {/* Pipeline success state */}
      {pipelineResult && (
        <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
          <p className="text-sm font-semibold text-emerald-800 mb-2">Research data collected.</p>
          <p className="text-xs text-emerald-700 mb-1">
            Phase 2 analysis will continue from here. Source package written to:
          </p>
          <code className="block text-xs font-mono text-emerald-900 bg-emerald-100 rounded px-2 py-1 break-all">
            {pipelineResult.filePath}
          </code>
          {pipelineResult.collection_errors.length > 0 && (
            <p className="text-xs text-amber-700 mt-2">
              {pipelineResult.collection_errors.length} source(s) had partial errors — check collection_errors in the source package.
            </p>
          )}
        </div>
      )}

      {/* Pipeline error state */}
      {pipelineError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl">
          <p className="text-sm text-red-700">{pipelineError}</p>
        </div>
      )}

      {/* Action buttons */}
      <p className="text-sm text-gray-500 text-center mb-3">
        Confirm this is the correct stock before starting research.
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={isRunning || pipelineResult !== null}
          className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-blue-300 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors duration-150 text-center"
        >
          {isRunning ? 'Running...' : pipelineResult ? 'Data Collected' : 'Confirm & Start Research'}
        </button>
        <button
          type="button"
          onClick={() => router.push('/')}
          className="flex-1 px-6 py-3 border border-gray-300 hover:border-gray-400 text-gray-700 font-semibold rounded-xl transition-colors duration-150 text-center"
        >
          Search Again
        </button>
      </div>
    </div>
  );
}
