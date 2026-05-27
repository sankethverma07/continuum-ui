/**
 * 3D mesh LOD generator.
 *
 * Takes a single hero GLB / GLTF (the one the designer exported from
 * Blender / Spline / Cinema 4D / UE5) and derives a full LOD stack of
 * decimated variants using gltf-transform + meshoptimizer.
 *
 * The core operation is quadric-edge-collapse simplification: each tier
 * keeps a fraction of the original triangle count while preserving the
 * silhouette and material slots. This is the same algorithm Nanite uses
 * for its offline clusterization step — the web just runs it at coarser
 * granularity.
 *
 * Tier 0 is the special case — we keep a ~200 triangle proxy AND tell the
 * front-end to render it as wireframe. No need for a separate wireframe
 * mesh; Three.js handles that with a material flag.
 */

import { execFileSync, execSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  dedup,
  meshopt,
  prune,
  simplify,
  textureCompress,
  weld,
} from '@gltf-transform/functions';
import {
  MeshoptDecoder,
  MeshoptEncoder,
  MeshoptSimplifier,
} from 'meshoptimizer';
import sharp from 'sharp';

import { complexityScore, ratiosFor, tierCountFor } from './complexity.js';
import type {
  IngestResult,
  LODTierDescriptor,
  MeshMetadata,
} from './types.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface GenerateMeshLODsOptions {
  readonly outDir: string;
  readonly assetId: string;
  readonly forceTierCount?: number;
}

export const generateMeshLODs = async (
  inputPath: string,
  opts: GenerateMeshLODsOptions,
): Promise<IngestResult> => {
  // Register the FULL extension set, not just KHRONOS_EXTENSIONS, so we
  // can both READ assets that ship modern compression (Draco, Meshopt,
  // KHR_texture_basisu) AND WRITE the EXT_meshopt_compression extension
  // we add ourselves at the publish step. This is what every modern
  // production pipeline ships (verified against landonorris.com /
  // itsoffbrand.io 2026-04: their .glb files use Meshopt geometry +
  // Basis-compressed textures).
  //
  // The `meshopt.encoder` / `meshopt.decoder` dependencies are required
  // for EXTMeshoptCompression to actually run at write/read time. The
  // `meshopt()` transform pre-processes the document (reorder + quantize),
  // but the binary encode itself is deferred to NodeIO.writeBinary
  // which looks up the encoder via this dependency map. Without these
  // registrations we get "Cannot read properties of undefined (reading
  // 'encodeGltfBuffer')" at write time.
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'meshopt.encoder': MeshoptEncoder,
      'meshopt.decoder': MeshoptDecoder,
    });
  const doc = await io.read(inputPath);

  const meta = extractMeshMetadata(doc, (await fs.stat(inputPath)).size);
  const score = complexityScore(meta);
  const tierCount = opts.forceTierCount ?? tierCountFor(score);
  const ratios = ratiosFor(tierCount);

  await fs.mkdir(opts.outDir, { recursive: true });
  await MeshoptSimplifier.ready;
  await MeshoptEncoder.ready;

  const tiers: LODTierDescriptor[] = [];
  for (let i = 0; i < tierCount; i++) {
    const ratio = ratios[i] ?? 1.0;
    const outPath = path.join(opts.outDir, `${opts.assetId}_lod${i}.glb`);
    const sizeBytes = await emitDecimatedGLB(inputPath, outPath, ratio);
    tiers.push({
      index: i,
      url: outPath,
      ratio,
      triangles: Math.round(meta.triangles * ratio),
      sizeBytes,
    });
  }

  return {
    assetId: opts.assetId,
    metadata: meta,
    complexityScore: score,
    tierCount,
    tiers,
  };
};

// ---------------------------------------------------------------------------
// Internal: KTX2 / Basis Universal compression — opportunistic upgrade.
//
// **The format.** KTX2 is a Khronos container format that wraps a Basis
// Universal-compressed texture. Unlike WebP / JPEG (which are CPU-decoded
// then re-uploaded as RGBA bytes to the GPU), KTX2/Basis transcodes
// directly to whatever compressed format the user's GPU supports natively
// — BC7 on desktop, ASTC on mobile, ETC2 as a fallback. The end result:
// 4-8× smaller files than JPEG AND zero CPU decode cost on the runtime.
// This is what landonorris.com ships and what every Sketchfab embed uses.
//
// **Why it's optional here.** The encoder (`toktx`) ships as a native
// binary from the KTX-Software GitHub project, not as a pure npm
// package. WASM-based encoders exist (5-20× slower) but aren't the
// canonical pipeline. So we detect `toktx` on PATH at runtime: if the
// developer/build machine has it, we use it; otherwise we leave the
// WebP-compressed output in place. Both paths are valid — the runtime
// (configureGLTFLoader.ts) handles either.
//
// **How the encode happens.** We shell out to `gltf-transform uastc`
// (from `@gltf-transform/cli`), which walks every Image in the .glb,
// invokes `toktx` to encode it as KTX2/UASTC, and rewrites the
// document with KHR_texture_basisu references. UASTC is the
// higher-quality of Basis's two modes (vs. ETC1S) — appropriate for
// hero PBR textures where banding would be visible. We use `npx --no`
// so the user gets a clear error if @gltf-transform/cli isn't installed.
// ---------------------------------------------------------------------------

