/**
 * meshClustering — group meshes in a loaded glTF scene by spatial
 * adjacency, then identify the "primary" cluster (largest by triangle
 * count) so the heavy-asset engine can hide LOD-comparison duplicates
 * or unrelated supporting meshes.
 *
 * Concrete problem this solves: a lot of free GLBs from Sketchfab and
 * CGTrader package an "LOD comparison sheet" — three or four copies of
 * the same model at different decimation levels, laid out side-by-side
 * in world space. The standard reveal engine treats every mesh as part
 * of the hero asset, so the final state shows three small spaceships
 * floating in the void instead of one polished hero. The clustering
 * step here splits those into distinct groups; pickPrimaryCluster
 * then keeps only the highest-detail one.
 *
 * Algorithm:
 *   1. Compute world-space AABB for every mesh in the scene.
 *   2. Build a graph where edges connect meshes whose AABBs overlap
 *      OR are within `proximityFraction` of the global scene extent.
 *   3. Connected components of that graph are the clusters.
 *
 * O(N²) in mesh count which is fine for the ≤ 100 meshes we typically
 * see; we don't need a spatial hash for this scale.
 */

import * as THREE from 'three';

export interface MeshCluster {
  /** Meshes belonging to this cluster. Sorted by triangle count desc. */
  readonly meshes: ReadonlyArray<THREE.Mesh>;
  /** Total triangle count across all meshes in the cluster. */
  readonly triangleCount: number;
  /** Combined bounding box (world space). */
  readonly bounds: THREE.Box3;
  /** Center of the combined bounding box. */
  readonly center: THREE.Vector3;
  /** Largest single dimension of the combined bounds. */
  readonly extent: number;
}

const triCountOf = (mesh: THREE.Mesh): number => {
  const g = mesh.geometry as THREE.BufferGeometry;
  if (g.index) return Math.floor(g.index.count / 3);
  const pos = g.getAttribute('position');
  return pos ? Math.floor(pos.count / 3) : 0;
};

/**
 * Cluster all meshes in `scene` by spatial adjacency.
 *
 * @param scene Source glTF scene root.
 * @param proximityFraction Two meshes are considered adjacent if their
 *   world-space AABBs overlap, OR if the distance between them is less
 *   than this fraction of the global scene extent. Default 0.05 (5%).
 *   Lower = more clusters; higher = more aggressive grouping.
 */
