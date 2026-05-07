// tests/learning.unit.bugs.test.ts
// Plan 19-A-01: decayWeights lambda guard + HYPERPARAMETERS Zod schema.
//
// Why this file exists:
//   - decayWeights previously accepted lambdaDays = 0 silently, returning
//     exp(-Δt / 0) = Infinity and corrupting ESS computation downstream
//     (silent failure mode flagged by D-17 in 19-CONTEXT.md).
//   - HYPERPARAMETERS was a hand-rolled object with no module-load
//     validation; a typo in a signal class name or an out-of-range
//     param would only surface deep inside the cron route at use time.
//
// This file locks both behaviors via failing-then-passing TDD per the
// master implementation plan lines 339-385.

import { describe, it, expect } from 'vitest';
import { decayWeights, HYPERPARAMETERS, validateHyperparameters } from '../src/lib/learning';

describe('decayWeights — Phase 19 guard (Plan 19-A-01)', () => {
  const obs = [{ hit: true, recorded_at: new Date('2026-04-01') }];

  it('rejects lambdaDays = 0 with descriptive error', () => {
    expect(() => decayWeights(obs, 0)).toThrow(/lambdaDays must be > 0/);
  });

  it('rejects negative lambdaDays', () => {
    expect(() => decayWeights(obs, -10)).toThrow(/lambdaDays must be > 0/);
  });

  it('rejects NaN lambdaDays', () => {
    expect(() => decayWeights(obs, Number.NaN)).toThrow(/lambdaDays must be > 0/);
  });

  it('accepts lambdaDays = 0.001 (smallest positive)', () => {
    const w = decayWeights(obs, 0.001);
    expect(w[0]).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(w[0])).toBe(true);
  });

  // RESEARCH Pitfall 1: empty-input contract MUST be preserved. Even though
  // the new guard rejects lambdaDays <= 0, an empty obs array should still
  // return [] regardless of lambda. (Existing call sites pass valid lambdas
  // here, but the empty-input case is the natural identity for decayWeights.)
  it('returns [] for empty input regardless of lambda', () => {
    expect(decayWeights([], 30)).toEqual([]);
    expect(decayWeights([], 60)).toEqual([]);
  });
});

describe('HYPERPARAMETERS — Zod schema (Plan 19-A-01)', () => {
  it('validates current bootstrap config', () => {
    expect(() => validateHyperparameters(HYPERPARAMETERS)).not.toThrow();
  });

  it('rejects lambda_days = 0', () => {
    const bad = { ...HYPERPARAMETERS, diffusion: { ...HYPERPARAMETERS.diffusion, lambda_days: 0 } };
    expect(() => validateHyperparameters(bad)).toThrow(/lambda_days/);
  });

  it('rejects negative ph_lambda', () => {
    const bad = { ...HYPERPARAMETERS, diffusion: { ...HYPERPARAMETERS.diffusion, ph_lambda: -1 } };
    expect(() => validateHyperparameters(bad)).toThrow(/ph_lambda/);
  });

  it('rejects unknown signal class', () => {
    const bad = { ...HYPERPARAMETERS, bogus: { ...HYPERPARAMETERS.diffusion } };
    expect(() => validateHyperparameters(bad as never)).toThrow(/signal class/);
  });
});
