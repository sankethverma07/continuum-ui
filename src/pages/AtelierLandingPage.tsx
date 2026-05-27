/**
 * AtelierLandingPage — second demo proving the 4-LOD engine works on a
 * fully procedural asset (no Spline, no .glb files).
 *
 * Layout:
 *   <Hero />           // <BlueprintSkeleton /> phase → <TorusKnotAsset /> via R3F
 *   <ProcessSection /> // 4 steps explaining the streaming model
 *   <PrinciplesRow />  // 3 col principles row
 *   <Footer />
 *
 * Hero composition demonstrates the full skeleton-blueprint → final-render
 * progression of the Continuum engine in a single page-load:
 *   1. <BlueprintSkeleton /> SVG paints under 16ms (LOD-0 placeholder).
 *   2. After ~1.2s Doherty hold, the R3F <Canvas /> fades in over the SVG.
 *   3. Inside the canvas, <TorusKnotAsset /> ramps from LOD 0 → 1 → 2 → 3
 *      over a button-driven sequence (manual control to make the swap
 *      visible — four tiers total).
 *
 * All section CSS is inline at the bottom — page is self-contained.
 */

import { useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { TorusKnotAsset } from '@continuum/components/TorusKnotAsset';
import { useContinuumStore, selectAsset } from '@continuum/store/useContinuumStore';
import type { LODTier } from '@continuum/store/types';

const KNOT_ID = 'atelier-hero-knot';

export const AtelierLandingPage = () => (
  <div className="atelier">
    <Hero />
    <ProcessSection />
    <PrinciplesRow />
    <Footer />
    <PageStyles />
  </div>
);

// ---------------------------------------------------------------------------
// Hero — Blueprint → Canvas progression with manual LOD scrubber
// ---------------------------------------------------------------------------

const Hero = () => {
  // Canvas now mounts immediately — no dark blueprint overlay. We just fade
  // in from transparent so the mesh appears on the page like any product
  // photo. The LOD climb 0 → 1 → 2 → 3 still plays so the demo's streaming
  // story is visible via the scrubber, HUD, and store.
  const [ready, setReady] = useState(false);
  const [tier, setTier] = useState<LODTier>(0);

  useEffect(() => {
    const rid = window.requestAnimationFrame(() => setReady(true));
    const t1 = window.setTimeout(() => setTier(1), 500);
    const t2 = window.setTimeout(() => setTier(2), 1200);
    const t3 = window.setTimeout(() => setTier(3), 2100);
    return () => {
      window.cancelAnimationFrame(rid);
      [t1, t2, t3].forEach((id) => window.clearTimeout(id));
    };
  }, []);

  const reg = useContinuumStore(selectAsset(KNOT_ID));

  return (
    <section className="atelier-hero">
      <div className="u-container atelier-hero__inner">
        <header className="atelier-hero__copy">
          <div className="u-eyebrow">Atelier · Continuum Demo 02</div>
          <h1 className="atelier-hero__title">
            Procedural,<br />
            <span className="atelier-hero__title-em">streamed in tiers.</span>
          </h1>
          <p className="atelier-hero__lede">
            No <code>.glb</code>. No <code>.splinecode</code>. The mesh on the right
            is generated from three.js primitives at runtime — and still flows
            through the same Continuum hydration pipeline as a fetched asset.
          </p>

          <div className="atelier-hero__scrubber">
            <div className="u-label">Manual LOD scrubber</div>
            <div className="atelier-scrubber">
              {([0, 1, 2, 3] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`atelier-scrubber__step ${tier === t ? 'is-active' : ''}`}
                  onClick={() => setTier(t)}
                  aria-pressed={tier === t}
                >
                  <span className="atelier-scrubber__num">LOD&nbsp;{t}</span>
                  <span className="atelier-scrubber__name">
                    {t === 0 ? 'Blueprint'
                      : t === 1 ? 'Fine'
                        : t === 2 ? 'Mid'
                          : 'AAA'}
                  </span>
                </button>
              ))}
            </div>
            <dl className="atelier-meta">
              <div>
                <dt>canvas</dt>
                <dd>{ready ? 'LIVE' : 'MOUNTING'}</dd>
              </div>
              <div>
                <dt>store.status</dt>
                <dd>{reg?.status ?? '—'}</dd>
              </div>
              <div>
                <dt>store.currentLOD</dt>
                <dd>{reg ? `LOD ${reg.currentLOD}` : '—'}</dd>
              </div>
            </dl>
          </div>
        </header>

        <figure className="atelier-hero__viewer">
          <div className="atelier-hero__viewer-inner">
            {/* No blueprint overlay — canvas mounts immediately, fades in
                from transparent. Same product-page feel as the Sneaker
                page: the asset just appears, then climbs LOD internally. */}
            <div
              className="atelier-hero__canvas"
              style={{
                opacity: ready ? 1 : 0,
                transition: 'opacity 360ms ease-out',
              }}
            >
              <Canvas
                camera={{ position: [0, 0.4, 4.6], fov: 42 }}
                dpr={[1, 2]}
                gl={{ antialias: true, alpha: true }}
              >
                <ambientLight intensity={0.32} />
                <directionalLight position={[3, 4, 3]} intensity={0.95} color="#FFD49B" />
                <pointLight position={[-3, -2, 2]} intensity={0.45} color="#FF8C00" />
                <TorusKnotAsset id={KNOT_ID} forceLOD={tier} />
              </Canvas>
            </div>

            {/* Persistent corner brackets — hidden by stylesheet. */}
            <ViewerCorner pos="tl" />
            <ViewerCorner pos="tr" />
            <ViewerCorner pos="bl" />
            <ViewerCorner pos="br" />

            <span className="atelier-hud u-label">
              {`R3F LIVE · LOD ${tier}${tier === 3 ? ' · AAA' : ''}`}
            </span>
          </div>
          <figcaption className="atelier-hero__cap u-label">
            <span>Procedural torus-knot · zero network bytes</span>
            <span>Continuum engine</span>
          </figcaption>
        </figure>
      </div>
    </section>
  );
};

