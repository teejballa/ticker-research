#!/usr/bin/env tsx
// scripts/eval-report.ts
//
// Plan 20-Z-05 — LLM-as-judge eval-report CLI.
//
// Usage:
//   npm run eval -- \
//     --baseline tests/eval/fixtures/baseline.txt \
//     --candidate tests/eval/fixtures/candidate.txt \
//     --human-labels tests/golden-tickers/_human_labels \
//     --out /tmp/eval-report.json \
//     [--dry-run] \
//     [--md /tmp/eval-report.md]
//
// Flow:
//   1. Read every JSON file under --human-labels as a HumanExemplar.
//   2. For each exemplar: call judge(baseline_text, candidate_text). In
//      --dry-run mode (default when ANTHROPIC_API_KEY is unset) the judge
//      call is REPLACED with a deterministic synthetic scoring derived from
//      a per-exemplar hash so the harness can run in CI without live tokens.
//   3. Also call judge on the standalone --baseline / --candidate fixture
//      pair (one extra pair — used to sanity-check end-to-end plumbing).
//   4. Compute per-dimension Pearson correlation across all exemplars.
//   5. Emit JSON to --out and markdown to --md (default: --out's basename
//      with .md extension).
//   6. Emit a Pearson sample-size warning when n < 30 (20-D-04 dependency).
//
// Cost: in live mode one Claude Opus 4.7 call per exemplar + one for the
// fixture pair. Five exemplars + fixture = 6 calls total per run. Pinned
// temperature=0 + no caching (T-20-Z-05-05).
//
// Sample-size threshold: 30. Below this the per-dimension Pearson is too
// noisy to act on (rule-of-thumb minimum; 20-D-04 grows the set to 30).
//
// Wall-clock target: < 60s for the 5-exemplar starter set on dry-run mode.

import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { createHash } from 'node:crypto';

import { judge } from '@/lib/eval/judge';
import {
  JUDGE_DIMENSIONS,
  type HumanExemplar,
  type JudgeDimension,
  type JudgeResult,
  type JudgeScoreValue,
} from '@/lib/eval/types';

// ── CLI parsing ─────────────────────────────────────────────────────────────

interface Args {
  baseline: string;
  candidate: string;
  humanLabels: string;
  out: string;
  md?: string;
  dryRun: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  const args: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i++;
    }
  }
  function req(k: string): string {
    const v = args[k];
    if (typeof v !== 'string') throw new Error(`Missing required flag --${k}`);
    return v;
  }
  const dryRunRaw = args['dry-run'];
  // Default to dry-run when ANTHROPIC_API_KEY is unset to keep CI hermetic.
  const dryRun =
    dryRunRaw === true ||
    dryRunRaw === 'true' ||
    !process.env.ANTHROPIC_API_KEY;
  return {
    baseline: req('baseline'),
    candidate: req('candidate'),
    humanLabels: req('human-labels'),
    out: req('out'),
    md: typeof args.md === 'string' ? args.md : undefined,
    dryRun,
  };
}

// ── Pearson correlation ─────────────────────────────────────────────────────
//
// Standard sample-Pearson r = sum((x_i - mean_x)*(y_i - mean_y)) /
//                              sqrt(sum((x_i - mean_x)^2) * sum((y_i - mean_y)^2))
// Returns NaN if either side has zero variance.

function pearson(xs: readonly number[], ys: readonly number[]): number {
  if (xs.length !== ys.length || xs.length === 0) return Number.NaN;
  const n = xs.length;
  let sx = 0, sy = 0;
  for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; }
  const mx = sx / n;
  const my = sy / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  if (denom === 0) return Number.NaN;
  return num / denom;
}

// ── Exemplar loading ────────────────────────────────────────────────────────

function loadExemplars(dir: string): HumanExemplar[] {
  if (!existsSync(dir)) throw new Error(`Human-labels directory not found: ${dir}`);
  const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  const out: HumanExemplar[] = [];
  for (const f of files) {
    const text = readFileSync(join(dir, f), 'utf8');
    const j = JSON.parse(text) as HumanExemplar;
    for (const d of JUDGE_DIMENSIONS) {
      if (typeof j.human_scores?.[d] !== 'number') {
        throw new Error(`Exemplar ${f} missing human_scores.${d}`);
      }
    }
    out.push(j);
  }
  return out;
}

// ── Dry-run scoring ─────────────────────────────────────────────────────────
//
// Deterministic synthetic judge for CI / no-token runs. Hashes the
// baseline+candidate together with the dimension name and folds the hash into
// 0..5. Tracks the human score loosely (adds +1/-1 around it half the time)
// so per-dimension Pearson is non-degenerate but not perfect — exercises the
// reporting code path realistically without burning tokens.