let _toktxAvailable: boolean | null = null;

const isToktxAvailable = (): boolean => {
  if (_toktxAvailable !== null) return _toktxAvailable;
  try {
    const probe = process.platform === 'win32' ? 'where' : 'which';
    execFileSync(probe, ['toktx'], { stdio: 'ignore' });
    _toktxAvailable = true;
  } catch {
    _toktxAvailable = false;
  }
  return _toktxAvailable;
};

/**
 * Re-encode every texture in the .glb as KTX2/UASTC by shelling out to
 * `gltf-transform uastc`. Mutates the file in place. Caller is
 * responsible for checking `isToktxAvailable()` first — this throws if
 * either toktx or @gltf-transform/cli is missing.
 */
const compressTexturesAsKTX2 = (filePath: string): void => {
  const tmpOut = `${filePath}.ktx2.tmp.glb`;
  // npx --no => fail loudly if @gltf-transform/cli isn't already
  // installed, instead of silently downloading it mid-publish.
  // The 'uastc' command is the higher-quality Basis mode — appropriate
  // for PBR maps. For UI sprites / albedo we could fall back to 'etc1s'
  // (smaller, slightly lower fidelity) but let's keep one mode for now.
  execSync(
    `npx --no @gltf-transform/cli uastc "${filePath}" "${tmpOut}"`,
    { stdio: 'inherit' },
  );
  // Replace the original with the KTX2-encoded copy.
  // Using sync rename so the caller doesn't need to await this helper.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('node:fs').renameSync(tmpOut, filePath);
};

// ---------------------------------------------------------------------------
// Internal: write a decimated copy of the source GLB.
//
// We re-read the source for each tier rather than cloning the in-memory
// Document — cloning a gltf-transform Document is non-trivial and a fresh
// read is fast enough at our asset sizes. If you start ingesting 500MB+
// meshes, switch to a single read + structured clone.
// ---------------------------------------------------------------------------

