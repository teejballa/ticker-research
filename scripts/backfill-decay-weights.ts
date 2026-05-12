#!/usr/bin/env tsx
// scripts/backfill-decay-weights.ts
//
// Phase 20-A-03 — backfill decay_weight on historical SentimentObservation rows
// under a NEW model_version. Per 20-Z-01 immutability convention, existing rows
// are NEVER updated — backfill INSERTS new rows under a fresh model_version.
//
// Usage:
//   npx tsx scripts/backfill-decay-weights.ts --new-model-version decay-tuned-2026-05-15-v1
//
// Post-condition (T-20-A-03-03):
//   count(rows with new_model_version) > 0
//   AND count(rows with old_model_version) unchanged before vs after

import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '.env.local' });

import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';

import { decayWeight } from '../src/lib/sentiment/decay';
import { DECAY_HYPERPARAMETERS } from '../src/lib/sentiment/decay-hyperparameters';
import { sourceToClassUnsafe } from '../src/lib/sentiment/source-class';
import {
  insertObservation,
  type SentimentObservationSource,
} from '../src/lib/sentiment/observation-store';

async function main() {
  const argv = process.argv.slice(2);
  const versionIdx = argv.indexOf('--new-model-version');
  if (versionIdx < 0) {
    console.error('[backfill-decay] --new-model-version required');
    process.exit(1);
  }
  const NEW_MODEL_VERSION = argv[versionIdx + 1];

  if (!process.env.DATABASE_URL) {
    console.error('[backfill-decay] DATABASE_URL not set — abort.');
    process.exit(1);
  }

  const adapter = new PrismaNeon({
    connectionString: process.env.DATABASE_URL,
  });
  const prisma = new PrismaClient({ adapter });

  // Pre-condition snapshot: per-old-model_version row counts
  const before = await prisma.sentimentObservation.groupBy({
    by: ['model_version'],
    _count: { _all: true },
  });
  const beforeMap = new Map(
    before.map((r) => [r.model_version, r._count._all]),
  );

  // Pull all existing rows EXCEPT those already at the new model_version
  const rows = await prisma.sentimentObservation.findMany({
    where: { model_version: { not: NEW_MODEL_VERSION } },
    orderBy: { fetched_at: 'asc' },
  });

  let inserted = 0;
  let skipped_dupes = 0;
  let skipped_unknown_source = 0;
  const now = new Date();
  for (const r of rows) {
    let cls;
    try {
      cls = sourceToClassUnsafe(r.source);
    } catch {
      skipped_unknown_source++;
      continue;
    }
    const lambda = DECAY_HYPERPARAMETERS[cls].lambda_per_day;
    const ageDays = Math.max(
      0,
      (now.getTime() - r.fetched_at.getTime()) / 86_400_000,
    );
    const w = decayWeight(ageDays, lambda);

    try {
      // raw_body is not retained (T-20-Z-01-02 — only hash). For backfill
      // we re-use the existing raw_body_hash via a sentinel; insertObservation
      // requires raw_body for hashing, so we pass the hash itself prefixed
      // — the DAO hashes again (idempotent at the row level since unique
      // constraint is on (ticker, message_id, model_version), NOT on hash).
      // This is a deliberate trade-off: we cannot rehydrate raw_body but
      // can preserve provenance via the original hash being stored as the
      // "raw_body" input. Document this as a known limitation in the
      // generated row's classifier_version.
      await insertObservation({
        ticker: r.ticker,
        source: r.source as SentimentObservationSource,
        message_id: r.message_id,
        raw_body: `BACKFILL-FROM-HASH:${r.raw_body_hash}`, // produces a different hash; documented limitation
        classifier_version: `${r.classifier_version}+decay-backfill`,
        classifier_score: r.classifier_score,
        model_version: NEW_MODEL_VERSION,
        decay_weight: w,
        author_id: r.author_id,
        author_features_snapshot:
          r.author_features_snapshot as Parameters<
            typeof insertObservation
          >[0]['author_features_snapshot'],
        fetched_at: r.fetched_at, // PRESERVE original PIT timestamp
        published_at: r.published_at,
      });
      inserted++;
    } catch (e) {
      if ((e as Error).name === 'SentimentObservationDuplicateError') {
        skipped_dupes++; // re-running backfill is idempotent
      } else {
        throw e;
      }
    }
  }

  // Post-condition assertion (T-20-A-03-03)
  const after = await prisma.sentimentObservation.groupBy({
    by: ['model_version'],
    _count: { _all: true },
  });
  const afterMap = new Map(after.map((r) => [r.model_version, r._count._all]));

  const newCount = afterMap.get(NEW_MODEL_VERSION) ?? 0;
  if (newCount === 0) {
    console.error(
      `[backfill-decay] FAIL: no rows written under model_version=${NEW_MODEL_VERSION}`,
    );
    process.exit(2);
  }
  for (const [v, oldCount] of beforeMap) {
    if (v === NEW_MODEL_VERSION) continue;
    const afterCount = afterMap.get(v) ?? 0;
    if (afterCount !== oldCount) {
      console.error(
        `[backfill-decay] FAIL: model_version=${v} row count changed (before=${oldCount}, after=${afterCount}) — immutability violation`,
      );
      process.exit(3);
    }
  }

  console.log(
    `[backfill-decay] OK: inserted=${inserted}, skipped_dupes=${skipped_dupes}, skipped_unknown_source=${skipped_unknown_source}, new_version_rows=${newCount}`,
  );
  await prisma.$disconnect();
  process.exit(0);
}

if (
  typeof require !== 'undefined' &&
  require.main === module &&
  !process.env.VITEST
) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
