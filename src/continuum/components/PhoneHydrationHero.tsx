/**
 * <PhoneHydrationHero /> — the GALAXY Z Fold foldable, rendered via the
 * Continuum UI LOD hydration engine.
 *
 * Ties three pieces together:
 *
 *   1. <BlueprintSkeleton />       — the amber-on-black engineering overlay
 *                                    shown while the phone is still at tiers
 *                                    0 and 1 (wireframe only). Fades out as
 *                                    materials arrive.
 *   2. <RealisticPhoneAsset />     — the 5-tier foldable asset. Its `tier`
 *                                    prop is advanced by this component on a
 *                                    Doherty-windowed schedule.
 *   3. useContinuumStore           — registers the asset so the hydration
 *                                    store treats this hero identically to
 *                                    VariableTierMeshHero on /ingest.
 *
 * Timing envelope comes from catalog/timeline.ts — the same `timelineFor(N)`
 * function used server-side by the ingest worker, so the UI cadence exactly
 * matches what the worker would report for a 5-tier asset.
 *
 *   tier 0 · blockout       (wireframe, blueprint overlay dominant)
 *   tier 1 · optics         (wireframe + camera rings, blueprint fading)
 *   tier 2 · matte shade    (flat-shaded opaque, blueprint gone)
 *   tier 3 · detail         (UI + side buttons + wallpaper lit)
 *   tier 4 · PBR hero       (clearcoat, anisotropy, transmissive lenses)
 *
 * The blueprint overlay is rendered ON TOP of the R3F canvas with a fade
 * keyed to the active tier: full at t<=0, partial at t=1, gone at t>=2.
 * That way the user actually SEES the ingest pipeline handing off from
 * "scaffold" to "material" — not just an empty panel that fills in.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, ContactShadows } from '@react-three/drei';

import { BlueprintSkeleton } from './BlueprintSkeleton';
import {
  RealisticPhoneAsset,
  PHONE_COLORWAYS,
  PHONE_TIER_COUNT,
  PHONE_REGIONS,
  approxTrianglesTotal,
} from './RealisticPhoneAsset';
import type { PhoneColorway, PhoneTier } from './RealisticPhoneAsset';
import { timelineFor, totalDurationMs } from '../catalog/timeline';
import { useContinuumStore } from '../store/useContinuumStore';

// ---------------------------------------------------------------------------
// Tier → HUD label + blueprint opacity
// ---------------------------------------------------------------------------

const TIER_BADGE: Record<PhoneTier, string> = {
  0: 'blockout',
  1: 'optics',
  2: 'matte',
  3: 'detail',
  4: 'pbr hero',
};

/**
 * Blueprint opacity curve. Full opacity while the mesh is a wireframe
 * (t<=0), fades out as materials start arriving, fully gone by tier 2.
 */
