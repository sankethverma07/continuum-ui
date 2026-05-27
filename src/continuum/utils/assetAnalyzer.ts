/**
 * assetAnalyzer — walks a loaded glTF scene and returns the metadata the
 * progressive engine needs to build a tier ladder for that specific asset.
 *
 * Why "per asset" matters: a 200-tri lamp asset shouldn't get the same
 * 7-stage build sequence as a 200K-tri car. The analyzer reads the actual
 * mesh + material complexity and recommends a tier count + ratios that
 * match. This is what we'd otherwise hand-tune per asset.
 *
 * Three things are extracted:
 *
 *   1. Silhouette: bounding box, total triangle count, per-mesh tri count.
 *      Drives "how complex is this object?" — feeds tier-count selection.
 *
 *   2. Material inventory: every material's base color, whether it has
 *      texture maps (color/normal/roughness/metalness), the dominant
 *      color across the whole asset (weighted by triangle count).
 *
 *   3. Recommended LOD ladder: an array of decimation ratios sized to the
 *      asset. Trivial mesh → 3 tiers at coarse ratios. Heavy mesh → 7
 *      tiers with fine-grained low end so the silhouette has time to
 *      build up.
 *
 * The analyzer is deliberately read-only — it doesn't mutate the scene.
 * Callers feed the returned ratios into the progressive decimator.
 */

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MaterialFingerprint {
  /** Approximate base colour, sampled from the material's diffuse channel. */
  readonly baseColor: THREE.Color;
  /** Whether ANY of the standard PBR maps are bound (color/normal/roughness/metalness). */
  readonly hasTextures: boolean;
  /** Roughness value if available, else a default. */
  readonly roughness: number;
  /** Metalness value if available, else a default. */
  readonly metalness: number;
}

export interface MeshFingerprint {
  readonly triangleCount: number;
  readonly hasUVs: boolean;
  readonly hasNormals: boolean;
  readonly material: MaterialFingerprint;
}

