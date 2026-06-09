/**
 * risingTriangles — full-surface uniform retessellation.
 *
 * Instead of sampling N points and placing isolated equilateral
 * triangles (which leaves gaps between particles), this builds a
 * CONTINUOUS triangular structure that fully covers the source
 * surface. Each face of the source mesh is recursively subdivided
 * via midpoint subdivision (1 triangle → 4 sub-triangles) until
 * every resulting sub-triangle's edges are below uTargetEdgeLength.
 *
 * The output is a single non-indexed BufferGeometry where every
 * sub-triangle is independent (no vertex sharing) so each can carry
 * its own seed and barycentric attributes for the 4-phase animation.
 * Adjacent sub-triangles snap together perfectly at the source
 * mesh's faces, producing a complete envelope of the BMW with no
 * holes between particles.
 *
 * Surface isolation: every visible Mesh under the root is included.
 * For glTF assets, that's the full visible surface. No volumetric
 * subtraction needed since glTF meshes are surface-only by construction.
 */

import * as THREE from 'three';

// ─── Surface isolation + subdivision pipeline ────────────────────────

/**
 * The surface-isolation engine.
 *
 * Returns the Mesh nodes that form the asset's visible exterior.
 * For glTF assets, every visible Mesh under the root with non-empty
 * geometry counts. Future iterations can add visibility raycasting
 * to strip occluded interior geometry on complex assets.
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

/**
 * Recursively subdivide a triangle until every edge is below
 * `targetEdgeLength`. Each step splits 1 triangle into 4 via midpoint
 * subdivision. Output is appended to the provided arrays as
 * non-indexed triangle vertices (3 vertices per face, no sharing).
 */
const subdivideFace = (
  v0: THREE.Vector3, v1: THREE.Vector3, v2: THREE.Vector3,
  n0: THREE.Vector3, n1: THREE.Vector3, n2: THREE.Vector3,
  targetEdgeLength: number,
  positions: number[],
  normals: number[],
  depth: number,
): void => {
  // Safety guard — cap depth so degenerate inputs don't infinite-loop.
  if (depth > 7) {
    positions.push(v0.x, v0.y, v0.z, v1.x, v1.y, v1.z, v2.x, v2.y, v2.z);
    normals.push(n0.x, n0.y, n0.z, n1.x, n1.y, n1.z, n2.x, n2.y, n2.z);
    return;
  }

  const e01 = v0.distanceTo(v1);
  const e12 = v1.distanceTo(v2);
  const e20 = v2.distanceTo(v0);
  const maxEdge = Math.max(e01, e12, e20);

  if (maxEdge <= targetEdgeLength) {
    positions.push(v0.x, v0.y, v0.z, v1.x, v1.y, v1.z, v2.x, v2.y, v2.z);
    normals.push(n0.x, n0.y, n0.z, n1.x, n1.y, n1.z, n2.x, n2.y, n2.z);
    return;
  }

  // Midpoint subdivision: 1 triangle → 4 smaller triangles.
  const m01 = new THREE.Vector3().addVectors(v0, v1).multiplyScalar(0.5);
  const m12 = new THREE.Vector3().addVectors(v1, v2).multiplyScalar(0.5);
  const m20 = new THREE.Vector3().addVectors(v2, v0).multiplyScalar(0.5);
  const mn01 = new THREE.Vector3().addVectors(n0, n1).normalize();
  const mn12 = new THREE.Vector3().addVectors(n1, n2).normalize();
  const mn20 = new THREE.Vector3().addVectors(n2, n0).normalize();

  subdivideFace(v0, m01, m20, n0, mn01, mn20, targetEdgeLength, positions, normals, depth + 1);
  subdivideFace(m01, v1, m12, mn01, n1, mn12, targetEdgeLength, positions, normals, depth + 1);
  subdivideFace(m20, m12, v2, mn20, mn12, n2, targetEdgeLength, positions, normals, depth + 1);
  subdivideFace(m01, m12, m20, mn01, mn12, mn20, targetEdgeLength, positions, normals, depth + 1);
};

/**
 * Build a continuous, fully-covering uniform-ish triangulation of
 * every isolated surface mesh under `root`. Output is a non-indexed
 * BufferGeometry with one independent triangle per face (no shared
 * vertices, so each triangle can carry its own per-triangle attributes).
 */
