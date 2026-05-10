// tests/lib/sentiment/contradiction-detector.test.ts
//
// Phase 19 / Plan 19-C-10 / Task 1 (RED) — failing tests for the cross-class
// contradiction detector (D-42). The detector runs an NLI verifier over every
// unique pair of class posteriors and flags pairs whose verbalized statements
// are NLI-classified as `contradict`.
//
// DETECTION-ONLY MODE — these tests pin behavior of the additive UI surface.
// They never assert that gemini-analysis output is gated or modified by the
// detector (D-42 + Phase 19 plan preamble: detection-only is permanent).
//
// The NLI verifier is mocked at module level via vi.mock; the detector's
// production code resolves the verifier via dynamic import / dependency
// injection so unit tests can pin synthetic NLI labels without spinning up
// HF Inference.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock the NLI verifier ─────────────────────────────────────────────────
// The detector imports `nliVerify` from src/lib/sentiment/nli-verifier.ts
// (a thin shim so we have something to mock here without depending on the
// not-yet-shipped 19-C-08 cove.ts). When 19-C-08 ships, the shim can re-export
// the cove.ts implementation transparently.

vi.mock('@/lib/sentiment/nli-verifier', () => ({
  nliVerify: vi.fn(),
}));

import { nliVerify } from '@/lib/sentiment/nli-verifier';
import { detectContradictions } from '@/lib/sentiment/contradiction-detector';

const mockedNli = vi.mocked(nliVerify);

beforeEach(() => {
  mockedNli.mockReset();
});

describe('detectContradictions (Plan 19-C-10, D-42)', () => {
  it('Test 1: all 4 classes bullish → no contradictions', async () => {
    // All 6 NLI calls return 'entail' or 'neutral' — no contradictions.
    mockedNli.mockResolvedValue('neutral');
    const result = await detectContradictions({
      ticker: 'AAPL',
      classPosteriors: {
        diffusion: 0.72,
        technical: 0.68,
        insider: 0.65,
        institutional: 0.71,
      },
    });
    expect(result.detected).toBe(false);
    expect(result.warnings).toEqual([]);
    expect(result.pairs).toHaveLength(6); // 4 choose 2
    expect(result.pairs.every(p => p.severity === 0)).toBe(true);
  });

  it('Test 2: technical bullish + insider bearish → contradiction detected with severity > 0.5', async () => {
    // Strong divergence between technical (0.85 bullish) and insider (0.20 bearish).
    // Mock NLI to return 'contradict' for that specific pair, neutral otherwise.
    mockedNli.mockImplementation(async (a: string, b: string) => {
      const aHasTech = a.includes('technical');
      const bHasTech = b.includes('technical');
      const aHasInsider = a.includes('insider');
      const bHasInsider = b.includes('insider');
      if ((aHasTech && bHasInsider) || (aHasInsider && bHasTech)) {
        return 'contradict';
      }
      return 'neutral';
    });

    const result = await detectContradictions({
      ticker: 'XYZ',
      classPosteriors: {
        diffusion: 0.55,
        technical: 0.85,
        insider: 0.20,
        institutional: 0.50,
      },
    });
    expect(result.detected).toBe(true);
    expect(result.warnings.length).toBeGreaterThanOrEqual(1);
    const contradictPair = result.pairs.find(p => p.nli_label === 'contradiction');
    expect(contradictPair).toBeDefined();
    // |0.85 - 0.20| = 0.65 > 0.5
    expect(contradictPair!.severity).toBeGreaterThan(0.5);
  });

  it('Test 3: mild divergence (0.55 vs 0.45) → severity below threshold, no warning', async () => {
    // Even if NLI says 'contradict', divergence is only 0.10 → severity 0.10 < 0.3 threshold.
    mockedNli.mockResolvedValue('contradict');
    const result = await detectContradictions({
      ticker: 'TSLA',
      classPosteriors: {
        diffusion: 0.55,
        technical: 0.45,
        insider: 0.55,
        institutional: 0.45,
      },
    });
    // All 6 pairs are 'contradict' but severity ≤ 0.10 — below threshold (0.3).
    expect(result.warnings).toEqual([]);
    expect(result.detected).toBe(false);
    // Severity recorded but no warning issued.
    expect(result.pairs.every(p => p.severity <= 0.10)).toBe(true);
  });

  it('Test 4: NLI error on one pair → other pairs still evaluated; that pair marked unverified', async () => {
    // First call throws, subsequent calls return 'contradict' for the strong pair.
    let callIdx = 0;
    mockedNli.mockImplementation(async () => {
      callIdx += 1;
      if (callIdx === 1) throw new Error('NLI inference failed');
      return 'contradict';
    });
    const result = await detectContradictions({
      ticker: 'NVDA',
      classPosteriors: {
        diffusion: 0.90,
        technical: 0.10,
        insider: 0.55,
        institutional: 0.50,
      },
    });
    // 6 pairs total; 1 unverified, 5 evaluated.
    expect(result.pairs).toHaveLength(6);
    const unverified = result.pairs.filter(p => p.nli_label === 'neutral' && p.severity === 0);
    // The errored pair stays severity=0 with neutral label (graceful degrade).
    expect(unverified.length).toBeGreaterThanOrEqual(1);
    // Other pairs that evaluated successfully retain their severity.
    const evaluated = result.pairs.filter(p => p.nli_label === 'contradiction');
    expect(evaluated.length).toBeGreaterThanOrEqual(1);
  });

  it('Test 5: warnings array empty when detected=false', async () => {
    mockedNli.mockResolvedValue('entail');
    const result = await detectContradictions({
      ticker: 'MSFT',
      classPosteriors: {
        diffusion: 0.60,
        technical: 0.62,
        insider: 0.58,
        institutional: 0.61,
      },
    });
    expect(result.detected).toBe(false);
    expect(result.warnings).toEqual([]);
  });

  it('Test 6: pairs array contains all 6 unique class pairs (4 choose 2)', async () => {
    mockedNli.mockResolvedValue('neutral');
    const result = await detectContradictions({
      ticker: 'GOOG',
      classPosteriors: {
        diffusion: 0.50,
        technical: 0.50,
        insider: 0.50,
        institutional: 0.50,
      },
    });
    expect(result.pairs).toHaveLength(6);
    // Verify all unordered pairs are present exactly once.
    const pairKeys = result.pairs.map(p =>
      [p.class_a, p.class_b].sort().join('|'),
    );
    const expected = new Set([
      'diffusion|technical',
      'diffusion|insider',
      'diffusion|institutional',
      'insider|technical',
      'institutional|technical',
      'insider|institutional',
    ]);
    expect(new Set(pairKeys)).toEqual(expected);
    // Every pair contains both posteriors recorded.
    expect(result.pairs.every(p => p.posterior_a === 0.50 && p.posterior_b === 0.50)).toBe(true);
  });
});
