#!/usr/bin/env npx tsx
// scripts/calibration-report.ts
//
// Phase 19 / Plan 19-A-06 — Calibration Validation Harness.
//
// Per CONTEXT D-22 + RESEARCH §"calibration drift detection", this script
// produces an ongoing audit of how well the diffusion engine's predicted
// hit-probabilities match observed outcomes. For each signal class, it:
//
//   1. Pulls every `posterior_update` LearningEvent (paired prediction +
//      outcome — same data flow used by tune-lambda.ts and the alpha-decay
//      watch cron).
//   2. Resolves each event's prediction by looking up the corresponding
//      LearnedPattern cell's posterior mean (alpha / (alpha + beta)).
//   3. Resolves each event's outcome by computing the alpha-vs-SPY hit flag
//      (ticker_return_pct - spy_return_pct > 1pp — same threshold as
//      classifyHit in src/lib/learning.ts; see memory entry "Hit
//      Classification Uses SPY-Relative Returns with 1% Threshold").
//   4. Runs reliabilityDiagram() and hosmerLemeshow() against the resulting
//      (predictions[], outcomes[]) arrays.
//   5. Writes a Markdown report containing per-class chi-square verdicts
//      and ASCII bar-charted reliability bins.
//
// OUTPUT LOCATION — per CLAUDE.md "Never store generated research artifacts
// inside the repository", reports go to /tmp/calibration-reports/ exclusively.
// We never create a repo-local calibration-reports/ directory; the .gitignore
// belt-and-suspender is just there in case someone shadows the OUTPUT_DIR
// constant with a relative path during a hot patch.
//
// Usage:
//   npm run calibration-report
//
// Output: /tmp/calibration-reports/<YYYY-MM-DD>.md

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '.env.local' });

import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';

import {
  reliabilityDiagram,
  hosmerLemeshow,
  posteriorMean,
} from '../src/lib/learning';

// Per CLAUDE.md "Never store generated research artifacts inside the
// repository": calibration reports are generated audit artifacts → /tmp.
const OUTPUT_DIR = '/tmp/calibration-reports';

const SIGNAL_CLASSES = ['diffusion', 'technical', 'insider', 'institutional'] as const;
const ALPHA_THRESHOLD_PCT = 1; // matches classifyHit() in src/lib/learning.ts
const HL_REJECT_P = 0.05;
const MIN_N_FOR_AUDIT = 30;

type SignalClass = (typeof SIGNAL_CLASSES)[number];

interface DeltaPayload {
  ticker_return_pct?: number;
  spy_return_pct?: number;
  hit?: boolean;
  diffusion_hit?: boolean;
  tech_hit?: boolean;
  insider_hit?: boolean;
  institutional_hit?: boolean;
}

function classifyHit(d: DeltaPayload, cls: SignalClass): boolean | null {
  // Prefer numeric returns (alpha-vs-SPY > 1pp). Fall back to per-class hit
  // flags if returns are absent (older events).
  if (
    typeof d.ticker_return_pct === 'number' &&
    typeof d.spy_return_pct === 'number'
  ) {
    return d.ticker_return_pct - d.spy_return_pct > ALPHA_THRESHOLD_PCT;
  }
  if (cls === 'diffusion' && typeof d.diffusion_hit === 'boolean') return d.diffusion_hit;
  if (cls === 'technical' && typeof d.tech_hit === 'boolean') return d.tech_hit;
  if (cls === 'insider' && typeof d.insider_hit === 'boolean') return d.insider_hit;
  if (cls === 'institutional' && typeof d.institutional_hit === 'boolean') return d.institutional_hit;
  if (typeof d.hit === 'boolean') return d.hit;
  return null;
}

