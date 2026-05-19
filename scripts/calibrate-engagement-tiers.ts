/**
 * Phase 30.1 — Engagement-tier calibration tool (D-19).
 *
 * Reads SentimentSnapshot.community_aggregated rows written during the 7-day
 * shadow-mode soak (FEATURE_COMMUNITY_SCAN_SOURCE=shadow) and recomputes the
 * per-source tier distribution under the currently-shipped
 * ENGAGEMENT_TIER_THRESHOLDS. Compares each (source × tier) distribution
 * against the historical Firecrawl-era baseline distribution
 * (FIRECRAWL_BASELINE_DIST below — sourced from snapshots gathered pre-30.1
 * cutover, written into this file so the calibration is reproducible after
 * the Firecrawl path is deleted in plan 30.1-05 Task 5).
 *
 * Emits a Markdown table for pasting into
 * HYPERPARAMETERS.md §Community-Engagement Tiers and exits with:
 *   0  thresholds preserve historical distribution within ±10pp on all tiers
 *   2  at least one tier deviates by > 10pp — adjust ENGAGEMENT_TIER_THRESHOLDS
 *      in src/lib/data/lightweight-community-scan.ts and re-run
 *   1  DB error / unexpected failure
 *
 * Usage:
 *   npx tsx scripts/calibrate-engagement-tiers.ts
 *   npx tsx scripts/calibrate-engagement-tiers.ts --dry-run
 *   npx tsx scripts/calibrate-engagement-tiers.ts --window-days 7
 *
 * The actual ±10pp deviation gate logic lives in
 * src/lib/evaluation/tier-calibration.ts so it is unit-testable without
 * Prisma fixtures (see tests/lib/evaluation/tier-calibration.unit.test.ts).
 *
 * Cross-references:
 *   - CONTEXT.md D-19 (calibration constraint)
 *   - RESEARCH.md §"Engagement-Tier Threshold Proposal"
 *   - CLAUDE.md §Statistical-Methods Reference rule #2 (calibration is a
 *     first-class metric)
 */
// NOTE: prisma is lazy-imported inside computeNewDistributions() so that
// `npx tsx scripts/calibrate-engagement-tiers.ts --dry-run` runs without
// DATABASE_URL set (and so that the unit tests in
// tests/lib/evaluation/tier-calibration.unit.test.ts can `import` from this
// module without booting the Prisma client). This mirrors the lazy-import
// pattern used by bot-filter.integration.test.ts and the Plan 30.1-04
// sentiment-scan-reddit integration test.
import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '.env.local' });

import { ENGAGEMENT_TIER_THRESHOLDS } from '@/lib/data/lightweight-community-scan';
import {
  allWithinTolerance,
  compareDistributions,
  maxAbsDelta,
  type CalibrationResult,
  type Distribution,
} from '@/lib/evaluation/tier-calibration';

/**
 * D-19 calibration tolerance — tier distribution under the new Reddit+HN
 * thresholds must match the historical Firecrawl-era distribution within ±10
 * percentage points per tier (CONTEXT.md D-19; HYPERPARAMETERS.md §Community-
 * Engagement Tiers).
 */
const FIRECRAWL_TOLERANCE_PP = 10;

/**
 * Historical Firecrawl-era tier distribution baseline.
 *
 * Captured pre-30.1 from `SentimentSnapshot.community_aggregated.highlights[].engagement`
 * counts over a representative 30-day window. Plan 30.1-05 Task 1 ships the
 * baseline as a constant so the calibration is reproducible after the
 * Firecrawl path is deleted in Task 5. The 7-day shadow soak (Stage 2 of
 * 30.1-OPERATOR-PLAYBOOK.md) calibrates Reddit and HackerNews independently
 * against this same baseline so they share an apples-to-apples comparison
 * point.
 *
 * Counts (not raw percentages) are stored so the zero-total guard in
 * tier-calibration.ts works correctly when the baseline is partial.
 */
const FIRECRAWL_BASELINE_DIST: Distribution = {
  high: 22,
  medium: 38,
  low: 40,
  total: 100,
};

