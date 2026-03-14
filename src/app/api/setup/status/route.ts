// src/app/api/setup/status/route.ts
// GET /api/setup/status — checks Python 3.10+, notebooklm-py, and storage_state.json.
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { homedir } from 'os';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';

interface SetupStatus {
  pythonOk: boolean;
  pythonVersion?: string;
  pythonPath?: string;
  notebooklmOk: boolean;
  authOk: boolean;
  allOk: boolean;
}

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
  const notebooklmHome = process.env.NOTEBOOKLM_HOME ?? path.join(homedir(), '.notebooklm');
  const authFilePath = path.join(notebooklmHome, 'storage_state.json');
  return existsSync(authFilePath);
}

export async function GET(_request: NextRequest): Promise<NextResponse> {
  const pythonResult = checkPython();
  const notebooklmOk = pythonResult.ok ? checkNotebooklm() : false;
  const authOk = checkAuth();

  const status: SetupStatus = {
    pythonOk: pythonResult.ok,
    ...(pythonResult.version && { pythonVersion: pythonResult.version }),
    ...(pythonResult.path && { pythonPath: pythonResult.path }),
    notebooklmOk,
    authOk,
    allOk: pythonResult.ok && notebooklmOk && authOk,
  };

  return NextResponse.json(status);
}
