# MODEL CARD — Disclaimer Audit (Plan 20-D-05)

> Format: Mitchell et al. 2019 (Model Cards for Model Reporting), adapted for a
> versioned regulatory-hygiene artifact rather than a trained model.
> CONTEXT §S4 mandates one model card per shipped sentiment artifact;
> CONTEXT §S10 mandates regulatory hygiene as a phase-level gate.

## Component

- **Module**: `src/lib/eval/disclaimer-audit.ts` — pure-TS auditor exposing
  `auditDisclaimers(rendered_html, analysisResult, sourcePackage) ->
  { required_elements_present, missing }`.
- **CI script**: `scripts/audit-disclaimers.ts` — invoked by
  `npm run check-disclaimers`; build-blocking via
  `.github/workflows/disclaimers.yml`.
- **Tied prompts** (versioned via 20-Z-04 registry):
  - `src/lib/prompts/_v1/disclaimer-footer.md` (`disclaimer-footer@v1`)
  - `src/lib/prompts/_v1/price-target-hedge.md` (`price-target-hedge@v1`)
- **Render site**: `src/components/ResearchReport.tsx` — calls
  `renderPrompt('disclaimer-footer', ...)`,
  `renderPrompt('price-target-hedge', ...)`, and emits per-source `as of
  YYYY-MM-DD` lines + a `<ul data-testid="sources-footer-list">` footer.

## Versions tracked

- `disclaimer-footer@v1` (declared variables: `data_as_of_timestamp`)
- `price-target-hedge@v1` (declared variables: `data_as_of_timestamp`,
  `ci_band_or_implied_range`)

Edits to either body require a `_v2/` sibling per the 20-Z-04 prompt-registry
governance — caught by the golden snapshot at
`tests/prompts/__snapshots__/registry.golden.test.ts.snap` AND by the
`scripts/check-prompt-versions.ts` git-diff guard.

## Intended use

Build-blocking regulatory-hygiene gate. Every rendered Cipher research report
must carry these 4 RequiredElements:

1. **`disclaimer_footer`** — literal phrases `educational purposes only`,
   `not constitute personalized investment advice`,
   `Consult a licensed financial advisor`.
2. **`data_as_of_timestamp_per_source`** — one `as of YYYY-MM-DD` per source.
3. **`price_target_hedge`** — when `analysisResult.price_target != null`, the
   rendered output carries EITHER `± $X.XX (NN% CI)` (from
   19-C-12 conformal CI when present) OR the literal `(implied range)` —
   never a raw number alone.
4. **`source_list_footer`** — `<ul data-testid="sources-footer-list">` with
   ≥1 `<li>` child rendered as a compact footer.

The audit is independent of the prompt registry's golden snapshot — together
they form a 2-gate redundancy against accidental disclaimer weakening
(T-20-D-05-04).

## Out-of-distribution behavior

| Scenario | Behavior |
|----------|----------|
| `analysisResult.price_target == null` | `price_target_hedge` auto-passes — nothing to hedge. Correct. |
| `sources_used.length == 0` | `data_as_of_timestamp_per_source` flags missing. The report is malformed at a deeper level (the source pipeline returned zero sources); the audit surfacing this is correct, not a false positive. |
| `citations_v2` absent on `analysisResult` | Render falls back to `analyzed_at.slice(0, 10)` as the per-source proxy date. Audit accepts both per-source `date_retrieved` and the report-level fallback. Coarser provenance, documented limitation. |
| `analysisResult.conformal_ci` absent (19-C-12 not yet shipped) | Render emits the literal `(implied range)` qualifier. Audit accepts both patterns. |

## Known failure modes / limitations

- **Non-English browser auto-translation (T-20-D-05-05, accept)** — disclaimer
  text is authoritative in English only. Users browsing in a non-English locale
  via Chrome/Safari auto-translation will see translated strings that may not
  carry the same legal force as the English originals. Cipher does not
  currently support non-English locales; this is a documented limitation, not
  a defect. Future i18n work (post-Phase-29) requires per-locale,
  legal-counsel-reviewed disclaimer templates.
