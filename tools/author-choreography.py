"""
Continuum · Canonical Choreography Authoring Script
====================================================

Run this script inside Blender 5.0 to produce a `*.choreographed.glb` file
that contains the canonical surface-reveal animation as glTF data. The
Continuum runtime reads the embedded animation tracks and the per-vertex
`revealTime` attribute to drive the same studio-grade reveal on every
asset that flows through the pipeline.

Why this script exists
----------------------
Asset reveals look "random" today because each page invented its own
timing. This script makes the reveal one deterministic artifact: an
animated glTF that any Continuum page can replay verbatim. Change the
script → re-run → every page picks up the new feel.

Reveal aesthetic (chosen for visual consistency with the skull-style
surface emergence the team approved over the watch-style volume build):

  Stage 0 · PROXY            0.0 – 0.4s   wireframe silhouette only
  Stage 1 · SURFACE SPARSE   0.4 – 1.5s   ~10 % of surface triangles visible,
                                         scattered organically across the form
  Stage 2 · SURFACE DENSE    1.5 – 2.5s   ~50 % coverage, the form reads clearly
  Stage 3 · SURFACE COMPLETE 2.5 – 3.5s   100 % coverage, still no textures —
                                         the asset is a matte volume
  Stage 4 · TIERED MATERIALS 3.5 – 4.2s   tier A → B → C → D → E crossfade in
                                         (form → surface response → micro-detail →
                                         color → effects)

The per-vertex `revealTime` attribute is computed once with a seeded RNG
so the same script always produces the same scatter pattern. Triangles
emerge ON the surface, not as primitives built in volume — driven by the
runtime's discard shader (see src/continuum/choreography/player.tsx, to
be added in the next commit).

How to run
----------
1. Open Blender 5.0.
2. Save a fresh .blend file inside this repo's root folder (e.g. continuum.blend).
3. Open the Scripting workspace tab.
4. File ▸ Open Text Block, point at tools/author-choreography.py.
5. (Optional) Edit the CONFIG block below — INPUT_GLB / OUTPUT_GLB / SEED.
6. Click Run Script.
7. The output appears at public/<output_filename>.choreographed.glb.

The script is idempotent — running it again overwrites the previous output
without leaving dangling objects in the .blend file.
"""

# ─── CONFIG ──────────────────────────────────────────────────────────────

# Input asset — path relative to the .blend file location. Defaults
# assume the .blend is at the repo root.
INPUT_GLB  = "//public/mclaren-p1.glb"
OUTPUT_GLB = "//public/mclaren-p1.choreographed.glb"

# Deterministic random seed for the scatter pattern. Change to taste —
# different seeds produce different organic emergence orders. 42 looks
# evenly distributed on the McLaren.
SEED = 42

# Choice of reveal pattern. Options:
#   "scatter"  — random per-vertex order (skull-style organic emergence)
#   "bottom"   — Y-axis ascending  (build from the ground up)
#   "outward"  — distance from bbox center (fan out from the middle)
#   "front"    — Z-axis ascending  (build from front to back)
REVEAL_PATTERN = "scatter"

# Frame rate the runtime samples at. 40 fps gives sub-frame granularity
# for the 4.2 s reveal without blowing up the file size.
FPS = 40

# Stage boundaries in frames. Tweak these to retime the reveal globally.
# The runtime player respects the absolute timing in the animation tracks.
F_PROXY_IN    = 0     # 0.000 s
F_PROXY_HOLD  = 16    # 0.400 s — proxy fully visible, surface still hidden
F_SPARSE      = 60    # 1.500 s — 10 % surface coverage
F_DENSE       = 100   # 2.500 s — 50 % surface coverage
F_COMPLETE    = 140   # 3.500 s — 100 % surface coverage, materials still hidden
F_TIER_A      = 144   # 3.600 s — tier A (matte form) fade-in begins
F_TIER_B      = 150   # 3.750 s — tier B (roughness / metalness)
F_TIER_C      = 156   # 3.900 s — tier C (normal / AO)
F_TIER_D      = 162   # 4.050 s — tier D (baseColor)
F_TIER_E      = 168   # 4.200 s — tier E (KHR effects: clearcoat, sheen, …)
F_END         = 176   # 4.400 s — small tail so the runtime can settle

