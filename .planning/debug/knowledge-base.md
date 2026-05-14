# GSD Debug Knowledge Base

Resolved debug sessions. Used by `gsd-debugger` to surface known-pattern hypotheses at the start of new investigations.

---

## bayesian-learning-engine-prod-broken — /api/cron/learn ENOENT at module load: prompt .md files not bundled by Vercel file-tracer
- **Date:** 2026-05-13
- **Error patterns:** ENOENT, no such file or directory, scandir, /vercel/path0/src/lib/prompts, prompt registry, _manifest.ts, readdirSync, readFileSync, fileURLToPath, learn cron HTTP 500, posterior_update stale, sentiment_observations empty, UnhandledSchemeError, node:fs, node:url, node:path, Bayesian learning engine not working, ciphersearch.app, cold start, vercel serverless, learning_events
- **Root cause:** Next.js's serverless file-tracer cannot follow files referenced only via dynamic fs at module load (`readdirSync(__dirname)` / `readFileSync(...)`). The .md prompt bodies under `src/lib/prompts/_vN/` were never copied into the lambda output bundle, so every cold start of `/api/cron/learn` (and every transitive importer of the registry — gemini-analysis.ts, research-brief.ts, eval/judge.ts, eval/claim-extraction-llm.ts, sentiment/per-doc-classifier.ts) crashed at module-eval with ENOENT before any handler code ran. Two compounding side issues: (a) Phase-20-Z-01 SentimentObservation feature store sat at 0 rows because `lightweightCommunityScan()` never surfaced raw StockTwits messages, starving the PIT writer; (b) Yahoo 90.7% / Firecrawl 100% upstream error rates further degraded the data feed.
- **Fix:** Build-time generator (`scripts/generate-prompt-manifest.ts`) reads every `_v*/<id>.md` at prebuild and emits `_manifest.generated.ts` with bodies as inline JS string literals. `_manifest.ts` becomes a single `export { REGISTERED_PROMPTS } from './_manifest.generated'` — zero runtime fs, zero `node:fs`/`node:url`/`node:path` imports, fully bundler-safe across webpack + turbopack. Generator runs via `prebuild`/`predev`/`vercel.json buildCommand`; CI gate `npm run check-prompt-manifest` fails on drift. Separately, added `fetchStockTwitsRaw()` + wired it through `lightweightCommunityScan` so `sentiment_observations` starts populating. Regression test at `tests/unit/cron-module-load.unit.test.ts` dynamic-imports the 8 most-at-risk cron route modules in isolation (mimics Vercel cold start) and asserts they load without throwing.
- **Files changed:** src/lib/prompts/_manifest.ts, src/lib/prompts/_manifest.generated.ts, scripts/generate-prompt-manifest.ts, package.json, vercel.json, src/lib/data/stocktwits.ts, src/lib/data/lightweight-community-scan.ts, src/app/api/cron/sentiment-scan/route.ts, tests/unit/cron-module-load.unit.test.ts

### Lesson (Next.js + Vercel pitfall, worth remembering)

Next.js's lambda file-tracer ONLY follows static `import`/`require` references. It cannot see files referenced via `fs.readdirSync(...)`, `fs.readFileSync(...)`, `path.join(__dirname, ...)`, or any other dynamic-fs pattern at module load. Symptoms: works locally and in `next dev`, succeeds in `next build`, but ENOENTs the moment a route cold-starts on Vercel. Three correct fixes:

1. **Build-time generator** (chosen here) — read the files at prebuild, emit a `.generated.ts` with bodies as JS literals. Portable across bundlers, no config.
2. **Webpack/turbopack `asset/source`** — `import body from './foo.md'` with the right loader rule. Requires bundler config and turbopack/webpack parity.
3. **`outputFileTracingIncludes`** in `next.config.ts` — tells the tracer to copy specific globs into every bundle. Lower-effort but leaves the dynamic fs in place; route still pays the disk-read cost on every cold start, and you lose compile-time guarantees.

Avoid `outputFileTracingIncludes` for hot-path files unless the static-import refactor is genuinely infeasible.

---

