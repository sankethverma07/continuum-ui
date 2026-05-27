# Continuum LOD Preset — builder's guide

A drop-in React component that gives any 3D asset on your site a four-tier
streaming experience: coarse blueprint → fine blueprint → mid textures → AAA
hero — crossfaded in under 400 ms.

You supply the shape for each tier. The preset handles everything else:
crossfade timing, mount-gating, store registration, and memory cleanup.

---

## 1. What the preset does

When a visitor hits a page with a 3D asset, three things compete for attention:

1. The page should feel instantly responsive. No empty rectangles waiting for
   WebGL to warm up.
2. The final asset should look as good as the designer intended. No permanent
   low-poly fallback.
3. The transition between stages should feel continuous, not a pop-in.

The preset sequences these as *tiers of the same shape*. The silhouette is
stable from the first frame; only the surface detail progresses.

- **LOD 0 — Skeleton.** Coarse wireframe blueprint of the final shape, under
  16 ms to paint. The user sees the engineering frame of what's arriving.
- **LOD 1 — Fine Blueprint.** Denser wireframe of the exact same silhouette.
  Feels like the draftsman just sharpened the pencil.
- **LOD 2 — Mid Textures.** Same shape, flat color or low-res shading.
  The form has bulk; the full texture pack and lighting are still downloading.
- **LOD 3 — AAA Hero.** Same silhouette, full PBR textures, bump maps,
  clearcoat, emissive accents, shadows, highlights — the finish you'd ship
  in an Unreal cinematic.

Between tiers the preset crossfades opacity at `0.18` per frame, which
converges in about 250 ms at 60 fps — inside Doherty's 400 ms threshold so
the swap feels like *one thing becoming more detailed* rather than four
separate things swapping.

---

## 2. The component

Import path (inside this project):

```ts
import { ContinuumLODAsset } from '@continuum/components/ContinuumLODAsset';
```

Signature:

```ts
type LODSlot = (opacity: number) => ReactNode;

<ContinuumLODAsset
  id="unique-string"               // required — registers in the store
  skeleton={lod0Render}            // LOD 0 — coarse blueprint   (or null)
  fineBlueprint={lod1Render}       // LOD 1 — fine blueprint     (or null)
  mid={lod2Render}                 // LOD 2 — mid textures       (or null)
  hero={lod3Render}                // LOD 3 — AAA hero           (or null)
  forceLOD={3}                     // optional — pin a tier; omit for auto
  crossfadeRate={0.18}             // optional — 0.18 default
  unmountThreshold={0.01}          // optional — opacity floor for unmount
/>
```

Each LOD slot is a function that receives the current crossfade opacity (0→1)
and returns JSX. Wire that opacity into your material so it fades cleanly.
Pass `null` for any slot you don't want to implement — typical cases are
`hero={null}` (hero delegated to a Spline layer) or `fineBlueprint={null}`
(you want only coarse/mid/hero).

---

## 3. Minimal usage — three.js primitives

Drop the preset inside any `<Canvas>` from `@react-three/fiber`. The four
"fill-in-the-blank" slots are plain render functions:

```tsx
import { Canvas } from '@react-three/fiber';
import { ContinuumLODAsset } from '@continuum/components/ContinuumLODAsset';

const HeroSphere = () => (
  <Canvas camera={{ position: [0, 0, 4] }}>
    <ambientLight intensity={0.35} />
    <directionalLight position={[3, 4, 3]} intensity={0.9} />

    <ContinuumLODAsset
      id="landing-hero"

      /* LOD 0 — coarse wireframe sphere, the first blueprint */
      skeleton={(opacity) => (
        <mesh>
          <sphereGeometry args={[1.5, 12, 6]} />
          <meshBasicMaterial
            wireframe
            color="#F2D27A"
            transparent
            opacity={opacity}
          />
        </mesh>
      )}

      /* LOD 1 — finer wireframe of the same silhouette */
      fineBlueprint={(opacity) => (
        <mesh>
          <sphereGeometry args={[1.5, 48, 24]} />
          <meshBasicMaterial
            wireframe
            color="#F2D27A"
            transparent
            opacity={opacity}
          />
        </mesh>
      )}

      /* LOD 2 — same sphere, flat shaded, no texture pack yet */
      mid={(opacity) => (
        <mesh>
          <sphereGeometry args={[1.5, 48, 24]} />
          <meshStandardMaterial
            color="#E0C66D"
            roughness={0.6}
            transparent
            opacity={opacity}
          />
        </mesh>
      )}

      /* LOD 3 — AAA hero, full PBR stack + subtle emissive */
      hero={(opacity) => (
        <mesh>
          <sphereGeometry args={[1.5, 128, 96]} />
          <meshPhysicalMaterial
            map={myColorTexture}
            bumpMap={myBumpTexture}
            bumpScale={0.06}
            roughnessMap={myRoughnessTexture}
            roughness={0.45}
            metalness={0.2}
            clearcoat={0.7}
            clearcoatRoughness={0.25}
            emissive="#FFD14A"
            emissiveIntensity={0.06}
            transparent
            opacity={opacity}
          />
        </mesh>
      )}
    />
  </Canvas>
);
```