# ─── IMPLEMENTATION ──────────────────────────────────────────────────────
# Everything below is deterministic engineering — you should not need to
# read it to use the script. It documents the surface-reveal authoring
# strategy for future maintenance.

import bpy
import bmesh
import mathutils
import random
import os
from pathlib import Path


def _log(msg: str) -> None:
    """Print to Blender's system console so users see progress."""
    print(f"[continuum-choreo] {msg}")


def _resolve_path(blender_path: str) -> str:
    """Resolve a // prefixed Blender path to an absolute filesystem path."""
    return bpy.path.abspath(blender_path)


def clear_scene() -> None:
    """Wipe the scene so re-runs don't accumulate objects."""
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False, confirm=False)
    # Purge orphans so meshes/materials from the prior run don't linger.
    bpy.ops.outliner.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)


def import_glb(path: str) -> list:
    """Import the source glb and return the list of imported MESH objects."""
    abs_path = _resolve_path(path)
    if not os.path.exists(abs_path):
        raise FileNotFoundError(
            f"Input glb not found at {abs_path}. "
            f"Did you save the .blend at the repo root and adjust INPUT_GLB?"
        )
    bpy.ops.import_scene.gltf(filepath=abs_path)
    return [o for o in bpy.context.scene.objects if o.type == 'MESH']


def assign_reveal_time(mesh_obj, seed: int, pattern: str) -> None:
    """
    Compute a per-vertex `revealTime` attribute in [0, 1].

    The runtime shader uses this to decide whether each fragment is
    visible at the current `surfaceReveal` uniform value. Vertices with
    a low revealTime appear first; vertices with revealTime ≈ 1 appear
    last. The pattern argument decides how the ordering is chosen.
    """
    mesh = mesh_obj.data
    n = len(mesh.vertices)
    if n == 0:
        _log(f"  skipping {mesh_obj.name} — no vertices")
        return

    # Make sure we have a clean attribute slot.
    if "revealTime" in mesh.attributes:
        mesh.attributes.remove(mesh.attributes["revealTime"])
    mesh.attributes.new(name="revealTime", type='FLOAT', domain='POINT')
    attr = mesh.attributes["revealTime"]

    # Compute the ordering.
    if pattern == "scatter":
        rng = random.Random(seed + hash(mesh_obj.name) % 10000)
        order = list(range(n))
        rng.shuffle(order)
        reveal = [0.0] * n
        for rank, vert_idx in enumerate(order):
            reveal[vert_idx] = rank / max(n - 1, 1)
    elif pattern == "bottom":
        # Y ascending → bottom of bbox emerges first.
        ys = [v.co.y for v in mesh.vertices]
        y_min, y_max = min(ys), max(ys)
        span = max(y_max - y_min, 1e-6)
        reveal = [(y - y_min) / span for y in ys]
    elif pattern == "outward":
        # Distance from bbox center → middle emerges first.
        coords = [v.co for v in mesh.vertices]
        center = sum((c for c in coords), mathutils.Vector()) / n
        dists = [(c - center).length for c in coords]
        d_max = max(dists) or 1.0
        reveal = [d / d_max for d in dists]
    elif pattern == "front":
        zs = [v.co.z for v in mesh.vertices]
        z_min, z_max = min(zs), max(zs)
        span = max(z_max - z_min, 1e-6)
        reveal = [(z - z_min) / span for z in zs]
    else:
        raise ValueError(f"Unknown REVEAL_PATTERN: {pattern}")

    for i, v in enumerate(reveal):
        attr.data[i].value = v

    _log(f"  {mesh_obj.name}: revealTime assigned to {n} vertices (pattern={pattern})")


def _add_keyframe(obj, prop_name: str, frame: int, value: float, easing: str = 'EASE_IN_OUT') -> None:
    """Insert a single keyframe on a custom property."""
    obj[prop_name] = value
    obj.keyframe_insert(data_path=f'["{prop_name}"]', frame=frame)