const blueprintOpacityFor = (tier: PhoneTier): number => {
  if (tier <= 0) return 1;
  if (tier === 1) return 0.55;
  return 0;
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PhoneHydrationHeroProps {
  /** Named colorway. Defaults to 'titanium'. */
  readonly colorway?: keyof typeof PHONE_COLORWAYS;
  /** Stable id used to register with the Continuum hydration store. */
  readonly registryId?: string;
  /** Optional background override for the container. */
  readonly background?: string;
  /** Fires once the final tier has landed. */
  readonly onHydrated?: () => void;
  /** Forwarded to RealisticPhoneAsset — see there for defaults. */
  readonly autoRotate?: number;
  /** Forwarded to RealisticPhoneAsset. */
  readonly pointerTilt?: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const PhoneHydrationHero = ({
  colorway = 'titanium',
  registryId = 'galaxy-z-fold-hero',
  background,
  onHydrated,
  autoRotate = 0.35,
  pointerTilt = 0.3,
}: PhoneHydrationHeroProps) => {
  const id = registryId;
  const palette: PhoneColorway =
    PHONE_COLORWAYS[colorway] ?? (PHONE_COLORWAYS.titanium as PhoneColorway);

  // Doherty-windowed schedule for PHONE_TIER_COUNT (5) tiers.
  const timeline = useMemo(() => timelineFor(PHONE_TIER_COUNT), []);
  const totalMs = useMemo(() => totalDurationMs(PHONE_TIER_COUNT), []);

  const [activeTier, setActiveTier] = useState<PhoneTier>(0);
  const startedAtRef = useRef<number>(performance.now());
  const containerRef = useRef<HTMLDivElement | null>(null);

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
  // R3F ResizeObserver is finicky after HMR — poke it twice.
  // -------------------------------------------------------------------
  useEffect(() => {
    const nudge = () => window.dispatchEvent(new Event('resize'));
    const t1 = window.setTimeout(nudge, 0);
    const t2 = window.setTimeout(nudge, 120);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  // -------------------------------------------------------------------
  // Tier advancer — setTimeout at each `atMs` on the Doherty schedule.
  // -------------------------------------------------------------------
  useEffect(() => {
    const timers = timeline.map(({ tier, atMs }) =>
      window.setTimeout(() => {
        const clamped = Math.min(tier, PHONE_TIER_COUNT - 1) as PhoneTier;
        setActiveTier(clamped);
        if (tier === PHONE_TIER_COUNT - 1) {
          useContinuumStore.getState().setStatus(id, 'ready');
          onHydrated?.();
        }
      }, atMs),
    );
    return () => timers.forEach((h) => window.clearTimeout(h));
  }, [id, timeline, onHydrated]);

  // -------------------------------------------------------------------
  // Progress engine — 0→1 over totalMs, pushed into the store.
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

  const blueprintAlpha = blueprintOpacityFor(activeTier);
  const progressPct =
    Math.min(1, (activeTier + 1) / PHONE_TIER_COUNT);

  return (
    <div
      ref={containerRef}
      data-continuum-hero={id}
      data-continuum-kind="phone-hydration"
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        background: background ?? 'transparent',
      }}
    >
      {/* R3F canvas — mounted from first frame. Lower tiers show the phone */}
      {/* as a wireframe, so the blueprint overlay has something to sit on  */}
      {/* top of rather than a black void during the handoff.                 */}
      <Canvas
        style={{ position: 'absolute', inset: 0 }}
        camera={{ position: [0, 0, 5.5], fov: 28 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={0.3} />
        <directionalLight position={[3, 4, 5]} intensity={1.1} color="#FFF5E0" />
        <directionalLight position={[-4, 2, -2]} intensity={0.55} color="#7A88A8" />
        <pointLight position={[0, -3, 2]} intensity={0.25} color="#D7A86E" />
        <RealisticPhoneAsset
          colorway={colorway}
          tier={activeTier}
          autoRotate={autoRotate}
          pointerTilt={pointerTilt}
        />
        <ContactShadows
          position={[0, -1.55, 0]}
          opacity={0.55}
          scale={6}
          blur={2.4}
          far={2}
        />
        {/* PBR env is only needed at the hero tier — and it's expensive. */}
        {activeTier >= 3 && (
          <Environment preset="studio" environmentIntensity={0.5} />
        )}
      </Canvas>

      {/* Blueprint overlay — sits on top of the canvas while the mesh is  */}
      {/* still a wireframe. Fades out as the tier advances past the       */}
      {/* wireframe stages so the user watches one form hand off to the    */}
      {/* next instead of snapping.                                         */}
      {blueprintAlpha > 0.01 && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            opacity: blueprintAlpha,
            transition: 'opacity 380ms ease-out',
            pointerEvents: 'none',
          }}
        >
          <BlueprintSkeleton
            label={`HYDRATING TIER ${activeTier} · ${TIER_BADGE[activeTier].toUpperCase()}`}
            progress={progressPct}
          />
        </div>
      )}

      {/* Tier readout HUD — matches the ingest demo's <TierReadout /> so  */}
      {/* the two surfaces look like they're driven by the same pipeline. */}
      <TierReadout
        tier={activeTier}
        palette={palette}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// TierReadout — small top-left HUD pill showing current LOD + badge.
// ---------------------------------------------------------------------------

const TierReadout = ({
  tier,
  palette,
}: {
  readonly tier: PhoneTier;
  readonly palette: PhoneColorway;
}) => {
  const tris = approxTrianglesTotal(
    PHONE_REGIONS.reduce(
      (acc, r) => ({ ...acc, [r]: tier }),
      {} as Record<(typeof PHONE_REGIONS)[number], PhoneTier>,
    ),
  );
  const trisLabel = tris >= 1000 ? `${(tris / 1000).toFixed(tris >= 10000 ? 0 : 1)}k` : `${tris}`;
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        top: 12,
        left: 12,
        padding: '4px 8px',
        border: '1px solid rgba(215, 168, 110, 0.3)',
        background: 'rgba(10, 8, 6, 0.7)',
        color: '#EEE3CD',
        fontFamily:
          'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)',
        fontSize: 10,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        borderRadius: 2,
        pointerEvents: 'none',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        zIndex: 3,
      }}
    >
      <span>
        LOD{tier} / {PHONE_TIER_COUNT - 1} · {TIER_BADGE[tier]}
      </span>
      <span
        style={{
          color: '#D7A86E',
          borderLeft: '1px solid rgba(215, 168, 110, 0.3)',
          paddingLeft: 8,
        }}
      >
        {trisLabel}△
      </span>
      <span
        style={{
          color: '#B8A998',
          borderLeft: '1px solid rgba(215, 168, 110, 0.3)',
          paddingLeft: 8,
        }}
      >
        {palette.label}
      </span>
    </div>
  );
};

export default PhoneHydrationHero;
