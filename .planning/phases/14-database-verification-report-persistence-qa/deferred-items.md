# Deferred Items — Phase 14

## Pre-existing test failure (out of scope for Plan 01)

**File:** `src/lib/gemini-analysis.test.ts`
**Test:** `scrapeCommunitySentiment > Test 2: calls fc.scrape for pinned URLs and returns pinnedContent with scraped markdown`
**Status:** Was failing before Plan 01 started (confirmed in baseline run: 6 pre-existing failures)
**Description:** Test expects `result.pinnedContent` to contain `'reddit post content'` but receives `''`. The `scrapeCommunitySentiment` function returns an empty string instead of the mocked scraped content. This is unrelated to DB persistence or the id field fixes.
**Action needed:** Investigate `scrapeCommunitySentiment` mock setup in `gemini-analysis.test.ts` — the Firecrawl mock may not be wiring to the correct call path.
