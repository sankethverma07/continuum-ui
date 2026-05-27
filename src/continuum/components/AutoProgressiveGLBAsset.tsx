/**
 * Runtime consumers for the ingest pipeline — refactored for fully-procedural
 * per-tier subdivision on any uploaded asset.
 *
 * Two public components, both using the same blueprint → material engine:
 *
 *   <AutoProgressiveGLBAsset entry={catalogEntry} />
 *       Loads the highest-fidelity .glb URL from a Supabase-backed catalog
 *       row, then procedurally derives N visually-distinct LOD tiers
 *       client-side via meshoptimizer's WASM simplifier. Tiers are then
 *       built in sequence (sparse silhouette → full mesh) by a smart
 *       scheduler that allocates wall-clock time per tier proportional to
 *       triangle delta.
 *
 *   <AutoProgressiveFromObjects tierObjects={THREE.Object3D[]} />
 *       Same engine, but the tiers are handed in already-built — used for
 *       the /auto page's reference-watch demo before the user uploads a
 *       real .glb. Once the first upload lands, this path is only kept for
 *       dev fixtures.
 *
 * The pipeline:
 *   1. analyzeAsset(scene) → silhouette + material report + recommended
 *      tier ratios.
 *   2. decimateSceneByMesh(scene, ratios) → per-mesh array of decimated
 *      THREE.BufferGeometry.
 *   3. createBuildScheduler(triCounts) → time-budget plan with smooth
 *      crossfades between tiers.
 *   4. ProgressiveEngine renders frame-by-frame using the scheduler's
 *      output: setDrawRange grows the active tier's triangle count, then
 *      crossfades to the next tier, then finally reveals materials.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

import type { CatalogEntry } from '../catalog/types';
import { useContinuumStore } from '../store/useContinuumStore';
import { engineExtendLoader } from '../utils/configureGLTFLoader';
import { DEFAULT_BLUEPRINT_COLOR } from './WristwatchAsset';
import {
  hologramBoot,
  hologramBootScale,
  HOLOGRAM_BOOT_MS,
} from '../utils/hologram';
import { analyzeAsset } from '../utils/assetAnalyzer';
import { HeavyProgressiveEngine } from './HeavyProgressiveEngine';
import { MultiElementProgressiveEngine } from './MultiElementProgressiveEngine';
import { mapAsset } from '../utils/assetMapper';
import { useShaderWarmup } from '../utils/useShaderWarmup';

// Routing thresholds.
const HEAVY_TRI_THRESHOLD = 100_000;
const HEAVY_MESH_COUNT_THRESHOLD = 5;
const HEAVY_BYTE_THRESHOLD = 15_000_000;

type EngineChoice = 'standard' | 'heavy' | 'multi-element';

/**
 * Route a loaded scene to the right engine based on its actual structure.
 *
 *   multi-element → 2+ distinct elements with their OWN materials/colors
 *                   (e.g., two spaceships in different colors). Each
 *                   element gets its own wireframe+material reveal.
 *
 *   heavy         → very high complexity OR LOD-comparison sheet (multiple
 *                   spatially-separated copies that share materials).
 *                   Picks the most-detailed cluster, hides the rest.
 *
 *   standard      → everything else.
 *
 * The multi-element check fires FIRST because it's the most specific —
 * we only want to fall through to "heavy" if there really are duplicate
 * LOD copies (shared materials across clusters).
 */
const chooseEngine = (
  scene: THREE.Object3D,
  totalTris: number,
  sourceBytes: number | undefined,
): EngineChoice => {
  const map = mapAsset(scene);

  // Multi-element check: 2+ elements where the materials AREN'T all the
  // same (otherwise it's an LOD-comparison sheet → heavy engine path).
  if (map.elements.length >= 2) {
    // Compare element[0]'s materials against element[1+]'s materials.
    // If any element references DIFFERENT material instances, treat as
    // multi-element.
    const firstMatRefs = new Set(map.elements[0]!.materials.map((m) => m.material));
    let hasDistinctMaterials = false;
    for (let i = 1; i < map.elements.length; i++) {
      const el = map.elements[i]!;
      for (const m of el.materials) {
        if (!firstMatRefs.has(m.material)) {
          hasDistinctMaterials = true;
          break;
        }
      }
      if (hasDistinctMaterials) break;
    }
    // Even if materials are shared by reference, distinct base colors
    // also indicate "different visual treatments" → multi-element.
    if (!hasDistinctMaterials && map.elements.length >= 2) {
      const c0 = map.elements[0]!.dominantColor;
      for (let i = 1; i < map.elements.length; i++) {
        const ci = map.elements[i]!.dominantColor;
        const colorDelta =
          Math.abs(c0.r - ci.r) + Math.abs(c0.g - ci.g) + Math.abs(c0.b - ci.b);
        if (colorDelta > 0.15) { hasDistinctMaterials = true; break; }
      }
    }
    if (hasDistinctMaterials) return 'multi-element';
  }

  // Heavy thresholds.
  if (totalTris > HEAVY_TRI_THRESHOLD) return 'heavy';
  if (sourceBytes !== undefined && sourceBytes > HEAVY_BYTE_THRESHOLD) return 'heavy';
  let meshCount = 0;
  scene.traverse((o) => { if (o instanceof THREE.Mesh) meshCount++; });
  if (meshCount > HEAVY_MESH_COUNT_THRESHOLD) return 'heavy';

  return 'standard';
};

