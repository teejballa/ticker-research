// scripts/lib/phase-20-checks/index.ts
//
// Phase 20 / Plan 20-Z-06 — canonical 15-check registry.
//
// Order matches CONTEXT.md DoD numbering (#2 first, #16 last).
//
// IMPORTANT (mitigation T-20-Z-06-04): DoD #1 ("npm run phase-20-status exits 0")
// is the script's own ROLLUP exit code, NOT a sub-check. Including it here would
// create a circular check. The 15 entries below cover DoD #2 through #16 only.

import type { CheckFn } from './types';
import { checkGmeCrowdedConsensus } from './check-gme-crowded-consensus';
import { checkPerDocumentNlpCoverage } from './check-per-document-nlp-coverage';
import { checkSourceTierDataDriven } from './check-source-tier-data-driven';
import { checkTimeDecayIcirUplift } from './check-time-decay-icir-uplift';
import { checkPerSourceIcir30d } from './check-per-source-icir-30d';
import { checkBrier } from './check-brier';
import { checkEce } from './check-ece';
import { checkBotFilterFpAndCoordinationF1 } from './check-bot-filter-fp-and-coordination-f1';
import { checkNumericGrounding } from './check-numeric-grounding';
import { checkCitationCoverage } from './check-citation-coverage';
import { checkModelCardsFresh } from './check-model-cards-fresh';
import { checkLookaheadBias } from './check-lookahead-bias';
import { checkTelemetry7d } from './check-telemetry-7d';
import { checkFairnessAudit } from './check-fairness-audit';
import { checkFlagsGraduated } from './check-flags-graduated';

export const ALL_CHECKS: CheckFn[] = [
  checkGmeCrowdedConsensus,            // DoD #2  — sentiment branch
  checkPerDocumentNlpCoverage,         // DoD #3  — sentiment
  checkSourceTierDataDriven,           // DoD #4  — sentiment
  checkTimeDecayIcirUplift,            // DoD #5  — sentiment
  checkPerSourceIcir30d,               // DoD #6  — calibration
  checkBrier,                          // DoD #7  — calibration
  checkEce,                            // DoD #8  — calibration
  checkBotFilterFpAndCoordinationF1,   // DoD #9  — calibration
  checkNumericGrounding,               // DoD #10 — report
  checkCitationCoverage,               // DoD #11 — report
  checkModelCardsFresh,                // DoD #12 — hygiene
  checkLookaheadBias,                  // DoD #13 — hygiene
  checkTelemetry7d,                    // DoD #14 — hygiene
  checkFairnessAudit,                  // DoD #15 — hygiene
  checkFlagsGraduated,                 // DoD #16 — hygiene
];

export {
  checkGmeCrowdedConsensus,
  checkPerDocumentNlpCoverage,
  checkSourceTierDataDriven,
  checkTimeDecayIcirUplift,
  checkPerSourceIcir30d,
  checkBrier,
  checkEce,
  checkBotFilterFpAndCoordinationF1,
  checkNumericGrounding,
  checkCitationCoverage,
  checkModelCardsFresh,
  checkLookaheadBias,
  checkTelemetry7d,
  checkFairnessAudit,
  checkFlagsGraduated,
};
