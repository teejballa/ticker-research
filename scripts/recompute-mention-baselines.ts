/**
 * Plan 20-A-02 — Nightly batch: recompute per-(ticker, source_class)
 * mention-volume baseline (median + MAD over rolling 90d daily counts).
 *
 * Reads SentimentObservation, grouped by (ticker, source_class, date(fetched_at)),
 * for the trailing 90 days. PIT-safe: joins on fetched_at only — never published_at
 * (S2 / 20-Z-07 lookahead regression).
 *
 * Persists one MentionBaseline row per (ticker, source_class) at computed_at = now.
 *
 * Usage:
 *   node --import tsx scripts/recompute-mention-baselines.ts
 */
import { medianAndMAD, SOURCE_TO_CLASS, type SourceClass } from '@/lib/sentiment/baseline';

const WINDOW_DAYS = 90;

export async function computeBaselinesForAllTickers(): Promise<{
  tickers_processed: number;
  baselines_written: number;
  skipped_sparse: number;
  duration_ms: number;
}> {
  const t0 = Date.now();
  const { prisma } = await import('@/lib/db');
  const now = new Date();
  const window_end = now;
  const window_start = new Date(now.getTime() - WINDOW_DAYS * 86_400_000);

  // Discover (ticker, source_class) pairs with any observations in the window.
  const groups = await prisma.sentimentObservation.groupBy({
    by: ['ticker', 'source'],
    where: { fetched_at: { gte: window_start, lte: window_end } },
    _count: { _all: true },
  });

  let baselines_written = 0;
  let skipped_sparse = 0;
  const tickers_seen = new Set<string>();

  for (const g of groups) {
    tickers_seen.add(g.ticker);
    const source_class: SourceClass = SOURCE_TO_CLASS[g.source] ?? 'community';

    // Pull daily counts for this (ticker, source_class) — raw rows, bucketed in TS.
    const rows = await prisma.sentimentObservation.findMany({
      where: {
        ticker: g.ticker,
        source: g.source,
        fetched_at: { gte: window_start, lte: window_end }, // PIT
      },
      select: { fetched_at: true },
    });

    if (rows.length < 30) {
      skipped_sparse++;
      continue;
    }

    const byDay = new Map<string, number>();
    for (const r of rows) {
      const day = r.fetched_at.toISOString().slice(0, 10); // YYYY-MM-DD
      byDay.set(day, (byDay.get(day) ?? 0) + 1);
    }
    const counts = Array.from(byDay.values());
    if (counts.length < 30) {
      skipped_sparse++;
      continue;
    }

    const { median, mad } = medianAndMAD(counts);

    // Determine cap_class from latest DiffusionTrace; fall back to 'unknown'.
    const latestTrace = await prisma.diffusionTrace.findFirst({
      where: { ticker: g.ticker },
      orderBy: { end_at: 'desc' },
      select: { cap_class: true },
    });
    const cap_class = latestTrace?.cap_class ?? 'unknown';

    await prisma.mentionBaseline.create({
      data: {
        ticker: g.ticker,
        cap_class,
        source_class,
        computed_at: now,
        window_start,
        window_end,
        mention_count_median: median,
        mention_count_mad: mad,
        n_observations: counts.length,
      },
    });
    baselines_written++;
  }

  return {
    tickers_processed: tickers_seen.size,
    baselines_written,
    skipped_sparse,
    duration_ms: Date.now() - t0,
  };
}

// CLI entrypoint
if (typeof require !== 'undefined' && require.main === module) {
  computeBaselinesForAllTickers()
    .then((r) => {
      console.log(JSON.stringify(r, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error('recompute-mention-baselines failed:', err);
      process.exit(1);
    });
}
