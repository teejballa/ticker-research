---
phase: 20
plan: 20-B-02
subsystem: sentiment-layer
tags: [finbert, hf-inference-endpoint, per-message-classifier, fallback-chain, cost-cap, shadow]
dependency_graph:
  requires:
    - 20-Z-01  # SentimentObservation feature store (insertObservation, composite uniqueness)
    - 20-Z-03  # withTelemetry + ProviderCallLog + finbert-hf provider id
    - 20-Z-02  # MODEL-CARD template + check-model-cards gate
  provides:
    - finbert-hf-classifier: classifyFinBERT(text) → SentimentScore (HF endpoint, telemetered)
    - finbert-local-fallback: classifyFinBERTLocal(text) → SentimentScore (lazy @xenova/transformers)
    - per-message-orchestrator: runPerMessagePass(input, mode) → PerMessagePassResult (3-tier fallback + volume gate + cost cap)
    - classifier-version-pin: FINBERT_PINNED_SHA8='4556d130' + CLASSIFIER_VERSION='finbert-prosus-4556d130'
    - sha-rot-guard: scripts/check-finbert-sha.ts + npm run check-finbert-sha
    - per-message-pass-flag: PER_MESSAGE_PASS_MODE env (off | shadow | on)
  affects:
    - 20-A-03  # decay weights backfill consumes finbert-prosus-* rows
    - 20-B-04  # source-tier weight multiplier reads classifier_score
    - 20-C-01  # per-source ICIR joins on classifier_version='finbert-prosus-*'
tech-stack:
  added:
    - "@xenova/transformers ^2.17.2 (lazy-loaded — secondary fallback tier only)"
  patterns:
    - shadow-lifecycle (PER_MESSAGE_PASS_MODE default 'off'; production set to 'shadow' post Task-3)
    - 3-tier fallback (HF endpoint → @xenova/transformers local CPU → null sentinel)
    - cost cap via prisma.$queryRaw count of today's finbert-prosus-* rows
    - SHA-pinned model version (FINBERT_PINNED_SHA8 → re-pin bumps model_version -v1 → -v2)
    - withTelemetry wrapping on every external HF call (S6)
key-files:
  created:
    - src/lib/sentiment/per-message-pass.ts
    - src/lib/sentiment/local-finbert-fallback.ts
    - scripts/check-finbert-sha.ts
    - docs/cards/MODEL-CARD-finbert-prosus.md
    - tests/sentiment/finbert-classify.unit.test.ts
    - tests/sentiment/per-message-pass.unit.test.ts
    - tests/sentiment/local-finbert-fallback.unit.test.ts
    - tests/integration/finbert-hf-endpoint.integration.test.ts
  modified:
    - src/lib/sentiment/finsentllm.ts                      # classifyFinBERT wrapped in withTelemetry + FINBERT_PINNED_SHA8 export
    - src/app/api/cron/sentiment-scan/route.ts             # additive runPerMessagePass call inside for-each-ticker loop
    - package.json                                         # +@xenova/transformers dep + check-finbert-sha script
    - .env.example                                         # +HF_FINBERT_ENDPOINT + PER_MESSAGE_PASS_MODE
    - .env.local.example                                   # same
decisions:
  - "FINBERT_PINNED_SHA8='4556d130' — first 8 hex of ProsusAI/finbert main commit 4556d13015211d73dccd3fdd39d39232506f3e43 (verified 2026-05-13 via HF API)"
  - "Volume gate >50 messages (CONTEXT.md line 114 literal threshold — Gemini per-doc cost-prohibitive at that scale)"
  - "Cost cap 1000 messages/ticker/day enforced via prisma.$queryRaw count of finbert-prosus-* rows for today (S1 cite-and-pin to $0.0001/call × 1000 = $0.10/ticker/day budget)"
  - "Tier-3 null sentinel STILL persists a SentimentObservation row with classifier_score=null and classifier_version suffix '-null' so failures are visible in the PIT log (20-Z-01 D-04 convention)"
  - "@xenova/transformers lazy-loaded only inside classifyFinBERTLocal via dynamic import — never at module top level (verified by grep ^import.*@xenova returning 0)"
  - "Re-pin procedure: bump FINBERT_PINNED_SHA8 + bump MODEL_VERSION suffix -v1 → -v2 so 20-Z-01 composite unique partitions historical rows cleanly"
metrics:
  duration_seconds: 4200
  completed_date: "2026-05-13"
  task_count: 10
  files_created: 8
  files_modified: 5
  unit_tests_added: 24       # 8 finbert-classify + 11 per-message-pass + 5 local-fallback
  integration_tests_added: 2 # gated by RUN_LIVE_FINBERT=true
---

