/**
 * <VariableTierMeshHero /> — 3D counterpart to VariableTierImageHero.
 *
 * Given a catalog entry, plays the N-tier hydration sequence against an R3F
 * scene whose level of polish ramps tier-by-tier. This is NOT just geometry
 * subdivision — that only gets you a polygonal ball. A real asset pipeline
 * streams more than topology, so this component simulates the full arc:
 *
 *   LOD 0 · wireframe      (20 tris, cage only)
 *   LOD 1 · wireframe      (80 tris, denser cage)
 *   LOD 2 · flat-shaded    (320 tris, solid matte)
 *   LOD 3 · smooth-shaded  (1,280 tris, skeleton mirror silhouette)
 *   LOD 4 · low textures   (5,120 tris, blurry tan albedo)
 *   LOD 5 · high textures  (20,480 tris, leather grain + normal map)
 *   LOD 6 · reflections    (same tris, env map + clearcoat tuned)
 *   LOD 7 · decals         (same tris, baseball seams composited in)
 *
 * The component always renders 8 tiers of visual polish, independent of the
 * catalog entry's tierCount — the catalog just anchors the identity + timing
 * envelope. In production the ingest worker would emit lod0.glb, lod0.ktx2,
 * lod1.ktx2, … and this component would consume those URLs instead of
 * procedural canvas textures. The render contract — tier cadence, skeleton
 * silhouette parity, hydration-store reporting — stays identical either way.
 *
 * Pairs with VariableTierImageHero + SweepRevealHero on /ingest so the page
 * shows the same catalog row driving image + mesh paths at once.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import * as THREE from 'three';

import type { CatalogEntry } from '../catalog/types';
import { timelineFor, totalDurationMs } from '../catalog/timeline';
import { useContinuumStore } from '../store/useContinuumStore';
import { useAssetPriority } from '../hooks/useAssetPriority';

// ---------------------------------------------------------------------------
// Tier axis
// ---------------------------------------------------------------------------
// The mesh sim always runs the full 8-tier polish arc. The catalog's tierCount
// governs the *timing envelope* (via timelineFor), but the visual progression
// here is always the same 8 stations because below 8 tiers you skip texture
// or decal beats and the ending doesn't read as polished.

export const MESH_TIER_COUNT = 8 as const;
export type MeshTier = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

// Label applied in the HUD per tier — pedagogy, not just geometry stats.
const TIER_BADGE: Record<MeshTier, string> = {
  0: 'wireframe',
  1: 'wireframe',
  2: 'flat-shaded',
  3: 'matte',
  4: 'low textures',
  5: 'high textures',
  6: 'reflections',
  7: 'decals',
};

const TIER_TRIANGLES: Record<MeshTier, number> = {
  0: 20,
  1: 80,
  2: 320,
  3: 1280,
  4: 5120,
  5: 20480,
  6: 20480,
  7: 20480,
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface VariableTierMeshHeroProps {
  /** Catalog entry produced by the ingest pipeline. */
  readonly entry: CatalogEntry;
  /** Stable id used to register with the hydration store. */
  readonly registryId?: string;
  /** Aspect ratio of the container — defaults to 16/9. */
  readonly aspectRatio?: string;
  /** Optional style override for the container. */
  readonly style?: React.CSSProperties;
  /** Fires once every tier has been shown and the hero is stable. */
  readonly onHydrated?: () => void;
}

// ---------------------------------------------------------------------------
// Tier recipes — what each level of polish actually shows
// ---------------------------------------------------------------------------

interface TierRecipe {
  readonly tier: MeshTier;
  readonly icoDetail: number;          // icosahedron subdivision for cage+solid
  readonly wireframeOpacity: number;
  readonly solidOpacity: number;
  readonly solidFlatShading: boolean;
  readonly pbrOpacity: number;         // sphere-mapped PBR mesh
  readonly usePBRHiRes: boolean;
  readonly useNormal: boolean;
  readonly envIntensity: number;
  readonly clearcoat: number;
  readonly useStitches: boolean;
}

