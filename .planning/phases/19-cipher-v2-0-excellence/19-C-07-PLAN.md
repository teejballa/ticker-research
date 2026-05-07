---
phase: 19
plan: 19-C-07
wave: C
type: execute
depends_on: [19-Z-01, 19-Z-02, 19-Z-03, 19-Z-04]
files_modified:
  - src/lib/sentiment/citation-schema.ts
  - src/lib/research-brief.ts
  - src/lib/gemini-analysis.ts
  - tests/lib/sentiment/citation-schema.test.ts
  - tests/integration/citations-v2.shadow.live.test.ts
autonomous: true
requirements: []
shadow_required: true
hard_cleanup_gate: true
must_haves:
  truths:
    - "Zod schema CitationSchema = { source, url, confidence, date_retrieved } with mandatory URL for source ∈ {analyst, news} per D-39"
    - "AnalysisResultSchema replaces source_citation: string with citations_v2: Citation[]"
    - "research-brief.ts assembles structured citations from SourcePackage"
    - "gemini-analysis.ts validates citations_v2 via Zod at parse time"
    - "≥90% URL coverage on analyst/news claims (Wave C success criterion + 19-Z-04 gate)"
    - "Shadow A/B verdict: URL coverage ≥90% AND old URL set ⊆ new URL set (no information loss per RESEARCH Pitfall 5)"
  artifacts:
    - path: "src/lib/sentiment/citation-schema.ts"
      provides: "Citation Zod schema + types"
      exports: ["CitationSchema", "Citation", "CitationsArraySchema"]
    - path: "src/lib/research-brief.ts"
      provides: "Structured citations injected into Gemini prompt"
      contains: "citations_v2"
    - path: "src/lib/gemini-analysis.ts"
      provides: "AnalysisResultSchema with citations_v2 field"
      contains: "citations_v2"
  key_links:
    - from: "src/lib/gemini-analysis.ts"
      to: "src/lib/sentiment/citation-schema.ts"
      via: "AnalysisResultSchema.citations_v2"
      pattern: "citations_v2.*Citation"
---

# Plan 19-C-07: Structured citation schema + research-brief edits

<universal_preamble>

## Autonomous Execution Clause + Hard Cleanup Gate

Standard shadow lifecycle. Per D-39.

</universal_preamble>

<objective>
Per D-39, replace free-text `source_citation: string` in AnalysisResultSchema with structured `citations_v2: { source, url, confidence, date_retrieved }[]`. Mandatory URL at Zod validation time for analyst/news source types. Shadow verdict gates cutover on ≥90% URL coverage AND no URL information loss vs current free-text path.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/19-cipher-v2-0-excellence/19-CONTEXT.md
@.planning/phases/19-cipher-v2-0-excellence/19-RESEARCH.md
@docs/plans/2026-05-07-cipher-v2-excellence-design.md
@src/lib/gemini-analysis.ts
@src/lib/research-brief.ts
@prisma/schema.prisma

<interfaces>
```typescript
import { z } from 'zod';

export const CitationSchema = z.object({
  source: z.enum(['analyst', 'news', 'sec_filing', 'social', 'options', 'community', 'price_data', 'other']),
  url: z.string().url().nullable(),
  confidence: z.number().min(0).max(1),
  date_retrieved: z.string().datetime(),
}).superRefine((data, ctx) => {
  if (['analyst', 'news'].includes(data.source) && !data.url) {
    ctx.addIssue({
      code: 'custom',
      path: ['url'],
      message: `URL is mandatory when source is '${data.source}' (per D-39)`,
    });
  }
});

export const CitationsArraySchema = z.array(CitationSchema);
export type Citation = z.infer<typeof CitationSchema>;
```
</interfaces>
</context>

<threat_model>

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-19-C-07-01 | Tampering | citation injection (LLM emits fabricated URL) | mitigate | research-brief.ts ASSEMBLES the structured citations from actual SourcePackage URLs (not LLM-generated); Gemini selects WHICH citations to use, never fabricates new URLs |
| T-19-C-07-02 | Business Logic | URL coverage drops below 90% on niche tickers | mitigate | Shadow verdict checks per-source-type coverage; if analyst/news coverage <90%, FAIL → adjust prompt to be more aggressive about citing |
| T-19-C-07-03 | Information Disclosure | citation URL with embedded auth (e.g., shareable preview links) | mitigate | sanitize URL before persist (strip `:[^/@]+@`) — same logic as 19-Z-03 |

