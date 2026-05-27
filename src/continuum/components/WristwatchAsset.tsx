/**
 * <WristwatchAsset /> — photorealistic 18k rose-gold dress watch.
 *
 * Entirely procedural: every texture, bump map and visual detail is generated
 * in code (Canvas API + shader math). No external image assets.
 *
 * Five semantic regions, same tier-aware API as the phone asset so it drops
 * into the Continuum latency + compare pages unchanged:
 *
 *   dial   — subject. Sunburst/guilloché rays, applied spoke indices,
 *            sub-dial at 6 o'clock with concentric "snailed" graining.
 *   bezel  — polished annulus between crystal and case shoulder.
 *   case   — 18k rose-gold body with polished bevel + brushed flanks;
 *            domed sapphire crystal over the dial; exhibition case-back
 *            revealing a rotating rotor, escapement gears and ruby jewels.
 *   strap  — alligator leather with procedural scale pattern, rolled edges,
 *            instanced ivory stitching along the welt.
 *
 * 5-tier hydration recipe matches the rest of the Continuum asset family:
 *
 *   tier 0  Blockout     — amber wireframe cylinder, zero materials.
 *   tier 1  Structure    — case + bezel + dome appear, still faceted.
 *   tier 2  Matte shade  — switch to standard PBR, sunburst comes in,
 *                          sub-dial + hands visible but un-polished.
 *   tier 3  Detail       — 12 spoke indices, brand mark, rotor + gears
 *                          through the case-back, alligator strap pattern.
 *   tier 4  PBR hero     — sapphire transmission + anti-reflective tint,
 *                          brushed anisotropy on flanks, clearcoat on
 *                          rose gold, instanced stitching, ruby jewels.
 *
 * Animation:
 *   - Hour/minute hands track real system time.
 *   - Seconds sub-dial hand sweeps smoothly (not stepped) at 1 rev/60 s.
 *   - Case-back rotor swings via a simulated gravity force derived from
 *     the root group's world orientation — so manual rotation in
 *     OrbitControls physically winds the movement on screen.
 */