const recipeFor = (tier: MeshTier): TierRecipe => {
  switch (tier) {
    case 0:
      return {
        tier, icoDetail: 0,
        wireframeOpacity: 1, solidOpacity: 0, solidFlatShading: true,
        pbrOpacity: 0, usePBRHiRes: false, useNormal: false,
        envIntensity: 0, clearcoat: 0, useStitches: false,
      };
    case 1:
      return {
        tier, icoDetail: 1,
        wireframeOpacity: 1, solidOpacity: 0, solidFlatShading: true,
        pbrOpacity: 0, usePBRHiRes: false, useNormal: false,
        envIntensity: 0, clearcoat: 0, useStitches: false,
      };
    case 2:
      return {
        tier, icoDetail: 2,
        wireframeOpacity: 0.55, solidOpacity: 1, solidFlatShading: true,
        pbrOpacity: 0, usePBRHiRes: false, useNormal: false,
        envIntensity: 0, clearcoat: 0, useStitches: false,
      };
    case 3:
      return {
        tier, icoDetail: 3,
        wireframeOpacity: 0.12, solidOpacity: 1, solidFlatShading: false,
        pbrOpacity: 0, usePBRHiRes: false, useNormal: false,
        envIntensity: 0, clearcoat: 0, useStitches: false,
      };
    case 4:
      // Low-res albedo starts to land. The matte under-layer shows through
      // slightly so the transition doesn't pop.
      return {
        tier, icoDetail: 4,
        wireframeOpacity: 0, solidOpacity: 0.25, solidFlatShading: false,
        pbrOpacity: 1, usePBRHiRes: false, useNormal: false,
        envIntensity: 0, clearcoat: 0, useStitches: false,
      };
    case 5:
      // High-res albedo + normal map. Still matte — no reflections yet.
      return {
        tier, icoDetail: 5,
        wireframeOpacity: 0, solidOpacity: 0, solidFlatShading: false,
        pbrOpacity: 1, usePBRHiRes: true, useNormal: true,
        envIntensity: 0, clearcoat: 0, useStitches: false,
      };
    case 6:
      // Env map reflections + light clearcoat. Surface finally looks alive.
      return {
        tier, icoDetail: 5,
        wireframeOpacity: 0, solidOpacity: 0, solidFlatShading: false,
        pbrOpacity: 1, usePBRHiRes: true, useNormal: true,
        envIntensity: 0.85, clearcoat: 0.4, useStitches: false,
      };
    case 7:
      // Decals composited in — red baseball seams. Hero is done.
      return {
        tier, icoDetail: 5,
        wireframeOpacity: 0, solidOpacity: 0, solidFlatShading: false,
        pbrOpacity: 1, usePBRHiRes: true, useNormal: true,
        envIntensity: 1.05, clearcoat: 0.55, useStitches: true,
      };
  }
};

// ---------------------------------------------------------------------------
// Canvas textures — module-level cache so we don't redraw every mount
// ---------------------------------------------------------------------------

const TEX_CACHE: Map<string, THREE.CanvasTexture> = new Map();

const getOrMakeTexture = (
  key: string,
  build: () => HTMLCanvasElement,
): THREE.CanvasTexture => {
  const existing = TEX_CACHE.get(key);
  if (existing) return existing;
  const canvas = build();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 8;
  TEX_CACHE.set(key, tex);
  return tex;
};

const getOrMakeDataTexture = (
  key: string,
  build: () => HTMLCanvasElement,
): THREE.CanvasTexture => {
  const existing = TEX_CACHE.get(key);
  if (existing) return existing;
  const canvas = build();
  const tex = new THREE.CanvasTexture(canvas);
  // Data textures (normal/bump) must NOT be treated as sRGB.
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 8;
  TEX_CACHE.set(key, tex);
  return tex;
};

/**
 * Low-res leather albedo — deliberately blurry so the jump to hi-res reads
 * as an actual resolution improvement rather than a lighting change.
 */
const buildLeatherLowRes = (): HTMLCanvasElement => {
  const W = 128, H = 64;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  // Tan gradient — warmer at the equator, slightly cooler near the poles.
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0.0, '#B59063');
  grad.addColorStop(0.5, '#D7A86E');
  grad.addColorStop(1.0, '#A9835A');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  return c;
};

/**
 * High-res leather albedo. Tan base + many tiny scattered dots to suggest
 * leather grain. We keep the dot density light enough that the normal map
 * carries the weight of the material detail.
 */
