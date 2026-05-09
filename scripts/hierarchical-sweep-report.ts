#!/usr/bin/env npx tsx
// scripts/hierarchical-sweep-report.ts
//
// Phase 19 / Plan 19-A-07 / CORE-ML-12 — Hierarchical pooling structure sweep.
//
// Compares three pooling levels against current LearnedPattern state:
//   1. no-pool       — α_local / β_local only (current production behaviour)
//   2. 2-level pool  — group by (signal_class, cap_class)
//   3. 3-level pool  — group by (signal_class, cap_class, horizon_days)
//
// For each level, summarises across all cells:
//   - median 95% credible-interval width (lower is better — tighter posterior)
//   - mean shrinkage_strength (effective parent prior count)
//   - fraction of cells receiving non-zero pooling
//
// Output: /tmp/calibration-reports/hierarchical-sweep-<YYYY-MM-DD>.md
// Per CLAUDE.md "Never store generated research artifacts inside the
// repository", reports never land at a repo-local path.
//
// Usage:
//   npm run hierarchical-sweep-report

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '.env.local' });

import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import {
  hierarchicalPooledPosterior,
  credibleInterval95,
  type BetaPosterior,
} from '../src/lib/learning';

const OUTPUT_DIR = '/tmp/calibration-reports';

interface Cell {
  signal_class: string;
  cap_class: string;
  horizon_days: number;
  alpha: number;
  beta: number;
  sample_size: number;
}

interface LevelSummary {
  label: string;
  median_ci_width: number;
  mean_shrinkage: number;
  pooled_fraction: number;
  total_cells: number;
}

function median(arr: number[]): number {
  if (arr.length === 0) return NaN;
  const sorted = [...arr].sort((a, b) => a - b);
  const m = sorted.length;
  return m % 2
    ? sorted[(m - 1) / 2]
    : (sorted[m / 2 - 1] + sorted[m / 2]) / 2;
}

function mean(arr: number[]): number {
  if (arr.length === 0) return NaN;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function summarise(
  label: string,
  cells: Cell[],
  groupBy: (c: Cell) => string
): LevelSummary {
  const groups = new Map<string, Cell[]>();
  for (const c of cells) {
    const k = groupBy(c);
    const arr = groups.get(k);
    if (arr) arr.push(c);
    else groups.set(k, [c]);
  }

  const widths: number[] = [];
  const shrinkages: number[] = [];
  let pooledCount = 0;

  for (const groupCells of groups.values()) {
    const groupBetas: BetaPosterior[] = groupCells.map((c) => ({
      alpha: c.alpha,
      beta: c.beta,
    }));
    for (const c of groupCells) {
      const result = hierarchicalPooledPosterior({
        cell_local: { alpha: c.alpha, beta: c.beta },
        cell_n: c.sample_size,
        group_cells: groupBetas,
      });
      const ci = credibleInterval95({
        alpha: result.alpha_pooled,
        beta: result.beta_pooled,
      });
      widths.push(ci.high - ci.low);
      shrinkages.push(result.shrinkage_strength);
      if (result.shrinkage_strength > 0) pooledCount += 1;
    }
  }

  return {
    label,
    median_ci_width: median(widths),
    mean_shrinkage: mean(shrinkages),
    pooled_fraction: cells.length === 0 ? 0 : pooledCount / cells.length,
    total_cells: cells.length,
  };
}

function summariseNoPool(cells: Cell[]): LevelSummary {
  const widths: number[] = [];
  for (const c of cells) {
    const ci = credibleInterval95({ alpha: c.alpha, beta: c.beta });
    widths.push(ci.high - ci.low);
  }
  return {
    label: 'no-pool',
    median_ci_width: median(widths),
    mean_shrinkage: 0,
    pooled_fraction: 0,
    total_cells: cells.length,
  };
}

function pickBest(summaries: LevelSummary[]): LevelSummary {
  return summaries.reduce((best, s) =>
    s.median_ci_width < best.median_ci_width ? s : best
  );
}

function writeReport(summaries: LevelSummary[], outputPath: string): void {
  const best = pickBest(summaries);
  const rows = summaries
    .map(
      (s) =>
        `| ${s.label.padEnd(8)} | ${s.median_ci_width.toFixed(4)} | ` +
        `${s.mean_shrinkage.toFixed(2)} | ${(s.pooled_fraction * 100).toFixed(1)}% | ${s.total_cells} |`
    )
    .join('\n');

  const reportLines = [
    `# Hierarchical pooling structure sweep — ${new Date().toISOString().slice(0, 10)}`,
    '',
    'Plan 19-A-07 / CORE-ML-12. Compares three grouping structures against',
    "the current LearnedPattern table. The structure with the smallest median",
    '95% CI width is the recommended production pool.',
    '',
    '| level    | median 95% CI width | mean λ | pooled % | cells |',
    '|----------|---------------------|--------|----------|-------|',
    rows,
    '',
    `**Verdict**: \`${best.label}\` produces the tightest median CI (${best.median_ci_width.toFixed(4)}).`,
    '',
    '## Notes',
    '- "no-pool" baseline uses α_local / β_local only.',
    '- "2-level" pools cells in the same (signal_class, cap_class).',
    '- "3-level" further partitions by horizon_days.',
    '- Tighter CI means more confident posteriors; the empirical-Bayes',
    '  benefit is largest in the level where group homogeneity is highest.',
    '- Cold-start (group < 5 cells) returns local unchanged — these cells',
    '  contribute to the median but do not benefit from pooling.',
  ];

  writeFileSync(outputPath, reportLines.join('\n') + '\n');
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL not set — aborting.');
    process.exit(1);
  }

  const adapter = new PrismaNeon({
    connectionString: process.env.DATABASE_URL!,
  });
  const prisma = new PrismaClient({ adapter });

  try {
    const cells = (await prisma.learnedPattern.findMany({
      where: { cap_class: { not: 'unknown' } },
      select: {
        signal_class: true,
        cap_class: true,
        horizon_days: true,
        alpha: true,
        beta: true,
        sample_size: true,
      },
    })) as Cell[];

    if (cells.length === 0) {
      console.error('No LearnedPattern rows found — sweep aborted.');
      process.exit(0);
    }

    const noPool = summariseNoPool(cells);
    const twoLevel = summarise(
      '2-level',
      cells,
      (c) => `${c.signal_class}|${c.cap_class}`
    );
    const threeLevel = summarise(
      '3-level',
      cells,
      (c) => `${c.signal_class}|${c.cap_class}|${c.horizon_days}`
    );

    mkdirSync(OUTPUT_DIR, { recursive: true });
    const date = new Date().toISOString().slice(0, 10);
    const outputPath = path.join(OUTPUT_DIR, `hierarchical-sweep-${date}.md`);
    writeReport([noPool, twoLevel, threeLevel], outputPath);

    console.log(`[hierarchical-sweep] wrote ${outputPath}`);
    console.log(`[hierarchical-sweep] cells audited: ${cells.length}`);
    console.log(`[hierarchical-sweep] verdict: ${pickBest([noPool, twoLevel, threeLevel]).label}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[hierarchical-sweep] fatal:', err);
  process.exit(1);
});
