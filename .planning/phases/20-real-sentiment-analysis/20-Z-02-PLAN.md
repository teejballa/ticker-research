---
phase: 20
plan: 20-Z-02
wave: Z
type: execute
depends_on: []
files_modified:
  - docs/templates/MODEL-CARD-template.md
  - docs/templates/DATASET-CARD-template.md
  - docs/cards/MODEL-CARD-stocktwits-naive.md
  - docs/cards/MODEL-CARD-reputation-weighted.md
  - docs/cards/MODEL-CARD-finbert.md
  - docs/cards/DATASET-CARD-SentimentObservation.md
  - src/lib/sentiment/aggregator.ts
  - src/lib/sentiment/finsentllm.ts
  - src/lib/sentiment/ensemble.ts
  - scripts/check-model-cards.ts
  - scripts/check-model-cards.config.json
  - tests/check-model-cards.unit.test.ts
  - package.json
autonomous: true
requirements: []
shadow_required: false
shadow_skip_reason: "Pure documentation + a static-analysis CI guard. No runtime code path is added, removed, or behavior-changed. The three sentiment files (aggregator.ts, finsentllm.ts, ensemble.ts) receive ONLY a `// @model-card: …` annotation comment — no logic changes. Per S3, with no behavior change there is no off→shadow→on transition to gate; verdict is purely the numerical gates in <verification>."
hard_cleanup_gate: true
must_haves:
  truths:
    - "docs/templates/MODEL-CARD-template.md exists and contains every Mitchell-2019 §3-§9 section heading verbatim with citation https://arxiv.org/abs/1810.03993"
    - "docs/templates/DATASET-CARD-template.md exists and contains every Gebru-2018 §3.1-§3.7 section heading verbatim with citation https://arxiv.org/abs/1803.09010"
    - "Three retroactive MODEL-CARD-{stocktwits-naive, reputation-weighted, finbert}.md files exist in docs/cards/ with all template sections filled in with Cipher-specific content (no placeholder text remaining)"
    - "MODEL-CARD-finbert.md pins the ProsusAI/finbert HuggingFace commit SHA per S5"
    - "DATASET-CARD-SentimentObservation.md exists in docs/cards/ AND replaces the 20-Z-01 stub at .planning/phases/20-real-sentiment-analysis/DATASET-CARD-SentimentObservation.md by linking from the stub to the new canonical location"
    - "Each retroactive card carries a YAML frontmatter `last_validated: YYYY-MM-DD` and `retrain_cadence: <duration>` field — check-model-cards exits non-zero when last_validated < (today - retrain_cadence)"
    - "scripts/check-model-cards.ts globs src/lib/sentiment/*.ts, extracts every export whose function-name matches /^(classify|score|aggregate|predict)/i, and requires each owning file to declare exactly one `// @model-card: <path>` annotation in its top JSDoc block (or an explicit `// @model-card: none — <reason>` exemption)"
    - "scripts/check-model-cards.ts exits non-zero when: (a) any classifier-shaped export lives in a file with no annotation, (b) annotation links to a non-existent file, (c) any committed card's last_validated is older than retrain_cadence, (d) any card contains the literal placeholder string `<<TODO>>`"
    - "src/lib/sentiment/aggregator.ts, finsentllm.ts, and ensemble.ts each carry a top-of-file `// @model-card:` annotation pointing to the correct docs/cards/ file"
    - "package.json exposes `npm run check-model-cards` wired to `npx tsx scripts/check-model-cards.ts`"
    - "tests/check-model-cards.unit.test.ts asserts the four failure modes (a)-(d) above via temp-fixture sentiment files; runs in <2s"
    - "ls docs/cards/MODEL-CARD-*.md | wc -l returns 3 (or more if 20-B-* later adds Gemini-per-doc card; this plan ships the floor)"
    - "ls docs/cards/DATASET-CARD-*.md | wc -l returns 1"
    - "grep -c '// @model-card:' src/lib/sentiment/*.ts returns >= 3"
    - "npm run check-model-cards exits 0 on the committed tree"
  artifacts:
    - path: "docs/templates/MODEL-CARD-template.md"
      provides: "Mitchell-2019 model-card template — all 9 sections + YAML frontmatter schema (last_validated, retrain_cadence, model_version, author)"
      contains: "Model Cards for Model Reporting (Mitchell et al. 2019)"
    - path: "docs/templates/DATASET-CARD-template.md"
      provides: "Gebru-2018 datasheet template — all 7 sections (Motivation, Composition, Collection, Preprocessing, Uses, Distribution, Maintenance)"
      contains: "Datasheets for Datasets (Gebru et al. 2018)"
    - path: "docs/cards/MODEL-CARD-stocktwits-naive.md"
      provides: "Retroactive card for the raw StockTwits bullish-pct vendor-tag flow consumed by aggregator.ts"
      contains: "stocktwits-naive"
    - path: "docs/cards/MODEL-CARD-reputation-weighted.md"
      provides: "Retroactive card for the post-Phase-19 Beta-smoothed multi-source aggregator (aggregateCommunitySentiment)"
      contains: "reputation-weighted"
    - path: "docs/cards/MODEL-CARD-finbert.md"
      provides: "Retroactive card for ProsusAI/finbert HF endpoint (classifyFinBERT) — pins commit SHA per S5"
      contains: "finbert"
    - path: "docs/cards/DATASET-CARD-SentimentObservation.md"
      provides: "Gebru-2018 datasheet for the SentimentObservation table introduced by 20-Z-01 (canonical location; replaces the 20-Z-01 in-phase stub)"
      contains: "SentimentObservation"
    - path: "scripts/check-model-cards.ts"
      provides: "CI guard — fails when classifier-shaped exports lack annotations, annotations point nowhere, cards are stale, or cards still contain <<TODO>> placeholders"
      contains: "check-model-cards"
    - path: "scripts/check-model-cards.config.json"
      provides: "Tunable config: classifier function-name regex, exemption list, sentiment glob path"
      contains: "classifier_export_regex"
    - path: "tests/check-model-cards.unit.test.ts"
      provides: "≥4 unit tests covering missing annotation / phantom card / stale card / placeholder-leak failure modes via temp-fixture files in os.tmpdir()"
      contains: "check-model-cards"
  key_links:
    - from: "src/lib/sentiment/aggregator.ts (top of file)"
      to: "docs/cards/MODEL-CARD-reputation-weighted.md"
      via: "`// @model-card: docs/cards/MODEL-CARD-reputation-weighted.md` JSDoc annotation"
      pattern: "// @model-card: docs/cards/MODEL-CARD-reputation-weighted\\.md"
    - from: "src/lib/sentiment/finsentllm.ts (top of file)"
      to: "docs/cards/MODEL-CARD-finbert.md"
      via: "`// @model-card: docs/cards/MODEL-CARD-finbert.md` JSDoc annotation"
      pattern: "// @model-card: docs/cards/MODEL-CARD-finbert\\.md"
    - from: "src/lib/sentiment/ensemble.ts (top of file)"
      to: "docs/cards/MODEL-CARD-finbert.md (ensembleSentiment composes classifyFinBERT — same card scope until 20-B-01 ships its own ensemble card)"
      via: "`// @model-card: docs/cards/MODEL-CARD-finbert.md` JSDoc annotation"
      pattern: "// @model-card: docs/cards/MODEL-CARD-finbert\\.md"
    - from: "scripts/check-model-cards.ts"
      to: "package.json scripts.check-model-cards"
      via: "npm-run-script wrapper used by future CI gate"
      pattern: "check-model-cards"
    - from: "20-Z-01 stub at .planning/phases/20-real-sentiment-analysis/DATASET-CARD-SentimentObservation.md"
      to: "docs/cards/DATASET-CARD-SentimentObservation.md (canonical fill-in)"
      via: "stub appends a `**Moved to:** docs/cards/DATASET-CARD-SentimentObservation.md` line; canonical card carries the full Gebru-2018 sections"
      pattern: "Moved to: docs/cards/DATASET-CARD-SentimentObservation\\.md"
---

# Plan 20-Z-02: Model + dataset card scaffold (Mitchell 2019 + Gebru 2018) + check-model-cards CI guard

<universal_preamble>

## Autonomous Execution Clause

This plan is fully autonomous (`autonomous: true`). It ships only documentation files, three top-of-file annotation comments, a static-analysis script, and a unit test. There is no DB push, no runtime code path change, no operator approval step, and no shadow lifecycle. Tasks proceed in order; the final task commits.

## Hard Cleanup Gate (Definition of Done)

