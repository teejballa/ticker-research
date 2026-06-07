/**
 * Public barrel export for src/lib/evaluation/
 *
 * All downstream consumers (Waves 3, 4, 5) should import from this barrel:
 *   import { bootstrapBCa, benjaminiYekutieli, ... } from '@/lib/evaluation';
 *
 * Internal helpers (rankWithTies, mulberry32, normalInv, etc.) are NOT
 * exported here — they remain private to their respective modules.
 */

export { bootstrapBCa, normalCdf, type BCaResult } from './bootstrap';
export { benjaminiYekutieli, type BYResult } from './fdr';
export {
  informationCoefficient,
  rollingIC,
  perSignalClassIC,
  type ICMethod,
  type RollingICPoint,
} from './ic';
export { deflatedSharpeRatio } from './dsr';
export { categoricalLogLoss } from './log-loss';
