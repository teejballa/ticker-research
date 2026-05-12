#!/usr/bin/env tsx
// scripts/phase-20-status.ts
//
// Phase 20 / Plan 20-Z-06 — composite "is Phase 20 done?" gate.
//
// Single command (`npm run phase-20-status`) runs 15 read-only artifact
// inspections aggregating Phase 20 Definition-of-Done conditions #2 through
// #16 (CONTEXT.md lines 145-163). DoD #1 is the script's OWN rollup line, not
// a sub-check (T-20-Z-06-04).
//
// Three-valued logic:
//   pass    — artifact present and criterion met
//   fail    — artifact present but criterion violated
//   pending — artifact not yet landed (today's main, for every check)
//
// Rollup exit codes:
//   0  → every CheckResult.status === 'pass'                  (Phase 20 done)
//   1  → at least one CheckResult.status === 'fail'           (regression)
//   2  → ≥1 'pending' AND 0 'fail'                            (pre-launch — today's main)
//
// The script is testable — `runAllChecks(deps)` is exported and accepts
// injected Prisma + fs + exec dependencies; tests mock these directly without
// spawning the script entrypoint and without touching `process.exit`. The
// bottom of this file (after `if (isEntry) ...`) wires real deps and calls
// `process.exit(0 | 1 | 2)`.
//
// CI wiring: run `npm run phase-20-status` as continue-on-error informational
// job (non-blocking) — gating happens organically because exit 0 is impossible
// until every Phase-20 artifact lands. See .github/workflows/phase-20.yml.

import { ALL_CHECKS } from './lib/phase-20-checks/index';
import type { CheckResult, CheckDeps, CheckBranch } from './lib/phase-20-checks/types';

// -----------------------------------------------------------------------------
// runAllChecks() — pure async, takes deps, returns CheckResult[]
// -----------------------------------------------------------------------------

export async function runAllChecks(deps: CheckDeps): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  for (const check of ALL_CHECKS) {
    // Each check is responsible for its own try/catch — we still defend
    // against pathological throws so a single misbehaving check cannot abort
    // the rollup.
    try {
      results.push(await check(deps));
    } catch (err) {
      // We cannot fabricate the dod_label / blocker_for here because the check
      // never returned. Use a generic placeholder with the index for context.
      const idx = results.length;
      results.push({
        name: `check-index-${idx}`,
        dod_label: `(check at index ${idx} threw — see evidence)`,
        blocker_for: idx + 2,
        branch: 'hygiene',
        status: 'pending',
        evidence: `check threw: ${stringifyError(err)}`,
      });
    }
  }
  return results;
}

// -----------------------------------------------------------------------------
// rollupExitCode() — pure, returns the canonical exit code per the policy above
// -----------------------------------------------------------------------------

export function rollupExitCode(results: CheckResult[]): 0 | 1 | 2 {
  let anyFail = false;
  let anyPending = false;
  for (const r of results) {
    if (r.status === 'fail') anyFail = true;
    else if (r.status === 'pending') anyPending = true;
  }
  if (anyFail) return 1;
  if (anyPending) return 2;
  return 0;
}

// -----------------------------------------------------------------------------
// renderMarkdownSummary() — pure, returns the stdout text
// -----------------------------------------------------------------------------

const BRANCH_ORDER: CheckBranch[] = ['sentiment', 'calibration', 'report', 'hygiene'];
const BRANCH_HEADINGS: Record<CheckBranch, string> = {
  sentiment: '## Sentiment',
  calibration: '## Calibration',
  report: '## Report',
  hygiene: '## Hygiene',
};

function glyph(status: CheckResult['status']): string {
  if (status === 'pass') return '✓';
  if (status === 'fail') return '✗';
  return '○';
}

