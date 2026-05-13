// tests/integration/per-doc-classifier.integration.test.ts
// Plan 20-B-01 Task 8 — live AI-Gateway integration test for classifyDocumentsBatch.
//
// Skips when no AI Gateway auth is present (VERCEL_OIDC_TOKEN or AI_GATEWAY_API_KEY).
// CI on Vercel injects VERCEL_OIDC_TOKEN automatically; the harness exits 0
// when skipped so the gate is not red on dev machines.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { classifyDocumentsBatch } from '@/lib/sentiment/per-doc-classifier';
import { ASPECT_TAGS } from '@/lib/sentiment/aspects';

const skipIfNoAuth = !process.env.VERCEL_OIDC_TOKEN && !process.env.AI_GATEWAY_API_KEY;

interface FixtureRow {
  doc_id: string;
  text: string;
  source: 'news' | 'community';
  expected_aspects: string[];
  expected_polarity_sign: -1 | 0 | 1;
}

describe.skipIf(skipIfNoAuth)('per-doc-classifier integration (live AI Gateway)', () => {
  it(
    'classifies the 10-doc fixture; ranges valid; ≥1 doc per aspect across set; off-topic returns 0/0',
    async () => {
      const fixture = JSON.parse(
        readFileSync(
          join(__dirname, '../fixtures/per-doc-classification/ten-doc-fixture.json'),
          'utf8',
        ),
      ) as FixtureRow[];
      const inputs = fixture.map((f) => ({ doc_id: f.doc_id, text: f.text, source: f.source }));

      const results = await classifyDocumentsBatch(inputs, { ticker: 'INTEG' });

      expect(results.length).toBe(10);
      for (const r of results) {
        expect(r.polarity).toBeGreaterThanOrEqual(-1);
        expect(r.polarity).toBeLessThanOrEqual(1);
        expect(r.confidence).toBeGreaterThanOrEqual(0);
        expect(r.confidence).toBeLessThanOrEqual(1);
        for (const a of r.aspects) {
          expect(ASPECT_TAGS).toContain(a);
        }
      }

      // Off-topic guard — weather doc must classify polarity=0 + confidence=0.
      const offTopic = results.find((r) => r.doc_id === 'fx-09');
      expect(offTopic, 'off-topic fixture row fx-09 missing from results').toBeDefined();
      expect(offTopic!.polarity).toBe(0);
      expect(offTopic!.confidence).toBe(0);
      expect(offTopic!.aspects).toEqual([]);

      // Every aspect in ASPECT_TAGS appears in ≥1 result across the set.
      const seen = new Set<string>();
      for (const r of results) for (const a of r.aspects) seen.add(a);
      for (const a of ASPECT_TAGS) {
        expect(seen.has(a), `aspect "${a}" missing from per-doc classification of 10-doc fixture`).toBe(true);
      }
    },
    60_000,
  );
});