// ---------------------------------------------------------------------------
// Bounding-box helpers — Spline + Blender export at wildly different scales.
// We normalise so every asset arrives inside a ~3-unit cube centred at origin.
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
  return {
    offset: center.negate(),
    scale: TARGET_EXTENT / maxAxis,
  };
};

// ---------------------------------------------------------------------------
// Per-tier scene clone — wireframe overlay using a specific decimated geom
// ---------------------------------------------------------------------------

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

const smoothstep01 = (x: number): number => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/**
 * Hero on/off — only toggles `visible`, never mutates material props.
 * Forcing transparent/opacity/needsUpdate every frame can drop PBR
 * texture bindings (normal map, metalness map) on certain GLTF exports
 * and forces shader-program recompiles. Mesh.visible is the safe path.
 */
const setHeroState = (root: THREE.Object3D, on: boolean): void => {
  root.visible = on;
};

const cloneWithMaterials = (source: THREE.Object3D): THREE.Object3D => {
  const clone = source.clone(true);
  clone.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      // Geometry clone so we can mutate the index buffer (shuffle for the
      // material-build phase) without affecting the source / wireframe.
      // THREE.Object3D.clone(true) reuses geometry by reference — we have
      // to opt into the geometry copy here.
      obj.geometry = obj.geometry.clone();
      // CRITICAL: do NOT clone materials. THREE.js material.clone() can
      // silently drop PBR texture bindings (normal map, metalness map,
      // ORM channels) on certain GLB exports, leaving the mesh rendering
      // dark with no textures. Since we never mutate materials anywhere
      // in the engine (visibility is toggled via mesh.visible only,
      // build progress via geometry.setDrawRange), we can safely share
      // the original material references. They render exactly as drei's
      // GLTF loader produced them — full PBR with all textures intact.
    }
  });
  return clone;
};

/**
 * Pair the hero clone's meshes with the wireframe clone's meshes so they
 * share the same shuffled triangle order. As `setDrawRange` grows on the
 * wireframe, the same range grows on the hero — meaning the triangles
 * that already have wireframe edges drawn ALSO get their PBR material
 * filled in, in lockstep, in the same spatial pattern.
 *
 * Returns a parallel array of hero-mesh refs aligned with the wireframe
 * meshes by traversal order. Both clones are walked with the same
 * predicate so the ordering is stable.
 */
const pairHeroToWireframe = (
  hero: THREE.Object3D,
  wireframeMeshes: ReadonlyArray<{ mesh: THREE.Mesh; fullCount: number }>,
): Array<{ mesh: THREE.Mesh; fullCount: number }> => {
  const heroMeshes: THREE.Mesh[] = [];
  hero.traverse((obj) => {
    if (obj instanceof THREE.Mesh) heroMeshes.push(obj);
  });
  const out: Array<{ mesh: THREE.Mesh; fullCount: number }> = [];
  for (let i = 0; i < wireframeMeshes.length; i++) {
    const heroMesh = heroMeshes[i];
    const wf = wireframeMeshes[i]!;
    if (!heroMesh || !heroMesh.geometry.index) continue;
    // Re-shuffle the hero's index using the SAME seed as the wireframe
    // (i + 1) so that "first N triangles" of the hero is the same set
    // of triangles as "first N" of the wireframe — they grow together.
    shuffleIndexDeterministic(heroMesh.geometry as THREE.BufferGeometry, i + 1);
    out.push({
      mesh: heroMesh,
      fullCount: heroMesh.geometry.index.count,
    });
    void wf; // alignment-only reference
  }
  return out;
};

/**
 * Deterministic Fisher-Yates shuffle of a BufferGeometry's triangle index
 * list. The point: when the engine later progressively grows
 * `setDrawRange()` from 0 → full, the triangles that appear are spread
 * RANDOMLY across the mesh surface instead of marching from one corner
 * to the other in declaration order. This is what makes the densification
 * read as "the model is resolving" rather than "a curtain is being drawn".
 */
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
 * Build ONE wireframe scene clone from the highest-fidelity source. Each
 * Mesh keeps its original geometry (cloned + index-shuffled) and gets a
 * blueprint-colour wireframe material. The engine then drives a SINGLE
 * continuous `setDrawRange()` build across the whole reveal — no per-tier
 * resets, no second build pass.
 *
 * We dropped the per-tier "swap between independently-decimated geometries"
 * approach because each decimation produces a different vertex set, so
 * the swap reads as a hard reset (back-to-zero triangle count) followed
 * by a re-build. A single shuffled-index growing wireframe gives a clean
 * monotonic densification with no resets.
 */
