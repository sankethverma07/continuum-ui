/**
 * <MultiElementProgressiveEngine /> — multi-element reveal engine.
 *
 * Architecture lessons baked in (learned the hard way):
 *
 *   1. ONE hero scene clone, ONE wireframe scene clone. Per-element
 *      scene cloning was the source of every multi-element rendering
 *      bug — material refs got dropped, visibility got out of sync,
 *      texture bindings died on clone.
 *
 *   2. Materials are NEVER touched. No `material.clone()`, no
 *      `transparent` toggle, no `opacity` modification, no
 *      `needsUpdate = true` ever. Drei's GLTFLoader hands us perfectly
 *      formed PBR materials; we render them exactly as-is.
 *
 *   3. Visibility is mesh-level via `obj.visible`, never via material
 *      opacity. PBR shaders care about transparency state for normal-
 *      map / metalness rendering; visibility is a free toggle.
 *
 *   4. Build progress is purely `geometry.setDrawRange(0, n)`. No
 *      shader recompiles, no material mutation, no material allocation.
 *
 *   5. Per-element behaviour is driven by a `Map<sourceUUID, elementIdx>`
 *      built during prep. Every frame, useFrame walks the meshes in the
 *      ONE scene clone and looks up which element each belongs to. No
 *      per-element scene tree.
 *
 * Pipeline:
 *
 *   mapAsset(scene)                        // detect distinct elements
 *     ↓
 *   stamp source UUIDs on userData         // for post-clone lookup
 *     ↓
 *   clone hero scene (geometry only)       // proven McLaren-grade path
 *   clone wireframe scene (replace mats)   // wireframe MeshBasicMaterial
 *     ↓
 *   build mesh→element membership map      // one lookup per useFrame mesh
 *     ↓
 *   compute per-element timings            // sqrt-weighted by tris,
 *                                          // staggered start times
 *     ↓
 *   useFrame:                              // for each mesh:
 *     lookup element                       //   - get current progress
 *     compute element-local progress       //   - setDrawRange
 *     apply drawRange + visibility         //   - toggle visible
 *
 * The wireframe overlay renders on top with depthTest:false, exactly as
 * the standard engine. The hero materials are the GLB's original PBR
 * instances, untouched, rendering at full Sketchfab fidelity.
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
import { mapAsset } from '../utils/assetMapper';
import { useShaderWarmup } from '../utils/useShaderWarmup';

// ---------------------------------------------------------------------------
// Helpers (self-contained — no imports from sister engines for clarity)
// ---------------------------------------------------------------------------

interface FitTransform {
  readonly offset: THREE.Vector3;
  readonly scale: number;
}

const TARGET_EXTENT = 3.2;

const computeFit = (root: THREE.Object3D): FitTransform => {
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxAxis = Math.max(size.x, size.y, size.z) || 1;
  return { offset: center.negate(), scale: TARGET_EXTENT / maxAxis };
};

const smoothstep01 = (x: number): number => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/**
 * Hero clone — geometry cloned per mesh so we can mutate index buffers
 * + drawRange without affecting the source. Materials are the source's
 * material refs, untouched. This is the McLaren-proven path.
 */
const buildHeroClone = (source: THREE.Object3D): THREE.Object3D => {
  const clone = source.clone(true);
  clone.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry = obj.geometry.clone();
    }
  });
  return clone;
};

/** Deterministic Fisher-Yates triangle shuffle on an indexed geometry. */
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

/**
 * Wireframe clone — every mesh gets its geometry cloned + index shuffled
 * + material replaced with a fresh wireframe MeshBasicMaterial. Not
 * destructive to the source or hero clone.
 */
const buildWireframeClone = (
  source: THREE.Object3D,
  color: string,
): THREE.Object3D => {
  const clone = source.clone(true);
  let seedCursor = 1;
  clone.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry = obj.geometry.clone();
      shuffleIndexDeterministic(obj.geometry as THREE.BufferGeometry, seedCursor++);
      obj.material = new THREE.MeshBasicMaterial({
        color,
        wireframe: true,
        transparent: true,
        opacity: 0,
        depthTest: false,   // always render edges over hero materials
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });
      obj.renderOrder = 999;
    }
  });
  return clone;
};

/**
 * Stamp source mesh UUIDs onto userData. Cloned scenes inherit userData
 * via JSON-deep-copy in THREE.Object3D.copy(), so we can recover "which
 * source mesh did this cloned mesh originate from" on the clone side.
 */
const stampSourceUUIDs = (scene: THREE.Object3D): void => {
  scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.userData = { ...obj.userData, ['__sourceUUID']: obj.uuid };
    }
  });
};

// ---------------------------------------------------------------------------
// Public engine
// ---------------------------------------------------------------------------

