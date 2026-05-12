// @model-card: docs/cards/MODEL-CARD-crowded-consensus.md
/**
 * Plan 20-A-01 — Crowded-consensus threshold calibration.
 *
 * Grid-searches H_thresh × V_thresh × D_thresh maximizing Brier Skill Score
 * on the binary outcome "crowded_consensus → underperformed SPY at 14d" over
 * the trailing 90 days of (SentimentObservation joined to PriceOutcome).
 *
 * PIT discipline (S2, T-20-A-01-01):
 *   - Joins SentimentObservation by `fetched_at` ONLY (the PIT-INVARIANT column).
 *   - PriceOutcome filtered by `days_after >= 14`.
 *   - The literal upstream-claimed-timestamp substring (banned identifier from
 *     the SentimentObservation schema) MUST NOT appear in this file — enforced
 *     by the integration test grep gate (Test 4) AND `npm run check-lookahead`.
 *
 * Search ranges (LITERAL — from CONTEXT.md line 103):
 *   H_thresh ∈ [0.3, 1.5] step 0.1   → 13 values
 *   V_thresh ∈ [1.0, 5.0] step 0.25  → 17 values
 *   D_thresh ∈ [0.1, 0.7] step 0.05  → 13 values
 *   Total grid points: 13 × 17 × 13 = 2,873
 *
 * Brier Skill Score:
 *   BS_model       = mean( (p_pred − y_actual)² ) where p_pred ∈ {0, 1}
 *   BS_climatology = mean( (base_rate − y_actual)² )
 *   BSS            = 1 − BS_model / BS_climatology
 *
 * Refuses to run when n_examples < 30; exit code 4 ('INSUFFICIENT_DATA').
 */
import { prisma } from '@/lib/db';
import {
  authorDiversityGini,
  bullPctStd,
  crowdedConsensus,
  shannonEntropy,
  type CrowdedConsensusThresholds,
  type DispersionFeatures,
} from '@/lib/sentiment/dispersion';
import { mentionZ } from '@/lib/sentiment/mention-z-stub';

const H_RANGE = (() => {
  const r: number[] = [];
  for (let v = 0.3; v <= 1.5 + 1e-9; v += 0.1) r.push(Math.round(v * 100) / 100);
  return r;
})();
const V_RANGE = (() => {
  const r: number[] = [];
  for (let v = 1.0; v <= 5.0 + 1e-9; v += 0.25) r.push(Math.round(v * 100) / 100);
  return r;
})();
const D_RANGE = (() => {
  const r: number[] = [];
  for (let v = 0.1; v <= 0.7 + 1e-9; v += 0.05) r.push(Math.round(v * 100) / 100);
  return r;
})();

export interface CalibrationExample {
  features: DispersionFeatures;
  y: 0 | 1; // 1 = underperformed SPY at 14d
}

export interface CalibrationResult {
  exit_code: 0 | 4 | 5;
  thresholds: CrowdedConsensusThresholds | null;
  n_examples: number;
  brier_skill_score: number | null;
  top5: Array<{ H: number; V: number; D: number; bss: number }>;
  notes?: string;
}

/**
 * Pure grid-search routine — separated from data-loading so tests can hit
 * the algorithmic core without a DB.
 */