const buildUniformTriangulation = (
  root: THREE.Object3D,
  targetEdgeLength: number,
): THREE.BufferGeometry | null => {
  const meshes = isolateSurfaceMeshes(root);
  if (meshes.length === 0) return null;

  root.updateWorldMatrix(true, true);

  const positions: number[] = [];
  const normals: number[] = [];

  const v0 = new THREE.Vector3();
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const n0 = new THREE.Vector3();
  const n1 = new THREE.Vector3();
  const n2 = new THREE.Vector3();
  const edge1 = new THREE.Vector3();
  const edge2 = new THREE.Vector3();
  const faceNormal = new THREE.Vector3();

  for (const node of meshes) {
    const geom = node.geometry as THREE.BufferGeometry;
    const posAttr = geom.getAttribute('position');
    if (!posAttr) continue;
    const normalAttr = geom.getAttribute('normal');
    const indexAttr = geom.getIndex();

    node.updateWorldMatrix(true, false);
    const worldMatrix = node.matrixWorld;
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(worldMatrix);

    const processTriangle = (a: number, b: number, c: number) => {
      v0.fromBufferAttribute(posAttr, a).applyMatrix4(worldMatrix);
      v1.fromBufferAttribute(posAttr, b).applyMatrix4(worldMatrix);
      v2.fromBufferAttribute(posAttr, c).applyMatrix4(worldMatrix);
      if (normalAttr) {
        n0.fromBufferAttribute(normalAttr, a).applyMatrix3(normalMatrix).normalize();
        n1.fromBufferAttribute(normalAttr, b).applyMatrix3(normalMatrix).normalize();
        n2.fromBufferAttribute(normalAttr, c).applyMatrix3(normalMatrix).normalize();
      } else {
        edge1.subVectors(v1, v0);
        edge2.subVectors(v2, v0);
        faceNormal.crossVectors(edge1, edge2).normalize();
        n0.copy(faceNormal); n1.copy(faceNormal); n2.copy(faceNormal);
      }
      subdivideFace(v0, v1, v2, n0, n1, n2, targetEdgeLength, positions, normals, 0);
    };

    if (indexAttr) {
      for (let i = 0; i < indexAttr.count; i += 3) {
        processTriangle(indexAttr.getX(i), indexAttr.getX(i + 1), indexAttr.getX(i + 2));
      }
    } else {
      for (let i = 0; i < posAttr.count; i += 3) {
        processTriangle(i, i + 1, i + 2);
      }
    }
  }

  if (positions.length === 0) return null;

  const triCount = Math.floor(positions.length / 9);
  const seeds = new Float32Array(triCount * 3);
  const barycentric = new Float32Array(triCount * 9);

  const baryBasis: ReadonlyArray<readonly [number, number, number]> = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];

  for (let i = 0; i < triCount; i += 1) {
    const seed = Math.random();
    for (let v = 0; v < 3; v += 1) {
      seeds[i * 3 + v] = seed;
      const b = baryBasis[v];
      if (!b) continue;
      barycentric[i * 9 + v * 3]     = b[0];
      barycentric[i * 9 + v * 3 + 1] = b[1];
      barycentric[i * 9 + v * 3 + 2] = b[2];
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('normal',   new THREE.Float32BufferAttribute(normals, 3));
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
  uRiseDistance:   { value: 0.22 },
  // Slow rise so the eye can clearly track each triangle's climb.
  uRiseWindow:     { value: 0.15 },
  // Long hold as outline — this is the "wireframe builds, clusters form,
  // THEN they commit" beat the user wants to see.
  uFillDelay:      { value: 0.30 },
  // Slower fill ramp once it starts.
  uFillWindow:     { value: 0.12 },
  uJitterAmount:   { value: 0.020 },
  uEdgeThickness:  { value: 0.12 },
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
  /**
   * Target edge length, in object-space units. Faces of the source
   * mesh are recursively subdivided until every edge falls below
   * this. Smaller values → more, smaller triangles → denser
   * triangulation. 0.08 produces ~5–10k triangles on a car-sized glb.
   */
  readonly targetEdgeLength?: number;
  /** Diagnostic mode — render as a solid hot-pink MeshBasicMaterial, no animation, always on top. */
  readonly diag?: boolean;
}

export const buildRisingTriangles = (
  root: THREE.Object3D,
  uniforms: RisingTrianglesUniforms,
  opts: BuildRisingTrianglesOpts = {},
): THREE.Mesh | null => {
  const targetEdgeLength = opts.targetEdgeLength ?? 0.08;

  const geom = buildUniformTriangulation(root, targetEdgeLength);
  if (!geom) {
    // eslint-disable-next-line no-console
    console.warn('[continuum-choreo] uniform triangulation produced no faces — check that the asset has visible Mesh children');
    return null;
  }
  const posAttr = geom.getAttribute('position');
  const triCount = Math.floor(posAttr.count / 3);
  // eslint-disable-next-line no-console
  console.info(`[continuum-choreo] continuous triangulation: ${triCount} triangles (target edge ${targetEdgeLength})`);

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
