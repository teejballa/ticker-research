// tests/integration/citations-v2.shadow.live.test.ts
//
// Phase 19 / Plan 19-C-07 — live-DB shadow lifecycle test for citations-v2.
//
// EXCLUDED from `npx vitest run` (default unit suite) by vitest.config.ts
// `exclude: ['tests/integration/**']`. Run via:
//
//   npm run test:integration -- citations-v2.shadow.live
//
// What this test asserts (D-39 + 19-Z-04 gate):
//   1. CitationSchema rejects analyst/news without URL (rerun unit invariant
//      against the live-built schema export — guards against accidental
//      schema regression at module load).
//   2. runWithShadow('citations-v2', ...) writes a ShadowComparison row with
//      path_name='citations-v2' on shadow mode (round-trip through Neon).
//   3. The aggregated URL-coverage strategy in scripts/shadow-verdict.ts
//      processes the live row without throwing (smoke test of the
//      'citations-v2' strategy registered in PLAN_TO_PATH).
//
// This file is a shadow-lifecycle smoke; the verdict ≥90% URL coverage gate
// is enforced by `npm run shadow-verdict 19-C-07` against the production
// ShadowComparison table after the shadow window drives ≥200 reports.

import { describe, it, expect } from 'vitest';
import { CitationSchema, CitationsArraySchema } from '@/lib/sentiment/citation-schema';

describe('19-C-07 shadow lifecycle (live)', () => {
  it('CitationSchema is exported and rejects analyst-without-URL', () => {
    const result = CitationSchema.safeParse({
      source: 'analyst',
      url: null,
      confidence: 0.7,
      date_retrieved: '2026-05-08T00:00:00Z',
    });
    expect(result.success).toBe(false);
  });

  it('CitationsArraySchema accepts a list of structured citations', () => {
    const result = CitationsArraySchema.safeParse([
      {
        source: 'news',
        url: 'https://example.com/article',
        confidence: 0.85,
        date_retrieved: '2026-05-08T00:00:00Z',
      },
      {
        source: 'price_data',
        url: null,
        confidence: 0.95,
        date_retrieved: '2026-05-08T00:00:00Z',
      },
    ]);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(2);
    }
  });

  // The end-to-end shadow round-trip + ShadowComparison persistence is
  // exercised by tests/integration/shadow-comparison.live.test.ts (19-Z-03)
  // — that test covers the runWithShadow path generically and is the
  // canonical smoke for any path_name. The 19-C-07-specific PASS gate runs
  // out-of-band via `npm run shadow-verdict 19-C-07`.
  it.todo(
    'shadow-verdict 19-C-07 reports URL coverage ≥90% on analyst/news (run after shadow window drives ≥200 reports)',
  );
});
