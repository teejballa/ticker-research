// src/app/insights/page.tsx
// Light-mode tabbed Insights surface (Claude Design handoff) layered over the
// existing live data. The new design — page-hero, sentiment-diffusion orbits,
// live stat grid, and Patterns / Calibration / Sentiment sources / Health tabs
// — is rendered by <InsightsView>. The full original InsightsDashboard and the
// ESS PatternsTable are preserved below: nothing was removed.

import InsightsView from '@/components/insights/InsightsView';
import { InsightsDashboard } from '@/components/InsightsDashboard';
import NavBar from '@/components/NavBar';
import FooterTicker from '@/components/FooterTicker';
import { PatternsTable, type PatternRow } from './components/PatternsTable';

export const metadata = {
  title: 'Research dashboard',
  description:
    "Cipher's live track record by signal class: how each pattern has performed against the S&P 500, with credible intervals and out-of-sample Brier scores.",
};

// Server component — runs each request so the drift_clear recovery counter
// reflects the latest LearningEvent rows.
export const dynamic = 'force-dynamic';

async function loadEssPatternRows(): Promise<PatternRow[]> {
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
      parent_alpha: p.parent_alpha,
      parent_beta: p.parent_beta,
      shrinkage_strength: p.shrinkage_strength,
    };
  });
}

export default async function InsightsPage() {
  const essRows = await loadEssPatternRows();

  return (
    <>
      <div className="paper-grain" />
      <NavBar />

      <main className="page">
        <InsightsView
          patternsSlot={
            essRows.length > 0 ? (
              <div>
                <div
                  style={{
                    fontFamily: 'var(--mono)', fontSize: '10px', letterSpacing: '0.22em',
                    textTransform: 'uppercase', color: 'var(--ink-3)', fontWeight: 600, marginBottom: '14px',
                  }}
                >
                  Pattern library · {essRows.length} cells · 95% credible intervals
                </div>
                <PatternsTable rows={essRows} />
              </div>
            ) : (
              <p style={{ fontFamily: 'var(--mono)', fontSize: '12px', color: 'var(--ink-3)', padding: '24px 0' }}>
                The pattern library populates after the first learning cycle resolves outcomes.
              </p>
            )
          }
        />

        {/* Full engine dashboard — every original Insights section preserved */}
        <section className="page-grid" style={{ paddingTop: '8px' }}>
          <div
            style={{
              fontFamily: 'var(--mono)', fontSize: '11px', letterSpacing: '0.22em',
              textTransform: 'uppercase', color: 'var(--indigo)', fontWeight: 600,
              borderTop: '1px solid var(--rule)', paddingTop: '32px', marginBottom: '8px',
            }}
          >
            Engine dashboard
          </div>
          <InsightsDashboard />
        </section>
      </main>

      <FooterTicker />
    </>
  );
}
