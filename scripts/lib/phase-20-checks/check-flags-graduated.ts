// scripts/lib/phase-20-checks/check-flags-graduated.ts
// Owned by Phase-20 plans collectively — this script reads features.ts and asserts every Phase-20 flag is graduated/deferred.
//
// DoD #16 — reads src/lib/features.ts, finds Phase-20 flag identifiers
// (sourced from a static PHASE_20_FLAGS list mirroring the convention from
// model-card-status.ts PHASE_19_FLAGS at line 96), and asserts each is either
// ABSENT (graduated + cleanup done) OR present with an explicit `// DEFERRED:`
// comment with reason. Pass if every flag accounted for. Fail if any flag is
// in `off` or `shadow` state with no deferred-comment and no removal.

import type { CheckFn } from './types';

// Phase-20 feature flags. Each Phase-20 plan that introduces a flag must
// register it here so the gate knows what to inspect. Mirrors the
// PHASE_19_FLAGS convention from scripts/model-card-status.ts.
//
// Empty list is acceptable: it indicates either (a) no flags were introduced
// in Phase 20 yet, or (b) every flag has been removed. In either case the
// check passes vacuously — the inverse is enforced when individual plans
// register their flags here.
export const PHASE_20_FLAGS = [
  'per_document_nlp',
  'source_tier_data_driven',
  'crowded_consensus',
  'time_decay_per_source',
  'temperature_scaling',
  'per_source_icir',
  'brier_decomposition',
  'bot_filter',
  'coordinated_posting',
  'numeric_grounding',
  'citation_coverage_gate',
  'per_claim_verified',
] as const;

export const checkFlagsGraduated: CheckFn = async (deps) => {
  const base = {
    name: 'flags-graduated',
    dod_label: 'All flags graduated off → shadow → on, OR documented as deferred-to-next-phase with reason',
    blocker_for: 16,
    branch: 'hygiene',
  } as const;
  try {
    if (!deps.fs.existsSync(deps.featuresPath)) {
      return { ...base, status: 'pending', evidence: `features.ts not found at ${deps.featuresPath}` };
    }
    const body = deps.fs.readFileSync(deps.featuresPath);
    const violators: string[] = [];
    for (const flag of PHASE_20_FLAGS) {
      // Detect mention in features.ts (matches a likely flag identifier).
      const mentionRegex = new RegExp(`['"\`]?\\b${flag}\\b['"\`]?`);
      const mentioned = mentionRegex.test(body);
      if (!mentioned) {
        // Graduated + removed: pass for this flag.
        continue;
      }
      // Find any line containing the flag and check if it (or a line near it)
      // carries a `// DEFERRED:` comment with a reason.
      const lines = body.split('\n');
      let deferredOk = false;
      for (let i = 0; i < lines.length; i++) {
        if (!mentionRegex.test(lines[i])) continue;
        const window = [lines[i - 1] ?? '', lines[i], lines[i + 1] ?? ''].join('\n');
        if (/\/\/\s*DEFERRED:\s*\S/i.test(window)) {
          deferredOk = true;
          break;
        }
      }
      if (!deferredOk) {
        violators.push(flag);
      }
    }
    if (violators.length === 0) {
      return {
        ...base,
        status: 'pass',
        evidence: `${PHASE_20_FLAGS.length} Phase-20 flag(s) all either removed or have // DEFERRED: comment`,
      };
    }
    return {
      ...base,
      status: 'fail',
      evidence: `${violators.length}/${PHASE_20_FLAGS.length} Phase-20 flag(s) present without // DEFERRED: comment: ${violators.slice(0, 5).join(', ')}`,
    };
  } catch (err) {
    return { ...base, status: 'pending', evidence: `query failed: ${String(err)}` };
  }
};
