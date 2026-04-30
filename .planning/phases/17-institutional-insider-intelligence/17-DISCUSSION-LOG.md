# Phase 17: Institutional & Insider Intelligence — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in 17-CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-30
**Phase:** 17-institutional-insider-intelligence
**Areas discussed:** Signal-class shape, Data source choice, Pattern bucketing, Staleness handling

---

## Signal-Class Shape

### Q1 — How should the engine model 13F institutional and Form 4 insider signals?

| Option | Description | Selected |
|--------|-------------|----------|
| Two separate classes (Recommended) | signal_class adds 'institutional' + 'insider'. 4 signal classes total. 4-column EngineCalibrationPanel. | ✓ |
| One combined 'ownership' class | Single 'ownership' value with mixed pattern_keys. 3 classes total. | |
| Insider only this phase, defer 13F | Add 'insider' as third class; defer 13F to a later phase. | |

**User's choice:** Two separate classes
**Notes:** Different cadence (13F quarterly w/ 45d lag vs Form 4 within 2 biz days) and different actors (large funds vs executives) make the disagreement signal between them valuable.

### Q2 — How should they appear in the research report and EngineCalibrationPanel?

| Option | Description | Selected |
|--------|-------------|----------|
| One 'Smart Money Intelligence' section, two sub-cards (Recommended) | Single top-level report section with two sub-cards; 4-column calibration panel. | ✓ |
| Two separate report sections | Two top-level sections; 4-column panel. | |
| Fold into Engine Calibration only | No standalone report section; calibration panel only. | |

**User's choice:** One 'Smart Money Intelligence' section, two sub-cards

### Q3 — Horizon strategy

| Option | Description | Selected |
|--------|-------------|----------|
| All 4 classes share [3,7,14,30,60,90] with 30d primary (Recommended) | Same horizon set as Phase 16. | ✓ |
| Insider 30d primary; institutional 30d/60d/90d only | Drop short horizons for institutional. | |
| All 4 classes share, but extend to 180d | Add 180d as 7th horizon. | |

**User's choice:** All 4 classes share [3,7,14,30,60,90] with 30d primary

---

## Data Source Choice

### Q1 — Where should the engine fetch 13F and Form 4 data from?

| Option | Description | Selected |
|--------|-------------|----------|
| Finnhub for both (Recommended) | Already wired; one vendor. | (clarification) |
| SEC EDGAR direct | Free, raw XML, authoritative. | |
| Polygon for institutional, Finnhub for insider | Split vendor. | |
| Defer to researcher | Researcher validates first. | |

**User's choice:** "Finnhub if sufficient info, but we need something else if not." — clarification request that drove Q2.

### Q2 — Fallback policy

| Option | Description | Selected |
|--------|-------------|----------|
| Finnhub primary, SEC EDGAR fallback (Recommended) | Mirrors yahoo→finnhub→polygon merge. | ✓ |
| Finnhub primary, Polygon fallback | Polygon's 13F/Form 4 coverage is thinner. | |
| Finnhub only — no fallback this phase | Defer EDGAR to follow-on phase. | |
| Researcher validates first | Lock primary; planner adds fallback if coverage <95%. | |

**User's choice:** Finnhub primary, SEC EDGAR fallback

### Q3 — Merge layer

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse merge.ts pattern (Recommended) | Two new fetchers + two new merge functions; 'edgar' added to FieldOrigin. | ✓ |
| Self-contained per fetcher | Each fetcher handles own fallback internally. | |
| Single 'smart-money' fetcher | One module for both 13F + Form 4. | |

**User's choice:** Reuse merge.ts pattern

---

## Pattern Bucketing

### Q1 — Insider buckets

| Option | Description | Selected |
|--------|-------------|----------|
| 6 buckets, role bundled (Recommended) | cluster_buying, lone_buy, ceo_or_cfo_buy, cluster_selling, planned_sell_10b5_1, lone_sell. | |
| 8 buckets, finer role split | Adds ceo_buy, cfo_buy, director_buy as separate. Matches Phase 16 count. | ✓ (delegated) |
| 4 buckets, just direction + cluster | Drops 10b5-1 + role buckets. | |

**User's choice:** "whatever is best and optimal, impressive" — delegated to Claude.
**Claude's selection rationale:** 8 buckets — matches Phase 16 technical bucket count for engine-wide consistency at 192 cells per signal class; CEO/CFO/director split is the most-cited insider-alpha finding in research literature.

### Q2 — Institutional buckets

| Option | Description | Selected |
|--------|-------------|----------|
| 8 buckets, mirror insider count (Recommended) | Symmetric with insider class; 192 cells. | ✓ |
| 6 buckets, simpler | Drops smart_money_dispersion + contrarian_outflow. | |
| 10 buckets, finer fund-tier split | Adds tier-1 vs tier-2 fund separation. | |

**User's choice:** 8 buckets

### Q3 — Classifier

| Option | Description | Selected |
|--------|-------------|----------|
| Deterministic rules in TypeScript (Recommended) | insider-classifier.ts and institutional-classifier.ts; researcher pins thresholds. | ✓ |
| Haiku/Gemini classifies each snapshot | Per-snapshot LLM call. | |
| Hybrid — rules first, LLM tiebreak | Rules cover clear cases, LLM for ambiguous. | |

**User's choice:** Deterministic rules in TypeScript

---

## Staleness Handling

### Q1 — 13F latency policy

| Option | Description | Selected |
|--------|-------------|----------|
| Use latest filing as-is, attach age (Recommended) | Bucket from latest filing; data_age_days stored; outcome from snapshot_date forward. | ✓ |
| Discount confidence by filing age | Linear decay weight. | |
| Only snapshot when a new 13F drops | Event-driven institutional snapshots. | |
| Add 'fresh_vs_stale' as 5th cap-class dim | Doubles institutional cell space. | |

**User's choice:** Use latest filing as-is, attach age

### Q2 — Form 4 lookback window

| Option | Description | Selected |
|--------|-------------|----------|
| 30d trailing window (Recommended) | Aligns with 30d primary horizon. | ✓ |
| 60d trailing window | Better for thinly-traded mid/small caps. | |
| Decision window varies by cap_class | Large/mid 30d, small/micro 60d. | |
| Researcher empirically picks | Defer to researcher. | |

**User's choice:** 30d trailing window

### Q3 — Empty-data policy

| Option | Description | Selected |
|--------|-------------|----------|
| Skip the cell update for that class (Recommended) | null snapshot, learn cron skips that class on that snapshot. | ✓ |
| Add a 'silence' bucket | Treat absence as learnable. | |
| Backfill from prior snapshot | Carry forward yesterday's bucket. | |

**User's choice:** Skip the cell update for that class

---

## Claude's Discretion

- Insider bucket count chosen by Claude (8) when user delegated.
- Exact Finnhub endpoint paths — researcher confirms current API.
- EDGAR XML parsing approach — researcher recommends library or hand-rolled parser.
- Threshold values inside each classifier — researcher's empirical pass on real watchlist data.
- Internal field layout of `InsiderSnapshot` / `InstitutionalSnapshot` interfaces.
- Whether to expose 4-way agreement state in the report narrative or keep it panel-only.

## Deferred Ideas

- 180d horizon extension (insider clusters historically show alpha at 90–180d)
- Logistic-feature extension to institutional + insider (24-feature logistic, deferred until Beta cells stabilize)
- Tier-1 fund allowlist for finer institutional bucketing
- Hybrid LLM tiebreaker classifier
- Event-driven 13F refresh optimization
- 'Silence' as a learnable bucket
