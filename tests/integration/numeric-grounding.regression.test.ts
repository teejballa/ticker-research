// tests/integration/numeric-grounding.regression.test.ts
//
// Plan 20-D-01 Task 7 — Build-blocking regression test.
//
// For every (source, report) pair under tests/golden-tickers/, assert
// numericGroundingCheck() returns zero ungrounded spans.
// Also cross-validates:
//   1. Manifest source_hash matches the SHA-256 of the source file on disk.
//   2. Manifest prompt_versions resolves via 20-Z-04 getPrompt() registry.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { numericGroundingCheck } from '@/lib/eval/numeric-grounding';
import { getPrompt, type PromptId, type PromptVersion } from '@/lib/prompts/registry';
import type { SourcePackage } from '@/lib/types';

const SOURCES_DIR = path.resolve(__dirname, '..', 'golden-tickers', '_sources');
const REPORTS_DIR = path.resolve(__dirname, '..', 'golden-tickers', '_reports');
const MANIFEST_PATH = path.resolve(__dirname, '..', 'golden-tickers', '_meta', 'recording-manifest.json');

function listTickers(): string[] {
  return fs.readdirSync(SOURCES_DIR)
    .filter(f => f.endsWith('.source.json'))
    .map(f => path.basename(f, '.source.json'));
}

function sha256(text: string): string {
  return 'sha256-' + crypto.createHash('sha256').update(text).digest('hex');
}

const TICKERS = listTickers();
const manifest: Record<string, {
  source_hash: string;
  prompt_versions: Record<string, string>;
  gemini_model_revision: string;
  temperature: number;
  recorded_at: string;
  recorded_by: string;
  security_type: string;
}> = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

describe('numeric grounding — 8-ticker golden corpus', () => {
  it('exactly 8 tickers in the corpus', () => {
    expect(TICKERS.length).toBe(8);
  });

  it.each(TICKERS)('every numeric span in %s traces to its SourcePackage', (ticker) => {
    const srcRaw = fs.readFileSync(path.join(SOURCES_DIR, `${ticker}.source.json`), 'utf8');
    const repRaw = fs.readFileSync(path.join(REPORTS_DIR, `${ticker}.report.json`), 'utf8');
    const pkg = JSON.parse(srcRaw) as SourcePackage;
    const report = JSON.parse(repRaw);

    const result = numericGroundingCheck(report, pkg);

    if (result.ungrounded_spans.length > 0) {
      const summary = result.ungrounded_spans.map(f => ({
        section: f.span.section,
        span_text: f.span.text,
        span_value: f.span.value,
        tier: f.span.tier,
        closest_source_value: f.closest?.source_value ?? null,
        closest_source_path: f.closest?.source_path ?? null,
        delta: f.closest?.delta ?? null,
        reason: f.reason,
      }));
      const msg = `Ungrounded spans in ${ticker}:\n${JSON.stringify(summary, null, 2)}`;
      throw new Error(msg);
    }

    expect(result.ungrounded_spans).toHaveLength(0);
    expect(result.total_spans).toBeGreaterThan(0);
    expect(result.coverage_pct).toBe(1);
  });

  it('manifest source_hash matches disk SHA-256 for every ticker', () => {
    for (const ticker of TICKERS) {
      const srcRaw = fs.readFileSync(path.join(SOURCES_DIR, `${ticker}.source.json`), 'utf8');
      const onDisk = sha256(srcRaw);
      const inManifest = manifest[ticker]?.source_hash;
      expect(inManifest, `manifest missing entry for ${ticker}`).toBeDefined();
      expect(onDisk).toBe(inManifest);
    }
  });

  it('every report manifest pinned prompt_versions resolves via 20-Z-04 registry', () => {
    for (const ticker of TICKERS) {
      const entry = manifest[ticker];
      expect(entry).toBeDefined();
      for (const [id, version] of Object.entries(entry.prompt_versions)) {
        expect(
          () => getPrompt(id as PromptId, version as PromptVersion),
          `${ticker}: getPrompt(${id}, ${version}) should resolve`,
        ).not.toThrow();
      }
    }
  });

  it('every report has the __recording header with required fields', () => {
    for (const ticker of TICKERS) {
      const repRaw = fs.readFileSync(path.join(REPORTS_DIR, `${ticker}.report.json`), 'utf8');
      const report = JSON.parse(repRaw);
      expect(report.__recording, `${ticker}: missing __recording header`).toBeDefined();
      expect(report.__recording.prompt_versions).toBeDefined();
      expect(report.__recording.temperature).toBe(0);
    }
  });
});
