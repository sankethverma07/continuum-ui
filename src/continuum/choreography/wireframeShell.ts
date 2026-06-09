/**
 * wireframeShell — the SIGNATURE moment.
 *
 * For every mesh in the asset we synthesize an `EdgesGeometry` shell —
 * only the salient edges (silhouette + sharp angles), no internal
 * triangulation noise. Each edge vertex gets a seeded reveal time so
 * the wireframe builds organically as `uWireframeReveal` ramps 0 → 1.
 *
 * The shell renders as LineSegments with a ShaderMaterial that:
 *   - discards lines whose revealTime exceeds uWireframeReveal
 *   - fades out via uWireframeFadeOut once the surface takes over
 *   - draws in the accent edge colour, with a soft pulse on emerging edges
 *
 * The geometry is built once per asset load and cached on the mesh's
 * userData so re-mounts don't redo the work.
 */

import * as THREE from 'three';

const CACHE_KEY = '__continuumWireframeShell';

/** Mulberry32 — matches computeRevealTime.ts for consistent scatter. */
const mulberry32 = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Seeded Fisher-Yates over [0, n). */
const shuffledIndices = (n: number, seed: number): Uint32Array => {
  const arr = new Uint32Array(n);
  for (let i = 0; i < n; i += 1) arr[i] = i;
  const rng = mulberry32(seed);
  for (let i = n - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const ai = arr[i] ?? 0;
    const aj = arr[j] ?? 0;
    arr[i] = aj;
    arr[j] = ai;
  }
  return arr;
};

/**
 * Build a reveal-time-attributed EdgesGeometry for a mesh. We assign
 * a single revealTime per EDGE (both endpoints share it) so the line
 * appears or vanishes as a unit, rather than half-emerging.
 */
const buildEdgesWithReveal = (
  source: THREE.BufferGeometry,
  seed: number,
): THREE.BufferGeometry => {
  // 18° threshold drops coplanar interior edges; keeps the silhouette
  // + every visually meaningful crease. Reads as a designed blueprint
  // instead of a hairy mesh wireframe.
  const edges = new THREE.EdgesGeometry(source, 18);
  const pos = edges.getAttribute('position');
  if (!pos) return edges;

  // Each line segment is 2 consecutive vertices. n_edges = pos.count / 2.
  const nEdges = Math.floor(pos.count / 2);
  if (nEdges === 0) return edges;

  const order = shuffledIndices(nEdges, seed);
  const denom = Math.max(nEdges - 1, 1);
  const reveal = new Float32Array(pos.count);
  for (let rank = 0; rank < nEdges; rank += 1) {
    const edgeIdx = order[rank] ?? rank;
    const t = rank / denom;
    // Same value on both endpoints — the line emerges atomically.
    reveal[edgeIdx * 2] = t;
    reveal[edgeIdx * 2 + 1] = t;
  }
  edges.setAttribute('revealTime', new THREE.BufferAttribute(reveal, 1));
  return edges;
};

export interface WireframeShellMaterialUniforms {
  readonly uWireframeReveal:  { value: number };
  readonly uWireframeFadeOut: { value: number };
  readonly uEdgeColor:        { value: THREE.Color };
  readonly uBuildShimmer:     { value: number };
}

export const createWireframeUniforms = (
  edgeHex: string = '#e8a857',
): WireframeShellMaterialUniforms => ({
  uWireframeReveal:  { value: 0 },
  uWireframeFadeOut: { value: 0 },
  uEdgeColor:        { value: new THREE.Color(edgeHex) },
  uBuildShimmer:     { value: 0 },
});

const VERT = /* glsl */`
  attribute float revealTime;
  varying float vRevealTime;
  void main() {
    vRevealTime = revealTime;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */`
  precision highp float;
  uniform float uWireframeReveal;
  uniform float uWireframeFadeOut;
  uniform vec3  uEdgeColor;
  uniform float uBuildShimmer;
  varying float vRevealTime;
  void main() {
    if (vRevealTime > uWireframeReveal) discard;
    // Newly-emerged lines briefly pulse brighter.
    float emergence = smoothstep(uWireframeReveal - 0.03, uWireframeReveal, vRevealTime);
    vec3 col = uEdgeColor + uEdgeColor * (emergence * 0.6 + uBuildShimmer * 0.15);
    float alpha = uWireframeFadeOut * (0.85 + emergence * 0.15);
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(col, alpha);
  }
`;

export const createWireframeMaterial = (
  uniforms: WireframeShellMaterialUniforms,
): THREE.ShaderMaterial => {
  const mat = new THREE.ShaderMaterial({
    uniforms: uniforms as unknown as { [key: string]: THREE.IUniform },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    // Avoid Z-fighting with the solid surface by rendering after it.
    polygonOffset: false,
  });
  return mat;
};

interface ShellEntry {
  readonly geometry: THREE.BufferGeometry;
  readonly mesh: THREE.Mesh;
}

/**
 * Walk every mesh under `root`, build a wireframe shell for it that
 * shares the mesh's world transform, and return the list of LineSegments
 * nodes the caller should mount as children of the asset group.
 */
export const collectWireframeShells = (
  root: THREE.Object3D,
  uniforms: WireframeShellMaterialUniforms,
  seed: number = 42,
): THREE.LineSegments[] => {
  const shells: THREE.LineSegments[] = [];
  let meshIndex = 0;
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const geom = node.geometry as THREE.BufferGeometry | undefined;
    if (!geom) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cached: ShellEntry | undefined = (node.userData as any)[CACHE_KEY];
    let edges: THREE.BufferGeometry;
    if (cached?.geometry) {
      edges = cached.geometry;
    } else {
      const meshSeed = (seed + meshIndex * 0x85EBCA77) >>> 0;
      edges = buildEdgesWithReveal(geom, meshSeed);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (node.userData as any)[CACHE_KEY] = { geometry: edges, mesh: node };
    }
    meshIndex += 1;

    const material = createWireframeMaterial(uniforms);
    const lines = new THREE.LineSegments(edges, material);
    // Copy the mesh's world transform onto the shell, then attach the
    // shell as a sibling so it follows whatever group transform the
    // mesh ends up under.
    lines.matrixAutoUpdate = false;
    node.updateWorldMatrix(true, false);
    lines.matrix.copy(node.matrixWorld);
    lines.renderOrder = 2; // after the solid mesh
    shells.push(lines);
  });
  return shells;
};
