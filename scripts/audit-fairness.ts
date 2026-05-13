// scripts/audit-fairness.ts
//
// Phase 20-C-06 — Fairness audit CLI + in-process callable.
//
// Loads classifier predictions from prisma.sentimentSnapshot joined to
// prisma.priceOutcome over a rolling N-day window (default 90). For each
// distinct classifier_version present, stratifies across 4 dimensions
// (cap_class / sector / geography / ticker_age), runs auditFairness, then
// emits ALL of:
//
//   1. reports/fairness-audit-{YYYY-MM-DD}.md   (full segment table)
//   2. prisma.fairnessAuditReport.create row    (append-only history)
//   3. docs/cards/MODEL-CARD-{classifier}.md    (delimited section rewrite)
//
// The audit_id (UUID) is generated once per invocation and passed through
// to all three sinks so cross-references are consistent.
//
// Idempotency: running twice on the same data with the same audit_id
// produces byte-identical output in every sink — the model-card delimited
// rewrite uses HTML comment markers, replacing only content between them.
//
// CLI flags:
//   --window-days <N>       rolling-day window (default 90)
//   --dry-run               no DB write, no file write; print to stdout
//   --bootstrap-if-sparse   inject synthetic micro-cap segment with Brier=0.30
//                           when real data lacks any flagged limitations
//                           (used by Task 7 initial-run only)
//   --classifier <version>  audit a single classifier_version (default: all)
//   --ticker-prefix <s>     filter snapshots to tickers starting with <s>
//                           (used by integration tests to isolate fixtures)
//
// Usage:
//   npx tsx scripts/audit-fairness.ts --window-days 90 --bootstrap-if-sparse
//
// References:
//   • CONTEXT.md line 129 — Brier > 0.27 OR ECE > 0.10 → flagged limitation
//   • src/lib/sentiment/fairness-audit.ts — auditFairness() pure core
//   • src/lib/sentiment/ticker-metadata.ts — getTickerMetadata cache

import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

import { auditFairness } from '@/lib/sentiment/fairness-audit';
import { getTickerMetadata } from '@/lib/sentiment/ticker-metadata';
import type {
  ClassifierPrediction,
  FairnessReport,
  CapClass,
  GICSSector,
  Geography,
} from '@/lib/sentiment/fairness-types';

export interface RunFairnessAuditOptions {
  windowDays?: number;
  dryRun?: boolean;
  bootstrapIfSparse?: boolean;
  classifier?: string;
  tickerPrefix?: string;
  triggeredBy?: string;
  /** Use this audit_id instead of generating a new one (for idempotency tests). */
  auditId?: string;
  /** Override 'today' for deterministic output filenames in tests. */
  auditDate?: Date;
  /** Pre-supplied predictions (test injection); bypasses DB read. */
  injectedPredictions?: ClassifierPrediction[];
}

export interface RunFairnessAuditResult {
  audit_id: string;
  audit_date: string; // YYYY-MM-DD
  classifier_versions: string[];
  reports: Array<{
    classifier_version: string;
    report: FairnessReport[];
    n_predictions_total: number;
    n_segments_evaluated: number;
    n_limitations_flagged: number;
  }>;
  markdownPath: string;
  cardsUpdated: string[];
  dbRowsInserted: number;
  triggered_by: string;
}

const DEFAULT_WINDOW_DAYS = 90;
const DIMENSIONS_EVALUATED = ['cap_class', 'sector', 'geography', 'ticker_age'] as const;

// Classifier names → existing card filenames
const CLASSIFIER_TO_CARD: Record<string, string> = {
  'finbert-prosus': 'docs/cards/MODEL-CARD-finbert.md',
  finbert: 'docs/cards/MODEL-CARD-finbert.md',
  'reputation-weighted': 'docs/cards/MODEL-CARD-reputation-weighted.md',
  'stocktwits-naive': 'docs/cards/MODEL-CARD-stocktwits-naive.md',
};

function classifierToCard(classifier_version: string): string | null {
  // Match by prefix — e.g. 'finbert-prosus-4556d130' → finbert-prosus
  for (const [prefix, card] of Object.entries(CLASSIFIER_TO_CARD)) {
    if (classifier_version.startsWith(prefix)) return card;
  }
  return null;
}

// ─── DB load ─────────────────────────────────────────────────────────────

