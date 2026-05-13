// scripts/check-numeric-grounding.ts
//
// Plan 20-D-01 Task 8 — CI gate runner.
//
// Walks tests/golden-tickers/_sources/ × _reports/ pairs and runs
// numericGroundingCheck on each. Cross-validates recording-manifest.json
// (prompt-version pins resolve via 20-Z-04 + source SHA-256 unchanged).
//
// Exit codes:
//   0 — all 8 pairs grounded; manifest validates
//   1 — at least one pair has ungrounded spans
//   2 — manifest stale (source hash mismatch OR prompt-version-unknown)

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { numericGroundingCheck } from '@/lib/eval/numeric-grounding';
import { getPrompt, type PromptId, type PromptVersion } from '@/lib/prompts/registry';
import type { SourcePackage } from '@/lib/types';

const SOURCES_DIR = path.resolve('tests/golden-tickers/_sources');
const REPORTS_DIR = path.resolve('tests/golden-tickers/_reports');
const MANIFEST_PATH = path.resolve('tests/golden-tickers/_meta/recording-manifest.json');

function sha256(text: string): string {
  return 'sha256-' + crypto.createHash('sha256').update(text).digest('hex');
}

interface PerTickerSummary {
  ticker: string;
  total_spans: number;
  grounded_count: number;
  ungrounded_count: number;
  failures: Array<{
    section: string;
    span_text: string;
    span_value: number;
    tier: string;
    closest_value: number | null;
    closest_path: string | null;
    delta: number | null;
    reason: string;
  }>;
}

function checkOneTicker(ticker: string): PerTickerSummary {
  const srcRaw = fs.readFileSync(path.join(SOURCES_DIR, `${ticker}.source.json`), 'utf8');
  const repRaw = fs.readFileSync(path.join(REPORTS_DIR, `${ticker}.report.json`), 'utf8');
  const pkg = JSON.parse(srcRaw) as SourcePackage;
  const report = JSON.parse(repRaw);
  const result = numericGroundingCheck(report, pkg);

  return {
    ticker,
    total_spans: result.total_spans,
    grounded_count: result.grounded_count,
    ungrounded_count: result.ungrounded_spans.length,
    failures: result.ungrounded_spans.map(f => ({
      section: f.span.section,
      span_text: f.span.text,
      span_value: f.span.value,
      tier: f.span.tier,
      closest_value: f.closest?.source_value ?? null,
      closest_path: f.closest?.source_path ?? null,
      delta: f.closest?.delta ?? null,
      reason: f.reason,
    })),
  };
}

interface ManifestCheckIssue {
  ticker: string;
  kind: 'source-hash-mismatch' | 'unknown-prompt-version' | 'manifest-missing-entry';
  detail: string;
}

function checkManifest(tickers: string[]): ManifestCheckIssue[] {
  if (!fs.existsSync(MANIFEST_PATH)) {
    return [{ ticker: '<global>', kind: 'manifest-missing-entry', detail: `Manifest not found at ${MANIFEST_PATH}` }];
  }
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const issues: ManifestCheckIssue[] = [];

  for (const ticker of tickers) {
    const entry = manifest[ticker];
    if (!entry) {
      issues.push({
        ticker,
        kind: 'manifest-missing-entry',
        detail: `recording-manifest.json has no entry for '${ticker}'. Run: npm run record-frozen-report -- --ticker ${ticker} --pin-prompts latest`,
      });
      continue;
    }

    // Source-hash check.
    const srcPath = path.join(SOURCES_DIR, `${ticker}.source.json`);
    const onDisk = sha256(fs.readFileSync(srcPath, 'utf8'));
    if (onDisk !== entry.source_hash) {
      issues.push({
        ticker,
        kind: 'source-hash-mismatch',
        detail: `Re-record required: tests/golden-tickers/_sources/${ticker}.source.json was edited but the report was not regenerated. Run: npm run record-frozen-report -- --ticker ${ticker} --overwrite --pin-prompts latest`,
      });
    }

    // Prompt-version resolution.
    if (entry.prompt_versions && typeof entry.prompt_versions === 'object') {
      for (const [id, version] of Object.entries(entry.prompt_versions)) {
        try {
          getPrompt(id as PromptId, version as PromptVersion);
        } catch (e) {
          issues.push({
            ticker,
            kind: 'unknown-prompt-version',
            detail: `Fixture ${ticker} was recorded with prompt ${id}@${version}; current registry: ${(e as Error).message}. Re-record via npm run record-frozen-report -- --ticker ${ticker} --pin-prompts latest --overwrite`,
          });
        }
      }
    }
  }

  return issues;
}

function main(): void {
  const tickers = fs.readdirSync(SOURCES_DIR)
    .filter(f => f.endsWith('.source.json'))
    .map(f => path.basename(f, '.source.json'))
    .sort();

  if (tickers.length === 0) {
    console.error('[check-numeric-grounding] No source fixtures found under tests/golden-tickers/_sources/');
    process.exit(2);
  }

  // 1. Manifest validation first — staleness is exit 2.
  const manifestIssues = checkManifest(tickers);
  if (manifestIssues.length > 0) {
    console.error('[check-numeric-grounding] Manifest validation FAILED:');
    for (const issue of manifestIssues) {
      console.error(`  [${issue.kind}] ${issue.ticker}: ${issue.detail}`);
    }
    console.error(JSON.stringify({ ok: false, exit_code: 2, manifest_issues: manifestIssues }));
    process.exit(2);
  }

  // 2. Per-ticker grounding.
  const perTicker: PerTickerSummary[] = [];
  let anyFailures = false;

  for (const ticker of tickers) {
    const summary = checkOneTicker(ticker);
    perTicker.push(summary);
    const status = summary.ungrounded_count === 0 ? 'OK' : 'FAIL';
    console.log(`[${status}] ${ticker}: ${summary.grounded_count}/${summary.total_spans} grounded`);
    if (summary.ungrounded_count > 0) {
      anyFailures = true;
      for (const f of summary.failures) {
        console.error(`  [${f.section}] "${f.span_text}" (value=${f.span_value}, tier=${f.tier}) → closest=${f.closest_value}@${f.closest_path} (delta=${f.delta}, reason=${f.reason})`);
      }
    }
  }

  if (anyFailures) {
    console.error('[check-numeric-grounding] ungrounded spans detected');
    console.error(JSON.stringify({ ok: false, exit_code: 1, per_ticker: perTicker }));
    process.exit(1);
  }

  const total = perTicker.reduce((s, t) => s + t.total_spans, 0);
  const grounded = perTicker.reduce((s, t) => s + t.grounded_count, 0);
  console.log(`[check-numeric-grounding] all ${tickers.length} fixtures grounded — ${grounded}/${total} spans total. exit 0.`);
  console.log(JSON.stringify({ ok: true, exit_code: 0, ticker_count: tickers.length, grounded, total }));
  process.exit(0);
}

main();
