// src/app/api/setup/__tests__/status.test.ts
// Wave 0 stubs for setup status API route.
// These tests fail at runtime (mocked exec / fs), not at parse time.
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock child_process to avoid real subprocess calls
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

// Mock fs to avoid real filesystem access
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
  },
  existsSync: vi.fn(),
}));

// Mock os to control homedir
vi.mock('os', () => ({
  default: {
    homedir: vi.fn().mockReturnValue('/mock/home'),
  },
  homedir: vi.fn().mockReturnValue('/mock/home'),
}));

describe('GET /api/setup/status', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('allOk is false when python is missing', async () => {
    const { execSync } = await import('child_process');
    const { existsSync } = await import('fs');

    (execSync as ReturnType<typeof vi.fn>).mockImplementation((cmd: string) => {
      if (cmd.includes('python')) throw new Error('python3: command not found');
      return '';
    });
    (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const { GET } = await import('@/app/api/setup/status/route');
    const request = new Request('http://localhost/api/setup/status');
    const response = await GET(request as unknown as import('next/server').NextRequest);
    const body = await response.json();

    expect(body.pythonOk).toBe(false);
    expect(body.allOk).toBe(false);
  });

  it('allOk is false when auth file is missing', async () => {
    const { execSync } = await import('child_process');
    const { existsSync } = await import('fs');

    (execSync as ReturnType<typeof vi.fn>).mockImplementation((cmd: string) => {
      if (cmd.includes('--version')) return 'Python 3.11.4';
      if (cmd.includes('import notebooklm')) return '0.3.4';
      return '';
    });
    (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false); // auth file missing

    const { GET } = await import('@/app/api/setup/status/route');
    const request = new Request('http://localhost/api/setup/status');
    const response = await GET(request as unknown as import('next/server').NextRequest);
    const body = await response.json();

    expect(body.authOk).toBe(false);
    expect(body.allOk).toBe(false);
  });

  it('allOk is true when all checks pass', async () => {
    const { execSync } = await import('child_process');
    const { existsSync } = await import('fs');

    (execSync as ReturnType<typeof vi.fn>).mockImplementation((cmd: string) => {
      if (cmd.includes('--version')) return 'Python 3.11.4';
      if (cmd.includes('import notebooklm')) return '0.3.4';
      return '';
    });
    (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true); // auth file exists

    const { GET } = await import('@/app/api/setup/status/route');
    const request = new Request('http://localhost/api/setup/status');
    const response = await GET(request as unknown as import('next/server').NextRequest);
    const body = await response.json();

    expect(body.pythonOk).toBe(true);
    expect(body.notebooklmOk).toBe(true);
    expect(body.authOk).toBe(true);
    expect(body.allOk).toBe(true);
  });
});
