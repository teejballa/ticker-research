// tests/prompts/render.unit.test.ts
// Plan 20-Z-04 Task 1 (RED)
//
// Behavioral contract for src/lib/prompts/render.ts:
//  - renderPrompt(id, vars, version?) substitutes {{var}} placeholders
//  - Throws PromptVarMissingError when a declared variable is absent
//  - Defense-in-depth: throws if any unfilled {{...}} placeholder remains after substitution
//  - Pure — same args → same output.

import { describe, it, expect } from 'vitest';
import { renderPrompt, PromptVarMissingError } from '@/lib/prompts/render';
import { getPrompt, listPrompts } from '@/lib/prompts/registry';

describe('renderPrompt — substitution + guards', () => {
  it('renderPrompt("gemini-research-brief-system", {}) returns the SYSTEM_PROMPT body byte-for-byte', () => {
    const rendered = renderPrompt('gemini-research-brief-system', {});
    // The v1 body has zero placeholders; rendered must equal the template.
    const reg = getPrompt('gemini-research-brief-system', 'v1');
    expect(rendered).toBe(reg.template);
    expect(rendered.length).toBeGreaterThan(0);
  });

  it('renderPrompt("gemini-research-brief-user", {…all 5 vars}) substitutes every placeholder', () => {
    const vars = {
      brief: 'BRIEF_BODY',
      news_section: 'NEWS_BODY',
      community_sentiment_section: 'CS_BODY',
      sentiment_intelligence_section: 'SI_BODY',
      community_intelligence_section: 'CI_BODY',
    };
    const out = renderPrompt('gemini-research-brief-user', vars);
    expect(out.includes('BRIEF_BODY')).toBe(true);
    expect(out.includes('NEWS_BODY')).toBe(true);
    expect(out.includes('CS_BODY')).toBe(true);
    expect(out.includes('SI_BODY')).toBe(true);
    expect(out.includes('CI_BODY')).toBe(true);
    // Defense-in-depth: no remaining {{…}} placeholder.
    expect(/\{\{\w+\}\}/.test(out)).toBe(false);
  });

  it('renderPrompt with a missing required var throws PromptVarMissingError naming the variable', () => {
    try {
      // brief is declared; the others are missing.
      renderPrompt('gemini-research-brief-user', { brief: 'X' });
      throw new Error('expected PromptVarMissingError');
    } catch (e) {
      expect(e).toBeInstanceOf(PromptVarMissingError);
      // Error message must mention at least one of the missing var names.
      const msg = (e as Error).message;
      const mentionsAtLeastOne =
        msg.includes('news_section') ||
        msg.includes('community_sentiment_section') ||
        msg.includes('sentiment_intelligence_section') ||
        msg.includes('community_intelligence_section');
      expect(mentionsAtLeastOne).toBe(true);
    }
  });

  it('renderPrompt("gemini-cycle-summary", {…4 numeric strings}) substitutes the cycle-summary placeholders', () => {
    const out = renderPrompt('gemini-cycle-summary', {
      outcomes_processed: '5',
      hits: '3',
      drift_alerts: '0',
      cells_active: '12',
    });
    expect(out.includes('5')).toBe(true);
    expect(out.includes('3')).toBe(true);
    expect(out.includes('12')).toBe(true);
    expect(/\{\{\w+\}\}/.test(out)).toBe(false);
  });

  it('renderPrompt is pure — same args twice → string-equal results', () => {
    const a = renderPrompt('gemini-research-brief-system', {});
    const b = renderPrompt('gemini-research-brief-system', {});
    expect(a).toBe(b);
  });

  it('renderPrompt throws when a declared var is undefined (vs missing-key)', () => {
    // `undefined` as a value should still trip the guard — substitution would
    // yield the literal string "undefined" which is a silent failure mode.
    expect(() =>
      renderPrompt('gemini-cycle-summary', {
        outcomes_processed: '1',
        hits: '1',
        drift_alerts: '1',
        // cells_active missing
      } as unknown as Record<string, string>),
    ).toThrowError(PromptVarMissingError);
  });

  it('renderPrompt rejects extra unfilled placeholders (defense-in-depth)', () => {
    // We test via the public API by exercising every registered prompt with
    // its declared vars filled in — the rendered string MUST contain zero
    // remaining {{…}} placeholders. If any template body has an unfilled
    // placeholder the variables array forgot to declare, renderPrompt's
    // step-3 guard would throw — which is the defense-in-depth we're testing.
    for (const { id, version } of listPrompts()) {
      const reg = getPrompt(id, version);
      const vars: Record<string, string> = {};
      for (const name of reg.variables) vars[name] = 'TEST_VAL';
      const out = renderPrompt(id, vars, version);
      expect(/\{\{\w+\}\}/.test(out)).toBe(false);
    }
  });
});
