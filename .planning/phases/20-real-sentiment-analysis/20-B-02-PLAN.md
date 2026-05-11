---
phase: 20
plan: 20-B-02
wave: B
type: execute
depends_on: [20-Z-01, 20-Z-03]
files_modified:
  - src/lib/sentiment/finsentllm.ts
  - src/lib/sentiment/per-message-pass.ts
  - src/lib/sentiment/local-finbert-fallback.ts
  - src/lib/data/source-package.ts
  - src/app/api/cron/sentiment-scan/route.ts
  - scripts/check-finbert-sha.ts
  - .env.example
  - .env.local.example
  - package.json
  - docs/cards/MODEL-CARD-finbert-prosus.md
  - tests/sentiment/finbert-classify.unit.test.ts
  - tests/sentiment/per-message-pass.unit.test.ts
  - tests/sentiment/local-finbert-fallback.unit.test.ts
  - tests/integration/finbert-hf-endpoint.integration.test.ts
autonomous: false
requirements: []
shadow_required: true
shadow_verdict_criteria:
  duration_hours: 24
  metrics:
    - "withTelemetry p95 latency for provider_id='finbert-hf' ≤ 2000ms over the trailing 24h window"
    - "Per-ticker per-message-pass cost ≤ documented budget (≤ $0.10 per 1000 messages; rolling 24h sum stays under daily cap)"
    - "Cohen's kappa ≥ 0.7 vs 20-B-01 Gemini per-document polarity on the overlap set (sampled docs where BOTH classifiers fired)"
    - "Error rate (error_class != null) ≤ 5% over trailing 24h"
  cutover_action: "Flip PER_MESSAGE_PASS_MODE env from 'shadow' to 'on'; this enables consumer reads of SentimentObservation rows tagged classifier_version='finbert-prosus-{sha8}' for downstream aggregation in 20-A-03 / 20-B-04"
hard_cleanup_gate: true
must_haves:
  truths:
    - "HF Inference Endpoint is provisioned for ProsusAI/finbert at a pinned commit SHA on cpu-medium ($0.033/hr) instance in us-east-1"
    - "HF_FINBERT_ENDPOINT env var contains a SHA-shaped revision identifier matched by /[a-f0-9]{40}|\\/r-[A-Za-z0-9-]+/"
    - "HF_INFERENCE_TOKEN is set in Vercel production environment (operator-confirmed)"
    - "classifyFinBERT in src/lib/sentiment/finsentllm.ts is wrapped in withTelemetry('finbert-hf', ...) per 20-Z-03 wrapper signature with cost_usd_estimator returning 0.0001 USD/call"
    - "src/lib/sentiment/per-message-pass.ts implements the 3-tier fallback chain: HF endpoint (primary) → @xenova/transformers local CPU inference (secondary) → null sentinel (tertiary)"
    - "Per-message pass activates only when StockTwits message_volume > 50; below threshold path is unchanged"
    - "Pipeline cost cap of 1000 messages/ticker/day is enforced in per-message-pass.ts; over-cap messages are skipped with telemetry counter is_fallback=true"
    - "Each per-message classification persists as a SentimentObservation row (via 20-Z-01 insertObservation) with classifier_version='finbert-prosus-{sha8}' where {sha8} is the first 8 hex chars of the pinned commit SHA"
    - "scripts/check-finbert-sha.ts GETs the configured endpoint info, asserts the pinned SHA is still served, and exits 0 when healthy / non-zero when stale; wired to package.json scripts as 'check-finbert-sha'"
    - "@xenova/transformers is added to package.json dependencies; lazy-loaded only inside the local fallback path (never imported at module top level)"
    - "docs/cards/MODEL-CARD-finbert-prosus.md exists per 20-Z-02 template, citing Araci 2019 (FinBERT) + Malo et al. 2014 (Financial PhraseBank) with intended-use, OOD behavior, and known failure modes sections filled"
    - "Unit tests cover: HF response parsing (positive / neutral / negative), missing-env throws on direct call, fallback chain resilience (HF fails → local fires; local fails → null sentinel), cost cap enforcement"
    - "Live integration test (gated by RUN_LIVE_FINBERT=true) classifies 5 sample messages within 10s wall-clock total"
    - "withTelemetry wrapping populates ProviderCallLog so the 20-Z-03 dashboard renders a finbert-hf provider tile with non-zero data within 24h of cutover"
  artifacts:
    - path: "src/lib/sentiment/finsentllm.ts"
      provides: "Updated classifyFinBERT wrapped in withTelemetry('finbert-hf', ...) with cost_usd_estimator; pinned-SHA env var convention preserved"
      contains: "withTelemetry('finbert-hf'"
    - path: "src/lib/sentiment/per-message-pass.ts"
      provides: "3-tier fallback chain orchestrator; volume-gate (>50); per-ticker daily cost cap (1000 msgs); persists SentimentObservation rows via insertObservation"
      contains: "classifyFinBERT"
    - path: "src/lib/sentiment/local-finbert-fallback.ts"
      provides: "Lazy-loaded @xenova/transformers pipeline('sentiment-analysis', 'ProsusAI/finbert'); never imported at top level; documented 50MB lazy weight + 500MB peak RAM"
      contains: "@xenova/transformers"
    - path: "scripts/check-finbert-sha.ts"
      provides: "Monthly SHA-rot guard — GETs endpoint info, asserts pinned SHA still served; exits 0 healthy / 1 stale"
      contains: "HF_FINBERT_ENDPOINT"
    - path: ".env.example"
      provides: "Documents HF_FINBERT_ENDPOINT=https://<id>.us-east-1.aws.endpoints.huggingface.cloud/<pinned-sha-or-revision-id> + HF_INFERENCE_TOKEN format with explicit SHA-pinning comment"
      contains: "HF_FINBERT_ENDPOINT"
    - path: "docs/cards/MODEL-CARD-finbert-prosus.md"
      provides: "Mitchell-2019-style model card per 20-Z-02 template; cites Araci 2019 + Malo et al. 2014 Financial PhraseBank"
      contains: "ProsusAI/finbert"
    - path: "tests/sentiment/finbert-classify.unit.test.ts"
      provides: "≥6 unit tests: pos/neu/neg parsing, missing env throws, telemetry wrapping verified"
    - path: "tests/sentiment/per-message-pass.unit.test.ts"
      provides: "Fallback chain resilience tests + cost-cap enforcement test"
    - path: "tests/sentiment/local-finbert-fallback.unit.test.ts"
      provides: "Lazy-load assertion + null-on-failure test (mocked @xenova/transformers)"
    - path: "tests/integration/finbert-hf-endpoint.integration.test.ts"
      provides: "Gated live test (RUN_LIVE_FINBERT=true) — 5 messages classified in <10s"
  key_links:
    - from: "src/lib/sentiment/per-message-pass.ts"
      to: "src/lib/sentiment/finsentllm.ts classifyFinBERT()"
      via: "primary tier of fallback chain"
      pattern: "classifyFinBERT\\("
    - from: "src/lib/sentiment/per-message-pass.ts"
      to: "src/lib/sentiment/local-finbert-fallback.ts classifyFinBERTLocal()"
      via: "secondary tier, dynamic import (await import('./local-finbert-fallback'))"
      pattern: "await import\\(.*local-finbert-fallback"
    - from: "src/lib/sentiment/per-message-pass.ts"
      to: "src/lib/sentiment/observation-store.ts insertObservation() (20-Z-01)"
      via: "persist each classified message as SentimentObservation row"
      pattern: "insertObservation\\("
    - from: "src/lib/sentiment/finsentllm.ts classifyFinBERT"
      to: "src/lib/telemetry/withTelemetry.ts (20-Z-03)"
      via: "withTelemetry('finbert-hf', () => HF call, { cost_usd_estimator: () => 0.0001 })"
      pattern: "withTelemetry\\('finbert-hf'"
    - from: "src/app/api/cron/sentiment-scan/route.ts"
      to: "src/lib/sentiment/per-message-pass.ts runPerMessagePass()"
      via: "additive call inside the existing for-each-ticker loop, gated on stocktwits_message_count > 50 AND PER_MESSAGE_PASS_MODE in {'shadow','on'}"
      pattern: "runPerMessagePass\\("
    - from: "package.json scripts.check-finbert-sha"
      to: "scripts/check-finbert-sha.ts"
      via: "npm-run-script wrapper used by monthly cron / CI"
      pattern: "check-finbert-sha"
---

# Plan 20-B-02: FinBERT HF endpoint (per-message backstop) + 3-tier fallback chain

<universal_preamble>

## Autonomous Execution Clause