**Four rules for the slots:**

1. All four tiers must render the same silhouette. Coarse wireframe → fine
   wireframe → flat-shaded → textured versions of the same geometry reads
   as one object picking up detail. A pretzel → icosahedron → sphere reads
   as three unrelated meshes.
2. Wire the `opacity` argument into your material and set `transparent: true`.
   The preset drives crossfade through this value.
3. Build geometries and textures outside the slot (or `useMemo` them) so each
   render is cheap. The slot runs on every React render.
4. Save your heaviest effects (emissive, sheen, clearcoat, per-light halos)
   for LOD 3. If you can tease them in gently as LOD 3 fades up, the viewer
   perceives "the lights just came on" — exactly the signal we want.

---

## 4. Using a Spline design for the hero tier

Spline scenes render as a DOM layer, not inside an R3F `<Canvas>`. If your
hero tier is a Spline scene, skip LOD 3 inside the Canvas and composite the
Spline layer on top, driving its opacity from the Continuum store:

```tsx
import { Canvas } from '@react-three/fiber';
import Spline from '@splinetool/react-spline';
import { ContinuumLODAsset } from '@continuum/components/ContinuumLODAsset';
import { useContinuumStore, selectAsset } from '@continuum/store/useContinuumStore';

const HeroWithSpline = () => {
  // Observe the asset's live LOD so the Spline layer knows when to fade in.
  const reg = useContinuumStore(selectAsset('landing-hero'));
  const splineVisible = reg?.currentLOD === 3;

  return (
    <div style={{ position: 'relative', width: 600, height: 600 }}>
      {/* Tiers 0-2 live inside the R3F canvas */}
      <Canvas style={{ position: 'absolute', inset: 0 }}>
        <ambientLight intensity={0.3} />
        <directionalLight position={[3, 4, 3]} intensity={0.9} />
        <ContinuumLODAsset
          id="landing-hero"
          skeleton={(opacity) => (
            <mesh>
              <sphereGeometry args={[1.5, 12, 6]} />
              <meshBasicMaterial wireframe color="#F2D27A"
                transparent opacity={opacity} />
            </mesh>
          )}
          fineBlueprint={(opacity) => (
            <mesh>
              <sphereGeometry args={[1.5, 48, 24]} />
              <meshBasicMaterial wireframe color="#F2D27A"
                transparent opacity={opacity} />
            </mesh>
          )}
          mid={(opacity) => (
            <mesh>
              <sphereGeometry args={[1.5, 48, 24]} />
              <meshStandardMaterial color="#E0C66D" roughness={0.6}
                transparent opacity={opacity} />
            </mesh>
          )}
          hero={null}            {/* skip — Spline layer handles this */}
        />
      </Canvas>

      {/* Spline hero layer, absolute-positioned over the canvas */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: splineVisible ? 1 : 0,
          transition: 'opacity 360ms ease-out',
          pointerEvents: splineVisible ? 'auto' : 'none',
        }}
      >
        <Spline scene="https://prod.spline.design/YOUR-ID/scene.splinecode" />
      </div>
    </div>
  );
};
```

The `id` string is the bridge. Both layers register as the same asset in the
Continuum store, so `currentLOD === 3` is the single source of truth for
"the AAA hero is live."

For a fully built version of this pattern — including timed LOD 0 → 1 → 2
ghost progression driven by a timeline while Spline bytes download — see
`SplineEmbed.tsx`. It uses the preset itself as its ghost mesh, so the
in-canvas blueprint and the Spline scene share the same silhouette.

---

## 5. Patterns for website builders

### 5a. Below-the-fold assets

If an asset is below the fold, you probably don't want to burn a WebGL
context until it scrolls close. Wrap the `<Canvas>` in an intersection
observer and only mount when the viewport approaches:

```tsx
const { ref, inView } = useInView({ rootMargin: '400px' });

return (
  <div ref={ref}>
    {inView && (
      <Canvas>
        <ContinuumLODAsset id="feature-block" ... />
      </Canvas>
    )}
  </div>
);
```

The preset's registration is bound to component mount, so the store stays
clean if the asset never appears.

### 5b. Pinning a tier for a demo / style guide

Pass `forceLOD={0}`, `1`, `2`, or `3` to show a single tier without
auto-progression. Useful for design reviews, storybook stories, and
scrubber-driven demos:

```tsx
const [tier, setTier] = useState<LODTier>(3);

<Canvas>
  <ContinuumLODAsset id="demo" forceLOD={tier} ... />
</Canvas>

<button onClick={() => setTier(0)}>Blueprint</button>
<button onClick={() => setTier(1)}>Fine</button>
<button onClick={() => setTier(2)}>Mid</button>
<button onClick={() => setTier(3)}>AAA</button>
```

### 5c. Progressive auto-advance (the pattern used on the Atelier page)

If you want the page to auto-advance through tiers on load — coarse blueprint
for ~1 s, fine blueprint for ~1 s, mid for ~1 s, then AAA hero — set
timeouts that drive `forceLOD`:

