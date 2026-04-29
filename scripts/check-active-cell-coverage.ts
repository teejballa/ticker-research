// scripts/check-active-cell-coverage.ts
// Phase 16-05 — AC3 gate: ≥25% of cells in the most-traded cap_class ×
// horizon_days=7 row are status='ACTIVE' for signal_class='technical'.
//
// Exits 0 when the gate passes, 1 when it fails. Prints a single
// machine-readable line: `AC3: <pct>% ACTIVE in cap_class=<top_cap> (<n>/8)`.

import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '.env.local' });

import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';

const HAS_DB = !!process.env.DATABASE_URL;
const TECH_PATTERN_COUNT = 8; // 8 TechPatterns per cap_class

async function main() {
  if (!HAS_DB) {
    console.log('AC3: SKIP (no DATABASE_URL)');
    process.exit(0);
  }

  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  // Find the cap_class with the largest cumulative sample_size at horizon=7 in
  // the technical signal class. Locked union: large_cap | mid_cap | small_cap.
  const sums = await prisma.learnedPattern.groupBy({
    by: ['cap_class'],
    where: { signal_class: 'technical', horizon_days: 7 },
    _sum: { sample_size: true },
  });
  sums.sort((a, b) => (b._sum.sample_size ?? 0) - (a._sum.sample_size ?? 0));
  const topCap = sums[0]?.cap_class ?? 'large_cap';

  const cells = await prisma.learnedPattern.findMany({
    where: {
      signal_class: 'technical',
      cap_class: topCap,
      horizon_days: 7,
    },
  });

  const active = cells.filter((c) => c.status === 'ACTIVE').length;
  const pct = (active / TECH_PATTERN_COUNT) * 100;
  console.log(`AC3: ${pct.toFixed(1)}% ACTIVE in cap_class=${topCap} (${active}/${TECH_PATTERN_COUNT})`);

  await prisma.$disconnect();
  process.exit(pct >= 25 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
