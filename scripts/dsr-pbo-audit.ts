#!/usr/bin/env npx tsx
// scripts/dsr-pbo-audit.ts
//
// Phase 19 Plan 19-A-04 — DSR / PBO threshold calibration audit.
//
// Reads ACTIVE LearnedPattern rows with sufficient sample size (alpha+beta ≥
// 30), computes their per-cell DSR (using stored alpha/beta + horizon as a
// proxy for SR estimate) and PBO percentile distribution, then writes a
// threshold config consumed by Plan 19-Z-04 model-card-status.
//
// Per RESEARCH §19-A-04 Q2: threshold for DSR is the 25th percentile (cells
// below this are "underperforming"); PBO threshold is the 75th percentile
// (cells above this are overfit). The composite gate in 19-Z-04 then asserts
// avg(DSR) > p25_dsr and avg(PBO) < p75_pbo across ACTIVE cells.
//
// Output: config/quant-gate-thresholds.json — read by 19-Z-04 if present,
// else 19-Z-04 falls back to hardcoded defaults (0.5 / 0.5).

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

interface ThresholdConfig {
  dsr_threshold: number;
  pbo_threshold: number;
  audited_at: string;
  n_cells: number;
  distribution: {
    dsr: { min: number; p25: number; p50: number; p75: number; max: number };
    pbo: { min: number; p25: number; p50: number; p75: number; max: number };
  };
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = q * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

function summarize(values: number[]): {
  min: number;
  p25: number;
  p50: number;
  p75: number;
  max: number;
} {
  if (values.length === 0) {
    return { min: 0, p25: 0, p50: 0, p75: 0, max: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  return {
    min: sorted[0],
    p25: quantile(sorted, 0.25),
    p50: quantile(sorted, 0.5),
    p75: quantile(sorted, 0.75),
    max: sorted[sorted.length - 1],
  };
}

async function main(): Promise<number> {
  const prisma = new PrismaClient();
  try {
    // Pull ACTIVE cells with adequate sample. Both dsr and pbo are nullable;
    // we filter to rows where both have been computed (matching 19-Z-04 gate
    // semantics).
    const rows = await prisma.learnedPattern.findMany({
      where: {
        status: 'ACTIVE',
        dsr: { not: null },
        pbo: { not: null },
      },
      select: {
        signal_class: true,
        pattern_key: true,
        cap_class: true,
        horizon_days: true,
        dsr: true,
        pbo: true,
        alpha: true,
        beta: true,
      },
    });

    const eligible = rows.filter(
      (r) => (r.alpha ?? 0) + (r.beta ?? 0) >= 30,
    );
    const dsrs = eligible
      .map((r) => r.dsr)
      .filter((v): v is number => v != null);
    const pbos = eligible
      .map((r) => r.pbo)
      .filter((v): v is number => v != null);

    const dsrSummary = summarize(dsrs);
    const pboSummary = summarize(pbos);

    // Calibration recipe (RESEARCH Q2): require avg(DSR) > p25 of observed
    // distribution and avg(PBO) < p75. If sample is too sparse (n < 5),
    // fall back to literature defaults.
    const dsrThreshold = eligible.length >= 5 ? dsrSummary.p25 : 0.5;
    const pboThreshold = eligible.length >= 5 ? pboSummary.p75 : 0.5;

    const config: ThresholdConfig = {
      dsr_threshold: dsrThreshold,
      pbo_threshold: pboThreshold,
      audited_at: new Date().toISOString(),
      n_cells: eligible.length,
      distribution: { dsr: dsrSummary, pbo: pboSummary },
    };

    const outDir = path.resolve(process.cwd(), 'config');
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, 'quant-gate-thresholds.json');
    writeFileSync(outPath, JSON.stringify(config, null, 2) + '\n');

    console.log('DSR/PBO audit complete');
    console.log(`  cells audited:  ${eligible.length}`);
    console.log(
      `  dsr  min/p25/p50/p75/max: ${dsrSummary.min.toFixed(4)} / ${dsrSummary.p25.toFixed(4)} / ${dsrSummary.p50.toFixed(4)} / ${dsrSummary.p75.toFixed(4)} / ${dsrSummary.max.toFixed(4)}`,
    );
    console.log(
      `  pbo  min/p25/p50/p75/max: ${pboSummary.min.toFixed(4)} / ${pboSummary.p25.toFixed(4)} / ${pboSummary.p50.toFixed(4)} / ${pboSummary.p75.toFixed(4)} / ${pboSummary.max.toFixed(4)}`,
    );
    console.log(`  thresholds → dsr ≥ ${dsrThreshold.toFixed(4)}, pbo ≤ ${pboThreshold.toFixed(4)}`);
    console.log(`  wrote: ${outPath}`);

    // Punch list: cells failing thresholds
    const punch = eligible.filter(
      (r) =>
        (r.dsr ?? 0) < dsrThreshold || (r.pbo ?? 1) > pboThreshold,
    );
    if (punch.length > 0) {
      console.log(`\nPunch list (${punch.length} cell${punch.length === 1 ? '' : 's'} failing thresholds):`);
      for (const r of punch.slice(0, 30)) {
        console.log(
          `  ${r.signal_class}/${r.pattern_key}/${r.cap_class}/${r.horizon_days}d  dsr=${(r.dsr ?? 0).toFixed(4)}  pbo=${(r.pbo ?? 0).toFixed(4)}`,
        );
      }
      if (punch.length > 30) console.log(`  ... and ${punch.length - 30} more`);
    }
    return 0;
  } catch (err) {
    console.error('dsr-pbo-audit failed:', err);
    return 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().then((code) => process.exit(code));
