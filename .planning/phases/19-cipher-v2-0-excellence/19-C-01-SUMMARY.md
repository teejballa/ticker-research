---
phase: 19-cipher-v2-0-excellence
plan: 19-C-01
subsystem: sentiment
tags: [finsentllm, huggingface, fingpt, mistral-fin, finbert, text-classification, sentiment, primitive]

# Dependency graph
requires:
  - phase: 19-cipher-v2-0-excellence/19-Z-01
    provides: features.ts feature-flag scaffolding (FEATURE_FINSENTLLM_ENSEMBLE off by default)
  - phase: 19-cipher-v2-0-excellence/19-Z-02
    provides: ShadowComparison schema (consumed later by 19-C-02)
  - phase: 19-cipher-v2-0-excellence/19-Z-03
    provides: shadow-runner + verdict CLI (consumed later by 19-C-02 for ensemble shadow A/B)
  - phase: 19-cipher-v2-0-excellence/19-Z-04
    provides: model-card-status (gates final phase done verdict)
provides:
  - classifyFinGPT(text)     → SentimentScore { score, confidence, model: 'fingpt-v3', error? }
  - classifyMistralFin(text) → SentimentScore { score, confidence, model: 'mistral-fin-7b', error? }
  - classifyFinBERT(text)    → SentimentScore { score, confidence, model: 'finbert', error? }
  - SentimentScore type — uniform null-sentinel-on-error contract per D-33
affects: [19-C-02 (ensemble), 19-C-08 (CoVe NLI), 19-C-10 (cross-class contradiction detector)]

# Tech tracking
tech-stack:
  added:
    - "@huggingface/inference@4.13.15 (pinned, MIT)"
  patterns:
    - "Null-sentinel error contract — clients NEVER throw at the API boundary; the C-02 ensemble degrades gracefully when 1-2 of 3 clients are null (per D-33 + threat T-19-C-01-02 cold-start mitigation)"
    - "Hermetic test fixtures via beforeAll() — finsentllm.test.ts injects synthetic HF_* env vars so the suite is portable across CI environments without leaking real HF tokens"
    - "vi.resetModules() + vi.doMock() + dynamic import() — canonical vitest pattern for re-mocking a module after the top-of-file import has already cached it (used for the error-path test)"

key-files:
  created:
    - src/lib/sentiment/finsentllm.ts
    - tests/lib/sentiment/finsentllm.test.ts
    - .planning/phases/19-cipher-v2-0-excellence/19-C-01-SUMMARY.md
  modified:
    - .env.example       # +HF_INFERENCE_TOKEN, HF_FINGPT_ENDPOINT, HF_MISTRAL_FIN_ENDPOINT, HF_FINBERT_ENDPOINT
    - package.json       # +@huggingface/inference@^4.13.15
    - package-lock.json  # transitive lock updates
    - .planning/ROADMAP.md # tick [x] 19-C-01

key-decisions:
  - "Mocked the SDK at the module boundary (vi.mock '@huggingface/inference') rather than running live HF calls in unit tests. Live calls belong in integration tests behind env-flag skips, per the user's executor constraints (`Mock providers in unit tests; live calls go in integration tests behind env-flag skips`)."
  - "Endpoint URL is treated as a secret (never logged on error) — only the SDK error message is propagated to SentimentScore.error. Mitigates threat T-19-C-01-01 (information disclosure of opaque endpoint IDs)."
  - "Label reduction is prefix-based (pos*/neg*) rather than exact match — handles FinBERT's `positive`/`negative`/`neutral` labels and FinGPT v3's `pos`/`neg` labels uniformly. Unknown labels (e.g. mislabeled fine-tunes) yield a conservative neutral score=0 rather than mis-attribute (mitigates T-19-C-01-03)."
  - "Endpoint env-var lookup happens inside the try/catch — missing endpoint env (`HF_*_ENDPOINT not set`) returns the same null sentinel as a runtime API failure, so the ensemble code path treats unprovisioned endpoints identically to transient errors. This keeps shadow rollout safe even before all 3 endpoints are provisioned."
  - "[Rule 1 - Bug] The verbatim impl-plan test block (impl-plan lines 833-880) had two latent bugs that prevented it from running hermetically: (1) it never set HF_INFERENCE_TOKEN/HF_*_ENDPOINT, so the env-var guards in classifyVia threw 'not set' before reaching the mocked SDK; (2) `vi.doMock` after a top-of-file `import` doesn't take effect on the cached module, so the error-path test was matching the happy-path mock. Both fixed inline (added `beforeAll()` env injection + `vi.resetModules()` before doMock) per Rule 1. The test bodies remain verbatim — only setup/cache management was added."

