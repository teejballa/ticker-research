// tests/cron-learn.unit.bugs.test.ts
// Plan 19-A-02: Brier OOS chronological split bug fix + look-ahead embargo
// on buildTraceForOutcome.
//
// Why this file exists:
//   - Brier OOS computation in /api/cron/learn/route.ts used `Math.max(1, n-14)`
//     to split predictions into in-sample / out-of-sample. For n < 16 this
//     silently produces a 0-row test set, returning Brier 0 (NaN-equivalent in
//     a "model is perfect" disguise). This is the silent-failure mode flagged
//     by D-18 in 19-CONTEXT.md.
//   - Plan 19-A-02 replaces it with `timeBasedSplit` — an exported pure helper
//     that honors chronological order and guarantees ≥1 test row when n ≥ 2.
//   - buildTraceForOutcome did not enforce a look-ahead embargo: snapshots
//     scanned within the prediction_horizon window of an outcome's
//     `recorded_at` may carry future-leaking signal. We add a pure helper
//     `filterSnapshotsForEmbargo` that drops snapshots whose
//     `outcome.recorded_at - snap.scanned_at < horizon_days × 86_400_000 ms`.
//
// This file locks both behaviors via failing-then-passing TDD per the plan.

import { describe, it, expect } from 'vitest';
import {
  timeBasedSplit,
  filterSnapshotsForEmbargo,
  computeBrierOOS,
} from '../src/lib/learning';

describe('timeBasedSplit — chronological partition (Plan 19-A-02)', () => {
  function obs(daysAgo: number, idx = 0) {
    return { recorded_at: new Date(Date.now() - daysAgo * 86_400_000), idx };
  }

  it('honors chronological order — train.recorded_at all < min(test.recorded_at)', () => {
    // 10 items shuffled across days
    const items = [
      obs(5, 1),
      obs(1, 2),
      obs(9, 3),
      obs(3, 4),
      obs(7, 5),
      obs(2, 6),
      obs(6, 7),
      obs(8, 8),
      obs(4, 9),
      obs(10, 10),
    ];
    const { train, test } = timeBasedSplit(items, 0.2);
    expect(train.length).toBeGreaterThan(0);
    expect(test.length).toBeGreaterThan(0);
    const maxTrain = Math.max(...train.map((t) => t.recorded_at.getTime()));
    const minTest = Math.min(...test.map((t) => t.recorded_at.getTime()));
    expect(maxTrain).toBeLessThan(minTest);
  });

  it('at n=14 produces ≥2 test rows (the n-14 bug previously produced 0)', () => {
    const items = Array.from({ length: 14 }, (_, i) => obs(14 - i, i));
    const { train, test } = timeBasedSplit(items, 0.2);
    expect(train.length + test.length).toBe(14);
    expect(test.length).toBeGreaterThanOrEqual(2);
  });

  it('at n=5 produces ≥1 test row', () => {
    const items = Array.from({ length: 5 }, (_, i) => obs(5 - i, i));
    const { train, test } = timeBasedSplit(items, 0.2);
    expect(train.length).toBe(4);
    expect(test.length).toBe(1);
  });

  it('at n=0 returns empty arrays', () => {
    const { train, test } = timeBasedSplit<{ recorded_at: Date }>([], 0.2);
    expect(train).toEqual([]);
    expect(test).toEqual([]);
  });

  it('at n=1 returns full train + empty test (cannot split a singleton)', () => {
    const items = [obs(1, 1)];
    const { train, test } = timeBasedSplit(items, 0.2);
    expect(train.length).toBe(1);
    expect(test.length).toBe(0);
  });

  it('at n=2 produces 1 train + 1 test', () => {
    const items = [obs(2, 1), obs(1, 2)];
    const { train, test } = timeBasedSplit(items, 0.2);
    expect(train.length).toBe(1);
    expect(test.length).toBe(1);
    // chronological: train must be the older one
    expect(train[0].idx).toBe(1);
    expect(test[0].idx).toBe(2);
  });

  it('does not mutate the input array', () => {
    const items = [obs(3, 1), obs(1, 2), obs(2, 3)];
    const before = items.map((i) => i.idx);
    timeBasedSplit(items, 0.2);
    const after = items.map((i) => i.idx);
    expect(after).toEqual(before);
  });
});

