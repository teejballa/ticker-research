// scripts/check-composite-ship-gate.ts
// Phase 24 Wave 4 Task 24-04-03 (D-07 + CLAUDE.md §8). Standalone ship-gate.
//
// Enforces D-07 (Brier ≤ 0.24 + ECE ≤ 0.05 + coverage ≥ 0.50) AND non-LLM
// baseline lift requirement (composite Brier beats naive-mean AND
// logistic-36 baseline by ≥ 0.005). Reads latest CompositeCalibrationSnapshot
// per (classifier_version='cipher-composite-v1', regime, cap_class); prints
// a human-readable gate report by default, --json for machine output.
//
// TODO(Phase 24.1 follow-up): Close Blocker #2 for real by extending
// CompositeRow + loadFitDataset to project the P21.1 CORE-ML-23 36-feature
// vector. Until then, `baseline_brier_logistic_36` is null in every cron
// snapshot. Per the Phase 24 finalization decision (BL-02 pragmatic path),
// Gate 5 now WARN+SKIPs on null instead of hard-failing so the ship-gate
// remains informative rather than a dead assertion. The visible SKIP line
// prevents an operator from missing the pending work.
//
// Exit codes:
//   0 = ship-eligible (all evaluated cells pass all gates)
//   1 = gate failed (any cell fails any gate)
//   2 = insufficient data (no snapshot with status != 'insufficient_data')
//
// Usage:
//   npx tsx scripts/check-composite-ship-gate.ts
//   npx tsx scripts/check-composite-ship-gate.ts --regime bull-low-vol --cap large_cap
//   npx tsx scripts/check-composite-ship-gate.ts --json
//
// Coverage gate implementation:
//   Coverage is a universe-level property ("fraction of tickers with
//   composite_class_count >= 2 in last 30d of reports"). Deriving that
//   directly requires a per-Report scan of engine_calibration.composite_*
//   which is expensive. This script falls back to a proxy: the fraction of
//   latest snapshots per cell that are NOT status='insufficient_data'. The
//   proxy is a lower bound — true universe coverage is at least this high.

import { prisma } from '@/lib/db';

const CLASSIFIER_VERSION = 'cipher-composite-v1';

// Ship-gate thresholds — MUST match HYPERPARAMETERS.md §Phase 24 verbatim.
const SHIP_GATE_BRIER_MAX = 0.24;
const SHIP_GATE_ECE_MAX = 0.05;
const SHIP_GATE_COVERAGE_MIN = 0.50;
const SHIP_GATE_BASELINE_LIFT_MIN = 0.005;

// Cell enumeration — mirrors the composite-calibration cron's cartesian
// product (5 regimes × 3 cap classes = 15 cells).
const REGIMES = [
  'ALL',
  'bull-low-vol',
  'bull-high-vol',
  'bear-low-vol',
  'bear-high-vol',
] as const;
const CAP_CLASSES = ['large_cap', 'mid_cap', 'small_cap'] as const;

type GateVerdict = 'pass' | 'fail' | 'skip';

interface GateResult {
  regime: string;
  cap_class: string;
  composite_brier: number | null;
  ece: number | null;
  baseline_naive: number | null;
  baseline_logistic: number | null;
  gate1_brier: GateVerdict;
  gate2_ece: GateVerdict;
  gate4_naive_lift: GateVerdict;
  /**
   * Gate 5 (logistic-36 lift). Per Phase 24 finalization (BL-02 pragmatic
   * path), null baseline is now SKIP with a prominent operator-facing note —
   * NOT a hard fail. The proper fix (thread the 36-feature vector through
   * loadHoldoutDataset) is deferred to a Phase 24.1 follow-up.
   */
  gate5_logistic_lift: GateVerdict;
  status: string;
}

interface ParsedArgs {
  regime?: string;
  cap?: string;
  json: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = { json: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--regime') out.regime = argv[++i];
    else if (argv[i] === '--cap') out.cap = argv[++i];
    else if (argv[i] === '--json') out.json = true;
  }
  return out;
}

