// src/app/insights/calibration/page.tsx
//
// Phase 20-C-02: /insights/calibration — per-classifier_version Brier
// dashboard. Server component; calls the JSON endpoint's payload function
// directly to avoid an HTTP roundtrip (matching the
// /insights/sentiment-sources pattern from 20-C-01).

import Link from 'next/link';

import { fetchCalibrationPayload } from '@/app/api/insights/calibration/route';

import { BrierTile } from './components/BrierTile';
import { ReliabilityDiagram } from './components/ReliabilityDiagram';

export const dynamic = 'force-dynamic';

export default async function CalibrationPage() {
  const payload = await fetchCalibrationPayload();

  return (
    <main className="mx-auto max-w-6xl px-6 py-10 text-zinc-200">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">
          Brier Calibration — per-classifier_version
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-zinc-400">
          Weekly Brier score + Murphy 1973 decomposition (Reliability −
          Resolution + Uncertainty) on the binary claim
          &ldquo;classifier-bullish ⇒ beats SPY at 7d.&rdquo; Reliability
          diagrams use the CORP method (Dimitriadis-Gneiting-Jordan, PNAS
          2021) — isotonic regression replaces ad-hoc equal-width binning.
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Ship gate: Brier ≤ 0.24 with |base_rate − 0.5| &lt; 0.1
          (T-20-C-02-01). Minimum n = 100 per classifier_version
          (T-20-C-02-02). Recomputed Mondays 08:00 UTC via{' '}
          <code>/api/cron/eval-brier</code>.
        </p>
        <p className="mt-1 text-xs text-zinc-600">
          See also:{' '}
          <Link
            href="/insights/sentiment-health"
            className="underline hover:text-zinc-300"
          >
            /insights/sentiment-health
          </Link>
          {' · '}
          <Link
            href="/insights/sentiment-sources"
            className="underline hover:text-zinc-300"
          >
            /insights/sentiment-sources
          </Link>
        </p>
      </header>

      {payload == null || payload.results.length === 0 ? (
        <section
          className="rounded-lg border border-zinc-700 bg-zinc-900/40 p-6 text-sm text-zinc-400"
          data-testid="calibration-empty-state"
        >
          <p className="mb-2 font-medium text-zinc-200">
            No Brier evaluation written yet.
          </p>
          <p>
            The first run is scheduled <strong>Monday 08:00 UTC</strong>{' '}
            via <code>/api/cron/eval-brier</code>. Manual runs:{' '}
            <code>tsx scripts/eval-brier.ts</code>.
          </p>
        </section>
      ) : (
        <>
          <p className="mb-4 text-xs text-zinc-500">
            Computed at {payload.computed_at} · {payload.results.length}{' '}
            classifier{payload.results.length === 1 ? '' : 's'} ·{' '}
            <span className="font-mono">{payload.source_path}</span>
          </p>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {payload.results.map((r) => (
              <div
                key={r.classifier_version}
                className="flex flex-col gap-4"
              >
                <BrierTile result={r} />
                <ReliabilityDiagram result={r} />
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
