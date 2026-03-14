'use client';

// src/components/ResearchProgress.tsx
// Streaming progress display for the NotebookLM analysis pipeline.
// On mount: POSTs to /api/analysis/[ticker], reads SSE stream, updates step list.
// On result: calls onComplete(result) — parent handles auto-transition.
// On error: calls onError(message) — parent handles error display.

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
}

const INITIAL_STEPS: Step[] = [
  { label: 'Creating notebook', status: 'pending' },
  { label: 'Adding market data', status: 'pending' },
  { label: 'Adding news sources', status: 'pending' },
  { label: 'Querying sentiment', status: 'pending' },
  { label: 'Generating assessment', status: 'pending' },
  { label: 'Cleaning up', status: 'pending' },
];

/**
 * Map a PROGRESS: message to a step index (0-based).
 * Matching is done via substring so partial message text works.
 */
function matchStepIndex(message: string): number {
  const lower = message.toLowerCase();
  if (lower.includes('creating')) return 0;
  if (lower.includes('adding market')) return 1;
  if (lower.includes('adding news')) return 2;
  if (lower.includes('querying sentiment') || lower.includes('querying bullish') || lower.includes('querying bearish') || lower.includes('querying assessment')) return 3;
  if (lower.includes('querying confidence') || lower.includes('querying sources')) return 4;
  if (lower.includes('cleaning')) return 5;
  return -1;
}

export default function ResearchProgress({
  ticker,
  filePath,
  onComplete,
  onError,
}: ResearchProgressProps) {
  const [steps, setSteps] = useState<Step[]>(INITIAL_STEPS);
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);

  // Keep refs current so effects don't have stale closures
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    let cancelled = false;

    async function startAnalysis() {
      try {
        const response = await fetch(`/api/analysis/${encodeURIComponent(ticker)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath }),
        });

        if (!response.ok || !response.body) {
          onErrorRef.current('Failed to connect to analysis service.');
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (!cancelled) {
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
                | { type: 'result'; data: AnalysisResult }
                | { type: 'error'; message: string };

              if (event.type === 'progress') {
                const idx = matchStepIndex(event.message);
                if (idx >= 0) {
                  setSteps((prev) =>
                    prev.map((step, i) => {
                      if (i < idx) return { ...step, status: 'done' };
                      if (i === idx) return { ...step, status: 'active' };
                      return step;
                    })
                  );
                }
              } else if (event.type === 'result') {
                // Mark all steps done
                setSteps((prev) => prev.map((step) => ({ ...step, status: 'done' })));
                onCompleteRef.current(event.data);
                return;
              } else if (event.type === 'error') {
                onErrorRef.current(event.message);
                return;
              }
            } catch {
              // Malformed JSON line — skip
            }
          }
        }
      } catch (err) {
        if (!cancelled) {
          onErrorRef.current(err instanceof Error ? err.message : 'Analysis failed unexpectedly.');
        }
      }
    }

    startAnalysis();

    return () => {
      cancelled = true;
    };
  }, [ticker, filePath]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-800 mb-4">Analyzing {ticker}...</h2>
      <ul className="space-y-3">
        {steps.map((step, i) => (
          <li key={i} className="flex items-center gap-3 text-sm">
            {step.status === 'done' ? (
              <span className="text-green-600 font-bold w-5 text-center">&#x2713;</span>
            ) : step.status === 'active' ? (
              <span
                className="animate-spin inline-block w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full"
                aria-label="loading"
              />
            ) : (
              <span className="text-gray-300 w-5 text-center">&#x25CB;</span>
            )}
            <span
              className={
                step.status === 'done'
                  ? 'text-gray-800'
                  : step.status === 'active'
                    ? 'text-blue-700 font-medium'
                    : 'text-gray-400'
              }
            >
              {step.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
