// tests/lib/reasoning/cove.test.ts
//
// Phase 19 / Plan 19-C-08 / Task 2 (RED) — failing tests for runCoVe (D-40).
//
// Chain-of-Verification two-pass: Pass 1 (Gemini) emits AnalysisResult + 3
// verification claims. Pass 2 (this module) runs an NLI verifier (distilbert-
// mnli, per Task 1 fixture decision) on each (claim, evidence) pair and
// flags contradictions in source_warnings.
//
// IMPLEMENTATION NOTE: runCoVe imports nliVerify from a side module so unit
// tests can mock it without spinning up HF Inference. The 19-C-10 NLI shim
// at src/lib/sentiment/nli-verifier.ts is the canonical path; once 19-C-08
// lands, that shim becomes a re-export of the cove.ts implementation. We
// mock at the shim path so both 19-C-08 and 19-C-10 unit tests share one
// mockable surface.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock the NLI verifier ─────────────────────────────────────────────────
vi.mock('@/lib/sentiment/nli-verifier', () => ({
  nliVerify: vi.fn(),
}));

import { nliVerify } from '@/lib/sentiment/nli-verifier';
import { runCoVe } from '@/lib/reasoning/cove';
import type { AnalysisResult, SourcePackage } from '@/lib/types';

const mockedNli = vi.mocked(nliVerify);

beforeEach(() => {
  mockedNli.mockReset();
});

// ── Synthetic fixtures (DB-free) ─────────────────────────────────────────
function makeAnalysis(): AnalysisResult {
  return {
    ticker: 'AAPL',
    company_name: 'Apple Inc.',
    analyzed_at: '2026-05-08T00:00:00Z',
    market_sentiment: 'bullish',
    sentiment_reasoning: 'Strong fundamentals',
    bullish_signals: [{ signal: 'Services growth', source_citation: '10-Q' }],
    bearish_signals: [{ signal: 'China headwinds', source_citation: 'Reuters' }],
    assessment: {
      buy_pct: 60, hold_pct: 30, sell_pct: 10,
      buy_rationale: 'b', hold_rationale: 'h', sell_rationale: 's',
    },
    confidence_level: 'High',
    confidence_explanation: 'Many sources',
    sources_used: [],
    source_warnings: [],
  } satisfies AnalysisResult;
}

function makeSourcePackage(extra?: Partial<SourcePackage>): SourcePackage {
  return {
    ticker: 'AAPL',
    company_name: 'Apple Inc.',
    exchange: 'NASDAQ',
    security_type: 'equity',
    assembled_at: '2026-05-08T00:00:00Z',
    market_data: {
      collected_at: '2026-05-08T00:00:00Z',
      price: 200, volume: 1e7, market_cap: 3e12,
      fifty_two_week_high: 230, fifty_two_week_low: 160,
      percent_change_today: 0.5, exchange: 'NASDAQ',
    },
    fundamentals: {
      collected_at: '2026-05-08T00:00:00Z',
      pe_ratio: 30, eps: 6, revenue: 4e11,
      debt_to_equity: 1.5, profit_margin: 0.25,
    },
    news: { collected_at: '2026-05-08T00:00:00Z', items: [] },
    analyst_sentiment: {
      collected_at: '2026-05-08T00:00:00Z',
      consensus: 'Buy', avg_price_target: 220, analyst_count: 30, recent_changes: [],
    },
    sec_filing_summary: { collected_at: '2026-05-08T00:00:00Z', summaries: [] },
    social_sentiment: { collected_at: '2026-05-08T00:00:00Z', summaries: [] },
    collection_errors: [],
    supplementary_market_data: { sources: [] },
    sentiment_intelligence: {
      collected_at: '2026-05-08T00:00:00Z',
      stocktwits_bull_pct: null, stocktwits_bear_pct: null,
      stocktwits_message_count: null, stocktwits_is_trending: null,
      put_call_ratio: null, put_call_interpretation: null,
    },
    ...(extra ?? {}),
  } as SourcePackage;
}