const emitDecimatedGLB = async (
  sourcePath: string,
  outPath: string,
  ratio: number,
): Promise<number> => {
  // Same full-extension I/O as the parent — needs to read incoming
  // compression and write our own. Encoder/decoder dependencies must
  // be registered here too: NodeIO.writeBinary looks them up via the
  // dependency map at write time, regardless of which `meshopt()`
  // transform was applied earlier.
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'meshopt.encoder': MeshoptEncoder,
      'meshopt.decoder': MeshoptDecoder,
    });
  const doc = await io.read(sourcePath);

  // Decimate the geometry to the target tier ratio. Hero tier (ratio ~ 1)
  // skips simplification — but it STILL gets the compression pass below
  // because shipping uncompressed PBR-textured meshes is what makes a
  // typical .glb 5-15 MB instead of 1-3 MB. landonorris.com's hero
  // helmet ships at ~2 MB; without compression an equivalent uncompressed
  // export would be ~12 MB.
  if (ratio < 0.999) {
    await doc.transform(
      // Re-index so duplicate vertices collapse before the simplifier sees them.
      // WeldOptions in gltf-transform v4 has no `tolerance` — position tolerance
      // is driven by the simplifier's own `error` budget below.
      weld(),
      simplify({
        simplifier: MeshoptSimplifier,
        ratio,
        error: 0.001,
        lockBorder: true, // keep silhouette edges — critical for the invariant
      }),
      dedup(),
      prune(),
    );
  }

  // Compression pass — runs on every tier, including the hero.
  // ─────────────────────────────────────────────────────────────────────
  // Texture compression: convert PNG / JPEG to WebP @ q90.
  //   • Visually lossless at q90, ~30-40% the size of source JPEG.
  //   • Decoded natively by every modern browser (no extension needed).
  //   • Sharp is the encoder; gltf-transform's textureCompress() walks
  //     every Image in the document and rewrites it.
  //   • If we wanted full KTX2/Basis (true GPU-direct upload, what
  //     landonorris.com uses), we'd need the external `toktx` CLI from
  //     KTX-Software — that's a heavier dep. WebP gets ~80% of the win
  //     with zero install burden, and the runtime KTX2Loader we wired
  //     into configureGLTFLoader.ts is ready for it whenever we add the
  //     toktx pass.
  //
  // Geometry compression: EXT_meshopt_compression.
  //   • 30-50% smaller than uncompressed buffers.
  //   • Faster to decode than Draco (the elder competing standard).
  //   • Three.js GLTFLoader handles it via MeshoptDecoder which we wired
  //     into configureGLTFLoader.ts at runtime. Without that runtime
  //     wiring, the loader rejects the file with "EXT_meshopt_compression
  //     not registered" — that's why the runtime + ingest changes ship
  //     together.
  await doc.transform(
    textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 90 }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );

  // Note on extension wiring: gltf-transform's `meshopt()` transform
  // creates and configures the EXTMeshoptCompression extension instance
  // itself (with the encoder bound). Calling
  // `doc.createExtension(EXTMeshoptCompression)` again here would
  // attach a SECOND, unconfigured extension instance — and the writer
  // would crash with "Cannot read properties of undefined (reading
  // 'encodeGltfBuffer')" at write time. So we let the transform own it.

  await io.write(outPath, doc);

  // Opportunistic KTX2 upgrade. If the build machine has the `toktx`
  // binary on PATH (and `@gltf-transform/cli` available locally), we
  // re-encode all textures from WebP → KTX2/UASTC for an extra 2-4×
  // size reduction AND GPU-direct upload at runtime. If toktx is
  // missing, we leave the WebP-compressed output in place — the
  // runtime decoder pipeline handles both formats transparently.
  // Either path is publish-ready; KTX2 is just the upper bound.
  if (isToktxAvailable()) {
    try {
      compressTexturesAsKTX2(outPath);
      // eslint-disable-next-line no-console
      console.log(`[ingest] ${path.basename(outPath)} — KTX2/UASTC pass applied`);
    } catch (err) {
      // Don't fail the publish if KTX2 conversion errors out (e.g.
      // gltf-transform CLI not installed). The WebP-compressed output
      // is already valid and shippable.
      // eslint-disable-next-line no-console
      console.warn(
        `[ingest] ${path.basename(outPath)} — KTX2 pass failed, keeping WebP fallback:`,
        (err as Error).message,
      );
    }
  } else {
    // eslint-disable-next-line no-console
    console.log(
      `[ingest] ${path.basename(outPath)} — toktx not on PATH; keeping WebP. ` +
        `Install KTX-Software (https://github.com/KhronosGroup/KTX-Software) for KTX2/UASTC publishing.`,
    );
  }

  return (await fs.stat(outPath)).size;
};

// ---------------------------------------------------------------------------
// Internal: pull renderable metadata out of a loaded GLB.
// ---------------------------------------------------------------------------

const extractMeshMetadata = (
  doc: ReturnType<NodeIO['read']> extends Promise<infer T> ? T : never,
  bytes: number,
): MeshMetadata => {
  const root = doc.getRoot();
  const meshes = root.listMeshes();
  const materials = root.listMaterials();
  const textures = root.listTextures();

  let triangles = 0;
  let vertices = 0;
  let drawCalls = 0;
  for (const mesh of meshes) {
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices();
      const position = prim.getAttribute('POSITION');
      const indexCount = indices?.getCount() ?? 0;
      const vertCount = position?.getCount() ?? 0;
      triangles += Math.floor((indexCount || vertCount) / 3);
      vertices += vertCount;
      drawCalls += 1;
    }
  }

  let maxTextureRes = 0;
  for (const tex of textures) {
    const size = tex.getSize();
    if (size) {
      const [w, h] = size;
      maxTextureRes = Math.max(maxTextureRes, w, h);
    }
  }

  let hasNormalMap = false;
  let hasClearcoat = false;
  let hasTransmission = false;
  let hasSheen = false;
  for (const mat of materials) {
    if (mat.getNormalTexture()) hasNormalMap = true;
    // Extensions — KHR_materials_clearcoat etc. — are attached as named
    // extension objects on each material.
    if (mat.getExtension('KHR_materials_clearcoat')) hasClearcoat = true;
    if (mat.getExtension('KHR_materials_transmission')) hasTransmission = true;
    if (mat.getExtension('KHR_materials_sheen')) hasSheen = true;
  }

  return {
    kind: 'mesh',
    triangles,
    vertices,
    meshCount: meshes.length,
    materialCount: materials.length,
    textureCount: textures.length,
    maxTextureRes,
    hasNormalMap,
    hasClearcoat,
    hasTransmission,
    hasSheen,
    drawCallEstimate: drawCalls,
    bytes,
  };
};
