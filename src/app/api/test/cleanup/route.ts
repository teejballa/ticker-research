// src/app/api/test/cleanup/route.ts
// Playwright e2e test-support endpoints — seed and cleanup for the test user in Neon.
// SECURITY: Double-gated: NODE_ENV !== 'production' AND TEST_CLEANUP_SECRET header.
// These routes MUST NOT be callable in production.
import { NextRequest, NextResponse } from 'next/server';
import type { AnalysisResult } from '@/lib/types';

export const dynamic = 'force-dynamic';

function checkGates(req: NextRequest): NextResponse | null {
  // Gate 1: never run in production (Vercel sets NODE_ENV=production)
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  // Gate 2: caller must supply the cleanup secret
  const secret = req.headers.get('x-test-cleanup-secret');
  if (!secret || secret !== process.env.TEST_CLEANUP_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return null;
}

/**
 * POST /api/test/cleanup
 * Seeds a fixture AnalysisResult directly into Neon for the e2e test user.
 * Body: { analysis: AnalysisResult }
 * Returns: { id: string } — the UUID of the created report row.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const gate = checkGates(req);
  if (gate) return gate;

  const { analysis } = await req.json() as { analysis: AnalysisResult };
  const { writeReportToDb } = await import('@/lib/reports-db');
  const id = await writeReportToDb(analysis, 'e2e-test@cipher.test');
  return NextResponse.json({ seeded: true, id });
}

/**
 * DELETE /api/test/cleanup
 * Deletes all report rows for the e2e test user from Neon.
 */
export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const gate = checkGates(req);
  if (gate) return gate;

  // Dynamic import — prevents Prisma from loading in local mode without DATABASE_URL
  const { prisma } = await import('@/lib/db');
  const result = await prisma.report.deleteMany({
    where: { user_id: 'e2e-test@cipher.test' },
  });

  return NextResponse.json({ deleted: true, count: result.count });
}
