/**
 * <TorusKnotAsset /> — second procedural demonstrator for the 3-LOD engine.
 *
 * Shape family: a twisted pretzel torus-knot (p=2, q=3). Chosen because the
 * silhouette is instantly recognizable even in the wireframe proxy, so the
 * Ghost-Mesh → Hero transition reads cleanly to the eye.
 *
 * Silhouette stability: all four tiers share the SAME pretzel torus-knot
 * shape — only tessellation and material change. The user experiences a
 * single continuous form that picks up texture detail rather than a sequence
 * of different shapes morphing into each other.
 *
 *   LOD 0 — KnotSkeleton        TorusKnotGeometry(0.85, 0.28, 48, 4)    coarse wireframe
 *   LOD 1 — KnotFineBlueprint   TorusKnotGeometry(0.85, 0.28, 160, 16)  fine wireframe
 *   LOD 2 — KnotMid             TorusKnotGeometry(0.85, 0.28, 160, 16)  flat crust color
 *   LOD 3 — KnotHero            TorusKnotGeometry(0.85, 0.28, 256, 32)  full PBR + salt
 *
 * Textures are generated procedurally on an HTMLCanvasElement at mount time —
 * zero network bytes, zero image imports. The result is a believable
 * pretzel-crust finish with crumb bumps and sugar flecks.
 *
 * Crossfade, mount-gating, and store registration mirror <LatticeAsset /> so
 * the Continuum engine behaves identically whichever asset is active. That's
 * the whole point — drop-in interchangeable.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useContinuumStore, selectAsset } from '../store/useContinuumStore';
import type { LODTier } from '../store/types';

// ---------------------------------------------------------------------------
// Shared knot geometry parameters — declared at module top so every LOD
// component can reference them without TDZ risk. Change these once and the
// skeleton / mid / hero all scale together.
// ---------------------------------------------------------------------------

/** Major radius of the knot's center curve. */
const KNOT_R = 0.85;
/** Tube (pretzel-dough) radius around the center curve. */
const KNOT_TUBE = 0.28;
/** Times the curve wraps around the torus axis. */
const KNOT_P = 2;
/** Times the curve wraps through the hole. */
const KNOT_Q = 3;

// ---------------------------------------------------------------------------
// Procedural pretzel-crust textures
// ---------------------------------------------------------------------------

/**
 * Build three canvas-backed textures that together fake a baked pretzel crust:
 *
 *   1. colorMap     — warm amber-brown base, with toasted darker spots and
 *                     occasional sugar-glint highlights.
 *   2. bumpMap      — grayscale height field of crumbs/pits. MeshPhysicalMaterial
 *                     computes normals from this per-fragment via finite diff.
 *   3. roughnessMap — spatially varied roughness so highlights skip across the
 *                     crust instead of gliding uniformly.
 *
 * All three share the same UV layout (RepeatWrapping × 4 around the tube), so
 * they align pixel-for-pixel on the knot surface.
 */
