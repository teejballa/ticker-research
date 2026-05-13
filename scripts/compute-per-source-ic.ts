// scripts/compute-per-source-ic.ts
//
// Phase 20-C-01: Daily recompute — per-input-source rolling 20-day Spearman
// IC, ICIR, Newey-West HAC p-value, with Benjamini-Hochberg FDR correction
// across the (source × horizon) panel before persistence.
//
// Local debug:
//   tsx scripts/compute-per-source-ic.ts
//
// Idempotent on rerun: composite unique on
// (source_id, computed_at, forward_horizon_days, model_version) + skipDuplicates: true.

import { prisma } from '@/lib/db';
import { computePerSourceIC } from '@/lib/sentiment/per-source-ic';
import { benjaminiHochbergFDR } from '@/lib/stats/bh-fdr';

const SOURCES = [
  'stocktwits',
  'reddit',
  'x',
  'news',
  'apewisdom',
  'firecrawl',
] as const;

const HORIZONS = [7, 30] as const;

type ComputedRow = {
  source: (typeof SOURCES)[number];
  horizon: (typeof HORIZONS)[number];
  ic_20d: number;
  icir_20d: number | null;
  ic_se_nw: number;
  ic_p_value_nw: number;
  n_observations: number;
  nw_lag: number;
};

export async function runComputePerSourceIC({
  asOf,
}: {
  asOf: Date;
}): Promise<{
  rows_written: number;
  sources_attempted: number;
  diagnostic?: string;
}> {
  const sourcesAttempted = SOURCES.length * HORIZONS.length;
  try {
    const results: ComputedRow[] = [];

    for (const source of SOURCES) {
      for (const horizon of HORIZONS) {
        try {
          const ic = await computePerSourceIC(source, horizon, asOf);
          if (!ic) {
            console.log(
              `[per-source-ic] ${source}@${horizon}d: cold-start (n<20 or N<5 per day) — skipping row`,
            );
            continue;
          }
          results.push({ source, horizon, ...ic });
        } catch (err) {
          console.error(
            `[per-source-ic] ${source}@${horizon}d: compute failed — skipping row`,
            err,
          );
          continue;
        }
      }
    }

    if (results.length === 0) {
      return {
        rows_written: 0,
        sources_attempted: sourcesAttempted,
        diagnostic:
          'no sources met n>=20 + N>=5 threshold — all returned null',
      };
    }

    // BH-FDR correction across all (source × horizon) p-values in this run.
    const pValues = results.map((r) => r.ic_p_value_nw);
    const { corrected } = benjaminiHochbergFDR(pValues, 0.05);

    const rowsToInsert = results.map((r, idx) => ({
      source_id: r.source,
      computed_at: asOf,
      forward_horizon_days: r.horizon,
      ic_20d: r.ic_20d,
      icir_20d: r.icir_20d,
      ic_se_nw: r.ic_se_nw,
      ic_p_value_nw: r.ic_p_value_nw,
      ic_p_value_bh_fdr: corrected[idx],
      n_observations: r.n_observations,
      nw_lag: r.nw_lag,
      model_version: 'per-source-ic-v1',
    }));

    const result = await prisma.perSourceIC.createMany({
      data: rowsToInsert,
      skipDuplicates: true,
    });

    return {
      rows_written: result.count,
      sources_attempted: sourcesAttempted,
    };
  } catch (err) {
    console.error('[per-source-ic] fatal:', err);
    throw err;
  }
}

// Allow direct invocation: `tsx scripts/compute-per-source-ic.ts`.
if (require.main === module) {
  runComputePerSourceIC({ asOf: new Date() })
    .then((r) => {
      console.log('[per-source-ic] done:', r);
      process.exit(0);
    })
    .catch((e) => {
      console.error('[per-source-ic] error:', e);
      process.exit(1);
    });
}
