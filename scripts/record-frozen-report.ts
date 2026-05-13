// scripts/record-frozen-report.ts
//
// Plan 20-D-01 Task 5 — Operator-only fixture recorder.
//
// Usage:
//   npm run record-frozen-report -- --ticker AAPL --pin-prompts latest
//   npm run record-frozen-report -- --all --pin-prompts latest
//   npm run record-frozen-report -- --ticker AAPL --dry-run
//
// Behavior:
//   1. Reads tests/golden-tickers/_sources/<ticker>.source.json.
//   2. Resolves prompt_versions via 20-Z-04's getPrompt() registry.
//   3. Calls runGeminiAnalysis(pkg) with temperature=0 (via FORCE_TEMPERATURE_ZERO=1).
//   4. Writes tests/golden-tickers/_reports/<ticker>.report.json + updates
//      tests/golden-tickers/_meta/recording-manifest.json.
//
// Exit codes:
//   0 — success
//   1 — fatal error (missing source, registry, API)
//
// CRITICAL: Operator-only. NEVER invoked in CI. The CI consumes the committed
// _reports/ + manifest.

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { listPrompts, getPrompt, type PromptId, type PromptVersion } from '@/lib/prompts/registry';

interface Args {
  ticker?: string;
  all: boolean;
  pinPrompts: 'latest' | string;  // 'latest' or 'pinned:id=v,...'
  out?: string;
  overwrite: boolean;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { all: false, pinPrompts: 'latest', overwrite: false, dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--ticker') a.ticker = argv[++i];
    else if (arg === '--all') a.all = true;
    else if (arg === '--pin-prompts') a.pinPrompts = argv[++i] as 'latest';
    else if (arg === '--out') a.out = argv[++i];
    else if (arg === '--overwrite') a.overwrite = true;
    else if (arg === '--dry-run') a.dryRun = true;
  }
  return a;
}

function sha256(buf: string | Buffer): string {
  return 'sha256-' + crypto.createHash('sha256').update(buf).digest('hex');
}

/** Resolve every (PromptId, PromptVersion) tuple per the --pin-prompts flag. */
function resolvePromptVersions(pinFlag: string): Record<string, string> {
  const ids = new Set<PromptId>(listPrompts().map(p => p.id));
  const out: Record<string, string> = {};

  if (pinFlag === 'latest') {
    for (const id of ids) {
      const p = getPrompt(id);
      out[id] = p.version;
    }
    return out;
  }

  // pinned:id=v,id=v,...
  if (pinFlag.startsWith('pinned:')) {
    const pairs = pinFlag.slice('pinned:'.length).split(',').filter(Boolean);
    for (const pair of pairs) {
      const [id, v] = pair.split('=');
      if (!id || !v) throw new Error(`Invalid --pin-prompts spec: '${pair}'`);
      // Resolve via getPrompt to verify it exists.
      const p = getPrompt(id as PromptId, v as PromptVersion);
      out[id] = p.version;
    }
    return out;
  }

  throw new Error(`Unknown --pin-prompts flag: '${pinFlag}'. Use 'latest' or 'pinned:id=v,...'`);
}

interface SourcePackageMinimal {
  ticker: string;
  security_type?: string;
}

async function runOne(ticker: string, args: Args): Promise<void> {
  const sym = ticker.toLowerCase();
  const srcPath = path.resolve(`tests/golden-tickers/_sources/${sym}.source.json`);
  if (!fs.existsSync(srcPath)) {
    throw new Error(`Source fixture missing: ${srcPath}. Run 'npm run debug:pipeline -- --ticker ${ticker}' first.`);
  }
  const srcRaw = fs.readFileSync(srcPath, 'utf8');
  const pkg = JSON.parse(srcRaw) as SourcePackageMinimal;

  const promptVersions = resolvePromptVersions(args.pinPrompts);

  const outPath = args.out
    ? path.resolve(args.out)
    : path.resolve(`tests/golden-tickers/_reports/${sym}.report.json`);

  if (fs.existsSync(outPath) && !args.overwrite && !args.dryRun) {
    throw new Error(`Report already exists: ${outPath}. Pass --overwrite to replace.`);
  }

  const callPlan = {
    ticker,
    source_path: srcPath,
    source_hash: sha256(srcRaw),
    out_path: outPath,
    prompt_versions: promptVersions,
    temperature: 0,
    gemini_model_revision: 'TO_BE_SET_BY_RUNTIME',
  };

  if (args.dryRun) {
    console.log('[dry-run] call plan:');
    console.log(JSON.stringify(callPlan, null, 2));
    return;
  }

  // --- Real Gemini call path ---
  // Operator must have GEMINI_API_KEY / AI_GATEWAY_API_KEY in .env.local.
  // We dynamically import runGeminiAnalysis so the recorder doesn't pull the
  // Anthropic/Gemini bundle on --dry-run.
  process.env.FORCE_TEMPERATURE_ZERO = '1';
  const { runGeminiAnalysis } = await import('@/lib/gemini-analysis');
  // @ts-expect-error — runtime SourcePackage shape per src/lib/types.ts
  const analysis = await runGeminiAnalysis(pkg);

  const header = {
    __recording: {
      recorded_at: new Date().toISOString(),
      prompt_versions: promptVersions,
      gemini_model_revision: process.env.GEMINI_MODEL ?? 'gemini-2.5-pro-preview',
      temperature: 0,
      source_hash: callPlan.source_hash,
    },
    ...analysis,
  };
  fs.writeFileSync(outPath, JSON.stringify(header, null, 2) + '\n');

  // Update manifest.
  const manifestPath = path.resolve('tests/golden-tickers/_meta/recording-manifest.json');
  const manifest = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    : {};
  manifest[sym] = {
    source_hash: callPlan.source_hash,
    prompt_versions: promptVersions,
    gemini_model_revision: header.__recording.gemini_model_revision,
    temperature: 0,
    recorded_at: header.__recording.recorded_at,
    recorded_by: 'operator-cli',
    security_type: pkg.security_type ?? 'equity',
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

  console.log(`[recorded] ${sym} → ${outPath}`);
}

async function main() {
  const args = parseArgs(process.argv);

  if (!args.ticker && !args.all) {
    console.error('Usage: record-frozen-report --ticker <SYM> [--pin-prompts latest] [--out <path>] [--overwrite] [--dry-run]');
    console.error('       record-frozen-report --all [--pin-prompts latest]');
    process.exit(1);
  }

  if (args.all) {
    const dir = path.resolve('tests/golden-tickers/_sources');
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.source.json'));
    for (const f of files) {
      const ticker = path.basename(f, '.source.json');
      try {
        await runOne(ticker, args);
      } catch (e) {
        console.error(`[fail] ${ticker}: ${(e as Error).message}`);
        process.exit(1);
      }
    }
    return;
  }

  if (args.ticker) {
    try {
      await runOne(args.ticker, args);
    } catch (e) {
      console.error(`[fail] ${args.ticker}: ${(e as Error).message}`);
      process.exit(1);
    }
  }
}

main().catch((e) => {
  console.error('[fatal]', e);
  process.exit(1);
});
