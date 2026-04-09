#!/usr/bin/env node
/**
 * live-debug.mjs
 *
 * Standalone Playwright debug runner — NOT a test file.
 * Runs a headed browser with comprehensive real-time event capture.
 * ALL events stream to stdout as JSON lines so they're visible in Bash.
 * Screenshots are saved to .playwright-mcp/ for visual confirmation.
 *
 * Usage:
 *   node scripts/live-debug.mjs [flow] [options]
 *
 * Flows:
 *   setup-status        — hit /api/setup/status and dump result
 *   notebooklm-auth     — walk through NotebookLM auth setup wizard
 *   signin              — walk through the Google OAuth sign-in page
 *   full-pipeline TICKER — run the full research pipeline (slow)
 *   url URL             — open any URL and dump all captured events
 *
 * Options:
 *   --headless          — run without visible browser (default: headed)
 *   --slow N            — slow motion delay in ms (default: 400)
 *   --base URL          — base URL (default: http://localhost:3000)
 *   --stay N            — keep browser open N seconds after flow (default: 15)
 *   --record            — take a screenshot every 500ms throughout session (visual flipbook)
 *   --record-fps N      — screenshot frequency in ms (default: 500)
 *
 * Examples:
 *   node scripts/live-debug.mjs setup-status
 *   node scripts/live-debug.mjs notebooklm-auth
 *   node scripts/live-debug.mjs signin
 *   node scripts/live-debug.mjs url http://localhost:3000/terminal
 *   node scripts/live-debug.mjs full-pipeline AAPL --slow 200
 */

import { chromium } from '@playwright/test';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync, execSync } from 'child_process';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const SCREENSHOT_DIR = resolve(__dirname, '../.playwright-mcp');
const MONITOR_SCRIPT = resolve(__dirname, 'browser-monitor.js');

// ── CLI args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const FLOW = args[0] || 'setup-status';
const HEADLESS = args.includes('--headless');
const SLOW_IDX = args.indexOf('--slow');
const SLOW = SLOW_IDX !== -1 ? parseInt(args[SLOW_IDX + 1], 10) : 400;
const BASE_IDX = args.indexOf('--base');
const BASE = BASE_IDX !== -1 ? args[BASE_IDX + 1] : (process.env.BASE_URL || 'http://localhost:3000');
const STAY_IDX = args.indexOf('--stay');
const STAY_SEC = STAY_IDX !== -1 ? parseInt(args[STAY_IDX + 1], 10) : 15;
const RECORD = args.includes('--record');
const FPS_IDX = args.indexOf('--record-fps');
const RECORD_MS = FPS_IDX !== -1 ? parseInt(args[FPS_IDX + 1], 10) : 500;

// ── Output helpers ────────────────────────────────────────────────────────────
let _seq = 0;

function emit(type, data = {}) {
  _seq++;
  const entry = { seq: _seq, ts: new Date().toISOString(), type, ...data };
  process.stdout.write(JSON.stringify(entry) + '\n');
  return entry;
}

function ok(msg, data = {}) { emit('OK', { msg, ...data }); }
function info(msg, data = {}) { emit('INFO', { msg, ...data }); }
function warn(msg, data = {}) { emit('WARN', { msg, ...data }); }
function fail(msg, data = {}) { emit('FAIL', { msg, ...data }); }
function sep(label) { emit('---', { label }); }

// ── Screenshot helper ─────────────────────────────────────────────────────────
let _snapCount = 0;
async function snap(page, label) {
  _snapCount++;
  const filename = `live-${String(_snapCount).padStart(2, '0')}-${label}.png`;
  const filepath = join(SCREENSHOT_DIR, filename);
  await page.screenshot({ path: filepath, fullPage: false });
  emit('SCREENSHOT', { file: filepath, label });
  return filepath;
}

// ── Monitor data helper ───────────────────────────────────────────────────────
async function dumpMonitor(page, label = 'monitor-dump') {
  try {
    const data = await page.evaluate(() => window.__monitor);
    if (!data) { warn('__monitor not available on this page'); return null; }

    sep(label);

    // Console messages
    const errs = data.console.filter(c => c.level === 'error' || c.level === 'warn');
    if (errs.length) {
      emit('CONSOLE_ERRORS', { count: errs.length, entries: errs });
    } else {
      info('No console errors', { totalConsoleEntries: data.console.length });
    }

    // Network errors
    const netErrors = data.network.filter(n => n.error || (n.status && n.status >= 400));
    if (netErrors.length) {
      emit('NETWORK_ERRORS', { count: netErrors.length, entries: netErrors });
    }

    // API calls
    const apiCalls = data.network.filter(n => n.url && n.url.includes('/api/'));
    if (apiCalls.length) {
      emit('API_CALLS', { count: apiCalls.length, entries: apiCalls });
    }

    // SSE streams
    const sseStreams = data.network.filter(n => n.type === 'SSE');
    if (sseStreams.length) {
      emit('SSE_STREAMS', { count: sseStreams.length, entries: sseStreams });
    }

    // JS errors
    if (data.errors.length) {
      emit('JS_ERRORS', { count: data.errors.length, entries: data.errors });
    }

    return data;
  } catch (err) {
    warn('dumpMonitor failed', { error: err.message });
    return null;
  }
}