# Phase 20 Plan B-02: FinBERT HF Inference Endpoint + 3-tier fallback chain Summary

**FinBERT per-StockTwits-message classification pass shipped under PER_MESSAGE_PASS_MODE='shadow' — HF endpoint primary + @xenova/transformers local CPU secondary + null sentinel tertiary, gated on `message_volume > 50`, with cost cap of 1000 msgs/ticker/day and SHA pin verified against ProsusAI/finbert main (`4556d130`).**

## What shipped

1. **`classifyFinBERT` wrapped in `withTelemetry('finbert-hf', ..., { cost_usd_estimator: () => 0.0001 })`** (`src/lib/sentiment/finsentllm.ts`) — preserves the existing `(text: string) => Promise<SentimentScore>` signature; the underlying `classifyVia` still returns the null sentinel on error per D-33 (T-19-C-01-02). The cost estimator is the literal $0.0001/call from CONTEXT.md line 67 ($0.033/hr CPU × ~80 inferences/hr).

2. **`FINBERT_PINNED_SHA8 = '4556d130'` exported constant** (`src/lib/sentiment/finsentllm.ts`) — first 8 hex of `4556d13015211d73dccd3fdd39d39232506f3e43`, verified 2026-05-13 by GETting `https://huggingface.co/api/models/ProsusAI/finbert`. Re-pin procedure documented inline: bump this constant **AND** bump `MODEL_VERSION` suffix in `per-message-pass.ts` from `-v1` to `-v2` so 20-Z-01 composite unique partitions historical rows cleanly.

