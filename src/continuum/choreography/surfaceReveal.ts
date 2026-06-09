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
  /**
   * How far below the final surface each triangle starts, in object-space
   * units. Each vertex begins at `position - normal * uRiseDistance` and
   * animates back to `position` during its individual rise window.
   * 0.0 disables the rise; ~0.15–0.35 is a good visual range.
   */
  readonly uRiseDistance:  { value: number };
  /**
   * Width of each vertex's rise window, as a fraction of the global
   * surface-reveal ramp. 0.04 means each vertex takes 4% of the surface
   * stage to rise from inside to its final position. Smaller = sharper
   * cluster boundaries; larger = softer, more cross-fade-y.
   */
  readonly uRiseWindow:    { value: number };
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
  uRiseDistance:  { value: 0.22 },
  uRiseWindow:    { value: 0.05 },
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
    shader.uniforms.uRiseDistance  = uniforms.uRiseDistance;
    shader.uniforms.uRiseWindow    = uniforms.uRiseWindow;

    // ── Vertex shader ─────────────────────────────────────────────
    // The signature surface effect: each vertex starts displaced
    // inward by uRiseDistance along its surface normal, then animates
    // back to its final position during a short individual window
    // inside the global surfaceReveal ramp. Visually: triangles
    // "rise to the top of the surface" instead of popping in.
    //
    // Per-vertex math:
    //   emergence = clamp((uSurfaceReveal - revealTime) / uRiseWindow, 0, 1)
    //   displaced = position - normal * uRiseDistance * (1 - emergence)
    //
    // We scale revealTime by (1 - uRiseWindow) so the LAST vertex
    // still fully emerges by uSurfaceReveal = 1.0.
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `
        #include <common>
        attribute float revealTime;
        uniform float uSurfaceReveal;
        uniform float uRiseDistance;
        uniform float uRiseWindow;
        varying float vRevealTime;
        varying float vEmergence;
        `,
      )
      .replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        vRevealTime = revealTime;
        float scaledReveal = revealTime * (1.0 - uRiseWindow);
        vEmergence = clamp((uSurfaceReveal - scaledReveal) / max(uRiseWindow, 0.001), 0.0, 1.0);
        // Push the vertex inward along its normal by an amount that
        // shrinks to zero as the vertex finishes emerging. The
        // attribute "normal" is in object space, which matches
        // "transformed" at this point in the shader chain.
        transformed = transformed - normal * uRiseDistance * (1.0 - vEmergence);
        `,
      );

    // ── Fragment shader ───────────────────────────────────────────
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
      varying float vEmergence;
      `,
    );

    // Fragments whose vertex hasn't begun rising are skipped entirely.
    // This is much cheaper than running PBR for invisible triangles.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <clipping_planes_fragment>',
      `
      #include <clipping_planes_fragment>
      if (vEmergence <= 0.001) discard;
      // edgeFactor peaks for triangles that are mid-rise. Once a
      // triangle settles (vEmergence == 1) the glow fades out.
      float edgeFactor = 1.0 - vEmergence;
      `,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `
      #include <dithering_fragment>
      vec3 matteShaded = uMatteColor * (0.55 + 0.45 * max(dot(normalize(vNormal), vec3(0.4, 0.7, 0.5)), 0.0));
      vec3 mixed = mix(matteShaded, gl_FragColor.rgb, uPbrMix);
      // Rising triangles glow at the amber edge colour; the glow
      // fades as the triangle reaches the final surface and the
      // matte/PBR result becomes its full value.
      vec3 edgeTinted = mix(mixed, uEdgeColor, edgeFactor * 0.75 * (1.0 - uPbrMix * 0.6));
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