This plan is **operator-blocked** at exactly one point: Task 3 — the operator MUST provision the HF Inference Endpoint and set `HF_FINBERT_ENDPOINT` + `HF_INFERENCE_TOKEN` in Vercel production BEFORE the integration test (Task 11) can pass. All other tasks are autonomous. The operator-blocked task is encoded as `<task type="checkpoint:human-action">` and gates Tasks 11+ via Wave-internal ordering. After the operator confirms env vars are set, remaining tasks (telemetry verify, dashboard tile check, commit) proceed without further prompts.

## Hard Cleanup Gate (Definition of Done)

A plan is **NOT complete** until:
1. **Shadow lifecycle** — `PER_MESSAGE_PASS_MODE` env flag exists and starts at `shadow`. Cutover criterion: 24h shadow window with telemetry verifying p95 ≤ 2s + cost ≤ documented budget + Cohen's kappa ≥ 0.7 vs 20-B-01 Gemini per-document on the overlap set + error rate ≤ 5%. Cutover action documented in frontmatter `shadow_verdict_criteria.cutover_action`. Flag REMOVED in a follow-up commit only AFTER 20-A-03 / 20-B-04 graduate to `on` and consume `SentimentObservation` rows tagged `finbert-prosus-{sha8}`.
2. **No old code deleted** — additive only; existing `classifyFinBERT` is wrapped in telemetry but its signature is preserved. Existing `SentimentSnapshot` writer continues unchanged (20-Z-01 is the persistence path).
3. **PER_MESSAGE_PASS_MODE flag introduced** — three modes per S3: `off | shadow | on`. Default `off` in `.env.example`, default `shadow` once provisioned per Task 3.
4. `npm test` (Vitest unit), `npm run test:integration` (live-Neon Vitest, with `RUN_LIVE_FINBERT=false`), and `npm run test:e2e` (Playwright) all green on `main` post-commit.
5. **Operator Provisioning Gate** (Task 3) — operator has typed approval that the HF endpoint is provisioned at the pinned SHA AND `HF_FINBERT_ENDPOINT` + `HF_INFERENCE_TOKEN` are set in Vercel prod. Without this, Tasks 11–13 cannot pass.
6. **SHA-Pin Gate** — `scripts/check-finbert-sha.ts` exits 0 against the configured endpoint at commit time.
7. **Telemetry Coverage Gate** — `grep -c "withTelemetry('finbert-hf'" src/lib/sentiment/*.ts` returns `>= 1`. The wrapped call surfaces in `/insights/sentiment-health` finbert-hf provider tile with `count_24h >= 1` after at least one shadow-mode cron tick.
8. **Cost-Cap Gate** — `runPerMessagePass()` rejects after 1000 messages/ticker/day; integration test asserts the rejection with a synthetic 1001-message payload.
9. **Model Card Gate** — `docs/cards/MODEL-CARD-finbert-prosus.md` exists and `npm run check-model-cards` (from 20-Z-02) exits 0.

## Cross-cutting standards adherence (CONTEXT.md §S1-S10)

- **S1 (no hand-picked parameters)** — The `message_volume > 50` gate is the literal threshold in CONTEXT.md line 114 ("when message volume > 50 (Gemini per-document is cost-prohibitive at that volume)"). The 1000 msgs/ticker/day cost cap is the documented operational ceiling tied to the $0.10/ticker/day budget at $0.0001/call. The $0.0001/call cost estimator constant is the literal value from CONTEXT.md line 67 ("~80 inferences × ~100ms ≈ $0.0001 per ticker"). All three are documented; none are hand-tuned.
- **S2 (PIT discipline)** — Every classified message persists as a `SentimentObservation` row via 20-Z-01 `insertObservation`. The `fetched_at` PIT-INVARIANT column is set to call-time wall clock; `published_at` carries the upstream StockTwits timestamp informationally. Backfill under a re-pinned SHA inserts new rows under a new `model_version`, never overwrites — enforced by 20-Z-01's composite unique on `(ticker, message_id, model_version)`.
- **S3 (shadow lifecycle)** — `PER_MESSAGE_PASS_MODE` is the three-mode flag (`off | shadow | on`). Verdict criteria in frontmatter `shadow_verdict_criteria` are numerical (latency p95, cost, kappa, error rate); cutover action is documented; off-path code path REMOVED in follow-up after dependent plans graduate.
- **S4 (model card)** — `docs/cards/MODEL-CARD-finbert-prosus.md` shipped per 20-Z-02 template; cites Araci 2019 + Malo et al. 2014 Financial PhraseBank; documents intended use (per-message StockTwits classification when volume > 50), OOD behavior (degraded on non-finance text — fallback to null), known failure modes (sarcasm, ticker mentions in unrelated contexts).
- **S5 (pinned model + prompt versions)** — HF endpoint URL pins commit SHA per 19-C-01 convention. `classifier_version='finbert-prosus-{sha8}'` is persisted on every SentimentObservation row so future re-pins create new model_version partitions. `scripts/check-finbert-sha.ts` is the monthly drift detector.
- **S6 (telemetry on every external call)** — `classifyFinBERT` wrapped in `withTelemetry('finbert-hf', ..., { cost_usd_estimator })`. The 20-Z-03 dashboard finbert-hf tile is the visible verification.
- **S7 (threat model)** — five plan-level threats T-20-B-02-{01..05} below; T-20-B-02-01..04 mitigated in this plan, T-20-B-02-05 is reviewed monthly via the SHA-rot script.
- **S8 (numerical acceptance)** — every DONE criterion is a grep / test exit / latency / cost / row-count assertion. Zero adjectives.

</universal_preamble>

<objective>
Wire the existing `classifyFinBERT` HF Inference Endpoint client (`src/lib/sentiment/finsentllm.ts`) into the StockTwits per-message classification path, gated on `message_volume > 50` (the threshold above which Gemini per-document classification — 20-B-01 — is cost-prohibitive). Add a 3-tier fallback chain so endpoint outages do not silently degrade scoring: (1) HF endpoint primary → (2) lazy-loaded `@xenova/transformers` local CPU inference → (3) null sentinel (consumer treats as "no per-message classification"). Each successful classification persists as a `SentimentObservation` row (20-Z-01) with `classifier_version='finbert-prosus-{sha8}'`. Cost cap of 1000 messages/ticker/day enforced in the per-message pass orchestrator. Wrap every external call in 20-Z-03 `withTelemetry('finbert-hf', ...)` so latency p95 and per-call cost are visible in `/insights/sentiment-health`.

Purpose: Phase 20's per-document NLP wave needs a per-message classifier path that is (a) cheap enough to run on every StockTwits message in high-volume tickers (Gemini per-doc at ~$0.001/call × 200 messages/ticker = $0.20/ticker — out of budget), (b) outage-resilient so vendor downtime does not zero our sentiment signal, and (c) PIT-disciplined so re-pinned SHAs do not corrupt historical scores. FinBERT (Araci 2019; ~97% on Financial PhraseBank) on HF's $0.033/hr CPU instance hits ~$0.0001/call — three orders of magnitude under Gemini — making it the per-message backstop the volume-gate switches into.

Scope guard — this plan ships **the HF endpoint integration + 3-tier fallback chain + per-message-pass wiring + cost guardrails ONLY**. Out of scope: Gemini per-document classification (20-B-01), temperature scaling / ECE calibration (20-B-03), source-tier weighting (20-B-04), per-aspect chips (20-B-05), L&M lexicon fallback (20-B-06).

Output:
- 1 modified classifier client (`finsentllm.ts` — telemetry wrapping)
- 2 new modules (`per-message-pass.ts` orchestrator + `local-finbert-fallback.ts` lazy local tier)
- 1 hook into existing cron route (additive, ≤30 LOC delta)
- 1 SHA-rot guard script + `package.json` wiring
- 1 model card stub
- 1 dependency added (`@xenova/transformers`, lazy-loaded)
- 4 test files (3 unit + 1 gated integration)
- 2 .env documentation updates (`.env.example` + `.env.local.example`)
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/20-real-sentiment-analysis/CONTEXT.md
@.planning/phases/20-real-sentiment-analysis/20-Z-01-PLAN.md
@.planning/phases/20-real-sentiment-analysis/20-Z-03-PLAN.md
@.planning/phases/20-real-sentiment-analysis/20-Z-02-PLAN.md
@src/lib/sentiment/finsentllm.ts
@src/lib/sentiment/aggregator.ts
@src/lib/data/stocktwits.ts
@src/lib/data/source-package.ts
@src/app/api/cron/sentiment-scan/route.ts
@.env.example
@package.json