const buildSingleWireframe = (
  source: THREE.Object3D,
  color: string,
): THREE.Object3D => {
  const clone = source.clone(true);
  let seed = 1;
  clone.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      // Clone the geometry so our shuffle + drawRange mutations don't bleed
      // into the hero material clone (which renders the same source mesh).
      obj.geometry = obj.geometry.clone();
      shuffleIndexDeterministic(obj.geometry as THREE.BufferGeometry, seed++);
      obj.material = new THREE.MeshBasicMaterial({
        color,
        wireframe: true,
        transparent: true,
        opacity: 0,
        // depthTest: false + high renderOrder pins the wireframe to render
        // ON TOP of the hero materials during Phase B. Without this, the
        // wireframe edges and the hero PBR are coplanar (same source mesh)
        // and z-fighting hides the edges underneath the materials.
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

// ---------------------------------------------------------------------------
// ProgressiveEngine — thin router that picks the right sub-engine for the
// loaded asset, then delegates rendering. Each sub-engine owns its own
// hooks + scene-graph; the router never mounts more than one at a time.
// ---------------------------------------------------------------------------

interface ProgressiveEngineProps {
  readonly tierObjects: ReadonlyArray<THREE.Object3D>;
  readonly tierCount: number;
  readonly registryId: string;
  readonly scale: number;
  readonly autoRotate: number;
  readonly runToken: number;
  readonly blueprintColor: string;
  readonly onHydrated?: (() => void) | undefined;
  /** Total wall-clock budget (ms) for the full reveal. When set, the
   *  engine proportionally rescales every phase (boot + wire + mat +
   *  fade) to land at exactly this duration. Used by side-by-side
   *  comparisons to keep both viewers locked to the same clock. */
  readonly totalMsOverride?: number | undefined;
}

const ProgressiveEngine = (props: ProgressiveEngineProps) => {
  const heroSource = props.tierObjects[props.tierObjects.length - 1];

  // Decide which engine to use. The decision is purely structural — number
  // of distinct elements, total tri count, mesh count — so it's safe to
  // compute synchronously and memoise on the heroSource identity.
  const engineChoice = useMemo<EngineChoice>(() => {
    if (!heroSource) return 'standard';
    let totalTris = 0;
    heroSource.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const g = o.geometry as THREE.BufferGeometry;
        if (g.index) totalTris += Math.floor(g.index.count / 3);
        else {
          const pos = g.getAttribute('position');
          if (pos) totalTris += Math.floor(pos.count / 3);
        }
      }
    });
    return chooseEngine(heroSource, totalTris, undefined);
  }, [heroSource]);

  // The heavy engine path is still being stabilised — fall back to the
  // standard engine if it's selected. Multi-element is now live.
  if (engineChoice === 'multi-element' && heroSource) {
    return (
      <MultiElementProgressiveEngine
        heroSource={heroSource}
        registryId={props.registryId}
        scale={props.scale}
        autoRotate={props.autoRotate}
        runToken={props.runToken}
        blueprintColor={props.blueprintColor}
        onHydrated={props.onHydrated}
      />
    );
  }

  // Reference the heavy engine import so TS doesn't complain while it's
  // disabled. Heavy assets currently route to the standard engine.
  void HeavyProgressiveEngine;

  return <StandardProgressiveEngine {...props} />;
};

// ---------------------------------------------------------------------------
// StandardProgressiveEngine — single-clone wireframe + hero with shared
// shuffled indices. The McLaren / BMW path. Used for assets that don't
// look like multi-element scenes (single subject, low cluster count, etc.).
// ---------------------------------------------------------------------------