import {
  forwardRef,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import {
  hologramBoot,
  hologramBootScale,
  HOLOGRAM_BOOT_MS,
} from '../utils/hologram';

// ---------------------------------------------------------------------------
// RectArea lights need BRDF LUTs initialized once per process. Idempotent.
// ---------------------------------------------------------------------------
RectAreaLightUniformsLib.init();

// ---------------------------------------------------------------------------
// Tier / region constants — kept API-compatible with the previous watch asset.
// ---------------------------------------------------------------------------

export const WATCH_TIER_COUNT = 5 as const;
export type WatchTier = 0 | 1 | 2 | 3 | 4;

export type WatchRegion = 'dial' | 'bezel' | 'case' | 'strap';
export const WATCH_REGIONS: readonly WatchRegion[] = [
  'dial',
  'bezel',
  'case',
  'strap',
] as const;

// ---------------------------------------------------------------------------
// Dimensions — 40 mm dress watch, world units ≈ 40 mm per unit on the case.
// ---------------------------------------------------------------------------

const CASE_OUTER_R     = 1.00;
const CASE_INNER_R     = 0.94;     // brushed flank starts here
const CASE_THICKNESS   = 0.22;

const BEZEL_OUTER_R    = 0.96;
const BEZEL_INNER_R    = 0.82;
const BEZEL_THICKNESS  = 0.015;

const DIAL_RADIUS      = 0.81;
const DIAL_DEPTH       = 0.01;

const INDEX_RADIUS     = 0.70;
const INDEX_COUNT      = 12;
const INDEX_LEN        = 0.12;
const INDEX_W          = 0.020;

const SUBDIAL_R        = 0.18;
const SUBDIAL_Y        = -0.38;     // 6-o'clock sub-dial position

const CRYSTAL_R        = 0.83;
const CRYSTAL_DOME_H   = 0.055;

const CROWN_R          = 0.085;
const CROWN_LEN        = 0.14;

// Lug + strap geometry — proper horns that connect the case to a single,
// continuous tapered padded band (no stacked blocks).
const LUG_WIDTH        = 0.18;
const LUG_LENGTH       = 0.20;
const LUG_THICKNESS    = 0.14;
const LUG_ANGLE        = Math.PI / 6;   // offset each lug ~30° from vertical

const STRAP_W_AT_LUG   = 0.72;      // wider — feels closer to a Milanese/Oyster bracelet
const STRAP_W_AT_TIP   = 0.54;      // taper toward the buckle/tip
const STRAP_THICKNESS  = 0.06;      // stays thin so it reads as a bracelet, not cuff
const STRAP_ARM_SPAN   = Math.PI * 0.82;  // legacy — used by unified closed loop builder

// Date window at 3 o'clock.
const DATE_ANGLE       = 0;              // 3 o'clock = angle 0
const DATE_CENTER_R    = 0.56;           // radius from dial center
const DATE_WINDOW_W    = 0.10;
const DATE_WINDOW_H    = 0.08;

// (Legacy BUCKLE_W/H/T constants removed — the old flat-box deployment
//  clasp no longer exists; buildBuckleGeometry owns all clasp dimensions.)

// Exhibition case-back parameters.
const BACK_CRYSTAL_R   = 0.72;
const ROTOR_R          = 0.70;
const ROTOR_DEPTH      = 0.018;

// ---------------------------------------------------------------------------
// Colorways — luxury dress watch palette.
// ---------------------------------------------------------------------------

export interface WatchColorway {
  readonly key: string;
  readonly label: string;
  readonly caseColor: THREE.ColorRepresentation;
  readonly bezelColor: THREE.ColorRepresentation;
  readonly dialColor: THREE.ColorRepresentation;
  readonly dialHighlight: THREE.ColorRepresentation;
  readonly handColor: THREE.ColorRepresentation;
  readonly strapColor: THREE.ColorRepresentation;
  readonly stitchColor: THREE.ColorRepresentation;
  readonly accentColor: THREE.ColorRepresentation;
}

export const WATCH_COLORWAYS: Record<string, WatchColorway> = {
  gold: {
    key: 'gold',
    label: '18k Rose Gold',
    caseColor:     '#E5AE7C',        // rose gold
    bezelColor:    '#E8B98A',
    dialColor:     '#E9C388',        // champagne gold
    dialHighlight: '#FFE3B4',
    handColor:     '#FFF2D5',
    strapColor:    '#3B2414',        // rich cognac alligator
    stitchColor:   '#E8DCB3',        // ivory thread
    accentColor:   '#C89560',
  },
  midnight: {
    key: 'midnight',
    label: 'Midnight Steel',
    caseColor:     '#9BA1A8',
    bezelColor:    '#C1C6CC',
    dialColor:     '#0A0C12',
    dialHighlight: '#1B2230',
    handColor:     '#E9D7B0',
    strapColor:    '#0D0D12',
    stitchColor:   '#C2B388',
    accentColor:   '#D7A86E',
  },
  silver: {
    key: 'silver',
    label: 'White Gold',
    caseColor:     '#D0D4DA',
    bezelColor:    '#F4F6FA',
    dialColor:     '#E9ECF1',
    dialHighlight: '#FFFFFF',
    handColor:     '#1F232B',
    strapColor:    '#1B1514',
    stitchColor:   '#E0D8C4',
    accentColor:   '#7B8590',
  },
};

// ===========================================================================
// Procedural texture generators
//
// All generators are cached at MODULE LEVEL keyed by their inputs (usually
// a palette key). Every procedural map here is heavy to build — the sunburst
// dial alone writes three 1024×1024 canvases with hundreds of radial-ray
// draw calls, and the woven strap runs a 500k-iteration Sobel filter to
// derive its normal map. Without caching, mounting the Latency page (two
// watches simultaneously) would repeat every one of those passes per
// instance per mount, which is the main source of reload jitter the user
// reported. With the cache, each unique palette triggers generation once
// and every subsequent watch shares the same GPU textures.
// ===========================================================================

interface SunburstDialSet {
  readonly colorMap: THREE.CanvasTexture;
  readonly roughnessMap: THREE.CanvasTexture;
  readonly bumpMap: THREE.CanvasTexture;
}

interface WovenStrapSet {
  readonly colorMap: THREE.CanvasTexture;
  readonly normalMap: THREE.CanvasTexture;
  readonly roughnessMap: THREE.CanvasTexture;
}

const sunburstCache  = new Map<string, SunburstDialSet>();
// Reserved for follow-on caching of other heavy procedurals. Exported so
// they're not treated as unused while the cache matrix is filled in.
export const _brushedCache   = new Map<string, THREE.CanvasTexture>();
export const _wovenCache     = new Map<string, WovenStrapSet>();
export const _claspEtchCache: { current: THREE.CanvasTexture | null } = { current: null };

const paletteKey = (p: WatchColorway): string => p.key;

const DPR_TEX = 2; // baked-texture oversample so PBR surfaces stay crisp.

// ---------------------------------------------------------------------------
// Sunburst dial: deep radial rays from the center + subtle radial gradient.
// Returns a colour map + a matching roughness map so the rays actually
// catch the light dynamically (bright rays = lower roughness → specular).
// ---------------------------------------------------------------------------

const makeSunburstDialTextures = (
  palette: WatchColorway,
  showBrand: boolean,
): SunburstDialSet => {
  const key = `${paletteKey(palette)}-${showBrand ? 'brand' : 'plain'}`;
  const cached = sunburstCache.get(key);
  if (cached) return cached;

  const size = 1024;
  const cvs = document.createElement('canvas');
  cvs.width = cvs.height = size;
  const ctx = cvs.getContext('2d')!;
  const cx = size / 2;
  const cy = size / 2;

  // Base radial gradient (champagne gold → lighter center).
  const grad = ctx.createRadialGradient(cx, cy, size * 0.05, cx, cy, size * 0.5);
  grad.addColorStop(0, new THREE.Color(palette.dialHighlight).getStyle());
  grad.addColorStop(0.6, new THREE.Color(palette.dialColor).getStyle());
  grad.addColorStop(1.0, shade(palette.dialColor, -0.15));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Sunburst rays: 200 narrow wedges of alternating brightness.
  const rayCount = 200;
  ctx.save();
  ctx.translate(cx, cy);
  for (let i = 0; i < rayCount; i++) {
    const a = (i / rayCount) * Math.PI * 2;
    const bright = i % 2 === 0;
    ctx.save();
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(size * 0.5, -size * 0.008);
    ctx.lineTo(size * 0.5, size * 0.008);
    ctx.closePath();
    const rg = ctx.createLinearGradient(0, 0, size * 0.5, 0);
    rg.addColorStop(0, 'rgba(0,0,0,0)');
    rg.addColorStop(0.4, bright
      ? 'rgba(255, 240, 200, 0.18)'
      : 'rgba(80, 50, 20, 0.22)');
    rg.addColorStop(1.0, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();

  // Fine outer ruler — minute track with 60 ticks.
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = shade(palette.dialColor, -0.35);
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const isFive = i % 5 === 0;
    ctx.lineWidth = isFive ? 2.5 : 1;
    ctx.beginPath();
    const r0 = size * (isFive ? 0.435 : 0.44);
    const r1 = size * 0.455;
    ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
    ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
    ctx.stroke();
  }
  ctx.restore();

  // Sub-dial well at 6 o'clock (bottom) — concentric "snailed" circles.
  const subY = cy + size * 0.22;
  const subR = size * 0.11;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, subY, subR, 0, Math.PI * 2);
  ctx.clip();
  // Slightly darker base fill for the sub-dial well.
  ctx.fillStyle = shade(palette.dialColor, -0.18);
  ctx.fillRect(cx - subR, subY - subR, subR * 2, subR * 2);
  // 40 concentric rings.
  for (let r = subR; r > 2; r -= 2) {
    ctx.strokeStyle = `rgba(80, 50, 20, ${0.08 + Math.random() * 0.05})`;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.arc(cx, subY, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Sub-dial rim.
  ctx.strokeStyle = shade(palette.dialColor, -0.45);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, subY, subR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Brand wordmark above center (optional, detail tier).
  if (showBrand) {
    ctx.save();
    ctx.translate(cx, cy - size * 0.18);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = shade(palette.dialColor, -0.55);
    ctx.font = '600 34px "Neue Montreal", system-ui, sans-serif';
    ctx.fillText('CONTINUUM', 0, 0);
    ctx.font = '400 14px "Neue Montreal", system-ui, sans-serif';
    ctx.fillStyle = shade(palette.dialColor, -0.45);
    ctx.fillText('AUTOMATIC · CHRONOMETER', 0, 22);
    ctx.restore();
  }

  // Matching roughness map: invert the colour luminance so bright rays
  // become smoother (lower roughness), dark rays rougher. Creates dynamic
  // sunburst highlights that move as the watch rotates in real lighting.
  const roughCvs = document.createElement('canvas');
  roughCvs.width = roughCvs.height = size;
  const rctx = roughCvs.getContext('2d')!;
  rctx.fillStyle = '#aaaaaa';
  rctx.fillRect(0, 0, size, size);
  rctx.save();
  rctx.translate(cx, cy);
  for (let i = 0; i < rayCount; i++) {
    const a = (i / rayCount) * Math.PI * 2;
    const bright = i % 2 === 0;
    rctx.save();
    rctx.rotate(a);
    rctx.beginPath();
    rctx.moveTo(0, 0);
    rctx.lineTo(size * 0.5, -size * 0.008);
    rctx.lineTo(size * 0.5, size * 0.008);
    rctx.closePath();
    const rg = rctx.createLinearGradient(0, 0, size * 0.5, 0);
    rg.addColorStop(0, 'rgba(170,170,170,0)');
    rg.addColorStop(0.4, bright
      ? 'rgba(100, 100, 100, 0.6)'
      : 'rgba(220, 220, 220, 0.4)');
    rg.addColorStop(1.0, 'rgba(170,170,170,0)');
    rctx.fillStyle = rg;
    rctx.fill();
    rctx.restore();
  }
  rctx.restore();

  // Bump map: low-amplitude height from the rays so grazing light actually
  // breaks across them.
  const bumpCvs = document.createElement('canvas');
  bumpCvs.width = bumpCvs.height = size;
  const bctx = bumpCvs.getContext('2d')!;
  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, size, size);
  bctx.save();
  bctx.translate(cx, cy);
  for (let i = 0; i < rayCount; i++) {
    const a = (i / rayCount) * Math.PI * 2;
    const bright = i % 2 === 0;
    bctx.save();
    bctx.rotate(a);
    bctx.beginPath();
    bctx.moveTo(0, 0);
    bctx.lineTo(size * 0.5, -size * 0.006);
    bctx.lineTo(size * 0.5, size * 0.006);
    bctx.closePath();
    bctx.fillStyle = bright ? 'rgba(200,200,200,0.4)' : 'rgba(60,60,60,0.4)';
    bctx.fill();
    bctx.restore();
  }
  bctx.restore();

  const colorMap = new THREE.CanvasTexture(cvs);
  const roughnessMap = new THREE.CanvasTexture(roughCvs);
  const bumpMap = new THREE.CanvasTexture(bumpCvs);
  [colorMap, roughnessMap, bumpMap].forEach((tex) => {
    tex.anisotropy = DPR_TEX * 8;
    tex.needsUpdate = true;
  });

  const result: SunburstDialSet = { colorMap, roughnessMap, bumpMap };
  sunburstCache.set(key, result);
  return result;
};

// ---------------------------------------------------------------------------
// Brushed metal texture — radial circular-brush pattern for the case flanks.
// ---------------------------------------------------------------------------

const makeBrushedMetalTextures = (palette: WatchColorway) => {
  const size = 512;
  const cvs = document.createElement('canvas');
  cvs.width = cvs.height = size;
  const ctx = cvs.getContext('2d')!;
  ctx.fillStyle = new THREE.Color(palette.caseColor).getStyle();
  ctx.fillRect(0, 0, size, size);
  // Horizontal brush: hundreds of thin scratches with random opacities.
  for (let i = 0; i < 1200; i++) {
    const y = Math.random() * size;
    const w = size * (0.5 + Math.random() * 0.5);
    const x = Math.random() * (size - w);
    const opacity = 0.02 + Math.random() * 0.08;
    ctx.strokeStyle = `rgba(255, 255, 255, ${opacity})`;
    ctx.lineWidth = 0.4 + Math.random() * 0.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y + (Math.random() - 0.5) * 0.3);
    ctx.stroke();
  }
  for (let i = 0; i < 800; i++) {
    const y = Math.random() * size;
    const w = size * (0.2 + Math.random() * 0.4);
    const x = Math.random() * (size - w);
    ctx.strokeStyle = `rgba(0, 0, 0, ${0.03 + Math.random() * 0.05})`;
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(cvs);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 1);
  tex.anisotropy = 16;
  tex.needsUpdate = true;
  return tex;
};

// ---------------------------------------------------------------------------
// Alligator leather — procedural scale pattern + bump + normal map.
//
// Uses a simple 2D simplex-like value noise (sine-hash) at multiple octaves
// to jitter the scale cell positions, then draws rounded diamond shapes in
// staggered rows to form the canonical alligator pattern. The resulting
// grayscale height map is then Sobel-filtered into a normal map.
// ---------------------------------------------------------------------------

const hashNoise = (x: number, y: number): number => {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return s - Math.floor(s);
};

// Legacy alligator helper — retained as an exported escape hatch in case
// the Atelier ever wants the leather option again. Not referenced anywhere
// else in this module, but exported keeps TS6133 happy.
export const _makeAlligatorBumpAndNormal = (
  strapColor: THREE.ColorRepresentation,
): {
  colorMap: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} => {
  const W = 1024;
  const H = 512;
  const cvs = document.createElement('canvas');
  cvs.width = W;
  cvs.height = H;
  const ctx = cvs.getContext('2d')!;

  const base = new THREE.Color(strapColor);
  ctx.fillStyle = `rgb(${Math.round(base.r * 255)}, ${Math.round(base.g * 255)}, ${Math.round(base.b * 255)})`;
  ctx.fillRect(0, 0, W, H);

  // Scale cells — staggered rows of rounded diamond shapes.
  const rows = 14;
  const cols = 28;
  const cellW = W / cols;
  const cellH = H / rows;

  for (let row = 0; row < rows; row++) {
    const stagger = row % 2 === 0 ? 0 : cellW / 2;
    for (let col = -1; col <= cols; col++) {
      const cx = col * cellW + stagger + cellW / 2 + (hashNoise(col, row) - 0.5) * 4;
      const cy = row * cellH + cellH / 2 + (hashNoise(row, col) - 0.5) * 3;
      const jitter = 0.82 + hashNoise(col * 7, row * 11) * 0.25;
      const rx = (cellW / 2) * jitter * 0.96;
      const ry = (cellH / 2) * jitter * 0.9;

      // Scale face — radial gradient from highlight to dark rim.
      const grad = ctx.createRadialGradient(cx, cy, 1, cx, cy, Math.max(rx, ry));
      const shadeMix = 0.55 + hashNoise(col * 3, row * 5) * 0.3;
      grad.addColorStop(0, shade(strapColor, 0.12 * shadeMix));
      grad.addColorStop(0.7, shade(strapColor, 0.02));
      grad.addColorStop(1.0, shade(strapColor, -0.45));

      ctx.fillStyle = grad;
      ctx.beginPath();
      // Soft diamond (rounded): eight-point ellipse.
      ctx.moveTo(cx, cy - ry);
      ctx.bezierCurveTo(cx + rx * 0.6, cy - ry, cx + rx, cy - ry * 0.4, cx + rx, cy);
      ctx.bezierCurveTo(cx + rx, cy + ry * 0.4, cx + rx * 0.6, cy + ry, cx, cy + ry);
      ctx.bezierCurveTo(cx - rx * 0.6, cy + ry, cx - rx, cy + ry * 0.4, cx - rx, cy);
      ctx.bezierCurveTo(cx - rx, cy - ry * 0.4, cx - rx * 0.6, cy - ry, cx, cy - ry);
      ctx.closePath();
      ctx.fill();

      // Dark rim between scales.
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }

  // Fine grain noise overlay.
  const imgData = ctx.getImageData(0, 0, W, H);
  const px = imgData.data;
  for (let i = 0; i < px.length; i += 4) {
    const n = (hashNoise(i % W, Math.floor(i / W)) - 0.5) * 18;
    px[i]     = clamp8((px[i] ?? 0) + n);
    px[i + 1] = clamp8((px[i + 1] ?? 0) + n);
    px[i + 2] = clamp8((px[i + 2] ?? 0) + n);
  }
  ctx.putImageData(imgData, 0, 0);

  const colorMap = new THREE.CanvasTexture(cvs);
  colorMap.wrapS = THREE.RepeatWrapping;
  colorMap.wrapT = THREE.RepeatWrapping;
  colorMap.repeat.set(1, 1);
  colorMap.anisotropy = 16;
  colorMap.needsUpdate = true;

  // Derive bump from grayscale of color.
  const bumpCvs = document.createElement('canvas');
  bumpCvs.width = W;
  bumpCvs.height = H;
  const bctx = bumpCvs.getContext('2d')!;
  bctx.drawImage(cvs, 0, 0);
  // Grayscale.
  const bData = bctx.getImageData(0, 0, W, H);
  const bPx = bData.data;
  for (let i = 0; i < bPx.length; i += 4) {
    const g = 0.3 * (bPx[i] ?? 0) + 0.59 * (bPx[i + 1] ?? 0) + 0.11 * (bPx[i + 2] ?? 0);
    bPx[i] = bPx[i + 1] = bPx[i + 2] = g;
  }
  bctx.putImageData(bData, 0, 0);

  const bumpMap = new THREE.CanvasTexture(bumpCvs);
  bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.anisotropy = 16;
  bumpMap.needsUpdate = true;

  // Compute normal map from bump via Sobel filter.
  const normalMap = sobelToNormalMap(bData, W, H);

  return { colorMap, normalMap, bumpMap };
};

// ---------------------------------------------------------------------------
// Procedural carbon-fiber / woven-textile PBR — the strap material.
//
// Generates a 2/2 twill weave pattern as a colour + normal map. Every other
// cell alternates between horizontal satin weft and vertical matte warp,
// so the surface catches light in a directional crosshatch.
// ---------------------------------------------------------------------------

const makeWovenStrapTextures = (
  strapColor: THREE.ColorRepresentation,
): {
  colorMap: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} => {
  const size = 512;
  const cellSize = 8;
  const cvs = document.createElement('canvas');
  cvs.width = cvs.height = size;
  const ctx = cvs.getContext('2d')!;

  const base = new THREE.Color(strapColor);
  ctx.fillStyle = `rgb(${Math.round(base.r * 255)},${Math.round(base.g * 255)},${Math.round(base.b * 255)})`;
  ctx.fillRect(0, 0, size, size);

  // 2/2 twill pattern. For each cell decide whether it's "up" (warp over
  // weft) or "down" (weft over warp) based on a diagonal shift.
  const cellCount = size / cellSize;
  for (let cy = 0; cy < cellCount; cy++) {
    for (let cx = 0; cx < cellCount; cx++) {
      const x = cx * cellSize;
      const y = cy * cellSize;
      const diagIdx = (cx + cy) % 4;
      const isWarp = diagIdx < 2;  // 2-up 2-down twill

      if (isWarp) {
        // Vertical filament — brighter satin highlight down the middle.
        const grad = ctx.createLinearGradient(x, y, x + cellSize, y);
        grad.addColorStop(0.0, shade(strapColor, -0.25));
        grad.addColorStop(0.5, shade(strapColor, 0.18));
        grad.addColorStop(1.0, shade(strapColor, -0.25));
        ctx.fillStyle = grad;
        ctx.fillRect(x, y, cellSize, cellSize);
      } else {
        // Horizontal filament — matte crossweft, subtler highlight.
        const grad = ctx.createLinearGradient(x, y, x, y + cellSize);
        grad.addColorStop(0.0, shade(strapColor, -0.3));
        grad.addColorStop(0.5, shade(strapColor, 0.08));
        grad.addColorStop(1.0, shade(strapColor, -0.3));
        ctx.fillStyle = grad;
        ctx.fillRect(x, y, cellSize, cellSize);
      }
      // Dark joint line between cells (where threads overlap).
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 0.6;
      ctx.strokeRect(x + 0.3, y + 0.3, cellSize - 0.6, cellSize - 0.6);
    }
  }

  // Fine noise overlay for fiber irregularity.
  const img = ctx.getImageData(0, 0, size, size);
  const px = img.data;
  for (let i = 0; i < px.length; i += 4) {
    const n = (hashNoise(i % size, Math.floor(i / size)) - 0.5) * 14;
    px[i]     = clamp8((px[i] ?? 0) + n);
    px[i + 1] = clamp8((px[i + 1] ?? 0) + n);
    px[i + 2] = clamp8((px[i + 2] ?? 0) + n);
  }
  ctx.putImageData(img, 0, 0);

  const colorMap = new THREE.CanvasTexture(cvs);
  colorMap.wrapS = colorMap.wrapT = THREE.RepeatWrapping;
  colorMap.repeat.set(12, 2);            // long tiling along the strap length
  colorMap.anisotropy = 16;
  colorMap.needsUpdate = true;

  // Grayscale for normal map.
  const bumpCvs = document.createElement('canvas');
  bumpCvs.width = bumpCvs.height = size;
  const bctx = bumpCvs.getContext('2d')!;
  bctx.drawImage(cvs, 0, 0);
  const bData = bctx.getImageData(0, 0, size, size);
  const bPx = bData.data;
  for (let i = 0; i < bPx.length; i += 4) {
    const g = 0.3 * (bPx[i] ?? 0) + 0.59 * (bPx[i + 1] ?? 0) + 0.11 * (bPx[i + 2] ?? 0);
    bPx[i] = bPx[i + 1] = bPx[i + 2] = g;
  }
  bctx.putImageData(bData, 0, 0);

  const normalMap = sobelToNormalMap(bData, size, size);
  normalMap.repeat.set(12, 2);

  // Roughness: satin warp bright = smooth; matte weft = rougher.
  const roughCvs = document.createElement('canvas');
  roughCvs.width = roughCvs.height = size;
  const rctx = roughCvs.getContext('2d')!;
  const rImg = rctx.createImageData(size, size);
  for (let i = 0; i < rImg.data.length; i += 4) {
    const v = 220 - ((bPx[i] ?? 128) * 0.4); // invert bump luminance
    rImg.data[i] = rImg.data[i + 1] = rImg.data[i + 2] = v;
    rImg.data[i + 3] = 255;
  }
  rctx.putImageData(rImg, 0, 0);
  const roughnessMap = new THREE.CanvasTexture(roughCvs);
  roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(12, 2);
  roughnessMap.anisotropy = 16;
  roughnessMap.needsUpdate = true;

  return { colorMap, normalMap, roughnessMap };
};

const sobelToNormalMap = (
  bumpImageData: ImageData,
  W: number,
  H: number,
): THREE.CanvasTexture => {
  const cvs = document.createElement('canvas');
  cvs.width = W;
  cvs.height = H;
  const ctx = cvs.getContext('2d')!;
  const out = ctx.createImageData(W, H);
  const src = bumpImageData.data;
  const strength = 6.0;
  const at = (x: number, y: number): number => {
    const xi = Math.max(0, Math.min(W - 1, x));
    const yi = Math.max(0, Math.min(H - 1, y));
    return src[(yi * W + xi) * 4] ?? 0;
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const tl = at(x - 1, y - 1);
      const t  = at(x,     y - 1);
      const tr = at(x + 1, y - 1);
      const l  = at(x - 1, y);
      const r  = at(x + 1, y);
      const bl = at(x - 1, y + 1);
      const b  = at(x,     y + 1);
      const br = at(x + 1, y + 1);
      const dx = -tl - 2 * l - bl + tr + 2 * r + br;
      const dy = -tl - 2 * t - tr + bl + 2 * b + br;
      const nx = -dx / 255 * strength;
      const ny = -dy / 255 * strength;
      const nz = 1.0;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      const i = (y * W + x) * 4;
      out.data[i]     = Math.round(((nx / len) * 0.5 + 0.5) * 255);
      out.data[i + 1] = Math.round(((ny / len) * 0.5 + 0.5) * 255);
      out.data[i + 2] = Math.round(((nz / len) * 0.5 + 0.5) * 255);
      out.data[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  const tex = new THREE.CanvasTexture(cvs);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 16;
  tex.needsUpdate = true;
  return tex;
};

// ---------------------------------------------------------------------------
// Date-aperture texture — tiny canvas with the given day-of-month drawn in
// bold Neue Montreal. Regenerates when the day changes.
// ---------------------------------------------------------------------------
const makeDateTexture = (day: number): THREE.CanvasTexture => {
  const s = 128;
  const cvs = document.createElement('canvas');
  cvs.width = cvs.height = s;
  const ctx = cvs.getContext('2d')!;
  ctx.fillStyle = 'rgba(242, 235, 217, 1)';
  ctx.fillRect(0, 0, s, s);
  ctx.fillStyle = '#1A130C';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '600 72px "Neue Montreal", system-ui, sans-serif';
  ctx.fillText(String(day), s / 2, s / 2 + 2);
  const tex = new THREE.CanvasTexture(cvs);
  tex.needsUpdate = true;
  return tex;
};

// ---------------------------------------------------------------------------
// Small colour helpers
// ---------------------------------------------------------------------------

const shade = (c: THREE.ColorRepresentation, amount: number): string => {
  const col = new THREE.Color(c);
  col.r = Math.min(1, Math.max(0, col.r + amount));
  col.g = Math.min(1, Math.max(0, col.g + amount));
  col.b = Math.min(1, Math.max(0, col.b + amount));
  return col.getStyle();
};

const clamp8 = (v: number): number => Math.max(0, Math.min(255, v));

// ===========================================================================
// Geometry builders
// ===========================================================================

// (Former buildSpokeIndexGeometry removed — replaced by
// buildBatonIndexGeometry below which produces proper applied batons with
// tapered inner/outer edges instead of flat-sided rectangles.)

// Dauphine hand — classic dress-watch hand: long triangular blade "folded"
// down the middle. We build a pitched tent by extruding a triangular
// outline, then adding a center ridge via bevel so each face reflects
// light independently.
const buildDauphineHandGeometry = (
  length: number,
  baseWidth: number,
): THREE.BufferGeometry => {
  const shape = new THREE.Shape();
  shape.moveTo(-baseWidth * 0.25, 0);
  shape.lineTo(baseWidth * 0.25, 0);
  shape.lineTo(baseWidth * 0.45, -baseWidth * 0.5);
  shape.lineTo(0, -length);
  shape.lineTo(-baseWidth * 0.45, -baseWidth * 0.5);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: baseWidth * 0.28,
    bevelEnabled: true,
    bevelSize: baseWidth * 0.22,
    bevelThickness: baseWidth * 0.32,
    bevelSegments: 2,
    steps: 1,
  });
  geo.translate(0, length * 0.5, 0);
  return geo;
};

// Baton index — tapered rectangular prism with heavy bevels so each face
// catches light separately. Much more refined than a flat block: inner end
// is narrower than outer end, giving the "applied to the dial" look of a
// real dress-watch index.
const buildBatonIndexGeometry = (
  length: number,
  width: number,
): THREE.BufferGeometry => {
  const shape = new THREE.Shape();
  const innerW = width * 0.88;
  const outerW = width;
  shape.moveTo(-innerW / 2, -length / 2);
  shape.lineTo(-outerW / 2,  length / 2);
  shape.lineTo( outerW / 2,  length / 2);
  shape.lineTo( innerW / 2, -length / 2);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: width * 0.45,
    bevelEnabled: true,
    bevelSize: width * 0.18,
    bevelThickness: width * 0.28,
    bevelSegments: 2,
    steps: 1,
  });
  geo.center();
  return geo;
};

