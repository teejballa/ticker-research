import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getJointFeaturesMode,
  buildJointFeaturePatternKey,
  type JointFeatures,
} from '@/lib/learning';
import fixture from './fixtures/pattern-key-pre-20-C-05.json';

const SAMPLE_FEATURES: JointFeatures = {
  sentimentMomentumProduct: 0.02,
  sentimentVolumeInteraction: 1.5,
  deltaSentiment3d: 0.15,
  sentimentDispersion: 0.25,
};

describe('JOINT_FEATURES_MODE flag (plan 20-C-05)', () => {
  const ORIGINAL = process.env.JOINT_FEATURES_MODE;
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.JOINT_FEATURES_MODE;
    else process.env.JOINT_FEATURES_MODE = ORIGINAL;
  });

  it("returns 'off' when env var is undefined", () => {
    delete process.env.JOINT_FEATURES_MODE;
    expect(getJointFeaturesMode()).toBe('off');
  });

  it("returns the env value when set to 'off', 'shadow', or 'on'", () => {
    for (const v of ['off', 'shadow', 'on'] as const) {
      process.env.JOINT_FEATURES_MODE = v;
      expect(getJointFeaturesMode()).toBe(v);
    }
  });

  it("throws on invalid env value", () => {
    process.env.JOINT_FEATURES_MODE = 'enabled';
    expect(() => getJointFeaturesMode()).toThrow();
    process.env.JOINT_FEATURES_MODE = 'true';
    expect(() => getJointFeaturesMode()).toThrow();
  });
});

describe('buildJointFeaturePatternKey (plan 20-C-05)', () => {
  beforeEach(() => {
    delete process.env.JOINT_FEATURES_MODE;
  });

  it("mode='off' returns byte-identical pre-plan canonical key (golden-master snapshot)", () => {
    const result = buildJointFeaturePatternKey({
      sentimentType: fixture.inputs.sentimentType,
      capClass: fixture.inputs.capClass,
      direction: fixture.inputs.direction as 'bull' | 'bear',
      mode: 'off',
    });
    expect(result.primaryKey).toBe(fixture.expected_primaryKey);
    expect(result.shadowKey).toBeUndefined();
  });

  it("mode='off' returns no shadowKey", () => {
    const result = buildJointFeaturePatternKey({
      sentimentType: 'news',
      capClass: 'large',
      direction: 'bull',
      jointFeatures: SAMPLE_FEATURES,
      mode: 'off',
    });
    expect(result.shadowKey).toBeUndefined();
  });

  it("mode='shadow' returns BOTH primaryKey (byte-identical to off) and shadowKey (with joint hash)", () => {
    const offResult = buildJointFeaturePatternKey({
      sentimentType: 'news',
      capClass: 'large',
      direction: 'bull',
      mode: 'off',
    });
    const shadowResult = buildJointFeaturePatternKey({
      sentimentType: 'news',
      capClass: 'large',
      direction: 'bull',
      jointFeatures: SAMPLE_FEATURES,
      mode: 'shadow',
    });
    expect(shadowResult.primaryKey).toBe(offResult.primaryKey); // byte-identical
    expect(shadowResult.shadowKey).toBeDefined();
    expect(shadowResult.shadowKey).toMatch(/::joint::[0-9a-f]{12}$/);
  });

  it("mode='on' embeds joint-feature hash directly in primaryKey", () => {
    const onResult = buildJointFeaturePatternKey({
      sentimentType: 'news',
      capClass: 'large',
      direction: 'bull',
      jointFeatures: SAMPLE_FEATURES,
      mode: 'on',
    });
    expect(onResult.primaryKey).toMatch(/^news:large:bull::joint::[0-9a-f]{12}$/);
    expect(onResult.shadowKey).toBeUndefined();
  });

  it('joint-feature hash is deterministic across runs (same inputs → same hash)', () => {
    const a = buildJointFeaturePatternKey({
      sentimentType: 'news',
      capClass: 'large',
      direction: 'bull',
      jointFeatures: SAMPLE_FEATURES,
      mode: 'on',
    });
    const b = buildJointFeaturePatternKey({
      sentimentType: 'news',
      capClass: 'large',
      direction: 'bull',
      jointFeatures: SAMPLE_FEATURES,
      mode: 'on',
    });
    expect(a.primaryKey).toBe(b.primaryKey);
  });

  it('default mode read from env when not provided as arg', () => {
    process.env.JOINT_FEATURES_MODE = 'shadow';
    const result = buildJointFeaturePatternKey({
      sentimentType: 'news',
      capClass: 'large',
      direction: 'bull',
      jointFeatures: SAMPLE_FEATURES,
    });
    // shadow mode → primaryKey is the base, shadowKey has the joint hash
    expect(result.primaryKey).toBe('news:large:bull');
    expect(result.shadowKey).toBeDefined();
  });
});
