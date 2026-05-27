/**
 * <RealisticPhoneAsset /> — tier-aware foldable (Galaxy Z Fold design language).
 *
 * CLOSED-STATE model. Two halves sit flush against each other with a smooth
 * semi-cylindrical waterdrop-hinge spine running down the left edge. No gap
 * between the halves (closed book). No protruding side pins. Camera array
 * is three "floating" rings directly on the back glass — no bulky plate.
 *
 * 5-tier hydration recipe. Silhouette is stable across all tiers (Skeleton
 * Mirror rule); polish compounds:
 *
 *   tier 0  Blockout     — wireframe body + spine, amber line-only.
 *   tier 1  Optics       — camera rings, flash cutout, hole-punch appear.
 *                          Still wireframe.
 *   tier 2  Matte shade  — materials switch to flat-shaded opaque. Display
 *                          gets a dark grey OLED fill. Lens glass goes flat.
 *   tier 3  Detail       — side buttons, cover-screen UI, emissive display
 *                          wallpaper with Samsung One UI lockscreen (12:45).
 *   tier 4  PBR hero     — brushed titanium anisotropy, clearcoat back glass,
 *                          transmissive IOR-correct lens glass, environment
 *                          reflections. Full flagship finish.
 *
 * Region-aware hydration (semantic progressive rendering):
 *
 * The asset is split into four semantically-meaningful regions — display,
 * cameras, frame, and back — and each can be driven through the tier ladder
 * independently via the `regionTiers` prop. The default `tier` prop still
 * works (all four regions advance in lockstep), but when `regionTiers` is
 * supplied the caller can reveal the display at tier 4 while the back is
 * still at tier 0. This is what powers the semantic-vs-uniform comparison
 * on the /compare page.
 *
 * Physical ref (closed)  : ~155 × 68 × 12 mm (Galaxy Z Fold-class)
 * World units            : 2.694 × 1.08 × 0.20  (~57.5 mm per unit)
 * Frame corner radius    : 0.10  (matches display corner for alignment)
 * Bezel                  : 0.025  (razor-thin, uniform on all sides)
 * Cover display ratio    : 23.1:9 (tall narrow cover panel)
 * Spine radius           : 0.10  (semi-cylindrical waterdrop hinge)
 *
 * Everything is primitive geometry (RoundedBox + Cylinder + Plane) so the
 * colorway picker just swaps shader uniforms. No external GLB.
 */

