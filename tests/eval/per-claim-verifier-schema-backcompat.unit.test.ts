// Plan 20-D-03 — Backward-compat gate.
//
// Asserts that the extended AnalysisResultSchema (with optional `verified` on
// each signal + optional `risks` sibling) round-trips a synthetic PRE-PLAN
// fixture (zero `verified` fields anywhere) WITHOUT Zod failure AND without
// inventing a `verified` field on output.

import { describe, it, expect, vi } from 'vitest';

// Stub prisma + AI SDK transitive imports so loading the
// AnalysisResultSchema doesn't require DATABASE_URL or other live env vars.
vi.mock('@/lib/db', () => ({ prisma: {} }));

import { AnalysisResultSchema } from '@/lib/gemini-analysis';
import preFixture from '../fixtures/pre-20-D-03-analysis-result.json';

describe('20-D-03 schema backward-compat — pre-plan AnalysisResult fixture', () => {
  it('parses the pre-plan fixture with NO Zod failure', () => {
    const result = AnalysisResultSchema.safeParse(preFixture);
    if (!result.success) {
      // Surface the Zod error nicely for debugging when this fails.
      // eslint-disable-next-line no-console
      console.error(result.error.format());
    }
    expect(result.success).toBe(true);
  });

  it('preserves undefined verified on every signal (no field inserted by Zod)', () => {
    const parsed = AnalysisResultSchema.parse(preFixture);
    for (const s of parsed.bullish_signals) {
      // verified must NOT exist on a pre-plan fixture.
      expect((s as { verified?: unknown }).verified).toBeUndefined();
    }
    for (const s of parsed.bearish_signals) {
      expect((s as { verified?: unknown }).verified).toBeUndefined();
    }
    // risks is optional — pre-plan fixture omits it entirely.
    expect((parsed as { risks?: unknown }).risks).toBeUndefined();
  });

  it("round-trips a same-shape result that DOES include verified: 'true' on a signal", () => {
    const withVerified = {
      ...preFixture,
      bullish_signals: [
        ...(preFixture as { bullish_signals: Array<Record<string, unknown>> }).bullish_signals,
      ].map((s, i) =>
        i === 0 ? { ...s, verified: 'true' } : s,
      ),
    };
    const parsed = AnalysisResultSchema.parse(withVerified);
    expect((parsed.bullish_signals[0] as { verified?: string }).verified).toBe('true');
  });

  it("round-trips a result with verified ∈ {'false', 'null'} round-trip", () => {
    const withVerified = {
      ...preFixture,
      bullish_signals: [
        { ...((preFixture as { bullish_signals: Record<string, unknown>[] }).bullish_signals[0]), verified: 'false' },
        ...((preFixture as { bullish_signals: Record<string, unknown>[] }).bullish_signals).slice(1).map((s) => ({ ...s, verified: 'null' })),
      ],
    };
    const parsed = AnalysisResultSchema.parse(withVerified);
    expect((parsed.bullish_signals[0] as { verified?: string }).verified).toBe('false');
    expect((parsed.bullish_signals[1] as { verified?: string }).verified).toBe('null');
  });

  it('rejects invalid verified value (e.g. "yes")', () => {
    const bad = {
      ...preFixture,
      bullish_signals: [
        { ...((preFixture as { bullish_signals: Record<string, unknown>[] }).bullish_signals[0]), verified: 'yes' },
        ...((preFixture as { bullish_signals: Record<string, unknown>[] }).bullish_signals).slice(1),
      ],
    };
    const r = AnalysisResultSchema.safeParse(bad);
    expect(r.success).toBe(false);
  });
});
