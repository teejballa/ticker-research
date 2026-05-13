// Plan 20-D-03 — Per-claim CoVe verifier unit tests.
//
// Architecture decision documented in 20-D-03-PLAN Task 1: this plan adds a new
// score-returning sibling `nliVerifyWithScore(claim, evidence)` to
// `src/lib/reasoning/cove.ts`. The existing `nliVerify` (label-only) is
// preserved verbatim for 19-C-08 + 19-C-10 callers. The mock target below is
// therefore `@/lib/reasoning/cove` (the upstream module owning the HF client),
// NOT `@/lib/sentiment/nli-verifier` (the legacy shim).
//
// Threshold contract (HYPERPARAMETERS.md per_claim_verifier):
//   - entail   AND score > 0.7 → 'true'
//   - contradict AND score > 0.7 → 'false'
//   - else (neutral / threw / endpoint-unset / score ≤ 0.7) → 'null'

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/reasoning/cove', async () => {
  const actual = await vi.importActual<typeof import('@/lib/reasoning/cove')>('@/lib/reasoning/cove');
  return {
    ...actual,
    nliVerifyWithScore: vi.fn(),
  };
});

import { nliVerifyWithScore } from '@/lib/reasoning/cove';
import { verifyClaimPerSignal, verifyClaimsBatch } from '@/lib/eval/per-claim-verifier';
import type { SourcePackage } from '@/lib/types';

const mockNli = vi.mocked(nliVerifyWithScore);

const STUB_PKG = { ticker: 'TST', company_name: 'Test', some: 'data' } as unknown as SourcePackage;

describe('20-D-03 verifyClaimPerSignal — strict 0.7 thresholds', () => {
  beforeEach(() => mockNli.mockReset());

  it("entail @ 0.85 → 'true'", async () => {
    mockNli.mockResolvedValueOnce({ label: 'entail', score: 0.85 });
    const v = await verifyClaimPerSignal({ description: 'revenue grew' }, STUB_PKG);
    expect(v).toBe('true');
  });

  it("entail @ 0.65 → 'null' (below threshold)", async () => {
    mockNli.mockResolvedValueOnce({ label: 'entail', score: 0.65 });
    const v = await verifyClaimPerSignal({ description: 'weakly-supported' }, STUB_PKG);
    expect(v).toBe('null');
  });

  it("contradict @ 0.80 → 'false'", async () => {
    mockNli.mockResolvedValueOnce({ label: 'contradict', score: 0.80 });
    const v = await verifyClaimPerSignal({ description: 'wrong claim' }, STUB_PKG);
    expect(v).toBe('false');
  });

  it("contradict @ 0.55 → 'null' (below threshold)", async () => {
    mockNli.mockResolvedValueOnce({ label: 'contradict', score: 0.55 });
    const v = await verifyClaimPerSignal({ description: 'weakly-contradicted' }, STUB_PKG);
    expect(v).toBe('null');
  });

  it("neutral @ 0.99 → 'null' (neutral never collapses regardless of score)", async () => {
    mockNli.mockResolvedValueOnce({ label: 'neutral', score: 0.99 });
    const v = await verifyClaimPerSignal({ description: 'irrelevant' }, STUB_PKG);
    expect(v).toBe('null');
  });

  it("NLI throws → 'null' (graceful degrade, 19-C-08 belt-and-suspender pattern)", async () => {
    mockNli.mockRejectedValueOnce(new Error('endpoint down'));
    const v = await verifyClaimPerSignal({ description: 'anything' }, STUB_PKG);
    expect(v).toBe('null');
  });

  it("label=null (endpoint unset) → 'null'", async () => {
    mockNli.mockResolvedValueOnce({ label: null, score: null });
    const v = await verifyClaimPerSignal({ description: 'anything' }, STUB_PKG);
    expect(v).toBe('null');
  });

  it("entail with score=null (impossible but defensive) → 'null'", async () => {
    mockNli.mockResolvedValueOnce({ label: 'entail', score: null });
    const v = await verifyClaimPerSignal({ description: 'anything' }, STUB_PKG);
    expect(v).toBe('null');
  });
});

describe('20-D-03 verifyClaimsBatch — heterogeneous fan-out + per-signal failure isolation', () => {
  beforeEach(() => mockNli.mockReset());

  it("3 mocked signals (entail/contradict/neutral) → Map preserves positional IDs", async () => {
    mockNli
      .mockResolvedValueOnce({ label: 'entail',     score: 0.9 })
      .mockResolvedValueOnce({ label: 'contradict', score: 0.85 })
      .mockResolvedValueOnce({ label: 'neutral',    score: 0.7 });

    const signals = [
      { id: 'bullish-0', description: 'a' },
      { id: 'bullish-1', description: 'b' },
      { id: 'bullish-2', description: 'c' },
    ];
    const out = await verifyClaimsBatch(signals, STUB_PKG);

    expect(out.get('bullish-0')).toBe('true');
    expect(out.get('bullish-1')).toBe('false');
    expect(out.get('bullish-2')).toBe('null');
    expect(out.size).toBe(3);
  });

  it("Promise.allSettled — single signal throws does NOT abort the batch; others land", async () => {
    mockNli
      .mockResolvedValueOnce({ label: 'entail', score: 0.9 })
      .mockRejectedValueOnce(new Error('partial outage'))
      .mockResolvedValueOnce({ label: 'contradict', score: 0.9 });

    const signals = [
      { id: 'bullish-0', description: 'a' },
      { id: 'bullish-1', description: 'b' },
      { id: 'bullish-2', description: 'c' },
    ];
    const out = await verifyClaimsBatch(signals, STUB_PKG);

    expect(out.get('bullish-0')).toBe('true');
    expect(out.get('bullish-1')).toBe('null');   // throw → collapsed to 'null'
    expect(out.get('bullish-2')).toBe('false');
    expect(out.size).toBe(3);
  });

  it("empty signals array → empty Map (no calls)", async () => {
    const out = await verifyClaimsBatch([], STUB_PKG);
    expect(out.size).toBe(0);
    expect(mockNli).not.toHaveBeenCalled();
  });

  it("heterogeneous sections (bullish/bearish/risks) — IDs preserved verbatim", async () => {
    mockNli
      .mockResolvedValueOnce({ label: 'entail', score: 0.9 })
      .mockResolvedValueOnce({ label: 'entail', score: 0.9 })
      .mockResolvedValueOnce({ label: 'contradict', score: 0.9 });

    const signals = [
      { id: 'bullish-0', description: 'b' },
      { id: 'bearish-0', description: 'a' },
      { id: 'risks-0',   description: 'r' },
    ];
    const out = await verifyClaimsBatch(signals, STUB_PKG);
    expect(Array.from(out.keys()).sort()).toEqual(['bearish-0', 'bullish-0', 'risks-0']);
  });
});