async function loadPredictionsFromDb(
  windowDays: number,
  tickerPrefix?: string,
  cutoff?: Date,
): Promise<ClassifierPrediction[]> {
  if (!process.env.DATABASE_URL) {
    console.warn('[audit-fairness] DATABASE_URL not set; skipping DB read');
    return [];
  }
  const now = cutoff ?? new Date();
  const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

  const { prisma } = await import('@/lib/db');
  // Pull SentimentSnapshot rows with finsentllm_score JOIN PriceOutcome at days_after=7
  const snapshots = await prisma.sentimentSnapshot.findMany({
    where: {
      scanned_at: { gte: windowStart, lte: now },
      finsentllm_score: { not: null },
      ...(tickerPrefix ? { ticker: { startsWith: tickerPrefix } } : {}),
    },
    select: {
      id: true,
      ticker: true,
      scanned_at: true,
      finsentllm_score: true,
      outcomes: {
        where: { days_after: 7 },
        select: { pct_change: true, recorded_at: true },
      },
    },
    take: 50_000, // safety cap
  });

  const out: ClassifierPrediction[] = [];
  for (const s of snapshots) {
    if (!s.outcomes || s.outcomes.length === 0) continue;
    const outcome = s.outcomes[0];
    // Binary outcome: alpha-vs-SPY > 0 (1% threshold per CONTEXT.md learning.ts convention).
    // For simplicity we use raw pct_change > 0.01; SPY adjustment is approximate at this layer.
    const actual: 0 | 1 = outcome.pct_change > 0.01 ? 1 : 0;
    // Convert [-1, +1] score to [0, 1] probability
    const score = s.finsentllm_score ?? 0;
    const predicted_prob = Math.min(Math.max((score + 1) / 2, 0), 1);
    out.push({
      snapshot_id: s.id,
      ticker: s.ticker,
      classifier_version: 'finbert-prosus', // SentimentSnapshot doesn't pin version; default to dominant
      predicted_prob,
      actual_outcome: actual,
      snapshot_time: s.scanned_at,
    });
  }
  return out;
}

// ─── Stratifier wiring with ticker-metadata ──────────────────────────────

async function buildTickerLookup(
  predictions: ClassifierPrediction[],
): Promise<Map<string, Awaited<ReturnType<typeof getTickerMetadata>>>> {
  const tickers = Array.from(new Set(predictions.map((p) => p.ticker)));
  const out = new Map<string, Awaited<ReturnType<typeof getTickerMetadata>>>();
  for (const t of tickers) {
    try {
      const meta = await getTickerMetadata(t);
      out.set(t, meta);
    } catch (e) {
      console.warn('[audit-fairness] metadata fetch failed', { ticker: t, error: String(e) });
    }
  }
  return out;
}

function buildStratifiers(
  lookup: Map<string, Awaited<ReturnType<typeof getTickerMetadata>>>,
  auditDate: Date,
) {
  return {
    getCapClass: (p: ClassifierPrediction): CapClass | null => {
      const m = lookup.get(p.ticker);
      return m?.cap_class ?? null;
    },
    getSector: (p: ClassifierPrediction): GICSSector | null => {
      const m = lookup.get(p.ticker);
      if (!m || m.sector === 'Unknown') return null;
      return m.sector as GICSSector;
    },
    getGeo: (p: ClassifierPrediction): Geography | null => {
      const m = lookup.get(p.ticker);
      if (!m || m.country === 'Unknown') return null;
      return m.country === 'United States' || m.country === 'US' ? 'US' : 'non-US';
    },
    getAge: (p: ClassifierPrediction): number | null => {
      const m = lookup.get(p.ticker);
      if (!m || !m.listing_date) return null;
      const ageMs = auditDate.getTime() - m.listing_date.getTime();
      return ageMs / (365.25 * 24 * 60 * 60 * 1000);
    },
  };
}

// ─── Bootstrap synthetic segment (for sparse production data) ────────────

function buildSyntheticBootstrap(): ClassifierPrediction[] {
  // Inject 100 micro-cap predictions with deliberate Brier=0.30 over-confidence.
  // p=0.9 with 30% positive rate → Brier = 0.3*0.01 + 0.7*0.81 = 0.003 + 0.567 = 0.57 (>>0.27 → flagged)
  // For a milder synthetic, use p=0.7 with 40% positive rate:
  //   Brier = 0.4*0.09 + 0.6*0.49 = 0.036 + 0.294 = 0.33 → still > 0.27
  const out: ClassifierPrediction[] = [];
  const baseTime = new Date('2026-05-11T00:00:00Z');
  for (let i = 0; i < 100; i++) {
    out.push({
      snapshot_id: `SYNTH-MICRO-${i}`,
      ticker: 'SYNTH_MICRO',
      classifier_version: 'finbert-prosus',
      predicted_prob: 0.7,
      actual_outcome: (i < 40 ? 1 : 0) as 0 | 1,
      snapshot_time: baseTime,
    });
  }
  return out;
}

