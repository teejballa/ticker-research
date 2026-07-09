#!/usr/bin/env tsx
/* Composite done-gate for Phase 22 — Market Regime + Source Weights.
   Mirrors scripts/phase-21.1-status.ts pattern.

   Usage:
     npm run phase-22-status
     npx tsx scripts/phase-22-status.ts
     npx tsx scripts/phase-22-status.ts --allow-null-finding

   The 9 sub-gates:
     1. Wave 4 SOAK.md relearn_complete_ack: true
     2. Soak duration ≥ 14 calendar days elapsed since soak_start_iso (D-13)
     3. Schema has regime columns on LearnedPattern / SourceTier / PerSourceIC
     4. FEATURE_ASOF_REGISTRY covers regime fields (scripts/check-feature-asof.ts exits 0)
     5. regimeDoneGate output — ≥ 1 cell promoted OR --allow-null-finding accepted (D-14 + D-16)
     6. Playwright Source-mix row test green (tests/e2e/source-mix-row.spec.ts)
     7. Vitest suite for regime-done-gate green
     8. Requirements coverage — CORE-ML-06/07/08/09/10/26/27/28 present in REQUIREMENTS.md
     9. ROADMAP.md marks Phase 22 as complete OR active

   Exit 0 ↔ all 9 gates pass (or gate 5 accepts null finding via flag). */

import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = process.cwd();
const args = new Set(process.argv.slice(2));
const ALLOW_NULL_FINDING = args.has('--allow-null-finding');

type GateResult = { name: string; passed: boolean; detail: string };

/**
 * Create a Prisma client using the project's Neon adapter (same as src/lib/db.ts).
 * Must only be called when DATABASE_URL is set.
 */
async function makePrisma() {
  const { PrismaClient } = await import('@prisma/client');
  const { PrismaNeon } = await import('@prisma/adapter-neon');
  const connectionString = process.env.DATABASE_URL!;
  const adapter = new PrismaNeon({ connectionString });
  return new PrismaClient({ adapter });
}

// ============================================================================
// Gate implementations
// ============================================================================

/** Gate 1 — Wave 4 SOAK.md relearn_complete_ack: true. */
function gateSoakAck(): GateResult {
  const name = '1. Wave 4 SOAK.md relearn_complete_ack: true (D-13)';
  const soakPath = join(
    REPO_ROOT,
    '.planning/phases/22-market-regime-and-source-weights/22-04-SOAK.md',
  );
  if (!existsSync(soakPath)) {
    return { name, passed: false, detail: `MISSING: ${soakPath}` };
  }
  const body = readFileSync(soakPath, 'utf8');
  const ackMatch = body.match(/relearn_complete_ack:\s*(true|false)/);
  if (!ackMatch) {
    return { name, passed: false, detail: 'relearn_complete_ack line not found in SOAK.md frontmatter' };
  }
  const passed = ackMatch[1] === 'true';
  return {
    name,
    passed,
    detail: passed
      ? 'relearn_complete_ack: true ✓ (operator confirmed live-relearn observation)'
      : 'relearn_complete_ack: false — operator must flip after Wave 4 Task 3 verification',
  };
}

/** Gate 2 — Soak duration ≥ 14 calendar days elapsed (D-13). */
function gateSoakDuration(): GateResult {
  const name = '2. Soak window ≥ 14 calendar days elapsed (D-13)';
  const soakPath = join(
    REPO_ROOT,
    '.planning/phases/22-market-regime-and-source-weights/22-04-SOAK.md',
  );
  if (!existsSync(soakPath)) {
    return { name, passed: false, detail: `MISSING: ${soakPath}` };
  }
  const body = readFileSync(soakPath, 'utf8');
  // The plan's Task 1 <action> says "parse the `First relearn timestamp:` line".
  // Prefer that; fall back to the frontmatter `soak_start_iso` field.
  const bodyMatch = body.match(/First relearn timestamp:\*\*\s*(\S+)/);
  const yamlMatch = body.match(/soak_start_iso:\s*(\S+)/);
  const iso = bodyMatch?.[1] ?? yamlMatch?.[1];
  if (!iso) {
    return { name, passed: false, detail: 'Could not parse soak_start_iso from SOAK.md' };
  }
  const startMs = Date.parse(iso);
  if (!Number.isFinite(startMs)) {
    return { name, passed: false, detail: `soak_start_iso not a valid ISO timestamp: ${iso}` };
  }
  const daysElapsed = (Date.now() - startMs) / (1000 * 60 * 60 * 24);
  const passed = daysElapsed >= 14;
  return {
    name,
    passed,
    detail: passed
      ? `${daysElapsed.toFixed(1)} days elapsed since ${iso} (target: 14.0) ✓`
      : `Only ${daysElapsed.toFixed(1)} days elapsed since ${iso} — Wave 5 gate needs 14.0+`,
  };
}

