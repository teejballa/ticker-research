/**
 * Phase 30.1 Task 3 — One-shot Firecrawl alert resolver (D-26).
 *
 * Sets `ProviderHealthAlert.resolved_at = NOW()` for all open alerts where
 * `provider_id = 'firecrawl'`. Idempotent: safe to re-run; logs the row count
 * affected so the operator can confirm the table converged.
 *
 * After the next `/api/cron/provider-error-budget` sweep this would happen
 * automatically (because Firecrawl rows have stopped landing in
 * `ProviderCallLog`). This script forces it sooner so the D-28 done-gate
 * SQL probe returns clean.
 *
 * Usage: `npx tsx scripts/migrations/30.1-resolve-firecrawl-alert.ts`
 *
 * Exit codes:
 *   0  resolved row count >= 0 and no rows remain open
 *   1  unexpected error OR rows still open after update (something is wrong)
 */
import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '.env.local' });

import { prisma } from '@/lib/db';

const TARGET_PROVIDER_ID = 'firecrawl';

export async function resolveOpenAlerts(
  client: typeof prisma = prisma,
): Promise<{ before: number; resolved: number; after: number }> {
  const before = await client.providerHealthAlert.count({
    where: { provider_id: TARGET_PROVIDER_ID, resolved_at: null },
  });
  const result = await client.providerHealthAlert.updateMany({
    where: { provider_id: TARGET_PROVIDER_ID, resolved_at: null },
    data: { resolved_at: new Date() },
  });
  const after = await client.providerHealthAlert.count({
    where: { provider_id: TARGET_PROVIDER_ID, resolved_at: null },
  });
  return { before, resolved: result.count, after };
}

async function main(): Promise<void> {
  const { before, resolved, after } = await resolveOpenAlerts();
  console.log(
    `[30.1-resolve-firecrawl-alert] open before=${before}, resolved=${resolved}, open after=${after}`,
  );
  if (after !== 0) {
    console.error(
      `UNEXPECTED: ${after} open Firecrawl alerts remain after update — investigate.`,
    );
    process.exit(1);
  }
  process.exit(0);
}

const invokedDirectly =
  typeof process !== 'undefined' &&
  typeof process.argv[1] === 'string' &&
  (process.argv[1].endsWith('30.1-resolve-firecrawl-alert.ts') ||
    process.argv[1].endsWith('30.1-resolve-firecrawl-alert.js'));

if (invokedDirectly) {
  main().catch((e) => {
    console.error(
      '[30.1-resolve-firecrawl-alert] ERROR:',
      e instanceof Error ? e.stack : String(e),
    );
    process.exit(1);
  });
}
