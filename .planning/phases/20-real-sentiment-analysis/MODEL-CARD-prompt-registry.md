---
model_name: prompt-registry
model_version: v1
card_format: mitchell-2019-extended
last_validated: 2026-05-11
retrain_cadence: N/A
author: Plan 20-Z-04
source_files:
  - src/lib/prompts/registry.ts
  - src/lib/prompts/render.ts
  - src/lib/prompts/_manifest.ts
  - src/lib/prompts/_v1/*.md
  - src/lib/prompts/_v2/*.md
---

# Model Card — Prompt Registry (Plan 20-Z-04)

Mitchell-2019 model card per CONTEXT.md §S4. The prompt registry is a
**versioned reasoning artifact**, not a trained model — but it carries the
same "what is this thing, what is it good for, where can it fail" surface
because every Gemini prompt in the system flows through it.

## 1. Component

`src/lib/prompts/` — closed `PromptId` union + `RegisteredPrompt` shape +
`getPrompt(id, version?)` + `renderPrompt(id, vars, version?)`.

The bodies live as YAML-frontmatter markdown files under
`src/lib/prompts/_vN/<id>.md`. `_manifest.ts` parses them at module load and
exposes a `ReadonlyArray<RegisteredPrompt>` that `registry.ts` consumes.

## 2. Versions tracked (at commit time)

| PromptId | Versions | Latest non-deprecated |
|----------|----------|-----------------------|
| gemini-research-brief-system | v1 | v1 |
| gemini-research-brief-user | v1 | v1 |
| gemini-engine-context-block-no-data | v1 | v1 |
| gemini-engine-context-block-active | v1 | v1 |
| gemini-technical-context-block | v1 | v1 |
| gemini-smart-money-context-block | v1 | v1 |
| gemini-cove-pass1-instruction | v1, v2 | v2 |
| gemini-citations-section | v1 | v1 |
| gemini-cycle-summary | v1 | v1 |

10 tuples total. `listPrompts()` returns them sorted by `(id ASC, version ASC)`.

## 3. Intended use

Deterministic, version-pinned prompt rendering for every Gemini call site
in Cipher. The (id, version) tuple is the version-pinning surface area that:

- **20-Z-05 (eval harness — out of scope here)** will consume to compare
  baseline-vs-candidate prompts via LLM-as-judge on numeric-grounding,
  citation-coverage, narrative coherence, hedging quality, and
  contradiction-handling metrics.
- **20-Z-06 (composite Phase-20 done gate)** will consume by wiring
  `npm run check-prompts` as one of its 4 gate branches.
- **20-D-01 (numeric grounding test)** will consume by pinning the prompt
  version under which a regression baseline was recorded.

The live call sites currently pin to:

| Call site | Pinned to |
|-----------|-----------|
| `src/lib/gemini-analysis.ts` SYSTEM_PROMPT | default (latest, = v1) |
| `src/lib/gemini-analysis.ts` buildUserPrompt | default (latest, = v1) |
| `src/lib/gemini-analysis.ts` buildEngineContextBlock NO_DATA | default |
| `src/lib/gemini-analysis.ts` buildEngineContextBlock ACTIVE | default |
| `src/lib/gemini-analysis.ts` buildTechnicalContextBlock | default |
| `src/lib/gemini-analysis.ts` buildSmartMoneyContextBlock | default |
| `src/lib/gemini-analysis.ts` CoVe Pass-1 instruction | **'v1' explicit** (TODO 20-Z-05) |
| `src/lib/research-brief.ts` renderCitationsSection | default |
| `src/app/api/cron/learn/route.ts` cycle summary | default |

The cove-pass1 instruction is the one prompt with both v1 and v2 registered.
The call site pins v1 explicitly until 20-Z-05's eval harness confirms v2
is a non-regression on numeric-grounding metrics. Per CONTEXT §S5 this is
the intentional shape — version pins are operator decisions, not silent
upgrades.

## 4. Training data

N/A — prompts are hand-authored. The v1 bodies were extracted byte-for-byte
from the pre-Task-3 inline literals in `src/lib/gemini-analysis.ts`,
`src/lib/research-brief.ts`, and `src/app/api/cron/learn/route.ts`. The v2
body for `gemini-cove-pass1-instruction` is a deliberate
prompt-engineering tweak that prefers numeric-grounded verification claims.

## 5. Evaluation metrics

- **Bit-identical migration proof**: `tests/prompts/byte-equality.unit.test.ts`
  asserts every refactored call site produces output identical to a verbatim
  legacy reference implementation across 7 combinatoric scenarios for
  `buildUserPrompt`, the NO_DATA + ACTIVE + null-fields cases for
  `buildEngineContextBlock`, the with-data + empty-horizon + null-fields cases
  for `buildTechnicalContextBlock`, the full + institutional-only + insider-only
  + both-NO_DATA cases for `buildSmartMoneyContextBlock`, and the
  citations + cove-pass1 + cycle-summary inline literals. 26 byte-equality
  assertions, all GREEN at commit.
- **Coverage of registered prompts**: `tests/prompts/integration.smoke.test.ts`
  renders every (id, version) tuple with `TEST_VAL` fixtures and asserts no
  unfilled `{{…}}` remains, every output ≥50 chars. 10 / 10 GREEN.
- **Golden snapshot**: `tests/prompts/registry.golden.test.ts` snapshots
  every (id, version) body + variables + description. Any drift fails CI.

## 6. Out-of-distribution behavior

- Unknown PromptId → `PromptUnknownIdError` (subclass of `Error`, `name` tagged).
- Unknown PromptVersion → `PromptVersionUnknownError`.
- Missing required variable → `PromptVarMissingError`.
- Defense-in-depth — if a registered template body has an undeclared `{{var}}`
  that renders without substitution, the post-render scan in `render.ts`
  throws `PromptVarMissingError` with a clear "unfilled placeholder" message.
  T-20-Z-04-03 mitigation.

## 7. Ethical considerations

- **Hand-authored prompts can carry the author's biases into model output**.
  The v1 bodies are inherited from pre-Phase-20 work and have NOT been
  audited for fairness across cap-class / sector / geography. 20-C-06
  (Phase 20) will run a stratified Brier + ECE audit on the rendered Gemini
  output; any segment with poor calibration will be documented in this
  card under §10 (Known failure modes).
- **No PII in prompts** — bodies are static instruction strings; per-request
  data flows through declared `variables` which the rendering layer
  asserts are filled before sending to the model.

## 8. Caveats and recommendations

- The registry covers ONLY the Gemini call sites that route through the
  Vercel AI Gateway's `generateText` / `generateObject`. The Anthropic SDK
  direct call sites (5 enumerated in 20-Z-04-PLAN.md OUT OF SCOPE) — namely
  `src/lib/gemini-analysis.ts:387, 405, 503`, `src/lib/data/anthropic-search.ts`,
  `src/lib/data/security-type.ts` — are NOT yet covered. A follow-up plan
  will extend the registry to Anthropic SDK call sites with the same
  `getPrompt`/`renderPrompt` API + additional PromptIds (e.g.
  `anthropic-community-discovery-niche`, `anthropic-community-extraction`,
  `anthropic-web-search-*`, `anthropic-security-type-classify`).

## 9. Quantitative analyses

- **Migration completeness**: `grep -c 'You are a senior equity research analyst' src/` → 1
  (only `_v1/gemini-research-brief-system.md`).
- **Migration completeness — Pass-1 CoVe**: `grep -c 'CHAIN-OF-VERIFICATION (Pass 1)'
  src/lib/gemini-analysis.ts` → 0 (literal deleted; lives only in the v1 + v2 md files).
- **Call-site renderPrompt() counts**: gemini-analysis.ts → 8, research-brief.ts → 1,
  cron/learn/route.ts → 1 (sum 10 / minimum 5 required).
- **Test suite GREEN at commit**: 852 unit tests pass; 0 fail; 1 skipped; 3 todo
  (the 1 skipped is the pre-existing container-server-auth.test.ts which is
  unrelated to this plan).

## 10. Out-of-distribution / Known failure modes

| Failure mode | Detection | Mitigation |
|--------------|-----------|------------|
| Silent prompt drift — body edited without bumping | golden snapshot test | T-20-Z-04-01: snapshot diff fails build; check-prompt-versions.ts script flags missing _v(N+1)/ in PR diff |
| Vanity bumps — whitespace-only new version | (informational) | T-20-Z-04-02 accepted: check-prompt-versions.ts emits warning, eval harness in 20-Z-05 surfaces no-op metric deltas as natural deterrent |
| Prompt injection via unfilled {{var}} | render.ts pre-substitution check + post-render scan | T-20-Z-04-03: PromptVarMissingError thrown; defense-in-depth post-render placeholder scan also throws |
| Stale literals not migrated | grep gate on critical phrases + CI script | T-20-Z-04-04: cleanup gates #5 + #6; CI script asserts renderPrompt() present alongside generateText/generateObject in migrated files |
| Bundler strips _v*/<id>.md from server runtime | `_manifest.ts` reads at module load via `fs.readFileSync` + `outputFileTracingRoot` set in next.config.ts | First production deploy verifies module load; integration smoke test (Task 7) also runs all renders |
| Anthropic-SDK direct call sites uncovered | grep audit | follow-up plan extends registry to Anthropic SDK |

## 11. Retrain cadence

N/A — this is a versioned artifact registry, not a trained model. Version
cadence is per-prompt and operator-driven:

- A new (id, version) is created **only** when:
  - A prompt-engineering improvement is proposed AND
  - The proposing PR also adds the new `_v(N+1)/<id>.md` file AND
  - The golden snapshot is updated via `npx vitest -u` AND
  - 20-Z-05 (when shipped) confirms the new version is a non-regression on
    numeric-grounding + citation-coverage.
- Deprecation: set `deprecated_at: <ISO-datetime>` in the frontmatter. The
  default `getPrompt(id)` lookup will skip deprecated versions. Historical
  pins (`getPrompt(id, 'v1')`) continue to resolve until the file is
  removed in a future hard-deprecation sweep.

## 12. Linked plans

- **Implements**: 20-Z-04
- **Depends on**: 20-Z-02 (model-card template + check-model-cards CI guard)
- **Consumed by**: 20-Z-05 (eval harness), 20-Z-06 (composite done gate), 20-D-01 (numeric grounding test)
- **Threats mitigated**: T-20-Z-04-01 / 02 / 03 / 04 (this plan's local
  threat model); T-28-014 (phase-level: prompt change breaks downstream reports).