const StandardProgressiveEngine = ({
  tierObjects,
  tierCount: _tierCount,
  registryId,
  scale,
  autoRotate,
  runToken,
  blueprintColor,
  onHydrated,
  totalMsOverride,
}: ProgressiveEngineProps) => {
  const heroSource = tierObjects[tierObjects.length - 1];

  // --------------------------------------------------------------------
  // Phase 1 — analyze the hero, build ONE wireframe overlay (with shuffled
  // indices for spatial reveal), and one hero clone with materials.
  //
  // We deliberately don't decimate the mesh into N tiers anymore. The
  // procedural "swap between decimated tiers" approach caused a visible
  // re-build on every tier handoff because each decimation produces a
  // different vertex set — when tier i+1 takes over as the active tier,
  // its build progress resets to 0 and the user sees the wireframe drop
  // back to empty before re-densifying. A single growing wireframe with
  // shuffled indices gives a smooth monotonic build with no resets.
  //
  // The analyzer is still used to size the build window proportionally
  // to mesh complexity (heavy meshes get longer builds) and to surface
  // the "looksMaterialless" flag for diagnostics.
  // --------------------------------------------------------------------
  type Prepared = {
    readonly fit: FitTransform;
    readonly hero: THREE.Object3D;
    readonly wireframe: THREE.Object3D;
    readonly wireframeMeshes: ReadonlyArray<{
      readonly mesh: THREE.Mesh;
      readonly fullCount: number;
    }>;
    /** Hero meshes paired with wireframe meshes by traversal order; their
     *  index buffers share the same deterministic shuffle so growing
     *  setDrawRange on both produces matching spatial fill. */
    readonly heroMeshes: ReadonlyArray<{
      readonly mesh: THREE.Mesh;
      readonly fullCount: number;
    }>;
    /** Phase A — wireframe-only build (triangles arrive across surface). */
    readonly wireBuildMs: number;
    /** Phase B — material build (hero PBR fills in, wireframe stays on top). */
    readonly matBuildMs: number;
    /** Phase C — wireframe fades out, hero stays at full opacity. */
    readonly wireFadeOutMs: number;
  };
  const [prepared, setPrepared] = useState<Prepared | null>(null);

  // Pre-warm shaders + textures for the source scene as soon as the
  // hero is available. This kills the cold-reload stutter where each
  // unique PBR material variant causes a 30-200ms main-thread block
  // on first render. After warmup the GPU's program cache contains
  // every shader the build phase will ever encounter, so frame 1 of
  // the wireframe build runs at full frame rate. The warmup overlaps
  // the existing 600ms hologram-boot phase, so it's perceptually free.
  // See useShaderWarmup.ts for the full explanation.
  useShaderWarmup(heroSource ?? null, { label: `standard:${registryId}` });

  useEffect(() => {
    let cancelled = false;
    setPrepared(null);
    if (!heroSource) return undefined;

    (async () => {
      const report = analyzeAsset(heroSource);
      if (cancelled) return;

      // ----- Diagnostic dump — tells us EXACTLY what materials drei's
      // loader produced for this GLB. Use this to determine whether the
      // "missing texture detail" is (a) maps not loading, (b) maps not
      // present in the GLB, or (c) maps requiring PBR extensions that
      // THREE.js's GLTFLoader doesn't enable by default. -----
      // eslint-disable-next-line no-console
      console.group(`[Continuum] Asset material diagnostics — ${registryId}`);
      let meshIdx = 0;
      heroSource.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((m, mi) => {
            if (!m) return;
            const phys = m as THREE.MeshPhysicalMaterial & {
              map?: THREE.Texture | null;
              normalMap?: THREE.Texture | null;
              roughnessMap?: THREE.Texture | null;
              metalnessMap?: THREE.Texture | null;
              aoMap?: THREE.Texture | null;
              emissiveMap?: THREE.Texture | null;
            };
            // eslint-disable-next-line no-console
            console.log(`mesh#${meshIdx}.material[${mi}]`, {
              type: m.type,
              name: m.name,
              hasColor: !!phys.color,
              color: phys.color?.getHexString(),
              hasMap: !!phys.map,
              hasNormalMap: !!phys.normalMap,
              hasRoughnessMap: !!phys.roughnessMap,
              hasMetalnessMap: !!phys.metalnessMap,
              hasAOMap: !!phys.aoMap,
              hasEmissiveMap: !!phys.emissiveMap,
              roughness: phys.roughness,
              metalness: phys.metalness,
              clearcoat: phys.clearcoat,
              clearcoatRoughness: phys.clearcoatRoughness,
              transmission: phys.transmission,
              ior: phys.ior,
              sheen: phys.sheen,
            });
          });
          meshIdx++;
        }
      });
      // eslint-disable-next-line no-console
      console.log(`Total meshes: ${meshIdx}, total triangles: ${report.totalTriangles}`);
      // eslint-disable-next-line no-console
      console.groupEnd();

      const fit = computeFit(heroSource);
      const hero = cloneWithMaterials(heroSource);
      // Hero is invisible AND its drawRange is 0 by default. We progressively
      // grow drawRange during Phase B (in lockstep with wireframe shuffle)
      // and pin opacity to 1 once Phase B starts.
      setOpacityDeep(hero, 0);

      const wireframe = buildSingleWireframe(heroSource, blueprintColor);
      setOpacityDeep(wireframe, 0);

      const wireframeMeshes: Array<{ mesh: THREE.Mesh; fullCount: number }> = [];
      wireframe.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.geometry.index) {
          wireframeMeshes.push({ mesh: obj, fullCount: obj.geometry.index.count });
          obj.geometry.setDrawRange(0, 0);
        }
      });

      // Pair hero meshes with wireframe meshes (same shuffle seeds) so that
      // setDrawRange grown together produces matching surface coverage —
      // every triangle that gets a wireframe edge ALSO gets its material.
      const heroMeshes = pairHeroToWireframe(hero, wireframeMeshes);
      // Initialise hero meshes to 0 triangles drawn.
      heroMeshes.forEach(({ mesh }) => mesh.geometry.setDrawRange(0, 0));

      // Three-phase timing scaled to mesh complexity. Material build takes
      // ~70% as long as wireframe build — feels brisk after the cinematic
      // wireframe runway, but still long enough to read as "filling in".
      const totalTris = report.totalTriangles;
      let wireBuildMs =
        totalTris < 5_000 ? 1600 :
        totalTris < 30_000 ? 2400 :
        totalTris < 150_000 ? 3000 :
        3600;
      let matBuildMs = Math.round(wireBuildMs * 0.7);
      let wireFadeOutMs = 350;
      // Total-budget override — when the caller knows the wall-clock
      // budget the asset has to land in (e.g. the A/B compare page locks
      // both viewers to the same time), proportionally rescale every
      // phase so HOLOGRAM_BOOT_MS + wireBuild + matBuild + wireFadeOut
      // exactly equals the budget. Without this, the engine's tri-based
      // scheduler can run longer than the comparison's uniform side and
      // make the semantic side look slower instead of faster.
      if (totalMsOverride && totalMsOverride > HOLOGRAM_BOOT_MS + 400) {
        const remaining = totalMsOverride - HOLOGRAM_BOOT_MS;
        const naturalSum = wireBuildMs + matBuildMs + wireFadeOutMs;
        const scale = remaining / naturalSum;
        wireBuildMs = Math.round(wireBuildMs * scale);
        matBuildMs = Math.round(matBuildMs * scale);
        wireFadeOutMs = Math.round(wireFadeOutMs * scale);
      }

      setPrepared({
        fit,
        hero,
        wireframe,
        wireframeMeshes,
        heroMeshes,
        wireBuildMs,
        matBuildMs,
        wireFadeOutMs,
      });
    })().catch((err) => {
      console.error('ProgressiveEngine: prepare failed', err);
    });

    return () => { cancelled = true; };
  }, [heroSource, blueprintColor]);

  // --------------------------------------------------------------------
  // Phase 2 — once prepared, run the per-frame schedule.
  // --------------------------------------------------------------------
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

  useFrame((_, dt) => {
    if (!prepared) return;
    const fBoot = fBootRef.current;
    const wallElapsed = performance.now() - startedAtRef.current;

    // ------------------------------------------------------------------
    // FOUR-PHASE PROGRESSIVE REVEAL — wireframe in, materials in on top,
    // wireframe out. Each phase flows seamlessly into the next; the user
    // never sees an empty frame because Phase B holds the wireframe at
    // full opacity while the hero fills in beneath it.
    //
    //   Phase 0 — Hologram boot (HOLOGRAM_BOOT_MS, ~600ms)
    //     Wireframe opacity flickers up via the hologram curve. drawRange
    //     stays at 0; nothing actually renders, just opacity warming up.
    //
    //   Phase A — Wireframe build (wireBuildMs, scales with mesh complexity)
    //     Wireframe setDrawRange grows 0 → full. Triangles arrive across
    //     the surface (shuffled indices). Hero stays invisible (drawRange 0).
    //
    //   Phase B — Material build (matBuildMs, ~70% of Phase A)
    //     Wireframe pinned at full coverage and full opacity. Hero
    //     setDrawRange grows 0 → full IN THE SAME SHUFFLED ORDER, with
    //     hero opacity pinned at 1. The materials fill in across the
    //     surface UNDER the wireframe, which renders on top as glowing
    //     amber edges. No empty gap, no pop-in.
    //
    //   Phase C — Wireframe fadeout (wireFadeOutMs, ~350ms)
    //     Hero is at full coverage + opacity. Wireframe opacity smoothly
    //     drops to 0, leaving the clean PBR model. Single soft handoff.
    // ------------------------------------------------------------------
    const phaseAStart = HOLOGRAM_BOOT_MS;
    const phaseAEnd = phaseAStart + prepared.wireBuildMs;
    const phaseBEnd = phaseAEnd + prepared.matBuildMs;
    const phaseCEnd = phaseBEnd + prepared.wireFadeOutMs;

    // Phase A — wireframe drawRange progress
    const wireProgress = Math.min(
      1,
      Math.max(0, (wallElapsed - phaseAStart) / Math.max(1, prepared.wireBuildMs)),
    );

    // Phase B — hero drawRange progress
    const heroProgress = Math.min(
      1,
      Math.max(0, (wallElapsed - phaseAEnd) / Math.max(1, prepared.matBuildMs)),
    );

    // Phase C — wireframe fadeout
    const fadeT = Math.min(
      1,
      Math.max(0, (wallElapsed - phaseBEnd) / Math.max(1, prepared.wireFadeOutMs)),
    );
    const wireOpacityScale = 1 - smoothstep01(fadeT);

    const bootMul = fBoot < 1 ? hologramBoot(fBoot) : 1;

    // Wireframe drawRange — grow during Phase A, hold at full afterward.
    for (let i = 0; i < prepared.wireframeMeshes.length; i++) {
      const m = prepared.wireframeMeshes[i]!;
      const target = Math.floor(m.fullCount * wireProgress);
      const aligned = target - (target % 3);
      m.mesh.geometry.setDrawRange(0, Math.max(0, Math.min(m.fullCount, aligned)));
    }
    setOpacityDeep(prepared.wireframe, bootMul * 0.92 * wireOpacityScale);

    // Hero drawRange — grow during Phase B, hold at full afterward.
    // Hero state is binary on/off (not opacity-driven) so PBR materials
    // render fully opaque — no alpha-blending pipeline washing out
    // normal maps and metallic specular reflections.
    for (let i = 0; i < prepared.heroMeshes.length; i++) {
      const m = prepared.heroMeshes[i]!;
      const target = Math.floor(m.fullCount * heroProgress);
      const aligned = target - (target % 3);
      m.mesh.geometry.setDrawRange(0, Math.max(0, Math.min(m.fullCount, aligned)));
    }
    setHeroState(prepared.hero, heroProgress > 0);

    // Done flag — used to suppress unused-warning on phaseCEnd.
    void phaseCEnd;

    if (rootRef.current) {
      rootRef.current.scale.setScalar(
        prepared.fit.scale * scale * hologramBootScale(fBoot),
      );
      if (autoRotate !== 0) {
        rootRef.current.rotation.y += autoRotate * dt;
      }
    }
  });

  if (!prepared) {
    // Pre-render placeholder — invisible group so r3f's scene graph stays
    // mounted while we run analyzer + decimator off the main thread.
    return <group ref={rootRef} />;
  }

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