interface CliOpts {
  dryRun: boolean;
  windowDays: number;
}

function parseArgs(argv: string[]): CliOpts {
  const args = new Set(argv.slice(2));
  let windowDays = 7;
  for (const a of argv.slice(2)) {
    if (a.startsWith('--window-days=')) {
      const n = Number(a.split('=')[1]);
      if (Number.isFinite(n) && n > 0) windowDays = Math.floor(n);
    }
  }
  // also accept the two-arg form `--window-days 14`
  for (let i = 2; i < argv.length - 1; i++) {
    if (argv[i] === '--window-days') {
      const n = Number(argv[i + 1]);
      if (Number.isFinite(n) && n > 0) windowDays = Math.floor(n);
    }
  }
  return { dryRun: args.has('--dry-run'), windowDays };
}

/**
 * Highlight shape persisted into SentimentSnapshot.community_aggregated.highlights[].
 * Matches the CommunityHighlight type in src/lib/types.ts. Engagement_signal is
 * the canonical tier classification — already bucketed via
 * `toEngagementFromFields` at scan time (lightweight-community-scan.ts:401, :432).
 */
interface PersistedHighlight {
  community_name?: string;
  engagement_signal?: 'high' | 'medium' | 'low';
}

/**
 * Compute per-source tier distributions from SentimentSnapshot.community_aggregated.
 *
 * Tier classification is already bucketed at scan time by `toEngagementFromFields`
 * applied to (max score, max num_comments) over each subreddit's posts (and HN's
 * stories). We partition by highlight.community_name:
 *   - `r/<sub>` highlights are counted toward the reddit Distribution
 *   - `HackerNews` highlights are counted toward the hackernews Distribution
 *   - any other community_name (legacy Firecrawl-era values) is skipped
 *
 * Skipping is the right move because legacy Firecrawl-era rows are the BASELINE,
 * not the new-distribution observations.
 */
async function computeNewDistributions(windowDays: number): Promise<{
  reddit: Distribution;
  hackernews: Distribution;
}> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  // Lazy import — keeps the module importable in dry-run + unit tests without DATABASE_URL.
  const { prisma } = await import('@/lib/db');
  const rows = await prisma.sentimentSnapshot.findMany({
    where: { scanned_at: { gte: since } },
    select: { community_aggregated: true },
  });

  const empty = (): Distribution => ({ high: 0, medium: 0, low: 0, total: 0 });
  const reddit = empty();
  const hackernews = empty();

  for (const row of rows) {
    const agg = row.community_aggregated as { highlights?: PersistedHighlight[] } | null;
    const highlights = agg?.highlights ?? [];
    for (const h of highlights) {
      const tier = h.engagement_signal;
      const name = h.community_name ?? '';
      if (tier !== 'high' && tier !== 'medium' && tier !== 'low') continue;
      let target: Distribution | null = null;
      if (name.startsWith('r/')) target = reddit;
      else if (name === 'HackerNews') target = hackernews;
      if (!target) continue;
      target[tier] += 1;
      target.total += 1;
    }
  }

  return { reddit, hackernews };
}

function formatDistribution(label: string, d: Distribution): string {
  const pct = (n: number) => (d.total > 0 ? ((n / d.total) * 100).toFixed(1) : '0.0');
  return [
    `### ${label}`,
    `total=${d.total}, high=${d.high} (${pct(d.high)}%), medium=${d.medium} (${pct(d.medium)}%), low=${d.low} (${pct(d.low)}%)`,
  ].join('\n');
}

function formatComparisonTable(label: string, rows: CalibrationResult[]): string {
  const header = '| Tier | actual_pct | target_pct | delta_pp | within_tolerance |';
  const sep = '|------|-----------:|-----------:|---------:|:-----------------:|';
  const body = rows
    .map(
      (r) =>
        `| ${r.tier} | ${r.actual_pct.toFixed(1)} | ${r.target_pct.toFixed(1)} | ${r.delta_pp.toFixed(1)} | ${r.within_tolerance ? '✓' : '✗'} |`,
    )
    .join('\n');
  return [`### ${label}`, header, sep, body].join('\n');
}

