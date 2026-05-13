// src/lib/eval/disclaimer-audit.ts
// Plan 20-D-05 — Regulatory-hygiene audit (CONTEXT.md §S10).
//
// Pure-TS auditor that checks a rendered ResearchReport HTML string for the
// 4 RequiredElements:
//   1. disclaimer_footer — literal protective phrases from the v1 prompt body.
//   2. data_as_of_timestamp_per_source — one "as of YYYY-MM-DD" per source.
//   3. price_target_hedge — CI band or "(implied range)" qualifier; never raw.
//   4. source_list_footer — <ul data-testid="sources-footer-list"> with ≥1 <li>.
//
// Trust boundary (S7 T-20-D-05-04): the 3 disclaimer phrases are checked
// independently of the 20-Z-04 golden snapshot — a future commit that edits
// the v1 body AND the snapshot to weaken protections would still be caught
// here. Two gates, redundant on purpose.
//
// Used by:
//   - tests/eval/disclaimer-audit.unit.test.ts (10 unit cases)
//   - tests/eval/disclaimer-audit.integration.test.ts (clean + 4 negatives)
//   - scripts/audit-disclaimers.ts (CI build-blocking gate)

import type { AnalysisResult, SourcePackage } from '@/lib/types';

/** Closed union — the 4 regulatory-hygiene elements per CONTEXT.md S10. */
export type RequiredElement =
  | 'disclaimer_footer'
  | 'data_as_of_timestamp_per_source'
  | 'price_target_hedge'
  | 'source_list_footer';

export interface DisclaimerAuditResult {
  required_elements_present: Record<RequiredElement, boolean>;
  /** Subset of RequiredElement whose value is `false`. Empty == clean audit. */
  missing: RequiredElement[];
}

// Required phrases drawn directly from src/lib/prompts/_v1/disclaimer-footer.md
// v1 body. If the v1 body changes, the 20-Z-04 golden snapshot fails AND
// (if a weakening edit slips past snapshot review) these regexes also fail.
const DISCLAIMER_REQUIRED_PHRASES: RegExp[] = [
  /educational purposes only/i,
  /not constitute personalized investment advice/i,
  /[Cc]onsult a licensed financial advisor/,
];

const DATA_AS_OF_PATTERN = /as of \d{4}-\d{2}-\d{2}/g;

// CI band: "± $X.XX (NN% CI)" — note the unicode ± character (\u00b1).
const CI_BAND_PATTERN = /\u00b1 \$[\d,.]+ \(\d+% CI\)/;
const IMPLIED_RANGE_PATTERN = /\(implied range\)/;

const SOURCE_LIST_FOOTER_PATTERN = /data-testid=["']sources-footer-list["']/;
const LIST_ITEM_PATTERN = /<li[ >]/;

// RequiredElement union declaration order — used to produce a stable `missing[]`.
const REQUIRED_ELEMENT_ORDER: RequiredElement[] = [
  'disclaimer_footer',
  'data_as_of_timestamp_per_source',
  'price_target_hedge',
  'source_list_footer',
];

/**
 * Runs the 4 element checks against the rendered HTML + structured inputs.
 *
 * Rules:
 *  - disclaimer_footer: rendered_html must contain ALL 3 protective phrases.
 *  - data_as_of_timestamp_per_source: count of `as of YYYY-MM-DD` matches must
 *    be >= analysisResult.sources_used.length AND sources_used.length > 0.
 *  - price_target_hedge: if analysisResult.price_target is null/undefined,
 *    this check is auto-pass. Otherwise the rendered_html must contain
 *    EITHER the CI band pattern OR `(implied range)`.
 *  - source_list_footer: rendered_html must contain both the footer testid
 *    attribute AND at least one `<li` child.
 */
export function auditDisclaimers(
  rendered_html: string,
  analysisResult: AnalysisResult,
  // sourcePackage reserved for future per-source provenance cross-checks; not
  // currently consulted because all signals are already on the rendered HTML
  // and on analysisResult. Kept in the signature so the interface is stable.
  _sourcePackage: SourcePackage | null,
): DisclaimerAuditResult {
  // disclaimer_footer
  const disclaimer_footer = DISCLAIMER_REQUIRED_PHRASES.every((re) => re.test(rendered_html));

  // data_as_of_timestamp_per_source
  const timestampMatches = rendered_html.match(DATA_AS_OF_PATTERN) ?? [];
  const requiredCount = analysisResult.sources_used.length;
  const data_as_of_timestamp_per_source =
    requiredCount > 0 && timestampMatches.length >= requiredCount;

  // price_target_hedge
  let price_target_hedge: boolean;
  if (analysisResult.price_target == null) {
    price_target_hedge = true; // auto-pass when nothing to hedge
  } else {
    price_target_hedge =
      CI_BAND_PATTERN.test(rendered_html) || IMPLIED_RANGE_PATTERN.test(rendered_html);
  }

  // source_list_footer
  const hasFooterContainer = SOURCE_LIST_FOOTER_PATTERN.test(rendered_html);
  const hasLi = LIST_ITEM_PATTERN.test(rendered_html);
  const source_list_footer = hasFooterContainer && hasLi;

  const required_elements_present: Record<RequiredElement, boolean> = {
    disclaimer_footer,
    data_as_of_timestamp_per_source,
    price_target_hedge,
    source_list_footer,
  };

  const missing = REQUIRED_ELEMENT_ORDER.filter((k) => !required_elements_present[k]);

  return { required_elements_present, missing };
}