// Bezel ring — proper 3D annulus with bevels. Replaces flat RingGeometry
// (which used to read as a paper-thin plane).
const buildBezelRingGeometry = (
  innerR: number,
  outerR: number,
  thickness: number,
  segments: number,
): THREE.BufferGeometry => {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, outerR, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, innerR, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  return new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelSize: thickness * 0.35,
    bevelThickness: thickness * 0.35,
    bevelSegments: 2,
    curveSegments: segments,
    steps: 1,
  });
};

// Lug — curved horn extending from case edge down to the strap. Mounted
// at each of four positions around the 12/6 axis so the strap clearly
// anchors into the case instead of floating near it.
const buildLugGeometry = (): THREE.BufferGeometry => {
  const shape = new THREE.Shape();
  const w = LUG_WIDTH;
  const l = LUG_LENGTH;
  shape.moveTo(-w * 0.52,  0);
  shape.lineTo( w * 0.52,  0);
  shape.quadraticCurveTo( w * 0.56, -l * 0.7, w * 0.38, -l);
  shape.quadraticCurveTo( 0, -l - 0.02, -w * 0.38, -l);
  shape.quadraticCurveTo(-w * 0.56, -l * 0.7, -w * 0.52, 0);
  return new THREE.ExtrudeGeometry(shape, {
    depth: LUG_THICKNESS,
    bevelEnabled: true,
    bevelSize: LUG_THICKNESS * 0.18,
    bevelThickness: LUG_THICKNESS * 0.22,
    bevelSegments: 2,
    steps: 1,
  });
};

// Continuous loop strap — one rectangular profile swept along a closed
// elliptical curve that passes through both lug pairs and wraps BEHIND the
// case (negative Z), forming a single integrated bracelet loop. No floating
// segments, no gaps.
/**
 * Build ONE open strap arm — the kind that hangs off a single lug.
 *
 * `topArm = true`  → starts at the +Y lug, curves up and around behind the
 *                    wrist, ends with a buckle-friendly tip near the back.
 * `topArm = false` → mirror image off the −Y lug.
 *
 * Shape rationale: a real leather watch strap isn't a closed loop — it's
 * two arms joined by a buckle somewhere on the back of the wrist. The
 * arms wrap roughly 150° around an imaginary wrist cylinder and taper
 * from `strapWidth` at the lug to `tipWidth` at the end. The cross-
 * section is a shallow rounded rectangle (leather, not tubing), and the
 * extrude path is C¹-smooth throughout so there are no visible kinks.
 */
/**
 * Build a SMOOTH closed-loop strap — same architecture as the original
 * photoshoot-style loop, but with the naturally-curving Z profile and the
 * thinner dimensions. The topArm / armSpan / tipWidth params are accepted
 * for API compatibility but intentionally ignored — the unified loop
 * handles both arms in a single continuous geometry, which renders more
 * reliably than two open arms extruded along 3D Catmull paths.
 */
const buildStrapArmGeometry = (
  lugRadius: number,
  strapWidth: number,
  tipWidth: number,
  strapThickness: number,
  armSpan: number,
  extrudeSteps = 200,
  curvePoints = 120,
  topArm = true,
): THREE.BufferGeometry => {
  void tipWidth; void armSpan; void topArm; // reserved

  const halfW = strapWidth / 2;
  const halfT = strapThickness / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-halfW,  halfT);
  shape.lineTo( halfW,  halfT);
  shape.lineTo( halfW, -halfT);
  shape.lineTo(-halfW, -halfT);
  shape.closePath();

  // O-shaped loop — a true oval, not a flat-fronted D. The loop is an
  // ellipse in the Y-Z plane whose center sits behind the case, so the
  // "back" of the loop curls deep into -Z AND the "front" curls back
  // toward z ≈ 0 (without clipping through the watch face). From any
  // side-on view the strap reads as a ring, not a half-moon.
  //
  //   yRadius  — vertical reach  (stretches past the lugs)
  //   zRadius  — loop depth      (how far the strap projects in Z)
  //   zCenter  — centered BEHIND the case so the whole oval sits in -Z
  const yRadius = lugRadius * 1.55;
  const zRadius = lugRadius * 0.65;
  const zCenter = -lugRadius * 0.65;   // pushes the oval entirely into -Z

  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < curvePoints; i++) {
    const a = (i / curvePoints) * Math.PI * 2 - Math.PI / 2;
    const y = Math.sin(a) * yRadius;
    const z = zCenter - Math.cos(a) * zRadius;
    pts.push(new THREE.Vector3(0, y, z));
  }

  const curve = new THREE.CatmullRomCurve3(pts, true);
  return new THREE.ExtrudeGeometry(shape, {
    steps: extrudeSteps,
    bevelEnabled: true,
    bevelSize: strapThickness * 0.28,
    bevelThickness: strapThickness * 0.28,
    bevelSegments: 2,
    extrudePath: curve,
  });
};

/**
 * Build a fold-over deployment clasp — the standard closure on a metal
 * bracelet (Oyster / President / Jubilee style). This is richer than the
 * old flat frame-with-hole:
 *
 *   • Outer plate — a rounded rectangle with beveled corners, slightly
 *     wider than the strap. This is the visible top face when closed.
 *   • Recessed panel — a second rounded rectangle pressed INTO the top
 *     face (implemented as a subtractive hole + inner depression). Reads
 *     as a logo plate or engraved area.
 *   • Side tabs — two small rounded rectangles flanking the main plate,
 *     suggesting the release-button mechanism on a real clasp.
 *
 * Returned as a single BufferGeometry via mergeGeometries so the caller
 * can render it with one mesh + one material.
 */

const roundedRectShape = (w: number, h: number, r: number): THREE.Shape => {
  const s = new THREE.Shape();
  const hw = w / 2;
  const hh = h / 2;
  const rr = Math.min(r, hw, hh);
  s.moveTo(-hw + rr, -hh);
  s.lineTo( hw - rr, -hh);
  s.quadraticCurveTo( hw, -hh,  hw, -hh + rr);
  s.lineTo( hw,  hh - rr);
  s.quadraticCurveTo( hw,  hh,  hw - rr,  hh);
  s.lineTo(-hw + rr,  hh);
  s.quadraticCurveTo(-hw,  hh, -hw,  hh - rr);
  s.lineTo(-hw, -hh + rr);
  s.quadraticCurveTo(-hw, -hh, -hw + rr, -hh);
  return s;
};

const buildBuckleGeometry = (
  outerW: number,
  outerH: number,
  thickness: number,
  frameThickness: number,
): THREE.BufferGeometry => {
  // --- Main plate ---
  // Rounded rectangle, full depth, beveled edges so it catches light.
  const mainShape = roundedRectShape(outerW, outerH, outerH * 0.32);
  const main = new THREE.ExtrudeGeometry(mainShape, {
    depth: thickness,
    bevelEnabled: true,
    bevelSize: thickness * 0.28,
    bevelThickness: thickness * 0.28,
    bevelSegments: 3,
  });

  // --- Recessed center panel ---
  // A shallower, smaller rounded rectangle pushed into the top face so
  // it reads as an engraved logo plate. We translate it slightly forward
  // in Z so its front sits inside the main plate volume.
  const innerW = outerW * 0.68;
  const innerH = outerH * 0.58;
  const inset  = thickness * 0.35;   // how deep the panel is recessed
  const recessShape = roundedRectShape(innerW, innerH, innerH * 0.22);
  const recess = new THREE.ExtrudeGeometry(recessShape, {
    depth: inset,
    bevelEnabled: true,
    bevelSize: inset * 0.3,
    bevelThickness: inset * 0.3,
    bevelSegments: 2,
  });
  // Place the recess so its BACK face sits at the main plate's front
  // face (thickness), pushed inward by `inset`. Visually this reads as
  // a sunken panel.
  recess.translate(0, 0, thickness - inset * 0.92);

  // --- Side release tabs ---
  // Two small rounded tabs flanking the main plate, hinting at the
  // butterfly/press-release mechanism on a real deployment clasp.
  const tabW = outerW * 0.08;
  const tabH = outerH * 0.42;
  const tabThick = thickness * 0.85;
  const tabShape = roundedRectShape(tabW, tabH, tabH * 0.3);
  const tabL = new THREE.ExtrudeGeometry(tabShape, {
    depth: tabThick,
    bevelEnabled: true,
    bevelSize: tabThick * 0.3,
    bevelThickness: tabThick * 0.3,
    bevelSegments: 2,
  });
  tabL.translate(-outerW / 2 - tabW * 0.4, 0, (thickness - tabThick) / 2);
  const tabR = tabL.clone();
  tabR.translate(outerW + tabW * 0.8, 0, 0);
  void frameThickness;    // legacy param — superseded by the geometry

  const merged = mergeGeometries([main, recess, tabL, tabR], false);
  return merged ?? main;
};

// (makeClaspEtchTexture removed — used only by the legacy flat-box clasp
//  which was deleted. The new buildBuckleGeometry has a real recessed
//  panel instead of a normalMap-simulated engraving.)

// Domed sapphire crystal — spherical cap. We use a full sphere clipped to
// the dome portion via phi/theta range, then scale vertically to tune the
// dome height.
const buildDomeCrystalGeometry = (
  baseRadius: number,
  domeHeight: number,
  segments = 64,
): THREE.BufferGeometry => {
  // Sphere radius that produces a cap of (baseRadius, domeHeight):
  //   R = (r² + h²) / (2h)
  const R = (baseRadius * baseRadius + domeHeight * domeHeight) / (2 * domeHeight);
  // Cap cut-off angle.
  const phi = Math.asin(baseRadius / R);
  const geo = new THREE.SphereGeometry(
    R,
    segments,
    Math.max(8, Math.floor(segments / 4)),
    0,
    Math.PI * 2,
    0,
    phi,
  );
  // Re-center so base sits at z=0.
  geo.translate(0, -(R - domeHeight), 0);
  geo.rotateX(-Math.PI / 2);
  return geo;
};

// ===========================================================================
// Tier recipe + triangle-count helpers (API-compatible with prior version)
// ===========================================================================

