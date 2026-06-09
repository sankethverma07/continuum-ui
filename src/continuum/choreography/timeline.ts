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
  /**
   * The SIGNATURE moment — wireframe edges build up triangle-by-triangle
   * from 0 to 1, drawn as `EdgesGeometry` line segments using the same
   * seeded scatter the surface uses. Reads as "blueprint construction."
   */
  readonly wireframeReveal: number;
  /**
   * Wireframe edges fade out as the solid surface fills in. 1 at the
   * peak of the wireframe build, 0 by the time the matte form is complete.
   */
  readonly wireframeFadeOut: number;
  /**
   * Uniform-sized triangles rise from beneath the surface and settle
   * into place. 0 = none risen, 1 = all settled. Drives the particle
   * layer (see risingTriangles.ts).
   */
  readonly trianglesReveal: number;
  /**
   * Particle layer fades to invisible once the actual mesh takes over.
   * 0 = visible, 1 = gone.
   */
  readonly trianglesFadeOut: number;
  /** 0 → 1 ramp for the actual mesh surface (discard threshold). */
  readonly surfaceReveal: number;
  /** 0 → 1 crossfade from matte form to full PBR materials. */
  readonly pbrMix: number;
  /** Cosmetic shimmer that pulses softly during the build. */
  readonly buildShimmer: number;
  /** Convenience: 0 → 1 across the whole timeline, for clients that want a single progress value. */
  readonly progress: number;
}

/** Total wall-clock duration of one reveal, in milliseconds. */
export const TIMELINE_TOTAL_MS = 6400;

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
  // Six visible acts:
  //   PROXY        —    0 –  400 · soft silhouette flash
  //   WIREFRAME    —  400 – 2400 · the signature blueprint construction
  //   TRIANGLES    — 2400 – 4400 · uniform triangles rise from below the
  //                                surface and settle, forming clusters
  //   WIRE FADE    — 3200 – 4000 · wireframe hands off
  //   TRI FADE/    — 4200 – 5200 · particle triangles fade as the actual
  //   SURFACE                       mesh emerges through them
  //   PBR          — 5400 – 6400 · matte → full materials
  const PROXY_IN_END   = 100;
  const PROXY_HOLD_END = 400;
  const PROXY_OUT_END  = 900;

  const WIRE_BUILD_START = 400;
  const WIRE_BUILD_PEAK  = 2400;
  const WIRE_FADE_START  = 3200;
  const WIRE_FADE_END    = 4000;

  const TRI_RISE_START = 2400;
  const TRI_RISE_END   = 4400;     // all triangles settled
  const TRI_FADE_START = 4400;
  const TRI_FADE_END   = 5400;     // particles fully gone

  const SURFACE_START = 4200;      // actual mesh begins to appear
  const SURFACE_END   = 5400;      // actual mesh fully visible

  const PBR_START = 5400;
  const PBR_END   = 6400;

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

  // ── wireframeReveal: the SIGNATURE moment. Edges build up from 0 → 1
  //    during the wireframe stage, then stay at 1 until the fade-out. ──
  let wireframeReveal = 0;
  if (elapsedMs >= WIRE_BUILD_START) {
    wireframeReveal = smoothstep(WIRE_BUILD_START, WIRE_BUILD_PEAK, elapsedMs);
  }

  // ── wireframeFadeOut: 1 while wireframe is the star, fades to 0 as
  //    the solid surface takes over. ──
  let wireframeFadeOut = 0;
  if (elapsedMs < WIRE_BUILD_START) {
    wireframeFadeOut = 0;
  } else if (elapsedMs < WIRE_FADE_START) {
    wireframeFadeOut = 1;
  } else if (elapsedMs < WIRE_FADE_END) {
    wireframeFadeOut = smoothfall(WIRE_FADE_START, WIRE_FADE_END, elapsedMs);
  } else {
    wireframeFadeOut = 0;
  }

  // ── trianglesReveal: particle rise ramp 0 → 1 across TRI stage. ──
  let trianglesReveal = 0;
  if (elapsedMs < TRI_RISE_START) {
    trianglesReveal = 0;
  } else if (elapsedMs < TRI_RISE_END) {
    trianglesReveal = smoothstep(TRI_RISE_START, TRI_RISE_END, elapsedMs);
  } else {
    trianglesReveal = 1;
  }

  // ── trianglesFadeOut: particles vanish as actual mesh emerges. ──
  let trianglesFadeOut = 0;
  if (elapsedMs < TRI_FADE_START) {
    trianglesFadeOut = 0;
  } else if (elapsedMs < TRI_FADE_END) {
    trianglesFadeOut = smoothstep(TRI_FADE_START, TRI_FADE_END, elapsedMs);
  } else {
    trianglesFadeOut = 1;
  }

  // ── surfaceReveal: actual mesh discard threshold. Stays at 0 (everything
  //    discarded, mesh invisible) until the particles have done their job. ──
  let surfaceReveal = 0;
  if (elapsedMs < SURFACE_START) {
    surfaceReveal = 0;
  } else if (elapsedMs < SURFACE_END) {
    const t = (elapsedMs - SURFACE_START) / (SURFACE_END - SURFACE_START);
    surfaceReveal = t * t * (3 - 2 * t);
  } else {
    surfaceReveal = 1;
  }

  // ── pbrMix: 0 during the matte form stage, ramps to 1 at the end. ──
  const pbrMix = smoothstep(PBR_START, PBR_END, elapsedMs);

  // ── buildShimmer: pulses across the wireframe + triangles stages. ──
  const inBuild = elapsedMs > PROXY_HOLD_END && elapsedMs < TRI_RISE_END;
  const shimmerEnvelope = inBuild
    ? smoothstep(PROXY_HOLD_END, PROXY_HOLD_END + 300, elapsedMs) *
      smoothfall(TRI_RISE_END - 400, TRI_RISE_END, elapsedMs)
    : 0;
  const buildShimmer = shimmerEnvelope * (0.5 + 0.5 * Math.sin(elapsedMs * 0.012));

  const progress = Math.min(elapsedMs / TIMELINE_TOTAL_MS, 1);

  return {
    proxyOpacity,
    wireframeReveal,
    wireframeFadeOut,
    trianglesReveal,
    trianglesFadeOut,
    surfaceReveal,
    pbrMix,
    buildShimmer,
    progress,
  };
};

/** Initial uniforms — what the renderer should show before time starts. */
export const INITIAL_UNIFORMS: TimelineUniforms = {
  proxyOpacity: 0,
  wireframeReveal: 0,
  wireframeFadeOut: 0,
  trianglesReveal: 0,
  trianglesFadeOut: 0,
  surfaceReveal: 0,
  pbrMix: 0,
  buildShimmer: 0,
  progress: 0,
};