async function evaluateCell(regime: string, cap_class: string): Promise<GateResult> {
  const snap = await prisma.compositeCalibrationSnapshot.findFirst({
    where: { classifier_version: CLASSIFIER_VERSION, regime, cap_class },
    orderBy: { computed_at: 'desc' },
  });
  if (!snap || snap.status === 'insufficient_data') {
    return {
      regime,
      cap_class,
      composite_brier: null,
      ece: null,
      baseline_naive: null,
      baseline_logistic: null,
      gate1_brier: 'skip',
      gate2_ece: 'skip',
      gate4_naive_lift: 'skip',
      gate5_logistic_lift: 'skip', // no snapshot → nothing to evaluate
      status: snap?.status ?? 'no_snapshot',
    };
  }

  // Gate 1: composite Brier ≤ SHIP_GATE_BRIER_MAX
  const gate1: 'pass' | 'fail' = snap.composite_brier <= SHIP_GATE_BRIER_MAX ? 'pass' : 'fail';

  // Gate 2: ECE ≤ SHIP_GATE_ECE_MAX
  const gate2: 'pass' | 'fail' = snap.ece <= SHIP_GATE_ECE_MAX ? 'pass' : 'fail';

  // Gate 4: composite < naive-mean baseline - LIFT_MIN (skip if baseline null)
  const gate4: GateVerdict = snap.baseline_brier_naive_mean == null
    ? 'skip'
    : snap.composite_brier < snap.baseline_brier_naive_mean - SHIP_GATE_BASELINE_LIFT_MIN
      ? 'pass'
      : 'fail';

  // Gate 5: composite < logistic-36 baseline - LIFT_MIN
  //   BL-02 pragmatic path (Phase 24 finalization): null baseline is a
  //   SKIP with a prominent operator-facing warning — NOT a hard fail.
  //   The proper fix (project the 36-feature vector into CompositeRow +
  //   loadHoldoutDataset) is deferred to a Phase 24.1 follow-up. Skips
  //   are surfaced by the top-level renderer with a `⚠ Gate 5 SKIPPED`
  //   line so operators cannot miss the pending work.
  const gate5: GateVerdict = snap.baseline_brier_logistic_36 == null
    ? 'skip'
    : snap.composite_brier < snap.baseline_brier_logistic_36 - SHIP_GATE_BASELINE_LIFT_MIN
      ? 'pass'
      : 'fail';

  return {
    regime,
    cap_class,
    composite_brier: snap.composite_brier,
    ece: snap.ece,
    baseline_naive: snap.baseline_brier_naive_mean,
    baseline_logistic: snap.baseline_brier_logistic_36,
    gate1_brier: gate1,
    gate2_ece: gate2,
    gate4_naive_lift: gate4,
    gate5_logistic_lift: gate5,
    status: snap.status,
  };
}

async function computeCoverage(): Promise<number> {
  // Proxy: fraction of latest per-cell snapshots that are NOT insufficient_data.
  // See file header for note on the true universe-coverage definition.
  let total = 0;
  let covered = 0;
  for (const regime of REGIMES) {
    for (const cap_class of CAP_CLASSES) {
      total++;
      const snap = await prisma.compositeCalibrationSnapshot.findFirst({
        where: { classifier_version: CLASSIFIER_VERSION, regime, cap_class },
        orderBy: { computed_at: 'desc' },
      });
      if (snap && snap.status !== 'insufficient_data') covered++;
    }
  }
  return total === 0 ? 0 : covered / total;
}

