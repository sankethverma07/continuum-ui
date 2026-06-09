/**
 * risingTriangles — particle layer matched to the skull effect.
 *
 * Studied src/continuum/components/ColorCloud.tsx (the /cloud demo) and
 * replicated its exact emergence pattern with triangles instead of
 * points. The pattern that makes it feel clean and deliberate:
 *
 *   - Each particle carries one stable random `aSeed` in [0, 1].
 *   - A global `uAttack` uniform ramps 0 → 1 over the rise stage.
 *   - `step(aSeed, uAttack)` decides visibility. A particle pops in
 *     the instant the attack value crosses its seed. Math.random()
 *     seeds cluster naturally so several particles always appear in
 *     the same instant — that's where the visible cluster groups
 *     come from, no extra logic needed.
 *   - On emergence, each particle gets a brief tangent-plane jitter
 *     that decays via `(1 - exp(-settle * 4))`. The wobble dies out
 *     in roughly 250 ms, leaving the particle pinned to the surface.
 *
 * Surface isolation: a small helper at the top of this file (the
 * "isolation engine") walks the asset hierarchy and returns the
 * Mesh nodes that form the visible surface. For glTF assets this is
 * every Mesh node with non-empty geometry; nothing internal to
 * subtract. We merge all of them into one combined surface in world
 * space, then use MeshSurfaceSampler to pick N uniformly-distributed
 * points across the whole thing. Each point becomes one triangle.
 */

import * as THREE from 'three';
import { MeshSurfaceSampler } from 'three-stdlib';

// ─── Surface isolation engine ────────────────────────────────────────

interface SurfaceSample {
  readonly position: THREE.Vector3;
  readonly normal: THREE.Vector3;
}

/**
 * The surface-isolation engine.
 *
 * Returns the Mesh nodes that form the asset's visible exterior. For
 * standard glTF assets, every Mesh under the root counts — we just
 * filter out non-visible / zero-vertex meshes. Future work may add
 * visibility raycasting to strip occluded internal geometry.
 */
const isolateSurfaceMeshes = (root: THREE.Object3D): THREE.Mesh[] => {
  const meshes: THREE.Mesh[] = [];
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    if (node.visible === false) return;
    const geom = node.geometry as THREE.BufferGeometry | undefined;
    if (!geom) return;
    const posAttr = geom.getAttribute('position');
    if (!posAttr || posAttr.count === 0) return;
    meshes.push(node);
  });
  return meshes;
};

/** Merge every isolated surface mesh into one non-indexed BufferGeometry in root-local space. */
const mergeIsolatedSurface = (root: THREE.Object3D): THREE.BufferGeometry | null => {
  const meshes = isolateSurfaceMeshes(root);
  if (meshes.length === 0) return null;

  root.updateWorldMatrix(true, true);

  const positions: number[] = [];
  const normals: number[] = [];
  const tmpV = new THREE.Vector3();
  const tmpN = new THREE.Vector3();

  for (const node of meshes) {
    const geom = node.geometry as THREE.BufferGeometry;
    const posAttr = geom.getAttribute('position');
    if (!posAttr) continue;
    const normalAttr = geom.getAttribute('normal');
    const indexAttr = geom.getIndex();

    node.updateWorldMatrix(true, false);
    const worldMatrix = node.matrixWorld;
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(worldMatrix);

    const pushTri = (a: number, b: number, c: number) => {
      [a, b, c].forEach((idx) => {
        tmpV.fromBufferAttribute(posAttr, idx).applyMatrix4(worldMatrix);
        positions.push(tmpV.x, tmpV.y, tmpV.z);
        if (normalAttr) {
          tmpN.fromBufferAttribute(normalAttr, idx).applyMatrix3(normalMatrix).normalize();
          normals.push(tmpN.x, tmpN.y, tmpN.z);
        } else {
          normals.push(0, 1, 0);
        }
      });
    };

    if (indexAttr) {
      for (let i = 0; i < indexAttr.count; i += 3) {
        pushTri(indexAttr.getX(i), indexAttr.getX(i + 1), indexAttr.getX(i + 2));
      }
    } else {
      for (let i = 0; i < posAttr.count; i += 3) {
        pushTri(i, i + 1, i + 2);
      }
    }
  }

  if (positions.length === 0) return null;

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal',   new THREE.Float32BufferAttribute(normals, 3));
  return merged;
};

