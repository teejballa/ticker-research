/**
 * Plan 20-Z-03 — error-classifier unit tests.
 *
 * Covers the controlled enum mapping for every supported error shape +
 * T-20-Z-03-05 secret-leak prevention (the classifier returns ONLY the
 * controlled enum value; the raw error message — possibly containing
 * secrets — never appears in the return value).
 */
import { describe, it, expect } from 'vitest';
import { classifyError } from '@/lib/telemetry/error-classifier';
import { BreakerOpenError } from '@/lib/data/circuit-breaker';

describe('classifyError — controlled enum mapping', () => {
  it('401 → AUTH_FAILED', () => {
    expect(classifyError({ status: 401 })).toBe('AUTH_FAILED');
  });
  it('403 → AUTH_FAILED', () => {
    expect(classifyError({ status: 403 })).toBe('AUTH_FAILED');
  });
  it('408 → TIMEOUT', () => {
    expect(classifyError({ status: 408 })).toBe('TIMEOUT');
  });
  it('429 → RATE_LIMITED', () => {
    expect(classifyError({ status: 429 })).toBe('RATE_LIMITED');
  });
  it('500 → UPSTREAM_5XX', () => {
    expect(classifyError({ status: 500 })).toBe('UPSTREAM_5XX');
  });
  it('503 → UPSTREAM_5XX', () => {
    expect(classifyError({ status: 503 })).toBe('UPSTREAM_5XX');
  });
  it('AbortError → TIMEOUT', () => {
    expect(classifyError({ name: 'AbortError' })).toBe('TIMEOUT');
  });
  it('ECONNREFUSED → NETWORK', () => {
    expect(classifyError({ code: 'ECONNREFUSED' })).toBe('NETWORK');
  });
  it('undici cause.code ENOTFOUND → NETWORK', () => {
    expect(classifyError({ cause: { code: 'ENOTFOUND' } })).toBe('NETWORK');
  });
  it('unknown shape → UNKNOWN', () => {
    expect(classifyError(new Error('weird'))).toBe('UNKNOWN');
  });
  it('null → UNKNOWN', () => {
    expect(classifyError(null)).toBe('UNKNOWN');
  });
});

describe('classifyError — T-20-Z-03-05 secret-leak prevention', () => {
  it('error message containing API key still classifies cleanly without surfacing the secret in the return value', () => {
    const err = Object.assign(new Error('Auth failed: sk-ant-SECRET-DO-NOT-LEAK'), {
      status: 401,
    });
    const cls = classifyError(err);
    // Return value is one of the controlled enum values, period.
    expect([
      'RATE_LIMITED',
      'AUTH_FAILED',
      'TIMEOUT',
      'UPSTREAM_5XX',
      'NETWORK',
      'UNKNOWN',
      'BREAKER_OPEN',
    ]).toContain(cls);
    expect(cls).toBe('AUTH_FAILED');
    // The secret string is NOT part of the returned class.
    expect(cls).not.toMatch(/sk-ant/);
  });
});

describe('Phase 30 / D-08: BreakerOpenError → BREAKER_OPEN', () => {
  it('classifies BreakerOpenError as BREAKER_OPEN', () => {
    expect(classifyError(new BreakerOpenError('yahoo', 0))).toBe('BREAKER_OPEN');
  });

  it('classifies BreakerOpenError by TYPE, not by status/code (it has neither)', () => {
    const err = new BreakerOpenError('finnhub', Date.now());
    // No 'status' or 'code' fields — would otherwise fall through to 'UNKNOWN'.
    expect((err as unknown as { status?: number }).status).toBeUndefined();
    expect((err as unknown as { code?: string }).code).toBeUndefined();
    expect(classifyError(err)).toBe('BREAKER_OPEN');
  });

  it('preserves prior classifications: 401 → AUTH_FAILED', () => {
    expect(classifyError({ status: 401 })).toBe('AUTH_FAILED');
  });

  it('preserves prior classifications: 429 → RATE_LIMITED', () => {
    expect(classifyError({ status: 429 })).toBe('RATE_LIMITED');
  });

  it('preserves prior classifications: 408 → TIMEOUT', () => {
    expect(classifyError({ status: 408 })).toBe('TIMEOUT');
  });

  it('preserves prior classifications: 503 → UPSTREAM_5XX', () => {
    expect(classifyError({ status: 503 })).toBe('UPSTREAM_5XX');
  });

  it('preserves prior classifications: ECONNREFUSED → NETWORK', () => {
    expect(classifyError({ code: 'ECONNREFUSED' })).toBe('NETWORK');
  });

  it('preserves prior classifications: plain Error → UNKNOWN', () => {
    expect(classifyError(new Error('plain'))).toBe('UNKNOWN');
  });
});
