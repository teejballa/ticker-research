# Plan 20-Z-03 — Deferred Items

The posttooluse validator flagged the following pre-existing issues in
`src/lib/gemini-analysis.ts` during the wrap-site edits in Task 5l. These are
NOT caused by Plan 20-Z-03 — they pre-date this plan and are listed in
CLAUDE.md / CONTEXT.md as architectural concerns for future plans.

Per the GSD scope-boundary rule, they are deferred and not auto-fixed here.

1. `src/lib/gemini-analysis.ts` line 12 — Direct `@anthropic-ai/sdk` import.
   File comment line 9-11 explains why this is intentional: Pool B niche
   discovery uses the `web_search_20250305` Anthropic-native tool, which is
   not available through the AI Gateway. Migrating this requires a Wave-B
   plan.
2. `src/lib/gemini-analysis.ts` line 34 / line 686 — Model slug formatting
   (`gemini-3-flash` vs `gemini.3.flash`). The hyphenated slugs are the
   canonical AI Gateway identifiers pinned at this layer; the validator's
   rule appears to misclassify model version components as version-number
   separators. Re-evaluate when the AI Gateway slug grammar changes.
3. `src/lib/gemini-analysis.ts` line 44 — Direct provider-key path. Same root
   cause as item 1 (Pool B web-search tool).

None of these affect telemetry plumbing. The `withTelemetry('gemini', ...)`
wrapper composes around `generateText` exactly as the plan requires, and the
cost estimator reads `usage.inputTokens` / `usage.outputTokens` off the SDK
return shape — both work regardless of how Anthropic is imported.
