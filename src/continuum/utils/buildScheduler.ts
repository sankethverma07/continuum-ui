/**
 * buildScheduler — the timing brain for the progressive reveal engine.
 *
 * The decimator hands us N tiers. The progressive engine renders one or
 * two tiers per frame. This module decides, given the current time:
 *
 *   - Which tier should be active (currently building).
 *   - How many of that tier's triangles to render via setDrawRange().
 *   - Whether we're between tiers (crossfading from i → i+1).
 *   - When to start fading in the final material.
 *
 * Two design goals drive the math:
 *
 *   1. Seamless transitions even when LOD i+1 isn't a strict superset of
 *      LOD i. Decimators don't preserve triangle identity across ratios,
 *      so a hard swap looks like the model jumps. Solution: a short
 *      crossfade window where both tiers render at sub-1.0 opacity, with
 *      the outgoing tier's drawRange held at its max and the incoming
 *      tier's drawRange ramping from "what the previous tier had" up to
 *      its own max.
 *
 *   2. Time budget per tier proportional to triangle DELTA, not to tier
 *      index. A 6-tier ladder with counts [50, 200, 800, 3K, 15K, 80K]
 *      should NOT spend the same wall time on tier 0 as tier 5 — tier 0
 *      needs barely any time (the silhouette is sparse), tier 5 needs the
 *      lion's share so the build reads as a real refinement instead of
 *      "wireframe slammed in at the end". We allocate time on a sqrt
 *      curve of triangle delta — that's sublinear so the runway compresses
 *      without feeling rushed.
 *
 * Frame-rate-independent: all timing is wall-clock ms; the caller polls
 * `getState(elapsedMs)` from a useFrame callback every render.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TierBudget {
  readonly index: number;
  /** Triangles in this tier's decimated geometry. */
  readonly triangleCount: number;
  /** ms when this tier starts building (relative to `0` = build phase start). */
  readonly startMs: number;
  /** ms when this tier hits its full triangle count. */
  readonly buildEndMs: number;
  /** ms when this tier is no longer rendered (handed off to next tier). */
  readonly handoffMs: number;
}

export interface BuildPlan {
  /** ms duration of the wireframe-only build phase. Excludes hologram boot
   *  pre-roll and material reveal post-roll. */
  readonly buildPhaseMs: number;
  /** Per-tier time budgets. */
  readonly tiers: ReadonlyArray<TierBudget>;
  /** ms when material crossfade starts (always ≥ end of last tier's build). */
  readonly materialStartMs: number;
  /** ms when material is fully visible / wireframe gone. */
  readonly materialEndMs: number;
  /** Total duration of the whole reveal (build + material crossfade). */
  readonly totalMs: number;
}

export interface BuildFrame {
  /** Currently-rendering tier index. */
  readonly activeTier: number;
  /** How many triangles of the active tier to render via setDrawRange(). */
  readonly activeDrawCount: number;
  /** Opacity of the active tier (0 → 1). */
  readonly activeOpacity: number;
  /** When non-null, also render this tier crossfading in. */
  readonly crossfadeTier: number | null;
  /** drawCount for the crossfading tier (held at its full count during the swap). */
  readonly crossfadeDrawCount: number;
  /** Opacity of the crossfading tier (0 → 1). */
  readonly crossfadeOpacity: number;
  /** Material reveal progress 0 → 1. Engine fades hero in at this rate. */
  readonly materialReveal: number;
  /** Wireframe global fade — drops to 0 as material reveal completes. */
  readonly wireframeFade: number;
  /** Whether the schedule has finished playing. */
  readonly done: boolean;
}

export interface BuildSchedulerOptions {
  /** Total time the build phase should occupy. Sensible default 3500 ms. */
  readonly buildPhaseMs?: number;
  /** Width of the tier-to-tier crossfade window in ms. Default 240. */
  readonly crossfadeMs?: number;
  /** Width of the final material reveal in ms. Default 700. */
  readonly materialRevealMs?: number;
  /**
   * Power applied to triangle delta when allocating tier budgets. Higher
   * `pace` = more time on dense tiers, less on sparse. Default 0.5
   * (sqrt curve) — empirically reads as "smooth refinement".
   */
  readonly pace?: number;
}