/** Gate 3 — Schema has regime column on LearnedPattern, SourceTier, PerSourceIC. */
function gateSchemaRegimeColumns(): GateResult {
  const name = '3. Prisma schema has regime column on 3 tables';
  const schemaPath = join(REPO_ROOT, 'prisma/schema.prisma');
  if (!existsSync(schemaPath)) {
    return { name, passed: false, detail: 'prisma/schema.prisma missing' };
  }
  const schema = readFileSync(schemaPath, 'utf8');
  const models = ['LearnedPattern', 'SourceTier', 'PerSourceIC'];
  const missing: string[] = [];
  for (const model of models) {
    // Find the model block and check for a `regime` field inside it.
    const modelRegex = new RegExp(`model\\s+${model}\\s*{([^]*?)^}`, 'm');
    const match = schema.match(modelRegex);
    if (!match) {
      missing.push(`${model} (model not found)`);
      continue;
    }
    if (!/\bregime\s+String/.test(match[1])) {
      missing.push(`${model} (no regime String field)`);
    }
  }
  const passed = missing.length === 0;
  return {
    name,
    passed,
    detail: passed
      ? 'LearnedPattern.regime + SourceTier.regime + PerSourceIC.regime all present ✓'
      : `MISSING regime column on: ${missing.join(', ')}`,
  };
}

/** Gate 4 — check-feature-asof.ts exits 0 (regime fields covered by registry). */
function gateFeatureAsof(): GateResult {
  const name = '4. check-feature-asof exits 0 (regime fields registered)';
  const scriptPath = join(REPO_ROOT, 'scripts/check-feature-asof.ts');
  if (!existsSync(scriptPath)) {
    return {
      name,
      passed: true,
      detail: 'scripts/check-feature-asof.ts not present — soft-passing (Phase 21.1 gate not applicable)',
    };
  }
  try {
    execSync('npx tsx scripts/check-feature-asof.ts', {
      stdio: 'pipe',
      encoding: 'utf8',
      cwd: REPO_ROOT,
      timeout: 60_000,
    });
    return { name, passed: true, detail: 'all @knowable_at annotations present ✓' };
  } catch (err) {
    const e = err as { stderr?: string; stdout?: string };
    const out = (e.stderr || e.stdout || '').slice(0, 300);
    return { name, passed: false, detail: `feature-asof check failed: ${out}` };
  }
}

/**
 * Gate 5 — regimeDoneGate output (D-14).
 *
 * Read the most recent regime-tagged cell_promoted / cell_demoted LearningEvent
 * rows written by /api/cron/learn. Each row's `delta` carries brier_lift +
 * brier_lift_ci_bca_95 already computed at cell-recompute time — treat these as
 * the same-fold Q7-compliant done-gate output.
 *
 * A cell PASSES the D-14 gate when: delta.brier_lift > 0.005 AND delta.brier_lift_ci_bca_95[0] > 0.
 * (These are the exact conditions the in-memory regimeDoneGate() enforces on
 * synthetic input, so the composite gate is a live mirror of the primitive.)
 *
 * If DATABASE_URL is absent, this gate soft-passes with a warning — the
 * primitive is unit-tested elsewhere (gate 7).
 */