describe('runCoVe (Plan 19-C-08, D-40)', () => {
  it('Test 1: 3 claims all supported by SourcePackage → verified=[true,true,true], no contradictions', async () => {
    mockedNli.mockResolvedValue('entail');
    const out = await runCoVe({
      analysisResult: makeAnalysis(),
      verificationClaims: [
        'Apple stock trades above $190',
        'Apple has a P/E around 30',
        'Apple analyst consensus is Buy',
      ],
      sourcePackage: makeSourcePackage(),
    });
    expect(out.verified).toEqual([true, true, true]);
    expect(out.contradictions).toEqual([]);
  });

  it('Test 2: 1 contradicted claim of 3 → verified=[true,false,true], 1 contradiction warning', async () => {
    let i = 0;
    mockedNli.mockImplementation(async () => {
      i += 1;
      if (i === 2) return 'contradict';
      return 'entail';
    });
    const out = await runCoVe({
      analysisResult: makeAnalysis(),
      verificationClaims: [
        'Apple revenue grew YoY',
        'Apple Services revenue is declining',
        'Apple consensus rating is Buy',
      ],
      sourcePackage: makeSourcePackage(),
    });
    expect(out.verified).toEqual([true, false, true]);
    expect(out.contradictions).toHaveLength(1);
    expect(out.contradictions[0]).toMatch(/Services revenue is declining/);
  });

  it('Test 3: empty SourcePackage → all claims unverifiable, no false-positive contradictions', async () => {
    // When evidence is empty, the verifier returns 'neutral' for every pair.
    mockedNli.mockResolvedValue('neutral');
    const out = await runCoVe({
      analysisResult: makeAnalysis(),
      verificationClaims: ['claim a', 'claim b', 'claim c'],
      // Empty SourcePackage payload — evidence string after stringify will
      // be a near-empty JSON shell.
      sourcePackage: makeSourcePackage({
        market_data: {
          collected_at: '2026-05-08T00:00:00Z',
          price: null, volume: null, market_cap: null,
          fifty_two_week_high: null, fifty_two_week_low: null,
          percent_change_today: null, exchange: null,
        },
      }),
    });
    // 'neutral' → unverifiable (null) per Task 3 spec; not flagged as
    // contradiction.
    expect(out.verified).toEqual([null, null, null]);
    expect(out.contradictions).toEqual([]);
  });

  it('Test 4: NLI verifier throws / returns null → verified entry is null (graceful degrade)', async () => {
    let i = 0;
    mockedNli.mockImplementation(async () => {
      i += 1;
      if (i === 1) throw new Error('HF endpoint 503');
      if (i === 2) return null;          // explicit null sentinel
      return 'entail';
    });
    const out = await runCoVe({
      analysisResult: makeAnalysis(),
      verificationClaims: ['claim x', 'claim y', 'claim z'],
      sourcePackage: makeSourcePackage(),
    });
    expect(out.verified[0]).toBeNull();
    expect(out.verified[1]).toBeNull();
    expect(out.verified[2]).toBe(true);
    // Errored / null entries do NOT raise contradictions.
    expect(out.contradictions).toEqual([]);
  });

  it('Test 5: result.nli_model field is recorded (distilbert-mnli per Task 1 decision)', async () => {
    mockedNli.mockResolvedValue('entail');
    const out = await runCoVe({
      analysisResult: makeAnalysis(),
      verificationClaims: ['c1', 'c2', 'c3'],
      sourcePackage: makeSourcePackage(),
    });
    expect(out.nli_model).toBe('distilbert-mnli');
  });

  it('Test 6: very long claim string is truncated to ≤ 500 chars before NLI call', async () => {
    mockedNli.mockResolvedValue('entail');
    const huge = 'x'.repeat(2000);
    await runCoVe({
      analysisResult: makeAnalysis(),
      verificationClaims: [huge, 'short', 'mid'],
      sourcePackage: makeSourcePackage(),
    });
    expect(mockedNli).toHaveBeenCalled();
    // First call's first arg (claim) should be ≤ 500 chars.
    const firstClaim = mockedNli.mock.calls[0][0] as string;
    expect(firstClaim.length).toBeLessThanOrEqual(500);
  });
});