- **Regex sensitivity to v1 body edits** — the audit's protective-phrase regex
  is keyed to the exact phrasing of `disclaimer-footer@v1`. Edits that the
  20-Z-04 golden snapshot accepts (via explicit `_v2/` bump + reviewer
  sign-off) but that drop one of the 3 protective phrases would still be
  caught here. The two gates (snapshot + regex) are redundant on purpose.
- **No public-trail / per-user calibration data publication** — this plan
  ships disclaimers gating only the existing auth-gated UI. Any public
  publication (per-user calibration trails, public per-report alpha histories,
  external-facing model cards) is **Phase 29 scope** and requires legal-counsel
  review before shipping.

## Retrain cadence

N/A — the auditor is a versioned regulatory-hygiene artifact, not a trained
model. Disclaimer text edits go through the 20-Z-04 version-bump path
(`_v(N+1)/<id>.md`); audit code edits go through normal code review.

## Linked plan

- **Plan**: 20-D-05 (`.planning/phases/20-real-sentiment-analysis/20-D-05-PLAN.md`)

## Linked upstream

- **20-Z-04** — prompt registry (hard dependency: `getPrompt` / `renderPrompt`)
- **CONTEXT.md S10** — regulatory hygiene as a phase-level Definition of Done

## Linked parallel-wave siblings

- **20-D-01** — numeric grounding regression test
- **20-D-02** — citation coverage metric
- **20-D-03** — per-claim CoVe verification extension
- **20-D-04** — 8 golden tickers; provides fixtures consumed by
  `scripts/audit-disclaimers.ts` when present (fallback inline fixture used
  otherwise)

## Linked downstream

- **20-Z-06** — composite phase done gate consumes `npm run check-disclaimers`
- **19-C-12** — conformal CI for price_target (provides the `± CI` band when it
  lands; until then the literal `(implied range)` qualifier is the audit's
  accepted path)
- **Phase 29** — legal-counsel entry gate for any public-trail / per-user
  calibration-data publication outside the auth-gated UI. This audit's scope
  STOPS at the auth wall; Phase 29 owns anything that crosses it.

## Threat model (S7)

| Threat ID | Category | Component | Disposition | Mitigation |
|-----------|----------|-----------|-------------|-----------|
| T-20-D-05-01 | Tampering | Future commit weakens disclaimer text | mitigate | 3 independent gates: (1) 20-Z-04 golden snapshot; (2) `scripts/check-prompt-versions.ts` git-diff guard; (3) auditDisclaimers regex on rendered HTML |
| T-20-D-05-02 | Information disclosure | Raw price_target rendered without hedge | mitigate | auditDisclaimers `price_target_hedge` rule requires CI band OR `(implied range)`; render layer wraps every price_target with the hedge |
| T-20-D-05-03 | Tampering | Per-source data-as-of missing | mitigate | auditDisclaimers `data_as_of_timestamp_per_source` counts `as of YYYY-MM-DD` matches >= `sources_used.length`; render prefers `citations_v2[i].date_retrieved`, falls back to `analyzed_at` |
| T-20-D-05-04 | Tampering | Direct file edit to weaken protections + tampered snapshot | mitigate | Auditor regex is independent of snapshot — a snapshot-accepted weakening edit still fails the regex check |
| T-20-D-05-05 | Information disclosure | Browser auto-translate breaks key terms | accept (documented) | Non-English locales not supported in this version; future i18n work post-Phase 29 with legal counsel |

## Forward references

- **Phase 29** — public-trail / per-user calibration data publication;
  legal-counsel entry gate.
- **19-C-12** — conformal CI band for `price_target` field on
  `AnalysisResult`; when shipped, the render path emits the `± $X.XX (NN% CI)`
  qualifier automatically (else `(implied range)`).
