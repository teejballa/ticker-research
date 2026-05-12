// tests/prompts/integration.smoke.test.ts
//
// Plan 20-Z-04 Task 7 — integration smoke test for the prompt registry.
//
// Iterates every (id, version) tuple in listPrompts() and renders it with
// placeholder values for every declared variable. Asserts:
//   1. Returned string is non-empty
//   2. No `{{…}}` placeholder remains in rendered output
//   3. Rendered length ≥ 50 chars (sanity check — catches empty-template-file
//      class of bug)
//
// This is the "render every registered prompt with mock vars" check from
// the plan's <must_include_in_plan> §4.

import { describe, it, expect } from 'vitest';
import { renderPrompt } from '@/lib/prompts/render';
import { getPrompt, listPrompts } from '@/lib/prompts/registry';

describe('integration smoke — every registered prompt renders cleanly', () => {
  for (const { id, version } of listPrompts()) {
    it(`smoke renders: ${id}@${version}`, () => {
      const reg = getPrompt(id, version);
      const vars: Record<string, string> = {};
      for (const name of reg.variables) vars[name] = `TEST_${name.toUpperCase()}`;

      const out = renderPrompt(id, vars, version);

      expect(out.length).toBeGreaterThanOrEqual(50);
      expect(/\{\{\w+\}\}/.test(out), `unfilled placeholder in ${id}@${version}`).toBe(false);
      // Each declared variable's TEST_ marker must appear in the output —
      // proves the substitution actually fired (not a no-op due to wrong
      // placeholder names).
      for (const name of reg.variables) {
        expect(
          out.includes(`TEST_${name.toUpperCase()}`),
          `var ${name} not substituted into ${id}@${version}`,
        ).toBe(true);
      }
    });
  }

  it('listPrompts() exposes at least 9 tuples', () => {
    expect(listPrompts().length).toBeGreaterThanOrEqual(9);
  });

  it('every PromptId in the union has at least one registered version', () => {
    const ids = new Set<string>(listPrompts().map((p) => p.id));
    const expected: string[] = [
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
    for (const id of expected) expect(ids.has(id), `missing ${id}`).toBe(true);
  });
});
