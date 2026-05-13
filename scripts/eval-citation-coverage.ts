// scripts/eval-citation-coverage.ts
//
// Plan 20-D-02 — Operator + cron CLI for the citation-coverage evaluator.
//
// Walks tests/golden-tickers/_reports/*.report.json, splits each frozen
// AnalysisResult into ReportSection-keyed chunks, extracts claims (regex
// always; LLM only when RUN_LLM_CLAIM_EXTRACTION=true), and computes
// citationCoverage against the report's citations_v2 array.
//
// Outputs:
//   - reports/citation-coverage-{YYYY-MM-DD}.json  (machine-readable)
//   - reports/citation-coverage-{YYYY-MM-DD}.md    (human-readable summary)
//
// Exit codes:
//   0  — all 8 fixtures meet COVERAGE_OVERALL_MIN (80) + COVERAGE_SECTION_MIN (60)
//   1  — at least one fixture failed a threshold (CI gate trips)
//   2  — runtime error
//   4  — fixtures missing (NO_GOLDEN_FIXTURES — 20-D-01 / 20-D-04 not landed)
//
// TODO(20-Z-03): emit cost-per-call + latency to ProviderCallLog once the
// telemetry wrapper is generalized for non-Gemini eval calls.

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  extractClaimsRegex,
  extractClaimsLLM,
  mergeClaimSets,
  extractCitationAnchors,
  citationCoverage,
} from '@/lib/eval/citation-coverage';
import {
  COVERAGE_OVERALL_MIN,
  COVERAGE_SECTION_MIN,
  type Claim,
  type CitationAnchor,
  type ReportSection,
  type CoverageResult,
} from '@/lib/eval/citation-coverage.types';
import type { Citation } from '@/lib/sentiment/citation-schema';

const REPORTS_DIR = resolve('tests/golden-tickers/_reports');
const DEFAULT_OUT_DIR = resolve('reports');

export interface CliArgs {
  ci: boolean;
  useLLM: boolean;
  outDir: string;
}

export interface PerTickerResult {
  ticker: string;
  coverage: CoverageResult;
  has_citations: boolean;
  skipped_reason?: string;
}

export interface EvalSummary {
  exitCode: number;
  perTicker: Record<string, PerTickerResult>;
  thresholds: { COVERAGE_OVERALL_MIN: number; COVERAGE_SECTION_MIN: number };
  failures: Array<{ ticker: string; section: string; pct: number; floor: number }>;
}

function parseArgs(argv: string[]): CliArgs {
  return {
    ci: argv.includes('--ci'),
    useLLM: process.env.RUN_LLM_CLAIM_EXTRACTION === 'true',
    outDir: DEFAULT_OUT_DIR,
  };
}

/**
 * Map an AnalysisResult JSON to [section, text] pairs. Each top-level field
 * becomes a section; bullish_signals/bearish_signals expand each row.
 */
function sectionsFromReport(report: Record<string, unknown>): Array<[ReportSection, string]> {
  const sections: Array<[ReportSection, string]> = [
    ['executive_summary', String(report.executive_summary ?? '')],
    ['investment_thesis', String(report.investment_thesis ?? '')],
    ['key_risks', String(report.key_risks ?? '')],
    ['valuation_context', String(report.valuation_context ?? '')],
    ['future_projection', String(report.future_projection ?? '')],
  ];

  const sa = report.sentiment_analysis as { reasoning?: string } | undefined;
  if (sa?.reasoning) sections.push(['sentiment_intelligence', sa.reasoning]);
  if (report.community_analysis) {
    sections.push(['community_intelligence', String(report.community_analysis)]);
  }
  if (report.engine_calibration_context) {
    sections.push(['engine_calibration', String(report.engine_calibration_context)]);
  }

  const bullish = Array.isArray(report.bullish_signals) ? report.bullish_signals : [];
  for (const sig of bullish) {
    const t = typeof sig === 'string' ? sig : (sig as { description?: string }).description ?? '';
    if (t) sections.push(['bullish_signals', t]);
  }
  const bearish = Array.isArray(report.bearish_signals) ? report.bearish_signals : [];
  for (const sig of bearish) {
    const t = typeof sig === 'string' ? sig : (sig as { description?: string }).description ?? '';
    if (t) sections.push(['bearish_signals', t]);
  }

  return sections;
}

