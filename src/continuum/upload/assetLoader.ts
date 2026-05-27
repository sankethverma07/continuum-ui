/**
 * Universal asset loader — detects file format and routes to the right
 * Three.js loader. Replaces the .glb-only path with one that accepts:
 *
 *   .glb / .gltf  — GLTF (binary or JSON; multi-file bundles supported)
 *   .fbx          — FBX (Maya / Blender / Cinema 4D)
 *   .obj          — Wavefront OBJ (optional .mtl + textures)
 *   .stl          — Stereolithography (3D printing, geometry only)
 *   .ply          — Stanford Polygon (geometry, optional vertex colors)
 *   .usdz         — Universal Scene Description (Apple AR Quick Look)
 *   .dae          — Collada (legacy 3D interchange)
 *   .3ds          — 3D Studio (legacy)
 *   .vrml / .wrl  — VRML
 *
 * For multi-file drops (.gltf + .bin + textures, or .obj + .mtl + textures),
 * we register every dropped file as a virtual blob URL and intercept
 * resolver requests via THREE.LoadingManager so external file references
 * inside the manifest resolve to the dropped sibling files.
 *
 * The loaders emit a `THREE.Object3D` (group). Downstream engines see
 * the same shape regardless of source format — they don't care whether
 * it came from a .glb or a .fbx.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { configureGLTFLoader } from '../utils/configureGLTFLoader';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { USDZLoader } from 'three/examples/jsm/loaders/USDZLoader.js';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { TDSLoader } from 'three/examples/jsm/loaders/TDSLoader.js';
import { VRMLLoader } from 'three/examples/jsm/loaders/VRMLLoader.js';

import { unzipToFiles } from './zipUnpacker';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SupportedFormat =
  | 'glb' | 'gltf'
  | 'fbx' | 'obj' | 'stl' | 'ply'
  | 'usdz' | 'dae' | '3ds' | 'wrl' | 'vrml'
  /** Spline scenes loaded from a public .splinecode URL via Spline's runtime. */
  | 'spline';

export interface LoadedAsset {
  /** The root Object3D the engines render. */
  readonly scene: THREE.Object3D;
  /** Original format detected from the file extension. */
  readonly format: SupportedFormat;
  /** Friendly name shown in UI. */
  readonly displayName: string;
  /** Triangle count summed across the loaded scene. */
  readonly triangleCount: number;
  /** Material count summed across the loaded scene. */
  readonly materialCount: number;
}

export interface LoadAssetInput {
  /** The primary file the user dropped. We auto-detect format from its name. */
  readonly primary: File;
  /** Sibling files dropped at the same time. Used by .gltf and .obj loaders
   *  to resolve external .bin / .mtl / texture references. */
  readonly siblings?: ReadonlyArray<File>;
}

// ---------------------------------------------------------------------------
// Format detection
// ---------------------------------------------------------------------------

const EXT_MAP: Record<string, SupportedFormat> = {
  glb:  'glb',
  gltf: 'gltf',
  fbx:  'fbx',
  obj:  'obj',
  stl:  'stl',
  ply:  'ply',
  usdz: 'usdz',
  dae:  'dae',
  '3ds': '3ds',
  wrl:  'wrl',
  vrml: 'vrml',
};

const FORMAT_LABEL: Record<SupportedFormat, string> = {
  glb:  'glTF Binary',
  gltf: 'glTF JSON',
  fbx:  'FBX (Filmbox)',
  obj:  'Wavefront OBJ',
  stl:  'STL',
  ply:  'PLY',
  usdz: 'USDZ',
  dae:  'Collada',
  '3ds': '3D Studio',
  wrl:  'VRML',
  vrml: 'VRML',
  spline: 'Spline scene',
};

const detectFormat = (fileName: string): SupportedFormat | null => {
  const ext = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  return ext ? (EXT_MAP[ext] ?? null) : null;
};

export const isSupportedFile = (file: File): boolean =>
  detectFormat(file.name) !== null || /\.zip$/i.test(file.name);

