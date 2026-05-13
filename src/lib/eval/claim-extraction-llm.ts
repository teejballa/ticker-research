// src/lib/eval/claim-extraction-llm.ts
//
// Plan 20-D-02 — Algorithm B claim extractor (LLM-judge).
//
// Mirrors the SDK pattern from 20-Z-05 src/lib/eval/judge.ts:
//   - lazy Anthropic client + _resetClientForTests for vi.mock cycles
//   - model='claude-opus-4-7', temperature=0, NO cache_control
//   - one call per (section_text, prompt_version) tuple
//
// Prompt body lives at src/lib/prompts/_v1/eval-claim-extraction-v1.md;
// loaded via the 20-Z-04 renderPrompt pipeline so registry version-pinning
// + golden-snapshot drift protection both apply.
//
// TODO(20-Z-03): wrap getClient().messages.create with withTelemetry() once
// ProviderCallLog is generalized for non-Gemini eval telemetry.

import Anthropic from '@anthropic-ai/sdk';
import { renderPrompt } from '@/lib/prompts/render';
import type { PromptVersion } from '@/lib/prompts/registry';
import type { Claim, ReportSection } from './citation-coverage.types';

const MODEL = 'claude-opus-4-7' as const;
const DEFAULT_MAX_TOKENS = 4000;

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

/** Test hook — mirrors the convention from src/lib/eval/judge.ts. */
export function _resetClientForTests(): void {
  _client = null;
}

export interface ExtractClaimsLLMOpts {
  promptVersion?: PromptVersion;
  maxTokens?: number;
  ticker?: string;
}

export async function extractClaimsLLM(
  text: string,
  section: ReportSection,
  opts: ExtractClaimsLLMOpts = {},
): Promise<Claim[]> {
  if (!text || !text.trim()) return [];

  const body = renderPrompt(
    'eval-claim-extraction-v1',
    {
      section,
      ticker: opts.ticker ?? '<unknown>',
      section_text: text,
    },
    opts.promptVersion ?? 'v1',
  );

  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
    temperature: 0, // pinned for determinism — T-20-D-02-02
    messages: [{ role: 'user', content: body }],
    // NO cache_control anywhere — eval calls must not be cached at the gateway.
  });

  const textBlock = response.content.find(
    (b): b is Anthropic.TextBlock => b.type === 'text',
  );
  if (!textBlock) {
    throw new Error(
      `extractClaimsLLM: no text content (stop_reason=${response.stop_reason})`,
    );
  }

  const cleaned = textBlock.text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(
      `extractClaimsLLM: invalid JSON: ${(e as Error).message}; got ${cleaned.slice(0, 200)}`,
    );
  }
  const claimsRaw = (parsed as { claims?: unknown }).claims;
  if (!Array.isArray(claimsRaw)) {
    throw new Error(`extractClaimsLLM: response missing 'claims' array`);
  }

  const out: Claim[] = [];
  for (const r of claimsRaw) {
    if (typeof r !== 'object' || r === null) {
      throw new Error(`extractClaimsLLM: claim entry not an object: ${JSON.stringify(r)}`);
    }
    const { text: claimText, start_char, end_char } = r as Record<string, unknown>;
    if (
      typeof claimText !== 'string' ||
      typeof start_char !== 'number' ||
      typeof end_char !== 'number'
    ) {
      throw new Error(`extractClaimsLLM: missing required claim fields`);
    }
    if (start_char > end_char) {
      throw new Error(
        `extractClaimsLLM: start_char > end_char for "${claimText.slice(0, 80)}"`,
      );
    }
    out.push({
      text: claimText,
      section,
      start_char,
      end_char,
      source_method: 'llm',
      kind: 'qualitative',
    });
  }
  return out;
}