const buildPretzelTextures = (): {
  colorMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} => {
  const SIZE = 512;

  // --- 1. Color map: pretzel brown with toasted speckles -------------------
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = SIZE;
  colorCanvas.height = SIZE;
  const cctx = colorCanvas.getContext('2d')!;
  // Base radial gradient — slightly darker at edges than center for visual depth.
  const grad = cctx.createRadialGradient(
    SIZE / 2, SIZE / 2, 0,
    SIZE / 2, SIZE / 2, SIZE * 0.7,
  );
  grad.addColorStop(0, '#A57043'); // warm amber crust
  grad.addColorStop(0.7, '#6F4520'); // deeper bake
  grad.addColorStop(1, '#4A2D15'); // burnt edge
  cctx.fillStyle = grad;
  cctx.fillRect(0, 0, SIZE, SIZE);
  // Toasted dark flecks — many small dark dots at random positions.
  for (let i = 0; i < 9000; i++) {
    const x = Math.random() * SIZE;
    const y = Math.random() * SIZE;
    const r = 0.4 + Math.random() * 2.6;
    const a = 0.1 + Math.random() * 0.35;
    cctx.fillStyle = `rgba(35, 18, 6, ${a})`;
    cctx.beginPath();
    cctx.arc(x, y, r, 0, Math.PI * 2);
    cctx.fill();
  }
  // Sugar-glint highlights — small warm-white sparkles.
  for (let i = 0; i < 700; i++) {
    const x = Math.random() * SIZE;
    const y = Math.random() * SIZE;
    const r = 0.3 + Math.random() * 1.4;
    const a = 0.2 + Math.random() * 0.45;
    cctx.fillStyle = `rgba(255, 220, 160, ${a})`;
    cctx.beginPath();
    cctx.arc(x, y, r, 0, Math.PI * 2);
    cctx.fill();
  }
  const colorMap = new THREE.CanvasTexture(colorCanvas);
  colorMap.wrapS = colorMap.wrapT = THREE.RepeatWrapping;
  colorMap.repeat.set(4, 1);
  colorMap.anisotropy = 8;
  colorMap.colorSpace = THREE.SRGBColorSpace;

  // --- 2. Bump map: grayscale crumbs ---------------------------------------
  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = SIZE;
  bumpCanvas.height = SIZE;
  const bctx = bumpCanvas.getContext('2d')!;
  bctx.fillStyle = '#7A7A7A';
  bctx.fillRect(0, 0, SIZE, SIZE);
  // Soft large swells — macro terrain.
  for (let i = 0; i < 400; i++) {
    const x = Math.random() * SIZE;
    const y = Math.random() * SIZE;
    const r = 10 + Math.random() * 30;
    const v = 90 + Math.floor(Math.random() * 140);
    const rad = bctx.createRadialGradient(x, y, 0, x, y, r);
    rad.addColorStop(0, `rgba(${v},${v},${v},0.55)`);
    rad.addColorStop(1, `rgba(${v},${v},${v},0)`);
    bctx.fillStyle = rad;
    bctx.beginPath();
    bctx.arc(x, y, r, 0, Math.PI * 2);
    bctx.fill();
  }
  // Fine crumb specks.
  for (let i = 0; i < 4500; i++) {
    const x = Math.random() * SIZE;
    const y = Math.random() * SIZE;
    const r = 0.8 + Math.random() * 3.2;
    const v = 50 + Math.floor(Math.random() * 200);
    bctx.fillStyle = `rgba(${v},${v},${v},${0.3 + Math.random() * 0.4})`;
    bctx.beginPath();
    bctx.arc(x, y, r, 0, Math.PI * 2);
    bctx.fill();
  }
  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(4, 1);
  bumpMap.anisotropy = 8;

  // --- 3. Roughness map: varied matte/semi-matte patches -------------------
  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = SIZE;
  roughCanvas.height = SIZE;
  const rctx = roughCanvas.getContext('2d')!;
  rctx.fillStyle = '#CFCFCF'; // baseline rough ~0.8
  rctx.fillRect(0, 0, SIZE, SIZE);
  for (let i = 0; i < 2200; i++) {
    const x = Math.random() * SIZE;
    const y = Math.random() * SIZE;
    const r = 2 + Math.random() * 7;
    // Some areas slightly shinier (lower roughness), most matte.
    const v = Math.random() > 0.75
      ? 160 + Math.floor(Math.random() * 40) // shinier
      : 210 + Math.floor(Math.random() * 40); // matter
    rctx.fillStyle = `rgba(${v},${v},${v},0.5)`;
    rctx.beginPath();
    rctx.arc(x, y, r, 0, Math.PI * 2);
    rctx.fill();
  }
  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(4, 1);
  roughnessMap.anisotropy = 8;

  return { colorMap, bumpMap, roughnessMap };
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface TorusKnotAssetProps {
  /** Stable id — keys the hydration registry. */
  readonly id: string;
  /** Manually pin the active LOD tier (bypasses maxLOD ceiling). */
  readonly forceLOD?: LODTier;
  /** World-space position. Defaults to [0, 0, 0]. */
  readonly position?: [number, number, number];
}

// ---------------------------------------------------------------------------
// LOD 0 — KnotSkeleton  (proxy / "Ghost mesh")
// ---------------------------------------------------------------------------

interface SkeletonProps {
  readonly opacity: number;
}

const KnotSkeleton = ({ opacity }: SkeletonProps) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshBasicMaterial | null>(null);

  // Coarse pretzel wireframe — silhouette legible, facets countable.
  const skeletonGeom = useMemo(
    () => new THREE.TorusKnotGeometry(KNOT_R, KNOT_TUBE, 48, 4),
    [],
  );

  useEffect(() => {
    const mat = matRef.current;
    return () => {
      skeletonGeom.dispose();
      mat?.dispose();
    };
  }, [skeletonGeom]);

  useFrame((_state, delta) => {
    if (meshRef.current) meshRef.current.rotation.y += 0.22 * delta;
    if (matRef.current) matRef.current.opacity = opacity;
  });

  return (
    <mesh ref={meshRef} geometry={skeletonGeom}>
      <meshBasicMaterial
        ref={matRef}
        wireframe
        color="#E8A060"
        transparent
        opacity={opacity}
      />
    </mesh>
  );
};

// ---------------------------------------------------------------------------
// LOD 1 — KnotFineBlueprint (denser wireframe)
// ---------------------------------------------------------------------------

