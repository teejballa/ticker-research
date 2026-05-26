import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';

const RUN = !!process.env.DATABASE_URL && process.env.RUN_LIVE_INTEGRATION === '1';
const d = RUN ? describe : describe.skip;

d('SentimentSnapshot.source round-trip (COVERAGE-09)', () => {
  let prisma: PrismaClient;
  const created: string[] = [];
  beforeAll(() => {
    prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) });
  });
  afterAll(async () => {
    if (created.length) await prisma.sentimentSnapshot.deleteMany({ where: { id: { in: created } } });
  });
  it('defaults to live when source omitted', async () => {
    const row = await prisma.sentimentSnapshot.create({
      data: { ticker: 'ZZTEST', scanned_at: new Date('2030-01-01'), price_at_scan: 1, community_data: {} },
    });
    created.push(row.id);
    expect(row.source).toBe('live');
  });
  it('accepts source=backfill', async () => {
    const row = await prisma.sentimentSnapshot.create({
      data: { ticker: 'ZZTEST', scanned_at: new Date('2030-01-02'), price_at_scan: 1, community_data: {}, source: 'backfill' },
    });
    created.push(row.id);
    expect(row.source).toBe('backfill');
  });
});
