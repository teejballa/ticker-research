// src/lib/eval/claim-extraction-regex.ts
//
// Plan 20-D-02 — Algorithm A claim extractor (regex).
//
// Deterministic, fast, cheap. Complements the LLM-judge extractor (claim-
// extraction-llm.ts) which catches passive-voice / nested-clause claims the
// regex misses. The two methods' agreement is measured by Cohen's kappa on
// the 100-claim labeled set (scripts/eval-claim-extraction-kappa.ts).
//
// Algorithm:
//   1. Split on sentence boundaries (regex split, post-process for offsets).
//   2. Drop boilerplate sentences (EXCLUSION regex).
//   3. Keep sentences containing a claim-language verb (CLAIM_LANGUAGE regex).
//   4. Stamp section, start_char (section-local), end_char, kind='qualitative'.

import type { Claim, ReportSection } from './citation-coverage.types';

const SENTENCE_SPLIT = /(?<=[.!?])\s+(?=[A-Z])/g;

export const CLAIM_LANGUAGE =
  /\b(is|are|was|were|will|may|could|reports|announced|disclosed|expects|expected|guidance|projects|projected|forecast|forecasts|estimates|estimated|reported|raised|lowered|cut|increased|decreased|grows|growing|grew|benefit|benefits|benefited|posted|posts|trades|trade|leads|leading|reflect|reflects|reflected|suggests|suggest|suggested)\b/i;

export const EXCLUSION =
  /^\s*(disclaimer|sources|methodology|navigation|table of contents|see also|figure|chart|data as of)\b/i;

/**
 * Extract qualitative claims from a single section of text.
 *
 * start_char / end_char are SECTION-LOCAL offsets — the caller is responsible
 * for splitting the rendered report by section header before calling this.
 *
 * @param text     The section's plain-text body.
 * @param section  The ReportSection the text belongs to.
 */
export function extractClaimsRegex(text: string, section: ReportSection): Claim[] {
  if (!text || !text.trim()) return [];

  const out: Claim[] = [];
  // Walk the text with a cursor so split-derived sentences keep accurate offsets.
  let cursor = 0;
  const sentences = text.split(SENTENCE_SPLIT);

  for (const s of sentences) {
    if (!s) continue;
    const idx = text.indexOf(s, cursor);
    if (idx === -1) continue;
    cursor = idx + s.length;

    if (EXCLUSION.test(s)) continue;
    if (!CLAIM_LANGUAGE.test(s)) continue;

    out.push({
      text: s.trim(),
      section,
      start_char: idx,
      end_char: idx + s.length,
      source_method: 'regex',
      kind: 'qualitative',
    });
  }
  return out;
}
