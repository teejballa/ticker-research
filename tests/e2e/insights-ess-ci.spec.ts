// Phase 18-00 Wave 0 stub — covers CORE-ML-03 (CI widths reflect ESS, not raw N).
// Wave 3 (Plan 18-09) will seed two cells (sparse-recent, sparse-old) with identical
// raw N=20 and assert width(recent CI) < width(old CI) on the rendered /insights page.
// This is the LOOKS-DONE-BUT-ISN'T defence per 18-RESEARCH.md §"Pitfalls Defended".

import { test, expect } from '@playwright/test';

test.describe('[e2e] /insights — credible interval widths reflect ESS, not raw N', () => {
  test('two seeded cells with identical raw N=20 — sparse-recent CI is narrower than sparse-old CI', async ({ page }) => {
    test.skip(true, 'Wave 3 Plan 09 fills this in');
    await page.goto('/insights');
    // Wave 3 will: seed two cells, navigate, parse the rendered CI widths from DOM, assert width(recent) < width(old).
    expect(true).toBe(true);
  });
});
