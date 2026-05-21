/**
 * Phase 21 — Sector-Relative Outcome Labels: full relearn (Plan 21-3-06 Task 3, Path B).
 *
 * The /api/cron/learn route auto-detects backfill mode only when
 * learnedPattern.count() === 0, and loadUnprocessedOutcomes() filters out any
 * outcome already referenced by a LearningEvent. So a TRUE replay under the new
 * sector-relative judge requires:
 *   1. Backfill sector_etf + forward_return_sector_rel on every PriceOutcome row
 *      (via /api/cron/relabel) — otherwise sector_relative_pct is null and
 *      classifyHit falls back to SPY-alpha, producing identical results.
 *   2. Snapshot (backup) the current learned_patterns + outcome-linked
 *      learning_events to a timestamped JSON so the operation is reversible.
 *   3. Wipe learned_patterns + outcome-linked learning_events so every outcome
 *      becomes "unprocessed" and learnedPattern.count() === 0 (→ isBackfill).
 *   4. Run /api/cron/learn once — it replays all 556 outcomes under the widened
 *      classifyHit (sector-relative primary), rebuilding the Beta posteriors and
 *      auto-recomputing the EngineThesis snapshot.
 *   5. Capture BEFORE/AFTER per-signal_class spread + direction (top family) and
 *      print the comparison for the 21-3-06-SUMMARY.md machine-readable lines.
 *
 * Reversibility: if the relearn produces a bad result (direction inverts), restore
 * from the JSON backups printed at the top of the run:
 *   - learned_patterns: re-insert rows from learned_patterns_backup_<ts>.json
 *   - learning_events:  re-insert rows from learning_events_backup_<ts>.json
 *
 * Usage:  npx tsx scripts/relearn-21.ts
 * Idempotency: the relabel step is idempotent (WHERE sector_etf IS NULL). Re-running
 * the whole script re-wipes + rebuilds — converges to the same posteriors.
 */

import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '.env.local' });
import { writeFileSync } from 'fs';

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const stddev = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};

type ClassStat = { cells: number; mean_p: number; spread: number };

async function computeClassStats(
  prisma: import('@prisma/client').PrismaClient,
): Promise<{ byClass: Record<string, ClassStat>; aggregate: ClassStat; topFamily: string; worstFamily: string }> {
  const rows = await prisma.learnedPattern.findMany({
    where: { sample_size: { gte: 5 } },
    select: { signal_class: true, alpha: true, beta: true },
  });
  const grouped: Record<string, number[]> = {};
  for (const r of rows) {
    const p = r.alpha / (r.alpha + r.beta);
    (grouped[r.signal_class] ??= []).push(p);
  }
  const byClass: Record<string, ClassStat> = {};
  for (const [cls, ps] of Object.entries(grouped)) {
    byClass[cls] = { cells: ps.length, mean_p: mean(ps), spread: stddev(ps) };
  }
  const allP = Object.values(grouped).flat();
  const aggregate: ClassStat = { cells: allP.length, mean_p: mean(allP), spread: stddev(allP) };
  // "top family" = signal_class with highest mean posterior (the leading thesis);
  // "worst family" = lowest. Direction inversion = leading family becomes worst.
  const ranked = Object.entries(byClass).sort((a, b) => b[1].mean_p - a[1].mean_p);
  const topFamily = ranked.length ? ranked[0][0] : '(none)';
  const worstFamily = ranked.length ? ranked[ranked.length - 1][0] : '(none)';
  return { byClass, aggregate, topFamily, worstFamily };
}

function printStats(label: string, s: Awaited<ReturnType<typeof computeClassStats>>) {
  console.log(`\n=== ${label} ===`);
  for (const [cls, st] of Object.entries(s.byClass).sort()) {
    console.log(`  ${cls}: cells=${st.cells} mean_p=${st.mean_p.toFixed(4)} spread=${st.spread.toFixed(4)}`);
  }
  console.log(`  AGGREGATE: cells=${s.aggregate.cells} mean_p=${s.aggregate.mean_p.toFixed(4)} spread=${s.aggregate.spread.toFixed(4)}`);
  console.log(`  topFamily=${s.topFamily}  worstFamily=${s.worstFamily}`);
}

