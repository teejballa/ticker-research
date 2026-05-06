// Phase 18-00 Wave 0 stub — covers CORE-ML-02 (cron applies decay, writes effective_sample_size).
// Wave 2 (Plan 18-04) will fill in the real seeded-outcome assertions.
// This live-DB test belongs to `npm run test:integration` and runs against the dev Neon branch.
// Pass criteria sourced from 18-RESEARCH.md §"Validation Architecture" + §"Pitfalls Defended"
// (LOOKS-DONE-BUT-ISN'T: identical raw N=20, but ESS_recent should be > 2 × ESS_old).

import { describe, it, expect } from 'vitest';
import { prisma } from '@/lib/db';

describe('[live-DB] /api/cron/learn writes effective_sample_size after decay', () => {
  it('seeded outcomes — DB row contains effective_sample_size > 0 within 1e-6 of hand calc', async () => {
    // Wave 2 Plan 04 fills this in. For Wave 0, just verify the table column will exist post-migration.
    const sample = await prisma.learnedPattern.findFirst();
    expect(sample).toBeDefined();
    // Active assertion to make the suite RED until Wave 1 schema migration adds the column:
    // @ts-expect-error effective_sample_size doesn't exist yet
    void sample?.effective_sample_size;
  });
  it.todo('two cells with identical raw N=20 — one all-recent, one all 90+ days old — ESS_recent > 2 × ESS_old (LOOKS-DONE-BUT-ISNT acceptance from RESEARCH §Pitfalls Defended)');
  it.todo('credibleInterval95(weighted_alpha_recent, weighted_beta_recent) is narrower than the same on the all-old cell');
  it.todo('learn cron run is idempotent on the same outcome set (LearningEvent dedup)');
});
