/**
 * <HeavyProgressiveEngine /> — dedicated reveal engine for high-complexity
 * GLBs (>100K tris OR >5 meshes OR >15MB sourceBytes).
 *
 * Differences from the standard ProgressiveEngine:
 *
 *   1. Mesh clustering. The asset is split into spatially-adjacent mesh
 *      clusters. The largest cluster (by triangle count) is selected as
 *      the PRIMARY subject; all other clusters are hidden. This solves
 *      the Sketchfab / CGTrader "LOD comparison sheet" problem where
 *      the GLB ships with three copies of the same model side-by-side
 *      and the standard engine renders all three.
 *
 *   2. Multi-stage build (more LODs). Instead of a single linear
 *      drawRange ramp, the build is split into 12 stages with subtle
 *      pauses between them. Each stage adds a chunk of triangles, then
 *      holds for ~80ms before the next stage. The pauses give the eye
 *      time to register density growth — without them, a 200K-tri
 *      build looks like a single white blob fading in.
 *
 *   3. Longer overall timeline. Build phase is 5–7 seconds (vs 1.6–3.6s
 *      in the standard engine), material build is 3–4 seconds. Gives the
 *      reveal weight commensurate with the asset's complexity.
 *
 *   4. Same wireframe-on-top + shuffled-index spatial reveal as the
 *      standard engine — the seamless feel is preserved, just stretched.
 */

import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

import { useContinuumStore } from '../store/useContinuumStore';
import {
  hologramBoot,
  hologramBootScale,
  HOLOGRAM_BOOT_MS,
} from '../utils/hologram';
import {
  clusterMeshesByProximity,
  pickPrimaryCluster,
  isolateClusterMeshes,
} from '../utils/meshClustering';

// ---------------------------------------------------------------------------
// Helpers — duplicated from AutoProgressiveGLBAsset to keep this engine
// self-contained. Small enough that the duplication is cheaper than a
// shared-utility import that would couple the two engines together.
// ---------------------------------------------------------------------------

interface FitTransform {
  readonly offset: THREE.Vector3;
  readonly scale: number;
}

const TARGET_EXTENT = 3.2;

/**
 * Fit transform computed from a SPECIFIC bounding box (the primary
 * cluster's combined bounds) rather than the full scene. This re-centres
 * and re-scales the camera onto the chosen subject, so even if the
 * supporting clusters are hidden, the primary fills the viewport.
 */
const computeFitFromBox = (box: THREE.Box3): FitTransform => {
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxAxis = Math.max(size.x, size.y, size.z) || 1;
  return {
    offset: center.negate(),
    scale: TARGET_EXTENT / maxAxis,
  };
};

const setOpacityDeep = (root: THREE.Object3D, opacity: number): void => {
  const visible = opacity > 0.005;
  root.visible = visible;
  if (!visible) return;
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      const mat = obj.material;
      if (Array.isArray(mat)) {
        mat.forEach((m) => {
          m.transparent = true;
          m.opacity = opacity;
          m.needsUpdate = true;
        });
      } else if (mat) {
        mat.transparent = true;
        mat.opacity = opacity;
        mat.needsUpdate = true;
      }
    }
  });
};

/**
 * Hero on/off — only toggles `visible`, never mutates material props.
 * Material mutation per-frame can drop PBR texture bindings; visibility
 * toggle is the safe path that preserves Sketchfab-grade PBR rendering.
 */
const setHeroState = (root: THREE.Object3D, on: boolean): void => {
  root.visible = on;
};

const cloneWithMaterials = (source: THREE.Object3D): THREE.Object3D => {
  const clone = source.clone(true);
  clone.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry = obj.geometry.clone();
      if (Array.isArray(obj.material)) {
        obj.material = obj.material.map((m) => m.clone());
      } else {
        obj.material = obj.material.clone();
      }
    }
  });
  return clone;
};

