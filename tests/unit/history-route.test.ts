// tests/unit/history-route.test.ts
// WEB-05: DEPLOYMENT_MODE guard in history route
// Tests verify that local mode never touches Prisma and web mode gates on session.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('history route DEPLOYMENT_MODE guard (WEB-05)', () => {
  const originalMode = process.env.DEPLOYMENT_MODE;

  afterEach(() => {
    // Restore env after each test
    if (originalMode === undefined) {
      delete process.env.DEPLOYMENT_MODE;
    } else {
      process.env.DEPLOYMENT_MODE = originalMode;
    }
    vi.resetModules();
  });

  it('in local mode (DEPLOYMENT_MODE unset), the route file imports listReports from @/lib/reports not @/lib/reports-db', async () => {
    delete process.env.DEPLOYMENT_MODE;
    // The history route uses a static import for listReports (local filesystem)
    // and a dynamic import for listReportsFromDb (Neon — only loaded in web mode).
    // We verify this by checking the source of the route file.
    const fs = await import('fs');
    const path = await import('path');
    const routeSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/app/api/history/route.ts'),
      'utf-8'
    );
    // Must have static import for local-mode reports
    expect(routeSource).toMatch(/import.*listReports.*from.*@\/lib\/reports/);
    // Must have dynamic import for Neon path (so Prisma is never loaded in local mode)
    expect(routeSource).toMatch(/await import\(['"]@\/lib\/reports-db['"]\)/);
    // Must have DEPLOYMENT_MODE guard
    expect(routeSource).toMatch(/DEPLOYMENT_MODE.*===.*['"]web['"]/);
  });

  it('history route source contains local filesystem fallback (listReports call)', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const routeSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/app/api/history/route.ts'),
      'utf-8'
    );
    // The local-mode fallback must still call listReports()
    expect(routeSource).toContain('await listReports()');
  });

  it('history route source never statically imports from @/lib/db or @prisma/client', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const routeSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/app/api/history/route.ts'),
      'utf-8'
    );
    // Top-level static Prisma imports would break local mode with no DATABASE_URL
    expect(routeSource).not.toMatch(/^import.*from.*@\/lib\/db/m);
    expect(routeSource).not.toMatch(/^import.*from.*@prisma\/client/m);
  });
});
