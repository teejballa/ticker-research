// src/app/api/history/[filename]/route.ts
// GET /api/history/[filename] — returns a single persisted report by filename (local mode)
// or by ID (web mode, scoped to the authenticated user).
// Local mode: reads from filesystem via readReport().
// Web mode (DEPLOYMENT_MODE=web): reads from Neon via readReportFromDb(), requires session.
import { NextRequest, NextResponse } from 'next/server';
import { readReport } from '@/lib/reports';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;

  // Web mode: look up by UUID from Neon, scoped to the authenticated user
  if (process.env.DEPLOYMENT_MODE === 'web') {
    const { getServerSession } = await import('next-auth/next');
    const { authOptions } = await import('@/lib/auth');
    const { readReportFromDb } = await import('@/lib/reports-db');

    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!filename) {
      return NextResponse.json({ error: 'Missing report id' }, { status: 400 });
    }

    try {
      const report = await readReportFromDb(filename, session.user.email);
      return NextResponse.json({ report });
    } catch {
      // readReportFromDb throws when not found or user_id mismatch — return 404
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }
  }

  // Local mode: filename is the JSON file name on disk
  // Security: only allow alphanumeric, hyphens, underscores, dots, plus — no path traversal
  // + appears in timezone-offset filenames (e.g. AAPL-2026-03-20T00-49-55...+00-00.json)
  if (!/^[A-Z0-9.+\-_]+\.json$/i.test(filename)) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
  }
  try {
    const report = await readReport(filename);
    return NextResponse.json(report);
  } catch {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  }
}
