// src/lib/sentiment/nli-verifier.ts
//
// Phase 19 / Plan 19-C-10 → Plan 19-C-08 — NLI verifier surface.
//
// HISTORY:
//   - 19-C-10 introduced this file as a thin placeholder shim that always
//     returned 'neutral' so the cross-class contradiction detector could ship
//     in detection-only mode without spinning up HF Inference.
//   - 19-C-08 (CoVe two-pass) ships the canonical implementation in
//     src/lib/reasoning/cove.ts. Per Plan 19-C-08 frontmatter and Plan 19-C-10's
//     own note ("Once 19-C-08 lands, this file becomes a re-export of
//     cove.nliVerify"), this module is now a re-export.
//
// Stable import path: every caller (and every vitest unit test that mocks the
// verifier) imports from '@/lib/sentiment/nli-verifier'. This file resolves
// that path forever; the impl moves under it.
//
// Contract (matches Plan 19-C-08 Task 3):
//   nliVerify(claim, evidence) → 'entail' | 'contradict' | 'neutral' | null
//
//   - 'entail'      : evidence supports the claim
//   - 'contradict'  : evidence contradicts the claim
//   - 'neutral'     : evidence is unrelated / unverifiable (or HF endpoint
//                     env var is unset — the safe-default keeps detection-only
//                     mode inert with zero false-positive warnings)
//   - null          : NLI inference errored (graceful degrade — caller treats
//                     as 'neutral' for severity computation)

export type NliLabel = 'entail' | 'contradict' | 'neutral';

export { nliVerify } from '@/lib/reasoning/cove';
