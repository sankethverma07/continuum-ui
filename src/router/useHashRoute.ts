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

export type RouteKey = 'demo' | 'phone' | 'compare' | 'latency' | 'watch' | 'auto' | 'ab' | 'proxy' | 'scenes' | 'cloud' | 'benchmark';

const VALID: readonly RouteKey[] = ['demo', 'phone', 'compare', 'latency', 'watch', 'auto', 'ab', 'proxy', 'scenes', 'cloud', 'benchmark'] as const;
const DEFAULT_ROUTE: RouteKey = 'demo';

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
