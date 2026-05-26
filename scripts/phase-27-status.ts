#!/usr/bin/env tsx
// scripts/phase-27-status.ts
//
// Phase 27 / Plan 27-04 — composite "is Phase 27 done?" gate.
//
// Single command (`npm run phase-27-status`) runs 11 distinct condition
// checks against the local source tree + universe imports + CLI dry-run
// and exits zero ONLY when every condition holds. Otherwise it prints a
// punch list of unmet conditions and exits 1.
//
// The 11 checks (COVERAGE-06..10):
//
//   1. schema-source-column     — SentimentSnapshot.source String @default("live")
//   2. schema-unique-constraint — @@unique([ticker, scanned_at]) present
//   3. universe-size            — BACKFILL_UNIVERSE.length >= 100
//   4. universe-cap-balance     — large/mid/small each >= 30
//   5. single-feature-path      — backfill-historical uses computeTechnicalSnapshot
//                                 AND does NOT import from 'technicalindicators' directly
//   6. source-tagged-writes     — backfill-historical contains source: 'backfill'
//   7. pit-no-adjclose          — backfill-historical does NOT contain 'adjclose'
//                                 AND does contain computeOutcomeRecordedAt
//   8. live-gate-enforced       — learning.ts has enforceLiveOnlyGate + LIVE_OUTCOME_THRESHOLD = 10
//                                 AND learn/route.ts has enforceLiveOnlyGate + source: outcome.source ?? 'live'
//   9. cli-dry-run              — `npx tsx scripts/backfill-historical.ts --dry-run --max-tickers 3` exits 0
//  10. vitest-green             — `npm test` exits 0
//  11. tsc-clean                — `npx tsc --noEmit` exits 0
//
// The script is testable — `runChecks(deps)` is exported and accepts injected
// fs + exec + import surfaces; tests mock these directly without spawning the
// script entrypoint and without touching `process.exit`. The bottom of this
// file wires real deps and calls `process.exit(0|1)`.

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type Check = {
  name: string;
  ok: boolean;
  detail: string;
};

/**
 * Minimal injected-dependency surface. Tests mock this directly.
 * `exec` is synchronous (mirrors model-card-status.ts) so checks stay
 * straightforward. Async universe import is handled inline.
 */
export type RunChecksDeps = {
  fs: {
    readFileSync: (path: string) => string;
  };
  exec: (cmd: string, opts?: { timeout?: number }) => string;
  /** Resolved path to prisma/schema.prisma */
  schemaPath: string;
  /** Resolved path to scripts/backfill-historical.ts */
  backfillCliPath: string;
  /** Resolved path to src/lib/learning.ts */
  learningPath: string;
  /** Resolved path to src/app/api/cron/learn/route.ts */
  learnRoutePath: string;
  /** Injected universe data (allows unit testing without importing live module) */
  universe?: {
    BACKFILL_UNIVERSE: ReadonlyArray<{ ticker: string; curation_cap: string }>;
    tickersByCuration: (cap: string) => string[];
  };
};

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const UNIVERSE_MIN_SIZE = 100;
const CAP_BUCKET_MIN = 30;
// Generous timeout for the heavy exec checks (ms). The CLI dry-run and npm test
// can each take up to 3 minutes in CI; tsc can take 60s on a cold typecheck.
const CLI_DRY_RUN_TIMEOUT_MS = 180_000;
const VITEST_TIMEOUT_MS = 180_000;
const TSC_TIMEOUT_MS = 120_000;

// -----------------------------------------------------------------------------
// runChecks() — pure async function, takes deps, returns Check[]
// -----------------------------------------------------------------------------

/**
 * Execute all 11 condition checks. Returns the full list (passing + failing).
 * Caller (script entrypoint) decides exit code based on `checks.filter(c=>!c.ok).length`.
 */
