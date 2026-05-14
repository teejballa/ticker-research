// Phase: 30 — Provider Health Hardening
// Phase 30 D-24
//
// RED-state scaffold for the per-provider done-gate verdict query:
//   error_rate = SUM(status='error') / COUNT(*) over `started_at > now() - 24h`
//   - COUNT(*) < 50 → verdict=insufficient_history
//   - error_rate >= 0.10 → verdict=fail
//   - else → verdict=pass
//   dominant_error_class = MODE() over error_class column among status='error' rows
//
// Plan 30-04 implements `scripts/provider-health-verdict.ts` and the SQL helper.
// Until then every entry is a pending todo. This file runs under `npm run
// test:integration` against a live Neon connection (matches the
// `tests/integration/provider-call-log.integration.test.ts` pattern).

import { describe, it } from 'vitest';

describe('Phase 30 / D-24: per-provider done-gate verdict', () => {
  it.todo('D-24: returns verdict=insufficient_history when total_calls < 50 in 24h window');
  it.todo('D-24: returns verdict=pass when error_rate < 0.10 and total >= 50');
  it.todo('D-24: returns verdict=fail when error_rate >= 0.10');
  it.todo('D-24: dominant_error_class is the MODE() over error_class column among status=error rows');
  it.todo('D-24: 24h window is computed from now() at query time, not at process start');
  it.todo('D-24: per-provider verdicts include one row per distinct provider_id seen in the window');
});