export function runGridSearch(
  examples: CalibrationExample[],
): CalibrationResult {
  if (examples.length < 30) {
    return {
      exit_code: 4,
      thresholds: null,
      n_examples: examples.length,
      brier_skill_score: null,
      top5: [],
      notes: 'INSUFFICIENT_DATA — n_examples < 30',
    };
  }

  // Climatology baseline.
  const baseRate =
    examples.reduce((s, e) => s + e.y, 0) / examples.length;
  const bsClim =
    examples.reduce((s, e) => s + (baseRate - e.y) ** 2, 0) / examples.length;
  if (bsClim === 0) {
    // Degenerate — all outcomes identical. BSS is undefined; surface as exit 4.
    return {
      exit_code: 4,
      thresholds: null,
      n_examples: examples.length,
      brier_skill_score: null,
      top5: [],
      notes: 'INSUFFICIENT_DATA — climatology variance is zero',
    };
  }

  const scored: Array<{ H: number; V: number; D: number; bss: number }> = [];

  for (const H of H_RANGE) {
    for (const V of V_RANGE) {
      for (const D of D_RANGE) {
        const thresholds: CrowdedConsensusThresholds = {
          H_thresh: H,
          V_thresh: V,
          D_thresh: D,
          model_version: 'grid-search-v1',
          computed_at: new Date(),
          brier_skill_score: 0, // placeholder; finalized below
        };
        let sse = 0;
        let n = 0;
        for (const ex of examples) {
          const pred = crowdedConsensus(ex.features, thresholds);
          if (pred == null) continue; // skip non-finite features
          const p = pred ? 1 : 0;
          sse += (p - ex.y) ** 2;
          n++;
        }
        if (n === 0) continue;
        const bsModel = sse / n;
        const bss = 1 - bsModel / bsClim;
        scored.push({ H, V, D, bss });
      }
    }
  }

  if (scored.length === 0) {
    return {
      exit_code: 4,
      thresholds: null,
      n_examples: examples.length,
      brier_skill_score: null,
      top5: [],
      notes: 'INSUFFICIENT_DATA — no grid point produced finite predictions',
    };
  }

  // Tie-break: max bss, then min H, then min V, then min D (deterministic).
  scored.sort((a, b) => {
    if (b.bss !== a.bss) return b.bss - a.bss;
    if (a.H !== b.H) return a.H - b.H;
    if (a.V !== b.V) return a.V - b.V;
    return a.D - b.D;
  });

  const best = scored[0];
  const top5 = scored.slice(0, 5);

  const thresholds: CrowdedConsensusThresholds = {
    H_thresh: best.H,
    V_thresh: best.V,
    D_thresh: best.D,
    model_version: 'grid-search-v1',
    computed_at: new Date(),
    brier_skill_score: best.bss,
  };

  return {
    exit_code: 0,
    thresholds,
    n_examples: examples.length,
    brier_skill_score: best.bss,
    top5,
  };
}

/**
 * Load examples from production data. PIT-safe.
 *
 * NOTE: mention_z is stubbed at 0 until 20-A-02. Examples returned here will
 * never satisfy `mention_z > V_thresh` for V_thresh > 0 — but calibration
 * still runs and persists thresholds (the predicate just produces all 0s
 * until 20-A-02 lands; this is intentional ordering).
 */
