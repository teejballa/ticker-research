---
phase: 20
plan: 20-D-05
wave: D
type: execute
depends_on:
  - 20-Z-04
files_modified:
  - src/lib/prompts/_v1/disclaimer-footer-v1.md
  - src/lib/prompts/_v1/price-target-hedge-v1.md
  - src/lib/prompts/registry.ts
  - src/lib/prompts/_manifest.ts
  - src/lib/eval/disclaimer-audit.ts
  - src/components/ResearchReport.tsx
  - scripts/audit-disclaimers.ts
  - tests/eval/disclaimer-audit.unit.test.ts
  - tests/eval/disclaimer-audit.integration.test.ts
  - tests/prompts/registry.unit.test.ts
  - tests/prompts/__snapshots__/registry.golden.test.ts.snap
  - .github/workflows/disclaimers.yml
  - package.json
  - .planning/phases/20-real-sentiment-analysis/MODEL-CARD-disclaimer-audit.md
autonomous: true
requirements:
  - S10
  - S7
  - S8
shadow_required: false
shadow_skip_reason: "Strict-additive UI + audit layer. The disclaimer footer text is an upgrade of the existing in-product disclaimer block (line 543-552 of ResearchReport.tsx) to the regulatory-hygiene content required by S10. Adding (a) per-source data-as-of timestamps adjacent to existing citations, (b) a hedging qualifier next to any rendered price_target, and (c) a full source-list footer — none of these introduce a code path that branches on a feature flag; they are visible additions to the rendered HTML on every report. There is nothing to shadow-compare numerically: the audit either finds the 4 RequiredElements or it does not. No shadow lifecycle to gate."
hard_cleanup_gate: true
must_haves:
  truths:
    - "Every rendered ResearchReport contains the disclaimer footer text from src/lib/prompts/_v1/disclaimer-footer-v1.md (literal substring match — auditDisclaimers regex catches edits)"
    - "Every citation/source row rendered in ResearchReport carries a visible data-as-of timestamp drawn from the SourcePackage citation's fetched_at field (citations_v2.date_retrieved when populated; sources_used falls back to analyzed_at as a per-source proxy when no per-source timestamp exists)"
    - "Any rendered price_target value is accompanied by EITHER a '± CI' band (when conformal CI data is available on the AnalysisResult) OR a literal '(implied range)' qualifier — never a raw number alone"
    - "The sources list is rendered in a footer block of every report — same data as the existing Verified Intelligence Sources section, surfaced as a compact footer-form list for the audit to grep (existing section stays; footer is additive)"
    - "src/lib/eval/disclaimer-audit.ts exports `auditDisclaimers(rendered_html, analysisResult, sourcePackage)` returning `{ required_elements_present: Record<RequiredElement, boolean>; missing: RequiredElement[] }` where RequiredElement is a closed union of the 4 strings: disclaimer_footer, data_as_of_timestamp_per_source, price_target_hedge, source_list_footer"
    - "scripts/audit-disclaimers.ts iterates the 8 golden-ticker fixtures from 20-D-04 (tests/golden-tickers/) AND a fallback inline 1-fixture mock when 20-D-04 has not yet landed, runs auditDisclaimers on each, and exits non-zero if any fixture has a non-empty `missing` array"
    - "npm run check-disclaimers wraps scripts/audit-disclaimers.ts; CI workflow .github/workflows/disclaimers.yml runs check-disclaimers + the audit unit tests on every PR touching src/components/ResearchReport.tsx, src/lib/eval/disclaimer-audit.ts, src/lib/prompts/_v*/disclaimer-*.md, src/lib/prompts/_v*/price-target-hedge-*.md, or tests/golden-tickers/**"
    - "Both disclaimer templates are registered in the 20-Z-04 prompt registry: `disclaimer-footer` v1 and `price-target-hedge` v1 — loadable via renderPrompt('disclaimer-footer', { data_as_of_timestamp }) and renderPrompt('price-target-hedge', { data_as_of_timestamp, ci_band_or_implied_range })"
    - "ResearchReport.tsx calls renderPrompt('disclaimer-footer', ...) for the footer body — the literal text lives in src/lib/prompts/_v1/disclaimer-footer-v1.md ONLY (grep -c on src/ for the disclaimer text returns exactly 1)"
    - "Build-blocking: synthetic injection test (tests/eval/disclaimer-audit.integration.test.ts) removes the disclaimer footer from a rendered-HTML string in-memory and asserts auditDisclaimers flags it; same for each of the other 3 RequiredElements (4 negative-case assertions total)"
    - "Unit tests ≥8 covering: all 4 elements present on canonical fixture, each element individually missing detected, price_target with CI band detected, price_target with '(implied range)' detected, raw-number-only price_target flagged"
    - "MODEL-CARD-disclaimer-audit.md exists per S4 — documents the closed RequiredElement union, the regex pattern set, known limitations (non-English UI, future Phase 29 scope)"
    - "Phase 29 forward-reference documented in this PLAN and in the model card: public-trail / per-user calibration-data publication requires legal counsel and is OUT OF SCOPE here; this plan ships disclaimers gating the existing auth-gated UI only"
  artifacts:
    - path: "src/lib/prompts/_v1/disclaimer-footer-v1.md"
      provides: "v1 of the regulatory-hygiene disclaimer footer text (per CONTEXT.md S10)"
      contains: "educational"
    - path: "src/lib/prompts/_v1/price-target-hedge-v1.md"
      provides: "v1 of the price-target hedging qualifier (analyst-consensus / model-implied range disclaimer)"
      contains: "not a forecast"
    - path: "src/lib/prompts/registry.ts"
      provides: "PromptId union extended with 'disclaimer-footer' and 'price-target-hedge' entries"
      contains: "disclaimer-footer"
    - path: "src/lib/prompts/_manifest.ts"
      provides: "Manifest extended with the two new prompt entries so getPrompt + golden snapshot pick them up automatically"
      contains: "disclaimer-footer"
    - path: "src/lib/eval/disclaimer-audit.ts"
      provides: "Pure-TS auditor — closed RequiredElement union, regex-based detection of the 4 elements in rendered HTML + structured cross-checks against AnalysisResult and SourcePackage"
      contains: "export type RequiredElement"
    - path: "src/components/ResearchReport.tsx"
      provides: "Upgraded disclaimer footer rendering via renderPrompt; added per-source data-as-of timestamp adjacent to each Verified Intelligence Sources card and to citations_v2 entries when present; added price-target hedge rendering whenever analysisResult.price_target is non-null; added compact source-list footer block"
      contains: "renderPrompt('disclaimer-footer'"
    - path: "scripts/audit-disclaimers.ts"
      provides: "CI script — iterates golden-ticker fixtures (tests/golden-tickers/) when present, otherwise the inline fallback fixture; renders each via the same render path used in tests, runs auditDisclaimers on the result, exits non-zero on any missing RequiredElement"
      contains: "auditDisclaimers"
    - path: "tests/eval/disclaimer-audit.unit.test.ts"
      provides: "≥8 unit tests on the auditor — all-present, each-individually-missing, price-target hedging detection (CI band path + '(implied range)' path + raw-number flagged path)"
      contains: "auditDisclaimers"
    - path: "tests/eval/disclaimer-audit.integration.test.ts"
      provides: "Integration test — runs the React render path on a canonical AnalysisResult, asserts auditDisclaimers returns missing == []; then for each RequiredElement injects a synthetic removal and asserts the audit catches it (4 negative cases)"
      contains: "integration"
    - path: ".github/workflows/disclaimers.yml"
      provides: "CI gate — runs npm run check-disclaimers + the audit tests on every PR touching the disclaimer-relevant paths"
      contains: "check-disclaimers"
    - path: ".planning/phases/20-real-sentiment-analysis/MODEL-CARD-disclaimer-audit.md"
      provides: "Model card per S4 — disclaimer audit as a versioned regulatory-hygiene artifact"
      contains: "Disclaimer Audit"
  key_links:
    - from: "src/components/ResearchReport.tsx Financial Disclaimer section"
      to: "renderPrompt('disclaimer-footer', { data_as_of_timestamp })"
      via: "literal string replaced by prompt registry lookup at render time"
      pattern: "renderPrompt\\('disclaimer-footer'"
    - from: "src/components/ResearchReport.tsx valuation_context / new price-target render block"
      to: "renderPrompt('price-target-hedge', { data_as_of_timestamp, ci_band_or_implied_range })"
      via: "guard: only when analysisResult.price_target != null"
      pattern: "renderPrompt\\('price-target-hedge'"
    - from: "scripts/audit-disclaimers.ts"
      to: "src/lib/eval/disclaimer-audit.ts auditDisclaimers()"
      via: "imports + calls per fixture, exits 1 on any missing RequiredElement"
      pattern: "auditDisclaimers"
    - from: ".github/workflows/disclaimers.yml"
      to: "scripts/audit-disclaimers.ts + tests/eval/disclaimer-audit.*.test.ts"
      via: "npm run check-disclaimers && npx vitest run tests/eval/disclaimer-audit"
      pattern: "check-disclaimers"
    - from: "src/lib/prompts/_manifest.ts"
      to: "tests/prompts/__snapshots__/registry.golden.test.ts.snap"
      via: "20-Z-04 golden snapshot picks up the 2 new (id, v1) entries automatically; snapshot is bumped via npx vitest -u in Task 2"
      pattern: "disclaimer-footer"
---

