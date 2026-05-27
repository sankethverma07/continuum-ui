/**
 * assetMapper — turns a loaded glTF scene into a structured per-element
 * blueprint that the multi-element engine drives the reveal off of.
 *
 * Why a separate utility: the heavy / standard engines treat the scene
 * as one bag of meshes. Multi-element assets (a robot with arms and
 * legs; a tabletop with several distinct objects; a vehicle with body +
 * wheels + cockpit) need every element treated INDIVIDUALLY so that:
 *
 *   1. Each element's materials & textures stay scoped to its own meshes
 *      — drawRange progress on element A never accidentally pulls
 *      element B's triangles into the wrong rendering pass.
 *   2. Per-element complexity drives per-element timing — small details
 *      build fast, big subjects get the runway.
 *   3. The diagnostic panel can show what's actually in the file
 *      ("Element 1: cockpit · 4 materials · 12K tris · steel grey").
 *
 * Element grouping strategy — two passes:
 *
 *   Pass A: scene-graph hierarchy. If the GLB authoring tool gave us
 *   meaningful top-level children (e.g., a "Body" Group, a "Wheels"
 *   Group), we trust that hierarchy. This is the right call for hand-
 *   modelled assets out of Blender, Cinema 4D, Maya, etc.
 *
 *   Pass B: spatial clustering fallback. If the scene is a flat list of
 *   meshes (common with Spline / web-export pipelines that strip the
 *   hierarchy), we fall back to bounding-box clustering (same algorithm
 *   the heavy engine uses for cluster detection).
 *
 * The output is read-only and immutable; the engine consumes it.
 */

import * as THREE from 'three';
import { clusterMeshesByProximity } from './meshClustering';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ElementMaterial {
  /** Reference to the actual material instance — engine clones these later. */
  readonly material: THREE.Material;
  /** Approximate base colour (extracted from MeshStandardMaterial.color or default). */
  readonly baseColor: THREE.Color;
  /** Whether the material binds at least one texture map. */
  readonly hasTextures: boolean;
}

export interface AssetElement {
  /** Stable identifier — derived from the source group's name when available, else "element-N". */
  readonly id: string;
  /** Index in the parent map's elements array — used as a stable seed for shuffling, etc. */
  readonly index: number;
  /** Every Mesh that belongs to this element. Sorted by tri count desc. */
  readonly meshes: ReadonlyArray<THREE.Mesh>;
  /** Unique materials touched by this element's meshes (deduped by reference). */
  readonly materials: ReadonlyArray<ElementMaterial>;
  /** Total triangle count across all meshes in this element. */
  readonly triangleCount: number;
  /** Combined bounding box of every mesh in the element (world space). */
  readonly bounds: THREE.Box3;
  /** Centre of the bounds. */
  readonly center: THREE.Vector3;
  /** Triangle-weighted dominant base colour across the element's materials. */
  readonly dominantColor: THREE.Color;
}

export interface AssetMap {
  /** Every distinct element in the asset. Always at least 1 entry. */
  readonly elements: ReadonlyArray<AssetElement>;
  /** Total triangle count across all elements. */
  readonly totalTriangles: number;
  /** Combined bounding box of every mesh in the asset. */
  readonly bounds: THREE.Box3;
  /** Where the source-graph mapping came from — useful for diagnostics. */
  readonly source: 'hierarchy' | 'spatial-fallback' | 'single-mesh';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const triCountOf = (mesh: THREE.Mesh): number => {
  const g = mesh.geometry as THREE.BufferGeometry;
  if (g.index) return Math.floor(g.index.count / 3);
  const pos = g.getAttribute('position');
  return pos ? Math.floor(pos.count / 3) : 0;
};

const baseColorOf = (mat: THREE.Material): THREE.Color => {
  const m = mat as THREE.MeshStandardMaterial & { color?: THREE.Color };
  return m.color ? m.color.clone() : new THREE.Color(1, 1, 1);
};

const hasTexturesOn = (mat: THREE.Material): boolean => {
  const m = mat as THREE.MeshStandardMaterial & {
    map?: THREE.Texture | null;
    normalMap?: THREE.Texture | null;
    roughnessMap?: THREE.Texture | null;
    metalnessMap?: THREE.Texture | null;
    emissiveMap?: THREE.Texture | null;
  };
  return !!(m.map || m.normalMap || m.roughnessMap || m.metalnessMap || m.emissiveMap);
};

/** Extract every distinct material referenced by a list of meshes (dedup by ref). */
const extractMaterials = (meshes: ReadonlyArray<THREE.Mesh>): ElementMaterial[] => {
  const seen = new Set<THREE.Material>();
  const out: ElementMaterial[] = [];
  for (const mesh of meshes) {
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      if (!mat || seen.has(mat)) continue;
      seen.add(mat);
      out.push({
        material: mat,
        baseColor: baseColorOf(mat),
        hasTextures: hasTexturesOn(mat),
      });
    }
  }
  return out;
};

