# Phase 30 D-21 — Firecrawl key rotation log

**Status:** **DEFERRED** — rotation skipped, full migration planned as sub-phase 30.1
**Decision date:** 2026-05-14
**Operator:** TJ

## Why deferred

The operator hit Firecrawl's free-tier limit and does not want to add another paid line item. Rotating the existing key would only reset usage; it does not solve the cost problem. Instead, Phase 30.1 (to be planned next) will design a free replacement architecture.

## Replacement direction (research summary 2026-05-14)

Cipher's actual Firecrawl footprint is narrow: `src/lib/data/lightweight-community-scan.ts` calls Firecrawl on exactly 5 Reddit search URLs per ticker. There is no Twitter, no general-web, and no JS-rendered-SPA usage.

**Most likely replacement for Reddit-only scope:** Reddit OAuth API (script-type app). Free tier is 100 QPM with no monthly cap; returns structured JSON (better quality than the current markdown regex extraction).

**Twitter / news / forum expansion** is explicitly out of Phase 30.1 scope unless retriggered: free Twitter/X scraping is effectively dead in 2026 (Nitter dormant, X free API limited to 1500 posts/month).

## D-22 status

D-22's "Exa migration trigger" (rotated key dies within one week) no longer applies — we are not rotating. Phase 30.1's research pass will compare Reddit OAuth API vs Exa vs other free options before locking the design.

## Impact on Phase 30 done-gates

- **Done-gate 1 (`ProviderCallLog.error_rate < 10%`):** Firecrawl will remain in BREACH until 30.1 ships the replacement. The Phase-30 alerting infrastructure (D-17 cron + D-19 dashboard tile) will correctly continue to surface this as an active alert. This is documented behavior, not a regression.
- **Done-gate 2 (Gemini cost):** Unaffected.
- **Done-gate 3 (cron HTTP 200 under provider outage):** Unaffected — `withBreaker` on Firecrawl ensures the cron returns 200 even with Firecrawl fully down (already shipped in Plan 30-03).

## Follow-up

After Phase 30 closes, run:

```
/gsd-insert-phase 30.1
```

…or simply `/gsd-discuss-phase 30.1` to start the migration discuss session.

---

*Original audit-log scaffold (unused) preserved below for the record.*

<details>
<summary>Original blank rotation procedure (DID NOT EXECUTE)</summary>

```
- [ ] Step 1 — Captured pre-rotation state
- [ ] Step 2 — Generated new key on Firecrawl dashboard
- [ ] Step 3 — Pushed new key to Vercel production + preview envs
- [ ] Step 4 — Redeployed production
- [ ] Step 5 — Verified new key works
- [ ] Step 6 — Revoked OLD key on Firecrawl dashboard
- [ ] Step 7 — Updated local .env.local
```

</details>