const KnotFineBlueprint = ({ opacity }: SkeletonProps) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshBasicMaterial | null>(null);

  // Dense wireframe — same silhouette, much finer grid.
  const geom = useMemo(
    () => new THREE.TorusKnotGeometry(KNOT_R, KNOT_TUBE, 160, 16),
    [],
  );

  useEffect(() => {
    const mat = matRef.current;
    return () => { geom.dispose(); mat?.dispose(); };
  }, [geom]);

  useFrame((_state, delta) => {
    if (meshRef.current) meshRef.current.rotation.y += 0.3 * delta;
    if (matRef.current) matRef.current.opacity = opacity;
  });

  return (
    <mesh ref={meshRef} geometry={geom}>
      <meshBasicMaterial
        ref={matRef}
        wireframe
        color="#F2B07A"
        transparent
        opacity={opacity}
      />
    </mesh>
  );
};

// ---------------------------------------------------------------------------
// LOD 2 — KnotMid (flat crust color, same tessellation as fine blueprint)
// ---------------------------------------------------------------------------

interface MidProps {
  readonly opacity: number;
}

const KnotMid = ({ opacity }: MidProps) => {
  const groupRef = useRef<THREE.Group>(null);
  const matRef = useRef<THREE.MeshStandardMaterial | null>(null);

  // Same tessellation as the fine-blueprint wireframe so the crossfade
  // between LOD 1 and LOD 2 reads as "the outline is now a surface".
  const knotGeom = useMemo(
    () => new THREE.TorusKnotGeometry(KNOT_R, KNOT_TUBE, 160, 16),
    [],
  );

  useEffect(() => {
    const mat = matRef.current;
    return () => {
      knotGeom.dispose();
      mat?.dispose();
    };
  }, [knotGeom]);

  // Mid cadence — 0.45 rad/sec on Y.
  useFrame((_state, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += 0.45 * delta;
    if (matRef.current) matRef.current.opacity = opacity;
  });

  return (
    <group ref={groupRef}>
      <mesh geometry={knotGeom}>
        {/* Flat low-res "crust" — same warm-brown palette as the hero's
            color map, but just a uniform color so the eye reads "the surface
            is here, the texture pack is loading". */}
        <meshStandardMaterial
          ref={matRef}
          color="#6F4520"
          roughness={0.85}
          metalness={0.05}
          transparent
          opacity={opacity}
        />
      </mesh>
    </group>
  );
};

// ---------------------------------------------------------------------------
// LOD 2 — KnotHero
// ---------------------------------------------------------------------------

interface HeroProps {
  readonly opacity: number;
}

/**
 * Count of salt crystals clinging to the pretzel surface. Small enough to
 * stay cheap, large enough to read as "salted" from any camera angle.
 */
const SALT_COUNT = 56;

/**
 * Sample a point on the torus knot curve at parameter u and offset it by
 * `surfaceOffset` along an approximate surface normal. Returns a point on
 * (or just above) the knot's physical surface — good enough for salt grains
 * without computing a full Frenet frame.
 */
const sampleKnotSurface = (
  u: number,
  angle: number,
  surfaceOffset: number,
): [number, number, number] => {
  const cu = Math.cos(KNOT_P * u);
  const su = Math.sin(KNOT_P * u);
  const cq = Math.cos(KNOT_Q * u);
  const sq = Math.sin(KNOT_Q * u);
  const cx = (KNOT_R + KNOT_TUBE * cq) * cu;
  const cy = (KNOT_R + KNOT_TUBE * cq) * su;
  const cz = KNOT_TUBE * sq;
  // Approx. surface normal: combine a radial direction (away from centerline)
  // with a vertical component. Not mathematically perfect — the goal is
  // visual plausibility, not analytic correctness.
  const nr = Math.cos(angle);
  const nz = Math.sin(angle);
  const radialX = cu * nr;
  const radialY = su * nr;
  return [cx + radialX * surfaceOffset, cy + radialY * surfaceOffset, cz + nz * surfaceOffset];
};

