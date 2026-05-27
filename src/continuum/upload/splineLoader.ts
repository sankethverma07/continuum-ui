/**
 * Spline runtime → THREE.Scene extraction.
 *
 * Spline scenes ship as .splinecode files (a binary serialisation of the
 * full Spline application — scene graph + materials + animations +
 * interactivity logic). They're not a standard 3D format; they only
 * load via @splinetool/runtime, which builds an Application instance.
 *
 * The Application exposes its underlying THREE.Scene once loaded — that
 * THREE.Scene is what we hand to the LOD engine. So the user's Spline
 * design is preserved exactly, AND the progressive wireframe → material
 * reveal runs on top.
 *
 * The runtime is lazy-loaded from esm.sh on first use. This keeps the
 * main bundle thin (the package is ~200KB) and avoids requiring users
 * to `npm install @splinetool/runtime` to test the feature.
 *
 * To pin the runtime version OR avoid runtime-fetched modules, install
 * locally and replace the dynamic import with a static one:
 *   import { Application } from '@splinetool/runtime';
 */

import * as THREE from 'three';

// Use the latest runtime — Spline ships breaking format changes regularly
// and pinning an older version causes "Data read, but end of buffer not
// reached" on scenes serialised with newer encoders. esm.sh resolves
// `@latest` to whatever the npm registry currently points at.
const SPLINE_RUNTIME_CDN = 'https://esm.sh/@splinetool/runtime@latest';

interface SplineApplicationLike {
  load(url: string): Promise<unknown>;
  // The runtime exposes the scene at different property paths depending
  // on version (some have `.scene`, some have `.runtime.scene`, some
  // bury it on a private `_runtime`). We walk the object graph below.
  [key: string]: unknown;
}

interface SplineRuntimeModule {
  Application: new (canvas: HTMLCanvasElement) => SplineApplicationLike;
}

let _runtimePromise: Promise<SplineRuntimeModule> | null = null;

const getRuntime = (): Promise<SplineRuntimeModule> => {
  if (_runtimePromise) return _runtimePromise;
  _runtimePromise = import(/* @vite-ignore */ SPLINE_RUNTIME_CDN) as Promise<SplineRuntimeModule>;
  return _runtimePromise;
};

// ---------------------------------------------------------------------------
// Scene extraction — finds the THREE.Scene anywhere inside the loaded
// Spline Application, regardless of which version's property layout it has.
// ---------------------------------------------------------------------------

/**
 * THREE.Scene marker — every Scene has `.isScene === true`. This is part
 * of THREE's public type-tagging system and is stable across versions.
 */
const isThreeScene = (val: unknown): val is THREE.Scene =>
  !!val && typeof val === 'object' && (val as { isScene?: boolean }).isScene === true;

/** Recognises any THREE.Object3D subclass — scene/group/mesh/etc. */
const isThreeObject3D = (val: unknown): val is THREE.Object3D =>
  !!val && typeof val === 'object' && (val as { isObject3D?: boolean }).isObject3D === true;

/**
 * Walk the Spline Application's object graph looking for a THREE.Scene.
 * Limits depth + tracks visited refs to guard against cycles. Returns
 * the first Scene found OR — as a fallback — the most-populated
 * Object3D (some Spline versions expose a Group, not a Scene).
 */
