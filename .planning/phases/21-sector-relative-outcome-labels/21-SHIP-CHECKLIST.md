# Phase 21 — Ship Checklist (next session)

**State as of 2026-05-23:** All 8 plans CODE-COMPLETE (8/8 SUMMARYs, 27 commits on `main`, working tree clean). Production relearn already ran (2026-05-21): 121 cells rebuilt sector-relative, direction preserved, spread 0.1612 → 0.1464. All code-level loose ends fixed (Gate-7 vitest noise cleared, panel tooltips sector-relative). `npm run phase-21-status` last reported 6/9 — the 3 remaining FAILs are **deploy-dependent**, not code defects.

## Why the phase isn't "shipped" yet
Production `ciphersearch.app` still runs **pre-Phase-21 code**. So:
- The deployed `price-followup` cron writes new `PriceOutcome` rows WITHOUT sector columns → Gate 2 (backfill coverage) + Gate 3 (forward freshness) FAIL.
- The relearn lives only in Neon; prod serves new posteriors under old SPY-worded UI.

**The deploy is the keystone of "done." Everything else follows from it.**

## Exact ship sequence (do in order)

### 1. Deploy Phase 21 to production
```bash
cd /Users/tj/Desktop/Cipher
# Confirm clean + on main
git status && git log --oneline -1
# Deploy (Vercel). The build runs prebuild prompt-manifest gen + prisma migrate deploy + next build.
vercel --prod        # or: npx vercel deploy --prod   (auth: `! vercel login` if needed)
```
Verify the deploy: `/insights` shows "beat its sector"; `/research/AAPL` (with a report) shows "Calibration vs. sector (XLK)" + "vs market (SPY-alpha, derived)".

### 2. Drain the relabel backfill (AFTER deploy — deployed code writes sector cols forward)
```bash
# Source CRON_SECRET from .env.local
S=$(grep '^CRON_SECRET=' .env.local | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
# Hit until labeled=0 (idempotent; ~1 pass since <5000 rows)
curl -s -H "Authorization: Bearer $S" https://ciphersearch.app/api/cron/relabel | jq
# Repeat until {"labeled":0}. Confirm coverage in Neon:
#   SELECT COUNT(*) FILTER (WHERE sector_etf IS NULL) AS unlabeled FROM price_outcomes;  -- want ≤1% (the 1 orphan row is OK)
```

### 3. Playwright visual e2e (21-4-07 Task 3) — needs a rendered AAPL report
The spec hits `/research/AAPL` which only shows the panel post-analysis. Either run against the deployed app with a seeded report, OR locally:
```bash
# Terminal 1: npm run dev   (needs API keys + a seeded ~/.cipher/reports/ AAPL report, or ?report= fixture)
# Terminal 2:
npx playwright test tests/e2e/sector-relative-labels.spec.ts --reporter=list   # expect 2/2 pass
```
Screenshot-review: headline sector-relative is prominent; "vs market (SPY-alpha, derived)" is the smaller tile; `/insights` says "beat its sector", no "S&P 500".

### 4. (If Gate 7 flakes) finish source-package.test.ts mocks
`src/lib/data/source-package.test.ts` mocks only `@/lib/data/yahoo` + `@/lib/data/anthropic-search`, but `collectAllData` also calls (un-mocked): `finnhub`, `polygon`, `stocktwits`, `adapters/twelve-data`, `adapters/swaggystocks`, `adapters/apewisdom`, `yahoo-analyst`, `polygon-news`, `finnhub-analyst`. It passes when those resolve fast but can time out under network latency. Add `vi.mock(...)` stubs for each (mirror the existing 2) so it's deterministic. Pre-existing + unrelated to Phase 21, but it gates Gate 7.

### 5. Final done-gate → green → mark complete
```bash
# With a dev server up for the playwright sub-gate, OR PLAYWRIGHT_SKIP=1 to skip it:
npm run phase-21-status          # expect: ✅ PHASE 21 — READY TO SHIP (exit 0)
```
Then flip completion:
```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" phase complete 21
git add .planning/ROADMAP.md .planning/STATE.md && git commit -m "docs(21): mark Phase 21 complete — all 9 gates green"
```

## Then: Phase 22
Per locked D-01 (memory `project-phase-22-next`): Phase 22 is gated on P21 **ship + a ~1–2 week relearn soak**. After the soak, run `/gsd-discuss-phase 22`. Do NOT start P22 before the soak — the regime-bucket decisions depend on observing the post-relearn posterior shape (already showing heavy family-compression: top-to-bottom range 0.169 → 0.042).

## Reference
- Relearn script (re-runnable): `npx tsx scripts/relearn-21.ts`
- Relearn backups: `/tmp/{learned_patterns,learning_events}_backup_2026-05-21T16-32-23-690Z.json`
- Done-gate: `scripts/phase-21-status.ts` (Gate 8 greps `21-3-06-SUMMARY.md` for `direction:` + `spread:` lines — both present)
