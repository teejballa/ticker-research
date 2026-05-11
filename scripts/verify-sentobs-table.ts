// One-shot verification script for Plan 20-Z-01 Task 3.
// Confirms the SentimentObservation table, columns, and indexes are live in Neon.
import { config } from 'dotenv';
config({ path: '.env.local' });
import { prisma } from '@/lib/db';

async function main() {
  const cnt = await prisma.sentimentObservation.count();
  console.log(`ROW COUNT: ${cnt}`);

  const cols = await prisma.$queryRawUnsafe<Array<{ column_name: string; data_type: string; is_nullable: string }>>(
    `SELECT column_name::text AS column_name, data_type::text AS data_type, is_nullable::text AS is_nullable
     FROM information_schema.columns
     WHERE table_name='sentiment_observations'
     ORDER BY ordinal_position`,
  );
  console.log('\nCOLUMNS:');
  for (const r of cols) {
    console.log(`  ${r.column_name.padEnd(28)} ${r.data_type.padEnd(30)} NULL=${r.is_nullable}`);
  }

  const idx = await prisma.$queryRawUnsafe<Array<{ indexname: string }>>(
    `SELECT indexname::text AS indexname FROM pg_indexes WHERE tablename='sentiment_observations' ORDER BY indexname`,
  );
  console.log('\nINDEXES:');
  for (const r of idx) console.log(`  ${r.indexname}`);

  const nullF = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
    `SELECT COUNT(*)::bigint AS n FROM sentiment_observations WHERE fetched_at IS NULL`,
  );
  console.log(`\nNULL fetched_at rows: ${nullF[0].n}`);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