export interface MultiElementProgressiveEngineProps {
  readonly heroSource: THREE.Object3D;
  readonly registryId: string;
  readonly scale: number;
  readonly autoRotate: number;
  readonly runToken: number;
  readonly blueprintColor: string;
  readonly onHydrated?: (() => void) | undefined;
}

interface PreparedElement {
  readonly index: number;
  readonly id: string;
  readonly triangleCount: number;
  /** ms (relative to build phase start) when this element starts building. */
  readonly startMs: number;
  /** Wireframe build duration, ms. Sublinear in tris. */
  readonly wireBuildMs: number;
  /** Material build duration, ms. ~70% of wireBuild. */
  readonly matBuildMs: number;
}

interface PreparedMesh {
  readonly mesh: THREE.Mesh;
  readonly fullCount: number; // 0 if non-indexed
  readonly elementIndex: number;
}

interface Prepared {
  readonly fit: FitTransform;
  readonly hero: THREE.Object3D;
  readonly wireframe: THREE.Object3D;
  readonly heroMeshes: ReadonlyArray<PreparedMesh>;
  readonly wireframeMeshes: ReadonlyArray<PreparedMesh>;
  readonly elements: ReadonlyArray<PreparedElement>;
  /** ms when the latest-finishing element completes its material build. */
  readonly globalBuildEndMs: number;
  /** Wireframe global fadeout duration after globalBuildEndMs. */
  readonly wireFadeOutMs: number;
}

/**
 * Pick a build window per triangle count — sublinear so a 200K element
 * doesn't take 100× longer than a 2K one, but still long enough to
 * read as deliberate.
 */
const pickWireBuildMs = (tris: number): number => {
  if (tris < 2_000)   return 1200;
  if (tris < 10_000)  return 1800;
  if (tris < 50_000)  return 2600;
  if (tris < 200_000) return 3400;
  return 4200;
};

