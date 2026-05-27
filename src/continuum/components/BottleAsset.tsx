/**
 * <BottleAsset /> — the bottle-shaped 4-tier ghost mesh.
 *
 * Built specifically to ride underneath the Spline scene on the Relay
 * product page. The Spline scene is a squat *sports squeeze bottle* with a
 * flip-top cap, a deep olive-green body, and a white brush-script
 * "Team JMJ" wordmark on the front. All four LOD tiers of this ghost
 * share that same silhouette and palette so the user reads the correct
 * product from frame zero — the only thing changing is fidelity:
 *
 *   LOD 0 — BottleSkeleton      LatheGeometry(profile, 12)   coarse wireframe
 *   LOD 1 — BottleFineBlueprint LatheGeometry(profile, 64)   dense wireframe
 *   LOD 2 — BottleMid           LatheGeometry(profile, 64)   flat olive plastic
 *   LOD 3 — BottleHero          LatheGeometry(profile, 192)  olive plastic body +
 *                                                            dark flip-top cap +
 *                                                            "Team JMJ" decal +
 *                                                            warm rim point light
 *
 * The silhouette is a single closed lathe profile (bottom → stout body →
 * shoulder → short neck → flip cap), so the user sees a *squeeze bottle*
 * the entire time the Spline scene downloads — not a perfume silhouette
 * that suddenly mutates into a sports bottle.
 *
 * LOD 3 is the "lighting loads last" moment — a warm rim light snaps in and
 * the plastic clearcoat opens up, so the bottle reads as if studio lighting
 * just finished baking.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useContinuumStore, selectAsset } from '../store/useContinuumStore';
import type { LODTier } from '../store/types';

// ---------------------------------------------------------------------------
// Shared bottle profile — sports squeeze bottle
// ---------------------------------------------------------------------------
//
// Half-profile of a stout squeeze bottle, swept around the Y axis by
// THREE.LatheGeometry. Each Vector2 is (radius, height). The profile starts
// AT the axis (x=0) on the bottom and ENDS at the axis on top so the lathe
// caps both ends without a separate disc.
//
// Silhouette cues: wide low body (fits in a bike cage), quick shoulder into
// a short neck, chunky flip-top cap. Matches the Spline asset so the user
// reads "squeeze bottle" from LOD 0 all the way through hero.

const BOTTLE_PROFILE: ReadonlyArray<readonly [number, number]> = [
  // Bottom seal (x=0 -> closes the bottom) with a small chamfer
  [0.00, -1.20],
  [0.55, -1.20],
  [0.70, -1.15],
  [0.72, -1.05],
  // Stout straight body
  [0.72,  0.55],
  // Quick shoulder bulge before tapering
  [0.70,  0.70],
  [0.62,  0.86],
  [0.50,  0.98],
  // Short neck
  [0.42,  1.04],
  [0.42,  1.16],
  // Flip-cap lip — steps slightly outward
  [0.48,  1.18],
  [0.52,  1.22],
  // Flip-cap straight wall
  [0.52,  1.44],
  // Rounded cap top
  [0.48,  1.48],
  [0.34,  1.52],
  [0.18,  1.54],
  [0.00,  1.54],
] as const;

const BOTTLE_PROFILE_VECTORS: ReadonlyArray<THREE.Vector2> = BOTTLE_PROFILE.map(
  ([r, h]) => new THREE.Vector2(r, h),
);

// Cap-only sub-profile, used by LOD 3 to render the flip-top cap with a
// darker material distinct from the plastic body. Same vertices as the cap
// portion of the master profile so it sits exactly on top of the body.
const CAP_PROFILE: ReadonlyArray<readonly [number, number]> = [
  [0.42, 1.04],
  [0.42, 1.16],
  [0.48, 1.18],
  [0.52, 1.22],
  [0.52, 1.44],
  [0.48, 1.48],
  [0.34, 1.52],
  [0.18, 1.54],
  [0.00, 1.54],
];
const CAP_PROFILE_VECTORS: ReadonlyArray<THREE.Vector2> = CAP_PROFILE.map(
  ([r, h]) => new THREE.Vector2(r, h),
);

// Liquid-only sub-profile — sits inside the body. Squeeze bottles are
// usually opaque, so we keep this very subtle — a thin inner shell that
// darkens the body a touch in the lower half.
const LIQUID_PROFILE: ReadonlyArray<readonly [number, number]> = [
  [0.00, -1.18],
  [0.62, -1.18],
  [0.66, -1.10],
  [0.66,  0.30],
  [0.00,  0.30],
];
const LIQUID_PROFILE_VECTORS: ReadonlyArray<THREE.Vector2> = LIQUID_PROFILE.map(
  ([r, h]) => new THREE.Vector2(r, h),
);

// Body-only sub-profile (everything below the cap), used by LOD 3
// for the plastic material so the cap can sit on top with its own darker
// material. Closes at the neck line (y=1.04).
const BODY_PROFILE: ReadonlyArray<readonly [number, number]> = [
  [0.00, -1.20],
  [0.55, -1.20],
  [0.70, -1.15],
  [0.72, -1.05],
  [0.72,  0.55],
  [0.70,  0.70],
  [0.62,  0.86],
  [0.50,  0.98],
  [0.42,  1.04],
  [0.00,  1.04],
];
const BODY_PROFILE_VECTORS: ReadonlyArray<THREE.Vector2> = BODY_PROFILE.map(
  ([r, h]) => new THREE.Vector2(r, h),
);

// ---------------------------------------------------------------------------
// Procedural label texture for LOD 3
// ---------------------------------------------------------------------------

/**
 * Build the canvas-backed "Sanketh" decal that wraps the front of the
 * bottle.
 *
 *   colorMap : transparent canvas painted with the white script wordmark,
 *              clipped to the front-facing arc only (so the back of the
 *              cylinder stays invisible)
 *   alphaMap : a coarser front-arc mask used by the material's alphaMap,
 *              which combines multiplicatively with the color map's own
 *              per-pixel alpha to ensure the back never shows through
 *
 * The decal is painted in cream-white (#F4EFE2) so it reads against the
 * deep olive plastic body without glaring like a flashlight.
 */
