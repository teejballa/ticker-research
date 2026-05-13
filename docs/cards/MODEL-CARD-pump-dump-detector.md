---
model_name: pump-dump-detector
model_version: pdd-v1.0
card_format: mitchell-2019
last_validated: 2026-05-13
retrain_cadence: P90D
author: tjameswalsh@icloud.com
source_files:
  - src/lib/sentiment/pump-dump-detector.ts
---

# Model Card — Pump-and-Dump Cluster Detector (Phase 20-C-04)

**Component:** `src/lib/sentiment/pump-dump-detector.ts` `detectManipulation()` + `isPumpAndDumpPattern()`
**Plan:** 20-C-04 (Phase 20 Wave C)
**Status:** shadow → on (target — graduates after ≥30d shadow + F1 ≥ 0.6 + specificity ≥ 0.95 on synthetic eval + zero operator FP complaints)
**Last validated:** 2026-05-13 (synthetic eval seeded — first production calibration row lands on the next weekly cron run)

## 1. Model details

Rule-based pure-math 5-condition AND-predicate over sentiment features. NO ML;
no learned parameters; thresholds are literal constants from Nam & Yang 2023 §4.
Implementation: `src/lib/sentiment/pump-dump-detector.ts`.

**Predicate** (returns `false` if ANY input is null — insufficient-data is
NEVER a default-on fire):

```
is_warning = (mention_z > 5)
          && (bull_pct > 95)
          && (gini > 0.7)
          && (mean_account_age_days < 90)
          && (cap_class ∈ {small_cap})
```

Inputs map to upstream signals:
- `mention_z` — 20-A-02 `mentionZScore()` (cap-class-aware MAD-scaled z-score)
- `bull_pct` — existing aggregator bull percentage (0–100)
- `gini` — 20-A-04 `computeAuthorConcentration()` (author Gini coefficient)
- `mean_account_age_days` — 20-Z-01 `author_features_snapshot.account_age_days`
- `cap_class` — `src/lib/diffusion-trace.ts` `classifyCapClass()`

Returns `{ is_warning, matched_rules, rule_version }` — `matched_rules` is the
lexicographically-sorted subset of per-rule fires (independent of the AND-gate
verdict), enabling FP-rate review during shadow gate. `rule_version` (`pdd-v1.0`)
is persisted per `ManipulationWarning` row so historical warnings remain
attributable to the threshold set in force at write-time.

## 2. Intended use

Surface coordinated pump-and-dump patterns at the top of the research report
via a dismissable warning banner. Surveillance / explainability signal, NOT a
trading signal. Operator (and user) review remains the gate of record — the
detector reports observations, the user dismisses if false-positive (24h TTL
via localStorage).

NOT intended for: enforcement decisions, trade-blocking, or any
account-suspension workflow. The detector is a research-context cue.

## 3. Calibration data

**Synthetic eval set:** `scripts/eval-pump-dump-synthetic.ts` generates a
balanced 500-per-class deterministic synthetic corpus driven by a seeded RNG.
Reports F1, sensitivity, specificity, and `rule_version`. CLI exits 1 when
`F1 < 0.6` OR `specificity < 0.95` (regression gate).

**Production calibration:** weekly synthetic eval via
`/api/cron/eval-pump-dump-synthetic` (`'0 9 * * 2'` UTC). Regression status
surfaced via the cron response `status` field (`ok` | `regression` | `error`).

**Retrain cadence:** P90D — quarterly review of thresholds against trailing
90d operator-flagged warnings + Nam & Yang 2023 update tracking.

## 4. Performance / acceptance criteria

Published Nam & Yang 2023 baseline on real-world confirmed P&D events:
- F1 = 0.67
- Sensitivity = 0.85 (true-positive rate)
- Specificity = 0.99 (true-negative rate)

Cipher synthetic-eval acceptance:
- **F1 ≥ 0.6** AND **specificity ≥ 0.95** on the 500-per-class synthetic eval
- Regression status `'regression'` triggers operator review; sustained failure (2 consecutive weekly runs) requires threshold re-derivation under a new RULE_VERSION.

