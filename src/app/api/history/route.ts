// src/app/api/history/route.ts
// GET /api/history — returns all persisted reports, sorted newest first.
// DEPLOYMENT_MODE=web: reads from Neon (private per-user via NextAuth session).
// DEPLOYMENT_MODE=anything else: reads from local filesystem (existing behavior).
import { NextResponse } from 'next/server';
import { listReports } from '@/lib/reports';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  // Web mode: serve reports from Neon for the authenticated user only
  if (process.env.DEPLOYMENT_MODE === 'web') {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ reports: [] }, { status: 401 });
    }
    try {
      // Dynamic import avoids loading Prisma in local mode (no DATABASE_URL)
      const { listReportsFromDb } = await import('@/lib/reports-db');
      const reports = await listReportsFromDb(session.user.email);
      return NextResponse.json({ reports });
    } catch (err) {
      console.error('[api/history] Web mode: Failed to list reports from DB:', err);
      return NextResponse.json({ reports: [] });
    }
  }

  // Local mode: existing filesystem behavior — completely unchanged
  try {
    const reports = await listReports();
    return NextResponse.json({ reports });
  } catch (err) {
    console.error('[api/history] Failed to list reports:', err);
    return NextResponse.json({ reports: [] });
  }
}