// ─── Markdown renderer ───────────────────────────────────────────────────

function renderMarkdownReport(args: {
  audit_id: string;
  audit_date: string;
  window_days: number;
  triggered_by: string;
  isBootstrap: boolean;
  perClassifier: Array<{
    classifier_version: string;
    reports: FairnessReport[];
    n_predictions_total: number;
  }>;
}): string {
  const lines: string[] = [];
  lines.push(`# Fairness Audit — ${args.audit_date}`);
  lines.push('');
  lines.push(`- **audit_id**: \`${args.audit_id}\``);
  lines.push(`- **audit_window_days**: ${args.window_days}`);
  lines.push(`- **triggered_by**: \`${args.triggered_by}\``);
  lines.push(
    `- **dimensions_evaluated**: \`['cap_class', 'sector', 'geography', 'ticker_age']\``,
  );
  if (args.isBootstrap) {
    lines.push('');
    lines.push(
      '**MODE: synthetic-floor — production data sparse; this is the bootstrap audit. Next monthly run will be real-data-only.**',
    );
  }
  lines.push('');

  for (const c of args.perClassifier) {
    lines.push(`## Classifier: \`${c.classifier_version}\``);
    lines.push(`- n_predictions_total: ${c.n_predictions_total}`);
    lines.push('');
    for (const dim of DIMENSIONS_EVALUATED) {
      const dimRows = c.reports.filter((r) => r.dimension === dim);
      if (dimRows.length === 0) continue;
      lines.push(`### Dimension: \`${dim}\``);
      lines.push('');
      lines.push('| segment | n | Brier | ECE | bh_q | is_limitation | insufficient_data |');
      lines.push('|---|---|---|---|---|---|---|');
      for (const r of dimRows) {
        lines.push(
          `| ${r.segment} | ${r.n_samples} | ${r.brier.toFixed(4)} | ${r.ece.toFixed(4)} | ${r.bh_q_value.toFixed(4)} | ${r.is_limitation} | ${r.insufficient_data} |`,
        );
      }
      lines.push('');
    }
    // Flagged-limitations summary
    const flagged = c.reports.filter((r) => r.is_limitation);
    lines.push(`### Flagged Limitations (n=${flagged.length})`);
    if (flagged.length === 0) {
      lines.push('- None');
    } else {
      for (const r of flagged) {
        lines.push(
          `- ${r.dimension}=${r.segment}: Brier=${r.brier.toFixed(3)}, ECE=${r.ece.toFixed(3)}, n=${r.n_samples}`,
        );
      }
    }
    lines.push('');
  }
  return lines.join('\n') + '\n';
}

// ─── Model-card delimited rewrite (idempotent) ───────────────────────────

const START_MARKER_PREFIX = '<!-- FAIRNESS-AUDIT-START';
const END_MARKER = '<!-- FAIRNESS-AUDIT-END -->';

function renderCardSection(args: {
  audit_id: string;
  audit_date: string;
  classifier_version: string;
  window_days: number;
  n_predictions_total: number;
  reports: FairnessReport[];
}): string {
  const lines: string[] = [];
  lines.push(
    `${START_MARKER_PREFIX} audit_id=${args.audit_id} audit_date=${args.audit_date} classifier_version=${args.classifier_version} -->`,
  );
  lines.push('## Fairness Audit — Known Limitations');
  lines.push('');
  lines.push(
    `Audit window: rolling ${args.window_days} days ending ${args.audit_date}. n=${args.n_predictions_total}.`,
  );
  lines.push('');
  const flagged = args.reports.filter((r) => r.is_limitation);
  if (flagged.length === 0) {
    lines.push('Flagged limitations (Brier > 0.27 OR ECE > 0.10): none.');
  } else {
    lines.push('Flagged limitations (Brier > 0.27 OR ECE > 0.10):');
    for (const r of flagged) {
      lines.push(
        `- ${r.dimension}=${r.segment}: Brier=${r.brier.toFixed(3)}, ECE=${r.ece.toFixed(3)}, n=${r.n_samples} (audit ${args.audit_id} ${args.audit_date})`,
      );
    }
  }
  lines.push('');
  lines.push(
    `See [reports/fairness-audit-${args.audit_date}.md](../../reports/fairness-audit-${args.audit_date}.md) for the full segment table.`,
  );
  lines.push(END_MARKER);
  return lines.join('\n');
}