const shuffleIndexDeterministic = (
  geom: THREE.BufferGeometry,
  seed: number,
): void => {
  const idx = geom.index;
  if (!idx) return;
  const indices = idx.array as Uint16Array | Uint32Array;
  const triCount = Math.floor(indices.length / 3);
  if (triCount < 2) return;
  const order = new Uint32Array(triCount);
  for (let i = 0; i < triCount; i++) order[i] = i;
  let s = (seed | 0) || 1;
  const rng = (): number => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (let i = triCount - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = order[i]!;
    order[i] = order[j]!;
    order[j] = tmp;
  }
  const Ctor = indices.constructor as { new (n: number): Uint16Array | Uint32Array };
  const out = new Ctor(indices.length);
  for (let i = 0; i < triCount; i++) {
    const t = order[i]!;
    out[i * 3]     = indices[t * 3]     ?? 0;
    out[i * 3 + 1] = indices[t * 3 + 1] ?? 0;
    out[i * 3 + 2] = indices[t * 3 + 2] ?? 0;
  }
  geom.setIndex(new THREE.BufferAttribute(out, 1));
};

const buildSingleWireframe = (
  source: THREE.Object3D,
  color: string,
): THREE.Object3D => {
  const clone = source.clone(true);
  let seed = 1;
  clone.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry = obj.geometry.clone();
      shuffleIndexDeterministic(obj.geometry as THREE.BufferGeometry, seed++);
      obj.material = new THREE.MeshBasicMaterial({
        color,
        wireframe: true,
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });
      obj.renderOrder = 999;
    }
  });
  return clone;
};

const smoothstep01 = (x: number): number => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------------------
// Heavy engine — dedicated to high-complexity assets
// ---------------------------------------------------------------------------

export interface HeavyProgressiveEngineProps {
  readonly heroSource: THREE.Object3D;
  readonly registryId: string;
  readonly scale: number;
  readonly autoRotate: number;
  readonly runToken: number;
  readonly blueprintColor: string;
  readonly onHydrated?: (() => void) | undefined;
}

/** Number of stepwise build sub-stages. More stages = finer granularity. */
const NUM_STAGES = 12;
/** Pause between sub-stages, ms. Lets the eye register each batch arriving. */
const STAGE_DWELL_MS = 80;

