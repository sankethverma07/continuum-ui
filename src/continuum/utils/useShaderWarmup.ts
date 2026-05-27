/**
 * useShaderWarmup — eliminates cold-reload stutter in the LOD engines.
 *
 * **The problem.** On a cold page reload (Cmd+R, F5), every shader
 * program in the scene has to be compiled by the GPU driver the first
 * time the renderer encounters its material. THREE generates a unique
 * GLSL program per material variant (PBR-with-normalMap is a different
 * program than PBR-with-normalMap-and-AO), and each compile is
 * synchronous and blocks the main thread for 30-200ms on a typical
 * mid-range GPU. For a complex .glb (35-material McLaren ≈ 1-7s of
 * cumulative blocking), that blocking shows up as the visible stutter
 * the user notices during the wireframe + material build.
 *
 * On an in-page Replay (`runToken++`), the WebGL context is alive,
 * every program is already in the driver's cache, every texture is in
 * VRAM. Frame 1 is buttery because frame 1 isn't actually first.
 *
 * **The fix.** Three.js ships `WebGLRenderer.compile(scene, camera)`
 * which walks every material in the scene and uploads + compiles its
 * shader program WITHOUT rendering. After this returns, all subsequent
 * renders skip compile and run at full frame rate.
 *
 * We additionally enable `KHR_parallel_shader_compile` (Chrome / most
 * desktop GPUs) so the driver can compile programs in worker threads
 * without blocking the main thread at all.
 *
 * **Where to use this hook.** Inside any R3F engine that loads a glTF
 * scene with PBR materials. Pass the `THREE.Object3D` root that
 * contains the materials you'll render. The hook re-warms whenever
 * that scene reference changes (i.e. a new asset loaded), so a fresh
 * import via the dropzone gets the same smooth first-frame as a Replay.
 *
 * The hook is fire-and-forget: it logs success/failure to the console
 * and never throws. The first paint may technically wait an extra
 * frame for compile to finish, but that frame is invisible — it
 * happens during the engine's hologram-boot phase (~600ms) anyway.
 */

import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

export interface ShaderWarmupOptions {
  /** Optional label shown in the console log so you can tell warm-ups
   *  apart when multiple engines are mounted (A/B page, multi-viewport).
   *  Defaults to "(unnamed)". */
  readonly label?: string;
}

export const useShaderWarmup = (
  scene: THREE.Object3D | null | undefined,
  options: ShaderWarmupOptions = {},
): void => {
  const { gl, camera } = useThree();
  const { label = '(unnamed)' } = options;

  useEffect(() => {
    if (!scene) return;

    // Enable parallel shader compile if the GPU + browser supports it.
    // Chrome desktop has this; Safari does not. THREE auto-detects and
    // routes to non-blocking codepaths once the extension is enabled.
    // Calling getExtension() is idempotent — repeat calls are free.
    try {
      const ctx = gl.getContext() as WebGLRenderingContext | WebGL2RenderingContext;
      ctx.getExtension('KHR_parallel_shader_compile');
    } catch {
      /* No-op — extension not supported, fall through to sync compile. */
    }

    // Pre-compile every material in the scene. THREE walks the scene
    // graph, generates the GLSL for each unique material variant, ships
    // it to the driver, and waits for compile to finish (or queues it
    // when KHR_parallel_shader_compile is active). After this returns,
    // the driver's program cache contains every shader the upcoming
    // render frames will need.
    const startedAt = performance.now();
    try {
      gl.compile(scene, camera);
      // eslint-disable-next-line no-console
      console.warn(
        `[Continuum.warmup] ${label} pre-compiled in ${(performance.now() - startedAt).toFixed(1)}ms — first render should be smooth`,
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[Continuum.warmup] ${label} pre-compile failed:`, err);
    }
  }, [scene, gl, camera, label]);
};
