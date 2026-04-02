// src/app/api/setup/nbm-auth/route.ts
// POST /api/setup/nbm-auth — triggers VNC session or OAuth passthrough attempt on the container
// GET /api/setup/nbm-auth/status — polls container for NbLM cookie capture status
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

async function getContainerUrl(): Promise<string | null> {
  return process.env.CONTAINER_URL ?? null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const containerUrl = await getContainerUrl();
  if (!containerUrl) {
    return NextResponse.json({ error: 'Container not configured' }, { status: 500 });
  }

  const body = await request.json() as { mode?: 'oauth' | 'vnc' };
  const mode = body.mode ?? 'vnc';

  // Proxy to Daytona container VNC management endpoint
  const res = await fetch(`${containerUrl}/vnc-start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-container-secret': process.env.CONTAINER_SECRET!,
    },
    body: JSON.stringify({ mode, userId: session.user.email }),
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: text }, { status: res.status });
  }

  await res.json(); // consume body (container returns {"started": true})
  // The VNC WebSocket URL is pre-configured as an env var (set at sandbox creation time)
  const streamUrl = process.env.CONTAINER_VNC_URL;
  if (!streamUrl) {
    return NextResponse.json({ error: 'VNC stream URL not configured' }, { status: 500 });
  }
  return NextResponse.json({ streamUrl });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const containerUrl = await getContainerUrl();
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

    // If container reports captured + returns encryptedState, persist to Neon
    if (data.captured && data.encryptedState) {
      const { upsertCredential } = await import('@/lib/user-credential-db');
      const { encrypt } = await import('@/lib/credentials');
      // encryptedState from container is the raw storage_state.json content as string
      await upsertCredential(session.user.email, encrypt(data.encryptedState));
      return NextResponse.json({ captured: true });
    }

    return NextResponse.json({ captured: data.captured ?? false });
  } catch {
    return NextResponse.json({ captured: false });
  }
}
