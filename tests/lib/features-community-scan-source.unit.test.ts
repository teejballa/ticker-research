/**
 * Plan 30.1-01 — community_scan_source flag contract (D-25).
 *
 * COMMUNITY_SCAN_SOURCE is read at module load (fail-fast on garbage),
 * so each test that exercises a different env value MUST re-import the
 * module after stubbing the env. We use vi.resetModules() + dynamic import.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const ENV_VAR = 'FEATURE_COMMUNITY_SCAN_SOURCE';

describe('COMMUNITY_SCAN_SOURCE — Plan 30.1-01 flag contract (D-25)', () => {
  const originalEnv = process.env[ENV_VAR];

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env[ENV_VAR];
    } else {
      process.env[ENV_VAR] = originalEnv;
    }
  });

  it('defaults to "firecrawl" when env var unset (D-25 preserves production behavior)', async () => {
    delete process.env[ENV_VAR];
    const mod = await import('@/lib/features');
    expect(mod.COMMUNITY_SCAN_SOURCE).toBe('firecrawl');
  });

  it('defaults to "firecrawl" when env var set to empty string', async () => {
    process.env[ENV_VAR] = '';
    const mod = await import('@/lib/features');
    expect(mod.COMMUNITY_SCAN_SOURCE).toBe('firecrawl');
  });

  it('accepts "reddit" as a valid value (cutover path)', async () => {
    process.env[ENV_VAR] = 'reddit';
    const mod = await import('@/lib/features');
    expect(mod.COMMUNITY_SCAN_SOURCE).toBe('reddit');
  });

  it('accepts "shadow" as a valid value (golden-ticker validation path)', async () => {
    process.env[ENV_VAR] = 'shadow';
    const mod = await import('@/lib/features');
    expect(mod.COMMUNITY_SCAN_SOURCE).toBe('shadow');
  });

  it('throws fail-fast on any other value (T-30.1-01-01 mitigation)', async () => {
    process.env[ENV_VAR] = 'garbage';
    await expect(import('@/lib/features')).rejects.toThrow(
      /FEATURE_COMMUNITY_SCAN_SOURCE must be one of: firecrawl, reddit, shadow/,
    );
  });

  it('error message includes the offending value for operator debugging', async () => {
    process.env[ENV_VAR] = 'redit'; // common typo
    await expect(import('@/lib/features')).rejects.toThrow(/got: redit/);
  });
});
