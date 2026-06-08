// src/app/insights/baselines/page.tsx
// Phase 21.1 Wave 5 — Surface 1: /insights/baselines (NEW PAGE, D-28).
//
// 3-way comparison page: LLM vs Logistic-24 vs Logistic-canonical vs Null.
// IS-paper symposium surface — every number has a BCa CI; every claim is
// Benjamini–Yekutieli corrected at q = 0.10.
//
// Server component + Suspense-wrapped client HorizonTabStrip.
// Data: getBaselineComparison(horizon) from engine-context.ts (D-30 boundary).
//
// Layout per UI-SPEC §Surface 1:
//   - H1: 24px Inter Tight 600 (same rule as existing /insights H1)
//   - Subhead: 16px Inter 400 text-on-surface-variant
//   - Methodology blurb: max-w-prose text-sm
//   - Horizon tab strip (client, useSearchParams)
//   - Comparison panel

import { Suspense } from 'react';
import NavBar from '@/components/NavBar';
import FooterTicker from '@/components/FooterTicker';
import { getBaselineComparison } from '@/lib/engine-context';
import { HorizonTabStrip } from './components/HorizonTabStrip';
import { BaselinesComparisonTable } from './components/BaselinesComparisonTable';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Baselines — Cipher',
  description:
    'Does the LLM produce edge that simple logistic models cannot? 3-way comparison (LLM / Logistic-24 / Logistic-canonical / Null) by horizon with BCa 95% CIs.',
};

// Valid horizon values — map from URL param string to numeric type
const HORIZON_MAP: Record<string, 3 | 7 | 14 | 30> = {
  '3d': 3,
  '7d': 7,
  '14d': 14,
  '30d': 30,
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function BaselinesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const horizonParam = typeof params['horizon'] === 'string' ? params['horizon'] : '7d';
  const horizon = HORIZON_MAP[horizonParam] ?? 7;

  let comparisonData;
  try {
    comparisonData = await getBaselineComparison(horizon as 3 | 7 | 14 | 30);
  } catch (err) {
    console.error('[BaselinesPage] getBaselineComparison failed:', err);
    comparisonData = { rows: [], n_trials_attempted: 0, last_updated: null };
  }

  return (
    <>
      <div className="paper-grain" />
      <NavBar />

      <main
        className="mx-auto max-w-5xl px-4 pb-16 pt-12 text-on-surface sm:px-6"
        aria-label="Baselines comparison dashboard"
      >
        {/* Page header */}
        <h1 className="font-display text-2xl font-semibold tracking-tight text-on-surface">
          Baselines
        </h1>
        <p className="mt-2 text-base text-on-surface-variant">
          Does the engine produce edge that simple logistic models don&rsquo;t?
        </p>

        {/* Methodology blurb */}
        <p className="mt-4 max-w-prose text-sm leading-relaxed text-on-surface-variant">
          Each cell reports the metric ± a BCa bootstrap 95% confidence interval (Efron 1987).
          Cross-cell claims are Benjamini–Yekutieli corrected at q = 0.10 across the day&rsquo;s
          full set of trials (López de Prado 2018, Ch. 6). The &ldquo;Null&rdquo; column is the
          no-skill baseline: predicting the in-sample base rate every time. A cell is colored teal
          (↑) only when its CI is fully above the comparator&rsquo;s CI after FDR correction; rose
          (↓) when fully below; ink when CIs overlap.
        </p>

        {/* Horizon tab strip (client component) */}
        <Suspense
          fallback={
            <div className="mt-8 flex gap-1 border-b border-outline-variant/30 pb-2">
              {['3d', '7d', '14d', '30d'].map((h) => (
                <div
                  key={h}
                  className="px-3 py-2 text-[10px] font-mono uppercase tracking-[0.3em] text-outline"
                >
                  {h}
                </div>
              ))}
            </div>
          }
        >
          <HorizonTabStrip />
        </Suspense>

        {/* 3-way comparison table */}
        <div className="mt-6">
          <BaselinesComparisonTable
            rows={comparisonData.rows}
            n_trials_attempted={comparisonData.n_trials_attempted}
            last_updated={comparisonData.last_updated}
            horizon={horizonParam}
          />
        </div>

        {/* Footer link back */}
        <div className="mt-12 text-sm">
          <a
            href="/insights"
            className="font-mono text-[10px] uppercase tracking-[0.3em] text-primary hover:text-primary/80"
          >
            ← Back to Insights
          </a>
        </div>
      </main>

      <FooterTicker />
    </>
  );
}
