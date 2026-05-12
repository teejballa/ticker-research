// Plan 20-A-05 Task 7 — LearnedPattern.pattern_key agreement-bucket extension.
//
// Asserts backward-compatibility ('na' → unchanged base key, legacy keys
// resolve to bucket = 'na'), new buckets ('mixed', 'aligned') append the
// expected suffix, and round-trip equality.

import { describe, expect, it } from 'vitest';
import {
  buildPatternKey,
  parsePatternKey,
  type AgreementBucket,
} from '@/lib/learning';

describe('buildPatternKey', () => {
  it("appends ':agreement=mixed' for the 'mixed' bucket", () => {
    expect(buildPatternKey('echo-chamber-bull', 'mixed')).toBe(
      'echo-chamber-bull:agreement=mixed',
    );
  });

  it("appends ':agreement=aligned' for the 'aligned' bucket", () => {
    expect(buildPatternKey('echo-chamber-bull', 'aligned')).toBe(
      'echo-chamber-bull:agreement=aligned',
    );
  });

  it("returns the base key UNCHANGED for the 'na' bucket (backward-compat)", () => {
    expect(buildPatternKey('echo-chamber-bull', 'na')).toBe('echo-chamber-bull');
  });

  it('returns the base key UNCHANGED when no bucket argument is given', () => {
    expect(buildPatternKey('echo-chamber-bull')).toBe('echo-chamber-bull');
  });

  it('preserves base keys that already contain other punctuation', () => {
    expect(buildPatternKey('flow:niche-driven', 'mixed')).toBe(
      'flow:niche-driven:agreement=mixed',
    );
  });
});

describe('parsePatternKey', () => {
  it("returns bucket='na' for a legacy key (no :agreement= suffix)", () => {
    expect(parsePatternKey('echo-chamber-bull')).toEqual({
      base: 'echo-chamber-bull',
      agreement_bucket: 'na',
    });
  });

  it("parses ':agreement=mixed' suffix into bucket 'mixed'", () => {
    expect(parsePatternKey('echo-chamber-bull:agreement=mixed')).toEqual({
      base: 'echo-chamber-bull',
      agreement_bucket: 'mixed',
    });
  });

  it("parses ':agreement=aligned' suffix into bucket 'aligned'", () => {
    expect(parsePatternKey('flow-pattern:agreement=aligned')).toEqual({
      base: 'flow-pattern',
      agreement_bucket: 'aligned',
    });
  });
});

describe('round-trip', () => {
  it("buildPatternKey ↔ parsePatternKey is identity for 'mixed'", () => {
    expect(parsePatternKey(buildPatternKey('foo', 'mixed'))).toEqual({
      base: 'foo',
      agreement_bucket: 'mixed',
    });
  });

  it("buildPatternKey ↔ parsePatternKey is identity for 'aligned'", () => {
    expect(parsePatternKey(buildPatternKey('foo', 'aligned'))).toEqual({
      base: 'foo',
      agreement_bucket: 'aligned',
    });
  });

  it("buildPatternKey ↔ parsePatternKey is identity for 'na' (legacy)", () => {
    // 'na' encodes to bare key; parses back to 'na'.
    expect(parsePatternKey(buildPatternKey('foo', 'na'))).toEqual({
      base: 'foo',
      agreement_bucket: 'na',
    });
  });
});

describe('AgreementBucket type', () => {
  it('exports the trichotomy', () => {
    const a: AgreementBucket = 'mixed';
    const b: AgreementBucket = 'aligned';
    const c: AgreementBucket = 'na';
    expect([a, b, c]).toEqual(['mixed', 'aligned', 'na']);
  });
});