export function renderMarkdownSummary(results: CheckResult[]): string {
  const lines: string[] = [];
  lines.push('# Phase 20 Status');
  lines.push('');
  for (const branch of BRANCH_ORDER) {
    lines.push(BRANCH_HEADINGS[branch]);
    lines.push('');
    const rows = results.filter((r) => r.branch === branch);
    if (rows.length === 0) {
      lines.push('_(no checks)_');
      lines.push('');
      continue;
    }
    for (const r of rows) {
      lines.push(`- ${glyph(r.status)} **DoD #${r.blocker_for}** (${r.name}): ${r.dod_label}`);
      lines.push(`    - evidence: ${r.evidence}`);
    }
    lines.push('');
  }
  // Totals + rollup.
  const passed = results.filter((r) => r.status === 'pass').length;
  const failed = results.filter((r) => r.status === 'fail').length;
  const pending = results.filter((r) => r.status === 'pending').length;
  const exitCode = rollupExitCode(results);
  lines.push('---');
  lines.push('');
  lines.push(`**Totals:** pass=${passed}  fail=${failed}  pending=${pending}`);
  lines.push('');
  lines.push(
    `**DoD #1** (Phase 20 done gate): \`npm run phase-20-status\` exits 0 only when every sub-check passes`,
  );
  lines.push('');
  lines.push(`Rollup: ${passed}/${results.length}; exit code ${exitCode}`);
  return lines.join('\n');
}

// -----------------------------------------------------------------------------
// helpers
// -----------------------------------------------------------------------------

function stringifyError(err: unknown): string {
  try {
    if (err instanceof Error) return `${err.name}: ${err.message}`;
    return String(err);
  } catch {
    return '<unknown error>';
  }
}

// -----------------------------------------------------------------------------
// Script entrypoint — wire real deps, run, exit with status code
// -----------------------------------------------------------------------------

async function main(): Promise<void> {
  // Lazy-import real deps so vitest doesn't pull in Prisma/Neon during unit
  // testing (tests use the exported runAllChecks() with mocked deps directly).
  const { execSync } = await import('node:child_process');
  const fs = await import('node:fs');
  const path = await import('node:path');

  // Load .env.local just like the rest of the codebase does.
  try {
    const dotenv = await import('dotenv');
    dotenv.config({ path: '.env.local' });
  } catch {
    // dotenv missing is non-fatal; environment may already be set.
  }

  const repoRoot = process.cwd();
  const featuresPath = path.join(repoRoot, 'src/lib/features.ts');
  const modelCardsGlob = path.join(repoRoot, 'docs/cards/MODEL-CARD-*.md');
  const metricsDir = path.join(repoRoot, 'metrics');

  // Prisma client — lazy import + best-effort. Some checks gracefully skip
  // (return 'pending') when their target model is undefined on the client.
  let prismaProxy: CheckDeps['prisma'] = {};
  try {
    const dbMod = (await import('../src/lib/db')) as { prisma: unknown };
    prismaProxy = dbMod.prisma as CheckDeps['prisma'];
  } catch {
    // DATABASE_URL unset or schema not generated yet — checks degrade to pending.
    prismaProxy = {};
  }

  const deps: CheckDeps = {
    prisma: prismaProxy,
    fs: {
      readFileSync: (p: string) => fs.readFileSync(p, 'utf8'),
      existsSync: (p: string) => fs.existsSync(p),
    },
    exec: (cmd: string) => {
      try {
        const stdout = execSync(cmd, {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          maxBuffer: 64 * 1024 * 1024,
        });
        return { exitCode: 0, stdout, stderr: '' };
      } catch (err) {
        const e = err as { status?: number; stdout?: Buffer | string; stderr?: Buffer | string };
        return {
          exitCode: typeof e.status === 'number' ? e.status : -1,
          stdout: String(e.stdout ?? ''),
          stderr: String(e.stderr ?? ''),
        };
      }
    },
    featuresPath,
    modelCardsGlob,
    metricsDir,
    repoRoot,
  };

  let results: CheckResult[];
  try {
    results = await runAllChecks(deps);
  } catch (err) {
    console.error('✗ Phase 20 status: ABORTED — runAllChecks threw:');
    console.error(stringifyError(err));
    process.exit(1);
  }

  const markdown = renderMarkdownSummary(results);
  console.log(markdown);

  const exitCode = rollupExitCode(results);
  process.exit(exitCode);
}

// Run main() only when invoked as a script, not when imported by tests.
const isEntry = (() => {
  try {
    const url = import.meta.url;
    const entry = process.argv[1];
    if (url && entry) {
      const urlPath = url.startsWith('file://') ? url.slice('file://'.length) : url;
      return urlPath === entry || urlPath.endsWith(entry);
    }
  } catch {
    // ignore
  }
  return false;
})();

if (isEntry) {
  main().catch((err) => {
    console.error('✗ Phase 20 status: UNHANDLED ERROR');
    console.error(stringifyError(err));
    process.exit(1);
  });
}