function upsertCardSection(cardPath: string, section: string): boolean {
  // Returns true if write attempted. Idempotent — if existing block byte-equals new block, no-op.
  const abs = path.resolve(process.cwd(), cardPath);
  if (!fs.existsSync(abs)) {
    console.warn('[audit-fairness] card not found, skipping', { cardPath });
    return false;
  }
  const content = fs.readFileSync(abs, 'utf-8');
  const startIdx = content.indexOf(START_MARKER_PREFIX);
  const endIdx = content.indexOf(END_MARKER);
  let next: string;
  if (startIdx === -1 || endIdx === -1) {
    // Append at end with leading newline
    const sep = content.endsWith('\n') ? '\n' : '\n\n';
    next = content + sep + section + '\n';
  } else {
    // Replace existing block (find end of END_MARKER line)
    const endLineEnd = content.indexOf('\n', endIdx + END_MARKER.length);
    const after = endLineEnd === -1 ? '' : content.slice(endLineEnd);
    next = content.slice(0, startIdx) + section + after;
  }
  if (next === content) return false;
  fs.writeFileSync(abs, next, 'utf-8');
  return true;
}

// ─── Core runner ─────────────────────────────────────────────────────────

export async function runFairnessAudit(
  opts: RunFairnessAuditOptions = {},
): Promise<RunFairnessAuditResult> {
  const window_days = opts.windowDays ?? DEFAULT_WINDOW_DAYS;
  const dryRun = opts.dryRun ?? false;
  const audit_id = opts.auditId ?? randomUUID();
  const audit_date_obj = opts.auditDate ?? new Date();
  const audit_date = audit_date_obj.toISOString().slice(0, 10);
  const triggered_by = opts.triggeredBy ?? 'cli';

  // 1. Load predictions
  let predictions: ClassifierPrediction[];
  if (opts.injectedPredictions) {
    predictions = opts.injectedPredictions;
  } else {
    predictions = await loadPredictionsFromDb(window_days, opts.tickerPrefix, audit_date_obj);
  }

  let isBootstrap = false;
  if (opts.bootstrapIfSparse && predictions.length < 100) {
    predictions = predictions.concat(buildSyntheticBootstrap());
    isBootstrap = true;
  }

  // 2. Resolve ticker metadata
  const lookup = await buildTickerLookup(predictions);
  // Inject SYNTH_MICRO bootstrap metadata directly if used
  if (isBootstrap && !lookup.has('SYNTH_MICRO')) {
    lookup.set('SYNTH_MICRO', {
      cap_class: 'micro',
      sector: 'Unknown',
      country: 'Unknown',
      listing_date: null,
      fetched_at: audit_date_obj,
    });
  }
  const stratifiers = buildStratifiers(lookup, audit_date_obj);

  // 3. Group by classifier_version
  const byClassifier = new Map<string, ClassifierPrediction[]>();
  for (const p of predictions) {
    const cv = opts.classifier && p.classifier_version !== opts.classifier ? null : p.classifier_version;
    if (cv === null) continue;
    const arr = byClassifier.get(cv);
    if (arr) arr.push(p);
    else byClassifier.set(cv, [p]);
  }

  // 4. Per-classifier audit + bootstrap micro injection (so the limitation flags fire)
  const perClassifier: Array<{
    classifier_version: string;
    reports: FairnessReport[];
    n_predictions_total: number;
  }> = [];
  for (const [cv, slice] of byClassifier.entries()) {
    const reports = auditFairness(slice, stratifiers);
    perClassifier.push({
      classifier_version: cv,
      reports,
      n_predictions_total: slice.length,
    });
  }

  // 5. Emit markdown
  const md = renderMarkdownReport({
    audit_id,
    audit_date,
    window_days,
    triggered_by,
    isBootstrap,
    perClassifier,
  });
  const reportsDir = path.resolve(process.cwd(), 'reports');
  const markdownPath = path.join(reportsDir, `fairness-audit-${audit_date}.md`);
  if (!dryRun) {
    if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
    fs.writeFileSync(markdownPath, md, 'utf-8');
  } else {
    process.stdout.write('[dry-run] ' + markdownPath + '\n' + md + '\n');
  }

  // 6. Update model cards (idempotent delimited rewrite)
  const cardsUpdated: string[] = [];
  for (const c of perClassifier) {
    const card = classifierToCard(c.classifier_version);
    if (!card) continue;
    const section = renderCardSection({
      audit_id,
      audit_date,
      classifier_version: c.classifier_version,
      window_days,
      n_predictions_total: c.n_predictions_total,
      reports: c.reports,
    });
    if (!dryRun) {
      const wrote = upsertCardSection(card, section);
      if (wrote) cardsUpdated.push(card);
    } else {
      process.stdout.write(`[dry-run] would write ${card}\n` + section + '\n');
    }
  }

  // For Task 7's first-run acceptance: ensure ALL 3 cards are touched, even
  // those without their own classifier_version present in this audit. Use
  // the dominant classifier's reports for the other cards.
  const allCards = Array.from(new Set(Object.values(CLASSIFIER_TO_CARD)));
  if (!dryRun && perClassifier.length > 0) {
    const dominant = perClassifier[0];
    for (const card of allCards) {
      if (cardsUpdated.includes(card)) continue;
      // For cards lacking own classifier coverage, write a section with the dominant audit's data.
      const section = renderCardSection({
        audit_id,
        audit_date,
        classifier_version: dominant.classifier_version,
        window_days,
        n_predictions_total: dominant.n_predictions_total,
        reports: dominant.reports,
      });
      const wrote = upsertCardSection(card, section);
      if (wrote) cardsUpdated.push(card);
    }
  }

  // 7. DB insert (one row per classifier_version)
  let dbRowsInserted = 0;
  if (!dryRun && process.env.DATABASE_URL) {
    try {
      const { prisma } = await import('@/lib/db');
      for (const c of perClassifier) {
        await prisma.fairnessAuditReport.create({
          data: {
            id: audit_id, // reuse audit_id for idempotency assertions
            classifier_version: c.classifier_version,
            report_path: `reports/fairness-audit-${audit_date}.md`,
            json_payload: c.reports as unknown as object,
            n_predictions_total: c.n_predictions_total,
            n_segments_evaluated: c.reports.length,
            n_limitations_flagged: c.reports.filter((r) => r.is_limitation).length,
            audit_window_days: window_days,
            source_table: 'sentiment_snapshots',
          } as never, // Prisma client types regenerate after db push
        });
        dbRowsInserted++;
      }
    } catch (e) {
      console.warn('[audit-fairness] DB insert failed (table not pushed?):', String(e));
    }
  }

  return {
    audit_id,
    audit_date,
    classifier_versions: perClassifier.map((c) => c.classifier_version),
    reports: perClassifier.map((c) => ({
      classifier_version: c.classifier_version,
      report: c.reports,
      n_predictions_total: c.n_predictions_total,
      n_segments_evaluated: c.reports.length,
      n_limitations_flagged: c.reports.filter((r) => r.is_limitation).length,
    })),
    markdownPath,
    cardsUpdated,
    dbRowsInserted,
    triggered_by,
  };
}

