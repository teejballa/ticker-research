// @model-card: docs/cards/MODEL-CARD-loughran-mcdonald.md
// src/lib/sentiment/lm-classifier.ts
//
// Loughran-McDonald 2011 finance-specific bag-of-words classifier.
// LAST-RESORT fallback in the per-message NLP chain (Plan 20-B-06).
// Activates ONLY when classifyFinBERT (HF endpoint) AND @xenova local both null/throw.
//
// CONFIDENCE FLOOR: hardcoded 0.4 (literature default per L&M 2011 §IV reflecting
// "lexicon-only, no probabilistic calibration possible"). T-20-B-06-03: downstream
// 20-B-03 temperature scaling MUST NOT be applied to L&M scores — T-scaling assumes
// a probabilistic classifier output; bag-of-words counts have no calibration target.
// The 20-B-03 implementation MUST gate T-scaling on
// `classifier_version !== 'loughran-mcdonald-2011'`.
//
// NEGATION: within-3-token window for 'not'/'no'/'never' flips polarity of next
// polarity-bearing word per L&M 2011 §III.D + Hutto-Gilbert 2014 VADER convention.
// T-20-B-06-02 documents accuracy ceiling: bag-of-words misses irony, sarcasm,
// multi-clause sentences, negation outside the 3-token window.
//
// STALENESS: T-20-B-06-01 — scripts/check-lm-lexicon-age.ts warns when CSV mtime > 365d.
// REFRESH PROCEDURE: see data/lexicons/README.md.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { withTelemetry } from '../telemetry/withTelemetry';

export interface LMTags {
  positive: boolean;
  negative: boolean;
  uncertainty: boolean;
  litigious: boolean;
  constraining: boolean;
  /** True if the row's `Complexity` column is non-zero in the 1993-2025 dictionary revision. */
  complexity: boolean;
  modal: 'strong' | 'weak' | null;
}

export interface LMScore {
  /** [-1, +1] — (positive_count - negative_count) / max(total_token_count, 1). */
  score: number;
  /** Always 0.4. Hardcoded floor per L&M 2011 §IV; downstream skips T-scaling. */
  confidence: 0.4;
  /** Surfaces in ProviderCallLog telemetry tag and SentimentObservation.classifier_version. */
  nlp_path: 'l&m-fallback';
  /** Number of dictionary-matched tokens in input (informational; useful for low-coverage debug). */
  matched_words: number;
}

/**
 * Pinned classifier version persisted on every SentimentObservation row from
 * this path. T-20-B-06-03 — bump suffix to `-{year}` only when refreshing the
 * CSV per data/lexicons/README.md refresh procedure.
 */
export const LM_CLASSIFIER_VERSION = 'loughran-mcdonald-2011';

const LEXICON_PATH = join(process.cwd(), 'data', 'lexicons', 'loughran-mcdonald.csv');

let cachedDictionary: Map<string, LMTags> | null = null;
let loadingPromise: Promise<Map<string, LMTags>> | null = null;

/**
 * Lazy-loaded singleton. First call parses the CSV (~86k rows) into a Map of
 * only the flagged words (~3-5k entries). Subsequent calls return the cached
 * Map reference. Concurrent first-callers share the same loading promise.
 */
