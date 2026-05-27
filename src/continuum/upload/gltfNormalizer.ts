/**
 * gltfNormalizer — convert a parsed THREE.Object3D scene to a .glb file
 * the Supabase ingest pipeline can consume.
 *
 * The Edge Function intentionally only accepts .glb / .gltf because:
 *   - Deno has no FBX SDK / Blender / Assimp
 *   - The Three.js loaders are browser-only (DOM-coupled)
 *
 * Instead of porting loaders server-side, we normalise on the client.
 * The dropzone already parses every supported format into THREE.Object3D
 * via assetLoader.ts; this function reverses that with GLTFExporter so
 * the same shape can ride through the existing .glb pipeline.
 *
 * GLTFExporter writes the binary glTF container with all geometry,
 * materials, textures (as embedded PNG/JPEG), and node hierarchy. The
 * round-trip is lossless for everything the LOD progressive engine
 * cares about. Animation clips ARE serialised but the engine doesn't
 * use them.
 */

import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

/**
 * Serialise a THREE scene to a .glb ArrayBuffer.
 *
 * Wraps the callback-style GLTFExporter API in a Promise so callers
 * can await it. `binary: true` produces a single .glb blob (instead
 * of separate .gltf + .bin + textures), and `embedImages: true`
 * inlines every texture so the result is self-contained.
 */
export const sceneToGLB = (scene: THREE.Object3D): Promise<ArrayBuffer> =>
  new Promise((resolve, reject) => {
    const exporter = new GLTFExporter();
    exporter.parse(
      scene,
      (result) => {
        if (result instanceof ArrayBuffer) {
          resolve(result);
        } else {
          // With binary:false GLTFExporter returns the JSON manifest;
          // we asked for binary so this branch shouldn't fire.
          reject(new Error('GLTFExporter returned JSON instead of binary glb'));
        }
      },
      (err) => {
        reject(
          err instanceof Error
            ? err
            : new Error(`GLTFExporter failed: ${String(err)}`),
        );
      },
      {
        binary: true,
        embedImages: true,
        // onlyVisible:false guarantees we ship even meshes the loader
        // hid (e.g. asset stub helpers in the source file). Cheap
        // insurance against losing data on round-trip.
        onlyVisible: false,
        // Apply pending matrix transforms before export so coordinate-
        // space transforms set up by the original loader don't get
        // double-applied on re-import.
        forceIndices: true,
      },
    );
  });

/** Wrap an ArrayBuffer in a File the Supabase storage SDK accepts. */
export const glbBufferToFile = (
  buffer: ArrayBuffer,
  fileName: string,
): File => {
  const safe = fileName.replace(/\.[a-z0-9]+$/i, '') + '.glb';
  return new File([buffer], safe, { type: 'model/gltf-binary' });
};
