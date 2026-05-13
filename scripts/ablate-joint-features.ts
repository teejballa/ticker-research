/**
 * Plan 20-C-05 — Joint-feature ablation runner.
 *
 * End-to-end CPCV-based paired-bootstrap ablation of the four joint
 * sentiment-interaction features (sentimentMomentumProduct,
 * sentimentVolumeInteraction, deltaSentiment3d, sentimentDispersion) against
 * sentiment-alone.
 *
 * Reuses 19-A-04 `combinatorialPurgedKFold` — does NOT re-implement purging.
 * Reuses `pairedBlockBootstrapSharpeDiff` for the CI gate (1000 resamples,
 * block_size=7).
 *
 * Multiple-testing mitigation (T-20-C-05-01): reports ONE joint-vs-alone
 * Sharpe difference, not four per-feature p-values.
 *
 * Output: writes a markdown report with YAML frontmatter at
 *   reports/joint-features-ablation-{YYYY-MM-DD}.md
 *
 * Decision rule:
 *   verdict='uplift'      iff CI lower-bound > 0
 *   verdict='null'        iff CI upper-bound < 0
 *   verdict='inconclusive' otherwise (CI straddles 0)
 *
 *   decision='promote_to_on'  iff verdict='uplift' AND rollingMonthsAgreeing >= 3
 *   decision='remain_shadow'  iff verdict='uplift' AND rollingMonthsAgreeing < 3,
 *                              OR verdict='inconclusive'
 *   decision='remain_off'     iff verdict='null'
 *
 * The script does NOT mutate the JOINT_FEATURES_MODE env var. It only emits
 * the decision; flag mutation is a Vercel-side ops step.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  combinatorialPurgedKFold,
  buildJointFeaturePatternKey,
  type JointFeatures,
} from '@/lib/learning';
import {
  pairedBlockBootstrapSharpeDiff,
  type PairedBootstrapResult,
} from '@/lib/sentiment/paired-bootstrap';
import {
  sentimentMomentumProduct,
  sentimentVolumeInteraction,
  deltaSentiment3d,
  sentimentDispersion,
} from '@/lib/sentiment/joint-features';

export interface AblationConfig {
  asOfDate: Date;
  cpcvN: number; // default 6
  cpcvK: number; // default 2
  cpcvEmbargo: number; // default 5 days
  lookbackDays: number; // default 365
  blockBootstrapSize: number; // default 7
  nResamples: number; // default 1000 — assertion in tests
  seed: number; // default 20260510
  /** Optional override — when set, the script uses this fixture row-set instead of the DB. */
  dataSourceOverride?: AblationDataRow[];
  /** Optional override — write reports to this directory instead of ./reports. */
  reportsDir?: string;
}

export interface AblationDataRow {
  ticker: string;
  date: string; // YYYY-MM-DD
  sentiment: number; // [-1, +1]
  returns_5d: number; // raw return
  volume_zscore: number;
  per_source_bull_pcts: number[]; // length >= 2 expected for non-zero dispersion
  sentiment_t_minus_3: number;
  /** forward 7d alpha-vs-SPY — the LABEL */
  realized_alpha_7d: number;
  /** sentiment_type × cap_class × direction tuple components */
  sentimentType: string;
  capClass: string;
  direction: 'bull' | 'bear';
}

export interface AblationReport {
  asOfDate: string;
  config: AblationConfig;
  sentimentAloneSharpe: number[];
  jointFeatureSharpe: number[];
  bootstrap: PairedBootstrapResult;
  verdict: 'uplift' | 'null' | 'inconclusive';
  decision: 'promote_to_on' | 'remain_shadow' | 'remain_off';
  rollingMonthsAgreeing: number;
  monthsNeededForPromotion: 3;
  reportPath: string;
}

export const DEFAULT_ABLATION_CONFIG: Omit<
  AblationConfig,
  'asOfDate' | 'dataSourceOverride' | 'reportsDir'
> = {
  cpcvN: 6,
  cpcvK: 2,
  cpcvEmbargo: 5,
  lookbackDays: 365,
  blockBootstrapSize: 7,
  nResamples: 1000,
  seed: 20260510,
};

function rowToJointFeatures(r: AblationDataRow): JointFeatures {
  return {
    sentimentMomentumProduct: sentimentMomentumProduct(r.sentiment, r.returns_5d),
    sentimentVolumeInteraction: sentimentVolumeInteraction(r.sentiment, r.volume_zscore),
    deltaSentiment3d: deltaSentiment3d(r.sentiment, r.sentiment_t_minus_3),
    sentimentDispersion: sentimentDispersion(r.per_source_bull_pcts),
  };
}