/** Pick the primary 3D file from a flat list. Prefers rich-manifest
 *  formats (.gltf > .glb > .fbx > .obj > ...) so a bundle that ships
 *  several variants converges on the most-detailed one. */
const pickInnerPrimary = (files: ReadonlyArray<File>): File | null => {
  const order: SupportedFormat[] = ['gltf', 'glb', 'fbx', 'obj', 'dae', 'usdz', 'stl', 'ply', '3ds', 'wrl', 'vrml'];
  for (const fmt of order) {
    const found = files.find((f) => f.name.toLowerCase().endsWith(`.${fmt}`));
    if (found) return found;
  }
  return null;
};

export const acceptedExtensions: ReadonlyArray<string> = Object.keys(EXT_MAP)
  .map((e) => `.${e}`);

export const formatLabelFor = (fmt: SupportedFormat): string => FORMAT_LABEL[fmt];

// ---------------------------------------------------------------------------
// Sibling-file URL resolution via LoadingManager
// ---------------------------------------------------------------------------

/**
 * Build a LoadingManager that resolves URLs to sibling-file blob URLs.
 *
 * When a .gltf manifest references `textures/wood.png`, the GLTFLoader
 * will issue a fetch for that relative URL. We intercept via the
 * manager's URL modifier and swap in the matching dropped file's blob URL.
 *
 * Match strategy: case-insensitive, basename-only. So a manifest reference
 * `models/foo.bin` matches a dropped file named `foo.bin` regardless of
 * what folder structure the user dragged in.
 */
const buildManagerForSiblings = (
  siblings: ReadonlyArray<File>,
): { manager: THREE.LoadingManager; revoke: () => void } => {
  const manager = new THREE.LoadingManager();
  const blobByBase = new Map<string, string>();
  for (const f of siblings) {
    const url = URL.createObjectURL(f);
    blobByBase.set(f.name.toLowerCase(), url);
  }
  manager.setURLModifier((url) => {
    // Strip query/hash + leading "./" then match against basename.
    const cleaned = url.replace(/[?#].*$/, '').replace(/^\.?\//, '');
    const base = cleaned.split('/').pop()?.toLowerCase() ?? '';
    return blobByBase.get(base) ?? url;
  });
  const revoke = () => {
    for (const u of blobByBase.values()) URL.revokeObjectURL(u);
  };
  return { manager, revoke };
};

// ---------------------------------------------------------------------------
// Tally helpers
// ---------------------------------------------------------------------------

const tallyTriangles = (root: THREE.Object3D): number => {
  let total = 0;
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const g = obj.geometry as THREE.BufferGeometry;
    if (g.index) total += Math.floor(g.index.count / 3);
    else {
      const pos = g.getAttribute('position');
      if (pos) total += Math.floor(pos.count / 3);
    }
  });
  return total;
};

const tallyMaterials = (root: THREE.Object3D): number => {
  const seen = new Set<THREE.Material>();
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of mats) if (m) seen.add(m);
  });
  return seen.size;
};

// ---------------------------------------------------------------------------
// Format-specific loaders — each returns a Promise<THREE.Object3D>
// ---------------------------------------------------------------------------

const loadGLTF = async (
  primary: File,
  siblings: ReadonlyArray<File>,
): Promise<THREE.Object3D> => {
  const { manager, revoke } = buildManagerForSiblings(siblings);
  // The primary file itself also needs to be reachable by the loader
  // (it contains references to siblings, but the loader reads the
  // primary URL too). We give it a blob URL of its own.
  const primaryUrl = URL.createObjectURL(primary);
  try {
    // Modern decoder pipeline — KTX2 (Basis), Draco, Meshopt. Without
    // these the loader rejects any glb that uses KHR_texture_basisu /
    // KHR_draco_mesh_compression / EXT_meshopt_compression — which is
    // every glb shipped by award-winning sites (verified against
    // landonorris.com / itsoffbrand.io 2026-04).
    const loader = configureGLTFLoader(new GLTFLoader(manager));
    const gltf = await loader.loadAsync(primaryUrl);
    return gltf.scene;
  } finally {
    URL.revokeObjectURL(primaryUrl);
    revoke();
  }
};