export interface AssetReport {
  /** Total triangle count summed across every mesh in the scene. */
  readonly totalTriangles: number;
  /** Bounding box of the entire scene (in scene-local units, pre-fit). */
  readonly bounds: THREE.Box3;
  /** Largest single dimension of the bounding box — proxy for asset scale. */
  readonly extent: number;
  /** Aspect ratio of bounds (max / min) — flags elongated vs roundish shapes. */
  readonly aspectRatio: number;
  /** Per-mesh fingerprints. */
  readonly meshes: ReadonlyArray<MeshFingerprint>;
  /** Triangle-weighted average colour across all meshes. */
  readonly dominantColor: THREE.Color;
  /** True if at least one material in the asset binds a real texture map. */
  readonly hasAnyTexture: boolean;
  /** True if every material's base color is at default (white) — likely
   *  an export with stripped materials we should warn about. */
  readonly looksMaterialless: boolean;
  /** Recommended tier count for this asset (3..7). */
  readonly tierCount: number;
  /** Recommended decimation ratios per tier, last element always 1.0. */
  readonly tierRatios: ReadonlyArray<number>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_WHITE = new THREE.Color(1, 1, 1);

const triangleCountOf = (geom: THREE.BufferGeometry): number => {
  if (geom.index) return Math.floor(geom.index.count / 3);
  const pos = geom.getAttribute('position');
  return pos ? Math.floor(pos.count / 3) : 0;
};

const fingerprintMaterial = (
  mat: THREE.Material | THREE.Material[] | undefined,
): MaterialFingerprint => {
  // Multi-material meshes: fingerprint the FIRST material — the secondary
  // materials are rare in glTF exports and pulling all of them would
  // bias the dominant-colour weighting.
  const m = (Array.isArray(mat) ? mat[0] : mat) as
    | (THREE.MeshStandardMaterial & { map?: THREE.Texture | null })
    | undefined;

  if (!m) {
    return {
      baseColor: DEFAULT_WHITE.clone(),
      hasTextures: false,
      roughness: 0.7,
      metalness: 0.0,
    };
  }

  const baseColor = (m.color ? m.color.clone() : DEFAULT_WHITE.clone());
  const hasTextures = !!(
    m.map ||
    (m as { normalMap?: THREE.Texture }).normalMap ||
    (m as { roughnessMap?: THREE.Texture }).roughnessMap ||
    (m as { metalnessMap?: THREE.Texture }).metalnessMap
  );
  const roughness =
    typeof (m as { roughness?: number }).roughness === 'number'
      ? (m as { roughness: number }).roughness
      : 0.7;
  const metalness =
    typeof (m as { metalness?: number }).metalness === 'number'
      ? (m as { metalness: number }).metalness
      : 0.0;

  return { baseColor, hasTextures, roughness, metalness };
};

/**
 * Map a complexity score to a sensible LOD count + ratio ladder.
 *
 * Why a curve? Two reasons. First, low-poly assets shouldn't spend three
 * tiers showing 5%, 10%, 15% wireframes — there isn't enough geometry for
 * those silhouettes to feel different. Second, high-poly assets benefit
 * from a long sparse runway because the user gets to "watch the model
 * resolve" — that's the whole pitch.
 *
 * Tiers are picked so the hero (last) is always ratio = 1.0, and
 * intermediate ratios are spaced LOG-arithmically so each step roughly
 * doubles the visible polygon count. Logarithmic spacing reads as
 * uniform progress to the eye even though it's exponential in triangles.
 */
const pickLODLadder = (
  triangleCount: number,
): { count: number; ratios: number[] } => {
  // Score combines triangle density and material richness — but we only
  // have triangles in the analyzer's hot path. Materials get folded in by
  // the caller via `tierCount` if it wants finer control.
  const tris = Math.max(1, triangleCount);

  let n: number;
  if (tris < 1_000) n = 3;
  else if (tris < 5_000) n = 4;
  else if (tris < 30_000) n = 5;
  else if (tris < 150_000) n = 6;
  else n = 7;

  // Build ratios on a log curve from `floor` → 1.0 with `n` stops.
  // `floor` controls how sparse the first wireframe is. Higher tri counts
  // start sparser so the build has more room to feel cinematic.
  const floor = tris < 5_000 ? 0.05 : tris < 50_000 ? 0.02 : 0.008;

  const ratios: number[] = [];
  for (let i = 0; i < n; i++) {
    if (i === n - 1) {
      ratios.push(1.0);
    } else {
      const t = i / (n - 1);
      // Log-curve interpolation between floor and 1.0
      const logFloor = Math.log(floor);
      const logTop = Math.log(1.0);
      ratios.push(Math.exp(logFloor + (logTop - logFloor) * t));
    }
  }
  return { count: n, ratios };
};

// ---------------------------------------------------------------------------
// Public analyzer
// ---------------------------------------------------------------------------

export const analyzeAsset = (scene: THREE.Object3D): AssetReport => {
  const meshes: MeshFingerprint[] = [];
  let totalTriangles = 0;
  let texturedMaterials = 0;
  let materiallessMaterials = 0;
  // Triangle-weighted color accumulator
  const sumColor = new THREE.Color(0, 0, 0);
  let sumWeight = 0;

  scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      const tris = triangleCountOf(obj.geometry as THREE.BufferGeometry);
      const fp = fingerprintMaterial(obj.material);
      meshes.push({
        triangleCount: tris,
        hasUVs: !!(obj.geometry as THREE.BufferGeometry).getAttribute('uv'),
        hasNormals: !!(obj.geometry as THREE.BufferGeometry).getAttribute('normal'),
        material: fp,
      });
      totalTriangles += tris;
      if (fp.hasTextures) texturedMaterials++;
      // "Looks materialless" heuristic: pure white base with no texture
      // suggests the export stripped the colour. We use this to flag the
      // Spline-stripped-material case to the user.
      const isWhiteish =
        fp.baseColor.r > 0.95 && fp.baseColor.g > 0.95 && fp.baseColor.b > 0.95;
      if (!fp.hasTextures && isWhiteish) materiallessMaterials++;
      sumColor.r += fp.baseColor.r * tris;
      sumColor.g += fp.baseColor.g * tris;
      sumColor.b += fp.baseColor.b * tris;
      sumWeight += tris;
    }
  });

  const bounds = new THREE.Box3().setFromObject(scene);
  const size = bounds.getSize(new THREE.Vector3());
  const extent = Math.max(size.x, size.y, size.z) || 1;
  const minDim = Math.min(size.x, size.y, size.z) || 1;
  const aspectRatio = extent / minDim;

  const dominantColor = new THREE.Color(
    sumWeight > 0 ? sumColor.r / sumWeight : 1,
    sumWeight > 0 ? sumColor.g / sumWeight : 1,
    sumWeight > 0 ? sumColor.b / sumWeight : 1,
  );

  const looksMaterialless =
    meshes.length > 0 &&
    materiallessMaterials === meshes.length &&
    texturedMaterials === 0;

  const { count, ratios } = pickLODLadder(totalTriangles);

  return {
    totalTriangles,
    bounds,
    extent,
    aspectRatio,
    meshes,
    dominantColor,
    hasAnyTexture: texturedMaterials > 0,
    looksMaterialless,
    tierCount: count,
    tierRatios: ratios,
  };
};
