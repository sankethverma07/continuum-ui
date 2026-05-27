/**
 * <SneakerAsset /> — procedural hovering sneaker for the 4-tier Continuum
 * LOD engine. Modeled on a Nike Air Force 1 Mid silhouette: mid-height
 * collar with a V ankle dip, rounded heel counter, layered quarter panel,
 * stylised swoosh on the lateral AND medial face, chunky cupsole with
 * visible midsole lip + dark outsole strip, visible tongue, row of laces,
 * and an ankle strap wrapping the collar.
 *
 *   LOD 0 — SneakerSkeleton   coarse upper profile only            wireframe block-in
 *   LOD 1 — SneakerFine       upper + sole, denser curves          wireframe
 *   LOD 2 — SneakerMid        solid upper + solid sole, flat        matte unlit-ish
 *   LOD 3 — SneakerHero       upper + quarter panel + swoosh x2 +   AAA: leather + foam
 *                             toe cap + tongue + 5 laces + ankle    + gum tip + rim light
 *                             strap + heel tab + cupsole + outsole
 *
 * Everything is built from layered THREE.ExtrudeGeometry, positioned in Z
 * so distinct panels read as construction layers (white leather base,
 * green quarter panel skin, black swoosh, cream midsole, dark outsole).
 * That layering is what gets the shape out of "one extruded blob" and
 * into "this actually looks like a shoe".
 *
 * Footprint: ~2.3 (L) × 0.78 (W) × 1.22 (H) world units. Inner group is
 * offset by (-L/2, -H/6, -W/2) so the shoe sits centred on the asset
 * origin; the surrounding hover/bob/shadow code lives in the root.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useContinuumStore, selectAsset } from '../store/useContinuumStore';
import type { LODTier } from '../store/types';

// ---------------------------------------------------------------------------
// Geometry constants
// ---------------------------------------------------------------------------

const SHOE_LENGTH = 2.3;
const SHOE_WIDTH  = 0.78;  // Z-extrusion depth of the main body
const SHOE_HEIGHT = 1.22;  // max collar Y above ground
const GROUND_Y    = -0.60;

// Inner offset so shoe is roughly centred on world origin.
const SHOE_OFFSET: [number, number, number] = [
  -SHOE_LENGTH / 2,
  -SHOE_HEIGHT * 0.33,
  -SHOE_WIDTH  / 2,
];

// Extrusion options — HERO uses the detailed set, LOD 0/1 use the coarse.
const EXTRUDE_HERO: THREE.ExtrudeGeometryOptions = {
  depth: SHOE_WIDTH,
  bevelEnabled: true,
  bevelSegments: 6,
  bevelSize: 0.04,
  bevelThickness: 0.04,
  curveSegments: 28,
};
const EXTRUDE_FINE: THREE.ExtrudeGeometryOptions = {
  depth: SHOE_WIDTH,
  bevelEnabled: true,
  bevelSegments: 3,
  bevelSize: 0.03,
  bevelThickness: 0.03,
  curveSegments: 18,
};
const EXTRUDE_COARSE: THREE.ExtrudeGeometryOptions = {
  depth: SHOE_WIDTH,
  bevelEnabled: true,
  bevelSegments: 1,
  bevelSize: 0.035,
  bevelThickness: 0.035,
  curveSegments: 8,
};

// ---------------------------------------------------------------------------
// Last-shape taper — kept as a no-op hook. Earlier we tried scaling vertex Z
// based on X/Y to make the prism foot-shaped, but THREE.ExtrudeGeometry's
// bevelled caps collapse into wedges when pulled inward. Relying on silhouette
// + layered panels reads better than the mangled volume did.
// ---------------------------------------------------------------------------
const applyLastTaper = (_g: THREE.BufferGeometry): void => {
  // intentionally empty
};

// ---------------------------------------------------------------------------
// Shape builders
// ---------------------------------------------------------------------------

/** Build the main side profile of an AF1-Mid-style upper.
 *  Origin: heel-bottom corner (0, 0). +X toward toe, +Y up.
 *  Key beats, in order:
 *    - Heel back rises vertically with a slight rearward lean
 *    - Rounded top of heel counter
 *    - Collar top sweeps forward, then dips into the V ankle opening
 *    - Rises to the front of collar
 *    - Descends over the eyestay/vamp
 *    - Gentle rise for the toe box
 *    - Rounded toe tip
 *    - Returns along the bottom (where upper meets sole, y = 0.20)
 */