</threat_model>

<tasks>

<task type="auto" tdd="true" id="19-C-07-01">
  <name>Task 1: Write tests/lib/sentiment/citation-schema.test.ts</name>
  <read_first>
    - .planning/phases/19-cipher-v2-0-excellence/19-CONTEXT.md (D-39)
  </read_first>
  <behavior>
    - Test 1: `valid citation { source: 'analyst', url: 'https://...', confidence: 0.8, date_retrieved: '2026-05-06T10:00:00Z' } parses`
    - Test 2: `analyst citation without URL fails Zod with message containing 'mandatory'`
    - Test 3: `news citation without URL fails Zod`
    - Test 4: `social citation without URL succeeds (URL optional for social/community)`
    - Test 5: `confidence outside [0,1] fails`
    - Test 6: `invalid source enum fails`
    - Test 7: `CitationsArraySchema accepts empty array`
    - Test 8: `URL with embedded auth string sanitized (e.g., 'https://user:pass@x.com' → 'https://***@x.com')`
  </behavior>
  <action>
    Create `tests/lib/sentiment/citation-schema.test.ts` with 8 tests using Zod safeParse.
  </action>
  <acceptance_criteria>
    - File exists; ≥8 tests; FAILS RED
  </acceptance_criteria>
  <automated>npx vitest run tests/lib/sentiment/citation-schema.test.ts 2>&1 | grep -qE "Cannot find|FAIL"</automated>
  <done>8 failing tests written</done>
</task>

<task type="auto" tdd="true" id="19-C-07-02">
  <name>Task 2: Implement src/lib/sentiment/citation-schema.ts</name>
  <read_first>
    - tests/lib/sentiment/citation-schema.test.ts
  </read_first>
  <action>
    Create `src/lib/sentiment/citation-schema.ts`:
    ```typescript
    import { z } from 'zod';

    function sanitizeUrl(url: string): string {
      return url.replace(/(https?:\/\/)([^@\/]+@)/g, '$1***@');
    }

    export const CitationSchema = z.object({
      source: z.enum(['analyst', 'news', 'sec_filing', 'social', 'options', 'community', 'price_data', 'other']),
      url: z.string().url().nullable().transform(u => u ? sanitizeUrl(u) : null),
      confidence: z.number().min(0).max(1),
      date_retrieved: z.string().datetime(),
    }).superRefine((data, ctx) => {
      if (['analyst', 'news'].includes(data.source) && !data.url) {
        ctx.addIssue({
          code: 'custom',
          path: ['url'],
          message: `URL is mandatory when source is '${data.source}' (per D-39)`,
        });
      }
    });

    export const CitationsArraySchema = z.array(CitationSchema);
    export type Citation = z.infer<typeof CitationSchema>;
    ```
  </action>
  <acceptance_criteria>
    - All 8 tests pass
    - `grep -q "URL is mandatory" src/lib/sentiment/citation-schema.ts`
    - `grep -q "sanitizeUrl" src/lib/sentiment/citation-schema.ts`
  </acceptance_criteria>
  <automated>npx vitest run tests/lib/sentiment/citation-schema.test.ts</automated>
  <done>8/8 GREEN</done>
</task>

<task type="auto" id="19-C-07-03">
  <name>Task 3: Edit src/lib/research-brief.ts to assemble structured citations from SourcePackage</name>
  <read_first>
    - src/lib/research-brief.ts (existing prompt assembly)
    - src/lib/sentiment/citation-schema.ts
  </read_first>
  <action>
    Edit `src/lib/research-brief.ts`:
    - Walk SourcePackage; for each evidence item (analyst commentary, news article, SEC filing, options, etc.), produce a `Citation` object with source/url/confidence/date_retrieved
    - Inject into prompt as a structured CITATIONS section: "Available citations: [{ source: 'news', url: 'https://...', date_retrieved: '...' }, ...]"
    - Instruct Gemini to RETURN citations_v2 array selecting which citations support each thesis claim
    - Gemini does NOT fabricate URLs — only selects from this list (T-19-C-07-01 mitigation)
  </action>
  <acceptance_criteria>
    - `grep -q "citations_v2\|Citation\|CITATIONS" src/lib/research-brief.ts`
  </acceptance_criteria>
  <automated>grep -q "citations_v2\|CITATIONS" src/lib/research-brief.ts</automated>
  <done>Prompt assembles structured citations</done>
