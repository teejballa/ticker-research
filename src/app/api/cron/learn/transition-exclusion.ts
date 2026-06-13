/**
 * Phase 22 Wave 4 — D-05 sample-relative transition-zone exclusion helper.
 *
 * Drops events where the predicting snapshot's regime differs from the regime
 * at outcome resolution time. Honest: only excludes genuinely ambiguous samples.
 *
 * Boundary semantics (R4):
 *   - flip mid-window or on the right boundary day → EXCLUDE (strict)
 *   - NULL at either end → KEEP (no flip detectable, fail-open)
 *   - 'ALL' on either side → KEEP (cold-start, regime conditioning not defined)
 *
 * Lives in its own module (not route.ts) because Next.js App Router route files
 * may only export a fixed set of names (GET/POST/runtime/maxDuration/dynamic/...).
 * A bare named export like `excludeTransitionZoneEvents` fails the build with
 * "is not a valid Route export field". Importing from a sibling module is fine.
 *
 * The "do not apply this filter inside the 'ALL' aggregate cell" rule lives in
 * the caller (`evaluateOneCell`) — the helper itself always KEEPS 'ALL' events.
 */
export function excludeTransitionZoneEvents<
  E extends { snapshot_regime: string | null; outcome_regime: string | null },
>(events: E[]): E[] {
  return events.filter((ev) => {
    const s = ev.snapshot_regime;
    const o = ev.outcome_regime;
    // NULL on either end → fail-open
    if (s == null || o == null) return true;
    // 'ALL' on either end → cold-start, no regime conditioning yet
    if (s === 'ALL' || o === 'ALL') return true;
    // Same regime → keep; cross-regime → exclude
    return s === o;
  });
}
