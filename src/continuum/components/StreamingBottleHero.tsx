/**
 * <StreamingBottleHero /> — end-to-end 4-tier LOD bottle, no black-box runtime.
 *
 * This component replaces the old <SplineEmbed />. Everything is owned in
 * React / R3F so every tier is authored, inspectable, and hot-reloadable:
 *
 *   LOD 0 — coarse wireframe lathe (12 segments)
 *   LOD 1 — fine wireframe lathe (64 segments)
 *   LOD 2 — flat olive plastic shading (64 segments)
 *   LOD 3 — AAA hero: PBR plastic body + clearcoat + HDR environment
 *           reflections + contact shadow + "Sanketh" script decal
 *
 * The render path is a single R3F Canvas. A <BottleAsset /> child does all
 * the geometry and material work; this component just owns the streaming
 * story on top of it:
 *
 *   - registers the asset id in useContinuumStore
 *   - bumps the forced tier 0 → 1 → 2 → 3 on a timeline
 *   - runs the Harrison Fast-Power progress engine so the HUD reads
 *     naturally (see constants/perceivedTiming.ts)
 *   - dismisses <HydrationOverlay /> only when MIN_OVERLAY_MS has elapsed
 *     AND the simulated download is complete
 *
 * External contract matches the old SplineEmbed so consumer code is a
 * drop-in swap.
 */

import { useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, ContactShadows } from '@react-three/drei';
import { BottleAsset } from './BottleAsset';
import { useContinuumStore, selectAsset } from '../store/useContinuumStore';
import {
  MAX_OVERLAY_MS,
  MIN_OVERLAY_MS,
  OVERLAY_EXIT_MS,
  SIMULATED_CEILING,
  SIMULATED_CURVE_MS,
  FAST_POWER_EXP,
  fastPowerProgress,
} from '../constants/perceivedTiming';
import type { LODTier } from '../store/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface StreamingBottleHeroProps {
  /** Stable id — keys the hydration registry. */
  readonly id: string;
  /** HUD label shown on the hydration overlay. */
  readonly skeletonLabel?: string;
  /** Optional sub-label shown on the hydration overlay. */
  readonly subLabel?: string;
  /** Optional additional style overrides for the container. */
  readonly style?: React.CSSProperties;
}

// ---------------------------------------------------------------------------
// LOD timeline
// ---------------------------------------------------------------------------
//
// When bytes actually travel (real network), the timeline maps onto the
// download lifecycle. Here we simulate a realistic ~2.8s load so the user
// sees all four tiers play through naturally. Tweakable in one place.
//
// These values are chosen so the tier cadence lands inside Doherty's
// perceived-continuity window — each step is <= 700ms, so none feels like
// a stall.

