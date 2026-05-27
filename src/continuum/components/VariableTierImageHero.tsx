/**
 * <VariableTierImageHero /> — plays an N-tier hydration sequence from a
 * catalog entry.
 *
 * Given a catalog row written by the ingest pipeline, this component:
 *   1. Pre-fetches every tier URL on mount (they're all small compared to
 *      a single GLB, so paying upfront gives us zero-jitter crossfades).
 *   2. Fades through tiers on the Doherty-windowed timeline (see
 *      catalog/timeline.ts — adapts to the catalog's tier count).
 *   3. Reports progress into the Continuum hydration store so the rest of
 *      the system (Inspector, HUD, agentic policy) can observe it.
 *
 * This is the 2D-image counterpart to StreamingBottleHero (which handled
 * a hard-coded 4-tier live R3F mesh). The mesh pipeline variant comes next.
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import type { CatalogEntry, CatalogLODTier } from '../catalog/types';
import { timelineFor, totalDurationMs } from '../catalog/timeline';
import { useContinuumStore } from '../store/useContinuumStore';
import { useAssetPriority } from '../hooks/useAssetPriority';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface VariableTierImageHeroProps {
  /** Catalog entry produced by the ingest pipeline. */
  readonly entry: CatalogEntry;
  /**
   * Stable id used to register with the hydration store. Defaults to the
   * catalog entry id but can be overridden if one entry is shown in
   * multiple places on the same page.
   */
  readonly registryId?: string;
  /** Aspect ratio of the container — defaults to the hero tier's. */
  readonly aspectRatio?: string;
  /** Optional style override for the container. */
  readonly style?: React.CSSProperties;
  /** Fires once every tier has been shown and the hero is stable. */
  readonly onHydrated?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const VariableTierImageHero = ({
  entry,
  registryId,
  aspectRatio,
  style,
  onHydrated,
}: VariableTierImageHeroProps) => {
  const id = registryId ?? entry.id;
  const timeline = useMemo(() => timelineFor(entry.tierCount), [entry.tierCount]);
  const totalMs = useMemo(
    () => totalDurationMs(entry.tierCount),
    [entry.tierCount],
  );
  const heroTier = entry.tiers[entry.tierCount - 1];
  const inferredAspect =
    aspectRatio ??
    (heroTier?.width && heroTier?.height
      ? `${heroTier.width} / ${heroTier.height}`
      : '1 / 1');

  const [activeTier, setActiveTier] = useState<number>(0);
  const startedAtRef = useRef<number>(performance.now());
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Pre-hydration priority: viewport proximity + dwell + scroll stillness.
  // Writes to the store which feeds the cross-asset VRAM budget policy.
  useAssetPriority(id, containerRef);

  // -------------------------------------------------------------------
  // Pre-fetch every tier URL so the crossfades have zero image jitter.
  // The browser's image cache holds on to these for subsequent frames.
  // -------------------------------------------------------------------
  useEffect(() => {
    const imgs = entry.tiers.map((tier) => {
      const img = new Image();
      img.src = tier.url;
      return img;
    });
    return () => {
      // Drop references so GC can reclaim if the component unmounts before
      // all tiers load.
      imgs.length = 0;
    };
  }, [entry.tiers]);

  // -------------------------------------------------------------------
  // Register with the hydration store so the rest of the system sees us.
  // -------------------------------------------------------------------
  useEffect(() => {
    const store = useContinuumStore.getState();
    store.registerAsset(id);
    store.setStatus(id, 'loading');
    startedAtRef.current = performance.now();
    return () => {
      useContinuumStore.getState().unregisterAsset(id);
    };
  }, [id]);

  // -------------------------------------------------------------------
  // Tier timeline — bump activeTier on the Doherty schedule.
  // -------------------------------------------------------------------
  useEffect(() => {
    const timers = timeline.map(({ tier, atMs }) =>
      window.setTimeout(() => {
        setActiveTier(tier);
        if (tier === entry.tierCount - 1) {
          useContinuumStore.getState().setStatus(id, 'ready');
          onHydrated?.();
        }
      }, atMs),
    );
    return () => timers.forEach((h) => window.clearTimeout(h));
  }, [id, entry.tierCount, timeline, onHydrated]);

  // -------------------------------------------------------------------
  // Progress engine — 0→1 over the total hydration duration, writes to
  // the store for the Inspector to read.
  // -------------------------------------------------------------------
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const elapsed = performance.now() - startedAtRef.current;
      const t = Math.min(1, elapsed / Math.max(1, totalMs));
      useContinuumStore.getState().setLoadingProgress(id, t);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [id, totalMs]);

  // -------------------------------------------------------------------
  // Render — every tier image is in the DOM; opacity handles the crossfade.
  // -------------------------------------------------------------------
  return (
    <div
      ref={containerRef}
      data-continuum-hero={id}
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: inferredAspect,
        overflow: 'hidden',
        background: 'transparent',
        ...style,
      }}
    >
      {entry.tiers.map((tier) => (
        <TierLayer
          key={tier.index}
          tier={tier}
          active={tier.index <= activeTier}
          isHighest={tier.index === activeTier}
        />
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// TierLayer — one <img> per tier, stacked absolutely.
//
// The transition logic is deliberately simple:
//   - A tier is visible once its time arrives (`active`).
//   - The currently-highest active tier gets full opacity; lower tiers
//     underneath stay at full opacity too — they're never seen because the
//     higher layer covers them. This means the crossfade is a single
//     opacity ramp on the incoming layer, not a two-way animation.
//   - Once the next tier completes its fade-in, the lower layers can stay
//     mounted at zero CPU cost (just <img> tags the GPU composites).
// ---------------------------------------------------------------------------

const TIER_FADE_MS = 320;

const TierLayer = ({
  tier,
  active,
  isHighest,
}: {
  readonly tier: CatalogLODTier;
  readonly active: boolean;
  readonly isHighest: boolean;
}) => (
  <img
    src={tier.url}
    alt=""
    aria-hidden
    loading="eager"
    decoding="async"
    style={{
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      objectFit: 'contain',
      opacity: active ? 1 : 0,
      transition: `opacity ${TIER_FADE_MS}ms ease-out`,
      willChange: 'opacity',
      // Higher tiers paint on top. We add (+1) so tier 0 still sits above
      // the container background even when nothing else is active yet.
      zIndex: tier.index + 1,
      // Hide lower tiers from the accessibility tree once covered.
      ...(isHighest ? {} : { pointerEvents: 'none' }),
    }}
  />
);

export default VariableTierImageHero;
