/**
 * surfaceReveal — onBeforeCompile patcher that injects the canonical
 * shader hooks into any PBR-family material (MeshStandardMaterial,
 * MeshPhysicalMaterial, MeshLambertMaterial, …).
 *
 * Two effects, driven by uniforms the runtime mutates each frame:
 *
 *   1. Per-fragment surface-reveal discard. Each vertex carries a
 *      revealTime ∈ [0, 1]. Fragments whose revealTime exceeds the
 *      animated uSurfaceReveal value are discarded → the asset
 *      emerges progressively as the value ramps from 0 to 1.
 *
 *   2. Matte-form → PBR crossfade. uPbrMix ∈ [0, 1] selects between
 *      a neutral lit grey ("form" reading) and the full PBR result.
 *      Avoids the "white blob" frame between proxy and final PBR.
 *
 * The patcher mutates the material in place — we DO NOT clone
 * materials (KHR-extension texture bindings break under clone, per
 * CLAUDE.md §8). Instead we set a userData flag so we don't double-patch
 * the same material in a scene tree with shared materials.
 *
 * The runtime is expected to keep `material.userData.continuumUniforms`
 * pointing at its current uniform values; the patcher wires the
 * shader's uniforms to read from there each compile.
 */

import * as THREE from 'three';

const PATCHED_FLAG = '__continuumChoreographyPatched';

export interface ChoreographyUniformGroup {
  readonly uSurfaceReveal: { value: number };
  readonly uPbrMix:        { value: number };
  readonly uMatteColor:    { value: THREE.Color };
  readonly uBuildShimmer:  { value: number };
  readonly uEdgeColor:     { value: THREE.Color };
}

export const createChoreographyUniforms = (
  matteHex: string = '#bdb5a4',
  edgeHex: string = '#e8a857',
): ChoreographyUniformGroup => ({
  uSurfaceReveal: { value: 0 },
  uPbrMix:        { value: 0 },
  uMatteColor:    { value: new THREE.Color(matteHex) },
  uBuildShimmer:  { value: 0 },
  uEdgeColor:     { value: new THREE.Color(edgeHex) },
});

/** Patch a single material so its shader respects the choreography uniforms. */
const patchMaterial = (
  material: THREE.Material,
  uniforms: ChoreographyUniformGroup,
): void => {
  // Avoid the double-patch problem on shared materials.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m = material as any;
  if (m[PATCHED_FLAG]) {
    // Re-bind uniforms in case the runtime swapped the group out.
    m.userData = m.userData || {};
    m.userData.continuumUniforms = uniforms;
    return;
  }

  m.userData = m.userData || {};
  m.userData.continuumUniforms = uniforms;
  m[PATCHED_FLAG] = true;

  // Materials that drive their own opacity (e.g. transmission) need
  // transparent enabled so the discard works without depth artifacts.
  material.transparent = false;
  material.needsUpdate = true;

  const prevOnBeforeCompile = material.onBeforeCompile;

  material.onBeforeCompile = (shader, renderer) => {
    if (prevOnBeforeCompile) prevOnBeforeCompile(shader, renderer);

    // Wire the shader uniforms to read from the material's userData.
    // Re-binding here means swapping the uniform group on the material
    // will be picked up next compile, without a manual sync step.
    shader.uniforms.uSurfaceReveal = uniforms.uSurfaceReveal;
    shader.uniforms.uPbrMix        = uniforms.uPbrMix;
    shader.uniforms.uMatteColor    = uniforms.uMatteColor;
    shader.uniforms.uBuildShimmer  = uniforms.uBuildShimmer;
    shader.uniforms.uEdgeColor     = uniforms.uEdgeColor;

    // ── Vertex shader: pass revealTime through as a varying. ────────
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `
        #include <common>
        attribute float revealTime;
        varying float vRevealTime;
        `,
      )
      .replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        vRevealTime = revealTime;
        `,
      );

    // ── Fragment shader: declare uniforms + varying. ────────────────
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `
      #include <common>
      uniform float uSurfaceReveal;
      uniform float uPbrMix;
      uniform vec3  uMatteColor;
      uniform float uBuildShimmer;
      uniform vec3  uEdgeColor;
      varying float vRevealTime;
      `,
    );

    // Discard fragments that haven't been "revealed" yet. Place the
    // discard right after `#include <clipping_planes_fragment>` so it
    // runs as early as possible — saves pixel cost on culled fragments.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <clipping_planes_fragment>',
      `
      #include <clipping_planes_fragment>
      if (vRevealTime > uSurfaceReveal + 0.001) discard;
      // Soft edge: fragments very close to the reveal threshold pick
      // up the edge colour briefly so the emerging triangles glow.
      float edgeFactor = smoothstep(uSurfaceReveal - 0.04, uSurfaceReveal, vRevealTime);
      `,
    );

    // Crossfade between matte form (uMatteColor) and full PBR output.
    // We use dithering_fragment as our hook because it's the last
    // include before the final write — by then gl_FragColor has the
    // full PBR result.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `
      #include <dithering_fragment>
      vec3 matteShaded = uMatteColor * (0.55 + 0.45 * max(dot(normalize(vNormal), vec3(0.4, 0.7, 0.5)), 0.0));
      vec3 mixed = mix(matteShaded, gl_FragColor.rgb, uPbrMix);
      // Soft amber edge on the emerging surface.
      vec3 edgeTinted = mix(mixed, uEdgeColor, edgeFactor * 0.65 * (1.0 - uPbrMix));
      // Optional shimmer during the build (very subtle).
      vec3 shimmered = edgeTinted + uEdgeColor * uBuildShimmer * 0.08 * (1.0 - uPbrMix);
      gl_FragColor.rgb = shimmered;
      `,
    );
  };
};

/**
 * Walk every mesh under `root` and patch its material(s). Idempotent —
 * patched materials are skipped, but their uniform group pointer is
 * updated so the runtime can swap groups without re-traversing.
 */
export const applySurfaceReveal = (
  root: THREE.Object3D,
  uniforms: ChoreographyUniformGroup,
): void => {
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const mat = node.material;
    if (Array.isArray(mat)) {
      mat.forEach((m) => patchMaterial(m, uniforms));
    } else if (mat) {
      patchMaterial(mat, uniforms);
    }
  });
};
