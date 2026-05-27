/**
 * referenceWatchScene — pure THREE.js builder for a watch-like model at
 * variable LOD. Used as a placeholder "source asset" inside the /auto
 * page so the progressive blueprint flow can be demonstrated WITHOUT
 * requiring a Supabase catalog row.
 *
 * Each LOD reparameterises the same primitive hierarchy (case cylinder
 * + bezel torus + dial disc + strap boxes + crystal dome) with a
 * different segment budget, so you get a genuine triangle-count ramp
 * from tier 0 (blueprint skeleton) to tier 3 (hero material). Once the
 * user uploads a real .glb, this path is replaced by the Supabase-baked
 * tier chain and the runtime consumer stays identical.
 */

import * as THREE from 'three';

export interface ReferenceLODSpec {
  /** Radial segments on the case / bezel / crystal. */
  readonly radial: number;
  /** Height segments on the case cylinder. */
  readonly height: number;
  /** Torus tube segments on the bezel. */
  readonly tube: number;
  /** Strap box segments (w × h × d). Higher = smoother extrusion corners. */
  readonly strap: readonly [number, number, number];
  /** Sphere-cap subdivisions on the crystal. */
  readonly crystal: readonly [number, number];
}

/**
 * Four LOD specs tuned so each tier has a visibly different triangle
 * budget — the blueprint densification reads immediately.
 *
 *   tier 0 — ~80 tris      (skeleton silhouette)
 *   tier 1 — ~360 tris     (readable outline)
 *   tier 2 — ~1800 tris    (structural)
 *   tier 3 — ~7000 tris    (hero)
 */
export const REFERENCE_LOD_SPECS: readonly ReferenceLODSpec[] = [
  { radial: 10, height: 1, tube: 8,  strap: [2, 1, 2],  crystal: [10, 4] },
  { radial: 20, height: 2, tube: 12, strap: [4, 1, 4],  crystal: [20, 6] },
  { radial: 40, height: 3, tube: 20, strap: [8, 2, 8],  crystal: [32, 10] },
  { radial: 72, height: 4, tube: 32, strap: [14, 3, 14], crystal: [48, 16] },
] as const;

// ---------------------------------------------------------------------------
// Materials — same palette for every tier; the runtime wrapper overrides them
// with wireframe MeshBasicMaterials for the blueprint tiers, and the hero
// tier keeps these PBR materials for the final reveal.
// ---------------------------------------------------------------------------

const makeCaseMaterial = (): THREE.MeshPhysicalMaterial =>
  new THREE.MeshPhysicalMaterial({
    color: '#C9A44C',
    metalness: 0.98,
    roughness: 0.18,
    clearcoat: 0.45,
    clearcoatRoughness: 0.15,
  });

const makeDialMaterial = (): THREE.MeshPhysicalMaterial =>
  new THREE.MeshPhysicalMaterial({
    color: '#F3EEE0',
    metalness: 0.05,
    roughness: 0.55,
    clearcoat: 0.1,
  });

const makeStrapMaterial = (): THREE.MeshPhysicalMaterial =>
  new THREE.MeshPhysicalMaterial({
    color: '#3B2719',
    metalness: 0.02,
    roughness: 0.85,
  });

const makeCrystalMaterial = (): THREE.MeshPhysicalMaterial =>
  new THREE.MeshPhysicalMaterial({
    color: '#FFFFFF',
    metalness: 0.05,
    roughness: 0.03,
    transmission: 0.85,
    thickness: 0.2,
    ior: 1.5,
    transparent: true,
    opacity: 0.6,
  });

// ---------------------------------------------------------------------------
// Scene builder
// ---------------------------------------------------------------------------

const CASE_R = 1.35;
const CASE_H = 0.38;

