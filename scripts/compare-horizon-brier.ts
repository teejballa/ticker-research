// scripts/compare-horizon-brier.ts
// Phase 16-05 — AC4 gate: Brier(30d) ≤ Brier(7d) for ≥1 ACTIVE TechPattern
// (loose pass — surfacing 'no improvement' is acceptable, exit code 0 either
// way). Prints per-pattern lines plus a summary marker line:
//   AC4: PASS (<n> patterns improved)
//   AC4: NO_IMPROVEMENT (loose pass — surfacing the truth)

import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '.env.local' });

import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';

const HAS_DB = !!process.env.DATABASE_URL;

async function main() {
  if (!HAS_DB) {
    console.log('AC4: SKIP (no DATABASE_URL)');
    process.exit(0);
  }

  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  const cells = await prisma.learnedPattern.findMany({
    where: {
      signal_class: 'technical',
      status: 'ACTIVE',
      horizon_days: { in: [7, 30] },
    },
    orderBy: [{ pattern_key: 'asc' }, { horizon_days: 'asc' }],
  });

  // Group by pattern_key, take the sample-size-weighted mean of brier_in_sample
  // across cap_classes for each horizon. This collapses 3 cap_class cells into
  // one comparable Brier per (pattern_key, horizon) pair.
  const byPattern: Record<
    string,
    { '7'?: { brier: number; n: number }; '30'?: { brier: number; n: number } }
  > = {};

  for (const c of cells) {
    if (c.brier_in_sample == null) continue;
    const h = String(c.horizon_days) as '7' | '30';
    byPattern[c.pattern_key] ??= {};
    const prior = byPattern[c.pattern_key][h];
    if (!prior) {
      byPattern[c.pattern_key][h] = { brier: c.brier_in_sample, n: c.sample_size };
    } else {
      const totalN = prior.n + c.sample_size;
      const weighted =
        totalN > 0 ? (prior.brier * prior.n + c.brier_in_sample * c.sample_size) / totalN : prior.brier;
      byPattern[c.pattern_key][h] = { brier: weighted, n: totalN };
    }
  }

  let improved = 0;
  for (const [pk, b] of Object.entries(byPattern)) {
    if (b['7'] != null && b['30'] != null) {
      const flag = b['30'].brier <= b['7'].brier ? '✓' : '✗';
      console.log(
        `  ${flag} ${pk}: brier_7d=${b['7'].brier.toFixed(3)} brier_30d=${b['30'].brier.toFixed(3)}`,
      );
      if (b['30'].brier <= b['7'].brier) improved++;
    } else {
      console.log(
        `  · ${pk}: brier_7d=${b['7']?.brier.toFixed(3) ?? '—'} brier_30d=${b['30']?.brier.toFixed(3) ?? '—'} (incomplete)`,
      );
    }
  }

  if (improved > 0) {
    console.log(`AC4: PASS (${improved} pattern(s) improved at 30d vs 7d)`);
  } else {
    console.log('AC4: NO_IMPROVEMENT (loose pass — surfacing the truth)');
  }

  await prisma.$disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
