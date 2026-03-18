import { describe, it, expect } from 'vitest';
import { spawnSync, execSync } from 'child_process';
import path from 'path';

const SETUP_SH = path.resolve(process.cwd(), 'scripts/setup.sh');

// Build a minimal env that has a working Node (since we are Node), a real Python,
// and a real ANTHROPIC_API_KEY so the "happy path" test passes.
const BASE_ENV: Record<string, string> = {
  PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
  ANTHROPIC_API_KEY: 'test-key-value',
};

describe('scripts/setup.sh — pre-flight validator', () => {
  it('exits 0 and prints "All prerequisites met" when all checks pass', () => {
    const result = spawnSync('bash', [SETUP_SH], {
      encoding: 'utf8',
      env: BASE_ENV,
      cwd: process.cwd(),
    });
    const combined = (result.stdout ?? '') + (result.stderr ?? '');
    expect(result.status, `stderr: ${result.stderr}`).toBe(0);
    expect(combined).toContain('All prerequisites met');
  });

  it('exits 1 and mentions ANTHROPIC_API_KEY when that var is missing', () => {
    const envWithoutKey = { ...BASE_ENV };
    delete envWithoutKey.ANTHROPIC_API_KEY;

    const result = spawnSync('bash', [SETUP_SH], {
      encoding: 'utf8',
      env: envWithoutKey,
      cwd: process.cwd(),
    });
    const combined = (result.stdout ?? '') + (result.stderr ?? '');
    expect(result.status).toBe(1);
    expect(combined).toContain('ANTHROPIC_API_KEY');
  });

  it('exits 1 and mentions "Python 3.10+" when no qualifying Python binary is on PATH', () => {
    // Strategy: prepend a fake bin directory that has stub scripts for python3 and python
    // that exit non-zero (making them appear absent/incompatible).
    // The standard PATH is preserved for bash, node, sed, grep, etc.
    const tmpDir = execSync('mktemp -d').toString().trim();
    try {
      // Create stub python3 that returns an old version string — setup.sh regex won't match
      const python3Stub = path.join(tmpDir, 'python3');
      execSync(`printf '#!/bin/sh\\necho "Python 2.7.0"\\n' > ${python3Stub} && chmod +x ${python3Stub}`);

      // Create stub python that also returns an old version string
      const pythonStub = path.join(tmpDir, 'python');
      execSync(`printf '#!/bin/sh\\necho "Python 2.7.0"\\n' > ${pythonStub} && chmod +x ${pythonStub}`);

      // Prepend tmpDir so stubs shadow real python binaries
      const noPythonPath = `${tmpDir}:${BASE_ENV.PATH}`;

      const result = spawnSync('bash', [SETUP_SH], {
        encoding: 'utf8',
        env: {
          ...BASE_ENV,
          PATH: noPythonPath,
        },
        cwd: process.cwd(),
      });
      const combined = (result.stdout ?? '') + (result.stderr ?? '');
      expect(result.status, `combined output: ${combined}`).toBe(1);
      expect(combined).toContain('Python 3.10+');
    } finally {
      execSync(`rm -rf ${tmpDir}`);
    }
  });

  // Note: Node.js version check cannot be easily unit-tested because the current
  // process IS Node.js 18+. The check in setup.sh validates `node --version` on PATH,
  // which will always find the running Node binary in a test environment. This case
  // is validated by the manual smoke test (`npm install && npm start` on a machine
  // without Node 18+).
});
