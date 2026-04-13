// src/app/api/setup/nbm-auth/route.ts
// POST /api/setup/nbm-auth — triggers VNC session OR performs OAuth token→cookie exchange
// GET /api/setup/nbm-auth/status — polls container for NbLM cookie capture status
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// ---------------------------------------------------------------------------
// Google OAuthLogin: exchange an access_token for browser session cookies.
// This runs on Vercel (not the GCP container) so it's not subject to Cloud
// Run IP blocks. Returns a Playwright storage_state JSON string, or null.
// ---------------------------------------------------------------------------

interface PlaywrightCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'Strict' | 'Lax' | 'None';
}

function parseSetCookie(raw: string, requestUrl: string): PlaywrightCookie | null {
  const parts = raw.split(';').map(p => p.trim());
  if (!parts[0]) return null;
  const eqIdx = parts[0].indexOf('=');
  if (eqIdx < 0) return null;
  const name = parts[0].slice(0, eqIdx).trim();
  const value = parts[0].slice(eqIdx + 1).trim();
  if (!name) return null;

  let domain = new URL(requestUrl).hostname;
  let path = '/';
  let expires = -1;
  let httpOnly = false;
  let secure = false;
  let sameSite: 'Strict' | 'Lax' | 'None' = 'Lax';

  for (const part of parts.slice(1)) {
    const lower = part.toLowerCase();
    if (lower === 'httponly') { httpOnly = true; continue; }
    if (lower === 'secure') { secure = true; continue; }
    const eqI = part.indexOf('=');
    if (eqI < 0) continue;
    const k = part.slice(0, eqI).trim().toLowerCase();
    const v = part.slice(eqI + 1).trim();
    if (k === 'domain') { domain = v.startsWith('.') ? v : `.${v}`; }
    else if (k === 'path') { path = v; }
    else if (k === 'expires') { const d = new Date(v); if (!isNaN(d.getTime())) expires = Math.floor(d.getTime() / 1000); }
    else if (k === 'max-age') { const n = parseInt(v, 10); if (!isNaN(n)) expires = Math.floor(Date.now() / 1000) + n; }
    else if (k === 'samesite') { sameSite = (v.charAt(0).toUpperCase() + v.slice(1).toLowerCase()) as 'Strict' | 'Lax' | 'None'; }
  }

  return { name, value, domain, path, expires, httpOnly, secure, sameSite };
}

async function exchangeTokenForStorageState(accessToken: string): Promise<string | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID ?? '';
  const cookies: PlaywrightCookie[] = [];

  let url = `https://accounts.google.com/accounts/OAuthLogin?source=cipher&issuedTo=${encodeURIComponent(clientId)}&token=${encodeURIComponent(accessToken)}`;

  let hops = 15;
  while (hops-- > 0) {
    let res: Response;
    try {
      res = await fetch(url, {
        redirect: 'manual',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });
    } catch {
      break;
    }

    // Collect Set-Cookie headers (Node 18+ fetch supports getSetCookie())
    let rawCookies: string[] = [];
    try {
      rawCookies = (res.headers as unknown as { getSetCookie(): string[] }).getSetCookie();
    } catch {
      const sc = res.headers.get('set-cookie');
      if (sc) rawCookies = [sc];
    }
    for (const raw of rawCookies) {
      const c = parseSetCookie(raw, url);
      if (c) cookies.push(c);
    }

    const status = res.status;
    if (status >= 300 && status < 400) {
      const location = res.headers.get('location');
      if (!location) break;
      url = location.startsWith('http') ? location : new URL(location, url).toString();
    } else {
      break;
    }
  }

  const AUTH_NAMES = new Set(['SID', 'SSID', 'HSID', 'APISID', 'SAPISID', '__Secure-1PSID', '__Secure-3PSID', '__Secure-1PAPISID', '__Secure-3PAPISID']);
  const hasAuth = cookies.some(c => AUTH_NAMES.has(c.name));
  if (!hasAuth) {
    console.warn('[nbm-auth oauth-exchange] no Google auth cookies received — got:', cookies.map(c => c.name));
    return null;
  }

  return JSON.stringify({ cookies, origins: [] });
}

// In-memory store of raw container encryptedState that was current at DELETE time.
// Used to reject stale captures: the container keeps its browser session and returns
// captured=true immediately with the OLD cookies. We only accept captured=true when
// the container's encryptedState differs from the stale one (= genuine fresh login).
const staleContainerTokens = new Map<string, string>();