// ---------------------------------------------------------------------------
// Public: catalog-driven (production path)
// ---------------------------------------------------------------------------

export interface AutoProgressiveGLBAssetProps {
  readonly entry: CatalogEntry;
  readonly registryId: string;
  readonly scale?: number;
  readonly autoRotate?: number;
  readonly runToken?: number;
  readonly blueprintColor?: string;
  readonly onHydrated?: (() => void) | undefined;
}

/**
 * Asset rescue — pure geometric detection of carved detail.
 *
 * Some GLB exports (e.g. skull.glb from Sketchfab) ship with:
 *   1. A placeholder PBR material — near-zero baseColor, no textures,
 *      stray metalness. (Sketchfab's viewer overrides this at runtime;
 *      the .glb export carries the placeholder.)
 *   2. Smooth-shading vertex normals interpolated across the entire mesh,
 *      which average out the carved triangle facets the artist sculpted
 *      into the geometry.
 *
 * The fix is *purely detective* — no authored patterns, no procedural
 * textures, no synthesis. We only restore what's already in the file:
 *
 *   A. If the material is unmistakably a stub (dark color + no maps),
 *      switch the base color to neutral-bone so the diffuse term is
 *      visible. We do NOT bind any synthetic texture.
 *   B. Recompute vertex normals per-face from the actual triangle data,
 *      and flip the material to flat shading. This exposes every one of
 *      the 49K triangles the artist actually carved — the eye sockets,
 *      nasal cavity, zygomatic ridge, occipital bumps, etc. The "patterns"
 *      the user sees in a Sketchfab render are partly Sketchfab's runtime
 *      texture overlay (NOT in the .glb) and partly per-face shading the
 *      Sketchfab viewer enables by default. We do the second of these.
 *
 * Strict invariant: only mutate materials/normals when the file genuinely
 * lacks them. Don't touch anything that already has textures (BMW,
 * McLaren, free-fire all skip the rescue path entirely).
 */
