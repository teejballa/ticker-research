// scripts/provider-health-report.ts
//
// Phase 30 D-25 — Per-provider gate verdict report.
//
// Operator-readable summary: one row per provider in ProviderCallLog over
// the last 24h. Same SQL math as /api/cron/provider-error-budget (Plan 04)
// so the report and the cron's alert decision can never disagree.
//
// Also includes the D-16 Gemini cost done-gate probe (AVG(cost_usd) over
// the same 24h window) as a second section.
//
// Usage:
//   npm run provider-health-report
//
// Output: reports/provider-health-{YYYY-MM-DD}.md (gitignored)
//
// Exit codes:
//   0 — report written successfully (regardless of pass/fail/insufficient verdicts)
//   1 — DB unreachable or write failed
//
// Loads .env.local at module top — must run BEFORE any module that touches
// DATABASE_URL (Prisma in @/lib/db throws at import time when DATABASE_URL is
// unset). ES module imports are hoisted, so `@/lib/db` is imported LAZILY
// (via dynamic import inside main()) so the dotenv call below executes first.
// Mirrors the lazy-import pattern used in src/lib/telemetry/provider-call-log.ts.

import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '.env.local' });

import fs from 'node:fs/promises';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';

// Done-gate thresholds — keep in lockstep with /api/cron/provider-error-budget
// (D-17 cron) and /api/cron/cost-budget-check (D-16 cost gate).
const ERROR_RATE_THRESHOLD = 0.10;
const MIN_CALLS_FOR_GATE = 50;
const GEMINI_COST_THRESHOLD = 0.50;

interface ProviderRow {
  provider_id: string;
  total_calls: number;
  error_count: number;
  error_rate: number;
  dominant_error_class: string | null;
  verdict: 'pass' | 'fail' | 'insufficient_history';
}

async function loadProviderRows(prisma: PrismaClient): Promise<ProviderRow[]> {
  // Same shape as /api/cron/provider-error-budget Plan 04 Task 1.
  // Single source of truth for the gate math so the report and the cron's
  // alert decision can never disagree.
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      provider_id: string;
      total_count: bigint;
      error_count: bigint;
      dominant_error_class: string | null;
    }>
  >(`
    WITH per_provider AS (
      SELECT
        provider_id,
        COUNT(*)::bigint                                         AS total_count,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END)::bigint AS error_count
      FROM "provider_call_logs"
      WHERE started_at >= NOW() - INTERVAL '24 hours'
      GROUP BY provider_id
    ),
    error_class_counts AS (
      SELECT
        provider_id,
        error_class,
        COUNT(*)::bigint AS n
      FROM "provider_call_logs"
      WHERE started_at >= NOW() - INTERVAL '24 hours'
        AND status = 'error'
        AND error_class IS NOT NULL
      GROUP BY provider_id, error_class
    ),
    modes AS (
      SELECT DISTINCT ON (provider_id)
        provider_id,
        error_class AS dominant_error_class
      FROM error_class_counts
      ORDER BY provider_id, n DESC, error_class ASC
    )
    SELECT
      p.provider_id,
      p.total_count,
      p.error_count,
      m.dominant_error_class
    FROM per_provider p
    LEFT JOIN modes m ON p.provider_id = m.provider_id
    ORDER BY p.provider_id
  `);

  return rows.map((r) => {
    const total = Number(r.total_count);
    const errors = Number(r.error_count);
    const rate = total > 0 ? errors / total : 0;
    let verdict: ProviderRow['verdict'];
    if (total < MIN_CALLS_FOR_GATE) {
      verdict = 'insufficient_history';
    } else if (rate < ERROR_RATE_THRESHOLD) {
      verdict = 'pass';
    } else {
      verdict = 'fail';
    }
    return {
      provider_id: r.provider_id,
      total_calls: total,
      error_count: errors,
      error_rate: rate,
      dominant_error_class: r.dominant_error_class ?? null,
      verdict,
    };
  });
}

async function loadGeminiCostProbe(
  prisma: PrismaClient,
): Promise<{ avg_cost: number; n: number }> {
  // D-16 done-gate probe — verbatim from cost-budget-check pattern.
  // SELECT AVG(cost_usd) FROM provider_call_logs
  //   WHERE provider_id='gemini' AND started_at > NOW() - INTERVAL '24 hours'
  const rows = await prisma.$queryRawUnsafe<Array<{ avg_cost: number | null; n: bigint }>>(`
    SELECT AVG(cost_usd) AS avg_cost, COUNT(*)::bigint AS n
    FROM "provider_call_logs"
    WHERE provider_id = 'gemini' AND started_at > NOW() - INTERVAL '24 hours'
  `);
  const r = rows[0] ?? { avg_cost: null, n: BigInt(0) };
  return { avg_cost: r.avg_cost ?? 0, n: Number(r.n) };
}