function dryRunJudge(exemplar: HumanExemplar): JudgeResult {
  const scores = JUDGE_DIMENSIONS.map((dim) => {
    const seed = createHash('sha256')
      .update(exemplar.exemplar_id)
      .update('|')
      .update(dim)
      .update('|')
      .update(exemplar.candidate_text)
      .digest();
    const offset = (seed[0] % 3) - 1; // -1, 0, +1
    const human = exemplar.human_scores[dim];
    const raw = Math.max(0, Math.min(5, human + offset));
    return {
      dimension: dim,
      score: raw as JudgeScoreValue,
      rationale: `[dry-run] synthetic score offset=${offset} of human=${human}`,
    };
  });
  const overall = scores.reduce((s, x) => s + x.score, 0) / scores.length;
  return {
    run_id: createHash('sha256').update(exemplar.exemplar_id).digest('hex').slice(0, 32),
    baseline_id: exemplar.exemplar_id + ':baseline',
    candidate_id: exemplar.exemplar_id + ':candidate',
    scores,
    overall,
    judge_prompt_version: 'v1',
    judge_model: 'claude-opus-4-7',
    ran_at: new Date().toISOString(),
  };
}

function dryRunJudgeRaw(baselineId: string, candidateId: string): JudgeResult {
  const scores = JUDGE_DIMENSIONS.map((dim) => ({
    dimension: dim,
    score: 3 as JudgeScoreValue,
    rationale: '[dry-run] neutral fixture',
  }));
  return {
    run_id: createHash('sha256').update(baselineId).update(candidateId).digest('hex').slice(0, 32),
    baseline_id: baselineId,
    candidate_id: candidateId,
    scores,
    overall: 3,
    judge_prompt_version: 'v1',
    judge_model: 'claude-opus-4-7',
    ran_at: new Date().toISOString(),
  };
}

// ── Report assembly ─────────────────────────────────────────────────────────

interface ReportEntry {
  exemplar_id: string;
  ticker: string;
  judge: JudgeResult;
  human: Record<JudgeDimension, JudgeScoreValue>;
}

interface FullReport {
  generated_at: string;
  dry_run: boolean;
  exemplar_count: number;
  fixture: { baseline_path: string; candidate_path: string; result: JudgeResult };
  entries: ReportEntry[];
  pearson_by_dimension: Record<JudgeDimension, number>;
  sample_size_warning: string | null;
  wall_clock_ms: number;
  judge_model: string;
  judge_prompt_version: string;
}

const SAMPLE_SIZE_FOR_SHIP_GATE = 30;

function computePearson(entries: ReportEntry[]): Record<JudgeDimension, number> {
  const out = {} as Record<JudgeDimension, number>;
  for (const dim of JUDGE_DIMENSIONS) {
    const xs = entries.map((e) => e.human[dim]);
    const ys = entries.map((e) => {
      const s = e.judge.scores.find((x) => x.dimension === dim);
      return s ? s.score : Number.NaN;
    });
    out[dim] = pearson(xs, ys);
  }
  return out;
}

function fmtPearson(n: number): string {
  if (!Number.isFinite(n)) return 'n/a';
  return n.toFixed(3);
}

