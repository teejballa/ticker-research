---
phase: 19
plan: 19-C-11
wave: C
type: execute
depends_on: [19-Z-01, 19-Z-02, 19-Z-03, 19-Z-04]
files_modified:
  - scripts/arctic-shift-backfill.ts
  - tests/integration/arctic-shift-backfill.live.test.ts
  - package.json
  - .env.example
autonomous: true
requirements: []
shadow_required: false
hard_cleanup_gate: true
must_haves:
  truths:
    - "scripts/arctic-shift-backfill.ts is one-time historical backfill — NOT a recurring cron (per D-43)"
    - "Pulls 5y of Reddit chatter for v1.0 ticker universe via Arctic Shift API"
    - "Populates CommunityChatter rows with ticker/source='reddit'/url/raw_text/scraped_at"
    - "Idempotent: running twice does not duplicate rows (UNIQUE constraint on ticker+source+url+scraped_at from 19-Z-02)"
    - "Sanitizes raw_text before persist (T-19-C-11 mitigation per ASVS V8)"
    - "Rate-limit-aware: respects Arctic Shift limits per RESEARCH Assumption A6 (≥60 req/min assumed; if slower, script extends runtime)"
    - "No shadow needed (one-time ingest per D-43)"
  artifacts:
    - path: "scripts/arctic-shift-backfill.ts"
      provides: "One-shot Reddit historical backfill script"
    - path: "package.json"
      contains: "\"arctic-shift-backfill\":"
    - path: "tests/integration/arctic-shift-backfill.live.test.ts"
      provides: "Live-DB test of backfill correctness on small sample"
  key_links:
    - from: "scripts/arctic-shift-backfill.ts"
      to: "https://arctic-shift.photon-reddit.com/ + prisma.communityChatter"
      via: "fetch + Prisma create with ON CONFLICT DO NOTHING (or unique constraint catch)"
      pattern: "CommunityChatter\\.create\\|communityChatter\\.upsert"
---

# Plan 19-C-11: Arctic Shift one-time historical Reddit backfill

<universal_preamble>

## Autonomous Execution Clause + Hard Cleanup Gate

Per D-43, this is a ONE-TIME script invocation, not a cron. No shadow lifecycle. Runs as `npm run arctic-shift-backfill -- --years 5 --tickers <subset>`.

## Hard Cleanup Gate (Definition of Done)

1. (N/A — no shadow)
2. (N/A — no replacement)
3. (N/A)
4. (N/A)
5. `npm test` green; integration test on small sample passes; one-time script committed; SUMMARY documents production run results (when executed)

</universal_preamble>

<objective>
Per D-43, deliver one-time Arctic Shift Reddit backfill. Pulls 5y of historical chatter for v1.0 ticker universe to populate CommunityChatter rows for FinSentLLM training corpus. Pushshift successor (Pushshift admin-only since 2023). Free, rate-limited.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/19-cipher-v2-0-excellence/19-CONTEXT.md
@.planning/phases/19-cipher-v2-0-excellence/19-RESEARCH.md
@docs/plans/2026-05-07-cipher-v2-excellence-design.md
@.planning/phases/19-cipher-v2-0-excellence/19-Z-02-SUMMARY.md
@scripts/tune-lambda.ts

<interfaces>
```typescript
// scripts/arctic-shift-backfill.ts — CLI invocation:
// npm run arctic-shift-backfill -- --years 5 --tickers AAPL,GOOGL,MSFT
// npm run arctic-shift-backfill -- --years 5 --tickers-from .planning/v1-ticker-universe.txt
//
// Idempotent — re-running skips rows already in CommunityChatter (unique constraint).
```
</interfaces>
</context>

<threat_model>

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-19-C-11-01 | Tampering | raw user content (prompt injection vectors) | mitigate | sanitize raw_text before persist: strip HTML tags, normalize whitespace, truncate at 5000 chars; downstream consumers (CoVe, FinSentLLM) treat as untrusted text per V8 ASVS |
| T-19-C-11-02 | Privacy | Reddit user IDs persisted | mitigate | Per RESEARCH §Security V8: do NOT store user IDs in CommunityChatter; only ticker, source='reddit', url (post URL), raw_text (sanitized) — schema in 19-Z-02 confirmed has no user_id column |
| T-19-C-11-03 | DoS | rate limit causes runaway retries | mitigate | Use existing withRetry (max 3 attempts) per leg; sleep between batches per Arctic Shift limit; assumed ≥60 req/min (Assumption A6) |

</threat_model>

<tasks>