const buildLabelTextures = (): {
  colorMap: THREE.CanvasTexture;
  alphaMap: THREE.CanvasTexture;
} => {
  const W = 1024;
  const H = 512;

  // --- Color map -----------------------------------------------------------
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = W;
  colorCanvas.height = H;
  const cctx = colorCanvas.getContext('2d')!;

  // Transparent base — only the wordmark itself carries color/alpha so the
  // body's olive plastic shows through everywhere else on the front arc.
  cctx.clearRect(0, 0, W, H);

  // Clip painting to the front-facing arc so even if a glyph extends past
  // the arc bounds it gets cut at the edge.
  const arcStart = W * 0.28;
  const arcEnd   = W * 0.72;
  cctx.save();
  cctx.beginPath();
  cctx.rect(arcStart, 0, arcEnd - arcStart, H);
  cctx.clip();

  // Soft drop shadow so the wordmark sits "inside" the plastic instead of
  // floating on top.
  cctx.shadowColor   = 'rgba(0, 0, 0, 0.45)';
  cctx.shadowBlur    = 18;
  cctx.shadowOffsetY = 4;

  // "Sanketh" — brush-script style using Allura (loaded globally in
  // index.html). One line, centered in the label band, sized so it fills
  // the front arc without crowding the edges.
  cctx.fillStyle = '#F4EFE2';
  cctx.textAlign = 'center';
  cctx.font = 'italic 700 260px "Allura", "Pinyon Script", "Dancing Script", cursive';
  cctx.fillText('Sanketh', W / 2, H * 0.62);

  // A thin hairline underscore beneath the wordmark — product-design touch
  // that echoes the hairline rules on the rest of the site.
  cctx.shadowBlur = 0;
  cctx.shadowOffsetY = 0;
  cctx.strokeStyle = 'rgba(244, 239, 226, 0.55)';
  cctx.lineWidth = 2;
  cctx.beginPath();
  cctx.moveTo(W * 0.38, H * 0.78);
  cctx.lineTo(W * 0.62, H * 0.78);
  cctx.stroke();

  // Small mono sub-line underneath — reinforces the product framing.
  cctx.fillStyle = 'rgba(244, 239, 226, 0.75)';
  cctx.font = '500 20px "JetBrains Mono", ui-monospace, monospace';
  cctx.textAlign = 'center';
  cctx.fillText('SERIES · 01', W / 2, H * 0.86);

  cctx.restore();

  const colorMap = new THREE.CanvasTexture(colorCanvas);
  colorMap.wrapS = THREE.RepeatWrapping;
  colorMap.wrapT = THREE.ClampToEdgeWrapping;
  colorMap.colorSpace = THREE.SRGBColorSpace;
  colorMap.anisotropy = 4;

  // --- Alpha map -----------------------------------------------------------
  // Coarse front-arc clip — still useful as a belt-and-suspenders mask
  // alongside the color map's per-pixel alpha. Pure white inside the front
  // arc, black outside, so the cylinder is opaque only where the wordmark
  // sits and fully transparent on the sides + back.
  const alphaCanvas = document.createElement('canvas');
  alphaCanvas.width = W;
  alphaCanvas.height = H;
  const actx = alphaCanvas.getContext('2d')!;
  actx.fillStyle = '#000000';
  actx.fillRect(0, 0, W, H);
  actx.fillStyle = '#FFFFFF';
  actx.fillRect(arcStart, H * 0.10, arcEnd - arcStart, H * 0.85);

  const alphaMap = new THREE.CanvasTexture(alphaCanvas);
  alphaMap.wrapS = THREE.RepeatWrapping;
  alphaMap.wrapT = THREE.ClampToEdgeWrapping;

  return { colorMap, alphaMap };
};