export async function runChecks(deps: RunChecksDeps): Promise<Check[]> {
  const checks: Check[] = [];

  // -- 1. schema-source-column ------------------------------------------------
  // prisma/schema.prisma must contain: source String @default("live")
  try {
    const schema = deps.fs.readFileSync(deps.schemaPath);
    const ok = /source\s+String\s+@default\("live"\)/.test(schema);
    checks.push({
      name: 'schema-source-column',
      ok,
      detail: ok
        ? 'SentimentSnapshot.source String @default("live") present in schema'
        : 'MISSING: SentimentSnapshot.source String @default("live") not found in prisma/schema.prisma',
    });
  } catch (err) {
    checks.push({
      name: 'schema-source-column',
      ok: false,
      detail: `failed to read ${deps.schemaPath}: ${stringifyError(err)}`,
    });
  }

  // -- 2. schema-unique-constraint --------------------------------------------
  // prisma/schema.prisma must contain: @@unique([ticker, scanned_at])
  try {
    const schema = deps.fs.readFileSync(deps.schemaPath);
    const ok = /@@unique\(\[ticker,\s*scanned_at\]\)/.test(schema);
    checks.push({
      name: 'schema-unique-constraint',
      ok,
      detail: ok
        ? '@@unique([ticker, scanned_at]) present in schema'
        : 'MISSING: @@unique([ticker, scanned_at]) not found in prisma/schema.prisma',
    });
  } catch (err) {
    checks.push({
      name: 'schema-unique-constraint',
      ok: false,
      detail: `failed to read ${deps.schemaPath}: ${stringifyError(err)}`,
    });
  }

  // -- 3. universe-size -------------------------------------------------------
  // BACKFILL_UNIVERSE.length >= 100
  if (deps.universe) {
    const { BACKFILL_UNIVERSE } = deps.universe;
    const count = BACKFILL_UNIVERSE.length;
    const ok = count >= UNIVERSE_MIN_SIZE;
    checks.push({
      name: 'universe-size',
      ok,
      detail: `BACKFILL_UNIVERSE has ${count} tickers (need ≥${UNIVERSE_MIN_SIZE})`,
    });
  } else {
    try {
      // Dynamic import at runtime (not at module load, so unit tests can skip this
      // by providing deps.universe).
      const universeModule = await import('../src/lib/backtest/universe');
      const { BACKFILL_UNIVERSE, UNIVERSE_VERSION } = universeModule;
      const count = (BACKFILL_UNIVERSE as ReadonlyArray<unknown>).length;
      const ok = count >= UNIVERSE_MIN_SIZE;
      checks.push({
        name: 'universe-size',
        ok,
        detail: `BACKFILL_UNIVERSE has ${count} tickers @ ${UNIVERSE_VERSION} (need ≥${UNIVERSE_MIN_SIZE})`,
      });
    } catch (err) {
      checks.push({
        name: 'universe-size',
        ok: false,
        detail: `failed to import universe: ${stringifyError(err)}`,
      });
    }
  }

  // -- 4. universe-cap-balance ------------------------------------------------
  // tickersByCuration for each of large_cap, mid_cap, small_cap must have >= 30
  if (deps.universe) {
    const { tickersByCuration } = deps.universe;
    const largeCnt = tickersByCuration('large_cap').length;
    const midCnt = tickersByCuration('mid_cap').length;
    const smallCnt = tickersByCuration('small_cap').length;
    const ok = largeCnt >= CAP_BUCKET_MIN && midCnt >= CAP_BUCKET_MIN && smallCnt >= CAP_BUCKET_MIN;
    checks.push({
      name: 'universe-cap-balance',
      ok,
      detail: `large_cap=${largeCnt}, mid_cap=${midCnt}, small_cap=${smallCnt} (need each ≥${CAP_BUCKET_MIN})`,
    });
  } else {
    try {
      const universeModule = await import('../src/lib/backtest/universe');
      const { tickersByCuration } = universeModule;
      const largeCnt = tickersByCuration('large_cap').length;
      const midCnt = tickersByCuration('mid_cap').length;
      const smallCnt = tickersByCuration('small_cap').length;
      const ok = largeCnt >= CAP_BUCKET_MIN && midCnt >= CAP_BUCKET_MIN && smallCnt >= CAP_BUCKET_MIN;
      checks.push({
        name: 'universe-cap-balance',
        ok,
        detail: `large_cap=${largeCnt}, mid_cap=${midCnt}, small_cap=${smallCnt} (need each ≥${CAP_BUCKET_MIN})`,
      });
    } catch (err) {
      checks.push({
        name: 'universe-cap-balance',
        ok: false,
        detail: `failed to import universe: ${stringifyError(err)}`,
      });
    }
  }

  // -- 5. single-feature-path -------------------------------------------------
  // backfill-historical.ts must contain 'computeTechnicalSnapshot'
  // AND must NOT contain from 'technicalindicators' (COVERAGE-08)
  try {
    const cli = deps.fs.readFileSync(deps.backfillCliPath);
    const hasComputeTech = cli.includes('computeTechnicalSnapshot');
    const hasBadImport = /from ['"]technicalindicators['"]/.test(cli);
    const ok = hasComputeTech && !hasBadImport;
    checks.push({
      name: 'single-feature-path',
      ok,
      detail: ok
        ? 'backfill-historical uses computeTechnicalSnapshot and does not import technicalindicators directly'
        : [
            !hasComputeTech ? 'MISSING: computeTechnicalSnapshot not found in backfill-historical.ts' : '',
            hasBadImport ? "VIOLATION: direct import from 'technicalindicators' found (train/serve skew risk)" : '',
          ]
            .filter(Boolean)
            .join('; '),
    });
  } catch (err) {
    checks.push({
      name: 'single-feature-path',
      ok: false,
      detail: `failed to read ${deps.backfillCliPath}: ${stringifyError(err)}`,
    });
  }

  // -- 6. source-tagged-writes ------------------------------------------------
  // backfill-historical.ts must contain source: 'backfill' (COVERAGE-09)
  try {
    const cli = deps.fs.readFileSync(deps.backfillCliPath);
    const ok = cli.includes("source: 'backfill'");
    checks.push({
      name: 'source-tagged-writes',
      ok,
      detail: ok
        ? "backfill-historical.ts contains source: 'backfill' tag on writes"
        : "MISSING: source: 'backfill' not found in backfill-historical.ts (COVERAGE-09)",
    });
  } catch (err) {
    checks.push({
      name: 'source-tagged-writes',
      ok: false,
      detail: `failed to read ${deps.backfillCliPath}: ${stringifyError(err)}`,
    });
  }

  // -- 7. pit-no-adjclose -----------------------------------------------------
  // backfill-historical.ts must NOT contain 'adjclose'
  // AND must contain 'computeOutcomeRecordedAt' (COVERAGE-07 / D-02 PIT discipline)
  try {
    const cli = deps.fs.readFileSync(deps.backfillCliPath);
    const hasAdjclose = cli.includes('adjclose');
    const hasComputeRecordedAt = cli.includes('computeOutcomeRecordedAt');
    const ok = !hasAdjclose && hasComputeRecordedAt;
    checks.push({
      name: 'pit-no-adjclose',
      ok,
      detail: ok
        ? 'PIT discipline: no adjclose usage; computeOutcomeRecordedAt present'
        : [
            hasAdjclose ? "VIOLATION: 'adjclose' found in backfill-historical.ts (forward-looking dividend bias)" : '',
            !hasComputeRecordedAt ? 'MISSING: computeOutcomeRecordedAt not found (PIT timestamp discipline)' : '',
          ]
            .filter(Boolean)
            .join('; '),
    });
  } catch (err) {
    checks.push({
      name: 'pit-no-adjclose',
      ok: false,
      detail: `failed to read ${deps.backfillCliPath}: ${stringifyError(err)}`,
    });
  }

  // -- 8. live-gate-enforced --------------------------------------------------
  // learning.ts must contain 'enforceLiveOnlyGate' AND 'LIVE_OUTCOME_THRESHOLD = 10'
  // learn/route.ts must contain 'enforceLiveOnlyGate' AND "source: outcome.source ?? 'live'"
  // (COVERAGE-10)
  try {
    const learning = deps.fs.readFileSync(deps.learningPath);
    const learnRoute = deps.fs.readFileSync(deps.learnRoutePath);

    const learningHasGate = learning.includes('enforceLiveOnlyGate');
    const learningHasThreshold = /LIVE_OUTCOME_THRESHOLD\s*=\s*10/.test(learning);
    const routeHasGate = learnRoute.includes('enforceLiveOnlyGate');
    const routeHasSourceDelta = learnRoute.includes("source: outcome.source ?? 'live'");

    const ok = learningHasGate && learningHasThreshold && routeHasGate && routeHasSourceDelta;
    checks.push({
      name: 'live-gate-enforced',
      ok,
      detail: ok
        ? 'enforceLiveOnlyGate + LIVE_OUTCOME_THRESHOLD=10 in learning.ts; gate applied + source delta in learn/route.ts'
        : [
            !learningHasGate ? 'MISSING: enforceLiveOnlyGate in src/lib/learning.ts' : '',
            !learningHasThreshold ? 'MISSING: LIVE_OUTCOME_THRESHOLD = 10 in src/lib/learning.ts' : '',
            !routeHasGate ? 'MISSING: enforceLiveOnlyGate call in src/app/api/cron/learn/route.ts' : '',
            !routeHasSourceDelta
              ? "MISSING: source: outcome.source ?? 'live' in src/app/api/cron/learn/route.ts"
              : '',
          ]
            .filter(Boolean)
            .join('; '),
    });
  } catch (err) {
    checks.push({
      name: 'live-gate-enforced',
      ok: false,
      detail: `failed to read learning.ts or learn/route.ts: ${stringifyError(err)}`,
    });
  }

  // -- 9. cli-dry-run ---------------------------------------------------------
  // npx tsx scripts/backfill-historical.ts --dry-run --max-tickers 3 must exit 0
  // With no DATABASE_URL, the CLI exits 0 via the Plan 02 clean-exit guard
  // (CI-safe). Mocked in unit tests via deps.exec.
  try {
    const out = deps.exec('npx tsx scripts/backfill-historical.ts --dry-run --max-tickers 3', {
      timeout: CLI_DRY_RUN_TIMEOUT_MS,
    });
    checks.push({
      name: 'cli-dry-run',
      ok: true,
      detail: `CLI dry-run exited 0${out.trim() ? ` (output: ${out.trim().slice(0, 120)})` : ''}`,
    });
  } catch (err) {
    checks.push({
      name: 'cli-dry-run',
      ok: false,
      detail: `CLI dry-run failed: ${stringifyError(err)}`,
    });
  }

  // -- 10. vitest-green -------------------------------------------------------
  // npm test must exit 0.
  try {
    deps.exec('npm test', { timeout: VITEST_TIMEOUT_MS });
    checks.push({
      name: 'vitest-green',
      ok: true,
      detail: 'npm test exited 0 (all unit tests passing)',
    });
  } catch (err) {
    checks.push({
      name: 'vitest-green',
      ok: false,
      detail: `npm test failed: ${stringifyError(err)}`,
    });
  }

  // -- 11. tsc-clean ----------------------------------------------------------
  // npx tsc --noEmit must exit 0.
  try {
    deps.exec('npx tsc --noEmit', { timeout: TSC_TIMEOUT_MS });
    checks.push({
      name: 'tsc-clean',
      ok: true,
      detail: 'npx tsc --noEmit exited 0 (no type errors)',
    });
  } catch (err) {
    checks.push({
      name: 'tsc-clean',
      ok: false,
      detail: `tsc reported type errors: ${stringifyError(err)}`,
    });
  }

  return checks;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function stringifyError(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return String(err);
  } catch {
    return '<unknown error>';
  }
}

// -----------------------------------------------------------------------------
// Script entrypoint — wire real deps, run, exit with status code
// -----------------------------------------------------------------------------

async function main(): Promise<void> {
  // Lazy-import real deps so vitest doesn't pull in child_process / universe
  // during unit testing (tests use the exported runChecks() with mocked deps).
  const { execSync } = await import('node:child_process');
  const fs = await import('node:fs');
  const path = await import('node:path');

  // Load .env.local (non-fatal if absent — DATABASE_URL may already be set in env).
  try {
    const dotenv = await import('dotenv');
    dotenv.config({ path: '.env.local' });
  } catch {
    // dotenv missing is non-fatal.
  }

  const repoRoot = process.cwd();

  const deps: RunChecksDeps = {
    fs: {
      readFileSync: (p: string) => fs.readFileSync(p, 'utf8'),
    },
    exec: (cmd: string, opts?: { timeout?: number }) => {
      try {
        return execSync(cmd, {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: opts?.timeout,
          cwd: repoRoot,
        });
      } catch (err) {
        const e = err as { stdout?: Buffer | string; message?: string };
        // Surface stdout on failure (e.g. tsc prints errors to stdout via pipe).
        const out = e.stdout ? String(e.stdout).trim() : '';
        const msg = e.message ?? 'non-zero exit';
        throw new Error(out ? `${msg}\n${out.slice(0, 1000)}` : msg);
      }
    },
    schemaPath: path.join(repoRoot, 'prisma/schema.prisma'),
    backfillCliPath: path.join(repoRoot, 'scripts/backfill-historical.ts'),
    learningPath: path.join(repoRoot, 'src/lib/learning.ts'),
    learnRoutePath: path.join(repoRoot, 'src/app/api/cron/learn/route.ts'),
    // universe is not injected — runChecks() will dynamic-import it
  };

  let checks: Check[];
  try {
    checks = await runChecks(deps);
  } catch (err) {
    console.error('✗ Phase 27 done gate: ABORTED — runChecks threw:');
    console.error(stringifyError(err));
    process.exit(1);
  }

  const failed = checks.filter((c) => !c.ok);
  const passed = checks.length - failed.length;

  if (failed.length === 0) {
    console.log(`✓ Phase 27 done gate: ALL CHECKS PASSED (${passed}/${checks.length})`);
    process.exit(0);
  }

  console.error('✗ Phase 27 done gate: FAILED');
  console.error(`  ${passed}/${checks.length} checks passed; ${failed.length} unmet:`);
  for (const c of failed) {
    console.error(`  - ${c.name}: ${c.detail}`);
  }
  process.exit(1);
}

// Run main() only when invoked as a script, not when imported by tests.
const isEntry = (() => {
  try {
    if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
      return true;
    }
  } catch {
    // ignore
  }
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
    console.error('✗ Phase 27 done gate: UNCAUGHT ERROR');
    console.error(stringifyError(err));
    process.exit(1);
  });
}