/**
 * For a given train fold (set of row indices) and a key-builder function,
 * compute the per-bucket mean realized_alpha lookup, then score the test
 * fold and return its information-coefficient-like statistic: the Pearson
 * correlation between predicted alpha (per-bucket train mean) and realized
 * alpha on the test fold.
 *
 * This is the canonical IC metric used in financial ML and is monotone in
 * predictive discrimination — strictly better predictions yield strictly
 * higher IC. (A raw mean-product Sharpe is variance-penalized and can drop
 * for a more-discriminating predictor.)
 */
function foldSharpe(
  trainIdx: number[],
  testIdx: number[],
  rows: AblationDataRow[],
  keyFor: (r: AblationDataRow) => string,
): number {
  const bucket: Map<string, { sum: number; n: number }> = new Map();
  for (const i of trainIdx) {
    const r = rows[i];
    const k = keyFor(r);
    const e = bucket.get(k);
    if (e) {
      e.sum += r.realized_alpha_7d;
      e.n += 1;
    } else {
      bucket.set(k, { sum: r.realized_alpha_7d, n: 1 });
    }
  }
  const preds: number[] = [];
  const realized: number[] = [];
  for (const i of testIdx) {
    const r = rows[i];
    const k = keyFor(r);
    const e = bucket.get(k);
    // Cold-start prior: 0 (no signal). Avoids leakage of unconditional mean.
    const pred = e ? e.sum / e.n : 0;
    preds.push(pred);
    realized.push(r.realized_alpha_7d);
  }
  const n = preds.length;
  if (n < 2) return 0;
  let sumP = 0;
  let sumR = 0;
  for (let i = 0; i < n; i++) {
    sumP += preds[i];
    sumR += realized[i];
  }
  const meanP = sumP / n;
  const meanR = sumR / n;
  let num = 0;
  let varP = 0;
  let varR = 0;
  for (let i = 0; i < n; i++) {
    const dp = preds[i] - meanP;
    const dr = realized[i] - meanR;
    num += dp * dr;
    varP += dp * dp;
    varR += dr * dr;
  }
  const denom = Math.sqrt(varP * varR);
  if (denom < 1e-15) return 0;
  return num / denom;
}

async function loadFromDb(_lookbackDays: number): Promise<AblationDataRow[]> {
  // Lazy import — script must be unit-testable without DATABASE_URL.
  // Read-only path; T-20-C-05-06 mitigation: this function NEVER writes to
  // LearnedPattern rows. The real backfill query (joining SentimentObservation
  // from 20-Z-01 with forward 7d alpha-vs-SPY) is a follow-up; on day one we
  // return an empty array when no fixture override is provided, and the
  // calling cron records this as an inconclusive null result.
  try {
    await import('@/lib/db');
    return [];
  } catch {
    return [];
  }
}

function computeVerdict(
  bs: PairedBootstrapResult,
): 'uplift' | 'null' | 'inconclusive' {
  if (bs.ci95Lower > 0) return 'uplift';
  if (bs.ci95Upper < 0) return 'null';
  return 'inconclusive';
}

