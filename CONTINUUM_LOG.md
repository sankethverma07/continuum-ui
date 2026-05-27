# Continuum — shared session log

> **Read me first if you're a Claude session opening this project.**
> This file is the bridge between multiple Claude sessions working on the same codebase.
> The user (Sanketh) maintains parallel chats — one in Cowork mode driving the codebase,
> potentially another in Framer / Claude Code / another tool. This log keeps everyone in
> sync without requiring real-time API access between sessions.
>
> **Protocol:**
> 1. **At session start** — read this file end-to-end. It is the source of truth for
>    project state and recent decisions.
> 2. **Before doing significant work** — check the "Open threads" section so you don't
>    redo or contradict pending decisions.
> 3. **After each meaningful exchange** — append a dated entry to "Activity log" with
>    what was asked, what shipped, and any new open threads. Keep it tight (3–6 bullets).
> 4. **Never delete history** — only append. Old entries stay so future sessions see
>    the full arc.
> 5. **Single source of truth** — if this file disagrees with your assumptions, this
>    file wins. Update your context, don't update the file to match a wrong assumption.

---

## 1. Project at a glance

**Continuum** is a React Three Fiber engine for premium progressive 3D loading on the
web. It's a code asset that website builders drop into a React project to render
glTF/glb assets with a wireframe → material → final-PBR reveal sequence, instead of
the conventional spinner + pop-in.

**Audience.** React developers building 3D-heavy product / portfolio / agency sites
who want landonorris.com-tier loading without writing the engine themselves.

**Where it lives.** The portfolio site explaining Continuum is being built separately
in **Framer**. This codebase IS the technical asset — the live demo / proof / runtime
library. The two will be linked from the Framer site.

**Repo location.** `Desktop/continuum UI/` (Windows) → mounted into the Cowork sandbox
at `/sessions/.../mnt/Desktop/continuum UI/`.

**Run locally.** Double-click `start-dev.bat` → Vite binds `localhost:5173` → seven
demo routes available via the top nav (`/demo`, `/phone`, `/compare`, `/latency`,
`/watch`, `/auto`, `/ab`).

**Strongest demo.** `/ab` — McLaren P1 side-by-side: naive `new GLTFLoader().load()`
+ spinner on the left, Continuum semantic progressive on the right. Same file, same
4.2s wall clock, dramatically different perceived experience.

---

## 2. Architecture (current state)

Build pipeline → Runtime decoder → Engine variants → Reveal phases → Output.

**Build-time (publish path).**
- Universal asset loader accepts 12 formats (glb, gltf, fbx, obj, stl, ply, usdz, dae,
  3ds, wrl, zip bundles, Spline runtime URLs).
- Decimation via `gltf-transform` + `meshoptimizer` — emits N LOD tiers based on a
  complexity score.
- Compression: WebP textures (`textureCompress` via sharp) + meshopt geometry
  (`meshopt` transform with `MeshoptEncoder`). Optional KTX2/Basis if `toktx` is on
  PATH (auto-detected; falls back to WebP cleanly if missing).
- Output published to Supabase storage; catalog row keyed by asset id.

**Runtime decoder.**
- Modern `GLTFLoader` configured with `KTX2Loader` (Basis transcoder from CDN),
  `DRACOLoader` (Google gstatic CDN), and `MeshoptDecoder`.
- All three wired via `src/continuum/utils/configureGLTFLoader.ts` + `engineExtendLoader`
  passed to drei's `useGLTF(url, true, true, engineExtendLoader)`.
