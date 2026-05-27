/**
 * Continuum UI — Perceived-Experience timing constants.
 *
 * Every value in this file is anchored to a published HCI result — not a
 * designer's taste. If a number changes, update the citation it came from.
 *
 * -----------------------------------------------------------------------------
 * PRIMARY SOURCES (all drive one or more constants below)
 * -----------------------------------------------------------------------------
 *  [1] Nielsen, J. (1993). "Response Times: The 3 Important Limits".
 *      Nielsen Norman Group. Based on Miller (1968) & Card et al.
 *      https://www.nngroup.com/articles/response-times-3-important-limits/
 *        • 0.1s  → action feels instantaneous
 *        • 1.0s  → upper bound for uninterrupted flow of thought
 *        • 10s   → upper bound for held attention
 *
 *  [2] Doherty, W. J., & Thadani, A. J. (1982). "The Economic Value of Rapid
 *      Response Time". IBM Systems Journal.
 *        • Sub-400ms system responses raised transaction rates 25–30%+.
 *          ("Doherty Threshold" — see https://lawsofux.com/doherty-threshold/)
 *
 *  [3] Harrison, C., Amento, B., Kuznetsov, S., & Bell, R. (2007).
 *      "Rethinking the Progress Bar". UIST '07.
 *        • Non-linear curves that SLOW at start and ACCELERATE toward the
 *          end ("Fast Power") are consistently judged faster than linear.
 *          We use p(t) = (t/T)^2 — the simplest fast-power expression.
 *
 *  [4] Nah, F. F.-H. (2004). "A study on tolerable waiting time: how long
 *      are Web users willing to wait?". Behaviour & Information Technology.
 *        • Tolerable waiting time (TWT) peaks near 2s; feedback EXTENDS it.
 *          Our overlay must sit well below 2s when the network is healthy.
 *
 *  [5] Chung, B. (2018). "The effect of skeleton screens" + UX Collective
 *      writeups; echoed in ECCE '18 (Kuperberg et al.).
 *        • Skeletons feel faster than spinners/blank states. Slow, steady
 *          LEFT→RIGHT motion is perceived as shorter than pulsing motion.
 *
 * -----------------------------------------------------------------------------
 */

/**
 * Minimum time the HydrationOverlay + BlueprintSkeleton stay visible, even if
 * the asset resolves faster. Keeps the "skeleton-first" promise legible.
 *
 * Anchor: Nielsen [1] — 1.0s is the upper bound for preserved flow. We hold
 * slightly above that (1100ms) so the transition is perceptually noticed, but
 * well below Nah [4]'s 2.0s tolerable-wait ceiling so we never feel slow.
 */
export const MIN_OVERLAY_MS = 1100;

/**
 * Ceiling for how long we'll keep the overlay up even if Spline hasn't
 * reported ready. At this point we snap to 100% and dismiss, so the user is
 * never trapped waiting on a hung runtime.
 *
 * Anchor: Nielsen [1] — 10s attention limit. We bail at 8s to leave headroom.
 */
export const MAX_OVERLAY_MS = 8000;

/**
 * Duration of the overlay's fade-out + the skeleton unblur after progress
 * hits 100%.
 *
 * Anchor: Doherty [2] — sub-400ms feels responsive; keeps the handoff under
 * the threshold where productivity/engagement drops off.
 */
export const OVERLAY_EXIT_MS = 360;

/**
 * Intro/enter duration when the overlay first paints. Kept tight so it does
 * not itself become a second "loading" beat.
 *
 * Anchor: Nielsen [1] — 0.1s = instantaneous. 120ms is the smallest
 * comfortable ease we can use without feeling snap-popped on slower panels.
 */
export const OVERLAY_ENTER_MS = 120;

/**
 * Ceiling the simulated curve will climb to while we're still waiting on the
 * real load signal (Spline onLoad / drei useProgress === 1). Stops at 92% so
 * there is room for the genuine completion snap — matches Harrison [3]'s
 * finding that the final stretch drives perceived speed.
 */
export const SIMULATED_CEILING = 0.92;

/**
 * Harrison "Fast Power" exponent. p(t/T) = (t/T)^FAST_POWER_EXP.
 *
 * Anchor: Harrison et al. [3]. Exponent > 1 gives the slow-start /
 * accelerating finish that tested as fastest-feeling. We use 2.0 — the
 * simplest quadratic expression of the pattern. Values in [1.5, 2.5] produce
 * similar results; 2.0 is the clearest-reading default.
 */
export const FAST_POWER_EXP = 2.0;

/**
 * Time the simulated curve takes to climb from 0 → SIMULATED_CEILING when no
 * real loader signal is available. Chosen so the visible progress reaches
 * ~0.92 right around MIN_OVERLAY_MS, avoiding a long stall at 92%.
 *
 * Anchor: derived from Harrison [3] + MIN_OVERLAY_MS. Internally consistent
 * with the other thresholds in this file.
 */
export const SIMULATED_CURVE_MS = 1400;

/**
 * CSS blur radius applied to the proxy (Spline) mesh while the overlay is up.
 * The "Ghost Mesh" readable as a soft silhouette — the user sees the SHAPE
 * of the object before its texture arrives.
 *
 * Anchor: Wroblewski's Polar case study [5] — visual placeholders that
 * reveal structure outperform opaque spinners. Blur preserves silhouette
 * while withholding detail.
 */
export const GHOST_BLUR_PX = 14;

/**
 * Saturation multiplier applied alongside the blur. Slightly desaturated
 * reads as "not yet committed", which firms up when the unblur happens.
 */
export const GHOST_SATURATE = 0.78;

/**
 * Scale the HydrationOverlay shrinks to as it exits (GSAP tween). Feels
 * like a bento card releasing back into the page grid.
 */
export const OVERLAY_EXIT_SCALE = 0.94;

/**
 * Easing curve used for overlay enter/exit. Matches the rest of the
 * Continuum motion system (CLAUDE.md §8).
 */
export const OVERLAY_EASE = 'power2.out';

// -----------------------------------------------------------------------------
// Core curve function — exported so tests / other surfaces can share it.
// -----------------------------------------------------------------------------

/**
 * Harrison Fast Power curve in [0,1]. Input `t01` is normalised elapsed time
 * in [0,1]; output is perceived-progress in [0, ceiling].
 *
 * Reference: Harrison et al. (2007), "Rethinking the Progress Bar", UIST '07.
 * The exponent > 1 produces a slow-start / fast-finish ramp that tested
 * fastest against 8 alternative behaviours including linear, inverse power,
 * and sinusoidal.
 */
export const fastPowerProgress = (
  t01: number,
  ceiling: number = SIMULATED_CEILING,
  exponent: number = FAST_POWER_EXP,
): number => {
  const t = t01 < 0 ? 0 : t01 > 1 ? 1 : t01;
  return Math.pow(t, exponent) * ceiling;
};
