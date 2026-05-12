/**
 * Plan 20-A-04 — Weekly per-ticker author-share Q1 calibration.
 *
 * For each ticker with ≥minObservations rows in the trailing trainingWindowDays:
 *   1. Group SentimentObservation rows by author_id (PIT-safe — joins on
 *      fetched_at, NEVER the upstream-claimed-timestamp).
 *   2. Compute per-author share of total within the trailing window.
 *   3. Compute the 25th percentile (Q1) of that share distribution
 *      (NIST method 7 — linear interpolation).
 *   4. INSERT a new AuthorShareCalibration row.
 *
 * INSERT-only by design (Cookson & Engelberg 2020 — historical readers must
 * replay the threshold active at any past timestamp). Old rows preserved for
 * 30d; Phase-27 cleanup retires them.
 *
 * S1 compliance: the Q1 threshold is NEVER hand-set. The 0.5 down-weight
 * multiplier consumed by the aggregator is documented in HYPERPARAMETERS.md.
 */
import { prisma } from '@/lib/db';
import {
  authorShareDistribution,
  messageCountsByAuthor,
} from '@/lib/sentiment/gini';

export interface CalibrationOpts {
  trainingWindowDays?: number; // default 90
  minObservations?: number; // default 30 — skip tickers below this
}

export interface CalibrationResult {
  tickers_calibrated: number;
  rows_inserted: number;
  skipped_sparse: string[];
}

export async function calibrateAuthorShareThresholds(
  opts: CalibrationOpts = {},
): Promise<CalibrationResult> {
  const trainingWindowDays = opts.trainingWindowDays ?? 90;
  const minObservations = opts.minObservations ?? 30;
  const since = new Date(Date.now() - trainingWindowDays * 24 * 3600 * 1000);

  // Distinct tickers with any observation in the window — small set, OK to load.
  const distinctTickers = await prisma.sentimentObservation.findMany({
    where: { fetched_at: { gte: since } },
    select: { ticker: true },
    distinct: ['ticker'],
  });

  let rows_inserted = 0;
  const skipped_sparse: string[] = [];
  for (const { ticker } of distinctTickers) {
    const obs = await prisma.sentimentObservation.findMany({
      where: { ticker, fetched_at: { gte: since } },
      select: { author_id: true, classifier_score: true },
    });
    if (obs.length < minObservations) {
      skipped_sparse.push(ticker);
      continue;
    }
    const counts = messageCountsByAuthor(obs);
    const dist = authorShareDistribution(counts);
    if (dist.length === 0) {
      skipped_sparse.push(ticker);
      continue;
    }
    // Distribution is already sorted DESCENDING; for Q1 we want shares ascending.
    const sharesAsc = dist.map((d) => d.share).reverse();
    // Q1 = 25th percentile via NIST method 7 (linear interpolation).
    const idx = (sharesAsc.length - 1) * 0.25;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    const q1 =
      lo === hi
        ? sharesAsc[lo]
        : sharesAsc[lo] * (hi - idx) + sharesAsc[hi] * (idx - lo);
    await prisma.authorShareCalibration.create({
      data: {
        ticker,
        q1_author_share_pct: q1,
        n_observations: obs.length,
        training_window_days: trainingWindowDays,
      },
    });
    rows_inserted++;
  }
  return {
    tickers_calibrated: distinctTickers.length - skipped_sparse.length,
    rows_inserted,
    skipped_sparse,
  };
}

// CLI entry-point (manual smoke / one-off recalibration).
if (require.main === module && !process.env.VITEST) {
  calibrateAuthorShareThresholds()
    .then((r) => {
      console.log(JSON.stringify(r, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
