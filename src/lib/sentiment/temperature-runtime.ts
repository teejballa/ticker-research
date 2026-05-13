// src/lib/sentiment/temperature-runtime.ts
// Plan 20-B-03 — Shared runtime helpers for temperature-scaling integration.
//
// Both classifyFinBERT (src/lib/sentiment/finsentllm.ts) and
// classifyDocumentsBatch (src/lib/sentiment/per-doc-classifier.ts) consume
// this module to:
//   1. resolve SENTIMENT_TEMP_SCALING_MODE (off | shadow | on) from env
//   2. load the latest TemperatureCalibration row per classifier_version (5-minute in-proc cache)
//   3. apply T-scaling when mode in {shadow, on}
//
// Single source of truth ensures both classifiers behave identically.

import { temperatureScale } from './calibration';
import { FINBERT_PINNED_SHA8 } from './finsentllm';

export type TempScalingMode = 'off' | 'shadow' | 'on';

const CACHE_TTL_MS = 5 * 60 * 1000;

interface CachedT {
  T: number;
  computed_at: Date | null;
  cached_at: number;
}

const cache = new Map<string, CachedT>();

/**
 * Read the SENTIMENT_TEMP_SCALING_MODE env. Defaults to 'off' (no DB read,
 * no behaviour change) to preserve existing classifier semantics.
 */
export function getTempScalingMode(): TempScalingMode {
  const raw = (process.env.SENTIMENT_TEMP_SCALING_MODE || 'off').toLowerCase();
  if (raw === 'shadow' || raw === 'on') return raw;
  return 'off';
}

/**
 * Load the latest TemperatureCalibration row for a given classifier_version.
 * 5-minute in-process cache keyed by classifier_version (avoids hitting Neon
 * on every classification). Cache miss / DB error → T=1.0 (identity) with
 * `computed_at=null` so callers can detect the fallback path.
 */
export async function loadTemperatureFor(
  classifier_version: string,
): Promise<{ T: number; computed_at: Date | null }> {
  const now = Date.now();
  const cached = cache.get(classifier_version);
  if (cached && now - cached.cached_at < CACHE_TTL_MS) {
    return { T: cached.T, computed_at: cached.computed_at };
  }
  try {
    if (!process.env.DATABASE_URL) {
      const fallback = { T: 1.0, computed_at: null };
      cache.set(classifier_version, { ...fallback, cached_at: now });
      return fallback;
    }
    const { prisma } = await import('@/lib/db');
    const row = (await prisma.temperatureCalibration.findFirst({
      where: { classifier_version },
      orderBy: { computed_at: 'desc' },
      select: { temperature: true, computed_at: true },
    })) as { temperature: number; computed_at: Date } | null;
    const T = row?.temperature ?? 1.0;
    const computed_at = row?.computed_at ?? null;
    cache.set(classifier_version, { T, computed_at, cached_at: now });
    return { T, computed_at };
  } catch {
    // Defensive fallback — never throw out to caller; identity is safe.
    const fallback = { T: 1.0, computed_at: null };
    cache.set(classifier_version, { ...fallback, cached_at: now });
    return fallback;
  }
}

/** Test-only: clear the in-process cache so unit tests can re-stub `prisma`. */
export function _resetTemperatureCache(): void {
  cache.clear();
}

/**
 * Derive the FinBERT classifier_version string from process.env.
 *
 * Format: `finbert-prosus-<sha>` where <sha> is the first 8 hex chars of the
 * pinned HF commit SHA. Parses `process.env.HF_FINBERT_ENDPOINT` (format
 * `.../finbert@<sha>`) when present; falls back to the FINBERT_PINNED_SHA8
 * constant for early/local-dev environments.
 */
export function resolveFinBERTClassifierVersion(): string {
  const ep = process.env.HF_FINBERT_ENDPOINT || '';
  const m = ep.match(/@([a-f0-9]+)/i);
  if (m && m[1]) return `finbert-prosus-${m[1].slice(0, 8)}`;
  return `finbert-prosus-${FINBERT_PINNED_SHA8}`;
}

/**
 * Derive the Gemini per-doc classifier_version string.
 *
 * Pinned to the 20-Z-04 prompt registry version — currently `gemini-per-doc-v1`.
 * A registry bump to v2 invalidates calibration history per T-20-B-03-04 and
 * triggers an auto-refit on the next monthly cron run.
 */
export function resolveGeminiPerDocClassifierVersion(version: 'v1' | 'v2' = 'v1'): string {
  return `gemini-per-doc-${version}`;
}

/**
 * Convert post-softmax probabilities back to logits via log(p). This is the
 * canonical "inverse softmax up to an additive constant" — sufficient for
 * T-scaling since softmax is shift-invariant. Used by classifyFinBERT to
 * recover logits from the HF SDK's `[{label, score}, ...]` output.
 */
export function probsToLogits(probs: number[]): number[] {
  const EPS = 1e-12;
  return probs.map((p) => Math.log(Math.max(p, EPS)));
}

/**
 * Apply temperatureScale to logits using a loaded T value. Short-circuits when
 * T === 1.0 (identity — defends against missing-row fallback path).
 */
export function applyTemperature(logits: number[], T: number): number[] {
  if (T === 1.0) {
    // Identity — return softmax(logits) without scaling.
    return temperatureScale(logits, 1.0);
  }
  return temperatureScale(logits, T);
}
