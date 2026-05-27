/**
 * SneakerMockupPage — finale demo. Dresses the Continuum hydration
 * pipeline as a real e-commerce product page: a sneaker hovering over
 * its shadow, LOD climbing in the background while the surrounding
 * product chrome (breadcrumb, size picker, colour swatches, add-to-cart)
 * reads like a real Nike / Air product page.
 *
 *   <Nav />           top shopping bar
 *   <ProductHero />   hovering sneaker + title + price + buy rail
 *   <DetailRow />     three small product callouts
 *   <Footer />
 *
 * The whole hydration timeline is the same as Gallery: blueprint paint
 * → canvas mount → LOD 0 → 1 → 2 → 3. The difference is the framing —
 * everyone has seen a sneaker product page, so when the shoe goes from
 * wireframe block-in to a fully-lit hero with a swoosh and emissive
 * heel badge, the "asset is streaming in" beat lands harder.
 */

import { useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { SneakerAsset } from '@continuum/components/SneakerAsset';
import type { LODTier } from '@continuum/store/types';

// ---------------------------------------------------------------------------
// Colour/size palette — fake product SKUs for the demo.
// ---------------------------------------------------------------------------

interface Colorway {
  readonly id: string;
  readonly name: string;
  readonly swatch: string;    // chip colour
  readonly upperColor: string;
  readonly accentColor: string;
}

const COLORWAYS: readonly Colorway[] = [
  { id: 'sail',   name: 'Sail / Amber',     swatch: '#F4EEE1', upperColor: '#F4EEE1', accentColor: '#F2B07A' },
  { id: 'ember',  name: 'Ember / Sail',     swatch: '#D86A3F', upperColor: '#E08B5A', accentColor: '#F8E3B4' },
  { id: 'forest', name: 'Forest / Cream',   swatch: '#4A5C1F', upperColor: '#6A7A37', accentColor: '#F4EEE1' },
  { id: 'storm',  name: 'Storm / Orchid',   swatch: '#2A2F44', upperColor: '#3B4362', accentColor: '#B89DFF' },
] as const;

const SIZES = ['6', '6.5', '7', '7.5', '8', '8.5', '9', '9.5', '10', '10.5', '11', '12'] as const;

// ---------------------------------------------------------------------------
// Page root
// ---------------------------------------------------------------------------

export const SneakerMockupPage = () => (
  <div className="sneaker">
    <Nav />
    <ProductHero />
    <DetailRow />
    <Footer />
    <PageStyles />
  </div>
);

// ---------------------------------------------------------------------------
// Top nav — minimal shopping chrome
// ---------------------------------------------------------------------------

const Nav = () => (
  <header className="sneaker-nav">
    <div className="u-container sneaker-nav__inner">
      <span className="sneaker-nav__brand">AERO</span>
      <nav className="sneaker-nav__links">
        <a href="#/sneaker">Men</a>
        <a href="#/sneaker">Women</a>
        <a href="#/sneaker">Kids</a>
        <a href="#/sneaker">Sale</a>
        <a href="#/sneaker">Stories</a>
      </nav>
      <div className="sneaker-nav__right">
        <span className="u-label">Free shipping · returns 60d</span>
        <span className="sneaker-nav__bag">Bag · 0</span>
      </div>
    </div>
  </header>
);

// ---------------------------------------------------------------------------
// Hero — hovering sneaker + product buy rail
// ---------------------------------------------------------------------------

const ProductHero = () => {
  // No blueprint overlay on this page — on a real product page the image
  // just shows up. We still drive LOD 0 → 3 so the hydration story is
  // there in the HUD/Inspector, but the black engineering frame is gone.
  // `ready` flips when the canvas has mounted so we can fade it in from 0.
  const [ready, setReady] = useState(false);
  const [tier, setTier] = useState<LODTier>(0);
  const [colorIdx, setColorIdx] = useState(0);
  const [size, setSize] = useState<string | null>(null);

  useEffect(() => {
    // Canvas mounts immediately; paint a single rAF later so the fade-in
    // isn't stuck at 0 opacity on the first frame.
    const rid = window.requestAnimationFrame(() => setReady(true));
    const t1 = window.setTimeout(() => setTier(1), 250);
    const t2 = window.setTimeout(() => setTier(2), 750);
    const t3 = window.setTimeout(() => setTier(3), 1400);
    return () => {
      window.cancelAnimationFrame(rid);
      [t1, t2, t3].forEach((id) => window.clearTimeout(id));
    };
  }, []);

  const color = COLORWAYS[colorIdx] ?? COLORWAYS[0]!;
  const hudLabel =
    tier === 0 ? 'LOD 0 · BLUEPRINT'
    : tier === 1 ? 'LOD 1 · FINE'
    : tier === 2 ? 'LOD 2 · MID'
    : 'LOD 3 · AAA';

  return (
    <section className="sneaker-hero">
      <div className="u-container sneaker-hero__inner">
        {/* LEFT — hovering asset stage. No blueprint overlay, no frame —
            the canvas is transparent so the shoe just appears on the page,
            same as a Nike / Aero product photo would. */}
        <div className="sneaker-hero__stage">
          <div
            className="sneaker-hero__canvas"
            style={{
              opacity: ready ? 1 : 0,
              transition: 'opacity 360ms ease-out',
            }}
          >
            <Canvas
              camera={{ position: [2.3, 0.9, 3.2], fov: 38 }}
              dpr={[1, 2]}
              gl={{ antialias: true, alpha: true }}
            >
              <ambientLight intensity={0.38} />
              <directionalLight position={[3, 5, 2]} intensity={1.1} color="#FFEECE" />
              <directionalLight position={[-3, 2, -1]} intensity={0.45} color="#CFD9FF" />
              <pointLight position={[0, -1.2, 2.2]} intensity={0.45} color="#F2B07A" />
              <SneakerAsset
                id="sneaker-hero"
                forceLOD={tier}
                upperColor={color.upperColor}
                accentColor={color.accentColor}
                // Shift the asset left in world space so the silhouette
                // stays inside the stage column and doesn't visually bleed
                // into the buy-rail (price / swatches / sizes).
                position={[-0.55, 0, 0]}
              />
            </Canvas>
          </div>

          <span className="sneaker-hero__hud u-label">{hudLabel}</span>
          <StageCorners />

          {/* Running floor line — sells the hover by giving the shadow
              something to sit on. */}
          <div className="sneaker-hero__floor" aria-hidden />
        </div>

        {/* RIGHT — product buy rail */}
        <div className="sneaker-hero__rail">
          <div className="u-eyebrow">Aero Running · Member Drop</div>
          <h1 className="sneaker-hero__title">Aero Float 01</h1>
          <p className="sneaker-hero__sub">
            Men’s road-running shoe · plated foam midsole, mesh upper.
          </p>
          <div className="sneaker-hero__price">
            <span className="sneaker-hero__price-num">$184</span>
            <span className="sneaker-hero__price-note u-label">MRP incl. taxes</span>
          </div>

          {/* Colour row */}
          <div className="sneaker-hero__group">
            <span className="u-label">Colour · {color.name}</span>
            <div className="sneaker-hero__swatches">
              {COLORWAYS.map((c, i) => (
                <button
                  key={c.id}
                  type="button"
                  className={`sneaker-swatch ${i === colorIdx ? 'is-active' : ''}`}
                  style={{ background: c.swatch }}
                  aria-label={`Colour: ${c.name}`}
                  aria-pressed={i === colorIdx}
                  onClick={() => setColorIdx(i)}
                />
              ))}
            </div>
          </div>

          {/* Size row */}
          <div className="sneaker-hero__group">
            <div className="sneaker-hero__group-head">
              <span className="u-label">Select size · US</span>
              <a href="#/sneaker" className="sneaker-hero__size-guide u-label">Size guide →</a>
            </div>
            <div className="sneaker-hero__sizes">
              {SIZES.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`sneaker-size ${size === s ? 'is-active' : ''}`}
                  onClick={() => setSize(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* CTA row */}
          <div className="sneaker-hero__ctas">
            <button type="button" className="c-cta sneaker-hero__buy">
              Add to bag
            </button>
            <button type="button" className="c-cta c-cta--ghost sneaker-hero__fav">
              ♡ Favourite
            </button>
          </div>

          <ul className="sneaker-hero__bullets">
            <li><span className="sneaker-hero__bullet-dot" /> Plated PEBA foam, 4mm drop</li>
            <li><span className="sneaker-hero__bullet-dot" /> 190g (US 9) · race-weight</li>
            <li><span className="sneaker-hero__bullet-dot" /> Continuum-streamed hero · 4-tier LOD</li>
          </ul>

          <div className="sneaker-hero__meta u-label">
            Continuum inspector · this asset streamed live, LOD 0 → 3.
          </div>
        </div>
      </div>
    </section>
  );
};

const StageCorners = () => (
  <>
    <span className="sneaker-hero__corner sneaker-hero__corner--tl" aria-hidden />
    <span className="sneaker-hero__corner sneaker-hero__corner--tr" aria-hidden />
    <span className="sneaker-hero__corner sneaker-hero__corner--bl" aria-hidden />
    <span className="sneaker-hero__corner sneaker-hero__corner--br" aria-hidden />
  </>
);

// ---------------------------------------------------------------------------
// Detail row — three bento callouts with engineering copy
// ---------------------------------------------------------------------------

interface Detail {
  readonly title: string;
  readonly body: string;
  readonly eyebrow: string;
}

const DETAILS: readonly Detail[] = [
  {
    eyebrow: 'Midsole',
    title: 'Plated PEBA, reshaped.',
    body: 'A lighter re-engineered plate sits between two layers of supercritical PEBA foam. You feel the same rebound, 22g lighter than Float v0.',
  },
  {
    eyebrow: 'Upper',
    title: 'Engineered mesh, zone-mapped.',
    body: 'Toe-box open for splay, mid-foot locked. The tongue pad is pressure-mapped to the top 30% of the instep where hotspots live.',
  },
  {
    eyebrow: 'Outsole',
    title: 'Exposed foam, gum pods.',
    body: 'Full-length foam with gum-rubber pods at the heel strike and push-off zones. 400km test range with no noticeable lug rounding.',
  },
] as const;

const DetailRow = () => (
  <section className="sneaker-details">
    <div className="u-container">
      <header className="sneaker-details__head">
        <div className="u-eyebrow">Under the mesh</div>
        <h2 className="sneaker-details__title">Three things we rebuilt.</h2>
      </header>
      <div className="sneaker-details__grid">
        {DETAILS.map((d) => (
          <article key={d.title} className="sneaker-detail">
            <span className="u-eyebrow">{d.eyebrow}</span>
            <h3 className="sneaker-detail__title">{d.title}</h3>
            <p className="sneaker-detail__body">{d.body}</p>
          </article>
        ))}
      </div>
    </div>
  </section>
);

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

const Footer = () => (
  <footer className="sneaker-footer">
    <div className="u-container sneaker-footer__inner">
      <span className="u-label">Aero · powered by Continuum UI</span>
      <span className="u-label">4-tier LOD · KTX2 · Draco · procedural fallbacks</span>
    </div>
  </footer>
);

// ---------------------------------------------------------------------------
// Page styles
// ---------------------------------------------------------------------------

const PageStyles = () => (
  <style>{`
    .sneaker {
      /* Soft cream page — sneaker-commerce palette: off-white background,
         warm charcoal type, amber CTA. Overrides the global dark tokens
         only within this page. */
      --c-bg:         #F4EEE1;
      --c-bg-deep:    #E4DACE;
      --c-fg:         #1A1410;
      --c-fg-muted:   #5C5146;
      --c-accent:     #D86A3F;
      --c-accent-dim: rgba(216, 106, 63, 0.14);
      --c-hairline:   rgba(26, 20, 16, 0.14);
      --c-hairline-2: rgba(26, 20, 16, 0.06);

      background:
        radial-gradient(ellipse at 85% -10%, rgba(216, 106, 63, 0.10) 0%, transparent 55%),
        radial-gradient(ellipse at -10% 60%, rgba(180, 140, 80, 0.12) 0%, transparent 55%),
        var(--c-bg);
      color: var(--c-fg);
      min-height: 100vh;
    }

    /* ---------- nav ---------- */
    .sneaker-nav {
      border-bottom: 1px solid var(--c-hairline);
      background: rgba(244, 238, 225, 0.88);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      position: sticky; top: 36px; z-index: 30;
    }
    .sneaker-nav__inner {
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      gap: 24px;
      padding: 14px var(--page-gutter-x);
    }
    .sneaker-nav__brand {
      font-weight: 800;
      font-size: 22px;
      letter-spacing: -0.04em;
    }
    .sneaker-nav__links {
      display: flex; gap: 28px;
      justify-self: center;
      font-size: 14px;
    }
    .sneaker-nav__links a {
      color: var(--c-fg); opacity: 0.85;
      transition: opacity 160ms ease;
    }
    .sneaker-nav__links a:hover { opacity: 1; }
    .sneaker-nav__right {
      display: flex; align-items: center; gap: 16px;
    }
    .sneaker-nav__bag {
      padding: 8px 14px;
      border: 1px solid var(--c-hairline);
      border-radius: 999px;
      font-size: 13px;
    }

    /* ---------- hero ---------- */
    .sneaker-hero {
      padding: clamp(40px, 7vh, 90px) 0 clamp(48px, 8vh, 110px);
    }
    .sneaker-hero__inner {
      display: grid;
      grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
      gap: clamp(40px, 6vw, 80px);
      align-items: stretch;
    }
    @media (max-width: 960px) {
      .sneaker-hero__inner { grid-template-columns: 1fr; }
    }

    /* ---- stage ----
       No border, no corner brackets, no framed canvas — the shoe just
       floats on the page. That matches the reference product pages
       (Nike, AF1, Pegasus) and lets the hovering asset feel *placed
       into the layout*, not inside a display case. */
    .sneaker-hero__stage {
      position: relative;
      aspect-ratio: 5 / 4;
      border: 0;
      background: transparent;
      /* clip to column so the asset never bleeds into the buy-rail */
      overflow: hidden;
    }
    .sneaker-hero__canvas { position: absolute; inset: 0; z-index: 1; }
    .sneaker-hero__canvas canvas {
      display: block; width: 100% !important; height: 100% !important;
      background: transparent;
    }
    .sneaker-hero__floor { display: none; }
    .sneaker-hero__hud {
      position: absolute; top: 6px; right: 6px;
      padding: 3px 10px;
      background: transparent;
      color: var(--c-fg-muted);
      z-index: 5;
      font-size: 9px;
    }
    /* Corner brackets retired. The spans stay in the JSX for API stability. */
    .sneaker-hero__corner { display: none; }

    /* ---- buy rail ---- */
    .sneaker-hero__rail {
      display: flex; flex-direction: column;
      gap: 18px;
    }
    .sneaker-hero__title {
      font-size: clamp(36px, 4.4vw, 62px);
      line-height: 1.02;
      letter-spacing: -0.035em;
      font-weight: 700;
      margin-top: 6px;
    }
    .sneaker-hero__sub {
      font-size: 15px;
      color: var(--c-fg-muted);
      max-width: 42ch;
    }
    .sneaker-hero__price {
      display: flex; align-items: baseline; gap: 14px;
      border-top: 1px solid var(--c-hairline);
      border-bottom: 1px solid var(--c-hairline);
      padding: 16px 0;
    }
    .sneaker-hero__price-num {
      font-size: 26px;
      font-weight: 600;
      letter-spacing: -0.015em;
    }
    .sneaker-hero__group {
      display: flex; flex-direction: column; gap: 10px;
    }
    .sneaker-hero__group-head {
      display: flex; justify-content: space-between; align-items: baseline;
    }
    .sneaker-hero__swatches {
      display: flex; gap: 10px;
    }
    .sneaker-swatch {
      width: 36px; height: 36px;
      border-radius: 999px;
      border: 1px solid var(--c-hairline);
      cursor: pointer;
      transition: transform 140ms ease, box-shadow 140ms ease;
      padding: 0;
    }
    .sneaker-swatch:hover { transform: translateY(-1px); }
    .sneaker-swatch.is-active {
      box-shadow: 0 0 0 2px var(--c-bg), 0 0 0 3px var(--c-fg);
    }
    .sneaker-hero__sizes {
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: 6px;
    }
    .sneaker-size {
      padding: 10px 0;
      border: 1px solid var(--c-hairline);
      background: transparent;
      color: var(--c-fg);
      font-size: 13px;
      font-weight: 500;
      font-family: var(--font-sans);
      cursor: pointer;
      border-radius: 3px;
      transition: border-color 140ms ease, background 140ms ease;
    }
    .sneaker-size:hover { border-color: var(--c-fg); }
    .sneaker-size.is-active {
      border-color: var(--c-fg);
      background: var(--c-fg);
      color: var(--c-bg);
    }
    .sneaker-hero__ctas {
      display: flex; gap: 10px; margin-top: 4px;
      flex-wrap: wrap;
    }
    .sneaker-hero__buy { flex: 1 1 220px; justify-content: center; }
    .sneaker-hero__fav { flex: 0 0 auto; }
    .sneaker-hero__bullets {
      list-style: none; padding: 0; margin: 12px 0 0;
      display: flex; flex-direction: column; gap: 8px;
      font-size: 14px;
    }
    .sneaker-hero__bullets li {
      display: flex; align-items: center; gap: 10px;
      color: var(--c-fg-muted);
    }
    .sneaker-hero__bullet-dot {
      width: 5px; height: 5px; border-radius: 999px;
      background: var(--c-accent);
    }
    .sneaker-hero__meta { margin-top: 8px; color: var(--c-fg-muted); }
    .sneaker-hero__size-guide { color: var(--c-fg-muted); }

    /* ---------- details row ---------- */
    .sneaker-details {
      padding: clamp(60px, 9vh, 120px) 0;
      border-top: 1px solid var(--c-hairline);
    }
    .sneaker-details__head { margin-bottom: 36px; max-width: 640px; }
    .sneaker-details__title {
      font-size: clamp(28px, 3.2vw, 44px);
      line-height: 1.08;
      letter-spacing: -0.02em;
      font-weight: 600;
      margin-top: 12px;
    }
    .sneaker-details__grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 1px;
      background: var(--c-hairline);
      border: 1px solid var(--c-hairline);
    }
    @media (max-width: 860px) {
      .sneaker-details__grid { grid-template-columns: 1fr; }
    }
    .sneaker-detail {
      background: var(--c-bg);
      padding: 28px 26px;
      display: flex; flex-direction: column; gap: 12px;
    }
    .sneaker-detail__title {
      font-size: 19px; line-height: 1.2;
      letter-spacing: -0.01em;
      font-weight: 600;
    }
    .sneaker-detail__body {
      font-size: 14px; line-height: 1.55;
      color: var(--c-fg-muted);
    }

    /* ---------- footer ---------- */
    .sneaker-footer { padding: 26px 0; border-top: 1px solid var(--c-hairline); }
    .sneaker-footer__inner {
      display: flex; justify-content: space-between; gap: 16px;
    }
  `}</style>
);
