/**
 * risingTriangles — the particle layer.
 *
 * Builds a single BufferGeometry full of N small, uniform-sized
 * equilateral triangles sampled evenly across the source surface. Each
 * triangle has its own revealTime; the shader displaces it inward
 * along the surface normal at t=0 and animates it back to its final
 * position as `uTrianglesReveal` ramps 0 → 1.
 *
 * The result reads as: "smart, uniform triangles rise up from below
 * the skin, settle on the surface, form clusters as more arrive."
 *
 * Why this is a separate layer (and not vertex displacement on the
 * source mesh) — the source mesh has whatever triangulation it was
 * authored with. A McLaren glb might have densely-packed triangles on
 * a curved fender and a single huge quad on a flat door panel; the
 * rise would look uneven. This layer guarantees uniform triangle size
 * and even surface distribution, regardless of source topology. The
 * particles BECOME the surface during the rise; the actual mesh fades
 * in only after they've completed.
 */

import * as THREE from 'three';
import { MeshSurfaceSampler } from 'three-stdlib';

// ─── Sampling ─────────────────────────────────────────────────────────

interface SurfaceSample {
  readonly position: THREE.Vector3;
  readonly normal: THREE.Vector3;
}

/** Merge every Mesh under root into a single non-indexed BufferGeometry. */
const mergeAllMeshGeometries = (root: THREE.Object3D): THREE.BufferGeometry | null => {
  const merged = new THREE.BufferGeometry();
  const positions: number[] = [];
  const normals: number[] = [];

  const tmpV = new THREE.Vector3();
  const tmpN = new THREE.Vector3();

  root.updateWorldMatrix(true, true);

  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const geom = node.geometry as THREE.BufferGeometry | undefined;
    if (!geom) return;

    const posAttr = geom.getAttribute('position');
    if (!posAttr) return;
    const normalAttr = geom.getAttribute('normal');
    const indexAttr = geom.getIndex();

    // Compute world matrix and its normal matrix.
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
  });

  if (positions.length === 0) return null;

  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal',   new THREE.Float32BufferAttribute(normals, 3));
  return merged;
};

/**
 * Sample `count` uniformly-distributed points across the surface.
 * Returns position + normal pairs in the same coordinate space as
 * the input root's world space.
 */