def assign_timeline(mesh_obj) -> None:
    """
    Attach the canonical animation tracks to the mesh object as custom
    properties. The runtime's TimelinePlayer samples these by name on
    every frame to drive the reveal.
    """
    # Initialize properties — gives Blender something to keyframe against.
    for prop in (
        "proxyOpacity", "surfaceReveal",
        "tierAOpacity", "tierBOpacity", "tierCOpacity",
        "tierDOpacity", "tierEOpacity",
    ):
        mesh_obj[prop] = 0.0

    # ── proxyOpacity: fade in fast, hold, fade out as surface takes over.
    _add_keyframe(mesh_obj, "proxyOpacity", 0,            0.0)
    _add_keyframe(mesh_obj, "proxyOpacity", 4,            1.0)
    _add_keyframe(mesh_obj, "proxyOpacity", F_PROXY_HOLD, 1.0)
    _add_keyframe(mesh_obj, "proxyOpacity", F_SPARSE,     0.0)

    # ── surfaceReveal: 0 → 1 ramp covering the three surface stages.
    _add_keyframe(mesh_obj, "surfaceReveal", 0,             0.0)
    _add_keyframe(mesh_obj, "surfaceReveal", F_PROXY_HOLD,  0.0)
    _add_keyframe(mesh_obj, "surfaceReveal", F_SPARSE,      0.10)
    _add_keyframe(mesh_obj, "surfaceReveal", F_DENSE,       0.50)
    _add_keyframe(mesh_obj, "surfaceReveal", F_COMPLETE,    1.00)
    _add_keyframe(mesh_obj, "surfaceReveal", F_END,         1.00)

    # ── tier A–E: each crossfades in over ~6 frames, in order.
    # Tiers stay at their target opacity afterwards.
    for prop, start in (
        ("tierAOpacity", F_TIER_A),
        ("tierBOpacity", F_TIER_B),
        ("tierCOpacity", F_TIER_C),
        ("tierDOpacity", F_TIER_D),
        ("tierEOpacity", F_TIER_E),
    ):
        _add_keyframe(mesh_obj, prop, 0,           0.0)
        _add_keyframe(mesh_obj, prop, start,       0.0)
        _add_keyframe(mesh_obj, prop, start + 6,   1.0)
        _add_keyframe(mesh_obj, prop, F_END,       1.0)

    # Apply easing consistently across every fcurve we just created.
    if mesh_obj.animation_data and mesh_obj.animation_data.action:
        for fcurve in mesh_obj.animation_data.action.fcurves:
            for kp in fcurve.keyframe_points:
                kp.interpolation = 'BEZIER'
                kp.easing = 'EASE_IN_OUT'

    _log(f"  {mesh_obj.name}: timeline tracks attached (7 properties)")


def export_choreographed(path: str) -> None:
    """Export the modified scene back to glb with animations + attributes."""
    abs_path = _resolve_path(path)
    Path(abs_path).parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=abs_path,
        export_format='GLB',
        export_animations=True,
        export_animation_mode='ACTIVE_ACTIONS',
        export_attributes=True,      # write the revealTime vertex attribute
        export_extras=True,          # write the per-object custom properties
        export_yup=True,
        export_apply=False,          # keep modifiers intact for the runtime
    )
    _log(f"wrote {abs_path}")


def main() -> None:
    _log("=== Continuum canonical choreography authoring ===")
    _log(f"input  : {INPUT_GLB}")
    _log(f"output : {OUTPUT_GLB}")
    _log(f"seed   : {SEED}")
    _log(f"pattern: {REVEAL_PATTERN}")

    # Set the scene timeline to match the runtime expectation.
    scene = bpy.context.scene
    scene.render.fps = FPS
    scene.frame_start = 0
    scene.frame_end = F_END

    clear_scene()
    meshes = import_glb(INPUT_GLB)
    _log(f"imported {len(meshes)} mesh object(s)")

    for mesh_obj in meshes:
        # Make the mesh active so attribute / animation ops target it.
        bpy.context.view_layer.objects.active = mesh_obj
        assign_reveal_time(mesh_obj, seed=SEED, pattern=REVEAL_PATTERN)
        assign_timeline(mesh_obj)

    export_choreographed(OUTPUT_GLB)
    _log("done.")


if __name__ == "__main__":
    main()