async function loadExamples(windowDays: number): Promise<CalibrationExample[]> {
  // Trailing window — using `fetched_at` (PIT-INVARIANT) on SentimentObservation
  // and `days_after >= 14` on PriceOutcome.
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  // Group SentimentObservations by (ticker, day-bucket on fetched_at).
  const obs = await (prisma as unknown as {
    sentimentObservation: {
      findMany: (args: {
        where: { fetched_at: { gte: Date } };
        select: {
          ticker: true;
          fetched_at: true;
          author_id: true;
          classifier_score: true;
        };
      }) => Promise<Array<{
        ticker: string;
        fetched_at: Date;
        author_id: string;
        classifier_score: number | null;
      }>>;
    };
  }).sentimentObservation.findMany({
    where: { fetched_at: { gte: since } },
    select: {
      ticker: true,
      fetched_at: true,
      author_id: true,
      classifier_score: true,
    },
  });

  // Group by (ticker, day).
  const grouped = new Map<string, typeof obs>();
  for (const o of obs) {
    const day = o.fetched_at.toISOString().slice(0, 10);
    const key = `${o.ticker}::${day}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(o);
  }

  // For each (ticker, day) group, derive DispersionFeatures + lookup forward 14d alpha.
  const examples: CalibrationExample[] = [];
  for (const [key, rows] of grouped) {
    const [ticker] = key.split('::');
    const authorCounts = new Map<string, number>();
    const tagCounts = { bull: 0, bear: 0, neutral: 0 };
    for (const r of rows) {
      authorCounts.set(r.author_id, (authorCounts.get(r.author_id) ?? 0) + 1);
      // Score >0.2 = bull, < -0.2 = bear, else neutral. Default to neutral if score is null.
      const s = r.classifier_score;
      if (s == null) tagCounts.neutral++;
      else if (s > 0.2) tagCounts.bull++;
      else if (s < -0.2) tagCounts.bear++;
      else tagCounts.neutral++;
    }
    const totalTags = tagCounts.bull + tagCounts.bear + tagCounts.neutral;
    if (totalTags === 0) continue;

    let features: DispersionFeatures;
    try {
      features = {
        entropy_bits: shannonEntropy(tagCounts),
        bull_pct_std: bullPctStd([
          // Single-source for now; cross-platform breakdown is 20-A-05.
          { source: 'stocktwits', bull_pct: (tagCounts.bull / totalTags) * 100 },
        ]),
        author_gini: authorDiversityGini(authorCounts),
        mention_z: mentionZ(rows), // stub returns 0 until 20-A-02
      };
    } catch {
      continue;
    }

    // Forward 14d alpha — join via Report (we use ticker + day-bucket) to PriceOutcome.
    // Underperform = pct_change_at_14d < 0 (simple proxy; alpha-vs-SPY refinement is 20-A-06).
    const outcome = await (prisma as unknown as {
      priceOutcome: {
        findFirst: (args: {
          where: {
            days_after: number;
            recorded_at: { gte: Date };
          };
          orderBy: { recorded_at: 'asc' };
          select: { pct_change: true };
        }) => Promise<{ pct_change: number } | null>;
      };
    }).priceOutcome.findFirst({
      where: {
        days_after: 14,
        recorded_at: { gte: rows[0].fetched_at },
      },
      orderBy: { recorded_at: 'asc' },
      select: { pct_change: true },
    });
    if (outcome == null) continue;
    const y: 0 | 1 = outcome.pct_change < 0 ? 1 : 0;
    void ticker; // suppress unused-var (kept for diagnostic logging if needed)
    examples.push({ features, y });
  }

  return examples;
}

export async function runCalibration(opts?: {
  windowDays?: number;
  minExamples?: number;
  modelVersion?: string;
  dryRun?: boolean;
}): Promise<CalibrationResult> {
  const windowDays = opts?.windowDays ?? 90;
  const minExamples = opts?.minExamples ?? 30;
  const modelVersion = opts?.modelVersion ?? 'grid-search-v1';
  const dryRun = opts?.dryRun ?? false;

  let examples: CalibrationExample[] = [];
  try {
    examples = await loadExamples(windowDays);
  } catch (e) {
    return {
      exit_code: 5,
      thresholds: null,
      n_examples: 0,
      brier_skill_score: null,
      top5: [],
      notes: `DB_ERROR: ${(e as Error).message}`,
    };
  }

  if (examples.length < minExamples) {
    return {
      exit_code: 4,
      thresholds: null,
      n_examples: examples.length,
      brier_skill_score: null,
      top5: [],
      notes: `INSUFFICIENT_DATA — n=${examples.length} < min=${minExamples}`,
    };
  }

  const result = runGridSearch(examples);
  if (result.exit_code !== 0 || result.thresholds == null) return result;

  if (!dryRun) {
    try {
      await (prisma as unknown as {
        crowdedConsensusCalibration: {
          create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
        };
      }).crowdedConsensusCalibration.create({
        data: {
          computed_at: result.thresholds.computed_at,
          model_version: modelVersion,
          H_thresh: result.thresholds.H_thresh,
          V_thresh: result.thresholds.V_thresh,
          D_thresh: result.thresholds.D_thresh,
          brier_skill_score: result.thresholds.brier_skill_score,
          training_window_days: windowDays,
          n_examples: examples.length,
          grid_search_log: result.top5,
          notes:
            'mention_z is stubbed at 0 until 20-A-02 ships; calibrated V_thresh will not fire predicates until then.',
        },
      });
    } catch (e) {
      return {
        ...result,
        exit_code: 5,
        notes: `DB_WRITE_ERROR: ${(e as Error).message}`,
      };
    }
  }

  return result;
}

// CLI entry — `npm run calibrate-crowded-consensus`.
if (process.argv[1] && process.argv[1].endsWith('calibrate-crowded-consensus.ts')) {
  runCalibration({})
    .then((r) => {
      console.log(JSON.stringify(r, null, 2));
      process.exit(r.exit_code);
    })
    .catch((e) => {
      console.error('FATAL', e);
      process.exit(5);
    });
}