/** Sample `count` uniformly-distributed surface points (position + normal). */
const sampleSurfaceUniformly = (
  root: THREE.Object3D,
  count: number,
): SurfaceSample[] => {
  const merged = mergeIsolatedSurface(root);
  if (!merged) return [];
  const helperMesh = new THREE.Mesh(merged, new THREE.MeshBasicMaterial());
  const sampler = new MeshSurfaceSampler(helperMesh).build();
  const samples: SurfaceSample[] = [];
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < count; i += 1) {
    sampler.sample(p, n);
    samples.push({ position: p.clone(), normal: n.clone().normalize() });
  }
  merged.dispose();
  return samples;
};

// ─── Triangle geometry ───────────────────────────────────────────────

const UP = new THREE.Vector3(0, 1, 0);
const RIGHT = new THREE.Vector3(1, 0, 0);

const tangentFor = (normal: THREE.Vector3, out: THREE.Vector3): void => {
  const helper = Math.abs(normal.dot(UP)) < 0.95 ? UP : RIGHT;
  out.copy(helper).cross(normal).normalize();
};

/**
 * Build a BufferGeometry of N small equilateral triangles, one per
 * surface sample. Each triangle's 3 vertices share a single `aSeed`
 * float (Math.random()), so the triangle appears/wobbles as a unit.
 */
