#!/usr/bin/env tsx
// scripts/calibrate-temperature.ts
// Plan 20-B-03 — CLI entry point for temperature calibration.
//
// Usage:
//   npx tsx scripts/calibrate-temperature.ts --classifier {finbert | gemini-per-doc | all} \
//      [--fpb-only] [--dry-run] [--out /tmp/calibration-report.json]
//
// Reuses scripts/calibrate-temperature-core.ts so the monthly cron and this
// CLI share one implementation (T-20-B-03-04 — auto-refit on classifier_version
// change). Persists APPEND-ONLY TemperatureCalibration rows to live Neon
// unless --dry-run is passed.
//
// Reference: Guo et al. 2017 — https://arxiv.org/abs/1706.04599

import * as fs from 'node:fs';

import {
  runCalibration,
  persistCalibrationRow,
  emitHyperparametersPatch,
  type ClassifierKind,
} from './calibrate-temperature-core';

interface CliArgs {
  classifier: ClassifierKind | 'all';
  fpbOnly: boolean;
  dryRun: boolean;
  out: string | null;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    classifier: 'all',
    fpbOnly: false,
    dryRun: false,
    out: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      console.log(
        'Usage: npx tsx scripts/calibrate-temperature.ts --classifier {finbert|gemini-per-doc|all} [--fpb-only] [--dry-run] [--out PATH]',
      );
      process.exit(0);
    } else if (a === '--classifier') {
      const v = argv[++i] as ClassifierKind | 'all';
      if (!['finbert', 'gemini-per-doc', 'all'].includes(v)) {
        console.error(`Invalid --classifier: ${v}`);
        process.exit(2);
      }
      args.classifier = v;
    } else if (a === '--fpb-only') {
      args.fpbOnly = true;
    } else if (a === '--dry-run') {
      args.dryRun = true;
    } else if (a === '--out') {
      args.out = argv[++i] ?? null;
    }
  }
  return args;
}

function printSummary(
  results: Awaited<ReturnType<typeof runCalibration>>,
): void {
  console.log('');
  console.log(
    '| classifier_version                  | T       | ECE_pre | ECE_post | Brier_pre | Brier_post | n_val | status         |',
  );
  console.log(
    '|-------------------------------------|---------|---------|----------|-----------|------------|-------|----------------|',
  );
  for (const r of results) {
    const ver = r.classifier_version.padEnd(36);
    const T = r.temperature.toFixed(4).padStart(7);
    const ep = r.ece_pre_scaling.toFixed(4).padStart(7);
    const eps = r.ece_post_scaling.toFixed(4).padStart(8);
    const bp = r.brier_pre_scaling.toFixed(4).padStart(9);
    const bps = r.brier_post_scaling.toFixed(4).padStart(10);
    const n = r.n_validation_samples.toString().padStart(5);
    const s = r.status.padEnd(14);
    console.log(`| ${ver} | ${T} | ${ep} | ${eps} | ${bp} | ${bps} | ${n} | ${s} |`);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);

  console.log(
    `[calibrate-temperature] classifier=${args.classifier} dryRun=${args.dryRun} fpbOnly=${args.fpbOnly}`,
  );

  // n_production_samples is 0 until 20-Z-05 extends HumanExemplar with class_label.
  // TODO 20-Z-05 — extend HumanExemplar with class_label field for direct
  // calibration use; until then production-labeled count is 0 and runs are
  // flagged degraded by the PRODUCTION_LABELS_FLOOR check.
  const productionLabelsCount = args.fpbOnly ? 0 : 0;

  const results = await runCalibration(args.classifier, {
    dryRun: args.dryRun,
    mockProductionLabels: productionLabelsCount,
  });

  printSummary(results);

  const patch = emitHyperparametersPatch(results);
  if (args.out) {
    fs.writeFileSync(args.out, JSON.stringify({ results, patch }, null, 2));
    console.log(`\n[calibrate-temperature] wrote ${args.out}`);
  } else {
    console.log('\n--- HYPERPARAMETERS.md patch ---');
    console.log(patch);
  }

  if (args.dryRun) {
    console.log('\n[calibrate-temperature] --dry-run: skipping DB writes.');
    return;
  }

  // Persist via prisma — only at this point do we need a live DB connection.
  if (!process.env.DATABASE_URL) {
    console.error(
      '[calibrate-temperature] DATABASE_URL not set; cannot persist. Re-run with --dry-run for read-only.',
    );
    process.exit(2);
  }
  const { prisma } = await import('../src/lib/db');
  try {
    for (const r of results) {
      await persistCalibrationRow(prisma, r);
      console.log(
        `[calibrate-temperature] persisted ${r.classifier_version} (status=${r.status})`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[calibrate-temperature] failure:', err);
  process.exit(1);
});
