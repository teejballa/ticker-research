'use client';

// src/app/research/[ticker]/page.tsx
// Research page — chart confirmation → analysis → report.

import { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import ChartConfirmation from '@/components/ChartConfirmation';
import ResearchProgress from '@/components/ResearchProgress';
import ResearchReport from '@/components/ResearchReport';
import NavBar from '@/components/NavBar';
import FooterTicker from '@/components/FooterTicker';
import type { ChartDataPoint, AnalysisResult, StoredReport } from '@/lib/types';

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
  const params       = useParams<{ ticker: string }>();
  const searchParams = useSearchParams();
  const ticker       = params.ticker?.toUpperCase() ?? '';
  const filePath     = searchParams.get('file');
  const reportFile   = searchParams.get('report');

  const [pageState,      setPageState]      = useState<PageState>(filePath ? 'analyzing' : 'loading');
  const [chartData,      setChartData]      = useState<ChartRouteResponse | null>(null);
  const [chartError,     setChartError]     = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [errorMessage,   setErrorMessage]   = useState<string | null>(null);

  // Load saved report when ?report= param is present.
  // This branch is mutually exclusive with the analysis pipeline (?file= param).
  // Check reportFile BEFORE any other state machine logic.
  useEffect(() => {
    if (!reportFile) return;
    // If we have a reportFile, set state to loading while we fetch
    setPageState('loading');
    fetch(`/api/history/${encodeURIComponent(reportFile)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`Report not found: ${r.status}`);
        return r.json() as Promise<StoredReport>;
      })
      .then((stored) => {
        setAnalysisResult(stored.analysis);
        setPageState('complete');
        window.scrollTo({ top: 0, behavior: 'instant' });
      })
      .catch(() => {
        setErrorMessage(`Report "${reportFile}" could not be loaded. The file may have been deleted.`);
        setPageState('error');
      });
  }, [reportFile]); // eslint-disable-line react-hooks/exhaustive-deps

  // When filePath appears via router.push (after data collection), trigger analysis
  useEffect(() => {
    if (reportFile) return;  // saved report branch takes priority
    if (filePath && pageState === 'idle') {
      setPageState('analyzing');
    }
  }, [filePath, pageState, reportFile]);

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
    if (reportFile) return;  // saved report branch handles everything
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
  }, [ticker, filePath, reportFile]);

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
      <div className="flex flex-col min-h-screen bg-surface">
        <NavBar ticker={ticker} showSubBar />
        <main className="flex-1 flex flex-col items-center justify-center px-4 py-10">
          <ResearchProgress
            ticker={ticker}
            filePath={filePath}
            onComplete={handleComplete}
            onError={handleError}
          />
        </main>
        <FooterTicker />
      </div>
    );
  }

  // ── Complete ─────────────────────────────────────────────
  if (pageState === 'complete' && analysisResult) {
    return (
      <div className="report-omre" data-testid="report-page-wrapper">
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
      <div className="flex flex-col min-h-screen bg-surface">
        <NavBar />
        <main className="flex-1 flex flex-col items-center justify-center px-4">
          <div className="w-full max-w-md bg-surface-container border border-outline-variant/20 p-6 fade-in">
            <div className="text-[10px] text-error/60 tracking-[0.4em] mb-4">SYSTEM ERROR</div>
            <h1 className="text-sm text-on-surface font-bold tracking-[0.2em] mb-2">ANALYSIS FAILED</h1>
            {isRateLimit ? (
              <p className="text-xs text-on-surface-variant leading-relaxed mb-5">
                NotebookLM daily limit reached. Resets at midnight PST — try again tomorrow.
              </p>
            ) : (
              <p className="text-xs text-on-surface-variant leading-relaxed mb-5">
                {errorMessage ?? 'An unexpected error occurred during analysis.'}
              </p>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleTryAgain}
                className="flex-1 py-2 bg-primary-container text-on-primary-container font-bold text-xs tracking-[0.2em] uppercase transition-colors hover:opacity-90"
              >
                TRY AGAIN
              </button>
              <Link
                href="/"
                className="flex-1 py-2 text-center border border-outline-variant/30 hover:border-outline text-on-surface-variant hover:text-on-surface text-xs tracking-[0.2em] uppercase transition-all"
              >
                ← HOME
              </Link>
            </div>
          </div>
        </main>
        <FooterTicker />
      </div>
    );
  }

  // ── Loading ──────────────────────────────────────────────
  if (pageState === 'loading') {
    return (
      <div className="flex flex-col min-h-screen bg-surface">
        <NavBar />
        <main className="flex-1 flex flex-col items-center justify-center px-4">
          <div className="flex flex-col items-center gap-4 fade-in">
            <span className="text-primary text-sm tracking-[0.3em]">EQUINFO</span>
            <span className="w-4 h-4 border border-primary/40 border-t-transparent rounded-full animate-spin" />
            <span className="text-[10px] text-outline tracking-widest">
              LOADING {ticker}...
            </span>
          </div>
        </main>
        <FooterTicker />
      </div>
    );
  }

  // ── Ticker not found ─────────────────────────────────────
  if (chartError || !chartData) {
    return (
      <div className="flex flex-col min-h-screen bg-surface">
        <NavBar />
        <main className="flex-1 flex flex-col items-center justify-center px-4">
          <div className="w-full max-w-md bg-surface-container border border-outline-variant/20 p-6 fade-in">
            <div className="text-[10px] text-tertiary/60 tracking-[0.4em] mb-4">LOOKUP FAILED</div>
            <h1 className="text-sm text-on-surface font-bold tracking-[0.2em] mb-2">TICKER NOT FOUND</h1>
            <p className="text-xs text-on-surface-variant leading-relaxed mb-1">
              <span className="text-outline font-bold tracking-wider">{ticker}</span> could not be found in the database.
              Please verify the symbol and try again.
            </p>
            {chartError && (
              <p className="text-[10px] text-error/50 mt-1 mb-4">// {chartError}</p>
            )}
            <Link
              href="/"
              className="inline-flex items-center px-4 py-2 bg-primary-container text-on-primary-container font-bold text-xs tracking-[0.2em] uppercase transition-colors hover:opacity-90 mt-3"
            >
              ← BACK TO SEARCH
            </Link>
          </div>
        </main>
        <FooterTicker />
      </div>
    );
  }

  // ── Idle: chart confirmation ──────────────────────────────
  return (
    <div className="flex flex-col min-h-screen bg-surface">
      <NavBar ticker={ticker} showSubBar />
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
      <FooterTicker />
    </div>
  );
}