// ---------------------------------------------------------------------------
// Plan construction
// ---------------------------------------------------------------------------

/**
 * Build a per-tier time budget from raw triangle counts.
 *
 * @param triCounts Triangle count per tier, sorted sparse → dense.
 * @returns A BuildPlan that allocates wall-clock time across tiers
 *          proportional to triangle DELTAs, leaving room for crossfades.
 */
export const planBuild = (
  triCounts: ReadonlyArray<number>,
  opts: BuildSchedulerOptions = {},
): BuildPlan => {
  const buildPhaseMs = opts.buildPhaseMs ?? 3500;
  const crossfadeMs = opts.crossfadeMs ?? 240;
  const materialRevealMs = opts.materialRevealMs ?? 700;
  const pace = opts.pace ?? 0.5;

  if (triCounts.length === 0) {
    return {
      buildPhaseMs: 0,
      tiers: [],
      materialStartMs: 0,
      materialEndMs: materialRevealMs,
      totalMs: materialRevealMs,
    };
  }

  // Allocate a "weight" per tier based on the DELTA in triangles from the
  // previous tier (or from zero for tier 0). Sublinear `pace` curve means
  // jumping from 50 → 1000 triangles doesn't get 20× the time of jumping
  // from 1000 → 1500 — the eye notices ratio, not absolute count.
  const weights: number[] = [];
  let prev = 0;
  for (let i = 0; i < triCounts.length; i++) {
    const tc = triCounts[i] ?? 0;
    const delta = Math.max(1, tc - prev);
    weights.push(Math.pow(delta, pace));
    prev = tc;
  }
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  // Total wall-time available for the BUILD phase MINUS the crossfade
  // overlaps (each pair-of-tiers overlap costs `crossfadeMs` of "shared"
  // time we don't want to double-count).
  const overlapCount = Math.max(0, triCounts.length - 1);
  const usableMs = Math.max(
    triCounts.length * 50, // hard floor: 50 ms per tier minimum
    buildPhaseMs - overlapCount * crossfadeMs,
  );

  // Per-tier base duration (build window before next tier takes over).
  const tiers: TierBudget[] = [];
  let cursor = 0;
  for (let i = 0; i < triCounts.length; i++) {
    const w = weights[i] ?? 1;
    const baseDur = (w / totalWeight) * usableMs;
    const startMs = cursor;
    const buildEndMs = cursor + baseDur;
    // Tier handoff: where the NEXT tier starts crossfading in. The active
    // tier hangs around for `crossfadeMs` after that to overlap.
    const handoffMs = i < triCounts.length - 1
      ? buildEndMs + crossfadeMs
      : buildEndMs;
    tiers.push({
      index: i,
      triangleCount: triCounts[i] ?? 0,
      startMs,
      buildEndMs,
      handoffMs,
    });
    cursor = buildEndMs; // next tier starts BEFORE current handoff (overlap)
  }

  // Material reveal kicks off as the LAST tier finishes its build.
  const lastTier = tiers[tiers.length - 1]!;
  const materialStartMs = lastTier.buildEndMs;
  const materialEndMs = materialStartMs + materialRevealMs;

  return {
    buildPhaseMs,
    tiers,
    materialStartMs,
    materialEndMs,
    totalMs: materialEndMs,
  };
};

// ---------------------------------------------------------------------------
// Frame evaluation
// ---------------------------------------------------------------------------

const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / Math.max(1e-6, e1 - e0)));
  return t * t * (3 - 2 * t);
};

/**
 * Evaluate the build plan at a given elapsed time and return what the
 * engine should render this frame.
 */
