/**
 * Plan 20-D-02 — Weekly citation-coverage cron.
 *
 * Schedule: Sunday 09:00 UTC (`0 9 * * 0` in vercel.json). Invokes the same
 * runEvalCitationCoverage shim the operator CLI uses so behavior is identical.
 *
 * Auth: Bearer CRON_SECRET pattern reused from sentiment-scan / learn /
 * cost-budget-check. Returns 401 when the header does not match.
 *
 * Out: writes reports/citation-coverage-{YYYY-MM-DD}.{json,md}. The
 * /insights/citation-coverage page reads the newest matching file when it
 * lands (page implementation deferred — see SUMMARY.md follow-ups).
 *
 * No live LLM calls in the default cron path — RUN_LLM_CLAIM_EXTRACTION is
 * opt-in via env so the weekly cron stays free of Anthropic token spend.
 */
import { NextResponse } from 'next/server';
import { runEvalCitationCoverage } from '../../../../../scripts/eval-citation-coverage';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: Request) {
  const auth = request.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    const out = await runEvalCitationCoverage({
      ci: false,
      useLLM: process.env.RUN_LLM_CLAIM_EXTRACTION === 'true',
      outDir: 'reports',
    });
    return NextResponse.json({
      ok: true,
      exit_code: out.exitCode,
      ticker_count: Object.keys(out.perTicker).length,
      thresholds: out.thresholds,
      failure_count: out.failures.length,
    });
  } catch (e) {
    console.error('[cron:eval-citation-coverage] failed', e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
