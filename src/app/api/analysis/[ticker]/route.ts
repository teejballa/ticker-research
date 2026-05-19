// src/app/api/analysis/[ticker]/route.ts
// POST /api/analysis/[ticker]
// Calls Gemini via AI SDK + Vercel AI Gateway, streams SSE events to browser.
// Auth: VERCEL_OIDC_TOKEN auto-read from process.env (local) or auto-injected by Vercel runtime (deployed).
// No Python subprocess, no container proxy, no DEPLOYMENT_MODE branching for analysis.
// SSE events: { type: 'progress', message: string }
//             { type: 'result', data: AnalysisResult }
//             { type: 'error', message: string }

import { NextRequest } from 'next/server';
import { readFile } from 'fs/promises';
import { resolve, join as pathJoin } from 'path';
import { realpathSync } from 'fs';
import { tmpdir } from 'os';
import { runGeminiAnalysis } from '@/lib/gemini-analysis';
import {
  lightweightCommunityScan,
  buildCommunityDataForLLM,
} from '@/lib/data/lightweight-community-scan';
import { cleanupSourcePackage } from '@/lib/temp-file';
import type { SourcePackage } from '@/lib/types';
import { computeSentimentDimensions, type SentimentDimensions } from '@/lib/sentiment-dimensions';
import YahooFinance from 'yahoo-finance2';

// Force dynamic evaluation so Vercel reads env vars at request time, not build time.
export const dynamic = 'force-dynamic';

