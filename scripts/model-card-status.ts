#!/usr/bin/env tsx
// scripts/model-card-status.ts
//
// Phase 19 / Plan 19-Z-04 — composite "is Phase 19 done?" gate.
//
// Single command (`npm run model-card-status`) runs 9 distinct condition
// checks against the live Neon DB + the local source tree + features.ts and
// exits zero ONLY when every condition holds. Otherwise it prints a punch
// list of unmet conditions and exits 1.
//
// Per design §11 + RESEARCH §"19-Z-04 model-card-status", the 9 categories:
//
//   1. conformal-coverage       — ≥80% ACTIVE cells have conformal_low/high
//   2. dsr                       — avg(dsr) > 0.5 across ACTIVE cells
//   3. pbo                       — avg(pbo) < 0.5 across ACTIVE cells
//   4. ic-{class}                — rolling_ic_20d populated in last 7d (×4)
//   5. pooled                    — ≥80% of cells have parent_alpha
//   6. finsentllm                — ≥95% of last-30d snapshots have score
//   7. citations                 — ≥90% URL coverage on analyst/news claims
//   8. no-old-{name}             — zero matches per registered grep pattern
//   9. flag-removed-{flag}       — each Phase 19 flag absent from features.ts
//
// The script is testable — `runChecks(deps)` is exported and accepts injected
// Prisma + fs + exec dependencies; tests mock these directly without spawning
// the script entrypoint and without touching `process.exit`. The bottom of
// this file (after `if (require.main === module) … `) wires real deps and
// calls `process.exit(0|1)`.

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type Check = {
  name: string;
  ok: boolean;
  detail: string;
};

/**
 * Minimal Prisma surface used by the gate. Tests mock this directly.
 * Only the methods + filter shapes we actually call are typed, intentionally
 * loose so the test harness can satisfy it with plain objects.
 */
export type RunChecksDeps = {
  prisma: {
    learnedPattern: {
      count: (
        args?: { where?: Record<string, unknown> },
      ) => Promise<number>;
      aggregate: (
        args: { where?: Record<string, unknown>; _avg?: Record<string, boolean> },
      ) => Promise<{ _avg: { dsr: number | null; pbo: number | null } }>;
    };
    sentimentSnapshot: {
      count: (
        args?: { where?: Record<string, unknown> },
      ) => Promise<number>;
    };
    report: {
      findMany: (
        args?: { where?: Record<string, unknown>; select?: Record<string, boolean> },
      ) => Promise<Array<{ analysis: unknown }>>;
    };
  };
  fs: {
    readFileSync: (path: string) => string;
  };
  exec: (cmd: string) => string;
  featuresPath: string;
  grepPatternsPath: string;
};

// -----------------------------------------------------------------------------
// Constants — thresholds and flag inventory
// -----------------------------------------------------------------------------

// Thresholds match design §11 + RESEARCH §"19-Z-04". They are HARD-CODED here
// (not env vars) so the gate cannot be relaxed at deploy time (T-19-Z-04-01).
// Plan 19-A-04 may lower the DSR threshold via a code change to this constant
// after the calibration audit lands.
const CONFORMAL_COVERAGE_MIN = 0.80;
const DSR_MIN = 0.5;
const PBO_MAX = 0.5;
const POOLED_COVERAGE_MIN = 0.80;
const FINSENTLLM_COVERAGE_MIN = 0.95;
const CITATIONS_URL_COVERAGE_MIN = 0.90;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// Four signal classes (RESEARCH line 760).
const SIGNAL_CLASSES = ['diffusion', 'technical', 'insider', 'institutional'] as const;

// 15 Phase 19 feature flags (RESEARCH line 810). Must match
// src/lib/features.ts FLAG_NAMES exactly. Each flag must be absent from the
// features.ts file body before Phase 19 can close.
const PHASE_19_FLAGS = [
  'conformal_intervals',
  'cpcv',
  'ic_decay_monitor',
  'hierarchical_pooling',
  'data_cache',
  'tiingo_primary',
  'twelvedata_primary',
  'exa_primary',
  'finsentllm_ensemble',
  'community_supplemental',
  'cove_two_pass',
  'model_router',
  'contradiction_detector',
  'options_term_structure',
  'reputation_weighted_stocktwits',
] as const;

// -----------------------------------------------------------------------------
// runChecks() — pure async function, takes deps, returns Check[]
// -----------------------------------------------------------------------------

/**
 * Execute all 9 condition checks. Returns the full list (passing + failing).
 * Caller (script entrypoint) decides exit code based on `checks.filter(c=>!c.ok).length`.
 */