interface WatchRecipe {
  readonly showCase: boolean;
  readonly showBezel: boolean;
  readonly showCrystal: boolean;
  readonly showDial: boolean;
  readonly showSunburst: boolean;
  readonly showIndices: boolean;
  readonly showSubdial: boolean;
  readonly showHands: boolean;
  readonly showBrand: boolean;
  readonly showStrap: boolean;
  readonly showStrapTexture: boolean;
  readonly showStitching: boolean;
  readonly showCrown: boolean;
  readonly showBackMovement: boolean;
  readonly wireframe: boolean;
  readonly usePBR: boolean;
  readonly geometryDetail: 1 | 2 | 3 | 4 | 6;
  readonly radialSegmentScale: number;
  readonly wireOverlayAlpha: number;
}

const GEOM_FOR: Record<WatchTier, 1 | 2 | 3 | 4 | 6> = {
  0: 1, 1: 2, 2: 3, 3: 4, 4: 6,
};
const RADIAL_FOR: Record<WatchTier, number> = {
  0: 0.2, 1: 0.38, 2: 0.58, 3: 0.82, 4: 1.0,
};

const buildRecipe = (tier: WatchTier): WatchRecipe => {
  const t = tier;
  // Every show* flag now returns true for all tiers. The full watch silhouette
  // is ALWAYS mounted from frame 1 so triangles add deliberately inside a
  // stable outline, rather than new parts popping into existence as tiers
  // advance. Visibility is driven by material opacity curves in useFrame
  // (see the "material reveal windows" block there).
  //
  // Also: wireframe flag is deliberately false for every tier — material
  // swaps between wireframe and PBR are what caused the classic "texture
  // pop" at tier 2. Instead we keep every material as MeshPhysicalMaterial
  // at opacity 0, then ramp the opacity up; the wireframe "scaffolding"
  // look comes exclusively from the always-mounted wireframe refs
  // (caseWire0/1/2, silhouetteDome/Bezel/Strap/Lug, strapWire0/1).
  return {
    showCase:          true,
    showBezel:         true,
    showCrystal:       true,
    showDial:          true,
    showSunburst:      true,
    showIndices:       true,
    showSubdial:       true,
    showHands:         true,
    showBrand:         true,
    showStrap:         true,
    showStrapTexture:  true,
    showStitching:     true,
    showCrown:         true,
    showBackMovement:  true,
    wireframe:         false,
    usePBR:            t >= 4,
    geometryDetail:    GEOM_FOR[t],
    radialSegmentScale: RADIAL_FOR[t],
    // Kept for legacy fallback on <mesh> overlays that read it; the real
    // driver of wireframe visibility is the per-region envelope in useFrame.
    wireOverlayAlpha:  t === 0 ? 1.0 : t === 1 ? 0.55 : t === 2 ? 0.2 : t === 3 ? 0.05 : 0,
  };
};

// ===========================================================================
// Adaptive blueprint color — picks the optimal wireframe tint for a given
// page background so the "under construction" amber lines stay readable
// regardless of what palette the asset is dropped into.
//
// Algorithm:
//   1. Convert the background colour to sRGB-linear and compute WCAG
//      relative luminance.
//   2. Extract the background hue via HSL; rotate 180° to land on the
//      perceptual complement (warm background → cool blueprint, and vice
//      versa). Max visual separation from the backdrop.
//   3. Lock saturation at a mid-high value (0.58) so the line doesn't read
//      as neon or washed out.
//   4. Clamp lightness based on bg luminance: dark bg → bright blueprint
//      (L ≈ 0.74); light bg → deep blueprint (L ≈ 0.24). This enforces a
//      WCAG 4.5:1 contrast ratio in practice.
//   5. If the resulting contrast ratio still misses 4.5:1 (happens on
//      mid-luminance backgrounds), push the lightness further away from
//      bg luminance until it's met.
//
// Returns a `#rrggbb` string ready to feed into any THREE material.
// ===========================================================================

const srgbToLinear = (v: number): number =>
  v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);

const relativeLuminance = (c: THREE.Color): number =>
  0.2126 * srgbToLinear(c.r) +
  0.7152 * srgbToLinear(c.g) +
  0.0722 * srgbToLinear(c.b);

const contrastRatio = (L1: number, L2: number): number => {
  const [hi, lo] = L1 > L2 ? [L1, L2] : [L2, L1];
  return (hi + 0.05) / (lo + 0.05);
};

export const pickBlueprintColor = (
  bg: string | THREE.ColorRepresentation,
): string => {
  const bgColor = new THREE.Color(bg);
  const bgL     = relativeLuminance(bgColor);

  // Complementary hue gives maximum perceptual distance from the backdrop.
  const hsl = { h: 0, s: 0, l: 0 };
  bgColor.getHSL(hsl);
  const hue = (hsl.h + 0.5) % 1;
  const sat = 0.58;

  // Initial lightness pick based on background brightness.
  let lit = bgL < 0.5 ? 0.74 : 0.24;

  // Iterate: if contrast ratio falls below 4.5:1, push lightness further
  // from the backdrop's until it's met (ceiling/floor at 0.08 / 0.92 so
  // we never bottom out at pure black or white).
  for (let i = 0; i < 5; i++) {
    const candidate = new THREE.Color().setHSL(hue, sat, lit);
    const ratio = contrastRatio(relativeLuminance(candidate), bgL);
    if (ratio >= 4.5) break;
    lit = bgL < 0.5 ? Math.min(0.92, lit + 0.06) : Math.max(0.08, lit - 0.06);
  }

  const out = new THREE.Color().setHSL(hue, sat, lit);
  return '#' + out.getHexString();
};

/** Default blueprint color — warm amber that reads well on the dark brand bg. */
export const DEFAULT_BLUEPRINT_COLOR = '#D7A86E';

export const approxTrianglesForWatchRegion = (
  region: WatchRegion,
  tier: WatchTier,
): number => {
  const r = Math.max(6, Math.round(64 * RADIAL_FOR[tier]));
  switch (region) {
    case 'case':
      return r * 6 + (tier >= 3 ? r * 2 + 12 * 3 : 0); // case + crown + movement hint
    case 'bezel':
      return tier >= 1 ? r * 4 + r * 2 : 0; // bezel ring + crystal base ring
    case 'dial':
      return (
        (tier >= 1 ? r * 2 : 0) +
        (tier >= 3 ? 12 * 36 : 0) + // spoke indices
        (tier >= 2 ? 3 * 60 + 24 : 0) // hands + subdial
      );
    case 'strap':
      return (
        (tier >= 1 ? 2 * 240 : 0) +     // two extruded strap bands (~240 tris each)
        (tier >= 4 ? 2 * 24 * 2 * 32 : 0) // stitching cylinders at tier 4
      );
  }
};

export const approxTrianglesTotalWatch = (
  tiers: Record<WatchRegion, WatchTier>,
): number =>
  WATCH_REGIONS.reduce(
    (sum, r) => sum + approxTrianglesForWatchRegion(r, tiers[r]),
    0,
  );

// ===========================================================================
// Component
// ===========================================================================

export interface WristwatchAssetProps {
  readonly colorway?: keyof typeof WATCH_COLORWAYS;
  readonly tier?: WatchTier;
  readonly regionTiers?: Partial<Record<WatchRegion, WatchTier>>;
  /** Rotation speed around the Y axis in rad/s. Set to 0 when using OrbitControls. */
  readonly autoRotate?: number;
  readonly scale?: number;
  readonly initialRotationY?: number;
  /** Whether the seconds hand sweeps live + hour/minute track system time. */
  readonly liveTime?: boolean;
  /**
   * Override the wireframe ("blueprint") colour used for the low-tier
   * scaffolding. Pass any CSS hex string — if omitted, the asset falls back
   * to the default amber. Use `pickBlueprintColor(bgHex)` to get an
   * optimal, WCAG-readable tint for a specific page background.
   */
  readonly blueprintColor?: string;
  /**
   * Bump to replay the hologram boot reveal — the flicker-rise
   * materialisation that runs for ~550 ms before the normal tier
   * densification begins. Increment from the parent (usually in sync
   * with the tier schedule's own runToken) to restart the effect
   * without remounting the Canvas.
   */
  readonly runToken?: number;
}

