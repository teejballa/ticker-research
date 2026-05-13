// Plan 20-B-05 — renderPerAspectBlock helper unit tests.
// Locks the prompt-body format used by Gemini for per-aspect reasoning.

import { describe, it, expect } from 'vitest';
import { renderPerAspectBlock } from '@/lib/research-brief';
import type { PerAspectSentimentEntry } from '@/lib/types';

describe('20-B-05 — renderPerAspectBlock', () => {
  it('empty input → empty string (caller falls back to global)', () => {
    expect(renderPerAspectBlock([])).toBe('');
    expect(renderPerAspectBlock(undefined)).toBe('');
  });

  it('all-null entries → empty string (no aspect-tagged signal)', () => {
    const entries: PerAspectSentimentEntry[] = [
      { aspect: 'earnings', bull_pct: null, n_docs: 1, confidence_mean: 0.7 },
      { aspect: 'guidance', bull_pct: null, n_docs: 0, confidence_mean: 0 },
    ];
    expect(renderPerAspectBlock(entries)).toBe('');
  });

  it('contains literal "Per-aspect sentiment:" + per-aspect lines for mixed input', () => {
    const entries: PerAspectSentimentEntry[] = [
      { aspect: 'earnings', bull_pct: 75, n_docs: 12, confidence_mean: 0.85 },
      { aspect: 'guidance', bull_pct: null, n_docs: 1, confidence_mean: 0.7 },
    ];
    const out = renderPerAspectBlock(entries);
    expect(out).toContain('Per-aspect sentiment:');
    expect(out).toContain('earnings: 75% bullish (n=12)');
    expect(out).toContain('guidance: insufficient data');
  });

  it("never renders '0% bullish' for null aspects (T-20-B-05-03)", () => {
    const entries: PerAspectSentimentEntry[] = [
      { aspect: 'earnings', bull_pct: 90, n_docs: 5, confidence_mean: 1 },
      { aspect: 'regulatory', bull_pct: null, n_docs: 0, confidence_mean: 0 },
    ];
    const out = renderPerAspectBlock(entries);
    expect(out).not.toMatch(/regulatory:\s*0%/);
    expect(out).toContain('regulatory: insufficient data');
  });
});
