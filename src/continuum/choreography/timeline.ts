/**
 * Canonical Studio Timeline — v1
 * ---------------------------------------------------------------
 * The one reveal animation every Continuum asset plays.
 *
 * Each property listed below is a uniform that the runtime drives.
 * Values are computed by sampling the stage curves at the current
 * elapsed time and feeding the resulting numbers into the
 * onBeforeCompile-patched material shaders.
 *
 * Visual phases (matches tools/CHOREOGRAPHY.md):
 *
 *   0.0 – 0.4 s  · proxy wireframe silhouette only
 *   0.4 – 1.5 s  · ~10 % of surface triangles visible (organic scatter)
 *   1.5 – 2.5 s  · ~50 % coverage — the form reads clearly
 *   2.5 – 3.5 s  · 100 % coverage — matte volume, no textures yet
 *   3.5 – 4.2 s  · materials crossfade from matte → full PBR
 *
 * Iteration 1 collapses the five material-tier sub-stages into a
 * single `pbrMix` 0→1 ramp. Iteration 2 will split it into the five
 * named tiers (A · form, B · response, C · detail, D · color,
 * E · effects) once the material classifier is in place.
 */

export interface TimelineUniforms {
  /** Wireframe-proxy opacity. Fades in fast, holds during proxy stage, fades out. */
  readonly proxyOpacity: number;
  /** 0 → 1 ramp covering the three surface-reveal stages. Drives the per-fragment discard. */
  readonly surfaceReveal: number;
  /** 0 → 1 crossfade from matte form to full PBR materials. */
  readonly pbrMix: number;
  /** Cosmetic shimmer that pulses softly during the build. */
  readonly buildShimmer: number;
  /** Convenience: 0 → 1 across the whole timeline, for clients that want a single progress value. */
  readonly progress: number;
}

/** Total wall-clock duration of one reveal, in milliseconds. */
export const TIMELINE_TOTAL_MS = 4200;

/** Subtle tail after the last keyframe so the final state settles without snapping. */
export const TIMELINE_TAIL_MS = 200;

/** Length the runtime advertises to consumers (includes the tail). */
export const TIMELINE_RUNTIME_MS = TIMELINE_TOTAL_MS + TIMELINE_TAIL_MS;

/**
 * Smoothstep with adjustable midpoint. Cheaper than a full bezier and
 * accurate enough for the ramps below — every transition in this
 * timeline is conceptually a "fade in over a window."
 */
const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0 || 1), 0), 1);
  return t * t * (3 - 2 * t);
};

/** Inverse smoothstep — fades from 1 down to 0 across the window. */
const smoothfall = (edge0: number, edge1: number, x: number): number =>
  1 - smoothstep(edge0, edge1, x);

/**
 * Sample the canonical timeline at an elapsed time (ms). Returns the
 * uniform set the runtime should apply for that frame.
 */
export const sampleTimeline = (elapsedMs: number): TimelineUniforms => {
  // ── Stage windows (ms). Edit these to retime the reveal globally. ──
  const PROXY_IN_END   = 100;
  const PROXY_HOLD_END = 400;
  const PROXY_OUT_END  = 800;

  const SPARSE_END   = 1500;
  const DENSE_END    = 2500;
  const SURFACE_END  = 3500;

  const PBR_START = 3500;
  const PBR_END   = 4200;

  // ── proxyOpacity: 0 → 1 (fast) → hold → 0 (gentle handoff). ──
  let proxyOpacity = 0;
  if (elapsedMs < PROXY_IN_END) {
    proxyOpacity = smoothstep(0, PROXY_IN_END, elapsedMs);
  } else if (elapsedMs < PROXY_HOLD_END) {
    proxyOpacity = 1;
  } else if (elapsedMs < PROXY_OUT_END) {
    proxyOpacity = smoothfall(PROXY_HOLD_END, PROXY_OUT_END, elapsedMs);
  } else {
    proxyOpacity = 0;
  }

  // ── surfaceReveal: stays at 0 during proxy, ramps three-phase to 1. ──
  let surfaceReveal = 0;
  if (elapsedMs < PROXY_HOLD_END) {
    surfaceReveal = 0;
  } else if (elapsedMs < SPARSE_END) {
    // Gentle climb to 10 % coverage — feels like organic emergence.
    surfaceReveal = 0.1 * smoothstep(PROXY_HOLD_END, SPARSE_END, elapsedMs);
  } else if (elapsedMs < DENSE_END) {
    // Push to 50 % — the form becomes readable.
    surfaceReveal = 0.1 + 0.4 * smoothstep(SPARSE_END, DENSE_END, elapsedMs);
  } else if (elapsedMs < SURFACE_END) {
    // Land at 100 % — full coverage, still no PBR.
    surfaceReveal = 0.5 + 0.5 * smoothstep(DENSE_END, SURFACE_END, elapsedMs);
  } else {
    surfaceReveal = 1;
  }

  // ── pbrMix: 0 during the matte form stage, ramps to 1 at the end. ──
  const pbrMix = smoothstep(PBR_START, PBR_END, elapsedMs);

  // ── buildShimmer: small sin-wave during the surface stages, dies off after. ──
  const inBuild = elapsedMs > PROXY_HOLD_END && elapsedMs < SURFACE_END;
  const shimmerEnvelope = inBuild
    ? smoothstep(PROXY_HOLD_END, PROXY_HOLD_END + 300, elapsedMs) *
      smoothfall(SURFACE_END - 300, SURFACE_END, elapsedMs)
    : 0;
  const buildShimmer = shimmerEnvelope * (0.5 + 0.5 * Math.sin(elapsedMs * 0.012));

  const progress = Math.min(elapsedMs / TIMELINE_TOTAL_MS, 1);

  return { proxyOpacity, surfaceReveal, pbrMix, buildShimmer, progress };
};

/** Initial uniforms — what the renderer should show before time starts. */
export const INITIAL_UNIFORMS: TimelineUniforms = {
  proxyOpacity: 0,
  surfaceReveal: 0,
  pbrMix: 0,
  buildShimmer: 0,
  progress: 0,
};