const buildTrianglesFromSamples = (
  samples: readonly SurfaceSample[],
  triangleSize: number,
): THREE.BufferGeometry => {
  const n = samples.length;
  const positions    = new Float32Array(n * 3 * 3);
  const normals      = new Float32Array(n * 3 * 3);
  const seeds        = new Float32Array(n * 3);
  // Barycentric coordinates per vertex — the fragment shader uses these
  // to compute distance from the nearest edge so it can render the
  // triangle as an outline first, then fill it in later.
  const barycentric  = new Float32Array(n * 3 * 3);

  const t1 = new THREE.Vector3();
  const t2 = new THREE.Vector3();

  // Equilateral triangle offsets (circumradius ≈ size × 0.667).
  const offsets: ReadonlyArray<readonly [number, number]> = [
    [ 0,        0.667],
    [-0.577,   -0.333],
    [ 0.577,   -0.333],
  ];

  // Standard barycentric basis — one vertex gets each component.
  const baryBasis: ReadonlyArray<readonly [number, number, number]> = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];

  for (let i = 0; i < n; i += 1) {
    const sample = samples[i];
    if (!sample) continue;
    const { position, normal } = sample;
    tangentFor(normal, t1);
    t2.copy(normal).cross(t1).normalize();

    const seed = Math.random();
    const base = i * 9;
    const baseSeed = i * 3;

    for (let v = 0; v < 3; v += 1) {
      const offset = offsets[v];
      const bary   = baryBasis[v];
      if (!offset || !bary) continue;
      const [u, w] = offset;
      positions[base + v * 3]     = position.x + (t1.x * u + t2.x * w) * triangleSize;
      positions[base + v * 3 + 1] = position.y + (t1.y * u + t2.y * w) * triangleSize;
      positions[base + v * 3 + 2] = position.z + (t1.z * u + t2.z * w) * triangleSize;
      normals[base + v * 3]     = normal.x;
      normals[base + v * 3 + 1] = normal.y;
      normals[base + v * 3 + 2] = normal.z;
      seeds[baseSeed + v] = seed;
      barycentric[base + v * 3]     = bary[0];
      barycentric[base + v * 3 + 1] = bary[1];
      barycentric[base + v * 3 + 2] = bary[2];
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('normal',   new THREE.BufferAttribute(normals, 3));
  geom.setAttribute('aSeed',    new THREE.BufferAttribute(seeds, 1));
  geom.setAttribute('aBary',    new THREE.BufferAttribute(barycentric, 3));
  return geom;
};

// ─── Uniforms + material ─────────────────────────────────────────────

export interface RisingTrianglesUniforms {
  /** Densification ramp, 0 → 1. Particles begin rising when uAttack crosses their seed. */
  readonly uAttack:         { value: number };
  /** Wall-clock time in seconds; drives the emergence wobble. */
  readonly uTime:           { value: number };
  /** Object-space distance each particle starts BELOW its final surface position. */
  readonly uRiseDistance:   { value: number };
  /** Per-triangle rise + outline-fade-in duration as a fraction of the attack range. */
  readonly uRiseWindow:     { value: number };
  /**
   * Hold time after rise completes before the fill begins. This is what
   * creates the "outlines arrive first, group up, then turn opaque" feel —
   * triangles that emerged together also fill together because they share
   * the same delay from their (clustered) random seeds.
   */
  readonly uFillDelay:      { value: number };
  /** Duration of the outline → fill crossfade per triangle. */
  readonly uFillWindow:     { value: number };
  /** Maximum object-space jitter applied during emergence. */
  readonly uJitterAmount:   { value: number };
  /** Edge thickness as a fraction of the triangle's barycentric span. */
  readonly uEdgeThickness:  { value: number };
  /** 0 = particle layer fully visible, 1 = invisible (used for handoff to actual mesh). */
  readonly uFadeOut:        { value: number };
  readonly uMatteColor:     { value: THREE.Color };
  readonly uEdgeColor:      { value: THREE.Color };
}

export const createRisingTrianglesUniforms = (
  matteHex: string = '#bdb5a4',
  edgeHex: string = '#e8a857',
): RisingTrianglesUniforms => ({
  uAttack:         { value: 0 },
  uTime:           { value: 0 },
  uRiseDistance:   { value: 0.18 },
  uRiseWindow:     { value: 0.08 },
  uFillDelay:      { value: 0.10 },
  uFillWindow:     { value: 0.08 },
  uJitterAmount:   { value: 0.025 },
  uEdgeThickness:  { value: 0.10 },
  uFadeOut:        { value: 0 },
  uMatteColor:     { value: new THREE.Color(matteHex) },
  uEdgeColor:      { value: new THREE.Color(edgeHex) },
});

// NOTE: do NOT redeclare attribute vec3 normal or position — Three.js
// auto-injects both. Redeclaring silently breaks the compile.
//
// FOUR phases per triangle, all driven by aSeed vs uAttack:
//
//   Phase 1 · RISE    — displaced inward by uRiseDistance, animates to
//                       the surface. Outline alpha ramps 0 → 1.
//                       Wobble decays during the rise.
//   Phase 2 · HOLD    — outline at full opacity, fill still 0.
//                       Duration = uFillDelay.
//   Phase 3 · FILL    — fill alpha ramps 0 → 1 (the "group commits" moment).
//                       Outline stays.
//   Phase 4 · SETTLED — outline + fill both at 1 until uFadeOut hand-off.
//
// Each triangle's three vertices share one aSeed (atomic emergence) plus
// the standard barycentric basis vertex {(1,0,0), (0,1,0), (0,0,1)} so
// the fragment shader can compute distance-from-edge. Math.random seeds
// cluster naturally → "groups form together and fill together."
const VERT = /* glsl */`
  attribute float aSeed;
  attribute vec3  aBary;
  uniform float uAttack;
  uniform float uTime;
  uniform float uRiseDistance;
  uniform float uRiseWindow;
  uniform float uFillDelay;
  uniform float uFillWindow;
  uniform float uJitterAmount;
  varying float vAlive;
  varying float vEmergence;
  varying float vFill;
  varying vec3  vBary;
  varying vec3  vNormalWorld;

  void main() {
    vNormalWorld = normalize(mat3(modelMatrix) * normal);
    vBary = aBary;

    // Scale seed so the LAST triangle finishes BOTH rise + delay + fill
    // by uAttack=1, leaving the tail of the population still completing.
    float seedSpan = max(1.0 - uRiseWindow - uFillDelay - uFillWindow, 0.001);
    float scaledSeed = aSeed * seedSpan;

    // Emergence: 0 → 1 during rise window. Outline visibility tracks this.
    vEmergence = clamp((uAttack - scaledSeed) / max(uRiseWindow, 0.001), 0.0, 1.0);

    // Alive: true the moment uAttack reaches this triangle's scaled seed.
    vAlive = step(scaledSeed, uAttack);

    // Fill: 0 during rise AND during the delay hold, then ramps to 1.
    // This is where "outline arrives, group forms, then commits to fill" lives.
    float fillStart = scaledSeed + uRiseWindow + uFillDelay;
    vFill = clamp((uAttack - fillStart) / max(uFillWindow, 0.001), 0.0, 1.0);

    // Rise: displaced inward, animates outward to settled position.
    vec3 displaced = position - normal * uRiseDistance * (1.0 - vEmergence);

    // Wobble: amplitude is high at emergence, decays during the rise.
    float wob = (1.0 - exp(-vEmergence * 5.0));
    float jitter = (1.0 - wob) * uJitterAmount;
    vec3 jitterOffset = vec3(
      sin(aSeed * 31.7 + uTime),
      cos(aSeed * 17.3 + uTime),
      sin(aSeed * 41.1 + uTime)
    ) * jitter;

    vec4 mvPos = modelViewMatrix * vec4(displaced + jitterOffset * vAlive, 1.0);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const FRAG = /* glsl */`
  precision highp float;
  uniform float uFadeOut;
  uniform float uEdgeThickness;
  uniform vec3  uMatteColor;
  uniform vec3  uEdgeColor;
  varying float vAlive;
  varying float vEmergence;
  varying float vFill;
  varying vec3  vBary;
  varying vec3  vNormalWorld;

  void main() {
    if (vAlive < 0.5) discard;
    if (uFadeOut >= 0.99) discard;

    // Distance from nearest edge in barycentric space.
    // 0 = on the edge, 0.333 = at the centroid.
    float edgeDist = min(min(vBary.x, vBary.y), vBary.z);
    // 1 at the edge, 0 in the centre. uEdgeThickness sets the line weight.
    float onEdge = 1.0 - smoothstep(uEdgeThickness, uEdgeThickness * 1.6, edgeDist);

    // Lambert shading for the matte fill colour.
    float lambert = clamp(dot(normalize(vNormalWorld), normalize(vec3(0.4, 0.7, 0.5))), 0.0, 1.0);
    vec3 matteShaded = uMatteColor * (0.55 + 0.45 * lambert);

    // Edge always uses the accent colour; centre uses the matte colour.
    vec3 col = mix(matteShaded, uEdgeColor, onEdge);

    // Alpha:
    //   - Edge pixels follow vEmergence — outline fades in during the rise.
    //   - Centre pixels follow vFill   — stays invisible during outline phase,
    //     then ramps after the delay (the "group commits" moment).
    float outlineAlpha = vEmergence;
    float fillAlpha    = vFill;
    float baseAlpha    = mix(fillAlpha, outlineAlpha, onEdge);

    float alpha = baseAlpha * (1.0 - uFadeOut);
    if (alpha < 0.01) discard;

    gl_FragColor = vec4(col, alpha);
  }
`;

export const createRisingTrianglesMaterial = (
  uniforms: RisingTrianglesUniforms,
): THREE.ShaderMaterial => {
  return new THREE.ShaderMaterial({
    uniforms: uniforms as unknown as { [key: string]: THREE.IUniform },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
};

// ─── Public API ──────────────────────────────────────────────────────

export interface BuildRisingTrianglesOpts {
  /** Number of triangles to spawn. 3000–6000 is the sweet spot for car-sized assets. */
  readonly count?: number;
  /** Edge length of each triangle in object-space units. */
  readonly triangleSize?: number;
  /** Diagnostic mode — render as a solid hot-pink MeshBasicMaterial, no animation, always on top. */
  readonly diag?: boolean;
}

export const buildRisingTriangles = (
  root: THREE.Object3D,
  uniforms: RisingTrianglesUniforms,
  opts: BuildRisingTrianglesOpts = {},
): THREE.Mesh | null => {
  // 6000 triangles at size 0.04 covers a typical car-sized asset
  // densely enough that the settled population reads as "the surface"
  // rather than a scattered decoration. Bump these for sparser/denser
  // looks per asset.
  const count = opts.count ?? 6000;
  const triangleSize = opts.triangleSize ?? 0.04;

  const samples = sampleSurfaceUniformly(root, count);
  // eslint-disable-next-line no-console
  console.info(`[continuum-choreo] rising triangles: ${samples.length} samples (skull pattern)`);
  if (samples.length === 0) {
    // eslint-disable-next-line no-console
    console.warn('[continuum-choreo] surface isolation produced no samples — check that the asset has visible Mesh children');
    return null;
  }

  const geom = buildTrianglesFromSamples(samples, triangleSize);
  const mat = opts.diag
    ? new THREE.MeshBasicMaterial({
        color: 0xff2266,
        side: THREE.DoubleSide,
        transparent: false,
        depthWrite: true,
        depthTest: false,
      })
    : createRisingTrianglesMaterial(uniforms);
  const mesh = new THREE.Mesh(geom, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = opts.diag ? 100 : 3;
  return mesh;
};
