'use client';

// src/app/research/[ticker]/page.tsx
// Research page — handles chart confirmation and analysis flow.
//
// States:
//   idle     — no ?file= param — show existing chart confirmation (fetched client-side)
//   analyzing — ?file= param present, no result yet — show ResearchProgress
//   complete  — AnalysisResult received — show placeholder for Phase 3 report
//   error    — show error message + Try Again button

import { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import ChartConfirmation from '@/components/ChartConfirmation';
import ResearchProgress from '@/components/ResearchProgress';
import ResearchReport from '@/components/ResearchReport';
import type { ChartDataPoint, AnalysisResult } from '@/lib/types';

interface ChartRouteResponse {
  points: ChartDataPoint[];
  companyName: string;
  currentPrice: number | null;
  percentChange: number | null;
  marketCap: number | null;
  exchange: string | null;
  sector: string | null;
  error?: string;
}

type PageState = 'loading' | 'idle' | 'analyzing' | 'complete' | 'error';

export default function ResearchPage() {
  const params = useParams<{ ticker: string }>();
  const searchParams = useSearchParams();
  const ticker = params.ticker?.toUpperCase() ?? '';
  const filePath = searchParams.get('file');

  const [pageState, setPageState] = useState<PageState>(filePath ? 'analyzing' : 'loading');
  const [chartData, setChartData] = useState<ChartRouteResponse | null>(null);
  const [chartError, setChartError] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // beforeunload warning when analysis is in progress
  useEffect(() => {
    if (pageState !== 'analyzing') return;

    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };

    window.addEventListener('beforeunload', handler);
    return () => {
      window.removeEventListener('beforeunload', handler);
    };
  }, [pageState]);

  // Fetch chart data when in idle/loading state (no file param)
  useEffect(() => {
    if (filePath) return; // analysis mode — no chart fetch needed

    async function fetchChart() {
      try {
        const res = await fetch(`/api/ticker/chart?symbol=${encodeURIComponent(ticker)}`, {
          cache: 'no-store',
        });
        const json = (await res.json()) as ChartRouteResponse;
        if (!res.ok || json.error) {
          setChartError(json.error ?? 'Ticker not found');
        } else {
          setChartData(json);
        }
      } catch {
        setChartError('Failed to load chart data. Please try again.');
      } finally {
        setPageState('idle');
      }
    }

    fetchChart();
  }, [ticker, filePath]);

  const handleComplete = useCallback((result: AnalysisResult) => {
    setAnalysisResult(result);
    setPageState('complete');
  }, []);

  const handleError = useCallback((message: string) => {
    setErrorMessage(message);
    setPageState('error');
  }, []);

  const handleTryAgain = useCallback(() => {
    setErrorMessage(null);
    setAnalysisResult(null);
    setPageState('loading');
    // Navigate back to the ticker page without file param
    window.location.href = `/research/${encodeURIComponent(ticker)}`;
  }, [ticker]);

  // Analysis mode — file param present
  if (filePath && pageState === 'analyzing') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-start bg-gray-50 px-4 py-12">
        <div className="w-full max-w-lg">
          <ResearchProgress
            ticker={ticker}
            filePath={filePath}
            onComplete={handleComplete}
            onError={handleError}
          />
        </div>
      </main>
    );
  }

  // Complete state — AnalysisResult received
  if (pageState === 'complete' && analysisResult) {
    return (
      <div className="min-h-screen bg-zinc-950">
        <ResearchReport
          analysisResult={analysisResult}
          ticker={ticker}
        />
      </div>
    );
  }

  // Error state
  if (pageState === 'error') {
    const isRateLimit =
      errorMessage?.toLowerCase().includes('daily limit') ||
      errorMessage?.toLowerCase().includes('midnight pst');

    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md text-center">
          <div className="text-5xl mb-4">&#x26A0;</div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Analysis Failed</h1>
          {isRateLimit ? (
            <p className="text-gray-600 mb-6">
              NotebookLM daily limit reached. Resets at midnight PST &mdash; try again tomorrow.
            </p>
          ) : (
            <p className="text-gray-600 mb-6">
              {errorMessage ?? 'An unexpected error occurred during analysis.'}
            </p>
          )}
          <div className="flex gap-3 justify-center">
            <button
              onClick={handleTryAgain}
              className="inline-flex items-center px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors duration-150"
            >
              Try Again
            </button>
            <Link
              href="/"
              className="inline-flex items-center px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition-colors duration-150"
            >
              Back to Search
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // Loading state
  if (pageState === 'loading') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
        <div className="text-gray-400 text-sm">Loading...</div>
      </main>
    );
  }

  // Idle state — chart confirmation (existing Phase 1 behavior)
  if (chartError || !chartData) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md text-center">
          <div className="text-5xl mb-4">&#x26A0;</div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Ticker Not Found</h1>
          <p className="text-gray-500 mb-6">
            <span className="font-mono font-semibold text-gray-700">{ticker}</span> could not be
            found. Please check the symbol and try again.
          </p>
          {chartError && <p className="text-sm text-red-500 mb-4">{chartError}</p>}
          <Link
            href="/"
            className="inline-flex items-center px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors duration-150"
          >
            Back to Search
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-start bg-gray-50 px-4 py-12">
      <ChartConfirmation
        ticker={ticker}
        chartData={chartData.points}
        meta={{
          companyName: chartData.companyName,
          currentPrice: chartData.currentPrice,
          percentChange: chartData.percentChange,
          marketCap: chartData.marketCap,
          exchange: chartData.exchange,
          sector: chartData.sector,
        }}
      />
    </main>
  );
}