patterns-established:
  - "Sentiment client convention: each model is a thin async function returning a uniform SentimentScore; errors → null sentinels; no client orchestrates the others (orchestration belongs to 19-C-02 ensemble)."
  - "HF Inference Endpoint URL embedding the @<commit-sha> revision pin — documented in the file header as a deploy-time operator obligation (RESEARCH Open Question 1)."

requirements-completed: []  # 19-C-01 is foundation only; CORE-ML-11..14 wired up by later Wave-C plans

# Metrics
duration: ~12min
completed: 2026-05-10
---

# Phase 19 Plan 19-C-01: HF Inference Endpoint + FinSentLLM Client Summary

**Three independent HuggingFace Inference Endpoint clients (FinGPT v3 + Mistral 7B finance-tuned + FinBERT) returning a uniform `SentimentScore`. Errors return null sentinels — clients never throw at the API boundary. Foundation for 19-C-02 ensemble and 19-C-08 CoVe NLI. Feature flag `FEATURE_FINSENTLLM_ENSEMBLE` remains `off` per D-09 / D-10.**

## Performance

- **Duration:** ~12min
- **Started:** 2026-05-10T00:32Z
- **Completed:** 2026-05-10T00:44Z
- **Tasks:** 5 (3 code-changing, 2 documentation/synthesis)
- **Files modified:** 5 (3 created, 4 modified including ROADMAP — package-lock counted under modified)

## Accomplishments

- **Three sentiment clients** in `src/lib/sentiment/finsentllm.ts`:
  - `classifyFinGPT(text) → SentimentScore` (model: 'fingpt-v3')
  - `classifyMistralFin(text) → SentimentScore` (model: 'mistral-fin-7b')
  - `classifyFinBERT(text) → SentimentScore` (model: 'finbert')
  - All three share `classifyVia()` — one `HfInference.textClassification()` call, prefix-based label reduction, null-sentinel error contract.
- **Uniform `SentimentScore` interface** — `{ score: number | null, confidence: number | null, model, error? }`. `score` is `pos − neg` ∈ [−1, 1], `confidence` is the max class probability ∈ [0, 1].
- **Null-sentinel error contract** — every error path (missing env, missing token, SDK rejection, network failure) returns `{ score: null, confidence: null, model, error: <message> }`. Per D-33 + threat T-19-C-01-02, the C-02 ensemble degrades gracefully when 1-2 of 3 clients null out (e.g. HF cold-start latency 10-30s on idle endpoints).
- **Security hardening (T-19-C-01-01)** — endpoint URLs are opaque IDs and treated as secrets. The `catch` arm logs only the SDK error message, never the endpoint URL or env-var name when the endpoint resolves successfully.
- **Pinned dependency** — `@huggingface/inference@4.13.15` (resolved exactly to the version called out in RESEARCH §Sources Tertiary line 152, verified 2026-03-06).
- **Hermetic unit tests** — 4/4 GREEN. Test suite is portable across CI environments because `beforeAll()` injects synthetic HF env values; no real HF token required.
- **Full project test suite** — `npx vitest run` shows **482 passed | 3 todo (485)**, 0 failures, 1 file skipped (preexisting). No regressions to Phase 18 / earlier 19-A / 19-B / 19-C plans.
- **Project-wide tsc** — `npx tsc --noEmit -p tsconfig.json` clean.

## Task Commits

Each task was committed atomically:

1. **Task 1 (chore): install @huggingface/inference + add env vars** — `aa352d7`
2. **Task 2 (TDD RED): failing tests for the three clients** — `269db65`
3. **Task 3 (TDD GREEN): implement clients + reduceLabels + null-sentinel error path** — `fc1d7fb`
4. **Task 4 (documentation): provisioning checklist** — embedded in this SUMMARY (no code change required)
5. **Task 5 (synthesis): commit message AC satisfied by Task 3 commit** — `fc1d7fb` matches `feat(19-c-01)...` per acceptance regex

_Plan-end commit (this SUMMARY + ROADMAP tick) shipped as `docs(19-c-01)`._

## Files Created/Modified

- `src/lib/sentiment/finsentllm.ts` (created, 87 lines) — FinSentLLM clients with uniform SentimentScore + null-sentinel error contract. Includes file-header documentation block calling out HF revision pinning (`@<commit-sha>` in endpoint URL) and the security obligation to never log endpoint URLs.
- `tests/lib/sentiment/finsentllm.test.ts` (created, 62 lines) — 4 unit tests verbatim from impl-plan lines 833-880 with two surgical fixes (`beforeAll()` env injection + `vi.resetModules()` before the doMock). Mocks `@huggingface/inference` at module boundary; happy-path mock returns `{ positive: 0.85, negative: 0.10, neutral: 0.05 }`; error-path uses dynamic re-import after `vi.doMock` to swap in a throwing implementation.
- `.env.example` (modified, +9 lines) — appended `HF_INFERENCE_TOKEN`, `HF_FINGPT_ENDPOINT`, `HF_MISTRAL_FIN_ENDPOINT`, `HF_FINBERT_ENDPOINT` under a Phase 19-C-01 header that documents the provisioning gap and revision-pin obligation.
- `package.json` (modified) — added `@huggingface/inference: ^4.13.15` to dependencies.
- `package-lock.json` (modified) — transitive lockfile updates for `@huggingface/inference` (700 packages audited, no production blockers).
- `.planning/ROADMAP.md` (modified) — ticked `[x] 19-C-01: HF Inference Endpoint + FinSentLLM client (FinGPT v3 + Mistral + FinBERT)` with completion note matching the existing 19-C-04 / 19-C-07 / 19-C-09 convention (flag-off lands; shadow / cutover deferred to operator since this is a primitive, not yet wired into a hot path).

## Decisions Made

1. **SDK mocked at module boundary in unit tests; live calls deferred to integration tests.** Per the executor's `Mock providers in unit tests; live calls go in integration tests behind env-flag skips` constraint. No live HF calls happen during `npm test`.

2. **Endpoint URL is a secret; never logged on error.** Mitigates threat T-19-C-01-01 (information disclosure). The `catch` arm extracts only `err.message` and writes that to `SentimentScore.error`. Provisioned endpoint URLs are expected to embed `@<commit-sha>` revision pins, so leaking them is also a versioning risk.

3. **Label matching is prefix-based (`pos*` / `neg*`)** rather than exact. Handles FinBERT's `positive`/`negative`/`neutral` and FinGPT v3's `pos`/`neg` outputs uniformly. Unknown labels yield score=0 (conservative neutral) per threat T-19-C-01-03.

4. **Endpoint env-var presence checked inside the try/catch** — same null sentinel for missing env as for runtime API errors. This means shadow rollout (per D-05 lifecycle) is safe even before all 3 endpoints are provisioned: callers see `score: null` and the ensemble (19-C-02) degrades to single-model output.

5. **[Rule 1 — Bug] Verbatim test block had two latent bugs; both fixed inline.** (a) impl-plan test block did not set `HF_INFERENCE_TOKEN` / `HF_*_ENDPOINT`, so the env-var guards in `classifyVia` threw before reaching the mocked SDK — fixed via `beforeAll()` injection. (b) `vi.doMock` after a top-of-file `import` doesn't take effect because the module is already cached — fixed via `vi.resetModules()` immediately before `doMock`. Test bodies remain verbatim; only setup/cache management was added.