// ---------------------------------------------------------------------------
// Per-variant common types
// ---------------------------------------------------------------------------

interface VariantProps {
  readonly opacity: number;
}

export interface BottleAssetProps {
  readonly id: string;
  readonly forceLOD?: LODTier;
  readonly position?: readonly [number, number, number];
}

// Shared color tokens — the bottle's "olive sports plastic" identity,
// matched to the Spline scene's green body + dark flip-cap.
const BOTTLE_TINT        = '#4A5C1F';   // olive plastic body
const BOTTLE_RIM         = '#7B8E3E';   // pale rim highlight
const CAP_TINT           = '#1F2812';   // dark olive flip-cap
const LIQUID_TINT        = '#3A4A18';   // subtle inner liquid (barely visible)

// ---------------------------------------------------------------------------
// LOD 0 — coarse wireframe blueprint
// ---------------------------------------------------------------------------

const BottleSkeleton = ({ opacity }: VariantProps) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshBasicMaterial | null>(null);

  // 12 radial segments — visibly faceted, the "draftsman's first pass" look.
  const geom = useMemo(
    () => new THREE.LatheGeometry([...BOTTLE_PROFILE_VECTORS], 12),
    [],
  );
  useEffect(() => {
    const mat = matRef.current;
    return () => { geom.dispose(); mat?.dispose(); };
  }, [geom]);

  useFrame((_s, delta) => {
    if (meshRef.current) meshRef.current.rotation.y += 0.25 * delta;
    if (matRef.current) matRef.current.opacity = opacity;
  });

  return (
    <mesh ref={meshRef} geometry={geom}>
      <meshBasicMaterial
        ref={matRef}
        wireframe
        color={BOTTLE_RIM}
        transparent
        opacity={opacity}
      />
    </mesh>
  );
};

// ---------------------------------------------------------------------------
// LOD 1 — fine wireframe blueprint
// ---------------------------------------------------------------------------

const BottleFineBlueprint = ({ opacity }: VariantProps) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshBasicMaterial | null>(null);

  // Dense wireframe — same silhouette, 64 segments instead of 12.
  const geom = useMemo(
    () => new THREE.LatheGeometry([...BOTTLE_PROFILE_VECTORS], 64),
    [],
  );
  useEffect(() => {
    const mat = matRef.current;
    return () => { geom.dispose(); mat?.dispose(); };
  }, [geom]);

  useFrame((_s, delta) => {
    if (meshRef.current) meshRef.current.rotation.y += 0.3 * delta;
    if (matRef.current) matRef.current.opacity = opacity;
  });

  return (
    <mesh ref={meshRef} geometry={geom}>
      <meshBasicMaterial
        ref={matRef}
        wireframe
        color={BOTTLE_RIM}
        transparent
        opacity={opacity}
      />
    </mesh>
  );
};

// ---------------------------------------------------------------------------
// LOD 2 — flat amber mid texture
// ---------------------------------------------------------------------------

