// tests/composite/baseline-benchmark.int.test.ts
// Phase 24 Wave 4 Task 24-04-03 (CLAUDE.md §8 — non-LLM baseline mandatory).
//
// For each ship-eligible / shadow snapshot of classifier_version=
// 'cipher-composite-v1', assert composite Brier beats the naive-mean baseline
// (Gate 4) AND the logistic-36 baseline (Gate 5) by at least
// SHIP_GATE_BASELINE_LIFT_MIN = 0.005.
//
// Blocker #2 (24-REVISION-TODO.md): baseline_brier_logistic_36 is populated
// for every ship-eligible / shadow snapshot by the Wave 3 cron. A null value
// on such a snapshot is a hard FAIL (not a skip) — no more null-tolerance.
//
// Pre-launch behavior: if no ship-eligible / shadow snapshots exist yet, the
// test no-op-passes with a console warning. Once the first snapshot lands,
// the test starts enforcing the CLAUDE.md §8 gate.

import { describe, it, expect } from 'vitest';
import { prisma } from '@/lib/db';

const CLASSIFIER_VERSION = 'cipher-composite-v1';
const LIFT_MIN = 0.005;

interface Violation {
  regime: string;
  cap_class: string;
  brier: number;
  baseline: number;
  delta: number;
}

describe('Composite vs non-LLM baselines (CLAUDE.md §8)', () => {
  it('composite Brier beats naive-mean baseline by ≥ 0.005 on all ship-eligible/shadow snapshots', async () => {
    const snaps = await prisma.compositeCalibrationSnapshot.findMany({
      where: {
        classifier_version: CLASSIFIER_VERSION,
        status: { in: ['ship-eligible', 'shadow'] },
      },
    });

    if (snaps.length === 0) {
      console.warn(
        '[baseline-benchmark] No ship-eligible or shadow snapshots yet — pre-launch no-op pass. Test starts enforcing as soon as the cron produces eligible data.',
      );
      return;
    }

    const violations: Violation[] = [];
    for (const s of snaps) {
      if (s.baseline_brier_naive_mean == null) continue;
      const delta = s.baseline_brier_naive_mean - s.composite_brier;
      if (delta < LIFT_MIN) {
        violations.push({
          regime: s.regime,
          cap_class: s.cap_class,
          brier: s.composite_brier,
          baseline: s.baseline_brier_naive_mean,
          delta,
        });
      }
    }
    expect(
      violations,
      `naive-mean baseline lift < 0.005 in ${violations.length} cells: ${JSON.stringify(violations)}`,
    ).toEqual([]);
  });

  it('composite Brier beats logistic-36 baseline by ≥ 0.005 on all ship-eligible/shadow snapshots (Blocker #2 — MANDATORY)', async () => {
    // Blocker #2 in 24-REVISION-TODO.md: baseline_brier_logistic_36 is
    // populated for every ship-eligible/shadow snapshot (Plan 02 Task
    // 24-02-03 shipped the real logistic-36 baseline module; Plan 03 Task 2
    // cron wires it). Null baseline on a ship-eligible/shadow snapshot is a
    // hard FAIL (not a skip).
    const snaps = await prisma.compositeCalibrationSnapshot.findMany({
      where: {
        classifier_version: CLASSIFIER_VERSION,
        status: { in: ['ship-eligible', 'shadow'] },
      },
    });

    if (snaps.length === 0) {
      console.warn(
        '[baseline-benchmark] No ship-eligible or shadow snapshots yet — pre-launch no-op pass. Test starts enforcing as soon as the cron produces eligible data.',
      );
      return;
    }

    // Any snapshot with null logistic-36 baseline in ship-eligible/shadow
    // state is a hard fail per Blocker #2 (no more null-tolerance).
    const nullBaseline = snaps.filter((s) => s.baseline_brier_logistic_36 == null);
    expect(
      nullBaseline,
      `Blocker #2: ${nullBaseline.length} ship-eligible/shadow snapshots have NULL baseline_brier_logistic_36 — cron must populate this field for every non-insufficient snapshot`,
    ).toEqual([]);

    const violations: Violation[] = [];
    for (const s of snaps) {
      if (s.baseline_brier_logistic_36 == null) continue; // already caught above
      const delta = s.baseline_brier_logistic_36 - s.composite_brier;
      if (delta < LIFT_MIN) {
        violations.push({
          regime: s.regime,
          cap_class: s.cap_class,
          brier: s.composite_brier,
          baseline: s.baseline_brier_logistic_36,
          delta,
        });
      }
    }
    expect(
      violations,
      `logistic-36 baseline lift < 0.005 in ${violations.length} cells: ${JSON.stringify(violations)}`,
    ).toEqual([]);
  });
});