import { forwardRef, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Tier constant — exported so the hydration wrapper can set a matching tier
// count when it constructs its timeline.
// ---------------------------------------------------------------------------

export const PHONE_TIER_COUNT = 5 as const;
export type PhoneTier = 0 | 1 | 2 | 3 | 4;

// ---------------------------------------------------------------------------
// Regions — for semantic progressive rendering. Each region owns the meshes
// that contribute to a distinct semantic surface of the phone:
//
//   display — cover screen, front glass, hole-punch, status/lockscreen UI
//   cameras — three floating lens rings + flash
//   frame   — chassis body, waterdrop hinge spine, side buttons, half-seam
//   back    — back glass panel + GALAXY wordmark decal
//
// The <SemanticHydrationHero /> allocates the Doherty time budget across
// these regions by importance weight, so the display reaches PBR hero before
// the frame even leaves wireframe.
// ---------------------------------------------------------------------------

export type PhoneRegion = 'display' | 'cameras' | 'frame' | 'back';
export const PHONE_REGIONS: readonly PhoneRegion[] = [
  'display',
  'cameras',
  'frame',
  'back',
] as const;

// ---------------------------------------------------------------------------
// Geometry constants — single source of truth.
// ---------------------------------------------------------------------------

const PHONE_HEIGHT = 2.694;          // ~155 mm tall
const PHONE_WIDTH  = 1.08;           // ~68 mm narrow (Z Fold-class)
const PHONE_DEPTH  = 0.20;           // ~12 mm closed thickness

const BODY_CORNER_RADIUS = 0.10;
const BEZEL              = 0.025;    // razor-thin symmetric bezel

// Cover display — 23.1:9 aspect (tall narrow).
const DISPLAY_W          = PHONE_WIDTH - BEZEL * 2;
const DISPLAY_H          = PHONE_HEIGHT - BEZEL * 2;
// Display corner radius matches frame - bezel so the lit rect aligns with
// the metal frame's outer radius — no mismatched rectangle-in-rounded-rect.
const DISPLAY_CORNER     = BODY_CORNER_RADIUS - BEZEL;

// Waterdrop hinge spine — semi-cylindrical cap along the left edge.
const SPINE_RADIUS       = PHONE_DEPTH / 2;
const SPINE_X            = -PHONE_WIDTH / 2 + 0.005; // overlap the frame a hair

// Seam line hinting "two halves meet here" on the three non-hinge edges.
const HALF_SEAM_Z        = 0;        // seam at the geometric mid-depth

// ---------------------------------------------------------------------------
// Camera rings — three floating rings stacked vertically on the back.
// Each ring has a raised metallic bezel + a recessed glass lens element.
// ---------------------------------------------------------------------------

const CAM_X              = -PHONE_WIDTH / 2 + 0.22; // upper-left on the back
const CAM_TOP_Y          = PHONE_HEIGHT / 2 - 0.30;
const CAM_SPACING        = 0.30;
const CAM_OUTER_R        = 0.108;    // outer bezel radius
const CAM_INNER_R        = 0.074;    // glass element radius
const CAM_BEZEL_DEPTH    = 0.028;    // how far the bezel protrudes
const CAM_SENSOR_R       = 0.024;    // aperture dot at bottom of lens well

// Flash sits to the side of the stack — its own cutout, not inside a plate.
const FLASH_X            = CAM_X + 0.22;
const FLASH_Y            = CAM_TOP_Y - CAM_SPACING;
const FLASH_R            = 0.044;

// ---------------------------------------------------------------------------
// Color presets — frame / back / accent
// ---------------------------------------------------------------------------

export interface PhoneColorway {
  readonly label: string;
  readonly frame: THREE.ColorRepresentation;
  readonly back: THREE.ColorRepresentation;
  readonly accent: THREE.ColorRepresentation;
}

export const PHONE_COLORWAYS: Record<string, PhoneColorway> = {
  titanium: {
    label: 'Phantom Black',
    frame:  '#2A2A2E',
    back:   '#0E0E12',
    accent: '#5A6B7A',
  },
  meteor: {
    label: 'Silver Shadow',
    frame:  '#8C8C90',
    back:   '#464650',
    accent: '#9AA4B0',
  },
  platinum: {
    label: 'Icy Blue',
    frame:  '#B9C7D4',
    back:   '#6F8196',
    accent: '#A8B8C8',
  },
  amber: {
    label: 'Burgundy',
    frame:  '#4A1E28',
    back:   '#2A0E14',
    accent: '#803848',
  },
};

// ---------------------------------------------------------------------------
// Cover-screen lockscreen wallpaper — Samsung One UI-ish.
// Drawn on a canvas at the correct 23.1:9 aspect so UI is physically confined
// to the emissive display layer and cannot bleed into bezels.
// ---------------------------------------------------------------------------

const WALLPAPER_CACHE = new Map<string, THREE.CanvasTexture>();

// ---------------------------------------------------------------------------
// Back decal — subtle GALAXY wordmark + hairline antenna division.
// Drawn with transparent background so it composites onto the back glass as a
// sheen, not a label. This is what stops the back reading as a dark void when
// the phone rotates past the 180° mark.
// ---------------------------------------------------------------------------

const BACK_DECAL_CACHE = new Map<string, THREE.CanvasTexture>();

const makeBackDecal = (): THREE.CanvasTexture => {
  const key = 'galaxy-back-decal';
  const cached = BACK_DECAL_CACHE.get(key);
  if (cached) return cached;

  // Match cover display aspect (23.1:9 style) — but this is sized to the full
  // back panel, so aspect ratio mirrors PHONE_WIDTH:PHONE_HEIGHT = 1.08:2.694.
  const W = 216;
  const H = 540;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    const tex = new THREE.CanvasTexture(canvas);
    BACK_DECAL_CACHE.set(key, tex);
    return tex;
  }

  // Fully transparent canvas.
  ctx.clearRect(0, 0, W, H);

  // Antenna hairline at ~70% down the back — a very faint horizontal divider.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.045)';
  ctx.fillRect(W * 0.06, H * 0.705, W * 0.88, 0.6);

  // Second hairline near the top (FCC / antenna seam).
  ctx.fillStyle = 'rgba(255, 255, 255, 0.035)';
  ctx.fillRect(W * 0.10, H * 0.22, W * 0.80, 0.5);

  // GALAXY wordmark at the bottom center — an etched sheen, not a label.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.11)';
  ctx.font = '500 14px "PP Neue Montreal", Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  // Letter-spacing emulation: draw each char separately.
  const brand = 'GALAXY';
  const letterSpacing = 6;
  const totalWidth = brand
    .split('')
    .reduce((acc, ch) => acc + ctx.measureText(ch).width + letterSpacing, -letterSpacing);
  let x = W / 2 - totalWidth / 2;
  const y = H - 24;
  for (const ch of brand) {
    ctx.fillText(ch, x + ctx.measureText(ch).width / 2, y);
    x += ctx.measureText(ch).width + letterSpacing;
  }

  // Tiny regulatory line below the wordmark.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.font = '400 5px "PP Neue Montreal", Inter, sans-serif';
  ctx.fillText('Z FOLD 7 · DESIGNED BY GALAXY · ASSEMBLED IN KOREA', W / 2, H - 10);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  BACK_DECAL_CACHE.set(key, tex);
  return tex;
};