const KnotHero = ({ opacity }: HeroProps) => {
  const spinRef = useRef<THREE.Group>(null); // rotates knot + salt together
  const matRef = useRef<THREE.MeshPhysicalMaterial | null>(null);
  const saltMatRef = useRef<THREE.MeshStandardMaterial | null>(null);

  // High-tessellation knot — 256 × 32 = 8192 vertices, carries bump-map
  // detail cleanly without visible facet seams.
  const heroGeom = useMemo(
    () => new THREE.TorusKnotGeometry(KNOT_R, KNOT_TUBE, 256, 32),
    [],
  );

  // Shared salt-crystal geometry — tiny cube, looks grainy.
  const saltGeom = useMemo(
    () => new THREE.BoxGeometry(0.028, 0.028, 0.028),
    [],
  );

  // Procedural pretzel-crust textures — built once on mount.
  const { colorMap, bumpMap, roughnessMap } = useMemo(buildPretzelTextures, []);

  // Salt crystal positions — clustered on top of the knot surface, with a
  // bias toward the upper half of the torus curve (gravity-ish placement).
  const saltPositions = useMemo<readonly (readonly [number, number, number])[]>(() => {
    const out: [number, number, number][] = [];
    for (let i = 0; i < SALT_COUNT; i++) {
      // Deterministic-ish scatter: stride along u by the golden angle.
      const u = ((i * 2.399963229) % (Math.PI * 2)) + (Math.random() - 0.5) * 0.12;
      // Angle around the tube — bias toward the top (angle ≈ π/2).
      const angle = (Math.PI / 2) + (Math.random() - 0.5) * Math.PI * 1.6;
      // Sit just outside the tube surface (tube radius + small lift).
      const lift = KNOT_TUBE + 0.005;
      out.push(sampleKnotSurface(u, angle, lift));
    }
    return out;
  }, []);

  useEffect(() => {
    const mat = matRef.current;
    const salt = saltMatRef.current;
    return () => {
      heroGeom.dispose();
      saltGeom.dispose();
      colorMap.dispose();
      bumpMap.dispose();
      roughnessMap.dispose();
      mat?.dispose();
      salt?.dispose();
    };
  }, [heroGeom, saltGeom, colorMap, bumpMap, roughnessMap]);

  useFrame((_state, delta) => {
    // Rotate knot + salt crystals together so the salt stays stuck to the
    // pretzel surface instead of floating off as the knot spins.
    if (spinRef.current) {
      spinRef.current.rotation.y += 0.6 * delta;
      spinRef.current.rotation.x += 0.12 * delta;
    }
    if (matRef.current) matRef.current.opacity = opacity;
    if (saltMatRef.current) saltMatRef.current.opacity = opacity;
  });

  return (
    <group ref={spinRef}>
      {/* Primary hero pretzel — baked crust with bump + roughness maps. */}
      <mesh geometry={heroGeom}>
        <meshPhysicalMaterial
          ref={matRef}
          map={colorMap}
          bumpMap={bumpMap}
          bumpScale={0.08}
          roughnessMap={roughnessMap}
          roughness={0.85}
          metalness={0.02}
          clearcoat={0.22}
          clearcoatRoughness={0.55}
          sheen={0.35}
          sheenColor="#3A1F0A"
          sheenRoughness={0.9}
          transparent
          opacity={opacity}
        />
      </mesh>

      {/* Salt crystals — siblings of the knot mesh inside the spin group, so
          they co-rotate and stay glued to the surface. One shared geometry,
          many meshes, first-mesh material ref for opacity animation. */}
      {saltPositions.map((pos, i) => (
        <mesh
          key={i}
          position={pos as [number, number, number]}
          geometry={saltGeom}
          rotation={[
            (i * 0.37) % Math.PI,
            (i * 0.91) % Math.PI,
            (i * 1.23) % Math.PI,
          ]}
        >
          {i === 0 ? (
            <meshStandardMaterial
              ref={saltMatRef}
              color="#F4EFE6"
              emissive="#FFFFFF"
              emissiveIntensity={0.08}
              roughness={0.35}
              metalness={0.05}
              transparent
              opacity={opacity}
            />
          ) : (
            <meshStandardMaterial
              color="#F4EFE6"
              emissive="#FFFFFF"
              emissiveIntensity={0.08}
              roughness={0.35}
              metalness={0.05}
              transparent
              opacity={opacity}
            />
          )}
        </mesh>
      ))}
    </group>
  );
};

// ---------------------------------------------------------------------------
// TorusKnotAsset — root component (identical lifecycle to LatticeAsset)
// ---------------------------------------------------------------------------

type TierMap<V> = { 0: V; 1: V; 2: V; 3: V };
const TIERS = [0, 1, 2, 3] as const;

export const TorusKnotAsset = ({
  id,
  forceLOD,
  position = [0, 0, 0],
}: TorusKnotAssetProps): JSX.Element => {
  const reg = useContinuumStore(selectAsset(id));

  const effectiveLOD: LODTier =
    forceLOD ?? ((Math.min(reg?.maxLOD ?? 3, 3) as LODTier));

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
    setMounted((prev) => ({
      ...prev,
      [effectiveLOD]: true,
    }));
  }, [effectiveLOD]);

  useFrame(() => {
    const LERP_RATE = 0.18;
    let needsRenderSync = false;

    for (const tier of TIERS) {
      const target = tier === effectiveLOD ? 1 : 0;
      const current = opacityRef.current[tier];
      const next = current + (target - current) * LERP_RATE;
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
      {mounted[0] && <KnotSkeleton opacity={opacities[0]} />}
      {mounted[1] && <KnotFineBlueprint opacity={opacities[1]} />}
      {mounted[2] && <KnotMid opacity={opacities[2]} />}
      {mounted[3] && <KnotHero opacity={opacities[3]} />}
    </group>
  );
};