<task type="auto" id="19-C-11-01">
  <name>Task 1: Document Arctic Shift API + add v1 ticker universe file</name>
  <read_first>
    - https://arctic-shift.photon-reddit.com/ (executor verifies API shape live)
    - https://github.com/ArthurHeitmann/arctic_shift (reference impl)
    - .planning/phases/19-cipher-v2-0-excellence/19-RESEARCH.md (Assumption A6)
  </read_first>
  <action>
    1. Create `.planning/v1-ticker-universe.txt` listing the v1.0 ticker universe (read from existing watchlist config, or extract from Phase 13 SentimentSnapshot data — top N tickers by appearance count). Format: one ticker per line.

    2. Document Arctic Shift API at top of `scripts/arctic-shift-backfill.ts`:
       ```typescript
       /**
        * Arctic Shift API (Pushshift successor).
        * Endpoint: https://arctic-shift.photon-reddit.com/api/posts/search
        * Query params: subreddit, after, before, q (search term)
        * Response: { data: [{ id, title, selftext, url, created_utc, permalink, author }] }
        *
        * Rate limit: Per RESEARCH Assumption A6, assumed ≥60 req/min.
        * If slower: script gracefully extends runtime (max 8h cap).
        *
        * Privacy: do NOT persist `author` field per V8 ASVS.
        */
       ```
  </action>
  <acceptance_criteria>
    - `.planning/v1-ticker-universe.txt` exists with ≥10 tickers
  </acceptance_criteria>
  <automated>test -f .planning/v1-ticker-universe.txt && [ "$(wc -l < .planning/v1-ticker-universe.txt)" -ge 10 ]</automated>
  <done>API + ticker universe documented</done>
</task>

<task type="auto" tdd="true" id="19-C-11-02">
  <name>Task 2: Write tests/integration/arctic-shift-backfill.live.test.ts</name>
  <read_first>
    - tests/integration/learn.ess.live.test.ts (pattern reference)
    - prisma/schema.prisma (CommunityChatter columns)
  </read_first>
  <behavior>
    - Test 1: `script run with --tickers TEST-CIPHER-AAPL --years 1 (mocked Arctic Shift response) populates CommunityChatter rows`
    - Test 2: `re-running script does not duplicate rows (idempotent)`
    - Test 3: `raw_text sanitized — HTML tags stripped, whitespace normalized, truncated at 5000 chars`
    - Test 4: `author field NEVER persisted` — query CommunityChatter and assert no column with author/user_id values
    - Test 5: `rate limit error → backoff and retry; eventually succeeds`
    - Test 6: `cleanup: removes test rows`
  </behavior>
  <action>
    Create `tests/integration/arctic-shift-backfill.live.test.ts`. Mock Arctic Shift fetch globally with synthetic responses. Test ticker prefix `TEST-C11-` for cleanup.
  </action>
  <acceptance_criteria>
    - File exists; ≥6 tests
    - Test FAILS RED (script not yet written)
  </acceptance_criteria>
  <automated>test -f tests/integration/arctic-shift-backfill.live.test.ts</automated>
  <done>Tests written</done>
</task>