describe('computeBrierOOS — null-on-tiny-test-set guard (Plan 19-A-02)', () => {
  it('returns null when test set has fewer than 5 rows (instead of NaN/0)', () => {
    // n=14 → testSize=ceil(14*0.2)=3 → < 5 → must return null with reason
    const predictions = Array.from({ length: 14 }, () => 0.6);
    const observations = Array.from({ length: 14 }, (_, i) => ({
      recorded_at: new Date(Date.now() - (14 - i) * 86_400_000),
      hit: i % 2 === 0,
    }));
    const result = computeBrierOOS(predictions, observations);
    expect(result.brier).toBeNull();
    expect(result.reason).toMatch(/n_test=\d+ < 5/);
  });

  it('returns numeric Brier when test set has ≥5 rows', () => {
    const N = 30;
    const predictions = Array.from({ length: N }, () => 0.5);
    const observations = Array.from({ length: N }, (_, i) => ({
      recorded_at: new Date(Date.now() - (N - i) * 86_400_000),
      hit: i % 2 === 0,
    }));
    const result = computeBrierOOS(predictions, observations);
    expect(result.brier).not.toBeNull();
    expect(typeof result.brier).toBe('number');
    expect(result.brier!).toBeGreaterThanOrEqual(0);
    expect(result.brier!).toBeLessThanOrEqual(1);
    expect(result.reason).toBeNull();
  });
});

describe('filterSnapshotsForEmbargo — look-ahead defense (Plan 19-A-02 D-18)', () => {
  // Snapshot interface for the helper — only scanned_at is needed.
  type Snap = { scanned_at: Date };

  it('rejects snapshots within prediction_horizon of outcome', () => {
    const outcomeRecordedAt = new Date('2026-04-30T00:00:00Z');
    const horizonDays = 7;
    // Snapshot 3 days before outcome → within 7d horizon → REJECTED
    const snap: Snap = { scanned_at: new Date('2026-04-27T00:00:00Z') };
    const out = filterSnapshotsForEmbargo([snap], outcomeRecordedAt, horizonDays);
    expect(out.length).toBe(0);
  });

  it('accepts snapshots more than prediction_horizon before outcome', () => {
    const outcomeRecordedAt = new Date('2026-04-30T00:00:00Z');
    const horizonDays = 7;
    // Snapshot 10 days before outcome → outside 7d horizon → ACCEPTED
    const snap: Snap = { scanned_at: new Date('2026-04-20T00:00:00Z') };
    const out = filterSnapshotsForEmbargo([snap], outcomeRecordedAt, horizonDays);
    expect(out.length).toBe(1);
    expect(out[0]).toBe(snap);
  });

  it('mixed window: filters only the within-horizon snapshots, preserves the rest', () => {
    const outcomeRecordedAt = new Date('2026-04-30T00:00:00Z');
    const horizonDays = 14;
    const snaps: Snap[] = [
      { scanned_at: new Date('2026-04-29T00:00:00Z') }, // 1d before — REJECTED
      { scanned_at: new Date('2026-04-25T00:00:00Z') }, // 5d before — REJECTED
      { scanned_at: new Date('2026-04-15T00:00:00Z') }, // 15d before — ACCEPTED
      { scanned_at: new Date('2026-04-01T00:00:00Z') }, // 29d before — ACCEPTED
    ];
    const out = filterSnapshotsForEmbargo(snaps, outcomeRecordedAt, horizonDays);
    expect(out.length).toBe(2);
    // Order preserved
    expect(out[0].scanned_at.toISOString()).toBe('2026-04-15T00:00:00.000Z');
    expect(out[1].scanned_at.toISOString()).toBe('2026-04-01T00:00:00.000Z');
  });

  it('boundary case: snapshot exactly at horizon boundary is rejected (strict <)', () => {
    // Spec wording: "snap.scanned_at < horizon" → if the gap is EXACTLY
    // horizon_days, treat as inside the embargo (reject). This is the
    // conservative choice — leakage defense should err on the side of caution.
    const outcomeRecordedAt = new Date('2026-04-30T00:00:00Z');
    const horizonDays = 7;
    const snap: Snap = {
      scanned_at: new Date(outcomeRecordedAt.getTime() - horizonDays * 86_400_000),
    };
    const out = filterSnapshotsForEmbargo([snap], outcomeRecordedAt, horizonDays);
    expect(out.length).toBe(0);
  });

  it('horizonDays=0 disables the embargo (degenerate case — passes everything ≤ outcome)', () => {
    // With horizon=0, only future-dated snapshots (scanned_at > outcome) are rejected.
    const outcomeRecordedAt = new Date('2026-04-30T00:00:00Z');
    const horizonDays = 0;
    const snaps: Snap[] = [
      { scanned_at: new Date('2026-04-29T00:00:00Z') },
      { scanned_at: new Date('2026-04-15T00:00:00Z') },
    ];
    const out = filterSnapshotsForEmbargo(snaps, outcomeRecordedAt, horizonDays);
    expect(out.length).toBe(2);
  });
});
