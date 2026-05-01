import { describe, it, expect } from 'vitest';
import { fetchEdgarForm4, fetchEdgar13F, lookupCik } from '@/lib/data/edgar';

describe('edgar stubs', () => {
  it('fetchEdgarForm4 returns null (stub)', async () => {
    const result = await fetchEdgarForm4('AAPL', 30);
    expect(result).toBeNull();
  });

  it('fetchEdgar13F returns null (stub)', async () => {
    const result = await fetchEdgar13F('AAPL');
    expect(result).toBeNull();
  });

  it('lookupCik returns null (stub)', async () => {
    const result = await lookupCik('AAPL');
    expect(result).toBeNull();
  });
});