```tsx
const [tier, setTier] = useState<LODTier>(0);

useEffect(() => {
  const t1 = setTimeout(() => setTier(1), 1100);
  const t2 = setTimeout(() => setTier(2), 2500);
  const t3 = setTimeout(() => setTier(3), 4100);
  return () => { [t1, t2, t3].forEach(clearTimeout); };
}, []);
```

### 5d. Multiple assets on one page

Each `<ContinuumLODAsset />` registers itself with a unique `id`. A four-tile
gallery works by mounting four preset instances with distinct ids, each with
its own progression:

```tsx
<Canvas><ContinuumLODAsset id="tile-1" ... /></Canvas>
<Canvas><ContinuumLODAsset id="tile-2" ... /></Canvas>
<Canvas><ContinuumLODAsset id="tile-3" ... /></Canvas>
<Canvas><ContinuumLODAsset id="tile-4" ... /></Canvas>
```

The store tracks them independently, so an overlay that reads
`selectAsset('tile-2')` only reflects tile 2's progress.

### 5e. Page theming that matches the hero

The Continuum demo pages use a simple rule: the page's pastel accents are
a pale version of the hero asset's signature hex. A yellow-fur lattice gets
`#FCEBB8` soft + `#F9D760` mid + `#6B4A0C` deep; a tan pretzel knot gets
`#F7D7B4` soft + `#F2B07A` mid + `#6B3C18` deep. Scope the tokens to the
page root so each page can carry its own palette without leaking globally:

```css
.atelier {
  --c-asset-soft: #E8D3BA;
  --c-asset:      #C99A6F;
  --c-asset-deep: #5A3920;
}
.relay {
  --c-fur-soft:   #FCEBB8;
  --c-fur:        #F9D760;
  --c-fur-deep:   #6B4A0C;
}
```

Then the viewport panel, the active chip state, and the HUD borders all
reference `--c-asset`/`--c-fur` — the whole page reads as a garnish of the
asset.

---

## 6. How to generate texture packs with zero network bytes

If you don't have pre-authored PBR texture maps, the Continuum project ships
two examples of generating them procedurally via 2D canvas at mount time
(see `LatticeAsset.tsx` for a yellow-fur pack and `TorusKnotAsset.tsx` for
a salted pretzel pack). The pattern:

```ts
const buildTexturePack = () => {
  const SIZE = 512;

  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = colorCanvas.height = SIZE;
  const ctx = colorCanvas.getContext('2d')!;
  // Paint a base gradient, then add speckles / flecks / fiber strokes.
  // …
  const colorMap = new THREE.CanvasTexture(colorCanvas);
  colorMap.wrapS = colorMap.wrapT = THREE.RepeatWrapping;
  colorMap.repeat.set(4, 1);
  colorMap.colorSpace = THREE.SRGBColorSpace;

  // Repeat for bumpMap and roughnessMap with their own canvases.
  // …

  return { colorMap, bumpMap, roughnessMap };
};

// Then inside the hero slot:
const textures = useMemo(buildTexturePack, []);
hero={(opacity) => (
  <mesh>
    <sphereGeometry args={[1.5, 128, 96]} />
    <meshPhysicalMaterial
      map={textures.colorMap}
      bumpMap={textures.bumpMap}
      roughnessMap={textures.roughnessMap}
      sheen={0.85}
      sheenColor="#FFE9A8"
      transparent opacity={opacity}
    />
  </mesh>
)}
```

Zero images fetched, zero bytes over the wire, texture fidelity comparable
to small PBR packs. The trade-off is CPU time at mount (a few ms) and
reduced artistic control vs. a hand-painted pack.

### 6a. Lighting-loads-at-end effect

One of the strongest signals of a finished render is that the lights come
on last. In the Lattice asset, a dedicated `<pointLight>` is attached to
the hero tier with intensity scaled by the same `opacity` the preset passes
in — `intensity={1.4 * opacity}`. As LOD 3 crossfades up, the halo and
emissive accents ramp into view together. Reserve this trick for LOD 3
only; firing it earlier blows the reveal.

---

## 7. Checklist before shipping

Before pushing a page that uses the preset to production:

- [ ] Every `<ContinuumLODAsset />` has a unique `id`.
- [ ] All four LOD slots render the same silhouette — coarse wireframe,
      fine wireframe, flat-shaded, and textured versions of the same
      geometry, not four different shapes.
- [ ] Each slot wires the `opacity` argument into its material AND sets
      `transparent={true}`.
- [ ] Geometries and textures are memoized (useMemo) or imported at module
      scope — not allocated inside the slot on every render.
- [ ] The `<Canvas>` has lights. `<meshPhysicalMaterial>` with no light = a
      black sphere no matter how good your textures are.
- [ ] Any emissive / sheen / glow / per-light halos only fire on LOD 3.
- [ ] If using `forceLOD`, there's a reason — auto progression is usually
      what you want once the agentic hydration hook is plugged in.
- [ ] Page accents (chips, borders, HUDs) are pastel derivatives of the
      hero's signature hex, scoped to the page root.