const TIER_TIMELINE: ReadonlyArray<{ tier: LODTier; atMs: number }> = [
  { tier: 0, atMs: 0 },
  { tier: 1, atMs: 700 },
  { tier: 2, atMs: 1400 },
  { tier: 3, atMs: 2800 },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const StreamingBottleHero = ({
  id,
  // skeletonLabel / subLabel are kept on the public API for back-compat with
  // the old SplineEmbed contract, but the dark loading overlay they fed has
  // been removed in favour of an in-place fade-in. Reference once so TS's
  // noUnusedParameters check passes without changing the prop signature.
  skeletonLabel: _skeletonLabel = 'HYDRATION.LOG',
  subLabel: _subLabel = 'Streaming Relay 01',
  style,
}: StreamingBottleHeroProps) => {
  // ---------- local state -------------------------------------------------
  // Tier drives the BottleAsset's forceLOD. Progress is written to the store
  // for the Inspector but no longer rendered locally (no overlay).
  const [tier, setTier] = useState<LODTier>(0);
  const [readySignal, setReadySignal] = useState(false); // "download" finished

  const startedAtRef = useRef<number>(performance.now());
  const rafRef = useRef<number | null>(null);
  const progressRef = useRef<number>(0);

  // ---------- registry: enroll asset on mount ----------------------------
  useEffect(() => {
    const store = useContinuumStore.getState();
    store.registerAsset(id);
    store.setStatus(id, 'loading');
    startedAtRef.current = performance.now();
    return () => {
      useContinuumStore.getState().unregisterAsset(id);
    };
  }, [id]);

  // ---------- LOD-tier bump timeline -------------------------------------
  useEffect(() => {
    const timers = TIER_TIMELINE.map(({ tier: t, atMs }) =>
      window.setTimeout(() => {
        setTier(t);
        if (t === 3) setReadySignal(true);
      }, atMs),
    );
    return () => timers.forEach((h) => window.clearTimeout(h));
  }, []);

  // ---------- progress engine (Harrison Fast Power curve) ----------------
  useEffect(() => {
    const tick = () => {
      const elapsed = performance.now() - startedAtRef.current;
      const timedOut = elapsed > MAX_OVERLAY_MS;
      const finishing = readySignal || timedOut;

      let next: number;
      if (finishing && elapsed >= MIN_OVERLAY_MS) {
        const gap = 1 - progressRef.current;
        next = progressRef.current + gap * 0.18;
        if (gap < 0.002) next = 1;
      } else if (finishing) {
        const t01 = Math.min(1, elapsed / SIMULATED_CURVE_MS);
        next = Math.max(
          progressRef.current,
          fastPowerProgress(t01, SIMULATED_CEILING, FAST_POWER_EXP),
        );
      } else {
        const t01 = Math.min(1, elapsed / SIMULATED_CURVE_MS);
        next = fastPowerProgress(t01, SIMULATED_CEILING, FAST_POWER_EXP);
      }

      if (next !== progressRef.current) {
        progressRef.current = next;
        useContinuumStore.getState().setLoadingProgress(id, next);
      }

      if (next < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        useContinuumStore.getState().setStatus(id, 'ready');
        useContinuumStore.getState().setLOD(id, 3);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [id, readySignal]);

  // ---------- render -----------------------------------------------------
  // Container is transparent by default so whatever panel the hero sits
  // inside (e.g. Relay's olive Framer panel) shows through. Caller can
  // still override via the `style` prop if they want a solid plate. The
  // dark HydrationOverlay loading frame is gone — the bottle just
  // hydrates in place on the green panel like a real product image.
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: 'transparent',
        ...style,
      }}
    >
      {/* ---------- R3F hero canvas ----------------------------------- */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 1 }}>
        <Canvas
          camera={{ position: [0, 0.2, 4.6], fov: 38 }}
          dpr={[1, 2]}
          gl={{ antialias: true, alpha: true }}
          shadows
        >
          {/* Three-point studio lighting tuned for olive plastic. Keeps
              the body from reading as dull brown and provides the cool
              fill that tells the eye "this is plastic, not painted wood". */}
          <ambientLight intensity={0.45} color="#E8E4C8" />
          <directionalLight
            position={[3, 4, 3]}
            intensity={1.0}
            color="#FFE6A8"
            castShadow
            shadow-mapSize-width={1024}
            shadow-mapSize-height={1024}
          />
          <pointLight position={[-3, -2, 2]} intensity={0.45} color="#9FAE75" />

          {/* HDR environment only at LOD 3 — the reflections are the
              cherry on top of the hero tier, not something the blueprint
              needs. Using a small built-in preset keeps the cost cheap. */}
          {tier === 3 && <Environment preset="studio" environmentIntensity={0.55} />}

          {/* Soft contact shadow grounds the bottle at hero tier. */}
          {tier === 3 && (
            <ContactShadows
              position={[0, -1.22, 0]}
              opacity={0.55}
              scale={8}
              blur={2.4}
              far={3}
              resolution={256}
            />
          )}

          {/* The 4-tier bottle itself. forceLOD is driven by the timeline
              so BottleAsset's internal useFrame cross-fade handles the
              tier transitions. */}
          <BottleAsset id={`${id}__r3f`} forceLOD={tier} />
        </Canvas>
      </div>

      {/* HydrationOverlay intentionally not rendered — the old dark
          engineering loading frame was replaced by an in-place fade-in.
          The store still receives progress updates for the Inspector. */}

      {/* ---------- HUD tier badge ----------------------------------- */}
      <TierBadge id={id} tier={tier} />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Small LOD badge — reads live status from the store, falls back to the
// local tier state if nothing has registered yet.
// ---------------------------------------------------------------------------

const TierBadge = ({ id, tier }: { readonly id: string; readonly tier: LODTier }) => {
  const reg = useContinuumStore(selectAsset(id));
  const label =
    tier === 0 ? 'LOD 0 · BLUEPRINT'
      : tier === 1 ? 'LOD 1 · FINE BLUEPRINT'
        : tier === 2 ? 'LOD 2 · MID TEXTURES'
          : 'LOD 3 · AAA HERO';

  return (
    <span
      aria-hidden
      style={{
        position: 'absolute',
        top: 8,
        left: 12,
        padding: '3px 8px',
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: 9,
        letterSpacing: 1.6,
        color: reg?.status === 'error' ? '#FF7474' : 'rgba(232, 239, 200, 0.85)',
        background: 'transparent',
        zIndex: 5,
        pointerEvents: 'none',
        transition: `opacity ${OVERLAY_EXIT_MS}ms ease-out`,
      }}
    >
      {label}
    </span>
  );
};

export default StreamingBottleHero;
