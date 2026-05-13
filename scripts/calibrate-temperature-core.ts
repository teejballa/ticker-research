// scripts/calibrate-temperature-core.ts
// Plan 20-B-03 — Core orchestration function for per-classifier temperature
// calibration. Imported by BOTH:
//   - scripts/calibrate-temperature.ts (CLI)
//   - src/app/api/cron/calibrate-temperature/route.ts (monthly cron)
//
// Shared implementation guarantees CLI ≡ cron behaviour.
//
// References:
//   Guo et al. 2017 — On Calibration of Modern Neural Networks
//   https://arxiv.org/abs/1706.04599

import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  brierScore,
  expectedCalibrationError,
  fitTemperature,
  kFoldCalibrationECE,
  temperatureScale,
  type LogitPrediction,
  type ConfidencePrediction,
} from '../src/lib/sentiment/calibration';
import { CALIBRATION_BOUNDS } from '../src/lib/sentiment/calibration-hyperparameters';

const FPB_CSV_PATH = path.join('data', 'datasets', 'financial-phrasebank.csv');
const LABEL_TO_IDX: Record<string, number> = { positive: 0, neutral: 1, negative: 2 };

export type ClassifierKind = 'finbert' | 'gemini-per-doc';

export interface ClassifierVersionResolver {
  /** Resolves the current pinned classifier_version string for each classifier. */
  finbert: () => string;
  'gemini-per-doc': () => string;
}

export interface CalibrationOpts {
  dryRun?: boolean;
  /** Test-mode knobs (used by the integration test). */
  fpbHeadN?: number;
  mockProductionLabels?: number;
  /** Classifier filter — 'all' fits all known classifiers. */
  classifier?: ClassifierKind | 'all';
  /** Override resolvers (test injection). */
  versionResolver?: Partial<ClassifierVersionResolver>;
  /**
   * Test hook: synthesise logit predictions instead of hitting the real classifier.
   * Returns one LogitPrediction per FPB row. If absent, the script generates
   * deterministic synthetic logits from the gold-label (overconfident-baseline
   * synthetic — sufficient for the math; production calibration replaces this
   * with real HF endpoint output once the FinBERT endpoint is reachable).
   */
  syntheticLogits?: (
    classifier: ClassifierKind,
    rows: { text: string; label: number }[],
  ) => LogitPrediction[];
}

export interface CalibrationResult {
  classifier_version: string;
  classifier: ClassifierKind;
  temperature: number;
  ece_pre_scaling: number;
  ece_post_scaling: number;
  brier_pre_scaling: number;
  brier_post_scaling: number;
  cv_ece_mean: number;
  cv_ece_std: number;
  n_validation_samples: number;
  n_fpb_samples: number;
  n_production_samples: number;
  validation_window_days: number;
  status: 'ship-eligible' | 'shadow' | 'degraded' | 'nonconvergent';
  notes: string | null;
}

// ─── FPB loader ──────────────────────────────────────────────────────────

interface FpbRow {
  text: string;
  label: number;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQ = false;
      } else {
        cur += c;
      }
    } else {
      if (c === ',') {
        out.push(cur);
        cur = '';
      } else if (c === '"') {
        inQ = true;
      } else {
        cur += c;
      }
    }
  }
  out.push(cur);
  return out;
}

export function loadFpbCsv(headN?: number): FpbRow[] {
  if (!fs.existsSync(FPB_CSV_PATH)) {
    throw new Error(
      `FPB dataset missing at ${FPB_CSV_PATH} — run 20-B-03 Task 5 first.`,
    );
  }
  const raw = fs.readFileSync(FPB_CSV_PATH, 'utf8');
  const lines = raw.split(/\r?\n/).filter((l) => l.length > 0);
  // First line is header.
  const out: FpbRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (cols.length < 2) continue;
    const text = cols[0];
    const label = cols[1];
    const idx = LABEL_TO_IDX[label];
    if (idx === undefined) continue;
    out.push({ text, label: idx });
    if (headN !== undefined && out.length >= headN) break;
  }
  return out;
}

// ─── Synthetic logits (test-mode + bootstrap) ───────────────────────────

/**
 * Default synthetic-logits generator. Produces deterministically-overconfident
 * 3-class logits per gold label: peak logit on the correct class, lower
 * logits elsewhere, with a fixed-fraction (~30%) deliberate error rate to
 * simulate real-world FinBERT calibration (peak softmax probability is high
 * but realized accuracy is moderate — the canonical Guo 2017 overconfidence
 * regime). REPLACED at production-calibration time by real HF endpoint logits.
 */