const rescuePlaceholderMaterials = (scene: THREE.Object3D): void => {
  const seen = new Set<THREE.Material>();
  let rescuedAny = false;

  scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      if (!mat || seen.has(mat)) continue;
      seen.add(mat);
      const std = mat as THREE.MeshStandardMaterial & {
        map?: THREE.Texture | null;
        normalMap?: THREE.Texture | null;
        roughnessMap?: THREE.Texture | null;
        metalnessMap?: THREE.Texture | null;
      };
      if (!std.color) continue;

      const brightness = (std.color.r + std.color.g + std.color.b) / 3;
      const hasAnyMap = !!(std.map || std.normalMap || std.roughnessMap || std.metalnessMap);

      // Stub-material signature: very dark color + zero textures.
      if (brightness < 0.02 && !hasAnyMap) {
        // (A) Restore a sensible diffuse so the lighting actually reads.
        //     Neutral warm bone — closer to the achromatic side so it
        //     doesn't bias the appearance away from the carved geometry.
        std.color.setRGB(0.86, 0.81, 0.74);
        std.metalness = 0.0;
        std.roughness = 0.62;
        // (B) Switch to flat shading. With smooth shading enabled,
        //     drei's loader interpolates vertex normals across the whole
        //     49K-tri sculpt, which averages out every carved facet.
        //     flatShading=true tells THREE's shader to compute a normal
        //     per-face from the triangle vertices in the fragment shader,
        //     so every facet the artist carved (eye sockets, nasal
        //     cavity, occipital bumps, zygomatic ridge, jaw line)
        //     contributes its own shading discontinuity.
        std.flatShading = true;
        std.needsUpdate = true;
        rescuedAny = true;
        // eslint-disable-next-line no-console
        console.warn(
          `[Continuum] Rescued placeholder material "${mat.name || '(unnamed)'}" — ` +
            `restored diffuse + enabled flatShading for per-face normal detection.`,
        );
      }
    }

    // (B-cont) Recompute vertex normals from the actual triangle data
    // ONLY when the rescue fired. This is purely informational — flat
    // shading doesn't strictly need it, but it gives the smooth-shading
    // fallback (e.g. on hardware that ignores flatShading) a sharper
    // look too. Skipping when no rescue happened means we never touch
    // the BMW / McLaren / free-fire normals.
  });

  if (rescuedAny) {
    scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      // Only recompute normals on meshes whose material we just rescued.
      const wasRescued = mats.some((m) => {
        const c = (m as THREE.MeshStandardMaterial | null)?.color;
        if (!c) return false;
        // Approximate: if the color is now bone-cream and flatShading is on,
        // it's one of ours. Cheap, exact enough.
        return (
          (m as THREE.MeshStandardMaterial).flatShading === true &&
          Math.abs(c.r - 0.86) < 0.01 &&
          Math.abs(c.g - 0.81) < 0.01 &&
          Math.abs(c.b - 0.74) < 0.01
        );
      });
      if (!wasRescued) return;
      const geom = obj.geometry as THREE.BufferGeometry;
      // computeVertexNormals derives normals from the actual triangle
      // data — purely detective, no synthesis. After this call the
      // normals are guaranteed consistent with what the artist sculpted.
      geom.computeVertexNormals();
    });
  }
};

