// src/app/api/setup/nbm-auth/route.ts
// POST /api/setup/nbm-auth — triggers VNC session on the container
// GET /api/setup/nbm-auth/status — polls container for NbLM cookie capture status
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';
// Cloud Run VNC start takes 7-60s (warm vs cold). Must exceed cold-start time.
export const maxDuration = 120;

async function getContainerUrl(): Promise<string | null> {
  return (process.env.CONTAINER_URL ?? '').trim() || null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await request.json() as { mode?: 'oauth' | 'vnc' };
  const mode = body.mode ?? 'vnc';

  // OAuth passthrough is not supported in cloud mode — fail fast so the
  // frontend falls through to the VNC flow without hitting the container.
  if (mode === 'oauth') {
    return NextResponse.json({ error: 'OAuth passthrough not supported' }, { status: 400 });
  }

  const containerUrl = await getContainerUrl();
  if (!containerUrl) {
    return NextResponse.json({ error: 'Container not configured' }, { status: 500 });
  }

  const containerSecret = (process.env.CONTAINER_SECRET ?? '').trim();
  if (!containerSecret) {
    return NextResponse.json({ error: 'Container secret not configured' }, { status: 500 });
  }

  // Start VNC session on the Cloud Run container
  const res = await fetch(`${containerUrl}/vnc-start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-container-secret': containerSecret,
    },
    body: JSON.stringify({ mode, userId: session.user.email }),
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: text }, { status: res.status });
  }

  await res.json(); // consume body (container returns {"started": true})

  const vncBaseUrl = (process.env.CONTAINER_VNC_URL ?? '').trim();
  if (!vncBaseUrl) {
    return NextResponse.json({ error: 'VNC stream URL not configured' }, { status: 500 });
  }

  // Append the container secret as a query param so the browser WebSocket can
  // authenticate. Browsers cannot send custom headers on WebSocket upgrades,
  // so the /vnc-ws endpoint accepts ?secret= as a fallback.
  const streamUrl = vncBaseUrl.includes('?')
    ? `${vncBaseUrl}&secret=${encodeURIComponent(containerSecret)}`
    : `${vncBaseUrl}?secret=${encodeURIComponent(containerSecret)}`;

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
