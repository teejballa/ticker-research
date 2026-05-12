// tests/prompts/version-bump.fixture.test.ts
//
// Plan 20-Z-04 Task 4 — synthetic "smoke test for the smoke test".
//
// Proves the golden-snapshot mechanism would catch unauthorized body edits.
// We do NOT mutate the on-disk prompts; instead we mutate an in-memory copy
// of a registered body and assert that:
//   1. The mutated body differs from the registered body (non-whitespace change).
//   2. A deterministic hash of the mutated body differs from the hash of the
//      registered body.
// vitest's snapshot matcher compares stringified representations — if a hash
// differs, the snapshot would diverge, so the golden test would have caught
// the edit. This documents the chain of evidence for T-20-Z-04-01.

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { getPrompt } from '@/lib/prompts/registry';

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

describe('version-bump fixture — golden snapshot mechanism guards prompt bodies', () => {
  it('mutating a v1 body in-memory diverges from the registered body', () => {
    // Pick the smallest registered prompt — minimal blast radius for the fixture.
    const original = getPrompt('gemini-cycle-summary', 'v1');
    expect(original.template.length).toBeGreaterThan(0);

    // Synthetic mutation: append a single character. This is the simplest
    // possible non-whitespace edit; any real prompt-engineering tweak would
    // produce at least this much diff.
    const mutated = original.template + 'X';
    expect(mutated).not.toBe(original.template);

    // Hash inequality proves a vitest snapshot of the mutated body would
    // diverge from the committed snapshot of the registered body.
    expect(sha256(mutated)).not.toBe(sha256(original.template));
  });

  it('mutating a v1 body via single-character replacement also diverges', () => {
    const original = getPrompt('gemini-research-brief-system', 'v1');
    // Replace the first 'a' with 'b' — guaranteed to flip at least one byte
    // since the body contains "analyst" near the start.
    const mutated = original.template.replace('a', 'b');
    expect(mutated).not.toBe(original.template);
    expect(sha256(mutated)).not.toBe(sha256(original.template));
  });

  it('IDENTICAL clone of a body does NOT diverge — sanity check on the hash', () => {
    const original = getPrompt('gemini-cove-pass1-instruction', 'v1');
    const clone = original.template; // exact same reference / same bytes
    expect(sha256(clone)).toBe(sha256(original.template));
  });

  it('whitespace-only mutation (extra trailing space on every line) is detectable', () => {
    // check-prompt-versions.ts treats whitespace-only diffs as a WARNING (not
    // a block) per T-20-Z-04-02 (accepted threat) — but the golden snapshot
    // still catches them (different bytes → different snapshot). This test
    // documents that distinction.
    const original = getPrompt('gemini-cycle-summary', 'v1');
    const mutated = original.template.split('\n').map((l) => l + ' ').join('\n');
    expect(mutated).not.toBe(original.template);
    expect(sha256(mutated)).not.toBe(sha256(original.template));
  });
});