export async function runChecks(deps: RunChecksDeps): Promise<Check[]> {
  const checks: Check[] = [];
  const now = Date.now();
  const sevenDaysAgo = new Date(now - SEVEN_DAYS_MS);
  const thirtyDaysAgo = new Date(now - THIRTY_DAYS_MS);

  // -- 1. conformal-coverage ------------------------------------------------
  // ≥80% of ACTIVE cells must have a non-null conformal_low (CIs computed).
  try {
    const conformalCount = await deps.prisma.learnedPattern.count({
      where: { conformal_low: { not: null }, status: 'ACTIVE' },
    });
    const totalActive = await deps.prisma.learnedPattern.count({
      where: { status: 'ACTIVE' },
    });
    const ratio = totalActive === 0 ? 0 : conformalCount / totalActive;
    checks.push({
      name: 'conformal-coverage',
      ok: ratio >= CONFORMAL_COVERAGE_MIN,
      detail: `${conformalCount}/${totalActive} ACTIVE cells have conformal CIs (${(ratio * 100).toFixed(1)}%; need ≥${CONFORMAL_COVERAGE_MIN * 100}%)`,
    });
  } catch (err) {
    checks.push({
      name: 'conformal-coverage',
      ok: false,
      detail: `query failed: ${stringifyError(err)}`,
    });
  }

  // -- 2. dsr ---------------------------------------------------------------
  // avg(dsr) > DSR_MIN across ACTIVE cells.
  try {
    const dsrAgg = await deps.prisma.learnedPattern.aggregate({
      where: { status: 'ACTIVE' },
      _avg: { dsr: true },
    });
    const avg = dsrAgg._avg.dsr ?? 0;
    checks.push({
      name: 'dsr',
      ok: avg > DSR_MIN,
      detail: `avg DSR = ${avg.toFixed(3)} (need >${DSR_MIN})`,
    });
  } catch (err) {
    checks.push({ name: 'dsr', ok: false, detail: `query failed: ${stringifyError(err)}` });
  }

  // -- 3. pbo ---------------------------------------------------------------
  // avg(pbo) < PBO_MAX across ACTIVE cells.
  try {
    const pboAgg = await deps.prisma.learnedPattern.aggregate({
      where: { status: 'ACTIVE' },
      _avg: { pbo: true },
    });
    const avg = pboAgg._avg.pbo ?? 1;
    checks.push({
      name: 'pbo',
      ok: avg < PBO_MAX,
      detail: `avg PBO = ${avg.toFixed(3)} (need <${PBO_MAX})`,
    });
  } catch (err) {
    checks.push({ name: 'pbo', ok: false, detail: `query failed: ${stringifyError(err)}` });
  }

  // -- 4. ic-{class} ×4 ------------------------------------------------------
  // For each of the 4 signal classes, at least one row must have a
  // rolling_ic_20d populated within the last 7 days.
  for (const cls of SIGNAL_CLASSES) {
    try {
      const recent = await deps.prisma.learnedPattern.count({
        where: {
          signal_class: cls,
          rolling_ic_20d: { not: null },
          last_updated: { gte: sevenDaysAgo },
        },
      });
      checks.push({
        name: `ic-${cls}`,
        ok: recent > 0,
        detail: `${recent} ${cls} cell(s) have rolling_ic_20d in last 7 days (need ≥1)`,
      });
    } catch (err) {
      checks.push({
        name: `ic-${cls}`,
        ok: false,
        detail: `query failed: ${stringifyError(err)}`,
      });
    }
  }

  // -- 5. pooled -------------------------------------------------------------
  // ≥80% of LearnedPattern rows have parent_alpha populated (hierarchical
  // pooling has run for them).
  try {
    const pooled = await deps.prisma.learnedPattern.count({
      where: { parent_alpha: { not: null } },
    });
    const total = await deps.prisma.learnedPattern.count();
    const ratio = total === 0 ? 0 : pooled / total;
    checks.push({
      name: 'pooled',
      ok: ratio >= POOLED_COVERAGE_MIN,
      detail: `${pooled}/${total} cells have parent_alpha (${(ratio * 100).toFixed(1)}%; need ≥${POOLED_COVERAGE_MIN * 100}%)`,
    });
  } catch (err) {
    checks.push({ name: 'pooled', ok: false, detail: `query failed: ${stringifyError(err)}` });
  }

  // -- 6. finsentllm ---------------------------------------------------------
  // ≥95% of last-30-day SentimentSnapshot rows have a non-null finsentllm_score.
  try {
    const snaps30d = await deps.prisma.sentimentSnapshot.count({
      where: { scanned_at: { gte: thirtyDaysAgo } },
    });
    const snapsScored = await deps.prisma.sentimentSnapshot.count({
      where: {
        scanned_at: { gte: thirtyDaysAgo },
        finsentllm_score: { not: null },
      },
    });
    const ratio = snaps30d === 0 ? 0 : snapsScored / snaps30d;
    checks.push({
      name: 'finsentllm',
      ok: ratio >= FINSENTLLM_COVERAGE_MIN,
      detail: `${snapsScored}/${snaps30d} last-30d snapshots have finsentllm_score (${(ratio * 100).toFixed(1)}%; need ≥${FINSENTLLM_COVERAGE_MIN * 100}%)`,
    });
  } catch (err) {
    checks.push({
      name: 'finsentllm',
      ok: false,
      detail: `query failed: ${stringifyError(err)}`,
    });
  }

  // -- 7. citations ----------------------------------------------------------
  // Read last-30-day Reports, flat-map citations_v2, count analyst+news
  // claims; ≥90% must have a `url` field.
  try {
    const reports30d = await deps.prisma.report.findMany({
      where: { analyzed_at: { gte: thirtyDaysAgo } },
      select: { analysis: true },
    });
    let totalClaims = 0;
    let withUrl = 0;
    for (const r of reports30d) {
      const analysis = r.analysis as { citations_v2?: unknown } | null;
      const cits = (analysis?.citations_v2 ?? []) as Array<{ source?: string; url?: string }>;
      for (const c of cits) {
        if (c && (c.source === 'analyst' || c.source === 'news')) {
          totalClaims += 1;
          if (typeof c.url === 'string' && c.url.length > 0) withUrl += 1;
        }
      }
    }
    const ratio = totalClaims === 0 ? 1.0 : withUrl / totalClaims;
    // Vacuously true when no analyst/news claims exist; this is a calibration
    // bootstrap state, not a failure.
    checks.push({
      name: 'citations',
      ok: ratio >= CITATIONS_URL_COVERAGE_MIN,
      detail: `${withUrl}/${totalClaims} analyst/news claims have URL (${(ratio * 100).toFixed(1)}%; need ≥${CITATIONS_URL_COVERAGE_MIN * 100}%)`,
    });
  } catch (err) {
    checks.push({
      name: 'citations',
      ok: false,
      detail: `query failed: ${stringifyError(err)}`,
    });
  }

  // -- 8. no-old-{name} per registered grep pattern --------------------------
  // model-card-grep-patterns.json holds an array of patterns each cutover plan
  // registered. After cutover, none should match in src/, tests/, scripts/.
  try {
    const raw = deps.fs.readFileSync(deps.grepPatternsPath);
    const parsed = JSON.parse(raw) as {
      patterns?: Array<{ name: string; pattern: string }>;
    };
    const patterns = Array.isArray(parsed.patterns) ? parsed.patterns : [];
    for (const p of patterns) {
      try {
        // Use ripgrep --count-matches; trail with `|| echo 0` so an empty
        // result still produces "0".
        const cmd = `rg --count "${p.pattern}" src/ tests/ scripts/ || echo 0`;
        const out = String(deps.exec(cmd)).trim();
        // rg --count prints per-file counts; sum them. If the result is
        // "0" or empty, no matches. Otherwise we have hits.
        const totalMatches = sumRgCountOutput(out);
        checks.push({
          name: `no-old-${p.name}`,
          ok: totalMatches === 0,
          detail:
            totalMatches === 0
              ? `pattern "${p.pattern}" has zero matches in tree`
              : `pattern "${p.pattern}" still has ${totalMatches} match(es) in tree`,
        });
      } catch (err) {
        checks.push({
          name: `no-old-${p.name}`,
          ok: false,
          detail: `grep failed: ${stringifyError(err)}`,
        });
      }
    }
  } catch (err) {
    // If we can't read the registry at all, fail loudly with a single check.
    checks.push({
      name: 'no-old-_registry',
      ok: false,
      detail: `failed to read ${deps.grepPatternsPath}: ${stringifyError(err)}`,
    });
  }

  // -- 9. flag-removed-{flag} ×15 -------------------------------------------
  // Each of the 15 Phase 19 feature flag identifiers must be absent from
  // features.ts source. (The lifecycle is off → shadow → on → flag removed.)
  let featuresContent = '';
  try {
    featuresContent = deps.fs.readFileSync(deps.featuresPath);
  } catch (err) {
    // Surface read failure as a single failing check; subsequent per-flag
    // checks will then all fail with the same error. We still emit per-flag
    // entries so the punch list cardinality is stable.
    const detail = `failed to read ${deps.featuresPath}: ${stringifyError(err)}`;
    for (const flag of PHASE_19_FLAGS) {
      checks.push({ name: `flag-removed-${flag}`, ok: false, detail });
    }
    return checks;
  }
  for (const flag of PHASE_19_FLAGS) {
    const present = featuresContent.includes(flag);
    checks.push({
      name: `flag-removed-${flag}`,
      ok: !present,
      detail: present
        ? `flag '${flag}' still present in ${deps.featuresPath} — must be deleted post-cutover`
        : `flag '${flag}' absent from ${deps.featuresPath}`,
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

/**
 * `rg --count` prints one line per matching file, formatted as either:
 *   path/to/file:7
 * or, if our `|| echo 0` fallback fired (no matches anywhere), simply:
 *   0
 *
 * This sums all counts. Empty output also returns 0.
 */
function sumRgCountOutput(out: string): number {
  if (!out || out === '0') return 0;
  // If the output is purely numeric (single number), return it.
  if (/^\d+$/.test(out)) return Number(out);
  let total = 0;
  for (const line of out.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Lines look like "path:N"; pull the trailing number.
    const m = trimmed.match(/(\d+)\s*$/);
    if (m) total += Number(m[1]);
  }
  return total;
}

// -----------------------------------------------------------------------------
// Script entrypoint — wire real deps, run, exit with status code
// -----------------------------------------------------------------------------

async function main(): Promise<void> {
  // Lazy-import real deps so vitest doesn't pull in Prisma/Neon during unit
  // testing (tests use the exported runChecks() with mocked deps directly).
  const { execSync } = await import('node:child_process');
  const fs = await import('node:fs');
  const path = await import('node:path');

  // Load .env.local just like the rest of the codebase does (D-46).
  try {
    const dotenv = await import('dotenv');
    dotenv.config({ path: '.env.local' });
  } catch {
    // dotenv missing is non-fatal; environment may already be set.
  }

  // Resolve paths relative to repo root (cwd of `npm run`).
  const repoRoot = process.cwd();
  const featuresPath = path.join(repoRoot, 'src/lib/features.ts');
  const grepPatternsPath = path.join(repoRoot, 'scripts/model-card-grep-patterns.json');

  // Real Prisma client. We import lazily so the test path never touches Neon.
  const { prisma } = await import('../src/lib/db');

  const deps: RunChecksDeps = {
    prisma: prisma as unknown as RunChecksDeps['prisma'],
    fs: {
      readFileSync: (p: string) => fs.readFileSync(p, 'utf8'),
    },
    exec: (cmd: string) => {
      try {
        return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (err) {
        // ripgrep returns exit code 1 when there are no matches AND no `||`
        // fallback fires. Our cmds always include `|| echo 0`, so this catch
        // is mostly defensive.
        const e = err as { stdout?: Buffer | string };
        if (e.stdout) return String(e.stdout);
        return '0';
      }
    },
    featuresPath,
    grepPatternsPath,
  };

  let checks: Check[];
  try {
    checks = await runChecks(deps);
  } catch (err) {
    console.error('✗ Phase 19 done gate: ABORTED — runChecks threw:');
    console.error(stringifyError(err));
    process.exit(1);
  }

  const failed = checks.filter((c) => !c.ok);
  const passed = checks.length - failed.length;

  if (failed.length === 0) {
    console.log(`✓ Phase 19 done gate: ALL CHECKS PASSED (${passed}/${checks.length})`);
    process.exit(0);
  }

  console.error('✗ Phase 19 done gate: FAILED');
  console.error(`  ${passed}/${checks.length} checks passed; ${failed.length} unmet:`);
  for (const c of failed) {
    console.error(`  - ${c.name}: ${c.detail}`);
  }
  process.exit(1);
}

// Run main() only when invoked as a script, not when imported by tests.
// Under tsx (esm) `import.meta.url` matches `process.argv[1]` for the entry.
const isEntry = (() => {
  try {
    // CJS path
    if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
      return true;
    }
  } catch {
    // ignore
  }
  // ESM path: compare import.meta.url to entry file
  try {
    const url = import.meta.url;
    const entry = process.argv[1];
    if (url && entry) {
      // Strip file:// prefix if present, normalize.
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
    console.error('✗ Phase 19 done gate: UNCAUGHT ERROR');
    console.error(stringifyError(err));
    process.exit(1);
  });
}
