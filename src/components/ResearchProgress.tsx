'use client';

// src/components/ResearchProgress.tsx
// Stitch ambient loading screen for the analysis pipeline.
// ALL streaming/parsing/callback logic is unchanged — only JSX was replaced.

import { useEffect, useRef, useState } from 'react';
import type { AnalysisResult } from '@/lib/types';
import NavBar from '@/components/NavBar';
import FooterTicker from '@/components/FooterTicker';

interface ResearchProgressProps {
  ticker: string;
  filePath: string;
  onComplete: (result: AnalysisResult) => void;
  onError: (message: string) => void;
  onRetry?: () => void;
}

function classifyError(message: string): 'session-expired' | 'container-unreachable' | 'timeout' | 'unknown' {
  const m = message.toLowerCase();
  if (
    m.includes('authentication expired') ||
    m.includes('auth') && (m.includes('expired') || m.includes('invalid')) ||
    m.includes('not connected') ||
    m.includes('accounts.google.com')
  ) return 'session-expired';
  if (m.includes('unreachable') || m.includes('connection') || m.includes('econnrefused') || m.includes('failed to fetch')) return 'container-unreachable';
  if (m.includes('timeout') || m.includes('taking longer')) return 'timeout';
  return 'unknown';
}

const ERROR_COPY: Record<string, { message: string; cta: string; ctaHref: string }> = {
  'session-expired': {
    message: 'Your session expired. Sign in again to continue.',
    cta: 'Sign in',
    ctaHref: '/dashboard',
  },
  'container-unreachable': {
    message: 'Analysis service unreachable. Try again in a moment.',
    cta: 'Retry',
    ctaHref: '',
  },
  'timeout': {
    message: 'Analysis is taking longer than expected. You can wait or retry.',
    cta: 'Retry',
    ctaHref: '',
  },
  'unknown': {
    message: 'Analysis failed. If this continues, sign in again.',
    cta: 'Sign in',
    ctaHref: '/dashboard',
  },
};

interface Step {
  label: string;
  status: 'pending' | 'active' | 'done';
  startedAt?: number;
  elapsedMs?: number;
}

const INITIAL_STEPS: Step[] = [
  { label: 'Creating notebook',     status: 'pending' },
  { label: 'Adding market data',    status: 'pending' },
  { label: 'Adding news sources',   status: 'pending' },
  { label: 'Querying sentiment',    status: 'pending' },
  { label: 'Generating assessment', status: 'pending' },
  { label: 'Cleaning up',          status: 'pending' },
];

function matchStepIndex(message: string): number {
  const lower = message.toLowerCase();
  if (lower.includes('creating'))         return 0;
  if (lower.includes('adding market'))    return 1;
  if (lower.includes('adding news'))      return 2;
  if (
    lower.includes('querying sentiment') ||
    lower.includes('querying bullish')   ||
    lower.includes('querying bearish')   ||
    lower.includes('querying assessment')
  ) return 3;
  if (lower.includes('querying confidence') || lower.includes('querying sources')) return 4;
  if (lower.includes('cleaning'))         return 5;
  return -1;
}

// Maps the 6 internal pipeline steps to 4 visual steps
// 0 → visual 0 (Collecting market data)
// 1,2 → visual 1 (Gathering news & filings)
// 3,4 → visual 2 (Synthesizing with Gemini)
// 5 → visual 3 (Generating report)
function toVisualStep(pipelineStepIndex: number): number {
  if (pipelineStepIndex <= 0) return 0;
  if (pipelineStepIndex <= 2) return 1;
  if (pipelineStepIndex <= 4) return 2;
  return 3;
}

const STEP_LABELS = [
  'Pulling market data',
  'Gathering filings & news',
  'Reading sources & extracting drivers',
  'Generating report',
];