// ── Page setup ────────────────────────────────────────────────────────────────
async function setupPage(page) {
  // Inject monitor script
  if (existsSync(MONITOR_SCRIPT)) {
    const monitorCode = readFileSync(MONITOR_SCRIPT, 'utf8');
    await page.addInitScript(monitorCode);
  }

  // Stream console to stdout
  page.on('console', msg => {
    emit('CONSOLE', { level: msg.type(), text: msg.text() });
  });

  // Stream page errors
  page.on('pageerror', err => {
    emit('PAGE_ERROR', { message: err.message, stack: err.stack?.slice(0, 800) });
  });

  // Stream failed requests
  page.on('requestfailed', req => {
    emit('REQUEST_FAILED', {
      method: req.method(),
      url: req.url(),
      reason: req.failure()?.errorText,
    });
  });

  // Stream API and error responses (not every asset)
  page.on('response', async res => {
    const url = res.url();
    const status = res.status();
    const isApi = url.includes('/api/');
    const isError = status >= 400;
    const isStream = res.headers()['content-type']?.includes('text/event-stream');

    if (isApi || isError || isStream) {
      let body = '';
      try {
        body = await res.text();
        if (body.length > 2000) body = body.slice(0, 2000) + '…[truncated]';
      } catch (_) {}

      emit('RESPONSE', { method: res.request().method(), url, status, body });
    }
  });

  // Page navigation events
  page.on('load', () => emit('PAGE_LOAD', { url: page.url() }));
  page.on('domcontentloaded', () => emit('DOM_READY', { url: page.url() }));
}

// ── Flows ─────────────────────────────────────────────────────────────────────

async function flowSetupStatus(page) {
  sep('FLOW: setup-status');
  await page.goto(BASE);
  await snap(page, 'home');
  await page.waitForTimeout(2000);

  info('Fetching /api/setup/status...');
  const result = await page.evaluate(async () => {
    const r = await fetch('/api/setup/status');
    return { status: r.status, body: await r.text() };
  });

  let parsed = null;
  try { parsed = JSON.parse(result.body); } catch (_) {}
  emit('SETUP_STATUS', { httpStatus: result.status, raw: result.body, parsed });

  if (parsed?.allOk) {
    ok('Setup is complete — all checks pass', parsed);
  } else {
    fail('Setup incomplete', parsed || { raw: result.body });
  }

  await dumpMonitor(page, 'after-setup-status');
  await snap(page, 'setup-status-done');
}

async function flowNotebooklmAuth(page) {
  sep('FLOW: notebooklm-auth');
  info('Navigating to home...');
  await page.goto(BASE);
  await page.waitForLoadState('networkidle');
  await snap(page, 'home');
  await page.waitForTimeout(1500);

  // Check setup status first
  info('Checking setup status...');
  const statusRes = await page.evaluate(async () => {
    const r = await fetch('/api/setup/status');
    return { status: r.status, body: await r.text() };
  });
  let status = null;
  try { status = JSON.parse(statusRes.body); } catch (_) {}
  emit('SETUP_STATUS_CHECK', { parsed: status });

  if (status?.authOk) {
    ok('NotebookLM auth already configured (authOk=true)');
    await snap(page, 'already-authed');
    return;
  }

  // Scroll to find the SetupWizard or the ticker search area
  info('Scrolling to trigger setup wizard...');
  await page.evaluate(() => window.scrollTo(0, window.innerHeight * 2.55));
  await page.waitForTimeout(1000);
  await snap(page, 'scrolled-to-terminal');

  // Look for setup wizard components
  const setupWizard = page.locator('[class*="setup"], [data-testid*="setup"], text=/setup|wizard|install|connect/i').first();
  const setupVisible = await setupWizard.isVisible().catch(() => false);
  emit('SETUP_WIZARD_VISIBLE', { visible: setupVisible });

  if (!setupVisible) {
    warn('Setup wizard not visible — maybe setup is complete or wizard UI changed');
    await snap(page, 'no-wizard');
    await dumpMonitor(page, 'after-no-wizard');
    return;
  }

  await snap(page, 'setup-wizard');

  // Look for the auth/connect button
  const connectBtn = page.locator('button').filter({ hasText: /connect|authenticate|login|google|notebooklm/i }).first();
  const connectVisible = await connectBtn.isVisible().catch(() => false);
  emit('CONNECT_BUTTON', { visible: connectVisible });

  if (connectVisible) {
    info('Found connect button — clicking...');
    await connectBtn.click();
    await page.waitForTimeout(3000);
    await snap(page, 'after-connect-click');

    // Check if a new window/browser opened for auth
    const pages = page.context().pages();
    emit('PAGES_AFTER_CLICK', { count: pages.length, urls: pages.map(p => p.url()) });

    // Check for any progress/error messages
    await dumpMonitor(page, 'after-connect-click');
  } else {
    warn('Connect button not found — checking auth API directly');
    const authRes = await page.evaluate(async () => {
      const r = await fetch('/api/setup/auth', { method: 'POST' });
      return { status: r.status, body: await r.text() };
    });
    emit('AUTH_API_DIRECT', authRes);
  }

  await snap(page, 'auth-flow-done');
}