const sampleSurface = (root: THREE.Object3D, count: number): SurfaceSample[] => {
  const merged = mergeAllMeshGeometries(root);
  if (!merged) return [];

  // MeshSurfaceSampler wants a Mesh; the geometry alone is enough.
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

/** Pick a tangent vector that's reliably not parallel to n. */
const tangentFor = (normal: THREE.Vector3, out: THREE.Vector3): void => {
  const helper = Math.abs(normal.dot(UP)) < 0.95 ? UP : RIGHT;
  out.copy(helper).cross(normal).normalize();
};

/**
 * Build a BufferGeometry containing one equilateral triangle per
 * sample. Each triangle's three vertices share the same revealTime,
 * the same surface normal, and the same centroid, so the shader can
 * displace them as a unit.
 */
const buildTrianglesFromSamples = (
  samples: readonly SurfaceSample[],
  triangleSize: number,
  seed: number,
): THREE.BufferGeometry => {
  const n = samples.length;
  const positions = new Float32Array(n * 3 * 3);
  const normals   = new Float32Array(n * 3 * 3);
  const revealTimes = new Float32Array(n * 3);

  // Per-triangle reveal-order: seeded shuffle so the same asset always
  // builds in the same pattern.
  const order = new Uint32Array(n);
  for (let i = 0; i < n; i += 1) order[i] = i;
  let s = seed >>> 0;
  const rng = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = n - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const ai = order[i] ?? 0;
    const aj = order[j] ?? 0;
    order[i] = aj;
    order[j] = ai;
  }
  const denom = Math.max(n - 1, 1);
  const triReveal = new Float32Array(n);
  for (let rank = 0; rank < n; rank += 1) {
    const triIdx = order[rank] ?? rank;
    triReveal[triIdx] = rank / denom;
  }

  const t1 = new THREE.Vector3();
  const t2 = new THREE.Vector3();
  // Equilateral triangle vertex offsets in the tangent plane:
  //   v0 = ( 0,           size*0.667 )
  //   v1 = (-size*0.577, -size*0.333 )
  //   v2 = ( size*0.577, -size*0.333 )
  // These give an equilateral with circumradius ≈ size*0.667.
  const offsets: ReadonlyArray<readonly [number, number]> = [
    [0,         0.667],
    [-0.577,   -0.333],
    [ 0.577,   -0.333],
  ];

  for (let i = 0; i < n; i += 1) {
    const sample = samples[i];
    if (!sample) continue;
    const { position, normal } = sample;
    tangentFor(normal, t1);
    t2.copy(normal).cross(t1).normalize();

    const base = i * 9;
    const baseRT = i * 3;
    const reveal = triReveal[i] ?? 0;

    for (let v = 0; v < 3; v += 1) {
      const offset = offsets[v];
      if (!offset) continue;
      const [u, w] = offset;
      const vx = position.x + (t1.x * u + t2.x * w) * triangleSize;
      const vy = position.y + (t1.y * u + t2.y * w) * triangleSize;
      const vz = position.z + (t1.z * u + t2.z * w) * triangleSize;
      positions[base + v * 3]     = vx;
      positions[base + v * 3 + 1] = vy;
      positions[base + v * 3 + 2] = vz;
      normals[base + v * 3]     = normal.x;
      normals[base + v * 3 + 1] = normal.y;
      normals[base + v * 3 + 2] = normal.z;
      revealTimes[baseRT + v] = reveal;
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position',   new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('normal',     new THREE.BufferAttribute(normals, 3));
  geom.setAttribute('revealTime', new THREE.BufferAttribute(revealTimes, 1));
  return geom;
};

// ─── Material ────────────────────────────────────────────────────────

export interface RisingTrianglesUniforms {
  readonly uTrianglesReveal:   { value: number };
  readonly uTrianglesFadeOut:  { value: number };
  readonly uRiseDistance:      { value: number };
  readonly uRiseWindow:        { value: number };
  readonly uMatteColor:        { value: THREE.Color };
  readonly uEdgeColor:         { value: THREE.Color };
  readonly uBuildShimmer:      { value: number };
}

export const createRisingTrianglesUniforms = (
  matteHex: string = '#bdb5a4',
  edgeHex: string = '#e8a857',
  riseDistance: number = 0.28,
): RisingTrianglesUniforms => ({
  uTrianglesReveal:  { value: 0 },
  uTrianglesFadeOut: { value: 0 },
  uRiseDistance:     { value: riseDistance },
  // 0.11 means each triangle takes 11 % of the rise stage to travel
  // from displaced-inward to settled — slow enough that the eye can
  // actually track the motion of an individual triangle.
  uRiseWindow:       { value: 0.11 },
  uMatteColor:       { value: new THREE.Color(matteHex) },
  uEdgeColor:        { value: new THREE.Color(edgeHex) },
  uBuildShimmer:     { value: 0 },
});

const VERT = /* glsl */`
  attribute float revealTime;
  attribute vec3  normal;
  uniform float uTrianglesReveal;
  uniform float uRiseDistance;
  uniform float uRiseWindow;
  varying float vEmergence;
  varying vec3  vNormalWorld;

  void main() {
    float scaled = revealTime * (1.0 - uRiseWindow);
    vEmergence = clamp((uTrianglesReveal - scaled) / max(uRiseWindow, 0.001), 0.0, 1.0);
    vec3 displaced = position - normal * uRiseDistance * (1.0 - vEmergence);
    vNormalWorld = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

const FRAG = /* glsl */`
  precision highp float;
  uniform float uTrianglesFadeOut;
  uniform vec3  uMatteColor;
  uniform vec3  uEdgeColor;
  uniform float uBuildShimmer;
  varying float vEmergence;
  varying vec3  vNormalWorld;

  void main() {
    if (vEmergence <= 0.001) discard;
    if (uTrianglesFadeOut >= 0.99) discard;

    // Simple Lambert-style shading so the matte tone reads as 3D.
    float lambert = clamp(dot(normalize(vNormalWorld), normalize(vec3(0.4, 0.7, 0.5))), 0.0, 1.0);
    vec3 shaded = uMatteColor * (0.5 + 0.5 * lambert);

    // Rising triangles glow brightly during the rise so the eye reads
    // them as individual objects in motion. The glow softens as the
    // triangle settles on the surface.
    float glow = 1.0 - vEmergence;
    // Triangle in flight: pure edge color + brightness boost.
    vec3 inFlight = uEdgeColor * (1.3 + uBuildShimmer * 0.3);
    vec3 settled  = shaded;
    vec3 col = mix(settled, inFlight, glow);
    // Soft additive halo for newly-emerging triangles.
    col += uEdgeColor * pow(glow, 1.5) * 0.4;

    // Higher base alpha so triangles are clearly visible against any bg.
    float alpha = (1.0 - uTrianglesFadeOut) * (0.78 + vEmergence * 0.22);
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
  /** Number of triangles to spawn. 2000–4000 is a good visual range. */
  readonly count?: number;
  /** Edge length of each triangle in object-space units (~0.03 ≈ 1 cm on a unit-sized asset). */
  readonly triangleSize?: number;
  /** Mulberry32 seed for reproducible scatter. */
  readonly seed?: number;
}

/**
 * Build the rising-triangles Mesh for a given asset root. Caller is
 * responsible for adding it to the scene as a sibling of the source
 * mesh, with the same parent transform applied.
 */
export const buildRisingTriangles = (
  root: THREE.Object3D,
  uniforms: RisingTrianglesUniforms,
  opts: BuildRisingTrianglesOpts = {},
): THREE.Mesh | null => {
  const count = opts.count ?? 1800;
  // Default ~2× the previous size — at this scale individual triangles
  // are unmistakably visible during the rise even on a large asset.
  const triangleSize = opts.triangleSize ?? 0.09;
  const seed = opts.seed ?? 42;

  const samples = sampleSurface(root, count);
  // eslint-disable-next-line no-console
  console.info(`[continuum-choreo] rising triangles: ${samples.length} samples`);
  if (samples.length === 0) {
    // eslint-disable-next-line no-console
    console.warn('[continuum-choreo] no surface samples produced — check that the asset has Mesh children with valid geometry');
    return null;
  }

  const geom = buildTrianglesFromSamples(samples, triangleSize, seed);
  const mat  = createRisingTrianglesMaterial(uniforms);
  const mesh = new THREE.Mesh(geom, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10; // after everything else
  return mesh;
};
