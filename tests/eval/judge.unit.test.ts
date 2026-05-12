// tests/eval/judge.unit.test.ts
//
// Plan 20-Z-05 Task 1 — TDD unit suite for the LLM-as-judge harness.
//
// Coverage (≥8 distinct behaviors):
//   1. judge() returns a JudgeResult with exactly 5 scores (one per JudgeDimension)
//   2. judge() pins judge_model: 'claude-opus-4-7' regardless of opts
//   3. judge() pins temperature: 0 in the underlying Anthropic call (spy)
//   4. judge() stamps judge_prompt_version from the registry (default 'v1')
//   5. judge() throws on malformed JSON (no `scores` key)
//   6. judge() throws when a returned score is out of range [0,5]
//   7. judge() throws when a required dimension is missing
//   8. judge() computes `overall` as the arithmetic mean of the 5 scores
//   9. judge() does NOT pass any cache header / cache_control to the SDK call
//  10. judge() carries baseline_id / candidate_id from opts to the result
//
// Why mocked: live Anthropic calls cost money and are non-deterministic in CI.
// The integration test (judge.integration.test.ts) is gated behind
// RUN_LIVE_JUDGE=true for occasional rubric calibration runs.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock @anthropic-ai/sdk before importing judge() ─────────────────────────
// Same pattern as tests/unit/security-type.test.ts — vi.mock hoists to the top
// so the import below resolves to the mocked module.
const messagesCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: messagesCreate },
  })),
}));

import { judge, _resetClientForTests } from '@/lib/eval/judge';
import { JUDGE_DIMENSIONS, type JudgeDimension } from '@/lib/eval/types';

beforeEach(() => {
  messagesCreate.mockReset();
  _resetClientForTests();
});

// ── Test helpers ────────────────────────────────────────────────────────────

function fullScoresPayload(
  scoreByDim: Partial<Record<JudgeDimension, number>> = {},
): Array<{ dimension: JudgeDimension; score: number; rationale: string }> {
  return JUDGE_DIMENSIONS.map((d) => ({
    dimension: d,
    score: scoreByDim[d] ?? 3,
    rationale: `rationale for ${d}`,
  }));
}

function mockOk(scores: Array<{ dimension: string; score: number; rationale: string }>): void {
  messagesCreate.mockResolvedValueOnce({
    content: [{ type: 'text', text: JSON.stringify({ scores }) }],
    stop_reason: 'end_turn',
  });
}

function mockOkRawText(text: string): void {
  messagesCreate.mockResolvedValueOnce({
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
  });
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('judge() — Plan 20-Z-05 behavioral contract', () => {
  it('returns a JudgeResult with exactly 5 scores in canonical dimension order', async () => {
    mockOk(fullScoresPayload());
    const result = await judge('baseline text', 'candidate text');
    expect(result.scores).toHaveLength(5);
    expect(result.scores.map((s) => s.dimension)).toEqual([...JUDGE_DIMENSIONS]);
  });

  it("pins judge_model to 'claude-opus-4-7' regardless of opts", async () => {
    mockOk(fullScoresPayload());
    const result = await judge('b', 'c');
    expect(result.judge_model).toBe('claude-opus-4-7');
    // And: the underlying SDK call used the same pinned model.
    expect(messagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-opus-4-7' }),
    );
  });

  it('pins temperature: 0 in the underlying Anthropic call', async () => {
    mockOk(fullScoresPayload());
    await judge('b', 'c');
    expect(messagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({ temperature: 0 }),
    );
  });

  it("stamps judge_prompt_version from the registry (default 'v1')", async () => {
    mockOk(fullScoresPayload());
    const result = await judge('b', 'c');
    expect(result.judge_prompt_version).toBe('v1');
  });

  it('throws a descriptive error when Anthropic returns malformed JSON', async () => {
    mockOkRawText('this is not JSON at all');
    await expect(judge('b', 'c')).rejects.toThrow(/not valid JSON/i);
  });

  it('throws when a returned score is out of range [0, 5]', async () => {
    mockOk([
      { dimension: 'numeric_grounding', score: 7, rationale: 'too high' },
      ...fullScoresPayload().slice(1),
    ]);
    await expect(judge('b', 'c')).rejects.toThrow(/out of range/i);
  });

  it('throws when a required dimension is missing', async () => {
    // Drop the last dimension — only 4 returned.
    mockOk(fullScoresPayload().slice(0, 4));
    await expect(judge('b', 'c')).rejects.toThrow(/missing dimension/i);
  });

  it('computes overall as the arithmetic mean of the 5 scores', async () => {
    mockOk(
      fullScoresPayload({
        numeric_grounding: 5,
        citation_coverage: 5,
        narrative_coherence: 0,
        hedging_quality: 0,
        contradiction_handling: 5,
      }),
    );
    const result = await judge('b', 'c');
    expect(result.overall).toBeCloseTo((5 + 5 + 0 + 0 + 5) / 5, 6);
    expect(result.overall).toBeGreaterThanOrEqual(0);
    expect(result.overall).toBeLessThanOrEqual(5);
  });

  it('does NOT pass any cache_control / cache field to the SDK call', async () => {
    mockOk(fullScoresPayload());
    await judge('b', 'c');
    const firstCallArg = messagesCreate.mock.calls[0]?.[0] ?? {};
    const serialized = JSON.stringify(firstCallArg);
    // Defense-in-depth: assert no caching hint of any form is present anywhere
    // in the SDK call payload (T-20-Z-05-05).
    expect(serialized.toLowerCase().includes('cache')).toBe(false);
  });

  it('carries baseline_id and candidate_id from opts into the result', async () => {
    mockOk(fullScoresPayload());
    const result = await judge('b', 'c', {
      baselineId: 'aapl-2026-Q1-baseline',
      candidateId: 'aapl-2026-Q1-candidate',
    });
    expect(result.baseline_id).toBe('aapl-2026-Q1-baseline');
    expect(result.candidate_id).toBe('aapl-2026-Q1-candidate');
  });

  it('strips ```json code fences if the model wraps its JSON output', async () => {
    const payload = JSON.stringify({ scores: fullScoresPayload() });
    mockOkRawText('```json\n' + payload + '\n```');
    const result = await judge('b', 'c');
    expect(result.scores).toHaveLength(5);
  });

  it('throws when the response has no text block', async () => {
    messagesCreate.mockResolvedValueOnce({
      content: [],
      stop_reason: 'end_turn',
    });
    await expect(judge('b', 'c')).rejects.toThrow(/no text content/i);
  });

  it('stamps a fresh run_id and ISO-8601 ran_at on every call', async () => {
    mockOk(fullScoresPayload());
    const a = await judge('b', 'c');
    mockOk(fullScoresPayload());
    const b = await judge('b', 'c');
    expect(a.run_id).not.toBe(b.run_id);
    expect(a.ran_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(b.ran_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
