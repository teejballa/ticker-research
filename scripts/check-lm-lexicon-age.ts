#!/usr/bin/env node
// scripts/check-lm-lexicon-age.ts
//
// Plan 20-B-06 — T-20-B-06-01 mitigation.
//
// Notre Dame SRAF republishes the L&M Master Dictionary annually. Warn if the
// committed CSV mtime is > 365 days old so a refresh PR is opened before the
// pinned dictionary drifts from the published reference.
//
// Exit codes:
//   0 — fresh (mtime within MAX_AGE_DAYS)
//   1 — stale; refresh per data/lexicons/README.md procedure
//   2 — could not stat lexicon (file missing or unreadable)
//
// Run as a daily Vercel cron OR as a CI gate before deploy.

import { stat } from 'node:fs/promises';
import { join } from 'node:path';

const LEXICON_PATH = join(process.cwd(), 'data', 'lexicons', 'loughran-mcdonald.csv');
const MAX_AGE_DAYS = 365;

export async function checkLexiconAge(
  maxAgeDays = MAX_AGE_DAYS,
  lexiconPath = LEXICON_PATH,
): Promise<{ stale: boolean; ageDays: number }> {
  const stats = await stat(lexiconPath);
  const ageMs = Date.now() - stats.mtime.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return { stale: ageDays > maxAgeDays, ageDays };
}

// CLI entry — only runs when invoked directly via `tsx scripts/check-lm-lexicon-age.ts`.
const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] !== undefined &&
  import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  checkLexiconAge()
    .then(({ stale, ageDays }) => {
      if (stale) {
        console.error(
          `L&M lexicon is ${ageDays.toFixed(0)} days old (max ${MAX_AGE_DAYS}). Refresh per data/lexicons/README.md.`,
        );
        process.exit(1);
      } else {
        console.log(
          `L&M lexicon age: ${ageDays.toFixed(0)} days (within ${MAX_AGE_DAYS} threshold).`,
        );
        process.exit(0);
      }
    })
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Failed to stat lexicon: ${msg}`);
      process.exit(2);
    });
}