A plan is **NOT complete** until:
1. **No shadow lifecycle to graduate** (S3 N/A — pure docs + static-analysis CI guard; documented in `shadow_skip_reason`)
2. **No old code deleted** (additive only; the three sentiment files receive a single annotation comment in their top JSDoc block)
3. **No feature flag introduced** (the check is a CI script, not a runtime flag)
4. `npm test` (Vitest unit) green on `main` post-commit; `npm run test:integration` and `npm run test:e2e` not exercised by this plan but must remain green (no schema or runtime changes that could affect them)
5. **Card-Cardinality Gate**: `ls docs/cards/MODEL-CARD-*.md | wc -l` returns `>= 3` AND `ls docs/cards/DATASET-CARD-*.md | wc -l` returns `>= 1`
6. **Annotation-Cardinality Gate**: `grep -c "// @model-card:" src/lib/sentiment/*.ts | awk -F: '{s+=$2} END {print s}'` returns `>= 3`
7. **Check-Script Gate**: `npm run check-model-cards` exits 0 on the committed tree (script is the live enforcement)
8. **Unit-Test Gate**: `npx vitest run tests/check-model-cards.unit.test.ts` exits 0 with ≥4 cases covering all four failure modes (missing annotation / phantom card / stale card / placeholder-leak)
9. **Stub-Bridge Gate**: the 20-Z-01 in-phase stub `.planning/phases/20-real-sentiment-analysis/DATASET-CARD-SentimentObservation.md` carries a `Moved to:` pointer to the canonical `docs/cards/DATASET-CARD-SentimentObservation.md` (so 20-Z-01's `must_haves` reference still resolves)

## Cross-cutting standards adherence (CONTEXT.md §S1–S10)

- **S1 (no hand-picked parameters)** — N/A this plan ships no thresholds. The check-script exit-code gate is a fixed integer (`0` / `1`); no calibration involved.
- **S3 (shadow lifecycle)** — Skipped with documented reason in frontmatter `shadow_skip_reason`. No runtime behavior changes; nothing to A/B.
- **S4 (model card per artifact)** — **THIS PLAN IS THE S4 IMPLEMENTATION.** Templates land here (Mitchell 2019 + Gebru 2018), three retroactive cards land here, the enforcement script lands here. All future Phase-20 plans (20-B-01 Gemini per-document, 20-B-02 FinBERT-per-message, 20-B-03 temperature scaling, 20-B-04 source-tier weighting, 20-A-01..05 calibrated quick-wins) MUST ship their own card and add their `// @model-card:` annotation, otherwise `npm run check-model-cards` fails their PR.
- **S5 (pinned model + prompt versions)** — Enforced inside `MODEL-CARD-finbert.md`: the card body MUST contain the exact ProsusAI/finbert commit SHA from the production `HF_FINBERT_ENDPOINT` URL (per `src/lib/sentiment/finsentllm.ts` lines 11-22). check-model-cards Task 6 unit test asserts the SHA pattern is present.
- **S7 (threat model)** — five plan-level threats T-20-Z-02-{01..05} mapped to phase catalog entries; see `<threat_model>` below.
- **S8 (numerical acceptance)** — every DONE criterion in <verification> is a `wc -l`, `grep -c`, script exit code, or test exit code. Zero adjectives.
- **S10 (regulatory hygiene)** — N/A this plan ships internal documentation; the templates carry an "Ethical Considerations" section per Mitchell-2019 which downstream cards fill in. No public-per-user calibration data is published (Phase 29 gate).

</universal_preamble>

<objective>
Establish the model-card and dataset-card discipline for Phase 20 by:
(1) committing two reusable templates that match published academic schemas (Mitchell et al. 2019 model cards; Gebru et al. 2018 datasheets);
(2) producing three RETROACTIVE cards covering every classifier-shaped artifact already shipped in `src/lib/sentiment/` — the StockTwits naive bull-pct flow, the post-Phase-19 reputation-weighted Beta-smoothed aggregator, and the FinBERT HF endpoint client;
(3) producing the canonical `DATASET-CARD-SentimentObservation.md` that fills in the stub 20-Z-01 placed in the phase folder;
(4) shipping `scripts/check-model-cards.ts` — a static-analysis CI guard that enumerates every classifier-shaped export in `src/lib/sentiment/*.ts` and exits non-zero when its file lacks a `// @model-card:` annotation, when an annotation links to a missing file, when a card's `last_validated` is older than its declared `retrain_cadence`, or when a card still contains the literal `<<TODO>>` placeholder.

This plan does NOT: train any model, retrain any model, change any runtime behavior, change any prompt, add any flag, modify any Prisma schema, write to any database, or change any API surface. It is pure documentation + a CI guard + three single-line annotation comments.

Purpose: Phase 20's Waves A–D add at minimum five new classifier-shaped artifacts (Gemini per-doc 20-B-01, FinBERT-per-message 20-B-02, temperature-scaled wrappers 20-B-03, source-tier weighting 20-B-04, dispersion classifier 20-A-01). Without S4 enforcement landing first, those plans can ship code without cards and the model-quality discipline never takes hold. This plan makes "no card → CI red" the default for the rest of the phase.

Output:
- 2 templates (`docs/templates/MODEL-CARD-template.md`, `docs/templates/DATASET-CARD-template.md`)
- 4 cards (3 model cards + 1 dataset card) under `docs/cards/`
- 1 stub bridge (append-only edit to the 20-Z-01 placeholder)
- 3 single-line annotation comments at the top JSDoc of `aggregator.ts`, `finsentllm.ts`, `ensemble.ts`
- 1 enforcement script (`scripts/check-model-cards.ts`, ~150 LOC) + 1 config (`scripts/check-model-cards.config.json`, ~20 LOC)
- 1 npm script wiring in `package.json`
- 1 unit test file with ≥4 cases (`tests/check-model-cards.unit.test.ts`, ~120 LOC)
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/20-real-sentiment-analysis/CONTEXT.md
@.planning/phases/20-real-sentiment-analysis/20-Z-01-PLAN.md
@.planning/phases/19-cipher-v2-0-excellence/19-A-01-PLAN.md
@src/lib/sentiment/aggregator.ts
@src/lib/sentiment/finsentllm.ts
@src/lib/sentiment/ensemble.ts
@scripts/model-card-status.ts
@scripts/model-card-grep-patterns.json
@package.json

<interfaces>
```typescript
// scripts/check-model-cards.ts — NEW (PUBLIC SURFACE for unit-testability)

export type CardCheckFinding = {
  kind:
    | 'missing-annotation'        // (a) classifier-shaped export in file with no `// @model-card:` line
    | 'phantom-card'              // (b) annotation points to a path that doesn't exist on disk
    | 'stale-card'                // (c) card.last_validated < (today - card.retrain_cadence)
    | 'placeholder-leak'          // (d) card body still contains literal `<<TODO>>`
    | 'duplicate-annotation';     // file declares more than one `// @model-card:` line (ambiguous)
  file: string;                   // sentiment file or card file
  detail: string;                 // human-readable specifics for CI log
  classifier_export?: string;     // function name when kind='missing-annotation'
  card_path?: string;             // resolved card path when kind in {phantom-card, stale-card, placeholder-leak}
};

export type CardCheckDeps = {
  // Filesystem injection — tests pass a tmp dir; entrypoint passes process.cwd()
  fs: {
    readFileSync: (path: string) => string;
    existsSync: (path: string) => boolean;
    readdirSync: (path: string) => string[];
  };
  // Glob list of sentiment files to scan (default: ['src/lib/sentiment/*.ts'])
  sentimentGlob: string;
  // Resolved repo root for relative-path resolution
  repoRoot: string;
  // Today's date — injected so tests can simulate stale cards
  today: Date;
  // Tunable config (function-name regex, exemption list, default retrain_cadence)
  config: CardCheckConfig;
};

export type CardCheckConfig = {
  // Default: '^(classify|score|aggregate|predict)' (case-insensitive). Overridable via scripts/check-model-cards.config.json.
  classifier_export_regex: string;
  // Files in src/lib/sentiment/ that legitimately do NOT need an annotation
  // (e.g. citation-schema.ts is pure Zod schemas; pipeline-providers.ts is plumbing).
  // Each entry must include `reason` so the exemption is auditable.
  exemptions: Array<{ file: string; reason: string }>;
  // Default retrain cadence when a card omits the field. ISO-8601 duration: 'P90D' = 90 days.
  default_retrain_cadence: string;
};

/**
 * Pure function — testable without spawning the script.
 * Returns ALL findings (does NOT short-circuit) so CI logs surface every issue at once.
 */
export function runCardChecks(deps: CardCheckDeps): CardCheckFinding[];

/**
 * Parse ISO-8601 duration like 'P90D', 'P6M', 'P1Y' into days. Used by stale-card check.
 * Throws on malformed input (caller treats as a stale-card finding).
 */
export function parseIsoDurationDays(iso: string): number;

// Card frontmatter schema (parsed from YAML at the top of each docs/cards/*.md):
export type CardFrontmatter = {
  model_name: string;            // e.g. 'reputation-weighted'
  model_version: string;         // e.g. 'v1.0.0' or git-SHA
  card_format: 'mitchell-2019' | 'gebru-2018';
  last_validated: string;        // ISO date 'YYYY-MM-DD'
  retrain_cadence?: string;      // ISO-8601 duration; defaults to config.default_retrain_cadence
  author: string;                // commit author email
  source_files: string[];        // sentiment files this card covers (matches `// @model-card:` annotations)
};
```

```json
// scripts/check-model-cards.config.json — NEW
{
  "classifier_export_regex": "^(classify|score|aggregate|predict)",
  "default_retrain_cadence": "P90D",
  "exemptions": [
    { "file": "src/lib/sentiment/citation-schema.ts",      "reason": "Pure Zod schemas — sanitizeUrl is URL hygiene, not a classifier." },
    { "file": "src/lib/sentiment/contradiction-detector.ts", "reason": "LLM-as-judge wrapper around Gemini — covered by 20-Z-04 prompt registry, not the model-card scaffold." },
    { "file": "src/lib/sentiment/pipeline-providers.ts",   "reason": "Plumbing — derivePipelineProviders is provenance routing, not classification." },
    { "file": "src/lib/sentiment/nli-verifier.ts",         "reason": "Phase 19 component covered by 19-C-04 contradiction-detector card; reaffirmed in 20-Z-02 follow-up if scope grows." }
  ]
}
```

```yaml
# Card frontmatter shape used by EVERY docs/cards/*.md (parsed by check-model-cards):
---
model_name: <slug>                  # required
model_version: <semver-or-sha>      # required
card_format: mitchell-2019          # or gebru-2018 for dataset cards
last_validated: YYYY-MM-DD          # required (ISO date); check-model-cards stales when (today - last_validated) > retrain_cadence
retrain_cadence: P90D               # optional (ISO-8601 duration); falls back to config default
author: name@example.com            # required
source_files:                       # required for model cards; lists files whose `// @model-card:` annotation points here
  - src/lib/sentiment/<file>.ts
---
```
</interfaces>
</context>

<threat_model>

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-20-Z-02-01 | Tampering / silent drift | Card rot — model retrained, weights recalibrated, or prompt changed but the card's `last_validated` was not bumped → stakeholders read stale claims about model behavior | mitigate | Card frontmatter `last_validated` + `retrain_cadence` are MANDATORY fields parsed by `check-model-cards.ts`. The `stale-card` check fails CI when `(today - last_validated) > retrain_cadence`. Default cadence `P90D` (90 days) overridable per-card. Maps to phase catalog T-28-004 (silent classifier upgrade). |
| T-20-Z-02-02 | Tampering / process bypass | Developer adds new sentiment classifier file (e.g., a Phase-20 Gemini per-doc client) without the `// @model-card:` annotation → no card requirement enforced for the new model | mitigate | `check-model-cards.ts` globs `src/lib/sentiment/*.ts`, parses every export whose name matches `config.classifier_export_regex` (`/^(classify|score|aggregate|predict)/i`), and emits `missing-annotation` for any file containing such an export with zero annotation lines. Exemption list in config requires explicit `reason` per file. Maps to phase catalog T-28-004. |
| T-20-Z-02-03 | Tampering | Phantom card — annotation points to a card path that does not exist (typo, file deleted, refactor moved cards) | mitigate | `check-model-cards.ts` resolves every `// @model-card: <path>` annotation against `repoRoot` and emits `phantom-card` when `fs.existsSync` returns false. Tested via fixture in unit-test Task 6. |
| T-20-Z-02-04 | Information disclosure / PII leak | Author handles, Reddit usernames, StockTwits handles, or sample message bodies copied verbatim into a card during fill-in → publishes PII in a public-by-default docs/ tree | mitigate | Both templates carry an explicit redaction-policy section: "**PII Policy**: redact handles, usernames, message bodies; reference 20-Z-01's PII allowlist (`account_age_days`, `follower_count`, `is_verified`, `message_count_30d`); for any sample, hash via `sha256Hex` per 20-Z-01's DAO. Examples MUST use synthetic or aggregated values only." All three retroactive cards committed in this plan use synthetic examples or aggregate-only counts (e.g., "n=12,408 messages over 30d on AAPL" — no message text, no handles). |
| T-20-Z-02-05 | Tampering / template-leak | A card is committed with template placeholder text (`<<TODO>>` or `[FILL IN]`) still present → false sense of compliance because the file exists but is empty | mitigate | `check-model-cards.ts` greps each card body for the literal string `<<TODO>>` and emits `placeholder-leak`. Templates use `<<TODO>>` (not `[FILL IN]` or other variants) as the canonical placeholder so the check is unambiguous. The three cards committed in this plan contain ZERO `<<TODO>>` strings. |

