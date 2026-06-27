---
checkpoint_date: 2026-06-27
checkpoint_type: soak-end-gate
verdict: NO-GO
relearn_complete_ack_recommendation: false
blocking_reasons:
  - relearn_complete_ack_never_flipped
  - posterior_shape_summary_all_pending
  - db_unreachable_from_ci_environment
---

# Phase 22 Wave 4 — Soak-End Checkpoint (2026-06-27)

**Checkpoint author:** Automated scheduled routine  
**Checkpoint scope:** STATUS CHECK ONLY — Wave 5 NOT executed  
**Verdict:** ❌ NO-GO — operator gate never completed

---

## 1. Soak Duration Verification

| Field | Value |
|-------|-------|
| `soak_start_iso` | `2026-06-13T01:07:10Z` |
| `soak_end_iso` (target) | `2026-06-27T01:07:10Z` |
| `soak_duration_days` | 14 |
| Today (UTC floor) | `2026-06-27T00:00:00Z` |
| Elapsed at midnight UTC | 13 days 22h 52m |
| Exact target met | **At 01:07:10 UTC today** — within 1h 07m of exact mark at checkpoint time |

**Duration verdict: ✅ PASSES** (the 14-day wall-clock target is met as of 01:07:10 UTC today, 2026-06-27, which is within the same calendar day this checkpoint was written).

The calendar gate is satisfied. This is **not** the blocking issue.

---

## 2. Operator Relearn Gate (`relearn_complete_ack`)

**Status: ❌ HARD BLOCK — operator Task 3 was never completed.**

Current `22-04-SOAK.md` frontmatter:

```yaml
relearn_complete_ack: false
posterior_shape_summary:
  per_regime_cell_counts:
    bull-low-vol:   pending_first_relearn
    bull-high-vol:  pending_first_relearn
    bear-low-vol:   pending_first_relearn
    bear-high-vol:  pending_first_relearn
    ALL:            pending_first_relearn
  meta_bh_promoted_regimes:        pending_first_relearn
  transition_exclusion_drop_count: pending_first_relearn
```

The Wave 4 Task 3 checkpoint (`checkpoint:human-action`) required the operator to:

1. Deploy Wave 4 to production
2. Invoke `curl -X POST "$VERCEL_URL/api/cron/learn" -H "Authorization: Bearer $CRON_SECRET"`
3. Inspect Vercel logs for `[cron:learn] regime-fdr` and `[cron:learn] regime-exclusion` lines
4. **Flip `relearn_complete_ack: true`** in `22-04-SOAK.md` frontmatter
5. Fill in `posterior_shape_summary` with observed per-regime cell counts

**None of steps 4–5 were completed.** The `relearn_complete_ack: false` flag is the literal gate read by `scripts/phase-22-status.ts` Task 0. `npm run phase-22-status` will exit 1 regardless of soak duration.

---

## 3. DB Query Results

**Status: ❌ UNABLE TO RUN — no DIRECT_URL in remote environment.**

The scheduled routine runs in an ephemeral cloud container. `.env.local` does not exist in the cloned repository (only `.env.example` and `.env.local.example` with placeholder values). No `DATABASE_URL` or `DIRECT_URL` environment variables were injected. Vercel CLI is not installed. `psql` is available but unusable without credentials.

**The 3 required queries could not be executed:**

### Query A — Learning events (expected: per-regime cell_promoted/cell_demoted)
```sql
-- COULD NOT RUN
SELECT event_type, regime, COUNT(*)
  FROM learning_events
 WHERE occurred_at > NOW() - INTERVAL '14 days'
 GROUP BY event_type, regime
 ORDER BY count DESC;
```
**Result:** N/A — no DB access

### Query B — Sentiment snapshots by regime (expected: distribution across 4 buckets)
```sql
-- COULD NOT RUN
SELECT regime, COUNT(*)
  FROM sentiment_snapshots
 WHERE scanned_at > NOW() - INTERVAL '14 days'
 GROUP BY regime
 ORDER BY count DESC;
```
**Result:** N/A — no DB access

### Query C — Distinct learn cycle dates (expected: ≥ 2 dates)
```sql
-- COULD NOT RUN
SELECT COUNT(DISTINCT occurred_at::date)
  FROM learning_events
 WHERE event_type = 'posterior_update'
   AND occurred_at > NOW() - INTERVAL '14 days';
```
**Result:** N/A — no DB access

**To run these queries:** use `psql "$DIRECT_URL"` from your local machine (where `.env.local` contains the Neon connection string), or query directly from the Neon console.

---

## 4. Wave 4 Hierarchical FDR Evidence Check

**Status: ❌ UNABLE TO VERIFY via DB** (same constraint as §3).

The check for at least one `cell_promoted` or `cell_demoted` LearningEvent with a non-NULL non-`'ALL'` `regime` value cannot be run from this environment.

**Code-level evidence** (from git history and SUMMARY review): Wave 4 shipped and the hierarchical BY-FDR logic is in production code (`src/app/api/cron/learn/route.ts` — commit `a518353`, 2026-06-13). The `[cron:learn] regime-fdr` + `[cron:learn] regime-exclusion` instrumentation log lines are live. But without DB access or Vercel log access, we cannot confirm live `/api/cron/learn` cycles actually fired and produced per-regime events during the 14-day window.