/**
 * **rescueOverTransparentMaterials** — fixes the "exported-as-glass" pathology.
 *
 * **The pathology.** Many DCC tools (Sketchfab uploads, Spline exports,
 * some Blender glTF exporter versions) default every material to
 * `alphaMode: BLEND` if ANY material in the scene needs alpha. The
 * artist meant "this one window is glass"; the exporter wrote "the
 * entire ship is glass." When Three.js loads such an asset:
 *   - GLTFLoader sets `material.transparent = true` per the spec
 *   - transparent materials don't write to the depth buffer
 *   - back-to-front sort over hundreds of double-sided panels is
 *     unstable, so OUTER hull triangles get drawn first, then INNER
 *     mechanical detail draws over them
 *   - the visual symptom is "the outer skin is missing" — but the
 *     texture is there, perfectly decoded, just composited away.
 *
 * **The diagnostic.** A material is over-transparent (artist intended
 * solid PBR but exporter set BLEND) when ALL of these hold:
 *   - `transparent === true`
 *   - has a complete PBR texture stack (baseColor + normal + MR/AO)
 *     — solid-painted hulls always have this; legitimate glass usually
 *     doesn't have a normal map and definitely doesn't have AO
 *   - `opacity === 1` and `alphaTest === 0` — i.e. nothing is even
 *     trying to use partial transparency
 *
 * **The fix.** Demote: `transparent = false`, `depthWrite = true`. The
 * texture's alpha channel becomes a no-op (which is fine — it's already
 * fully opaque if it ever existed). Render order returns to normal
 * front-to-back z-buffer occlusion. Outer skin renders correctly.
 *
 * **Safety.** We never demote materials that LACK a normal/AO map (a
 * legit glass material wouldn't have those). And we never touch
 * `material.alphaTest` if it's nonzero — that's MASK-mode, which the
 * artist explicitly chose. Tested: BMW, McLaren, free-fire, watch all
 * have alphaMode=OPAQUE so this rescue is a no-op for them.
 */
