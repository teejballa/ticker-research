import { describe, it, expect } from 'vitest';
import { composeSignal } from '@/lib/composite/compose';

describe('composeSignal — K=4 all ACTIVE (REASON-01)', () => {
  it('returns ESS-weighted calibrated composite', () => {
    const identityCurve = (x: number) => x;
    const result = composeSignal(
      {
        diffusion:     { raw_posterior: 0.60, ess: 100, status: 'ACTIVE' },
        technical:     { raw_posterior: 0.70, ess: 50,  status: 'ACTIVE' },
        institutional: { raw_posterior: 0.80, ess: 25,  status: 'ACTIVE' },
        insider:       { raw_posterior: 0.90, ess: 25,  status: 'ACTIVE' },
      },
      { diffusion: identityCurve, technical: identityCurve, institutional: identityCurve, insider: identityCurve },
      { minClassesActive: 2 },
    );
    // Weights = [100,50,25,25]/200 = [0.5,0.25,0.125,0.125]
    // Composite = 0.5*0.60 + 0.25*0.70 + 0.125*0.80 + 0.125*0.90 = 0.6875
    expect(result.composite_prob).toBeCloseTo(0.6875, 4);
    expect(result.class_count).toBe(4);
    expect(result.gate_status).toBe('active');
  });
});

describe('composeSignal — K=3 renormalize (REASON-01, D-03)', () => {
  it('renormalizes weights when one class is EXPLORATORY', () => {
    const identityCurve = (x: number) => x;
    const result = composeSignal(
      {
        diffusion:     { raw_posterior: 0.60, ess: 100, status: 'ACTIVE' },
        technical:     { raw_posterior: 0.70, ess: 50,  status: 'ACTIVE' },
        institutional: { raw_posterior: 0.80, ess: 25,  status: 'ACTIVE' },
        insider:       { raw_posterior: 0.90, ess: 25,  status: 'EXPLORATORY' },
      },
      { diffusion: identityCurve, technical: identityCurve, institutional: identityCurve, insider: identityCurve },
      { minClassesActive: 2 },
    );
    // Weights over ACTIVE only = [100,50,25]/175 → composite = (100*.6+50*.7+25*.8)/175 = 0.6571..
    expect(result.class_count).toBe(3);
    expect(result.composite_prob).toBeCloseTo(0.6571428, 4);
    expect(result.gate_status).toBe('active');
    expect(result.class_weights.insider).toBe(0);
  });
});

describe('composeSignal — K<2 suppress (D-03)', () => {
  it('returns null composite + insufficient_coverage when K=1', () => {
    const identityCurve = (x: number) => x;
    const result = composeSignal(
      {
        diffusion:     { raw_posterior: 0.60, ess: 100, status: 'ACTIVE' },
        technical:     { raw_posterior: 0.70, ess: 50,  status: 'EXPLORATORY' },
        institutional: { raw_posterior: 0.80, ess: 25,  status: 'EXPLORATORY' },
        insider:       { raw_posterior: 0.90, ess: 25,  status: 'EXPLORATORY' },
      },
      { diffusion: identityCurve, technical: identityCurve, institutional: identityCurve, insider: identityCurve },
      { minClassesActive: 2 },
    );
    expect(result.composite_prob).toBeNull();
    expect(result.class_count).toBe(1);
    expect(result.gate_status).toBe('insufficient_coverage');
  });
});