const buildUpperOutline = (): THREE.Shape => {
  const s = new THREE.Shape();
  s.moveTo(0.05, 0.20);                                // heel-bottom
  s.bezierCurveTo(-0.02, 0.50, -0.02, 0.85, 0.02, 1.02); // heel back rising
  s.bezierCurveTo(0.05, 1.15, 0.12, 1.23, 0.22, 1.25);   // top of heel counter, rounded
  s.bezierCurveTo(0.35, 1.26, 0.42, 1.18, 0.46, 1.00);   // collar top begins descent
  s.bezierCurveTo(0.50, 0.90, 0.55, 0.84, 0.62, 0.82);   // V ankle dip — lowest point of collar opening
  s.bezierCurveTo(0.70, 0.82, 0.74, 0.88, 0.78, 0.98);   // rises to front-of-collar peak
  s.bezierCurveTo(0.82, 1.03, 0.86, 1.00, 0.92, 0.88);   // peak, then drop forward
  s.bezierCurveTo(1.02, 0.74, 1.10, 0.64, 1.22, 0.58);   // slope into vamp / lace panel
  s.bezierCurveTo(1.38, 0.52, 1.55, 0.50, 1.72, 0.50);   // vamp extends forward
  s.bezierCurveTo(1.88, 0.50, 2.02, 0.52, 2.12, 0.48);   // subtle toe rise
  s.bezierCurveTo(2.22, 0.43, 2.28, 0.36, 2.28, 0.28);   // toe cap curve
  s.bezierCurveTo(2.28, 0.22, 2.24, 0.20, 2.18, 0.20);   // toe tip drops to sole line
  s.lineTo(0.05, 0.20);                                  // back along bottom
  return s;
};

/** Coarser version of the upper for LOD 0 — fewer beziers, same overall
 *  silhouette. The wireframe still reads as "a shoe", just blockier. */
const buildUpperOutlineCoarse = (): THREE.Shape => {
  const s = new THREE.Shape();
  s.moveTo(0.05, 0.20);
  s.bezierCurveTo(-0.04, 0.70, 0.02, 1.15, 0.20, 1.24);
  s.bezierCurveTo(0.42, 1.25, 0.55, 0.85, 0.62, 0.82);
  s.bezierCurveTo(0.75, 0.84, 0.88, 1.00, 0.95, 0.82);
  s.bezierCurveTo(1.25, 0.58, 1.75, 0.52, 2.15, 0.48);
  s.bezierCurveTo(2.28, 0.36, 2.26, 0.22, 2.18, 0.20);
  s.lineTo(0.05, 0.20);
  return s;
};

/** Cupsole side profile. Thick midsole foam with a visible lip wrapping
 *  around the upper edge. Slightly wedge-shaped (heel marginally taller
 *  than toe, matching real running-shoe geometry). */
const buildSoleOutline = (): THREE.Shape => {
  const s = new THREE.Shape();
  s.moveTo(0.04, 0);                                   // heel-bottom-back
  s.lineTo(2.22, 0);                                   // flat ground line
  s.bezierCurveTo(2.32, 0.06, 2.32, 0.18, 2.24, 0.24); // toe-tip curl
  s.bezierCurveTo(2.04, 0.26, 1.80, 0.25, 1.55, 0.24); // top edge under vamp
  s.bezierCurveTo(1.25, 0.24, 0.80, 0.24, 0.45, 0.24); // under arch
  s.bezierCurveTo(0.22, 0.24, 0.08, 0.24, 0.02, 0.24); // under heel
  s.bezierCurveTo(-0.06, 0.20, -0.06, 0.10, 0.02, 0.03); // heel-back top curve
  s.lineTo(0.04, 0);
  return s;
};

/** Outsole — flat thin dark rubber strip on the very bottom of the sole.
 *  Same footprint as sole but only ~0.05 tall. */
const buildOutsoleOutline = (): THREE.Shape => {
  const s = new THREE.Shape();
  s.moveTo(0.08, 0);
  s.lineTo(2.20, 0);
  s.bezierCurveTo(2.26, 0.03, 2.26, 0.06, 2.22, 0.08);
  s.lineTo(0.08, 0.08);
  s.bezierCurveTo(0.02, 0.08, 0.02, 0.03, 0.08, 0);
  return s;
};

/** Quarter panel — the two-tone accent overlay that covers the heel
 *  counter and sweeps forward-and-down past the midfoot. This is the
 *  "color block" that makes a white AF1 read as a White/Malachite (or
 *  White/Ember) rather than a monochrome shoe. */