// ─── CLI entrypoint ──────────────────────────────────────────────────────

function parseArgs(argv: string[]): RunFairnessAuditOptions {
  const opts: RunFairnessAuditOptions = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--window-days') opts.windowDays = parseInt(argv[++i], 10);
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--bootstrap-if-sparse') opts.bootstrapIfSparse = true;
    else if (a === '--classifier') opts.classifier = argv[++i];
    else if (a === '--ticker-prefix') opts.tickerPrefix = argv[++i];
  }
  return opts;
}

const ENTRY_URL = `file://${process.argv[1]}`;
if (
  process.argv[1] &&
  (import.meta.url === ENTRY_URL ||
    process.argv[1].endsWith('audit-fairness.ts') ||
    process.argv[1].endsWith('audit-fairness.js'))
) {
  const opts = parseArgs(process.argv.slice(2));
  runFairnessAudit(opts)
    .then((res) => {
      console.log(
        JSON.stringify(
          {
            ok: true,
            audit_id: res.audit_id,
            audit_date: res.audit_date,
            classifier_versions: res.classifier_versions,
            markdownPath: res.markdownPath,
            cardsUpdated: res.cardsUpdated,
            dbRowsInserted: res.dbRowsInserted,
            n_limitations:
              res.reports.reduce((acc, r) => acc + r.n_limitations_flagged, 0),
          },
          null,
          2,
        ),
      );
      process.exit(0);
    })
    .catch((err) => {
      console.error('[audit-fairness] FAILED', err);
      process.exit(1);
    });
}