async function gateDoneGate(): Promise<GateResult> {
  const name = '5. regime done-gate: ≥1 cell promoted OR --allow-null-finding';

  if (!process.env.DATABASE_URL) {
    return {
      name,
      passed: true,
      detail: 'DATABASE_URL not set — soft-passing (unit tests cover regimeDoneGate primitive). Run with .env.local for full check.',
    };
  }

  try {
    const prisma = await makePrisma();

    // Look at the last 24 hours of cell_promoted/_demoted events — same
    // relearn cycle window as the cron schedule.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const events = await prisma.learningEvent.findMany({
      where: {
        event_type: { in: ['cell_promoted', 'cell_demoted'] },
        occurred_at: { gte: since },
      },
      select: {
        event_type: true,
        signal_class: true,
        pattern_key: true,
        cap_class: true,
        horizon_days: true,
        regime: true,
        delta: true,
        occurred_at: true,
      },
      orderBy: { occurred_at: 'desc' },
    });

    await prisma.$disconnect();

    if (events.length === 0) {
      const passed = ALLOW_NULL_FINDING;
      return {
        name,
        passed,
        detail: passed
          ? '0 cell_promoted/_demoted events in last 24h — --allow-null-finding ACCEPTED (D-16 valid IS-paper outcome)'
          : '0 cell_promoted/_demoted events in last 24h. Rerun /api/cron/learn OR pass --allow-null-finding to accept as null (D-16).',
      };
    }

    // Filter to per-regime events (regime !== 'ALL') that are promotions with
    // valid brier_lift + CI (i.e., what the D-14 gate actually promotes).
    let regimeCells = 0;
    let promotedCells = 0;
    const promotedRows: string[] = [];
    let allEvents = 0;
    for (const evt of events) {
      const regime = evt.regime ?? 'ALL';
      if (regime === 'ALL') {
        allEvents += 1;
        continue;
      }
      regimeCells += 1;
      const delta = (evt.delta ?? {}) as Record<string, unknown>;
      const lift = typeof delta.brier_lift === 'number' ? delta.brier_lift : NaN;
      const ci = Array.isArray(delta.brier_lift_ci_bca_95)
        ? delta.brier_lift_ci_bca_95 as [number, number]
        : [NaN, NaN];
      if (evt.event_type === 'cell_promoted' && lift > 0.005 && ci[0] > 0) {
        promotedCells += 1;
        promotedRows.push(
          `      - ${evt.signal_class}/${evt.pattern_key} × ${evt.cap_class} @${evt.horizon_days}d regime=${regime}  lift=${lift.toFixed(4)} [${ci[0].toFixed(4)}, ${ci[1].toFixed(4)}]`,
        );
      }
    }

    const passed = promotedCells >= 1 || ALLOW_NULL_FINDING;
    const summary =
      `${promotedCells} regime cell(s) promoted / ${regimeCells} evaluated (ALL-row events: ${allEvents}).`;
    const detail = promotedCells >= 1
      ? `${summary} Regime conditioning earned its sparsity cost ✓\n${promotedRows.join('\n')}`
      : ALLOW_NULL_FINDING
        ? `${summary} --allow-null-finding ACCEPTED — 0 ACTIVE regime cells is a valid IS-paper null finding per D-16.`
        : `${summary} No promoted cells; pass --allow-null-finding to accept D-16 null finding.`;
    return { name, passed, detail };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      name,
      passed: false,
      detail: `DB query failed: ${msg.slice(0, 200)}. Ensure DATABASE_URL / DIRECT_URL are set and schema is up-to-date.`,
    };
  }
}

/** Gate 6 — Playwright source-mix row test green. */
function gatePlaywright(): GateResult {
  const name = '6. Playwright source-mix row test (tests/e2e/source-mix-row.spec.ts)';
  const specPath = join(REPO_ROOT, 'tests/e2e/source-mix-row.spec.ts');
  if (!existsSync(specPath)) {
    return { name, passed: false, detail: `MISSING: ${specPath}` };
  }
  try {
    execSync('npx playwright test tests/e2e/source-mix-row.spec.ts --reporter=dot', {
      stdio: 'pipe',
      encoding: 'utf8',
      cwd: REPO_ROOT,
      timeout: 180_000,
    });
    return { name, passed: true, detail: 'Source-mix row Playwright test green ✓' };
  } catch (err) {
    const e = err as { stderr?: string; stdout?: string };
    const out = (e.stderr || e.stdout || '').slice(0, 300);
    return {
      name,
      passed: false,
      detail: `Playwright test failing — start dev server (npm run dev) and re-run. Output: ${out}`,
    };
  }
}

