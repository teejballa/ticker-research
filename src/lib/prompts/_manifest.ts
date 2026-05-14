// src/lib/prompts/_manifest.ts
// Plan 20-Z-04 — manifest for the prompt registry.
//
// Re-exports REGISTERED_PROMPTS from _manifest.generated.ts (auto-generated at
// build time by scripts/generate-prompt-manifest.ts). The generated module
// contains every prompt body as an inline JS string literal — zero runtime
// fs, zero `node:fs`/`node:url`/`node:path` imports, fully bundler-safe
// across webpack + turbopack + Vercel's serverless file-tracer.
//
// Background (bug fix, 2026-05-13):
//   The previous implementation used `readdirSync(__dirname)` +
//   `readFileSync(...)` at MODULE LOAD time to enumerate `_vN/<id>.md`.
//   Next.js's file-tracer cannot follow `fs.readdirSync(...)` references —
//   it only follows static `import`s and `require()`s. As a result the .md
//   bodies were NOT copied into the Vercel lambda output bundle, and every
//   cold start of `/api/cron/learn` (plus every transitive importer:
//   gemini-analysis.ts, research-brief.ts, sentiment/per-doc-classifier.ts,
//   eval/judge.ts, eval/claim-extraction-llm.ts) crashed with
//   `ENOENT: no such file or directory, scandir '/vercel/path0/src/lib/prompts'`.
//   This silently froze the Bayesian learning engine in production for >24h.
//
//   The build-time generator ensures the bodies are first-class JS literals
//   in the route bundle. The .md files remain the source of truth on disk;
//   the generator is run at `prebuild` and a CI guard
//   (`npx tsx scripts/generate-prompt-manifest.ts --check`) fails the build
//   if the generated file drifts from the .md sources.

export { REGISTERED_PROMPTS } from './_manifest.generated';
