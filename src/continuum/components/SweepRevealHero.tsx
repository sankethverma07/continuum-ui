/**
 * <SweepRevealHero /> — catalog-driven progressive hero with a diagonal
 * mask sweep between tiers.
 *
 * This is the wireframe→final "sweep" effect the user showed in their
 * reference video, generalized to the variable-tier pipeline:
 *
 *   - Tier 0 is always visible as the base layer (usually a wireframe).
 *   - Each higher tier paints on top via a CSS `mask-image` whose
 *     `mask-position` animates from "hidden" to "fully revealed" across a
 *     diagonal gradient. The result is a sweeping wipe, not a uniform
 *     crossfade.
 *   - Sweep direction alternates per tier so the reveal feels like a
 *     back-and-forth pass over the asset rather than a single slow diagonal.
 *
 * Unlike VariableTierImageHero (which uses simple opacity crossfades),
 * this component is optimized for the "hero moment" — the first time an
 * asset loads, you get a deliberate reveal sequence; subsequent re-mounts
 * or navigation can fall back to the crossfade variant.
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import type { CatalogEntry, CatalogLODTier } from '../catalog/types';
import { timelineFor, totalDurationMs } from '../catalog/timeline';
import { useContinuumStore } from '../store/useContinuumStore';
import { useAssetPriority } from '../hooks/useAssetPriority';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SweepRevealHeroProps {
  /** Catalog entry produced by the ingest pipeline. */
  readonly entry: CatalogEntry;
  /**
   * Stable id used to register with the hydration store. Defaults to the
   * catalog entry id but can be overridden if multiple instances of the
   * same entry are on-page.
   */
  readonly registryId?: string;
  /** Aspect ratio for the container — defaults to the hero tier's. */
  readonly aspectRatio?: string;
  /**
   * Duration of each individual sweep, in ms. Independent of the
   * tier-to-tier cadence (which is driven by the Doherty timeline).
   * A sweep that's shorter than the tier interval gives you a crisp reveal
   * followed by a hold; a sweep equal to the interval gives a continuous
   * "paint roller" feel.
   */
  readonly sweepDurationMs?: number;
  /**
   * Width of the diagonal gradient mask, expressed as a fraction of the
   * container diagonal. Smaller = harder edge on the sweep line; larger =
   * softer, cinematic feel. Default 0.28 roughly matches the reference video.
   */
  readonly sweepWidth?: number;
  /** Optional style override for the outer container. */
  readonly style?: React.CSSProperties;
  /** Fires once every tier has been revealed and the hero is stable. */
  readonly onHydrated?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const DEFAULT_SWEEP_MS = 520;
const DEFAULT_SWEEP_WIDTH = 0.28;

