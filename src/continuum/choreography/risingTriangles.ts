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
 * Recursively subdivide a triangle until every edge falls below
 * `targetEdgeLength`. Plain midpoint subdivision: 1 triangle → 4
 * sub-triangles. Output is appended to the provided arrays as
 * non-indexed triangle vertices (3 vertices per face, no sharing).
 *
 * The target edge length passed in is determined PER MESH by the
 * caller (see buildUniformTriangulation) based on each mesh's bbox
 * size. That's how a large mesh like the hood gets large triangles
 * and a small mesh like a wheel rim gets small ones.
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
 * Build a continuous, fully-covering triangulation of every isolated
 * surface mesh under `root`. Output is a non-indexed BufferGeometry
 * with one independent triangle per face (no shared vertices).
 *
 * Triangle size is PER MESH, proportional to each mesh's world-space
 * bbox max dimension × `meshSizeRatio`. So:
 *
 *   - Large meshes (hood, roof, doors, windows) → large triangles.
 *     A hood with ~1.5-unit bbox at ratio 0.2 → ~0.3 unit triangles.
 *   - Small meshes (wheel rims, spokes, lights) → small triangles.
 *     A wheel rim with ~0.4-unit bbox at ratio 0.2 → ~0.08 unit triangles.
 *   - Each mesh ends up with a similar NUMBER of triangles across its
 *     surface, but the absolute size scales with the surface itself.
 *
 * Clamped to [0.025, 0.40] so extremely tiny or extremely large meshes
 * don't blow up the count or create unreadable mega-triangles.
 */
const buildUniformTriangulation = (
  root: THREE.Object3D,
  meshSizeRatio: number,
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
  const bboxSize = new THREE.Vector3();

  // Per-mesh logging — useful when tuning the size ratio.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const meshReport: Array<{ name: string; dim: number; target: number }> = [];

  for (const node of meshes) {
    const geom = node.geometry as THREE.BufferGeometry;
    const posAttr = geom.getAttribute('position');
    if (!posAttr) continue;
    const normalAttr = geom.getAttribute('normal');
    const indexAttr = geom.getIndex();

    node.updateWorldMatrix(true, false);
    const worldMatrix = node.matrixWorld;
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(worldMatrix);

    // Per-mesh target: scale the triangle size to this mesh's world bbox.
    geom.computeBoundingBox();
    const localBox = geom.boundingBox ?? new THREE.Box3();
    const worldBox = localBox.clone().applyMatrix4(worldMatrix);
    worldBox.getSize(bboxSize);
    const meshMaxDim = Math.max(bboxSize.x, bboxSize.y, bboxSize.z) || 0.1;
    const perMeshTarget = Math.max(
      0.025,
      Math.min(0.40, meshMaxDim * meshSizeRatio),
    );
    meshReport.push({ name: node.name || '<anon>', dim: meshMaxDim, target: perMeshTarget });

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
      subdivideFace(v0, v1, v2, n0, n1, n2, perMeshTarget, positions, normals, 0);
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

  // eslint-disable-next-line no-console
  console.info('[continuum-choreo] per-mesh triangle sizing:', meshReport.slice(0, 8), `(+${Math.max(0, meshReport.length - 8)} more)`);

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
  /** Densification ramp, 0 → 1. Triangles begin rising when uAttack crosses their seed. */
  readonly uAttack:         { value: number };
  /** Wall-clock time in seconds; drives the emergence wobble. */
  readonly uTime:           { value: number };
  /** Object-space distance each triangle starts BELOW its final surface position. */
  readonly uRiseDistance:   { value: number };
  /** Per-triangle rise + outline-fade-in duration as a fraction of the attack range. */
  readonly uRiseWindow:     { value: number };
  /**
   * GLOBAL fill uniform — driven by the timeline AFTER every triangle has
   * settled into place as an outline. Ramps 0 → 1. When 0, every triangle
   * stays HOLLOW (only outline visible). When 1, every triangle is fully
   * filled with the matte colour. All triangles fill together, simultaneously.
   */
  readonly uFillReveal:     { value: number };
  /**
   * The asset's bounding-box centre in object space. Triangles emerge
   * along the direction from this point outward toward their final
   * surface position — they appear to come FROM the inside of the asset,
   * not from outside.
   */
  readonly uAssetCenter:    { value: THREE.Vector3 };
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
  uRiseDistance:   { value: 0.50 },
  uRiseWindow:     { value: 0.14 },
  uFillReveal:     { value: 0 },
  uAssetCenter:    { value: new THREE.Vector3(0, 0, 0) },
  uJitterAmount:   { value: 0.018 },
  // Edge thickness in screen-space pixels (interpreted via fwidth in the
  // fragment shader). 1.5 matches the visual weight of a default
  // LineBasicMaterial — same look as the wireframe blueprint.
  uEdgeThickness:  { value: 1.5 },
  uFadeOut:        { value: 0 },
  uMatteColor:     { value: new THREE.Color(matteHex) },
  uEdgeColor:      { value: new THREE.Color(edgeHex) },
});

