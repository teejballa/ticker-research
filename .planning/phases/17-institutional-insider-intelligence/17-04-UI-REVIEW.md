---
phase: 17
plan: 04
type: ui-review
reviewed_at: 2026-04-30
reviewer: gsd-executor (claude-sonnet-4-6)
overall_score: 21/24
---

# Phase 17 Plan 04 — UI Review

> 6-pillar visual audit of the QuadClassPanel (EngineCalibrationPanel.tsx Task 4) and SmartMoneyIntelligence section (ResearchReport.tsx Task 5) against 17-UI-SPEC.md.
>
> Audit conducted via code review against 17-UI-SPEC.md + screenshot readback of 6 Playwright screenshots (3 from Task 6 engine-calibration-quad.spec.ts + 3 from Task 7 smart-money-asymmetric.spec.ts).

---

## Pillar 1: Copywriting — 4/4

**Findings:**

- AgreementBadge states (ALIGNED / MIXED / OPPOSED / UNKNOWN) match UI-SPEC §C locked copy verbatim. Tooltip strings confirmed against spec.
- QuadClassPanel column eyebrows ("DIFFUSION", "TECHNICAL", "INSTITUTIONAL", "INSIDER") match §A.
- HorizonTable header labels ("DIFFUSION POST.", "TECHNICAL POST.", "INST. POST.", "INSIDER POST.", "DIFFUSION CI", "TECHNICAL CI", "INST. CI", "INSIDER CI", "N · STATUS") match §B.
- "Quad-Class Engine Alignment" consolidated block label matches §D locked copy.
- SmartMoneyIntelligence section header "Smart Money Intelligence" and caption "What institutions and insiders did with this name in the last filing window." confirmed in ResearchReport.tsx per §E spec.
- Bucket label maps (INSTITUTIONAL_BUCKET_LABEL, INSIDER_BUCKET_LABEL) in both EngineCalibrationPanel.tsx and ResearchReport.tsx use the correct display labels as specified in §A.
- Placeholder text "No recent smart money activity to report.", "No recent 13F filings", "No recent Form 4 filings" match §E copy.
- "30 days is the primary horizon" footer note preserved from Phase 16, unchanged.

**Score: 4/4 — all copy verbatim per UI-SPEC.**

---

## Pillar 2: Visuals — 3/4

**Findings:**

- QuadClassPanel 4-column grid (1→2→4 breakpoints at mobile/md/lg) renders correctly at 1920×1080 per screenshot: ALIGNED badge centered above grid, four columns with ACTIVE badges and posterior metric cards.
- AgreementBadge centered above grid via `flex justify-center mb-4` wrapping div — confirmed via screenshot y-coordinate assertion (badge.y < grid.y).
- HorizonTable visible at 1920×1080 with CI columns showing. At 1279px CI columns correctly hidden via `hidden xl:table-cell`, posterior columns remain visible.
- SmartMoneyIntelligence section: 2-column grid for asymmetric state (InstitutionalFlowCard or placeholder + InsiderActivityCard or placeholder) — layout confirmed in e2e Test 1.
- Both sub-cards use `bg-surface-container-high p-4 rounded-lg border border-surface-container-highest` shell matching §E spec.
- Bucket pills use `font-mono text-xs font-bold px-2 py-0.5 rounded-full border` with correct semantic color classes per card (secondary for accumulation/bullish buckets, error for distribution/bearish).

**Minor finding:** Screenshots from Task 7 capture the bottom viewport area (Engine Calibration panel) rather than the SmartMoneyIntelligence section above it. This is a viewport framing issue in the test screenshot, not a rendering defect — the section rendered correctly as confirmed by all `toBeVisible()` assertions passing. A `fullPage: true` screenshot or a scroll-into-view before screenshot would improve visual attestation in future specs.

**Score: 3/4 — layout correct, screenshot framing could be improved.**

---

## Pillar 3: Color — 4/4

**Findings:**