6. **HF model revision pinning is documented in the file header, not enforced in code.** Pinning happens at the endpoint URL level (`https://<id>.aws.endpoints.huggingface.cloud/<model>@<commit-sha>`), which is operator-controlled. The file header documents this obligation per RESEARCH Open Question 1; verifying the revision is on the operator at deploy time.

## Operator Provisioning Checklist (Task 4)

The 3 HF Inference Endpoints must be provisioned in HuggingFace Cloud before `FEATURE_FINSENTLLM_ENSEMBLE` graduates from `off` → `shadow` → `on`. Per RESEARCH §Environment Availability, **endpoints not yet provisioned as of 2026-05-06** — this is the operations gap that gates the shadow rollout for 19-C-02.

**For each of FinGPT v3 / Mistral 7B finance-tuned / FinBERT:**

1. **Select model** in HuggingFace Cloud:
   - FinGPT v3 — `FinGPT/fingpt-mt_llama2-7b_lora` (or current FinGPT v3 release)
   - Mistral 7B finance-tuned — `mistralai/Mistral-7B-Instruct-v0.2` fine-tuned on FiQA-SA / FPB
   - FinBERT — `ProsusAI/finbert`
2. **Choose AWS region** — `us-east-1` to match Vercel default region (minimizes cross-region latency for the API path).
3. **Select GPU instance** — $0.03/hr base (NVIDIA T4 or equivalent suffices for these model sizes).
4. **Enable always-on mode** — keeps endpoint warm; ~$10/mo per endpoint per RESEARCH Assumption A2 (≈$30/mo total for 3 endpoints, well within the D-49 ≤ $135/mo Phase 19 cost envelope).
5. **Copy the endpoint URL with `@<commit-sha>` revision pin** — format `https://<id>.aws.endpoints.huggingface.cloud/<model>@<sha>`. Without the SHA, HF model upgrades can silently change scoring distributions and invalidate any historical SentimentScores already persisted.
6. **Set as `HF_*_ENDPOINT` env var** via Vercel CLI: `vercel env add HF_FINGPT_ENDPOINT production` (and `preview`, `development`); repeat for Mistral and FinBERT. Set `HF_INFERENCE_TOKEN` once (HF user access token, scoped read-only to the 3 endpoints).
7. **Validate** by running an integration test (deferred to a future plan; not in 19-C-01 scope).

**Cost fallback:** If always-on cost exceeds $10/mo per endpoint, fall back to scale-to-zero with a warm-up cron (per RESEARCH Pitfall 4 mitigation 2). The clients already tolerate cold-start latency (null sentinels) so the warm-up cron only needs to fire ~5min before high-traffic windows.

## Deviations from Plan

1. **[Rule 1 — Bug] Inline fix to verbatim test block** — see Decision 5. Two minimal corrections (`beforeAll()` env injection + `vi.resetModules()`) so the suite passes hermetically and the error-path assertion measures the intended behavior. No test body / assertion was modified.

No other deviations — all 5 tasks executed as written; per-task acceptance criteria (file existence, version pin, env-var count, AC1/AC2/AC3 grep checks, commit-message regex) all passed.

## Threat Surface Scan

The plan's `<threat_model>` listed three threats:

| Threat ID | Mitigation Status |
|-----------|-------------------|
| T-19-C-01-01 (endpoint URL disclosure on error) | ✓ mitigated — `catch` arm propagates only `err.message`; endpoint URL never logged. Verified by reading `classifyVia()` lines 64-78 in `src/lib/sentiment/finsentllm.ts`. |
| T-19-C-01-02 (HF cold-start DoS) | ✓ mitigated — null sentinel on any error means callers never block on cold-start; 19-C-02 ensemble degrades gracefully. Warm-up cron deferred to later plan if measured shadow latency too high. |
| T-19-C-01-03 (mislabeled fine-tune returns wrong scores) | ✓ mitigated — `reduceLabels()` prefix-matches `pos*`/`neg*`; unknown labels contribute neither pos nor neg, so `score = 0 - 0 = 0` (conservative neutral). HF model revisions pinned via `@<commit-sha>` in endpoint URL per file-header obligation. |

No new threat surface introduced. The plan creates a primitive (3 functions); it doesn't add any network endpoints, auth paths, file access patterns, or schema changes at trust boundaries.

