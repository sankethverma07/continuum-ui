# Continuum

> **A progressive rendering engine for web 3D.** Paints a recognizable shape
> in the first 100 ms, then resolves to full PBR while you watch. Built on
> React Three Fiber.

```tsx
import { AutoProgressiveHero } from '@continuum/components/AutoProgressiveHero';

<AutoProgressiveHero src="/my-hero.glb" autoRotate={0.4} />
```

One component, any glb, no spinner.

**Live demo:** [continuum-ui.vercel.app](https://continuum-ui.vercel.app)
**Source:** [github.com/sankethverma07/continuum-ui](https://github.com/sankethverma07/continuum-ui)

---

## Why this exists

Beautiful web 3D is heavy. A detailed glb is tens of megabytes; while it
downloads, the visitor stares at a spinner. Attention degrades sharply past
~400 ms of unresponsive delay ([Doherty threshold][doherty]), and the most
expensive asset on the page becomes its worst experience.

Continuum stops hiding the load and starts performing it. Instead of
nothing-then-everything, it shows the asset's silhouette in under 100 ms and
resolves the rest in front of you. Same wall-clock time. Opposite emotional
response.

The technique is borrowed from how the Hogwarts Legacy / Avalanche-Pottermore
web team loaded an entire castle in a browser: ship a position-only "shape
proxy" alongside the real file, paint it instantly, stream the heavy version
behind it. Continuum adapts that idea down from open-world streaming to
single hero assets — and packages it as a one-line React Three Fiber
component.

[doherty]: https://en.wikipedia.org/wiki/Doherty_threshold

---

## Quick start

```bash
git clone https://github.com/sankethverma07/continuum-ui
cd continuum-ui
npm install
npm run dev      # → http://localhost:5173
```

Drop any `.glb` into `public/`. The Vite plugin will auto-generate a
position-only `.proxy.bin` next to it on first run. Then:

```tsx
import { AutoProgressiveHero } from '@continuum/components/AutoProgressiveHero';

export const Hero = () => (
  <div style={{ position: 'relative', width: '100%', height: '100vh' }}>
    <AutoProgressiveHero
      src="/my-hero.glb"
      proxy={true}                 // opt into the sub-100ms first paint
      autoRotate={0.4}
      backgroundHex="#0A0E16"
    />
  </div>
);
```

That's the whole integration. The wrapper provides the Canvas, the camera,
the lighting rig, OrbitControls, contact shadows, the four-phase reveal
sequencer, and the engine router. You provide the glb and the layout.

---

## How it works

Every asset moves through four overlapping phases:

1. **Hologram boot** (~50 ms) — a faint shape lifts out of the bounding
   volume so the user sees something is happening.
2. **Wireframe build** (~1.5 s) — the position-only proxy paints first,
   then triangles densify tier-by-tier via `setDrawRange` on the real mesh.
3. **Material crossfade** (~0.9 s) — PBR materials fade in over the
   wireframe, per-mesh, in lockstep with the geometry build.
4. **Final** — full photoreal surface, with environment reflections,
   contact shadows, optional auto-rotate.

The reveal is *additive* throughout. None of the four phases is a loading
screen — each is already the object, just less finished than the last.

For the full architecture (engine routing, the texture-binding gotcha that
shaped the clone strategy, the per-asset bbox normalization story), see
[`CONTINUUM_UI_HANDOFF.md`](./CONTINUUM_UI_HANDOFF.md).

---

## API

### `<AutoProgressiveHero>`

The main public component. Accepts either a URL string (`src`) for the
one-line path or a full `CatalogEntry` for advanced use (ingest-pipeline
metadata, custom tier ratios, multi-LOD).

| Prop              | Type                  | Default | Purpose                                                  |
|-------------------|-----------------------|---------|----------------------------------------------------------|
| `src`             | `string`              | —       | URL of the glb. Sufficient on its own.                   |
| `proxy`           | `boolean \| string`   | `false` | Opt-in proxy paint. `true` auto-discovers `<src>.proxy.bin`. |
| `entry`           | `CatalogEntry`        | —       | Full catalog row. Use when ingest pipeline runs upstream. |
| `autoRotate`      | `number`              | `0.35`  | Camera orbit speed. `0` disables.                        |
| `backgroundHex`   | `string`              | —       | Page bg. Used to auto-pick a WCAG-compliant blueprint color. |
| `blueprintColor`  | `string`              | —       | Explicit override for the wireframe color.               |
| `runToken`        | `number`              | `0`     | Bump to replay the reveal cold.                          |
| `onHydrated`      | `() => void`          | —       | Fires when the PBR is fully visible.                     |

### `<ColorCloud>`

Optional Luma-style splat overlay — surface-samples N points across the
loaded scene, colors them from the diffuse maps, renders as soft Gaussian
blobs. See `/cloud` in the demo for an integrated example.

---

## Demo surfaces

The dev server ships nine routes. Live tour from least → most polished:

| Route        | What it shows                                              |
|--------------|------------------------------------------------------------|
| `/latency`   | Naive vs Continuum cold-load, side by side. The baseline proof. |
| `/proxy`     | Position-only first paint. The core technique, isolated.   |
| `/compare`   | Attention-aware refinement (focus region sharpens first).  |
| `/scenes`    | Full McLaren reveal — wireframe → PBR. The finale.         |
| `/cloud`     | The ColorCloud overlay, on the skull asset.                |
| `/benchmark` | Cold-cache load timings. Reproducible numbers per machine. |
| `/watch`     | Procedural dress watch with subdivision wireframe build.   |
| `/auto`      | Drop any glb, see the reveal.                              |
| `/phone`     | Galaxy Z Fold product page with uniform-LOD hydration.     |

---

## Benchmark

Visit `/#/benchmark`, hard-refresh (Ctrl+Shift+R), click **Run**. The page
loads each public asset twice (naive + proxy-first), records first-paint
and PBR-ready times, and outputs a JSON blob you can paste anywhere.

For honest numbers: throttle DevTools to "Fast 4G" and run 2–3 times then
take the median. The script logs results to console as JSON. **Your
numbers will be specific to your machine and network** — that's the point,
and that's why "measured on M2 MacBook Pro, Fast-4G, median of 3" is the
right way to cite them.

---

## Repo layout

```
continuum UI/
├── src/
│   ├── continuum/
│   │   ├── components/   Engine (AutoProgressiveHero, WireframeProxy, ColorCloud, …)
│   │   ├── catalog/      CatalogEntry types
│   │   ├── hooks/        useHydration, useAssetPriority
│   │   ├── store/        Zustand store
│   │   └── utils/        Loader config, shader warm-up, hologram boot
│   ├── pages/            One file per demo route
│   └── router/           Hash router + DemoSwitcher tab bar
├── ingest/               Node-side build pipeline (proxy/LOD generators)
├── tools/                Vite plugin for proxy auto-generation
├── public/               Static assets (.glb, .proxy.bin, fonts)
├── start-dev.bat         Hardened dev launcher (auto-restart)
├── vercel.json           Deploy config (asset cache headers)
├── CLAUDE.md             Engine-internal rules
├── CONTINUUM_LOG.md      Cross-session decision log
└── CONTINUUM_UI_HANDOFF.md  Architecture handoff doc
```

---

## What it's good at — and what it isn't

**Good for:** single hero asset on a product / portfolio / marketing page,
where the load is part of the brand experience. 1–4 simultaneous heroes in a
gallery (with `useHydration` enforcing a VRAM budget).

**Not good for:** city-scale geo (use [Cesium 3D Tiles]), photogrammetry
environments (use [Luma]), real-time scene editing, or running on low-end
mobile with limited GPU memory.

Read the trade-offs section in
[`CONTINUUM_UI_HANDOFF.md`](./CONTINUUM_UI_HANDOFF.md) for the honest list
of known limitations.

[Cesium 3D Tiles]: https://cesium.com/
[Luma]: https://lumalabs.ai/

---

## Building for production

```bash
npm run build         # tsc --noEmit && vite build → dist/
npm run preview       # serve dist/ locally to sanity-check
```

The Vite plugin runs proxy generation at `buildStart`, so production builds
ship complete proxy/glb pairs.

### Deploying to Vercel

```bash
npm install -g vercel
vercel              # walk through the prompts; pick "Vite" as the framework
vercel --prod       # promote the preview to your production URL
```

`vercel.json` is already configured with immutable cache headers for `.glb`
and `.proxy.bin` files, so repeat visits are warm-cache.

---

## License

MIT — see [LICENSE](./LICENSE).

---

## Acknowledgements

- The Hogwarts Legacy / Avalanche-Pottermore web team for the position-only
  proxy idea ([engineering writeup](https://playcanvas.com/case-studies/hogwarts-legacy)).
- The [pmndrs](https://github.com/pmndrs) crew for React Three Fiber + drei.
- [Luma Labs](https://lumalabs.ai/) for the splat-style reveal pattern that
  inspired `<ColorCloud>`.
