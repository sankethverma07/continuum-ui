/**
 * useHashRoute — 30-line hash-based router.
 *
 * Three routes:
 *   - 'demo'    → Continuum ingest + hydration demo (the perfected showcase)
 *   - 'phone'   → GALAXY Z Fold product page (uniform LOD hydration)
 *   - 'compare' → Semantic vs uniform progressive rendering research surface
 *
 * Reads `window.location.hash`, strips the leading `#/`, returns the route
 * key. Subscribes to `hashchange` so swapping tabs in the switcher bar
 * updates every consumer synchronously.
 *
 * No dependencies, no history API, no boilerplate. Perfect for a demo site.
 */

import { useEffect, useSyncExternalStore } from 'react';

export type RouteKey =
  | 'brief'     // Chapter 0 — PM brief: research, sprint, A/B, decision log
  | 'problem'   // Chapter 1 — frame the user problem
  | 'latency'   // Chapter 2 — bad route #1 (spinner death)
  | 'ab'        // Chapter 3 — bad route #2 (low-poly swap)
  | 'insight'   // Chapter 4 — texture-streaming analogy + 7-week timeline
  | 'proxy'     // Chapter 5 — fix #1: position-only proxy paint
  | 'watch'     // Chapter 6 — fix #2: tier-by-tier geometry build
  | 'compare'   // Chapter 7 — fix #3: PBR material crossfade
  | 'cloud'     // Chapter 8 — R&D side path (ColorCloud splat)
  | 'scenes'    // Chapter 9 — the full choreography (McLaren)
  | 'phone'     // Chapter 10 — the perfected product page (Galaxy Z Fold)
  // Secondary / utility routes, not in the chapter arc:
  | 'demo'      // engine showcase landing (legacy default)
  | 'auto'      // drop-any-glb sandbox
  | 'benchmark';// cold-cache load timings

const VALID: readonly RouteKey[] = [
  'brief', 'problem', 'latency', 'ab', 'insight', 'proxy', 'watch',
  'compare', 'cloud', 'scenes', 'phone',
  'demo', 'auto', 'benchmark',
] as const;

// Chapter 00 (the PM brief) is the new front door. A visitor lands on
// the decision-log view first; the engineering chapters live behind it.
const DEFAULT_ROUTE: RouteKey = 'brief';

/** Parse `window.location.hash` → a RouteKey, defaulting to 'demo'.
 *  Takes only the first segment so `#/auto/skull` and `#/auto?asset=x`
 *  both still resolve to the 'auto' route — page-level code is free to
 *  read the rest of the hash itself. */
const parseHash = (): RouteKey => {
  const raw = window.location.hash.replace(/^#\/?/, '').trim();
  const first = raw.split(/[/?#]/)[0] ?? '';
  return (VALID as readonly string[]).includes(first) ? (first as RouteKey) : DEFAULT_ROUTE;
};

/** Subscribe to `hashchange` for useSyncExternalStore. */
const subscribe = (cb: () => void): (() => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};

/** Imperative navigation — call from a click handler. */
export const navigate = (next: RouteKey): void => {
  if (window.location.hash !== `#/${next}`) {
    window.location.hash = `#/${next}`;
    // Reset scroll when changing demos so each demo starts at the top.
    window.scrollTo(0, 0);
  }
};

/**
 * React hook: returns the current RouteKey.
 * Uses useSyncExternalStore for tear-free updates under concurrent rendering.
 */
export const useHashRoute = (): RouteKey => {
  // On first mount, normalize the hash to always start with `#/`. This keeps
  // the first-visit URL looking like `localhost:5173/#/demo` instead of `/`.
  useEffect(() => {
    if (!window.location.hash) {
      window.location.hash = `#/${DEFAULT_ROUTE}`;
    }
  }, []);

  return useSyncExternalStore(subscribe, parseHash, () => DEFAULT_ROUTE);
};