function renderMarkdown(
  rows: ProviderRow[],
  cost: { avg_cost: number; n: number },
  generatedAt: Date,
): string {
  const datestr = generatedAt.toISOString().slice(0, 10);
  const lines: string[] = [];
  lines.push(`# Phase 30 — Provider Health Report (${datestr})`);
  lines.push('');
  lines.push(`Generated: ${generatedAt.toISOString()}`);
  lines.push(`Window: last 24h`);
  lines.push(
    `Thresholds: error_rate < ${ERROR_RATE_THRESHOLD}, min_calls_for_gate = ${MIN_CALLS_FOR_GATE}`,
  );
  lines.push('');

  // Done-gate 1 — per-provider error rate table.
  lines.push('## Done-gate 1: per-provider error_rate (D-24)');
  lines.push('');
  lines.push('| provider_id | total_calls | error_rate | dominant_error_class | verdict |');
  lines.push('|-------------|-------------|------------|----------------------|---------|');
  if (rows.length === 0) {
    lines.push('| _no telemetry yet_ | 0 | 0.0% | — | insufficient_history |');
  } else {
    for (const r of rows) {
      const ratePct = (r.error_rate * 100).toFixed(2) + '%';
      const dom = r.dominant_error_class ?? '—';
      lines.push(
        `| ${r.provider_id} | ${r.total_calls} | ${ratePct} | ${dom} | ${r.verdict} |`,
      );
    }
  }
  lines.push('');

  // Done-gate 2 — Gemini avg cost.
  lines.push('## Done-gate 2: AVG(gemini cost_usd) over 24h (D-16)');
  lines.push('');
  const gemVerdict =
    cost.n === 0
      ? 'insufficient_history'
      : cost.avg_cost < GEMINI_COST_THRESHOLD
        ? 'pass'
        : 'fail';
  lines.push(`- avg_cost_usd: \`$${cost.avg_cost.toFixed(4)}\``);
  lines.push(`- threshold: \`< $${GEMINI_COST_THRESHOLD.toFixed(2)}\``);
  lines.push(`- n_calls: \`${cost.n}\``);
  lines.push(`- verdict: \`${gemVerdict}\``);
  lines.push('');

  // Aggregate verdict summary.
  lines.push('## Summary');
  lines.push('');
  const fails = rows.filter((r) => r.verdict === 'fail');
  const insufficient = rows.filter((r) => r.verdict === 'insufficient_history');
  const passes = rows.filter((r) => r.verdict === 'pass');
  lines.push(`- pass: ${passes.length}`);
  lines.push(
    `- fail: ${fails.length}${fails.length ? ' (' + fails.map((f) => f.provider_id).join(', ') + ')' : ''}`,
  );
  lines.push(`- insufficient_history: ${insufficient.length}`);
  lines.push(`- gemini cost gate: ${gemVerdict}`);
  lines.push('');
  lines.push(`Generated by \`scripts/provider-health-report.ts\` per Phase 30 D-25.`);
  lines.push('');
  return lines.join('\n');
}

async function main() {
  // Lazy import — keeps `loadDotenv` at module top from being hoisted-past
  // by the @/lib/db static-import side effect (Prisma client construction).
  const { prisma } = await import('@/lib/db');
  try {
    const generatedAt = new Date();
    const [rows, cost] = await Promise.all([
      loadProviderRows(prisma),
      loadGeminiCostProbe(prisma),
    ]);
    const md = renderMarkdown(rows, cost, generatedAt);

    const datestr = generatedAt.toISOString().slice(0, 10);
    const reportsDir = path.resolve(process.cwd(), 'reports');
    await fs.mkdir(reportsDir, { recursive: true });
    const outPath = path.join(reportsDir, `provider-health-${datestr}.md`);
    await fs.writeFile(outPath, md, 'utf8');
    console.log(
      `[provider-health-report] wrote ${outPath} (${rows.length} providers, gemini n=${cost.n})`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[provider-health-report] failed', err);
  process.exitCode = 1;
});