export const HeavyProgressiveEngine = ({
  heroSource,
  registryId,
  scale,
  autoRotate,
  runToken,
  blueprintColor,
  onHydrated,
}: HeavyProgressiveEngineProps) => {
  type Prepared = {
    readonly fit: FitTransform;
    readonly hero: THREE.Object3D;
    readonly wireframe: THREE.Object3D;
    readonly wireframeMeshes: ReadonlyArray<{
      readonly mesh: THREE.Mesh;
      readonly fullCount: number;
    }>;
    readonly heroMeshes: ReadonlyArray<{
      readonly mesh: THREE.Mesh;
      readonly fullCount: number;
    }>;
    readonly wireBuildMs: number;
    readonly matBuildMs: number;
    readonly wireFadeOutMs: number;
    readonly stageBoundaries: ReadonlyArray<number>;
  };
  const [prepared, setPrepared] = useState<Prepared | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPrepared(null);
    if (!heroSource) return undefined;

    (async () => {
      // ---- 1. Cluster meshes + isolate the primary subject -----------
      const clusters = clusterMeshesByProximity(heroSource, 0.05);
      const primary = pickPrimaryCluster(clusters);
      if (!primary || cancelled) return;

      // Hide every mesh outside the primary cluster on the SOURCE so the
      // hero clone + wireframe clone we build below only contain the
      // chosen subject. We could alternatively filter at clone time, but
      // toggling visibility is cheaper and reversible.
      const restoreVisibility = isolateClusterMeshes(heroSource, primary);

      // ---- 2. Build wireframe + hero clones from the isolated source -
      const fit = computeFitFromBox(primary.bounds);
      const hero = cloneWithMaterials(heroSource);
      setOpacityDeep(hero, 0);

      const wireframe = buildSingleWireframe(heroSource, blueprintColor);
      setOpacityDeep(wireframe, 0);

      // Restore source visibility — the clones already have the filter
      // baked in (any non-primary mesh in the clones is invisible).
      restoreVisibility();

      const wireframeMeshes: Array<{ mesh: THREE.Mesh; fullCount: number }> = [];
      wireframe.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.geometry.index && obj.visible) {
          wireframeMeshes.push({ mesh: obj, fullCount: obj.geometry.index.count });
          obj.geometry.setDrawRange(0, 0);
        }
      });

      // Pair hero meshes with wireframe meshes — same shuffle seed each.
      const heroMeshList: THREE.Mesh[] = [];
      hero.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.visible) heroMeshList.push(obj);
      });
      const heroMeshes: Array<{ mesh: THREE.Mesh; fullCount: number }> = [];
      for (let i = 0; i < wireframeMeshes.length; i++) {
        const heroMesh = heroMeshList[i];
        if (!heroMesh || !heroMesh.geometry.index) continue;
        shuffleIndexDeterministic(heroMesh.geometry as THREE.BufferGeometry, i + 1);
        heroMesh.geometry.setDrawRange(0, 0);
        heroMeshes.push({
          mesh: heroMesh,
          fullCount: heroMesh.geometry.index.count,
        });
      }

      // ---- 3. Stretched timeline + multi-stage boundaries ------------
      const tris = primary.triangleCount;
      // Heavier weighting than the standard engine — heavy assets get
      // 5–7s wireframe build to read as cinematic instead of frantic.
      const wireBuildMs =
        tris < 50_000  ? 4500 :
        tris < 150_000 ? 5500 :
        tris < 400_000 ? 6500 :
        7500;
      const matBuildMs = Math.round(wireBuildMs * 0.55);
      const wireFadeOutMs = 500;

      // Stage boundaries — fractions of buildProgress where one batch
      // ends and the next begins. We want micro-pauses BETWEEN them so
      // the eye registers each batch as "more triangles arrived". Total
      // pause budget = NUM_STAGES * STAGE_DWELL_MS; we add it to the
      // total wire build window so the active drawing-time stays the
      // same length and only the dwell is added on top.
      const stageBoundaries: number[] = [];
      for (let i = 1; i <= NUM_STAGES; i++) {
        stageBoundaries.push(i / NUM_STAGES);
      }

      setPrepared({
        fit,
        hero,
        wireframe,
        wireframeMeshes,
        heroMeshes,
        wireBuildMs: wireBuildMs + STAGE_DWELL_MS * (NUM_STAGES - 1),
        matBuildMs,
        wireFadeOutMs,
        stageBoundaries,
      });
    })().catch((err) => {
      console.error('HeavyProgressiveEngine: prepare failed', err);
    });

    return () => { cancelled = true; };
  }, [heroSource, blueprintColor]);

  const fBootRef = useRef(0);
  const startedAtRef = useRef<number>(performance.now());
  const rootRef = useRef<THREE.Group>(null);

  useEffect(() => {
    if (!prepared) return;
    const store = useContinuumStore.getState();
    store.registerAsset(registryId);
    store.setStatus(registryId, 'loading');
    startedAtRef.current = performance.now();
    fBootRef.current = 0;
    let notified = false;

    const totalMs =
      HOLOGRAM_BOOT_MS +
      prepared.wireBuildMs +
      prepared.matBuildMs +
      prepared.wireFadeOutMs;
    let raf = 0;
    const tick = () => {
      const elapsed = performance.now() - startedAtRef.current;
      if (elapsed < HOLOGRAM_BOOT_MS) {
        fBootRef.current = elapsed / HOLOGRAM_BOOT_MS;
      } else {
        fBootRef.current = 1;
      }
      const t = Math.min(1, elapsed / Math.max(1, totalMs));
      useContinuumStore.getState().setLoadingProgress(registryId, t);
      if (t >= 1 && !notified) {
        notified = true;
        useContinuumStore.getState().setStatus(registryId, 'ready');
        onHydrated?.();
      }
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      useContinuumStore.getState().unregisterAsset(registryId);
    };
  }, [prepared, registryId, runToken, onHydrated]);

  /**
   * Convert linear "elapsed in build phase" → step-and-dwell progress.
   * The build is broken into NUM_STAGES batches; after each batch fully
   * draws, drawing pauses for STAGE_DWELL_MS before the next batch begins.
   * This gives the eye distinct beats — "now more triangles, now more,
   * now more" — instead of one continuous blur.
   */
  const stagedProgress = (
    elapsed: number,
    totalMs: number,
  ): number => {
    const drawTime = totalMs - STAGE_DWELL_MS * (NUM_STAGES - 1);
    const perStageDraw = drawTime / NUM_STAGES;
    let cursor = 0;
    let progress = 0;
    for (let i = 0; i < NUM_STAGES; i++) {
      // Drawing window for stage i.
      if (elapsed < cursor + perStageDraw) {
        const local = elapsed - cursor;
        progress = (i + Math.max(0, Math.min(1, local / perStageDraw))) / NUM_STAGES;
        return progress;
      }
      cursor += perStageDraw;
      // Dwell window AFTER stage i (except after the last).
      if (i < NUM_STAGES - 1) {
        if (elapsed < cursor + STAGE_DWELL_MS) {
          progress = (i + 1) / NUM_STAGES;
          return progress;
        }
        cursor += STAGE_DWELL_MS;
      }
    }
    return 1;
  };

  useFrame((_, dt) => {
    if (!prepared) return;
    const fBoot = fBootRef.current;
    const wallElapsed = performance.now() - startedAtRef.current;

    const phaseAStart = HOLOGRAM_BOOT_MS;
    const phaseAEnd = phaseAStart + prepared.wireBuildMs;
    const phaseBEnd = phaseAEnd + prepared.matBuildMs;

    // Phase A — staged wireframe build with dwell pauses
    const wireProgress = wallElapsed < phaseAStart
      ? 0
      : wallElapsed >= phaseAEnd
        ? 1
        : stagedProgress(wallElapsed - phaseAStart, prepared.wireBuildMs);

    // Phase B — staged hero (material) build with the same step pattern
    const heroProgress = wallElapsed < phaseAEnd
      ? 0
      : wallElapsed >= phaseBEnd
        ? 1
        : stagedProgress(wallElapsed - phaseAEnd, prepared.matBuildMs);

    // Phase C — wireframe fadeout
    const fadeT = Math.min(
      1,
      Math.max(0, (wallElapsed - phaseBEnd) / Math.max(1, prepared.wireFadeOutMs)),
    );
    const wireOpacityScale = 1 - smoothstep01(fadeT);

    const bootMul = fBoot < 1 ? hologramBoot(fBoot) : 1;

    // Apply growing drawRange to wireframe meshes.
    for (let i = 0; i < prepared.wireframeMeshes.length; i++) {
      const m = prepared.wireframeMeshes[i]!;
      const target = Math.floor(m.fullCount * wireProgress);
      const aligned = target - (target % 3);
      m.mesh.geometry.setDrawRange(0, Math.max(0, Math.min(m.fullCount, aligned)));
    }
    setOpacityDeep(prepared.wireframe, bootMul * 0.94 * wireOpacityScale);

    // Apply growing drawRange to hero meshes.
    for (let i = 0; i < prepared.heroMeshes.length; i++) {
      const m = prepared.heroMeshes[i]!;
      const target = Math.floor(m.fullCount * heroProgress);
      const aligned = target - (target % 3);
      m.mesh.geometry.setDrawRange(0, Math.max(0, Math.min(m.fullCount, aligned)));
    }
    // Hero uses binary on/off via setHeroState (NOT setOpacityDeep) so the
    // PBR materials render fully opaque — no alpha-blending pipeline
    // washing out normal maps and metallic reflections.
    setHeroState(prepared.hero, heroProgress > 0);

    if (rootRef.current) {
      rootRef.current.scale.setScalar(
        prepared.fit.scale * scale * hologramBootScale(fBoot),
      );
      if (autoRotate !== 0) {
        rootRef.current.rotation.y += autoRotate * dt;
      }
    }
  });

  if (!prepared) return <group ref={rootRef} />;

  return (
    <group
      ref={rootRef}
      position={[
        prepared.fit.offset.x * prepared.fit.scale,
        prepared.fit.offset.y * prepared.fit.scale,
        prepared.fit.offset.z * prepared.fit.scale,
      ]}
      scale={prepared.fit.scale * scale}
    >
      <primitive object={prepared.wireframe} />
      <primitive object={prepared.hero} />
    </group>
  );
};

export default HeavyProgressiveEngine;
