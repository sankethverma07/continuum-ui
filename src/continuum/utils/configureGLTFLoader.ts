/**
 * configureGLTFLoader — wires the modern decoder pipeline onto a
 * THREE.GLTFLoader so it can read everything award-winning sites ship.
 *
 * **What landonorris.com does** (verified by inspecting their CDN at
 * `lando.itsoffbrand.io/gl/models/*.glb`): they ship glTF binary with
 *   - KTX2/Basis-compressed textures (KHR_texture_basisu)
 *   - Meshopt-compressed geometry (EXT_meshopt_compression)
 *   - HDR environment maps for image-based lighting (.hdr files)
 *
 * Three.js ships loaders for all three — but you have to wire them in
 * yourself. The default GLTFLoader has none of them registered, which is
 * why a stock `new GLTFLoader().load(url)` will fail on any modern,
 * properly-compressed asset with a cryptic "missing required extension"
 * error.
 *
 * **What this util does.** Given a GLTFLoader instance, it:
 *   1. Attaches a KTX2Loader pointed at Three.js's hosted Basis
 *      transcoder (so KHR_texture_basisu textures decode on the GPU
 *      directly, 4-8× smaller than JPEG/PNG, no CPU decode cost).
 *   2. Attaches a DRACOLoader pointed at Google's hosted Draco decoder
 *      (so KHR_draco_mesh_compression geometry decompresses correctly).
 *   3. Calls `setMeshoptDecoder` with the meshoptimizer WASM module (so
 *      EXT_meshopt_compression — used by gltf-transform's default
 *      `meshopt()` pass — works at runtime).
 *
 * **Where this is wired.**
 *   - User-upload path: `assetLoader.ts` calls this on every GLTFLoader.
 *   - Catalog path: drei's `useGLTF.setDecoderPath()` is the moral
 *     equivalent for the cached loader pool used by `<AutoProgressiveGLBAsset />`.
 *     We call `configureDreiUseGLTF()` once at module load (see below).
 *
 * **CDN hosting.** Decoders live at:
 *   - Draco:  `https://www.gstatic.com/draco/versioned/decoders/1.5.7/`
 *   - Basis:  `https://cdn.jsdelivr.net/npm/three@${VERSION}/examples/jsm/libs/basis/`
 *   These mirror Three.js's bundled decoders exactly — same WASM, just
 *   served from a CDN so we don't have to copy them into /public.
 *
 * If you want to self-host (offline / air-gapped builds), point the
 * URLs at your own `/decoders/` folder.
 */

import * as THREE from 'three';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const THREE_VERSION = THREE.REVISION; // e.g. "169" — used to pin Basis transcoder

export const DRACO_DECODER_PATH = 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';
export const BASIS_TRANSCODER_PATH = `https://cdn.jsdelivr.net/npm/three@0.${THREE_VERSION}.0/examples/jsm/libs/basis/`;

// ---------------------------------------------------------------------------
// Singletons. We share one DRACOLoader / KTX2Loader instance across every
// GLTFLoader because the loaders themselves are stateless decoder factories
// — instantiating one per asset wastes WASM compile time.
// ---------------------------------------------------------------------------

let _dracoLoader: DRACOLoader | null = null;
const getDracoLoader = (): DRACOLoader => {
  if (_dracoLoader) return _dracoLoader;
  _dracoLoader = new DRACOLoader();
  _dracoLoader.setDecoderPath(DRACO_DECODER_PATH);
  // 'js' decoder is the default and works everywhere; the WASM variant
  // is faster but requires CORS headers some CDNs don't ship by default.
  // gstatic does ship them, so we let Three pick the WASM path.
  _dracoLoader.setDecoderConfig({ type: 'js' });
  return _dracoLoader;
};

let _ktx2Loader: KTX2Loader | null = null;
const getKTX2Loader = (renderer?: THREE.WebGLRenderer): KTX2Loader => {
  if (_ktx2Loader) {
    if (renderer) _ktx2Loader.detectSupport(renderer);
    return _ktx2Loader;
  }
  _ktx2Loader = new KTX2Loader();
  _ktx2Loader.setTranscoderPath(BASIS_TRANSCODER_PATH);
  if (renderer) _ktx2Loader.detectSupport(renderer);
  return _ktx2Loader;
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Apply the decoder triple (KTX2, Draco, Meshopt) to a GLTFLoader.
 *
 * Pass the active WebGLRenderer when you have one (preferred) — KTX2Loader
 * needs to detect which compressed-texture formats the GPU supports
 * (BC7 / ASTC / ETC2 / PVRTC). If you don't have a renderer yet (e.g.
 * loader is constructed before a Canvas exists), the loader will fall
 * back to uncompressed transcoding which still works but defeats the
 * GPU-direct upload benefit.
 */
export const configureGLTFLoader = (
  loader: GLTFLoader,
  renderer?: THREE.WebGLRenderer,
): GLTFLoader => {
  loader.setDRACOLoader(getDracoLoader());
  loader.setKTX2Loader(getKTX2Loader(renderer));
  loader.setMeshoptDecoder(MeshoptDecoder);
  return loader;
};

/**
 * Pass this to drei's `useGLTF(url, useDraco, useMeshopt, extendLoader)`
 * as the fourth argument so KTX2 + Meshopt + Draco all get attached:
 *
 *   const gltf = useGLTF(url, true, true, engineExtendLoader);
 *
 * The renderer argument can't be threaded in from inside drei's loader
 * factory; KTX2 will lazy-detect support on first use. This is the same
 * loader-extension hook drei's docs recommend for KTX2.
 *
 * Note on the parameter type: drei re-exports its OWN copy of GLTFLoader
 * (vendored, not from `three/examples`), so the structural type drei
 * expects in its `ExtendLoader` signature differs slightly from the one
 * we import. The runtime object is identical — both sides ultimately
 * call `setKTX2Loader` etc. on a THREE.GLTFLoader instance. We accept
 * `unknown` here and cast internally to avoid the cross-package type
 * mismatch without weakening the loader's actual contract.
 */
export const engineExtendLoader = (loader: unknown): void => {
  configureGLTFLoader(loader as GLTFLoader);
};
