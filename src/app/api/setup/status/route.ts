// src/app/api/setup/status/route.ts
// GET /api/setup/status
// Returns session-based setup status. No Python/NotebookLM checks needed after Phase 12 —
// the app requires only Node.js. Returns userEmail for NavIdentity display.

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
      pythonOk: true,
      notebooklmOk: true,
      authOk: !!session?.user?.email,
      allOk: !!session?.user?.email,
      userEmail: session?.user?.email ?? null,
    });
  }

  // Local mode: no Python or NotebookLM required — always ready
  return NextResponse.json({
    pythonOk: true,
    notebooklmOk: true,
    authOk: true,
    allOk: true,
    userEmail: null,
  });
}