const buildQuarterPanelOutline = (): THREE.Shape => {
  const s = new THREE.Shape();
  s.moveTo(0.05, 0.21);                                 // heel-bottom
  s.bezierCurveTo(-0.01, 0.55, -0.01, 0.90, 0.03, 1.03); // heel back
  s.bezierCurveTo(0.06, 1.14, 0.13, 1.22, 0.22, 1.24);   // top of counter
  s.bezierCurveTo(0.34, 1.25, 0.42, 1.17, 0.46, 1.00);   // collar down
  s.bezierCurveTo(0.48, 0.92, 0.50, 0.84, 0.52, 0.72);   // drop past collar
  s.bezierCurveTo(0.62, 0.60, 0.78, 0.48, 1.00, 0.40);   // diagonal forward edge
  s.bezierCurveTo(1.10, 0.36, 1.15, 0.28, 1.12, 0.21);   // down to sole line
  s.lineTo(0.05, 0.21);
  return s;
};

/** Stylised swoosh — a lenticular checkmark slashing from the heel-mid
 *  area forward-and-down to just behind the toe cap. Meant to be applied
 *  to both the lateral and medial sides of the shoe so it reads at any
 *  rotation angle. */
const buildSwooshOutline = (): THREE.Shape => {
  const s = new THREE.Shape();
  // Upper edge of the swoosh (top of the checkmark sweep).
  s.moveTo(0.55, 0.78);
  s.bezierCurveTo(0.75, 0.72, 1.00, 0.64, 1.30, 0.52);
  s.bezierCurveTo(1.60, 0.44, 1.85, 0.40, 1.98, 0.40);
  s.bezierCurveTo(1.92, 0.44, 1.80, 0.46, 1.65, 0.50);
  s.bezierCurveTo(1.40, 0.56, 1.10, 0.64, 0.85, 0.72);
  s.bezierCurveTo(0.72, 0.76, 0.62, 0.82, 0.55, 0.78);
  return s;
};

/** Small rounded toe cap — a subtle raised patch sitting on top of the
 *  front of the upper, typical of basketball shoes and many running
 *  silhouettes. */
const buildToeCapOutline = (): THREE.Shape => {
  const s = new THREE.Shape();
  s.moveTo(1.75, 0.50);
  s.bezierCurveTo(1.90, 0.52, 2.05, 0.52, 2.18, 0.49);
  s.bezierCurveTo(2.24, 0.46, 2.26, 0.38, 2.24, 0.30);
  s.bezierCurveTo(2.18, 0.26, 2.00, 0.28, 1.85, 0.32);
  s.bezierCurveTo(1.78, 0.38, 1.74, 0.44, 1.75, 0.50);
  return s;
};

/** Tongue — rectangular pad with rounded top, sits on top of the vamp
 *  between the two lace loops. */
const buildTongueOutline = (): THREE.Shape => {
  const s = new THREE.Shape();
  s.moveTo(0.82, 0.62);
  s.bezierCurveTo(0.80, 0.78, 0.85, 0.96, 0.95, 1.02);
  s.bezierCurveTo(1.05, 1.05, 1.20, 0.98, 1.22, 0.88);
  s.bezierCurveTo(1.22, 0.78, 1.18, 0.66, 1.10, 0.60);
  s.bezierCurveTo(1.00, 0.58, 0.90, 0.58, 0.82, 0.62);
  return s;
};

/** Heel tab — small pull loop / stitched patch at the back of the heel
 *  counter. Appears as a small accent-colored rectangle. */
const buildHeelTabOutline = (): THREE.Shape => {
  const s = new THREE.Shape();
  s.moveTo(0.02, 1.00);
  s.lineTo(0.02, 1.18);
  s.bezierCurveTo(0.04, 1.22, 0.14, 1.23, 0.20, 1.22);
  s.lineTo(0.20, 1.05);
  s.bezierCurveTo(0.15, 1.00, 0.08, 0.99, 0.02, 1.00);
  return s;
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface SneakerAssetProps {
  readonly id: string;
  readonly forceLOD?: LODTier;
  readonly position?: [number, number, number];
  readonly accentColor?: string;   // quarter panel + swoosh + heel tab
  readonly upperColor?: string;    // main white leather area
}

interface VariantProps {
  readonly opacity: number;
  readonly accentColor: string;
  readonly upperColor: string;
}

// ---------------------------------------------------------------------------
// LOD 0 — coarse upper-only wireframe
// ---------------------------------------------------------------------------

const SneakerSkeleton = ({ opacity }: VariantProps) => {
  const matRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const geom = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(buildUpperOutlineCoarse(), EXTRUDE_COARSE);
    applyLastTaper(g);
    return g;
  }, []);
  useEffect(() => {
    const mat = matRef.current;
    return () => { geom.dispose(); mat?.dispose(); };
  }, [geom]);
  useFrame(() => { if (matRef.current) matRef.current.opacity = opacity; });

  return (
    <mesh geometry={geom} position={SHOE_OFFSET}>
      <meshBasicMaterial
        ref={matRef}
        wireframe
        color="#FFDDB0"
        transparent
        opacity={opacity}
      />
    </mesh>
  );
};

