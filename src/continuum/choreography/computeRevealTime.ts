/**
 * computeRevealTime — runtime fallback when an asset doesn't ship
 * a pre-baked `revealTime` vertex attribute (i.e. you didn't run the
 * Blender script first).
 *
 * The pattern produces the same skull-style organic emergence: each
 * vertex gets a normalized 0–1 reveal time using a seeded scatter,
 * so the same asset always reveals in the same order.
 *
 * The result is written as a `revealTime` attribute on the mesh's
 * BufferGeometry. The surface-reveal shader patcher reads it as a
 * varying — see `surfaceReveal.ts`.
 */

import * as THREE from 'three';

const ATTRIBUTE_NAME = 'revealTime';

/**
 * Mulberry32 — small, fast, deterministic 32-bit PRNG. We need a
 * seeded generator so the same asset always emerges in the same
 * pattern across reloads; Math.random gives a different shuffle every
 * time which makes the reveal feel inconsistent.
 */
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

/**
 * Fisher–Yates shuffle of the vertex index range, seeded so the
 * order is stable across loads of the same mesh.
 */
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
 * Walk every mesh under `root` and stamp a `revealTime` attribute on
 * each one. Idempotent — meshes that already have the attribute are
 * skipped (so loading a Blender-pre-baked glb is a no-op here).
 */
export const ensureRevealTime = (root: THREE.Object3D, seed = 42): void => {
  let meshIndex = 0;
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const geom = node.geometry as THREE.BufferGeometry | undefined;
    if (!geom) return;
    if (geom.getAttribute(ATTRIBUTE_NAME)) return;

    const pos = geom.getAttribute('position');
    if (!pos) return;

    const n = pos.count;
    if (n === 0) return;

    // Per-mesh seed so each mesh in a multi-mesh scene reveals
    // independently — keeps multi-part assets like the McLaren
    // from looking like they're all on the same scatter pattern.
    const meshSeed = (seed + meshIndex * 0x9E3779B1) >>> 0;
    meshIndex += 1;

    const order = shuffledIndices(n, meshSeed);
    const revealTime = new Float32Array(n);
    const denom = Math.max(n - 1, 1);
    for (let rank = 0; rank < n; rank += 1) {
      const vertIdx = order[rank] ?? rank;
      revealTime[vertIdx] = rank / denom;
    }
    geom.setAttribute(
      ATTRIBUTE_NAME,
      new THREE.BufferAttribute(revealTime, 1),
    );
  });
};