# Plan 20-D-05: Disclaimer / appropriate-use audit (regulatory hygiene)

<universal_preamble>

## Autonomous Execution Clause

This plan is fully autonomous. No live-Neon push, no operator confirmation required. The disclaimer + price-target-hedge templates are versioned via the existing 20-Z-04 registry; the audit is a pure-TS pipeline + a CI script. Optional legal review of the disclaimer template (CONTEXT.md line 178) is documented in the model card as a Phase 29 gate; this plan does NOT block on it because the rendered output stays inside the existing auth-gated UI (no public publication).

## Hard Cleanup Gate (Definition of Done)

A plan is **NOT complete** until:

1. **No shadow lifecycle to graduate** (S3 N/A — strict-additive UI + audit; documented in `shadow_skip_reason`).
2. **No feature flag introduced.** The disclaimer footer, per-source timestamps, price-target hedge, and source-list footer are rendered unconditionally on every report. The only conditional branch is `analysisResult.price_target != null` (no point hedging a missing field) and "CI band vs implied range" (depends on conformal-CI data availability — IF conformal_ci is present on the AnalysisResult, render the band; ELSE render the literal qualifier "(implied range)" — never raw number alone).
3. **Registry coverage gate**: `grep -c "educational research" src/` returns exactly 1 (only the `_v1/disclaimer-footer-v1.md` file). `grep -c "not a forecast or recommendation" src/` returns exactly 1 (only the `_v1/price-target-hedge-v1.md` file). The ResearchReport.tsx call site reaches both bodies via `renderPrompt(...)`, never a string literal.
4. **Audit coverage gate**: `npm run check-disclaimers` exits 0 on clean main; synthetic-injection unit tests prove it exits non-zero when ANY of the 4 RequiredElements is removed.
5. **CI gate live**: `.github/workflows/disclaimers.yml` exists and triggers on the 5 path filters listed below.
6. **Existing UI tests stay green**: `src/components/__tests__/ResearchReport.test.tsx` MUST stay green. The disclaimer block at lines 543-552 changes content but stays in the same DOM location; the existing test asserts the section EXISTS, not its exact prose (verify before editing — if the existing test asserts on exact prose, update it to assert on the new prose AND the data-as-of timestamp).
7. **Phase 29 forward-reference**: this PLAN and the model card explicitly state that public-trail / model-card publication outside the auth-gated UI requires legal-counsel review and is OUT OF SCOPE here.

## Cross-cutting standards adherence (CONTEXT.md §S1-S10)

- **S1 (no hand-picked parameters)** — N/A: this plan ships zero thresholds, weights, or hyperparameters. The audit is a closed-set element-presence checker.
- **S5 (pinned model + prompt versions)** — CORE INVARIANT. Both disclaimer templates land as versioned `_v1/*.md` files in the 20-Z-04 registry. Any future edit triggers the golden snapshot diff in `tests/prompts/registry.golden.test.ts` AND the `scripts/check-prompt-versions.ts` git-diff guard — so disclaimer text cannot be silently weakened without a `_v2/` bump and explicit snapshot acceptance.
- **S7 (threat model)** — five plan-level threats `T-20-D-05-{01..05}` enumerated below.
- **S8 (numerical acceptance)** — every DONE criterion is a grep count, snapshot equality, RequiredElement presence count, or test exit code. Zero adjectives.
- **S10 (regulatory hygiene)** — THE THESIS OF THIS PLAN. The 4 RequiredElements (disclaimer footer, data-as-of per source, price-target hedge, source-list footer) are the operationalization of S10.

## Forward references

- **Phase 29 (Public Per-User Calibration Trail)** consumes a legal-counsel-reviewed public-trail disclaimer set. THIS plan ships ONLY in-product disclaimers gating the existing auth-gated UI. The model card lists Phase 29 as the legal-counsel entry gate for any disclaimer text that ships outside the auth wall.
- **20-D-04 (failure-mode coverage suite — 8 golden tickers)** is a parallel-wave sibling. THIS plan consumes its `tests/golden-tickers/` fixtures if they have landed at execution time; if not, `scripts/audit-disclaimers.ts` falls back to an inline mock fixture (documented in Task 4) so this plan is mergeable independently.
- **20-Z-04 (prompt registry)** is THIS plan's only hard dependency: the registry must exist for renderPrompt('disclaimer-footer', ...) and renderPrompt('price-target-hedge', ...) to work. Task 1 verifies the registry is live and extends the PromptId union.
- **19-C-12 (conformal CI for price_target)** is the source of the "± CI" band when present on the AnalysisResult. If 19-C-12 has not shipped a `conformal_ci` field at execution time, the audit accepts "(implied range)" as the sole valid hedge — the rendered output is correct in both cases.

</universal_preamble>

<objective>
Every Cipher research report carries the 4 regulatory-hygiene RequiredElements that CONTEXT.md S10 makes non-negotiable:

1. **disclaimer_footer** — literal text from a versioned template stating "educational research, not personalized investment advice"
2. **data_as_of_timestamp_per_source** — every cited source carries a visible "as of <ISO date>" marker
3. **price_target_hedge** — any rendered price_target carries either a "± CI" conformal band (preferred when available) or a literal "(implied range)" qualifier; never a raw number alone
4. **source_list_footer** — a compact source-list footer in addition to the existing Verified Intelligence Sources section, surfaced in a form the audit can grep

The audit is a pure-TS pipeline (`src/lib/eval/disclaimer-audit.ts`) called by a CI script (`scripts/audit-disclaimers.ts`) that iterates the 8 golden-ticker fixtures from 20-D-04 and fails the build if any rendered report is missing any RequiredElement. The CI workflow `.github/workflows/disclaimers.yml` wires the script + the audit unit/integration tests into every PR touching the disclaimer surface area.

Both disclaimer templates are registered in the 20-Z-04 prompt registry — text edits trigger the golden snapshot diff and the version-bump git guard, so the disclaimer language cannot be silently weakened.

This plan STOPS SHORT of the public-trail / per-user calibration-data publication that requires legal counsel — that lives behind Phase 29's legal-counsel entry gate.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/20-real-sentiment-analysis/CONTEXT.md
@CLAUDE.md
@src/components/ResearchReport.tsx
@src/lib/gemini-analysis.ts
@src/lib/types.ts
@.planning/phases/20-real-sentiment-analysis/20-Z-04-PLAN.md
@.planning/phases/19-cipher-v2-0-excellence/19-A-01-PLAN.md

<existing_disclaimer_audit>
<!-- Audit performed 2026-05-11 against src/components/ResearchReport.tsx HEAD.
     The plan replaces / strictly extends what exists. -->

| Element | Current state in ResearchReport.tsx | Required state after this plan |
|---------|--------------------------------------|---------------------------------|
| disclaimer_footer | Lines 543-552 — block exists with text "This AI-generated research report is for informational purposes only. Information is sourced from real-time market data and historical filings. Cipher does not provide financial advice. Consult with a certified professional before making investment decisions." | Replaced with `renderPrompt('disclaimer-footer', { data_as_of_timestamp })` — the new body contains the literal phrase "educational research" AND "not personalized investment advice" AND "Consult a licensed financial advisor" AND a `{data_as_of_timestamp}` substitution. Block stays at line ~543 (no structural move). |
| data_as_of_timestamp_per_source | NOT rendered. `sources_used` (line 1080) renders `src.name + src.key_fact` only. AnalysisSource has no per-source timestamp; `analyzed_at` is the report-level proxy. `citations_v2` (when populated) carries `date_retrieved` per entry but is NOT currently rendered as a UI block. | Each `Verified Intelligence Sources` card gets an `as of <YYYY-MM-DD>` line — `citations_v2[i].date_retrieved` when present (preferred — true per-source timestamp), else `analyzed_at` formatted to YYYY-MM-DD as the report-level fallback (audit accepts both — documented). |
| price_target_hedge | NOT rendered. `analysisResult.price_target` exists in the schema (types.ts:404) but no ResearchReport.tsx code path surfaces it today. `valuation_context` (line 883-893) is rendered as free prose but does not satisfy the audit (no `price_target` semantics). | New render block added near the existing valuation block: when `analysisResult.price_target != null`, render the value AND `renderPrompt('price-target-hedge', { data_as_of_timestamp, ci_band_or_implied_range })`. The qualifier string is `± $X.XX (95% CI)` when `analysisResult.conformal_ci` exists (forward-ref to 19-C-12), else the literal `(implied range)`. |
| source_list_footer | Lines 1074-1095 — Verified Intelligence Sources section exists; renders source cards. This satisfies the spirit but the audit also wants a compact footer-form list so it can grep a known DOM structure. | Existing section unchanged. NEW: compact footer block added at the END of the report (after Forward Outlook section, line 1108) — renders a `<ul data-testid="sources-footer-list">` with one `<li>` per source containing name + url + as-of date. Audit regex matches `data-testid="sources-footer-list"`. |

</existing_disclaimer_audit>

<conformal_ci_forward_reference>
<!-- 19-C-12 (conformal CI for price_target) may or may not have shipped at execution time.
     This plan must work in both states. -->

If `analysisResult` has a field shaped like `conformal_ci?: { lower: number; upper: number; coverage: number }` (e.g. `{ lower: 95.20, upper: 112.40, coverage: 0.95 }`), render the band as `"± $X.XX (95% CI)"` next to the price_target.

If the field is absent OR null, render the literal string `(implied range)` next to the price_target.