<interfaces>
```typescript
// src/lib/sentiment/finsentllm.ts — MODIFIED (existing classifyFinBERT wrapped in telemetry)

import { withTelemetry } from '@/lib/telemetry/withTelemetry';        // from 20-Z-03

// Existing exports preserved:
export interface SentimentScore {
  score: number | null;        // [-1, 1]; positive bullish, negative bearish
  confidence: number | null;   // [0, 1]; max class probability
  model: 'fingpt-v3' | 'mistral-fin-7b' | 'finbert';
  error?: string;
}

// Updated — now wrapped in withTelemetry; signature unchanged:
export const classifyFinBERT: (text: string) => Promise<SentimentScore>;
//   Internally: withTelemetry('finbert-hf', () => classifyVia('finbert', 'HF_FINBERT_ENDPOINT', text), {
//     cost_usd_estimator: () => 0.0001,  // CONTEXT.md line 67 ($0.033/hr CPU × ~80 inferences/hr)
//   })

// src/lib/sentiment/local-finbert-fallback.ts — NEW

/**
 * Secondary fallback tier. Lazy-loads @xenova/transformers (~50MB weight) the
 * first time it is called; subsequent calls reuse the cached pipeline.
 *
 * IMPORTANT — NEVER imported at module top level. Caller must use:
 *   const mod = await import('./local-finbert-fallback');
 *   const r = await mod.classifyFinBERTLocal(text);
 *
 * Memory footprint: ~500MB peak RAM during inference. Documented as
 * shadow-mode-only on Vercel functions <512MB; production primary path is the
 * HF endpoint (see plan-level threat T-20-B-02-04).
 */
export async function classifyFinBERTLocal(text: string): Promise<SentimentScore>;

// src/lib/sentiment/per-message-pass.ts — NEW

export type PerMessagePassMode = 'off' | 'shadow' | 'on';

export interface PerMessagePassInput {
  ticker: string;
  messages: Array<{
    message_id: string;        // upstream StockTwits message id
    body: string;              // raw text — hashed by 20-Z-01 insertObservation
    author_handle: string;     // raw upstream handle — hashed by 20-Z-01 insertObservation as sha256("stocktwits:{handle}")
    published_at: Date | null; // upstream-claimed timestamp; informational only
    author_features: {
      account_age_days: number | null;
      follower_count: number | null;
      is_verified: boolean | null;
      message_count_30d: number | null;
    };
  }>;
}

export interface PerMessagePassResult {
  classified_count: number;       // count of non-null classifications persisted
  null_count: number;             // count where all 3 tiers returned null sentinel
  cost_capped_count: number;      // count of messages skipped due to 1000/ticker/day cap
  primary_path_count: number;     // tier-1 (HF endpoint) successes
  secondary_path_count: number;   // tier-2 (local) successes
  tertiary_path_count: number;    // tier-3 (null sentinel) — same as null_count
}

/**
 * Runs the FinBERT per-message classification pass. Activates only when
 * input.messages.length > 50. Below threshold, returns a zero-counts result
 * without firing any classifier.
 *
 * Cost cap: 1000 messages/ticker/day. Reads today's count of
 * SentimentObservation rows for (ticker, classifier_version_prefix='finbert-prosus-')
 * from the 20-Z-01 store; rejects messages above the cap with
 * cost_capped_count++ and is_fallback=true telemetry tag.
 *
 * Fallback chain per message:
 *   1. classifyFinBERT(text)              — HF endpoint
 *   2. classifyFinBERTLocal(text)         — lazy-load @xenova/transformers
 *   3. null sentinel                      — persists nothing; null_count++
 *
 * Each successful classification persists as a SentimentObservation row via
 * insertObservation (20-Z-01) with:
 *   classifier_version: 'finbert-prosus-{sha8}'    // from FINBERT_PINNED_SHA8 module constant
 *   model_version:      'finbert-prosus-{sha8}-v1' // re-pin → bump v2; preserves 20-Z-01 PIT semantics
 *   classifier_score:   SentimentScore.score in [-1, +1] OR null (still persists row for path-2)
 *   author_features_snapshot: ALLOWLIST per 20-Z-01 T-20-Z-01-01
 */
export async function runPerMessagePass(
  input: PerMessagePassInput,
  mode: PerMessagePassMode,
): Promise<PerMessagePassResult>;

// scripts/check-finbert-sha.ts — NEW

/**
 * Monthly SHA-rot guard. GETs the configured HF_FINBERT_ENDPOINT info endpoint,
 * asserts the pinned commit SHA in the URL is still served, and exits 0 healthy
 * / 1 stale. Wired to package.json scripts.check-finbert-sha. Threat T-20-B-02-05
 * mitigation.
 */
// (CLI script — no exports)
```
</interfaces>
</context>

<threat_model>

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Cipher → HuggingFace Inference | Untrusted upstream — vendor controls model weights, latency, availability, billing |
| StockTwits message body → FinBERT | Untrusted user-generated text crosses into a model invocation; injection attacks against an inference endpoint are negligible (no system prompt to escape) but text-length-DoS is a concern |
| Pinned SHA in env → 20-Z-01 model_version | Re-pin must trigger a new model_version partition; silent SHA drift would corrupt the immutability invariant |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-20-B-02-01 | Denial of service | HF Inference Endpoint downtime / cold-start / rate-limit | mitigate | Three-tier fallback chain in `per-message-pass.ts` — HF primary → `@xenova/transformers` local CPU secondary → null sentinel tertiary. 20-Z-03 telemetry dashboard surfaces error_class breakdown for `provider_id='finbert-hf'`; alert wired when error rate > 5% over rolling 24h. Maps to phase catalog T-28-003 (vendor source rot). |
| T-20-B-02-02 | Resource exhaustion / cost runaway | Per-message pass on a 5000-message meme-stock day → $0.50/ticker → 50× budget | mitigate | (a) Volume gate `message_volume > 50` per CONTEXT.md line 114. (b) Pipeline-enforced cost cap = 1000 messages/ticker/day; over-cap messages skipped with `cost_capped_count++` and `withTelemetry({ is_fallback: true })`. (c) 20-Z-03 daily cost-budget alerter at 1.5× rolling-7d baseline catches drift. (d) Integration test asserts the cost-cap rejection on a synthetic 1001-message payload. |
| T-20-B-02-03 | Information disclosure | HF_INFERENCE_TOKEN leak via logs or error messages | mitigate | Token only in `process.env.HF_INFERENCE_TOKEN` — never logged. Per the existing `finsentllm.ts` SECURITY note (T-19-C-01-01), endpoint URL is also never logged on error; only the SDK error message (sanitized by `@huggingface/inference`) reaches the log path. 20-Z-03 `error_classifier.ts` reduces all errors to the controlled enum (RATE_LIMITED \| AUTH_FAILED \| TIMEOUT \| UPSTREAM_5XX \| NETWORK \| UNKNOWN) — no raw message reaches `ProviderCallLog.error_class`, so token cannot be exfiltrated through the dashboard either. |
| T-20-B-02-04 | Resource exhaustion (RAM) | Lazy-loaded `@xenova/transformers` peaks ~500MB during inference; Vercel function memory ≤ 1024MB Hobby / configurable Pro; risk of OOM on cold-start function | mitigate | Documented in `local-finbert-fallback.ts` header + model card: secondary tier is "shadow-mode-only on Vercel functions <512MB"; production primary path is always the HF endpoint. Lazy-import (never top-level) ensures the 50MB weight never loads when HF endpoint is healthy. Cron route memory pinned via `vercel.json` `memory: 1024` (additive — does not require new operator action because crons already run at Pro-tier limits). |
| T-20-B-02-05 | Tampering / silent drift | HF deletes / re-tags the pinned commit SHA → endpoint silently serves a different model → scores drift, historical comparisons corrupt | mitigate | (a) `scripts/check-finbert-sha.ts` GETs the endpoint info monthly and exits non-zero if the pinned SHA is missing — wired as `npm run check-finbert-sha`. (b) Re-pin procedure documented in plan: bump `FINBERT_PINNED_SHA8` constant → bump `model_version` from `-v1` to `-v2` → 20-Z-01 composite unique enforces no overwrites of historical rows. (c) Maps to phase catalog T-28-004 (silent classifier upgrade). |

</threat_model>

<tasks>

