// tests/eval/claim-extraction-llm.unit.test.ts — Plan 20-D-02 Task 3
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockCreate };
    },
  };
});

import { extractClaimsLLM, _resetClientForTests } from '@/lib/eval/claim-extraction-llm';

const ok = (claims: Array<{ text: string; start_char: number; end_char: number }>) => ({
  content: [
    {
      type: 'text',
      text: JSON.stringify({
        claims: claims.map((c) => ({ ...c, section: 'investment_thesis', kind: 'qualitative' })),
      }),
    },
  ],
  stop_reason: 'end_turn',
});

beforeEach(() => {
  _resetClientForTests();
  mockCreate.mockReset();
});

describe('extractClaimsLLM', () => {
  it('returns the parsed claims array', async () => {
    mockCreate.mockResolvedValueOnce(ok([{ text: 'Apple will grow', start_char: 0, end_char: 15 }]));
    const out = await extractClaimsLLM('Apple will grow', 'investment_thesis');
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe('Apple will grow');
    expect(out[0].source_method).toBe('llm');
    expect(out[0].section).toBe('investment_thesis');
  });

  it('pins temperature=0 in the SDK call', async () => {
    mockCreate.mockResolvedValueOnce(ok([]));
    await extractClaimsLLM('hello', 'investment_thesis');
    expect(mockCreate).toHaveBeenCalledOnce();
    expect(mockCreate.mock.calls[0][0].temperature).toBe(0);
  });

  it('pins model=claude-opus-4-7', async () => {
    mockCreate.mockResolvedValueOnce(ok([]));
    await extractClaimsLLM('hello', 'investment_thesis');
    expect(mockCreate.mock.calls[0][0].model).toBe('claude-opus-4-7');
  });

  it('does NOT pass any cache_control field', async () => {
    mockCreate.mockResolvedValueOnce(ok([]));
    await extractClaimsLLM('hello', 'investment_thesis');
    const arg = JSON.stringify(mockCreate.mock.calls[0][0]);
    expect(arg.toLowerCase()).not.toContain('cache');
  });

  it('throws a descriptive error on malformed JSON', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'not json at all' }],
      stop_reason: 'end_turn',
    });
    await expect(extractClaimsLLM('hello', 'investment_thesis')).rejects.toThrow(/invalid JSON/);
  });

  it('throws when start_char > end_char', async () => {
    mockCreate.mockResolvedValueOnce(ok([{ text: 'bad span', start_char: 50, end_char: 10 }]));
    await expect(extractClaimsLLM('hello', 'investment_thesis')).rejects.toThrow(
      /start_char > end_char/,
    );
  });

  it('stamps source_method=llm on every output', async () => {
    mockCreate.mockResolvedValueOnce(
      ok([
        { text: 'one', start_char: 0, end_char: 3 },
        { text: 'two', start_char: 4, end_char: 7 },
      ]),
    );
    const out = await extractClaimsLLM('one two', 'investment_thesis');
    expect(out.every((c) => c.source_method === 'llm')).toBe(true);
  });

  it('loads the registered prompt body for eval-claim-extraction-v1', async () => {
    mockCreate.mockResolvedValueOnce(ok([]));
    await extractClaimsLLM('Section body text', 'investment_thesis', { ticker: 'AAPL' });
    const callBody = mockCreate.mock.calls[0][0].messages[0].content;
    // The body should include the section text + ticker substituted in.
    expect(callBody).toContain('Section body text');
    expect(callBody).toContain('AAPL');
    // And the registered rubric framing.
    expect(callBody).toContain('QUALITATIVE');
  });

  it('throws when response has no text block', async () => {
    mockCreate.mockResolvedValueOnce({ content: [], stop_reason: 'refusal' });
    await expect(extractClaimsLLM('hello', 'investment_thesis')).rejects.toThrow(
      /no text content/,
    );
  });

  it('empty input returns [] without calling the SDK', async () => {
    const out = await extractClaimsLLM('', 'investment_thesis');
    expect(out).toEqual([]);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