// ---------------------------------------------------------------------------
// Process — 4-step explanation of the streaming model
// ---------------------------------------------------------------------------

const STEPS = [
  {
    n: '01',
    title: 'Blueprint paints',
    body: 'Inline SVG renders in the first frame. The user sees the engineering frame of what is arriving — never an empty rectangle.',
  },
  {
    n: '02',
    title: 'Canvas takes over',
    body: 'After Doherty\'s 400ms threshold, the R3F canvas mounts and the skeleton fades. Same bounding box, same silhouette.',
  },
  {
    n: '03',
    title: 'LOD 0 → 1 → 2 → 3',
    body: 'Geometry detail climbs across four tiers. Crossfade between variants converges in ~250ms — no perceptual pop, no alpha-sort artifacts.',
  },
  {
    n: '04',
    title: 'Hero is live',
    body: 'Physical material, clearcoat, particle halo, and emissive pulse. The full asset is on screen in under two perceived seconds.',
  },
] as const;

const ProcessSection = () => (
  <section className="atelier-process">
    <div className="u-container">
      <header className="atelier-section__head">
        <div className="u-eyebrow">Process</div>
        <h2 className="atelier-section__title">
          Four moments. One uninterrupted arrival.
        </h2>
      </header>
      <ol className="atelier-process__list">
        {STEPS.map((s) => (
          <li key={s.n} className="atelier-process__item">
            <span className="atelier-process__num">{s.n}</span>
            <h3 className="atelier-process__title">{s.title}</h3>
            <p className="atelier-process__body">{s.body}</p>
          </li>
        ))}
      </ol>
    </div>
  </section>
);

// ---------------------------------------------------------------------------
// Principles row
// ---------------------------------------------------------------------------

const PRINCIPLES = [
  { k: 'Doherty 400ms',  v: 'Below the productivity-collapse threshold' },
  { k: 'Nielsen 1s flow', v: 'The skeleton is legible, not a flash' },
  { k: 'Harrison curve',  v: 'p = t^n with n>1 — strong-finish progress' },
] as const;

const PrinciplesRow = () => (
  <section className="atelier-principles">
    <div className="u-container">
      <div className="u-eyebrow">Anchored in research</div>
      <dl className="atelier-principles__row">
        {PRINCIPLES.map((p) => (
          <div key={p.k}>
            <dt>{p.k}</dt>
            <dd>{p.v}</dd>
          </div>
        ))}
      </dl>
    </div>
  </section>
);

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

const ViewerCorner = ({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }) => (
  <span className={`atelier-viewer__corner atelier-viewer__corner--${pos}`} aria-hidden />
);

const Footer = () => (
  <footer className="atelier-footer">
    <div className="u-container atelier-footer__inner">
      <span className="u-label">Atelier · Continuum UI v2.0</span>
      <span className="u-label">Procedural demo · zero network bytes</span>
    </div>
  </footer>
);

