// src/lib/eval/judge.ts
//
// Plan 20-Z-05 — LLM-as-judge harness. Uses Claude Opus 4.7 (a SEPARATE
// provider from the candidate Gemini outputs the harness evaluates) to score
// baseline-vs-candidate equity-research report excerpts on five dimensions.
//
// Why a separate provider: candidate outputs come from Gemini. Judging them
// with Gemini is biased. Cipher already wires @anthropic-ai/sdk via
// src/lib/data/anthropic-search.ts — we reuse the same lazy-client pattern.
//
// Hard pins:
//   - judge_model     = 'claude-opus-4-7'   (string literal — never overridable)
//   - temperature     = 0                   (determinism for eval reproducibility)
//   - cache_control   = absent              (T-20-Z-05-05: never cache eval calls)
//   - prompt          = registry.eval-judge-v1 (golden-snapshotted by 20-Z-04)
//
// Cost discipline: exactly ONE judge call per pair. No chain-of-thought
// self-consistency. No n-shot. Live integration test gated behind
// RUN_LIVE_JUDGE=true so CI never burns Claude tokens
// (see tests/eval/judge.integration.test.ts).
//
// TODO(20-Z-03): once ProviderCallLog is generalized for non-Gemini eval
// telemetry, wrap getClient().messages.create with withTelemetry() so per-call
// cost / latency / error_class flow into the same telemetry pipeline as the
// production providers. Today the harness emits cost-per-call only at
// scripts/eval-report.ts via the response's `usage` block (best-effort).

import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'node:crypto';
import { getPrompt, type PromptVersion } from '@/lib/prompts/registry';
import {
  JUDGE_DIMENSIONS,
  type JudgeDimension,
  type JudgeResult,
  type JudgeScore,
  type JudgeScoreValue,
} from './types';

const JUDGE_MODEL = 'claude-opus-4-7' as const;
const JUDGE_PROMPT_ID = 'eval-judge-v1' as const;
const DEFAULT_MAX_TOKENS = 2000;

// ── Lazy client — same pattern as anthropic-search.ts ───────────────────────
// Tests `vi.mock('@anthropic-ai/sdk', ...)` the module; this client is
// resolved on first use so the mock is installed before construction.

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

/**
 * Test hook — resets the lazy-cached client so vi.mock can install fresh mocks
 * between `beforeEach` cycles without module re-import.
 *
 * Not exported through index.ts; only the unit test file imports it.
 */
export function _resetClientForTests(): void {
  _client = null;
}

// ── JSON-response parser ────────────────────────────────────────────────────

function isValidScore(n: unknown): n is JudgeScoreValue {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 5;
}

function parseJudgeResponse(text: string): JudgeScore[] {
  // Defensive: some models wrap JSON in ```json fences even when asked not to.
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(
      `Judge response not valid JSON: ${(e as Error).message}; got: ${text.slice(0, 200)}`,
    );
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`Judge response not an object; got: ${typeof parsed}`);
  }
  const root = parsed as { scores?: unknown };
  if (!Array.isArray(root.scores)) {
    throw new Error(
      `Judge response missing scores array; got keys: [${Object.keys(parsed as object).join(', ')}]`,
    );
  }

  const out: JudgeScore[] = [];
  const seen = new Set<JudgeDimension>();
  for (const r of root.scores) {
    if (typeof r !== 'object' || r === null) {
      throw new Error(`Judge response score entry not an object: ${JSON.stringify(r)}`);
    }
    const { dimension, score, rationale } = r as Record<string, unknown>;
    if (!JUDGE_DIMENSIONS.includes(dimension as JudgeDimension)) {
      throw new Error(`Judge response unknown dimension: ${String(dimension)}`);
    }
    if (!isValidScore(score)) {
      throw new Error(`Judge response score out of range for ${String(dimension)}: ${String(score)}`);
    }
    if (typeof rationale !== 'string') {
      throw new Error(`Judge response missing rationale for ${String(dimension)}`);
    }
    seen.add(dimension as JudgeDimension);
    out.push({ dimension: dimension as JudgeDimension, score, rationale });
  }

  for (const d of JUDGE_DIMENSIONS) {
    if (!seen.has(d)) throw new Error(`Judge response missing dimension: ${d}`);
  }

  // Canonical order so downstream Pearson computation lines up across calls.
  out.sort(
    (a, b) => JUDGE_DIMENSIONS.indexOf(a.dimension) - JUDGE_DIMENSIONS.indexOf(b.dimension),
  );
  return out;
}

// ── Public API ──────────────────────────────────────────────────────────────

export interface JudgeOpts {
  /** Caller-supplied id for the baseline text (default 'baseline'). */
  baselineId?: string;
  /** Caller-supplied id for the candidate text (default 'candidate'). */
  candidateId?: string;
  /**
   * Pinned to 0 for determinism. Type narrows callers so accidentally
   * passing 0.2 is a compile-time error.
   */
  temperature?: 0;
  /** Defaults to 2000 — rubric responses are ~500 tokens in practice. */
  maxTokens?: number;
  /** Registry version of the eval-judge prompt. Defaults to 'v1'. */
  promptVersion?: PromptVersion;
  /**
   * Pinned to `false` — eval calls must never be cached at the gateway
   * (T-20-Z-05-05). Type narrows callers so accidentally passing `true` is a
   * compile-time error.
   */
  cache?: false;
}

/**
 * Score a baseline / candidate report pair with Claude Opus 4.7.
 *
 * Throws if:
 *   - Anthropic returns malformed JSON
 *   - Any dimension is missing or has a score out of [0,5]
 *   - The response message contains no text block (e.g., refusal / overlong)
 */
export async function judge(
  baseline: string,
  candidate: string,
  opts: JudgeOpts = {},
): Promise<JudgeResult> {
  const promptVersion: PromptVersion = opts.promptVersion ?? 'v1';
  const reg = getPrompt(JUDGE_PROMPT_ID, promptVersion);

  const userBlock = `=== BASELINE ===\n${baseline}\n\n=== CANDIDATE ===\n${candidate}`;

  const client = getClient();
  const response = await client.messages.create({
    model: JUDGE_MODEL,
    max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
    temperature: 0, // pinned — opts.temperature is type-narrowed to 0
    system: reg.template,
    messages: [{ role: 'user', content: userBlock }],
    // Intentionally no cache_control on any block — T-20-Z-05-05.
  });

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
  if (!textBlock) {
    throw new Error(
      `Judge response had no text content; stop_reason=${response.stop_reason}`,
    );
  }
  const scores = parseJudgeResponse(textBlock.text);
  const overall = scores.reduce((s, x) => s + x.score, 0) / scores.length;

  return {
    run_id: randomUUID(),
    baseline_id: opts.baselineId ?? 'baseline',
    candidate_id: opts.candidateId ?? 'candidate',
    scores,
    overall,
    judge_prompt_version: reg.version,
    judge_model: JUDGE_MODEL,
    ran_at: new Date().toISOString(),
  };
}
