#!/usr/bin/env tsx
// scripts/fit-composite-isotonic.ts
// Phase 24 diagnostic CLI. Fits per-class isotonic curves + computes composite CI
// for a (regime × cap_class × horizon) cell. READ-ONLY — writes nothing to DB.
// The scheduled write path is /api/cron/composite-calibration (Wave 3).
//
// Usage:
//   npx tsx scripts/fit-composite-isotonic.ts --regime ALL --cap large_cap
//   npx tsx scripts/fit-composite-isotonic.ts --regime bull-low-vol --cap mid_cap --horizon 30 --as-of 2026-09-01
//   npx tsx scripts/fit-composite-isotonic.ts --dry-run
//
// Exit codes:
//   0 — success (JSON summary printed to stdout)
//   1 — unexpected error
//   2 — insufficient fit rows (< MIN_N_FIT_PER_CLASS = 50)

import { prisma } from '@/lib/db';
import {
  loadFitDataset,
  loadHoldoutDataset,
  fitPerClassCurves,
  computeCompositeCi,
} from '@/lib/composite/isotonic-fit';
import { deserialize } from '@/lib/composite';

interface Args {
  regime: string;
  cap: string;
  horizon: number;
  asOf: Date;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { regime: 'ALL', cap: 'large_cap', horizon: 30, asOf: new Date(), dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--regime') args.regime = argv[++i];
    else if (a === '--cap') args.cap = argv[++i];
    else if (a === '--horizon') args.horizon = parseInt(argv[++i], 10);
    else if (a === '--as-of') args.asOf = new Date(argv[++i]);
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--help' || a === '-h') {
      console.log(
        'Usage: npx tsx scripts/fit-composite-isotonic.ts [--regime STR] [--cap STR] [--horizon N] [--as-of ISO] [--dry-run]',
      );
      process.exit(0);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const fitRows = await loadFitDataset({
    asOf: args.asOf,
    regime: args.regime,
    cap_class: args.cap,
    horizonDays: args.horizon,
  });
  const holdRows = await loadHoldoutDataset({
    asOf: args.asOf,
    windowDays: 30,
    regime: args.regime,
    cap_class: args.cap,
    horizonDays: args.horizon,
  });

  if (fitRows.length < 50) {
    console.error(
      JSON.stringify({ ok: false, reason: 'insufficient_fit_rows', n_fit: fitRows.length }),
    );
    process.exit(2);
  }

  const curves = fitPerClassCurves(fitRows, { minN: 50, horizonDays: args.horizon });
  const decoded = Object.fromEntries(
    (['diffusion', 'technical', 'institutional', 'insider'] as const).map((c) => [
      c,
      curves[c] ? deserialize(curves[c]!) : ((x: number) => x),
    ]),
  ) as Record<'diffusion' | 'technical' | 'institutional' | 'insider', (x: number) => number>;

  const ci = holdRows.length >= 100
    ? computeCompositeCi(holdRows, decoded, { nResamples: 1000, seed: 42 })
    : null;

  const summary = {
    ok: true,
    regime: args.regime,
    cap_class: args.cap,
    horizon_days: args.horizon,
    as_of: args.asOf.toISOString(),
    dry_run: args.dryRun,
    n_fit: fitRows.length,
    n_holdout: holdRows.length,
    curves: Object.fromEntries(
      (['diffusion', 'technical', 'institutional', 'insider'] as const).map((c) => [
        c,
        curves[c] ? { breakpoints: curves[c]!.x_breakpoints.length } : null,
      ]),
    ),
    composite_ci: ci,
  };
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((e) => {
    console.error(JSON.stringify({ ok: false, error: String(e) }));
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
