// tests/lib/data/source-package.test.ts
//
// Phase 19 / Plan 19-B-06 (Task 2b) — `combinedMode` helper unit tests.
//
// 6 decision-permutation coverage matrix (T-19-B-06-04 mitigation):
//   1. all-off            → 'off'
//   2. all-on             → 'on'
//   3. all-shadow         → 'shadow'
//   4. mixed off + shadow → 'shadow' (shadow-wins, even surrounded by off)
//   5. mixed on + shadow  → 'shadow' (shadow-wins, even surrounded by on)
//   6. mixed on + off     → 'off'    (mixed-without-shadow falls back to off,
//                                     i.e. safe default — keeps users on the
//                                     old ladder until full cutover)
//
// Why these 6 specifically: they cover the three documented decision rules
// (shadow-wins, all-on, default-off) AND each "mixed" combination that could
// arise during a partial flag flip in production. Without test 4/5 a
// regression from "any shadow wins" → "majority wins" would silently route
// production users to a partially-rolled-out new ladder. Without test 6, a
// regression from "default off" → "any-on wins" would prematurely cut over
// before all three flags are flipped.

import { describe, it, expect } from 'vitest';
import { combinedMode } from '../../../src/lib/data/source-package';
import type { FeatureMode } from '../../../src/lib/features';

describe('combinedMode', () => {
  it('returns off when all modes off', () => {
    const modes: FeatureMode[] = ['off', 'off', 'off'];
    expect(combinedMode(modes)).toBe('off');
  });

  it('returns on when all modes on (full cutover state)', () => {
    const modes: FeatureMode[] = ['on', 'on', 'on'];
    expect(combinedMode(modes)).toBe('on');
  });

  it('returns shadow when all modes shadow', () => {
    const modes: FeatureMode[] = ['shadow', 'shadow', 'shadow'];
    expect(combinedMode(modes)).toBe('shadow');
  });

  it('returns shadow when any mode is shadow even if others off', () => {
    const modes: FeatureMode[] = ['off', 'shadow', 'off'];
    expect(combinedMode(modes)).toBe('shadow');
  });

  it('returns shadow when any mode is shadow even if others on', () => {
    const modes: FeatureMode[] = ['on', 'shadow', 'on'];
    expect(combinedMode(modes)).toBe('shadow');
  });

  it('returns off for mixed on+off without any shadow (safe default)', () => {
    const modes: FeatureMode[] = ['off', 'on', 'off'];
    expect(combinedMode(modes)).toBe('off');
  });
});