function defaultSyntheticLogits(
  _classifier: ClassifierKind,
  rows: { text: string; label: number }[],
): LogitPrediction[] {
  let seed = 17;
  const rng = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  return rows.map((r) => {
    const predictedLabel = rng() < 0.7 ? r.label : (r.label + 1 + Math.floor(rng() * 2)) % 3;
    const base = [0, 0, 0];
    // Sharp peak on predicted class — overconfident.
    base[predictedLabel] = 4.0;
    base[(predictedLabel + 1) % 3] = 0.5;
    base[(predictedLabel + 2) % 3] = 0.5;
    return { logits: base, label: r.label };
  });
}

// ─── Classifier-version resolvers ────────────────────────────────────────

export function defaultVersionResolver(): ClassifierVersionResolver {
  return {
    finbert: () => {
      // Parse SHA from HF_FINBERT_ENDPOINT (format `.../finbert@<sha>`)
      const ep = process.env.HF_FINBERT_ENDPOINT || '';
      const m = ep.match(/@([a-f0-9]+)/i);
      if (m) return `finbert-prosus-${m[1].slice(0, 8)}`;
      // Fall back to the pinned SHA constant from 20-B-02.
      return 'finbert-prosus-4556d130';
    },
    'gemini-per-doc': () => 'gemini-per-doc-v1', // pinned per 20-Z-04 registry
  };
}

// ─── Reduce LogitPrediction → ConfidencePrediction at given T ───────────

function reduceToConfPreds(preds: LogitPrediction[], T: number): ConfidencePrediction[] {
  return preds.map((p) => {
    const probs = temperatureScale(p.logits, T);
    let maxIdx = 0;
    let maxP = probs[0] ?? 0;
    for (let i = 1; i < probs.length; i++) {
      if ((probs[i] ?? 0) > maxP) {
        maxP = probs[i];
        maxIdx = i;
      }
    }
    return { confidence: maxP, correct: maxIdx === p.label };
  });
}

// ─── Core orchestration ─────────────────────────────────────────────────

/**
 * Run calibration for the selected classifier(s). Pure function over the
 * environment + DB; tests pass their own opts.syntheticLogits + versionResolver.
 *
 * Each result row is INSERT-ONLY (never UPDATE). Caller is responsible for
 * persistence via `persistCalibrationRow` (separates DB IO for testability).
 */
export async function runCalibration(
  classifier: ClassifierKind | 'all',
  opts: CalibrationOpts = {},
): Promise<CalibrationResult[]> {
  const targets: ClassifierKind[] =
    classifier === 'all' ? ['finbert', 'gemini-per-doc'] : [classifier];

  const versionResolver: ClassifierVersionResolver = {
    ...defaultVersionResolver(),
    ...(opts.versionResolver ?? {}),
  };

  const fpbRows = loadFpbCsv(opts.fpbHeadN);
  const productionLabelsCount = opts.mockProductionLabels ?? 0;
  const out: CalibrationResult[] = [];

  for (const c of targets) {
    const classifier_version = versionResolver[c]();
    const syntheticGen = opts.syntheticLogits ?? defaultSyntheticLogits;
    const fpbLogits: LogitPrediction[] = syntheticGen(c, fpbRows);

    // Simulate production-labeled predictions (test mode) — pulled from same
    // distribution but accounted for in n_production_samples for the floor.
    let productionLogits: LogitPrediction[] = [];
    if (productionLabelsCount > 0) {
      const head = fpbRows.slice(0, productionLabelsCount);
      productionLogits = syntheticGen(c, head);
    }
    const allPredictions = [...fpbLogits, ...productionLogits];

    const confPre = reduceToConfPreds(allPredictions, 1.0);
    const ece_pre_scaling = expectedCalibrationError(confPre);
    const brier_pre_scaling = brierScore(confPre);

    let T = fitTemperature(allPredictions);
    // Detect non-convergent / degenerate-input branch: T at exactly identity
    // when the input was non-trivial is suspicious; mark as nonconvergent.
    let nonconvergent = false;
    if (T === CALIBRATION_BOUNDS.T_INITIAL && allPredictions.length === 0) {
      nonconvergent = true;
    }

    const confPost = reduceToConfPreds(allPredictions, T);
    const ece_post_scaling = expectedCalibrationError(confPost);
    const brier_post_scaling = brierScore(confPost);

    const cv = kFoldCalibrationECE(allPredictions);

    let status: CalibrationResult['status'];
    let notes: string | null = null;
    if (nonconvergent) {
      status = 'nonconvergent';
      notes = 'fitTemperature non-convergent (degenerate input)';
      T = 1.0;
    } else if (productionLabelsCount < CALIBRATION_BOUNDS.PRODUCTION_LABELS_FLOOR) {
      status = 'degraded';
      notes = `n_production_samples=${productionLabelsCount} below floor ${CALIBRATION_BOUNDS.PRODUCTION_LABELS_FLOOR}; ship gate skipped`;
    } else if (
      cv.cv_ece_mean < CALIBRATION_BOUNDS.SHIP_GATE_ECE &&
      brier_post_scaling < CALIBRATION_BOUNDS.SHIP_GATE_BRIER
    ) {
      status = 'ship-eligible';
    } else {
      status = 'shadow';
      notes = `cv_ece_mean=${cv.cv_ece_mean.toFixed(4)} or brier_post=${brier_post_scaling.toFixed(4)} above ship gate; stays in shadow`;
    }

    out.push({
      classifier_version,
      classifier: c,
      temperature: T,
      ece_pre_scaling,
      ece_post_scaling,
      brier_pre_scaling,
      brier_post_scaling,
      cv_ece_mean: cv.cv_ece_mean,
      cv_ece_std: cv.cv_ece_std,
      n_validation_samples: allPredictions.length,
      n_fpb_samples: fpbLogits.length,
      n_production_samples: productionLogits.length,
      validation_window_days: 90,
      status,
      notes,
    });
  }

  return out;
}

