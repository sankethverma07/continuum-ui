/**
 * useAssetPriority — multi-signal pre-hydration priority writer.
 *
 * Produces a 0–1 score per asset from three *non-pointer* signals and
 * writes it to the store via `setPriority`. The cross-asset VRAM budget in
 * `useHydration` consumes this score to decide which assets earn their full
 * LOD ceiling and which get clamped when we're over-budget.
 *
 * Why not cursor position?
 *   Cursor-based heuristics silently penalise trackpad users, keyboard users,
 *   and anyone driving by Page Down / spacebar / swipe. The user may scroll
 *   a hero into the middle of the viewport and never move their pointer near
 *   it — and in that case the hero is *more* important, not less. The
 *   signals below key off the reading behaviour, not the input device.
 *
 * Signals (weighted and summed, then clamped to [0, 1]):
 *
 *   1. Viewport proximity — how much of the asset is on screen.
 *      Implemented via IntersectionObserver with granular thresholds
 *      (0, 0.25, 0.5, 0.75, 1.0) so we get a smooth ramp rather than a
 *      binary "visible" flag. Weight: 0.60.
 *
 *   2. Dwell — time (in ms) the asset has been at least 50% visible.
 *      Starts accumulating the moment intersectionRatio crosses 0.5,
 *      resets when it falls back under 0.5. Capped at 1200ms so that
 *      glancing past gets a lower score than stopping to look. Weight: 0.25.
 *
 *   3. Scroll stillness — inverse of recent scroll velocity. When the user
 *      is actively scrolling we don't want to commit hero-tier budget to
 *      whatever happens to be passing through the viewport; once scroll
 *      settles, we promote whatever they've landed on. Module-level
 *      tracker so all heroes share one listener. Weight: 0.15.
 *
 * The hook is self-contained: it registers its own observers on mount and
 * tears them down on unmount. Priority is quantized to 2dp in the store
 * to prevent per-frame re-render storms.
 */

import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { useContinuumStore } from '../store/useContinuumStore';

// --- module-level scroll velocity tracker -----------------------------------
// One listener shared across every <VariableTierImageHero /> /
// <SweepRevealHero /> on the page. `scrollVelocityPxPerMs` is a simple
// exponential moving average of |delta| / delta-t — NOT a signed value,
// because up vs down doesn't change how "busy" the user is.

let scrollListenerAttached = false;
let lastScrollY = typeof window !== 'undefined' ? window.scrollY : 0;
let lastScrollAt = typeof performance !== 'undefined' ? performance.now() : 0;
let scrollVelocityPxPerMs = 0;

const SCROLL_SMOOTHING = 0.2; // 0.2 = ~5-sample EWMA — fast enough to feel responsive
const SCROLL_DECAY_MS = 250;  // after N ms of no scroll events, decay to 0

const ensureScrollListener = (): void => {
  if (scrollListenerAttached || typeof window === 'undefined') return;
  scrollListenerAttached = true;

  const onScroll = (): void => {
    const now = performance.now();
    const dt = now - lastScrollAt;
    if (dt <= 0) return;
    const dy = Math.abs(window.scrollY - lastScrollY);
    const instantaneous = dy / dt; // px / ms
    // EWMA so a single flick doesn't spike us for seconds.
    scrollVelocityPxPerMs =
      SCROLL_SMOOTHING * instantaneous + (1 - SCROLL_SMOOTHING) * scrollVelocityPxPerMs;
    lastScrollY = window.scrollY;
    lastScrollAt = now;
  };

  // Passive listener so the browser's scroll thread is never blocked.
  window.addEventListener('scroll', onScroll, { passive: true });

  // Decay loop: if no scroll events fire for SCROLL_DECAY_MS, fade velocity
  // toward 0 so stillness gets registered.
  const decay = (): void => {
    const now = performance.now();
    if (now - lastScrollAt > SCROLL_DECAY_MS) {
      scrollVelocityPxPerMs *= 0.7;
      if (scrollVelocityPxPerMs < 0.001) scrollVelocityPxPerMs = 0;
    }
    window.setTimeout(decay, 120);
  };
  decay();
};

/** 0 (still) → 1 (actively scrolling fast). */
const getScrollStillnessScore = (): number => {
  // 2 px/ms is "briskly scrolling" — above that we treat as fully in-flight.
  const v = Math.min(scrollVelocityPxPerMs / 2, 1);
  return 1 - v;
};

// --- weights ----------------------------------------------------------------
const W_VIEWPORT = 0.6;
const W_DWELL = 0.25;
const W_STILLNESS = 0.15;

const DWELL_CAP_MS = 1200;
const DWELL_TRIGGER_RATIO = 0.5;

// --- hook -------------------------------------------------------------------

/**
 * Wire multi-signal priority for one asset.
 *
 * @param id   The asset ID already registered via useContinuumStore.registerAsset().
 * @param ref  Ref to the DOM element that represents the asset's bounding box
 *             on screen (the hero's outer container). IntersectionObserver
 *             keys off of this element.
 */
export const useAssetPriority = (
  id: string,
  ref: RefObject<HTMLElement | null>,
): void => {
  // Keep latest signals in refs so the rAF writer can read them without
  // triggering re-renders or re-creating observers.
  const ratioRef = useRef<number>(0);
  const dwellStartRef = useRef<number | null>(null);
  const dwellAccumRef = useRef<number>(0);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === 'undefined') return;

    ensureScrollListener();

    // IntersectionObserver with staggered thresholds → smooth 0..1 ratio.
    const thresholds: number[] = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1.0];
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          ratioRef.current = entry.intersectionRatio;
          // Dwell bookkeeping — runs on the same entries callback so we
          // don't need a separate timer.
          if (entry.intersectionRatio >= DWELL_TRIGGER_RATIO) {
            if (dwellStartRef.current === null) {
              dwellStartRef.current = performance.now();
            }
          } else {
            if (dwellStartRef.current !== null) {
              dwellAccumRef.current += performance.now() - dwellStartRef.current;
              dwellStartRef.current = null;
            }
          }
        }
      },
      { threshold: thresholds },
    );
    io.observe(el);

    // Priority writer — runs on a rAF loop so we compose the latest
    // signals exactly once per frame, never faster.
    let rafId = 0;
    const writePriority = (): void => {
      const ratio = ratioRef.current;

      // Live dwell time = accumulated + whatever's currently accruing.
      const now = performance.now();
      const liveDwell =
        dwellStartRef.current !== null
          ? dwellAccumRef.current + (now - dwellStartRef.current)
          : dwellAccumRef.current;
      const dwellScore = Math.min(liveDwell / DWELL_CAP_MS, 1);

      const stillness = getScrollStillnessScore();

      // Combine: viewport is the dominant signal, dwell refines it, stillness
      // gates against "scrolled past" over-promotion.
      const raw =
        W_VIEWPORT * ratio +
        W_DWELL * dwellScore +
        W_STILLNESS * stillness * ratio;

      // Clamp + forward to store. The store quantizes to 2dp so idle rAF
      // frames don't spam setState.
      useContinuumStore.getState().setPriority(id, raw);

      rafId = window.requestAnimationFrame(writePriority);
    };
    rafId = window.requestAnimationFrame(writePriority);

    return () => {
      window.cancelAnimationFrame(rafId);
      io.disconnect();
      // Reset dwell state so a remount doesn't start with stale accumulation.
      dwellStartRef.current = null;
      dwellAccumRef.current = 0;
    };
  }, [id, ref]);
};