const loadFBX = async (
  primary: File,
  siblings: ReadonlyArray<File>,
): Promise<THREE.Object3D> => {
  // FBX files frequently reference external textures by absolute path on
  // the artist's original machine ("C:\Users\artist\textures\diffuse.png").
  // FBXLoader will issue a fetch for each one — we intercept those via
  // the LoadingManager and remap them to sibling blob URLs by basename.
  const { manager, revoke } = buildManagerForSiblings(siblings);
  const primaryUrl = URL.createObjectURL(primary);
  try {
    const loader = new FBXLoader(manager);
    return await loader.loadAsync(primaryUrl);
  } finally {
    URL.revokeObjectURL(primaryUrl);
    revoke();
  }
};

const loadOBJ = async (
  primary: File,
  siblings: ReadonlyArray<File>,
): Promise<THREE.Object3D> => {
  const { manager, revoke } = buildManagerForSiblings(siblings);
  const primaryUrl = URL.createObjectURL(primary);
  try {
    // If a .mtl sibling is present, parse it first and apply its materials.
    const mtl = siblings.find((f) => /\.mtl$/i.test(f.name));
    let materials: ReturnType<MTLLoader['parse']> | null = null;
    if (mtl) {
      const mtlText = await mtl.text();
      const mtlLoader = new MTLLoader(manager);
      // MTLLoader needs a base path so its texture references resolve.
      // The URL modifier on the manager handles the actual mapping.
      materials = mtlLoader.parse(mtlText, '');
      materials.preload();
    }
    const loader = new OBJLoader(manager);
    if (materials) loader.setMaterials(materials);
    return await loader.loadAsync(primaryUrl);
  } finally {
    URL.revokeObjectURL(primaryUrl);
    revoke();
  }
};

const loadSTL = async (primary: File): Promise<THREE.Object3D> => {
  const url = URL.createObjectURL(primary);
  try {
    const loader = new STLLoader();
    const geom = await loader.loadAsync(url);
    geom.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({
      color: 0xc8c2b6,
      metalness: 0.0,
      roughness: 0.55,
    });
    const mesh = new THREE.Mesh(geom, mat);
    const group = new THREE.Group();
    group.add(mesh);
    return group;
  } finally {
    URL.revokeObjectURL(url);
  }
};

const loadPLY = async (primary: File): Promise<THREE.Object3D> => {
  const url = URL.createObjectURL(primary);
  try {
    const loader = new PLYLoader();
    const geom = await loader.loadAsync(url);
    geom.computeVertexNormals();
    // PLY may carry per-vertex colors — honour them if present.
    const hasVertexColors = !!geom.getAttribute('color');
    const mat = new THREE.MeshStandardMaterial({
      color: hasVertexColors ? 0xffffff : 0xc8c2b6,
      vertexColors: hasVertexColors,
      metalness: 0.0,
      roughness: 0.55,
    });
    const mesh = new THREE.Mesh(geom, mat);
    const group = new THREE.Group();
    group.add(mesh);
    return group;
  } finally {
    URL.revokeObjectURL(url);
  }
};

const loadUSDZ = async (primary: File): Promise<THREE.Object3D> => {
  const url = URL.createObjectURL(primary);
  try {
    const loader = new USDZLoader();
    return await loader.loadAsync(url);
  } finally {
    URL.revokeObjectURL(url);
  }
};

const loadDAE = async (
  primary: File,
  siblings: ReadonlyArray<File>,
): Promise<THREE.Object3D> => {
  const { manager, revoke } = buildManagerForSiblings(siblings);
  const url = URL.createObjectURL(primary);
  try {
    const loader = new ColladaLoader(manager);
    const collada = await loader.loadAsync(url);
    return collada.scene;
  } finally {
    URL.revokeObjectURL(url);
    revoke();
  }
};

const load3DS = async (primary: File): Promise<THREE.Object3D> => {
  const url = URL.createObjectURL(primary);
  try {
    const loader = new TDSLoader();
    return await loader.loadAsync(url);
  } finally {
    URL.revokeObjectURL(url);
  }
};