17 unit tests in `tests/unit/pump-dump-detector.unit.test.ts` enforce:
- All 32 AND-gate truth-table combinations
- Null-input handling (returns false on any null mention_z / gini / account_age)
- `matched_rules` lexicographic sort + per-rule fire independence
- `RULE_VERSION` constancy

## 5. Known failure modes

- **Insufficient data:** any of `mention_z`, `gini`, `mean_account_age_days`
  null → returns `is_warning=false` AND populates `matched_rules` only for
  the sub-conditions with non-null inputs. This is by design — null-input is
  NEVER a default-on fire. Tracked via 20-Z-03 telemetry counter
  `manipulation_warning.null_input` per condition.
- **Non-small_cap tickers:** the AND-gate cannot fire on large_cap / mid_cap /
  unknown. Nam & Yang 2023 §4 explicitly scopes P&D to {micro, small} which
  Cipher maps to `{small_cap}` per HYPERPARAMETERS.md. Future plan may revisit
  if a documented mid-cap P&D event emerges — would require RULE_VERSION bump.
- **Authentic small-cap rallies misflagged:** the predicate cannot distinguish
  a legitimate coordinated retail rally on an undervalued small-cap from an
  orchestrated P&D. Mitigation: 24h dismissal TTL via localStorage + operator
  monthly review of `matched_rules` distribution. Cresci 2019 §3 bot-filter
  (20-C-03) upstream reduces the most-egregious bot clusters before they
  enter the aggregator.
- **Brand-new ticker, no 20-Z-01 author features:** `mean_account_age_days`
  null → predicate returns false → no banner. Correct conservative default.
- **Threshold drift:** Nam & Yang 2023 thresholds may degrade as P&D
  patterns evolve. Quarterly threshold review + weekly synthetic-eval
  regression gate together bound this risk. RULE_VERSION attribution policy
  preserves historical interpretability.

## 6. Ethical considerations

- **No PII rendered:** banner shows only the aggregate verdict and the list
  of matched rule names (e.g., `bull_pct, gini, mention_z`). No author IDs,
  no per-message attribution.
- **Dismissability:** user-dismiss is a first-class operation
  (24h TTL via localStorage). The detector reports; the user decides
  whether to act on the cue.
- **False-positive risk on legitimate retail rallies:** acknowledged in §5
  Known Failure Modes. Mitigation = dismissable banner + operator review +
  no enforcement coupling.
- **Threat-model defense:** ManipulationWarning rows are immutable
  (append-only); `rule_version` field on every row enables historical
  re-evaluation under newer thresholds without rewriting history.
- **Scope discipline:** detector is a surveillance signal ONLY. It does
  NOT feed buy/hold/sell logic, the diffusion learning engine, or any
  trade-blocking workflow.

## 7. Retrain cadence

- **Synthetic eval:** weekly via `/api/cron/eval-pump-dump-synthetic`
  (`'0 9 * * 2'` UTC).
- **Threshold review:** quarterly (P90D) — operator review of FP/FN log +
  literature tracking on P&D research updates.
- **Algorithm (predicate structure):** out-of-scope for routine retrain;
  re-derivation requires new RULE_VERSION + retroactive eval against the
  trailing 90d ManipulationWarning corpus.

## 8. References

- Nam, S., & Yang, J. (2023). "Detecting pump-and-dump schemes on financial
  social media." *Decision Support Systems* 165.
  https://arxiv.org/pdf/2301.11403
- Mitchell, M. et al. (2019). "Model Cards for Model Reporting."
  *Proceedings of FAT* 2019*. https://arxiv.org/abs/1810.03993
- 20-Z-02 model card schema (already live — `check-model-cards` CI gate).
- Cresci, S., Lillo, F., Regoli, D., Tardelli, S., & Tesconi, M. (2019).
  "Cashtag piggybacking: Uncovering spam and bot activity in stock
  microblogs on Twitter." *ACM TWEB* 13(2). (Upstream bot-filter; 20-C-03.)

## Spot-check log

| Date | Ticker | mention_z | bull_pct | gini | account_age_d | cap_class | is_warning | matched_rules | Operator notes |
|------|--------|-----------|----------|------|---------------|-----------|------------|---------------|----------------|
| pending | — | — | — | — | — | — | — | — | First entry lands at cutover. |
