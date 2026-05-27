/**
 * <ContinuumLODAsset /> — the drop-in 4-tier LOD streaming preset.
 *
 * This is the packaged product. A website builder drops this component inside
 * any @react-three/fiber <Canvas>, supplies four "fill-in-the-blank" render
 * functions (one per LOD), and gets the full Continuum streaming experience
 * for free: crossfade between tiers, coarse-blueprint → fine-blueprint → mid
 * textures → AAA hero progression, mount-gated unmounts to free GPU memory,
 * and deterministic per-asset IDs.
 *
 * Shape contract (important!):
 *   All four tiers should render the SAME silhouette. Only surface detail
 *   progresses — LOD 0 is a coarse wireframe blueprint, LOD 1 a finer
 *   wireframe of the exact same shape, LOD 2 introduces low-res shading /
 *   mid textures, LOD 3 is the AAA finish (full PBR, shadows, clearcoat,
 *   subtle emissive, particle halos — the stuff you'd ship in an Unreal
 *   cinematic).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * MINIMAL USAGE
 * ─────────────────────────────────────────────────────────────────────────
 *
 *   import { Canvas } from '@react-three/fiber';
 *   import { ContinuumLODAsset } from '@continuum/components/ContinuumLODAsset';
 *
 *   <Canvas camera={{ position: [0, 0, 4] }}>
 *     <ambientLight intensity={0.35} />
 *     <directionalLight position={[3, 4, 3]} intensity={0.9} />
 *
 *     <ContinuumLODAsset
 *       id="hero-sphere"
 *       skeleton={(o) => (
 *         <mesh>
 *           <sphereGeometry args={[1.5, 12, 6]} />
 *           <meshBasicMaterial wireframe color="#F2D27A"
 *             transparent opacity={o} />
 *         </mesh>
 *       )}
 *       fineBlueprint={(o) => (
 *         <mesh>
 *           <sphereGeometry args={[1.5, 48, 24]} />
 *           <meshBasicMaterial wireframe color="#F2D27A"
 *             transparent opacity={o} />
 *         </mesh>
 *       )}
 *       mid={(o) => (
 *         <mesh>
 *           <sphereGeometry args={[1.5, 48, 24]} />
 *           <meshStandardMaterial color="#E0C66D" roughness={0.6}
 *             transparent opacity={o} />
 *         </mesh>
 *       )}
 *       hero={(o) => (
 *         <mesh>
 *           <sphereGeometry args={[1.5, 128, 96]} />
 *           <meshPhysicalMaterial
 *             map={myColorTexture}
 *             bumpMap={myBumpTexture}
 *             roughnessMap={myRoughnessTexture}
 *             clearcoat={0.7}
 *             emissive="#FFD14A"
 *             emissiveIntensity={0.06}
 *             transparent opacity={o}
 *           />
 *         </mesh>
 *       )}
 *     />
 *   </Canvas>
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SPLINE INTEGRATION
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Spline scenes render as a DOM layer, not inside an R3F Canvas. If you want
 * a Spline hero to take over from an R3F tier 0/1/2 progression, composite
 * them with absolute positioning and drive the Spline opacity from the same
 * store so it reveals at tier 3:
 *
 *   const reg = useContinuumStore(selectAsset('hero'));
 *   const heroOpacity = reg?.currentLOD === 3 ? 1 : 0;
 *
 *   <div style={{ position: 'relative' }}>
 *     <Canvas>
 *       <ContinuumLODAsset id="hero"
 *         skeleton={...} fineBlueprint={...} mid={...} hero={null}
 *       />
 *     </Canvas>
 *     <div style={{ position: 'absolute', inset: 0, opacity: heroOpacity,
 *                   transition: 'opacity 360ms ease-out' }}>
 *       <Spline scene="https://prod.spline.design/xyz/scene.splinecode" />
 *     </div>
 *   </div>
 *
 * Pass `hero={null}` so the in-canvas LOD 3 is skipped; the Spline layer
 * takes that role instead.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { useContinuumStore, selectAsset } from '../store/useContinuumStore';
import type { LODTier } from '../store/types';

// ---------------------------------------------------------------------------
// Render-slot contract
// ---------------------------------------------------------------------------

/**
 * A render function for one LOD tier. Receives the current crossfade opacity
 * (0 → 1) and returns R3F JSX (typically a `<mesh>` with geometry + material).
 *
 * The function is called on every render, so keep it cheap — create geometries
 * and textures outside (via useMemo in the parent) and reference them via
 * closure, don't allocate per frame.
 *
 * Return `null` to skip this tier entirely (e.g. if LOD 3 is provided by an
 * external layer like a Spline embed).
 */
export type LODSlot = (opacity: number) => ReactNode;

// ---------------------------------------------------------------------------
// Public props
// ---------------------------------------------------------------------------

export interface ContinuumLODAssetProps {
  /**
   * Stable identifier — registers this asset in the Continuum store so
   * overlays / HUDs / other components can observe its current LOD and status.
   * Must be unique across the page.
   */
  readonly id: string;