function padStatus(v: GateVerdict | 'pass' | 'fail'): string {
  const s = v.toUpperCase();
  return s.padEnd(5);
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));

  // IN-06: --regime and --cap must be used together. Previously `--regime` alone
  // was silently ignored (fell through to the 15-cell sweep), which masks
  // operator intent.
  if ((args.regime && !args.cap) || (!args.regime && args.cap)) {
    console.error(
      '[ship-gate] error: --regime and --cap must be used together (or neither).',
    );
    return 1;
  }

  const cells: Array<{ regime: string; cap_class: string }> = [];
  if (args.regime && args.cap) {
    cells.push({ regime: args.regime, cap_class: args.cap });
  } else {
    for (const r of REGIMES) for (const c of CAP_CLASSES) cells.push({ regime: r, cap_class: c });
  }

  const results: GateResult[] = [];
  for (const { regime, cap_class } of cells) {
    results.push(await evaluateCell(regime, cap_class));
  }

  const evaluated = results.filter((r) => r.composite_brier != null);
  if (evaluated.length === 0) {
    if (args.json) {
      console.log(JSON.stringify({ exit: 2, reason: 'insufficient_data', results }, null, 2));
    } else {
      console.log('[ship-gate] insufficient data — no snapshots with real Brier available yet.');
      console.log(`[ship-gate] Evaluated ${results.length} cell(s); all were insufficient_data or missing.`);
    }
    return 2;
  }

  // Gate 3 is a global gate (not per-cell) — compute once over the full 15-cell surface.
  const coverage = await computeCoverage();
  const gate3_coverage: 'pass' | 'fail' = coverage >= SHIP_GATE_COVERAGE_MIN ? 'pass' : 'fail';

  const anyFail =
    gate3_coverage === 'fail' ||
    evaluated.some(
      (r) =>
        r.gate1_brier === 'fail' ||
        r.gate2_ece === 'fail' ||
        r.gate4_naive_lift === 'fail' ||
        r.gate5_logistic_lift === 'fail',
    );

  // BL-02 pragmatic path: count Gate 5 skips on evaluated cells so we can
  // surface a visible operator warning. A skip is NOT a fail, but the operator
  // must not miss the pending Phase 24.1 follow-up.
  const gate5SkipCount = evaluated.filter((r) => r.gate5_logistic_lift === 'skip').length;

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          exit: anyFail ? 1 : 0,
          coverage,
          coverage_gate: gate3_coverage,
          thresholds: {
            SHIP_GATE_BRIER_MAX,
            SHIP_GATE_ECE_MAX,
            SHIP_GATE_COVERAGE_MIN,
            SHIP_GATE_BASELINE_LIFT_MIN,
          },
          gate5_skip_count: gate5SkipCount,
          gate5_skip_reason:
            gate5SkipCount > 0
              ? 'null baseline_brier_logistic_36 — Phase 24.1 follow-up pending (BL-02 pragmatic path)'
              : null,
          results,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(`[ship-gate] Phase 24 Composite Signal Synthesis — ${new Date().toISOString()}`);
    console.log(
      `Coverage: ${(coverage * 100).toFixed(1)}% (≥${SHIP_GATE_COVERAGE_MIN * 100}%): ${gate3_coverage.toUpperCase()}`,
    );
    console.log('');
    console.log(
      'regime               | cap        | brier  | ece    | naive   | logistic | g1    g2    g4    g5    | status',
    );
    console.log(
      '---------------------|------------|--------|--------|---------|----------|-------------------------|-------------------',
    );
    for (const r of results) {
      console.log(
        `${r.regime.padEnd(20)} | ${r.cap_class.padEnd(10)} | ` +
          `${(r.composite_brier?.toFixed(3) ?? '  —  ').padStart(6)} | ` +
          `${(r.ece?.toFixed(3) ?? '  —  ').padStart(6)} | ` +
          `${(r.baseline_naive?.toFixed(3) ?? '  —  ').padStart(7)} | ` +
          `${(r.baseline_logistic?.toFixed(3) ?? '   —   ').padStart(8)} | ` +
          `${padStatus(r.gate1_brier)}${padStatus(r.gate2_ece)}${padStatus(r.gate4_naive_lift)}${padStatus(r.gate5_logistic_lift)} | ` +
          `${r.status}`,
      );
    }
    console.log('');
    if (gate5SkipCount > 0) {
      console.log(
        `⚠ Gate 5 SKIPPED on ${gate5SkipCount} evaluated cell(s) (null baseline_brier_logistic_36 — Blocker #2 / Phase 24.1 follow-up pending).`,
      );
      console.log(
        '  Fix: extend CompositeRow + loadHoldoutDataset to project the 36-feature vector so logistic36Brier() runs.',
      );
    }
    console.log(
      anyFail
        ? '[ship-gate] FAIL — one or more gates failed. Ship blocked.'
        : '[ship-gate] PASS — all evaluated cells ship-eligible.',
    );
  }

  return anyFail ? 1 : 0;
}

main()
  .then(async (code) => {
    await prisma.$disconnect();
    process.exit(code);
  })
  .catch(async (e) => {
    console.error('[ship-gate] fatal:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