const buildLeatherHiRes = (withStitches: boolean): HTMLCanvasElement => {
  const W = 1024, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;

  // Base gradient — same palette as low-res for continuity.
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0.0, '#B59063');
  grad.addColorStop(0.5, '#E0B378');
  grad.addColorStop(1.0, '#A9835A');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);

  // Leather pore dots — small, sparse, varied alpha so it reads as grain
  // rather than a speckle pattern.
  for (let i = 0; i < 6000; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const r = Math.random() * 0.9 + 0.3;
    const a = Math.random() * 0.35 + 0.05;
    g.fillStyle = `rgba(90, 60, 35, ${a})`;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  // Broad warm highlights to suggest soft sheen variation.
  for (let i = 0; i < 180; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const r = Math.random() * 28 + 12;
    const a = Math.random() * 0.07 + 0.02;
    const rad = g.createRadialGradient(x, y, 0, x, y, r);
    rad.addColorStop(0, `rgba(255, 230, 190, ${a})`);
    rad.addColorStop(1, 'rgba(255, 230, 190, 0)');
    g.fillStyle = rad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }

  if (withStitches) {
    drawBaseballStitches(g, W, H);
  }

  return c;
};

/**
 * Draw a figure-8-like seam pattern in equirectangular UV space with red
 * zigzag stitches. The curve is two interleaved sinusoids — a reasonable
 * stand-in for the mathematically exact baseball seam curve, and reads as
 * "baseball" at a glance when mapped onto a sphere.
 */
const drawBaseballStitches = (
  g: CanvasRenderingContext2D,
  W: number,
  H: number,
): void => {
  const amplitude = H * 0.28;
  const baseline = H * 0.5;
  const seamCount = 2;
  // Two phases, each offset by PI so the two arcs wrap the ball from
  // opposite sides.
  const phases = [0, Math.PI];

  // 1. Paint the shadow trench beneath the stitches — a slightly darker
  //    and wider curve, to give the seam a groove.
  for (const phase of phases) {
    g.strokeStyle = 'rgba(60, 30, 15, 0.55)';
    g.lineWidth = 10;
    g.lineCap = 'round';
    g.beginPath();
    for (let px = 0; px <= W; px += 2) {
      const u = px / W;
      const y = baseline + Math.sin(u * Math.PI * seamCount + phase) * amplitude;
      if (px === 0) g.moveTo(px, y);
      else g.lineTo(px, y);
    }
    g.stroke();
  }

  // 2. Paint the red stitch zigzags on top of each seam.
  //    Stitches are short, angled segments placed at regular UV intervals
  //    along the seam path. Alternate direction to give the classic "X"
  //    chevron look up close.
  for (const phase of phases) {
    const stitchSpacing = 18;
    const halfLen = 10;
    for (let px = 0; px <= W; px += stitchSpacing) {
      const u = px / W;
      const y = baseline + Math.sin(u * Math.PI * seamCount + phase) * amplitude;
      // Tangent direction at this point (seam slope).
      const slope =
        Math.cos(u * Math.PI * seamCount + phase) *
        amplitude * (Math.PI * seamCount) / W;
      // Normal direction is perpendicular to the tangent.
      const len = Math.hypot(1, slope) || 1;
      const nx = -slope / len;
      const ny = 1 / len;
      // Stitch endpoints offset along the normal on alternating sides.
      const side = (px / stitchSpacing) % 2 === 0 ? 1 : -1;
      const x0 = px - nx * halfLen * side;
      const y0 = y - ny * halfLen * side;
      const x1 = px + nx * halfLen * 0.25 * side;
      const y1 = y + ny * halfLen * 0.25 * side;
      g.strokeStyle = '#CC2B2B';
      g.lineWidth = 2.4;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();
    }
  }
};

/**
 * Bump/normal map — pure grayscale noise treated as a height field.
 * MeshStandardMaterial's `bumpMap` gives us surface relief cheaply without
 * baking a proper tangent-space normal.
 */
