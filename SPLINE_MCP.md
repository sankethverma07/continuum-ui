# Spline MCP — what's actually buildable

## The honest situation

Spline does not publish a public authoring API — no REST, no GraphQL, no
documented automation surface. The cloud editor is a closed web GUI; the
desktop app has no IPC or plugin interface. The `.splinecode` runtime format
is an opaque proprietary binary with no public spec, so parsing or writing it
programmatically is off the table. An MCP that creates or edits Spline scenes
on Claude's behalf would require Spline's cooperation, and that cooperation
does not exist as of this writing.

The result: any "Spline authoring MCP" you find described online is either
aspirational fiction or a fragile computer-use scraper clicking pixels in the
web editor — which breaks on every Spline deploy. Neither is a credible build
target for this project.

## What we shipped instead

The server at `tools/spline-mcp/` is a local catalog-and-embed helper. It
persists a JSON registry of scene URLs — the `*.splinecode` links anyone can
extract from Spline's "Code Export → React" panel — and lets Claude look them
up by name without anyone copy-pasting raw URLs into prompts. No Spline API
required; it just manages strings that already live in your Spline dashboard.

Three tools cover the useful surface: `spline.list` returns the full catalog;
`spline.add` validates and appends a new entry (the regex guards against
pasting a Cloudflare worker URL or a draft link that will 404 in production);
`spline.embed` looks up a named scene and returns a ready-to-paste
`<SplineEmbed />` JSX block with the correct `id`, `sceneUrl`, and
`skeletonLabel` props wired up. That last one is the practical payoff — it
eliminates the class of bugs where the wrong URL lands in the wrong component,
and it keeps the embed API consistent project-wide.

## If Spline ever opens an API

If Spline ships a documented authoring API the upgrade path is clear: add
`spline.scenes.create` (spin up a blank scene, get back a URL),
`spline.objects.list` (enumerate mesh nodes by name), `spline.material.set`
(write color/roughness/metalness values to a named object), and
`spline.export.glb` (trigger a headless export and download the file). Those
four methods would cover the LOD 0 pipeline end-to-end. The catalog server
stays in place; the new methods just write back to the source rather than
reading a URL we already have.

## Alternatives today

For real LOD 0 work — geometry that must match a Blender hero model's bounding
box to the 1% tolerance `assertSkeletonMirror()` enforces — procedural Three.js
is the correct tool. `LatticeAsset` is the working example in this project: it
generates skeleton geometry in code, requires no Spline seat, and exports a
deterministic GLB. For design-tool authoring (colors, typography, component
layout) the Figma MCP is already connected and covers that surface properly.