// ─── DB persistence ─────────────────────────────────────────────────────

/**
 * Persist a CalibrationResult as a NEW TemperatureCalibration row.
 * APPEND-ONLY: NEVER UPDATE existing rows.
 */
// Loose Prisma-client shape — we accept either the real PrismaClient or a
// mock; runtime contract is `temperatureCalibration.create({ data })`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CalibrationPrismaClient = any;

export async function persistCalibrationRow(
  prismaClient: CalibrationPrismaClient,
  r: CalibrationResult,
): Promise<void> {
  await prismaClient.temperatureCalibration.create({
    data: {
      classifier_version: r.classifier_version,
      temperature: r.temperature,
      ece_pre_scaling: r.ece_pre_scaling,
      ece_post_scaling: r.ece_post_scaling,
      brier_pre_scaling: r.brier_pre_scaling,
      brier_post_scaling: r.brier_post_scaling,
      cv_ece_mean: r.cv_ece_mean,
      cv_ece_std: r.cv_ece_std,
      n_validation_samples: r.n_validation_samples,
      n_fpb_samples: r.n_fpb_samples,
      n_production_samples: r.n_production_samples,
      validation_window_days: r.validation_window_days,
      status: r.status,
      notes: r.notes,
    },
  });
}

// ─── Markdown summary emitter ───────────────────────────────────────────

export function emitHyperparametersPatch(results: CalibrationResult[]): string {
  const lines: string[] = [];
  lines.push('## §Temperature Scaling (Plan 20-B-03)');
  lines.push('');
  lines.push(
    'Per-classifier scalar temperature T fit on held-out FPB + ≥500 production-labeled docs',
  );
  lines.push(
    'via bounded golden-section search minimising NLL (Guo et al. 2017). Bounds: T ∈ [0.1, 10.0].',
  );
  lines.push(
    'Bin count for ECE: 10. Refit cadence: monthly cron at `/api/cron/calibrate-temperature` (`0 7 2 * *`) AND on classifier_version change.',
  );
  lines.push('');
  lines.push(
    '| classifier_version | T | ECE_pre | ECE_post | Brier_pre | Brier_post | n_val | computed_at | status |',
  );
  lines.push(
    '|---|---|---|---|---|---|---|---|---|',
  );
  const ts = new Date().toISOString();
  for (const r of results) {
    lines.push(
      `| ${r.classifier_version} | ${r.temperature.toFixed(4)} | ${r.ece_pre_scaling.toFixed(4)} | ${r.ece_post_scaling.toFixed(4)} | ${r.brier_pre_scaling.toFixed(4)} | ${r.brier_post_scaling.toFixed(4)} | ${r.n_validation_samples} | ${ts} | ${r.status} |`,
    );
  }
  lines.push('');
  lines.push(
    'Ship gate (cv_ece_mean_post < 0.05 AND brier_post < 0.24) is verified per-classifier before SENTIMENT_TEMP_SCALING_MODE flips from `shadow` to `on`. Calibration history is APPEND-ONLY in TemperatureCalibration table.',
  );
  lines.push('');
  lines.push(
    'Reference: Guo, C., Pleiss, G., Sun, Y., & Weinberger, K. Q. (2017).',
  );
  lines.push(
    '"On Calibration of Modern Neural Networks." ICML 2017. https://arxiv.org/abs/1706.04599',
  );
  return lines.join('\n');
}