export const clusterMeshesByProximity = (
  scene: THREE.Object3D,
  proximityFraction = 0.05,
): ReadonlyArray<MeshCluster> => {
  // Collect all meshes + their AABBs.
  const meshes: THREE.Mesh[] = [];
  scene.updateMatrixWorld(true);
  scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh) meshes.push(obj);
  });
  if (meshes.length === 0) return [];

  const boxes: THREE.Box3[] = meshes.map((m) => {
    const b = new THREE.Box3();
    b.setFromObject(m);
    return b;
  });

  // Global scene extent for proximity threshold.
  const sceneBox = new THREE.Box3();
  for (const b of boxes) sceneBox.union(b);
  const sceneSize = sceneBox.getSize(new THREE.Vector3());
  const sceneExtent = Math.max(sceneSize.x, sceneSize.y, sceneSize.z) || 1;
  const proximityDist = sceneExtent * proximityFraction;

  // Union-find for connected components.
  const parent = new Int32Array(meshes.length);
  for (let i = 0; i < meshes.length; i++) parent[i] = i;
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  // Pairwise check — O(N²). Two meshes are in the same cluster if their
  // AABBs intersect or their box-to-box distance is below proximityDist.
  for (let i = 0; i < meshes.length; i++) {
    for (let j = i + 1; j < meshes.length; j++) {
      const a = boxes[i]!;
      const b = boxes[j]!;
      if (a.intersectsBox(b)) {
        union(i, j);
        continue;
      }
      // Approximate gap via center-to-center minus combined "radius."
      const ca = a.getCenter(new THREE.Vector3());
      const cb = b.getCenter(new THREE.Vector3());
      const sa = a.getSize(new THREE.Vector3());
      const sb = b.getSize(new THREE.Vector3());
      const ra = Math.max(sa.x, sa.y, sa.z) * 0.5;
      const rb = Math.max(sb.x, sb.y, sb.z) * 0.5;
      const gap = ca.distanceTo(cb) - (ra + rb);
      if (gap <= proximityDist) union(i, j);
    }
  }

  // Group meshes by root.
  const groups = new Map<number, number[]>();
  for (let i = 0; i < meshes.length; i++) {
    const r = find(i);
    let arr = groups.get(r);
    if (!arr) { arr = []; groups.set(r, arr); }
    arr.push(i);
  }

  // Build cluster objects, sort meshes within each by tri count desc.
  const clusters: MeshCluster[] = [];
  for (const [, indices] of groups) {
    const clusterMeshes = indices.map((i) => meshes[i]!);
    clusterMeshes.sort((a, b) => triCountOf(b) - triCountOf(a));
    const totalTris = clusterMeshes.reduce((s, m) => s + triCountOf(m), 0);
    const bounds = new THREE.Box3();
    for (const i of indices) bounds.union(boxes[i]!);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const extent = Math.max(size.x, size.y, size.z) || 1;
    clusters.push({
      meshes: clusterMeshes,
      triangleCount: totalTris,
      bounds,
      center,
      extent,
    });
  }
  // Sort clusters by triangle count desc — primary first.
  clusters.sort((a, b) => b.triangleCount - a.triangleCount);
  return clusters;
};

/**
 * Pick the "primary" cluster.
 *
 * The heuristic intentionally favours clusters whose LARGEST single
 * mesh has the highest triangle count — not clusters with the highest
 * sum-of-triangles. This matters for Sketchfab "LOD comparison sheets"
 * where the primary asset is one big high-detail mesh, sitting near
 * smaller low-detail lookalikes. Picking by sum can incorrectly merge
 * two adjacent low-detail copies into a "winner" larger than the actual
 * hero. Picking by max-single-mesh tracks "where is the most detail
 * concentrated in one place" which is a much better proxy for "which
 * one is the polished hero you want to see."
 *
 * Tie-break: clusters are sorted internally by tri count desc, so we
 * compare each cluster's first mesh.
 */
export const pickPrimaryCluster = (
  clusters: ReadonlyArray<MeshCluster>,
): MeshCluster | null => {
  if (clusters.length === 0) return null;
  let best = clusters[0]!;
  let bestMaxMeshTris = best.meshes[0] ? triCountOf(best.meshes[0]) : 0;
  for (let i = 1; i < clusters.length; i++) {
    const c = clusters[i]!;
    const maxMesh = c.meshes[0] ? triCountOf(c.meshes[0]) : 0;
    if (maxMesh > bestMaxMeshTris) {
      best = c;
      bestMaxMeshTris = maxMesh;
    }
  }
  return best;
};

/**
 * Hide every mesh that is NOT in the chosen cluster. Walks the scene
 * once and toggles `visible` on each mesh by membership lookup.
 *
 * Returns a "restore" function the caller can invoke to put visibility
 * back the way it was — useful for replay scenarios where the engine
 * wants to re-evaluate clustering after a reset.
 */
export const isolateClusterMeshes = (
  scene: THREE.Object3D,
  cluster: MeshCluster,
): (() => void) => {
  const keep = new Set<THREE.Mesh>(cluster.meshes);
  const previous: Array<{ mesh: THREE.Mesh; visible: boolean }> = [];
  scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      previous.push({ mesh: obj, visible: obj.visible });
      obj.visible = keep.has(obj);
    }
  });
  return () => {
    previous.forEach(({ mesh, visible }) => {
      mesh.visible = visible;
    });
  };
};
