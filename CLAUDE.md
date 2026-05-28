# Continuum UI — System Guidelines (v2.0)

Continuum UI is a **streaming engine** for 3D web experiences. Its job is to make
3D content feel as instant as a 2D skeleton page. Every rule below exists to
protect two budgets: **60 fps** and **perceptual continuity**.

---

## 1. Role & Mindset

You are a Senior Spatial Systems Architect working in the React Three Fiber
(R3F) ecosystem. You think in three dimensions, GPU memory, and frame budgets,
not just component trees. Before writing any 3D code, ask: *what does this cost
in draw calls, VRAM, and shader compiles?*

---

## 2. The Three LOD Tiers

| Tier   | Source   | Poly budget    | Materials                          | Textures              |
| ------ | -------- | -------------- | ---------------------------------- | --------------------- |
| LOD 0  | Spline   | < 500 tris     | Unlit / MeshBasicMaterial          | None (vertex color)   |
| LOD 1  | Blender  | 2k – 15k tris  | MeshStandardMaterial               | 1k or 2k, JPG/PNG     |
| LOD 2  | Blender  | 30k – 150k     | MeshPhysicalMaterial (refraction)  | 2k/4k, **KTX2 only**  |

LOD 0 is always loaded first. LOD 1 and LOD 2 are streamed based on the
decision made by `useHydration`.

---

## 3. The Skeleton Mirror Rule

**LOD 0 and LOD 2 must share identical axis-aligned bounding box dimensions
AND pivot/origin.** If the skeleton does not mirror the hero, the swap "pops"
and breaks perceptual continuity.

- Enforce at export: in Blender, zero transforms and bake pivot to world origin
  before export; in Spline, copy the LOD 2 bounding box into LOD 0 before
  export.
- Enforce at runtime: `assertSkeletonMirror()` runs in dev builds and throws
  if `box.getSize()` differs by more than 1% across tiers.

---

## 4. Asset Naming Convention

All GLB files in `src/assets/models/` MUST follow:

```
AssetName_LOD0.glb   // Spline skeleton (proxy)
AssetName_LOD1.glb   // Blender standard
AssetName_LOD2.glb   // Blender hero (Draco + KTX2)
```

`<ContinuumAsset id="AssetName" />` will auto-resolve all three paths from the
asset registry. If a tier is missing, the component holds at the next lower
tier and logs a warning in dev.

---

## 5. Memory Management (`.dispose()` Discipline)

GPU memory does **not** get reclaimed by JS garbage collection. Every
`geometry`, `material`, and `texture` must be disposed on unmount or LOD-down
transitions.

- When stepping **down** from LOD 2 → LOD 1, traverse the LOD 2 scene and call
  `.dispose()` on every material/texture/geometry.
- When unmounting a `<ContinuumAsset />`, dispose all three tiers.
- Never re-use the same `GLTF` scene instance across two mount points; clone
  materials and geometries per instance, or share via explicit material refs.
- Track cumulative `vramBytes` in `useContinuumStore`. If it exceeds the
  per-tier budget (low: 128MB, mid: 512MB, high: 1GB) the hydrator must
  downgrade the furthest-from-camera assets.

---

## 6. Strict TypeScript Interfaces

- `strict: true` and `noUncheckedIndexedAccess: true` in `tsconfig.json`.
- Every public prop on a Continuum component is defined by an exported
  `interface` (not `type`, to allow downstream declaration merging).
- `any` is forbidden. Use `unknown` + a narrowing guard.
- LOD tiers are modeled as a `0 | 1 | 2` literal union, never `number`.

---

## 7. Performance Budget

- Target: **60 fps** on a mid-tier laptop GPU (e.g., MacBook Air M2,
  integrated Intel Iris Xe).
- Max **2** LOD swaps per asset per second. Swaps cost a shader compile and a
  bounding-box recalc; thrashing is worse than staying at the wrong tier.
- All `useFrame` work is O(visible assets). Off-screen assets must early-exit
  via frustum culling.