const buildLeatherBump = (): HTMLCanvasElement => {
  const W = 512, H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;

  // Start mid-gray (neutral bump).
  g.fillStyle = '#808080';
  g.fillRect(0, 0, W, H);

  // Many soft dots, both brighter and darker than mid-gray, to create the
  // pitted leather feel.
  const img = g.getImageData(0, 0, W, H);
  const data = img.data;
  for (let i = 0; i < data.length; i += 4) {
    const n = (Math.random() - 0.5) * 40;
    const v = Math.max(0, Math.min(255, 128 + n));
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
  }
  g.putImageData(img, 0, 0);

  // Overlay scattered dents (small darker blobs).
  for (let i = 0; i < 1200; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const r = Math.random() * 2.5 + 0.6;
    const rad = g.createRadialGradient(x, y, 0, x, y, r);
    rad.addColorStop(0, 'rgba(60, 60, 60, 0.6)');
    rad.addColorStop(1, 'rgba(60, 60, 60, 0)');
    g.fillStyle = rad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  return c;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const VariableTierMeshHero = ({
  entry,
  registryId,
  aspectRatio = '16 / 9',
  style,
  onHydrated,
}: VariableTierMeshHeroProps) => {
  const id = registryId ?? entry.id;
  // The mesh sim always runs the full 8-tier polish arc. We take the *max*
  // of the catalog's tier count and our own so the timing envelope still
  // respects the catalog's cadence guidance if it happens to specify more.
  const tierCount = Math.max(entry.tierCount, MESH_TIER_COUNT);
  const timeline = useMemo(() => timelineFor(tierCount), [tierCount]);
  const totalMs = useMemo(() => totalDurationMs(tierCount), [tierCount]);

  const [activeTier, setActiveTier] = useState<MeshTier>(0);
  const startedAtRef = useRef<number>(performance.now());
  const containerRef = useRef<HTMLDivElement | null>(null);
  useAssetPriority(id, containerRef);

  // -------------------------------------------------------------------
  // Register with the hydration store so the Inspector sees us.
  // -------------------------------------------------------------------
  useEffect(() => {
    const store = useContinuumStore.getState();
    store.registerAsset(id);
    store.setStatus(id, 'loading');
    startedAtRef.current = performance.now();
    return () => {
      useContinuumStore.getState().unregisterAsset(id);
    };
  }, [id]);

  // -------------------------------------------------------------------
  // Nudge R3F's ResizeObserver so re-mounts don't strand the Canvas.
  // -------------------------------------------------------------------
  useEffect(() => {
    const nudge = () => window.dispatchEvent(new Event('resize'));
    const t1 = window.setTimeout(nudge, 0);
    const t2 = window.setTimeout(nudge, 120);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  // -------------------------------------------------------------------
  // Tier timeline — bump activeTier on the Doherty schedule.
  // -------------------------------------------------------------------
  useEffect(() => {
    const timers = timeline.map(({ tier, atMs }) =>
      window.setTimeout(() => {
        const clamped = Math.min(tier, MESH_TIER_COUNT - 1) as MeshTier;
        setActiveTier(clamped);
        if (tier === tierCount - 1) {
          useContinuumStore.getState().setStatus(id, 'ready');
          onHydrated?.();
        }
      }, atMs),
    );
    return () => timers.forEach((h) => window.clearTimeout(h));
  }, [id, tierCount, timeline, onHydrated]);

  // -------------------------------------------------------------------
  // Progress engine — 0→1 over the total hydration duration.
  // -------------------------------------------------------------------
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const elapsed = performance.now() - startedAtRef.current;
      const t = Math.min(1, elapsed / Math.max(1, totalMs));
      useContinuumStore.getState().setLoadingProgress(id, t);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [id, totalMs]);

  const recipe = useMemo(() => recipeFor(activeTier), [activeTier]);

  return (
    <div
      ref={containerRef}
      data-continuum-hero={id}
      data-continuum-kind="mesh-sim"
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio,
        overflow: 'hidden',
        background:
          'radial-gradient(ellipse at 50% 40%, rgba(215,168,110,0.08), transparent 60%), #0A0806',
        ...style,
      }}
    >
      <Canvas
        camera={{ position: [0, 0, 4.5], fov: 36 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={0.35} />
        <directionalLight position={[2, 3, 4]} intensity={0.9} />
        <directionalLight position={[-3, -2, -1]} intensity={0.35} color="#D7A86E" />

        <SpinningTieredMesh recipe={recipe} />

        {/* Only pay the HDR cost on the reflection-hero tiers. */}
        {recipe.envIntensity > 0.05 && (
          <Environment preset="warehouse" environmentIntensity={recipe.envIntensity} />
        )}
      </Canvas>

      <TierReadout recipe={recipe} tierCount={MESH_TIER_COUNT} />
    </div>
  );
};

// ---------------------------------------------------------------------------
// SpinningTieredMesh — three stacked meshes whose opacities are cross-faded
// across the 8-tier polish arc.
//
//   1. Icosahedron wireframe (amber cage)       — dominates tiers 0-1
//   2. Icosahedron solid matte (cream)          — dominates tiers 2-3
//   3. Sphere PBR with textures + (opt) decals  — dominates tiers 4-7
//
// All three share a unit radius so the silhouette stays stable across
// transitions (Skeleton Mirror rule).
// ---------------------------------------------------------------------------

const SpinningTieredMesh = ({ recipe }: { readonly recipe: TierRecipe }) => {
  const groupRef = useRef<THREE.Group | null>(null);

  useFrame((_, dt) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y += dt * 0.35;
    groupRef.current.rotation.x = Math.sin(performance.now() * 0.0004) * 0.15;
  });

  // Lazily instantiate textures — cheap on first paint because low-res is
  // just a 128×64 gradient. Heavy ones (hi-res + stitches) only build when
  // the relevant tier first demands them.
  const albedoTex = useMemo(() => {
    if (recipe.useStitches) {
      return getOrMakeTexture('albedo-hires-stitches', () => buildLeatherHiRes(true));
    }
    if (recipe.usePBRHiRes) {
      return getOrMakeTexture('albedo-hires', () => buildLeatherHiRes(false));
    }
    return getOrMakeTexture('albedo-lowres', buildLeatherLowRes);
  }, [recipe.usePBRHiRes, recipe.useStitches]);

  const bumpTex = useMemo(
    () => (recipe.useNormal ? getOrMakeDataTexture('bump', buildLeatherBump) : null),
    [recipe.useNormal],
  );

  return (
    <group ref={groupRef}>
      {/* 1. Amber wireframe cage. */}
      {recipe.wireframeOpacity > 0.01 && (
        <mesh>
          <icosahedronGeometry args={[1.002, recipe.icoDetail]} />
          <meshBasicMaterial
            color="#D7A86E"
            wireframe
            transparent
            opacity={recipe.wireframeOpacity}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* 2. Matte skeleton-mirror solid (icosahedron). */}
      {recipe.solidOpacity > 0.01 && (
        <mesh>
          <icosahedronGeometry args={[1, recipe.icoDetail]} />
          <meshStandardMaterial
            color="#EEE3CD"
            metalness={0.05}
            roughness={0.85}
            flatShading={recipe.solidFlatShading}
            transparent
            opacity={recipe.solidOpacity}
          />
        </mesh>
      )}

      {/* 3. Textured PBR sphere — where the real polish lives. */}
      {recipe.pbrOpacity > 0.01 && (
        <mesh>
          <sphereGeometry args={[1, 96, 64]} />
          <meshPhysicalMaterial
            map={albedoTex}
            bumpMap={bumpTex ?? null}
            bumpScale={recipe.useNormal ? 0.05 : 0}
            metalness={0.06}
            roughness={recipe.clearcoat > 0 ? 0.42 : 0.68}
            clearcoat={recipe.clearcoat}
            clearcoatRoughness={0.35}
            envMapIntensity={recipe.envIntensity}
            transparent
            opacity={recipe.pbrOpacity}
          />
        </mesh>
      )}
    </group>
  );
};

// ---------------------------------------------------------------------------
// TierReadout — HUD showing current LOD, triangle count, and polish stage.
// ---------------------------------------------------------------------------

const TierReadout = ({
  recipe,
  tierCount,
}: {
  readonly recipe: TierRecipe;
  readonly tierCount: number;
}) => (
  <div
    aria-hidden
    style={{
      position: 'absolute',
      top: 12,
      left: 12,
      padding: '4px 8px',
      border: '1px solid rgba(215, 168, 110, 0.3)',
      background: 'rgba(10, 8, 6, 0.7)',
      color: '#EEE3CD',
      fontFamily:
        'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)',
      fontSize: 10,
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      borderRadius: 2,
      pointerEvents: 'none',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
    }}
  >
    <span>
      LOD{recipe.tier} / {tierCount - 1} ·{' '}
      {TIER_TRIANGLES[recipe.tier].toLocaleString()} tris
    </span>
    <span
      style={{
        color: '#D7A86E',
        borderLeft: '1px solid rgba(215, 168, 110, 0.3)',
        paddingLeft: 8,
      }}
    >
      {TIER_BADGE[recipe.tier]}
    </span>
  </div>
);

export default VariableTierMeshHero;
