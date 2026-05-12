#!/usr/bin/env -S node --import tsx
/**
 * Plan 20-Z-03 — telemetry coverage guard (S6).
 *
 * For each module that contains a known external call (yahoo / polygon /
 * finnhub / anthropic / stocktwits / firecrawl / gemini / finbert / apewisdom
 * / exa), this script asserts the module also contains a `withTelemetry(`
 * call. Exits non-zero on any uncovered module.
 *
 * Adding a new external provider in a future plan REQUIRES extending the
 * REQUIRED list below.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();

interface RequiredEntry {
  file: string;
  reason: string;
}

const REQUIRED: RequiredEntry[] = [
  { file: 'src/lib/data/yahoo.ts', reason: 'Yahoo Finance external API' },
  { file: 'src/lib/data/polygon.ts', reason: 'Polygon external API' },
  { file: 'src/lib/data/polygon-news.ts', reason: 'Polygon news external API' },
  { file: 'src/lib/data/finnhub.ts', reason: 'Finnhub external API' },
  { file: 'src/lib/data/anthropic-search.ts', reason: 'Anthropic web search' },
  { file: 'src/lib/data/stocktwits.ts', reason: 'StockTwits external API' },
  { file: 'src/lib/data/lightweight-community-scan.ts', reason: 'Firecrawl + community fetch' },
  { file: 'src/lib/data/adapters/apewisdom.ts', reason: 'ApeWisdom external API' },
  { file: 'src/lib/data/adapters/exa-search.ts', reason: 'Exa web search external API' },
  { file: 'src/lib/sentiment/finsentllm.ts', reason: 'HF FinBERT inference endpoint' },
  { file: 'src/lib/gemini-analysis.ts', reason: 'Gemini via AI Gateway' },
];

const offenders: Array<{ file: string; reason: string }> = [];
for (const r of REQUIRED) {
  try {
    const text = readFileSync(join(ROOT, r.file), 'utf8');
    if (!/withTelemetry\s*\(/.test(text)) {
      offenders.push(r);
    }
  } catch {
    offenders.push({ file: r.file, reason: `${r.reason} (file not found)` });
  }
}

if (offenders.length > 0) {
  console.error(
    'check-telemetry-coverage: FAIL — the following external-call modules are missing withTelemetry() wrapping (S6 violation):',
  );
  for (const o of offenders) {
    console.error(`  ${o.file}  — ${o.reason}`);
  }
  console.error('');
  console.error('Add: import { withTelemetry } from "@/lib/telemetry/withTelemetry"; and wrap the external call.');
  process.exit(1);
}
console.log(
  `check-telemetry-coverage: OK — all ${REQUIRED.length} known external-call modules wrap with withTelemetry()`,
);