// ---------------------------------------------------------------------------
// LOD 1 — upper + sole, fine wireframe
// ---------------------------------------------------------------------------

const SneakerFine = ({ opacity }: VariantProps) => {
  const upperMatRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const soleMatRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const upperGeom = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(buildUpperOutline(), EXTRUDE_FINE);
    applyLastTaper(g);
    return g;
  }, []);
  const soleGeom = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(buildSoleOutline(), EXTRUDE_FINE);
    applyLastTaper(g);
    return g;
  }, []);
  useEffect(() => {
    const u = upperMatRef.current, s = soleMatRef.current;
    return () => { upperGeom.dispose(); soleGeom.dispose(); u?.dispose(); s?.dispose(); };
  }, [upperGeom, soleGeom]);
  useFrame(() => {
    if (upperMatRef.current) upperMatRef.current.opacity = opacity;
    if (soleMatRef.current) soleMatRef.current.opacity = opacity;
  });

  return (
    <group position={SHOE_OFFSET}>
      <mesh geometry={upperGeom}>
        <meshBasicMaterial ref={upperMatRef} wireframe color="#FFE2B3" transparent opacity={opacity} />
      </mesh>
      <mesh geometry={soleGeom}>
        <meshBasicMaterial ref={soleMatRef} wireframe color="#F2B07A" transparent opacity={opacity} />
      </mesh>
    </group>
  );
};

// ---------------------------------------------------------------------------
// LOD 2 — solid upper + solid sole, flat colours
// ---------------------------------------------------------------------------

const SneakerMid = ({ opacity, upperColor }: VariantProps) => {
  const upperMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const soleMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const upperGeom = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(buildUpperOutline(), EXTRUDE_FINE);
    applyLastTaper(g);
    return g;
  }, []);
  const soleGeom = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(buildSoleOutline(), EXTRUDE_FINE);
    applyLastTaper(g);
    return g;
  }, []);
  useEffect(() => {
    const u = upperMatRef.current, s = soleMatRef.current;
    return () => { upperGeom.dispose(); soleGeom.dispose(); u?.dispose(); s?.dispose(); };
  }, [upperGeom, soleGeom]);
  useFrame(() => {
    if (upperMatRef.current) upperMatRef.current.opacity = opacity;
    if (soleMatRef.current) soleMatRef.current.opacity = opacity;
  });

  return (
    <group position={SHOE_OFFSET}>
      <mesh geometry={upperGeom}>
        <meshStandardMaterial
          ref={upperMatRef}
          color={upperColor}
          roughness={0.75}
          metalness={0.05}
          transparent
          opacity={opacity}
        />
      </mesh>
      <mesh geometry={soleGeom}>
        <meshStandardMaterial
          ref={soleMatRef}
          color="#F2E9D8"
          roughness={0.75}
          metalness={0.03}
          transparent
          opacity={opacity}
        />
      </mesh>
    </group>
  );
};

// ---------------------------------------------------------------------------
// LOD 3 — AAA hero, full layered build
// ---------------------------------------------------------------------------