- Two material rescue passes auto-correct exporter bugs:
  - `rescuePlaceholderMaterials` — restores diffuse on stub-color materials with no
    texture maps (e.g. some Sketchfab-published meshes).
  - `rescueOverTransparentMaterials` — demotes `alphaMode: BLEND` to OPAQUE when the
    material has a complete PBR stack (the Sketchfab/Spline/Blender exporter bug
    where one window's alpha gets applied to the whole asset).
- `useShaderWarmup` hook calls `gl.compile(scene, camera)` + enables
  `KHR_parallel_shader_compile` to eliminate cold-reload stutter.

**Engine variants** (one fires per asset, picked by complexity):
- `StandardProgressiveEngine` — default render path, single sequence.
- `MultiElementProgressiveEngine` — wraps Standard in a per-subject loop for
  multi-mesh scenes (spaceship, watch case+strap+bezel).
- `HeavyProgressiveEngine` — Standard with stretched time budget for high-tri hero
  pieces. Note: tasks #211 and #214 in the history show this was originally separate
  but now mostly routes through Standard.

**Reveal phases** (shared across engines):
1. Hologram boot (~600ms hidden — pre-warm + setup).
2. Wireframe build (triangle densification).
3. Material build (PBR fades in over wireframe).
4. Final PBR (autorotate + orbit controls live).

**Skeleton system** (parallel UX layer):
- `PageConductor` + `useRevealed` — orchestrates a single clock for the page.
- `BlueprintText` — hollow-stroke → filled letters synced to the reveal envelope.
- `BlueprintParagraph` — multi-line dimmed bars that fill in.
- `SkeletonCardFrame` — comet pulses traveling around card perimeters; supports
  `pulse={false}` (opt-out for dense grids) and `watermark={node}` (Sketchfab-style
  centered brand mark).
- `BlueprintMark` — reusable engineering glyph for watermarks.
- `BlueprintConstructionGrid` — engineering-paper backdrop (dot/cross perspective grid
  with vignette). Borrowed from Bruno Simon's portfolio aesthetic.

**Diagram.** A detailed architecture visualization was rendered in chat
(`continuum_architecture_detailed`) showing the full flow with symbols. If you need to
recreate it, the structure is: input formats (gray) → 4-box ingest pipeline (purple) →
3-box runtime layer (teal) → 3-engine selector (teal) → 4-phase reveal sequence (coral)
→ output (gray). Phase symbols: dashed circle (boot), outline triangle (wireframe),
filled triangle (material), filled circle (final).

---

## 3. Stack + key files

**Frontend.** React 18, Vite 5, React Three Fiber 8, drei 9, Three.js 0.169,
Zustand, GSAP, Lenis-style smooth scroll patterns.

**Build pipeline.** `gltf-transform` v4, `meshoptimizer` 0.22, `sharp` 0.33.

**Backend.** Supabase (storage + edge functions for ingest trigger).

**Critical files** (order = most touched first):
- `src/App.tsx` — hash router, 7 routes
- `src/router/useHashRoute.ts` — route key parser
- `src/router/DemoSwitcher.tsx` — top nav
- `src/continuum/components/AutoProgressiveGLBAsset.tsx` — main engine + rescue passes
- `src/continuum/components/MultiElementProgressiveEngine.tsx` — multi-subject variant
- `src/continuum/components/AutoProgressiveHero.tsx` — Canvas + lighting wrapper
- `src/continuum/utils/configureGLTFLoader.ts` — KTX2/Draco/Meshopt wiring
- `src/continuum/utils/useShaderWarmup.ts` — pre-compile hook
- `src/continuum/skeleton/PageConductor.tsx` — reveal orchestrator
- `src/continuum/skeleton/SkeletonCardFrame.tsx` — comet + watermark
- `src/continuum/skeleton/BlueprintText.tsx` — hollow→fill text
- `src/continuum/skeleton/BlueprintConstructionGrid.tsx` — engineering backdrop
- `src/continuum/skeleton/BlueprintMark.tsx` — watermark glyph
- `src/pages/LoadingStrategyComparePage.tsx` — A/B McLaren demo (the strong one)
- `src/pages/WatchShowcasePage.tsx` — Atelier dress-watch showcase
- `ingest/src/generateMeshLODs.ts` — publish-side compression pipeline
- `CLAUDE.md` — project conventions + "Do-Nots" (read this before changing visual style)

**Test assets in `public/`.** mclaren-p1.glb, BMW.glb, free-fire.glb, skull.glb,
spaceship.glb (27 MB original), spaceship-compressed.glb (2.1 MB through new pipeline),
Bottle-test.glb.

---

## 4. Recent significant decisions

- **Boot curtain dropped.** Built a pre-React HTML curtain with a self-drawing
  CONTINUUM wordmark and progress counter. User said "drop it, this isn't a real
  website." Removed. Kept the `BlueprintConstructionGrid` since it actually adds depth
  on the watch showcase.
- **No boxes around 3D viewports.** Hard rule in `CLAUDE.md` §13. Never wrap a 3D
  canvas in a visible border / panel / rounded background. The 3D scene must float on
  the page background.
- **Pulse density audited.** Watch showcase had ~36 SMIL `<animate>` elements running
  at once (6 feature cards × 5 pulse layers + hero). Demoted feature cards to
  `pulse={false}` and added `BlueprintMark` watermarks. Now 5 animate elements total —
  only the hero card pulses, feature cards stamp the engineering glyph instead.
- **Spaceship outer-skin bug diagnosed.** The asset had `alphaMode: BLEND` on every
  material, causing depth-sort issues that hid the outer hull behind interior detail.
  This is a Sketchfab/Spline/Blender export pathology, not a Continuum bug. The
  `rescueOverTransparentMaterials` pass auto-fixes it. Demoted 3 materials per load.
- **Compression pipeline shipped.** Spaceship 27 MB → 2.1 MB (13× reduction) through
  meshopt + WebP, all materials preserved, parses in 36ms at runtime.
- **Conditional KTX2.** `isToktxAvailable()` detects `toktx` on PATH. If present,
  textures get KTX2/UASTC encoding (additional 2-4× shrink). Otherwise WebP fallback.
  Either path is shippable; runtime decoder reads both.
- **Reduced-motion compliance.** Every animated skeleton component honors
  `prefers-reduced-motion: reduce`. SMIL doesn't natively, so `SkeletonCardFrame` uses
  a `useReducedMotion` hook that conditionally skips the `<animate>` element.

---

## 5. Open threads / pending decisions

- **Bridge interface (NOT YET BUILT).** User wants a single drop-in
  `<ContinuumViewer src="/asset.glb" />` component that auto-detects asset complexity,
  picks engine variant, configures tier count + blueprint color, and wires the Canvas
  + lights with sensible defaults. ~80% of primitives exist (`complexityScore`,
  `tierCountFor`, `pickBlueprintColor`, `engineExtendLoader`) but never glued into one
  entry point. **This is the highest-leverage remaining work** for the website-builder
  audience.
- **Deployment.** Currently dev-only. For Framer embed / live link, needs:
  Vercel/Netlify/Cloudflare Pages deploy; Supabase env vars set on the host; consider
  moving the 80MB of `public/*.glb` assets to Supabase Storage to keep the bundle lean.
- **Cosmetic polish for portfolio link-out.** Browser title still says "Relay 01 — A
  Continuum UI Showcase" (placeholder). Top nav copy is dense
  ("UPLOAD ANY .GLB INGEST-DRIVEN BLUEPRINT" etc). Both worth a pass before linking
  from Framer. Not blockers.
- **toktx install for full KTX2.** Need `winget install KhronosGroup.KTX-Software`
  + `npm install -g @gltf-transform/cli` to unlock the better compression path. Not
  shipped yet on Sanketh's machine.

---

## 6. Activity log (reverse chronological)

### 2026-04-28 — Cross-chat bridge set up
- User asked for a way to keep multiple parallel Claude chats in sync.
- Architectural reality: no real-time API for inter-session messaging.
- Solution: this file. Append-only structured log that any session with filesystem
  access can read at start + append at end.
- Created `CONTINUUM_LOG.md` at project root with project state, architecture,
  recent decisions, open threads, and this activity log.

### 2026-04-28 — Live A/B simulation captured
- Restarted Vite dev server via `start-dev.bat` (computer-use to navigate File
  Explorer + double-click). Vite v5.4.21 ready in 511ms.
- Drove the A/B McLaren simulation in Chrome MCP. Captured 5 frames of the reveal:
  naive spinner @ 26% on the left while Continuum had already painted a golden
  wireframe on the right. By T+2s, right side fully PBR; left still spinning.
- Console confirmed `useShaderWarmup` firing 4× (semantic + naive, original + replay)
  with 2.2-17ms compile times. Architecture working as designed.

### 2026-04-28 — Detailed architecture visualization
- Rendered `continuum_architecture_detailed` SVG showing 4-tier stack: input → ingest
  → runtime → engine selector → reveal phases → output.
- 4 colored ramps (gray endpoints, purple build, teal runtime/engines, coral phases)
  + symbol indicators per phase (dashed circle = boot, outline triangle = wireframe,
  filled triangle = material, filled circle = final).
- User confirmed this is the level of detail they wanted.

### 2026-04-28 — Skeleton-screen research + 3 upgrades shipped
- Studied 5 reference sites: landonorris.com, activetheory.net, brunosimon.com,
  sketchfab.com, apple.com.
- Identified 3 high-impact gaps: pulse density, brand watermarks, reduced-motion
  audit. Implemented all three.
- Added `pulse={false}` and `watermark={node}` props to `SkeletonCardFrame`. Created
  `BlueprintMark` glyph component. `useReducedMotion` hook added to `SkeletonCardFrame`.
- Wired into `WatchShowcasePage` feature grid: 6 cards × static + watermark, hero
  card unchanged. SMIL `<animate>` count dropped from ~36 to 5.

### 2026-04-28 — Boot curtain built then dropped
- Built pre-React HTML boot curtain with self-drawing CONTINUUM SVG wordmark + progress
  counter + engineering-grid background.
- User said "this isn't a real website, drop it." Removed cleanly.
- Kept `BlueprintConstructionGrid` component — actually useful on the watch page.

### 2026-04-28 — Spaceship outer-hull fix
- Diagnosed missing skin as `alphaMode: BLEND + doubleSided: true` on every
  material — exporter pathology, not compression bug. Both original and compressed
  files had the same problem.
- Built `rescueOverTransparentMaterials` runtime pass that detects + demotes the
  bad-export pattern. Skips legit glass (low opacity) and legit cutouts (alphaTest > 0).
- Verified live: `Rescued 3 over-transparent material(s)` fires per spaceship load.

### 2026-04-28 — Compression pipeline + conditional KTX2
- Wired KTX2Loader + DRACOLoader + MeshoptDecoder into runtime via
  `configureGLTFLoader`. Drei's `useGLTF` now calls the universal extendLoader.
- Build side: meshopt geometry compression + WebP textures via gltf-transform.
- Spaceship test: 27MB → 2.1MB (13× reduction), 36ms parse, all extensions handled.
- Conditional KTX2 branch added — detects `toktx` on PATH, falls back to WebP cleanly
  if missing. Dev sandbox doesn't have toktx → WebP path verified.

---

*Last updated: 2026-04-28 by the Cowork session.
Next session: append your entry above this line, don't replace history.*
