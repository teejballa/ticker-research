// Phase: 30 — Provider Health Hardening
// Phase 30 D-09
//
// RED-state scaffold for SourcePackage.fallback_summary plumbing:
//   { field: string; tried: ProviderId[]; resolved_by: ProviderId | 'unavailable' }[]
//
// Reports themselves do NOT render this — it's telemetry surfaced on
// `/insights/sentiment-health` via the fallback heatmap tile (D-10).
//
// Plan 30-02 introduces `fallback_summary` on the SourcePackage shape; until
// then every entry is a pending todo.

import { describe, it } from 'vitest';

describe('Phase 30 / D-09: SourcePackage.fallback_summary shape', () => {
  it.todo('D-09: fallback_summary entry has { field, tried: ProviderId[], resolved_by: ProviderId | "unavailable" }');
  it.todo('D-09: field served by polygon directly: tried=["polygon"], resolved_by="polygon"');
  it.todo('D-09: polygon null → finnhub returns value: tried=["polygon","finnhub"], resolved_by="finnhub"');
  it.todo('D-09: polygon null → finnhub null → yahoo returns value: tried order preserved, resolved_by="yahoo"');
  it.todo('D-09: all three nulls: tried=["polygon","finnhub","yahoo"], resolved_by="unavailable"');
  it.todo('D-09: fallback_summary is emitted per-field, not per-provider — one entry per merged field');
});
