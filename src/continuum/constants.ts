/**
 * Continuum UI — tuning constants.
 * All thresholds live here so performance targets can be swept in one place.
 */

import type { LODTier, PerfTier } from './store/types';

/**
 * LOD switching thresholds, expressed in **squared** world-space distance
 * (avoid Math.sqrt in useFrame).
 *
 *   camera^2 < LOD3_MAX_SQ                 → LOD 3 (AAA hero)
 *   LOD3_MAX_SQ ≤ camera^2 < LOD2_MAX_SQ   → LOD 2 (mid textures)
 *   LOD2_MAX_SQ ≤ camera^2 < LOD1_MAX_SQ   → LOD 1 (fine blueprint)
 *   camera^2 ≥ LOD1_MAX_SQ                 → LOD 0 (coarse blueprint proxy)
 */
export const LOD_THRESHOLDS_SQ: Readonly<
  Record<'LOD3_MAX_SQ' | 'LOD2_MAX_SQ' | 'LOD1_MAX_SQ', number>
> = {
  LOD3_MAX_SQ: 5 * 5, // 5 world units — heroes only when very near
  LOD2_MAX_SQ: 12 * 12, // 12 world units
  LOD1_MAX_SQ: 24 * 24, // 24 world units
};

/**
 * Hysteresis band — added to a threshold when checking for a *downgrade* so the
 * camera must move notably further before stepping down. Prevents thrashing
 * when the camera hovers at the boundary.
 */
export const HYSTERESIS_SQ = 2 * 2; // 2-unit buffer, squared

/** Maximum LOD swaps per asset per second (see CLAUDE.md §7). */
export const MAX_SWAPS_PER_SEC = 2;
export const MIN_SWAP_INTERVAL_MS = 1000 / MAX_SWAPS_PER_SEC;

/** Dither-fade duration in seconds (see CLAUDE.md §8). */
export const LOD_FADE_SECONDS = 0.3;

/** VRAM budgets per performance tier, in bytes. */
export const VRAM_BUDGET_BYTES: Readonly<Record<PerfTier, number>> = {
  low: 128 * 1024 * 1024, // 128 MB
  mid: 512 * 1024 * 1024, // 512 MB
  high: 1024 * 1024 * 1024, // 1 GB
};

/** Max permitted LOD by perf tier. Hydrator writes this into each asset. */
export const MAX_LOD_BY_TIER: Readonly<Record<PerfTier, LODTier>> = {
  low: 1,
  mid: 2,
  high: 3,
};

/** Visual language tokens (for UI overlays — not the 3D materials). */
export const CONTINUUM_COLORS = {
  background: '#000000',
  accent: '#FF8C00',
  hairline: '#FFFFFF22',
} as const;

/** Skeleton Mirror rule: AABB parity tolerance (±1%) across tiers. */
export const SKELETON_MIRROR_TOLERANCE = 0.01;