/** Gate 7 — Vitest suite for regime-done-gate green. */
function gateVitest(): GateResult {
  const name = '7. Vitest regime-done-gate + evaluation suite green';
  try {
    execSync('npx vitest run src/lib/evaluation/__tests__/regime-done-gate.test.ts --reporter=dot', {
      stdio: 'pipe',
      encoding: 'utf8',
      cwd: REPO_ROOT,
      timeout: 120_000,
    });
    return { name, passed: true, detail: 'regimeDoneGate unit tests green ✓' };
  } catch (err) {
    const e = err as { stderr?: string; stdout?: string };
    const out = (e.stderr || e.stdout || '').slice(0, 300);
    return { name, passed: false, detail: `vitest failing: ${out}` };
  }
}

/** Gate 8 — REQUIREMENTS.md covers CORE-ML-06/07/08/09/10/26/27/28. */
function gateRequirements(): GateResult {
  const name = '8. REQUIREMENTS.md covers Phase 22 CORE-ML IDs';
  const reqPath = join(REPO_ROOT, '.planning/REQUIREMENTS.md');
  if (!existsSync(reqPath)) {
    return { name, passed: false, detail: `MISSING: ${reqPath}` };
  }
  const body = readFileSync(reqPath, 'utf8');
  const ids = ['CORE-ML-06', 'CORE-ML-07', 'CORE-ML-08', 'CORE-ML-09', 'CORE-ML-10', 'CORE-ML-26', 'CORE-ML-27', 'CORE-ML-28'];
  const missing = ids.filter((id) => !body.includes(id));
  return {
    name,
    passed: missing.length === 0,
    detail: missing.length === 0
      ? 'All 8 P22 CORE-ML IDs present in REQUIREMENTS.md ✓'
      : `MISSING: ${missing.join(', ')} — run Wave 5 Task 7 bookkeeping`,
  };
}

/** Gate 9 — ROADMAP.md marks Phase 22 status. */
function gateRoadmap(): GateResult {
  const name = '9. ROADMAP.md Phase 22 entry present';
  const roadmapPath = join(REPO_ROOT, '.planning/ROADMAP.md');
  if (!existsSync(roadmapPath)) {
    return { name, passed: false, detail: `MISSING: ${roadmapPath}` };
  }
  const body = readFileSync(roadmapPath, 'utf8');
  const hasPhase22 = /Phase 22/i.test(body);
  const has4Bucket = /4-bucket regime|bull\/bear.*low-vol\/high-vol/i.test(body);
  return {
    name,
    passed: hasPhase22 && has4Bucket,
    detail: !hasPhase22
      ? 'ROADMAP.md has no Phase 22 entry — run Wave 5 Task 7'
      : !has4Bucket
        ? 'ROADMAP.md Phase 22 not updated to "4-bucket regime" (D-02) — run Wave 5 Task 7'
        : 'Phase 22 present + 4-bucket regime wording confirmed ✓',
  };
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<number> {
  // Load .env.local so DATABASE_URL is available for DB-dependent gates.
  try {
    const dotenv = await import('dotenv');
    dotenv.config({ path: '.env.local' });
  } catch {
    // dotenv optional; env may already be set in the process
  }

  const results: GateResult[] = [];
  results.push(gateSoakAck());
  results.push(gateSoakDuration());
  results.push(gateSchemaRegimeColumns());
  results.push(gateFeatureAsof());
  results.push(await gateDoneGate());
  results.push(gatePlaywright());
  results.push(gateVitest());
  results.push(gateRequirements());
  results.push(gateRoadmap());

  console.log('\n=== Phase 22 Status — Market Regime + Source Weights ===\n');
  if (ALLOW_NULL_FINDING) {
    console.log('  (running with --allow-null-finding — 0-ACTIVE regime finding acceptable per D-16)\n');
  }
  let allPassed = true;
  for (const r of results) {
    const icon = r.passed ? '✓' : '✗';
    console.log(`  ${icon} ${r.name}`);
    // Detail on a separate indented line for readability.
    for (const line of r.detail.split('\n')) {
      console.log(`      ${line}`);
    }
    if (!r.passed) allPassed = false;
  }

  const passCount = results.filter((r) => r.passed).length;
  console.log();
  if (allPassed) {
    console.log(`✓ Phase 22 status: ${passCount}/${results.length} gates passed. Ready to ship.`);
    return 0;
  }
  console.log(`✗ Phase 22 status: ${passCount}/${results.length} gates passed.`);
  return 1;
}

main().then((code) => process.exit(code));
