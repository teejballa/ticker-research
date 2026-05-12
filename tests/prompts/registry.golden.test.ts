// tests/prompts/registry.golden.test.ts
//
// Plan 20-Z-04 Task 4 — Golden snapshot of every registered (id, version) tuple.
//
// FAILURE MODE
// ────────────
// If this test fails, you changed a prompt body (or its variables array, or its
// description) without bumping its version. Either:
//   (a) revert the body change, OR
//   (b) create `src/lib/prompts/_v(N+1)/<id>.md` with the new body, and accept
//       the snapshot diff with `npx vitest -u tests/prompts/registry.golden.test.ts`.
//
// The (b) path also requires `scripts/check-prompt-versions.ts` to pass — that
// script enforces that any non-whitespace diff under `_vN/<id>.md` has a sibling
// `_v(N+1)/<id>.md` in the same PR diff. CI (.github/workflows/prompts.yml) runs
// both gates on every PR touching src/lib/prompts/**.
//
// This is the T-20-Z-04-01 mitigation: silent prompt drift is structurally
// blocked by the golden snapshot diff PLUS the CI grep gate.

import { describe, it, expect } from 'vitest';
import { getPrompt, listPrompts } from '@/lib/prompts/registry';

describe('registry — golden snapshot of every (id, version) tuple', () => {
  for (const { id, version } of listPrompts()) {
    it(`golden snapshot: ${id}@${version}`, () => {
      const p = getPrompt(id, version);
      // Snapshot the body + variables + description. created_at / deprecated_at
      // are excluded because they are operational metadata (created_at is
      // append-only, deprecated_at can change over time) — drift in either
      // does not change the rendered prompt and is intentionally outside the
      // snapshot's scope.
      expect({
        id: p.id,
        version: p.version,
        template: p.template,
        variables: [...p.variables],
        description: p.description,
      }).toMatchSnapshot();
    });
  }
});