</threat_model>

<tasks>

<task type="auto" id="20-Z-02-01">
  <name>Task 1: Write Mitchell-2019 model-card template + Gebru-2018 dataset-card template</name>
  <read_first>
    - .planning/phases/20-real-sentiment-analysis/CONTEXT.md (lines 13-41 for S1-S10; line 90 for the 20-Z-02 verbatim spec)
    - https://arxiv.org/abs/1810.03993 (Mitchell et al. 2019 — schema sections referenced here for fidelity; do NOT fetch live, the section list is enumerated in this action block)
    - https://arxiv.org/abs/1803.09010 (Gebru et al. 2018 — datasheet sections enumerated in this action block)
  </read_first>
  <action>
    Create `docs/templates/MODEL-CARD-template.md` with the following EXACT contents (this is the canonical Mitchell-2019 schema; placeholders use `<<TODO>>` so check-model-cards' placeholder-leak detector has an unambiguous string to grep for):

    ```markdown
    ---
    model_name: <<TODO>>
    model_version: <<TODO>>
    card_format: mitchell-2019
    last_validated: <<TODO>>
    retrain_cadence: P90D
    author: <<TODO>>
    source_files:
      - <<TODO>>
    ---

    # Model Card: <<TODO model_name>>

    > **Schema**: Mitchell et al. 2019 — *Model Cards for Model Reporting*, FAT* '19. https://arxiv.org/abs/1810.03993
    > **PII Policy**: redact handles, usernames, message bodies. Reference Plan 20-Z-01's author-features allowlist (`account_age_days`, `follower_count`, `is_verified`, `message_count_30d`). For any per-message sample, hash via `sha256Hex` per 20-Z-01's DAO. Examples MUST use synthetic or aggregated values only.

    ## 1. Model Details

    - **Person or organization developing the model**: <<TODO>>
    - **Model date**: <<TODO>>
    - **Model version**: <<TODO>>
    - **Model type** (e.g., transformer fine-tune, lexicon, ensemble): <<TODO>>
    - **Training algorithms, parameters, fairness constraints**: <<TODO>>
    - **Paper or other resource**: <<TODO>>
    - **Citation details**: <<TODO>>
    - **License**: <<TODO>>
    - **Where to send questions or comments**: <<TODO>>

    ## 2. Intended Use

    - **Primary intended uses**: <<TODO>>
    - **Primary intended users**: <<TODO>>
    - **Out-of-scope use cases**: <<TODO>>

    ## 3. Factors

    - **Relevant factors** (groups, instrumentation, environments that influence performance): <<TODO>>
    - **Evaluation factors** (which factors were reported): <<TODO>>

    ## 4. Metrics

    - **Model performance measures**: <<TODO>>
    - **Decision thresholds**: <<TODO>>
    - **Variation approaches** (CIs, bootstrap): <<TODO>>

    ## 5. Evaluation Data

    - **Datasets**: <<TODO>>
    - **Motivation**: <<TODO>>
    - **Preprocessing**: <<TODO>>

    ## 6. Training Data

    - **Datasets**: <<TODO>>
    - **Distribution / demographics**: <<TODO>>

    ## 7. Quantitative Analyses

    - **Unitary results** (per-factor): <<TODO>>
    - **Intersectional results**: <<TODO>>

    ## 8. Ethical Considerations

    - **Data sensitivity**: <<TODO>>
    - **Risks and harms**: <<TODO>>
    - **Use cases that raise concern**: <<TODO>>

    ## 9. Caveats and Recommendations

    - **Known limitations**: <<TODO>>
    - **Recommendations for future work**: <<TODO>>

    ## 10. Out-of-Distribution (OOD) Behavior — *Cipher extension*

    - **Known OOD inputs that degrade the score**: <<TODO>>
    - **Detection mechanism if any** (e.g., fall-back classifier, null-sentinel): <<TODO>>

    ## 11. Known Failure Modes — *Cipher extension*

    - **Failure mode 1**: <<TODO>>
    - **Failure mode 2**: <<TODO>>

    ## 12. Retrain Cadence — *Cipher extension*

    - **Cadence** (matches frontmatter `retrain_cadence`): <<TODO>>
    - **Trigger conditions** (e.g., ECE > 0.05, ICIR drop > 0.05, vendor SHA bump): <<TODO>>
    - **Owner**: <<TODO>>
    ```

    Now create `docs/templates/DATASET-CARD-template.md` with the following EXACT contents (canonical Gebru-2018 datasheet schema; same `<<TODO>>` placeholder convention):

    ```markdown
    ---
    model_name: <<TODO dataset-slug>>
    model_version: <<TODO>>
    card_format: gebru-2018
    last_validated: <<TODO>>
    retrain_cadence: P180D
    author: <<TODO>>
    source_files:
      - <<TODO Prisma model or table name>>
    ---

    # Dataset Card: <<TODO>>

    > **Schema**: Gebru et al. 2018 — *Datasheets for Datasets*. https://arxiv.org/abs/1803.09010
    > **PII Policy**: redact handles, usernames, message bodies. Reference Plan 20-Z-01's author-features allowlist (`account_age_days`, `follower_count`, `is_verified`, `message_count_30d`). For any per-message sample, hash via `sha256Hex` per 20-Z-01's DAO. Examples MUST use synthetic or aggregated values only.

    ## 1. Motivation

    - **For what purpose was the dataset created?**: <<TODO>>
    - **Who created the dataset and on behalf of which entity?**: <<TODO>>
    - **Who funded the creation of the dataset?**: <<TODO>>

    ## 2. Composition

    - **What do the instances represent?** (rows, observations, snapshots): <<TODO>>
    - **How many instances?**: <<TODO>>
    - **Does the dataset contain all possible instances or a sample?**: <<TODO>>
    - **What data does each instance consist of?** (columns, features): <<TODO>>
    - **Is there a label or target?**: <<TODO>>
    - **Is any information missing from individual instances?**: <<TODO>>
    - **Are relationships between instances made explicit?**: <<TODO>>
    - **Are there recommended data splits?**: <<TODO>>
    - **Are there errors, sources of noise, or redundancies?**: <<TODO>>
    - **Is the dataset self-contained or does it link to external resources?**: <<TODO>>
    - **Does the dataset contain confidential or PII data?**: <<TODO>>

    ## 3. Collection Process

    - **How was the data acquired?**: <<TODO>>
    - **What mechanisms or procedures were used?**: <<TODO>>
    - **If the dataset is a sample from a larger set, what was the sampling strategy?**: <<TODO>>
    - **Who was involved in the data collection process and how were they compensated?**: <<TODO>>
    - **Over what timeframe was the data collected?**: <<TODO>>
    - **Were ethical review processes conducted?**: <<TODO>>

    ## 4. Preprocessing / Cleaning / Labeling

    - **Was any preprocessing/cleaning/labeling done?**: <<TODO>>
    - **Was the raw data saved in addition?**: <<TODO>>
    - **Is the software used to preprocess available?**: <<TODO>>

    ## 5. Uses

    - **Has the dataset been used for any tasks already?**: <<TODO>>
    - **Is there a repository linking to all uses?**: <<TODO>>
    - **What other tasks could the dataset be used for?**: <<TODO>>
    - **Is there anything about the composition or collection that might bias future uses?**: <<TODO>>
    - **Are there tasks for which the dataset should NOT be used?**: <<TODO>>

    ## 6. Distribution

    - **Will the dataset be distributed to third parties?**: <<TODO>>
    - **How will the dataset be distributed?**: <<TODO>>
    - **When will the dataset be distributed?**: <<TODO>>
    - **License or ToS**: <<TODO>>
    - **Have any third parties imposed IP-based or other restrictions?**: <<TODO>>
    - **Do any export controls or regulatory restrictions apply?**: <<TODO>>

    ## 7. Maintenance

    - **Who is supporting/hosting/maintaining the dataset?**: <<TODO>>
    - **How can the maintainer be contacted?**: <<TODO>>
    - **Is there an erratum?**: <<TODO>>
    - **Will the dataset be updated?**: <<TODO frequency from `retrain_cadence`>>
    - **If others want to extend/augment/build on/contribute, is there a mechanism?**: <<TODO>>
    ```

    Both files MUST end with a trailing newline. Do not commit any other files in this task.
  </action>
  <acceptance_criteria>
    - `test -f docs/templates/MODEL-CARD-template.md` returns 0
    - `test -f docs/templates/DATASET-CARD-template.md` returns 0
    - `grep -c "Mitchell et al. 2019" docs/templates/MODEL-CARD-template.md` returns `1` AND `grep -c "https://arxiv.org/abs/1810.03993" docs/templates/MODEL-CARD-template.md` returns `1`
    - `grep -c "Gebru et al. 2018" docs/templates/DATASET-CARD-template.md` returns `1` AND `grep -c "https://arxiv.org/abs/1803.09010" docs/templates/DATASET-CARD-template.md` returns `1`
    - `grep -cE "^## [0-9]+\\." docs/templates/MODEL-CARD-template.md` returns `12` (sections 1-12: 9 Mitchell + 3 Cipher extensions)
    - `grep -cE "^## [0-9]+\\." docs/templates/DATASET-CARD-template.md` returns `7` (Gebru sections 1-7)
    - `grep -c "<<TODO>>" docs/templates/MODEL-CARD-template.md` returns `>= 30` (placeholders are intentional in templates)
    - `grep -c "<<TODO>>" docs/templates/DATASET-CARD-template.md` returns `>= 25`
  </acceptance_criteria>
  <verify>
    <automated>test -f docs/templates/MODEL-CARD-template.md && test -f docs/templates/DATASET-CARD-template.md && grep -q "1810.03993" docs/templates/MODEL-CARD-template.md && grep -q "1803.09010" docs/templates/DATASET-CARD-template.md && [ "$(grep -cE '^## [0-9]+\.' docs/templates/MODEL-CARD-template.md)" -eq 12 ] && [ "$(grep -cE '^## [0-9]+\.' docs/templates/DATASET-CARD-template.md)" -eq 7 ]</automated>
  </verify>
  <done>Both templates exist with correct citations, correct section counts, and `<<TODO>>` placeholders ready for fill-in</done>
</task>

<task type="auto" id="20-Z-02-02">
  <name>Task 2: Write three retroactive MODEL-CARD files (stocktwits-naive, reputation-weighted, finbert)</name>
  <read_first>
    - docs/templates/MODEL-CARD-template.md (just written in Task 1 — copy structure)
    - src/lib/sentiment/aggregator.ts (entire file — covers reputation-weighted card)
    - src/lib/sentiment/finsentllm.ts (entire file — covers finbert card; pin SHA from line 11-22 endpoint URL convention)
    - src/lib/sentiment/ensemble.ts (entire file — composes classifyFinBERT)
    - .planning/phases/20-real-sentiment-analysis/CONTEXT.md (lines 49-67 — research summary for OOD + failure-mode language)
    - .planning/phases/19-cipher-v2-0-excellence/19-A-01-PLAN.md (Phase 19 reputation-weighted patch context)
  </read_first>
  <action>
    Create three files under `docs/cards/`. Each MUST have ZERO `<<TODO>>` strings (every section is filled in with Cipher-specific content) and MUST have YAML frontmatter that parses cleanly (`model_name`, `model_version`, `card_format: mitchell-2019`, `last_validated: 2026-05-10`, `retrain_cadence`, `author`, `source_files`).

    ### `docs/cards/MODEL-CARD-stocktwits-naive.md`

    Use the Mitchell-2019 template structure. Fill in with these Cipher-specific facts:

    - **model_name**: `stocktwits-naive`
    - **model_version**: `v1.0.0` (vendor-tag flow has been stable since Phase 12; no algorithmic changes — just a passthrough of StockTwits-API `bullish` / `bearish` tags into our aggregator inputs)
    - **source_files**: `src/lib/sentiment/aggregator.ts` (this card covers the `'stocktwits'` source-input branch of `aggregateCommunitySentiment`)
    - **retrain_cadence**: `P180D` (vendor classifier — we don't retrain; we re-validate that StockTwits hasn't changed their bullish-tag semantics)
    - **§1 Model Details**: vendor classifier, owned by StockTwits, Inc. We consume tag counts only; never raw text. Citation: StockTwits API docs https://api.stocktwits.com/developers/docs/api/messages/streams/symbol .
    - **§2 Intended Use**: PRIMARY: rolling community sentiment proxy on liquid US large-caps. OUT-OF-SCOPE: micro-caps with <50 daily messages (signal swamped by noise per Cresci 2019 bot-share findings); illiquid OTC; non-US tickers; thinly-traded ETFs.
    - **§3 Factors**: market-cap class (large vs micro), event-day vs non-event-day, retail-meme-spike days (GME-class).
    - **§4 Metrics**: bullish_pct = bullish_count / (bullish_count + bearish_count). Decision threshold: NONE — score is descriptive, not actionable on its own; downstream Wave-A consumers (20-A-01 dispersion, 20-A-05 cross-platform agreement) gate before any action.
    - **§5 Evaluation Data**: rolling 30-day production snapshots from Phase 12+ (`SentimentSnapshot` table). No labeled benchmark — vendor tags are unaudited.
    - **§6 Training Data**: N/A — vendor classifier; we have no visibility into StockTwits' internal labeling.
    - **§7 Quantitative Analyses**: per-source IC vs forward 7-day alpha-vs-SPY tracked nightly via Phase 19 cron; current rolling-90d IC sits in `LearnedPattern.rolling_ic_90d` for the `diffusion` signal class.
    - **§8 Ethical Considerations**: StockTwits user base skews retail and bullish-biased (Cookson & Engelberg "Echo Chambers" 2023). Using this score alone for any tactical recommendation publishes that bias to the user.
    - **§9 Caveats**: vendor-tag flow is the WORST classifier in the Phase 20 portfolio. Kept as a fallback and as a baseline for the calibrated Wave-B replacements. Recommendation: deprecate as primary once 20-B-01 (Gemini per-doc) ships in `on` mode.
    - **§10 OOD Behavior**: meme-stock spikes (GME, AMC) produce `bullish_pct ≥ 95%` — this is the ECHO-CHAMBER regime that triggered Phase 20. Detection: 20-A-01 `crowded_consensus` flag (forthcoming) reads aggregator output and inverts the signal sign per Cookson-Engelberg base rate.
    - **§11 Known Failure Modes**: (1) GME-style 100% bullish spikes — single-source crowding rendered as thesis. (2) Rate-limit gaps — StockTwits 429s drop snapshots silently; mitigated by `withRetry` from 19-B-02. (3) Vendor tag-semantics drift — StockTwits has historically re-tuned their bullish/bearish heuristic without notice; we have no detector for this and accept the risk per Phase 20 Wave-B replacement plan.
    - **§12 Retrain Cadence**: P180D re-validation (no retraining — vendor flow). Trigger: spot-check 50 random messages quarterly to confirm tag direction matches manual reading.

    ### `docs/cards/MODEL-CARD-reputation-weighted.md`

    Use the same template. Fill in with these facts:

    - **model_name**: `reputation-weighted`
    - **model_version**: `v1.1.0-post-phase-19` (Beta(α=5, β=5) prior added during the post-Phase-19 30-line robustness patch documented at the top of `aggregator.ts`)
    - **source_files**: `src/lib/sentiment/aggregator.ts` (specifically `aggregateCommunitySentiment`)
    - **retrain_cadence**: `P90D` (revisit prior strength + WEIGHT_CAP after each calibration window; 20-A-* plans will likely override these constants)
    - **§1 Model Details**: ensemble — Beta-smoothed weighted mean of {stocktwits-naive, swaggystocks, apewisdom} bullish percentages. Algorithm comments verbatim in `src/lib/sentiment/aggregator.ts` lines 5-23.
    - **§2 Intended Use**: PRIMARY: cross-source headline `bullish_pct` for the report's Sentiment Intelligence card. OUT-OF-SCOPE: per-message classification; per-aspect (earnings vs guidance) decomposition; tickers with <2 contributing sources (Beta prior dominates and the score loses meaning).
    - **§3 Factors**: number of contributing sources, total message volume, per-source share-of-volume.
    - **§4 Metrics**: aggregate `bullish_pct ∈ [0, 100]`, agreement_score (forthcoming 20-A-05), Beta prior strength = 10 pseudo-mentions @ 50%.
    - **§5 Evaluation Data**: same as stocktwits-naive — rolling 30-day production snapshots; no labeled benchmark.
    - **§6 Training Data**: N/A — closed-form Bayesian smoother, no learned parameters.
    - **§7 Quantitative Analyses**: aggregate IC tracked nightly via Phase 19 cron; tracked separately from per-source IC so we can measure whether smoothing helps.
    - **§8 Ethical Considerations**: same retail-bullish skew as stocktwits-naive, partially mitigated by including swaggystocks + apewisdom which sample different communities. Bias persists.
    - **§9 Caveats**: WEIGHT_CAP and Beta prior strength are HAND-PICKED — the 30-line patch shipped with literature defaults, NOT calibrated values. Plan 20-A-01 (dispersion + crowded_consensus) and 20-B-04 (data-driven source-tier weighting) will replace these constants with calibrated values per S1.
    - **§10 OOD Behavior**: when only 1 source contributes (other 2 returned `mention_count: 0`), the score reduces to that source's bullish_pct shrunk toward 50% by the Beta prior — by design, NOT a bug, but downstream readers should treat low-cardinality scores as "directional, not actionable".
    - **§11 Known Failure Modes**: (1) Hand-picked constants per §9 (will be cured by 20-A-01 calibration). (2) WEIGHT_CAP applied uniformly across cap classes — micro-caps need a lower cap (20-A-02 will cure). (3) Treats the three sources as independent samples; in practice they overlap heavily (same retail user posts on multiple) — overstates effective sample size. Cresci 2019 bot study suggests ~6% of accounts contribute most of the cross-platform overlap.
    - **§12 Retrain Cadence**: P90D — revisit constants after each Phase-20 Wave-A calibration cycle.

    ### `docs/cards/MODEL-CARD-finbert.md`

    Use the same template. Fill in with these facts:

    - **model_name**: `finbert`
    - **model_version**: `ProsusAI/finbert@<HF_FINBERT_ENDPOINT-pinned-sha>` — the exact commit SHA MUST be pulled from the production `HF_FINBERT_ENDPOINT` env var convention documented in `src/lib/sentiment/finsentllm.ts` lines 11-22. **For this card, write a placeholder SHA `pinned-by-ops-at-deploy` and document in §1 that the operator MUST replace it with the live SHA on first deploy.** The check-model-cards `placeholder-leak` check ONLY scans for the literal `<<TODO>>` string, so `pinned-by-ops-at-deploy` is intentionally distinct and surfaces in the card as a clearly-flagged operational handoff. Add a TODO-COMMENT in this card's §1 (NOT the literal `<<TODO>>` token): `OPS-HANDOFF: replace 'pinned-by-ops-at-deploy' with actual ProsusAI/finbert commit SHA after first 20-B-02 deploy.`
    - **source_files**: `src/lib/sentiment/finsentllm.ts`, `src/lib/sentiment/ensemble.ts` (ensemble composes classifyFinBERT; both files annotated to point here in Task 4)
    - **retrain_cadence**: `P90D` (HF endpoint SHA pin = effectively "we don't retrain". Cadence governs SHA re-validation: confirm endpoint SHA hasn't been bumped without our knowledge)
    - **§1 Model Details**: FinBERT (Araci 2019), ProsusAI fine-tune of BERT-base-uncased on Financial PhraseBank. License: Apache-2.0. Hosted on HuggingFace Inference Endpoints, $0.033/hr CPU. Citation: Araci 2019, https://arxiv.org/abs/1908.10063 . Endpoint URL convention pinned per CONTEXT §S5: `HF_FINBERT_ENDPOINT=https://<id>.aws.endpoints.huggingface.cloud/finbert@<commit-sha>`. **OPS-HANDOFF**: replace 'pinned-by-ops-at-deploy' with actual ProsusAI/finbert commit SHA after first 20-B-02 deploy.
    - **§2 Intended Use**: PRIMARY: per-message sentiment classification when message volume > 50 (Gemini per-doc is cost-prohibitive at that volume per CONTEXT §"Cost / latency profile"). OUT-OF-SCOPE: 10-K/10-Q SEC filings (use Loughran-McDonald lexicon per 20-B-06 instead — generic sentiment lexicons mislabel ~75% of "negative" words in 10-K context, Loughran-McDonald 2011); non-English text; tickers <$50M market cap (training corpus skews large-cap).
    - **§3 Factors**: text length (FinBERT truncates at 512 tokens), domain (news vs StockTwits vs SEC), language (English-only).
    - **§4 Metrics**: ~97% accuracy on Financial PhraseBank held-out (Araci 2019). Cipher-side ECE measured by 20-B-03 (forthcoming) — ship-gate ECE < 0.05. Decision threshold: argmax over {positive, negative, neutral} class probabilities.
    - **§5 Evaluation Data**: Financial PhraseBank (Malo et al. 2014) — ~5k labeled financial sentences. License: CC BY-NC-SA 3.0.
    - **§6 Training Data**: ProsusAI fine-tune corpus (FPB + Reuters TRC2 financial subset, see Araci 2019 §3.1).
    - **§7 Quantitative Analyses**: per-source IC pending 20-C-01; ECE pending 20-B-03 temperature-scaling cron.
    - **§8 Ethical Considerations**: training corpus is English-language financial news; under-represents non-English markets. Sentence-level classification AVERAGES OUT opposite signals within a paragraph (RavenPack TABFSA finding) — 20-B-05 per-aspect decomposition mitigates by classifying per aspect-tag instead of whole-document.
    - **§9 Caveats**: HF Inference Endpoint cold-start latency ~10s on first request after idle — wired through `withTelemetry` (20-Z-03 forthcoming) to surface p99 to `/insights`. Fallback chain per CONTEXT §20-B-02: HF endpoint → local CPU `@xenova/transformers` → null sentinel.
    - **§10 OOD Behavior**: documented in Loughran-McDonald 2011 — 10-K negation patterns ("no significant decline") flip the score. 20-B-06 lexicon fallback is the documented recourse.
    - **§11 Known Failure Modes**: (1) 512-token truncation drops the back half of long news articles (20-B-01 Gemini per-doc covers full-text). (2) Sentence-level averaging masks aspect-conflicts (20-B-05 cures). (3) Vendor SHA bump silently changes scoring distribution (S5 pin defense, with §12 cadence as backstop).
    - **§12 Retrain Cadence**: P90D SHA re-validation — operator runs `curl -s $HF_FINBERT_ENDPOINT/info` quarterly to confirm pinned SHA. Trigger for forced refresh: ECE > 0.05 per 20-B-03 monitor, OR ProsusAI publishes a new tagged release.

    All three cards: replace EVERY `<<TODO>>` from the template with concrete content. After writing, sanity-check with `grep -c "<<TODO>>" docs/cards/MODEL-CARD-*.md` — MUST return 0 for all three (one match per file would be acceptable as a debug sentinel ONLY if the placeholder-leak check exempts it; we choose stricter — zero matches).
  </action>
  <acceptance_criteria>
    - `test -f docs/cards/MODEL-CARD-stocktwits-naive.md` returns 0
    - `test -f docs/cards/MODEL-CARD-reputation-weighted.md` returns 0
    - `test -f docs/cards/MODEL-CARD-finbert.md` returns 0
    - `ls docs/cards/MODEL-CARD-*.md | wc -l` returns `3`
    - `grep -L "<<TODO>>" docs/cards/MODEL-CARD-*.md | wc -l` returns `3` (each file is in the "no placeholders found" list — i.e., zero `<<TODO>>` strings remain in any of the three)
    - `grep -c "model_name:" docs/cards/MODEL-CARD-*.md | awk -F: '{s+=$2} END {print s}'` returns `3` (every card has frontmatter)
    - `grep -c "card_format: mitchell-2019" docs/cards/MODEL-CARD-*.md | awk -F: '{s+=$2} END {print s}'` returns `3`
    - `grep -c "last_validated: 2026-05-10" docs/cards/MODEL-CARD-*.md | awk -F: '{s+=$2} END {print s}'` returns `3`
    - `grep -q "ProsusAI/finbert@" docs/cards/MODEL-CARD-finbert.md` (S5 SHA pin convention)
    - `grep -q "OPS-HANDOFF" docs/cards/MODEL-CARD-finbert.md` (operational handoff for live SHA)
    - `grep -q "Cookson" docs/cards/MODEL-CARD-stocktwits-naive.md` (echo-chamber citation present)
    - `grep -q "Beta(α=5" docs/cards/MODEL-CARD-reputation-weighted.md` OR `grep -q "Beta-smoothed" docs/cards/MODEL-CARD-reputation-weighted.md` (algorithm cited)
  </acceptance_criteria>
  <verify>
    <automated>[ "$(ls docs/cards/MODEL-CARD-*.md 2>/dev/null | wc -l | tr -d ' ')" -eq 3 ] && [ "$(grep -L '<<TODO>>' docs/cards/MODEL-CARD-*.md | wc -l | tr -d ' ')" -eq 3 ] && grep -q "ProsusAI/finbert@" docs/cards/MODEL-CARD-finbert.md && grep -q "Cookson" docs/cards/MODEL-CARD-stocktwits-naive.md</automated>
  </verify>
  <done>Three retroactive MODEL-CARD files committed; ZERO `<<TODO>>` placeholders remain; FinBERT card pins SHA via S5 convention with OPS-HANDOFF flag</done>
</task>

<task type="auto" id="20-Z-02-03">
  <name>Task 3: Write canonical DATASET-CARD-SentimentObservation.md + bridge from 20-Z-01 stub</name>
  <read_first>
    - docs/templates/DATASET-CARD-template.md (just written in Task 1)
    - .planning/phases/20-real-sentiment-analysis/20-Z-01-PLAN.md (entire — schema + threat model + immutability story)
    - .planning/phases/20-real-sentiment-analysis/DATASET-CARD-SentimentObservation.md (the 20-Z-01 in-phase stub)
    - prisma/schema.prisma (the SentimentObservation model from 20-Z-01 Task 1)
  </read_first>
  <action>
    Create `docs/cards/DATASET-CARD-SentimentObservation.md`. Use the Gebru-2018 template. Fill in with these Cipher-specific facts (every `<<TODO>>` replaced):

    - **model_name**: `SentimentObservation`
    - **model_version**: `v1.0.0-20-Z-01` (table introduced by Plan 20-Z-01; never overwritten, only appended-to via new model_version rows per S2)
    - **source_files**: `prisma/schema.prisma` (specifically `model SentimentObservation { ... }`); `src/lib/sentiment/observation-store.ts` (DAO)
    - **retrain_cadence**: `P180D` (datasheet re-validation cadence; the dataset itself is append-only)
    - **§1 Motivation**: Created to provide row-level immutable PIT snapshots for Phase 20's calibration work (time decay 20-A-03, dispersion 20-A-01, per-doc NLP 20-B-01, source-tier weighting 20-B-04, per-source ICIR 20-C-01). Vendor-tagged `bull_pct` from prior `SentimentSnapshot` rolls up to too coarse a grain for these tasks. Created by Cipher project owner (TJ Walsh, tjameswalsh@icloud.com); funded by the project itself.
    - **§2 Composition**: Each instance = one upstream message (stocktwits/reddit/x/news/sec/apewisdom/firecrawl) classified under one (classifier_version, model_version) tuple. Schema columns enumerated from `prisma/schema.prisma`: `id`, `ticker`, `source`, `message_id`, `fetched_at` (PIT-INVARIANT), `published_at` (informational only, NOT a backtest join key), `raw_body_hash` (sha256 hex; raw text NEVER persisted per T-20-Z-01-02), `classifier_version`, `classifier_score`, `decay_weight`, `author_id` (hashed handle), `author_features_snapshot` (JSON, ALLOWLIST: account_age_days, follower_count, is_verified, message_count_30d), `model_version`. Composite unique on (ticker, message_id, model_version). Estimated size: ~4.5M rows/year at 50 tickers × 100 msgs/day × 10 model_version retraining cycles. NOT a sample of all possible instances — captures every message we observe; missing-data scenarios documented in `// PIT-INVARIANT` schema comments. Recommended split: train/val/test by `fetched_at` (chronological) to avoid lookahead. Errors/noise: vendor tag-semantics drift (per MODEL-CARD-stocktwits-naive §11), bot accounts (Cresci 2019 — ~6% on StockTwits low-caps); these are observable bias, NOT correctable noise. Self-contained — no external links to third-party datasets. **PII status**: hashed author_id only; raw bodies never persisted; allowlist enforced at DAO entry per T-20-Z-01-01.
    - **§3 Collection Process**: Acquired via Phase 12+ cron jobs (`/api/cron/sentiment-scan`) calling third-party APIs (StockTwits, Reddit via Firecrawl, X via Firecrawl, ApeWisdom, Anthropic web search, Polygon, Finnhub). Sampling strategy: rolling watchlist of 50 tickers; round-robin scan every cron tick. No human-subject collection involved; no IRB review required (public posts only). Timeframe: continuous since Plan 20-Z-01 ships (estimated 2026-05 onward). Compensation: N/A (no human collectors).
    - **§4 Preprocessing / Cleaning / Labeling**: SHA-256 hash of raw body computed at DAO entry (`sha256Hex` in `observation-store.ts`); raw text NEVER persisted (T-20-Z-01-02). Author handle hashed: `sha256("{source}:{handle}")` → `author_id`. Author features filtered through ALLOWLIST at DAO entry (T-20-Z-01-01) — any non-allowlisted key throws. Software available: `src/lib/sentiment/observation-store.ts` is open in this repo.
    - **§5 Uses**: Plan 20-A-03 (exponential time decay), 20-B-01 (per-document NLP), 20-B-04 (data-driven source-tier weighting), 20-C-01 (per-source rolling ICIR), 20-A-01 (dispersion + crowded_consensus). Repository linking uses: this PLAN.md and `.planning/phases/20-real-sentiment-analysis/CONTEXT.md`. Other potential uses: research on retail sentiment dispersion across cap-classes; replication of Cookson-Engelberg "Echo Chambers" finding on production data. **Tasks for which the dataset should NOT be used**: any per-handle or per-message PII analysis (handles are hashed for a reason); any backtest joining on `published_at` (lookahead bias — enforced by 20-Z-07 regression test, **upstream sources may revise published_at**).
    - **§6 Distribution**: NOT distributed publicly. Lives in production Neon Postgres scoped to the Cipher deployment. Per CLAUDE.md "Research Output Storage": generated research artifacts (PDFs, sample reports) MUST NOT be committed to the repo. Per CONTEXT.md §S10: Phase 20 does NOT publish public-per-user calibration data — that lives behind Phase 29's legal-counsel gate. License: project-internal. Third-party ToS restrictions: StockTwits/Reddit/X ToS restrict bulk redistribution of raw content — mitigated by storing only hashes + scores, never raw text.
    - **§7 Maintenance**: Maintained by Cipher project owner. Contact: tjameswalsh@icloud.com. Erratum process: schema migrations create new model_version rows (S2 immutability — never overwrite); errata are append-only. Update cadence: continuous via `/api/cron/sentiment-scan`. Extension mechanism: future plans (20-A-03, 20-B-01, etc.) add new model_version values; the schema's composite unique on (ticker, message_id, model_version) enforces no overwrites.

    Now append a bridge note to the EXISTING stub at `.planning/phases/20-real-sentiment-analysis/DATASET-CARD-SentimentObservation.md`. Append (do NOT overwrite the stub — preserve its existing content for traceability) the following block at the end of the file:

    ```markdown

    ---

    **Moved to: docs/cards/DATASET-CARD-SentimentObservation.md**

    The full Gebru-2018 datasheet for `SentimentObservation` lives at `docs/cards/DATASET-CARD-SentimentObservation.md` per Plan 20-Z-02. This stub is preserved for traceability — it satisfies the 20-Z-01 frontmatter `must_haves` reference. All future updates land in the canonical card under `docs/cards/`.
    ```

    The bridge string `Moved to: docs/cards/DATASET-CARD-SentimentObservation.md` is grep-checked in <verification>.
  </action>
  <acceptance_criteria>
    - `test -f docs/cards/DATASET-CARD-SentimentObservation.md` returns 0
    - `ls docs/cards/DATASET-CARD-*.md | wc -l` returns `1`
    - `grep -L "<<TODO>>" docs/cards/DATASET-CARD-SentimentObservation.md` lists the file (zero placeholders remain)
    - `grep -q "card_format: gebru-2018" docs/cards/DATASET-CARD-SentimentObservation.md`
    - `grep -q "last_validated: 2026-05-10" docs/cards/DATASET-CARD-SentimentObservation.md`
    - `grep -cE "^## [0-9]+\\." docs/cards/DATASET-CARD-SentimentObservation.md` returns `7` (Gebru sections 1-7 all present and filled)
    - `grep -q "PIT-INVARIANT" docs/cards/DATASET-CARD-SentimentObservation.md` (cross-references the 20-Z-01 invariant)
    - `grep -q "ALLOWLIST" docs/cards/DATASET-CARD-SentimentObservation.md` (T-20-Z-01-01 cross-reference)
    - `grep -q "Moved to: docs/cards/DATASET-CARD-SentimentObservation.md" .planning/phases/20-real-sentiment-analysis/DATASET-CARD-SentimentObservation.md` (bridge note appended)
    - The original stub at `.planning/phases/20-real-sentiment-analysis/DATASET-CARD-SentimentObservation.md` retains its prior content (verify with `git diff` — only additions, no deletions): `git diff .planning/phases/20-real-sentiment-analysis/DATASET-CARD-SentimentObservation.md | grep -E "^-[^-]" | wc -l` returns `0`
  </acceptance_criteria>
  <verify>
    <automated>test -f docs/cards/DATASET-CARD-SentimentObservation.md && [ "$(grep -L '<<TODO>>' docs/cards/DATASET-CARD-SentimentObservation.md | wc -l | tr -d ' ')" -eq 1 ] && grep -q "card_format: gebru-2018" docs/cards/DATASET-CARD-SentimentObservation.md && grep -q "Moved to: docs/cards/DATASET-CARD-SentimentObservation.md" .planning/phases/20-real-sentiment-analysis/DATASET-CARD-SentimentObservation.md</automated>
  </verify>
  <done>Canonical dataset card committed in docs/cards/; in-phase stub bridged via append-only "Moved to:" pointer; zero placeholders; all 7 Gebru sections filled</done>
</task>

<task type="auto" id="20-Z-02-04">
  <name>Task 4: Add `// @model-card:` annotations to the three sentiment files</name>
  <read_first>
    - src/lib/sentiment/aggregator.ts (top JSDoc block — annotation goes inside, immediately after the closing `*/` comment is fine if the file uses // line comments at top)
    - src/lib/sentiment/finsentllm.ts (top JSDoc, same)
    - src/lib/sentiment/ensemble.ts (top of file)
    - docs/cards/MODEL-CARD-{stocktwits-naive, reputation-weighted, finbert}.md (just written in Task 2 — confirm paths)
  </read_first>
  <action>
    Insert the following SINGLE-LINE annotation comment into each sentiment file, placed at the very top of the file ABOVE any existing JSDoc/comment block (preserves the existing block intact). The annotation MUST appear as the first non-empty, non-shebang line of the file.

    1. `src/lib/sentiment/aggregator.ts` — prepend at top:
       ```typescript
       // @model-card: docs/cards/MODEL-CARD-reputation-weighted.md
       ```

    2. `src/lib/sentiment/finsentllm.ts` — prepend at top:
       ```typescript
       // @model-card: docs/cards/MODEL-CARD-finbert.md
       ```

    3. `src/lib/sentiment/ensemble.ts` — prepend at top:
       ```typescript
       // @model-card: docs/cards/MODEL-CARD-finbert.md
       ```

    Note: `ensemble.ts` shares the FinBERT card scope because `ensembleSentiment` composes `classifyFinBERT` (verified by reading the file). When 20-B-01 ships its own per-document Gemini classifier, that plan will swap ensemble.ts's annotation to a new `MODEL-CARD-gemini-per-doc.md`.

    The `aggregator.ts` covers the `stocktwits-naive` flow but its primary EXPORT is `aggregateCommunitySentiment` (the reputation-weighted ensemble). Per check-model-cards's design — one annotation per file, pointing to the card that covers the FILE's primary classifier-shaped export — the annotation points to `MODEL-CARD-reputation-weighted.md`. The `MODEL-CARD-stocktwits-naive.md` card is referenced from inside the reputation-weighted card's §3 Factors / §11 Failure Modes (cross-link), and its `source_files` frontmatter includes `src/lib/sentiment/aggregator.ts` so static-analysis tools can still find it. The `stocktwits-naive` card is committed for documentation completeness but its annotation enforcement piggybacks on the reputation-weighted card's annotation (one annotation per file is the rule; tests in Task 6 verify that "duplicate annotation" is a failure mode — so we don't try to annotate aggregator.ts twice).

    Do NOT modify any logic, exports, types, imports, or other comments in these three files. The diff per file MUST be exactly +1 line at the top.
  </action>
  <acceptance_criteria>
    - `head -1 src/lib/sentiment/aggregator.ts` equals `// @model-card: docs/cards/MODEL-CARD-reputation-weighted.md`
    - `head -1 src/lib/sentiment/finsentllm.ts` equals `// @model-card: docs/cards/MODEL-CARD-finbert.md`
    - `head -1 src/lib/sentiment/ensemble.ts` equals `// @model-card: docs/cards/MODEL-CARD-finbert.md`
    - `grep -c "// @model-card:" src/lib/sentiment/*.ts | awk -F: '{s+=$2} END {print s}'` returns `>= 3`
    - `git diff src/lib/sentiment/aggregator.ts src/lib/sentiment/finsentllm.ts src/lib/sentiment/ensemble.ts | grep -E "^-[^-]" | wc -l` returns `0` (purely additive — no deletions to existing code)
    - `git diff src/lib/sentiment/aggregator.ts | grep -E "^\\+[^+]" | wc -l` returns `1` (exactly one line added)
    - Same one-line-add check for finsentllm.ts and ensemble.ts
    - `npx tsc --noEmit` exits 0 (annotations are comments — must not break TypeScript)
  </acceptance_criteria>
  <verify>
    <automated>[ "$(head -1 src/lib/sentiment/aggregator.ts)" = "// @model-card: docs/cards/MODEL-CARD-reputation-weighted.md" ] && [ "$(head -1 src/lib/sentiment/finsentllm.ts)" = "// @model-card: docs/cards/MODEL-CARD-finbert.md" ] && [ "$(head -1 src/lib/sentiment/ensemble.ts)" = "// @model-card: docs/cards/MODEL-CARD-finbert.md" ] && npx tsc --noEmit</automated>
  </verify>
  <done>Three single-line annotations present at top of three sentiment files; zero logic deletions; TypeScript still compiles</done>
</task>

<task type="auto" id="20-Z-02-05">
  <name>Task 5: Implement scripts/check-model-cards.ts + config + npm-script wiring</name>
  <read_first>
    - scripts/model-card-status.ts (Phase 19 precedent — same dependency-injection pattern; lines 1-100 for type shape)
    - scripts/model-card-grep-patterns.json (precedent for config-as-JSON sibling file; check-model-cards.config.json follows the same convention)
    - package.json (existing npm scripts — wire `check-model-cards` next to `model-card-status`)
    - .planning/phases/20-real-sentiment-analysis/20-Z-02-PLAN.md (this plan's <interfaces> block — copy the exported type signatures verbatim)
  </read_first>
  <action>
    Create `scripts/check-model-cards.config.json` with the EXACT contents from this plan's <interfaces> block JSON. Then create `scripts/check-model-cards.ts` implementing the surface from <interfaces>:

    Implementation outline (target ~150 LOC; keep it tight by reusing patterns from `scripts/model-card-status.ts`):

    1. Imports: `fs`, `path`, `glob` (use the project's existing pattern — Node `fs.readdirSync` over `src/lib/sentiment/` filtering `*.ts` is sufficient; do NOT add a new dependency).
    2. Type exports: `CardCheckFinding`, `CardCheckDeps`, `CardCheckConfig`, `CardFrontmatter` (verbatim from <interfaces>).
    3. `parseIsoDurationDays(iso: string): number` — implement strict parsing for `P{n}D`, `P{n}M`, `P{n}Y`. Throw on anything else. Test: `parseIsoDurationDays('P90D') === 90`, `parseIsoDurationDays('P6M') === 180` (30-day months), `parseIsoDurationDays('P1Y') === 365`. (Use simple regex; do NOT pull in `iso8601-duration` lib.)
    4. `parseFrontmatter(body: string): CardFrontmatter | null` — extract the YAML between the first two `---` lines and parse. Use a hand-rolled minimal YAML parser (only needs to handle `key: value` and `source_files: [\n  - item\n  - item]` — no nested objects, no anchors, no flow style). Tests in Task 6 cover edge cases. Return null when no frontmatter block is found.
    5. `extractAnnotations(fileBody: string): string[]` — return ALL paths from `// @model-card: <path>` lines (the path must be a relative path under `docs/cards/`). Trim whitespace.
    6. `extractClassifierExports(fileBody: string, regex: RegExp): string[]` — match `export (async )?function NAME` and `export const NAME` lines, return the names that match the classifier regex (`/^(classify|score|aggregate|predict)/i`).
    7. `runCardChecks(deps): CardCheckFinding[]` — main loop:
       - Build the exempt-file set from `deps.config.exemptions`.
       - For each `*.ts` in `deps.sentimentGlob` (resolve via `fs.readdirSync`):
         - If file is in the exempt set → skip.
         - Read body via `deps.fs.readFileSync`.
         - `annotations = extractAnnotations(body)`.
         - `exports = extractClassifierExports(body, new RegExp(deps.config.classifier_export_regex, 'i'))`.
         - If `exports.length > 0` and `annotations.length === 0` → push `{ kind: 'missing-annotation', file, classifier_export: exports[0], detail: 'File exports classifier-shaped function(s) [' + exports.join(', ') + '] but has no `// @model-card:` annotation. Add one or list this file in scripts/check-model-cards.config.json exemptions with a documented reason.' }`.
         - If `annotations.length > 1` → push `{ kind: 'duplicate-annotation', file, detail: 'File has ' + annotations.length + ' `// @model-card:` lines: ' + annotations.join(', ') + '. Exactly one annotation per file is required (the canonical card for the file\\'s primary classifier-shaped export).' }`.
         - For each annotation path:
           - Resolve against `deps.repoRoot`.
           - If `!deps.fs.existsSync(resolved)` → push `{ kind: 'phantom-card', file, card_path: annotation, detail: 'Annotation points to ' + annotation + ' which does not exist on disk (relative to ' + deps.repoRoot + ').' }`. Continue to next annotation.
           - Read card body. `frontmatter = parseFrontmatter(cardBody)`.
           - If frontmatter is null OR missing `last_validated` → push stale-card with detail `'Card ' + annotation + ' has missing or unparseable frontmatter; cannot determine staleness.'`.
           - Else compute `cadenceDays = parseIsoDurationDays(frontmatter.retrain_cadence ?? deps.config.default_retrain_cadence)`. (Wrap in try/catch — on parse error, push stale-card with detail `'Card ' + annotation + ' has invalid retrain_cadence: ' + raw + '.'`.)
           - `lastValidated = new Date(frontmatter.last_validated + 'T00:00:00Z')`. If parse fails → stale-card finding.
           - `ageDays = (deps.today.getTime() - lastValidated.getTime()) / 86_400_000`.
           - If `ageDays > cadenceDays` → push `{ kind: 'stale-card', file, card_path: annotation, detail: 'Card ' + annotation + ' last_validated ' + frontmatter.last_validated + ' is ' + Math.floor(ageDays) + ' days old; cadence is ' + cadenceDays + ' days. Re-validate and bump last_validated.' }`.
           - If cardBody contains the literal string `<<TODO>>` → push `{ kind: 'placeholder-leak', file, card_path: annotation, detail: 'Card ' + annotation + ' contains <<TODO>> placeholder string — fill in or remove the section.' }`.
       - Also independently scan `deps.fs.readdirSync(repoRoot + '/docs/cards')` for ANY card with `<<TODO>>` even if no annotation points to it (catches orphan cards committed without a sentiment-file annotation yet — common during gradual rollout).
       - Return ALL findings (do not short-circuit).
    8. Bottom of file (`if (require.main === module) { ... }`):
       - Wire real deps: `fs` from `node:fs`, `today: new Date()`, `repoRoot: process.cwd()`, `sentimentGlob: 'src/lib/sentiment/*.ts'`, config loaded from `scripts/check-model-cards.config.json`.
       - Run `runCardChecks`.
       - Print findings as a table grouped by `kind` (matches the `model-card-status.ts` table-print convention).
       - `process.exit(findings.length > 0 ? 1 : 0)`.

    Add to `package.json` `scripts` block (insert next to `model-card-status`):
    ```json
    "check-model-cards": "npx tsx scripts/check-model-cards.ts",
    ```

    Do NOT modify any other npm scripts. Do NOT modify any dependencies. Do NOT bring in new packages.
  </action>
  <acceptance_criteria>
    - `test -f scripts/check-model-cards.ts` returns 0
    - `test -f scripts/check-model-cards.config.json` returns 0
    - `grep -q '"check-model-cards":' package.json` (npm-script wired)
    - `grep -q "export function runCardChecks" scripts/check-model-cards.ts` (testable export present)
    - `grep -q "export function parseIsoDurationDays" scripts/check-model-cards.ts`
    - `grep -q "missing-annotation" scripts/check-model-cards.ts` AND `grep -q "phantom-card" scripts/check-model-cards.ts` AND `grep -q "stale-card" scripts/check-model-cards.ts` AND `grep -q "placeholder-leak" scripts/check-model-cards.ts` AND `grep -q "duplicate-annotation" scripts/check-model-cards.ts`
    - `npx tsc --noEmit scripts/check-model-cards.ts` exits 0
    - `npm run check-model-cards` exits 0 on the committed tree (Tasks 1-4 having shipped 3 cards + 3 annotations + 1 dataset card; all dated 2026-05-10 = today, so nothing is stale)
    - JSON parse: `node -e "JSON.parse(require('fs').readFileSync('scripts/check-model-cards.config.json'))"` exits 0
  </acceptance_criteria>
  <verify>
    <automated>test -f scripts/check-model-cards.ts && test -f scripts/check-model-cards.config.json && grep -q "check-model-cards" package.json && node -e "JSON.parse(require('fs').readFileSync('scripts/check-model-cards.config.json'))" && npm run check-model-cards</automated>
  </verify>
  <done>Script + config + npm-script all present; script exits 0 on the clean tree post-Tasks-1-4</done>
</task>

<task type="auto" tdd="true" id="20-Z-02-06">
  <name>Task 6: Write unit tests covering all four failure modes (TDD-style)</name>
  <read_first>
    - scripts/check-model-cards.ts (just written in Task 5 — testable surface)
    - scripts/model-card-status.ts (Phase 19 precedent — uses dep injection + os.tmpdir() fixtures)
    - .planning/phases/19-cipher-v2-0-excellence/19-A-01-PLAN.md (Phase 19 TDD pattern — RED → GREEN expectation)
  </read_first>
  <behavior>
    At minimum 6 unit tests in tests/check-model-cards.unit.test.ts:

    1. **`runCardChecks` returns no findings on a clean fixture** — fixture has 1 sentiment file with annotation, 1 valid card with `last_validated: <today>`. Expect `findings.length === 0`.
    2. **`missing-annotation` fires** — fixture has a sentiment file exporting `aggregateFoo` with NO annotation. Expect ONE finding with `kind === 'missing-annotation'` and `classifier_export === 'aggregateFoo'`.
    3. **`phantom-card` fires** — fixture has a sentiment file with annotation `// @model-card: docs/cards/MODEL-CARD-nope.md` and that path does NOT exist. Expect ONE finding with `kind === 'phantom-card'` and `card_path` containing 'nope'.
    4. **`stale-card` fires** — fixture has a card with `last_validated: 2025-01-01` and `retrain_cadence: P90D`; `today: 2026-05-10`. ageDays > cadenceDays → expect ONE finding with `kind === 'stale-card'`.
    5. **`placeholder-leak` fires** — fixture has a card body containing the literal string `<<TODO>>`. Expect ONE finding with `kind === 'placeholder-leak'`.
    6. **`duplicate-annotation` fires** — fixture has a sentiment file with two `// @model-card:` lines pointing to different cards. Expect ONE finding with `kind === 'duplicate-annotation'`.
    7. **Exemption list works** — fixture has a sentiment file exporting `classifyFoo` with NO annotation, but the file path appears in `config.exemptions`. Expect `findings.length === 0`.
    8. **`parseIsoDurationDays` correctness** — table-driven: `P90D → 90`, `P6M → 180`, `P1Y → 365`, throws on `'P90'`, throws on `'90D'`, throws on `''`.

    All tests use `os.tmpdir()` to materialize the fixture filesystem (sentiment files + card files + config), then call `runCardChecks` with `deps.fs = require('fs')`, `deps.repoRoot = tmpDir`, `deps.today = new Date('2026-05-10T00:00:00Z')`. NO mocking required — real `fs`, real tmp dir, real strings. Tests must run in <2s.
  </behavior>
  <action>
    Create `tests/check-model-cards.unit.test.ts` implementing the 8 cases above. Use Vitest's `describe` / `it` / `expect`. Use `beforeEach` to create a fresh `os.tmpdir()/check-model-cards-{random}/` directory and `afterEach` to `rmSync` it. Each test materializes the minimal fixture (1-2 files) for its assertion.

    Skeleton:
    ```typescript
    import { describe, it, expect, beforeEach, afterEach } from 'vitest';
    import * as fs from 'fs';
    import * as path from 'path';
    import * as os from 'os';
    import { runCardChecks, parseIsoDurationDays, type CardCheckConfig } from '../scripts/check-model-cards';

    const baseConfig: CardCheckConfig = {
      classifier_export_regex: '^(classify|score|aggregate|predict)',
      default_retrain_cadence: 'P90D',
      exemptions: [],
    };

    function makeDeps(repoRoot: string, today = new Date('2026-05-10T00:00:00Z'), config = baseConfig) {
      return {
        fs: { readFileSync: fs.readFileSync, existsSync: fs.existsSync, readdirSync: fs.readdirSync },
        sentimentGlob: 'src/lib/sentiment/*.ts',  // resolved by readdirSync inside the script
        repoRoot,
        today,
        config,
      };
    }

    let tmp: string;
    beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'check-mc-')); fs.mkdirSync(path.join(tmp, 'src/lib/sentiment'), { recursive: true }); fs.mkdirSync(path.join(tmp, 'docs/cards'), { recursive: true }); });
    afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

    // ... 8 tests as enumerated in <behavior> ...
    ```

    First write all 8 tests (they will FAIL — RED). Then run `npx vitest run tests/check-model-cards.unit.test.ts` to confirm RED. Then re-run after the script in Task 5 is committed — they MUST be GREEN.

    NOTE on RED→GREEN ordering: Task 5 already implements `runCardChecks`, so by the time this task runs the tests should land GREEN on first run. The TDD discipline here is "tests are written from the spec, not from the implementation" — the test file references behaviors enumerated in this plan's <behavior> block, NOT inferred from the script source. Verify by reading <behavior> before reading scripts/check-model-cards.ts when writing the tests.
  </action>
  <acceptance_criteria>
    - `test -f tests/check-model-cards.unit.test.ts` returns 0
    - `grep -c "it(" tests/check-model-cards.unit.test.ts` returns `>= 8`
    - `npx vitest run tests/check-model-cards.unit.test.ts` exits 0
    - All 5 finding kinds (`missing-annotation`, `phantom-card`, `stale-card`, `placeholder-leak`, `duplicate-annotation`) appear in test assertions: `grep -c -E "missing-annotation|phantom-card|stale-card|placeholder-leak|duplicate-annotation" tests/check-model-cards.unit.test.ts` returns `>= 5`
    - `parseIsoDurationDays` cases tested: `grep -q "parseIsoDurationDays" tests/check-model-cards.unit.test.ts`
    - Test runtime: `time npx vitest run tests/check-model-cards.unit.test.ts 2>&1 | grep -E "real|Duration"` shows < 2s wall time
  </acceptance_criteria>
  <verify>
    <automated>npx vitest run tests/check-model-cards.unit.test.ts && [ "$(grep -c 'it(' tests/check-model-cards.unit.test.ts)" -ge 8 ]</automated>
  </verify>
  <done>8+ unit tests GREEN; all 5 finding kinds covered; parseIsoDurationDays tested; runs in <2s</done>
</task>

<task type="auto" id="20-Z-02-07">
  <name>Task 7: Run full unit + lint suite, verify all gates, commit</name>
  <read_first>
    - All files modified/created in Tasks 1-6
    - .planning/phases/20-real-sentiment-analysis/20-Z-01-PLAN.md (Task 7 commit-message convention)
  </read_first>
  <action>
    Run the full verification suite in this exact order:

    1. `npx tsc --noEmit` (TypeScript still compiles after the 3 annotation lines + new script)
    2. `npm test` (full Vitest unit suite — `verify-fixtures-no-null` + Vitest run; the new test file is included)
    3. `npm run check-model-cards` (the new gate — MUST exit 0 on the committed tree)
    4. Card-cardinality gate: `[ "$(ls docs/cards/MODEL-CARD-*.md | wc -l | tr -d ' ')" -ge 3 ]`
    5. Dataset-card-cardinality gate: `[ "$(ls docs/cards/DATASET-CARD-*.md | wc -l | tr -d ' ')" -ge 1 ]`
    6. Annotation-cardinality gate: `[ "$(grep -c '// @model-card:' src/lib/sentiment/*.ts | awk -F: '{s+=$2} END {print s}')" -ge 3 ]`

    If any of these fail, FIX before committing — do NOT commit a red gate.

    Stage files:
    ```bash
    git add docs/templates/MODEL-CARD-template.md docs/templates/DATASET-CARD-template.md \
            docs/cards/MODEL-CARD-stocktwits-naive.md docs/cards/MODEL-CARD-reputation-weighted.md docs/cards/MODEL-CARD-finbert.md \
            docs/cards/DATASET-CARD-SentimentObservation.md \
            .planning/phases/20-real-sentiment-analysis/DATASET-CARD-SentimentObservation.md \
            src/lib/sentiment/aggregator.ts src/lib/sentiment/finsentllm.ts src/lib/sentiment/ensemble.ts \
            scripts/check-model-cards.ts scripts/check-model-cards.config.json \
            tests/check-model-cards.unit.test.ts \
            package.json
    ```

    Commit with HEREDOC:
    ```
    docs(20-z-02): model + dataset card scaffold + check-model-cards CI guard

    S4 implementation for Phase 20.

    - docs/templates/MODEL-CARD-template.md (Mitchell 2019 — arxiv 1810.03993)
    - docs/templates/DATASET-CARD-template.md (Gebru 2018 — arxiv 1803.09010)
    - 3 retroactive model cards: stocktwits-naive, reputation-weighted, finbert
      (FinBERT pins ProsusAI/finbert@<sha> per S5; OPS-HANDOFF flagged)
    - DATASET-CARD-SentimentObservation.md (canonical, in docs/cards/)
      bridged from 20-Z-01's in-phase stub via append-only "Moved to:" pointer
    - 3 single-line `// @model-card:` annotations on aggregator.ts, finsentllm.ts,
      ensemble.ts (zero logic changes)
    - scripts/check-model-cards.ts — fails CI on missing annotation,
      phantom card, stale card, placeholder leak, duplicate annotation
    - 8 unit tests covering all 5 failure modes + parseIsoDurationDays
    - npm run check-model-cards wired in package.json

    Threats T-20-Z-02-{01..05} mitigated; cards-cardinality gate (≥3),
    dataset-cards gate (≥1), annotation-count gate (≥3) all green.
    All future Phase-20 plans MUST ship a card or PR fails.

    Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
    ```
  </action>
  <acceptance_criteria>
    - `npx tsc --noEmit` exits 0
    - `npm test` exits 0
    - `npm run check-model-cards` exits 0
    - `[ "$(ls docs/cards/MODEL-CARD-*.md | wc -l | tr -d ' ')" -ge 3 ]` (3 model cards committed)
    - `[ "$(ls docs/cards/DATASET-CARD-*.md | wc -l | tr -d ' ')" -ge 1 ]` (1 dataset card committed)
    - `[ "$(grep -c '// @model-card:' src/lib/sentiment/*.ts | awk -F: '{s+=$2} END {print s}')" -ge 3 ]` (3 annotations)
    - `git log -1 --pretty=%s` matches `docs(20-z-02):`
    - `git diff HEAD~1 --stat` shows ~13 files touched (2 templates + 3 model cards + 1 dataset card + 1 stub bridge + 3 sentiment annotations + 1 script + 1 config + 1 test + package.json)
  </acceptance_criteria>
  <verify>
    <automated>npx tsc --noEmit && npm test && npm run check-model-cards && git log -1 --pretty=%s | grep -q "20-z-02"</automated>
  </verify>
  <done>All gates green; commit landed on main; check-model-cards now blocks any future PR that adds a sentiment classifier without a card</done>
</task>

</tasks>

<verification>
Numerical gates (zero adjectives — every check is a script exit code, file count, or grep result):

- [ ] `npm run check-model-cards` exits 0 on the committed tree
- [ ] `ls docs/cards/MODEL-CARD-*.md | wc -l` returns `>= 3`
- [ ] `ls docs/cards/DATASET-CARD-*.md | wc -l` returns `>= 1`
- [ ] `grep -c "// @model-card:" src/lib/sentiment/*.ts | awk -F: '{s+=$2} END {print s}'` returns `>= 3`
- [ ] `grep -L "<<TODO>>" docs/cards/MODEL-CARD-*.md docs/cards/DATASET-CARD-*.md | wc -l` returns `4` (every committed card is `<<TODO>>`-free; templates are the only files allowed to contain `<<TODO>>`)
- [ ] `grep -q "1810.03993" docs/templates/MODEL-CARD-template.md` AND `grep -q "1803.09010" docs/templates/DATASET-CARD-template.md` (academic citations present)
- [ ] `grep -q "ProsusAI/finbert@" docs/cards/MODEL-CARD-finbert.md` (S5 SHA pin convention satisfied)
- [ ] `grep -q "Moved to: docs/cards/DATASET-CARD-SentimentObservation.md" .planning/phases/20-real-sentiment-analysis/DATASET-CARD-SentimentObservation.md` (20-Z-01 stub bridge present — preserves 20-Z-01's frontmatter `must_haves` reference resolution)
- [ ] `npx vitest run tests/check-model-cards.unit.test.ts` exits 0 with `>= 8` test cases
- [ ] `npx tsc --noEmit` exits 0 (annotation comments don't break TypeScript; new script is type-safe)
- [ ] `npm test` exits 0 (full unit suite green — no regression introduced)
- [ ] `git diff HEAD~1 src/lib/sentiment/aggregator.ts src/lib/sentiment/finsentllm.ts src/lib/sentiment/ensemble.ts | grep -E "^-[^-]" | wc -l` returns `0` (the three sentiment files have ZERO deletions — purely additive annotation comment)
- [ ] `git log -1 --pretty=%s` matches `^docs\(20-z-02\):`
</verification>

<success_criteria>
1. **S4 enforcement is live.** Any future Phase-20 plan that adds a sentiment classifier without a card will see `npm run check-model-cards` exit non-zero — the gate is real, not aspirational.
2. **Three retroactive cards published.** Existing artifacts (StockTwits naive, reputation-weighted aggregator, FinBERT) have model cards documenting their intended use, OOD behavior, known failure modes, and retrain cadence — Mitchell-2019 schema fidelity verified by section count.
3. **Dataset card scaffold complete.** `SentimentObservation` (introduced by 20-Z-01) has a Gebru-2018 datasheet at the canonical location; the in-phase stub from 20-Z-01 is bridged via append-only "Moved to:" pointer so 20-Z-01's frontmatter still resolves.
4. **No runtime risk.** Pure documentation + 3 single-line annotation comments + 1 CI script + 1 unit test. Zero schema changes, zero behavior changes, zero shadow lifecycle, zero new dependencies.
5. **Threat model coverage complete.** All five T-20-Z-02-{01..05} threats have implemented mitigations grep-checkable in the committed tree.
</success_criteria>

<output>
After completion, create `.planning/phases/20-real-sentiment-analysis/20-Z-02-SUMMARY.md` documenting:
- Two templates landed at `docs/templates/`
- Three model cards + one dataset card landed at `docs/cards/`
- Three sentiment files annotated (one-line additions only)
- `check-model-cards` script + config + npm wiring + 8 unit tests
- Cardinality gates green: 3 model cards / 1 dataset card / 3 annotations
- Forward-references: 20-B-01 (Gemini per-doc), 20-B-02 (FinBERT per-message), 20-B-03 (temperature-scaling), 20-B-04 (source-tier weighting), 20-A-01 (dispersion classifier) all MUST add their own model card per S4 — `npm run check-model-cards` will fail their PR otherwise
- Forward-reference: 20-Z-06 composite Phase-20 done gate will compose `npm run check-model-cards` (alongside the lookahead test from 20-Z-07 and the shadow-graduation gates from individual plans) into a single `npm run phase-20-status` command, mirroring the Phase-19 `model-card-status` pattern
- OPS-HANDOFF: replace `pinned-by-ops-at-deploy` in `MODEL-CARD-finbert.md` with the actual ProsusAI/finbert commit SHA after first 20-B-02 deploy lands the live HF endpoint
</output>