const rescueOverTransparentMaterials = (scene: THREE.Object3D): void => {
  const seen = new Set<THREE.Material>();
  let demoted = 0;

  scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      if (!mat || seen.has(mat)) continue;
      seen.add(mat);
      const std = mat as THREE.MeshStandardMaterial & {
        map?: THREE.Texture | null;
        normalMap?: THREE.Texture | null;
        roughnessMap?: THREE.Texture | null;
        metalnessMap?: THREE.Texture | null;
        aoMap?: THREE.Texture | null;
      };

      // Skip non-standard material types (e.g. shader materials, basic).
      if (typeof std.color === 'undefined') continue;

      // Skip if not actually transparent.
      if (!std.transparent) continue;

      // Skip MASK-mode (alphaTest > 0). That's intentional cutout (e.g.
      // foliage, perforated metal grilles) and demoting it would render
      // black squares where holes should be.
      if (std.alphaTest && std.alphaTest > 0) continue;

      // Skip materials that are partially see-through by FACTOR (not by
      // texture). A glass material legitimately has opacity < 1.
      if (std.opacity < 0.99) continue;

      // The "complete PBR stack" tell — a solid hull material has
      // baseColor + normal AND at least one of MR/AO. A glass material
      // typically has baseColor only, or baseColor + emissive.
      const hasNormal = !!std.normalMap;
      const hasMR = !!std.roughnessMap || !!std.metalnessMap;
      const hasAO = !!std.aoMap;
      const looksSolid = hasNormal && (hasMR || hasAO);
      if (!looksSolid) continue;

      // Demote to opaque rendering. The texture's alpha channel becomes
      // a no-op (it was already fully opaque if it ever existed), and
      // depth-buffer occlusion takes over from order-dependent blending.
      std.transparent = false;
      std.depthWrite = true;
      std.alphaTest = 0;
      std.needsUpdate = true;
      demoted++;
    }
  });

  if (demoted > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `[Continuum] Rescued ${demoted} over-transparent material(s) — ` +
        `demoted alphaMode=BLEND → OPAQUE on fully-textured PBR surfaces. ` +
        `Common when Sketchfab / Spline / Blender exporters default every ` +
        `material to BLEND because one window needed alpha.`,
    );
  }
};

export const AutoProgressiveGLBAsset = ({
  entry,
  registryId,
  scale = 1,
  autoRotate = 0.35,
  runToken = 0,
  blueprintColor = DEFAULT_BLUEPRINT_COLOR,
  onHydrated,
}: AutoProgressiveGLBAssetProps) => {
  // Only the LAST (hero) tier URL needs to be loaded — we derive every
  // other LOD client-side via the procedural decimator. We still load via
  // useGLTF so the loader cache + suspense behaviour is preserved.
  const heroUrl = entry.tiers[entry.tiers.length - 1]?.url ?? '';
  const tierUrls = useMemo(() => (heroUrl ? [heroUrl] : []), [heroUrl]);
  // engineExtendLoader attaches KTX2Loader (Basis-compressed textures),
  // DRACOLoader (compressed geometry), and MeshoptDecoder (alternate
  // geometry compression used by gltf-transform's `meshopt()` pass).
  // Catalog assets that go through our publish-side compression pipeline
  // require all three — without them you get "missing required extension"
  // errors at parse time.
  const gltfs = useGLTF(
    tierUrls,
    true,
    true,
    engineExtendLoader,
  ) as unknown as Array<{
    readonly scene: THREE.Object3D;
  }>;
  const tierObjects = useMemo(() => {
    const scenes = gltfs.map((g) => g.scene);
    // One-shot rescue per scene reference (idempotent — we only patch
    // materials that match the placeholder pattern, and once we patch
    // them they no longer match, so re-running is safe).
    scenes.forEach((s) => {
      rescuePlaceholderMaterials(s);
      rescueOverTransparentMaterials(s);
    });
    return scenes;
  }, [gltfs]);

  return (
    <ProgressiveEngine
      tierObjects={tierObjects}
      tierCount={entry.tierCount}
      registryId={registryId}
      scale={scale}
      autoRotate={autoRotate}
      runToken={runToken}
      blueprintColor={blueprintColor}
      onHydrated={onHydrated}
    />
  );
};

// Preload the catalog's tier URLs so the first replay doesn't stall on network.
export const preloadCatalogGLBs = (entry: CatalogEntry): void => {
  // Only the hero is actually consumed; preload it.
  const hero = entry.tiers[entry.tiers.length - 1];
  if (hero) useGLTF.preload(hero.url);
};

// ---------------------------------------------------------------------------
// Public: object-driven (demo / fixture path)
// ---------------------------------------------------------------------------

export interface AutoProgressiveFromObjectsProps {
  readonly tierObjects: ReadonlyArray<THREE.Object3D>;
  readonly registryId: string;
  readonly scale?: number;
  readonly autoRotate?: number;
  readonly runToken?: number;
  readonly blueprintColor?: string;
  readonly onHydrated?: (() => void) | undefined;
  /** Optional wall-clock budget (ms). Forces engine to land at this
   *  exact total. Used by side-by-side comparisons to lock both
   *  viewers to identical timelines. */
  readonly totalMsOverride?: number;
}

export const AutoProgressiveFromObjects = ({
  tierObjects,
  registryId,
  scale = 1,
  autoRotate = 0.35,
  runToken = 0,
  blueprintColor = DEFAULT_BLUEPRINT_COLOR,
  onHydrated,
  totalMsOverride,
}: AutoProgressiveFromObjectsProps) => (
  <ProgressiveEngine
    tierObjects={tierObjects}
    tierCount={tierObjects.length}
    registryId={registryId}
    scale={scale}
    autoRotate={autoRotate}
    runToken={runToken}
    blueprintColor={blueprintColor}
    onHydrated={onHydrated}
    totalMsOverride={totalMsOverride}
  />
);

export default AutoProgressiveGLBAsset;
