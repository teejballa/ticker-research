// src/lib/__tests__/formatters.test.ts
// TDD tests for formatters utility functions
// RED phase: tests written before implementation

import { describe, it, expect } from 'vitest';
import { formatTimestamp, formatMarketCap, formatPercent, formatPrice } from '../formatters';

describe('formatTimestamp', () => {
  it('formats ISO timestamp to readable date string', () => {
    const result = formatTimestamp('2026-03-13T14:32:00Z');
    expect(result).toBe('March 13, 2026 at 2:32 PM');
  });

  it('formats midnight correctly', () => {
    const result = formatTimestamp('2026-01-01T00:00:00Z');
    // Should contain January 1, 2026
    expect(result).toContain('January 1, 2026');
  });

  it('returns a non-empty string for valid ISO input', () => {
    const result = formatTimestamp('2025-06-15T09:45:00Z');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('formatMarketCap', () => {
  it('formats trillions with 1 decimal and T suffix', () => {
    expect(formatMarketCap(2_100_000_000_000)).toBe('$2.1T');
  });

  it('formats billions with 1 decimal and B suffix', () => {
    expect(formatMarketCap(450_000_000_000)).toBe('$450.0B');
  });

  it('formats millions with 1 decimal and M suffix', () => {
    expect(formatMarketCap(500_000_000)).toBe('$500.0M');
  });

  it('returns em dash for null', () => {
    expect(formatMarketCap(null)).toBe('—');
  });

  it('returns em dash for undefined', () => {
    expect(formatMarketCap(undefined as unknown as null)).toBe('—');
  });

  it('formats exactly 1 trillion with T suffix', () => {
    expect(formatMarketCap(1_000_000_000_000)).toBe('$1.0T');
  });

  it('formats exactly 1 billion with B suffix', () => {
    expect(formatMarketCap(1_000_000_000)).toBe('$1.0B');
  });

  it('formats exactly 1 million with M suffix', () => {
    expect(formatMarketCap(1_000_000)).toBe('$1.0M');
  });
});

describe('formatPercent', () => {
  it('formats positive decimal fraction with + sign and 2 decimal places', () => {
    expect(formatPercent(0.0234)).toBe('+2.34%');
  });

  it('formats negative decimal fraction with - sign and 2 decimal places', () => {
    expect(formatPercent(-0.012)).toBe('-1.20%');
  });

  it('returns em dash for null', () => {
    expect(formatPercent(null)).toBe('—');
  });

  it('formats zero with + sign', () => {
    expect(formatPercent(0)).toBe('+0.00%');
  });

  it('formats small positive percent correctly', () => {
    expect(formatPercent(0.001)).toBe('+0.10%');
  });
});

describe('formatPrice', () => {
  it('formats price with $ prefix and 2 decimal places', () => {
    expect(formatPrice(182.63)).toBe('$182.63');
  });

  it('returns em dash for null', () => {
    expect(formatPrice(null)).toBe('—');
  });

  it('formats integer price with .00', () => {
    expect(formatPrice(100)).toBe('$100.00');
  });

  it('formats price with single decimal as 2 decimals', () => {
    expect(formatPrice(45.5)).toBe('$45.50');
  });
});