async function main() {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const { prisma } = await import('@/lib/db');
  const { GET: relabelGET } = await import('@/app/api/cron/relabel/route');
  const { GET: learnGET } = await import('@/app/api/cron/learn/route');
  const { NextRequest } = await import('next/server');

  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error('CRON_SECRET not set in .env.local');
  const authReq = (url: string) =>
    new NextRequest(url, { headers: { authorization: `Bearer ${secret}` } });

  // ── STEP 0: backup (reversibility) ──────────────────────────────────────
  const patternsBackup = await prisma.learnedPattern.findMany();
  const eventsBackup = await prisma.learningEvent.findMany({ where: { outcome_id: { not: null } } });
  const patternsPath = `/tmp/learned_patterns_backup_${ts}.json`;
  const eventsPath = `/tmp/learning_events_backup_${ts}.json`;
  writeFileSync(patternsPath, JSON.stringify(patternsBackup, null, 2));
  writeFileSync(eventsPath, JSON.stringify(eventsBackup, null, 2));
  console.log(`[backup] ${patternsBackup.length} learned_patterns → ${patternsPath}`);
  console.log(`[backup] ${eventsBackup.length} outcome-linked learning_events → ${eventsPath}`);

  // ── STEP 1: BEFORE state ────────────────────────────────────────────────
  const before = await computeClassStats(prisma);
  printStats('BEFORE (pre-relearn)', before);

  // ── STEP 2: drain the relabel backfill ──────────────────────────────────
  console.log('\n[relabel] draining backfill...');
  let pass = 0;
  while (pass < 6) {
    const res = await relabelGET(authReq('http://local/api/cron/relabel'));
    const j = await res.json();
    pass++;
    console.log(`  pass ${pass}:`, JSON.stringify(j));
    if (!j.ok || j.labeled === 0) break;
  }
  const stillNull = await prisma.priceOutcome.count({ where: { sector_etf: null } });
  console.log(`[relabel] remaining unlabeled (sector_etf IS NULL): ${stillNull}`);

  // ── STEP 3: wipe posteriors + outcome-linked events (true full replay) ──
  const delEvents = await prisma.learningEvent.deleteMany({ where: { outcome_id: { not: null } } });
  const delPatterns = await prisma.learnedPattern.deleteMany({});
  console.log(`\n[wipe] deleted ${delEvents.count} outcome-linked learning_events, ${delPatterns.count} learned_patterns`);

  // ── STEP 4: rebuild via learn cron (isBackfill auto-true: patterns=0) ───
  console.log('[relearn] running /api/cron/learn (backfill replay)...');
  const learnRes = await learnGET(authReq('http://local/api/cron/learn'));
  const learnJson = await learnRes.json();
  console.log('[relearn] result:', JSON.stringify(learnJson));

  // ── STEP 5: AFTER state ─────────────────────────────────────────────────
  const after = await computeClassStats(prisma);
  printStats('AFTER (post-relearn)', after);

  // last_updated advancement check
  const recentlyUpdated = await prisma.learnedPattern.count({
    where: { sample_size: { gte: 1 }, last_updated: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
  });
  const withData = await prisma.learnedPattern.count({ where: { sample_size: { gte: 1 } } });

  // ── STEP 6: verdict ─────────────────────────────────────────────────────
  const directionInverted = before.topFamily !== '(none)' && before.topFamily === after.worstFamily;
  console.log('\n=== RELEARN VERDICT ===');
  console.log(`  cells with data (sample_size>=1): ${withData}; last_updated advanced (<1h): ${recentlyUpdated}`);
  console.log(`  BEFORE thesis (top family): ${before.topFamily}`);
  console.log(`  AFTER  thesis (top family): ${after.topFamily}`);
  console.log(`  direction: ${directionInverted ? 'INVERTED ⚠️ (leading family became worst)' : 'preserved (leading family did not become worst)'}`);
  console.log(`  spread (aggregate): ${before.aggregate.spread.toFixed(4)} → ${after.aggregate.spread.toFixed(4)}`);
  console.log(`  spread compressed toward 0.5: ${after.aggregate.spread < before.aggregate.spread ? 'YES' : 'NO'}`);
  console.log('\n  SUMMARY machine-readable lines:');
  console.log(`    direction: ${directionInverted ? 'INVERTED' : 'preserved'} — top family ${before.topFamily} → ${after.topFamily}`);
  console.log(`    spread: ${before.aggregate.spread.toFixed(2)} → ${after.aggregate.spread.toFixed(2)}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
