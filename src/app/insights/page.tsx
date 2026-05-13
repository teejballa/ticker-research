// src/app/insights/page.tsx
// Phase 18-09 — surfaces ESS-based credible intervals (CORE-ML-03), keeps raw N
// as debug column per D-12, and computes the D-09 step 4 recovery counter
// (14 consecutive `drift_clear` LearningEvents to flip 'EXPLORATORY-WATCH' →
// 'ACTIVE') via prisma.learningEvent.count of `event_type: 'drift_clear'` rows.
//
// The CI-width pass-through is automatic — Plan 04 cron writes weighted α/β
// to the existing `alpha`/`beta` columns the credibleInterval95 consumer reads,
// so sparse-but-recent cells visibly tighten faster than sparse-but-old cells.
// This page wires the ESS column + recovery counter into the rendered table.

import { InsightsDashboard } from '@/components/InsightsDashboard';
import NavBar from '@/components/NavBar';
import { PatternsTable, type PatternRow } from './components/PatternsTable';

export const metadata = {
  title: 'Research dashboard',
  description:
    'Cipher\'s live track record by signal class: how each pattern has performed against the S&P 500, with credible intervals and out-of-sample Brier scores.',
};

// Server component — runs on each request. dynamic='force-dynamic' ensures the
// drift_clear recovery counter reflects the latest LearningEvent rows.
export const dynamic = 'force-dynamic';

async function loadEssPatternRows(): Promise<PatternRow[]> {
  // Skip the prisma query in environments without a database (local-mode dev,
  // CI without DATABASE_URL). The page still renders the InsightsDashboard
  // client component below. Dynamic import avoids loading @/lib/db (which throws
  // if DATABASE_URL is unset) during static analysis / page-data collection.
  if (!process.env.DATABASE_URL) return [];
  const { prisma } = await import('@/lib/db');

  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const [patterns, driftClearCounts] = await Promise.all([
    prisma.learnedPattern.findMany({
      orderBy: [
        { signal_class: 'asc' },
        { pattern_key: 'asc' },
        { cap_class: 'asc' },
        { horizon_days: 'asc' },
      ],
    }),
    // D-09 step 4 recovery counter — count `drift_clear` LearningEvent rows
    // per cell within the last 14 days. The counter is DERIVED (no schema
    // change) per D-19 invariant + RESEARCH "Open Questions for Planner".
    prisma.learningEvent.groupBy({
      by: ['signal_class', 'pattern_key', 'cap_class', 'horizon_days'],
      where: {
        event_type: 'drift_clear',
        occurred_at: { gte: fourteenDaysAgo },
      },
      _count: { _all: true },
    }),
  ]);

  const driftClearMap = new Map<string, number>();
  for (const row of driftClearCounts) {
    if (
      row.signal_class == null ||
      row.pattern_key == null ||
      row.cap_class == null ||
      row.horizon_days == null
    ) {
      continue;
    }
    const key = `${row.signal_class}|${row.pattern_key}|${row.cap_class}|${row.horizon_days}`;
    driftClearMap.set(key, row._count._all);
  }

  return patterns.map((p): PatternRow => {
    const recoveryCount =
      driftClearMap.get(`${p.signal_class}|${p.pattern_key}|${p.cap_class}|${p.horizon_days}`) ?? 0;
    return {
      signal_class: p.signal_class,
      pattern_key: p.pattern_key,
      cap_class: p.cap_class,
      horizon_days: p.horizon_days,
      alpha: p.alpha,
      beta: p.beta,
      sample_size: p.sample_size,
      effective_sample_size: p.effective_sample_size,
      status: p.status,
      recoveryCount,
      // Plan 19-A-07: surface pooling fields so PatternsTable can render
      // α_pooled when FEATURES.hierarchical_pooling_enabled.
      parent_alpha: p.parent_alpha,
      parent_beta: p.parent_beta,
      shrinkage_strength: p.shrinkage_strength,
    };
  });
}

export default async function InsightsPage() {
  const essRows = await loadEssPatternRows();

  return (
    <div className="bg-surface text-on-surface min-h-screen">
      <NavBar />
      <main className="pt-[44px]">
        <InsightsDashboard />

        {essRows.length > 0 && (
          <section
            className="max-w-7xl mx-auto px-6 mt-12 mb-12 border border-outline-variant/30"
            aria-label="ESS-based pattern library (Phase 18)"
          >
            <div className="flex items-end justify-between p-6 md:p-8 border-b border-outline-variant/20">
              <div>
                <div className="text-[10px] tracking-[0.4em] text-primary/70 font-mono uppercase mb-1">
                  Pattern library
                </div>
                <h2 className="text-on-surface text-lg font-bold tracking-tight">
                  Time-decayed credible intervals by pattern
                </h2>
                <p className="text-on-surface-variant text-xs mt-2 max-w-2xl leading-relaxed">
                  Each row is a learned pattern with its 95% credible interval. Recent outcomes carry
                  more weight than old ones, so sparse-but-recent cells tighten faster than sparse-but-old
                  cells. Cells flagged{' '}
                  <code className="font-mono text-tertiary">EXPLORATORY-WATCH</code> show a recovery
                  counter; after 14 clear days and enough effective sample size, the cell re-flips
                  to ACTIVE.
                </p>
              </div>
              <span className="hidden sm:block text-[10px] tracking-[0.3em] text-outline font-mono uppercase">
                {essRows.length} cells · 95% CI
              </span>
            </div>
            <div className="p-3 md:p-4">
              <PatternsTable rows={essRows} />
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