  /** LOD 0 — coarse blueprint wireframe. Paints under 16 ms. */
  readonly skeleton: LODSlot | null;
  /** LOD 1 — fine blueprint wireframe. Same silhouette, denser segments. */
  readonly fineBlueprint: LODSlot | null;
  /** LOD 2 — same shape, flat color / mid-res textures. */
  readonly mid: LODSlot | null;
  /** LOD 3 — AAA hero: full PBR, shadows, glow, clearcoat, subtle lighting. */
  readonly hero: LODSlot | null;

  /**
   * Pin the visible LOD tier. Useful for demos, storybook views, or when a
   * builder wants to test each tier manually. If omitted, the effective tier
   * is clamped to 3 (the hero) — extend this later by plugging `useHydration`
   * in and reading a dynamic ceiling from the store.
   */
  readonly forceLOD?: LODTier;

  /**
   * Per-frame opacity lerp rate. 0.18 is the tuned default — converges in
   * ~250 ms at 60 fps, well inside Doherty's 400 ms productivity threshold.
   */
  readonly crossfadeRate?: number;

  /**
   * Opacity floor below which a variant is unmounted to free GPU memory.
   * Defaults to 0.01.
   */
  readonly unmountThreshold?: number;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

type TierMap<V> = { 0: V; 1: V; 2: V; 3: V };
const TIERS = [0, 1, 2, 3] as const;

/**
 * Drop inside an <R3F.Canvas>. Handles registration, crossfade, and
 * mount-gating. See the file-level JSDoc for usage examples.
 */
export const ContinuumLODAsset = ({
  id,
  skeleton,
  fineBlueprint,
  mid,
  hero,
  forceLOD,
  crossfadeRate = 0.18,
  unmountThreshold = 0.01,
}: ContinuumLODAssetProps): JSX.Element => {
  // Subscribe to the store for this asset. Components outside this one can
  // read `reg.currentLOD` / `reg.status` to render overlays that follow.
  const reg = useContinuumStore(selectAsset(id));

  // Resolve which tier should be visible. forceLOD wins; otherwise we clamp
  // to the store's maxLOD ceiling (defaults to 3).
  const effectiveLOD: LODTier =
    forceLOD ?? (Math.min(reg?.maxLOD ?? 3, 3) as LODTier);

  // Register / unregister in the store so other UI can observe progress.
  useEffect(() => {
    const store = useContinuumStore.getState();
    store.registerAsset(id);
    store.setStatus(id, 'ready');
    return () => {
      useContinuumStore.getState().unregisterAsset(id);
    };
  }, [id]);

  // Propagate the active LOD into the store whenever it changes.
  useEffect(() => {
    useContinuumStore.getState().setLOD(id, effectiveLOD);
  }, [id, effectiveLOD]);

  // Per-tier opacity — kept in a ref so the frame loop mutates it without
  // triggering React re-renders. We only sync to state when a tier crosses
  // the mount/unmount threshold.
  const opacityRef = useRef<TierMap<number>>({
    0: effectiveLOD === 0 ? 1 : 0,
    1: effectiveLOD === 1 ? 1 : 0,
    2: effectiveLOD === 2 ? 1 : 0,
    3: effectiveLOD === 3 ? 1 : 0,
  });

  const [opacities, setOpacities] = useState<TierMap<number>>(
    () => ({ ...opacityRef.current }),
  );

  const [mounted, setMounted] = useState<TierMap<boolean>>(() => ({
    0: effectiveLOD === 0,
    1: effectiveLOD === 1,
    2: effectiveLOD === 2,
    3: effectiveLOD === 3,
  }));

  // When the active tier changes, make sure the incoming variant is mounted
  // so it can begin its fade-in before crossing the threshold.
  useEffect(() => {
    setMounted((prev) => ({ ...prev, [effectiveLOD]: true }));
  }, [effectiveLOD]);

  // Crossfade — runs every frame. Lerps each tier's opacity toward 0 or 1,
  // and when a tier crosses the mount/unmount threshold, syncs the result
  // to React state to actually mount/unmount the variant.
  useFrame(() => {
    let needsRenderSync = false;
    for (const tier of TIERS) {
      const target = tier === effectiveLOD ? 1 : 0;
      const current = opacityRef.current[tier];
      const next = current + (target - current) * crossfadeRate;
      opacityRef.current[tier] = next;

      if (
        (current >= unmountThreshold && next < unmountThreshold) ||
        (current < unmountThreshold && next >= unmountThreshold)
      ) {
        needsRenderSync = true;
      }
    }

    if (needsRenderSync) {
      const snap = { ...opacityRef.current };
      setOpacities(snap);
      setMounted({
        0: snap[0] >= unmountThreshold,
        1: snap[1] >= unmountThreshold,
        2: snap[2] >= unmountThreshold,
        3: snap[3] >= unmountThreshold,
      });
    }
  });

  return (
    <>
      {mounted[0] && skeleton && skeleton(opacities[0])}
      {mounted[1] && fineBlueprint && fineBlueprint(opacities[1])}
      {mounted[2] && mid && mid(opacities[2])}
      {mounted[3] && hero && hero(opacities[3])}
    </>
  );
};

export default ContinuumLODAsset;