// ---------------------------------------------------------------------------
// PAGE STYLES
// ---------------------------------------------------------------------------
const PageStyles = () => (
  <style>{`
    /* ---- Atelier palette — derived from the torus-knot pretzel (#F2B07A).
            The whole page carries a DARK PASTEL of that hue; foreground text
            is warmed to cream so contrast stays AA against the new backdrop. */
    .atelier {
      --c-bg:           #1C1309;                /* dark-pastel pretzel base  */
      --c-bg-deep:      #0F0905;                /* vignette well / footer    */
      --c-fg:           #F4E6D1;                /* warm cream body           */
      --c-fg-muted:     #B5A180;                /* muted cream, passes AA    */
      --c-accent:       #F2B07A;                /* pretzel apricot accent    */
      --c-accent-dim:   rgba(242, 176, 122, 0.14);
      --c-hairline:     rgba(242, 176, 122, 0.22);
      --c-hairline-2:   rgba(242, 176, 122, 0.10);

      --c-asset:        #C99A6F;                /* warm pretzel mid-tone     */
      --c-asset-soft:   #E8D3BA;                /* pastel tan for backdrops  */
      --c-asset-deep:   #5A3920;                /* deep crust for vignette   */
      --c-asset-glow:   rgba(232, 211, 186, 0.16);

      background:
        radial-gradient(ellipse at 80% -10%, rgba(242, 176, 122, 0.10) 0%, transparent 55%),
        radial-gradient(ellipse at 10% 110%, rgba(201, 154, 111, 0.08) 0%, transparent 60%),
        var(--c-bg);
      color: var(--c-fg);
      min-height: 100vh;
    }
    .atelier-hero {
      background:
        radial-gradient(ellipse at 70% 40%, var(--c-asset-glow) 0%, transparent 65%);
    }

    /* ---------- hero ---------- */
    .atelier-hero { padding: clamp(40px, 7vh, 96px) 0 var(--section-y); }
    .atelier-hero__inner {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: clamp(28px, 5vw, 80px);
      align-items: center;
    }
    @media (max-width: 960px) {
      .atelier-hero__inner { grid-template-columns: 1fr; }
    }
    .atelier-hero__copy { display: flex; flex-direction: column; gap: 24px; }
    .atelier-hero__title {
      font-size: clamp(48px, 7vw, 104px);
      line-height: 1.02;
      letter-spacing: -0.035em;
      font-weight: 500;
    }
    .atelier-hero__title-em { color: var(--c-accent); }
    .atelier-hero__lede {
      font-size: clamp(15px, 1.3vw, 18px);
      max-width: 42ch;
      color: var(--c-fg);
      opacity: 0.85;
    }
    .atelier-hero__lede code {
      font-family: var(--font-mono); font-size: 0.85em;
      padding: 1px 6px; border: 1px solid var(--c-hairline);
      color: var(--c-accent); background: rgba(242, 176, 122, 0.06);
      border-radius: 2px;
    }
    .atelier-hero__scrubber {
      margin-top: 8px;
      padding: 18px;
      border: 1px solid var(--c-hairline);
      background: rgba(15, 9, 5, 0.55);
      display: flex; flex-direction: column; gap: 14px;
    }

    /* ---------- LOD scrubber ---------- */
    .atelier-scrubber { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
    @media (max-width: 640px) {
      .atelier-scrubber { grid-template-columns: repeat(2, 1fr); }
    }
    .atelier-scrubber__step {
      appearance: none; background: transparent;
      border: 1px solid var(--c-hairline);
      color: var(--c-fg-muted);
      padding: 12px 10px;
      display: flex; flex-direction: column; gap: 4px; align-items: flex-start;
      cursor: pointer;
      font-family: var(--font-mono);
      transition: background 160ms ease, border-color 160ms ease, color 160ms ease;
    }
    .atelier-scrubber__step:hover {
      color: var(--c-fg);
      border-color: rgba(242, 176, 122, 0.48);
    }
    .atelier-scrubber__num { font-size: 10px; letter-spacing: 1.8px; color: var(--c-accent); }
    .atelier-scrubber__name {
      font-family: var(--font-sans); font-size: 13px;
      letter-spacing: 0.4px; text-transform: uppercase; color: inherit;
    }
    .atelier-scrubber__step.is-active {
      background: rgba(242, 176, 122, 0.12);
      border-color: rgba(242, 176, 122, 0.8);
      color: var(--c-fg);
      box-shadow: inset 0 -2px 0 var(--c-accent);
    }
    .atelier-meta {
      display: grid; grid-template-columns: repeat(3, 1fr);
      gap: 12px; margin: 0;
    }
    .atelier-meta dt {
      font-family: var(--font-mono); font-size: 9px;
      letter-spacing: 1.6px; text-transform: uppercase; color: var(--c-fg-muted);
    }
    .atelier-meta dd {
      margin: 4px 0 0;
      font-family: var(--font-mono); font-size: 12px;
      color: var(--c-fg);
    }

    /* ---------- viewer ----------
       NO frame. The 3D mesh now floats on the page background — same
       treatment as Gallery and Sneaker. The page-level radial glow on
       .atelier-hero supplies the soft warm vignette behind the asset. */
    .atelier-hero__viewer { position: relative; margin: 0; }
    .atelier-hero__viewer-inner {
      position: relative;
      aspect-ratio: 1 / 1;
      width: 100%;
      background: transparent;
      border: 0;
      overflow: visible;
    }
    .atelier-hero__canvas {
      position: absolute; inset: 0; z-index: 1;
    }
    .atelier-hero__canvas canvas {
      display: block; width: 100% !important; height: 100% !important;
      background: transparent;
    }
    .atelier-hero__cap {
      display: flex; justify-content: space-between; gap: 24px;
      padding: 12px 2px 0;
    }
    /* HUD label — light floating chip, no frame. */
    .atelier-hud {
      position: absolute;
      top: 6px; right: 6px;
      padding: 3px 10px;
      background: transparent;
      color: var(--c-fg-muted);
      font-size: 9px;
      z-index: 5;
    }
    /* Corner brackets retired. The spans stay in JSX for component-API stability. */
    .atelier-viewer__corner { display: none; }

    /* ---------- process ---------- */
    .atelier-section__head {
      display: flex; flex-direction: column; gap: 14px;
      margin-bottom: 56px; max-width: 720px;
    }
    .atelier-section__title {
      font-size: clamp(28px, 3.4vw, 44px);
      line-height: 1.1; letter-spacing: -0.02em; font-weight: 500;
    }
    .atelier-process { padding: var(--section-y) 0; border-top: 1px solid var(--c-hairline); }
    .atelier-process__list {
      list-style: none; padding: 0; margin: 0;
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 1px;
      background: var(--c-hairline);
      border: 1px solid var(--c-hairline);
    }
    @media (max-width: 880px) {
      .atelier-process__list { grid-template-columns: 1fr; }
    }
    .atelier-process__item {
      background: var(--c-bg);
      padding: 28px;
      display: flex; flex-direction: column; gap: 10px;
    }
    .atelier-process__num {
      font-family: var(--font-mono); font-size: 11px;
      letter-spacing: 2px; color: var(--c-accent);
    }
    .atelier-process__title {
      font-size: 18px; line-height: 1.2; letter-spacing: -0.01em;
      font-weight: 500;
    }
    .atelier-process__body {
      font-size: 13.5px; color: var(--c-fg-muted); max-width: 32ch;
    }

    /* ---------- principles ---------- */
    .atelier-principles { padding: var(--section-y) 0; border-top: 1px solid var(--c-hairline); }
    .atelier-principles__row {
      display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0; margin-top: 24px;
    }
    @media (max-width: 760px) {
      .atelier-principles__row { grid-template-columns: 1fr; }
    }
    .atelier-principles__row > div {
      padding: 22px 0; border-top: 1px solid var(--c-hairline);
      display: grid; grid-template-columns: 1fr 1.4fr;
      align-items: baseline;
    }
    .atelier-principles__row > div:nth-child(1),
    .atelier-principles__row > div:nth-child(2),
    .atelier-principles__row > div:nth-child(3) { border-top: 0; }
    .atelier-principles__row dt {
      font-family: var(--font-mono); font-size: 11px;
      letter-spacing: 1.6px; text-transform: uppercase; color: var(--c-accent);
      padding-right: 16px;
    }
    .atelier-principles__row dd {
      margin: 0; font-size: 14px; color: var(--c-fg);
    }

    /* ---------- footer ---------- */
    .atelier-footer { padding: 28px 0; border-top: 1px solid var(--c-hairline); }
    .atelier-footer__inner {
      display: flex; justify-content: space-between; gap: 16px;
    }
  `}</style>
);
