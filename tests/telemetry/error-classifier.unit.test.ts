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
    expect(['RATE_LIMITED', 'AUTH_FAILED', 'TIMEOUT', 'UPSTREAM_5XX', 'NETWORK', 'UNKNOWN']).toContain(cls);
    expect(cls).toBe('AUTH_FAILED');
    // The secret string is NOT part of the returned class.
    expect(cls).not.toMatch(/sk-ant/);
  });
});