const BottleMid = ({ opacity }: VariantProps) => {
  const groupRef = useRef<THREE.Group>(null);
  const matRef = useRef<THREE.MeshStandardMaterial | null>(null);

  // Same tessellation as LOD 1 so the crossfade reads as "outline becomes
  // surface" rather than two different objects swapping.
  const geom = useMemo(
    () => new THREE.LatheGeometry([...BOTTLE_PROFILE_VECTORS], 64),
    [],
  );
  useEffect(() => {
    const mat = matRef.current;
    return () => { geom.dispose(); mat?.dispose(); };
  }, [geom]);

  useFrame((_s, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += 0.4 * delta;
    if (matRef.current) matRef.current.opacity = opacity;
  });

  return (
    <group ref={groupRef}>
      <mesh geometry={geom}>
        <meshStandardMaterial
          ref={matRef}
          color={BOTTLE_TINT}
          roughness={0.55}
          metalness={0.05}
          transparent
          opacity={opacity}
        />
      </mesh>
    </group>
  );
};

// ---------------------------------------------------------------------------
// LOD 3 — AAA hero: olive plastic body + dark flip-cap + "Team JMJ" decal
// ---------------------------------------------------------------------------

const BottleHero = ({ opacity }: VariantProps) => {
  const groupRef = useRef<THREE.Group>(null);
  const bodyMatRef = useRef<THREE.MeshPhysicalMaterial | null>(null);
  const liquidMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const capMatRef = useRef<THREE.MeshPhysicalMaterial | null>(null);
  const labelMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const lightRef = useRef<THREE.PointLight>(null);

  // High-tessellation sub-meshes — body, liquid, cap each get their own
  // material so the bottle reads as three coherent parts at hero quality.
  const bodyGeom   = useMemo(() => new THREE.LatheGeometry([...BODY_PROFILE_VECTORS],   192), []);
  const capGeom    = useMemo(() => new THREE.LatheGeometry([...CAP_PROFILE_VECTORS],    192), []);
  const liquidGeom = useMemo(() => new THREE.LatheGeometry([...LIQUID_PROFILE_VECTORS], 96),  []);

  // Label cylinder sits just outside the body radius (0.725 < 0.72 body max
  // + a hair of breathing room) and wraps the upper half of the body so the
  // "Team JMJ" wordmark reads at eye level — the same spot it occupies on
  // the Spline asset.
  const labelGeom = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.725, 0.725, 1.4, 96, 1, true);
    g.translate(0, -0.25, 0);
    return g;
  }, []);

  const { colorMap, alphaMap } = useMemo(buildLabelTextures, []);

  useEffect(() => {
    const bodyMat = bodyMatRef.current;
    const liquidMat = liquidMatRef.current;
    const capMat = capMatRef.current;
    const labelMat = labelMatRef.current;
    return () => {
      bodyGeom.dispose();
      capGeom.dispose();
      liquidGeom.dispose();
      labelGeom.dispose();
      colorMap.dispose();
      alphaMap.dispose();
      bodyMat?.dispose();
      liquidMat?.dispose();
      capMat?.dispose();
      labelMat?.dispose();
    };
  }, [bodyGeom, capGeom, liquidGeom, labelGeom, colorMap, alphaMap]);

  const elapsedRef = useRef(0);
  useFrame((_s, delta) => {
    elapsedRef.current += delta;

    if (groupRef.current) groupRef.current.rotation.y += 0.45 * delta;

    // Subtle "lights coming on" breath, like LatticeHero.
    const breath = 0.5 + 0.5 * Math.sin(elapsedRef.current * 1.5);

    if (bodyMatRef.current) {
      bodyMatRef.current.opacity = opacity;
    }
    if (liquidMatRef.current) {
      liquidMatRef.current.opacity = 0.85 * opacity;
    }
    if (capMatRef.current) {
      capMatRef.current.opacity = opacity;
    }
    if (labelMatRef.current) {
      labelMatRef.current.opacity = opacity;
    }
    if (lightRef.current) {
      // "Lighting loads last" — point light intensity ramps with hero opacity
      // and breathes gently once present.
      lightRef.current.intensity = (0.7 + 0.5 * breath) * opacity;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Olive plastic body — clearcoat for the glossy sports-bottle feel,
          no transmission (squeeze bottles are opaque). envMapIntensity is
          the hook that lets <Environment /> in the parent canvas paint
          subtle reflections onto the clearcoat — that's what sells the
          jump from LOD 2 (flat) to LOD 3 (lit). */}
      <mesh geometry={bodyGeom} castShadow>
        <meshPhysicalMaterial
          ref={bodyMatRef}
          color={BOTTLE_TINT}
          roughness={0.34}
          metalness={0.08}
          clearcoat={0.85}
          clearcoatRoughness={0.18}
          sheen={0.35}
          sheenColor={BOTTLE_RIM}
          envMapIntensity={0.85}
          transparent
          opacity={opacity}
        />
      </mesh>

      {/* Subtle interior volume — barely visible through the opaque body but
          gives a touch of depth at silhouette edges. */}
      <mesh geometry={liquidGeom}>
        <meshStandardMaterial
          ref={liquidMatRef}
          color={LIQUID_TINT}
          roughness={0.8}
          metalness={0.0}
          transparent
          opacity={0.85 * opacity}
        />
      </mesh>

      {/* Dark flip-top cap — distinct material from the plastic body so the
          bottle reads as a real two-part sports bottle. */}
      <mesh geometry={capGeom} castShadow>
        <meshPhysicalMaterial
          ref={capMatRef}
          color={CAP_TINT}
          roughness={0.38}
          metalness={0.2}
          clearcoat={0.55}
          clearcoatRoughness={0.28}
          envMapIntensity={0.75}
          transparent
          opacity={opacity}
        />
      </mesh>

      {/* "Team JMJ" decal wrapping the front half of the body. */}
      <mesh geometry={labelGeom}>
        <meshStandardMaterial
          ref={labelMatRef}
          map={colorMap}
          alphaMap={alphaMap}
          roughness={0.55}
          metalness={0.0}
          transparent
          opacity={opacity}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Warm rim light — scales with hero opacity so the moment it appears
          really reads as studio lighting coming online. */}
      <pointLight
        ref={lightRef}
        color="#FFE6A8"
        intensity={0}
        distance={6.5}
        decay={1.6}
        position={[1.6, 1.0, 1.4]}
      />
    </group>
  );
};