- Distance checks use `distanceToSquared()` — **never** `Math.sqrt`.
- Shader compiles for LOD 2 materials are pre-warmed with `gl.compile(scene,
  camera)` as soon as `useHydration` predicts an upgrade.

---

## 8. GSAP Dither-Fade Transitions

LOD transitions last exactly **0.3s** and use a Bayer-matrix dither fade in the
fragment shader, *not* alpha blending. Alpha blending on overlapping LODs
creates transparency-sort artifacts and doubles the fragment cost for the
transition window.

- GSAP animates a `uDither` uniform from 0 → 1 (out) and 0 → 1 on the new tier
  (in). Both meshes stay opaque; pixels are discarded per the dither pattern.
- Easing: `power2.inOut`. No bounce, no elastic.

---

## 9. Zustand State Discipline

`useContinuumStore` is the single source of truth for hydration state. Rules:

- Components read via selectors (`useContinuumStore(s => s.assets[id])`) to
  avoid re-rendering on unrelated asset changes.
- Never mutate state outside store actions. No `state.foo = bar` inside
  components.
- Actions never perform async work directly. They update state; hooks and
  effects drive loaders.

---

## 10. Agentic Hydration (`useHydration`)

This hook is the "agent" that decides whether to upgrade to LOD 2 or hold at
LOD 1. Inputs:

- `navigator.connection.downlink` and `effectiveType` (live bandwidth).
- `performance.memory.usedJSHeapSize` (proxy for system pressure).
- `renderer.info.memory.textures` (VRAM consumption, via ref).
- Optional: an n8n webhook (`VITE_N8N_HYDRATION_URL`) that returns a remote
  hardware profile / policy override.

Outputs: writes `perfTier` and per-asset `maxLOD` into `useContinuumStore`.
`<ContinuumAsset />` never calls the hook directly; it reads `maxLOD` from the
store each frame.

---

## 11. Visual Language

- Background: `#000`. Pure black, never off-black.
- Accent: **warm amber `#FF8C00`** for glows, focus rings, and LOD indicators.
  Used sparingly — the point is contrast, not saturation.
- Layout: Bento Box grid. Generous padding, 1px hairline dividers on `#FFFFFF22`.
- Typography: a geometric sans (Inter Tight or similar), tight tracking, ALL
  CAPS labels for metadata, lowercase for body.
- Motion: only in response to intent (hover, scroll-into-view) or LOD changes.
  Never ambient/idle motion in the UI layer.

---

## 12. Alignment is Non-Negotiable

Every visible element must align perfectly with whatever sits behind, beside,
or beneath it. This is a hard rule, not a guideline.

- **No decorative rectangles, gradients, glows, or radial blooms behind a grid
  or row of elements unless they share that grid's exact bounding box.** If a
  background bloom is wider, narrower, or offset by even a few pixels from the
  cards it sits behind, it reads as misaligned and breaks the composition.
- **Card grids must use a single source of truth for the row track.** Skeleton
  state, loaded state, and any decorative background must occupy identical
  pixel boxes. Use the same `min-height` everywhere, or let the grid cell own
  the height.
- **Section dividers, hairlines, and accent rules must be flush with the
  content's text container.** Don't pad them with arbitrary `%`-based insets
  unless those percentages are computed from the same column system the
  content uses.
- **Skeleton frames and the content they replace must share the same outer
  geometry.** SkeletonCardFrame and the real card render in the same grid
  cell at the same `inset: 0`. ConductorStep enforces this — keep it that way.
- **Decorative gradients on a section background**: only allowed if they
  cover the full bleed of the section, OR are anchored to a specific element
  via `position: absolute; inset: 0` of THAT element (so they always track
  it). Free-floating insets like `inset: 60px 6% 40px 6%` are forbidden.
- **When in doubt, remove the decoration.** A clean dark surface is always
  preferable to a misaligned bloom.