export const evaluateBuild = (
  plan: BuildPlan,
  elapsedMs: number,
): BuildFrame => {
  if (plan.tiers.length === 0) {
    return {
      activeTier: 0,
      activeDrawCount: 0,
      activeOpacity: 0,
      crossfadeTier: null,
      crossfadeDrawCount: 0,
      crossfadeOpacity: 0,
      materialReveal: 1,
      wireframeFade: 0,
      done: true,
    };
  }

  // Material reveal phase — wireframe collapses out FIRST in a sharp window,
  // then hero material snaps in immediately after.
  //
  // The two phases used to crossfade through each other across the full
  // material window; the eye reads that overlap as a "second build" because
  // the materials fill in section-by-section over a still-present wireframe.
  // Splitting the window into two sharp beats — wireframe gone → material
  // pops in — reads as a single clean build with a final polish stamp.
  const matSpan = Math.max(1, plan.materialEndMs - plan.materialStartMs);
  // Wireframe vanishes in the FIRST 40% of the material window.
  const wireframeFade = 1 - smoothstep(
    plan.materialStartMs,
    plan.materialStartMs + matSpan * 0.4,
    elapsedMs,
  );
  // Hero materials snap in during the LAST 60%, with a slight overlap
  // baked into the smoothstep so there's never an empty frame.
  const materialReveal = smoothstep(
    plan.materialStartMs + matSpan * 0.3,
    plan.materialEndMs,
    elapsedMs,
  );

  const done = elapsedMs >= plan.materialEndMs;

  // Find the active tier — the LAST tier whose startMs ≤ elapsedMs that
  // hasn't fully handed off yet.
  let activeIdx = 0;
  for (let i = 0; i < plan.tiers.length; i++) {
    const t = plan.tiers[i];
    if (t && t.startMs <= elapsedMs) activeIdx = i;
  }
  const active = plan.tiers[activeIdx]!;

  // Within the active tier, build progress = elapsed-into-tier / build-window.
  const tierLocal = Math.max(0, elapsedMs - active.startMs);
  const tierBuildSpan = Math.max(1, active.buildEndMs - active.startMs);
  const buildProgress = Math.min(1, tierLocal / tierBuildSpan);
  const activeDrawCount = Math.floor(active.triangleCount * buildProgress);

  // Crossfade window: between active.buildEndMs and active.handoffMs we
  // also render the next tier with growing opacity. The next tier's draw
  // count sits at its full count throughout the overlap (it's "ready and
  // waiting" to take over).
  let crossfadeTier: number | null = null;
  let crossfadeOpacity = 0;
  let crossfadeDrawCount = 0;
  if (
    activeIdx < plan.tiers.length - 1 &&
    elapsedMs >= active.buildEndMs &&
    elapsedMs <= active.handoffMs
  ) {
    crossfadeTier = activeIdx + 1;
    const next = plan.tiers[activeIdx + 1]!;
    crossfadeOpacity = smoothstep(
      active.buildEndMs,
      active.handoffMs,
      elapsedMs,
    );
    // The incoming tier hasn't started its OWN build yet during the
    // crossfade window — it appears at its full triangle count so the
    // viewer perceives "more detail just snapped in."
    crossfadeDrawCount = next.triangleCount;
  }

  // Active tier opacity: solidly 1.0 during its build phase, then fades
  // out across the crossfade window so the swap looks smooth.
  let activeOpacity = 1.0;
  if (
    activeIdx < plan.tiers.length - 1 &&
    elapsedMs >= active.buildEndMs &&
    elapsedMs <= active.handoffMs
  ) {
    activeOpacity = 1 - smoothstep(
      active.buildEndMs,
      active.handoffMs,
      elapsedMs,
    );
  }

  return {
    activeTier: activeIdx,
    activeDrawCount,
    activeOpacity,
    crossfadeTier,
    crossfadeDrawCount,
    crossfadeOpacity,
    materialReveal,
    wireframeFade,
    done,
  };
};

/**
 * Convenience: build a plan and return a `getFrame` closure. Callers in
 * useFrame loops can `const frame = scheduler.getFrame(elapsedMs)` per render.
 */
export interface BuildSchedulerInstance {
  readonly plan: BuildPlan;
  readonly getFrame: (elapsedMs: number) => BuildFrame;
}

export const createBuildScheduler = (
  triCounts: ReadonlyArray<number>,
  opts?: BuildSchedulerOptions,
): BuildSchedulerInstance => {
  const plan = planBuild(triCounts, opts);
  return {
    plan,
    getFrame: (elapsedMs: number) => evaluateBuild(plan, elapsedMs),
  };
};