export const MultiElementProgressiveEngine = ({
  heroSource,
  registryId,
  scale,
  autoRotate,
  runToken,
  blueprintColor,
  onHydrated,
}: MultiElementProgressiveEngineProps) => {
  const [prepared, setPrepared] = useState<Prepared | null>(null);

  // Pre-warm shaders so the multi-element reveal doesn't stutter on the
  // first frame. See useShaderWarmup.ts — same fix used in the standard
  // engine. Multi-element scenes can have many distinct material variants
  // (e.g. one per spaceship) so the cold-compile cost compounds.
  useShaderWarmup(heroSource ?? null, { label: `multi:${registryId}` });

  useEffect(() => {
    let cancelled = false;
    setPrepared(null);
    if (!heroSource) return undefined;

    (async () => {
      // 1. Map the asset into elements.
      const assetMap = mapAsset(heroSource);
      if (cancelled || assetMap.elements.length === 0) return;

      // 2. Build a lookup: source mesh UUID → element index.
      //    AssetElement.meshes references the SOURCE mesh instances, so
      //    their .uuid is the source UUID.
      const uuidToElement = new Map<string, number>();
      assetMap.elements.forEach((el, idx) => {
        el.meshes.forEach((m) => uuidToElement.set(m.uuid, idx));
      });

      // 3. Stamp source UUIDs onto userData BEFORE cloning so the
      //    clones can recover element membership.
      stampSourceUUIDs(heroSource);

      // 4. Build the two clones (single hero + single wireframe).
      const hero = buildHeroClone(heroSource);
      const wireframe = buildWireframeClone(heroSource, blueprintColor);

      // 5. Walk the clones and build per-mesh records that include
      //    element membership. We also init drawRange = 0 so nothing
      //    renders before useFrame's first tick.
      const heroMeshes: PreparedMesh[] = [];
      hero.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          const sourceUUID = obj.userData['__sourceUUID'] as string | undefined;
          const elementIndex = sourceUUID ? uuidToElement.get(sourceUUID) ?? -1 : -1;
          if (elementIndex < 0) {
            // Mesh isn't part of any element — likely scene rigging.
            // Hide it; engine doesn't track it.
            obj.visible = false;
            return;
          }
          const fullCount = obj.geometry.index?.count ?? 0;
          if (fullCount > 0) obj.geometry.setDrawRange(0, 0);
          obj.visible = false; // turn on once heroProgress > 0
          heroMeshes.push({ mesh: obj, fullCount, elementIndex });
        }
      });

      const wireframeMeshes: PreparedMesh[] = [];
      wireframe.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          const sourceUUID = obj.userData['__sourceUUID'] as string | undefined;
          const elementIndex = sourceUUID ? uuidToElement.get(sourceUUID) ?? -1 : -1;
          if (elementIndex < 0) {
            obj.visible = false;
            return;
          }
          const fullCount = obj.geometry.index?.count ?? 0;
          if (fullCount > 0) obj.geometry.setDrawRange(0, 0);
          // Wireframe meshes start visible; their material opacity is 0
          // initially and gets ramped up by useFrame.
          wireframeMeshes.push({ mesh: obj, fullCount, elementIndex });
        }
      });

      // 6. Compute per-element timings. Each element starts a fraction
      //    into the previous element's build window so the eye reads a
      //    distinct "now this one is starting" beat without serialising
      //    everything.
      const STAGGER_FRACTION = 0.30;
      let cursor = 0;
      const elements: PreparedElement[] = assetMap.elements.map((el, idx) => {
        const wireBuildMs = pickWireBuildMs(el.triangleCount);
        const matBuildMs = Math.round(wireBuildMs * 0.7);
        const startMs = cursor;
        cursor += Math.round(wireBuildMs * STAGGER_FRACTION);
        return {
          index: idx,
          id: el.id,
          triangleCount: el.triangleCount,
          startMs,
          wireBuildMs,
          matBuildMs,
        };
      });

      const globalBuildEndMs = Math.max(
        ...elements.map((e) => e.startMs + e.wireBuildMs + e.matBuildMs),
      );

      const fit = computeFit(heroSource);

      setPrepared({
        fit,
        hero,
        wireframe,
        heroMeshes,
        wireframeMeshes,
        elements,
        globalBuildEndMs,
        wireFadeOutMs: 500,
      });
    })().catch((err) => {
      console.error('MultiElementProgressiveEngine: prepare failed', err);
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
      HOLOGRAM_BOOT_MS + prepared.globalBuildEndMs + prepared.wireFadeOutMs;
    let raf = 0;
    const tick = () => {
      const elapsed = performance.now() - startedAtRef.current;
      fBootRef.current = elapsed < HOLOGRAM_BOOT_MS
        ? elapsed / HOLOGRAM_BOOT_MS
        : 1;
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

  useFrame((_, dt) => {
    if (!prepared) return;
    const fBoot = fBootRef.current;
    const wallElapsed = performance.now() - startedAtRef.current;
    const buildElapsed = Math.max(0, wallElapsed - HOLOGRAM_BOOT_MS);

    const fadeT = Math.min(
      1,
      Math.max(
        0,
        (buildElapsed - prepared.globalBuildEndMs) /
          Math.max(1, prepared.wireFadeOutMs),
      ),
    );
    const globalWireFade = 1 - smoothstep01(fadeT);
    const bootMul = fBoot < 1 ? hologramBoot(fBoot) : 1;
    const wireGlobalOpacity = bootMul * 0.92 * globalWireFade;

    // Walk hero meshes — each one looks up its element timing and applies.
    for (let i = 0; i < prepared.heroMeshes.length; i++) {
      const m = prepared.heroMeshes[i]!;
      const el = prepared.elements[m.elementIndex];
      if (!el) continue;
      const localBuild = buildElapsed - el.startMs;
      const matLocal = localBuild - el.wireBuildMs;
      const heroProgress = matLocal < 0
        ? 0
        : matLocal >= el.matBuildMs
          ? 1
          : matLocal / el.matBuildMs;

      if (m.fullCount > 0) {
        const target = Math.floor(m.fullCount * heroProgress);
        const aligned = target - (target % 3);
        m.mesh.geometry.setDrawRange(0, Math.max(0, Math.min(m.fullCount, aligned)));
      }
      m.mesh.visible = heroProgress > 0;
    }

    // Walk wireframe meshes — same per-element progress, but operating
    // on the wireframe build window. Opacity ramps via the wireframe
    // material's `opacity` property (safe — it's our own MeshBasicMaterial).
    for (let i = 0; i < prepared.wireframeMeshes.length; i++) {
      const m = prepared.wireframeMeshes[i]!;
      const el = prepared.elements[m.elementIndex];
      if (!el) continue;
      const localBuild = buildElapsed - el.startMs;
      const wireProgress = localBuild < 0
        ? 0
        : localBuild >= el.wireBuildMs
          ? 1
          : localBuild / el.wireBuildMs;

      if (m.fullCount > 0) {
        const target = Math.floor(m.fullCount * wireProgress);
        const aligned = target - (target % 3);
        m.mesh.geometry.setDrawRange(0, Math.max(0, Math.min(m.fullCount, aligned)));
      } else {
        m.mesh.visible = wireProgress > 0;
      }
      // Per-mesh opacity = global wireframe opacity scaled by whether
      // this element has started building yet (wireProgress > 0).
      const mat = m.mesh.material as THREE.Material;
      mat.opacity = wireProgress > 0 ? wireGlobalOpacity : 0;
    }

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
      {/* ONE wireframe + ONE hero, exactly like the standard engine
          that successfully renders BMW and McLaren. The per-element
          behaviour lives inside useFrame, not in the scene-graph. */}
      <primitive object={prepared.wireframe} />
      <primitive object={prepared.hero} />
    </group>
  );
};

export default MultiElementProgressiveEngine;