const SneakerHero = ({ opacity, accentColor, upperColor }: VariantProps) => {
  const groupRef = useRef<THREE.Group>(null);
  const upperMatRef = useRef<THREE.MeshPhysicalMaterial | null>(null);
  const soleMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const outsoleMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const quarterMatRef = useRef<THREE.MeshPhysicalMaterial | null>(null);
  const swooshMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const toeCapMatRef = useRef<THREE.MeshPhysicalMaterial | null>(null);
  const tongueMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const strapMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const heelTabMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const lightRef = useRef<THREE.PointLight>(null);

  // --- Geometries ---
  const upperGeom   = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(buildUpperOutline(), EXTRUDE_HERO);
    applyLastTaper(g);
    return g;
  }, []);
  const soleGeom    = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(buildSoleOutline(), EXTRUDE_HERO);
    applyLastTaper(g);
    return g;
  }, []);
  const outsoleGeom = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(buildOutsoleOutline(), { ...EXTRUDE_HERO, depth: SHOE_WIDTH + 0.02 });
    applyLastTaper(g);
    return g;
  }, []);
  // Accent panels — thin, sit OUTSIDE the main upper on each Z face, so they
  // read as a leather overlay on both the lateral and medial side of the
  // shoe. Depth is tiny (0.04) so we get a skin effect, not a second shoe.
  const panelGeom   = useMemo(() => new THREE.ExtrudeGeometry(buildQuarterPanelOutline(), {
    depth: 0.04, bevelEnabled: true, bevelSegments: 3, bevelSize: 0.015, bevelThickness: 0.015, curveSegments: 22,
  }), []);
  // Keep the panel flat (no Z taper) — it's only 0.04 deep, so tapering
  // collapses it to nothing. Positioning handles the outer-face placement.
  const swooshGeom  = useMemo(() => new THREE.ExtrudeGeometry(buildSwooshOutline(), {
    depth: 0.03, bevelEnabled: true, bevelSegments: 2, bevelSize: 0.008, bevelThickness: 0.008, curveSegments: 20,
  }), []);
  const toeCapGeom  = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(buildToeCapOutline(), {
      depth: SHOE_WIDTH + 0.02, bevelEnabled: true, bevelSegments: 3, bevelSize: 0.02, bevelThickness: 0.02, curveSegments: 18,
    });
    applyLastTaper(g);
    return g;
  }, []);
  // Tongue — thin pad (~0.08 depth) sitting ON TOP of the vamp, between the
  // two eyelet rows. NOT extruded across the full width, otherwise it fills
  // the whole upper and reads as a giant dark chunk inside the shoe.
  const tongueGeom  = useMemo(() => new THREE.ExtrudeGeometry(buildTongueOutline(), {
    depth: 0.08, bevelEnabled: true, bevelSegments: 3, bevelSize: 0.015, bevelThickness: 0.015, curveSegments: 16,
  }), []);
  const heelTabGeom = useMemo(() => new THREE.ExtrudeGeometry(buildHeelTabOutline(), {
    depth: 0.04, bevelEnabled: true, bevelSegments: 2, bevelSize: 0.01, bevelThickness: 0.01,
  }), []);
  // Ankle strap — a thin band wrapping across the collar top. Narrower
  // than SHOE_WIDTH because the collar is tapered inward; we'd poke out
  // the lateral face if we used the full extrusion width.
  const strapGeom = useMemo(
    () => new THREE.BoxGeometry(0.14, 0.08, SHOE_WIDTH * 0.78),
    [],
  );
  // Laces — slender cylinders, 5 of them across the eyestay.
  const laceGeom = useMemo(() => new THREE.CylinderGeometry(0.022, 0.022, SHOE_WIDTH - 0.22, 10, 1), []);
  const lacePositions = useMemo<ReadonlyArray<readonly [number, number, number]>>(() => [
    [0.86, 0.68, 0],
    [0.96, 0.70, 0],
    [1.06, 0.68, 0],
    [1.16, 0.64, 0],
    [1.26, 0.60, 0],
  ], []);
  // Small dark eyelet dots flanking each lace, on both sides of the tongue.
  const eyeletGeom = useMemo(() => new THREE.CylinderGeometry(0.024, 0.024, 0.03, 12, 1), []);

  useEffect(() => {
    const mats = [
      upperMatRef.current, soleMatRef.current, outsoleMatRef.current,
      quarterMatRef.current, swooshMatRef.current, toeCapMatRef.current,
      tongueMatRef.current, strapMatRef.current, heelTabMatRef.current,
    ];
    return () => {
      [upperGeom, soleGeom, outsoleGeom, panelGeom, swooshGeom, toeCapGeom,
       tongueGeom, heelTabGeom, strapGeom, laceGeom, eyeletGeom].forEach((g) => g.dispose());
      mats.forEach((m) => m?.dispose());
    };
  }, [upperGeom, soleGeom, outsoleGeom, panelGeom, swooshGeom, toeCapGeom,
      tongueGeom, heelTabGeom, strapGeom, laceGeom, eyeletGeom]);

  const elapsedRef = useRef(0);
  useFrame((_s, delta) => {
    elapsedRef.current += delta;
    const t = elapsedRef.current;
    // Gentle idle turntable — ~25° peak each way, slow enough that the
    // viewer can always see the swoosh + lace detail on the near face.
    if (groupRef.current) {
      groupRef.current.rotation.y = Math.sin(t * 0.42) * 0.42;
      groupRef.current.rotation.z = Math.sin(t * 0.36) * 0.03;
    }
    const breath = 0.5 + 0.5 * Math.sin(t * 1.4);
    if (upperMatRef.current)   upperMatRef.current.opacity = opacity;
    if (soleMatRef.current)    soleMatRef.current.opacity = opacity;
    if (outsoleMatRef.current) outsoleMatRef.current.opacity = opacity;
    if (quarterMatRef.current) quarterMatRef.current.opacity = opacity;
    if (toeCapMatRef.current)  toeCapMatRef.current.opacity = opacity;
    if (tongueMatRef.current)  tongueMatRef.current.opacity = opacity;
    if (strapMatRef.current)   strapMatRef.current.opacity = opacity;
    if (heelTabMatRef.current) {
      heelTabMatRef.current.opacity = opacity;
      heelTabMatRef.current.emissiveIntensity = 0.35 + 0.2 * breath;
    }
    if (swooshMatRef.current) {
      swooshMatRef.current.opacity = opacity;
      swooshMatRef.current.emissiveIntensity = 0.25 + 0.15 * breath;
    }
    if (lightRef.current) lightRef.current.intensity = (1.15 + 0.35 * breath) * opacity;
  });

  // Helper: z-offsets used to lift side panels slightly proud of the main
  // body on each face, so quarter panels / swooshes read as skin layers.
  const Z_LATERAL  = SHOE_WIDTH + 0.001;     // far-Z face of main upper
  const Z_MEDIAL   = -0.001 - 0.04;          // near-Z face, offset by panel depth

  return (
    <group ref={groupRef} position={SHOE_OFFSET}>
      {/* ---- Main upper — white leather base ---- */}
      <mesh geometry={upperGeom}>
        <meshPhysicalMaterial
          ref={upperMatRef}
          color={upperColor}
          roughness={0.55}
          metalness={0.04}
          sheen={0.6}
          sheenColor="#FFF7E6"
          sheenRoughness={0.45}
          clearcoat={0.2}
          clearcoatRoughness={0.55}
          transparent
          opacity={opacity}
        />
      </mesh>

      {/* ---- Quarter panel — accent colour overlay on BOTH sides ---- */}
      <mesh geometry={panelGeom} position={[0, 0, Z_LATERAL]}>
        <meshPhysicalMaterial
          ref={quarterMatRef}
          color={accentColor}
          roughness={0.5}
          metalness={0.05}
          sheen={0.5}
          sheenColor="#FFFFFF"
          sheenRoughness={0.5}
          clearcoat={0.15}
          transparent
          opacity={opacity}
        />
      </mesh>
      <mesh geometry={panelGeom} position={[0, 0, Z_MEDIAL]}>
        <meshPhysicalMaterial
          color={accentColor}
          roughness={0.5}
          metalness={0.05}
          sheen={0.5}
          sheenColor="#FFFFFF"
          sheenRoughness={0.5}
          clearcoat={0.15}
          transparent
          opacity={opacity}
        />
      </mesh>

      {/* ---- Swoosh — lateral + medial ---- */}
      <mesh geometry={swooshGeom} position={[0, 0, Z_LATERAL + 0.04]}>
        <meshStandardMaterial
          ref={swooshMatRef}
          color="#1A1410"
          emissive={accentColor}
          emissiveIntensity={0.25}
          roughness={0.35}
          metalness={0.15}
          transparent
          opacity={opacity}
        />
      </mesh>
      <mesh geometry={swooshGeom} position={[0, 0, Z_MEDIAL]}>
        <meshStandardMaterial
          color="#1A1410"
          emissive={accentColor}
          emissiveIntensity={0.2}
          roughness={0.4}
          metalness={0.15}
          transparent
          opacity={opacity}
        />
      </mesh>

      {/* ---- Toe cap — subtle raised patch across the front of the upper ---- */}
      <mesh geometry={toeCapGeom} position={[0, 0, -0.01]}>
        <meshPhysicalMaterial
          ref={toeCapMatRef}
          color={upperColor}
          roughness={0.45}
          metalness={0.05}
          sheen={0.7}
          sheenColor="#FFFFFF"
          clearcoat={0.3}
          transparent
          opacity={opacity}
        />
      </mesh>

      {/* ---- Midsole foam — cream cupsole ---- */}
      <mesh geometry={soleGeom}>
        <meshStandardMaterial
          ref={soleMatRef}
          color="#F4ECDB"
          roughness={0.72}
          metalness={0.02}
          transparent
          opacity={opacity}
        />
      </mesh>

      {/* ---- Outsole — thin dark rubber strip on the very bottom ---- */}
      <mesh geometry={outsoleGeom} position={[0, -0.002, -0.01]}>
        <meshStandardMaterial
          ref={outsoleMatRef}
          color="#1A1410"
          roughness={0.55}
          metalness={0.05}
          transparent
          opacity={opacity}
        />
      </mesh>

      {/* ---- Tongue — dark padded panel, THIN, sitting on top of the vamp
              between the two eyelet rows. Centered in Z so it's visibly a
              pad cushioned into the lace opening (not a slab through the
              whole shoe). */}
      <mesh geometry={tongueGeom} position={[0, 0, (SHOE_WIDTH - 0.08) / 2]}>
        <meshStandardMaterial
          ref={tongueMatRef}
          color="#241B14"
          roughness={0.95}
          metalness={0}
          transparent
          opacity={opacity}
        />
      </mesh>

      {/* ---- Laces — 5 slender cylinders across the eyestay, centered in Z ---- */}
      <group>
        {lacePositions.map((p, i) => (
          <mesh
            key={i}
            geometry={laceGeom}
            position={[p[0], p[1], SHOE_WIDTH / 2]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <meshStandardMaterial
              color="#E8DCC2"
              roughness={0.88}
              metalness={0}
              transparent
              opacity={opacity}
            />
          </mesh>
        ))}
      </group>

      {/* ---- Eyelets — small dark dots flanking each lace on both sides ---- */}
      <group>
        {lacePositions.map((p, i) => (
          <group key={i}>
            <mesh
              geometry={eyeletGeom}
              position={[p[0], p[1], 0.08]}
              rotation={[Math.PI / 2, 0, 0]}
            >
              <meshStandardMaterial color="#141010" roughness={0.4} metalness={0.3} transparent opacity={opacity} />
            </mesh>
            <mesh
              geometry={eyeletGeom}
              position={[p[0], p[1], SHOE_WIDTH - 0.08]}
              rotation={[Math.PI / 2, 0, 0]}
            >
              <meshStandardMaterial color="#141010" roughness={0.4} metalness={0.3} transparent opacity={opacity} />
            </mesh>
          </group>
        ))}
      </group>

      {/* ---- Ankle strap — band crossing the collar opening. Centered in Z
              so it sits IN the collar, not protruding from the lateral face. */}
      <mesh geometry={strapGeom} position={[0.50, 0.92, SHOE_WIDTH / 2]}>
        <meshStandardMaterial
          ref={strapMatRef}
          color={upperColor}
          roughness={0.6}
          metalness={0.05}
          transparent
          opacity={opacity}
        />
      </mesh>

      {/* ---- Heel tab — emissive accent plate on the back ---- */}
      <mesh geometry={heelTabGeom} position={[0, 0, Z_LATERAL + 0.02]}>
        <meshStandardMaterial
          ref={heelTabMatRef}
          color={accentColor}
          emissive={accentColor}
          emissiveIntensity={0.35}
          roughness={0.4}
          metalness={0.15}
          transparent
          opacity={opacity}
        />
      </mesh>
      <mesh geometry={heelTabGeom} position={[0, 0, Z_MEDIAL - 0.02]}>
        <meshStandardMaterial
          color={accentColor}
          emissive={accentColor}
          emissiveIntensity={0.3}
          roughness={0.4}
          metalness={0.15}
          transparent
          opacity={opacity}
        />
      </mesh>

      {/* ---- Rim light — only active at LOD 3, sells the "AAA arrival" beat.
              Warm tone matches the cream page palette behind it.     */}
      <pointLight
        ref={lightRef}
        color="#FFD7A8"
        intensity={0}
        distance={6}
        decay={1.6}
        position={[2.6, 1.4, 2.4]}
      />
    </group>
  );
};