export const SweepRevealHero = ({
  entry,
  registryId,
  aspectRatio,
  sweepDurationMs = DEFAULT_SWEEP_MS,
  sweepWidth = DEFAULT_SWEEP_WIDTH,
  style,
  onHydrated,
}: SweepRevealHeroProps) => {
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

  // `revealedTier` tracks the highest tier whose sweep has begun. Each
  // higher tier renders with a mask animation from 0 (hidden) → 1 (shown).
  const [revealedTier, setRevealedTier] = useState<number>(0);
  const startedAtRef = useRef<number>(performance.now());
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Pre-hydration priority: viewport proximity + dwell + scroll stillness.
  // Feeds the cross-asset VRAM budget policy in useHydration.
  useAssetPriority(id, containerRef);

  // -------------------------------------------------------------------
  // Pre-fetch every tier URL so the sweep has zero image jitter.
  // -------------------------------------------------------------------
  useEffect(() => {
    const imgs = entry.tiers.map((tier) => {
      const img = new Image();
      img.src = tier.url;
      return img;
    });
    return () => {
      imgs.length = 0;
    };
  }, [entry.tiers]);

  // -------------------------------------------------------------------
  // Register with the hydration store.
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
  // Tier timeline — bump revealedTier on the Doherty schedule.
  // -------------------------------------------------------------------
  useEffect(() => {
    const timers = timeline.map(({ tier, atMs }) =>
      window.setTimeout(() => {
        setRevealedTier(tier);
        if (tier === entry.tierCount - 1) {
          // The hero tier has *started* sweeping; give it one sweep
          // duration before reporting ready, so "ready" genuinely means
          // "the user sees the final image", not "we kicked off the fade".
          window.setTimeout(() => {
            useContinuumStore.getState().setStatus(id, 'ready');
            onHydrated?.();
          }, sweepDurationMs);
        }
      }, atMs),
    );
    return () => timers.forEach((h) => window.clearTimeout(h));
  }, [id, entry.tierCount, timeline, sweepDurationMs, onHydrated]);

  // -------------------------------------------------------------------
  // Progress engine — 0→1 over the total hydration duration.
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
  // Render
  // -------------------------------------------------------------------
  return (
    <div
      ref={containerRef}
      data-continuum-sweep-hero={id}
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
        <SweepLayer
          key={tier.index}
          tier={tier}
          isBase={tier.index === 0}
          revealed={tier.index <= revealedTier}
          direction={sweepDirectionForTier(tier.index)}
          sweepDurationMs={sweepDurationMs}
          sweepWidth={sweepWidth}
        />
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// SweepLayer — one tier, rendered with an animated CSS mask.
//
// Base layer (tier 0): always fully visible, no mask. Acts as the wireframe
// background the sweep reveals the final over.
// Higher tiers: CSS `mask-image` is a wide diagonal gradient. We animate
// `mask-position` from "off-screen before the sweep starts" to "off-screen
// after the sweep ends", which drags the visible band across the layer.
// ---------------------------------------------------------------------------

type SweepDirection = 'tl-to-br' | 'tr-to-bl';

const sweepDirectionForTier = (idx: number): SweepDirection =>
  idx % 2 === 1 ? 'tl-to-br' : 'tr-to-bl';

const SweepLayer = ({
  tier,
  isBase,
  revealed,
  direction,
  sweepDurationMs,
  sweepWidth,
}: {
  readonly tier: CatalogLODTier;
  readonly isBase: boolean;
  readonly revealed: boolean;
  readonly direction: SweepDirection;
  readonly sweepDurationMs: number;
  readonly sweepWidth: number;
}) => {
  // ------------------------------------------------------------------
  // Base layer short-circuit: render with no mask at full opacity.
  // ------------------------------------------------------------------
  if (isBase) {
    return (
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
          zIndex: tier.index + 1,
          pointerEvents: 'none',
        }}
      />
    );
  }

  // ------------------------------------------------------------------
  // Mask engine.
  //
  // The mask is a diagonal gradient with three stops:
  //   - 0%   : opaque  (what's already painted stays painted)
  //   - 50%  : opaque → transparent transition band (the "sweep line")
  //   - 100% : transparent (nothing painted yet)
  //
  // We drive reveal by moving the mask position. When `revealed` is
  // false, the mask is positioned so the whole image is "ahead of the
  // sweep" → fully hidden. When `revealed` flips to true, we transition
  // to a position where the whole image is "behind the sweep" → shown.
  //
  // sweep-width controls the angular thickness of the transition band,
  // which is what gives the wipe its soft or hard edge.
  // ------------------------------------------------------------------
  const gradientAngle = direction === 'tl-to-br' ? 135 : 225;
  const bandStart = Math.max(0, 0.5 - sweepWidth / 2);
  const bandEnd = Math.min(1, 0.5 + sweepWidth / 2);

  // The gradient is generated at 2x container size; mask-position shifts
  // it from -100% (fully ahead) to 0% (fully behind).
  const maskImage =
    `linear-gradient(${gradientAngle}deg, ` +
    `#000 0%, ` +
    `#000 ${(bandStart * 100).toFixed(1)}%, ` +
    `rgba(0,0,0,0) ${(bandEnd * 100).toFixed(1)}%, ` +
    `rgba(0,0,0,0) 100%)`;

  const maskPosition = revealed ? '0% 0%' : '-100% -100%';

  return (
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
        zIndex: tier.index + 1,
        pointerEvents: 'none',
        willChange: 'mask-position, -webkit-mask-position',
        maskImage,
        WebkitMaskImage: maskImage,
        maskSize: '200% 200%',
        WebkitMaskSize: '200% 200%',
        maskRepeat: 'no-repeat',
        WebkitMaskRepeat: 'no-repeat',
        maskPosition,
        WebkitMaskPosition: maskPosition,
        // ease-out feels like physical material settling; ease-in-out would
        // make the sweep linger mid-screen which looks sluggish.
        transition:
          `mask-position ${sweepDurationMs}ms cubic-bezier(0.22, 1, 0.36, 1),` +
          ` -webkit-mask-position ${sweepDurationMs}ms cubic-bezier(0.22, 1, 0.36, 1)`,
      }}
    />
  );
};

export default SweepRevealHero;