export const WristwatchAsset = forwardRef<THREE.Group, WristwatchAssetProps>(
  (
    {
      colorway = 'gold',
      tier = 4,
      regionTiers,
      autoRotate = 0.25,
      scale = 1,
      initialRotationY = -0.45,
      liveTime = true,
      blueprintColor = DEFAULT_BLUEPRINT_COLOR,
      runToken = 0,
    },
    ref,
  ) => {
    const rootRef = useRef<THREE.Group | null>(null);
    const secondsHandRef = useRef<THREE.Group | null>(null);
    const minuteHandRef = useRef<THREE.Group | null>(null);
    const hourHandRef = useRef<THREE.Group | null>(null);
    const rotorRef = useRef<THREE.Group | null>(null);
    const rotorState = useRef({ angle: 0, velocity: 0 });
    const prevRootRotY = useRef<number | null>(null);
    const initedRef = useRef(false);

    // Hologram-boot clock. Reset whenever runToken bumps so the flicker-rise
    // replay runs on every reveal. fBoot = 0 at reveal start, 1 after
    // HOLOGRAM_BOOT_MS (~550 ms). All wireframe opacities are multiplied by
    // hologramBoot(fBoot) so the scaffolding materialises as a HUD instead
    // of just fading in.
    const bootStartedAtRef = useRef<number>(performance.now());
    useEffect(() => {
      bootStartedAtRef.current = performance.now();
    }, [runToken]);

    // Smooth per-region tier values. The hero passes a DISCRETE target tier;
    // we ease a float `fTier` toward it each frame so material properties and
    // wireframe opacities can crossfade between stages instead of popping.
    const fTierRef = useRef<Record<WatchRegion, number>>({
      dial: 0, bezel: 0, case: 0, strap: 0,
    });
    // Refs to the wireframe ghost materials — we mutate their opacity every
    // frame so the amber scaffold dissolves continuously rather than vanishing.
    const caseWireMatRef  = useRef<THREE.MeshBasicMaterial | null>(null);
    const bezelWireMatRef = useRef<THREE.MeshBasicMaterial | null>(null);
    const dialWireMatRef  = useRef<THREE.MeshBasicMaterial | null>(null);
    // Layered case wireframes — three densities stacked so that denser
    // triangles appear ADDITIVELY between the coarser ones as fTier climbs.
    // Instead of the mesh jumping from "blueprint 1" (coarse) to "blueprint 2"
    // (dense) all at once, the extra subdivisions fade in between the
    // existing edges like they're being drawn in.
    // ---- Real-time subdivision wireframes ------------------------------
    // Single mesh per region whose geometry is SWAPPED every frame the
    // subdivision step advances. The viewer watches the mesh literally
    // rebuild itself with more triangles — not a crossfade of two static
    // meshes, but a real geometric change.
    //
    // We keep refs on the mesh + material + a "last step" integer so
    // useFrame can do the swap without re-rendering React.
    const caseWireMeshRef     = useRef<THREE.Mesh | null>(null);
    const caseWireMatBasicRef = useRef<THREE.MeshBasicMaterial | null>(null);
    const caseWireStepRef     = useRef<number>(-1);
    const strapWireMeshRef    = useRef<THREE.Mesh | null>(null);
    const strapWireMatRef     = useRef<THREE.MeshBasicMaterial | null>(null);
    const strapWireStepRef    = useRef<number>(-1);
    const domeWireMeshRef     = useRef<THREE.Mesh | null>(null);
    const domeWireMatRef      = useRef<THREE.MeshBasicMaterial | null>(null);
    const domeWireStepRef     = useRef<number>(-1);
    // Per-step flash timer — when step advances, this wall-clock ms value
    // captures the event so useFrame can pulse the wireframe colour for a
    // short window, announcing "new triangles just arrived".
    const caseFlashAtRef  = useRef<number>(-Infinity);
    const strapFlashAtRef = useRef<number>(-Infinity);
    const domeFlashAtRef  = useRef<number>(-Infinity);
    // Silhouette wireframes for the non-case parts — mounted from tier 0
    // so the full watch outline reads as a unified blueprint instead of
    // arriving piecewise.
    const silhouetteBezelRef = useRef<THREE.MeshBasicMaterial | null>(null);
    const silhouetteLugRef   = useRef<THREE.MeshBasicMaterial | null>(null);
    // Refs to materials whose properties (clearcoat, metalness, roughness)
    // should lerp smoothly between tier values so the final PBR polish
    // "glazes" on rather than snapping in at tier 4.
    const caseMatRef      = useRef<THREE.MeshPhysicalMaterial | null>(null);
    const bezelMatRef     = useRef<THREE.MeshPhysicalMaterial | null>(null);
    // Polished edge material — shared by lugs + buckle. Needs its own
    // fade-up in useFrame because the buckle renders with this material.
    const polishedCaseEdgeMatRef = useRef<THREE.MeshPhysicalMaterial | null>(null);
    const dialMatRef      = useRef<THREE.MeshPhysicalMaterial | null>(null);
    const crystalMatRef   = useRef<THREE.MeshPhysicalMaterial | null>(null);
    const strapMatRef     = useRef<THREE.MeshPhysicalMaterial | null>(null);
    // Materials that belong to tier-gated meshes. They're always mounted
    // (never conditionally rendered) and their opacity is driven continuously
    // by useFrame so the mesh fades IN rather than snapping into existence.
    const indexMatRef     = useRef<THREE.MeshPhysicalMaterial | null>(null);
    const handMatRef      = useRef<THREE.MeshPhysicalMaterial | null>(null);
    const accentMatRef    = useRef<THREE.MeshStandardMaterial | null>(null);
    // Ruby jewels are strictly final-LOD only — their opacity is pinned to
    // 0 through the entire blueprint phase and only ramps in once the case
    // material has finished polishing.
    const rubyMatRef      = useRef<THREE.MeshPhysicalMaterial | null>(null);
    const dateMatsRef     = useRef<{
      frame?: THREE.MeshStandardMaterial;
      disc?: THREE.MeshStandardMaterial;
      glyph?: THREE.MeshBasicMaterial;
    }>({});

    const palette: WatchColorway =
      WATCH_COLORWAYS[colorway] ?? (WATCH_COLORWAYS.gold as WatchColorway);

    // Resolve per-region tiers.
    const tiers = useMemo(() => ({
      dial:  regionTiers?.dial  ?? tier,
      bezel: regionTiers?.bezel ?? tier,
      case:  regionTiers?.case  ?? tier,
      strap: regionTiers?.strap ?? tier,
    }), [
      regionTiers?.dial,
      regionTiers?.bezel,
      regionTiers?.case,
      regionTiers?.strap,
      tier,
    ]);

    const recipes = useMemo(() => ({
      dial:  buildRecipe(tiers.dial),
      bezel: buildRecipe(tiers.bezel),
      case:  buildRecipe(tiers.case),
      strap: buildRecipe(tiers.strap),
    }), [tiers]);

    // ---- Procedural textures (memoized on palette/tier gates) --------------

    // Textures are ALWAYS generated, regardless of tier. The module-level
    // cache makes this effectively free after the first pass, and keeping
    // them permanently assigned means the materials never have to rebuild
    // when a tier gate flips — which is what was causing the final "pop"
    // at tier 4 (material swap → discontinuity).
    const dialTextures    = useMemo(() => makeSunburstDialTextures(palette, true), [palette]);
    const brushedMetalMap = useMemo(() => makeBrushedMetalTextures(palette), [palette]);
    const wovenTextures   = useMemo(() => makeWovenStrapTextures(palette.strapColor), [palette.strapColor]);
    // (claspEtchMap was used by the legacy flat-box deployment clasp that
    //  floated inside the strap loop. The new buildBuckleGeometry clasp
    //  uses its own recessed panel geometry instead of a normalMap.)

    // (Textures are cached at module level, shared across watch instances
    // and mounts, so they're never disposed on unmount. This eliminates the
    // reload jitter that came from regenerating 1024² canvases + Sobel
    // filters every time the asset mounted.)

    // ---- Materials ---------------------------------------------------------

    const wireMat = (opacity: number) =>
      new THREE.MeshBasicMaterial({
        color: blueprintColor,
        wireframe: true,
        transparent: true,
        opacity,
      });

    const caseMat = useMemo(() => {
      if (recipes.case.wireframe) return wireMat(0.9);
      // ALWAYS MeshPhysicalMaterial so its metalness/roughness/clearcoat
      // can be lerp'd continuously by useFrame. Initial values match the
      // matte tier; the frame loop walks them up to the PBR hero values
      // as the region's smooth tier crosses 2 → 4.
      const mat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(palette.caseColor),
        metalness: 0.75,
        roughness: 0.48,
        clearcoat: 0,
        clearcoatRoughness: 0.2,
        anisotropy: 0.45,
        anisotropyRotation: 0,
        transparent: true,
        opacity: 0,            // useFrame ramps this up; prevents frame-1 flash
      });
      if (brushedMetalMap) mat.map = brushedMetalMap;
      caseMatRef.current = mat;
      return mat;
    }, [palette.caseColor, recipes.case.wireframe, brushedMetalMap]);

    const polishedCaseEdgeMat = useMemo(() => {
      if (recipes.case.wireframe) return wireMat(0.9);
      const mat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(palette.bezelColor),
        metalness: 1.0,
        roughness: 0.05,
        clearcoat: 1.0,
        clearcoatRoughness: 0.04,
        transparent: true,
        opacity: 0,            // ramped by the buckle fade curve in useFrame
      });
      polishedCaseEdgeMatRef.current = mat;
      return mat;
    }, [palette.bezelColor, recipes.case]);

    const bezelMat = useMemo(() => {
      if (recipes.bezel.wireframe) return wireMat(0.9);
      // MeshPhysicalMaterial always, with initial matte-ish values. The
      // frame loop eases metalness/roughness/clearcoat up toward hero
      // values as the bezel's smooth tier advances through 2 → 4.
      const mat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(palette.bezelColor),
        metalness: 0.7,
        roughness: 0.4,
        clearcoat: 0,
        clearcoatRoughness: 0.04,
        transparent: true,
        opacity: 0,
      });
      bezelMatRef.current = mat;
      return mat;
    }, [palette.bezelColor, recipes.bezel.wireframe]);

    // Crystal material is built ONCE with full PBR properties. useFrame
    // lerps transmission + AR attenuation from low-tier (dim glass) up
    // to tier-4 hero (sapphire with blue AR coating) so the crystal
    // doesn't visibly swap materials at the final moment.
    const crystalMat = useMemo(() => {
      if (recipes.bezel.wireframe) return wireMat(0.2);
      const mat = new THREE.MeshPhysicalMaterial({
        color: '#E8F0FF',
        metalness: 0,
        roughness: 0.05,
        transmission: 0.7,
        ior: 1.66,
        thickness: 1.4,
        attenuationColor: new THREE.Color('#CCE0FF'),
        attenuationDistance: 6,
        clearcoat: 0.7,
        clearcoatRoughness: 0.04,
        transparent: true,
        reflectivity: 0.5,
        side: THREE.DoubleSide,
      });
      crystalMatRef.current = mat;
      return mat;
    }, [recipes.bezel.wireframe]);

    // Dial material is built ONCE with the sunburst + roughness + bump
    // maps already attached. useFrame lerps clearcoat / roughness / map
    // contribution so the tier-4 polish arrives as a glaze, not a pop.
    const dialMat = useMemo(() => {
      if (recipes.dial.wireframe) return wireMat(0.4);
      const mat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(palette.dialColor),
        map: dialTextures.colorMap,
        roughnessMap: dialTextures.roughnessMap,
        bumpMap: dialTextures.bumpMap,
        bumpScale: 0.015,
        metalness: 0.3,
        roughness: 0.55,
        clearcoat: 0,
        clearcoatRoughness: 0.2,
        // Transparent + opacity 0 at init so the dial doesn't render as a
        // solid black puck on frame 1 before useFrame has had a chance to
        // drive the blueprint -> polished reveal envelope.
        transparent: true,
        opacity: 0,
      });
      dialMatRef.current = mat;
      return mat;
    }, [palette.dialColor, recipes.dial.wireframe, dialTextures]);

    // Hand material — transparent so useFrame can fade it in as the dial
    // tier crosses 1.5 → 2.5. Initial opacity is 0 so the hands don't flash
    // in on mount before the smooth tier interpolation kicks in.
    const handMat = useMemo(() => {
      const mat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(palette.handColor),
        metalness: 1.0,
        roughness: 0.12,
        clearcoat: 1.0,
        clearcoatRoughness: 0.05,
        transparent: true,
        opacity: 0,
      });
      handMatRef.current = mat;
      return mat;
    }, [palette.handColor]);

    // Baton indices — fade in as dial tier crosses 2.5 → 3.5.
    const indexMat = useMemo(() => {
      const mat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(palette.handColor),
        metalness: 1.0,
        roughness: 0.08,
        clearcoat: 1.0,
        clearcoatRoughness: 0.04,
        transparent: true,
        opacity: 0,
      });
      indexMatRef.current = mat;
      return mat;
    }, [palette.handColor]);

    // Center cap + subdial accents — share with handMat's timing.
    const accentMat = useMemo(() => {
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(palette.accentColor),
        metalness: 0.6,
        roughness: 0.3,
        transparent: true,
        opacity: 0,
      });
      accentMatRef.current = mat;
      return mat;
    }, [palette.accentColor]);

    // Ruby jewels — the brightest saturated red in the entire scene, so
    // any stray pixel during the blueprint phase reads as a hard "bug".
    // Strictly gated to the final LOD state via useFrame: opacity stays
    // pinned to 0 until the case has fully polished out (caseF >= 3.5).
    const rubyMat = useMemo(() => {
      const mat = new THREE.MeshPhysicalMaterial({
        color: '#C4132A',
        metalness: 0.05,
        roughness: 0.1,
        transmission: 0.35,
        ior: 1.77,
        thickness: 0.03,
        clearcoat: 1.0,
        clearcoatRoughness: 0.05,
        transparent: true,
        opacity: 0,
      });
      rubyMatRef.current = mat;
      return mat;
    }, []);

    // Strap material is built ONCE with the woven color/normal/roughness
    // maps attached. useFrame lerps normalScale + roughness so the weave
    // pattern reveals as it polishes rather than snapping in at tier 3.
    const strapMat = useMemo(() => {
      if (recipes.strap.wireframe) return wireMat(0.6);
      // Metallic bracelet — Milanese/Oyster-ish. Push metalness to near-
      // full, drop roughness for a soft sheen, cut the woven normal map's
      // intensity so the weave reads as subtle surface detail rather than
      // a repeating leather grain. Color is pulled toward the case gold
      // so the bracelet visually matches the lugs.
      const bracelet = new THREE.Color(palette.strapColor).lerp(
        new THREE.Color('#8B6F2E'), 0.6,   // blend toward warm gold
      );
      const base: THREE.MeshPhysicalMaterialParameters = {
        color: bracelet,
        metalness: 0.92,
        roughness: 0.32,
        clearcoat: 0.55,
        clearcoatRoughness: 0.18,
        normalMap: wovenTextures.normalMap,
        // Normal intensity scaled way down so the weave reads as brushed
        // metal micro-scratches rather than a fabric grid. useFrame later
        // ramps this up during material reveal.
        normalScale: new THREE.Vector2(0, 0),
        roughnessMap: wovenTextures.roughnessMap,
      };
      const mat = new THREE.MeshPhysicalMaterial(base);
      strapMatRef.current = mat;
      return mat;
    }, [palette.strapColor, recipes.strap.wireframe, wovenTextures]);

    // (stitchMat removed — the woven loop strap has no exposed stitching.)

    // ---- Derived geometry handles -----------------------------------------

    const caseRadial  = Math.max(12, Math.round(96 * recipes.case.radialSegmentScale));
    const bezelRadial = Math.max(12, Math.round(96 * recipes.bezel.radialSegmentScale));
    const dialRadial  = Math.max(12, Math.round(96 * recipes.dial.radialSegmentScale));

    const indexGeo = useMemo(
      () => buildBatonIndexGeometry(INDEX_LEN, INDEX_W),
      [],
    );

    const bezelRingGeo = useMemo(
      () => buildBezelRingGeometry(
        BEZEL_INNER_R,
        BEZEL_OUTER_R,
        BEZEL_THICKNESS * 4,
        Math.max(48, bezelRadial),
      ),
      [bezelRadial],
    );

    const lugGeo = useMemo(() => buildLugGeometry(), []);

    // Shared lug wireframe material — one instance driven by silhouetteLugRef.
    const sharedLugWireMat = useMemo(() => {
      const m = new THREE.MeshBasicMaterial({
        color: blueprintColor,
        wireframe: true,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      });
      silhouetteLugRef.current = m;
      return m;
    }, [blueprintColor]);

    // Strap = two open arms rendered as independent meshes + a separate
    // buckle mesh. Keeping them separate sidesteps mergeGeometries quirks
    // (which can silently null out when ExtrudeGeometry attribute sets
    // differ) and lets the buckle wear its own metallic material.
    const strapArmTopGeo = useMemo(() => buildStrapArmGeometry(
      CASE_OUTER_R + 0.02,
      STRAP_W_AT_LUG, STRAP_W_AT_TIP, STRAP_THICKNESS,
      STRAP_ARM_SPAN, 200, 120, true,
    ), []);

    const strapBuckleGeo = useMemo(() => {
      const lugR = CASE_OUTER_R + 0.02;
      // The deepest Z of the oval (where the strap is travelling purely
      // in +Y). That's the natural mounting point for a pin-and-frame
      // buckle on a closed-loop bracelet — visually reads as "threaded
      // through the strap."
      const yRadius = lugR * 1.55; void yRadius; // reserved
      const zRadius = lugR * 0.65;
      const zCenter = -lugR * 0.65;
      const buckleZ = zCenter - zRadius;          // back of the oval
      const geo = buildBuckleGeometry(
        STRAP_W_AT_LUG * 1.08,     // ~8% wider than strap so it hugs the band
        STRAP_W_AT_LUG * 0.38,     // slim frame height
        STRAP_THICKNESS * 1.4,     // thicker than strap so it reads as metal
        STRAP_W_AT_LUG * 0.07,     // frame thickness
      );
      // Orient so the frame's plane is perpendicular to the strap's
      // tangent at that point. At the back (a=0), strap tangent is +Y,
      // so the buckle frame should face ±Y. A rotateX(π/2) takes the
      // default +Z-facing rectangle to +Y-facing.
      const m = new THREE.Matrix4().makeRotationX(Math.PI / 2)
        .setPosition(0, 0, buckleZ);
      geo.applyMatrix4(m);
      return geo;
    }, []);

    // ---- SUBDIVISION POOLS --------------------------------------------
    // Pre-built wireframe geometries at progressively denser segment counts.
    // During the blueprint phase, useFrame walks the current subdivision
    // index up through these arrays and re-assigns `mesh.geometry` — the
    // viewer watches the mesh LITERALLY reshape, from hexagonal prism to
    // smooth cylinder, with every new step showing more triangles than the
    // last. Not a crossfade — a real geometric morph.

    // Case cylinder: 16 subdivision steps from 6-gon → 64-gon. Finer steps
    // near the start (6/7/8) so early detail reads clearly, coarser near
    // the end (48→64) where the eye can't distinguish extra segments.
    const CASE_SUBDIV_STEPS: readonly number[] = [
      6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 22, 26, 32, 40, 48, 64,
    ];
    const caseWireGeos = useMemo(() =>
      CASE_SUBDIV_STEPS.map((n) =>
        new THREE.CylinderGeometry(
          CASE_OUTER_R + 0.007,
          CASE_OUTER_R + 0.007,
          CASE_THICKNESS + 0.008,
          n, 1, true,
        ),
      ),
      // CASE_SUBDIV_STEPS is module-local and never changes
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [],
    );

    // Strap wireframe subdivision: 12 density steps. Each step builds the
    // SAME two-arm-plus-buckle structure as the hero strap, but with fewer
    // extrudeSteps × curvePoints. The viewer watches the band refine from
    // a chunky prismatic outline into the smooth leather curve.
    const STRAP_SUBDIV_STEPS: ReadonlyArray<readonly [number, number]> = [
      [4, 6], [5, 8], [6, 10], [8, 14], [10, 18], [14, 22],
      [20, 30], [28, 40], [40, 56], [56, 72], [72, 88], [96, 96],
    ];
    const strapWireGeos = useMemo(() =>
      STRAP_SUBDIV_STEPS.map(([steps, pts]) => {
        // For the wireframe subdivision overlay, we only need ONE arm —
        // the densification story reads as clearly on one side as two,
        // and it sidesteps the mergeGeometries null-return failure mode.
        return buildStrapArmGeometry(
          CASE_OUTER_R + 0.023,
          STRAP_W_AT_LUG * 1.01, STRAP_W_AT_TIP, STRAP_THICKNESS * 1.01,
          STRAP_ARM_SPAN, steps, pts, true,
        );
      }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [],
    );

    // Dome crystal: 10 steps of sphere-cap subdivision. Simpler pool since
    // it's a small part — but still morphs from hex-cap to smooth dome.
    const DOME_SUBDIV_STEPS: readonly number[] = [
      6, 7, 8, 10, 12, 16, 20, 28, 40, 48,
    ];
    const domeWireGeos = useMemo(() =>
      DOME_SUBDIV_STEPS.map((segments) =>
        buildDomeCrystalGeometry(
          CASE_OUTER_R - 0.08,
          CRYSTAL_DOME_H * 0.6,
          segments,
        ),
      ),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [],
    );

    const dauphineHourGeo = useMemo(
      () => buildDauphineHandGeometry(0.52, 0.09),
      [],
    );
    const dauphineMinuteGeo = useMemo(
      () => buildDauphineHandGeometry(0.74, 0.07),
      [],
    );

    const domeCrystalGeo = useMemo(
      () => buildDomeCrystalGeometry(
        CRYSTAL_R,
        CRYSTAL_DOME_H,
        Math.max(24, dialRadial),
      ),
      [dialRadial],
    );

    const backDomeGeo = useMemo(
      () => buildDomeCrystalGeometry(
        BACK_CRYSTAL_R,
        CRYSTAL_DOME_H * 0.6,
        Math.max(24, dialRadial),
      ),
      [dialRadial],
    );

    // ---- Per-frame animation ----------------------------------------------

    useFrame((state, dt) => {
      const root = rootRef.current;
      if (!root) return;

      if (!initedRef.current) {
        root.rotation.y = initialRotationY;
        initedRef.current = true;
        prevRootRotY.current = root.rotation.y;
      }

      if (autoRotate !== 0) {
        root.rotation.y += dt * autoRotate;
      }

      // ------------------------------------------------------------------
      // Hologram boot — Iron Man HUD materialisation. fBoot ramps 0→1 over
      // HOLOGRAM_BOOT_MS, and holoMul is the flicker-rise opacity multiplier
      // applied UNIFORMLY to every wireframe envelope below. After boot the
      // multiplier is 1 and the schedule plays identically to before.
      // ------------------------------------------------------------------
      const fBoot = Math.min(
        1,
        (performance.now() - bootStartedAtRef.current) / HOLOGRAM_BOOT_MS,
      );
      const holoMul = hologramBoot(fBoot);

      // Scale-settle on the whole watch — starts slightly oversized during
      // the boot flicker, compresses to its final transform as the schedule
      // starts. Done at the root so it applies to every region at once.
      root.scale.setScalar(scale * hologramBootScale(fBoot));

      // ------------------------------------------------------------------
      // Smooth tier interpolation. Each frame we ease the per-region float
      // toward the discrete target, then derive continuous visual props
      // (wireframe opacity, material clearcoat / metalness / roughness) so
      // the hand-off between tiers is a visible glide rather than a pop.
      // ------------------------------------------------------------------
      const EASE = 1 - Math.pow(0.001, dt);   // ~250ms half-life feel
      (WATCH_REGIONS as readonly WatchRegion[]).forEach((r) => {
        const target = tiers[r];
        const cur = fTierRef.current[r];
        fTierRef.current[r] = cur + (target - cur) * EASE;
      });

      // Helper used throughout the rest of the frame for smooth fTier-driven
      // interpolations. Hoisted here so the wireframe layer block can use it.
      const smooth01 = (f: number, a: number, b: number) =>
        Math.max(0, Math.min(1, (f - a) / Math.max(0.001, b - a)));

      // Global wireframe envelope — fades ALL blueprint layers out as
      // material takes over (fTier 2 → 3).
      const envelope = (f: number) => {
        if (f >= 3) return 0;
        if (f <= 2) return 1;
        const t = (f - 2) / 1;
        return (1 - t) * (1 - t);
      };

      // Layered wireframe density curves. Each additional layer adds its
      // triangles ON TOP of the previous one so the viewer sees NEW edges
      // appearing between existing ones rather than a mesh swap:
      //   Layer 0 (coarse) is always lit through tier 2, then fades.
      //   Layer 1 (medium) fades in as fTier crosses 0.3 → 1.1.
      //   Layer 2 (dense)  fades in as fTier crosses 1.0 → 2.0.
      const caseF    = fTierRef.current.case;
      // Each region envelope gets the hologram flicker baked in — since
      // every wireframe opacity below multiplies by *Env, the flicker
      // propagates to the entire blueprint stack via this single hook.
      const caseEnv  = envelope(caseF) * holoMul;
      const bezelEnv = envelope(fTierRef.current.bezel) * holoMul;
      const dialEnv  = envelope(fTierRef.current.dial) * holoMul;

      // ------------------------------------------------------------------
      // REAL-TIME SUBDIVISION — the marquee effect.
      //
      // Instead of three static wireframe layers crossfading (which looks
      // smooth but hides the "triangles being added" idea), we hot-swap
      // ONE mesh's geometry through a pool of progressively denser builds.
      // The viewer watches the silhouette reshape from a 6-sided polygon
      // up through every intermediate polygon count to a smooth circle —
      // actual geometry changes, not opacity tricks.
      //
      // Each geometry swap also fires a brief "flash" on the wireframe
      // material (brighter colour + pulse) so the new triangles announce
      // themselves as they arrive. That's what sells the "being built"
      // cadence.
      // ------------------------------------------------------------------
      const nowMs = performance.now();
      const FLASH_MS = 160;

      // Case — step index walks through CASE_SUBDIV_STEPS as caseF climbs
      // from 0 (Blueprint 1, hexagonal) to 2 (Blueprint 2, near-smooth).
      const caseSubdivT = Math.min(1, Math.max(0, caseF / 2));
      const caseStepIdx = Math.min(
        CASE_SUBDIV_STEPS.length - 1,
        Math.floor(caseSubdivT * (CASE_SUBDIV_STEPS.length - 1) + 0.5),
      );
      if (caseWireMeshRef.current && caseStepIdx !== caseWireStepRef.current) {
        caseWireMeshRef.current.geometry = caseWireGeos[caseStepIdx]!;
        caseWireStepRef.current = caseStepIdx;
        caseFlashAtRef.current = nowMs;
      }
      if (caseWireMatBasicRef.current) {
        const flash = Math.max(0, 1 - (nowMs - caseFlashAtRef.current) / FLASH_MS);
        const baseOp = 0.92 * caseEnv;
        caseWireMatBasicRef.current.opacity = baseOp + flash * 0.06 * caseEnv;
        caseWireMatBasicRef.current.visible = baseOp > 0.01;
      }

      // Bezel + dial wireframe ghosts — keep single-layer (they only cover
      // small surfaces; the densification trick is overkill there) but use
      // the same fTier-driven envelope for a continuous fade.
      if (caseWireMatRef.current) {
        // Legacy single-layer case wire — disabled now that the stack
        // covers it. Kept at opacity 0 so mesh.visible stays false.
        caseWireMatRef.current.opacity = 0;
        caseWireMatRef.current.visible = false;
      }
      if (bezelWireMatRef.current) {
        bezelWireMatRef.current.opacity = bezelEnv * 0.85;
        bezelWireMatRef.current.visible = bezelEnv > 0.01;
      }
      if (dialWireMatRef.current) {
        dialWireMatRef.current.opacity = dialEnv * 0.85;
        dialWireMatRef.current.visible = dialEnv > 0.01;
      }

      // Silhouette-level blueprints. Each non-case part's wireframe stays
      // at ~0.9 opacity while that region's fTier is below 2, then fades
      // to 0 by tier 3 (material takes over). Driven per-region so e.g.
      // the dome dissolves with the bezel while the strap dissolves later.
      const strapEnv = envelope(fTierRef.current.strap) * holoMul;
      // Dome subdivision — same pool-swap pattern as the case.
      const domeSubdivT = Math.min(1, Math.max(0, fTierRef.current.bezel / 2));
      const domeStepIdx = Math.min(
        DOME_SUBDIV_STEPS.length - 1,
        Math.floor(domeSubdivT * (DOME_SUBDIV_STEPS.length - 1) + 0.5),
      );
      if (domeWireMeshRef.current && domeStepIdx !== domeWireStepRef.current) {
        domeWireMeshRef.current.geometry = domeWireGeos[domeStepIdx]!;
        domeWireStepRef.current = domeStepIdx;
        domeFlashAtRef.current = nowMs;
      }
      if (domeWireMatRef.current) {
        const flash = Math.max(0, 1 - (nowMs - domeFlashAtRef.current) / FLASH_MS);
        const baseOp = 0.9 * bezelEnv;
        domeWireMatRef.current.opacity = baseOp + flash * 0.06 * bezelEnv;
        domeWireMatRef.current.visible = baseOp > 0.01;
      }
      if (silhouetteBezelRef.current) {
        silhouetteBezelRef.current.opacity = bezelEnv * 0.85;
        silhouetteBezelRef.current.visible = bezelEnv > 0.01;
      }
      // Layered strap wireframes — same additive densification pattern as
      // the case body. Coarse is always on, medium fades in 0.3→1.1 on the
      // strap's fTier, dense fades in 1.0→2.0. Each is multiplied by the
      // strap's envelope so they all dissolve together when its material
      // finally takes over.
      // Strap subdivision — same pool-swap pattern. Steps through
      // STRAP_SUBDIV_STEPS from a chunky hex-loop to the final dense band.
      const strapF = fTierRef.current.strap;
      const strapSubdivT = Math.min(1, Math.max(0, strapF / 2));
      const strapStepIdx = Math.min(
        STRAP_SUBDIV_STEPS.length - 1,
        Math.floor(strapSubdivT * (STRAP_SUBDIV_STEPS.length - 1) + 0.5),
      );
      if (strapWireMeshRef.current && strapStepIdx !== strapWireStepRef.current) {
        strapWireMeshRef.current.geometry = strapWireGeos[strapStepIdx]!;
        strapWireStepRef.current = strapStepIdx;
        strapFlashAtRef.current = nowMs;
      }
      if (strapWireMatRef.current) {
        const flash = Math.max(0, 1 - (nowMs - strapFlashAtRef.current) / FLASH_MS);
        const baseOp = 0.88 * strapEnv;
        strapWireMatRef.current.opacity = baseOp + flash * 0.08 * strapEnv;
        strapWireMatRef.current.visible = baseOp > 0.01;
      }
      if (silhouetteLugRef.current) {
        silhouetteLugRef.current.opacity = caseEnv * 0.85;
        silhouetteLugRef.current.visible = caseEnv > 0.01;
      }

      // Smooth PBR polish — case + bezel metalness/clearcoat ramp continuously
      // from matte (tier ~2) to hero (tier 4). This is what the user sees as
      // the final clearcoat glaze appearing gradually instead of popping in.
      // (smooth01 + caseF are hoisted above, we reuse them.)
      const bezelF = fTierRef.current.bezel;
      const dialF  = fTierRef.current.dial;

      // Staggered polish windows. Each region's PBR properties ramp over
      // a slightly different fTier range so the final reveal arrives as a
      // choreographed wave — dial shine lands first (early), bezel
      // gloss second, case clearcoat third, crystal AR last. Feels
      // deliberate rather than "everything flips at tier 4".
      // (strapF + caseF + smooth01 are hoisted above; reuse them.)

      // ------------------------------------------------------------------
      // MATERIAL REVEAL WINDOWS — the user-perceived cascade.
      //
      // All meshes are ALWAYS mounted (silhouette is locked from frame 1),
      // but each material's opacity ramps up on a dedicated fTier window
      // so the viewer sees the sequence unfold:
      //
      //   Stage A — albedo (opacity)     → fTier 1.3 → 2.4   "colour arrives"
      //   Stage B — roughness (matte)    → fTier 2.2 → 3.0   "surface settles"
      //   Stage C — metalness (shadows)  → fTier 2.8 → 3.5   "shading deepens"
      //   Stage D — clearcoat (reflect)  → fTier 3.2 → 4.0   "reflections glaze"
      //
      // Each region has its own slight offset so the cascade reads as a wave
      // across the watch rather than a global flip. transparent is pinned to
      // true so opacity actually works.
      // ------------------------------------------------------------------

      if (dialMatRef.current) {
        const m = dialMatRef.current;
        m.transparent = true;
        m.opacity    = smooth01(dialF, 1.2, 2.2);               // Stage A
        const polish = smooth01(dialF, 2.5, 3.4);               // Stage B/C
        const gloss  = smooth01(dialF, 3.2, 4.0);               // Stage D
        m.roughness = 0.55 + (0.25 - 0.55) * polish;
        m.clearcoat = 0.35 * gloss;
        m.clearcoatRoughness = 0.2;
      }
      if (bezelMatRef.current) {
        const m = bezelMatRef.current;
        m.transparent = true;
        m.opacity    = smooth01(bezelF, 1.5, 2.4);              // Stage A
        const matte  = smooth01(bezelF, 2.3, 3.0);              // Stage B
        const metal  = smooth01(bezelF, 2.9, 3.6);              // Stage C
        const gloss  = smooth01(bezelF, 3.3, 4.0);              // Stage D
        m.metalness = 0.7 + (1.0 - 0.7) * metal;
        m.roughness = 0.4 + (0.08 - 0.4) * matte;
        m.clearcoat = gloss;
        m.clearcoatRoughness = 0.04;
      }
      if (caseMatRef.current) {
        const m = caseMatRef.current;
        m.transparent = true;
        m.opacity    = smooth01(caseF, 1.3, 2.3);               // Stage A
        const matte  = smooth01(caseF, 2.2, 3.0);               // Stage B
        const metal  = smooth01(caseF, 2.8, 3.5);               // Stage C
        const gloss  = smooth01(caseF, 3.2, 4.0);               // Stage D
        m.metalness = 0.75 + (1.0 - 0.75) * metal;
        m.roughness = 0.48 + (0.32 - 0.48) * matte;
        m.clearcoat = 0.4 * gloss;
        m.clearcoatRoughness = 0.2;
      }
      if (crystalMatRef.current) {
        const m = crystalMatRef.current;
        m.transparent = true;
        // Crystal arrives AFTER the dial has settled — you want to see the
        // dial first, then the dome "sealing" over it.
        m.opacity    = smooth01(dialF, 2.2, 3.0);
        const polish = smooth01(dialF, 3.0, 4.0);
        m.transmission = 0.7 + (1.0 - 0.7) * polish;
        m.ior          = 1.66 + (1.76 - 1.66) * polish;
        m.thickness    = 1.4  + (2.0  - 1.4)  * polish;
        m.attenuationDistance = 6.0 + (4.0 - 6.0) * polish;
        m.clearcoat    = 0.7 + (1.0 - 0.7) * polish;
      }
      if (strapMatRef.current) {
        const m = strapMatRef.current;
        m.transparent = true;
        m.opacity    = smooth01(strapF, 1.4, 2.5);              // Stage A
        const polish = smooth01(strapF, 2.5, 3.3);              // Stage B → metal sheen
        const sheen  = smooth01(strapF, 3.0, 4.0);              // Stage D → subtle weave
        // Roughness drops as polish rises (matte → satin).
        m.roughness = 0.48 + (0.28 - 0.48) * polish;
        // Normal intensity peaks low so the woven texture reads as brushed
        // micro-scratches rather than a grid of basket weave.
        m.normalScale.set(sheen * 0.22, sheen * 0.22);
      }
      // Polished-case-edge material is shared by the buckle + a few case
      // accents (chamfers, crown facets). It needs its own opacity ramp so
      // the buckle fades in with the strap rather than popping in solid
      // black on frame 1. Slight lead over the strap body so the clasp
      // resolves a beat earlier — it reads as the "anchor" of the loop.
      if (polishedCaseEdgeMatRef.current) {
        const m = polishedCaseEdgeMatRef.current;
        m.transparent = true;
        m.opacity = smooth01(strapF, 1.6, 2.6);
        const gloss = smooth01(strapF, 2.8, 3.8);
        m.clearcoat = 0.6 + (1.0 - 0.6) * gloss;
        m.roughness = 0.18 + (0.08 - 0.18) * gloss;
      }

      // Tier-gated material fade-ins. Each mesh that used to pop into
      // existence at a discrete tier now lives in the scene from mount
      // onward; we just fade its material's opacity continuously.
      if (handMatRef.current) {
        const fade = smooth01(dialF, 1.5, 2.5);
        handMatRef.current.opacity = fade;
        handMatRef.current.visible = fade > 0.01;
      }
      if (indexMatRef.current) {
        const fade = smooth01(dialF, 2.5, 3.5);
        indexMatRef.current.opacity = fade;
        indexMatRef.current.visible = fade > 0.01;
      }
      if (accentMatRef.current) {
        // Accent cap uses the hand reveal timing.
        const fade = smooth01(dialF, 1.5, 2.5);
        accentMatRef.current.opacity = fade;
        accentMatRef.current.visible = fade > 0.01;
      }
      // Rubies — STRICTLY final-LOD only. Pinned at 0 until the case body
      // polish is essentially complete (caseF >= 3.5), then a short 3.5→4.0
      // sweep fades them in. mesh.visible toggles hard below 0.01 so they
      // aren't even drawn during the blueprint phase.
      if (rubyMatRef.current) {
        const fade = smooth01(fTierRef.current.case, 3.5, 4.0);
        rubyMatRef.current.opacity = fade;
        rubyMatRef.current.visible = fade > 0.01;
      }
      // Date window materials share the index reveal window.
      const dateFade = smooth01(dialF, 2.5, 3.5);
      const { frame, disc, glyph } = dateMatsRef.current;
      if (frame) {
        frame.transparent = true;
        frame.opacity = dateFade;
        frame.visible = dateFade > 0.01;
      }
      if (disc) {
        disc.transparent = true;
        disc.opacity = dateFade;
        disc.visible = dateFade > 0.01;
      }
      if (glyph) {
        glyph.transparent = true;
        glyph.opacity = dateFade;
        glyph.visible = dateFade > 0.01;
      }

      // Hour + minute: real system time.
      if (liveTime) {
        const now = new Date();
        const seconds = now.getSeconds() + now.getMilliseconds() / 1000;
        const minutes = now.getMinutes() + seconds / 60;
        const hours = (now.getHours() % 12) + minutes / 60;
        if (minuteHandRef.current) {
          minuteHandRef.current.rotation.z = -(minutes / 60) * Math.PI * 2;
        }
        if (hourHandRef.current) {
          hourHandRef.current.rotation.z = -(hours / 12) * Math.PI * 2;
        }
        if (secondsHandRef.current) {
          // Seconds hand lives on the sub-dial at 6 o'clock. Sweeping continuous motion.
          secondsHandRef.current.rotation.z = -(seconds / 60) * Math.PI * 2;
        }
      } else {
        // Pleasant "ten past ten" + sweeping sub-dial.
        if (hourHandRef.current)   hourHandRef.current.rotation.z = -Math.PI / 6;
        if (minuteHandRef.current) minuteHandRef.current.rotation.z = -(2 * Math.PI) / 6;
        if (secondsHandRef.current) {
          const t = state.clock.getElapsedTime();
          secondsHandRef.current.rotation.z = -(t * Math.PI * 2) / 60;
        }
      }

      // Rotor physics: swings based on root rotation about Y. When the user
      // spins the watch, the rotor experiences a simulated gravitational
      // torque and swings to find its resting angle.
      if (rotorRef.current && prevRootRotY.current !== null) {
        const GRAVITY = 8.0;
        const DAMPING = 0.92;
        // Effective "down" direction relative to the case-back local frame.
        // The rotor's pivot axis is world -Z (case-back normal). We compute
        // the component of world-down (–Y) projected onto the case-back
        // plane, in the rotor's local X-Y coords.
        const rootY = root.rotation.y;
        const down = new THREE.Vector3(0, -1, 0);
        // Transform world down into case-back local (ignore X tilt for simplicity).
        const local = down.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -rootY);
        const target = Math.atan2(local.y, local.x) + Math.PI / 2;
        const cur = rotorState.current.angle;
        const dAngle = wrapAngle(target - cur);
        rotorState.current.velocity += dAngle * GRAVITY * dt;
        rotorState.current.velocity *= DAMPING;
        rotorState.current.angle += rotorState.current.velocity * dt;
        rotorRef.current.rotation.z = rotorState.current.angle;
        prevRootRotY.current = rootY;
      }
    });

    // Z offsets — working bottom-up from case-back to crystal.
    const CASE_TOP_Z = CASE_THICKNESS / 2;
    const CASE_BOTTOM_Z = -CASE_THICKNESS / 2;
    const DIAL_TOP_Z = CASE_TOP_Z - 0.003;
    const CRYSTAL_BASE_Z = CASE_TOP_Z + 0.006;
    const BACK_CRYSTAL_Z = CASE_BOTTOM_Z - 0.006;

    return (
      <group
        ref={(node) => {
          rootRef.current = node;
          if (typeof ref === 'function') ref(node);
          else if (ref) (ref as React.MutableRefObject<THREE.Group | null>).current = node;
        }}
        scale={scale}
      >
        {/* ================================================================ */}
        {/* CASE region                                                       */}
        {/* ================================================================ */}
        {recipes.case.showCase && (
          <>
            {/* Main cylindrical body (brushed flanks)                        */}
            <mesh rotation={[Math.PI / 2, 0, 0]} material={caseMat}>
              <cylinderGeometry
                args={[CASE_INNER_R, CASE_INNER_R, CASE_THICKNESS, caseRadial]}
              />
            </mesh>
            {/* Polished bezel shoulder + crystal pedestal                    */}
            <mesh
              position={[0, 0, CASE_TOP_Z - 0.002]}
              rotation={[Math.PI / 2, 0, 0]}
              material={polishedCaseEdgeMat}
            >
              <cylinderGeometry
                args={[CASE_OUTER_R, CASE_INNER_R, 0.028, caseRadial]}
              />
            </mesh>
            {/* Polished bottom shoulder                                      */}
            <mesh
              position={[0, 0, CASE_BOTTOM_Z + 0.002]}
              rotation={[Math.PI / 2, 0, 0]}
              material={polishedCaseEdgeMat}
            >
              <cylinderGeometry
                args={[CASE_INNER_R, CASE_OUTER_R, 0.028, caseRadial]}
              />
            </mesh>
          </>
        )}

        {/* Real-time subdivision wireframe — SINGLE mesh whose geometry is */}
        {/* hot-swapped every subdivision step by useFrame (see caseWireGeos */}
        {/* pool above). The viewer watches the cylinder reshape from a     */}
        {/* hexagonal prism through 16 progressively denser polygons into   */}
        {/* a smooth circle. Every step is a real geometric rebuild — no   */}
        {/* opacity trickery, the mesh genuinely has more triangles each   */}
        {/* time the step index ticks forward.                              */}
        <mesh
          ref={caseWireMeshRef}
          rotation={[Math.PI / 2, 0, 0]}
          geometry={caseWireGeos[0]!}
        >
          <meshBasicMaterial
            ref={caseWireMatBasicRef}
            color={blueprintColor}
            wireframe
            transparent
            opacity={0.95}
            depthWrite={false}
          />
        </mesh>

        {/* Silhouette ghosts for the OTHER watch parts. Always mounted so  */}
        {/* the full watch outline (dome + bezel + strap loop + lugs) shows */}
        {/* as a single unified blueprint from tier 0. Each fades out as    */}
        {/* its region's material takes over — no "new section appeared"    */}
        {/* pops when strap / dome / lugs come online.                       */}
        {/* Dome blueprint — single mesh, geometry hot-swapped through the  */}
        {/* domeWireGeos pool as subdivision ticks up.                        */}
        <mesh
          ref={domeWireMeshRef}
          position={[0, 0, CRYSTAL_BASE_Z]}
          geometry={domeWireGeos[0]!}
        >
          <meshBasicMaterial
            ref={domeWireMatRef}
            color={blueprintColor}
            wireframe
            transparent
            opacity={0.95}
            depthWrite={false}
          />
        </mesh>
        <mesh
          position={[0, 0, CASE_TOP_Z - 0.006]}
          geometry={bezelRingGeo}
        >
          <meshBasicMaterial
            ref={silhouetteBezelRef}
            color={blueprintColor}
            wireframe
            transparent
            opacity={0.9}
            depthWrite={false}
          />
        </mesh>
        {/* Strap blueprint — same single-mesh subdivision swap pattern.    */}
        {/* Geometry walks through strapWireGeos from a hex-loop outline to */}
        {/* the final 140×140 alligator tessellation.                        */}
        <mesh
          ref={strapWireMeshRef}
          geometry={strapWireGeos[0]!}
        >
          <meshBasicMaterial
            ref={strapWireMatRef}
            color={blueprintColor}
            wireframe
            transparent
            opacity={0.9}
            depthWrite={false}
          />
        </mesh>
        {/* Lug silhouettes — same four positions as the solid lugs.       */}
        {/* All four share a single material instance so one ref + one     */}
        {/* opacity mutation in useFrame controls the whole group.         */}
        {[
          // All four lugs need `flipY: true` — the rotation formula is
          // `ang - π/2 + π`, which equals `ang + π/2`, the angle that
          // makes the lug's local -y tip point in the radial-outward
          // direction at its anchor. Without the +π flip the top lugs
          // protrude INTO the dial instead of out toward the strap.
          { ang:  Math.PI / 2 - LUG_ANGLE, flipY: true },
          { ang:  Math.PI / 2 + LUG_ANGLE, flipY: true },
          { ang: -Math.PI / 2 + LUG_ANGLE, flipY: true },
          { ang: -Math.PI / 2 - LUG_ANGLE, flipY: true },
        ].map((lug, i) => {
          const lr = CASE_OUTER_R * 0.94;
          const lx = Math.cos(lug.ang) * lr;
          const ly = Math.sin(lug.ang) * lr;
          return (
            <mesh
              key={`lug-wire-${i}`}
              position={[lx, ly, -LUG_THICKNESS / 2]}
              rotation={[0, 0, lug.ang - Math.PI / 2 + (lug.flipY ? Math.PI : 0)]}
              geometry={lugGeo}
              material={sharedLugWireMat}
            />
          );
        })}
        {/* Legacy single-layer wireframe kept mounted (invisible) so its   */}
        {/* material ref stays valid; the useFrame loop keeps its opacity 0. */}
        <mesh rotation={[Math.PI / 2, 0, 0]} visible={false}>
          <cylinderGeometry args={[CASE_OUTER_R, CASE_OUTER_R, CASE_THICKNESS, caseRadial]} />
          <meshBasicMaterial
            ref={caseWireMatRef}
            color={blueprintColor}
            wireframe
            transparent
            opacity={0}
            depthWrite={false}
          />
        </mesh>

        {/* Crown at 3 o'clock — every 3D part on the watch must build
            from a wireframe blueprint stage first. The crown is a
            case-region detail, so its wireframe overlays share the
            shared lug wireframe material (driven by silhouetteLugRef
            via the case envelope in useFrame). The wireframe meshes
            mirror the solid meshes' geometry/transform exactly so the
            triangle build-up reads as the same object. */}
        {recipes.case.showCrown && (
          <group position={[CASE_OUTER_R + CROWN_LEN * 0.38, 0, 0]}>
            {/* Solid crown body */}
            <mesh rotation={[0, 0, Math.PI / 2]} material={polishedCaseEdgeMat}>
              <cylinderGeometry args={[CROWN_R, CROWN_R * 0.94, CROWN_LEN, 32]} />
            </mesh>
            {/* Solid fluted edge */}
            <mesh
              position={[-CROWN_LEN * 0.38, 0, 0]}
              rotation={[0, 0, Math.PI / 2]}
              material={polishedCaseEdgeMat}
            >
              <cylinderGeometry args={[CROWN_R * 1.06, CROWN_R * 1.06, 0.02, 40]} />
            </mesh>
            {/* Wireframe overlays — same geometry, blueprint amber
                wireframe material. Fade out with the case envelope. */}
            <mesh rotation={[0, 0, Math.PI / 2]} material={sharedLugWireMat}>
              <cylinderGeometry args={[CROWN_R, CROWN_R * 0.94, CROWN_LEN, 32]} />
            </mesh>
            <mesh
              position={[-CROWN_LEN * 0.38, 0, 0]}
              rotation={[0, 0, Math.PI / 2]}
              material={sharedLugWireMat}
            >
              <cylinderGeometry args={[CROWN_R * 1.06, CROWN_R * 1.06, 0.02, 40]} />
            </mesh>
          </group>
        )}

        {/* ================================================================ */}
        {/* BEZEL region — proper 3D annulus with beveled faces. Replaces   */}
        {/* the old flat ring (which read as an intersecting plane).         */}
        {/* ================================================================ */}
        {recipes.bezel.showBezel && (
          <mesh
            position={[0, 0, CASE_TOP_Z - 0.006]}
            geometry={bezelRingGeo}
            material={bezelMat}
          />
        )}
        {/* (Old bezel inner-rim torus removed — it was rotated edge-on and  */}
        {/* rendered as a thin horizontal line slicing through the dial.    */}
        {/* The beveled bezel ring above provides its own rim highlight.)    */}
        {/* Four lugs — curved horns extending from the case at ±30° from   */}
        {/* the vertical axis, anchoring the strap into the case instead    */}
        {/* of leaving it as detached floating blocks.                        */}
        {recipes.case.showCase && (
          <>
            {[
              // All four lugs use flipY: true so their tips point
              // RADIALLY OUTWARD from the case center. The top pair
              // previously had flipY: false, which made them protrude
              // INTO the dial — that bug is fixed here.
              { ang:  Math.PI / 2 - LUG_ANGLE, flipY: true }, // upper-right
              { ang:  Math.PI / 2 + LUG_ANGLE, flipY: true }, // upper-left
              { ang: -Math.PI / 2 + LUG_ANGLE, flipY: true }, // lower-left
              { ang: -Math.PI / 2 - LUG_ANGLE, flipY: true }, // lower-right
            ].map((lug, i) => {
              const lr = CASE_OUTER_R * 0.94;
              const lx = Math.cos(lug.ang) * lr;
              const ly = Math.sin(lug.ang) * lr;
              return (
                <mesh
                  key={`lug-${i}`}
                  position={[lx, ly, -LUG_THICKNESS / 2]}
                  rotation={[
                    0,
                    0,
                    lug.ang - Math.PI / 2 + (lug.flipY ? Math.PI : 0),
                  ]}
                  geometry={lugGeo}
                  material={caseMat}
                />
              );
            })}
          </>
        )}

        {/* ================================================================ */}
        {/* DIAL region                                                       */}
        {/* ================================================================ */}
        {recipes.dial.showDial && (
          <mesh
            position={[0, 0, DIAL_TOP_Z]}
            rotation={[Math.PI / 2, 0, 0]}
            material={dialMat}
          >
            <cylinderGeometry
              args={[DIAL_RADIUS, DIAL_RADIUS, DIAL_DEPTH, dialRadial]}
            />
          </mesh>
        )}

        {/* Applied baton indices at each hour position. Always mounted —  */}
        {/* their material opacity is driven by useFrame so they fade in    */}
        {/* smoothly between tiers 2.5 → 3.5 rather than popping.            */}
        {Array.from({ length: INDEX_COUNT }, (_, i) => {
          if (i === 3 || i === 6) return null;
          const angle = (i / INDEX_COUNT) * Math.PI * 2;
          const x = Math.cos(angle + Math.PI / 2) * INDEX_RADIUS;
          const y = Math.sin(angle + Math.PI / 2) * INDEX_RADIUS;
          return (
            <mesh
              key={`idx-${i}`}
              geometry={indexGeo}
              material={indexMat}
              position={[x, y, DIAL_TOP_Z + DIAL_DEPTH / 2 + 0.005]}
              rotation={[0, 0, angle + Math.PI]}
            />
          );
        })}

        {/* Date window at 3 o'clock — always rendered; fade in via the    */}
        {/* dateMatsRef materials in useFrame.                               */}
        {(() => {
          const dx = Math.cos(DATE_ANGLE) * DATE_CENTER_R;
          const dy = Math.sin(DATE_ANGLE) * DATE_CENTER_R;
          const todayDate = new Date().getDate();
          return (
            <group key="date-window" position={[dx, dy, DIAL_TOP_Z + DIAL_DEPTH / 2]}>
              <mesh position={[0, 0, 0.003]} material={accentMat}>
                <boxGeometry args={[DATE_WINDOW_W + 0.018, DATE_WINDOW_H + 0.018, 0.006]} />
              </mesh>
              <mesh position={[0, 0, 0.006]}>
                <boxGeometry args={[DATE_WINDOW_W + 0.008, DATE_WINDOW_H + 0.008, 0.004]} />
                <meshStandardMaterial
                  ref={(m) => {
                    if (m) dateMatsRef.current.frame = m;
                  }}
                  color="#0A0608"
                  transparent
                  opacity={0}
                />
              </mesh>
              <mesh position={[0, 0, 0.010]}>
                <boxGeometry args={[DATE_WINDOW_W, DATE_WINDOW_H, 0.003]} />
                <meshStandardMaterial
                  ref={(m) => {
                    if (m) dateMatsRef.current.disc = m;
                  }}
                  color="#F2EBD9"
                  roughness={0.6}
                  transparent
                  opacity={0}
                />
              </mesh>
              <mesh position={[0, 0, 0.013]}>
                <planeGeometry args={[DATE_WINDOW_W * 0.85, DATE_WINDOW_H * 0.85]} />
                <meshBasicMaterial
                  ref={(m) => {
                    if (m) dateMatsRef.current.glyph = m;
                  }}
                  map={makeDateTexture(todayDate)}
                  transparent
                  opacity={0}
                />
              </mesh>
            </group>
          );
        })()}

        {/* Sub-dial at 6 o'clock — the graining lives in the dial texture. */}
        {/* (The old torus rim here rendered edge-on as a horizontal line   */}
        {/* cutting through the dial, so it's been removed.)                 */}

        {/* Hands — hour + minute centered, seconds on the sub-dial. Always  */}
        {/* mounted; handMat + accentMat opacities are driven by useFrame.    */}
        {true && (
          <>
            <group
              ref={hourHandRef}
              position={[0, 0, DIAL_TOP_Z + DIAL_DEPTH / 2 + 0.018]}
            >
              <mesh geometry={dauphineHourGeo} material={handMat} />
            </group>
            <group
              ref={minuteHandRef}
              position={[0, 0, DIAL_TOP_Z + DIAL_DEPTH / 2 + 0.026]}
            >
              <mesh geometry={dauphineMinuteGeo} material={handMat} />
            </group>
            {/* Center cap */}
            <mesh
              position={[0, 0, DIAL_TOP_Z + DIAL_DEPTH / 2 + 0.034]}
              rotation={[Math.PI / 2, 0, 0]}
              material={accentMat}
            >
              <cylinderGeometry args={[0.038, 0.034, 0.014, 24]} />
            </mesh>
            {/* Sub-dial seconds hand — thin needle with counterweight     */}
            <group
              ref={secondsHandRef}
              position={[0, SUBDIAL_Y, DIAL_TOP_Z + DIAL_DEPTH / 2 + 0.015]}
            >
              <mesh material={handMat}>
                <boxGeometry args={[0.008, SUBDIAL_R * 1.2, 0.004]} />
              </mesh>
              <mesh material={accentMat} position={[0, SUBDIAL_R * 0.15, 0]}>
                <cylinderGeometry args={[0.016, 0.016, 0.006, 16]} />
              </mesh>
            </group>
          </>
        )}

        {/* Domed sapphire crystal                                           */}
        {recipes.bezel.showCrystal && (
          <mesh
            position={[0, 0, CRYSTAL_BASE_Z]}
            material={crystalMat}
            geometry={domeCrystalGeo}
            renderOrder={1}
          />
        )}
        {/* Cyclops magnifier — small raised dome over the date window.     */}
        {/* Uses the same crystal material, renders after the main dome so  */}
        {/* refractions composite correctly.                                  */}
        {recipes.bezel.showCrystal && recipes.dial.showIndices && (
          <mesh
            position={[
              Math.cos(DATE_ANGLE) * DATE_CENTER_R,
              Math.sin(DATE_ANGLE) * DATE_CENTER_R,
              CRYSTAL_BASE_Z + CRYSTAL_DOME_H * 0.5,
            ]}
            material={crystalMat}
            renderOrder={2}
          >
            <sphereGeometry args={[0.085, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2.4]} />
          </mesh>
        )}
        {/* Wireframe ghost for the crystal. Always mounted; opacity         */}
        {/* smoothly driven so it crossfades rather than pops.                */}
        <mesh
          position={[0, 0, CRYSTAL_BASE_Z]}
          geometry={domeCrystalGeo}
        >
          <meshBasicMaterial
            ref={bezelWireMatRef}
            color={blueprintColor}
            wireframe
            transparent
            opacity={recipes.bezel.wireOverlayAlpha}
            depthWrite={false}
          />
        </mesh>

        {/* ================================================================ */}
        {/* CASE-BACK — exhibition crystal + procedural movement              */}
        {/* ================================================================ */}
        {recipes.case.showBackMovement && (
          <>
            {/* Back sapphire crystal (flatter dome)                         */}
            <mesh
              position={[0, 0, BACK_CRYSTAL_Z]}
              rotation={[Math.PI, 0, 0]}
              geometry={backDomeGeo}
              material={crystalMat}
              renderOrder={1}
            />
            {/* Movement main plate — slightly darker gold disc             */}
            <mesh
              position={[0, 0, CASE_BOTTOM_Z + 0.005]}
              rotation={[Math.PI / 2, 0, 0]}
              material={accentMat}
            >
              <cylinderGeometry args={[CASE_INNER_R * 0.92, CASE_INNER_R * 0.92, 0.006, caseRadial]} />
            </mesh>
            {/* Rotor — half-disc that swings based on gravity              */}
            <group ref={rotorRef} position={[0, 0, CASE_BOTTOM_Z - 0.002]}>
              <mesh rotation={[Math.PI / 2, 0, 0]} material={polishedCaseEdgeMat}>
                <cylinderGeometry
                  args={[ROTOR_R, ROTOR_R, ROTOR_DEPTH, 48, 1, false, 0, Math.PI]}
                />
              </mesh>
              {/* Rotor axle */}
              <mesh rotation={[Math.PI / 2, 0, 0]} material={accentMat}>
                <cylinderGeometry args={[0.05, 0.05, ROTOR_DEPTH + 0.004, 16]} />
              </mesh>
            </group>
            {/* Three visible gears */}
            {[
              { x: -0.22, y: 0.18, r: 0.08 },
              { x: 0.26, y: -0.14, r: 0.11 },
              { x: -0.02, y: -0.32, r: 0.07 },
            ].map((g, i) => (
              <mesh
                key={`gear-${i}`}
                position={[g.x, g.y, CASE_BOTTOM_Z + 0.001]}
                rotation={[Math.PI / 2, 0, 0]}
                material={polishedCaseEdgeMat}
              >
                <cylinderGeometry args={[g.r, g.r, 0.01, 24]} />
              </mesh>
            ))}
            {/* Ruby jewels — 5 bright red bearings                          */}
            {([
              [-0.22, 0.18],
              [0.26, -0.14],
              [-0.02, -0.32],
              [0.1, 0.3],
              [-0.34, -0.22],
            ] as const).map(([px, py], i) => (
              <mesh
                key={`ruby-${i}`}
                position={[px, py, CASE_BOTTOM_Z - 0.004]}
                material={rubyMat}
              >
                <sphereGeometry args={[0.018, 16, 16]} />
              </mesh>
            ))}
          </>
        )}

        {/* ================================================================ */}
        {/* STRAP region — ONE continuous bracelet loop. A single rectangular*/}
        {/* profile extruded along a closed elliptical curve that passes     */}
        {/* through both lug pairs and wraps behind the case, eliminating    */}
        {/* every floating segment. Procedural carbon-fiber weave texture.   */}
        {/* ================================================================ */}
        {recipes.strap.showStrap && (
          <>
            {/* Thin continuous leather band (now ~56% width, ~46% depth of */}
            {/* the old cuff-style loop). Reads as a natural dress-watch    */}
            {/* strap from any viewing angle.                                 */}
            <mesh geometry={strapArmTopGeo} material={strapMat} />
            {/* Pin-and-frame buckle, positioned at the back of the wrist.  */}
            {/* Rendered with the polished case material so it matches the  */}
            {/* rose-gold lugs visually.                                      */}
            <mesh geometry={strapBuckleGeo} material={polishedCaseEdgeMat} />
          </>
        )}

        {/* (Legacy boxGeometry deployment clasp removed — its floating block
            was intersecting the inside of the closed-loop strap. The new
            buildBuckleGeometry clasp above is now the only clasp piece.) */}
      </group>
    );
  },
);

WristwatchAsset.displayName = 'WristwatchAsset';

// ---------------------------------------------------------------------------
// Small util — wrap angle into (-π, π] so the rotor finds the shortest path.
// ---------------------------------------------------------------------------

const wrapAngle = (a: number): number => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

export default WristwatchAsset;
