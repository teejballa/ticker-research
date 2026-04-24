// src/app/api/test/cleanup/route.ts
// Playwright e2e cleanup endpoint — deletes all test user rows from Neon.
// SECURITY: Double-gated: NODE_ENV !== 'production' AND TEST_CLEANUP_SECRET header.
// This route MUST NOT be callable in production.
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  // Gate 1: never run in production (Vercel sets NODE_ENV=production)
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // Gate 2: caller must supply the cleanup secret
  const secret = req.headers.get('x-test-cleanup-secret');
  if (!secret || secret !== process.env.TEST_CLEANUP_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Dynamic import — prevents Prisma from loading in local mode without DATABASE_URL
  const { prisma } = await import('@/lib/db');
  const result = await prisma.report.deleteMany({
    where: { user_id: 'e2e-test@cipher.test' },
  });

  return NextResponse.json({ deleted: true, count: result.count });
}