// 5-minute timeout for the Vercel function — Gemini call may take 30-60s for long contexts.
export const maxDuration = 300;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const { filePath } = await request.json() as { filePath: string };

  // T-12-02-01: Validate filePath is within os.tmpdir() to prevent path traversal.
  // Canonicalize both paths via realpathSync to handle platform symlinks (e.g. macOS /tmp → /private/tmp).
  // When the target file does not yet exist, realpathSync the parent directory and append the basename.
  const resolvedPath = resolve(filePath);
  const { dirname, basename } = await import('path');
  let canonicalPath: string;
  const canonicalTmpdir = realpathSync(tmpdir());
  try {
    canonicalPath = realpathSync(resolvedPath);
  } catch {
    // File does not exist yet — canonicalize the parent directory instead
    try {
      canonicalPath = pathJoin(realpathSync(dirname(resolvedPath)), basename(resolvedPath));
    } catch {
      canonicalPath = resolvedPath;
    }
  }
  if (!canonicalPath.startsWith(canonicalTmpdir)) {
    return new Response(
      JSON.stringify({ type: 'error', message: 'Invalid file path.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // HI-03: Auth guard for web mode — must have an authenticated session before any file I/O.
  // AAPL is the public sample report and is exempt from the session requirement.
  if (process.env.NEXT_PUBLIC_DEPLOYMENT_MODE === 'web' && ticker.toUpperCase() !== 'AAPL') {
    const { getServerSession } = await import('next-auth/next');
    const { authOptions } = await import('@/lib/auth');
    const sess = await getServerSession(authOptions);
    if (!sess?.user?.email) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }
  }

  const encode = (data: string) =>
    new TextEncoder().encode(`data: ${data}\n\n`);

  let closed = false;
  let controller!: ReadableStreamDefaultController;

  const stream = new ReadableStream({
    start(ctrl) { controller = ctrl; },
  });

  const enqueue = (data: string) => {
    if (!closed) {
      try { controller.enqueue(encode(data)); } catch { /* closed */ }
    }
  };

  const close = () => {
    if (!closed) {
      closed = true;
      try { controller.close(); } catch { /* already closed */ }
    }
  };

  // Run pipeline asynchronously and stream SSE events to the client.
  (async () => {
    try {
      // Step 0: Load source package — emit 'creating' to trigger stepper step 0
      enqueue(JSON.stringify({ type: 'progress', message: 'Creating research context from source package...' }));
      const pkg: SourcePackage = JSON.parse(await readFile(canonicalPath, 'utf-8'));

      // Step 1: emit 'adding market' to trigger stepper step 1
      enqueue(JSON.stringify({ type: 'progress', message: 'Adding market data and fundamentals to context...' }));

      // Step 2: emit 'adding news' to trigger stepper step 2
      enqueue(JSON.stringify({ type: 'progress', message: 'Adding news sources and SEC filings...' }));

      // Step 3: Community sentiment scan (post-Phase-30.1: Reddit + Twitter via
      // Xpoz Pro + HackerNews Algolia, fanning out from
      // src/lib/data/lightweight-community-scan.ts). The third-party-scraper
      // path was removed in plan 30.1-05 Task 5 (D-26); the call site is kept
      // as a stub for back-compat — pkg.community_aggregated carries the data.
      enqueue(JSON.stringify({ type: 'progress', message: 'Querying community sentiment sources...' }));
      const scan = await lightweightCommunityScan(
        ticker,
        'report',
        pkg.company_name,
      ).catch((err: unknown) => {
        console.warn(
          '[analysis] lightweightCommunityScan failed:',
          err instanceof Error ? err.message : String(err),
        );
        return null;
      });
      const communityForLLM = buildCommunityDataForLLM(scan, ticker);

      // Step 4: Gemini call — emit 'querying sentiment' to trigger stepper step 3
      enqueue(JSON.stringify({ type: 'progress', message: 'Querying sentiment analysis via Gemini...' }));
      const result = await runGeminiAnalysis(ticker, pkg, communityForLLM);

      // Step 5: emit 'querying confidence' to trigger stepper step 4
      enqueue(JSON.stringify({ type: 'progress', message: 'Querying confidence and source attribution...' }));

      // Snapshot price + compute sentiment dimensions (non-fatal)
      let priceAtReport: number | undefined;
      let communityData: SentimentDimensions | undefined;
      try {
        const yf2 = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
        const quote = await yf2.quote(ticker);
        priceAtReport = typeof quote.regularMarketPrice === 'number' ? quote.regularMarketPrice : undefined;
        const si = result.sentiment_intelligence;
        communityData = computeSentimentDimensions(
          result.community_highlights ?? [],
          si?.stocktwits_bull_pct != null && si?.stocktwits_message_count != null
            ? { bull: si.stocktwits_bull_pct, bear: si.stocktwits_bear_pct ?? 0, messageCount: si.stocktwits_message_count }
            : null,
        );
      } catch {
        // non-fatal — report saves without sentiment dims
      }

      // Phase 16-04: capture the live technical snapshot at report time so the
      // panel can render dual-class agreement and price-followup outcomes can
      // attribute to the correct (technical) signal class. Non-fatal.
      let technicalAtReport: import('@/lib/types').TechnicalSnapshot | null = null;
      try {
        const { computeTechnicalSnapshot } = await import('@/lib/data/technical');
        technicalAtReport = await computeTechnicalSnapshot(ticker.toUpperCase());
      } catch (techErr) {
        console.error('[history] computeTechnicalSnapshot failed (non-fatal):', techErr);
      }

      // Persist report (non-fatal) — DEPLOYMENT_MODE=web distinction is for history only, not analysis
      if (process.env.DEPLOYMENT_MODE === 'web') {
        try {
          const { writeReportToDb } = await import('@/lib/reports-db');
          const { getServerSession } = await import('next-auth/next');
          const { authOptions } = await import('@/lib/auth');
          const sess = await getServerSession(authOptions);
          if (sess?.user?.email) {
            await writeReportToDb(result, sess.user.email, {
              price_at_report: priceAtReport,
              community_data: communityData,
              technical_at_report: technicalAtReport,
            });
          }
        } catch (writeErr) {
          console.error('[history] Web mode: Failed to write report to DB:', writeErr);
        }
      } else {
        try {
          const { writeReport } = await import('@/lib/reports');
          await writeReport(result);
        } catch (writeErr) {
          console.error('[history] Failed to write report:', writeErr);
        }
      }

      // Step 6: emit 'cleaning' to trigger stepper step 5
      enqueue(JSON.stringify({ type: 'progress', message: 'Cleaning up and finalizing report...' }));
      enqueue(JSON.stringify({ type: 'result', data: result }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Analysis failed';
      enqueue(JSON.stringify({ type: 'error', message: msg }));
    } finally {
      // LO-06: Clean up the source package temp file; non-fatal.
      try { await cleanupSourcePackage(canonicalPath); } catch { /* ignore cleanup errors */ }
      close();
    }
  })();

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