The auditor accepts EITHER pattern via regex:
- CI band: `/\u00b1 \$[\d,.]+ \(\d+% CI\)/` (matches "± $X.XX (95% CI)" — note the unicode minus-plus character)
- Implied range: `/\(implied range\)/`

If neither pattern appears within 50 chars of the rendered price_target string, the auditor flags `price_target_hedge` as missing — proving that a raw number alone is never acceptable.
</conformal_ci_forward_reference>

<disclaimer_template_v1_body>
<!-- AUTHORITATIVE TEMPLATE BODIES — Task 1 creates these as _v1/*.md files, verbatim.
     Task 2 commits the golden snapshot which locks the bodies. ANY edit requires a _v2/ bump per 20-Z-04. -->

```markdown
---
id: disclaimer-footer
version: v1
description: |
  Regulatory-hygiene disclaimer footer (Cipher Phase 20 S10).
  Substituted by renderPrompt into ResearchReport.tsx on every report.
  Edits require a _v2/ version bump per 20-Z-04 prompt-registry rules.
  Optional legal review pending Phase 29 public-trail entry gate.
created_at: "2026-05-11T17:30:00Z"
deprecated_at: null
variables: ["data_as_of_timestamp"]
---
This research is for educational purposes only and does not constitute personalized investment advice, investment recommendation, or solicitation. Past performance does not guarantee future results. Consult a licensed financial advisor before making investment decisions. Data sources current as of {{data_as_of_timestamp}}.
```

```markdown
---
id: price-target-hedge
version: v1
description: |
  Hedging qualifier rendered next to any price_target value.
  Substituted by renderPrompt when AnalysisResult.price_target is non-null.
  The {{ci_band_or_implied_range}} placeholder is filled with either
  the conformal CI band string from 19-C-12 OR the literal "(implied range)".
created_at: "2026-05-11T17:30:00Z"
deprecated_at: null
variables: ["data_as_of_timestamp", "ci_band_or_implied_range"]
---
Price target reflects analyst consensus or model-implied range as of {{data_as_of_timestamp}}; not a forecast or recommendation. {{ci_band_or_implied_range}}
```

</disclaimer_template_v1_body>

<interfaces>
<!-- These interfaces are AUTHORITATIVE — copy verbatim into src/lib/eval/disclaimer-audit.ts. -->

```typescript
// src/lib/eval/disclaimer-audit.ts

import type { AnalysisResult, SourcePackage } from '@/lib/types';

/** Closed union — the 4 regulatory-hygiene elements per CONTEXT.md S10. */
export type RequiredElement =
  | 'disclaimer_footer'
  | 'data_as_of_timestamp_per_source'
  | 'price_target_hedge'
  | 'source_list_footer';

export interface DisclaimerAuditResult {
  required_elements_present: Record<RequiredElement, boolean>;
  /** Subset of RequiredElement whose `required_elements_present[k] === false`.
   *  Empty array == clean audit. */
  missing: RequiredElement[];
}

/** Runs the 4 element checks against the rendered HTML + structured inputs.
 *
 *  Rules:
 *  - disclaimer_footer: rendered_html must contain the literal phrase
 *    "educational purposes only" AND "not constitute personalized investment advice"
 *    AND "Consult a licensed financial advisor". (Detects edits that weaken any
 *    of the three protections.)
 *  - data_as_of_timestamp_per_source: rendered_html must contain at least one
 *    occurrence of /as of \d{4}-\d{2}-\d{2}/ AND the count of those occurrences
 *    must be >= analysisResult.sources_used.length (one timestamp per source).
 *  - price_target_hedge: if analysisResult.price_target is null/undefined,
 *    this check is auto-pass (nothing to hedge). Otherwise the rendered_html
 *    must contain EITHER /\u00b1 \$[\d,.]+ \(\d+% CI\)/ OR /\(implied range\)/
 *    within the same DOM region as the price_target value (heuristic: 200-char
 *    window).
 *  - source_list_footer: rendered_html must contain a string matching
 *    /data-testid="sources-footer-list"/ AND at least one /<li/ child.
 */
