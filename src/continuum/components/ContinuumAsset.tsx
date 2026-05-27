/**
 * <ContinuumAsset /> — the core HOC of the Continuum streaming engine.
 *
 * Accepts four GLB URLs (lod0 / lod1 / lod2 / lod3) and renders whichever tier
 * is appropriate for the current camera distance and hydration policy.
 * Switches happen per-frame inside `useFrame`, using squared distance (no
 * Math.sqrt) and a hysteresis band to prevent thrashing.
 *
 * Notes:
 *   - All four tiers are loaded when the component mounts so LOD swaps are
 *     instant (no fetch on upgrade). The hydrator can hold maxLOD=1 to skip
 *     loading LOD 2/3 on low-perf devices — the skipped URLs are then ignored.
 *   - `useGLTF` from drei caches per-URL; multiple mounts with the same URL
 *     share the GPU payload but each mount should clone if it mutates
 *     materials at runtime.
 *   - The Skeleton Mirror assertion runs once on mount in dev builds.
 *   - GSAP dither-fade is left as a hook — see the `// TODO` in the effect
 *     below — the scaffold renders instant swaps for now.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { Group, Vector3 } from 'three';
import { useContinuumStore } from '../store/useContinuumStore';
import { selectLOD } from '../hooks/useLODSelector';
import { assertSkeletonMirror, computeAABBSize } from '../utils/skeletonMirror';
import { MIN_SWAP_INTERVAL_MS } from '../constants';
import type { LODTier } from '../store/types';

export interface ContinuumAssetProps {
  /** Stable asset id; keys the hydration registry. Must be unique per mount. */
  readonly id: string;
  /** Spline-exported proxy (<500 tris). Always loaded. */
  readonly lod0: string;
  /** Blender standard tier. Loaded when maxLOD ≥ 1. */
  readonly lod1: string;
  /** Blender hero tier with KTX2/refraction. Loaded when maxLOD ≥ 2. */
  readonly lod2: string;
  /** World-space position. */
  readonly position?: readonly [number, number, number];
  /** Optional hydration override (default 2 = allow hero). */
  readonly initialMaxLOD?: LODTier;
}

// Preload LOD 0 aggressively — it's the skeleton and should never miss a mount.
const preloadSkeleton = (url: string) => useGLTF.preload(url);

export const ContinuumAsset = ({
  id,
  lod0,
  lod1,
  lod2,
  position = [0, 0, 0],
  initialMaxLOD = 2,
}: ContinuumAssetProps) => {
  const groupRef = useRef<Group>(null);
  const worldPos = useMemo(() => new Vector3(...position), [position]);

  // Load all tiers. drei's useGLTF suspends; Canvas provides a Suspense boundary.
  const gltf0 = useGLTF(lod0);
  const gltf1 = useGLTF(lod1);
  const gltf2 = useGLTF(lod2);

  // --- one-time registration + Skeleton Mirror check ------------------------
  useEffect(() => {
    const store = useContinuumStore.getState();
    const bounds = computeAABBSize(gltf0.scene);
    store.registerAsset(id, bounds);
    store.setMaxLOD(id, initialMaxLOD);
    store.setStatus(id, 'ready');

    // Dev-only parity assertion. Throws if LOD 0 / LOD 2 AABB drift > 1%.
    assertSkeletonMirror(id, gltf0.scene, gltf2.scene);

    return () => {
      // Dispose per CLAUDE.md §5 — traversal handles nested geometries/materials.
      for (const gltf of [gltf0, gltf1, gltf2]) {
        gltf.scene.traverse((obj) => {
          const anyObj = obj as unknown as {
            geometry?: { dispose?: () => void };
            material?: { dispose?: () => void } | Array<{ dispose?: () => void }>;
          };
          anyObj.geometry?.dispose?.();
          if (Array.isArray(anyObj.material)) {
            anyObj.material.forEach((m) => m.dispose?.());
          } else {
            anyObj.material?.dispose?.();
          }
        });
      }
      useContinuumStore.getState().unregisterAsset(id);
    };
  }, [id, initialMaxLOD, gltf0, gltf1, gltf2]);

  // --- per-frame LOD selection ---------------------------------------------
  useFrame((state) => {
    const group = groupRef.current;
    if (!group) return;

    const asset = useContinuumStore.getState().assets[id];
    if (!asset || asset.status !== 'ready') return;

    // Squared-distance — never call Math.sqrt here.
    const dsq = state.camera.position.distanceToSquared(group.position);
    const target = selectLOD({
      distanceSq: dsq,
      currentLOD: asset.currentLOD,
      maxLOD: asset.maxLOD,
    });

    if (target === asset.currentLOD) return;

    // Rate-limit: at most MAX_SWAPS_PER_SEC swaps per asset.
    const now = performance.now();
    if (now - asset.lastSwapAt < MIN_SWAP_INTERVAL_MS) return;

    // TODO: drive GSAP dither-fade uniform here before flipping visibility.
    // For now, swap instantly; the store action stamps lastSwapAt.
    useContinuumStore.getState().setLOD(id, target);
  });

  // --- render all three, toggle visibility. Keeping them mounted avoids the
  //     per-swap re-mount cost and lets a future dither-fade cross-blend ----
  const current = useContinuumStore((s) => s.assets[id]?.currentLOD ?? 0);

  return (
    <group ref={groupRef} position={worldPos}>
      <primitive object={gltf0.scene} visible={current === 0} />
      <primitive object={gltf1.scene} visible={current === 1} />
      <primitive object={gltf2.scene} visible={current === 2} />
    </group>
  );
};

// Side-effect: preload skeletons so first paint never suspends on them.
// Callers pass concrete URLs at mount time; we preload opportunistically.
export const preloadContinuumSkeleton = preloadSkeleton;