// NOTE: do NOT redeclare attribute vec3 normal or position — Three.js
// auto-injects both. Redeclaring silently breaks the compile.
//
// TWO phases per triangle plus one global fill:
//
//   Phase 1 · RISE      — driven by aSeed vs uAttack. Each triangle starts
//                         displaced INWARD along the direction from
//                         uAssetCenter to its final position, then animates
//                         outward as its individual rise window plays.
//                         Outline alpha ramps 0 → 1. Wobble decays.
//   Phase 2 · LOCKED    — outline at full opacity, hollow inside.
//                         All triangles in this state until the next phase.
//   Phase 3 · FILL ALL  — GLOBAL uFillReveal ramps 0 → 1. Triggered by the
//                         timeline only AFTER all triangles have settled.
//                         Every triangle fills simultaneously.
//
// The fill is NOT per-triangle — it's one uniform that affects every
// triangle in lockstep. This produces the "hollow during build, all-at-once
// commitment" pattern the user described.
const VERT = /* glsl */`
  attribute float aSeed;
  attribute vec3  aBary;
  uniform float uAttack;
  uniform float uTime;
  uniform float uRiseDistance;
  uniform float uRiseWindow;
  uniform float uJitterAmount;
  uniform vec3  uAssetCenter;
  varying float vAlive;
  varying float vEmergence;
  varying vec3  vBary;
  varying vec3  vNormalWorld;

  void main() {
    vNormalWorld = normalize(mat3(modelMatrix) * normal);
    vBary = aBary;

    // Scale seed so the LAST triangle finishes its rise by uAttack = 1.
    float seedSpan = max(1.0 - uRiseWindow, 0.001);
    float scaledSeed = aSeed * seedSpan;

    // Emergence: 0 → 1 across the per-triangle rise window. Drives outline alpha.
    vEmergence = clamp((uAttack - scaledSeed) / max(uRiseWindow, 0.001), 0.0, 1.0);

    // Alive: true the moment uAttack reaches this triangle's scaled seed.
    vAlive = step(scaledSeed, uAttack);

    // Direction the triangle emerges FROM: uAssetCenter (the bbox centre of
    // the asset). The triangle starts pushed inward along this direction
    // by uRiseDistance, then animates outward to its final position. So
    // each triangle visually emerges from the inside of the asset, not
    // from a flat below-surface offset.
    vec3 dirFromCenter = normalize(position - uAssetCenter);
    vec3 displaced = position - dirFromCenter * uRiseDistance * (1.0 - vEmergence);

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
  uniform float uFillReveal;
  uniform float uEdgeThickness;
  uniform vec3  uMatteColor;
  uniform vec3  uEdgeColor;
  varying float vAlive;
  varying float vEmergence;
  varying vec3  vBary;
  varying vec3  vNormalWorld;

  void main() {
    if (vAlive < 0.5) discard;
    if (uFadeOut >= 0.99) discard;

    // Distance from nearest edge in barycentric space (0 = on the edge,
    // 0.333 = at the centroid).
    float edgeDist = min(min(vBary.x, vBary.y), vBary.z);

    // Screen-space line thickness via derivatives. fwidth(edgeDist) tells
    // us how fast edgeDist changes per screen pixel, so multiplying it by
    // uEdgeThickness gives a CONSTANT pixel width regardless of triangle
    // size or camera distance — matches the LineBasicMaterial used by the
    // wireframe blueprint.
    float pxWidth = fwidth(edgeDist) * uEdgeThickness;
    float onEdge = 1.0 - smoothstep(pxWidth * 0.5, pxWidth * 1.5, edgeDist);

    // Lambert shading for the matte fill colour (used only after uFillReveal kicks in).
    float lambert = clamp(dot(normalize(vNormalWorld), normalize(vec3(0.4, 0.7, 0.5))), 0.0, 1.0);
    vec3 matteShaded = uMatteColor * (0.55 + 0.45 * lambert);

    // Edge always uses the accent colour; centre uses the matte colour
    // (visible only when uFillReveal > 0).
    vec3 col = mix(matteShaded, uEdgeColor, onEdge);

    // Alpha:
    //   - Edge pixels follow vEmergence — outline fades in during each
    //     triangle's individual rise window.
    //   - Centre pixels follow the GLOBAL uFillReveal — every triangle
    //     fills simultaneously, only after the timeline has waited for
    //     all of them to settle into place as outlines.
    float outlineAlpha = vEmergence;
    float fillAlpha    = uFillReveal * vEmergence;  // tied to vEmergence so off-screen tris don't suddenly pop
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
    // Required for fwidth() in the fragment shader — the screen-space
    // derivative-based edge thickness that matches the wireframe blueprint.
    extensions: { derivatives: true } as unknown as THREE.ShaderMaterialParameters['extensions'],
  });
};

// ─── Public API ──────────────────────────────────────────────────────

export interface BuildRisingTrianglesOpts {
  /**
   * Triangle size relative to each Mesh's world-space bbox max dim.
   * 0.20 means a mesh that is 1 unit wide gets triangles whose target
   * edge length is ~0.20 units (so ~5 triangles across).
   *
   *   - Larger meshes (hood, window) get larger triangles.
   *   - Smaller meshes (wheel rims, spokes) get smaller triangles.
   *
   * Clamped per mesh to [0.025, 0.40] so extremes stay sane.
   */
  readonly meshSizeRatio?: number;
  /** Diagnostic mode — render as a solid hot-pink MeshBasicMaterial, no animation, always on top. */
  readonly diag?: boolean;
}

export const buildRisingTriangles = (
  root: THREE.Object3D,
  uniforms: RisingTrianglesUniforms,
  opts: BuildRisingTrianglesOpts = {},
): THREE.Mesh | null => {
  const meshSizeRatio = opts.meshSizeRatio ?? 0.20;

  const geom = buildUniformTriangulation(root, meshSizeRatio);
  if (!geom) {
    // eslint-disable-next-line no-console
    console.warn('[continuum-choreo] uniform triangulation produced no faces — check that the asset has visible Mesh children');
    return null;
  }
  const posAttr = geom.getAttribute('position');
  const triCount = Math.floor(posAttr.count / 3);
  // eslint-disable-next-line no-console
  console.info(`[continuum-choreo] continuous triangulation: ${triCount} triangles (mesh size ratio ${meshSizeRatio})`);

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
