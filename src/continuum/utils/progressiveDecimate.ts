/**
 * progressiveDecimate — produces N visually-distinct LOD geometries from
 * a single source THREE.BufferGeometry. Powered by meshoptimizer's WASM
 * simplifier, which runs entirely in the browser (no server required).
 *
 * The output is what makes "watch the model build in real time" actually
 * work for arbitrary uploaded GLBs: each LOD is a real, separately
 * decimated mesh — sparse silhouette at LOD 0, full hero at LOD N-1 —
 * not just `setDrawRange()` on the same mesh. The progressive engine then
 * crossfades between them so the viewer sees the silhouette firm up.
 *
 * Algorithm: meshoptimizer's `simplify()` performs quadric edge collapse
 * with silhouette preservation. It targets a triangle ratio (e.g. 0.05
 * = keep 5%) and an error budget. Lower ratios + larger error budget →
 * more aggressive simplification → coarser silhouette.
 *
 * Performance: simplify() on a 200K-triangle mesh takes ~80-150 ms in a
 * modern browser. We run all LODs synchronously on the first render —
 * acceptable for the on-mount cost since the loading curtain is already
 * showing the wireframe build phase.
 */

import * as THREE from 'three';
import { MeshoptSimplifier } from 'meshoptimizer';

export interface DecimatedTier {
  /** Source-relative ratio actually achieved (may exceed target if mesh is too sparse to simplify). */
  readonly ratio: number;
  /** New decimated geometry — caller owns disposal. */
  readonly geometry: THREE.BufferGeometry;
  /** Final triangle count after simplification. */
  readonly triangleCount: number;
}

/**
 * Convert any incoming geometry to indexed-non-interleaved form so
 * meshoptimizer can read the position + index arrays directly. This is a
 * no-op when the geometry is already non-interleaved indexed (the common
 * case for glTF imports).
 */
const ensureSimpleIndexed = (
  source: THREE.BufferGeometry,
): THREE.BufferGeometry => {
  let geom = source;
  if (!geom.index) {
    // Non-indexed geometries are awkward — meshoptimizer's `simplify` requires an
    // index buffer. Synthesize an identity index so positions stay in declared order.
    const pos = geom.getAttribute('position');
    if (!pos) return geom;
    const count = pos.count;
    const Ctor = count < 65536 ? Uint16Array : Uint32Array;
    const arr = new Ctor(count);
    for (let i = 0; i < count; i++) arr[i] = i;
    geom = geom.clone();
    geom.setIndex(new THREE.BufferAttribute(arr, 1));
  }
  return geom;
};

/**
 * Run meshoptimizer's simplifier once for a target ratio. Returns a NEW
 * BufferGeometry preserving the source's vertex attributes (positions,
 * normals, UVs, colors) — only the index buffer is rewritten.
 *
 * `errorBudget` is in normalised mesh-units (0 = exact, 1 = anything goes).
 * Tighter budgets at low ratios produce blocky silhouettes; loose budgets
 * at high ratios just add noise. 0.04 hits a sweet spot for both.
 */
const simplifyOne = async (
  source: THREE.BufferGeometry,
  targetRatio: number,
  errorBudget = 0.04,
): Promise<DecimatedTier> => {
  await MeshoptSimplifier.ready;

  const geom = ensureSimpleIndexed(source);
  const pos = geom.getAttribute('position');
  const idx = geom.index!;
  if (!pos || !idx) {
    return {
      ratio: 1,
      geometry: source.clone(),
      triangleCount: idx ? Math.floor(idx.count / 3) : 0,
    };
  }

  // meshoptimizer expects flat Float32Array positions and Uint32Array
  // indices. Most THREE attributes are already in those types but we copy
  // defensively to avoid mutating the source.
  const positions = new Float32Array(pos.array.buffer.slice(0));
  const sourceIndex =
    idx.array instanceof Uint32Array
      ? new Uint32Array(idx.array)
      : new Uint32Array(idx.array as Uint16Array | Uint32Array);

  const targetIndexCount = Math.max(
    3,
    Math.floor((sourceIndex.length / 3) * targetRatio) * 3,
  );

  const [outIndex, outError] = MeshoptSimplifier.simplify(
    sourceIndex,
    positions,
    /* vertex_positions_stride */ 3,
    /* target_index_count */ targetIndexCount,
    /* target_error */ errorBudget,
    /* flags */ ['LockBorder'],
  ) as [Uint32Array, number];

  const decimated = new THREE.BufferGeometry();
  // Carry every attribute from the source so the decimated mesh can still
  // render with materials, normals, UVs, vertex colours, etc.
  for (const name in geom.attributes) {
    const attr = geom.attributes[name];
    if (attr) decimated.setAttribute(name, attr);
  }
  // Replace index with the decimated set
  const indexCtor = pos.count < 65536 ? Uint16Array : Uint32Array;
  const finalIndex = new indexCtor(outIndex.length);
  for (let i = 0; i < outIndex.length; i++) finalIndex[i] = outIndex[i] ?? 0;
  decimated.setIndex(new THREE.BufferAttribute(finalIndex, 1));
  decimated.computeBoundingBox();
  decimated.computeBoundingSphere();

  // Suppress unused-error warnings — the value is informational only.
  void outError;

  return {
    ratio: outIndex.length / sourceIndex.length,
    geometry: decimated,
    triangleCount: outIndex.length / 3,
  };
};

/**
 * Decimate a single source geometry into N tiers at the supplied ratios.
 * Ratios should be ascending (sparse → full). The last entry is treated as
 * the hero (returns a clone of the source, no simplification).
 *
 * Returns tiers in input order. Synchronous to the caller — internally
 * awaits the WASM module's one-time `ready` promise once across all calls.
 */
export const progressiveDecimate = async (
  source: THREE.BufferGeometry,
  ratios: ReadonlyArray<number>,
): Promise<DecimatedTier[]> => {
  await MeshoptSimplifier.ready;
  const out: DecimatedTier[] = [];
  for (let i = 0; i < ratios.length; i++) {
    const r = ratios[i] ?? 1;
    if (r >= 0.999 || i === ratios.length - 1) {
      // Hero: return source as-is (cloned) so caller can dispose freely.
      const idx = source.index;
      out.push({
        ratio: 1,
        geometry: source.clone(),
        triangleCount: idx ? Math.floor(idx.count / 3) : 0,
      });
    } else {
      out.push(await simplifyOne(source, r));
    }
  }
  return out;
};

/**
 * Convenience: walk a THREE.Object3D scene and produce, for each Mesh,
 * an array of N decimated geometries. The result is a Map keyed by the
 * original mesh's UUID so the caller can build per-tier scene clones
 * with the right geometry slotted in.
 *
 * This is what the engine consumes — given an arbitrary glTF scene, it
 * gets a consistent N-tier ladder of geometries per mesh, all generated
 * client-side from the source.
 */
export const decimateSceneByMesh = async (
  scene: THREE.Object3D,
  ratios: ReadonlyArray<number>,
): Promise<Map<string, DecimatedTier[]>> => {
  const result = new Map<string, DecimatedTier[]>();
  const meshes: THREE.Mesh[] = [];
  scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh) meshes.push(obj);
  });
  for (const mesh of meshes) {
    const tiers = await progressiveDecimate(
      mesh.geometry as THREE.BufferGeometry,
      ratios,
    );
    result.set(mesh.uuid, tiers);
  }
  return result;
};
