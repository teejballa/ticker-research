#!/usr/bin/env tsx
/**
 * Phase 21 — Sector-Relative Outcome Labels — Composite Done Gate.
 *
 * Single-command operator verification that every Phase-21 success
 * criterion is satisfied. Mirrors the Phase-19 model-card-status and
 * Phase-20 phase-20-status patterns.
 *
 * Usage:
 *   npm run phase-21-status
 *
 * Env vars:
 *   PLAYWRIGHT_SKIP=1  — skip the Playwright e2e gate (default: run it)
 *
 * Exit codes:
 *   0 — all gates PASS or SKIP
 *   1 — at least one gate FAIL
 *   2 — script crashed
 */
import { prisma } from '@/lib/db';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

interface GateResult {
  id: string;
  name: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  details: string;
}

const ROOT = path.resolve(__dirname, '..');
const SUMMARY_21_3_06 = path.join(ROOT, '.planning/phases/21-sector-relative-outcome-labels/21-3-06-SUMMARY.md');

function gate(id: string, name: string, status: 'PASS' | 'FAIL' | 'SKIP', details: string): GateResult {
  return { id, name, status, details };
}

function runCmdSilent(cmd: string): { ok: boolean; output: string } {
  try {
    const output = execSync(cmd, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
    return { ok: true, output };
  } catch (err: unknown) {
    const e = err as { stdout?: Buffer; stderr?: Buffer; status?: number };
    return { ok: false, output: `${e.stdout?.toString() ?? ''}\n${e.stderr?.toString() ?? ''}` };
  }
}

async function gate1_Schema(): Promise<GateResult> {
  try {
    const row = await prisma.priceOutcome.findFirst({
      select: { sector_etf: true, forward_return_raw: true, forward_return_sector_rel: true },
    });
    return gate('1', 'Schema additive columns', 'PASS', `select compiled; sample row sector_etf=${row?.sector_etf ?? 'null'}`);
  } catch (err) {
    return gate('1', 'Schema additive columns', 'FAIL', `prisma select failed: ${(err as Error).message}`);
  }
}

async function gate2_BackfillCoverage(): Promise<GateResult> {
  const total = await prisma.priceOutcome.count();
  const unlabeled = await prisma.priceOutcome.count({ where: { sector_etf: null } });
  const pct = total === 0 ? 0 : (unlabeled / total) * 100;
  const status = pct <= 1 ? 'PASS' : 'FAIL';
  return gate('2', 'Backfill coverage', status, `${unlabeled}/${total} rows unlabeled (${pct.toFixed(2)}%); threshold ≤ 1%`);
}

async function gate3_ForwardPathFreshness(): Promise<GateResult> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);
  const recent = await prisma.priceOutcome.findFirst({
    where: { recorded_at: { gte: sevenDaysAgo } },
    orderBy: { recorded_at: 'desc' },
  });
  if (!recent) {
    return gate('3', 'Forward path freshness', 'SKIP', 'no PriceOutcome rows created in last 7 days');
  }
  const allPopulated =
    recent.sector_etf != null &&
    recent.forward_return_raw != null &&
    recent.forward_return_sector_rel != null;
  return gate('3', 'Forward path freshness', allPopulated ? 'PASS' : 'FAIL', `most-recent row: sector_etf=${recent.sector_etf ?? 'null'} raw=${recent.forward_return_raw ?? 'null'} sector_rel=${recent.forward_return_sector_rel ?? 'null'}`);
}

function gate4_ClassifyHitSignature(): GateResult {
  const file = path.join(ROOT, 'src/lib/learning.ts');
  const content = fs.readFileSync(file, 'utf8');
  const hasSectorParam = /sector_relative_pct\s*\??:/.test(content);
  return gate('4', 'classifyHit signature widened', hasSectorParam ? 'PASS' : 'FAIL', hasSectorParam ? 'sector_relative_pct param present' : 'sector_relative_pct param missing from classifyHit');
}

async function gate5_RelearnFreshness(): Promise<GateResult> {
  // NOTE: LearnedPattern's observation-count column is `sample_size` (not `n`).
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86_400_000);
  const total = await prisma.learnedPattern.count({ where: { sample_size: { gte: 1 } } });
  const fresh = await prisma.learnedPattern.count({ where: { sample_size: { gte: 1 }, last_updated: { gte: fourteenDaysAgo } } });
  if (total === 0) return gate('5', 'Relearn freshness', 'SKIP', 'no LearnedPattern rows with sample_size ≥ 1');
  const pct = (fresh / total) * 100;
  const status = pct >= 95 ? 'PASS' : 'FAIL';
  return gate('5', 'Relearn freshness', status, `${fresh}/${total} cells last_updated within 14d (${pct.toFixed(1)}%); threshold ≥ 95%`);
}

function gate6_UICopy(): GateResult {
  const panelFile = path.join(ROOT, 'src/components/EngineCalibrationPanel.tsx');
  const dashFile = path.join(ROOT, 'src/components/InsightsDashboard.tsx');
  const panelContent = fs.readFileSync(panelFile, 'utf8');
  const dashContent = fs.readFileSync(dashFile, 'utf8');
  const checks = [
    { ok: panelContent.includes('primarySectorEtf'), label: 'EngineCalibrationPanel.primarySectorEtf prop' },
    { ok: panelContent.includes('vs market'), label: 'EngineCalibrationPanel "vs market" tile' },
    { ok: !panelContent.includes('S&P 500'), label: 'EngineCalibrationPanel free of "S&P 500"' },
    { ok: dashContent.includes('vs its sector'), label: 'InsightsDashboard "vs its sector" copy' },
    { ok: !dashContent.includes('vs SPY'), label: 'InsightsDashboard free of "vs SPY"' },
  ];
  const failing = checks.filter((c) => !c.ok).map((c) => c.label);
  return gate('6', 'UI copy + props', failing.length === 0 ? 'PASS' : 'FAIL', failing.length === 0 ? `${checks.length}/${checks.length} UI invariants ok` : `failing: ${failing.join('; ')}`);
}

