// src/lib/prompts/registry.ts
// Plan 20-Z-04 — Versioned prompt registry.
//
// Every Gemini prompt in the Cipher codebase is a (PromptId, PromptVersion)
// tuple. The bodies live as authoritative markdown files under
// src/lib/prompts/_vN/<id>.md with YAML frontmatter declaring variables.
// `_manifest.ts` imports each .md as raw text and parses it into a
// `RegisteredPrompt`. This module exposes `getPrompt` and `listPrompts`
// over that manifest.
//
// CONTEXT §S5 (pinned model + prompt versions): the (id, version) tuple is
// the version-pinning surface area that 20-Z-05's eval harness consumes.
//
// Threat-model:
//  - T-20-Z-04-01 silent prompt drift — bodies are snapshotted by
//    tests/prompts/registry.golden.test.ts; CI gate at
//    scripts/check-prompt-versions.ts diff-checks against main.
//  - T-20-Z-04-03 prompt injection via unfilled vars — render.ts declares
//    required variables and post-render scans for residual {{...}}.
//  - T-20-Z-04-04 stale literal leftovers — Hard-Cleanup-Gate #5/#6 + CI
//    grep gate (a follow-up extension to check-telemetry-coverage pattern).

import { REGISTERED_PROMPTS } from './_manifest';

/** Closed union — adding a new Gemini prompt MUST extend this union. */
export type PromptId =
  | 'gemini-research-brief-system'
  | 'gemini-research-brief-user'
  // engine-context-block was split into two PromptIds — the NO_DATA branch and
  // the ACTIVE branch have substantially different bodies and very different
  // variables (NO_DATA carries only cycle_count; ACTIVE carries 11 fields).
  // Splitting keeps each template clean and the variable list honest.
  | 'gemini-engine-context-block-no-data'
  | 'gemini-engine-context-block-active'
  | 'gemini-technical-context-block'
  | 'gemini-smart-money-context-block'
  | 'gemini-cove-pass1-instruction'
  | 'gemini-citations-section'
  | 'gemini-cycle-summary'
  // Plan 20-Z-05 — LLM-as-judge rubric for baseline-vs-candidate evals.
  // The body lives at src/lib/prompts/_v1/eval-judge-v1.md. Loaded by
  // src/lib/eval/judge.ts via getPrompt('eval-judge-v1', 'v1').
  | 'eval-judge-v1'
  // Plan 20-D-02 — LLM-judge qualitative-claim extractor for citation
  // coverage. Body at src/lib/prompts/_v1/eval-claim-extraction-v1.md.
  // Loaded by src/lib/eval/claim-extraction-llm.ts via
  // getPrompt('eval-claim-extraction-v1', 'v1').
  | 'eval-claim-extraction-v1'
  // Plan 20-B-01 — per-document sentiment + aspect classifier (cheap path,
  // Wave B baseline). Body at src/lib/prompts/_v1/gemini-per-doc-sentiment.md.
  // Loaded by classifyDocumentsBatch via renderPrompt('gemini-per-doc-sentiment').
  | 'gemini-per-doc-sentiment';

/** Template literal type — vN where N is a positive integer.
 *  Capped at v99 to keep the union finite for IDE autocomplete. */
export type PromptVersion =
  | `v${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`
  | `v${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`;

export interface RegisteredPrompt {
  id: PromptId;
  version: PromptVersion;
  /** Body of the prompt with {{var}} placeholders. */
  template: string;
  /** Declared required variables — render.ts asserts these are present. */
  variables: readonly string[];
  description: string;
  /** ISO-8601 datetime — when this version was created. */
  created_at: string;
  /** ISO-8601 datetime or null if active. */
  deprecated_at: string | null;
}

// ── Error classes ───────────────────────────────────────────────────────────
//
// Tag each error with `name` so `vitest.toThrowError(SubclassedError)` matches
// when the error is rethrown across module boundaries.

export class PromptUnknownIdError extends Error {
  constructor(id: string) {
    super(`Unknown PromptId: '${id}'. Add it to the PromptId union in src/lib/prompts/registry.ts and register a v1 body under src/lib/prompts/_v1/.`);
    this.name = 'PromptUnknownIdError';
  }
}

export class PromptVersionUnknownError extends Error {
  constructor(id: string, version: string, known: string[]) {
    super(`Unknown PromptVersion '${version}' for id '${id}'. Known versions: [${known.join(', ')}]`);
    this.name = 'PromptVersionUnknownError';
  }
}

// ── Internal lookup map ─────────────────────────────────────────────────────

const KEY = (id: PromptId | string, version: PromptVersion | string): string =>
  `${id}@${version}`;

const VERSION_NUM = (v: PromptVersion | string): number =>
  parseInt(v.slice(1), 10);

const REGISTRY_MAP: ReadonlyMap<string, RegisteredPrompt> = new Map(
  REGISTERED_PROMPTS.map((p) => [KEY(p.id, p.version), p]),
);

// Index by id → versions present, for default-lookup fall-through.
const BY_ID: ReadonlyMap<PromptId, RegisteredPrompt[]> = (() => {
  const m = new Map<PromptId, RegisteredPrompt[]>();
  for (const p of REGISTERED_PROMPTS) {
    const arr = m.get(p.id) ?? [];
    arr.push(p);
    m.set(p.id, arr);
  }
  return m;
})();

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Returns the registered prompt. When `version` is omitted, defaults to the
 * highest version number with deprecated_at === null.
 *
 * Throws PromptUnknownIdError if the id is not registered.
 * Throws PromptVersionUnknownError if (id, version) is not registered.
 */
export function getPrompt(id: PromptId, version?: PromptVersion): RegisteredPrompt {
  const entries = BY_ID.get(id);
  if (!entries || entries.length === 0) {
    throw new PromptUnknownIdError(id);
  }

  if (version != null) {
    const p = REGISTRY_MAP.get(KEY(id, version));
    if (!p) {
      const known = entries.map((e) => e.version);
      throw new PromptVersionUnknownError(id, version, known);
    }
    return p;
  }

  // Default — highest version number among non-deprecated entries.
  const active = entries.filter((p) => p.deprecated_at === null);
  if (active.length === 0) {
    // All deprecated — fall back to highest version overall (still loadable),
    // so historical pins keep working even after a full deprecation sweep.
    const sorted = [...entries].sort((a, b) => VERSION_NUM(b.version) - VERSION_NUM(a.version));
    return sorted[0];
  }
  const sorted = [...active].sort((a, b) => VERSION_NUM(b.version) - VERSION_NUM(a.version));
  return sorted[0];
}

/**
 * Returns every registered (id, version) tuple, sorted by (id ASC, version ASC).
 * Used by the golden snapshot test (registry.golden.test.ts) and by the
 * integration smoke test (integration.smoke.test.ts) to iterate the registry.
 */
export function listPrompts(): ReadonlyArray<{ id: PromptId; version: PromptVersion }> {
  return [...REGISTERED_PROMPTS]
    .map((p) => ({ id: p.id, version: p.version }))
    .sort((a, b) => {
      if (a.id < b.id) return -1;
      if (a.id > b.id) return 1;
      return VERSION_NUM(a.version) - VERSION_NUM(b.version);
    });
}
