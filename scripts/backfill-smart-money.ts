// scripts/backfill-smart-money.ts
// Phase 17-05 — One-shot CLI to backfill institutional_data + insider_data on
// every existing SentimentSnapshot row that has them NULL. Also prints two
// bucket histograms (InstitutionalPattern + InsiderPattern) to stdout so that
// §3.3 ACTIVE thresholds can be tuned before promoting EXPLORATORY → ACTIVE.
//
// Trust boundary: runs LOCALLY via `npx tsx`, NOT inside a Vercel Function.
// Sequential 1s throttle × ~2000 rows ≈ ~33 min — well past the 300s function
// ceiling (CONTEXT.md D-23, RESEARCH §10).
//
// Usage:
//   npx tsx scripts/backfill-smart-money.ts --dry-run   # preview only, no writes
//   npx tsx scripts/backfill-smart-money.ts             # live writes
//
// After this completes, manually trigger /api/cron/learn with $CRON_SECRET so
// the recompute pass runs over all signal_classes (diffusion + technical +
// institutional + insider) across the full 4 cap_class × 6 horizon × 8-bucket
// grid.
//
// Histograms above drive §3.3 threshold tuning — review before promoting
// EXPLORATORY → ACTIVE.

import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '.env.local' });

import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { fetchInstitutionalData } from '../src/lib/data/institutional';
import { fetchInsiderData } from '../src/lib/data/insider';

const DRY_RUN = process.argv.includes('--dry-run');
const HAS_DB = !!process.env.DATABASE_URL;

// 1s throttle between writes — matches Phase 16 convention and Finnhub / SEC EDGAR
// rate limits documented in RESEARCH §10. Do NOT reduce below 1000ms.
const TECH_THROTTLE_MS = 1000;

async function main() {
  console.log(`backfill-smart-money — DRY_RUN=${DRY_RUN}`);

  if (!HAS_DB) {
    console.log('No DATABASE_URL set — nothing to backfill, exiting cleanly.');
    return;
  }

  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  // ─────────────────────────────────────────────────────────────────────────
  // Step 1: institutional_data backfill
  // Query every SentimentSnapshot where institutional_data IS NULL, then call
  // fetchInstitutionalData(ticker, scanned_at) and write the result back.
  // ─────────────────────────────────────────────────────────────────────────
  const instSnaps = await prisma.sentimentSnapshot.findMany({
    where: { institutional_data: { equals: Prisma.JsonNull } },
    orderBy: { scanned_at: 'asc' },
  });

  // Belt-and-suspenders sanity assertion — also catches `undefined`/missing JSON values.
  const pendingInstSnaps = instSnaps.filter((s) => s.institutional_data == null);
  console.log(`\nStep 1: ${pendingInstSnaps.length} snapshots missing institutional_data`);

  const instHistogram: Record<string, number> = {};
  let instWrites = 0;
  let instErrors = 0;

  for (const snap of pendingInstSnaps) {
    try {
      const result = await fetchInstitutionalData(snap.ticker, snap.scanned_at);
      const key = result?.institutional_bucket ?? 'null';
      instHistogram[key] = (instHistogram[key] ?? 0) + 1;

      if (!DRY_RUN) {
        await prisma.sentimentSnapshot.update({
          where: { id: snap.id },
          // Use Prisma.JsonNull for explicit null writes — required so the recompute
          // pass distinguishes "we tried, found nothing" from "never attempted".
          data: { institutional_data: (result ?? Prisma.JsonNull) as object },
        });
        instWrites++;
      }
      const stamp = snap.scanned_at.toISOString().slice(0, 10);
      console.log(`  ${DRY_RUN ? '·' : '✓'} ${snap.ticker} ${stamp} → ${result?.institutional_bucket ?? 'null'}`);
    } catch (err) {
      instErrors++;
      console.error(`  ✗ ${snap.ticker}: ${(err as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, TECH_THROTTLE_MS));
  }

  console.log('\nInstitutionalPattern distribution:');
  for (const [k, v] of Object.entries(instHistogram).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(28)} ${v}`);
  }
  console.log(`\nStep 1 complete: ${instWrites} writes, ${instErrors} errors`);

  // ─────────────────────────────────────────────────────────────────────────
  // Step 2: insider_data backfill
  // Same shape as Step 1 — swap institutional_data → insider_data,
  // fetchInstitutionalData → fetchInsiderData, separate insiderHistogram.
  // ─────────────────────────────────────────────────────────────────────────
  const insiderSnaps = await prisma.sentimentSnapshot.findMany({
    where: { insider_data: { equals: Prisma.JsonNull } },
    orderBy: { scanned_at: 'asc' },
  });

  // Belt-and-suspenders sanity assertion — also catches `undefined`/missing JSON values.
  const pendingInsiderSnaps = insiderSnaps.filter((s) => s.insider_data == null);
  console.log(`\nStep 2: ${pendingInsiderSnaps.length} snapshots missing insider_data`);

  const insiderHistogram: Record<string, number> = {};
  let insiderWrites = 0;
  let insiderErrors = 0;

  for (const snap of pendingInsiderSnaps) {
    try {
      const result = await fetchInsiderData(snap.ticker, snap.scanned_at);
      const key = result?.insider_bucket ?? 'null';
      insiderHistogram[key] = (insiderHistogram[key] ?? 0) + 1;

      if (!DRY_RUN) {
        await prisma.sentimentSnapshot.update({
          where: { id: snap.id },
          // Use Prisma.JsonNull for explicit null writes — same reasoning as Step 1.
          data: { insider_data: (result ?? Prisma.JsonNull) as object },
        });
        insiderWrites++;
      }
      const stamp = snap.scanned_at.toISOString().slice(0, 10);
      console.log(`  ${DRY_RUN ? '·' : '✓'} ${snap.ticker} ${stamp} → ${result?.insider_bucket ?? 'null'}`);
    } catch (err) {
      insiderErrors++;
      console.error(`  ✗ ${snap.ticker}: ${(err as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, TECH_THROTTLE_MS));
  }

  console.log('\nInsiderPattern distribution:');
  for (const [k, v] of Object.entries(insiderHistogram).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(28)} ${v}`);
  }
  console.log(`\nStep 2 complete: ${insiderWrites} writes, ${insiderErrors} errors`);

  // ─────────────────────────────────────────────────────────────────────────
  // Post-backfill reminder
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\nDone. Now manually trigger /api/cron/learn with $CRON_SECRET so the recompute pass runs over all classes.');
  console.log('Histograms above drive §3.3 threshold tuning — review before promoting EXPLORATORY → ACTIVE.');

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