const findSceneInApp = (
  app: SplineApplicationLike,
): { scene: THREE.Object3D; via: string } | null => {
  const visited = new WeakSet<object>();
  let bestObject3D: { scene: THREE.Object3D; via: string; size: number } | null = null;

  const walk = (
    node: unknown,
    path: string,
    depth: number,
  ): { scene: THREE.Scene; via: string } | null => {
    if (depth > 4 || node == null || typeof node !== 'object') return null;
    if (visited.has(node)) return null;
    visited.add(node);

    if (isThreeScene(node)) return { scene: node, via: path };

    // Track the largest Object3D as a fallback in case no Scene is found.
    if (isThreeObject3D(node)) {
      const size = (node.children?.length ?? 0);
      if (!bestObject3D || size > bestObject3D.size) {
        bestObject3D = { scene: node, via: path, size };
      }
    }

    // Look at known property names first — these are common across
    // Spline runtime versions, so we usually short-circuit on the
    // first hit. Falls back to a generic key walk if none match.
    const PRIORITY_KEYS = ['scene', 'runtime', '_runtime', '_scene', 'canvas3D', 'three', 'engine'];
    for (const key of PRIORITY_KEYS) {
      try {
        const child = (node as Record<string, unknown>)[key];
        const found = walk(child, `${path}.${key}`, depth + 1);
        if (found) return found;
      } catch { /* getter threw — ignore and continue */ }
    }
    // Generic enumeration for whatever's left.
    for (const key of Object.keys(node)) {
      if (PRIORITY_KEYS.includes(key)) continue;
      try {
        const child = (node as Record<string, unknown>)[key];
        const found = walk(child, `${path}.${key}`, depth + 1);
        if (found) return found;
      } catch { /* continue */ }
    }
    return null;
  };

  const sceneHit = walk(app, 'app', 0);
  if (sceneHit) return sceneHit;
  // No Scene found, but we tracked the most-populated Object3D — use
  // that. Spline-runtime versions that only expose a root Group still
  // contain everything we need to render.
  if (bestObject3D) {
    const fallback: { scene: THREE.Object3D; via: string; size: number } = bestObject3D;
    return { scene: fallback.scene, via: `${fallback.via} (fallback Object3D)` };
  }
  return null;
};

// ---------------------------------------------------------------------------
// Bake — convert Spline's custom-attribute / ShaderMaterial scene into
// plain THREE primitives that both clone() and GLTFExporter can handle.
// ---------------------------------------------------------------------------

/**
 * Spline's runtime uses subclassed BufferAttributes (e.g. its own `H1`
 * type) whose `init()` only works when the original Spline data path is
 * intact. Calling `geometry.clone()` re-runs the constructor with no
 * data, throwing "Cannot read properties of undefined (reading 'data')".
 *
 * Spline materials are custom THREE.ShaderMaterial instances that
 * GLTFExporter explicitly doesn't support — it warns and drops them.
 *
 * Solution: walk every Mesh once and rebuild it from raw arrays. The
 * result is a parallel THREE scene graph using only stock primitives,
 * which round-trips through the engine's clone path and through
 * GLTFExporter without complaint. Spline's animation loop keeps
 * mutating the *original* scene's transforms — we copy them once at
 * bake time, so the baked scene is a snapshot.
 */
