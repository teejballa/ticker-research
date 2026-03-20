'use client';

// src/components/ResearchProgress.tsx
// Terminal-style streaming progress display for the NotebookLM analysis pipeline.

import { useEffect, useRef, useState } from 'react';
import type { AnalysisResult } from '@/lib/types';

interface ResearchProgressProps {
  ticker: string;
  filePath: string;
  onComplete: (result: AnalysisResult) => void;
  onError: (message: string) => void;
}

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

function fmtMs(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export default function ResearchProgress({
  ticker,
  filePath,
  onComplete,
  onError,
}: ResearchProgressProps) {
  const [steps, setSteps] = useState<Step[]>(INITIAL_STEPS);
  const [totalMs, setTotalMs] = useState(0);
  const startRef      = useRef(Date.now());
  const onCompleteRef = useRef(onComplete);
  const onErrorRef    = useRef(onError);

  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);
  useEffect(() => { onErrorRef.current    = onError;    }, [onError]);

  // Elapsed ticker
  useEffect(() => {
    const id = setInterval(() => setTotalMs(Date.now() - startRef.current), 100);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    // AbortController cancels the in-flight fetch on cleanup, preventing React 18
    // StrictMode's double-invocation from spawning two server-side analyses.
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
          onErrorRef.current('Failed to connect to analysis service.');
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
          onErrorRef.current(err instanceof Error ? err.message : 'Analysis failed unexpectedly.');
        }
      }
    }

    run();
    return () => { controller.abort(); };
  }, [ticker, filePath]);

  const doneCount  = steps.filter((s) => s.status === 'done').length;
  const progressPct = Math.round((doneCount / steps.length) * 100);

  return (
    <div className="w-full max-w-lg fade-in">

      {/* ── STATUS HEADER ── */}
      <div className="panel p-4 mb-1.5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-[#f59e0b] status-dot-live shrink-0" />
            <span className="text-xs tracking-[0.2em] text-[#f59e0b] font-semibold">
              ANALYZING {ticker}
            </span>
          </div>
          <span className="text-[10px] text-[#2a3d52] tabular-nums">{fmtMs(totalMs)}</span>
        </div>

        {/* Progress bar */}
        <div className="h-px bg-[#0a1520] overflow-hidden">
          <div
            className="h-full bg-[#f59e0b] transition-all duration-500"
            style={{ width: `${progressPct}%`, boxShadow: '0 0 8px rgba(245,158,11,0.4)' }}
          />
        </div>
        <div className="flex justify-between mt-1 text-[9px] text-[#0d1a27]">
          <span>{doneCount}/{steps.length} steps complete</span>
          <span className="tabular-nums">{progressPct}%</span>
        </div>
      </div>

      {/* ── PIPELINE LOG ── */}
      <div className="panel overflow-hidden">
        <div className="px-4 py-2 border-b border-[#0a1015] flex items-center gap-2">
          <span className="text-[9px] text-[#0d1a27] tracking-[0.35em] select-none">PIPELINE LOG</span>
          <div className="flex-1 h-px bg-[#080e17]" />
        </div>

        <div className="p-4 space-y-3">
          {steps.map((step, i) => (
            <div
              key={i}
              className={`flex items-center gap-3 text-xs transition-opacity duration-400 ${
                step.status === 'pending' ? 'opacity-20' : 'opacity-100'
              }`}
            >
              {/* Indicator */}
              <div className="w-4 shrink-0 flex justify-center">
                {step.status === 'done' ? (
                  <span className="text-emerald-500/80 text-sm">✓</span>
                ) : step.status === 'active' ? (
                  <span className="w-3 h-3 border border-[#f59e0b]/70 border-t-transparent rounded-full animate-spin inline-block" />
                ) : (
                  <span className="text-[#0d1a27]">○</span>
                )}
              </div>

              {/* Label */}
              <span
                className={
                  step.status === 'done'
                    ? 'text-[#2a4a3a]'
                    : step.status === 'active'
                    ? 'text-[#f59e0b]'
                    : 'text-[#131e2b]'
                }
              >
                {step.label}
              </span>

              {/* Meta */}
              <div className="ml-auto flex items-center gap-3 text-[9px]">
                {step.elapsedMs != null && (
                  <span className="text-[#1a2a3a] tabular-nums">{fmtMs(step.elapsedMs)}</span>
                )}
                <span className="text-[#0a1015] tabular-nums">
                  {String(i + 1).padStart(2, '0')}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer warning */}
      <div className="mt-2.5 text-center text-[9px] text-[#0a1520] tracking-widest select-none">
        DO NOT CLOSE THIS TAB — ANALYSIS IN PROGRESS
      </div>

    </div>
  );
}
