// src/app/insights/sentiment-sources/page.tsx
//
// Phase 20-C-01: /insights/sentiment-sources — per-source IC calibration
// dashboard. Server component; calls the JSON endpoint's payload function
// directly to avoid an HTTP roundtrip.

import { fetchSentimentSourcesPayload } from '@/app/api/insights/sentiment-sources/_helpers';
import { SourceTile } from './components/SourceTile';

export const dynamic = 'force-dynamic';

export default async function SentimentSourcesPage() {
  const payload = await fetchSentimentSourcesPayload();

  return (
    <main className="mx-auto max-w-6xl px-6 py-10 text-on-surface">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-on-surface">
          Sentiment Sources — Per-Source IC Calibration
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-on-surface-variant">
          Rolling 20-day cross-sectional Spearman IC of source-tagged
          sentiment against forward 7-day and 30-day returns. Significance via
          Newey-West HAC standard errors (Bartlett kernel) with
          Benjamini-Hochberg FDR correction across the daily (source × horizon)
          panel at α = 0.05.
        </p>
        <p className="mt-1 text-xs text-on-surface-variant">
          Asterisks: * p<sub>BH</sub> &lt; 0.05 · ** &lt; 0.01 · *** &lt; 0.001.
          AUTO-DOWN-WEIGHT triggers when ICIR &lt; 0.3 for two consecutive
          20-day windows (consumed by 20-B-04 SourceTier recompute).
        </p>
        <p className="mt-1 text-xs text-outline">
          Generated at {payload.generated_at}.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {payload.sources.flatMap((s) => [
          <SourceTile
            key={`${s.source_id}-7d`}
            source_id={s.source_id}
            horizon={7}
            tile={s.horizons['7d']}
          />,
          <SourceTile
            key={`${s.source_id}-30d`}
            source_id={s.source_id}
            horizon={30}
            tile={s.horizons['30d']}
          />,
        ])}
      </div>
    </main>
  );
}