- `--color-secondary` (teal #66d9cc): correctly assigned to INSTITUTIONAL identity — `InstitutionalFlowCard` header icon + label use `text-secondary`, ALIGNED badge uses `text-secondary border-secondary/40 bg-secondary/10`, ACTIVE status pill uses `bg-secondary/20 text-secondary border-secondary/40`.
- `--color-tertiary` (amber #ffb95f): correctly assigned to INSIDER identity — `InsiderActivityCard` header icon + label use `text-tertiary`, MIXED badge uses `text-tertiary border-tertiary/40 bg-tertiary/10`, EXPLORATORY status pill uses `bg-tertiary/20 text-tertiary border-tertiary/40`.
- `--color-primary` (blue): correctly used for 30d★ primary horizon row only (`border-primary bg-primary/5`).
- `--color-error` (red): correctly used for OPPOSED badge, DEPRECATED status, and null placeholder card `border border-error/10` variant.
- `--color-surface` / `--color-surface-container` / `--color-surface-container-high` nesting preserved correctly throughout both components.
- Positive/negative value coloring in share counts and net value uses `text-secondary` (positive) and `text-error` (negative) — consistent with rest of system.

**Score: 4/4 — color token assignment matches UI-SPEC exactly.**

---

## Pillar 4: Typography — 4/4

**Findings:**

- Column eyebrows: `text-[10px] font-bold tracking-widest uppercase` — confirmed present for DIFFUSION, TECHNICAL, INSTITUTIONAL, INSIDER labels.
- MetricCard label: `text-[10px] font-bold tracking-widest uppercase text-on-surface-variant` — inherits Phase 16 pattern, unchanged.
- MetricCard value: `font-mono text-2xl font-bold text-on-surface tabular-nums` — confirmed.
- MetricCard sub-value: `text-[11px] font-mono text-on-surface-variant` — confirmed.
- HorizonTable uses `text-xs font-mono` for numeric values, `text-[10px] font-bold uppercase tracking-wider` for headers — correct.
- SmartMoneyIntelligence body prose: `text-xs text-on-surface-variant leading-relaxed` — confirmed.
- Net value in InsiderActivityCard: `font-mono font-bold` with semantic color — confirmed.
- All numeric values in both components use JetBrains Mono (`font-mono`) as required.
- Two-weight system (400 regular / 700 bold) maintained throughout.

**Score: 4/4 — typography system applied consistently.**

---

## Pillar 5: Spacing — 3/4

**Findings:**

- QuadClassPanel grid gap: `gap-6` (24px) — matches `lg` spacing token per UI-SPEC.
- SmartMoneyIntelligence section: `p-6` outer padding (24px) — correct.
- Sub-card inner padding: `p-4` (16px) — matches `md` token.
- AgreementBadge wrapper: `mb-4` (16px below badge, before grid) — correct.
- Section header: `mb-5` (20px) for header before content — minor: 20px is not a clean 8-point grid multiple. `mb-4` (16px) or `mb-6` (24px) would be more consistent.
- InsiderActivityCard / InstitutionalFlowCard internal spacing: `space-y-1.5` (6px) for metric rows — this is a 6px gap, which is not strictly on the 8-point grid. The existing pattern from Phase 16 uses `gap-1.5` in MetricCards, so this is inherited behavior, not a new deviation.
- `mb-3` (12px) used between bucket pill and metrics — 12px is a half-point deviation (should be 8px or 16px). Inherited from the existing sub-card shell pattern.

**Score: 3/4 — three minor non-8-point-grid spacings (mb-5, space-y-1.5, mb-3), all inherited from existing Phase 16 patterns. Not introduced by this phase.**

---

## Pillar 6: Experience Design — 3/4

**Findings:**

- QuadClassPanel graceful degradation: when institutional/insider columns are NO_DATA (omitted fields), columns render with `opacity-60` class and "No recent filings" subtext — confirmed via BLOCKER 2 test.
- SmartMoneyIntelligence both-null state: section header always renders for visual consistency (old reports show same header structure). Confirmed in e2e Test 2.
- AC4 asymmetric state: 2-column grid is maintained even when one side is null (placeholder card rendered in the null slot). Layout never collapses — confirmed by Test 1 assertions.
- AgreementBadge tooltip accessible via `title` attribute — present but NOT accessible to keyboard/screen readers without focus management. Minor accessibility gap: the badge is not keyboard-focusable (it's a `<span>` not `<button>`).
- CI columns have `title` attribute on each posterior `<td>` for hover-reveal of hidden CI values at `<xl` breakpoints — confirmed via Test 2 `titleAttr` assertion.
- `data-testid` attributes present on all major elements for reliable test targeting: `engine-calibration-panel`, `agreement-badge`, `horizon-table`, `smart-money-intelligence`, `institutional-flow-card`, `insider-activity-card`, `institutional-flow-placeholder`, `insider-activity-placeholder`.
- `aria-label="primary horizon"` on the 30d★ star marker — accessible.
- FilingAgeChip: color changes at 30d/60d thresholds (neutral → amber → error) — UX signal for data staleness.
- AgreementBadge and CI tooltip are the only two interaction affordances with no keyboard path. Both are read-only displays, not interactive controls, so this is acceptable but noted.

**Score: 3/4 — AC4 asymmetric handling excellent. AgreementBadge keyboard accessibility could be improved (tooltip visible only on hover, not focusable).**

---

## Summary

| Pillar | Score |
|--------|-------|
| Copywriting | 4/4 |
| Visuals | 3/4 |
| Color | 4/4 |
| Typography | 4/4 |
| Spacing | 3/4 |
| Experience Design | 3/4 |
| **Overall** | **21/24** |

## Top Fixes (optional, non-blocking)

1. **Screenshot framing (Task 7 spec):** Take screenshots with `page.locator('[data-testid="smart-money-intelligence"]').scrollIntoViewIfNeeded()` before the screenshot call to capture the SMI section in the viewport rather than the Engine Calibration panel below it.

2. **AgreementBadge keyboard accessibility:** Convert the `<span>` to a `<button type="button" role="status" tabIndex={0}>` so the tooltip is accessible via keyboard focus (not just hover). Non-blocking — the badge is display-only.

3. **Spacing normalization (mb-5):** The `mb-5` (20px) in SmartMoneyIntelligence section header could be changed to `mb-4` or `mb-6` to stay on the 8-point grid. Inherited from existing pattern; low priority.

---

## UI Review Complete

**Phase 17-04 UI implementation is production-quality.** All locked copy, color token assignments, typography, and AC4 asymmetric handling are implemented correctly per 17-UI-SPEC.md. The three minor findings above are non-blocking refinements.