export default function ResearchProgress({
  ticker,
  filePath,
  onComplete,
  onError,
  onRetry,
}: ResearchProgressProps) {
  const [steps, setSteps]           = useState<Step[]>(INITIAL_STEPS);
  const [logLines, setLogLines]     = useState<string[]>([]);
  const [errorMessage, setErrorMsg] = useState<string | null>(null);
  const onCompleteRef               = useRef(onComplete);
  const onErrorRef                  = useRef(onError);

  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);
  useEffect(() => { onErrorRef.current    = onError;    }, [onError]);

  useEffect(() => {
    const controller = new AbortController();

    async function run() {
      try {
        const response = await fetch(`/api/analysis/${encodeURIComponent(ticker)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          const msg = 'Failed to connect to analysis service.';
          setErrorMsg(msg);
          onErrorRef.current(msg);
          return;
        }

        const reader  = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer    = '';

        while (!controller.signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const jsonStr = line.slice('data: '.length).trim();
            if (!jsonStr) continue;

            try {
              const event = JSON.parse(jsonStr) as
                | { type: 'progress'; message: string }
                | { type: 'result';   data: AnalysisResult }
                | { type: 'error';    message: string };

              if (event.type === 'progress') {
                setLogLines((prev) => [...prev, event.message]);
                const idx = matchStepIndex(event.message);
                if (idx >= 0) {
                  const now = Date.now();
                  setSteps((prev) =>
                    prev.map((step, i) => {
                      if (i < idx) {
                        const elapsed = step.startedAt ? now - step.startedAt : undefined;
                        return { ...step, status: 'done', elapsedMs: elapsed };
                      }
                      if (i === idx) return { ...step, status: 'active', startedAt: now };
                      return step;
                    })
                  );
                }
              } else if (event.type === 'result') {
                setSteps((prev) => prev.map((s) => ({ ...s, status: 'done' })));
                onCompleteRef.current(event.data);
                return;
              } else if (event.type === 'error') {
                setErrorMsg(event.message);
                onErrorRef.current(event.message);
                return;
              }
            } catch {
              // skip malformed lines
            }
          }
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          const msg = err instanceof Error ? err.message : 'Analysis failed unexpectedly.';
          setErrorMsg(msg);
          onErrorRef.current(msg);
        }
      }
    }

    run();
    return () => { controller.abort(); };
  }, [ticker, filePath]);

  function renderError(msg: string) {
    const kind = classifyError(msg);
    const { message, cta, ctaHref } = ERROR_COPY[kind];
    return (
      <div className="relative z-10 w-full max-w-md px-6 mt-3">
        <p className="text-xs text-error/70">{message}</p>
        <div className="mt-2">
          {ctaHref ? (
            <a
              href={ctaHref}
              className="text-[10px] font-bold tracking-widest uppercase text-error/60 border border-error/40 px-2 py-1 hover:text-error transition-colors"
            >
              {cta}
            </a>
          ) : (
            <button
              type="button"
              onClick={onRetry}
              className="text-[10px] font-bold tracking-widest uppercase text-error/60 border border-error/40 px-2 py-1 hover:text-error transition-colors"
            >
              {cta}
            </button>
          )}
        </div>
      </div>
    );
  }

  // Derive current visual step index from pipeline steps state
  const activePipelineIndex = steps.findIndex((s) => s.status === 'active');
  const doneCount           = steps.filter((s) => s.status === 'done').length;
  // If all done, visual step is 4 (past last); if nothing active yet, use doneCount
  const currentStepIndex    = activePipelineIndex >= 0
    ? toVisualStep(activePipelineIndex)
    : doneCount >= steps.length
      ? STEP_LABELS.length
      : toVisualStep(doneCount);

  return (
    <div className="flex flex-col min-h-screen bg-surface text-on-surface">
      <NavBar />

      {/* Main Loading Canvas */}
      <main className="relative flex-1 flex flex-col items-center justify-center bg-surface overflow-hidden pt-[56px] pb-[32px]">
        {/* Background Ambient Glow */}
        <div className="absolute inset-0 loading-pulse pointer-events-none" />

        {/* Central Ticker Identity */}
        <div className="relative z-10 flex flex-col items-center mb-16">
          <div className="text-[64px] font-mono font-bold tracking-tighter text-primary ticker-glow ticker-scan relative">
            {ticker}
          </div>
          <div className="mt-4 text-sm font-medium text-on-surface-variant flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <span className="tracking-wide uppercase text-[11px] font-bold">Researching {ticker}...</span>
          </div>
        </div>

        {/* Analysis Process Stepper */}
        <div className="relative z-10 w-full max-w-md px-6">
          <div className="relative flex flex-col gap-8">
            {/* Vertical Progress Line */}
            <div className="absolute left-[11px] top-2 bottom-2 w-[2px] bg-surface-container-highest overflow-hidden data-flow-line">
              <div
                className="w-full bg-gradient-to-b from-secondary via-primary to-primary transition-all duration-500"
                style={{ height: `${(currentStepIndex / (STEP_LABELS.length - 1)) * 100}%` }}
              />
            </div>

            {STEP_LABELS.map((label, i) => {
              const isDone    = i < currentStepIndex;
              const isActive  = i === currentStepIndex;
              const isPending = i > currentStepIndex;

              return (
                <div
                  key={i}
                  className={`flex items-start gap-4 transition-all duration-500 ${isPending ? 'opacity-30' : ''} ${isActive ? 'step-pulse' : ''}`}
                >
                  {/* Step icon */}
                  {isDone && (
                    <div className="relative z-20 flex items-center justify-center w-6 h-6 rounded-full bg-secondary shadow-[0_0_15px_rgba(102,217,204,0.3)] text-on-secondary shrink-0">
                      <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>
                    </div>
                  )}
                  {isActive && (
                    <div className="relative z-20 flex items-center justify-center w-6 h-6 rounded-full bg-primary-container text-on-primary-container shadow-[0_0_10px_rgba(41,98,255,0.4)] shrink-0">
                      <span className="material-symbols-outlined text-[16px] animate-spin" style={{ animationDuration: '1s', animationTimingFunction: 'linear' }}>sync</span>
                    </div>
                  )}
                  {isPending && (
                    <div className="relative z-20 flex items-center justify-center w-6 h-6 rounded-full border-2 border-outline-variant bg-surface-container shrink-0">
                      <span className="material-symbols-outlined text-[16px] text-outline-variant">circle</span>
                    </div>
                  )}

                  {/* Step text */}
                  <div className="flex flex-col">
                    <span className="text-[11px] font-bold text-on-surface uppercase tracking-widest">{label}</span>
                    {isDone    && <span className="text-[10px] font-mono text-secondary">COMPLETE</span>}
                    {isActive  && <span className="text-[10px] font-mono text-primary animate-pulse">PROCESSING...</span>}
                    {isPending && <span className="text-[10px] font-mono text-outline-variant">QUEUED</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Inline cloud error state */}
        {errorMessage && renderError(errorMessage)}

      </main>

      <FooterTicker />
    </div>
  );
}
