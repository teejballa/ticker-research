'use client';

// src/app/research/[ticker]/page.tsx
// Research page — chart confirmation → analysis → report.

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

// ── Shared nav bar ────────────────────────────────────────

function NavBar({ label }: { label?: string }) {
  return (
    <header className="border-b border-[#0d1a27] bg-[#080a0f] h-11 flex items-center px-5 shrink-0">
      <div className="flex items-center gap-3">
        <Link href="/" className="text-[#f59e0b] font-bold text-base tracking-[0.22em] glow-amber-text">
          EQUINFO
        </Link>
        {label && (
          <>
            <span className="text-[#0d1a27]">│</span>
            <span className="text-[#1a2a3a] text-[10px] tracking-widest">{label}</span>
          </>
        )}
      </div>
    </header>
  );
}

export default function ResearchPage() {
  const params       = useParams<{ ticker: string }>();
  const searchParams = useSearchParams();
  const ticker       = params.ticker?.toUpperCase() ?? '';
  const filePath     = searchParams.get('file');

  const [pageState,      setPageState]      = useState<PageState>(filePath ? 'analyzing' : 'loading');
  const [chartData,      setChartData]      = useState<ChartRouteResponse | null>(null);
  const [chartError,     setChartError]     = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [errorMessage,   setErrorMessage]   = useState<string | null>(null);

  // When filePath appears via router.push (after data collection), trigger analysis
  useEffect(() => {
    if (filePath && pageState === 'idle') {
      setPageState('analyzing');
    }
  }, [filePath, pageState]);

  // Warn before unload during analysis
  useEffect(() => {
    if (pageState !== 'analyzing') return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [pageState]);

  // Fetch chart for idle state
  useEffect(() => {
    if (filePath) return;
    async function fetchChart() {
      try {
        const res  = await fetch(`/api/ticker/chart?symbol=${encodeURIComponent(ticker)}`, { cache: 'no-store' });
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
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  const handleError = useCallback((message: string) => {
    setErrorMessage(message);
    setPageState('error');
  }, []);

  const handleTryAgain = useCallback(() => {
    setErrorMessage(null);
    setAnalysisResult(null);
    setPageState('loading');
    window.location.href = `/research/${encodeURIComponent(ticker)}`;
  }, [ticker]);

  // ── Analyzing ───────────────────────────────────────────
  if (filePath && pageState === 'analyzing') {
    return (
      <div className="flex flex-col min-h-screen bg-[#080a0f] dot-grid">
        <NavBar label={`ANALYZING ${ticker}`} />
        <main className="flex-1 flex flex-col items-center justify-center px-4 py-10">
          <ResearchProgress
            ticker={ticker}
            filePath={filePath}
            onComplete={handleComplete}
            onError={handleError}
          />
        </main>
      </div>
    );
  }

  // ── Complete ─────────────────────────────────────────────
  if (pageState === 'complete' && analysisResult) {
    return (
      <div className="min-h-screen bg-[#080a0f]">
        <ResearchReport analysisResult={analysisResult} ticker={ticker} />
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────
  if (pageState === 'error') {
    const isRateLimit =
      errorMessage?.toLowerCase().includes('daily limit') ||
      errorMessage?.toLowerCase().includes('midnight pst');

    return (
      <div className="flex flex-col min-h-screen bg-[#080a0f] dot-grid">
        <NavBar label="ANALYSIS ERROR" />
        <main className="flex-1 flex flex-col items-center justify-center px-4">
          <div className="w-full max-w-md panel p-6 fade-in">
            <div className="text-[10px] text-[#f59e0b]/50 tracking-[0.4em] mb-4">SYSTEM ERROR</div>
            <h1 className="text-sm text-[#c9d4e0] font-bold tracking-[0.2em] mb-2">ANALYSIS FAILED</h1>
            {isRateLimit ? (
              <p className="text-xs text-[#2a3d52] leading-relaxed mb-5">
                NotebookLM daily limit reached. Resets at midnight PST — try again tomorrow.
              </p>
            ) : (
              <p className="text-xs text-[#2a3d52] leading-relaxed mb-5">
                {errorMessage ?? 'An unexpected error occurred during analysis.'}
              </p>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleTryAgain}
                className="flex-1 py-2 bg-[#f59e0b] hover:bg-[#fbbf24] text-black font-bold text-xs tracking-[0.2em] uppercase transition-colors"
              >
                TRY AGAIN
              </button>
              <Link
                href="/"
                className="flex-1 py-2 text-center border border-[#131e2b] hover:border-[#f59e0b]/25 text-[#1e2d3d] hover:text-[#f59e0b]/50 text-xs tracking-[0.2em] uppercase transition-all"
              >
                ← HOME
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ── Loading ──────────────────────────────────────────────
  if (pageState === 'loading') {
    return (
      <div className="flex flex-col min-h-screen bg-[#080a0f] dot-grid">
        <NavBar />
        <main className="flex-1 flex flex-col items-center justify-center px-4">
          <div className="flex flex-col items-center gap-4 fade-in">
            <span className="text-[#f59e0b] text-sm tracking-[0.3em] glow-amber-text">EQUINFO</span>
            <span className="w-4 h-4 border border-[#f59e0b]/40 border-t-transparent rounded-full animate-spin" />
            <span className="text-[10px] text-[#1a2a3a] tracking-widest">
              LOADING {ticker}...
            </span>
          </div>
        </main>
      </div>
    );
  }

  // ── Ticker not found ─────────────────────────────────────
  if (chartError || !chartData) {
    return (
      <div className="flex flex-col min-h-screen bg-[#080a0f] dot-grid">
        <NavBar label="INSTRUMENT NOT FOUND" />
        <main className="flex-1 flex flex-col items-center justify-center px-4">
          <div className="w-full max-w-md panel p-6 fade-in">
            <div className="text-[10px] text-[#f59e0b]/50 tracking-[0.4em] mb-4">LOOKUP FAILED</div>
            <h1 className="text-sm text-[#c9d4e0] font-bold tracking-[0.2em] mb-2">TICKER NOT FOUND</h1>
            <p className="text-xs text-[#2a3d52] leading-relaxed mb-1">
              <span className="text-[#5a7a8a] font-bold tracking-wider">{ticker}</span> could not be found in the database.
              Please verify the symbol and try again.
            </p>
            {chartError && (
              <p className="text-[10px] text-red-500/50 mt-1 mb-4">// {chartError}</p>
            )}
            <Link
              href="/"
              className="inline-flex items-center px-4 py-2 bg-[#f59e0b] hover:bg-[#fbbf24] text-black font-bold text-xs tracking-[0.2em] uppercase transition-colors mt-3"
            >
              ← BACK TO SEARCH
            </Link>
          </div>
        </main>
      </div>
    );
  }

  // ── Idle: chart confirmation ──────────────────────────────
  return (
    <div className="flex flex-col min-h-screen bg-[#080a0f] dot-grid">
      <NavBar label={ticker} />
      <main className="flex-1 flex flex-col items-center justify-start px-4 py-8">
        <ChartConfirmation
          ticker={ticker}
          chartData={chartData.points}
          meta={{
            companyName:   chartData.companyName,
            currentPrice:  chartData.currentPrice,
            percentChange: chartData.percentChange,
            marketCap:     chartData.marketCap,
            exchange:      chartData.exchange,
            sector:        chartData.sector,
          }}
        />
      </main>
    </div>
  );
}
