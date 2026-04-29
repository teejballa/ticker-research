// One-shot: enrich old SentimentSnapshot.community_data with cap_class + market_cap.
// Snapshots from before the cap_class addition lack both fields. Fetches market_cap
// per unique ticker from Yahoo, classifies, and merges into community_data.
import { config } from 'dotenv';
config({ path: '.env.local' });
import YahooFinance from 'yahoo-finance2';
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { classifyCapClass } from '../src/lib/diffusion-trace';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) });
  const all = await prisma.sentimentSnapshot.findMany();
  const needs = all.filter(s => {
    const cd = s.community_data as any;
    return !cd?.cap_class || cd.cap_class === 'unknown';
  });
  console.log(`needs backfill: ${needs.length} of ${all.length}`);

  const tickers = [...new Set(needs.map(s => s.ticker))];
  const capByTicker: Record<string, { cap_class: string; market_cap: number }> = {};

  for (const t of tickers) {
    try {
      const q = await (yf as any).quoteSummary(t, { modules: ['summaryDetail', 'price'] });
      const mc = q?.summaryDetail?.marketCap ?? q?.price?.marketCap ?? null;
      if (mc != null) {
        const cap = classifyCapClass(mc);
        capByTicker[t] = { cap_class: cap, market_cap: mc };
        console.log(`  ${t}: ${cap} ($${(mc/1e9).toFixed(1)}B)`);
      } else {
        console.log(`  ${t}: no market_cap (likely ETF)`);
        capByTicker[t] = { cap_class: 'large_cap', market_cap: 0 }; // ETFs treated as large_cap
      }
      await new Promise(r => setTimeout(r, 200));
    } catch (e: any) {
      console.log(`  ${t}: error - ${e?.message}`);
    }
  }

  let updated = 0;
  for (const s of needs) {
    const enrich = capByTicker[s.ticker];
    if (!enrich) continue;
    const cd = (s.community_data ?? {}) as any;
    const merged = { ...cd, cap_class: enrich.cap_class, market_cap: enrich.market_cap };
    await prisma.sentimentSnapshot.update({
      where: { id: s.id },
      data: { community_data: merged },
    });
    updated++;
  }
  console.log(`updated ${updated} snapshots`);
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