function gate7_TestGates(): GateResult {
  const results: { name: string; ok: boolean }[] = [
    { name: 'tsc', ok: runCmdSilent('npx tsc --noEmit').ok },
    { name: 'vitest', ok: runCmdSilent('npm test --silent').ok },
    { name: 'check-prompts', ok: runCmdSilent('npm run check-prompts --silent').ok },
  ];
  if (process.env.PLAYWRIGHT_SKIP !== '1') {
    results.push({ name: 'playwright', ok: runCmdSilent('npx playwright test tests/e2e/sector-relative-labels.spec.ts --reporter=line').ok });
  }
  const failed = results.filter((r) => !r.ok).map((r) => r.name);
  return gate('7', 'Test gates', failed.length === 0 ? 'PASS' : 'FAIL', failed.length === 0 ? `${results.length}/${results.length} green` : `failing: ${failed.join(', ')}`);
}

async function gate8_RelearnSanity(): Promise<GateResult> {
  // BLOCKER-1 fix (plan-checker iter 1): a missing summary is a hard failure.
  // The previous lenient behavior allowed false-green ships when the operator
  // omitted 21-3-06-SUMMARY.md. Compression + non-inversion is ROADMAP criterion
  // #11 and MUST be proven before phase-21-status passes.
  if (!fs.existsSync(SUMMARY_21_3_06)) {
    return gate(
      '8',
      'Compression + non-inversion sanity',
      'FAIL',
      `21-3-06-SUMMARY.md missing at ${SUMMARY_21_3_06} — operator MUST commit a summary containing the direction-preserved line AND the "spread: <before> → <after>" line before this phase ships (BLOCKER-1, ROADMAP criterion #11). Re-run 21-3-06 Task 3 checkpoint, capture the BEFORE/AFTER numbers, write the summary, then re-run npm run phase-21-status.`,
    );
  }
  const summary = fs.readFileSync(SUMMARY_21_3_06, 'utf8');
  const directionApproved = /direction.*(preserved|not.*invert|non.invert)/i.test(summary);
  // Strict pattern: `spread: <num> → <num>` with the Unicode arrow. The old
  // lenient prose-matching path is REMOVED so the gate cannot pass on hand-wavy
  // text — only an actual numeric before/after line qualifies.
  const spreadCompressed = /spread:\s*[0-9.]+\s*→\s*[0-9.]+/.test(summary);
  if (directionApproved && spreadCompressed) {
    return gate(
      '8',
      'Compression + non-inversion sanity',
      'PASS',
      '21-3-06-SUMMARY.md confirms direction preserved + spread narrowed toward 0.5 (machine-readable lines matched).',
    );
  }
  return gate(
    '8',
    'Compression + non-inversion sanity',
    'FAIL',
    `21-3-06-SUMMARY.md missing required machine-readable lines (direction:${directionApproved} spread:${spreadCompressed}). Required: a line matching /direction.*(preserved|not.*invert|non.invert)/i AND a line matching /spread:\\s*[0-9.]+\\s*→\\s*[0-9.]+/.`,
  );
}

function gate9_NonGoalsAbsent(): GateResult {
  const grepTargets = [
    'rankIC|rank_ic',
    'tripleBarrier|triple_barrier|triple-barrier',
    'sectorPooling',
    'loMamaysky|lo-mamaysky',
  ];
  const hits: string[] = [];
  for (const target of grepTargets) {
    const r = runCmdSilent(`grep -rln -E "${target}" src/ scripts/ 2>/dev/null || true`);
    const lines = r.output.split('\n').filter((l) => l.trim() && !l.includes('phase-21-status.ts') && !l.includes('CONTEXT.md'));
    if (lines.length > 0) {
      hits.push(`${target}: ${lines.join(', ')}`);
    }
  }
  return gate('9', 'Non-goals absent from codebase', hits.length === 0 ? 'PASS' : 'FAIL', hits.length === 0 ? '0/4 non-goals found' : `non-goal hits: ${hits.join('; ')}`);
}

async function main(): Promise<void> {
  const results: GateResult[] = [];
  results.push(await gate1_Schema());
  results.push(await gate2_BackfillCoverage());
  results.push(await gate3_ForwardPathFreshness());
  results.push(gate4_ClassifyHitSignature());
  results.push(await gate5_RelearnFreshness());
  results.push(gate6_UICopy());
  results.push(gate7_TestGates());
  results.push(await gate8_RelearnSanity());
  results.push(gate9_NonGoalsAbsent());

  console.log('\n=== Phase 21 — Sector-Relative Outcome Labels — Composite Done Gate ===\n');
  for (const r of results) {
    const tag = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⏭ ';
    console.log(`${tag} [${r.status}] Gate ${r.id}: ${r.name} — ${r.details}`);
  }
  const anyFail = results.some((r) => r.status === 'FAIL');
  console.log('\n' + (anyFail ? '❌ PHASE 21 — NOT READY' : '✅ PHASE 21 — READY TO SHIP'));
  await prisma.$disconnect();
  process.exit(anyFail ? 1 : 0);
}

main().catch(async (err) => {
  console.error('phase-21-status crashed:', err);
  try { await prisma.$disconnect(); } catch { /* noop */ }
  process.exit(2);
});
