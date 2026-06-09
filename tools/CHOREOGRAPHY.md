# Continuum Canonical Choreography

This folder owns the **one** reveal animation that every Continuum asset
plays. Source of truth lives in `author-choreography.py` — a Blender
Python script that bakes a glTF animation onto any input glb.

## Why this exists

Each demo page was inventing its own timing, so the McLaren and the
watch felt like they came from different engines. The choreography pipeline
makes the reveal one deterministic artifact: a glTF animation that the
runtime replays verbatim on every asset. Change the script → re-run →
every page picks up the new feel.

## Reveal aesthetic

Triangles emerge **on the surface** of the model (skull-style), not as
primitives built inside the volume (the old watch-style we rejected).
Five visible stages, total ~4.2 s:

| Stage | Time         | What the viewer sees                                     |
|-------|--------------|----------------------------------------------------------|
| 0     | 0.0 – 0.4 s  | Proxy wireframe silhouette only.                         |
| 1     | 0.4 – 1.5 s  | ~10 % of surface triangles visible, scattered organically.|
| 2     | 1.5 – 2.5 s  | ~50 % coverage. The form is clearly readable.            |
| 3     | 2.5 – 3.5 s  | 100 % coverage. Matte volume, no textures yet.           |
| 4     | 3.5 – 4.2 s  | Tier A → B → C → D → E materials crossfade in.           |

Material tiers, in fade-in order:

- **A · form** — neutral lit matte (no texture maps yet)
- **B · surface response** — roughness + metalness
- **C · micro-detail** — normal + ambient occlusion
- **D · color** — baseColor / albedo texture
- **E · effects** — clearcoat, sheen, transmission, emissive, KHR extensions

## How to run the script

You need Blender 5.0 (already installed).

1. Save a fresh `continuum.blend` file at the repo root (one directory
   above `tools/`). This is the anchor for the `//` relative paths.
2. Open the **Scripting** workspace tab.
3. **Text ▸ Open** and pick `tools/author-choreography.py`.
4. (Optional) Edit the **CONFIG** block at the top — change INPUT_GLB
   to a different asset, or change REVEAL_PATTERN to one of:
   - `"scatter"` — random per-vertex (the default; matches the skull)
   - `"bottom"`  — build from the ground up
   - `"outward"` — fan out from the bbox center
   - `"front"`   — build from front to back
5. Click **Run Script**.
6. The output appears at `public/<asset>.choreographed.glb`.

The script is idempotent — re-running overwrites cleanly.

## What the script writes into the glb

Two things land in the output, both consumed by the runtime:

1. **Per-vertex `revealTime` attribute** (float in `[0, 1]`).
   The runtime's discard shader compares this against the `surfaceReveal`
   uniform — vertices with `revealTime > surfaceReveal` are clipped.
   That is how the surface emerges progressively.

2. **Per-object animation tracks** as glTF custom properties:
   - `proxyOpacity`     — drives the wireframe-proxy fade
   - `surfaceReveal`    — ramps 0 → 1 across Stages 1–3
   - `tierAOpacity`     — neutral-lit matte fade-in
   - `tierBOpacity`     — roughness / metalness fade-in
   - `tierCOpacity`     — normal / AO fade-in
   - `tierDOpacity`     — baseColor fade-in
   - `tierEOpacity`     — KHR extension effects fade-in

The runtime `<TimelinePlayer>` component (to be added in the next commit
under `src/continuum/choreography/`) samples these every frame and
applies them as shader uniforms on the asset.

## Running on a new asset

```python
# Inside author-choreography.py, change CONFIG:
INPUT_GLB  = "//public/BMW.glb"
OUTPUT_GLB = "//public/BMW.choreographed.glb"
```

Then **Run Script**. Same five stages, same easing, same surface-reveal
aesthetic — only the mesh underneath changes.

## Why not Spline / After Effects / Figma

- **Spline** authors beautifully but exports to a proprietary
  `.splinecode` runtime — Continuum can't read its timeline directly.
- **After Effects + Lottie** is 2D-first. Useful for designing the
  *easing curves* in isolation, but not the 3D action itself.
- **Figma** is great for storyboarding the look of each stage. Use it
  as the moodboard, not the timeline.
- **Blender** wins because (a) it can author 3D animation, (b) it
  exports glTF natively, and (c) the authoring is a versioned Python
  script you and I can both read and edit.

## Iterating on the feel

To change the global timing, edit the `F_*` frame constants at the top.
To change the easing curves, change the per-fcurve interpolation inside
`assign_timeline`. To change the reveal aesthetic itself, swap
`REVEAL_PATTERN` or add a new pattern in `assign_reveal_time`.
