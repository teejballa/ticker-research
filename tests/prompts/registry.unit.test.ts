// tests/prompts/registry.unit.test.ts
// Plan 20-Z-04 Task 1 (RED) + Task 5 (extension)
//
// Behavioral contract for src/lib/prompts/registry.ts:
//  - getPrompt(id, version?) — exact lookup, default to latest non-deprecated
//  - listPrompts() — sorted (id ASC, version ASC) tuples
//  - PromptUnknownIdError / PromptVersionUnknownError thrown on misuse
//
// These tests are RED until Task 2 lands the registry.

import { describe, it, expect } from 'vitest';
import {
  getPrompt,
  listPrompts,
  PromptUnknownIdError,
  PromptVersionUnknownError,
  type PromptId,
  type PromptVersion,
} from '@/lib/prompts/registry';

describe('registry — getPrompt + listPrompts contract', () => {
  it('getPrompt("gemini-research-brief-system") returns RegisteredPrompt with version v1, non-empty template, deprecated_at:null', () => {
    const p = getPrompt('gemini-research-brief-system');
    expect(p.id).toBe('gemini-research-brief-system');
    expect(p.version).toBe('v1');
    expect(p.template.length).toBeGreaterThan(0);
    expect(p.deprecated_at).toBeNull();
    expect(Array.isArray(p.variables)).toBe(true);
  });

  it('getPrompt("gemini-research-brief-system", "v1") returns the same RegisteredPrompt as default', () => {
    const def = getPrompt('gemini-research-brief-system');
    const v1 = getPrompt('gemini-research-brief-system', 'v1');
    expect(v1).toEqual(def);
  });

  it('getPrompt("gemini-cove-pass1-instruction") returns v2 (latest non-deprecated)', () => {
    const p = getPrompt('gemini-cove-pass1-instruction');
    expect(p.version).toBe('v2');
  });

  it('getPrompt("gemini-cove-pass1-instruction", "v1") returns v1 explicitly (historical pin)', () => {
    const p = getPrompt('gemini-cove-pass1-instruction', 'v1');
    expect(p.version).toBe('v1');
    expect(p.id).toBe('gemini-cove-pass1-instruction');
  });

  it('getPrompt("gemini-cove-pass1-instruction", "v2") returns v2 explicitly', () => {
    const p = getPrompt('gemini-cove-pass1-instruction', 'v2');
    expect(p.version).toBe('v2');
    expect(p.id).toBe('gemini-cove-pass1-instruction');
  });

  it('getPrompt with an unknown id throws PromptUnknownIdError', () => {
    expect(() =>
      getPrompt('this-id-does-not-exist' as unknown as PromptId),
    ).toThrowError(PromptUnknownIdError);
  });

  it('getPrompt with a known id but unknown version throws PromptVersionUnknownError', () => {
    expect(() =>
      getPrompt('gemini-research-brief-system', 'v99' as PromptVersion),
    ).toThrowError(PromptVersionUnknownError);
  });

  it('listPrompts() returns ≥9 tuples (8 PromptIds × v1 + 1 extra cove-pass1 v2)', () => {
    const entries = listPrompts();
    expect(entries.length).toBeGreaterThanOrEqual(9);
  });

  it('listPrompts() entries are sorted by id ASC then version ASC', () => {
    const entries = listPrompts();
    for (let i = 1; i < entries.length; i++) {
      const prev = entries[i - 1];
      const cur = entries[i];
      const prevKey = `${prev.id}@${prev.version.padStart(5, '0')}`;
      const curKey = `${cur.id}@${cur.version.padStart(5, '0')}`;
      // Compare id first, then version numerically.
      if (prev.id === cur.id) {
        const prevNum = parseInt(prev.version.slice(1), 10);
        const curNum = parseInt(cur.version.slice(1), 10);
        expect(prevNum).toBeLessThanOrEqual(curNum);
      } else {
        expect(prev.id < cur.id || prev.id === cur.id).toBe(true);
        expect(prevKey <= curKey).toBe(true);
      }
    }
  });

  it('every PromptId in the union appears at least once in listPrompts() (closure guard)', () => {
    const expected: PromptId[] = [
      'gemini-research-brief-system',
      'gemini-research-brief-user',
      'gemini-engine-context-block-no-data',
      'gemini-engine-context-block-active',
      'gemini-technical-context-block',
      'gemini-smart-money-context-block',
      'gemini-cove-pass1-instruction',
      'gemini-citations-section',
      'gemini-cycle-summary',
    ];
    const seen = new Set(listPrompts().map((e) => e.id));
    for (const id of expected) {
      expect(seen.has(id), `PromptId ${id} missing from listPrompts()`).toBe(true);
    }
  });

  it('every (id, version) tuple is loadable via getPrompt(id, version)', () => {
    for (const { id, version } of listPrompts()) {
      const p = getPrompt(id, version);
      expect(p.id).toBe(id);
      expect(p.version).toBe(version);
      expect(typeof p.template).toBe('string');
      expect(p.template.length).toBeGreaterThan(0);
    }
  });

  it('every RegisteredPrompt has a non-empty description and an ISO-8601 created_at', () => {
    for (const { id, version } of listPrompts()) {
      const p = getPrompt(id, version);
      expect(p.description.length).toBeGreaterThan(0);
      // ISO-8601 datetime — minimum YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ
      expect(p.created_at).toMatch(/^\d{4}-\d{2}-\d{2}/);
    }
  });
});