<task type="auto" id="20-B-02-01">
  <name>Task 1: Document HF endpoint provisioning runbook + .env updates</name>
  <files>
    .env.example
    .env.local.example
    docs/cards/MODEL-CARD-finbert-prosus.md
  </files>
  <read_first>
    - .planning/phases/20-real-sentiment-analysis/CONTEXT.md (lines 114, 174 — operator action and acceptance)
    - .planning/phases/20-real-sentiment-analysis/20-Z-02-PLAN.md (model card template requirements)
    - .env.example (lines 46-51 — existing HF endpoint comments preserve format)
    - src/lib/sentiment/finsentllm.ts (lines 11-22 — existing pinning convention from 19-C-01)
  </read_first>
  <action>
    1. Update `.env.example` and `.env.local.example`. Add (or update) the existing `HF_FINBERT_ENDPOINT` block to document the pinned-SHA convention literally:

       ```
       # ProsusAI/finbert per-message backstop (Phase 20-B-02). Provisioned on HF Inference Endpoints,
       # cpu-medium ($0.033/hr) instance, region us-east-1. URL MUST include @<pinned-commit-sha>
       # per 19-C-01 / 20-B-02 SHA-pinning convention. Re-pin requires bumping FINBERT_PINNED_SHA8
       # in src/lib/sentiment/per-message-pass.ts AND bumping the model_version suffix from -v1 to -v2
       # so 20-Z-01 SentimentObservation rows partition cleanly.
       #
       # Format:
       #   HF_FINBERT_ENDPOINT=https://<id>.us-east-1.aws.endpoints.huggingface.cloud/<pinned-sha-or-revision-id>
       HF_FINBERT_ENDPOINT=
       HF_INFERENCE_TOKEN=

       # Phase 20-B-02 shadow flag — three modes per S3:
       #   off    — per-message pass disabled; existing snapshot path unchanged
       #   shadow — per-message pass runs, persists to SentimentObservation, no read consumers yet
       #   on     — downstream aggregation (20-A-03 / 20-B-04) consumes the rows
       PER_MESSAGE_PASS_MODE=off
       ```

    2. Create `docs/cards/MODEL-CARD-finbert-prosus.md` per 20-Z-02 template. Required sections (Mitchell 2019):
       - **Model Details**: ProsusAI/finbert (BERT-base, 110M params), cite Araci 2019 ("FinBERT: Financial Sentiment Analysis with Pre-trained Language Models")
       - **Intended Use**: Per-StockTwits-message bullish/bearish classification when message_volume > 50; backstop for Gemini per-document (20-B-01) at high volume; NOT for SEC filing classification (use Loughran-McDonald in 20-B-06 for that)
       - **Training Data**: Financial PhraseBank (Malo et al. 2014, 4845 sentences, ~75% Reuters financial news labeled by 16 finance graduate students)
       - **Performance**: ~97% on Financial PhraseBank (Araci 2019); Cipher's locally-measured ECE will be calibrated in 20-B-03
       - **Out-of-Distribution Behavior**: Degrades on non-finance text (general news, sports, politics) → Cipher mitigates by (a) only running on StockTwits messages already filtered by ticker, (b) null-sentinel fallback when confidence < 0.4
       - **Known Failure Modes**: Sarcasm, irony, ticker-mention-without-context ("just bought $TSLA pizza"), pump-language ("to the moon" — gets flagged bullish but is a manipulation signal — 20-C-04 catches this separately)
       - **Ethical Considerations**: Trained on financial news → may carry survivorship / English-language bias toward US large-cap coverage; fairness audit in 20-C-06 will quantify per-cap-class
       - **Retrain Cadence**: Vendor-controlled (we do not retrain ProsusAI/finbert); SHA pin freezes weights; monthly `check-finbert-sha` detects vendor re-pin

    3. Re-run `npm run check-model-cards` (from 20-Z-02) — must exit 0.
  </action>
  <verify>
    <automated>grep -c "HF_FINBERT_ENDPOINT" .env.example .env.local.example | awk -F: '{s+=$2} END {exit !(s>=2)}' &amp;&amp; test -f docs/cards/MODEL-CARD-finbert-prosus.md &amp;&amp; npm run check-model-cards</automated>
  </verify>
  <done>
    `.env.example` + `.env.local.example` document `HF_FINBERT_ENDPOINT` (with pinned-SHA convention comment) + `HF_INFERENCE_TOKEN` + `PER_MESSAGE_PASS_MODE=off`. Model card committed. `npm run check-model-cards` exits 0.
  </done>
</task>

<task type="auto" id="20-B-02-02">
  <name>Task 2: Wrap classifyFinBERT in withTelemetry + add SHA constant</name>
  <files>
    src/lib/sentiment/finsentllm.ts
    tests/sentiment/finbert-classify.unit.test.ts
  </files>
  <read_first>
    - src/lib/sentiment/finsentllm.ts (full file — 83 LOC; preserve classifyVia + reduceLabels semantics)
    - .planning/phases/20-real-sentiment-analysis/20-Z-03-PLAN.md (lines 196-260 — withTelemetry signature, ProviderId enum, cost_usd_estimator pattern)
    - src/lib/telemetry/withTelemetry.ts (once 20-Z-03 lands — verify provider_id 'finbert-hf' is in the ProviderId union)
  </read_first>
  <action>
    1. Modify `src/lib/sentiment/finsentllm.ts`:
       - At top of file, add: `import { withTelemetry } from '@/lib/telemetry/withTelemetry';`
       - Add an exported module constant: `export const FINBERT_PINNED_SHA8 = '<first-8-hex-of-pinned-sha>';` — the implementer MUST verify the current SHA by GETting `https://huggingface.co/api/models/ProsusAI/finbert` and using `model.sha` substring(0,8). Pin the literal value; document in a comment that re-pin is the trigger to bump model_version in `per-message-pass.ts`.
       - Wrap the existing `classifyFinBERT` export — replace:
         ```typescript
         export const classifyFinBERT = (text: string) => classifyVia('finbert', 'HF_FINBERT_ENDPOINT', text);
         ```
         with:
         ```typescript
         export const classifyFinBERT = (text: string): Promise<SentimentScore> =>
           withTelemetry(
             'finbert-hf',
             () => classifyVia('finbert', 'HF_FINBERT_ENDPOINT', text),
             { cost_usd_estimator: () => 0.0001 },  // CONTEXT.md line 67: $0.033/hr CPU × ~80 inferences/hr
           );
         ```
       - DO NOT change `classifyFinGPT` or `classifyMistralFin` (out of scope per CONTEXT.md — those models are not provisioned).
       - Preserve all existing comments (D-33, T-19-C-01-01/02/03 references).

    2. Create `tests/sentiment/finbert-classify.unit.test.ts` with ≥6 cases. Mock `@huggingface/inference` `HfInference.textClassification` to control the response shape. Mock `@/lib/telemetry/withTelemetry` to a pass-through that records calls.
       - **Case 1**: `[{label: 'positive', score: 0.92}, {label: 'neutral', score: 0.05}, {label: 'negative', score: 0.03}]` → returns `{score: 0.89, confidence: 0.92, model: 'finbert'}` (pos − neg = 0.92 − 0.03)
       - **Case 2**: All-neutral response → returns `{score: 0, confidence: <max>, model: 'finbert'}`
       - **Case 3**: All-negative response → returns `{score: -<value>, confidence: <max>, model: 'finbert'}`
       - **Case 4**: `process.env.HF_FINBERT_ENDPOINT` unset → returns `{score: null, confidence: null, model: 'finbert', error: 'HF_FINBERT_ENDPOINT not set'}` (existing classifyVia catches; do NOT throw — preserve null-sentinel contract per D-33)
       - **Case 5**: `withTelemetry` is invoked exactly once with `provider_id='finbert-hf'` and a `cost_usd_estimator` that returns `0.0001` regardless of input
       - **Case 6**: HF SDK throws → `{score: null, confidence: null, model: 'finbert', error: <sdk-msg>}`; verify endpoint URL is NOT in the error message (T-19-C-01-01)
  </action>
  <verify>
    <automated>npx vitest run tests/sentiment/finbert-classify.unit.test.ts &amp;&amp; grep -c "withTelemetry('finbert-hf'" src/lib/sentiment/finsentllm.ts | awk '{exit !($1>=1)}'</automated>
  </verify>
  <done>
    `classifyFinBERT` wrapped in `withTelemetry('finbert-hf', ..., { cost_usd_estimator: () => 0.0001 })`. `FINBERT_PINNED_SHA8` exported with the verified-current 8-hex prefix. ≥6 unit tests green. Endpoint URL never appears in any error path.
  </done>
</task>