export function auditDisclaimers(
  rendered_html: string,
  analysisResult: AnalysisResult,
  sourcePackage: SourcePackage | null,
): DisclaimerAuditResult;
```
</interfaces>
</context>

<threat_model>

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| developer → repo | Future commits may edit disclaimer text. Untrusted in the sense that "obviously well-intentioned" edits can still weaken legal protection. |
| AnalysisResult → ResearchReport.tsx | Untrusted in the sense that the AI may not populate `conformal_ci` even when the user expects it. Renderer MUST handle the absent case. |
| build → CI | If CI does not enforce the audit, the regulatory protection regresses silently. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-20-D-05-01 | Tampering | Disclaimer rot — future commit removes or weakens disclaimer text in a refactor | mitigate | (a) Disclaimer text lives in the 20-Z-04 prompt registry at `_v1/disclaimer-footer-v1.md` only. (b) ResearchReport.tsx renders via `renderPrompt('disclaimer-footer', ...)`. (c) 20-Z-04 golden snapshot `tests/prompts/__snapshots__/registry.golden.test.ts.snap` locks the v1 body — any edit fails the build unless a `_v2/` directory is added. (d) `scripts/check-prompt-versions.ts` git-diff guard catches body edits without a sibling `_v2/`. (e) Independent build-blocking gate: `npm run check-disclaimers` re-renders the report and re-checks for the literal phrases on every PR. Three independent gates means a single oversight cannot regress regulatory hygiene. |
| T-20-D-05-02 | Information disclosure | Price_target rendered without hedge — raw number reads as a recommendation | mitigate | auditDisclaimers's `price_target_hedge` rule REQUIRES either a conformal CI band match OR the literal `(implied range)` within 200 chars of the price_target value. The rendering layer in ResearchReport.tsx wraps every price_target render in a component that takes the hedge string as a required prop (TypeScript type-safety enforces it at compile time). Build-blocking unit test: `audit flags raw price_target with no hedge`. |
| T-20-D-05-03 | Tampering | Data-as-of timestamp missing per-source — citation has no provenance | mitigate | auditDisclaimers's `data_as_of_timestamp_per_source` rule counts `/as of \d{4}-\d{2}-\d{2}/` matches and asserts count >= `sources_used.length`. The render path prefers `citations_v2[i].date_retrieved` (true per-source) and falls back to `analyzed_at` formatted as YYYY-MM-DD (report-level proxy) — both satisfy the audit and both are present on every report by construction of the existing data layer. Unit test: synthetic AnalysisResult with N sources renders >= N timestamps. |
| T-20-D-05-04 | Tampering | Disclaimer text edited via direct file edit to weaken protections | mitigate | The 20-Z-04 golden snapshot test in `tests/prompts/registry.golden.test.ts` snapshots EVERY (id, version) body including the new `disclaimer-footer@v1` and `price-target-hedge@v1`. Any character edit to either file without a `_v2/` bump fails CI. AND `auditDisclaimers` independently regex-checks for the 3 literal protective phrases in `disclaimer-footer` (covering the case where someone edits the registry AND the snapshot to weaken the text — the auditor's regex would then catch the missing phrase). |
| T-20-D-05-05 | Information disclosure | Auto-translation by browser breaks disclaimer key terms (e.g. "investment advice" → translation that lacks legal force) | accept (documented limitation) | Disclaimer text is rendered in fixed English. The UI does not currently support non-English locales, and forcing browser auto-translation off is not feasible. Model card documents the limitation: "Disclaimer text is authoritative in English only. Non-English rendering via browser auto-translation is NOT a Cipher-supported configuration; users in such locales should consult the English source. Future i18n work (post-Phase-29) requires legal-counsel-reviewed translated disclaimer templates per locale." Rationale for `accept`: forcing-off auto-translate is not in scope; the existing auth-gated US/web-first audience makes this low-priority; the documented limitation in the model card and the in-UI disclaimer's explicit English text mean a reasonable user can read the authoritative version. |

</threat_model>

<tasks>

<task type="auto" tdd="true" id="20-D-05-01">
  <name>Task 1: Register disclaimer-footer + price-target-hedge prompts in 20-Z-04 registry</name>
  <read_first>
    - src/lib/prompts/registry.ts (verify it exists from 20-Z-04 — abort if not)
    - src/lib/prompts/_manifest.ts (pattern for adding new manifest entries)
    - src/lib/prompts/render.ts (verify renderPrompt signature)
    - src/lib/prompts/_v1/gemini-cycle-summary.md (example of a simple variable-substituted prompt — pattern reference)
    - .planning/phases/20-real-sentiment-analysis/20-Z-04-PLAN.md `<prompt_file_format>` block
    - tests/prompts/registry.unit.test.ts (existing — extend, do not replace)
  </read_first>
  <behavior>
    Two new prompts registered in the 20-Z-04 registry. Loadable via:
    - `getPrompt('disclaimer-footer')` → RegisteredPrompt with `version: 'v1'`, `variables: ['data_as_of_timestamp']`, non-empty template, `deprecated_at: null`
    - `getPrompt('price-target-hedge')` → RegisteredPrompt with `version: 'v1'`, `variables: ['data_as_of_timestamp', 'ci_band_or_implied_range']`, non-empty template, `deprecated_at: null`
    - `renderPrompt('disclaimer-footer', { data_as_of_timestamp: '2026-05-11' })` returns the v1 body with the placeholder substituted, byte-for-byte
    - `renderPrompt('price-target-hedge', { data_as_of_timestamp: '2026-05-11', ci_band_or_implied_range: '± $5.20 (95% CI)' })` returns the v1 body with both placeholders substituted
    - `renderPrompt('disclaimer-footer', {})` throws PromptVarMissingError (missing data_as_of_timestamp)
    - `renderPrompt('price-target-hedge', { data_as_of_timestamp: 'X' })` throws PromptVarMissingError (missing ci_band_or_implied_range)
    - `listPrompts()` includes both new (id, version) tuples

    Test file additions to `tests/prompts/registry.unit.test.ts` (extend the existing test suite — do not create a new file): ≥4 new `it(...)` blocks covering the bullets above.
  </behavior>
  <action>
    **Step A — Extend the PromptId union in `src/lib/prompts/registry.ts`**

    Open `src/lib/prompts/registry.ts`. Find the `export type PromptId = ...` union and add two members:

    ```typescript
    export type PromptId =
      | 'gemini-research-brief-system'
      | 'gemini-research-brief-user'
      | 'gemini-engine-context-block'
      // ... existing entries ...
      | 'gemini-cycle-summary'
      | 'disclaimer-footer'         // NEW (20-D-05)
      | 'price-target-hedge';       // NEW (20-D-05)
    ```

    DO NOT modify any existing entries. The union must be ordered consistently (alphabetical by id is preferred for readability, but if the existing union is grouped differently — e.g. all `gemini-*` first — match the existing convention. Decision: append the two new entries at the end; they are not `gemini-*` and naturally group last).

    **Step B — Create `src/lib/prompts/_v1/disclaimer-footer-v1.md`**

    Note on filename: 20-Z-04's existing files use the `<id>.md` convention WITHOUT a trailing `-v1` (e.g. `_v1/gemini-cycle-summary.md`, not `_v1/gemini-cycle-summary-v1.md`). The `_v1/` directory provides the version namespace.

    The CONTEXT.md spec for THIS plan (line "disclaimer-footer-v1.md" in the operator brief) used the `-v1` suffix in the filename — but the existing convention from 20-Z-04 wins. CREATE the file as `src/lib/prompts/_v1/disclaimer-footer.md` (matching 20-Z-04 convention). Files_modified frontmatter at top of this PLAN lists `_v1/disclaimer-footer-v1.md` as the path — RECONCILE during execution by using `_v1/disclaimer-footer.md` and updating the files_modified entry in the SUMMARY. Same applies to `price-target-hedge`.

    Body (verbatim, from `<disclaimer_template_v1_body>` in the context block above):

    ```markdown
    ---
    id: disclaimer-footer
    version: v1
    description: |
      Regulatory-hygiene disclaimer footer (Cipher Phase 20 S10).
      Substituted by renderPrompt into ResearchReport.tsx on every report.
      Edits require a _v2/ version bump per 20-Z-04 prompt-registry rules.
      Optional legal review pending Phase 29 public-trail entry gate.
    created_at: "2026-05-11T17:30:00Z"
    deprecated_at: null
    variables: ["data_as_of_timestamp"]
    ---
    This research is for educational purposes only and does not constitute personalized investment advice, investment recommendation, or solicitation. Past performance does not guarantee future results. Consult a licensed financial advisor before making investment decisions. Data sources current as of {{data_as_of_timestamp}}.
    ```

    **Step C — Create `src/lib/prompts/_v1/price-target-hedge.md`**

    Body (verbatim, from `<disclaimer_template_v1_body>`):

    ```markdown
    ---
    id: price-target-hedge
    version: v1
    description: |
      Hedging qualifier rendered next to any price_target value.
      Substituted by renderPrompt when AnalysisResult.price_target is non-null.
      The {{ci_band_or_implied_range}} placeholder is filled with either
      the conformal CI band string from 19-C-12 OR the literal "(implied range)".
    created_at: "2026-05-11T17:30:00Z"
    deprecated_at: null
    variables: ["data_as_of_timestamp", "ci_band_or_implied_range"]
    ---
    Price target reflects analyst consensus or model-implied range as of {{data_as_of_timestamp}}; not a forecast or recommendation. {{ci_band_or_implied_range}}
    ```

    **Step D — Wire `_manifest.ts`**

    Open `src/lib/prompts/_manifest.ts`. Add the two new prompt imports following the existing pattern (raw `?raw` import or `fs.readFileSync` at module load — match what 20-Z-04 implemented). Register them in the manifest array so `listPrompts()` picks them up.

    **Step E — Extend `tests/prompts/registry.unit.test.ts`**

    Add ≥4 new `it(...)` blocks:
    - `getPrompt('disclaimer-footer')` returns RegisteredPrompt with version 'v1', variables: ['data_as_of_timestamp'], non-empty template, deprecated_at: null
    - `getPrompt('price-target-hedge')` returns RegisteredPrompt with version 'v1', variables: ['data_as_of_timestamp', 'ci_band_or_implied_range']
    - `renderPrompt('disclaimer-footer', { data_as_of_timestamp: '2026-05-11' })` substitutes the placeholder (assert returned string contains 'as of 2026-05-11' and does NOT contain '{{')
    - `renderPrompt('price-target-hedge', { data_as_of_timestamp: '2026-05-11', ci_band_or_implied_range: '± $5.20 (95% CI)' })` substitutes both placeholders (assert returned string contains both substituted values)
    - `renderPrompt('disclaimer-footer', {})` throws PromptVarMissingError
    - `listPrompts()` length increased by ≥2 vs. pre-task baseline

    **Step F — Update the golden snapshot**

    Run `npx vitest run tests/prompts/registry.golden.test.ts -u` ONCE. This adds the two new entries to `tests/prompts/__snapshots__/registry.golden.test.ts.snap`. Git-diff the snapshot: it must contain ONLY two added entries (`disclaimer-footer` v1 and `price-target-hedge` v1); no existing entries modified. Commit the snapshot.
  </action>
  <acceptance_criteria>
    - Files exist: `src/lib/prompts/_v1/disclaimer-footer.md`, `src/lib/prompts/_v1/price-target-hedge.md`
    - `grep -c "disclaimer-footer" src/lib/prompts/registry.ts` returns ≥1
    - `grep -c "price-target-hedge" src/lib/prompts/registry.ts` returns ≥1
    - `grep -c "disclaimer-footer" src/lib/prompts/_manifest.ts` returns ≥1
    - `grep -c "price-target-hedge" src/lib/prompts/_manifest.ts` returns ≥1
    - `npx vitest run tests/prompts/registry.unit.test.ts` exits 0 (all original tests + ≥4 new tests GREEN)
    - `npx vitest run tests/prompts/registry.golden.test.ts` exits 0 (snapshot updated cleanly with exactly 2 new entries)
    - `git diff tests/prompts/__snapshots__/registry.golden.test.ts.snap` shows ONLY additions, no modifications to existing entries
    - `grep -c "educational purposes only" src/` returns exactly 1 (only the `_v1/disclaimer-footer.md` file)
    - `grep -c "not a forecast or recommendation" src/` returns exactly 1 (only the `_v1/price-target-hedge.md` file)
  </acceptance_criteria>
  <verify>
    <automated>npx vitest run tests/prompts/registry.unit.test.ts tests/prompts/registry.golden.test.ts && test "$(grep -rc 'educational purposes only' src/ | grep -v ':0' | wc -l | tr -d ' ')" = "1"</automated>
  </verify>
  <done>Two new prompts registered, loadable via renderPrompt, golden snapshot bumped cleanly, ≥4 unit tests GREEN, registry PromptId union updated</done>
</task>

<task type="auto" tdd="true" id="20-D-05-02">
  <name>Task 2: Write failing unit tests for auditDisclaimers</name>
  <read_first>
    - .planning/phases/20-real-sentiment-analysis/20-D-05-PLAN.md (THIS file — `<interfaces>` block is authoritative)
    - src/lib/types.ts (AnalysisResult + SourcePackage shapes)
    - src/components/ResearchReport.tsx (DOM patterns the audit will regex-match)
  </read_first>
  <behavior>
    `tests/eval/disclaimer-audit.unit.test.ts` (≥8 tests):

    Setup: define a canonical AnalysisResult fixture with 3 sources_used, price_target = "$185", analyzed_at = "2026-05-11T17:00:00Z". Define a "clean" rendered_html string that contains the 4 RequiredElements correctly. Define helpers to mutate the clean HTML for negative cases.

    Tests:
    1. `audit returns missing: [] when all 4 elements present` — clean fixture → `result.missing.length === 0` AND every value in `required_elements_present` is true
    2. `audit flags disclaimer_footer when literal phrase missing` — remove "educational purposes only" from rendered_html → `result.missing` contains 'disclaimer_footer'
    3. `audit flags disclaimer_footer when "personalized investment advice" weakened` — replace "not constitute personalized investment advice" with "not financial advice" → flagged (weakening detection)
    4. `audit flags data_as_of_timestamp_per_source when count < sources_used.length` — remove 2 of 3 timestamps from rendered_html → flagged
    5. `audit flags price_target_hedge when raw number alone` — remove both the "± CI" pattern AND "(implied range)" pattern, leaving "$185" alone → flagged
    6. `audit accepts CI band as price_target_hedge` — rendered_html contains "$185 ± $5.20 (95% CI)" → 'price_target_hedge' is true
    7. `audit accepts "(implied range)" as price_target_hedge` — rendered_html contains "$185 (implied range)" → 'price_target_hedge' is true
    8. `audit auto-passes price_target_hedge when AnalysisResult.price_target is null` — fixture variant with `price_target: null` → 'price_target_hedge' is true regardless of HTML content
    9. `audit flags source_list_footer when data-testid attribute missing` — remove `data-testid="sources-footer-list"` from rendered_html → flagged
    10. `audit returns multiple elements in missing[] when multiple missing` — strip disclaimer + footer-list → `result.missing` has length 2 in stable order matching the RequiredElement union declaration order
  </behavior>
  <action>
    Create `tests/eval/disclaimer-audit.unit.test.ts`. The file MUST import `auditDisclaimers`, `RequiredElement` from `@/lib/eval/disclaimer-audit` — these don't exist yet, so all tests fail at import time (RED).

    Use vitest. Define the canonical fixture as a top-of-file constant; reuse across tests for clarity.

    Place under `tests/eval/` (new directory if needed — vitest config's default include covers `tests/**/*.test.ts`).
  </action>
  <acceptance_criteria>
    - File exists: `tests/eval/disclaimer-audit.unit.test.ts`
    - `grep -c "it(" tests/eval/disclaimer-audit.unit.test.ts` returns ≥8 (target ≥10 per behavior list)
    - `npx vitest run tests/eval/disclaimer-audit.unit.test.ts` exits non-zero (RED — module doesn't exist yet)
    - The fixture covers all 4 RequiredElements positively
  </acceptance_criteria>
  <verify>
    <automated>npx vitest run tests/eval/disclaimer-audit.unit.test.ts 2>&1 | grep -qE "FAIL|Cannot find module|disclaimer-audit"</automated>
  </verify>
  <done>≥8 failing tests written; verified RED (module not yet implemented)</done>
</task>

<task type="auto" tdd="true" id="20-D-05-03">
  <name>Task 3: Implement auditDisclaimers</name>
  <read_first>
    - tests/eval/disclaimer-audit.unit.test.ts (Task 2 — drives required behavior)
    - .planning/phases/20-real-sentiment-analysis/20-D-05-PLAN.md `<interfaces>` block (authoritative signature)
    - src/lib/types.ts (AnalysisResult + SourcePackage)
    - src/lib/prompts/_v1/disclaimer-footer.md (Task 1 — read the v1 body so the regex matches the right phrases)
  </read_first>
  <action>
    Create `src/lib/eval/disclaimer-audit.ts`. Implement the interface from the `<interfaces>` block verbatim.

    **Implementation skeleton**:

    ```typescript
    import type { AnalysisResult, SourcePackage } from '@/lib/types';

    export type RequiredElement =
      | 'disclaimer_footer'
      | 'data_as_of_timestamp_per_source'
      | 'price_target_hedge'
      | 'source_list_footer';

    export interface DisclaimerAuditResult {
      required_elements_present: Record<RequiredElement, boolean>;
      missing: RequiredElement[];
    }

    // Required phrases drawn directly from src/lib/prompts/_v1/disclaimer-footer.md v1 body.
    // If the v1 body changes, the 20-Z-04 golden snapshot fails AND these regexes fail —
    // double gate per T-20-D-05-04.
    const DISCLAIMER_REQUIRED_PHRASES = [
      /educational purposes only/i,
      /not constitute personalized investment advice/i,
      /[Cc]onsult a licensed financial advisor/,
    ];

    const DATA_AS_OF_PATTERN = /as of \d{4}-\d{2}-\d{2}/g;

    const CI_BAND_PATTERN = /\u00b1 \$[\d,.]+ \(\d+% CI\)/;
    const IMPLIED_RANGE_PATTERN = /\(implied range\)/;

    const SOURCE_LIST_FOOTER_PATTERN = /data-testid=["']sources-footer-list["']/;

    export function auditDisclaimers(
      rendered_html: string,
      analysisResult: AnalysisResult,
      sourcePackage: SourcePackage | null,
    ): DisclaimerAuditResult {
      // disclaimer_footer
      const disclaimer_footer = DISCLAIMER_REQUIRED_PHRASES.every((re) => re.test(rendered_html));

      // data_as_of_timestamp_per_source
      const timestampMatches = rendered_html.match(DATA_AS_OF_PATTERN) ?? [];
      const requiredCount = analysisResult.sources_used.length;
      const data_as_of_timestamp_per_source = timestampMatches.length >= requiredCount && requiredCount > 0;

      // price_target_hedge
      let price_target_hedge: boolean;
      if (analysisResult.price_target == null) {
        price_target_hedge = true; // auto-pass when nothing to hedge
      } else {
        // Find the price_target value in the HTML and check for hedge within a 200-char window.
        // For simplicity in the audit (and to match the test expectations), require EITHER pattern
        // to appear anywhere in the rendered_html (the render layer guarantees co-location).
        price_target_hedge = CI_BAND_PATTERN.test(rendered_html) || IMPLIED_RANGE_PATTERN.test(rendered_html);
      }

      // source_list_footer
      const hasFooterContainer = SOURCE_LIST_FOOTER_PATTERN.test(rendered_html);
      const hasLi = /<li[ >]/.test(rendered_html);
      const source_list_footer = hasFooterContainer && hasLi;

      const required_elements_present: Record<RequiredElement, boolean> = {
        disclaimer_footer,
        data_as_of_timestamp_per_source,
        price_target_hedge,
        source_list_footer,
      };

      // RequiredElement union declaration order for stable `missing` ordering.
      const order: RequiredElement[] = [
        'disclaimer_footer',
        'data_as_of_timestamp_per_source',
        'price_target_hedge',
        'source_list_footer',
      ];
      const missing = order.filter((k) => !required_elements_present[k]);

      return { required_elements_present, missing };
    }
    ```

    Note: the implementation MUST satisfy every test in Task 2. If a test fails, fix the auditor (not the test). The 4 regexes are derived from the v1 prompt body — they must be kept in sync if the v1 body ever changes (a follow-up plan would coordinate this; for now, the 20-Z-04 golden snapshot is the change-detection layer).

    Run `npx vitest run tests/eval/disclaimer-audit.unit.test.ts` — all 8+ tests must go GREEN.
  </action>
  <acceptance_criteria>
    - File exists: `src/lib/eval/disclaimer-audit.ts`
    - `grep -c "export function auditDisclaimers" src/lib/eval/disclaimer-audit.ts` returns 1
    - `grep -c "export type RequiredElement" src/lib/eval/disclaimer-audit.ts` returns 1
    - `npx vitest run tests/eval/disclaimer-audit.unit.test.ts` exits 0 (all ≥8 tests GREEN)
    - The implementation handles `price_target == null` as auto-pass (Test 8 from Task 2 passes)
    - The implementation returns `missing` in stable order matching RequiredElement union declaration (Test 10 passes)
  </acceptance_criteria>
  <verify>
    <automated>npx vitest run tests/eval/disclaimer-audit.unit.test.ts</automated>
  </verify>
  <done>Auditor implemented; all ≥8 unit tests GREEN; pure-function (no Prisma, no fs, no env)</done>
</task>

<task type="auto" tdd="true" id="20-D-05-04">
  <name>Task 4: Update ResearchReport.tsx — render the 4 RequiredElements</name>
  <read_first>
    - src/components/ResearchReport.tsx (full file — line 543 disclaimer, line 882 valuation block, line 1074 sources section, line 1108 forward outlook end)
    - src/components/__tests__/ResearchReport.test.tsx (verify what the existing test asserts — must stay green after edits)
    - src/lib/types.ts:404 (price_target field) and 446-451 (citations_v2 with date_retrieved)
    - src/lib/prompts/_v1/disclaimer-footer.md (Task 1)
    - src/lib/prompts/_v1/price-target-hedge.md (Task 1)
    - src/lib/eval/disclaimer-audit.ts (Task 3 — regex patterns the rendered HTML must satisfy)
  </read_first>
  <action>
    **Strategy**: strict-additive UI changes. Every change either replaces an existing literal with a registry call (no behavior change in DOM structure) or ADDS a new visible element.

    **Step A — Replace the existing disclaimer footer text (lines 543-552)**

    Before:
    ```tsx
    <p className="text-xs text-on-surface-variant leading-relaxed">
      This AI-generated research report is for informational purposes only. Information is sourced from real-time market data and historical filings. Cipher does not provide financial advice. Consult with a certified professional before making investment decisions.
    </p>
    ```

    After:
    ```tsx
    {(() => {
      const dataAsOfDate = analyzed_at.slice(0, 10); // YYYY-MM-DD from ISO 8601
      const body = renderPrompt('disclaimer-footer', { data_as_of_timestamp: dataAsOfDate });
      return (
        <p className="text-xs text-on-surface-variant leading-relaxed">{body}</p>
      );
    })()}
    ```

    Add import at top of file: `import { renderPrompt } from '@/lib/prompts/render';`. (If `analyzed_at` is not in scope at this line, hoist the `dataAsOfDate` computation up to the destructuring block at line 392-422.)

    **Step B — Add per-source data-as-of timestamps to Verified Intelligence Sources cards (line 1080-1094)**

    Before (line 1081-1093):
    ```tsx
    {sources_used.map((src, i) => (
      <div key={i} data-testid={`source-item-${i}`} className="...">
        <span className="font-mono text-tertiary text-xs block mb-1">{String(i + 1).padStart(2, '0')}</span>
        <h5 className="text-xs font-bold mb-1">{src.name}</h5>
        {src.key_fact && <p className="text-[10px] text-on-surface-variant leading-snug">{src.key_fact}</p>}
      </div>
    ))}
    ```

    After: add a per-source data-as-of line. Prefer `citations_v2[i].date_retrieved` (when present and indexed-aligned with `sources_used`); fall back to `analyzed_at.slice(0, 10)`.

    ```tsx
    {sources_used.map((src, i) => {
      const perSourceDate =
        analysisResult.citations_v2?.[i]?.date_retrieved?.slice(0, 10) ?? analyzed_at.slice(0, 10);
      return (
        <div key={i} data-testid={`source-item-${i}`} className="...">
          <span className="font-mono text-tertiary text-xs block mb-1">{String(i + 1).padStart(2, '0')}</span>
          <h5 className="text-xs font-bold mb-1">{src.name}</h5>
          {src.key_fact && <p className="text-[10px] text-on-surface-variant leading-snug">{src.key_fact}</p>}
          <p className="text-[10px] text-on-surface-variant/70 mt-1">as of {perSourceDate}</p>
        </div>
      );
    })}
    ```

    Note: `citations_v2` and `sources_used` may not be index-aligned — `citations_v2` is a citation log; `sources_used` is a curated source list. If they are not aligned, the fallback to `analyzed_at.slice(0, 10)` applies — the audit accepts either. Add a comment explaining this.

    **Step C — Render price_target with hedging qualifier**

    Locate the Valuation Context block (line 883-893). After it, ADD a new block (or augment the existing block — your judgment):

    ```tsx
    {analysisResult.price_target != null && (
      <div className="bg-surface-container-high p-5 rounded-lg" data-testid="price-target-block">
        <h3 className="text-[11px] font-bold tracking-widest uppercase text-on-surface-variant mb-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-sm text-tertiary">target</span>
          Price Target
        </h3>
        <p className="text-sm font-mono text-on-surface mb-2" data-testid="price-target-value">{analysisResult.price_target}</p>
        {(() => {
          const dataAsOfDate = analyzed_at.slice(0, 10);
          // 19-C-12 forward-ref: prefer conformal CI when present, else literal "(implied range)".
          // The conformal_ci field is not yet on the AnalysisResult schema — guarded as `(analysisResult as any).conformal_ci`
          // until 19-C-12 ships. When 19-C-12 lands and adds the typed field, this cast becomes a clean property access.
          const ci = (analysisResult as any).conformal_ci as { lower: number; upper: number; coverage: number } | undefined;
          let hedgeStr: string;
          if (ci != null && typeof ci.lower === 'number' && typeof ci.upper === 'number' && typeof ci.coverage === 'number') {
            const halfWidth = ((ci.upper - ci.lower) / 2).toFixed(2);
            const coveragePct = Math.round(ci.coverage * 100);
            hedgeStr = `\u00b1 $${halfWidth} (${coveragePct}% CI)`;
          } else {
            hedgeStr = '(implied range)';
          }
          const body = renderPrompt('price-target-hedge', {
            data_as_of_timestamp: dataAsOfDate,
            ci_band_or_implied_range: hedgeStr,
          });
          return <p className="text-[11px] text-on-surface-variant leading-tight">{body}</p>;
        })()}
      </div>
    )}
    ```

    Place this immediately after the Valuation Context block (line 893) inside the same parent container. Verify the resulting DOM is still well-formed.

    **Step D — Add the source-list footer at the END of the report**

    Locate the closing `</main>` of the report (search for `</main>` after the Forward Outlook section, line 1108-ish). Just before `</main>`, ADD:

    ```tsx
    {/* Source list footer — regulatory hygiene per Phase 20 S10 (20-D-05). */}
    <section className="border-t border-surface-container-high pt-6 mt-12">
      <h4 className="text-[10px] font-bold tracking-widest uppercase text-on-surface-variant/70 mb-3">
        Source List
      </h4>
      <ul data-testid="sources-footer-list" className="space-y-1 text-[10px] text-on-surface-variant/80">
        {sources_used.map((src, i) => {
          const perSourceDate =
            analysisResult.citations_v2?.[i]?.date_retrieved?.slice(0, 10) ?? analyzed_at.slice(0, 10);
          return (
            <li key={`footer-${i}`} className="flex items-baseline gap-2">
              <span className="font-mono text-tertiary">{String(i + 1).padStart(2, '0')}.</span>
              <span className="flex-1">{src.name}</span>
              {src.url && (
                <a href={src.url} className="text-tertiary hover:underline truncate max-w-xs">{src.url}</a>
              )}
              <span className="text-on-surface-variant/60">as of {perSourceDate}</span>
            </li>
          );
        })}
      </ul>
    </section>
    ```

    **Step E — Verify existing tests still pass**

    Run `npx vitest run src/components/__tests__/ResearchReport.test.tsx`. If it asserts on the EXACT old disclaimer prose, update the test to assert on the NEW prose (specifically, assert that the rendered output contains the literal "educational purposes only" — matches the auditor). Document the change in the task SUMMARY.

    Run `npm run lint` and `npx tsc --noEmit` to catch type errors from the `(analysisResult as any).conformal_ci` escape hatch — this is intentional (forward-ref to 19-C-12) but must not break typecheck.
  </action>
  <acceptance_criteria>
    - `grep -c "renderPrompt('disclaimer-footer'" src/components/ResearchReport.tsx` returns ≥1
    - `grep -c "renderPrompt('price-target-hedge'" src/components/ResearchReport.tsx` returns ≥1
    - `grep -c "data-testid=\"sources-footer-list\"" src/components/ResearchReport.tsx` returns 1
    - `grep -c "as of {" src/components/ResearchReport.tsx` returns ≥2 (sources card + footer block, both with as-of label)
    - `grep -c "informational purposes only" src/components/ResearchReport.tsx` returns 0 (old text removed)
    - `grep -c "data-testid=\"price-target-block\"" src/components/ResearchReport.tsx` returns 1
    - `npx vitest run src/components/__tests__/ResearchReport.test.tsx` exits 0
    - `npx tsc --noEmit` exits 0 (no new type errors)
  </acceptance_criteria>
  <verify>
    <automated>npx vitest run src/components/__tests__/ResearchReport.test.tsx && npx tsc --noEmit</automated>
  </verify>
  <done>ResearchReport renders all 4 RequiredElements; old disclaimer prose deleted; existing tests stay green; typecheck clean</done>
</task>

<task type="auto" tdd="true" id="20-D-05-05">
  <name>Task 5: Integration test — render → audit → assert clean + 4 negative cases</name>
  <read_first>
    - src/components/ResearchReport.tsx (Task 4)
    - src/lib/eval/disclaimer-audit.ts (Task 3)
    - tests/eval/disclaimer-audit.unit.test.ts (Task 2 — extends the fixture vocabulary)
    - src/components/__tests__/ResearchReport.test.tsx (pattern reference — how to render React components in vitest)
  </read_first>
  <behavior>
    `tests/eval/disclaimer-audit.integration.test.ts`:

    Setup: build a canonical AnalysisResult fixture covering all sections that the renderer touches (executive_summary, bullish_signals, bearish_signals, assessment, confidence_level/explanation, valuation_context, price_target = "$185", sources_used with 3 entries, analyzed_at fixed). Render via `renderToString` (or React Testing Library's `render(...).container.innerHTML`).

    Tests:
    1. `clean fixture passes audit` — render → auditDisclaimers(html, fixture, null) → `result.missing.length === 0`
    2. `synthetic removal of disclaimer footer trips audit` — render → mutate the rendered html string to remove all occurrences of "educational purposes only" → audit → `result.missing` contains 'disclaimer_footer'
    3. `synthetic removal of all data-as-of timestamps trips audit` — render → replace `/as of \d{4}-\d{2}-\d{2}/g` with empty string → audit → `result.missing` contains 'data_as_of_timestamp_per_source'
    4. `synthetic removal of price-target hedge trips audit` — render → remove both the CI band pattern and the literal "(implied range)" → audit → `result.missing` contains 'price_target_hedge'
    5. `synthetic removal of source list footer trips audit` — render → remove `data-testid="sources-footer-list"` → audit → `result.missing` contains 'source_list_footer'

    These 5 tests are the build-blocking guarantee that the audit catches each RequiredElement in isolation.
  </behavior>
  <action>
    Create `tests/eval/disclaimer-audit.integration.test.ts`. Use `react-dom/server`'s `renderToString` (the project likely already has the dep — check package.json; if not, use `@testing-library/react`'s `render` whose `container.innerHTML` returns the same shape).

    Use a single fixture `canonicalFixture: AnalysisResult` defined at the top of the file. Reuse across all 5 tests.

    For each negative case: render once, mutate the resulting HTML string with a targeted regex replacement, then audit.

    Note on JSDOM: ResearchReport.tsx is a `'use client'` component but its render output is deterministic for fixed inputs. `renderToString` is sufficient — no `useEffect` or `useState` semantics are required by the audit.
  </action>
  <acceptance_criteria>
    - File exists: `tests/eval/disclaimer-audit.integration.test.ts`
    - `grep -c "it(" tests/eval/disclaimer-audit.integration.test.ts` returns ≥5
    - `npx vitest run tests/eval/disclaimer-audit.integration.test.ts` exits 0 (all 5 tests GREEN)
    - Each of the 4 RequiredElements has a dedicated negative-case test that proves the audit fires
  </acceptance_criteria>
  <verify>
    <automated>npx vitest run tests/eval/disclaimer-audit.integration.test.ts</automated>
  </verify>
  <done>Integration test green — clean render passes audit; 4 synthetic-injection tests prove the audit catches each RequiredElement</done>
</task>

<task type="auto" id="20-D-05-06">
  <name>Task 6: scripts/audit-disclaimers.ts + npm run check-disclaimers</name>
  <read_first>
    - scripts/check-prompt-versions.ts (Task 6 of 20-Z-04 — pattern reference for npx tsx CI scripts)
    - tests/eval/disclaimer-audit.integration.test.ts (Task 5 — fixture pattern)
    - src/lib/eval/disclaimer-audit.ts (Task 3)
    - src/components/ResearchReport.tsx (Task 4 — render path)
    - package.json (scripts section — pattern for npm run wrappers)
  </read_first>
  <action>
    **Step A — Detect golden-ticker fixtures from 20-D-04**

    Path: `tests/golden-tickers/*.json`. 20-D-04 (sibling Wave D plan) creates these. If the directory does not exist OR is empty at execution time, the script falls back to a single inline fallback fixture (copy of the Task-5 canonical fixture, simplified) so this plan is mergeable independently of 20-D-04 ordering.

    **Step B — Create `scripts/audit-disclaimers.ts`**

    ```typescript
    import { readdirSync, existsSync, readFileSync } from 'fs';
    import { resolve } from 'path';
    import { renderToString } from 'react-dom/server';
    import { createElement } from 'react';
    import { auditDisclaimers } from '../src/lib/eval/disclaimer-audit';
    import ResearchReport from '../src/components/ResearchReport';
    import type { AnalysisResult } from '../src/lib/types';

    interface FixtureEntry {
      ticker: string;
      analysisResult: AnalysisResult;
    }

    function loadFixtures(): FixtureEntry[] {
      const dir = resolve(process.cwd(), 'tests/golden-tickers');
      if (!existsSync(dir)) {
        console.warn('[audit-disclaimers] tests/golden-tickers/ not found — using fallback fixture (20-D-04 not yet landed)');
        return [getFallbackFixture()];
      }
      const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
      if (files.length === 0) {
        console.warn('[audit-disclaimers] tests/golden-tickers/ empty — using fallback fixture');
        return [getFallbackFixture()];
      }
      return files.map((f) => {
        const raw = readFileSync(resolve(dir, f), 'utf-8');
        const parsed = JSON.parse(raw);
        // 20-D-04 fixture schema is presumed to be { ticker: string, analysisResult: AnalysisResult, sourcePackage?: SourcePackage }.
        // If 20-D-04 lands a different schema, this loader needs a follow-up tweak.
        return { ticker: parsed.ticker ?? f.replace(/\.json$/, ''), analysisResult: parsed.analysisResult };
      });
    }

    function getFallbackFixture(): FixtureEntry {
      // Minimal fixture — mirrors tests/eval/disclaimer-audit.integration.test.ts canonical fixture.
      // See Task 5 of this PLAN. Inline here so the script has no test-folder dependency.
      const analysisResult: AnalysisResult = {
        company_name: 'Apple Inc.',
        analyzed_at: '2026-05-11T17:00:00Z',
        market_sentiment: 'bullish',
        sentiment_reasoning: 'Strong fundamentals.',
        bullish_signals: [{ signal: 'Revenue growth', detail: '+12% YoY', source: 'Q1 10-Q' }],
        bearish_signals: [{ signal: 'Margin pressure', detail: 'Services down 1 pp', source: 'Earnings call' }],
        assessment: { decision: 'Hold', buy_rationale: '', hold_rationale: 'Fair value', sell_rationale: '' },
        confidence_level: 'Medium',
        confidence_explanation: 'Strong data.',
        price_target: '$185',
        sources_used: [
          { name: 'Yahoo Finance', key_fact: 'Live price', url: 'https://finance.yahoo.com' },
          { name: 'SEC EDGAR', key_fact: '10-Q', url: 'https://www.sec.gov' },
          { name: 'Anthropic Web Search', key_fact: 'Analyst summary', url: '' },
        ],
        source_warnings: [],
      } as AnalysisResult;
      return { ticker: 'AAPL-fallback', analysisResult };
    }

    async function main() {
      const fixtures = loadFixtures();
      const failures: { ticker: string; missing: string[] }[] = [];
      for (const fx of fixtures) {
        const html = renderToString(createElement(ResearchReport, { analysisResult: fx.analysisResult, ticker: fx.ticker }));
        const result = auditDisclaimers(html, fx.analysisResult, null);
        if (result.missing.length > 0) {
          failures.push({ ticker: fx.ticker, missing: result.missing });
        }
      }
      if (failures.length > 0) {
        console.error('\n[audit-disclaimers] FAILED — missing required elements:');
        for (const f of failures) {
          console.error(`  ${f.ticker}: ${f.missing.join(', ')}`);
        }
        process.exit(1);
      }
      console.log(`[audit-disclaimers] PASS — ${fixtures.length} fixture(s) clean`);
    }

    main().catch((err) => {
      console.error('[audit-disclaimers] CRASH:', err);
      process.exit(2);
    });
    ```

    **Step C — package.json wiring**

    Add to `scripts`:
    ```json
    "check-disclaimers": "npx tsx scripts/audit-disclaimers.ts"
    ```

    **Step D — Self-test the script**

    1. On the current branch (Tasks 1-5 already shipped): `npm run check-disclaimers` should exit 0 (the fallback fixture renders cleanly; if 20-D-04 has landed and its fixtures pass the audit, exit 0; if any fail, exit 1 — but Task 5's integration test guarantees the fallback is clean).
    2. Synthetic negative test: temporarily edit `src/lib/prompts/_v1/disclaimer-footer.md` to remove the phrase "educational purposes only", run `npm run check-disclaimers`, assert it exits non-zero. Revert the local edit. (Don't commit the synthetic edit.) This proves the audit fires end-to-end. Document the synthetic-test result in the task SUMMARY.

    **Step E — Server-render caveat**

    ResearchReport.tsx is marked `'use client'`. When `react-dom/server`'s `renderToString` encounters a `'use client'` directive in a non-Next-build context, it renders the component as a regular React component (the directive is a hint for the Next.js compiler, not runtime semantics). If the component uses browser-only APIs (e.g. `window`), wrap the script invocation with appropriate JSDOM shims OR refactor the offending APIs to be `typeof window !== 'undefined'`-guarded. Audit `ResearchReport.tsx` for any such APIs before running the script — if found, gate them; if not, no shims required.

    If `renderToString` is genuinely unworkable, fall back to `@testing-library/react`'s `render(...).container.innerHTML` driven by `happy-dom` or `jsdom` (the project's vitest config already uses one of these — verify via `vitest.config.ts`). In that case the script becomes a vitest-driven integration runner — pivot the implementation accordingly. Decision rule: prefer the simpler `renderToString` path; pivot only if it crashes.
  </action>
  <acceptance_criteria>
    - File exists: `scripts/audit-disclaimers.ts`
    - `package.json` `scripts.check-disclaimers` entry present
    - `npm run check-disclaimers` exits 0 on the committed tree (fallback or 20-D-04 fixtures)
    - Synthetic negative test (locally, NOT committed) trips the script to exit non-zero — documented in SUMMARY
  </acceptance_criteria>
  <verify>
    <automated>npm run check-disclaimers && grep -q "check-disclaimers" package.json && test -f scripts/audit-disclaimers.ts</automated>
  </verify>
  <done>CI script live; clean tree exits 0; synthetic prompt-text mutation provably trips the gate; npm run wired</done>
</task>

<task type="auto" id="20-D-05-07">
  <name>Task 7: GitHub Actions workflow + model card + commit</name>
  <read_first>
    - .github/workflows/prompts.yml (20-Z-04 — pattern reference)
    - .planning/phases/20-real-sentiment-analysis/MODEL-CARD-prompt-registry.md (20-Z-04 model card — pattern reference)
    - .planning/phases/20-real-sentiment-analysis/CONTEXT.md S4 (model card requirement)
    - .planning/phases/20-real-sentiment-analysis/CONTEXT.md S10 (regulatory hygiene anchor)
  </read_first>
  <action>
    **Step A — `.github/workflows/disclaimers.yml`**

    ```yaml
    name: Disclaimer Audit Gate
    on:
      pull_request:
        paths:
          - 'src/components/ResearchReport.tsx'
          - 'src/lib/eval/disclaimer-audit.ts'
          - 'src/lib/prompts/_v*/disclaimer-*.md'
          - 'src/lib/prompts/_v*/price-target-hedge*.md'
          - 'tests/golden-tickers/**'
          - 'tests/eval/disclaimer-audit.*.test.ts'
          - 'scripts/audit-disclaimers.ts'

    jobs:
      audit:
        runs-on: ubuntu-latest
        steps:
          - uses: actions/checkout@v4
          - uses: actions/setup-node@v4
            with:
              node-version: '20'
          - run: npm ci
          - run: npm run check-disclaimers
          - run: npx vitest run tests/eval/disclaimer-audit.unit.test.ts tests/eval/disclaimer-audit.integration.test.ts
    ```

    **Step B — `MODEL-CARD-disclaimer-audit.md`**

    Create `.planning/phases/20-real-sentiment-analysis/MODEL-CARD-disclaimer-audit.md` per S4 / Mitchell-2019. Sections:

    - **Component**: Disclaimer audit (src/lib/eval/disclaimer-audit.ts + 2 prompt registry entries)
    - **Versions tracked**: `disclaimer-footer@v1` and `price-target-hedge@v1` from `src/lib/prompts/_v1/`. Reference the 20-Z-04 prompt registry governance.
    - **Intended use**: Build-blocking regulatory-hygiene gate. Every rendered Cipher report carries the 4 RequiredElements; CI fails any PR that breaks the invariant.
    - **Out-of-distribution behavior**:
      - When `price_target == null`: `price_target_hedge` auto-passes (nothing to hedge — correct).
      - When `sources_used.length == 0`: `data_as_of_timestamp_per_source` flags as missing (no sources → no timestamps to check; the report is malformed at a deeper level; the audit surfacing this is correct, not a false positive).
      - When `citations_v2` is absent: fall back to `analyzed_at` as the per-source proxy date — accepted by the audit but documented as a coarser timestamp than per-source `date_retrieved`.
    - **Known failure modes / limitations**:
      - Auto-translation breaks disclaimer key terms (T-20-D-05-05) — accepted. Non-English locales not supported in this version; future i18n requires legal-counsel-reviewed translated templates per locale.
      - The audit regex is keyed to the v1 English body. Edits to the v1 prompt body that the 20-Z-04 golden snapshot accepts (via explicit `_v2/` bump + reviewer sign-off) but that drop one of the 3 protective phrases would slip past the snapshot — caught by the auditor regex. The two gates (snapshot + regex) are intentionally redundant.
      - Phase 29 scope: public-trail / public-per-user calibration-data publication outside the auth-gated UI requires legal-counsel review. THIS plan ships ONLY in-UI disclaimers. Phase 29 is the entry gate for any public publication.
    - **Retrain cadence**: N/A — versioned artifact registry, not a trained model. Disclaimer text edits trigger the 20-Z-04 version-bump path.
    - **Linked plan**: 20-D-05
    - **Linked upstream**: 20-Z-04 (prompt registry — hard dependency)
    - **Linked parallel-wave siblings**: 20-D-01 (numeric grounding), 20-D-02 (citation coverage), 20-D-03 (per-claim verification), 20-D-04 (golden tickers — provides fixtures consumed by this plan's CI script)
    - **Linked downstream**: 20-Z-06 (composite phase done gate consumes `npm run check-disclaimers` as one of its branches), Phase 29 (legal-counsel gate for any public-trail extension)

    **Step C — Verify all gates green**

    1. `npm test` exits 0 (existing test suite stays green)
    2. `npx vitest run tests/prompts/ tests/eval/disclaimer-audit*` exits 0
    3. `npx vitest run src/components/__tests__/ResearchReport.test.tsx` exits 0
    4. `npm run check-disclaimers` exits 0
    5. `npm run check-prompts` exits 0 (20-Z-04 gate — the 2 new prompts have v1 directories; no v1 body modifications without v2 sibling)
    6. `npx tsc --noEmit` exits 0

    **Step D — Final commit**

    Commit message: `feat(20-D-05): disclaimer + appropriate-use audit + CI gate (regulatory hygiene S10)`. Reference T-20-D-05-01..05.
  </action>
  <acceptance_criteria>
    - File exists: `.github/workflows/disclaimers.yml`
    - File exists: `.planning/phases/20-real-sentiment-analysis/MODEL-CARD-disclaimer-audit.md`
    - The workflow's `paths:` filter includes the 7 directories/files listed above
    - Model card has all S4 sections + Phase 29 forward-reference
    - All 6 verification commands in Step C exit 0
  </acceptance_criteria>
  <verify>
    <automated>test -f .github/workflows/disclaimers.yml && test -f .planning/phases/20-real-sentiment-analysis/MODEL-CARD-disclaimer-audit.md && npm test && npm run check-disclaimers && npx tsc --noEmit</automated>
  </verify>
  <done>Workflow live; model card committed; all verification gates green; Phase 29 forward-reference documented</done>
</task>

</tasks>

<verification>

## Numerical acceptance criteria (S8)

| ID | Metric | Threshold | Verification command |
|----|--------|-----------|----------------------|
| V1 | `npm run check-disclaimers` exit code | 0 on clean main | `npm run check-disclaimers; echo $?` |
| V2 | Required elements detected per fixture | All 4 (disclaimer_footer, data_as_of_timestamp_per_source, price_target_hedge, source_list_footer) | `npm run check-disclaimers` → stdout reports per-fixture pass |
| V3 | Synthetic injection trips audit | Exit non-zero on disclaimer removal | Manual: edit `_v1/disclaimer-footer.md`, run check, revert (per Task 6 Step D) |
| V4 | Prompt registry entries exist | 2 (disclaimer-footer@v1, price-target-hedge@v1) | `grep -c "disclaimer-footer" src/lib/prompts/registry.ts` returns ≥1; same for price-target-hedge |
| V5 | Unit tests green | ≥8 | `npx vitest run tests/eval/disclaimer-audit.unit.test.ts` exits 0 |
| V6 | Integration tests green | ≥5 (clean + 4 negative cases) | `npx vitest run tests/eval/disclaimer-audit.integration.test.ts` exits 0 |
| V7 | Registry unit tests green | ≥4 new + all existing | `npx vitest run tests/prompts/registry.unit.test.ts` exits 0 |
| V8 | Golden snapshot diff is additive-only | 2 new entries, 0 modified | `git diff tests/prompts/__snapshots__/registry.golden.test.ts.snap` shows only `+` lines for the 2 new entries |
| V9 | Old disclaimer prose removed | `grep -c "informational purposes only" src/components/ResearchReport.tsx` == 0 | Direct grep |
| V10 | New disclaimer body present in exactly one place | `grep -rc "educational purposes only" src/` == 1 (only the v1 markdown) | Direct grep |
| V11 | Phase 29 forward-reference present | ≥2 references in this PLAN + ≥1 in MODEL-CARD | grep "Phase 29" PLAN + MODEL-CARD |
| V12 | Existing UI test stays green | `src/components/__tests__/ResearchReport.test.tsx` | `npx vitest run src/components/__tests__/ResearchReport.test.tsx` exits 0 |
| V13 | TypeScript clean | `npx tsc --noEmit` exits 0 | Direct invocation |

## Scope-creep guard

This plan ships ONLY:
- Disclaimer footer rendering + audit
- Price-target hedge rendering + audit
- Per-source data-as-of timestamps rendering + audit
- Source-list footer rendering + audit
- 2 new prompt registry entries (disclaimer-footer@v1, price-target-hedge@v1)
- 1 audit module, 1 CI script, 1 CI workflow, 1 model card

This plan does NOT ship:
- Numeric grounding regression test (20-D-01)
- Citation coverage metric (20-D-02)
- Per-claim CoVe verification extension (20-D-03)
- Golden ticker fixtures (20-D-04 — consumed but not created here)
- Conformal CI for price_target (19-C-12 — forward-ref only)
- Public-trail / per-user calibration data publication (Phase 29 — explicitly out of scope, legal counsel required)
- i18n / non-English disclaimer translations (documented as accepted limitation per T-20-D-05-05)

</verification>

<success_criteria>

Phase 20 plan 20-D-05 is complete when:

1. Both disclaimer templates (`disclaimer-footer@v1` and `price-target-hedge@v1`) are registered in the 20-Z-04 prompt registry — loadable via `getPrompt` and `renderPrompt`; locked by the golden snapshot.
2. ResearchReport.tsx renders all 4 RequiredElements (disclaimer footer, per-source data-as-of timestamps, price-target hedge, source-list footer) — call sites use the registry, no string literal duplication.
3. `src/lib/eval/disclaimer-audit.ts` exports `auditDisclaimers` returning a closed-union `RequiredElement` count + `missing[]` array.
4. `scripts/audit-disclaimers.ts` iterates available fixtures (20-D-04 golden tickers when present, fallback fixture otherwise) and exits non-zero on any missing element.
5. `npm run check-disclaimers` is wired into `.github/workflows/disclaimers.yml` and gates every PR touching the disclaimer surface.
6. ≥8 unit tests + ≥5 integration tests cover the 4 RequiredElements both positively and negatively (synthetic injection).
7. `MODEL-CARD-disclaimer-audit.md` documents the artifact per S4 with explicit Phase 29 forward-reference for public-trail / public-per-user calibration-data publication.
8. All existing tests (`npm test`, `npx tsc --noEmit`, the ResearchReport UI test) stay green — strict-additive proof.

</success_criteria>

<output>
After completion, create `.planning/phases/20-real-sentiment-analysis/20-D-05-SUMMARY.md` documenting:

- Tasks completed (1–7) with file paths created/modified
- Verification command outputs (V1–V13 from `<verification>` table)
- Synthetic-injection self-test result (Task 6 Step D) — did it trip as expected?
- Any deviations from the plan (e.g. filename reconciliation `_v1/disclaimer-footer.md` vs operator-spec `disclaimer-footer-v1.md` — document the convention chosen and why)
- Golden snapshot diff summary (2 entries added, 0 modified)
- Phase 29 forward-reference confirmed in PLAN + model card
- Whether 20-D-04 fixtures were available at execution time (fallback path used or real fixtures consumed)
- Open follow-ups for parallel-wave siblings (20-D-01..04)
</output>
