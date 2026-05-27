/**
 * Complexity scoring + variable tier-count chooser.
 *
 * The core insight: a trivial cube does not need 7 LODs, a flagship shoe
 * does. Hard-coding 4 tiers wastes storage on the simple case and produces
 * perceptually jarring jumps on the complex case.
 *
 * This module:
 *   1. Scores an asset's rendering complexity from its metadata.
 *   2. Maps that score to a tier count between MIN_TIERS and MAX_TIERS.
 *   3. Produces a logarithmic schedule of decimation ratios (or quality
 *      fractions for images) so each tier roughly doubles the budget of
 *      the previous one — matching Weber-Fechner's rule that perceptual
 *      steps need to scale multiplicatively, not linearly.
 *
 * Empirical thresholds come from tuning against real product assets:
 *   - trivial cube / plane:        score  1–5     → 3 tiers
 *   - standard product (mug):      score  6–11    → 4 tiers
 *   - detailed product (watch):    score 12–19    → 5 tiers
 *   - complex (shoe, camera):      score 20–29    → 6 tiers
 *   - flagship (car, character):   score 30+      → 7 tiers
 */

import type { AssetMetadata, ImageMetadata, MeshMetadata } from './types.js';

export const MIN_TIERS = 3;
export const MAX_TIERS = 7;

// ---------------------------------------------------------------------------
// Public: score any asset, image or mesh.
// ---------------------------------------------------------------------------

export const complexityScore = (meta: AssetMetadata): number =>
  meta.kind === 'mesh' ? meshComplexity(meta) : imageComplexity(meta);

// ---------------------------------------------------------------------------
// Public: map a score to a tier count.
// ---------------------------------------------------------------------------

export const tierCountFor = (score: number): number => {
  if (score < 6) return 3;
  if (score < 12) return 4;
  if (score < 20) return 5;
  if (score < 30) return 6;
  return 7;
};

// ---------------------------------------------------------------------------
// Public: decimation / quality ratios for a given tier count.
//
// Index 0 is the coarsest LOD (highest compression / lowest poly). The
// final entry is always 1.0 (the original). Ratios are hand-tuned so the
// crossfade cadence stays perceptually even — each tier roughly doubles
// the budget of the previous one.
// ---------------------------------------------------------------------------

export const ratiosFor = (tierCount: number): ReadonlyArray<number> => {
  const clamped = Math.max(MIN_TIERS, Math.min(MAX_TIERS, tierCount));
  switch (clamped) {
    case 3:
      return [0.02, 0.3, 1.0];
    case 4:
      return [0.01, 0.08, 0.3, 1.0];
    case 5:
      return [0.008, 0.04, 0.15, 0.4, 1.0];
    case 6:
      return [0.005, 0.02, 0.08, 0.2, 0.5, 1.0];
    case 7:
    default:
      return [0.004, 0.015, 0.05, 0.15, 0.35, 0.65, 1.0];
  }
};

// ---------------------------------------------------------------------------
// Public: timeline schedule — when to cut from tier N to tier N+1, in ms,
// relative to hydration start. Total duration is also returned.
//
// Each step lands inside Doherty's 700ms perceived-continuity window. For
// higher tier counts the cadence compresses so the total never exceeds
// HARD_CEILING_MS — we'd rather have quicker micro-crossfades than drag
// the whole hydration out past the user's patience.
// ---------------------------------------------------------------------------

const DOHERTY_CEILING_MS = 700;
const HARD_CEILING_MS = 3200;

export interface TimelineStep {
  readonly tier: number;
  readonly atMs: number;
}

export const timelineFor = (tierCount: number): ReadonlyArray<TimelineStep> => {
  const clamped = Math.max(MIN_TIERS, Math.min(MAX_TIERS, tierCount));
  const rawTotal = DOHERTY_CEILING_MS * (clamped - 1);
  const scale = rawTotal > HARD_CEILING_MS ? HARD_CEILING_MS / rawTotal : 1;
  const stepMs = DOHERTY_CEILING_MS * scale;
  return Array.from({ length: clamped }, (_, i) => ({
    tier: i,
    atMs: Math.round(i * stepMs),
  }));
};

// ---------------------------------------------------------------------------
// Internal: image complexity.
// Images are simpler to score — resolution and alpha are the main drivers.
// A 4K image with alpha cost more to deliver and render than a 1K opaque one.
// ---------------------------------------------------------------------------

const imageComplexity = (meta: ImageMetadata): number => {
  const pixels = meta.width * meta.height;
  // log2(pixels / 65536) gives 0 at 256×256 and ~6 at 4K.
  const resScore = Math.max(0, Math.log2(pixels / (256 * 256)));
  const alphaScore = meta.hasAlpha ? 2 : 0;
  // File bytes as tie-breaker for compressed formats.
  const byteScore = Math.log2(Math.max(1, meta.bytes / 50_000));
  return resScore + alphaScore + byteScore;
};

// ---------------------------------------------------------------------------
// Internal: mesh complexity.
// Combines geometric, texture, material, and shader-feature dimensions.
// Each dimension is log-scaled so extreme values don't dominate.
// ---------------------------------------------------------------------------

const meshComplexity = (meta: MeshMetadata): number => {
  const triScore = Math.log2(Math.max(1, meta.triangles / 100)); // 0 at 100 tris
  const texScore =
    meta.textureCount * Math.log2(Math.max(256, meta.maxTextureRes) / 256);
  const matScore = meta.materialCount * 1.2;
  const shaderScore =
    (meta.hasNormalMap ? 1 : 0) +
    (meta.hasClearcoat ? 2 : 0) +
    (meta.hasTransmission ? 3 : 0) +
    (meta.hasSheen ? 1.5 : 0);
  const drawScore = Math.log2(Math.max(1, meta.drawCallEstimate));
  return triScore + texScore + matScore + shaderScore + drawScore;
};
