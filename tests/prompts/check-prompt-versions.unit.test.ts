// tests/prompts/check-prompt-versions.unit.test.ts
//
// Plan 20-Z-04 Task 6 — Unit tests for the pure helpers exported by
// scripts/check-prompt-versions.ts. These prove the gate fires correctly
// without spawning git or the actual script.

import { describe, it, expect } from 'vitest';
import {
  parseVersionPath,
  siblingNextVersionAddedInDiff,
} from '@/../scripts/check-prompt-versions';

describe('check-prompt-versions — pure helpers', () => {
  describe('parseVersionPath', () => {
    it('parses src/lib/prompts/_v1/gemini-cycle-summary.md → {1, gemini-cycle-summary}', () => {
      expect(parseVersionPath('src/lib/prompts/_v1/gemini-cycle-summary.md')).toEqual({
        version: 1,
        id: 'gemini-cycle-summary',
      });
    });

    it('parses src/lib/prompts/_v2/gemini-cove-pass1-instruction.md', () => {
      expect(parseVersionPath('src/lib/prompts/_v2/gemini-cove-pass1-instruction.md')).toEqual({
        version: 2,
        id: 'gemini-cove-pass1-instruction',
      });
    });

    it('parses double-digit version src/lib/prompts/_v17/foo.md', () => {
      expect(parseVersionPath('src/lib/prompts/_v17/foo.md')).toEqual({ version: 17, id: 'foo' });
    });

    it('returns null for non-version paths', () => {
      expect(parseVersionPath('src/lib/prompts/registry.ts')).toBeNull();
      expect(parseVersionPath('src/lib/prompts/_manifest.ts')).toBeNull();
      expect(parseVersionPath('src/lib/prompts/_v1/notes.txt')).toBeNull();
      expect(parseVersionPath('src/lib/prompts/_v0/foo.md')).toEqual({ version: 0, id: 'foo' }); // syntactic only — semantic check would reject v0
    });
  });

  describe('siblingNextVersionAddedInDiff', () => {
    it('detects sibling _v(N+1)/<id>.md when present in the changed set', () => {
      const changed = new Set([
        'src/lib/prompts/_v1/gemini-cove-pass1-instruction.md',
        'src/lib/prompts/_v2/gemini-cove-pass1-instruction.md',
      ]);
      expect(
        siblingNextVersionAddedInDiff('src/lib/prompts/_v1/gemini-cove-pass1-instruction.md', changed),
      ).toBe(true);
    });

    it('returns false when no sibling _v(N+1) present', () => {
      const changed = new Set([
        'src/lib/prompts/_v1/gemini-cycle-summary.md',
        // No _v2 sibling
      ]);
      expect(
        siblingNextVersionAddedInDiff('src/lib/prompts/_v1/gemini-cycle-summary.md', changed),
      ).toBe(false);
    });

    it('returns false for sibling of DIFFERENT id', () => {
      const changed = new Set([
        'src/lib/prompts/_v1/gemini-cycle-summary.md',
        'src/lib/prompts/_v2/gemini-cove-pass1-instruction.md', // different id!
      ]);
      expect(
        siblingNextVersionAddedInDiff('src/lib/prompts/_v1/gemini-cycle-summary.md', changed),
      ).toBe(false);
    });
  });
});
