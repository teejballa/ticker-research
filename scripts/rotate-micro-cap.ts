#!/usr/bin/env tsx
// scripts/rotate-micro-cap.ts
//
// Plan 20-D-04 Task 7 — Monthly micro-cap rotation script.
//
// Deterministic, idempotent. Selects the next symbol for the
// micro-cap-low-coverage slot in tests/golden-tickers/_manifest.json
// from the candidate pool in tests/golden-tickers/_micro_cap_pool.json.
//
// Selection algorithm:
//   1. Filter pool.candidates to {last_selected_at === null} OR
//      {last_selected_at > 12 months ago}
//   2. Sort by (last_selected_at ASC nulls-first, market_cap ASC)
//   3. Pick the first
//   4. Update _manifest.json: tickers[micro-cap-slot].current_symbol = picked
//   5. Update _micro_cap_pool.json: cand.last_selected_at = today;
//      history.push({ symbol, selected_at, selected_for_month })
//
// CLI invocation:
//   npm run rotate-micro-cap        # writes new symbol + emits PR body to stdout
//
// Triggered monthly by Vercel cron at /api/cron/rotate-micro-cap (0 9 1 * *).
// The cron handler is OUT OF SCOPE for 20-D-04 — see RUNBOOK-CURATION.md.

import fs from 'node:fs';
import path from 'node:path';

const POOL_PATH = path.join(process.cwd(), 'tests/golden-tickers/_micro_cap_pool.json');
const MANIFEST_PATH = path.join(process.cwd(), 'tests/golden-tickers/_manifest.json');
const TWELVE_MONTHS_MS = 365 * 24 * 60 * 60 * 1000;

export interface MicroCapCandidate {
  symbol: string;
  market_cap: number;
  daily_avg_volume_30d: number;
  analyst_count: number;
  last_selected_at: string | null;
}

export interface MicroCapPool {
  generated_at: string;
  source_dataset: string;
  eligibility_criteria?: Record<string, number>;
  candidates: MicroCapCandidate[];
  history: Array<{ symbol: string; selected_at: string; selected_for_month: string }>;
}

export function selectNextSymbol(
  pool: { candidates: MicroCapCandidate[] },
  now: Date = new Date(),
): string {
  const cutoff = now.getTime() - TWELVE_MONTHS_MS;
  const eligible = pool.candidates.filter(
    (c) => c.last_selected_at === null || new Date(c.last_selected_at).getTime() < cutoff,
  );
  if (eligible.length === 0) {
    throw new Error(
      'rotate-micro-cap: no eligible candidates — every pool entry was selected within ' +
        'the last 12 months. Refresh the pool via scripts/snapshot-microcap-pool.ts (follow-up).',
    );
  }
  eligible.sort((a, b) => {
    const at = a.last_selected_at ? new Date(a.last_selected_at).getTime() : 0;
    const bt = b.last_selected_at ? new Date(b.last_selected_at).getTime() : 0;
    if (at !== bt) return at - bt;
    return a.market_cap - b.market_cap;
  });
  return eligible[0].symbol;
}

export function rotate(now: Date = new Date()): { symbol: string; pr_body: string } {
  const pool: MicroCapPool = JSON.parse(fs.readFileSync(POOL_PATH, 'utf8'));
  const manifest: any = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

  const symbol = selectNextSymbol(pool, now);
  const cand = pool.candidates.find((c) => c.symbol === symbol);
  if (!cand) {
    throw new Error(`rotate-micro-cap: chosen symbol ${symbol} not found in pool — invariant violation`);
  }

  const today = now.toISOString().slice(0, 10);
  const month = now.toISOString().slice(0, 7);

  cand.last_selected_at = today;
  pool.history.push({ symbol, selected_at: today, selected_for_month: month });
  pool.generated_at = today;

  const mc = manifest.tickers.find((t: any) => t.category === 'micro-cap-low-coverage');
  if (!mc) throw new Error('rotate-micro-cap: manifest missing micro-cap-low-coverage slot');
  mc.current_symbol = symbol;
  manifest.version = today;

  fs.writeFileSync(POOL_PATH, JSON.stringify(pool, null, 2) + '\n');
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');

  const pr_body = [
    `## Micro-cap rotation — ${month}`,
    ``,
    `**Selected:** ${symbol}`,
    `**Market cap:** ~$${Math.round(cand.market_cap / 1_000_000)}M`,
    `**Daily volume (30d avg):** ${cand.daily_avg_volume_30d.toLocaleString()}`,
    `**Analyst count:** ${cand.analyst_count}`,
    ``,
    `Operator: verify the symbol still meets eligibility (market_cap < $300M, ` +
      `daily_avg_volume_30d < 500k, analyst_count <= 1). If yes, record the SourcePackage ` +
      `+ frozen report via 20-D-01's record-frozen-report.ts and add 4 human-label exemplars ` +
      `under tests/golden-tickers/_human_labels/ before merging.`,
  ].join('\n');

  return { symbol, pr_body };
}

// CLI entry point — only run rotate() when invoked directly.
const invokedDirectly = (() => {
  try {
    return import.meta.url === `file://${process.argv[1]}`;
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  try {
    const { symbol, pr_body } = rotate();
    console.log(pr_body);
    console.error(`[rotate-micro-cap] selected: ${symbol}`);
    process.exit(0);
  } catch (e) {
    console.error(`[rotate-micro-cap] FAILED:`, (e as Error).message);
    process.exit(1);
  }
}
