// src/lib/composite/types.ts
// Phase 24 Wave 0 — pin the CORP reliability shape at the composite boundary
// so Wave 3 cron uses the real type instead of the historical `as unknown as { bins? }`
// cast (Warning #6 in 24-REVISION-TODO.md). All downstream ECE computation MUST
// consume this type; if `recalibrated_curve` / `calibrated_probs` are missing at
// runtime, throw — do not silently default `ece` to 0.
export type { CorpReliabilityResult } from '@/lib/stats/isotonic';