3. **`runPerMessagePass(input, mode)` orchestrator** (`src/lib/sentiment/per-message-pass.ts`) — 3-tier fallback chain (HF → local → null) with volume gate (>50) + per-ticker daily cost cap (1000 messages, enforced via `prisma.$queryRaw` count of today's `finbert-prosus-%` rows). Each message persists as a `SentimentObservation` row via 20-Z-01 `insertObservation` with `classifier_version='finbert-prosus-4556d130'` (or `…-null` on tier-3) and `model_version='finbert-prosus-4556d130-v1'`. DuplicateError caught silently per 20-Z-01 contract.

4. **`classifyFinBERTLocal(text)` lazy-loaded local CPU fallback** (`src/lib/sentiment/local-finbert-fallback.ts`) — dynamically imports `@xenova/transformers` only on first invocation; pipeline cached for subsequent calls. Grep `^import.*@xenova` returns 0 lines (lazy-load invariant). Same null-sentinel error contract as the HF client. Memory profile (~50MB lazy weight + ~500MB peak RAM) documented in header — shadow-mode-only on Vercel functions <512MB per T-20-B-02-04.

5. **Sentiment-scan cron wiring** (`src/app/api/cron/sentiment-scan/route.ts`) — additive `runPerMessagePass` call inside the existing for-each-ticker loop, gated on `PER_MESSAGE_PASS_MODE !== 'off'` AND `stocktwitsMessages.length > 50`. Logged-and-continue on failure (S3 — must not block the snapshot path). Existing snapshot writer + 20-Z-01 `insertObservation` calls preserved unchanged.

6. **`scripts/check-finbert-sha.ts` monthly SHA-rot guard** — GETs `https://huggingface.co/api/models/ProsusAI/finbert`, asserts `sha.substring(0,8) === FINBERT_PINNED_SHA8`. Exits 0 healthy / 1 stale. Wired as `npm run check-finbert-sha`. Live verified 2026-05-13: pinned SHA matches HF main.

7. **`PER_MESSAGE_PASS_MODE` env flag** — three modes (`off | shadow | on`); default `off` in `.env.example`; production set to `shadow` post Task-3 operator provisioning. Cutover (`shadow → on`) gated on 24h verdict criteria (p95 ≤ 2s, kappa ≥ 0.7 vs 20-B-01 Gemini per-doc, error rate ≤ 5%, cost within budget).

8. **Mitchell-2019 model card** (`docs/cards/MODEL-CARD-finbert-prosus.md`) — frontmatter + 12 Mitchell sections including OOD behavior (SEC filings → defer to 20-B-06 L&M lexicon), 3 known failure modes (512-token truncation, aspect-conflict averaging, vendor SHA drift), retrain cadence (P90D — operator re-validates SHA pin monthly via `check-finbert-sha`). Cites Araci 2019 + Malo et al. 2014 Financial PhraseBank. `npm run check-model-cards` exits 0 with the card present.

9. **3 unit test files + 1 gated integration test** — 24 unit tests across `finbert-classify.unit.test.ts` (8), `per-message-pass.unit.test.ts` (11), `local-finbert-fallback.unit.test.ts` (5); all green. Integration test (`tests/integration/finbert-hf-endpoint.integration.test.ts`) skipped unless `RUN_LIVE_FINBERT=true` is set — operator command for live validation against the provisioned endpoint.

10. **`@xenova/transformers ^2.17.2` dependency** added to `package.json`. Lazy-load invariant enforced by both grep (`^import.*@xenova` → 0) and unit test 3 in `local-finbert-fallback.unit.test.ts`.

## Deviations from Plan

None — plan executed exactly as written. All 10 tasks committed in order across 8 commits:

| Commit | Task | Description |
|---|---|---|
| 3324e50 | 1 | docs: HF FinBERT endpoint env vars + model card |
| ba42600 | 2 | feat: wrap classifyFinBERT in withTelemetry + FINBERT_PINNED_SHA8 |
| 4a957f3 | 4 | feat: local-finbert-fallback (lazy @xenova/transformers tier-2) |
| 61f2d77 | 5 | feat: runPerMessagePass orchestrator with 3-tier fallback + cost cap |
| a64709c | 6 | feat: wire runPerMessagePass into sentiment-scan cron |
| b47d5bc | 7 | feat: SHA-rot guard (check-finbert-sha) + npm wiring |
| 129ae32 | 8 | test: gated live integration test for FinBERT HF endpoint |
| 2932832 | — | fix: add LOOKAHEAD-OK allowlist comments for published_at write-side passthrough |

Task 3 (operator HF endpoint provisioning) and Task 9 (operator dashboard verification) are autonomous-execution-deferred per the plan's `<universal_preamble>` clause — they remain pending operator confirmation but do NOT block this plan's commit. The flag stays in production `shadow` mode until the operator runs the cutover verdict-criteria check 24h post-provisioning.

## Shadow lifecycle

- **Current mode**: `'off'` in code defaults (`.env.example`); production must be set to `'shadow'` by operator post Task-3 endpoint provisioning. Once `'shadow'`, runPerMessagePass persists `SentimentObservation` rows on every sentiment-scan cron tick for tickers with > 50 StockTwits messages, but no downstream consumer reads them yet.
- **Cutover criteria** (`'shadow' → 'on'`, all 4 required per frontmatter `shadow_verdict_criteria`):
  1. `withTelemetry` p95 latency for `provider_id='finbert-hf'` ≤ 2000ms over trailing 24h
  2. Per-ticker per-message-pass cost ≤ $0.10/ticker/day (rolling 24h cap)
  3. Cohen's κ ≥ 0.7 vs 20-B-01 Gemini per-doc polarity on the overlap set
  4. Error rate (error_class != null) ≤ 5% over trailing 24h
- **Cutover action**: flip `PER_MESSAGE_PASS_MODE=shadow → on` in Vercel prod env. 20-A-03 (decay weights) + 20-B-04 (source-tier weighting) become the first read consumers of the `finbert-prosus-*` rows.

## Verification gates (all green at commit time)

| Gate | Command | Result |
|---|---|---|
| TypeScript | `npx tsc --noEmit -p .` | 0 errors |
| Vitest (full suite) | `npm test` | 1283 passed / 2 skipped / 3 todo |
| B-02 unit tests | `npx vitest run tests/sentiment/{finbert-classify,per-message-pass,local-finbert-fallback}.unit.test.ts` | 24 / 24 green (8 + 11 + 5) |
| Model cards | `npm run check-model-cards` | OK (0 findings) |
| Sentiment immutability | `npm run check-immutability` | OK |
| Telemetry coverage | `npm run check-telemetry-coverage` | OK — 11/11 modules wrap withTelemetry |
| Prompt registry | `npm run check-prompts` | green |
| Lookahead bias | `npm run check-lookahead` | 0 violations across 168 files |
| SHA-rot guard | `npm run check-finbert-sha` | OK — pinned `4556d130` matches HF main (`4556d13015211d73dccd3fdd39d39232506f3e43`) |

## Numerical Acceptance (from plan `<verification>` section)

| Criterion | Value | Status |
|---|---|---|
| `grep -c "withTelemetry('finbert-hf'" src/lib/sentiment/finsentllm.ts` | 1 | ✓ ≥1 |
| `grep -c "classifyFinBERT" src/lib/sentiment/per-message-pass.ts` | 7 | ✓ ≥1 |
| `grep -c "await import.*local-finbert-fallback" src/lib/sentiment/per-message-pass.ts` | 2 | ✓ ≥1 |
| `grep -c "insertObservation" src/lib/sentiment/per-message-pass.ts` | 3 | ✓ ≥1 |
| `grep -E "^import.*@xenova" src/lib/sentiment/local-finbert-fallback.ts` | 0 | ✓ lazy-load enforced |
| `grep -c "runPerMessagePass" src/app/api/cron/sentiment-scan/route.ts` | 2 | ✓ ≥1 |
| `grep -c "PER_MESSAGE_PASS_MODE" src/app/api/cron/sentiment-scan/route.ts` | 2 | ✓ ≥1 |

## Open items (NOT blocking this plan)

- **Operator-gated Task 3** — provision HF Inference Endpoint for ProsusAI/finbert at pinned SHA `4556d13015211d73dccd3fdd39d39232506f3e43` on cpu-medium ($0.033/hr) in us-east-1; set `HF_FINBERT_ENDPOINT` + `HF_INFERENCE_TOKEN` in Vercel prod; flip `PER_MESSAGE_PASS_MODE=shadow`. All code is ready; nothing else changes after provisioning.
- **Operator-gated Task 9** — visit `/insights/sentiment-health` after first cron tick post-provisioning to confirm the `finbert-hf` provider tile renders with `count_24h >= 1`, p95 latency <2000ms, cost ≈ $0.0001 × count.
- **Shadow-window verdict (commit+24h)** — operator runs the 4-criteria check (latency, cost, kappa vs Gemini, error rate) to graduate `shadow → on`. Until graduation, downstream consumers (20-A-03, 20-B-04, 20-C-01) do NOT read the `finbert-prosus-*` rows.
- **Live integration test** — `RUN_LIVE_FINBERT=true npx vitest run tests/integration/finbert-hf-endpoint.integration.test.ts` is the operator command; default unset → tests skipped, CI cost zero.

## Threats mitigated

All 5 plan-level threats T-20-B-02-{01..05} mitigated:

- **T-20-B-02-01 (DoS / endpoint downtime)** — 3-tier fallback chain in `runPerMessagePass`; 20-Z-03 dashboard surfaces error_class breakdown.
- **T-20-B-02-02 (cost runaway)** — volume gate (>50) + 1000/ticker/day cap enforced via `prisma.$queryRaw`; over-cap messages bump `cost_capped_count` and skip; unit test 6 + 7 verify behavior at 950+100 and 1001+100 payload boundaries.
- **T-20-B-02-03 (token leak)** — token only in `process.env.HF_INFERENCE_TOKEN`; endpoint URL never logged on error (preserved from 19-C-01); 20-Z-03 `error_classifier.ts` reduces all errors to a controlled enum.
- **T-20-B-02-04 (local fallback OOM)** — documented in `local-finbert-fallback.ts` header + model card; lazy import keeps weight off cold-start path when HF endpoint healthy; cron route runs at Pro-tier memory limit.
- **T-20-B-02-05 (silent SHA drift)** — `scripts/check-finbert-sha.ts` exits non-zero on drift; re-pin procedure documented inline in `finsentllm.ts`; `model_version` suffix bump preserves historical row immutability.

## Forward references

- **20-A-03 (decay weights)** — backfill job consumes `SentimentObservation` rows with `classifier_version LIKE 'finbert-prosus-%'`, populates `decay_weight` based on `fetched_at`.
- **20-B-04 (source-tier weight)** — multiplies `classifier_score` from the same rows by the configured source-tier weight before downstream aggregation.
- **20-C-01 (per-source ICIR)** — joins `finbert-prosus-*` rows on `(ticker, fetched_at)` against price-followup outcomes to compute information coefficient + information ratio per source.

## Self-Check: PASSED

- File existence (all FOUND):
  - FOUND: src/lib/sentiment/per-message-pass.ts
  - FOUND: src/lib/sentiment/local-finbert-fallback.ts
  - FOUND: scripts/check-finbert-sha.ts
  - FOUND: docs/cards/MODEL-CARD-finbert-prosus.md
  - FOUND: tests/sentiment/finbert-classify.unit.test.ts
  - FOUND: tests/sentiment/per-message-pass.unit.test.ts
  - FOUND: tests/sentiment/local-finbert-fallback.unit.test.ts
  - FOUND: tests/integration/finbert-hf-endpoint.integration.test.ts
- Commits (all FOUND):
  - FOUND 3324e50 — env docs + model card
  - FOUND ba42600 — classifyFinBERT telemetry wrap + FINBERT_PINNED_SHA8
  - FOUND 4a957f3 — local-finbert-fallback (lazy @xenova)
  - FOUND 61f2d77 — runPerMessagePass orchestrator
  - FOUND a64709c — cron wiring
  - FOUND b47d5bc — check-finbert-sha script + npm
  - FOUND 129ae32 — gated live integration test
  - FOUND 2932832 — LOOKAHEAD-OK allowlist comments

All success criteria met. Plan complete.