const bakeSplineScene = (root: THREE.Object3D): THREE.Object3D => {
  const baked = new THREE.Group();
  baked.name = root.name || 'spline-baked';
  baked.position.copy(root.position);
  baked.quaternion.copy(root.quaternion);
  baked.scale.copy(root.scale);

  const cloneAttribute = (attr: THREE.BufferAttribute): THREE.BufferAttribute => {
    // Use the underlying array, NOT .clone() (which routes through
    // Spline's custom subclass init). We always materialize into a
    // standard Float32Array — Spline geometries don't need integer
    // attribute precision for our purposes.
    const src = attr.array as ArrayLike<number>;
    const copy = new Float32Array(src.length);
    for (let i = 0; i < src.length; i++) copy[i] = src[i] as number;
    return new THREE.BufferAttribute(copy, attr.itemSize, attr.normalized);
  };

  /** Index buffers must stay integer-typed (Uint16/Uint32) — float
   *  indices are silently rejected by THREE. Pick the smallest type
   *  that fits the largest vertex reference. */
  const cloneIndex = (idx: THREE.BufferAttribute): THREE.BufferAttribute => {
    const src = idx.array as ArrayLike<number>;
    let max = 0;
    for (let i = 0; i < src.length; i++) {
      const v = src[i] as number;
      if (v > max) max = v;
    }
    const Ctor = max < 65536 ? Uint16Array : Uint32Array;
    const copy = new Ctor(src.length);
    for (let i = 0; i < src.length; i++) copy[i] = src[i] as number;
    return new THREE.BufferAttribute(copy, 1, false);
  };

  const bakeGeometry = (src: THREE.BufferGeometry): THREE.BufferGeometry => {
    const geom = new THREE.BufferGeometry();
    // Copy each known attribute via raw-array clone (skip Spline's custom
    // subclasses by extracting data and rebuilding as plain BufferAttribute).
    const attrNames = ['position', 'normal', 'uv', 'uv2', 'color'];
    for (const name of attrNames) {
      const src_attr = src.getAttribute(name) as THREE.BufferAttribute | undefined;
      if (src_attr && src_attr.array) {
        try { geom.setAttribute(name, cloneAttribute(src_attr)); } catch { /* skip */ }
      }
    }
    if (src.index) {
      try { geom.setIndex(cloneIndex(src.index as THREE.BufferAttribute)); } catch { /* skip */ }
    }
    geom.computeBoundingSphere();
    geom.computeBoundingBox();
    return geom;
  };

  const bakeMaterial = (src: THREE.Material | THREE.Material[]): THREE.Material => {
    // Spline materials are usually ShaderMaterial subclasses. Their colors
    // hide in many places — uniforms, defines, custom-named props. We
    // probe ALL of them and take the first one that looks like a Color.
    const m = (Array.isArray(src) ? src[0] : src) as THREE.Material & {
      uniforms?: Record<string, { value?: unknown }>;
      defines?: Record<string, unknown>;
      color?: THREE.Color;
      diffuse?: THREE.Color;
      emissive?: THREE.Color;
      [k: string]: unknown;
    };

    const baseColor = new THREE.Color();
    let found = false;

    // Helper — accept anything Color-shaped (THREE.Color OR plain {r,g,b}).
    const tryColor = (v: unknown): boolean => {
      if (!v || typeof v !== 'object') return false;
      const c = v as { isColor?: boolean; r?: number; g?: number; b?: number };
      if (c.isColor && typeof c.r === 'number') {
        baseColor.setRGB(c.r, c.g!, c.b!);
        return true;
      }
      if (typeof c.r === 'number' && typeof c.g === 'number' && typeof c.b === 'number') {
        // Some Spline uniforms ship plain {r,g,b} not THREE.Color.
        baseColor.setRGB(c.r, c.g, c.b);
        return true;
      }
      return false;
    };

    // 1. Direct material props (most common in stock THREE materials).
    if (!found && tryColor(m?.color)) found = true;
    if (!found && tryColor(m?.diffuse)) found = true;

    // 2. Spline shader uniforms — try every key whose value looks like a
    //    color. Spline names them inconsistently (uColor, _Color, color,
    //    diffuseColor, baseColor, tintColor, etc.) so brute-force is the
    //    only reliable approach.
    if (!found && m?.uniforms) {
      for (const key of Object.keys(m.uniforms)) {
        if (tryColor(m.uniforms[key]?.value)) {
          // Skip emissive/specular/light uniforms — we want the base albedo.
          if (/emiss|spec|light|shadow|fog|env/i.test(key)) continue;
          found = true;
          break;
        }
      }
    }

    // 3. As a last resort — sample any direct Color-typed property on the
    //    material (Spline subclasses sometimes attach `_color`, `albedo`).
    if (!found) {
      for (const key of Object.keys(m)) {
        if (/color|albedo|tint/i.test(key) && tryColor(m[key as keyof typeof m])) {
          found = true;
          break;
        }
      }
    }

    // 4. Truly nothing — neutral fallback.
    if (!found) baseColor.setRGB(0.78, 0.78, 0.82);

    // Same probe for emissive (used by Spline's "glow" material option).
    let emissive: THREE.Color | undefined;
    if (m?.emissive?.isColor) emissive = m.emissive.clone();
    else if (m?.uniforms) {
      for (const key of Object.keys(m.uniforms)) {
        if (/emiss|glow/i.test(key)) {
          const v = m.uniforms[key]?.value;
          if (v && typeof v === 'object' && (v as { r?: number }).r !== undefined) {
            emissive = new THREE.Color(
              (v as { r: number }).r,
              (v as { g: number }).g,
              (v as { b: number }).b,
            );
            break;
          }
        }
      }
    }

    // -------- Texture extraction --------
    // Spline materials carry texture data inside their shader uniforms.
    // We probe every uniform and pick out anything that's a THREE.Texture
    // (`isTexture === true`), then route by uniform name into the right
    // MeshStandardMaterial map slot. Spline names textures with patterns
    // like `tDiffuse`, `albedoMap`, `_BaseTexture`, `normalMap`, etc.
    let map: THREE.Texture | null = null;
    let normalMap: THREE.Texture | null = null;
    let roughnessMap: THREE.Texture | null = null;
    let metalnessMap: THREE.Texture | null = null;
    let emissiveMap: THREE.Texture | null = null;
    let aoMap: THREE.Texture | null = null;

    const isTexture = (v: unknown): v is THREE.Texture =>
      !!v && typeof v === 'object' && (v as { isTexture?: boolean }).isTexture === true;

    // Direct material props first (some Spline materials do expose .map).
    if (isTexture((m as unknown as { map?: unknown }).map)) map = (m as unknown as { map: THREE.Texture }).map;
    if (isTexture((m as unknown as { normalMap?: unknown }).normalMap)) normalMap = (m as unknown as { normalMap: THREE.Texture }).normalMap;
    if (isTexture((m as unknown as { roughnessMap?: unknown }).roughnessMap)) roughnessMap = (m as unknown as { roughnessMap: THREE.Texture }).roughnessMap;

    if (m?.uniforms) {
      for (const key of Object.keys(m.uniforms)) {
        const v = m.uniforms[key]?.value;
        if (!isTexture(v)) continue;
        const k = key.toLowerCase();
        // Route by uniform name. Order matters — `normalmap` matches both
        // /normal/ and /map/, so we test the more-specific patterns first.
        if (!normalMap && /normal/.test(k)) { normalMap = v; continue; }
        if (!roughnessMap && /rough/.test(k)) { roughnessMap = v; continue; }
        if (!metalnessMap && /metal/.test(k)) { metalnessMap = v; continue; }
        if (!emissiveMap && /(emiss|glow)/.test(k)) { emissiveMap = v; continue; }
        if (!aoMap && /(\bao\b|ambientocc|occlus)/.test(k)) { aoMap = v; continue; }
        // Any remaining diffuse-style texture goes in the base color slot.
        if (!map && /(diffuse|albedo|basecolor|color|tdiffuse|texture|map)/.test(k)) {
          map = v;
          continue;
        }
      }
    }

    // Re-encode each rescued texture for the standard PBR pipeline.
    // Spline's textures often default to NoColorSpace which makes diffuse
    // maps render too dark in our scene — flip to SRGBColorSpace so the
    // gamma matches the rest of the engine's PBR.
    if (map) map.colorSpace = THREE.SRGBColorSpace;
    if (emissiveMap) emissiveMap.colorSpace = THREE.SRGBColorSpace;
    // Normal/roughness/metalness/ao stay in NoColorSpace (they're data, not color).

    const baked = new THREE.MeshStandardMaterial({
      color: baseColor,
      map: map ?? undefined,
      normalMap: normalMap ?? undefined,
      roughnessMap: roughnessMap ?? undefined,
      metalnessMap: metalnessMap ?? undefined,
      emissiveMap: emissiveMap ?? undefined,
      aoMap: aoMap ?? undefined,
      emissive: emissive ?? new THREE.Color(0, 0, 0),
      emissiveIntensity: emissive ? 1 : 0,
      metalness: metalnessMap ? 1 : 0.05,
      roughness: roughnessMap ? 1 : 0.55,
      transparent: m?.transparent ?? false,
      opacity: m?.opacity ?? 1,
      side: THREE.DoubleSide,
    });
    if (map || normalMap || roughnessMap || metalnessMap || emissiveMap) {
      // eslint-disable-next-line no-console
      console.warn(
        `[Continuum.spline] baked material with textures:`,
        { map: !!map, normalMap: !!normalMap, roughnessMap: !!roughnessMap, metalnessMap: !!metalnessMap, emissiveMap: !!emissiveMap },
      );
    }
    return baked;
  };

  /**
   * One-time-per-load diagnostic — dump the first few source materials so
   * we can see Spline's actual property shape if the colors come out wrong.
   * Logged once per bake, only at top level. Inspect via DevTools Console.
   */
  let dumped = 0;
  const dumpMaterial = (m: THREE.Material): void => {
    if (dumped >= 4) return;
    dumped++;
    const flat: Record<string, unknown> = { type: m.type, name: m.name };
    for (const key of Object.keys(m)) {
      const v = (m as unknown as Record<string, unknown>)[key];
      if (v && typeof v === 'object') {
        const c = v as { isColor?: boolean; r?: number; g?: number; b?: number };
        if (c.isColor || (typeof c.r === 'number' && typeof c.g === 'number')) {
          flat[key] = { r: c.r, g: c.g, b: c.b, isColor: c.isColor };
          continue;
        }
      }
      if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') {
        flat[key] = v;
      }
    }
    if ((m as unknown as { uniforms?: Record<string, { value?: unknown }> }).uniforms) {
      const u = (m as unknown as { uniforms: Record<string, { value?: unknown }> }).uniforms;
      flat['uniformKeys'] = Object.keys(u).slice(0, 30);
      const colorish: Record<string, unknown> = {};
      for (const k of Object.keys(u)) {
        const v = u[k]?.value as { isColor?: boolean; r?: number; g?: number; b?: number } | undefined;
        if (v && typeof v === 'object' && (v.isColor || typeof v.r === 'number')) {
          colorish[k] = { r: v.r, g: v.g, b: v.b, isColor: v.isColor };
        }
      }
      flat['colorishUniforms'] = colorish;
    }
    // eslint-disable-next-line no-console
    console.warn('[Continuum.spline] source material dump:', flat);
  };

  // Force matrix updates so we capture the world-space transforms Spline
  // applies at runtime (the editor scene often relies on transform
  // propagation that hasn't run yet at this exact instant).
  root.updateMatrixWorld(true);

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh & { isMesh?: boolean };
    if (!mesh.isMesh || !mesh.geometry) return;
    let bakedGeom: THREE.BufferGeometry | null = null;
    try {
      bakedGeom = bakeGeometry(mesh.geometry as THREE.BufferGeometry);
    } catch {
      return; // Skip meshes we can't recover.
    }
    if (!bakedGeom.getAttribute('position')) return; // Not renderable.
    // Dump the source material structure once per bake so we can see
    // Spline's actual property layout when colors come out wrong.
    const srcMat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (srcMat) dumpMaterial(srcMat);
    const bakedMat = bakeMaterial(mesh.material as THREE.Material);
    const bakedMesh = new THREE.Mesh(bakedGeom, bakedMat);
    bakedMesh.name = mesh.name;
    // World transform → local transform on the baked mesh, since we
    // flatten the hierarchy under one Group.
    bakedMesh.matrixAutoUpdate = false;
    bakedMesh.matrix.copy(mesh.matrixWorld);
    bakedMesh.matrix.decompose(bakedMesh.position, bakedMesh.quaternion, bakedMesh.scale);
    bakedMesh.matrixAutoUpdate = true;
    baked.add(bakedMesh);
  });

  return baked;
};

