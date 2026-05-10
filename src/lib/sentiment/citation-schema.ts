// src/lib/sentiment/citation-schema.ts
//
// Phase 19 / Plan 19-C-07 — Structured citation schema (D-39).
//
// Replaces free-text `source_citation: string` in AnalysisResultSchema with a
// structured `Citation` object, validated at Zod parse time. Mandatory URL for
// `source ∈ {analyst, news}` is enforced via superRefine. URLs containing
// embedded `user:pass@` auth are sanitized to `***@` (T-19-C-07-03).
//
// Consumed by:
//   - src/lib/research-brief.ts        — assembles citations from SourcePackage
//   - src/lib/gemini-analysis.ts       — AnalysisResultSchema.citations_v2
//   - scripts/shadow-verdict.ts        — citations-v2 strategy: URL coverage rate
//   - scripts/model-card-status.ts     — checks ≥90% URL coverage on last-30d
//                                         analyst/news claims (Wave C success +
//                                         19-Z-04 gate)

import { z } from 'zod';

const SOURCE_TYPES = [
  'analyst',
  'news',
  'sec_filing',
  'social',
  'options',
  'community',
  'price_data',
  'other',
] as const;

/**
 * Source types for which a URL MUST be present at validation time. Citations
 * referencing analyst commentary or news articles without a verifiable URL
 * are rejected by superRefine — the LLM may not invent unsourced claims for
 * these categories (T-19-C-07-01 mitigation).
 */
const URL_REQUIRED_SOURCES: ReadonlyArray<(typeof SOURCE_TYPES)[number]> = [
  'analyst',
  'news',
];

/**
 * Strip embedded `user:pass@` auth segments from a URL string (ASVS V7 / D-39
 * info-disclosure mitigation T-19-C-07-03). Same regex shape as the recursive
 * sanitizer in src/lib/shadow/shadow-runner.ts so behavior is consistent
 * across shadow persistence and citation parsing.
 */
export function sanitizeUrl(url: string): string {
  return url.replace(/(https?:\/\/)([^@/\s]+@)/g, '$1***@');
}

export const CitationSchema = z
  .object({
    source: z.enum(SOURCE_TYPES),
    // url may be null for source types that don't require linkable evidence
    // (social, community, options, etc.). For analyst/news, the superRefine
    // below trips when null.
    url: z
      .string()
      .url()
      .nullable()
      .transform((u) => (u ? sanitizeUrl(u) : null)),
    confidence: z.number().min(0).max(1),
    date_retrieved: z.string().datetime(),
  })
  .superRefine((data, ctx) => {
    if (URL_REQUIRED_SOURCES.includes(data.source) && !data.url) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['url'],
        message: `URL is mandatory when source is '${data.source}' (per D-39)`,
      });
    }
  });

export const CitationsArraySchema = z.array(CitationSchema);

export type Citation = z.infer<typeof CitationSchema>;
export type CitationSource = (typeof SOURCE_TYPES)[number];
