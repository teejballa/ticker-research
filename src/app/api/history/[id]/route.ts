// src/app/api/history/[id]/route.ts
// GET /api/history/[id] — fetch a single report by ID for the authenticated user.
// DEPLOYMENT_MODE=web only: reads from Neon, scoped to session.user.email.
// Local mode: returns 404 (no single-report endpoint exists in local mode).
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { readReportFromDb } from '@/lib/reports-db';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  // Local mode: this route does not exist — return 404
  if (process.env.DEPLOYMENT_MODE !== 'web') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Web mode: require authentication
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: 'Missing report id' }, { status: 400 });
  }

  try {
    const report = await readReportFromDb(id, session.user.email);
    return NextResponse.json({ report });
  } catch {
    // readReportFromDb throws when not found or user_id mismatch — return 404
    return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  }
}