export const buildReferenceWatchAtLOD = (spec: ReferenceLODSpec): THREE.Group => {
  const g = new THREE.Group();

  // Case body — flat gold cylinder.
  const caseGeo = new THREE.CylinderGeometry(
    CASE_R, CASE_R, CASE_H, spec.radial, spec.height,
  );
  const caseMesh = new THREE.Mesh(caseGeo, makeCaseMaterial());
  caseMesh.name = 'case';
  g.add(caseMesh);

  // Bezel — torus ring sitting on top of the case.
  const bezelGeo = new THREE.TorusGeometry(
    CASE_R - 0.02, 0.06, spec.tube, spec.radial,
  );
  const bezelMesh = new THREE.Mesh(bezelGeo, makeCaseMaterial());
  bezelMesh.rotation.x = Math.PI / 2;
  bezelMesh.position.y = CASE_H / 2 + 0.01;
  bezelMesh.name = 'bezel';
  g.add(bezelMesh);

  // Dial — cream disc inside the bezel.
  const dialGeo = new THREE.CircleGeometry(CASE_R - 0.12, spec.radial);
  const dialMesh = new THREE.Mesh(dialGeo, makeDialMaterial());
  dialMesh.rotation.x = -Math.PI / 2;
  dialMesh.position.y = CASE_H / 2 + 0.001;
  dialMesh.name = 'dial';
  g.add(dialMesh);

  // Crystal — sphere cap over the dial.
  const crystalGeo = new THREE.SphereGeometry(
    CASE_R - 0.08,
    spec.crystal[0],
    spec.crystal[1],
    0, Math.PI * 2,
    0, Math.PI / 4.5,
  );
  const crystalMesh = new THREE.Mesh(crystalGeo, makeCrystalMaterial());
  crystalMesh.position.y = CASE_H / 2 - 0.18;
  crystalMesh.name = 'crystal';
  g.add(crystalMesh);

  // Hour markers — twelve slim boxes around the dial rim.
  const marker = new THREE.BoxGeometry(0.05, 0.01, 0.14);
  const markerMat = new THREE.MeshPhysicalMaterial({
    color: '#4A3612',
    metalness: 0.95,
    roughness: 0.25,
  });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const m = new THREE.Mesh(marker, markerMat);
    const r = CASE_R - 0.24;
    m.position.set(Math.cos(a) * r, CASE_H / 2 + 0.008, Math.sin(a) * r);
    m.rotation.y = -a;
    m.name = `hour-${i}`;
    g.add(m);
  }

  // Hands — two flat rectangles pivoting at the centre.
  const hourHand = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 0.005, 0.55),
    new THREE.MeshPhysicalMaterial({ color: '#2B1E0A', metalness: 0.7, roughness: 0.35 }),
  );
  hourHand.position.y = CASE_H / 2 + 0.015;
  hourHand.rotation.y = -0.5;
  g.add(hourHand);
  const minuteHand = new THREE.Mesh(
    new THREE.BoxGeometry(0.03, 0.005, 0.85),
    new THREE.MeshPhysicalMaterial({ color: '#2B1E0A', metalness: 0.7, roughness: 0.35 }),
  );
  minuteHand.position.y = CASE_H / 2 + 0.022;
  minuteHand.rotation.y = 1.1;
  g.add(minuteHand);

  // Strap — two tapered boxes flanking the case.
  const [sw, sh, sd] = spec.strap;
  const strapGeo = new THREE.BoxGeometry(2.1, 0.22, 1.15, sw, sh, sd);
  const strapTop = new THREE.Mesh(strapGeo, makeStrapMaterial());
  strapTop.position.set(0, 0, 1.45);
  strapTop.name = 'strap-top';
  g.add(strapTop);
  const strapBot = new THREE.Mesh(strapGeo, makeStrapMaterial());
  strapBot.position.set(0, 0, -1.45);
  strapBot.name = 'strap-bot';
  g.add(strapBot);

  // Lay the watch flat (face-up) so the camera reads the dial when
  // looking along −Z.
  g.rotation.x = Math.PI / 2;

  return g;
};

/**
 * Materialise the full LOD chain once. The caller can hold the returned
 * array for the whole session — the runtime blueprint/material wrapper
 * toggles opacity + material overrides on these same instances.
 */
export const buildReferenceWatchTiers = (): THREE.Group[] =>
  REFERENCE_LOD_SPECS.map(buildReferenceWatchAtLOD);

/**
 * Accurate triangle count for a built LOD — computed after the fact so
 * the demo UI can show real numbers instead of the hand-waved ranges in
 * the JSDoc above.
 */
export const countTriangles = (root: THREE.Object3D): number => {
  let total = 0;
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.geometry) {
      const idx = obj.geometry.index;
      const pos = obj.geometry.attributes['position'];
      const count = idx?.count ?? pos?.count ?? 0;
      total += Math.floor(count / 3);
    }
  });
  return total;
};
