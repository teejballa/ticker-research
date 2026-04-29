// Integration test — locks the Phase-16 schema migration's structural
// effects against future drift. Hits live DATABASE_URL.
//
// Asserts (against information_schema + pg_indexes):
//   - learned_patterns has signal_class, pattern_key, horizon_days
//   - learned_patterns no longer has flow_pattern
//   - composite unique index exists (named explicitly to fit NAMEDATALEN=63)
//   - sentiment_snapshots.technical_data is JSONB
//   - reports.technical_at_report is JSONB
//   - any pre-existing learned_patterns rows are backfilled to
//     signal_class='diffusion', horizon_days=7, non-null pattern_key
//   - learning_events received the parallel rename

import { describe, it, expect, afterAll } from 'vitest';
import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '.env.local' });
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';

const HAS_DB = !!process.env.DATABASE_URL;
const adapter = HAS_DB ? new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) : null;
const prisma = HAS_DB ? new PrismaClient({ adapter: adapter! }) : (null as unknown as PrismaClient);

afterAll(async () => {
  if (HAS_DB) await prisma.$disconnect();
});

// information_schema.column_name returns the Postgres `name` type, which
// the @prisma/adapter-neon driver cannot natively deserialise. Cast to text.
async function columnsOf(table: string): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
    `SELECT column_name::text AS column_name FROM information_schema.columns WHERE table_name = '${table}'`,
  );
  return rows.map((r) => r.column_name);
}

async function indexesOf(table: string): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<{ indexname: string }[]>(
    `SELECT indexname::text AS indexname FROM pg_indexes WHERE tablename = '${table}'`,
  );
  return rows.map((r) => r.indexname);
}

async function dataTypeOf(table: string, column: string): Promise<string | null> {
  const rows = await prisma.$queryRawUnsafe<{ data_type: string }[]>(
    `SELECT data_type::text AS data_type FROM information_schema.columns WHERE table_name = '${table}' AND column_name = '${column}'`,
  );
  return rows[0]?.data_type ?? null;
}

describe.skipIf(!HAS_DB)('Phase 16 schema migration', () => {
  it('learned_patterns has signal_class, pattern_key, horizon_days', async () => {
    const cols = await columnsOf('learned_patterns');
    expect(cols).toContain('signal_class');
    expect(cols).toContain('pattern_key');
    expect(cols).toContain('horizon_days');
  });

  it('learned_patterns no longer has flow_pattern', async () => {
    const cols = await columnsOf('learned_patterns');
    expect(cols).not.toContain('flow_pattern');
  });

  it('learned_patterns has the new composite unique index', async () => {
    // Index name explicitly shortened to fit Postgres NAMEDATALEN=63
    // (Prisma's default name "..._signal_class_pattern_key_cap_class_horizon_days_key"
    // is 67 chars and would silently truncate). See migration SQL + schema @@unique map:.
    const idx = await indexesOf('learned_patterns');
    expect(idx).toContain('learned_patterns_lookup_key');
  });

  it('sentiment_snapshots has technical_data jsonb', async () => {
    const cols = await columnsOf('sentiment_snapshots');
    expect(cols).toContain('technical_data');
    expect(await dataTypeOf('sentiment_snapshots', 'technical_data')).toBe('jsonb');
  });

  it('reports has technical_at_report jsonb', async () => {
    const cols = await columnsOf('reports');
    expect(cols).toContain('technical_at_report');
    expect(await dataTypeOf('reports', 'technical_at_report')).toBe('jsonb');
  });

  it('existing learned_patterns rows backfilled to diffusion / 7d / non-null pattern_key', async () => {
    const rows = await prisma.learnedPattern.findMany({ take: 50 });
    if (rows.length === 0) return; // empty-DB branches: backfill check is vacuous
    for (const r of rows) {
      expect(r.signal_class).toBe('diffusion');
      expect(r.horizon_days).toBe(7);
      expect(r.pattern_key).not.toBeNull();
      expect(typeof r.pattern_key).toBe('string');
    }
  });

  it('learning_events parallel rename applied', async () => {
    const cols = await columnsOf('learning_events');
    expect(cols).toContain('pattern_key');
    expect(cols).toContain('signal_class');
    expect(cols).toContain('horizon_days');
    expect(cols).not.toContain('flow_pattern');
  });
});