---

## 5. Go / No-Go Assessment

| Gate | Status | Notes |
|------|--------|-------|
| Soak duration ≥ 14 days | ✅ PASS | Exact 14-day mark reached today at 01:07:10 UTC |
| `relearn_complete_ack: true` | ❌ **FAIL — HARD BLOCK** | Still `false`; operator Task 3 never completed |
| `posterior_shape_summary` populated | ❌ **FAIL — HARD BLOCK** | All fields show `pending_first_relearn` |
| ≥ 2 learn cycles confirmed (DB) | ⚠️ UNKNOWN | DB unreachable from this environment |
| ≥ 1 per-regime cell event (DB) | ⚠️ UNKNOWN | DB unreachable from this environment |

**Verdict: `relearn_complete_ack: false` recommendation — NO-GO for Wave 5**

Wave 5 Task 0 (`scripts/phase-22-status.ts`) reads `relearn_complete_ack` from `22-04-SOAK.md`. With this flag `false`, the script exits 1 immediately with a blocking error before any done-gate evaluation runs. Even if the DB queries come back healthy, the script gate will not advance until the flag is manually flipped.

---

## 6. What TJ Must Do Before Running Wave 5

The 14-day calendar gate is done. The **only remaining blocker is the operator Task 3 handshake**. Complete these steps in order:

### Step A — Verify Wave 4 is deployed to production

Confirm the Wave 4 commits (through `8b44ccb`) are live on Vercel (check the Vercel dashboard or `git log --oneline` vs the production deployment).

### Step B — Trigger the relearn manually (if not already done automatically)

```bash
curl -X POST "$VERCEL_URL/api/cron/learn" \
  -H "Authorization: Bearer $CRON_SECRET"
```

Or wait for the next scheduled cron run if the Vercel scheduler is already configured.

### Step C — Inspect Vercel logs for regime instrumentation

Look for lines like:
```
[cron:learn] regime-fdr { per_regime_counts: {...}, meta_bh_promoted_regimes: [...] }
[cron:learn] regime-exclusion { cell: ..., total_obs: ..., excluded_for_flip: ..., kept: ... }
```

Record the per-regime cell counts (bull-low-vol, bull-high-vol, bear-low-vol, bear-high-vol, ALL).

### Step D — Flip the gate in `22-04-SOAK.md`

Edit `.planning/phases/22-market-regime-and-source-weights/22-04-SOAK.md` frontmatter:

```yaml
relearn_complete_ack: true          # ← flip this
posterior_shape_summary:
  per_regime_cell_counts:
    bull-low-vol:   <N from logs>   # ← fill from regime-fdr log
    bull-high-vol:  <N from logs>
    bear-low-vol:   <N from logs>
    bear-high-vol:  <N from logs>
    ALL:            <N from logs>
  meta_bh_promoted_regimes:         <list from logs>
  transition_exclusion_drop_count:  <N from logs>
```

Commit and push.

### Step E — Run Wave 5 Task 0 gate check

```bash
npm run phase-22-status
```

This will now pass if either: (a) ≥1 cell promoted, or (b) you add `--allow-null-finding` to accept the D-16 honest null finding.

### Step F — Then execute Wave 5

```
/gsd-execute-phase 22 --wave 5
```

Wave 5 Tasks 1–6 include the `regimeDoneGate` implementation, EngineCalibrationPanel "Source mix" row, the IRREVERSIBLE unique-constraint flip (operator-gated Task 5), and methodology paper bookkeeping.

---

## 7. Wave 5 Task List (for TJ's reference)

From `22-05-PLAN.md`:

| Task | Type | Description | Operator-gated? |
|------|------|-------------|-----------------|
| Task 0 | `checkpoint:human-verify` | Soak-gate — confirm 14 days elapsed + relearn_complete_ack=true | **YES** (this checkpoint) |
| Task 1 | `auto` (TDD) | Implement `regimeDoneGate` + `scripts/phase-22-status.ts` | No |
| Task 2 | `auto` (TDD) | Surface `calibration.source_mix` in `engine-context.ts` | No |
| Task 3 | `auto` (TDD) | EngineCalibrationPanel "Source mix" row + client-island expand | No |
| Task 4 | `auto` | Prisma schema for Migration 2 — files only, no push | No |
| Task 5 | `checkpoint:human-action` | **Operator runs `npx prisma db push`** (IRREVERSIBLE constraint flip) | **YES** |
| Task 6 | `auto` | ROADMAP + REQUIREMENTS bookkeeping + methodology paper section | No |

---

## 8. Additional Reminder

After Wave 5 lands, remember to update the **GSD MODEL_ALIAS_MAP** per the reminder in your local memory (`reminder-update-models-after-p22.md` in `~/.claude/projects/-Users-tj-Desktop-Cipher/memory/`). This routine cannot reach that file from the cloud environment.

---

*Checkpoint written by: Automated scheduled routine (Phase 22 soak-end gate)*  
*Source files read: `22-04-SOAK.md`, `22-04-SUMMARY.md`, `22-05-PLAN.md`, git log*  
*DB queries: NOT RUN (no DIRECT_URL in remote environment)*
