// scripts/seed-research-reports.ts
//
// Terminal-only research-report seeder. Picks N diverse tickers across
// cap_class × sector, runs the full Cipher pipeline (collectAllData +
// scrapeCommunitySentiment + runGeminiAnalysis), persists each Report row
// to Neon via writeReportToDb. Used to bootstrap the learning surface
// with high-information, varied reports.
//
// Usage:
//   DATABASE_URL=... GOOGLE_GENERATIVE_AI_API_KEY=... \
//     npx tsx scripts/seed-research-reports.ts --count 10 --user-id seed
//
// Cost: each report runs Anthropic web-search (~$0.005), community scan
// (Reddit + Twitter via Xpoz Pro, ~$0.01), Gemini analysis (~$0.05 via AI
// Gateway). 10 reports ≈ $0.65; 20 reports ≈ $1.30.

import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '.env.vercel.prod' });

import { collectAllData } from '@/lib/data/source-package';
import { runGeminiAnalysis, scrapeCommunitySentiment, extractCommunityHighlights } from '@/lib/gemini-analysis';
import { writeReportToDb } from '@/lib/reports-db';
import { computeSentimentDimensions } from '@/lib/sentiment-dimensions';
import { ANCHORS, LARGE_BY_SECTOR, MID_BY_SECTOR, SMALL_BY_SECTOR } from '@/lib/data/ticker-watchlist';
import YahooFinance from 'yahoo-finance2';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

interface Args {
  count: number;
  userId: string;
  dryRun: boolean;
  tickers?: string[];
}

function parseArgs(argv: string[]): Args {
  const a: Args = { count: 10, userId: 'seed-bootstrap', dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--count') a.count = parseInt(argv[++i], 10);
    else if (k === '--user-id') a.userId = argv[++i];
    else if (k === '--dry-run') a.dryRun = true;
    else if (k === '--tickers') a.tickers = argv[++i].split(',').map((s) => s.trim().toUpperCase());
  }
  return a;
}

/**
 * Pick a maximally-diverse slice — one ticker per (cap × sector) cell
 * up to `count`, then fall through to anchors.
 */
function pickDiverse(count: number): string[] {
  const picks: string[] = [];
  const seen = new Set<string>();
  const push = (t: string) => {
    if (!seen.has(t) && picks.length < count) {
      seen.add(t);
      picks.push(t);
    }
  };

  // Round-robin: small × sector → mid × sector → large × sector → anchors.
  // Small first because small-cap sentiment regimes have the highest learning
  // variance (this is the GME-100% fix surface).
  const buckets = [SMALL_BY_SECTOR, MID_BY_SECTOR, LARGE_BY_SECTOR];
  for (let pass = 0; pass < 3 && picks.length < count; pass++) {
    for (const pool of buckets) {
      for (const sectorPool of pool) {
        const t = sectorPool.tickers[pass % sectorPool.tickers.length];
        if (t) push(t);
        if (picks.length >= count) break;
      }
      if (picks.length >= count) break;
    }
  }
  for (const a of ANCHORS) push(a);
  return picks.slice(0, count);
}

async function runOne(ticker: string, userId: string, dryRun: boolean): Promise<{
  ticker: string;
  ok: boolean;
  reportId?: string;
  errorMessage?: string;
  durationMs: number;
}> {
  const t0 = Date.now();
  try {
    let companyName = ticker;
    let exchange: string | null = null;
    try {
      const quote = await yf.quote(ticker);
      companyName = (quote.longName || quote.shortName || ticker) as string;
      exchange = (quote.fullExchangeName || null) as string | null;
    } catch {
      // ignore — fall back to ticker as name
    }

    process.stdout.write(`[${ticker}] collectAllData... `);
    const pkg = await collectAllData(ticker, companyName, exchange);
    process.stdout.write(`OK\n[${ticker}] scrapeCommunitySentiment... `);

    const community = await scrapeCommunitySentiment(ticker, companyName);
    const highlights = await extractCommunityHighlights(
      community.pinnedContent,
      community.nicheContent,
      community.nicheUrls,
    );
    process.stdout.write(`OK\n[${ticker}] runGeminiAnalysis... `);

    const communityArg = {
      pinnedContent: community.pinnedContent,
      nicheContent: community.nicheContent,
      nicheUrls: community.nicheUrls,
      pageCount: community.pageCount,
      highlights,
    };

    const result = await runGeminiAnalysis(ticker, pkg, communityArg);
    process.stdout.write(`OK\n`);

    const priceAtReport = pkg.market_data?.price ?? null;
    const stBullRaw = pkg.sentiment_intelligence?.stocktwits_bull_pct ?? null;
    const stMsgCount = pkg.sentiment_intelligence?.stocktwits_message_count ?? null;
    const stocktwits =
      stBullRaw != null && stMsgCount != null
        ? { bull: stBullRaw / 100, bear: 1 - stBullRaw / 100, messageCount: stMsgCount }
        : null;
    const community_data = computeSentimentDimensions(highlights, stocktwits);

    if (dryRun) {
      console.log(`[${ticker}] DRY-RUN — sentiment=${result.market_sentiment} confidence=${result.confidence_level}`);
      return { ticker, ok: true, durationMs: Date.now() - t0 };
    }

    const reportId = await writeReportToDb(result, userId, {
      price_at_report: typeof priceAtReport === 'number' ? priceAtReport : undefined,
      community_data,
    });
    console.log(`[${ticker}] PERSISTED report_id=${reportId} sentiment=${result.market_sentiment} confidence=${result.confidence_level}`);
    return { ticker, ok: true, reportId, durationMs: Date.now() - t0 };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[${ticker}] FAILED: ${msg}`);
    return { ticker, ok: false, errorMessage: msg, durationMs: Date.now() - t0 };
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const tickers = args.tickers && args.tickers.length > 0 ? args.tickers : pickDiverse(args.count);

  console.log(`seed-research-reports: count=${tickers.length} userId=${args.userId} dryRun=${args.dryRun}`);
  console.log(`tickers: ${tickers.join(', ')}\n`);

  const results: Awaited<ReturnType<typeof runOne>>[] = [];
  for (const t of tickers) {
    const r = await runOne(t, args.userId, args.dryRun);
    results.push(r);
  }

  const ok = results.filter((r) => r.ok).length;
  const fail = results.length - ok;
  const totalMs = results.reduce((a, b) => a + b.durationMs, 0);
  console.log(`\n=== seed-research-reports done — ok=${ok} fail=${fail} total=${(totalMs / 1000).toFixed(1)}s ===`);
  for (const r of results.filter((r) => !r.ok)) {
    console.log(`  fail: ${r.ticker} — ${r.errorMessage}`);
  }
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