async function flowSignin(page) {
  sep('FLOW: signin');
  await page.goto(`${BASE}/auth/signin`);
  await page.waitForLoadState('networkidle');
  await snap(page, 'signin-page');
  await page.waitForTimeout(1000);

  // Check what's on the page
  const title = await page.title();
  const h1 = await page.locator('h1, h2').first().textContent().catch(() => null);
  emit('PAGE_INFO', { title, h1, url: page.url() });

  // Check for Google sign-in button
  const googleBtn = page.locator('button, a').filter({ hasText: /google|connect|sign.?in/i }).first();
  const googleVisible = await googleBtn.isVisible().catch(() => false);
  emit('GOOGLE_BUTTON', { visible: googleVisible });

  if (googleVisible) {
    const text = await googleBtn.textContent().catch(() => null);
    emit('GOOGLE_BUTTON_TEXT', { text });
  }

  await dumpMonitor(page, 'signin-page');

  // Check if there are any auth errors
  const errorEl = page.locator('[class*="error"], text=/error|failed|invalid/i').first();
  const hasError = await errorEl.isVisible().catch(() => false);
  if (hasError) {
    const errorText = await errorEl.textContent().catch(() => null);
    fail('Auth error visible', { errorText });
  }

  await snap(page, 'signin-final');
}

async function flowUrl(page, url) {
  sep(`FLOW: url ${url}`);
  await page.goto(url);
  await page.waitForLoadState('networkidle');
  await snap(page, 'url-loaded');
  await page.waitForTimeout(2000);
  await dumpMonitor(page, 'url-dump');
  await snap(page, 'url-final');
}

async function flowFullPipeline(page, ticker = 'AAPL') {
  sep(`FLOW: full-pipeline ${ticker}`);

  // Step 1: Home
  await page.goto(BASE);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  await snap(page, 'pipeline-home');

  // Step 2: Scroll to search
  await page.evaluate(() => window.scrollTo(0, window.innerHeight * 2.55));
  await page.waitForTimeout(800);
  await snap(page, 'pipeline-scrolled');

  // Step 3: Search ticker
  const input = page.locator('input[placeholder*="TICKER"], input[placeholder*="ticker"]').first();
  await input.waitFor({ state: 'visible', timeout: 10000 });
  await input.click();
  await input.fill(ticker);
  await page.waitForTimeout(600);
  await snap(page, 'pipeline-search-typed');

  // Step 4: Click result
  const btn = page.locator('div[class*="absolute"] button').filter({ hasText: ticker }).first();
  await btn.waitFor({ state: 'visible', timeout: 10000 });
  await btn.click();
  await page.waitForURL(new RegExp(`research/${ticker}`), { timeout: 15000 });
  await page.waitForTimeout(4000);
  await snap(page, 'pipeline-chart-page');

  // Step 5: Confirm
  const confirmBtn = page.locator('button').filter({ hasText: /run analysis|confirm|start|analyze|research/i }).first();
  await confirmBtn.waitFor({ timeout: 15000 });
  await confirmBtn.click();
  info(`Clicked confirm for ${ticker} — watching pipeline...`);
  await snap(page, 'pipeline-after-confirm');

  // Step 6: Watch progress (15 min timeout)
  await dumpMonitor(page, 'after-confirm');
  await page.waitForTimeout(5000);
  await snap(page, 'pipeline-5s');

  info('Waiting for report or error (up to 10 minutes)...');
  await Promise.race([
    page.locator('button', { hasText: 'EXPORT PDF' }).waitFor({ state: 'visible', timeout: 10 * 60 * 1000 }).then(() => {
      ok('Report rendered! EXPORT PDF button visible.');
    }),
    page.locator('text=/ANALYSIS FAILED|Script failed|error/i').first().waitFor({ state: 'visible', timeout: 10 * 60 * 1000 }).then(async () => {
      const errText = await page.locator('text=/Script failed|Error|failed/i').first().textContent().catch(() => 'unknown');
      fail('Pipeline failed', { errorText: errText });
    }),
  ]).catch(err => warn('Pipeline wait timed out', { error: err.message }));

  await dumpMonitor(page, 'pipeline-final');
  await snap(page, 'pipeline-final');
}

