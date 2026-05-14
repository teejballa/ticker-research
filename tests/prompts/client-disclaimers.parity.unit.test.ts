// tests/prompts/client-disclaimers.parity.unit.test.ts
//
// Asserts the client-safe disclaimer constants in
// src/lib/prompts/client-disclaimers.ts stay byte-identical to the
// source-of-truth markdown bodies in src/lib/prompts/_v1/. Drift causes
// the test to fail, forcing the next editor to either:
//   (a) revert the client constant, OR
//   (b) bump the .md to _v2/ AND update the client constant in lock-step.
//
// This is the bridge that keeps the S5 "pinned prompt versions" guarantee
// despite the client/server bundle-boundary workaround.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DISCLAIMER_FOOTER_V1_BODY,
  PRICE_TARGET_HEDGE_V1_BODY,
} from '@/lib/prompts/client-disclaimers';

function loadMdBody(name: string): string {
  const filepath = join(process.cwd(), 'src', 'lib', 'prompts', '_v1', `${name}.md`);
  const raw = readFileSync(filepath, 'utf-8');
  // Strip frontmatter: ---\n...\n---\n then body up to optional trailing ---\n.
  const body = raw.replace(/^---\n[\s\S]*?\n---\n/, '');
  // Trim trailing whitespace + optional closing --- separator the .md uses.
  return body.replace(/\n---\s*$/, '').trim();
}

describe('client-disclaimers parity with _v1 markdown', () => {
  it('disclaimer-footer-v1 body matches', () => {
    expect(DISCLAIMER_FOOTER_V1_BODY).toBe(loadMdBody('disclaimer-footer'));
  });

  it('price-target-hedge-v1 body matches', () => {
    expect(PRICE_TARGET_HEDGE_V1_BODY).toBe(loadMdBody('price-target-hedge'));
  });
});