export async function loadLMDictionary(): Promise<Map<string, LMTags>> {
  if (cachedDictionary) return cachedDictionary;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const csv = await readFile(LEXICON_PATH, 'utf-8');
    const lines = csv.split(/\r?\n/);
    if (lines.length === 0) {
      throw new Error('L&M CSV is empty');
    }
    const header = lines[0].split(',');

    const idx = {
      word: header.indexOf('Word'),
      negative: header.indexOf('Negative'),
      positive: header.indexOf('Positive'),
      uncertainty: header.indexOf('Uncertainty'),
      litigious: header.indexOf('Litigious'),
      strong_modal: header.indexOf('Strong_Modal'),
      weak_modal: header.indexOf('Weak_Modal'),
      constraining: header.indexOf('Constraining'),
      complexity: header.indexOf('Complexity'),
    };
    if (idx.word < 0 || idx.negative < 0 || idx.positive < 0) {
      throw new Error(`L&M CSV missing required columns. Header: ${header.join(',')}`);
    }

    const dict = new Map<string, LMTags>();
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const cols = line.split(',');
      const word = cols[idx.word]?.toLowerCase().trim();
      if (!word) continue;

      // L&M dictionary format: non-zero values indicate "year first flagged"
      // (or just 1 for newer columns). We collapse to boolean.
      const positive = (cols[idx.positive] ?? '0') !== '0';
      const negative = (cols[idx.negative] ?? '0') !== '0';
      const uncertainty = (cols[idx.uncertainty] ?? '0') !== '0';
      const litigious = (cols[idx.litigious] ?? '0') !== '0';
      const constraining = (cols[idx.constraining] ?? '0') !== '0';
      const complexity = idx.complexity >= 0 && (cols[idx.complexity] ?? '0') !== '0';
      const strongModal = idx.strong_modal >= 0 && (cols[idx.strong_modal] ?? '0') !== '0';
      const weakModal = idx.weak_modal >= 0 && (cols[idx.weak_modal] ?? '0') !== '0';

      // Skip rows with no flags to keep Map small (~3-5k entries vs ~86k rows).
      if (!positive && !negative && !uncertainty && !litigious && !constraining && !complexity && !strongModal && !weakModal) {
        continue;
      }

      dict.set(word, {
        positive,
        negative,
        uncertainty,
        litigious,
        constraining,
        complexity,
        modal: strongModal ? 'strong' : weakModal ? 'weak' : null,
      });
    }
    cachedDictionary = dict;
    return dict;
  })();

  try {
    return await loadingPromise;
  } finally {
    // Keep cachedDictionary populated; only clear the in-flight promise so
    // future calls take the fast cached-Map path.
    loadingPromise = null;
  }
}

/**
 * Tokenize text:
 *   - lowercase
 *   - strip punctuation EXCEPT internal hyphens and internal apostrophes
 *   - split on whitespace
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^[-']+|[-']+$/g, ''))
    .filter((t) => t.length > 0);
}

const NEGATION_TOKENS = new Set(['not', 'no', 'never']);
const NEGATION_WINDOW = 3;

/**
 * Classify text via L&M lexicon. ALWAYS wrapped in withTelemetry('lm-fallback', ...).
 * See file header for full contract.
 *
 * Empty / whitespace / no-token input → { score: 0, matched_words: 0 }.
 */
export async function classifyByLM(text: string): Promise<LMScore> {
  return withTelemetry('lm-fallback', async () => {
    const dict = await loadLMDictionary();
    const tokens = tokenize(text);
    if (tokens.length === 0) {
      return {
        score: 0,
        confidence: 0.4 as const,
        nlp_path: 'l&m-fallback' as const,
        matched_words: 0,
      };
    }

    let pos = 0;
    let neg = 0;
    let matched = 0;

    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      const tags = dict.get(tok);
      if (!tags) continue;

      const polarityBearing = tags.positive || tags.negative;
      matched++;
      if (!polarityBearing) continue;

      // Negation lookback within 3-token window.
      let negated = false;
      for (let j = Math.max(0, i - NEGATION_WINDOW); j < i; j++) {
        if (NEGATION_TOKENS.has(tokens[j])) {
          negated = true;
          break;
        }
      }

      if (tags.positive) {
        if (negated) neg++;
        else pos++;
      } else if (tags.negative) {
        if (negated) pos++;
        else neg++;
      }
    }

    const score = (pos - neg) / Math.max(tokens.length, 1);
    return {
      score,
      confidence: 0.4 as const,
      nlp_path: 'l&m-fallback' as const,
      matched_words: matched,
    };
  });
}