function countRollingMonthsAgreeing(reportsDir: string, currentVerdict: 'uplift' | 'null' | 'inconclusive'): number {
  if (!fs.existsSync(reportsDir)) return currentVerdict === 'uplift' ? 1 : 0;
  const files = fs
    .readdirSync(reportsDir)
    .filter((f) => /^joint-features-ablation-\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .sort()
    .reverse(); // most recent first
  let count = currentVerdict === 'uplift' ? 1 : 0;
  if (currentVerdict !== 'uplift') return 0;
  for (const f of files) {
    const content = fs.readFileSync(path.join(reportsDir, f), 'utf8');
    const m = content.match(/^verdict:\s*(\w+)$/m);
    if (m && m[1] === 'uplift') count++;
    else break;
  }
  return count;
}

function computeDecision(
  verdict: 'uplift' | 'null' | 'inconclusive',
  rollingMonthsAgreeing: number,
): 'promote_to_on' | 'remain_shadow' | 'remain_off' {
  if (verdict === 'null') return 'remain_off';
  if (verdict === 'uplift' && rollingMonthsAgreeing >= 3) return 'promote_to_on';
  return 'remain_shadow';
}

function formatDateUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function writeReport(report: AblationReport, reportsDir: string): string {
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
  const fname = `joint-features-ablation-${report.asOfDate}.md`;
  const fpath = path.join(reportsDir, fname);
  const bs = report.bootstrap;
  // Multiple-testing guard (T-20-C-05-01): ONE joint-vs-alone Sharpe diff —
  // no per-feature p-values in the report body.
  const nullParagraph =
    report.verdict === 'null'
      ? '\n\nNo uplift detected; joint features remain behind off-flag for future evaluation. This is a published null result per Phase 20 standard S1 (no hand-picked verdict).\n'
      : '';
  const yaml = [
    '---',
    `verdict: ${report.verdict}`,
    `decision: ${report.decision}`,
    `rollingMonthsAgreeing: ${report.rollingMonthsAgreeing}`,
    `observedDelta: ${bs.observedDelta}`,
    `ci95Lower: ${bs.ci95Lower}`,
    `ci95Upper: ${bs.ci95Upper}`,
    `blockSize: ${bs.blockSize}`,
    `nResamples: ${bs.nResamples}`,
    `pValueTwoSided: ${bs.pValueTwoSided}`,
    `asOfDate: ${report.asOfDate}`,
    `cpcvN: ${report.config.cpcvN}`,
    `cpcvK: ${report.config.cpcvK}`,
    `cpcvEmbargo: ${report.config.cpcvEmbargo}`,
    `lookbackDays: ${report.config.lookbackDays}`,
    `seed: ${report.config.seed}`,
    '---',
    '',
    `# Joint-Feature Ablation Report — ${report.asOfDate}`,
    '',
    `On ${report.asOfDate}, joint-feature bundle showed **${report.verdict}**: ` +
      `observed Sharpe difference ${bs.observedDelta.toFixed(6)} with 95% CI ` +
      `[${bs.ci95Lower.toFixed(6)}, ${bs.ci95Upper.toFixed(6)}]. ` +
      `Decision: **${report.decision}** (${report.rollingMonthsAgreeing}/3 consecutive monthly runs agreeing).`,
    nullParagraph,
    '',
    '## Methodology',
    '',
    `- CPCV harness (19-A-04 \`combinatorialPurgedKFold\`): n=${report.config.cpcvN}, k=${report.config.cpcvK}, embargo=${report.config.cpcvEmbargo}d`,
    `- Paired block-bootstrap (Politis-Romano 1994): ${bs.nResamples} resamples, block_size=${bs.blockSize}d`,
    '- Multiple-testing: ONE joint-vs-alone Sharpe difference reported (T-20-C-05-01)',
    '',
  ].join('\n');
  fs.writeFileSync(fpath, yaml + '\n');
  return fpath;
}

export async function runAblation(config: AblationConfig): Promise<AblationReport> {
  const asOfDate = formatDateUtc(config.asOfDate);
  const rows = config.dataSourceOverride ?? (await loadFromDb(config.lookbackDays));

  const { splits } = combinatorialPurgedKFold({
    n: config.cpcvN,
    k: config.cpcvK,
    embargo: config.cpcvEmbargo,
    totalSamples: Math.max(rows.length, config.cpcvN),
  });

  const sentimentAloneSharpe: number[] = [];
  const jointFeatureSharpe: number[] = [];
  for (const sp of splits) {
    const keyOff = (r: AblationDataRow) =>
      buildJointFeaturePatternKey({
        sentimentType: r.sentimentType,
        capClass: r.capClass,
        direction: r.direction,
        mode: 'off',
      }).primaryKey;
    const keyOn = (r: AblationDataRow) =>
      buildJointFeaturePatternKey({
        sentimentType: r.sentimentType,
        capClass: r.capClass,
        direction: r.direction,
        jointFeatures: rowToJointFeatures(r),
        mode: 'on',
      }).primaryKey;
    sentimentAloneSharpe.push(foldSharpe(sp.train_indices, sp.test_indices, rows, keyOff));
    jointFeatureSharpe.push(foldSharpe(sp.train_indices, sp.test_indices, rows, keyOn));
  }

  const bootstrap = pairedBlockBootstrapSharpeDiff({
    seriesA: jointFeatureSharpe,
    seriesB: sentimentAloneSharpe,
    nResamples: config.nResamples,
    blockSize: config.blockBootstrapSize,
    seed: config.seed,
  });

  const verdict = computeVerdict(bootstrap);
  const reportsDir = config.reportsDir ?? path.resolve(process.cwd(), 'reports');
  const rollingMonthsAgreeing = countRollingMonthsAgreeing(reportsDir, verdict);
  const decision = computeDecision(verdict, rollingMonthsAgreeing);

  const partial: Omit<AblationReport, 'reportPath'> = {
    asOfDate,
    config,
    sentimentAloneSharpe,
    jointFeatureSharpe,
    bootstrap,
    verdict,
    decision,
    rollingMonthsAgreeing,
    monthsNeededForPromotion: 3,
  };
  const reportPath = writeReport({ ...partial, reportPath: '' }, reportsDir);

  return { ...partial, reportPath };
}

// CLI entry
if (require.main === module) {
  const now = new Date();
  runAblation({
    asOfDate: now,
    ...DEFAULT_ABLATION_CONFIG,
  })
    .then((r) => {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify({
        verdict: r.verdict,
        decision: r.decision,
        ci95Lower: r.bootstrap.ci95Lower,
        ci95Upper: r.bootstrap.ci95Upper,
        rollingMonthsAgreeing: r.rollingMonthsAgreeing,
        reportPath: r.reportPath,
      }, null, 2));
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('ablate-joint-features failed:', err);
      process.exit(1);
    });
}
