// Phase 19-C-09 Task 1 (TDD RED): Pin the model-cascade router decision tree
// before any implementation lands.
//
// D-41 (CONTEXT.md): routeModel({ ticker, controversy, ic_decay_flag,
// market_cap_class }) returns 'haiku' | 'gemini-flash' | 'gemini-pro'. High-stakes
// triggers (any of: ic_decay_flag=true, controversy>=0.7, market_cap_class='mega')
// → 'gemini-pro'. Low-stakes (small_cap + controversy < 0.3) → 'haiku'.
// Default: 'gemini-flash'. estimateCost(model, tokens) returns USD per Vercel
// AI Gateway pricing pinned in router.ts.
//
// Tests are deterministic — no randomness, no I/O.

import { describe, it, expect } from 'vitest';
import { routeModel, estimateCost } from '@/lib/reasoning/router';

describe('routeModel — decision tree per design §4 step 6c (D-41)', () => {
  it('low-stakes (small cap, low controversy, no decay) → haiku', () => {
    const choice = routeModel({
      ticker: 'TINY',
      controversy: 0.1,
      ic_decay_flag: false,
      market_cap_class: 'small',
    });
    expect(choice).toBe('haiku');
  });

  it('standard (mid cap, controversy=0.3) → gemini-flash', () => {
    const choice = routeModel({
      ticker: 'MIDX',
      controversy: 0.3,
      ic_decay_flag: false,
      market_cap_class: 'mid',
    });
    expect(choice).toBe('gemini-flash');
  });

  it('high-stakes mega-cap → gemini-pro', () => {
    const choice = routeModel({
      ticker: 'AAPL',
      controversy: 0.0,
      ic_decay_flag: false,
      market_cap_class: 'mega',
    });
    expect(choice).toBe('gemini-pro');
  });

  it('ic_decay_flag=true → gemini-pro regardless of cap', () => {
    const choice = routeModel({
      ticker: 'WARN',
      controversy: 0.0,
      ic_decay_flag: true,
      market_cap_class: 'small',
    });
    expect(choice).toBe('gemini-pro');
  });

  it('controversy>0.7 → gemini-pro', () => {
    const choice = routeModel({
      ticker: 'HOT',
      controversy: 0.85,
      ic_decay_flag: false,
      market_cap_class: 'mid',
    });
    expect(choice).toBe('gemini-pro');
  });

  it('controversy=0.7 boundary → gemini-pro (≥ rule)', () => {
    const choice = routeModel({
      ticker: 'EDGE',
      controversy: 0.7,
      ic_decay_flag: false,
      market_cap_class: 'mid',
    });
    expect(choice).toBe('gemini-pro');
  });

  it('estimateCost(haiku, 10000) is cheaper than estimateCost(gemini-pro, 10000)', () => {
    const haikuCost = estimateCost('haiku', 10_000);
    const proCost = estimateCost('gemini-pro', 10_000);
    expect(haikuCost).toBeLessThan(proCost);
    // Sanity: both are positive USD values for 10k tokens.
    expect(haikuCost).toBeGreaterThan(0);
    expect(proCost).toBeGreaterThan(0);
  });

  it('routeModel is deterministic — same input always returns same output', () => {
    const args = {
      ticker: 'DETM',
      controversy: 0.5,
      ic_decay_flag: false,
      market_cap_class: 'large' as const,
    };
    const a = routeModel(args);
    const b = routeModel(args);
    const c = routeModel({ ...args });
    expect(a).toBe(b);
    expect(a).toBe(c);
  });
});
