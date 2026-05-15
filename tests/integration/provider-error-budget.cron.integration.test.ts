// Phase: 30 — Provider Health Hardening
// Phase 30 D-17 (with D-18 ProviderHealthAlert model dependency)
//
// RED-state scaffold for the new /api/cron/provider-error-budget cron route.
// Mirrors the cost-budget-check cron pattern verbatim:
//   - Bearer CRON_SECRET auth
//   - insufficient_history no-op when total_calls < 50 per provider over 24h
//   - For each provider_id: compute 24h error_rate
//     - error_rate > 0.10 → INSERT a row into provider_health_alerts
//     - existing unresolved alert + still over threshold → no duplicate INSERT
//     - existing unresolved alert + dropped below threshold → UPDATE resolved_at
//
// dominant_error_class is computed via Postgres MODE() WITHIN GROUP over the
// error_class column among status='error' rows. Verified Neon Postgres 15
// supports MODE() (R-5 in 30-RESEARCH.md).
//
// Runs under `npm run test:integration` against a live Neon connection. The
// `ProviderHealthAlert` Prisma model lands in Plan 30-02 (D-18 migration), so
// every reference to `prisma.providerHealthAlert` carries a forward-looking
// ts-expect-error annotation until then (real directive applied at the call
// site below). Removing those annotations is part of the Plan 30-02 verify step.

import { describe, it, beforeAll, afterAll } from 'vitest';

const TEST_PROVIDER = `test30P01_${Date.now()}`;

// Lazy prisma import — module-load must succeed even when DATABASE_URL is unset
// (the unit-test run via `npm test` does not set DATABASE_URL but vitest still
// transforms this file during discovery). Wave 2 fills in real test bodies that
// will lazy-load prisma the same way.
beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('Integration test requires DATABASE_URL');
  }
});

afterAll(async () => {
  if (!process.env.DATABASE_URL) return;
  const { prisma } = await import('@/lib/db');
  // Cleanup ProviderCallLog rows + ProviderHealthAlert rows. The Phase-30 D-18
  // migration applied the providerHealthAlert delegate to the Prisma client
  // (Plan 30-02 Task 4); the @ts-expect-error annotation that used to live
  // here was removed once the regenerated client exposed the model.
  await prisma.providerCallLog.deleteMany({ where: { provider_id: TEST_PROVIDER } });
  await prisma.providerHealthAlert.deleteMany({ where: { provider_id: TEST_PROVIDER } });
  await prisma.$disconnect();
});

describe('Phase 30 / D-17: provider-error-budget cron', () => {
  it.todo('D-17: rejects requests without Bearer CRON_SECRET with 401');
  it.todo('D-17: returns alerts:[] and does NOT insert when total_calls < 50 for every provider (insufficient_history)');
  it.todo('D-17: INSERTs a ProviderHealthAlert row when one provider has error_rate > 0.10 and total >= 50');
  it.todo('D-17: does NOT insert a duplicate when an unresolved alert for the same provider_id already exists');
  it.todo('D-17: UPDATEs resolved_at on existing alerts when error_rate drops below threshold');
  it.todo('D-17: writes dominant_error_class = MODE() over error_class column for that provider');
  it.todo('D-17: maxDuration is set to 60 (mirrors cost-budget-check), not 300');
});