function asciiBar(freq: number, width = 20): string {
  const filled = Math.max(0, Math.min(width, Math.round(freq * width)));
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

interface ClassResult {
  signal_class: SignalClass;
  n: number;
  chiSquare?: number;
  pValue?: number;
  df?: number;
  bins?: ReturnType<typeof reliabilityDiagram>;
  reason?: string;
}

async function auditClass(
  prisma: PrismaClient,
  cls: SignalClass,
): Promise<ClassResult> {
  // 1. Fetch every posterior_update event for this class.
  const events = await prisma.learningEvent.findMany({
    where: {
      event_type: 'posterior_update',
      signal_class: cls,
      pattern_key: { not: null },
    },
    orderBy: { occurred_at: 'asc' },
  });

  if (events.length === 0) {
    return { signal_class: cls, n: 0, reason: 'no posterior_update events' };
  }

  // 2. Build the cell→prediction lookup. The prediction we're auditing IS the
  //    cell's posterior mean at audit time — the same prior the engine
  //    surfaces in /research/[ticker] and /insights.
  const cells = await prisma.learnedPattern.findMany({
    where: { signal_class: cls },
    select: {
      pattern_key: true,
      cap_class: true,
      horizon_days: true,
      alpha: true,
      beta: true,
    },
  });
  const cellPrediction = new Map<string, number>();
  for (const c of cells) {
    const key = `${c.pattern_key}|${c.cap_class}|${c.horizon_days}`;
    cellPrediction.set(key, posteriorMean({ alpha: c.alpha, beta: c.beta }));
  }

  // 3. Pair each event with its (prediction, outcome).
  const predictions: number[] = [];
  const outcomes: boolean[] = [];
  for (const ev of events) {
    if (ev.pattern_key == null || ev.cap_class == null || ev.horizon_days == null) {
      continue;
    }
    const key = `${ev.pattern_key}|${ev.cap_class}|${ev.horizon_days}`;
    const pred = cellPrediction.get(key);
    if (pred === undefined) continue; // event from a now-deleted cell
    const d = ev.delta as DeltaPayload | null;
    if (!d) continue;
    const hit = classifyHit(d, cls);
    if (hit === null) continue;
    predictions.push(pred);
    outcomes.push(hit);
  }

  if (predictions.length < MIN_N_FOR_AUDIT) {
    return {
      signal_class: cls,
      n: predictions.length,
      reason: `insufficient data (n=${predictions.length}, need ≥${MIN_N_FOR_AUDIT})`,
    };
  }

  const hl = hosmerLemeshow({ predictions, outcomes });
  return {
    signal_class: cls,
    n: predictions.length,
    chiSquare: hl.chiSquare,
    pValue: hl.pValue,
    df: hl.degreesOfFreedom,
    bins: hl.bins,
  };
}

function renderResult(r: ClassResult): string[] {
  const lines: string[] = [];
  lines.push(`## ${r.signal_class}  (n=${r.n})`);
  if (r.reason || r.chiSquare === undefined) {
    lines.push('');
    lines.push(`_${r.reason ?? 'no result'}_`);
    lines.push('');
    return lines;
  }
  const verdict =
    r.pValue! >= HL_REJECT_P
      ? '✓ calibrated (cannot reject null at α=0.05)'
      : '✗ miscalibrated (reject null at α=0.05)';
  lines.push('');
  lines.push(`- chi-square: **${r.chiSquare!.toFixed(3)}**`);
  lines.push(`- df: ${r.df}`);
  lines.push(`- p-value: ${r.pValue!.toExponential(3)}`);
  lines.push(`- verdict: ${verdict}`);
  lines.push('');
  lines.push('| Bin | low | high | mean_pred | obs_freq | n | chart |');
  lines.push('|-----|-----|------|-----------|----------|---|-------|');
  for (const b of r.bins!) {
    lines.push(
      `| ${b.binIndex} | ${b.binLow.toFixed(3)} | ${b.binHigh.toFixed(3)} | ${b.meanPrediction.toFixed(3)} | ${b.observedFrequency.toFixed(3)} | ${b.count} | \`${asciiBar(b.observedFrequency)}\` |`,
    );
  }
  lines.push('');
  return lines;
}

async function main() {
  const date = new Date().toISOString().slice(0, 10);
  const lines: string[] = [];
  lines.push(`# Calibration Report — ${date}`);
  lines.push('');
  lines.push(
    'Per-signal-class reliability diagram + Hosmer-Lemeshow goodness-of-fit',
  );
  lines.push(
    'over all `posterior_update` LearningEvents. Generated by',
  );
  lines.push('`scripts/calibration-report.ts` (Phase 19 / Plan 19-A-06).');
  lines.push('');
  lines.push(
    'Reports live in `/tmp/calibration-reports/` and are NEVER committed to',
  );
  lines.push(
    'the repo (CLAUDE.md: "Never store generated research artifacts").',
  );
  lines.push('');

  if (!process.env.DATABASE_URL) {
    // Fall back to a synthetic-mode header so smoke tests still produce a
    // valid file even when DATABASE_URL is absent. The audit body will be
    // empty but the Markdown will still parse.
    lines.push('> **WARNING:** DATABASE_URL not set — no audit performed.');
    lines.push('');
    mkdirSync(OUTPUT_DIR, { recursive: true });
    const fname = path.join(OUTPUT_DIR, `${date}.md`);
    writeFileSync(fname, lines.join('\n'));
    console.log(`[calibration-report] DATABASE_URL absent — wrote stub report to ${fname}`);
    return;
  }

  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    for (const cls of SIGNAL_CLASSES) {
      const r = await auditClass(prisma, cls);
      lines.push(...renderResult(r));
    }
  } finally {
    await prisma.$disconnect();
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const fname = path.join(OUTPUT_DIR, `${date}.md`);
  writeFileSync(fname, lines.join('\n'));
  console.log(`[calibration-report] wrote ${fname}`);
}

main().catch((err) => {
  console.error('[calibration-report] FAILED:', err);
  process.exit(1);
});
