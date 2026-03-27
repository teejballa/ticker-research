// src/app/api/setup/status/route.ts
// GET /api/setup/status — checks Python 3.10+, notebooklm-py, and storage_state.json.
// In web mode (DEPLOYMENT_MODE=web), returns NextAuth session email instead of running local checks.
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { homedir } from 'os';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

// Required so the session is evaluated at request time, not during build
export const dynamic = 'force-dynamic';

interface SetupStatus {
  pythonOk: boolean;
  pythonVersion?: string;
  pythonPath?: string;
  notebooklmOk: boolean;
  authOk: boolean;
  allOk: boolean;
  userEmail: string | null;  // null = not connected or extraction failed
}

// Module-level cache — survives for the lifetime of the Next.js server process
let cachedEmail: string | null | undefined = undefined; // undefined = not yet fetched

function checkPython(): { ok: boolean; version?: string; path?: string } {
  const candidates = ['python3', 'python'];

  for (const cmd of candidates) {
    try {
      const output = execSync(`${cmd} --version`, { encoding: 'utf-8', timeout: 5000 }).trim();
      // Output: "Python 3.11.4"
      const match = output.match(/Python\s+(\d+)\.(\d+)(?:\.(\d+))?/i);
      if (match) {
        const major = parseInt(match[1], 10);
        const minor = parseInt(match[2], 10);
        const patch = match[3] ? parseInt(match[3], 10) : 0;
        if (major >= 3 && minor >= 10) {
          const version = `${major}.${minor}.${patch}`;
          let pythonPath: string | undefined;
          try {
            pythonPath = execSync(`which ${cmd}`, { encoding: 'utf-8', timeout: 3000 }).trim();
          } catch {
            // ignore
          }
          return { ok: true, version, path: pythonPath };
        }
      }
    } catch {
      // Try next candidate
    }
  }

  return { ok: false };
}

function checkNotebooklm(): boolean {
  const candidates = ['python3', 'python'];

  for (const cmd of candidates) {
    try {
      execSync(`${cmd} -c "import notebooklm; print(notebooklm.__version__)"`, {
        encoding: 'utf-8',
        timeout: 10000,
      });
      return true;
    } catch {
      // Try next candidate
    }
  }

  return false;
}

function checkAuth(): boolean {
  // Use `notebooklm auth check --json` for real session validation — catches
  // expired sessions that have a file but invalid/missing required cookies.
  try {
    const result = execSync('notebooklm auth check --json', {
      encoding: 'utf-8',
      timeout: 8000,
    });
    const data = JSON.parse(result);
    return data?.status === 'ok' || data?.checks?.cookies_present === true;
  } catch {
    // Fallback: plain file existence check (notebooklm CLI not in PATH, etc.)
    const notebooklmHome = process.env.NOTEBOOKLM_HOME ?? path.join(homedir(), '.notebooklm');
    return existsSync(path.join(notebooklmHome, 'storage_state.json'));
  }
}

function extractEmail(notebooklmHome: string): string | null {
  const scriptPath = path.join(process.cwd(), 'scripts', 'get_email.py');
  const pythonCandidates = ['python3', 'python'];
  for (const cmd of pythonCandidates) {
    try {
      const result = execSync(`${cmd} "${scriptPath}"`, {
        encoding: 'utf-8',
        timeout: 10000,
        env: { ...process.env, NOTEBOOKLM_HOME: notebooklmHome },
      }).trim();
      return result || null;
    } catch {
      // Try next candidate
    }
  }
  return null;
}

export async function GET(_request: NextRequest): Promise<NextResponse> {
  // Web mode: return session email, skip all local setup checks (irrelevant in web mode)
  if (process.env.DEPLOYMENT_MODE === 'web') {
    const session = await getServerSession(authOptions);
    let nbmSessionActive = false;
    if (session?.user?.email) {
      try {
        const { getCredential } = await import('@/lib/user-credential-db');
        const cred = await getCredential(session.user.email);
        nbmSessionActive = cred !== null;
      } catch {
        nbmSessionActive = false;
      }
    }
    return NextResponse.json({
      userEmail: session?.user?.email ?? null,
      pythonOk: true,
      notebooklmOk: true,
      authOk: !!session?.user?.email,
      allOk: !!session?.user?.email,
      nbmSessionActive,
    });
  }

  const pythonResult = checkPython();
  const notebooklmOk = pythonResult.ok ? checkNotebooklm() : false;
  const authOk = checkAuth();

  // Extract email once per process lifetime — Playwright startup takes 3-5s
  if (authOk && cachedEmail === undefined) {
    const notebooklmHome = process.env.NOTEBOOKLM_HOME ?? path.join(homedir(), '.notebooklm');
    cachedEmail = extractEmail(notebooklmHome);
  } else if (!authOk) {
    cachedEmail = undefined; // Reset cache if auth changes
  }

  const status: SetupStatus = {
    pythonOk: pythonResult.ok,
    ...(pythonResult.version && { pythonVersion: pythonResult.version }),
    ...(pythonResult.path && { pythonPath: pythonResult.path }),
    notebooklmOk,
    authOk,
    allOk: pythonResult.ok && notebooklmOk && authOk,
    userEmail: authOk ? (cachedEmail ?? null) : null,
  };

  return NextResponse.json(status);
}
