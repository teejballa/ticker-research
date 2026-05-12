// TODO(20-A-02): replace with real volume-baselining median+MAD per cap_class.
/**
 * Plan 20-A-01 — TEMPORARY stub. Always returns 0.
 *
 * 20-A-02 will replace this file's content with:
 *   export { mentionZ } from '@/lib/sentiment/mention-z';
 *
 * Until then, V_thresh > 0 calibrated thresholds will never fire under shadow.
 * This is the intentional ordering invariant: 20-A-01 ships the predicate +
 * calibration scaffold so 20-A-02's mention_z output has a consumer ready on
 * day one. Cutover (shadow → on) can only be evaluated AFTER 20-A-02 lands.
 */
export function mentionZ(_observations: unknown[]): number {
  return 0;
}
