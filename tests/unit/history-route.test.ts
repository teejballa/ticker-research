// tests/unit/history-route.test.ts
// Wave 0 stub — WEB-05: DEPLOYMENT_MODE=local falls through to filesystem in history route

import { describe, it, expect, vi } from 'vitest';

describe('history route DEPLOYMENT_MODE guard (WEB-05)', () => {
  it('MISSING — Wave 0: history route must check DEPLOYMENT_MODE before importing Prisma', () => {
    // Plan 03 will update src/app/api/history/route.ts to:
    // if (process.env.DEPLOYMENT_MODE === 'web') { return Neon path }
    // else { return existing filesystem path }
    // This guard ensures local users without DATABASE_URL are never affected.
    expect(true).toBe(true); // placeholder until Plan 03
  });
});