<task type="checkpoint:human-action" gate="blocking" id="20-B-02-03">
  <name>Task 3: [BLOCKING] Operator: provision HF endpoint + set Vercel env vars</name>
  <files>
    (no files modified — operator-side infrastructure provisioning + Vercel env vars)
  </files>
  <action>
    Operator-only task. The executor must PAUSE here and surface the runbook to the user. Do not proceed to Task 4 until the operator types `approved` per the resume signal. The full operator runbook is in `<how-to-verify>` below; the executor's job at this task is purely (a) display the runbook, (b) wait, (c) on `approved` reply, validate the env vars are now set in the local dev environment by `test -n "$HF_FINBERT_ENDPOINT" &amp;&amp; test -n "$HF_INFERENCE_TOKEN"` (operator may need to `vercel env pull` first to sync to local).
  </action>
  <what-built>
    Tasks 1-2 have:
    (a) documented the env var contract in `.env.example` (with the pinned-SHA convention),
    (b) wrapped `classifyFinBERT` in `withTelemetry('finbert-hf', ...)` so the dashboard tile will populate as soon as the endpoint is reachable,
    (c) shipped the model card.
    The remaining tasks (per-message orchestrator, fallback chain, integration test, dashboard verification) require the endpoint to actually exist before they can be proven correct.
  </what-built>
  <how-to-verify>
    Operator action — please complete these steps and then approve:

    1. **Provision the HF Inference Endpoint** at https://ui.endpoints.huggingface.co/new
       - Model: `ProsusAI/finbert`
       - **Pin the commit SHA**: on the New Endpoint page, after selecting the model, click "Advanced" → set **Revision** to the current `main` SHA (not the literal string `main`). Get the SHA by visiting https://huggingface.co/ProsusAI/finbert/commits/main and copying the latest commit hash. Verify it matches the `FINBERT_PINNED_SHA8` constant from Task 2 (first 8 hex chars).
       - Instance type: **CPU · cpu-medium (1 vCPU · 2GB · $0.033/hr)** per CONTEXT.md line 67
       - Region: **us-east-1** (latency to Vercel default region)
       - Auto-scaling: min 1, max 1 (predictable cost; per-message pass is not bursty enough to warrant scale-out)
       - Security: **Protected** (token-required) — uses `HF_INFERENCE_TOKEN` already in env

    2. **Wait for endpoint to be in `running` state** (typically 3-5 min). Note the URL — should look like `https://<random-id>.us-east-1.aws.endpoints.huggingface.cloud`.

    3. **Set Vercel production env vars** (via `vercel env add` CLI or Vercel dashboard):
       - `HF_FINBERT_ENDPOINT` = `<endpoint-url>/<pinned-sha>` (the literal SHA, NOT `main`; the URL with the SHA appended is what classifyVia uses)
       - `HF_INFERENCE_TOKEN` = `hf_xxx` (your HF user access token; the same one already in `.env.local`)

    4. **Set `PER_MESSAGE_PASS_MODE=shadow`** in Vercel production (per S3 — this is the cutover gate that lets the per-message pass start writing rows, but no consumers read them yet)

    5. **Test the endpoint manually** (bash):
       ```
       curl -s -X POST "$HF_FINBERT_ENDPOINT" \
         -H "Authorization: Bearer $HF_INFERENCE_TOKEN" \
         -H "Content-Type: application/json" \
         -d '{"inputs": "AAPL earnings beat — revenue up 12% YoY"}'
       ```
       Expected: JSON like `[[{"label":"positive","score":0.94},{"label":"neutral","score":0.05},{"label":"negative","score":0.01}]]`. Latency under 2s.

    6. After all five steps, type `approved` and (optionally) paste the test response so the next tasks can use it as a fixture.
  </how-to-verify>
  <resume-signal>Type "approved" once endpoint is provisioned + env vars set + manual curl works. Type "blocked: <reason>" if anything fails.</resume-signal>
  <verify>
    <automated>test -n "$HF_FINBERT_ENDPOINT" &amp;&amp; test -n "$HF_INFERENCE_TOKEN" &amp;&amp; echo "$HF_FINBERT_ENDPOINT" | grep -E "[a-f0-9]{40}|/r-[A-Za-z0-9-]+"</automated>
  </verify>
  <done>
    HF Inference Endpoint provisioned for ProsusAI/finbert at pinned commit SHA on cpu-medium ($0.033/hr) instance in us-east-1. `HF_FINBERT_ENDPOINT` URL contains a 40-hex-char SHA or `/r-` revision identifier. `HF_INFERENCE_TOKEN` set in Vercel production. `PER_MESSAGE_PASS_MODE=shadow` set in Vercel production. Operator-confirmed manual curl returned 200 + valid JSON in under 2s.
  </done>
</task>

<task type="auto" id="20-B-02-04">
  <name>Task 4: Add @xenova/transformers dependency + local-finbert-fallback module</name>
  <files>
    package.json
    src/lib/sentiment/local-finbert-fallback.ts
    tests/sentiment/local-finbert-fallback.unit.test.ts
  </files>
  <read_first>
    - src/lib/sentiment/finsentllm.ts (SentimentScore type — local module returns same shape)
    - https://huggingface.co/docs/transformers.js (verify pipeline('sentiment-analysis', 'ProsusAI/finbert') signature — use Context7 if available)
  </read_first>
  <action>
    1. `npm install @xenova/transformers --save` (current latest as of plan: ^2.x). The package is ~50MB lazy weight + ~500MB peak RAM during inference per package docs.

    2. Create `src/lib/sentiment/local-finbert-fallback.ts`:
       ```typescript
       // Secondary fallback tier for Plan 20-B-02. Lazy-loaded — NEVER import this
       // module at top level. Caller must use:
       //   const mod = await import('./local-finbert-fallback');
       //   const r = await mod.classifyFinBERTLocal(text);
       //
       // Memory profile: ~50MB lazy weight on first call (model download cached
       // in node_modules/.cache/transformers); ~500MB peak RAM during inference.
       // Threat T-20-B-02-04: shadow-mode-only on Vercel functions <512MB. Production
       // primary path is always the HF endpoint; this tier fires only when the
       // endpoint is unreachable.
       //
       // The ProsusAI/finbert weights are pulled by the @xenova/transformers
       // runtime on first invocation; for SHA pinning we rely on the npm package
       // version pin (peer-reviewed in package-lock.json) plus the runtime's
       // own per-model revision behavior. Drift detection is the operator's
       // responsibility via scripts/check-finbert-sha.ts (which checks the HF
       // endpoint pin, not the local pin — local is a degraded fallback).

       import type { SentimentScore } from './finsentllm';

       let pipelinePromise: Promise<unknown> | null = null;

       async function loadPipeline() {
         if (!pipelinePromise) {
           const { pipeline } = await import('@xenova/transformers');
           pipelinePromise = pipeline('sentiment-analysis', 'ProsusAI/finbert');
         }
         return pipelinePromise;
       }

       export async function classifyFinBERTLocal(text: string): Promise<SentimentScore> {
         try {
           const pipe = await loadPipeline() as (input: string) => Promise<Array<{ label: string; score: number }>>;
           const out = await pipe(text);
           // Same reduce logic as finsentllm.reduceLabels — copy here intentionally
           // (avoid coupling the module to a non-exported helper).
           let pos = 0, neg = 0, max = 0;
           for (const r of out) {
             const l = r.label.toLowerCase();
             if (l.startsWith('pos')) pos = r.score;
             else if (l.startsWith('neg')) neg = r.score;
             if (r.score > max) max = r.score;
           }
           return { score: pos - neg, confidence: max, model: 'finbert' };
         } catch (err) {
           const msg = err instanceof Error ? err.message : String(err);
           return { score: null, confidence: null, model: 'finbert', error: msg };
         }
       }
       ```

    3. Create `tests/sentiment/local-finbert-fallback.unit.test.ts`:
       - **Case 1**: Mock `@xenova/transformers` `pipeline()` to return a function yielding positive/neutral/negative response — assert correct reduction
       - **Case 2**: Mock pipeline to throw — assert null sentinel returned, error captured
       - **Case 3**: Lazy-load assertion — verify `@xenova/transformers` is imported via dynamic `import()` and NOT in the module's top-level imports (grep `src/lib/sentiment/local-finbert-fallback.ts` for `^import.*xenova` returns 0 lines)
       - **Case 4**: Pipeline cached across calls — call `classifyFinBERTLocal` twice, assert mock `pipeline()` factory invoked exactly once
  </action>
  <verify>
    <automated>npx vitest run tests/sentiment/local-finbert-fallback.unit.test.ts &amp;&amp; ! grep -E "^import.*@xenova" src/lib/sentiment/local-finbert-fallback.ts</automated>
  </verify>
  <done>
    `@xenova/transformers` in `package.json` dependencies; `classifyFinBERTLocal` returns same `SentimentScore` shape as HF path; lazy-load verified by grep + by mock-call-count test; ≥4 unit tests green.
  </done>
</task>