export async function runEvalCitationCoverage(args: CliArgs): Promise<EvalSummary> {
  if (!existsSync(REPORTS_DIR)) {
    console.error(`[eval-citation-coverage] NO_GOLDEN_FIXTURES: ${REPORTS_DIR} not found`);
    return {
      exitCode: 4,
      perTicker: {},
      thresholds: { COVERAGE_OVERALL_MIN, COVERAGE_SECTION_MIN },
      failures: [],
    };
  }

  const files = readdirSync(REPORTS_DIR).filter((f) => f.endsWith('.report.json')).sort();
  if (files.length === 0) {
    console.error('[eval-citation-coverage] NO_GOLDEN_FIXTURES: directory empty');
    return {
      exitCode: 4,
      perTicker: {},
      thresholds: { COVERAGE_OVERALL_MIN, COVERAGE_SECTION_MIN },
      failures: [],
    };
  }

  const perTicker: Record<string, PerTickerResult> = {};
  const failures: Array<{ ticker: string; section: string; pct: number; floor: number }> = [];
  let anyFail = false;

  for (const f of files) {
    const report = JSON.parse(readFileSync(join(REPORTS_DIR, f), 'utf8')) as Record<string, unknown>;
    const ticker = String(report.symbol ?? f.replace('.report.json', '')).toUpperCase();
    const citations = Array.isArray(report.citations_v2) ? (report.citations_v2 as Citation[]) : [];

    const claims: Claim[] = [];
    const anchors: CitationAnchor[] = [];

    for (const [section, text] of sectionsFromReport(report)) {
      if (!text) continue;
      const reg = extractClaimsRegex(text, section);
      const llm = args.useLLM ? await extractClaimsLLM(text, section, { ticker }) : [];
      const merged = mergeClaimSets(reg, llm);
      claims.push(...merged);
      if (citations.length > 0) {
        anchors.push(...extractCitationAnchors(text, citations, section));
      }
    }

    const coverage = citationCoverage(claims, anchors);
    const hasCitations = citations.length > 0;
    perTicker[ticker] = {
      ticker,
      coverage,
      has_citations: hasCitations,
      skipped_reason: hasCitations ? undefined : 'fixture lacks citations_v2',
    };

    // Only enforce gates against fixtures that have citations to evaluate.
    if (!hasCitations) {
      console.log(`[SKIP] ${ticker}: fixture lacks citations_v2 — gate not enforced`);
      continue;
    }

    if (coverage.coverage_pct < COVERAGE_OVERALL_MIN) {
      anyFail = true;
      failures.push({
        ticker,
        section: '<overall>',
        pct: coverage.coverage_pct,
        floor: COVERAGE_OVERALL_MIN,
      });
    }
    for (const [section, pct] of Object.entries(coverage.per_section)) {
      if (coverage.totals.total_claims > 0 && pct < COVERAGE_SECTION_MIN) {
        anyFail = true;
        failures.push({ ticker, section, pct, floor: COVERAGE_SECTION_MIN });
      }
    }

    const status = anyFail ? 'FAIL' : 'OK';
    console.log(
      `[${status}] ${ticker}: coverage=${coverage.coverage_pct}% claims=${coverage.totals.total_claims} unsupported=${coverage.totals.unsupported}`,
    );
  }

  // Write JSON + Markdown.
  if (!existsSync(args.outDir)) mkdirSync(args.outDir, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const jsonPath = join(args.outDir, `citation-coverage-${date}.json`);
  const mdPath = join(args.outDir, `citation-coverage-${date}.md`);

  writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        run_date: date,
        thresholds: { COVERAGE_OVERALL_MIN, COVERAGE_SECTION_MIN },
        per_ticker: perTicker,
        failures,
      },
      null,
      2,
    ),
  );

  const lines: string[] = [];
  lines.push(`# Citation Coverage Report — ${date}`);
  lines.push('');
  lines.push(`Thresholds: overall ≥ ${COVERAGE_OVERALL_MIN}%, per_section ≥ ${COVERAGE_SECTION_MIN}%.`);
  lines.push('');
  lines.push('| Ticker | Coverage | Claims | Supported | Unsupported | Status |');
  lines.push('|--------|----------|--------|-----------|-------------|--------|');
  for (const [ticker, r] of Object.entries(perTicker)) {
    const status = !r.has_citations
      ? 'SKIPPED (no citations)'
      : r.coverage.coverage_pct >= COVERAGE_OVERALL_MIN
        ? 'OK'
        : 'FAIL';
    lines.push(
      `| ${ticker} | ${r.coverage.coverage_pct}% | ${r.coverage.totals.total_claims} | ${r.coverage.totals.supported} | ${r.coverage.totals.unsupported} | ${status} |`,
    );
  }
  if (failures.length > 0) {
    lines.push('');
    lines.push('## Failures');
    for (const f of failures) {
      lines.push(`- ${f.ticker} ${f.section}: ${f.pct}% < ${f.floor}%`);
    }
  }
  writeFileSync(mdPath, lines.join('\n') + '\n');

  return {
    exitCode: args.ci && anyFail ? 1 : 0,
    perTicker,
    thresholds: { COVERAGE_OVERALL_MIN, COVERAGE_SECTION_MIN },
    failures,
  };
}

// Entrypoint guard — only run when invoked directly. Test harnesses + the
// cron route import the function without firing the side-effect.
const isMain = (() => {
  // Under tsx, process.argv[1] is the script path; under vitest it's vitest's
  // worker entry — we only want to fire when argv[1] resolves to this file.
  try {
    const entry = process.argv[1] ?? '';
    return entry.endsWith('eval-citation-coverage.ts') ||
      entry.endsWith('eval-citation-coverage.js');
  } catch {
    return false;
  }
})();

if (isMain) {
  runEvalCitationCoverage(parseArgs(process.argv.slice(2)))
    .then(({ exitCode }) => process.exit(exitCode))
    .catch((e) => {
      console.error('[eval-citation-coverage] FATAL', e);
      process.exit(2);
    });
}