/**
 * Load a Spline scene from a public URL and return its underlying
 * THREE.Object3D for the LOD engine. The scene is BAKED into plain
 * THREE primitives — Spline's custom buffer attributes and shader
 * materials are too runtime-bound to round-trip through clone() or
 * GLTFExporter. The bake snapshot is a one-shot conversion that
 * preserves geometry + approximate material color but drops Spline-
 * runtime-specific behaviour (animations, interactivity, custom shaders).
 */
/**
 * Spline's share URL (my.spline.design/<slug>) and runtime URL
 * (prod.spline.design/<id>/scene.splinecode) use DIFFERENT scene ids —
 * the share id and the CDN id are decoupled. So we can't derive one
 * from the other; we have to fetch the share HTML page and pull the
 * actual prod URL out of the embedded script.
 *
 * If the user already pasted a prod URL, return it unchanged.
 */
const normaliseSplineUrl = async (raw: string): Promise<string> => {
  const url = raw.trim();
  // Already a binary URL — pass through.
  if (/prod\.spline\.design\/.+\/scene\.splinecode$/i.test(url)) return url;
  // prod.spline.design without /scene.splinecode suffix — append it.
  const prodNoSuffix = url.match(/^(https?:\/\/prod\.spline\.design\/[^/?#]+)\/?$/i);
  if (prodNoSuffix) return `${prodNoSuffix[1]}/scene.splinecode`;
  // my.spline.design share URL → fetch the HTML and dig out the real
  // prod URL the viewer uses.
  if (/my\.spline\.design\//i.test(url)) {
    try {
      const html = await (await fetch(url)).text();
      // Spline's viewer pages embed the runtime URL directly in script
      // text. We accept any prod.spline.design/<id>/scene.splinecode
      // string that appears in the HTML (typically only one).
      const m = html.match(/https?:\/\/prod\.spline\.design\/[A-Za-z0-9_-]+\/scene\.splinecode/);
      if (m) {
        // eslint-disable-next-line no-console
        console.warn(`[Continuum.spline] extracted prod URL from share page: ${m[0]}`);
        return m[0];
      }
      throw new Error(
        'Share page didn\'t contain an embedded prod.spline.design/scene.splinecode URL. ' +
        'Open Spline → Export → Code Export → copy the URL above the React snippet.',
      );
    } catch (err: unknown) {
      throw new Error(
        `Couldn\'t resolve share URL → prod URL: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  return url;
};

export const loadSplineSceneFromURL = async (rawUrl: string): Promise<THREE.Object3D> => {
  // eslint-disable-next-line no-console
  console.warn('[Continuum.spline] v5 loader entry — bake + html-extract');
  const trimmed = await normaliseSplineUrl(rawUrl);
  if (trimmed !== rawUrl.trim()) {
    // eslint-disable-next-line no-console
    console.warn(`[Continuum.spline] normalised URL: ${rawUrl} → ${trimmed}`);
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error('Spline URL must start with http:// or https://');
  }
  const { Application } = await getRuntime();

  // The runtime requires a canvas in the live DOM (some versions check
  // offsetParent or use ResizeObserver, which won't fire on detached
  // elements). We mount it offscreen via CSS so it never affects layout.
  const hostCanvas = document.createElement('canvas');
  hostCanvas.width = 256;
  hostCanvas.height = 256;
  hostCanvas.style.cssText =
    'position:fixed;left:-99999px;top:-99999px;width:256px;height:256px;pointer-events:none;visibility:hidden;';
  document.body.appendChild(hostCanvas);

  try {
    // Pre-check: Spline scenes default to private. If the URL is locked,
    // the CDN returns an XML AccessDenied page, the Spline runtime tries
    // to parse it as binary, and you get the cryptic "Data read, but end
    // of buffer not reached" error. Detect that ourselves and surface a
    // clear, actionable error instead.
    const head = await fetch(trimmed, { method: 'GET' });
    if (!head.ok) {
      throw new Error(
        `Spline scene is not publicly accessible (HTTP ${head.status}). ` +
        `In Spline: open the scene → File → Export → Code → toggle "Public". ` +
        `That generates a URL anyone can fetch. The current URL returns ${head.status}.`,
      );
    }
    const contentType = head.headers.get('content-type') ?? '';
    if (contentType.startsWith('application/xml') || contentType.startsWith('text/html')) {
      throw new Error(
        `Spline URL returned ${contentType} instead of binary scene data — ` +
        `the scene is likely private. Make it public in Spline's export panel.`,
      );
    }

    const app = new Application(hostCanvas);
    // eslint-disable-next-line no-console
    console.warn('[Continuum.spline] calling app.load', trimmed);
    try {
      await app.load(trimmed);
    } catch (loadErr: unknown) {
      // eslint-disable-next-line no-console
      console.error('[Continuum.spline] app.load threw:', loadErr);
      throw new Error(
        `Spline runtime failed to load ${trimmed}: ${loadErr instanceof Error ? loadErr.message : String(loadErr)}`,
      );
    }
    // eslint-disable-next-line no-console
    console.warn('[Continuum.spline] app.load resolved, walking object graph');
    const found = findSceneInApp(app);
    if (!found) {
      // Surface what we did find so this is debuggable instead of opaque.
      const topKeys = Object.keys(app).join(', ');
      throw new Error(
        `Spline scene loaded but no THREE.Scene/Object3D was found inside the ` +
        `Application instance. Top-level keys: [${topKeys}]. The runtime API ` +
        `may have changed — pin the SDK version in splineLoader.ts.`,
      );
    }
    // eslint-disable-next-line no-console
    console.warn(`[Continuum] Extracted Spline scene via ${found.via}`);
    // Bake to plain THREE primitives so the LOD engine's clone path and
    // GLTFExporter both work. Spline's native attributes/materials are
    // too runtime-bound to round-trip otherwise.
    const baked = bakeSplineScene(found.scene);
    let bakedMeshes = 0;
    baked.traverse((o) => { if ((o as { isMesh?: boolean }).isMesh) bakedMeshes++; });
    // eslint-disable-next-line no-console
    console.warn(`[Continuum] Baked Spline scene → ${bakedMeshes} plain THREE meshes`);
    return baked;
  } finally {
    // Leave the host canvas attached — Spline's animation loop keeps
    // updating the scene's transforms via this canvas's WebGL context.
    // If we removed it, the scene would freeze. Visibility:hidden +
    // off-screen position keeps it invisible without unmounting.
    void hostCanvas;
  }
};