function renderMarkdown(report: FullReport): string {
  const lines: string[] = [];
  lines.push('# LLM-as-Judge Eval Report (20-Z-05)');
  lines.push('');
  lines.push(`- **Generated:** ${report.generated_at}`);
  lines.push(`- **Mode:** ${report.dry_run ? 'DRY-RUN (synthetic scoring, no live tokens)' : 'LIVE (Claude Opus 4.7)'}`);
  lines.push(`- **Judge model:** \`${report.judge_model}\``);
  lines.push(`- **Judge prompt version:** \`${report.judge_prompt_version}\``);
  lines.push(`- **Exemplars:** ${report.exemplar_count}`);
  lines.push(`- **Wall clock:** ${report.wall_clock_ms} ms`);
  if (report.sample_size_warning) {
    lines.push('');
    lines.push(`> ⚠️  **Sample size warning:** ${report.sample_size_warning}`);
  }
  lines.push('');
  lines.push('## Per-dimension Pearson correlation (judge vs human)');
  lines.push('');
  lines.push('| Dimension | Pearson r |');
  lines.push('|-----------|-----------|');
  for (const dim of JUDGE_DIMENSIONS) {
    lines.push(`| ${dim} | ${fmtPearson(report.pearson_by_dimension[dim])} |`);
  }
  lines.push('');
  lines.push('## Per-exemplar scores');
  lines.push('');
  lines.push('| Exemplar | Ticker | judge overall | human mean |');
  lines.push('|----------|--------|---------------|------------|');
  for (const e of report.entries) {
    const judgeOverall = e.judge.overall.toFixed(2);
    const humanMean =
      (JUDGE_DIMENSIONS.reduce((s, d) => s + e.human[d], 0) / JUDGE_DIMENSIONS.length).toFixed(2);
    lines.push(`| ${e.exemplar_id} | ${e.ticker} | ${judgeOverall} | ${humanMean} |`);
  }
  lines.push('');
  lines.push('## Fixture pair (sanity-check)');
  lines.push('');
  lines.push(`- baseline path: \`${report.fixture.baseline_path}\``);
  lines.push(`- candidate path: \`${report.fixture.candidate_path}\``);
  lines.push(`- judge overall: ${report.fixture.result.overall.toFixed(2)}`);
  lines.push('');
  lines.push('## Notes');
  lines.push('');
  lines.push('- Pearson ≥ 0.7 ship gate requires n ≥ 30 exemplars (per CONTEXT §S8 / 20-D-04). ');
  lines.push('- Live judge calls require `ANTHROPIC_API_KEY`; dry-run mode is the default in CI. ');
  lines.push('- The rubric body lives at `src/lib/prompts/_v1/eval-judge-v1.md` and is golden-snapshotted by Plan 20-Z-04. ');
  lines.push('');
  return lines.join('\n');
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const t0 = Date.now();

  const exemplars = loadExemplars(args.humanLabels);
  if (exemplars.length === 0) {
    throw new Error(`No exemplars found under ${args.humanLabels}`);
  }

  const baselineText = readFileSync(args.baseline, 'utf8');
  const candidateText = readFileSync(args.candidate, 'utf8');

  process.stderr.write(
    `[eval-report] mode=${args.dryRun ? 'dry-run' : 'live'} ` +
    `exemplars=${exemplars.length} ` +
    `out=${args.out}\n`,
  );

  // Score each exemplar.
  const entries: ReportEntry[] = [];
  for (const ex of exemplars) {
    const result = args.dryRun
      ? dryRunJudge(ex)
      : await judge(ex.baseline_text, ex.candidate_text, {
          baselineId: ex.exemplar_id + ':baseline',
          candidateId: ex.exemplar_id + ':candidate',
        });
    entries.push({
      exemplar_id: ex.exemplar_id,
      ticker: ex.ticker,
      judge: result,
      human: ex.human_scores,
    });
  }

  // Score the standalone fixture pair (plumbing sanity check).
  const fixtureResult = args.dryRun
    ? dryRunJudgeRaw(args.baseline, args.candidate)
    : await judge(baselineText, candidateText, {
        baselineId: args.baseline,
        candidateId: args.candidate,
      });

  const pearsonByDim = computePearson(entries);
  const sampleWarning =
    entries.length < SAMPLE_SIZE_FOR_SHIP_GATE
      ? `Pearson sample size n=${entries.length}, insufficient for ship gate (need ≥${SAMPLE_SIZE_FOR_SHIP_GATE}) — see 20-D-04.`
      : null;

  const wallClock = Date.now() - t0;
  const report: FullReport = {
    generated_at: new Date().toISOString(),
    dry_run: args.dryRun,
    exemplar_count: entries.length,
    fixture: {
      baseline_path: args.baseline,
      candidate_path: args.candidate,
      result: fixtureResult,
    },
    entries,
    pearson_by_dimension: pearsonByDim,
    sample_size_warning: sampleWarning,
    wall_clock_ms: wallClock,
    judge_model: 'claude-opus-4-7',
    judge_prompt_version: 'v1',
  };

  // Ensure --out parent dir exists.
  const outDir = dirname(args.out);
  if (outDir && !existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  writeFileSync(args.out, JSON.stringify(report, null, 2), 'utf8');

  const mdPath = args.md ?? args.out.replace(/\.json$/i, '.md');
  if (mdPath !== args.out) {
    writeFileSync(mdPath, renderMarkdown(report), 'utf8');
  }

  // Surface the headline to stderr so wall-clock + warning are visible in CI logs.
  process.stderr.write(`[eval-report] wall_clock=${wallClock}ms\n`);
  if (sampleWarning) process.stderr.write(`[eval-report] ${sampleWarning}\n`);
  process.stderr.write(`[eval-report] wrote ${args.out}\n`);
  process.stderr.write(`[eval-report] wrote ${mdPath}\n`);

  for (const dim of JUDGE_DIMENSIONS) {
    process.stderr.write(`[eval-report] pearson ${dim}=${fmtPearson(pearsonByDim[dim])}\n`);
  }
}

main().catch((err) => {
  process.stderr.write(`[eval-report] FAILED: ${(err as Error).message}\n`);
  process.exit(1);
});
