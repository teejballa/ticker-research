'use client';
// src/app/insights/components/MetricTooltip.tsx
// Phase 21.1 Wave 5 — reusable [?] methodology superscript + popover.
//
// Every on-screen statistical metric must cite its primary source per
// UI-SPEC §"Methodology micro-copy". This component provides that citation
// surface as a small indigo [?] superscript that toggles a popover on click.
//
// Keyboard accessible: Escape closes the popover.

import { useState, useEffect, useRef } from 'react';

// Methodology micro-copy per UI-SPEC lines 185-192
const TOOLTIPS = {
  ic: 'Information Coefficient — Spearman rank correlation between predictions and forward sector-relative returns. Convention: Grinold & Kahn, Active Portfolio Management, §3.',
  brier:
    'Brier score — mean squared error of probabilistic forecasts vs binary outcome. Lower is better. Reference: Brier 1950, Monthly Weather Review.',
  log_loss:
    'Categorical log-loss across Buy / Hold / Sell outcomes. Lower is better; clips probabilities to [1e-15, 1-1e-15]. Reference: CS229 main notes, "Information Theory".',
  dsr: 'Deflated Sharpe Ratio — penalizes Sharpe for the number of trials attempted (n_trials_attempted). DSR > 0.95 ≈ statistically significant after multiple-testing correction. Reference: Bailey & López de Prado 2014, J. Portfolio Management.',
  q_value:
    'Benjamini–Yekutieli adjusted p-value, dependence-robust. ACTIVE promotion requires q < 0.10 across the n_trials_attempted denominator. Reference: Benjamini & Yekutieli 2001, Annals of Statistics.',
  ci_95:
    'BCa (bias-corrected, accelerated) bootstrap confidence interval, 10,000 resamples. Falls back to percentile method when n < 50. Reference: Efron 1987, JASA "Better Bootstrap Confidence Intervals".',
} as const;

export type TooltipKey = keyof typeof TOOLTIPS;

interface MetricTooltipProps {
  metric: TooltipKey;
}

export function MetricTooltip({ metric }: MetricTooltipProps) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (btnRef.current && !btnRef.current.closest('span')?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <span className="relative inline-block">
      <button
        ref={btnRef}
        type="button"
        aria-label={`Methodology citation for ${metric}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="ml-0.5 cursor-help align-super text-[8px] font-mono text-primary hover:text-primary/80 focus:outline-none focus-visible:ring-1 focus-visible:ring-primary"
        onClick={() => setOpen((v) => !v)}
      >
        [?]
      </button>
      {open && (
        <span
          role="dialog"
          aria-label={`Methodology: ${metric}`}
          className="absolute left-0 top-full z-20 mt-1.5 w-72 rounded-lg border border-outline-variant bg-surface p-3 text-xs leading-relaxed text-on-surface-variant shadow-lg"
        >
          {TOOLTIPS[metric]}
        </span>
      )}
    </span>
  );
}