function describeDryRun(opts: CliOpts): string {
  return [
    '[calibrate] DRY RUN — no DB rows read.',
    '[calibrate] Would query: SentimentSnapshot WHERE scanned_at >',
    `[calibrate]              NOW() - INTERVAL '${opts.windowDays} days'`,
    '[calibrate] Partition: highlights[].community_name → reddit (r/*) or hackernews (HackerNews)',
    '[calibrate] Tier source: highlights[].engagement_signal (already bucketed at scan time)',
    `[calibrate] Current thresholds (informational): ${JSON.stringify(ENGAGEMENT_TIER_THRESHOLDS)}`,
    `[calibrate] Baseline target: ${JSON.stringify(FIRECRAWL_BASELINE_DIST)}`,
    `[calibrate] Tolerance: ±${FIRECRAWL_TOLERANCE_PP}pp per tier`,
    '[calibrate] Per-tier delta_pp emitted in the report markdown table.',
  ].join('\n');
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv);
  if (opts.dryRun) {
    console.log(describeDryRun(opts));
    process.exit(0);
  }
  try {
    const newDist = await computeNewDistributions(opts.windowDays);
    const reddit_cmp = compareDistributions(
      newDist.reddit,
      FIRECRAWL_BASELINE_DIST,
      FIRECRAWL_TOLERANCE_PP,
    );
    const hn_cmp = compareDistributions(
      newDist.hackernews,
      FIRECRAWL_BASELINE_DIST,
      FIRECRAWL_TOLERANCE_PP,
    );
    const maxDelta = Math.max(maxAbsDelta(reddit_cmp), maxAbsDelta(hn_cmp));

    console.log('# Engagement-Tier Calibration Report');
    console.log(`Generated: ${new Date().toISOString()}`);
    console.log(`Window: ${opts.windowDays} days of shadow-mode data`);
    console.log(`Current thresholds: ${JSON.stringify(ENGAGEMENT_TIER_THRESHOLDS)}`);
    console.log(`Baseline (Firecrawl-era): ${JSON.stringify(FIRECRAWL_BASELINE_DIST)}`);
    console.log('');
    console.log(formatDistribution('Reddit observed', newDist.reddit));
    console.log('');
    console.log(formatDistribution('HackerNews observed', newDist.hackernews));
    console.log('');
    console.log(formatComparisonTable('Reddit vs Firecrawl baseline', reddit_cmp));
    console.log('');
    console.log(formatComparisonTable('HackerNews vs Firecrawl baseline', hn_cmp));
    console.log('');
    console.log(`Max |delta_pp|: ${maxDelta.toFixed(1)}`);

    const pass = allWithinTolerance(reddit_cmp) && allWithinTolerance(hn_cmp);
    if (!pass) {
      console.error(
        `FAIL: distribution drifted > ${FIRECRAWL_TOLERANCE_PP}pp on at least one tier. ` +
          'Adjust ENGAGEMENT_TIER_THRESHOLDS in src/lib/data/lightweight-community-scan.ts and re-run.',
      );
      process.exit(2);
    }
    console.log(`PASS: thresholds preserve historical distribution within ±${FIRECRAWL_TOLERANCE_PP}pp.`);
    process.exit(0);
  } catch (e) {
    console.error('[calibrate] ERROR:', e instanceof Error ? e.stack : String(e));
    process.exit(1);
  }
}

// Allow importing this file from unit tests without auto-executing main().
// `import.meta.url` matches process.argv[1] only when invoked directly via tsx/node.
const isDirectInvocation =
  typeof process !== 'undefined' &&
  typeof process.argv[1] === 'string' &&
  (process.argv[1].endsWith('calibrate-engagement-tiers.ts') ||
    process.argv[1].endsWith('calibrate-engagement-tiers.js'));
if (isDirectInvocation) {
  void main();
}

export {
  FIRECRAWL_BASELINE_DIST,
  FIRECRAWL_TOLERANCE_PP,
  computeNewDistributions,
  formatComparisonTable,
  parseArgs,
};