async function getContainerUrl(): Promise<string | null> {
  return (process.env.CONTAINER_URL ?? '').trim() || null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await request.json() as { mode?: 'oauth' | 'oauth-exchange' | 'vnc' };
  const mode = body.mode ?? 'vnc';

  // OAuth passthrough is not supported in cloud mode — fail fast.
  if (mode === 'oauth') {
    return NextResponse.json({ error: 'OAuth passthrough not supported' }, { status: 400 });
  }

  // OAuth token→cookie exchange: uses the Google access_token already obtained
  // during Cipher login to silently get NotebookLM session cookies from Vercel's
  // servers (not the GCP container, so not subject to Cloud Run IP blocks).
  if (mode === 'oauth-exchange') {
    const accessToken = (session as unknown as { accessToken?: string }).accessToken;
    if (!accessToken) {
      return NextResponse.json({ error: 'No Google access token in session — please sign out and sign back in' }, { status: 400 });
    }
    const storageState = await exchangeTokenForStorageState(accessToken);
    if (!storageState) {
      return NextResponse.json({ error: 'Could not obtain Google session cookies — please try again' }, { status: 502 });
    }
    try {
      const { upsertCredential } = await import('@/lib/user-credential-db');
      const { encrypt } = await import('@/lib/credentials');
      await upsertCredential(session.user.email, encrypt(storageState));
    } catch (e) {
      console.error('[nbm-auth oauth-exchange] persist failed:', e);
      return NextResponse.json({ error: 'Failed to save credential' }, { status: 500 });
    }
    return NextResponse.json({ captured: true });
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

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const { getCredential, deleteCredential } = await import('@/lib/user-credential-db');
  // Read the current credential before deleting so we can remember the stale
  // container token and reject it if the container returns it again during reconnect.
  try {
    const existing = await getCredential(session.user.email);
    if (existing) {
      const { decrypt } = await import('@/lib/credentials');
      const rawContainerToken = decrypt(existing.encrypted_state);
      staleContainerTokens.set(session.user.email, rawContainerToken);
      console.log('[nbm-auth DELETE] stale token saved, length:', rawContainerToken.length, 'prefix:', rawContainerToken.slice(0, 30));
    } else {
      console.log('[nbm-auth DELETE] no existing credential found in DB');
    }
  } catch (e) {
    console.error('[nbm-auth DELETE] failed to read/decrypt old credential:', e);
  }
  await deleteCredential(session.user.email);
  console.log('[nbm-auth DELETE] credential deleted from DB');
  return NextResponse.json({ deleted: true });
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

  // Poll container for capture status
  try {
    const res = await fetch(`${containerUrl}/vnc-status`, {
      method: 'GET',
      headers: {
        'x-container-secret': process.env.CONTAINER_SECRET!,
      },
    });
    if (!res.ok) return NextResponse.json({ captured: false });
    const data = await res.json() as { captured?: boolean; encryptedState?: string };

    if (data.captured) {
      const staleToken = staleContainerTokens.get(session.user.email);
      console.log('[nbm-auth GET] captured=true from container');
      console.log('[nbm-auth GET] has staleToken in memory:', !!staleToken);
      console.log('[nbm-auth GET] container encryptedState present:', !!data.encryptedState);
      if (data.encryptedState) {
        console.log('[nbm-auth GET] container token prefix:', data.encryptedState.slice(0, 30));
      }
      if (staleToken) {
        console.log('[nbm-auth GET] stale token prefix:', staleToken.slice(0, 30));
        console.log('[nbm-auth GET] tokens match:', data.encryptedState === staleToken);
      }

      // Check if this is a stale capture from a previous session.
      if (staleToken && data.encryptedState && data.encryptedState === staleToken) {
        console.log('[nbm-auth GET] REJECTING stale captured=true');
        return NextResponse.json({ captured: false });
      }

      // Fresh capture (or no stale token on record) — persist and clear stale marker.
      staleContainerTokens.delete(session.user.email);
      if (data.encryptedState) {
        try {
          const { upsertCredential } = await import('@/lib/user-credential-db');
          const { encrypt } = await import('@/lib/credentials');
          await upsertCredential(session.user.email, encrypt(data.encryptedState));
        } catch (persistErr) {
          console.error('[nbm-auth] credential persist failed (non-fatal):', persistErr);
        }
      }
      return NextResponse.json({ captured: true });
    }

    return NextResponse.json({ captured: false });
  } catch {
    return NextResponse.json({ captured: false });
  }
}