<task type="auto" id="20-B-02-05">
  <name>Task 5: Implement runPerMessagePass orchestrator with 3-tier fallback chain + cost cap</name>
  <files>
    src/lib/sentiment/per-message-pass.ts
    tests/sentiment/per-message-pass.unit.test.ts
  </files>
  <read_first>
    - src/lib/sentiment/finsentllm.ts (classifyFinBERT signature, FINBERT_PINNED_SHA8 constant added in Task 2)
    - src/lib/sentiment/local-finbert-fallback.ts (Task 4)
    - src/lib/sentiment/observation-store.ts (insertObservation signature from 20-Z-01 interfaces lines 125-162)
    - .planning/phases/20-real-sentiment-analysis/20-Z-01-PLAN.md (composite uniqueness on (ticker, message_id, model_version))
    - src/lib/db.ts (Prisma client singleton — for the cost-cap query reading existing SentimentObservation rows)
  </read_first>
  <action>
    Create `src/lib/sentiment/per-message-pass.ts` implementing the interface in the `<context><interfaces>` block:

    1. **Module-level constants** (cite-and-pin per S1):
       ```typescript
       import { classifyFinBERT, FINBERT_PINNED_SHA8 } from './finsentllm';
       import { insertObservation, SentimentObservationDuplicateError } from './observation-store';
       import { prisma } from '@/lib/db';

       /** CONTEXT.md line 114 — Gemini per-document cost-prohibitive above 50 messages. */
       const VOLUME_GATE = 50;

       /** CONTEXT.md $0.0001/call × 1000 = $0.10/ticker/day budget ceiling. */
       const COST_CAP_MESSAGES_PER_TICKER_PER_DAY = 1000;

       const CLASSIFIER_VERSION = `finbert-prosus-${FINBERT_PINNED_SHA8}`;
       const MODEL_VERSION = `${CLASSIFIER_VERSION}-v1`;  // re-pin → bump to -v2
       ```

    2. **runPerMessagePass logic**:
       - If `mode === 'off'` → return zero-counts result immediately (no work, no telemetry)
       - If `input.messages.length <= VOLUME_GATE` → return zero-counts result; do NOT invoke classifier
       - Query today's classified count for this ticker:
         ```sql
         SELECT COUNT(*) FROM sentiment_observations
         WHERE ticker = $1
           AND classifier_version LIKE 'finbert-prosus-%'
           AND fetched_at >= date_trunc('day', NOW())
         ```
         Use `prisma.$queryRaw` for performance. The result is `today_count`.
       - For each message in `input.messages`:
         - If `today_count + processed_in_this_call >= COST_CAP_MESSAGES_PER_TICKER_PER_DAY`:
           - `cost_capped_count++`; do not classify; emit telemetry once per pass via `recordCallAsync({ provider_id: 'finbert-hf', is_fallback: true, error_class: null, ... })` (note: `is_fallback=true` flags this as a degraded path on the dashboard); continue
         - **Tier 1**: `result = await classifyFinBERT(message.body)` (already telemetered via Task 2 wrapper)
           - If `result.score !== null` → `primary_path_count++`; persist via `insertObservation` with the params below; continue
         - **Tier 2**: dynamically load fallback:
           ```typescript
           const fallback = await import('./local-finbert-fallback');
           result = await fallback.classifyFinBERTLocal(message.body);
           ```
           - If `result.score !== null` → `secondary_path_count++`; persist via `insertObservation`; continue
         - **Tier 3**: null sentinel — `tertiary_path_count++` (== `null_count`); STILL persist a SentimentObservation row with `classifier_score: null` so the failure is visible in the PIT log (per 20-Z-01 D-04 conventions); set `classifier_version` suffix to `${CLASSIFIER_VERSION}-null`; continue
       - **insertObservation params per message**:
         ```typescript
         await insertObservation({
           ticker: input.ticker,
           source: 'stocktwits',
           message_id: message.message_id,
           raw_body: message.body,                   // hashed inside insertObservation per 20-Z-01 T-20-Z-01-02
           classifier_version: result.score !== null ? CLASSIFIER_VERSION : `${CLASSIFIER_VERSION}-null`,
           classifier_score: result.score,
           model_version: MODEL_VERSION,
           decay_weight: null,                       // 20-A-03 calibration job populates later
           author_id: `stocktwits:${message.author_handle}`,  // sha256 hashed inside insertObservation
           author_features_snapshot: message.author_features,
           published_at: message.published_at,
         }).catch((err) => {
           if (err instanceof SentimentObservationDuplicateError) {
             // Same message under same model_version already classified earlier today;
             // skip-and-continue per 20-Z-01 contract. Counts as a no-op (does NOT
             // increment any of the *_path_count fields — they only increment on
             // fresh insertion).
             return;
           }
           throw err;
         });
         ```
       - Return `PerMessagePassResult` aggregating the four counters

    3. Create `tests/sentiment/per-message-pass.unit.test.ts` with ≥7 cases. Mock `classifyFinBERT`, the dynamic-import fallback, `insertObservation`, and `prisma.$queryRaw`.
       - **Case 1** (volume gate off): 30 messages, mode=`shadow` → returns zero-counts; classifier never called; `insertObservation` never called
       - **Case 2** (mode off): 100 messages, mode=`off` → returns zero-counts; classifier never called
       - **Case 3** (happy path): 100 messages, mode=`shadow`, all HF calls succeed → `primary_path_count=100`, all `insertObservation` called with `classifier_version='finbert-prosus-{sha8}'` (use the actual constant from finsentllm)
       - **Case 4** (HF fails, local succeeds): mock `classifyFinBERT` to return `{score: null, ...}`; mock `classifyFinBERTLocal` (via dynamic-import mock) to return `{score: 0.5, confidence: 0.8, model: 'finbert'}` → 100 messages → `secondary_path_count=100`; `insertObservation` called with `classifier_score: 0.5`
       - **Case 5** (both fail): both classifiers return `{score: null}` → `tertiary_path_count=100` (== `null_count`); `insertObservation` STILL called 100× with `classifier_score: null` and `classifier_version` suffix `-null`
       - **Case 6** (cost cap): mock `prisma.$queryRaw` to return `[{count: 950n}]`; pass 100 messages → only first 50 classified, 50 cost-capped; `cost_capped_count=50`; `primary_path_count=50`
       - **Case 7** (duplicate handling): mock `insertObservation` to throw `SentimentObservationDuplicateError` for messages 51-100; assert no exception leaks, counts reflect successful inserts only (1-50 inserted, 51-100 skipped silently)
  </action>
  <verify>
    <automated>npx vitest run tests/sentiment/per-message-pass.unit.test.ts</automated>
  </verify>
  <done>
    `runPerMessagePass` implements the full 3-tier fallback chain + volume gate (>50) + cost cap (1000/ticker/day) + persistence via 20-Z-01 + duplicate-tolerant. ≥7 unit tests green. classifier_version constants pinned to `finbert-prosus-{sha8}` from `FINBERT_PINNED_SHA8`.
  </done>
</task>