If you catch yourself writing arbitrary px / % insets on a `::before` or
`::after`, stop. Either tie that pseudo-element to the actual content's
geometry (via the same parent + `inset: 0`) or delete it.

---

## 13. Do-Nots

- **Never wrap a 3D viewport in a visible frame, border, panel, or rounded
  background.** No `border:`, no `border-radius:` on the canvas container, no
  card/panel parent that visually outlines the 3D surface. The 3D scene must
  appear to float on the page background. This rule applies to every page —
  Atelier, Relay, Gallery, Latency, Compare, Auto, A/B Loading, every viewport.
  If a page calls for a "viewport" wrapper for layout purposes, it must have
  `border: 0; background: transparent;`. The only exception is `ContactShadows`
  *inside* the canvas — that's geometry, not chrome.
- Do not add LOD 3 or intermediate tiers. Three tiers is the contract.
- Do not call `Math.sqrt` in `useFrame`.
- Do not store `THREE.Object3D` instances inside Zustand. Refs only.
- Do not import `.glb` files directly; resolve through the asset registry so
  LOD-gating can intercept.
- Do not block the main thread on texture decode. KTX2 decodes on the GPU;
  Draco decodes in a worker. Configure both loaders up front.

---

## 14. Demo Structure Rule — Live LOD Tier Build

**Every demo page that claims to show the engine must show the LOD build as
visible, sequenced tiers the viewer can read.** This is a product rule, not a
style preference. It exists because the engine's real value is the
choreography between tiers — if the user can't see the tiers, the
choreography is invisible and the demo is not doing its job.

Concretely, every demo viewport must satisfy all four of the following:

1. **Hold each tier for at least 800 ms** before advancing to the next, even
   if the asset has finished loading. The user's eye needs that long to
   register the change. A demo that completes faster than 800 ms per tier
   has skipped the demonstration.
2. **Display the current tier on screen** as `TIER N · <state>` (e.g.
   `TIER 0 · POSITION PROXY`, `TIER 1 · WIREFRAME 4K TRIS`,
   `TIER 2 · WIREFRAME 30K TRIS`, `TIER 3 · PBR FADE-IN`,
   `TIER 4 · FINAL`). The label changes when the tier advances. This is the
   only way the viewer learns what each tier looks like.
3. **The control side of any A/B demo must NEVER finish before the variant
   side does.** If the control finishes faster, the demo is showing the
   wrong story (it's a speed test, not a perception test). Cap both sides
   to the same wall-clock budget; the variant wins on what the user
   perceives during that budget, not on total time.
4. **Replay must be re-runnable cold.** Pressing Replay must reset every
   tier back to TIER 0 immediately and start over, even on a warm asset
   cache. If a viewer cannot watch the build twice, they will assume the
   build does not happen at all.
5. **No stray blueprint / skeleton primitives may render outside an active
   tier.** Components like `BlueprintMark`, `BlueprintConstructionGrid`,
   `BlueprintParagraph`, `WireframeProxy`, and `SkeletonCardFrame` are part
   of the tier system — they exist only because a tier is in flight. They
   must NEVER render during page transitions, route changes, hydration
   warm-up, or "stable" final states. The default for these components is
   `visible={false}`; a tier explicitly turns them on and explicitly turns
   them off when it advances. Flashing blueprint lines during a route
   change is the user seeing the system's seams — fail mode.

Demos that violate this rule have failed in the past:
- ProxyDemoPage (Ch 05) — both sides finished in ~16ms vs ~11s because the
  cache was warm and the proxy paint happened faster than human perception.
  Result: identical-looking panels. Failure mode #1, #4.
- WatchShowcasePage (Ch 06, original procedural version) — never displayed
  what tier was active. The user saw a moving watch and had to guess what
  the engine was doing. Failure mode #2.

When in doubt, slow the demo down. The audience for these pages is recruiters
and designers who have never seen progressive 3D before. The demo's job is to
TEACH the concept, not to brag about throughput.