// ---------------------------------------------------------------------------
// BottleAsset — root component
// ---------------------------------------------------------------------------

type TierMap<V> = { 0: V; 1: V; 2: V; 3: V };
const TIERS = [0, 1, 2, 3] as const;

export const BottleAsset = ({
  id,
  forceLOD,
  position = [0, 0, 0],
}: BottleAssetProps): JSX.Element => {
  const reg = useContinuumStore(selectAsset(id));
  const effectiveLOD: LODTier =
    forceLOD ?? (Math.min(reg?.maxLOD ?? 3, 3) as LODTier);

  useEffect(() => {
    const store = useContinuumStore.getState();
    store.registerAsset(id);
    store.setStatus(id, 'ready');
    return () => {
      useContinuumStore.getState().unregisterAsset(id);
    };
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

  const [opacities, setOpacities] = useState<TierMap<number>>(
    () => ({ ...opacityRef.current }),
  );

  const [mounted, setMounted] = useState<TierMap<boolean>>(() => ({
    0: effectiveLOD === 0,
    1: effectiveLOD === 1,
    2: effectiveLOD === 2,
    3: effectiveLOD === 3,
  }));

  useEffect(() => {
    setMounted((prev) => ({ ...prev, [effectiveLOD]: true }));
  }, [effectiveLOD]);

  useFrame(() => {
    const LERP = 0.18;
    let needsRenderSync = false;
    for (const tier of TIERS) {
      const target = tier === effectiveLOD ? 1 : 0;
      const current = opacityRef.current[tier];
      const next = current + (target - current) * LERP;
      opacityRef.current[tier] = next;
      if ((current >= 0.01 && next < 0.01) || (current < 0.01 && next >= 0.01)) {
        needsRenderSync = true;
      }
    }
    if (needsRenderSync) {
      const snap = { ...opacityRef.current };
      setOpacities(snap);
      setMounted({
        0: snap[0] >= 0.01,
        1: snap[1] >= 0.01,
        2: snap[2] >= 0.01,
        3: snap[3] >= 0.01,
      });
    }
  });

  return (
    <group position={position}>
      {mounted[0] && <BottleSkeleton      opacity={opacities[0]} />}
      {mounted[1] && <BottleFineBlueprint opacity={opacities[1]} />}
      {mounted[2] && <BottleMid           opacity={opacities[2]} />}
      {mounted[3] && <BottleHero          opacity={opacities[3]} />}
    </group>
  );
};

export default BottleAsset;
