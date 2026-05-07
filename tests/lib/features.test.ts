import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveFeatures, type FeatureMode } from '../../src/lib/features';

describe('features', () => {
  const originalEnv = process.env;
  beforeEach(() => { process.env = { ...originalEnv }; });
  afterEach(() => { process.env = originalEnv; });

  it('defaults all flags to false when env unset', () => {
    delete process.env.FEATURE_CONFORMAL;
    expect(resolveFeatures().conformal_intervals_enabled).toBe(false);
  });

  it('parses "true" as enabled', () => {
    process.env.FEATURE_CONFORMAL = 'true';
    expect(resolveFeatures().conformal_intervals_enabled).toBe(true);
  });

  it('parses "shadow" as shadow mode', () => {
    process.env.FEATURE_CONFORMAL = 'shadow';
    expect(resolveFeatures().conformal_intervals_mode).toBe('shadow');
  });

  it('rejects unknown values with descriptive error', () => {
    process.env.FEATURE_CONFORMAL = 'invalid';
    expect(() => resolveFeatures()).toThrow(/FEATURE_CONFORMAL/);
  });

  it('exposes all 15 Phase 19 flags', () => {
    const f = resolveFeatures();
    const expected = [
      'conformal_intervals', 'cpcv', 'ic_decay_monitor', 'hierarchical_pooling',
      'data_cache', 'tiingo_primary', 'twelvedata_primary', 'exa_primary',
      'finsentllm_ensemble', 'community_supplemental', 'cove_two_pass',
      'model_router', 'contradiction_detector', 'options_term_structure',
      'reputation_weighted_stocktwits',
    ];
    for (const flag of expected) {
      expect(f).toHaveProperty(`${flag}_enabled`);
      expect(f).toHaveProperty(`${flag}_mode`);
    }
  });
});