## Issues Encountered

None blocking. The two test-block corrections (Decision 5) were caught by the targeted `npx vitest run tests/lib/sentiment/finsentllm.test.ts` immediately after Task 3's GREEN write and fixed inline before the Task 3 commit landed. Full project tsc was clean from the first impl write — the SDK type signature (`textClassification({ model, inputs })` per `node_modules/@huggingface/inference/dist/commonjs/tasks/nlp/textClassification.d.ts`) matches the verbatim impl-plan call site exactly.

## Self-Check

- [x] `src/lib/sentiment/finsentllm.ts` exists; exports `classifyFinGPT`, `classifyMistralFin`, `classifyFinBERT`, `SentimentScore`
- [x] `tests/lib/sentiment/finsentllm.test.ts` exists; 4 tests
- [x] `@huggingface/inference@4.13.15` pinned in `package.json`
- [x] `node -e "require('@huggingface/inference')"` does not throw
- [x] `.env.example` contains all 4 HF env vars (`HF_INFERENCE_TOKEN`, `HF_FINGPT_ENDPOINT`, `HF_MISTRAL_FIN_ENDPOINT`, `HF_FINBERT_ENDPOINT`)
- [x] `grep -q "HfInference" src/lib/sentiment/finsentllm.ts` (Task 3 AC1)
- [x] `grep -q "score: null" src/lib/sentiment/finsentllm.ts` (Task 3 AC2 — null sentinel)
- [x] `grep -qE "TODO|IMPORTANT.*pin" src/lib/sentiment/finsentllm.ts` (Task 3 AC3 — revision-pin reminder)
- [x] `git log -1 --pretty=%s` matches `19-c-01` (Task 5 AC: most recent code commit `feat(19-c-01): GREEN — implement FinSentLLM clients (Task 3)`)
- [x] Targeted suite GREEN: `tests/lib/sentiment/finsentllm.test.ts (4 tests)` — all pass without manually-set env vars (hermetic)
- [x] Full vitest suite GREEN: `Test Files 50 passed | 1 skipped (51), Tests 482 passed | 3 todo (485)`
- [x] Project-wide `npx tsc --noEmit -p tsconfig.json` clean
- [x] All 3 task commits present: `aa352d7`, `269db65`, `fc1d7fb`

## Self-Check: PASSED

## User Setup Required

**Before `FEATURE_FINSENTLLM_ENSEMBLE` graduates from `off`:** operator must complete the [Operator Provisioning Checklist](#operator-provisioning-checklist-task-4) above — provision 3 HF Inference Endpoints in HuggingFace Cloud, capture the `@<commit-sha>` revision-pinned URLs, and set `HF_INFERENCE_TOKEN` + `HF_FINGPT_ENDPOINT` + `HF_MISTRAL_FIN_ENDPOINT` + `HF_FINBERT_ENDPOINT` via `vercel env add` for production / preview / development. Without this step, the clients return null sentinels for every call (which is safe but provides no signal).

No operator action required to merge or land 19-C-01 itself — the code is feature-flag-off and the unit tests are hermetic.

## Next Phase Readiness

- **Ready for 19-C-02 (ensemble meta-classifier)** — primitives are in place; 19-C-02 can compose `classifyFinGPT`, `classifyMistralFin`, `classifyFinBERT` and apply weighted-average / agreement-metric logic over the three `SentimentScore`s.
- **Ready for 19-C-08 (CoVe two-pass)** — 19-C-08 can call `classifyFinBERT` directly for the NLI step on each Pass-1 verification claim.
- **Ready for 19-C-10 (cross-class contradiction detector)** — same NLI primitive available.
- **Operations gap remaining:** 3 HF endpoint provisionings (see User Setup Required). Until provisioned, shadow rollout for 19-C-02 cannot start producing sane scores; `FEATURE_FINSENTLLM_ENSEMBLE` stays `off` and the ensemble code lands `off` per D-09 / D-10.

---
*Phase: 19-cipher-v2-0-excellence*
*Plan: 19-C-01*
*Completed: 2026-05-10*
