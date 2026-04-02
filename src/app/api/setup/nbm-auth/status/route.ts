// src/app/api/setup/nbm-auth/status/route.ts
// GET /api/setup/nbm-auth/status — polls the container for NbLM cookie capture status.
// This is a dedicated sub-route so the frontend can poll /api/setup/nbm-auth/status
// without conflicting with POST /api/setup/nbm-auth.
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const containerUrl = process.env.CONTAINER_URL ?? null;
  if (!containerUrl) {
    return NextResponse.json({ captured: false, error: 'Container not configured' });
  }

  // Poll Daytona container for capture status
  try {
    const res = await fetch(`${containerUrl}/vnc-status`, {
      method: 'GET',
      headers: {
        'x-container-secret': process.env.CONTAINER_SECRET!,
      },
    });
    if (!res.ok) return NextResponse.json({ captured: false });
    const data = await res.json() as { captured?: boolean; encryptedState?: string };

    // If container reports captured + returns raw storage_state, encrypt and persist to Neon
    if (data.captured && data.encryptedState) {
      const { upsertCredential } = await import('@/lib/user-credential-db');
      const { encrypt } = await import('@/lib/credentials');
      await upsertCredential(session.user.email, encrypt(data.encryptedState));
      return NextResponse.json({ captured: true });
    }

    return NextResponse.json({ captured: data.captured ?? false });
  } catch {
    return NextResponse.json({ captured: false });
  }
}
