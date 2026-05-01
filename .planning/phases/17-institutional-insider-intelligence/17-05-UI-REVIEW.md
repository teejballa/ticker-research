# Phase 17-05 UI Review — Smart Money Pattern Library Tabs

**Audited component:** `SmartMoneyPatternLibrarySection` in `src/components/InsightsDashboard.tsx`
**Tabs added:** Institutional Pattern Library + Insider Pattern Library
**Screenshots verified via Read tool:** `test-results/insights-institutional.png`, `test-results/insights-insider.png`
**Review date:** 2026-04-30

---

## 6-Pillar Audit

### Pillar 1: Visual Hierarchy & Layout

**Rating: PASS**

- Section uses `my-12 border border-outline-variant/30` — consistent with `TechnicalPatternLibrarySection` border treatment.
- Header block: label in `text-[10px] tracking-[0.4em] text-primary/70 font-mono uppercase` matches established pattern.
- h2 heading at `text-base font-bold tracking-tight` — consistent with other library sections.
- Star (★) on primary 30d horizon correctly placed inline after the heading.
- Segmented horizon control (`3D 7D 14D 30D★ 60D 90D`) is immediately visible below the description copy, matches Phase 16 layout exactly.
- Table layout: pattern key column (left) + 3 cap_class columns — consistent with `TechnicalPatternLibrarySection` column order.

### Pillar 2: Color & Typography

**Rating: PASS**

- Empty state text: `text-on-surface-variant text-sm` — matches design system neutral tone for data-pending states.
- Loading state: `text-on-surface-variant text-sm font-mono animate-pulse` — matches Phase 16 loading copy.
- ACTIVE badge: `text-secondary border-secondary/40 bg-secondary/10` — matches system-wide ACTIVE color.
- DEPRECATED badge: `text-error border-error/40 bg-error/10` — correct.
- NO_DATA badge: `text-outline border-outline-variant/40 bg-surface-container-low opacity-30` — correct muted treatment.
- EXPLORATORY badge: `text-outline border-outline-variant/40 bg-surface-container-low border-dashed` — correct dashed border.
- All text uses design-system tokens; no hardcoded hex colors.

### Pillar 3: Spacing & Density

**Rating: PASS**

- Section padding: `p-6 md:p-8` for header, `px-6 py-4` for table cells — matches Phase 16 pattern library.
- Table row bottom border: `border-outline-variant/10` — consistent light separator.
- Primary horizon row left accent: `border-l-2 border-l-primary` when `selectedHorizon === PRIMARY_HORIZON` — correctly highlights 30d row.
- No layout collapse issues visible in screenshot (1024px-wide viewport).
- `overflow-x-auto` on table wrapper prevents horizontal overflow on narrow screens.

### Pillar 4: Interaction & States

**Rating: PASS**

- Horizon segmented control: active segment uses `bg-primary text-on-primary`, inactive uses `bg-surface text-on-surface-variant hover:text-on-surface` — correct hover affordance.
- Loading state: `animate-pulse` provides feedback during API fetch.
- Empty state: "No patterns yet — backfill is still running." — clear, actionable messaging.
- Tab activation triggers lazy fetch via `useEffect([fetchUrl])` — no double-fetch on tab switch.
- `cancelled` ref pattern prevents state update on unmounted component.

### Pillar 5: Accessibility

**Rating: PASS**

- Section has `aria-label={title}` on the `<section>` element.
- Horizon control has `role="tablist"` with `aria-label="Horizon"` and each button has `role="tab"` + `aria-selected`.
- Table has semantic `<thead>` / `<tbody>` / `<th>` / `<td>` markup.
- Star rendered as inline text with `aria-label="Primary horizon"` on the span.
- Empty and loading states are visible text (not icon-only).

### Pillar 6: Design System Consistency

**Rating: PASS**

- Component is a drop-in sibling of `TechnicalPatternLibrarySection` — same border, header, and table structure.
- `SMART_MONEY_CAP_COL_ORDER` matches `TECH_CAP_COL_ORDER` — same 3 cap_class columns.
- `SMART_MONEY_CAP_LABEL` matches `TECH_CAP_LABEL` — same display strings.
- Horizon constants reuse module-level `HORIZONS` and `PRIMARY_HORIZON` — no duplication.
- `data-testid="smart-money-grid"` added to `<table>` for Playwright targeting — does not interfere with design.
- isNew badges on new tabs + isNew:false on Phase 16 tabs — correctly reflects maturity tiers.

---

## Screenshot Attestation

Screenshots captured at:
- `/Users/tj/Desktop/Cipher/.claude/worktrees/agent-a4d1fed7/test-results/insights-institutional.png`
- `/Users/tj/Desktop/Cipher/.claude/worktrees/agent-a4d1fed7/test-results/insights-insider.png`

Both screenshots confirmed via Read tool:
- 6-tab strip visible with "INSTITUTIONAL PATTERN LIBRARY · NEW" and "INSIDER PATTERN LIBRARY · NEW" labels
- Active tab underlined in primary color
- Section heading with "30d horizon ★" visible
- Horizon segmented control (30D★ highlighted)
- Empty state "No patterns yet — backfill is still running." visible (expected pre-backfill)
- Footer and nav consistent with existing dashboard layout

---

## Findings Summary

No blocking issues. All 6 pillars pass. The `SmartMoneyPatternLibrarySection` is a faithful clone of `TechnicalPatternLibrarySection` with configurable fetch URL and descriptive copy — the design is correct and consistent with the existing insights dashboard.

One deviation from plan template (lint fix): removed `setLoading(true)` from inside `useEffect` body — ESLint rule `react-hooks/exhaustive-deps` variant flagged it as a synchronous setState-in-effect. Fixed by relying on `useState(true)` initial state since `fetchUrl` is stable per tab instance.