<task type="auto" id="20-B-02-06">
  <name>Task 6: Wire runPerMessagePass into sentiment-scan cron route</name>
  <files>
    src/app/api/cron/sentiment-scan/route.ts
  </files>
  <read_first>
    - src/app/api/cron/sentiment-scan/route.ts (current for-each-ticker loop; 20-Z-01 already added an insertObservation call here in the snapshot writer — extend, don't replace)
    - src/lib/data/stocktwits.ts (StocktwitsScoredMessage shape — line 65)
    - src/lib/data/source-package.ts (lines 144-200 — how stocktwits data flows into source package; per-message data is available pre-aggregation)
  </read_first>
  <action>
    Inside the existing for-each-ticker loop in `src/app/api/cron/sentiment-scan/route.ts`, additively add a per-message pass call AFTER the existing snapshot writer (do NOT modify the snapshot writer or any existing code path):

    ```typescript
    // Phase 20-B-02 — per-message FinBERT pass when message_volume > 50.
    // Gated by PER_MESSAGE_PASS_MODE env (off | shadow | on). Each classification
    // persists as a SentimentObservation row (20-Z-01) with classifier_version
    // 'finbert-prosus-{sha8}'. Consumer reads land in 20-A-03 / 20-B-04.
    const perMessageMode = (process.env.PER_MESSAGE_PASS_MODE ?? 'off') as PerMessagePassMode;
    if (perMessageMode !== 'off' && stocktwitsRawMessages != null && stocktwitsRawMessages.length > 50) {
      try {
        const result = await runPerMessagePass({
          ticker,
          messages: stocktwitsRawMessages.map((m) => ({
            message_id: String(m.id),
            body: m.body,
            author_handle: m.user.username,
            published_at: m.created_at ? new Date(m.created_at) : null,
            author_features: {
              account_age_days: null,    // 20-C-03 will populate these
              follower_count: null,
              is_verified: null,
              message_count_30d: null,
            },
          })),
        }, perMessageMode);
        console.log(`[cron:sentiment-scan] per-message pass for ${ticker}:`, result);
      } catch (err) {
        // Logged-and-continue per S3 — failure must not block the snapshot path.
        console.error(`[cron:sentiment-scan] per-message pass failed for ${ticker}:`, err);
      }
    }
    ```

    Notes for the executor:
    - `stocktwitsRawMessages` is the raw upstream message array. If the existing route only has the aggregated `StocktwitsResult` shape, you must (a) lift `fetchStockTwitsSentiment` to also surface the raw `messages: StockTwitsMessage[]` array (additive change to its return type) OR (b) re-fetch from the StockTwits adapter in the cron loop. Prefer (a) — single fetch.
    - The `console.log` of the result is intentional — gives the operator a per-tick visibility check during the 24h shadow window before the dashboard tile populates.
    - DO NOT add a feature flag check beyond `PER_MESSAGE_PASS_MODE` — the volume gate (>50) is the only other condition.
  </action>
  <verify>
    <automated>grep -c "runPerMessagePass" src/app/api/cron/sentiment-scan/route.ts | awk '{exit !($1>=1)}' &amp;&amp; grep -c "PER_MESSAGE_PASS_MODE" src/app/api/cron/sentiment-scan/route.ts | awk '{exit !($1>=1)}' &amp;&amp; npm run typecheck</automated>
  </verify>
  <done>
    Cron route invokes `runPerMessagePass` inside the existing for-each-ticker loop, gated on `PER_MESSAGE_PASS_MODE !== 'off'` AND `stocktwits message count > 50`. Failure mode is logged-and-continue. Snapshot writer untouched. `npm run typecheck` green.
  </done>
</task>

<task type="auto" id="20-B-02-07">
  <name>Task 7: SHA-rot guard script + npm wiring</name>
  <files>
    scripts/check-finbert-sha.ts
    package.json
  </files>
  <read_first>
    - src/lib/sentiment/finsentllm.ts (FINBERT_PINNED_SHA8 export from Task 2)
    - https://huggingface.co/docs/api-inference (verify model info endpoint shape)
  </read_first>
  <action>
    1. Create `scripts/check-finbert-sha.ts`:
       ```typescript
       // Plan 20-B-02 threat T-20-B-02-05 mitigation: monthly SHA-rot guard.
       // GETs https://huggingface.co/api/models/ProsusAI/finbert and asserts the
       // currently-served `sha` still matches FINBERT_PINNED_SHA8. Exits 0
       // healthy / 1 stale.
       //
       // Run via:  npm run check-finbert-sha
       //
       // Wire to a monthly Vercel cron in vercel.json (deferred to a future plan
       // — for now, this is operator-run).

       import { FINBERT_PINNED_SHA8 } from '../src/lib/sentiment/finsentllm';

       async function main() {
         const res = await fetch('https://huggingface.co/api/models/ProsusAI/finbert');
         if (!res.ok) {
           console.error(`HF API returned ${res.status}; cannot verify SHA pin`);
           process.exit(1);
         }
         const model = await res.json() as { sha?: string };
         if (!model.sha) {
           console.error('HF API response missing `sha` field');
           process.exit(1);
         }
         const currentSha8 = model.sha.substring(0, 8);
         if (currentSha8 !== FINBERT_PINNED_SHA8) {
           console.error(
             `SHA DRIFT: pinned ${FINBERT_PINNED_SHA8}, current main ${currentSha8} (full: ${model.sha}).\n` +
             `If this is intentional (vendor re-pin), bump FINBERT_PINNED_SHA8 in src/lib/sentiment/finsentllm.ts ` +
             `AND bump MODEL_VERSION suffix in src/lib/sentiment/per-message-pass.ts from -v1 to -v2.`
           );
           process.exit(1);
         }
         console.log(`OK: pinned SHA ${FINBERT_PINNED_SHA8} matches HF main`);
         process.exit(0);
       }
       main().catch((err) => { console.error(err); process.exit(1); });
       ```

    2. Add to `package.json` `scripts`:
       ```json
       "check-finbert-sha": "tsx scripts/check-finbert-sha.ts"
       ```
       (use the project's existing TS-runner — verify by reading current scripts; if `tsx` isn't present, use `ts-node` or whatever the existing script convention is)
  </action>
  <verify>
    <automated>npm run check-finbert-sha</automated>
  </verify>
  <done>
    Script exits 0 against the live HF API today (because Task 2 pinned the current SHA). `npm run check-finbert-sha` is wired in package.json. Script exits 1 if pinned SHA drifts.
  </done>
</task>

<task type="auto" id="20-B-02-08">
  <name>Task 8: Live integration test (gated by RUN_LIVE_FINBERT)</name>
  <files>
    tests/integration/finbert-hf-endpoint.integration.test.ts
  </files>
  <read_first>
    - src/lib/sentiment/finsentllm.ts (classifyFinBERT)
    - tests/integration/sentiment-observation.integration.test.ts (20-Z-01 — pattern for env-gated live tests)
  </read_first>
  <action>
    Create `tests/integration/finbert-hf-endpoint.integration.test.ts`:
    ```typescript
    import { describe, it, expect } from 'vitest';
    import { classifyFinBERT } from '@/lib/sentiment/finsentllm';

    const RUN = process.env.RUN_LIVE_FINBERT === 'true';

    describe.skipIf(!RUN)('FinBERT HF endpoint — live integration', () => {
      const samples = [
        'AAPL crushed earnings, revenue up 18% YoY',
        'TSLA recall affects 1.2M vehicles; brake software defect',
        'NVDA announces new GPU; benchmarks pending',
        'Fed holds rates steady at 5.25%',
        'GME up 50% on no news; volume spike on options expiry',
      ];

      it('classifies 5 messages within 10s wall-clock total (p95 ≤ 2s)', async () => {
        const start = Date.now();
        const results = await Promise.all(samples.map((s) => classifyFinBERT(s)));
        const elapsedMs = Date.now() - start;
        expect(elapsedMs).toBeLessThan(10_000);
        for (const r of results) {
          expect(r.model).toBe('finbert');
          expect(r.score).not.toBeNull();
          expect(r.confidence).not.toBeNull();
          expect(r.score!).toBeGreaterThanOrEqual(-1);
          expect(r.score!).toBeLessThanOrEqual(1);
          expect(r.confidence!).toBeGreaterThanOrEqual(0);
          expect(r.confidence!).toBeLessThanOrEqual(1);
        }
      });

      it('directional sanity: positive earnings beat scores > 0; recall scores < 0', async () => {
        const [pos, neg] = await Promise.all([
          classifyFinBERT(samples[0]),  // beat
          classifyFinBERT(samples[1]),  // recall
        ]);
        expect(pos.score!).toBeGreaterThan(0);
        expect(neg.score!).toBeLessThan(0);
      });
    });
    ```

    Document in test file header that `RUN_LIVE_FINBERT=true npm run test:integration` is the operator command to fire the gate. Default test runs as skipped — no CI cost.
  </action>
  <verify>
    <automated>RUN_LIVE_FINBERT=true npx vitest run tests/integration/finbert-hf-endpoint.integration.test.ts</automated>
  </verify>
  <done>
    Two integration tests pass under `RUN_LIVE_FINBERT=true` against the operator-provisioned endpoint from Task 3. Latency assertion (<10s for 5 messages) holds. Directional sanity (beat > 0, recall < 0) holds. Default unset env → tests skipped, CI cost zero.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking" id="20-B-02-09">
  <name>Task 9: Verify finbert-hf tile renders on /insights/sentiment-health after one cron tick</name>
  <files>
    (no files modified — operator visual verification of the dashboard tile + DB rows)
  </files>
  <action>
    Operator visual-verification task. The executor must PAUSE here and surface the verification steps to the user. Do not proceed to Task 10 (final commit) until the operator types `approved`. On approval, the executor proceeds to commit the work in Task 10.
  </action>
  <what-built>
    Tasks 1-8 have:
    (a) wrapped `classifyFinBERT` in `withTelemetry('finbert-hf', ...)`,
    (b) wired the per-message pass into the sentiment-scan cron in `shadow` mode,
    (c) provisioned the endpoint (Task 3) and verified live (Task 8).
    Now we need to confirm the 20-Z-03 dashboard surfaces the new provider tile with non-zero data, which is the visible signal that the shadow window has begun and metrics are accumulating toward the cutover gate.
  </what-built>
  <how-to-verify>
    1. **Trigger one cron tick manually** (faster than waiting for the schedule):
       ```
       curl -fs -H "Authorization: Bearer $CRON_SECRET" https://<your-vercel-prod>/api/cron/sentiment-scan
       ```
       Expected: 200 + JSON; logs in `vercel logs --follow` show `[cron:sentiment-scan] per-message pass for <TICKER>: { primary_path_count: N, ... }` for any ticker with > 50 StockTwits messages today.

    2. **Visit the dashboard**:
       Open https://<your-vercel-prod>/insights/sentiment-health in a browser.
       Expected: a tile labeled `finbert-hf` appears in the per-provider grid with `count_24h >= 1`, latency p95 visible (should be under 2000ms), cost ≈ $0.0001 × count.

    3. **Verify the SentimentObservation rows** (optional spot-check via Neon SQL):
       ```sql
       SELECT classifier_version, COUNT(*), MIN(fetched_at), MAX(fetched_at)
       FROM sentiment_observations
       WHERE classifier_version LIKE 'finbert-prosus-%'
         AND fetched_at >= NOW() - INTERVAL '1 hour'
       GROUP BY classifier_version;
       ```
       Expected: one or more rows; `classifier_version` matches `finbert-prosus-{sha8}` from `FINBERT_PINNED_SHA8`.

    4. Type `approved` if all three checks pass; otherwise paste the failure (missing tile, no rows, latency too high) so the executor can investigate.
  </how-to-verify>
  <resume-signal>Type "approved" once finbert-hf tile renders with non-zero count_24h. Type "issue: <description>" otherwise.</resume-signal>
  <verify>
    <automated>curl -fs "$VERCEL_PROD_URL/api/insights/sentiment-health" | grep -c "finbert-hf" | awk '{exit !($1>=1)}'</automated>
  </verify>
  <done>
    `/insights/sentiment-health` renders a `finbert-hf` provider tile with `count_24h >= 1`, latency p95 visible (under 2000ms), cost approximately equal to $0.0001 × count. Spot-check SQL on Neon shows ≥1 SentimentObservation row with `classifier_version` matching `finbert-prosus-{sha8}` from the last hour.
  </done>
</task>

<task type="auto" id="20-B-02-10">
  <name>Task 10: Final commit + shadow-window timer kickoff</name>
  <files>
    .planning/phases/20-real-sentiment-analysis/20-B-02-PLAN.md
  </files>
  <action>
    1. Final test sweep: `npm test &amp;&amp; npm run test:integration &amp;&amp; npm run test:e2e &amp;&amp; npm run check-finbert-sha &amp;&amp; npm run check-model-cards &amp;&amp; npm run check-telemetry-coverage` — all green.

    2. Commit (HEREDOC commit message):
       ```
       feat(20-B-02): FinBERT HF endpoint per-message backstop with 3-tier fallback chain

       Provisions ProsusAI/finbert at pinned commit SHA on $0.033/hr HF CPU
       endpoint; wires classifyFinBERT into per-StockTwits-message pass when
       volume > 50 (Gemini per-doc cost-prohibitive at that scale).

       Fallback chain: HF endpoint → @xenova/transformers local CPU → null
       sentinel. Cost cap 1000 msgs/ticker/day. Each classification persists
       as SentimentObservation row (20-Z-01) tagged finbert-prosus-{sha8} for
       PIT discipline + re-pin partitioning.

       Shadow mode: PER_MESSAGE_PASS_MODE=shadow until 24h verdict criteria
       met (p95 ≤ 2s, kappa ≥ 0.7 vs Gemini per-doc, error rate ≤ 5%, cost
       within budget) — then flip to 'on' for downstream consumption by
       20-A-03 / 20-B-04.

       Threats T-20-B-02-{01..05} mitigated; T-28-003/004 mapped.

       Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
       ```

    3. **Document the shadow-window timer**: append a one-line comment to the bottom of this PLAN.md noting the cutover-eligible date (`commit_date + 24h`) so the operator can run the verdict-criteria check at the right time. Cutover is a separate follow-up commit (out of scope for this plan; gated on the metric thresholds in `shadow_verdict_criteria`).
  </action>
  <verify>
    <automated>git log -1 --oneline | grep -c "20-B-02" | awk '{exit !($1>=1)}'</automated>
  </verify>
  <done>
    All test suites + all CI guards green. Plan committed. Shadow window started. Cutover follow-up tracked in plan footer for the operator.
  </done>
</task>

</tasks>

<verification>

## Numerical Acceptance Criteria

- `grep -c "withTelemetry('finbert-hf'" src/lib/sentiment/finsentllm.ts` ≥ 1
- `grep -c "classifyFinBERT" src/lib/sentiment/per-message-pass.ts` ≥ 1
- `grep -c "await import.*local-finbert-fallback" src/lib/sentiment/per-message-pass.ts` ≥ 1
- `grep -c "insertObservation" src/lib/sentiment/per-message-pass.ts` ≥ 1
- `! grep -E "^import.*@xenova" src/lib/sentiment/local-finbert-fallback.ts` (lazy-load enforced)
- `npm run check-finbert-sha` exits 0 against live HF API at commit time
- `npm run check-model-cards` exits 0 (model card present)
- `npm run check-telemetry-coverage` exits 0 (finbert-hf provider has wrapped call site)
- Unit test suites: `tests/sentiment/finbert-classify.unit.test.ts` (≥6), `tests/sentiment/per-message-pass.unit.test.ts` (≥7), `tests/sentiment/local-finbert-fallback.unit.test.ts` (≥4) — all green
- Live integration test (gated): `RUN_LIVE_FINBERT=true npx vitest run tests/integration/finbert-hf-endpoint.integration.test.ts` — 5 messages classified in <10s
- Operator-side post-deploy: `/api/insights/sentiment-health` returns a `finbert-hf` provider tile with `count_24h >= 1` after one cron tick (Task 9 checkpoint)
- Cost measurement: per-ticker per-day cost ≤ $0.10 measured on a 1000-message batch (verified via 20-Z-03 dashboard cost-per-req × count)
- Shadow verdict criteria (24h post-cutover-eligible): see frontmatter `shadow_verdict_criteria` (latency p95 ≤ 2000ms, cost within budget, Cohen's kappa ≥ 0.7 vs Gemini per-doc on overlap, error rate ≤ 5%)

</verification>

<success_criteria>

Plan complete when ALL of these are true:

1. HF Inference Endpoint provisioned for ProsusAI/finbert at pinned commit SHA (cpu-medium, us-east-1)
2. `HF_FINBERT_ENDPOINT` URL contains a SHA-shaped revision identifier; `HF_INFERENCE_TOKEN` set in Vercel prod (Task 3 operator confirmation)
3. `classifyFinBERT` wrapped in `withTelemetry('finbert-hf', ..., { cost_usd_estimator: () => 0.0001 })`
4. `runPerMessagePass` implements 3-tier fallback chain (HF → @xenova/transformers local → null sentinel) gated on `message_volume > 50`
5. Per-ticker daily cost cap of 1000 messages enforced via prisma count query against existing SentimentObservation rows
6. Each classification persists as SentimentObservation row with `classifier_version='finbert-prosus-{sha8}'` and `model_version='finbert-prosus-{sha8}-v1'`
7. `@xenova/transformers` added to package.json; lazy-loaded only inside the secondary fallback module
8. `scripts/check-finbert-sha.ts` exists, exits 0 against live HF API at commit time
9. Model card `docs/cards/MODEL-CARD-finbert-prosus.md` present per 20-Z-02 template
10. Shadow flag `PER_MESSAGE_PASS_MODE` introduced (off | shadow | on); default `off` in `.env.example`; production set to `shadow` post-Task-3
11. All unit tests green (≥17 tests across 3 files); gated live integration test green when `RUN_LIVE_FINBERT=true`
12. `/insights/sentiment-health` finbert-hf tile renders with non-zero data after one shadow-mode cron tick (Task 9)
13. All five plan-level threats T-20-B-02-{01..05} mitigated as described in `<threat_model>`
14. Plan committed to main with conventional commit message; shadow-window timer noted

</success_criteria>

<output>
After completion, create `.planning/phases/20-real-sentiment-analysis/20-B-02-SUMMARY.md` documenting:
- HF endpoint URL pattern (SHA-pinned), instance type, region (no actual URL — operator-managed secret)
- The `FINBERT_PINNED_SHA8` value committed
- Per-tier success counts measured during the first 24h shadow window
- Cohen's kappa vs 20-B-01 Gemini per-doc on the overlap set (computed at shadow-verdict time)
- Recommended cutover date (commit_date + 24h, contingent on verdict criteria)
- Any unexpected behaviors (cold-start latency spikes, fallback rate, cost vs estimate)
- Forward references to consumers: 20-A-03 (decay), 20-B-04 (source-tier weighting), 20-C-01 (per-source ICIR)
</output>
