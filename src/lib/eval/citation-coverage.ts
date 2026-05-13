// src/lib/eval/citation-coverage.ts
//
// Plan 20-D-02 — citation-coverage metric entrypoint.
//
// Exports:
//   - extractCitationAnchors  — locate Citation positions in rendered section text
//   - citationCoverage        — rule-A + rule-B matcher; returns CoverageResult
//   - re-exports extractClaimsRegex / extractClaimsLLM / mergeClaimSets so
//     downstream scripts can import everything from a single path.
//
// Matching rules (executed in order; first hit wins):
//   Rule A — anchor proximity: any anchor with anchor_pos within
//            ±ANCHOR_WINDOW_CHARS (50) of c.start_char → SUPPORTED.
//   Rule B — keyword overlap: cosineBagOfWords(claim, citation_url+title)
//            ≥ KEYWORD_OVERLAP_MIN (0.5) → SUPPORTED.
//
// kappa_method_disagreements counter: incremented for each surviving claim
// that retained a single-method tag (regex XOR llm) after merge — surfaces
// the dis-agreement rate without re-running the kappa script.

import type {
  Claim,
  ReportSection,
  CitationAnchor,
  CoverageResult,
} from './citation-coverage.types';
import {
  ANCHOR_WINDOW_CHARS,
  KEYWORD_OVERLAP_MIN,
  COVERAGE_OVERALL_MIN,
  COVERAGE_SECTION_MIN,
  REPORT_SECTIONS,
} from './citation-coverage.types';
import type { Citation } from '@/lib/sentiment/citation-schema';
import { bagOfWords, cosineBagOfWords } from './claim-merge';

export { extractClaimsRegex } from './claim-extraction-regex';
export { extractClaimsLLM } from './claim-extraction-llm';
export { mergeClaimSets } from './claim-merge';
export {
  ANCHOR_WINDOW_CHARS,
  KEYWORD_OVERLAP_MIN,
  COVERAGE_OVERALL_MIN,
  COVERAGE_SECTION_MIN,
};

/**
 * Compute citation anchor positions for one section.
 *
 * Strategy:
 *   1. If the citation has a url and the URL substring is found in `rendered`
 *      → that index is the anchor.
 *   2. Else, try the bare domain (hostname only) — reports often shorten URLs.
 *   3. Else, anchor_pos = -1. The citation can still match a claim via Rule B.
 */
export function extractCitationAnchors(
  rendered: string,
  citations: ReadonlyArray<Citation>,
  section: ReportSection,
): CitationAnchor[] {
  const out: CitationAnchor[] = [];
  for (const c of citations) {
    let pos = c.url ? rendered.indexOf(c.url) : -1;
    if (pos === -1 && c.url) {
      const m = c.url.match(/^https?:\/\/([^/]+)/);
      if (m) pos = rendered.indexOf(m[1]);
    }
    out.push({ citation: c, anchor_pos: pos, section });
  }
  return out;
}

interface CitationCoverageOpts {
  sectionMin?: number;
  overallMin?: number;
}

function emptyResult(): CoverageResult {
  const ps = {} as Record<ReportSection, number>;
  return {
    coverage_pct: 100,
    per_section: ps,
    unsupported: [],
    totals: {
      total_claims: 0,
      supported: 0,
      unsupported: 0,
      kappa_method_disagreements: 0,
    },
  };
}

/**
 * Score citation coverage for one or more sections.
 *
 * Returns coverage_pct (rounded to 2 decimals), per-section breakdown,
 * the unsupported claim residual, and totals (including kappa_method_disagreements).
 */
export function citationCoverage(
  claims: Claim[],
  anchors: CitationAnchor[],
  opts: CitationCoverageOpts = {},
): CoverageResult {
  // Reserved for future use — currently the policy floors are advisory at the
  // CLI layer (scripts/eval-citation-coverage.ts). Touch them so unused-var
  // lint stays happy in strict mode if the lint rule is enabled later.
  void (opts.sectionMin ?? COVERAGE_SECTION_MIN);
  void (opts.overallMin ?? COVERAGE_OVERALL_MIN);

  if (claims.length === 0) {
    // eslint-disable-next-line no-console
    console.warn('citationCoverage: empty claims input — returning coverage_pct=100');
    return emptyResult();
  }

  const anchorsBySection = new Map<ReportSection, CitationAnchor[]>();
  for (const a of anchors) {
    const arr = anchorsBySection.get(a.section) ?? [];
    arr.push(a);
    anchorsBySection.set(a.section, arr);
  }

  const claimsBySection = new Map<ReportSection, Claim[]>();
  for (const c of claims) {
    const arr = claimsBySection.get(c.section) ?? [];
    arr.push(c);
    claimsBySection.set(c.section, arr);
  }

  const per_section = {} as Record<ReportSection, number>;
  const unsupported: Claim[] = [];
  let totalSupported = 0;
  let kappaDisagreements = 0;

  for (const section of REPORT_SECTIONS) {
    const secClaims = claimsBySection.get(section);
    if (!secClaims || secClaims.length === 0) continue;
    const secAnchors = anchorsBySection.get(section) ?? [];

    let supported = 0;
    for (const c of secClaims) {
      let ok = false;
      // Rule A — anchor proximity (inclusive ≤).
      for (const a of secAnchors) {
        if (a.anchor_pos >= 0 && Math.abs(a.anchor_pos - c.start_char) <= ANCHOR_WINDOW_CHARS) {
          ok = true;
          break;
        }
      }
      // Rule B — keyword overlap (only when Rule A did not fire).
      if (!ok) {
        const claimVec = bagOfWords(c.text);
        for (const a of secAnchors) {
          const cit = a.citation;
          const titlePart = (cit as { title?: string }).title ?? '';
          const citVec = bagOfWords((cit.url ?? '') + ' ' + titlePart);
          if (cosineBagOfWords(claimVec, citVec) >= KEYWORD_OVERLAP_MIN) {
            ok = true;
            break;
          }
        }
      }
      if (ok) supported++;
      else unsupported.push(c);
      // Disagreement counter: surviving claims tagged with a single method
      // (regex XOR llm) — 'merged' means both methods agreed.
      if (c.source_method !== 'merged') kappaDisagreements++;
    }

    per_section[section] = Math.round((supported / secClaims.length) * 10000) / 100;
    totalSupported += supported;
  }

  const coverage_pct = Math.round(((totalSupported / claims.length) * 100) * 100) / 100;
  return {
    coverage_pct,
    per_section,
    unsupported,
    totals: {
      total_claims: claims.length,
      supported: totalSupported,
      unsupported: claims.length - totalSupported,
      kappa_method_disagreements: kappaDisagreements,
    },
  };
}
