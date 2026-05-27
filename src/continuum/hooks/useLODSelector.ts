/**
 * useLODSelector — pure distance-to-squared LOD resolution with hysteresis.
 *
 * Intentionally NOT a React hook (no state, no effects); the name is kept for
 * the "selector" terminology. Factored out of `<ContinuumAsset />` so the math
 * is unit-testable in isolation.
 *
 * See CLAUDE.md §7 and constants.ts for the threshold policy.
 */

import { HYSTERESIS_SQ, LOD_THRESHOLDS_SQ } from '../constants';
import type { LODTier } from '../store/types';

export interface LODSelectionInput {
  /** Current squared distance from camera to asset origin. */
  readonly distanceSq: number;
  /** The asset's currently active LOD. */
  readonly currentLOD: LODTier;
  /** Upper bound on LOD set by useHydration (bandwidth/VRAM policy). */
  readonly maxLOD: LODTier;
}

/**
 * Return the LOD tier the asset should display this frame.
 *
 * Hysteresis: "upgrade" decisions use the raw threshold; "downgrade" decisions
 * require the camera to be past `threshold + HYSTERESIS_SQ`. This prevents
 * thrashing at boundaries.
 */
export const selectLOD = ({ distanceSq, currentLOD, maxLOD }: LODSelectionInput): LODTier => {
  const { LOD3_MAX_SQ, LOD2_MAX_SQ, LOD1_MAX_SQ } = LOD_THRESHOLDS_SQ;

  // Desired tier from distance alone (no hysteresis).
  let desired: LODTier;
  if (distanceSq < LOD3_MAX_SQ) desired = 3;
  else if (distanceSq < LOD2_MAX_SQ) desired = 2;
  else if (distanceSq < LOD1_MAX_SQ) desired = 1;
  else desired = 0;

  // Apply hysteresis to downgrades only (upgrades are cheap perceptually).
  if (desired < currentLOD) {
    // Require crossing the *upper* boundary of the current tier + buffer
    // before we actually step down.
    if (currentLOD === 3 && distanceSq < LOD3_MAX_SQ + HYSTERESIS_SQ) return 3;
    if (currentLOD === 2 && distanceSq < LOD2_MAX_SQ + HYSTERESIS_SQ) return 2;
    if (currentLOD === 1 && distanceSq < LOD1_MAX_SQ + HYSTERESIS_SQ) return 1;
  }

  // Clamp to the ceiling imposed by the hydrator.
  return Math.min(desired, maxLOD) as LODTier;
};