<task type="auto" tdd="true" id="19-C-11-03">
  <name>Task 3: Implement scripts/arctic-shift-backfill.ts</name>
  <read_first>
    - tests/integration/arctic-shift-backfill.live.test.ts
    - scripts/tune-lambda.ts (script pattern reference)
    - src/lib/data/retry.ts (withRetry from 19-B-02)
  </read_first>
  <action>
    Create `scripts/arctic-shift-backfill.ts`:
    ```typescript
    #!/usr/bin/env tsx
    import { readFileSync } from 'node:fs';
    import { prisma } from '../src/lib/db';
    import { withRetry } from '../src/lib/data/retry';

    const ARCTIC_SHIFT_BASE = 'https://arctic-shift.photon-reddit.com/api/posts/search';
    const SUBREDDITS = ['wallstreetbets', 'stocks', 'SecurityAnalysis', 'algotrading'];

    interface ArcticPost {
      id: string;
      title: string;
      selftext?: string;
      url: string;
      permalink: string;
      created_utc: number;
      author?: string;  // NOT persisted (T-19-C-11-02)
    }

    function sanitize(text: string): string {
      return text
        .replace(/<[^>]+>/g, '')        // strip HTML tags
        .replace(/\s+/g, ' ')            // normalize whitespace
        .slice(0, 5000)                  // truncate
        .trim();
    }

    async function fetchPostsForTickerSubreddit(ticker: string, subreddit: string, after: number, before: number): Promise<ArcticPost[]> {
      const url = `${ARCTIC_SHIFT_BASE}?subreddit=${subreddit}&q=${encodeURIComponent(ticker)}&after=${after}&before=${before}&limit=100`;
      const res = await fetch(url);
      if (!res.ok) {
        const err = new Error(`arctic-shift ${res.status}`) as Error & { status?: number };
        err.status = res.status;
        throw err;
      }
      const json = await res.json() as { data: ArcticPost[] };
      return json.data;
    }

    async function backfillTicker(ticker: string, yearsBack: number): Promise<number> {
      const now = Math.floor(Date.now() / 1000);
      const startUtc = now - yearsBack * 365 * 86_400;
      let inserted = 0;

      for (const subreddit of SUBREDDITS) {
        // Page through monthly windows to keep responses small
        for (let after = startUtc; after < now; after += 30 * 86_400) {
          const before = Math.min(after + 30 * 86_400, now);
          let posts: ArcticPost[];
          try {
            posts = await withRetry(
              () => fetchPostsForTickerSubreddit(ticker, subreddit, after, before),
              { maxAttempts: 3, baseDelayMs: 500 },
            );
          } catch (err) {
            console.warn(`[backfill] ${ticker} ${subreddit} window failed:`, err);
            continue;
          }

          for (const post of posts) {
            const url = `https://reddit.com${post.permalink}`;
            const raw = sanitize(`${post.title}\n${post.selftext ?? ''}`);
            try {
              await prisma.communityChatter.create({
                data: {
                  ticker,
                  source: 'reddit',
                  url,
                  raw_text: raw,
                  scraped_at: new Date(post.created_utc * 1000),
                },
              });
              inserted++;
            } catch (err: any) {
              // Unique constraint conflict — already ingested, skip silently
              if (err?.code !== 'P2002') {
                console.warn(`[backfill] insert failed:`, err);
              }
            }
          }

          // Rate limit pacing
          await new Promise(r => setTimeout(r, 1100));
        }
      }
      return inserted;
    }

    async function main() {
      const args = parseCliArgs(process.argv.slice(2));
      const tickers = args.tickers
        ? args.tickers.split(',')
        : readFileSync(args.tickersFrom ?? '.planning/v1-ticker-universe.txt', 'utf8')
            .split('\n').map(s => s.trim()).filter(Boolean);
      const years = args.years ?? 5;

      console.log(`Backfilling ${tickers.length} tickers × ${years} years across ${SUBREDDITS.join(', ')}`);
      let total = 0;
      for (const ticker of tickers) {
        const n = await backfillTicker(ticker, years);
        console.log(`[${ticker}] inserted ${n} rows`);
        total += n;
      }
      console.log(`Done. Total rows inserted: ${total}`);
    }

    function parseCliArgs(argv: string[]): { tickers?: string; tickersFrom?: string; years?: number } {
      const out: any = {};
      for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--tickers') out.tickers = argv[++i];
        else if (argv[i] === '--tickers-from') out.tickersFrom = argv[++i];
        else if (argv[i] === '--years') out.years = parseInt(argv[++i], 10);
      }
      return out;
    }

    main().catch(e => { console.error(e); process.exit(1); });
    ```

    Add to `package.json`:
    ```json
    "arctic-shift-backfill": "tsx scripts/arctic-shift-backfill.ts"
    ```
  </action>
  <acceptance_criteria>
    - All 6 integration tests pass
    - `grep -q "sanitize" scripts/arctic-shift-backfill.ts` (T-19-C-11-01 mitigation)
    - `! grep -q "author" scripts/arctic-shift-backfill.ts | grep "create"` — author NEVER persisted (T-19-C-11-02)
    - `grep -q '"arctic-shift-backfill"' package.json`
  </acceptance_criteria>
  <automated>grep -q "sanitize" scripts/arctic-shift-backfill.ts && grep -q "arctic-shift-backfill" package.json</automated>
  <done>Backfill script implemented + privacy mitigations enforced</done>
</task>

<task type="auto" id="19-C-11-04">
  <name>Task 4: Commit</name>
  <action>
    Commit:
    ```
    feat(19-c-11): Arctic Shift one-time historical Reddit backfill

    scripts/arctic-shift-backfill.ts pulls 5y of v1.0 ticker universe Reddit
    chatter from Arctic Shift (Pushshift successor) into CommunityChatter table.

    SECURITY (T-19-C-11):
    - raw_text sanitized (HTML stripped, whitespace normalized, ≤5000 chars)
    - Reddit author IDs NOT persisted (V8 ASVS privacy)
    - Idempotent: unique constraint on (ticker,source,url,scraped_at) prevents duplicates

    One-time invocation: npm run arctic-shift-backfill -- --years 5 --tickers-from .planning/v1-ticker-universe.txt

    Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
    ```
  </action>
  <acceptance_criteria>
    - `git log -1 --pretty=%s` matches "feat(19-c-11)"
  </acceptance_criteria>
  <automated>git log -1 --pretty=%s | grep -q "19-c-11"</automated>
  <done>Backfill script committed; ready for manual one-time invocation</done>
</task>

</tasks>

<verification>
- [ ] 6 integration tests pass
- [ ] raw_text sanitized; HTML tags stripped
- [ ] Reddit author NEVER persisted to CommunityChatter
- [ ] Idempotent (unique constraint catches duplicates)
- [ ] No cron — manual one-time invocation
</verification>

<success_criteria>
1. `npm run arctic-shift-backfill -- --years 5 --tickers-from .planning/v1-ticker-universe.txt` produces N CommunityChatter rows
2. CoVe + FinSentLLM ensemble can use backfilled corpus for training
3. Re-runs are no-ops (idempotent)
</success_criteria>

<output>
Create `.planning/phases/19-cipher-v2-0-excellence/19-C-11-SUMMARY.md` documenting:
- Production run results (n_rows ingested per ticker)
- Total runtime
- Any rate-limit observations (calibrates Assumption A6)
</output>