</task>

<task type="auto" id="19-C-07-04">
  <name>Task 4: Edit src/lib/gemini-analysis.ts AnalysisResultSchema with citations_v2 + shadow A/B</name>
  <read_first>
    - src/lib/gemini-analysis.ts (existing AnalysisResultSchema with source_citation: string)
    - src/lib/sentiment/citation-schema.ts
  </read_first>
  <action>
    Edit `src/lib/gemini-analysis.ts`:
    - Import CitationsArraySchema
    - Extend AnalysisResultSchema:
      ```typescript
      const AnalysisResultSchema = z.object({
        // ... existing fields
        source_citation: z.string().optional(), // KEEP existing field — populated when flag off
        citations_v2: CitationsArraySchema.optional(), // NEW — populated when flag shadow/on
      });
      ```
    - In runGeminiAnalysis, branch on FEATURES.cove_two_pass / structured citations flag (or use a single flag for citations_v2):
      Actually per CONTEXT, the flag for this is implicit in shadow lifecycle — use `runWithShadow('citations-v2', oldGen, newGen, mode)` where:
      - oldGen = existing prompt + source_citation: string output
      - newGen = new prompt with structured citations + citations_v2: Citation[] output
    - Verdict checks URL coverage on `analyst` + `news` source types ≥90%
  </action>
  <acceptance_criteria>
    - `grep -q "citations_v2" src/lib/gemini-analysis.ts`
    - `grep -q "runWithShadow.*'citations-v2'" src/lib/gemini-analysis.ts`
    - source_citation field still present (optional fallback)
  </acceptance_criteria>
  <automated>grep -q "citations_v2" src/lib/gemini-analysis.ts && grep -q "runWithShadow" src/lib/gemini-analysis.ts</automated>
  <done>citations_v2 wired behind shadow gate</done>
</task>

<task type="auto" id="19-C-07-05">
  <name>Task 5: Initial commit + shadow lifecycle</name>
  <action>
    Commit then run shadow:
    ```
    feat(19-c-07): structured citation schema (analyst/news mandatory URL)

    citations_v2: { source, url, confidence, date_retrieved }[] replaces
    free-text source_citation: string. Zod superRefine enforces mandatory
    URL for source ∈ {analyst, news} per D-39.

    Behind runWithShadow('citations-v2', ...). Source_citation kept as
    optional fallback; cutover removes it after PASS verdict.

    Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
    ```

    Lifecycle: shadow → verdict (URL coverage ≥90% on analyst/news AND old URLs ⊂ new URLs per RESEARCH Pitfall 5 metric for citations) → cutover (remove source_citation field from canonical schema) → 7d hatch → no flag to remove (this plan uses runWithShadow with no specific feature flag — citations_v2 is the canonical post-cutover; flag-removal step is N/A IF no FEATURE_* used; if shadow lifecycle uses an implicit flag, remove it post-7d).
  </action>
  <acceptance_criteria>
    - shadow-reports/19-C-07.json PASS (URL coverage ≥90%)
    - Cutover: source_citation removed from primary schema
    - model-card-status `citations: ok=true` (≥90% URL coverage on last-30d analyst/news claims)
  </acceptance_criteria>
  <automated>git log -1 --pretty=%s | grep -q "19-c-07"</automated>
  <done>Structured citations canonical with ≥90% URL coverage</done>
</task>

</tasks>

<verification>
- [ ] CitationSchema rejects analyst/news without URL
- [ ] research-brief assembles citations from SourcePackage (not LLM fabrication)
- [ ] AnalysisResultSchema validates citations_v2
- [ ] Shadow PASS: URL coverage ≥90%
- [ ] model-card-status citations check passes
</verification>

<success_criteria>
≥90% of analyst/news claims in last-30d Reports have populated URLs.
</success_criteria>

<output>
Create `.planning/phases/19-cipher-v2-0-excellence/19-C-07-SUMMARY.md`.
</output>
