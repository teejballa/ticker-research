// src/app/api/setup/status/route.ts
// GET /api/setup/status
// Returns session-based setup status. The app runs entirely in Node.js after
// the Phase 12 pipeline rebuild — no external runtime checks needed.
// Returns userEmail for NavIdentity display.

import { NextResponse } from 'next/server';

// Required so the session is evaluated at request time, not during build
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  // Web mode: return authenticated user's email from NextAuth session
  if (process.env.DEPLOYMENT_MODE === 'web') {
    const { getServerSession } = await import('next-auth/next');
    const { authOptions } = await import('@/lib/auth');
    const session = await getServerSession(authOptions);
    return NextResponse.json({
      engineOk: true,
      authOk: !!session?.user?.email,
      allOk: !!session?.user?.email,
      userEmail: session?.user?.email ?? null,
    });
  }

  // Local mode: no external runtime required — always ready
  return NextResponse.json({
    engineOk: true,
    authOk: true,
    allOk: true,
    userEmail: null,
  });
}
