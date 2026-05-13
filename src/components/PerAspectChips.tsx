// @model-card: docs/cards/MODEL-CARD-per-aspect-aggregate.md
// Plan 20-B-05 — Per-aspect bull% chip stack on the Sentiment Snapshot card.
//
// CRITICAL: empty-aspect (bull_pct == null OR n_docs < 3) renders the literal
// em-dash '—' — NEVER '0%' — per T-20-B-05-03. Rendering '0%' would falsely
// communicate "zero bullishness" rather than "zero data", giving the user a
// misleading bear signal.
//
// Layout: flex-wrap so the 7-chip stack wraps to multiple rows on narrow
// viewports (320px mobile) rather than overflowing/clipping (T-20-B-05-04).
'use client';

import type { PerAspectSentimentEntry } from '@/lib/types';

const ASPECT_TOOLTIPS: Record<string, string> = {
  earnings:   'Sentiment from earnings-related documents',
  guidance:   'Sentiment from forward-guidance documents',
  regulatory: 'Sentiment from regulatory / SEC-filing documents',
  'M&A':      'Sentiment from M&A / acquisition documents',
  macro:      'Sentiment from macro / market-environment documents',
  product:    'Sentiment from product / launch documents',
  management: 'Sentiment from management / governance documents',
};

export interface PerAspectChipsProps {
  entries: PerAspectSentimentEntry[] | undefined | null;
}

export function PerAspectChips({ entries }: PerAspectChipsProps) {
  if (!entries || entries.length === 0) return null;
  return (
    <div
      data-testid="per-aspect-chips"
      className="flex flex-wrap gap-2 mt-2"
    >
      {entries.map((e) => {
        // T-20-B-05-03 sentinel — em-dash, never '0%'.
        const display = e.bull_pct == null ? '—' : `${Math.round(e.bull_pct)}%`;
        const hasSignal = e.bull_pct != null;
        return (
          <span
            key={e.aspect}
            data-aspect={e.aspect}
            data-bullpct={e.bull_pct == null ? 'null' : String(e.bull_pct)}
            data-ndocs={String(e.n_docs)}
            title={ASPECT_TOOLTIPS[e.aspect] ?? e.aspect}
            className={
              'text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded ' +
              (hasSignal
                ? 'bg-surface-container-highest text-on-surface'
                : 'bg-surface-container-highest text-on-surface-variant')
            }
          >
            {e.aspect}: {display}
          </span>
        );
      })}
    </div>
  );
}