const makeWallpaper = (accent: THREE.ColorRepresentation): THREE.CanvasTexture => {
  const key = `onesui-${String(accent)}`;
  const cached = WALLPAPER_CACHE.get(key);
  if (cached) return cached;

  // Canvas resolution picked to match the cover display's 23.1:9 ratio
  // exactly — 256 × 657 — so nothing gets stretched when mapped to the plane.
  const W = 256;
  const H = 657;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    const tex = new THREE.CanvasTexture(canvas);
    WALLPAPER_CACHE.set(key, tex);
    return tex;
  }

  // ---- Gradient wallpaper ----
  const g = ctx.createLinearGradient(0, 0, 0, H);
  const accentColor = new THREE.Color(accent).getStyle();
  g.addColorStop(0.0, '#05060A');
  g.addColorStop(0.55, '#0C1524');
  g.addColorStop(1.0, accentColor);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Subtle spotlight glow near the bottom (One UI lock-screens often have
  // an ambient glow behind the action icons).
  const glow = ctx.createRadialGradient(W / 2, H * 0.82, 5, W / 2, H * 0.82, 180);
  glow.addColorStop(0, 'rgba(235, 229, 215, 0.18)');
  glow.addColorStop(1, 'rgba(235, 229, 215, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // ---- Status bar ----
  ctx.fillStyle = 'rgba(235, 229, 215, 0.86)';
  ctx.font = '600 14px Inter, "Samsung One", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('09:12', 18, 32);
  // Right-side status glyphs — signal / wifi / battery as abstract pills.
  ctx.fillStyle = 'rgba(235, 229, 215, 0.82)';
  ctx.fillRect(W - 86, 24, 14, 10); // signal
  ctx.fillRect(W - 66, 22, 16, 12); // wifi
  // battery housing
  ctx.fillStyle = 'rgba(235, 229, 215, 0.7)';
  ctx.strokeStyle = 'rgba(235, 229, 215, 0.7)';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(W - 42, 22, 26, 12);
  ctx.fillRect(W - 38, 25, 14, 6);
  ctx.fillRect(W - 16, 26, 2, 4); // battery nib

  // ---- Hero time (Samsung One UI — large, thin, centered) ----
  // Samsung One UI uses "SamsungOne" which isn't available in browsers.
  // Inter with light weight is a reasonable stand-in for the geometric sans
  // feel. Centered, tight tracking, huge.
  ctx.fillStyle = 'rgba(246, 243, 235, 0.96)';
  ctx.textAlign = 'center';
  ctx.font = '200 108px Inter, "Samsung One", sans-serif';
  ctx.fillText('12:45', W / 2, H * 0.34);

  // Date + weather line under the time.
  ctx.fillStyle = 'rgba(235, 229, 215, 0.72)';
  ctx.font = '500 17px Inter, "Samsung One", sans-serif';
  ctx.fillText('Wednesday, April 22', W / 2, H * 0.34 + 30);
  ctx.fillStyle = 'rgba(235, 229, 215, 0.5)';
  ctx.font = '400 14px Inter, "Samsung One", sans-serif';
  ctx.fillText('72°  ·  Mostly Sunny', W / 2, H * 0.34 + 52);

  // ---- Lock icon glyph (small, centered, above the time a touch) ----
  const lockX = W / 2;
  const lockY = H * 0.24;
  ctx.strokeStyle = 'rgba(235, 229, 215, 0.7)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(lockX, lockY - 6, 7, Math.PI, 0, false);
  ctx.stroke();
  ctx.fillStyle = 'rgba(235, 229, 215, 0.72)';
  roundedRect(ctx, lockX - 9, lockY - 2, 18, 14, 2);
  ctx.fill();

  // ---- Bottom action row (phone + camera) ----
  const actY = H - 68;
  drawCircleIcon(ctx, W / 2 - 70, actY, 22, 'phone');
  drawCircleIcon(ctx, W / 2 + 70, actY, 22, 'camera');

  // Home-indicator pill (One UI retains a thin indicator at the bottom).
  ctx.fillStyle = 'rgba(235, 229, 215, 0.65)';
  roundedRect(ctx, W / 2 - 44, H - 20, 88, 4, 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  WALLPAPER_CACHE.set(key, tex);
  return tex;
};

const roundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
};

const drawCircleIcon = (
  ctx: CanvasRenderingContext2D,
  x: number, y: number, r: number, glyph: 'phone' | 'camera',
): void => {
  ctx.fillStyle = 'rgba(235, 229, 215, 0.12)';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(235, 229, 215, 0.85)';
  ctx.lineWidth = 1.6;
  if (glyph === 'phone') {
    ctx.beginPath();
    ctx.moveTo(x - 7, y - 4);
    ctx.bezierCurveTo(x - 7, y + 7, x + 4, y + 8, x + 8, y + 4);
    ctx.moveTo(x - 7, y - 4);
    ctx.lineTo(x - 3, y - 8);
    ctx.moveTo(x + 8, y + 4);
    ctx.lineTo(x + 4, y + 8);
    ctx.stroke();
  } else {
    ctx.strokeRect(x - 9, y - 5, 18, 12);
    ctx.beginPath();
    ctx.arc(x, y + 1, 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(235, 229, 215, 0.85)';
    ctx.fillRect(x + 4, y - 7, 5, 3);
  }
};

// ---------------------------------------------------------------------------
// Tier recipe — pure function mapping a tier → feature gates. Extracted so
// the component can build one recipe per region (semantic rendering) while
// preserving the original single-tier path (uniform rendering).
// ---------------------------------------------------------------------------

interface PhoneRecipe {
  readonly showBody: boolean;
  readonly showSpine: boolean;
  readonly showBackGlass: boolean;
  readonly showFrontGlass: boolean;
  readonly showLenses: boolean;
  readonly showFlash: boolean;
  readonly showDisplay: boolean;
  readonly showWallpaper: boolean;
  readonly showHolePunch: boolean;
  readonly showSideButtons: boolean;
  readonly showHalfSeam: boolean;
  readonly wireframe: boolean;
  readonly usePBR: boolean;
  readonly displayEmissive: number;
  readonly frameMetalness: number;
  readonly frameRoughness: number;
  readonly backClearcoat: number;
  /**
   * Corner smoothness / cylinder radial factor. Maps 0..4 → {1,2,3,4,6}.
   * Lower values expose visible facets on the silhouette; higher values
   * round the corners out. The Hoppe-style geometry climb — what makes the
   * triangle count actually grow as the tier advances.
   */
  readonly geometryDetail: 1 | 2 | 3 | 4 | 6;
  /**
   * Multiplier for cylinder radialSegments on lenses/spine. 1 at tier 0,
   * rising to 1 at tier 4 (the base 48 counts stay nominal at tier 4).
   */
  readonly radialSegmentScale: number;
  /**
   * Opacity for the amber wireframe ghost mesh rendered on top of the
   * body. At tier 0 the ghost is fully on — you literally see the triangles.
   * Fades out as the material PBR passes arrive.
   */
  readonly wireOverlayAlpha: number;
}

/** Tier → corner subdivision smoothness. Drives triangle count on body meshes. */
const GEOMETRY_DETAIL_FOR: Record<PhoneTier, 1 | 2 | 3 | 4 | 6> = {
  0: 1, 1: 2, 2: 3, 3: 4, 4: 6,
};

/** Tier → radial-segment scale for cylinders (spine, lens rings, flash). */
const RADIAL_SCALE_FOR: Record<PhoneTier, number> = {
  0: 0.25, 1: 0.4, 2: 0.6, 3: 0.8, 4: 1.0,
};

/**
 * Rough triangle count for a single phone region at a given tier. Summed
 * across regions gives the HUD number the user watches climb. Exported so
 * the PhoneHydrationHero + SemanticHydrationHero HUDs share one source of
 * truth.
 */
export const approxTrianglesForRegion = (
  region: PhoneRegion,
  tier: PhoneTier,
): number => {
  // Smoothness S contributes ~12(S+1)^2 tris per RoundedBox face.
  // Cylinders contribute ~radialSegments * 2 tris.
  const s = GEOMETRY_DETAIL_FOR[tier];
  const r = Math.max(4, Math.round(48 * RADIAL_SCALE_FOR[tier]));
  const boxTris = 12 * (s + 1) * (s + 1) * 6; // full RoundedBox
  switch (region) {
    case 'frame':
      // main body RoundedBox + spine cylinder + 2 buttons (at t≥3)
      return boxTris + r * 2 + (tier >= 3 ? 24 : 0);
    case 'display':
      // front glass RoundedBox + cover display RoundedBox + hole-punch
      return (
        (tier >= 2 ? boxTris : 0) +
        (tier >= 2 ? boxTris : 0) +
        (tier >= 3 ? 64 : 0)
      );
    case 'back':
      // back glass RoundedBox + decal plane
      return (tier >= 1 ? boxTris : 0) + (tier >= 1 ? 2 : 0);
    case 'cameras':
      // 3 bezel rings (2 cylinders each) + torus + lens glass + sensor + flash
      return tier >= 1 ? 3 * (r * 4 + 10 * r + r * 2 + r) + r * 2 : 0;
  }
};

/** Total triangle count across all four regions at their respective tiers. */
export const approxTrianglesTotal = (
  tiers: Record<PhoneRegion, PhoneTier>,
): number =>
  PHONE_REGIONS.reduce(
    (sum, r) => sum + approxTrianglesForRegion(r, tiers[r]),
    0,
  );

const buildRecipe = (tier: PhoneTier): PhoneRecipe => {
  const t = tier;
  return {
    showBody:          true,
    showSpine:         true,
    showBackGlass:     t >= 1,
    showFrontGlass:    t >= 2,
    showLenses:        t >= 1,
    showFlash:         t >= 1,
    showDisplay:       t >= 2,
    showWallpaper:     t >= 3,
    showHolePunch:     t >= 3,
    showSideButtons:   t >= 3,
    showHalfSeam:      t >= 3,
    wireframe:         t <= 1,
    usePBR:            t >= 4,
    displayEmissive:   t >= 3 ? 0.95 : 0.4,
    frameMetalness:    t >= 4 ? 1.0 : t >= 2 ? 0.55 : 0,
    frameRoughness:    t >= 4 ? 0.34 : t >= 2 ? 0.6 : 1.0,
    backClearcoat:     t >= 4 ? 1.0 : t >= 3 ? 0.4 : 0,
    geometryDetail:    GEOMETRY_DETAIL_FOR[t],
    radialSegmentScale: RADIAL_SCALE_FOR[t],
    // Wireframe ghost: full at t0, strong at t1, fading at t2, near-invisible
    // at t3, gone at t4. This is what the user literally SEES climbing.
    wireOverlayAlpha:  t === 0 ? 1.0 : t === 1 ? 0.65 : t === 2 ? 0.25 : t === 3 ? 0.08 : 0,
  };
};

// ---------------------------------------------------------------------------
// Material builders — one per region. Each takes the palette + the region's
// own recipe and returns only the materials that region's meshes consume.
//
// Splitting by region means a display-tier-4 material set can live alongside
// a frame-tier-0 wireframe in the same component instance — which is the
// whole premise of semantic progressive rendering.
// ---------------------------------------------------------------------------

const wireMaterial = (opacity: number): THREE.MeshBasicMaterial =>
  new THREE.MeshBasicMaterial({
    color: '#D7A86E',
    wireframe: true,
    transparent: true,
    opacity,
  });

interface FrameMaterials {
  readonly frame: THREE.Material;
  readonly button: THREE.Material;
  readonly seam: THREE.Material;
}

const buildFrameMaterials = (
  palette: PhoneColorway,
  recipe: PhoneRecipe,
): FrameMaterials => {
  const frameBase = {
    color: new THREE.Color(palette.frame),
    metalness: recipe.frameMetalness,
    roughness: recipe.frameRoughness,
  };

  const frame = recipe.wireframe
    ? wireMaterial(0.9)
    : recipe.usePBR
    ? new THREE.MeshPhysicalMaterial({
        ...frameBase,
        clearcoat: 0.25,
        clearcoatRoughness: 0.45,
        anisotropy: 0.7,
        anisotropyRotation: Math.PI / 2,
      })
    : new THREE.MeshStandardMaterial(frameBase);

  const button = new THREE.MeshStandardMaterial({
    color: new THREE.Color(palette.frame),
    metalness: recipe.frameMetalness,
    roughness: recipe.frameRoughness,
  });

  const seam = new THREE.MeshBasicMaterial({
    color: '#000000',
    transparent: true,
    opacity: 0.35,
  });

  return { frame, button, seam };
};

interface DisplayMaterials {
  readonly frontGlass: THREE.Material;
  readonly display: THREE.Material;
  readonly holePunch: THREE.Material;
}

const buildDisplayMaterials = (
  palette: PhoneColorway,
  recipe: PhoneRecipe,
): DisplayMaterials => {
  const frontGlass = recipe.wireframe
    ? wireMaterial(0.4)
    : recipe.usePBR
    ? new THREE.MeshPhysicalMaterial({
        color: '#000000',
        metalness: 0,
        roughness: 0.05,
        transmission: 0.0,
        ior: 1.52,
        clearcoat: 1.0,
        clearcoatRoughness: 0.04,
        reflectivity: 0.85,
        envMapIntensity: 1.0,
      })
    : new THREE.MeshStandardMaterial({
        color: '#05050A',
        metalness: 0.1,
        roughness: 0.25,
      });

  const wallpaperTex = recipe.showWallpaper ? makeWallpaper(palette.accent) : null;
  const display = new THREE.MeshStandardMaterial({
    color: recipe.showWallpaper ? '#FFFFFF' : '#0A0A12',
    map: wallpaperTex,
    metalness: 0,
    roughness: recipe.usePBR ? 0.18 : 0.45,
    emissive: new THREE.Color(recipe.showWallpaper ? '#151420' : '#060508'),
    emissiveIntensity: recipe.displayEmissive,
    emissiveMap: wallpaperTex,
  });

  const holePunch = new THREE.MeshBasicMaterial({ color: '#020206' });

  return { frontGlass, display, holePunch };
};

interface CameraMaterials {
  readonly lensBezel: THREE.Material;
  readonly lensGlass: THREE.Material;
  readonly sensor: THREE.Material;
  readonly flash: THREE.Material;
}

const buildCameraMaterials = (
  _palette: PhoneColorway,
  recipe: PhoneRecipe,
): CameraMaterials => {
  const lensBezel = recipe.wireframe
    ? wireMaterial(0.95)
    : new THREE.MeshStandardMaterial({
        color: '#1A1A1E',
        metalness: 0.95,
        roughness: 0.22,
      });

  const lensGlass = recipe.wireframe
    ? wireMaterial(0.6)
    : recipe.usePBR
    ? new THREE.MeshPhysicalMaterial({
        color: '#05070C',
        metalness: 0.1,
        roughness: 0.05,
        transmission: 0.18,
        thickness: 0.05,
        ior: 1.6,
        clearcoat: 1.0,
        clearcoatRoughness: 0.02,
        transparent: true,
      })
    : new THREE.MeshStandardMaterial({
        color: '#05070C',
        metalness: 0.2,
        roughness: 0.3,
      });

  const sensor = new THREE.MeshStandardMaterial({
    color: '#010104',
    metalness: 0.0,
    roughness: 0.9,
  });

  const flash = new THREE.MeshStandardMaterial({
    color: '#E4E0D6',
    emissive: new THREE.Color('#2A241A'),
    emissiveIntensity: recipe.usePBR ? 0.4 : 0.2,
    metalness: 0.3,
    roughness: 0.5,
  });

  return { lensBezel, lensGlass, sensor, flash };
};

interface BackMaterials {
  readonly back: THREE.Material;
  readonly backDecal: THREE.Material;
}

const buildBackMaterials = (
  palette: PhoneColorway,
  recipe: PhoneRecipe,
): BackMaterials => {
  const back = recipe.wireframe
    ? wireMaterial(0.55)
    : recipe.usePBR
    ? new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(palette.back),
        metalness: 0.25,
        roughness: 0.28,
        clearcoat: recipe.backClearcoat,
        clearcoatRoughness: 0.12,
        reflectivity: 0.6,
      })
    : new THREE.MeshStandardMaterial({
        color: new THREE.Color(palette.back),
        metalness: 0.2,
        roughness: 0.55,
      });

  // Back decal always uses the standard material — it's a transparent overlay
  // plane, so it shouldn't be rendered at all when the back region is in
  // wireframe mode. The component already gates on `!recipe.wireframe`.
  const backDecalTex = recipe.showBackGlass ? makeBackDecal() : null;
  const backDecal = new THREE.MeshStandardMaterial({
    map: backDecalTex,
    transparent: true,
    opacity: 1,
    color: '#FFFFFF',
    metalness: recipe.usePBR ? 0.35 : 0.15,
    roughness: recipe.usePBR ? 0.28 : 0.5,
    depthWrite: false,
  });

  return { back, backDecal };
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface RealisticPhoneAssetProps {
  /** Named colorway, from PHONE_COLORWAYS. */
  readonly colorway?: keyof typeof PHONE_COLORWAYS;
  /** Hydration tier (0..4). Defaults to the hero tier. */
  readonly tier?: PhoneTier;
  /**
   * Optional per-region tier overrides. When provided, each region uses the
   * supplied tier; missing keys fall back to the `tier` prop. This is what
   * powers semantic progressive rendering — e.g. `{display: 4, back: 0}`
   * reveals the screen in full PBR while the back is still a wireframe.
   */
  readonly regionTiers?: Partial<Record<PhoneRegion, PhoneTier>>;
  /** Slow Y rotation in rad/sec (default 0.25). */
  readonly autoRotate?: number;
  /** Scale multiplier. */
  readonly scale?: number;
  /** Parallax tilt from pointer (0 disables). */
  readonly pointerTilt?: number;
  /** Starting Y rotation so you see a 3/4 view on first paint. */
  readonly initialRotationY?: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const RealisticPhoneAsset = forwardRef<THREE.Group, RealisticPhoneAssetProps>(
  (
    {
      colorway = 'titanium',
      tier = 4,
      regionTiers,
      autoRotate = 0.25,
      scale = 1,
      pointerTilt = 0.25,
      initialRotationY = -0.55,
    },
    ref,
  ) => {
    const rootRef = useRef<THREE.Group | null>(null);
    const initedRef = useRef(false);
    const tiltTargetRef = useRef(0);

    const palette: PhoneColorway =
      PHONE_COLORWAYS[colorway] ?? (PHONE_COLORWAYS.titanium as PhoneColorway);

    // -------------------------------------------------------------------
    // Resolve per-region tiers. When `regionTiers` is not supplied, all
    // four regions fall through to `tier` — which is exactly the uniform
    // progressive rendering the <PhoneHydrationHero /> expects.
    // -------------------------------------------------------------------
    const tiers = useMemo(() => ({
      display: regionTiers?.display ?? tier,
      cameras: regionTiers?.cameras ?? tier,
      frame:   regionTiers?.frame ?? tier,
      back:    regionTiers?.back ?? tier,
    }), [
      regionTiers?.display,
      regionTiers?.cameras,
      regionTiers?.frame,
      regionTiers?.back,
      tier,
    ]);

    // -------------------------------------------------------------------
    // Per-region recipes. Each drives its own feature gates + shading.
    // -------------------------------------------------------------------
    const recipes = useMemo(() => ({
      display: buildRecipe(tiers.display),
      cameras: buildRecipe(tiers.cameras),
      frame:   buildRecipe(tiers.frame),
      back:    buildRecipe(tiers.back),
    }), [tiers]);

    // -------------------------------------------------------------------
    // Per-region material sets. Each built from ONLY its region's recipe,
    // so a display-tier-4 PBR clearcoat can coexist with a frame-tier-0
    // wireframe in the same rendered scene.
    // -------------------------------------------------------------------
    const frameMats   = useMemo(() => buildFrameMaterials(palette, recipes.frame), [palette, recipes.frame]);
    const displayMats = useMemo(() => buildDisplayMaterials(palette, recipes.display), [palette, recipes.display]);
    const cameraMats  = useMemo(() => buildCameraMaterials(palette, recipes.cameras), [palette, recipes.cameras]);
    const backMats    = useMemo(() => buildBackMaterials(palette, recipes.back), [palette, recipes.back]);

    const frameRec   = recipes.frame;
    const displayRec = recipes.display;
    const camerasRec = recipes.cameras;
    const backRec    = recipes.back;

    // -------------------------------------------------------------------
    // Initial pose + auto-rotate + pointer parallax.
    // -------------------------------------------------------------------
    useFrame((state, dt) => {
      const root = rootRef.current;
      if (!root) return;

      if (!initedRef.current) {
        root.rotation.y = initialRotationY;
        initedRef.current = true;
      }

      if (autoRotate !== 0) {
        root.rotation.y += dt * autoRotate;
      }

      if (pointerTilt > 0) {
        const p = state.pointer; // -1..1
        tiltTargetRef.current = p.y * pointerTilt * 0.5;
        root.rotation.x += (tiltTargetRef.current - root.rotation.x) * 0.06;
      }
    });

    // -------------------------------------------------------------------
    // Body smoothness — keyed on the frame region's tier so the main body
    // faceting matches the frame's shading state. At tier 0 the corners
    // show visible facets; by tier 4 they're fully rounded.
    // -------------------------------------------------------------------
    const bodySmoothness    = recipes.frame.geometryDetail;
    const displaySmoothness = recipes.display.geometryDetail;
    const backSmoothness    = recipes.back.geometryDetail;
    const bodyCrease        = tiers.frame <= 1 ? 0.8 : 0.4;
    // Cylinder radial-segment scale by region. Camera + spine use 48 at full
    // fidelity; at tier 0 they drop to ~12 so the silhouette is visibly faceted.
    const spineRadial  = Math.max(6, Math.round(48 * recipes.frame.radialSegmentScale));
    const camRadial    = Math.max(6, Math.round(48 * recipes.cameras.radialSegmentScale));
    const flashRadial  = Math.max(6, Math.round(32 * recipes.cameras.radialSegmentScale));
    const sensorRadial = Math.max(6, Math.round(24 * recipes.cameras.radialSegmentScale));

    // Z offsets — keep all surfaces dense and flush with the frame. No
    // "hollow bumper" gap; the glass panels hug the frame faces directly.
    const FRONT_GLASS_Z  =  PHONE_DEPTH / 2 + 0.0005;
    const BACK_GLASS_Z   = -PHONE_DEPTH / 2 - 0.0005;
    const DISPLAY_Z      =  PHONE_DEPTH / 2 + 0.003;   // top of front glass

    // Camera ring positions.
    const cams = [
      { y: CAM_TOP_Y - CAM_SPACING * 0, label: 'main' },
      { y: CAM_TOP_Y - CAM_SPACING * 1, label: 'tele' },
      { y: CAM_TOP_Y - CAM_SPACING * 2, label: 'ultrawide' },
    ];
    const ringCenterZ = BACK_GLASS_Z - CAM_BEZEL_DEPTH / 2 - 0.002;

    return (
      <group
        ref={(node) => {
          rootRef.current = node;
          if (typeof ref === 'function') {
            ref(node);
          } else if (ref) {
            (ref as React.MutableRefObject<THREE.Group | null>).current = node;
          }
        }}
        scale={scale}
      >
        {/* ============================================================ */}
        {/* FRAME region — chassis body, hinge spine, buttons, half-seam */}
        {/* ============================================================ */}
        <RoundedBox
          args={[PHONE_WIDTH, PHONE_HEIGHT, PHONE_DEPTH]}
          radius={BODY_CORNER_RADIUS}
          smoothness={bodySmoothness}
          creaseAngle={bodyCrease}
          material={frameMats.frame}
        />
        {/* Wireframe ghost — same geometry, amber lines. Shows actual      */}
        {/* triangle density at low tiers; opacity fades as the tier climbs */}
        {/* so the mesh "builds" in real time (Hoppe-style densification).  */}
        {recipes.frame.wireOverlayAlpha > 0.01 && (
          <RoundedBox
            args={[PHONE_WIDTH + 0.002, PHONE_HEIGHT + 0.002, PHONE_DEPTH + 0.002]}
            radius={BODY_CORNER_RADIUS}
            smoothness={bodySmoothness}
            creaseAngle={bodyCrease}
          >
            <meshBasicMaterial
              color="#D7A86E"
              wireframe
              transparent
              opacity={recipes.frame.wireOverlayAlpha}
              depthTest
            />
          </RoundedBox>
        )}

        {/* Waterdrop-hinge spine — semi-cylindrical cap along the left    */}
        {/* edge. Gives the closed foldable its characteristic curved      */}
        {/* binding without any visible gap between the halves.            */}
        {frameRec.showSpine && (
          <mesh
            position={[SPINE_X, 0, 0]}
            rotation={[0, 0, 0]}
            material={frameMats.frame}
          >
            <cylinderGeometry
              args={[SPINE_RADIUS, SPINE_RADIUS, PHONE_HEIGHT, spineRadial, 1, false, Math.PI / 2, Math.PI]}
            />
          </mesh>
        )}

        {/* Half-seam hint — razor-thin dark line on the three non-hinge   */}
        {/* edges to suggest the two halves meet exactly at the mid-plane. */}
        {frameRec.showHalfSeam && (
          <>
            {/* Top edge */}
            <mesh position={[0.02, PHONE_HEIGHT / 2 + 0.0005, HALF_SEAM_Z]} material={frameMats.seam}>
              <boxGeometry args={[PHONE_WIDTH - 0.05, 0.003, PHONE_DEPTH - 0.005]} />
            </mesh>
            {/* Bottom edge */}
            <mesh position={[0.02, -PHONE_HEIGHT / 2 - 0.0005, HALF_SEAM_Z]} material={frameMats.seam}>
              <boxGeometry args={[PHONE_WIDTH - 0.05, 0.003, PHONE_DEPTH - 0.005]} />
            </mesh>
            {/* Right edge */}
            <mesh position={[PHONE_WIDTH / 2 + 0.0005, 0, HALF_SEAM_Z]} material={frameMats.seam}>
              <boxGeometry args={[0.003, PHONE_HEIGHT - 0.05, PHONE_DEPTH - 0.005]} />
            </mesh>
          </>
        )}

        {/* ============================================================ */}
        {/* DISPLAY region — front glass, cover screen, hole-punch cam   */}
        {/* ============================================================ */}
        {displayRec.showFrontGlass && (
          <RoundedBox
            args={[PHONE_WIDTH - 0.002, PHONE_HEIGHT - 0.002, 0.006]}
            radius={BODY_CORNER_RADIUS - 0.001}
            smoothness={displaySmoothness}
            position={[0, 0, FRONT_GLASS_Z]}
            material={displayMats.frontGlass}
          />
        )}

        {/* Cover display — emissive RoundedBox so it has rounded corners */}
        {/* matching the frame. Wallpaper is a CanvasTexture, masked to   */}
        {/* this geometry only — cannot bleed into bezels.                */}
        {displayRec.showDisplay && (
          <RoundedBox
            args={[DISPLAY_W, DISPLAY_H, 0.002]}
            radius={DISPLAY_CORNER}
            smoothness={displaySmoothness}
            position={[0, 0, DISPLAY_Z]}
            material={displayMats.display}
          />
        )}
        {/* Display wireframe ghost — only renders while the display      */}
        {/* region is still at a wireframe tier. Shows the actual screen  */}
        {/* mesh density. Uses front glass bounds so it stays aligned.     */}
        {recipes.display.wireOverlayAlpha > 0.01 && (
          <RoundedBox
            args={[PHONE_WIDTH - 0.002, PHONE_HEIGHT - 0.002, 0.006]}
            radius={BODY_CORNER_RADIUS - 0.001}
            smoothness={displaySmoothness}
            position={[0, 0, FRONT_GLASS_Z + 0.0005]}
          >
            <meshBasicMaterial
              color="#D7A86E"
              wireframe
              transparent
              opacity={recipes.display.wireOverlayAlpha}
            />
          </RoundedBox>
        )}

        {/* Hole-punch selfie camera — single centered circle at top. */}
        {displayRec.showHolePunch && (
          <mesh
            position={[0, PHONE_HEIGHT / 2 - BEZEL - 0.09, DISPLAY_Z + 0.0015]}
            material={displayMats.holePunch}
          >
            <circleGeometry args={[0.026, 32]} />
          </mesh>
        )}

        {/* ============================================================ */}
        {/* BACK region — back glass panel + GALAXY wordmark decal       */}
        {/* ============================================================ */}
        {backRec.showBackGlass && (
          <RoundedBox
            args={[PHONE_WIDTH - 0.002, PHONE_HEIGHT - 0.002, 0.006]}
            radius={BODY_CORNER_RADIUS - 0.001}
            smoothness={backSmoothness}
            position={[0, 0, BACK_GLASS_Z]}
            material={backMats.back}
          />
        )}
        {/* Back wireframe ghost — visible while back region is still low-tier. */}
        {recipes.back.wireOverlayAlpha > 0.01 && (
          <RoundedBox
            args={[PHONE_WIDTH - 0.002, PHONE_HEIGHT - 0.002, 0.006]}
            radius={BODY_CORNER_RADIUS - 0.001}
            smoothness={backSmoothness}
            position={[0, 0, BACK_GLASS_Z - 0.0005]}
          >
            <meshBasicMaterial
              color="#D7A86E"
              wireframe
              transparent
              opacity={recipes.back.wireOverlayAlpha}
            />
          </RoundedBox>
        )}

        {/* Back decal — thin plane sitting just outside the back glass with */}
        {/* a GALAXY wordmark + antenna hairlines as an etched sheen. This is */}
        {/* what stops the back reading as a featureless void. Rotated 180°   */}
        {/* around Y so the normal points in -Z (outward from back).          */}
        {backRec.showBackGlass && !backRec.wireframe && (
          <mesh
            position={[0, 0, BACK_GLASS_Z - 0.0045]}
            rotation={[0, Math.PI, 0]}
            material={backMats.backDecal}
          >
            <planeGeometry args={[PHONE_WIDTH - 0.06, PHONE_HEIGHT - 0.06]} />
          </mesh>
        )}

        {/* ============================================================ */}
        {/* CAMERAS region — three floating rings + flash                */}
        {/* Each ring is an OPEN-ENDED bezel tube (so the lens well is a  */}
        {/* real cavity you can see into), a recessed glass disc, and a   */}
        {/* dark sensor at the bottom of the well.                        */}
        {/* ============================================================ */}
        {camerasRec.showLenses &&
          cams.map((cam, i) => (
            <group key={`cam-${i}`} position={[CAM_X, cam.y, ringCenterZ]}>
              {/* Outer bezel — open-ended metal tube (ring from any angle). */}
              <mesh rotation={[Math.PI / 2, 0, 0]} material={cameraMats.lensBezel}>
                <cylinderGeometry
                  args={[CAM_OUTER_R, CAM_OUTER_R, CAM_BEZEL_DEPTH, camRadial, 1, true]}
                />
              </mesh>
              {/* Inner bezel — a slightly smaller open tube inside the     */}
              {/* outer bezel, creating a visible step-down into the well.  */}
              {!camerasRec.wireframe && (
                <mesh
                  position={[0, 0, CAM_BEZEL_DEPTH * 0.15]}
                  rotation={[Math.PI / 2, 0, 0]}
                  material={cameraMats.lensBezel}
                >
                  <cylinderGeometry
                    args={[CAM_INNER_R + 0.008, CAM_INNER_R + 0.008, CAM_BEZEL_DEPTH * 0.7, camRadial, 1, true]}
                  />
                </mesh>
              )}
              {/* Inner torus rim — catches a highlight where the bezel    */}
              {/* steps down to meet the glass. Reads as machined lip.      */}
              {!camerasRec.wireframe && (
                <mesh
                  position={[0, 0, CAM_BEZEL_DEPTH * 0.2]}
                  rotation={[Math.PI / 2, 0, 0]}
                  material={cameraMats.lensBezel}
                >
                  <torusGeometry args={[CAM_INNER_R + 0.006, 0.005, Math.max(4, Math.round(10 * recipes.cameras.radialSegmentScale)), camRadial]} />
                </mesh>
              )}
              {/* Glass element — recessed ~30% into the well. Short        */}
              {/* cylinder so both caps + side wall render regardless of    */}
              {/* view angle; IOR transmission at hero tier refracts.       */}
              <mesh
                position={[0, 0, CAM_BEZEL_DEPTH * 0.18]}
                rotation={[Math.PI / 2, 0, 0]}
                material={cameraMats.lensGlass}
              >
                <cylinderGeometry
                  args={[CAM_INNER_R, CAM_INNER_R, 0.006, camRadial]}
                />
              </mesh>
              {/* Sensor — dark disc at the deep bottom of the well. The   */}
              {/* viewer sees it through the glass lens, exactly like a     */}
              {/* real camera module.                                       */}
              {!camerasRec.wireframe && (
                <mesh
                  position={[0, 0, CAM_BEZEL_DEPTH * 0.42]}
                  rotation={[Math.PI / 2, 0, 0]}
                  material={cameraMats.sensor}
                >
                  <cylinderGeometry
                    args={[CAM_SENSOR_R, CAM_SENSOR_R, 0.002, sensorRadial]}
                  />
                </mesh>
              )}
            </group>
          ))}

        {/* Flash — separate cutout outside the camera stack. */}
        {camerasRec.showFlash && (
          <group position={[FLASH_X, FLASH_Y, ringCenterZ]}>
            <mesh rotation={[Math.PI / 2, 0, 0]} material={cameraMats.lensBezel}>
              <cylinderGeometry args={[FLASH_R + 0.010, FLASH_R + 0.010, CAM_BEZEL_DEPTH * 0.7, flashRadial]} />
            </mesh>
            {!camerasRec.wireframe && (
              <mesh
                position={[0, 0, -CAM_BEZEL_DEPTH * 0.1]}
                rotation={[Math.PI / 2, 0, 0]}
                material={cameraMats.flash}
              >
                <cylinderGeometry args={[FLASH_R, FLASH_R, CAM_BEZEL_DEPTH * 0.5, flashRadial]} />
              </mesh>
            )}
          </group>
        )}

        {/* ============================================================ */}
        {/* FRAME region (continued) — side buttons                      */}
        {/* ============================================================ */}
        {frameRec.showSideButtons && (
          <>
            {/* Power — tiny pill barely protruding from right rail (~1mm).   */}
            {/* Placed so its OUTER face sits just beyond PHONE_WIDTH/2, with */}
            {/* most of the pill buried inside the frame. The short 0.02     */}
            {/* thickness along X means the visible nub is <0.01 outside the */}
            {/* body — matches real flagship hardware silhouette.            */}
            <mesh
              position={[PHONE_WIDTH / 2 + 0.006, 0.55, 0]}
              material={frameMats.button}
            >
              <boxGeometry args={[0.02, 0.22, PHONE_DEPTH * 0.55]} />
            </mesh>
            {/* Volume (single long pill) */}
            <mesh
              position={[PHONE_WIDTH / 2 + 0.006, 0.22, 0]}
              material={frameMats.button}
            >
              <boxGeometry args={[0.02, 0.42, PHONE_DEPTH * 0.55]} />
            </mesh>
          </>
        )}
      </group>
    );
  },
);

RealisticPhoneAsset.displayName = 'RealisticPhoneAsset';

export default RealisticPhoneAsset;