const loadVRML = async (primary: File): Promise<THREE.Object3D> => {
  const url = URL.createObjectURL(primary);
  try {
    const loader = new VRMLLoader();
    return await loader.loadAsync(url);
  } finally {
    URL.revokeObjectURL(url);
  }
};

// ---------------------------------------------------------------------------
// Public dispatch
// ---------------------------------------------------------------------------

export const loadAsset = async (input: LoadAssetInput): Promise<LoadedAsset> => {
  // ZIP detour — if the primary is a .zip, unpack it in-browser and
  // re-dispatch with its contents. The unpacker uses the browser's
  // native DecompressionStream so there's no extra npm dep. Multi-file
  // formats (.gltf+textures, .fbx+textures, .obj+.mtl+textures) come
  // through this path naturally — common when downloading bundled
  // assets from Sketchfab, TurboSquid, etc.
  if (/\.zip$/i.test(input.primary.name)) {
    const unpackedFiles = await unzipToFiles(input.primary);
    if (unpackedFiles.length === 0) {
      throw new Error(`ZIP "${input.primary.name}" was empty.`);
    }
    // Pick the primary asset from the unpacked contents. We prefer
    // richer manifest formats first (.gltf > .glb > .fbx > .obj > ...).
    const innerPrimary = pickInnerPrimary(unpackedFiles);
    if (!innerPrimary) {
      const seen = unpackedFiles.map((f) => f.name).slice(0, 12).join(', ');
      throw new Error(
        `ZIP "${input.primary.name}" contained no recognised 3D file. ` +
        `Found: ${seen}${unpackedFiles.length > 12 ? ` (+${unpackedFiles.length - 12} more)` : ''}`,
      );
    }
    // Recurse — this time the unpacked file is the primary, the rest
    // are siblings (textures, .bin, .mtl, etc.).
    return loadAsset({ primary: innerPrimary, siblings: unpackedFiles });
  }

  const format = detectFormat(input.primary.name);
  if (!format) {
    throw new Error(
      `Unsupported file extension: ${input.primary.name}. ` +
        `Supported: .zip + ${acceptedExtensions.join(', ')}`,
    );
  }
  const siblings = (input.siblings ?? []).filter((f) => f !== input.primary);

  let scene: THREE.Object3D;
  switch (format) {
    case 'glb':
    case 'gltf':
      scene = await loadGLTF(input.primary, siblings);
      break;
    case 'fbx':
      scene = await loadFBX(input.primary, siblings);
      break;
    case 'obj':
      scene = await loadOBJ(input.primary, siblings);
      break;
    case 'stl':
      scene = await loadSTL(input.primary);
      break;
    case 'ply':
      scene = await loadPLY(input.primary);
      break;
    case 'usdz':
      scene = await loadUSDZ(input.primary);
      break;
    case 'dae':
      scene = await loadDAE(input.primary, siblings);
      break;
    case '3ds':
      scene = await load3DS(input.primary);
      break;
    case 'wrl':
    case 'vrml':
      scene = await loadVRML(input.primary);
      break;
    case 'spline':
      // Spline scenes are loaded by URL (loadSplineSceneFromURL in
      // splineLoader.ts), never from a File. They reach the engine
      // through a different code path and never enter this dispatch.
      throw new Error(
        'Spline scenes are loaded by URL via splineLoader, not from a file drop.',
      );
    default: {
      const _exhaustive: never = format;
      void _exhaustive;
      throw new Error(`Loader for ${format} not implemented.`);
    }
  }

  return {
    scene,
    format,
    displayName: input.primary.name,
    triangleCount: tallyTriangles(scene),
    materialCount: tallyMaterials(scene),
  };
};

// ---------------------------------------------------------------------------
// Spline URL detection — Spline shareable scenes live at prod.spline.design
// ---------------------------------------------------------------------------

export const isSplineSceneUrl = (input: string): boolean =>
  /^https?:\/\/(prod\.)?spline\.design\//i.test(input.trim()) ||
  /^https?:\/\/my\.spline\.design\//i.test(input.trim());
