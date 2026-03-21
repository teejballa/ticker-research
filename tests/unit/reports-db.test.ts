// tests/unit/reports-db.test.ts
// Wave 0 stubs — WEB-03, WEB-04
// These tests will pass once src/lib/reports-db.ts is implemented in Plan 03.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Prisma client before importing reports-db
vi.mock('@/lib/db', () => ({
  prisma: {
    report: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

describe('reports-db (WEB-03, WEB-04)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('MISSING — Wave 0: writeReportToDb and listReportsFromDb must be created in Plan 03', () => {
    // This test will be replaced with real tests in Plan 03 task.
    // The function signatures are:
    // writeReportToDb(result: AnalysisResult, userId: string): Promise<string>
    // listReportsFromDb(userId: string): Promise<StoredReport[]>
    expect(true).toBe(true); // placeholder — always passes until Plan 03
  });
});