// ---------------------------------------------------------------------------
// Contact shadow — soft radial darkening on the ground, locked to y = GROUND_Y.
// Scales and opacity track the bob ref so the shadow tightens as the shoe
// rises and spreads/lightens as it descends — same trick every real product
// page uses to sell weight.
// ---------------------------------------------------------------------------

const ContactShadow = ({ bob }: { bob: React.RefObject<number> }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const texture = useMemo(() => {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    // Elliptical radial fade — darker in the middle, soft edges.
    const grad = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(0,0,0,0.80)');
    grad.addColorStop(0.4, 'rgba(0,0,0,0.45)');
    grad.addColorStop(0.75, 'rgba(0,0,0,0.12)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 4;
    return tex;
  }, []);

  useEffect(() => {
    const mat = matRef.current;
    return () => { texture.dispose(); mat?.dispose(); };
  }, [texture]);

  useFrame(() => {
    const b = bob.current ?? 0;
    if (meshRef.current) {
      const s = 1.0 + b * 0.4;
      meshRef.current.scale.set(s, s, 1);
    }
    if (matRef.current) matRef.current.opacity = 0.7 - b * 0.28;
  });

  return (
    <mesh
      ref={meshRef}
      position={[0, GROUND_Y + 0.002, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <planeGeometry args={[SHOE_LENGTH * 1.8, SHOE_WIDTH * 2.6]} />
      <meshBasicMaterial
        ref={matRef}
        map={texture}
        transparent
        depthWrite={false}
        opacity={0.7}
      />
    </mesh>
  );
};

// ---------------------------------------------------------------------------
// Root — 4-tier crossfade + hover/bob driver
// ---------------------------------------------------------------------------

type TierMap<V> = { 0: V; 1: V; 2: V; 3: V };
const TIERS = [0, 1, 2, 3] as const;

export const SneakerAsset = ({
  id,
  forceLOD,
  position = [0, 0, 0],
  accentColor = '#3A7D4E',     // AF1 Mid "Malachite" green by default
  upperColor  = '#F4EEE1',     // Sail
}: SneakerAssetProps): JSX.Element => {
  const reg = useContinuumStore(selectAsset(id));
  const effectiveLOD: LODTier =
    forceLOD ?? (Math.min(reg?.maxLOD ?? 3, 3) as LODTier);

  useEffect(() => {
    const store = useContinuumStore.getState();
    store.registerAsset(id);
    store.setStatus(id, 'ready');
    return () => { useContinuumStore.getState().unregisterAsset(id); };
  }, [id]);

  useEffect(() => {
    useContinuumStore.getState().setLOD(id, effectiveLOD);
  }, [id, effectiveLOD]);

  const opacityRef = useRef<TierMap<number>>({
    0: effectiveLOD === 0 ? 1 : 0,
    1: effectiveLOD === 1 ? 1 : 0,
    2: effectiveLOD === 2 ? 1 : 0,
    3: effectiveLOD === 3 ? 1 : 0,
  });
  const [opacities, setOpacities] = useState<TierMap<number>>(() => ({ ...opacityRef.current }));
  const [mounted, setMounted] = useState<TierMap<boolean>>(() => ({
    0: effectiveLOD === 0, 1: effectiveLOD === 1,
    2: effectiveLOD === 2, 3: effectiveLOD === 3,
  }));

  useEffect(() => {
    setMounted((p) => ({ ...p, [effectiveLOD]: true }));
  }, [effectiveLOD]);

  // Hover driver — sine bob, shared with ContactShadow via ref.
  const hoverGroupRef = useRef<THREE.Group>(null);
  const elapsedRef = useRef(0);
  const bobRef = useRef(0);

  useFrame((_s, delta) => {
    elapsedRef.current += delta;
    const t = elapsedRef.current;
    const bob = 0.5 + 0.5 * Math.sin(t * 1.0);
    bobRef.current = bob;
    if (hoverGroupRef.current) {
      hoverGroupRef.current.position.y = bob * 0.10;
      hoverGroupRef.current.rotation.x = Math.sin(t * 0.7) * 0.035;
    }

    const LERP = 0.18;
    let sync = false;
    for (const tier of TIERS) {
      const target = tier === effectiveLOD ? 1 : 0;
      const cur = opacityRef.current[tier];
      const next = cur + (target - cur) * LERP;
      opacityRef.current[tier] = next;
      if ((cur >= 0.01 && next < 0.01) || (cur < 0.01 && next >= 0.01)) sync = true;
    }
    if (sync) {
      const snap = { ...opacityRef.current };
      setOpacities(snap);
      setMounted({
        0: snap[0] >= 0.01, 1: snap[1] >= 0.01,
        2: snap[2] >= 0.01, 3: snap[3] >= 0.01,
      });
    }
  });

  return (
    <group position={position}>
      <ContactShadow bob={bobRef} />
      <group ref={hoverGroupRef}>
        {mounted[0] && <SneakerSkeleton opacity={opacities[0]} accentColor={accentColor} upperColor={upperColor} />}
        {mounted[1] && <SneakerFine     opacity={opacities[1]} accentColor={accentColor} upperColor={upperColor} />}
        {mounted[2] && <SneakerMid      opacity={opacities[2]} accentColor={accentColor} upperColor={upperColor} />}
        {mounted[3] && <SneakerHero     opacity={opacities[3]} accentColor={accentColor} upperColor={upperColor} />}
      </group>
    </group>
  );
};
