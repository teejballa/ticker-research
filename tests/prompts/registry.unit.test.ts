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
import { renderPrompt } from '@/lib/prompts/render';
import { PromptVarMissingError } from '@/lib/prompts/render';

describe('registry — getPrompt + listPrompts contract', () => {
  it('getPrompt("gemini-research-brief-system") returns the latest non-deprecated version (v2), non-empty template, deprecated_at:null', () => {
    const p = getPrompt('gemini-research-brief-system');
    expect(p.id).toBe('gemini-research-brief-system');
    expect(p.version).toBe('v2');
    expect(p.template.length).toBeGreaterThan(0);
    expect(p.deprecated_at).toBeNull();
    expect(Array.isArray(p.variables)).toBe(true);
  });

  it('getPrompt("gemini-research-brief-system", "v1") returns the deprecated historical pin (not the default)', () => {
    const def = getPrompt('gemini-research-brief-system');
    const v1 = getPrompt('gemini-research-brief-system', 'v1');
    expect(def.version).toBe('v2');
    expect(v1.version).toBe('v1');
    expect(v1.deprecated_at).not.toBeNull();
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

  it('listPrompts() returns ≥10 tuples (8 PromptIds × v1 + 1 extra cove-pass1 v2 + 20-B-01 per-doc)', () => {
    const entries = listPrompts();
    expect(entries.length).toBeGreaterThanOrEqual(10);
  });

  // ── Plan 20-B-01 — gemini-per-doc-sentiment registration ────────────────
  it('getPrompt("gemini-per-doc-sentiment") returns RegisteredPrompt with version v1, non-empty template, deprecated_at:null', () => {
    const p = getPrompt('gemini-per-doc-sentiment');
    expect(p.id).toBe('gemini-per-doc-sentiment');
    expect(p.version).toBe('v1');
    expect(p.template.length).toBeGreaterThan(0);
    expect(p.deprecated_at).toBeNull();
    expect([...p.variables]).toEqual(['docs_json']);
  });

  it('getPrompt("gemini-per-doc-sentiment","v1") body contains the literal OFF-TOPIC CLAUSE and all 7 aspect names', () => {
    const p = getPrompt('gemini-per-doc-sentiment', 'v1');
    expect(p.template).toContain('OFF-TOPIC CLAUSE');
    for (const aspect of ['earnings', 'guidance', 'regulatory', 'M&A', 'macro', 'product', 'management']) {
      expect(p.template).toContain(aspect);
    }
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
      'gemini-per-doc-sentiment',
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

  // ── Plan 20-D-05 — disclaimer-footer + price-target-hedge registration ─────
  it('getPrompt("disclaimer-footer") returns RegisteredPrompt with version v1, variables: [data_as_of_timestamp], non-empty template, deprecated_at:null', () => {
    const p = getPrompt('disclaimer-footer');
    expect(p.id).toBe('disclaimer-footer');
    expect(p.version).toBe('v1');
    expect(p.template.length).toBeGreaterThan(0);
    expect(p.deprecated_at).toBeNull();
    expect([...p.variables]).toEqual(['data_as_of_timestamp']);
  });

  it('getPrompt("price-target-hedge") returns RegisteredPrompt with version v1, variables: [data_as_of_timestamp, ci_band_or_implied_range]', () => {
    const p = getPrompt('price-target-hedge');
    expect(p.id).toBe('price-target-hedge');
    expect(p.version).toBe('v1');
    expect(p.template.length).toBeGreaterThan(0);
    expect(p.deprecated_at).toBeNull();
    expect([...p.variables]).toEqual(['data_as_of_timestamp', 'ci_band_or_implied_range']);
  });

  it('renderPrompt("disclaimer-footer", { data_as_of_timestamp }) substitutes the placeholder', () => {
    const out = renderPrompt('disclaimer-footer', { data_as_of_timestamp: '2026-05-11' });
    expect(out).toContain('as of 2026-05-11');
    expect(out).toContain('educational purposes only');
    expect(out).not.toContain('{{');
  });

  it('renderPrompt("price-target-hedge", ...) substitutes both placeholders', () => {
    const out = renderPrompt('price-target-hedge', {
      data_as_of_timestamp: '2026-05-11',
      ci_band_or_implied_range: '± $5.20 (95% CI)',
    });
    expect(out).toContain('as of 2026-05-11');
    expect(out).toContain('± $5.20 (95% CI)');
    expect(out).not.toContain('{{');
  });

  it('renderPrompt("disclaimer-footer", {}) throws PromptVarMissingError', () => {
    expect(() => renderPrompt('disclaimer-footer', {})).toThrowError(PromptVarMissingError);
  });

  it('listPrompts() includes both new (id, version) tuples for 20-D-05', () => {
    const ids = listPrompts().map((e) => `${e.id}@${e.version}`);
    expect(ids).toContain('disclaimer-footer@v1');
    expect(ids).toContain('price-target-hedge@v1');
  });
});
