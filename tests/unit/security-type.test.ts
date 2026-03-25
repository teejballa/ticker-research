import { describe, it, expect, vi, beforeEach } from 'vitest';

// Wave 0 stub — tests WILL FAIL until src/lib/data/security-type.ts is fully implemented.
// Uses dynamic import to prevent parse-time crashes.
// Covers RQ-01 (SPAC detection), RQ-02 (ETF detection), RQ-03 (equity default).

describe('detectSecurityType', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns etf for quoteType ETF', async () => {
    const { detectSecurityType } = await import('@/lib/data/security-type');
    // Mock the Anthropic module to prevent real API calls in unit tests
    vi.mock('@anthropic-ai/sdk', () => ({
      default: vi.fn().mockImplementation(() => ({
        messages: { create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'no' }] }) },
      })),
    }));
    const result = await detectSecurityType('QQQ', 'ETF', 'Invesco QQQ Trust');
    expect(result).toBe('etf');
  });

  it('returns etf for quoteType MUTUALFUND', async () => {
    const { detectSecurityType } = await import('@/lib/data/security-type');
    const result = await detectSecurityType('VTSAX', 'MUTUALFUND', 'Vanguard Total Stock Market');
    expect(result).toBe('etf');
  });

  it('returns crypto for quoteType CRYPTOCURRENCY', async () => {
    const { detectSecurityType } = await import('@/lib/data/security-type');
    const result = await detectSecurityType('BTC-USD', 'CRYPTOCURRENCY', 'Bitcoin USD');
    expect(result).toBe('crypto');
  });

  it('returns spac for longName containing acquisition', async () => {
    const { detectSecurityType } = await import('@/lib/data/security-type');
    const result = await detectSecurityType('ETHM', 'EQUITY', 'Electra Meccanica Acquisition Corp');
    expect(result).toBe('spac');
  });

  it('returns spac for longName containing blank check', async () => {
    const { detectSecurityType } = await import('@/lib/data/security-type');
    const result = await detectSecurityType('BLNK', 'EQUITY', 'Blank Check Holdings Ltd');
    expect(result).toBe('spac');
  });

  it('returns adr for longName containing american depositary', async () => {
    const { detectSecurityType } = await import('@/lib/data/security-type');
    const result = await detectSecurityType('BABA', 'EQUITY', 'Alibaba Group Holding American Depositary Shares');
    expect(result).toBe('adr');
  });

  it('returns equity as default fallback for standard equity', async () => {
    vi.mock('@anthropic-ai/sdk', () => ({
      default: vi.fn().mockImplementation(() => ({
        messages: { create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'no' }] }) },
      })),
    }));
    const { detectSecurityType } = await import('@/lib/data/security-type');
    const result = await detectSecurityType('AAPL', 'EQUITY', 'Apple Inc.');
    expect(result).toBe('equity');
  });

  it('returns equity when all detection fails (non-fatal fallback)', async () => {
    vi.mock('@anthropic-ai/sdk', () => ({
      default: vi.fn().mockImplementation(() => ({
        messages: { create: vi.fn().mockRejectedValue(new Error('API error')) },
      })),
    }));
    const { detectSecurityType } = await import('@/lib/data/security-type');
    const result = await detectSecurityType('AAPL', 'EQUITY', 'Apple Inc.');
    expect(result).toBe('equity');
  });
});