// ── Continuous recording loop ─────────────────────────────────────────────────
function startRecording(page, sessionDir) {
  mkdirSync(sessionDir, { recursive: true });
  let frame = 0;
  let active = true;

  async function captureFrame() {
    if (!active) return;
    frame++;
    const filename = join(sessionDir, `frame-${String(frame).padStart(5, '0')}.png`);
    try {
      await page.screenshot({ path: filename, fullPage: false });
    } catch (_) {
      // page may be closed/navigating — skip this frame
    }
    if (active) setTimeout(captureFrame, RECORD_MS);
  }

  setTimeout(captureFrame, RECORD_MS);
  emit('RECORDING_START', { dir: sessionDir, intervalMs: RECORD_MS });

  return {
    stop() {
      active = false;
      emit('RECORDING_STOP', { totalFrames: frame, dir: sessionDir });
      return { frames: frame, dir: sessionDir };
    },
  };
}

// ── ffmpeg frame extraction from Playwright video ─────────────────────────────
async function extractVideoFrames(videoPath, outDir) {
  const ffmpeg = (() => {
    try { return execSync('which ffmpeg', { encoding: 'utf8' }).trim(); } catch { return null; }
  })();

  if (!ffmpeg) {
    warn('ffmpeg not found — skipping video frame extraction (brew install ffmpeg to enable)');
    return;
  }

  mkdirSync(outDir, { recursive: true });
  const cmd = `${ffmpeg} -i "${videoPath}" -vf fps=2 "${outDir}/vframe-%05d.png" -y -loglevel error`;
  emit('FFMPEG_EXTRACT', { cmd, outDir });
  try {
    execSync(cmd);
    const count = execSync(`ls "${outDir}" | wc -l`, { encoding: 'utf8' }).trim();
    ok(`Extracted ${count} video frames to ${outDir} — read them sequentially to replay the session`);
  } catch (err) {
    warn('ffmpeg frame extraction failed', { error: err.message });
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const sessionId = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const sessionFrameDir = join(SCREENSHOT_DIR, `session-${sessionId}`);

  mkdirSync(sessionFrameDir, { recursive: true });

  emit('START', {
    flow: FLOW,
    base: BASE,
    headless: HEADLESS,
    slowMo: SLOW,
    staySec: STAY_SEC,
    recording: RECORD,
    recordMs: RECORD_MS,
    sessionId,
  });

  const browser = await chromium.launch({
    headless: HEADLESS,
    slowMo: SLOW,
    args: ['--no-sandbox'],
  });

  // Always record video (gives post-hoc replay even without --record)
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: sessionFrameDir, size: { width: 1440, height: 900 } },
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();
  await setupPage(page);

  // Start continuous screenshot loop if --record flag given
  const recorder = RECORD ? startRecording(page, join(sessionFrameDir, 'frames')) : null;

  try {
    switch (FLOW) {
      case 'setup-status':
        await flowSetupStatus(page);
        break;

      case 'notebooklm-auth':
        await flowNotebooklmAuth(page);
        break;

      case 'signin':
        await flowSignin(page);
        break;

      case 'url':
        await flowUrl(page, args[1] || BASE);
        break;

      case 'full-pipeline': {
        const ticker = args[1] || 'AAPL';
        await flowFullPipeline(page, ticker);
        break;
      }

      default:
        fail(`Unknown flow: ${FLOW}`, {
          available: ['setup-status', 'notebooklm-auth', 'signin', 'url', 'full-pipeline'],
        });
    }
  } catch (err) {
    fail('Flow threw an error', { message: err.message, stack: err.stack?.slice(0, 1000) });
    await snap(page, 'error-state').catch(() => {});
    await dumpMonitor(page, 'error-state').catch(() => {});
  }

  if (STAY_SEC > 0) {
    info(`Browser stays open for ${STAY_SEC}s — inspect the window`);
    await page.waitForTimeout(STAY_SEC * 1000);
  }

  if (recorder) recorder.stop();

  // Close context first so Playwright finalizes the video file
  const videoPath = await page.video()?.path().catch(() => null);
  await context.close();
  await browser.close();

  // Extract video frames with ffmpeg for frame-by-frame review
  if (videoPath) {
    emit('VIDEO_SAVED', { path: videoPath });
    await extractVideoFrames(videoPath, join(sessionFrameDir, 'video-frames'));
  }

  emit('DONE', { sessionDir: sessionFrameDir });
}

main().catch(err => {
  process.stderr.write('FATAL: ' + err.message + '\n' + (err.stack || '') + '\n');
  process.exit(1);
});