/** Compute the triangle-weighted dominant colour across an element's meshes. */
const computeDominantColor = (meshes: ReadonlyArray<THREE.Mesh>): THREE.Color => {
  const sum = new THREE.Color(0, 0, 0);
  let weight = 0;
  for (const mesh of meshes) {
    const tris = triCountOf(mesh);
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (!mats[0]) continue;
    const c = baseColorOf(mats[0]);
    sum.r += c.r * tris;
    sum.g += c.g * tris;
    sum.b += c.b * tris;
    weight += tris;
  }
  return weight > 0
    ? new THREE.Color(sum.r / weight, sum.g / weight, sum.b / weight)
    : new THREE.Color(1, 1, 1);
};

/** Build an AssetElement record from a list of meshes and a chosen id. */
const buildElement = (
  meshes: THREE.Mesh[],
  id: string,
  index: number,
): AssetElement => {
  const sorted = meshes.slice().sort((a, b) => triCountOf(b) - triCountOf(a));
  const triangleCount = sorted.reduce((s, m) => s + triCountOf(m), 0);
  const bounds = new THREE.Box3();
  for (const m of sorted) {
    const b = new THREE.Box3().setFromObject(m);
    bounds.union(b);
  }
  const center = bounds.getCenter(new THREE.Vector3());
  const materials = extractMaterials(sorted);
  const dominantColor = computeDominantColor(sorted);
  return {
    id,
    index,
    meshes: sorted,
    materials,
    triangleCount,
    bounds,
    center,
    dominantColor,
  };
};

/**
 * Walk the scene-graph hierarchy and return top-level groups that contain
 * at least one mesh. Returns null if the hierarchy is "flat" (root has
 * meshes as direct children rather than groups).
 */
const tryHierarchyGrouping = (
  scene: THREE.Object3D,
): Array<{ id: string; meshes: THREE.Mesh[] }> | null => {
  // Heuristic: if at least 2 top-level children are Groups (not Meshes),
  // we trust the hierarchy. Otherwise the scene is flat and we fall back
  // to spatial clustering.
  const topChildren = scene.children;
  const groupChildren = topChildren.filter(
    (c) => !(c instanceof THREE.Mesh) && c.children.length > 0,
  );
  if (groupChildren.length < 2) return null;

  const out: Array<{ id: string; meshes: THREE.Mesh[] }> = [];
  for (let i = 0; i < topChildren.length; i++) {
    const child = topChildren[i];
    if (!child) continue;
    const meshes: THREE.Mesh[] = [];
    child.traverse((o) => {
      if (o instanceof THREE.Mesh) meshes.push(o);
    });
    if (meshes.length === 0) continue;
    const id = (child.name && child.name.trim()) || `element-${i}`;
    out.push({ id, meshes });
  }
  return out.length >= 1 ? out : null;
};

// ---------------------------------------------------------------------------
// Public mapper
// ---------------------------------------------------------------------------

/**
 * Map a loaded glTF scene to a per-element AssetMap.
 *
 * The mapper guarantees:
 *   - Every Mesh in the scene appears in EXACTLY ONE element.
 *   - Material references are de-duplicated within an element.
 *   - Elements are sorted by triangle count desc — so element 0 is the
 *     "primary" subject, useful for the engine to give it the longest
 *     reveal runway when timing per-element budgets.
 */
export const mapAsset = (scene: THREE.Object3D): AssetMap => {
  scene.updateMatrixWorld(true);

  // Quick out for trivial scenes (1 mesh).
  const allMeshes: THREE.Mesh[] = [];
  scene.traverse((o) => { if (o instanceof THREE.Mesh) allMeshes.push(o); });
  if (allMeshes.length <= 1) {
    const element = buildElement(allMeshes, 'element-0', 0);
    const bounds = new THREE.Box3();
    for (const m of allMeshes) bounds.union(new THREE.Box3().setFromObject(m));
    return {
      elements: [element],
      totalTriangles: element.triangleCount,
      bounds,
      source: 'single-mesh',
    };
  }

  // Pass A — hierarchy grouping when authored well.
  const hier = tryHierarchyGrouping(scene);
  if (hier) {
    const elements = hier.map(({ id, meshes }, i) =>
      buildElement(meshes, id || `element-${i}`, i),
    );
    elements.sort((a, b) => b.triangleCount - a.triangleCount);
    // Re-index after sort.
    const reindexed = elements.map((e, i) => ({
      ...e,
      index: i,
    }));
    const totalTriangles = reindexed.reduce((s, e) => s + e.triangleCount, 0);
    const bounds = new THREE.Box3();
    for (const e of reindexed) bounds.union(e.bounds);
    return {
      elements: reindexed,
      totalTriangles,
      bounds,
      source: 'hierarchy',
    };
  }

  // Pass B — spatial fallback. Reuse the existing clustering algorithm.
  const clusters = clusterMeshesByProximity(scene, 0.05);
  const elements = clusters.map((cluster, i) =>
    buildElement(cluster.meshes.slice(), `element-${i}`, i),
  );
  // clusters are pre-sorted by triCount desc, but rebuild that just to be
  // explicit about ordering after element construction.
  elements.sort((a, b) => b.triangleCount - a.triangleCount);
  const reindexed = elements.map((e, i) => ({ ...e, index: i }));
  const totalTriangles = reindexed.reduce((s, e) => s + e.triangleCount, 0);
  const bounds = new THREE.Box3();
  for (const e of reindexed) bounds.union(e.bounds);
  return {
    elements: reindexed,
    totalTriangles,
    bounds,
    source: 'spatial-fallback',
  };
};
