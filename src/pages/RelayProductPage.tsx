/**
 * RelayProductPage — fictional premium product page that showcases the
 * end-to-end R3F bottle as the hero, framed in the Continuum visual
 * language. No Spline runtime — every LOD tier is authored in React so
 * it can be inspected, styled, and hot-reloaded.
 *
 * Architecture:
 *   <Nav />
 *   <Hero />               // <StreamingBottleHero /> + copy + CTAs
 *   <BentoFeatures />      // 5-cell bento grid
 *   <SpecRail />           // horizontal spec callouts
 *   <Manifesto />          // large display type section
 *   <Footer />
 *
 * All section CSS is inlined in a single <style> tag at the bottom so this
 * page is self-contained — easy to lift into a different project later.
 */

import { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { StreamingBottleHero } from '@continuum/components/StreamingBottleHero';
import { LatticeAsset } from '@continuum/components/LatticeAsset';
import { useContinuumStore, selectAsset } from '@continuum/store/useContinuumStore';
import type { LODTier } from '@continuum/store/types';

export const RelayProductPage = () => (
  <div className="relay">
    <Nav />
    <Hero />
    <BentoFeatures />
    <LatticePlayground />
    <SpecRail />
    <Manifesto />
    <Footer />
    <PageStyles />
  </div>
);

// =============================================================================
// NAV
// =============================================================================
const Nav = () => (
  <header className="relay-nav">
    <div className="u-container relay-nav__inner">
      <a href="#" className="relay-nav__brand">
        <BrandMark />
        <span className="relay-nav__brandtext">RELAY</span>
      </a>
      <nav className="relay-nav__links">
        <a href="#system">system</a>
        <a href="#specs">specs</a>
        <a href="#manifesto">manifesto</a>
        <a href="#pricing">pricing</a>
      </nav>
      <a href="#preorder" className="c-cta c-cta--ghost">Pre-order</a>
    </div>
  </header>
);

const BrandMark = () => (
  <svg
    width="22" height="22" viewBox="0 0 22 22" aria-hidden
    style={{ color: 'var(--c-accent)' }}
  >
    <circle cx="11" cy="11" r="9.5" fill="none" stroke="currentColor" strokeWidth="1" />
    <circle cx="11" cy="11" r="3"   fill="currentColor" />
    <path d="M 11 1.5 L 11 6" stroke="currentColor" strokeWidth="1" />
    <path d="M 11 16 L 11 20.5" stroke="currentColor" strokeWidth="1" />
  </svg>
);

// =============================================================================
// HERO
// =============================================================================
const Hero = () => (
  <section className="relay-hero">
    <div className="u-container relay-hero__grid">
      {/* Left column: copy */}
      <div className="relay-hero__copy">
        <div className="u-eyebrow">Continuum OS · Series 01</div>
        <h1 className="relay-hero__title">
          Relay&nbsp;01
        </h1>
        <p className="relay-hero__lede">
          A quiet intelligence, always in range. Built around a streaming
          renderer that loads the frame before the form — so nothing ever
          arrives empty.
        </p>
        <div className="relay-hero__ctas">
          <a href="#preorder" className="c-cta">
            Pre-order — $389 <Arrow />
          </a>
          <a href="#specs" className="c-cta c-cta--ghost">View specifications</a>
        </div>

        <dl className="relay-hero__meta">
          <div><dt>shipping</dt><dd>Q3 2026</dd></div>
          <div><dt>edition</dt><dd>01 / 12 month</dd></div>
          <div><dt>warranty</dt><dd>five years</dd></div>
        </dl>
      </div>

      {/* Right column: 3D viewport — olive green panel with cursive overlay */}
      <figure className="relay-hero__viewer">
        <div className="relay-hero__viewer-inner">
          {/* Script text sits BEHIND the 3D object (zIndex 0) so the Spline
              mesh reads on top, exactly like the Framer reference. */}
          <div className="relay-hero__script" aria-hidden>
            <span className="relay-hero__script-line">Rejuvenate</span>
            <span className="relay-hero__script-line relay-hero__script-line--em">and</span>
            <span className="relay-hero__script-line">Refresh</span>
          </div>
          <div className="relay-hero__spline">
            <StreamingBottleHero
              id="relay-hero"
              skeletonLabel="HYDRATING RELAY 01"
              style={{ background: 'transparent' }}
            />
          </div>
          {/* persistent framing brackets */}
          <ViewerCorner pos="tl" />
          <ViewerCorner pos="tr" />
          <ViewerCorner pos="bl" />
          <ViewerCorner pos="br" />
        </div>
        <figcaption className="relay-hero__viewer-cap">
          <span className="u-label">Live render · Continuum streaming engine</span>
          <span className="u-label">drag to rotate</span>
        </figcaption>
      </figure>
    </div>
  </section>
);

const Arrow = () => (
  <svg width="14" height="10" viewBox="0 0 14 10" aria-hidden>
    <path d="M 0 5 L 12 5 M 8 1 L 12 5 L 8 9" stroke="currentColor" strokeWidth="1.5" fill="none" />
  </svg>
);

const ViewerCorner = ({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }) => (
  <span className={`relay-viewer__corner relay-viewer__corner--${pos}`} aria-hidden />
);

// =============================================================================
// BENTO FEATURES
// =============================================================================
const FEATURES = [
  {
    n: '01',
    title: 'Skeleton-first rendering',
    body:
      'Every surface paints a frame before the form. You never look at an empty rectangle — only at the proxy of what is arriving.',
    span: 'wide',
  },
  {
    n: '02',
    title: 'Hysteresis-aware swaps',
    body: 'Camera dwell at boundaries no longer thrashes between tiers. Two-step downgrade, single-step upgrade.',
  },
  {
    n: '03',
    title: 'Dither crossfade',
    body: 'A 0.3s Bayer fade between LODs. No alpha-sort artifacts; no perceptual pop.',
  },
  {
    n: '04',
    title: 'Skeleton Mirror',
    body: 'LOD 0 and LOD 2 share an identical bounding box. The proxy is the right shape, every time.',
    span: 'tall',
  },
  {
    n: '05',
    title: 'Agentic hydration',
    body:
      'Bandwidth, VRAM, and a remote n8n policy combine into a per-asset LOD ceiling. Quiet on slow networks; lavish on fast ones.',
    span: 'wide',
  },
] as const;

const BentoFeatures = () => (
  <section className="relay-bento" id="system">
    <div className="u-container">
      <header className="relay-section__head">
        <div className="u-eyebrow">System</div>
        <h2 className="relay-section__title">Five things the engine guarantees</h2>
      </header>
      <div className="relay-bento__grid">
        {FEATURES.map((f) => {
          const span = 'span' in f ? f.span : undefined;
          return (
          <article
            key={f.n}
            className={`relay-card ${span === 'wide' ? 'is-wide' : ''} ${span === 'tall' ? 'is-tall' : ''}`}
          >
            <span className="relay-card__num">{f.n}</span>
            <h3 className="relay-card__title">{f.title}</h3>
            <p className="relay-card__body">{f.body}</p>
            <span className="relay-card__corner" aria-hidden />
          </article>
          );
        })}
      </div>
    </div>
  </section>
);

// =============================================================================
// LATTICE PLAYGROUND — procedural LOD demo (real Three.js geometry)
// =============================================================================
//
// This is the honest demo of the Continuum engine. The Spline hero above is
// a pretty renderer; THIS section is where you can see LOD tiers swap with
// actual polygon counts, no black-box runtime. Geometry is generated from
// three.js primitives at mount time.

const LATTICE_ID = 'relay-lattice-demo';

/** Human-readable metadata per tier, for the live stats readout. */
const LOD_META: Record<LODTier, { name: string; faces: number; note: string }> = {
  0: { name: 'Blueprint',     faces: 12,   note: 'coarse ball + cubes · wireframe · LOD 0' },
  1: { name: 'Fine Blueprint', faces: 240, note: 'dense ball + cubes · wireframe · LOD 1' },
  2: { name: 'Mid Textures',  faces: 1280, note: 'flat yellow shading · no lights · LOD 2' },
  3: { name: 'AAA Hero',      faces: 12288, note: 'fur PBR + emissive cubes + pointlight halo · LOD 3' },
};

const LatticePlayground = () => {
  const [tier, setTier] = useState<LODTier>(3);

  // Live data from the store — the LatticeAsset writes here.
  const reg = useContinuumStore(selectAsset(LATTICE_ID));

  return (
    <section className="relay-playground" id="playground">
      <div className="u-container">
        <header className="relay-section__head">
          <div className="u-eyebrow">Playground</div>
          <h2 className="relay-section__title">
            Toggle the tiers. See the engine swap geometry in real time.
          </h2>
          <p className="relay-playground__lede">
            The object on the right is generated procedurally in your browser.
            No <code>.glb</code>, no Spline runtime — just three.js primitives
            wired through the Continuum store. Each button forces a different
            LOD and crossfades the meshes under Doherty's 400ms threshold.
          </p>
        </header>

        <div className="relay-playground__grid">
          {/* Left: controls + live stats */}
          <div className="relay-playground__controls">
            <div className="u-label">Active tier</div>
            <div className="relay-playground__buttons" role="tablist">
              {([0, 1, 2, 3] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tier === t}
                  className={`relay-chip ${tier === t ? 'is-active' : ''}`}
                  onClick={() => setTier(t)}
                >
                  <span className="relay-chip__num">LOD&nbsp;{t}</span>
                  <span className="relay-chip__name">{LOD_META[t].name}</span>
                </button>
              ))}
            </div>

            <dl className="relay-playground__stats">
              <div>
                <dt>tier</dt>
                <dd>{LOD_META[tier].name}</dd>
              </div>
              <div>
                <dt>faces</dt>
                <dd>{LOD_META[tier].faces.toLocaleString()}</dd>
              </div>
              <div>
                <dt>store.currentLOD</dt>
                <dd>{reg ? `LOD ${reg.currentLOD}` : '—'}</dd>
              </div>
              <div>
                <dt>store.status</dt>
                <dd>{reg?.status ?? '—'}</dd>
              </div>
              <div className="is-wide">
                <dt>composition</dt>
                <dd>{LOD_META[tier].note}</dd>
              </div>
            </dl>

            <p className="relay-playground__foot u-label">
              Crossfade rate · 250&nbsp;ms &nbsp;|&nbsp; Frame budget · 60&nbsp;fps &nbsp;|&nbsp; Dispose on unmount · yes
            </p>
          </div>

          {/* Right: the live Canvas */}
          <figure className="relay-playground__stage">
            <div className="relay-playground__canvas">
              <Canvas
                camera={{ position: [0, 0.6, 5.2], fov: 40 }}
                dpr={[1, 2]}
                gl={{ antialias: true, alpha: false }}
                style={{
                  background:
                    'radial-gradient(ellipse at 50% 35%, #1a1405 0%, #0a0803 55%, #000 100%)',
                }}
              >
                <ambientLight intensity={0.3} />
                <directionalLight position={[4, 5, 3]} intensity={0.9} color="#FFE6A8" />
                <pointLight position={[-3, -2, 2]} intensity={0.4} color="#F9D760" />
                <LatticeAsset id={LATTICE_ID} forceLOD={tier} />
              </Canvas>
              <ViewerCorner pos="tl" />
              <ViewerCorner pos="tr" />
              <ViewerCorner pos="bl" />
              <ViewerCorner pos="br" />
              <span className="relay-playground__hud u-label">
                LIVE&nbsp;·&nbsp;R3F CANVAS
              </span>
            </div>
            <figcaption className="relay-playground__cap u-label">
              <span>Signal Lattice · procedural asset</span>
              <span>Continuum UI v2.0</span>
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
};

// =============================================================================
// SPEC RAIL
// =============================================================================
const SPECS = [
  { k: 'render path',     v: 'four-tier LOD · KTX2 · Draco' },
  { k: 'frame budget',    v: '60 fps @ 1080p' },
  { k: 'vram ceiling',    v: '128 / 512 / 1024 MB' },
  { k: 'fade duration',   v: '0.3 s · power2.inOut' },
  { k: 'swap rate cap',   v: '2 / sec / asset' },
  { k: 'state runtime',   v: 'Zustand · selector-scoped' },
  { k: 'agent input',     v: 'navigator.connection · n8n' },
  { k: 'origin invariant', v: 'Skeleton Mirror · ±1%' },
];

const SpecRail = () => (
  <section className="relay-specs" id="specs">
    <div className="u-container">
      <header className="relay-section__head">
        <div className="u-eyebrow">Specifications</div>
        <h2 className="relay-section__title">Everything the engine commits to</h2>
      </header>
      <dl className="relay-specs__grid">
        {SPECS.map((s) => (
          <div key={s.k} className="relay-specs__row">
            <dt>{s.k}</dt>
            <dd>{s.v}</dd>
          </div>
        ))}
      </dl>
    </div>
  </section>
);

// =============================================================================
// MANIFESTO
// =============================================================================
const Manifesto = () => (
  <section className="relay-manifesto" id="manifesto">
    <div className="u-container">
      <div className="u-eyebrow">Manifesto</div>
      <p className="relay-manifesto__copy">
        Every object should begin as a frame.<br />
        Detail arrives in tiers — never as a stutter, never as an empty box.<br />
        <span className="relay-manifesto__accent">
          The skeleton is not a placeholder. It is a promise.
        </span>
      </p>
    </div>
  </section>
);

// =============================================================================
// FOOTER
// =============================================================================
const Footer = () => (
  <footer className="relay-footer">
    <div className="u-container relay-footer__inner">
      <div className="relay-footer__brand">
        <BrandMark />
        <span>Relay · A Continuum UI showcase</span>
      </div>
      <div className="relay-footer__links">
        <a href="#">privacy</a>
        <a href="#">support</a>
        <a href="#">press</a>
        <a href="#">github</a>
      </div>
      <div className="relay-footer__copy u-label">
        © 2026 — built with Continuum UI v2.0
      </div>
    </div>
  </footer>
);

// =============================================================================
// PAGE-LOCAL STYLES
// =============================================================================
const PageStyles = () => (
  <style>{`
    .relay {
      /* ---- Signature colors:
         The HERO on this page is the green Spline bottle (#4A5C1F olive).
         The entire site therefore sits on a dark-pastel olive derived from
         that hex, with cream-green body text and a warm butter-yellow accent
         for CTAs (kept warm so they pop against the green, and match the
         Lattice playground's fur-yellow ball further down the page).       */
      --c-fur:          #F9D760;
      --c-fur-soft:     #FCEBB8;
      --c-fur-mid:      #E8C349;
      --c-fur-deep:     #6B4A0C;
      --c-fur-glow:     rgba(249, 215, 96, 0.18);
      --c-fur-line:     rgba(249, 215, 96, 0.35);

      /* ---- Site-wide palette override (dark pastel olive) ---- */
      --c-bg:           #10160A;               /* dark pastel olive base    */
      --c-bg-deep:      #080C04;
      --c-fg:           #E8EFC8;               /* cream-green body, AAA on bg */
      --c-fg-muted:     #9FAE75;               /* muted sage, passes AA     */
      --c-accent:       #F9D760;               /* warm yellow for CTA glow  */
      --c-accent-dim:   rgba(249, 215, 96, 0.14);
      --c-hairline:     rgba(221, 231, 180, 0.18);
      --c-hairline-2:   rgba(221, 231, 180, 0.08);

      background:
        radial-gradient(ellipse at 85% -10%, rgba(123, 142, 62, 0.14) 0%, transparent 55%),
        radial-gradient(ellipse at 0% 110%, rgba(74, 92, 31, 0.20) 0%, transparent 60%),
        var(--c-bg);
      color: var(--c-fg); min-height: 100vh;
    }

    /* ---------- nav ---------- */
    .relay-nav {
      position: sticky; top: 0; z-index: 30;
      background: rgba(8, 12, 4, 0.80);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      border-bottom: 1px solid var(--c-hairline);
    }
    .relay-nav__inner {
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      gap: 32px;
      padding-top: 14px; padding-bottom: 14px;
    }
    .relay-nav__brand {
      display: inline-flex; align-items: center; gap: 10px;
      font-family: var(--font-mono); font-size: 12px;
      letter-spacing: 3px; color: var(--c-fg);
    }
    .relay-nav__brandtext { font-weight: 500; }
    .relay-nav__links {
      display: flex; gap: 28px; justify-self: center;
      font-family: var(--font-mono); font-size: 12px;
      color: var(--c-fg-muted); letter-spacing: 1px;
    }
    .relay-nav__links a:hover { color: var(--c-accent); }
    @media (max-width: 760px) { .relay-nav__links { display: none; } }

    /* ---------- hero ---------- */
    .relay-hero { padding-top: 96px; padding-bottom: var(--section-y); }
    .relay-hero__grid {
      display: grid;
      grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
      gap: clamp(24px, 5vw, 80px);
      align-items: center;
    }
    @media (max-width: 960px) {
      .relay-hero__grid { grid-template-columns: 1fr; }
    }
    .relay-hero__copy { display: flex; flex-direction: column; gap: 26px; }
    .relay-hero__title {
      font-size: clamp(56px, 9vw, 132px);
      line-height: var(--lead-tight);
      letter-spacing: -0.04em;
      font-weight: 500;
      margin-top: 16px;
    }
    .relay-hero__lede {
      font-size: clamp(16px, 1.4vw, 19px);
      max-width: 36ch;
      color: var(--c-fg);
      opacity: 0.85;
    }
    .relay-hero__ctas { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 6px; }
    .relay-hero__meta {
      display: grid;
      grid-template-columns: repeat(3, minmax(0,1fr));
      gap: 24px;
      margin-top: 20px;
      padding-top: 26px;
      border-top: 1px solid var(--c-hairline);
    }
    .relay-hero__meta dt {
      font-family: var(--font-mono); font-size: 10px; letter-spacing: 2px;
      text-transform: uppercase; color: var(--c-fg-muted);
    }
    .relay-hero__meta dd { margin: 4px 0 0; font-size: 14px; }

    /* ---------- viewer (olive-green panel per Framer mock) ---------- */
    .relay-hero__viewer { position: relative; }
    .relay-hero__viewer-inner {
      position: relative;
      aspect-ratio: 1 / 1;
      width: 100%;
      background:
        radial-gradient(ellipse at 35% 30%, #556f24 0%, var(--c-green) 55%, var(--c-green-deep) 100%);
      border: 1px solid var(--c-green-rim);
      overflow: hidden;
    }
    /* Cursive overlay — sits under the 3D mesh, reads like hand-lettering. */
    .relay-hero__script {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      gap: 0;
      pointer-events: none;
      z-index: 0;
      color: var(--c-green-fg);
      font-family: var(--font-script);
      font-weight: 400;
      line-height: 0.92;
      text-align: center;
      padding: 0 6%;
      opacity: 0.92;
      mix-blend-mode: screen;
      text-shadow: 0 2px 24px rgba(8, 12, 4, 0.45);
    }
    .relay-hero__script-line {
      display: block;
      font-size: clamp(48px, 9vw, 128px);
      letter-spacing: -0.01em;
    }
    .relay-hero__script-line--em {
      font-size: clamp(32px, 6vw, 82px);
      opacity: 0.85;
      margin: -0.12em 0;
    }
    /* The Spline canvas — transparent so the green + script show through. */
    .relay-hero__spline {
      position: absolute;
      inset: 0;
      z-index: 1;
      /* Let the green panel read through edges of the mesh */
      mix-blend-mode: normal;
    }
    .relay-hero__viewer-cap {
      display: flex; justify-content: space-between; gap: 24px;
      padding: 12px 2px 0;
    }
    /* Persistent corner brackets framing the viewer — cream-green to match panel */
    .relay-viewer__corner {
      position: absolute; width: 18px; height: 18px;
      border: 1px solid var(--c-green-fg);
      pointer-events: none;
      opacity: 0.75;
      z-index: 2;
    }
    .relay-viewer__corner--tl { top: 8px;    left: 8px;    border-right: 0; border-bottom: 0; }
    .relay-viewer__corner--tr { top: 8px;    right: 8px;   border-left:  0; border-bottom: 0; }
    .relay-viewer__corner--bl { bottom: 8px; left: 8px;    border-right: 0; border-top:    0; }
    .relay-viewer__corner--br { bottom: 8px; right: 8px;   border-left:  0; border-top:    0; }

    /* ---------- section heads ---------- */
    .relay-section__head {
      display: flex; flex-direction: column; gap: 14px;
      margin-bottom: 56px; max-width: 720px;
    }
    .relay-section__title {
      font-size: clamp(28px, 3.6vw, 48px);
      line-height: 1.08; letter-spacing: -0.02em; font-weight: 500;
    }

    /* ---------- bento ---------- */
    .relay-bento { padding: var(--section-y) 0; border-top: 1px solid var(--c-hairline); }
    .relay-bento__grid {
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      grid-auto-rows: minmax(220px, auto);
      gap: 1px;
      background: var(--c-hairline);
      border: 1px solid var(--c-hairline);
    }
    .relay-card {
      position: relative;
      background: var(--c-bg);
      padding: 32px;
      grid-column: span 2;
      display: flex; flex-direction: column; gap: 14px;
      transition: background 240ms ease;
    }
    .relay-card.is-wide { grid-column: span 4; }
    .relay-card.is-tall { grid-row: span 2; }
    @media (max-width: 880px) {
      .relay-bento__grid { grid-template-columns: 1fr; }
      .relay-card,
      .relay-card.is-wide,
      .relay-card.is-tall { grid-column: 1; grid-row: auto; }
    }
    .relay-card:hover { background: #0A0F05; }
    .relay-card__num {
      font-family: var(--font-mono); font-size: 11px; letter-spacing: 2px;
      color: var(--c-accent);
    }
    .relay-card__title {
      font-size: 22px; line-height: 1.18; letter-spacing: -0.01em;
      font-weight: 500;
    }
    .relay-card__body {
      font-size: 14px; color: var(--c-fg-muted); max-width: 44ch;
    }
    .relay-card__corner {
      position: absolute; right: 14px; bottom: 14px;
      width: 6px; height: 6px; background: var(--c-accent);
      box-shadow: 0 0 10px var(--c-accent);
      opacity: 0.6;
    }

    /* ---------- playground ---------- */
    .relay-playground { padding: var(--section-y) 0; border-top: 1px solid var(--c-hairline); }
    .relay-playground__lede {
      font-size: 15px; line-height: 1.55; color: var(--c-fg-muted);
      max-width: 58ch;
    }
    .relay-playground__lede code {
      font-family: var(--font-mono); font-size: 13px;
      padding: 1px 6px; border: 1px solid var(--c-hairline);
      color: var(--c-accent); background: rgba(249, 215, 96, 0.06);
      border-radius: 2px;
    }
    .relay-playground__grid {
      display: grid;
      grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
      gap: clamp(24px, 4vw, 56px);
      align-items: stretch;
    }
    @media (max-width: 960px) {
      .relay-playground__grid { grid-template-columns: 1fr; }
    }
    .relay-playground__controls {
      display: flex; flex-direction: column; gap: 22px;
      padding: 28px;
      border: 1px solid var(--c-fur-line);
      background:
        radial-gradient(ellipse at 0% 0%, var(--c-fur-glow) 0%, transparent 55%),
        #0a0803;
    }
    .relay-playground__buttons {
      display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;
    }
    @media (max-width: 600px) {
      .relay-playground__buttons { grid-template-columns: repeat(2, 1fr); }
    }
    .relay-chip {
      appearance: none;
      background: transparent;
      border: 1px solid var(--c-hairline);
      color: var(--c-fg-muted);
      padding: 14px 12px;
      display: flex; flex-direction: column; gap: 6px; align-items: flex-start;
      font-family: var(--font-mono);
      cursor: pointer;
      transition: background 180ms ease, border-color 180ms ease, color 180ms ease;
    }
    .relay-chip:hover {
      border-color: var(--c-fur-line);
      color: var(--c-fg);
    }
    .relay-chip__num {
      font-size: 10px; letter-spacing: 2px; color: var(--c-fur);
    }
    .relay-chip__name {
      font-size: 13px; letter-spacing: 0.5px; text-transform: uppercase;
      font-family: var(--font-sans, inherit);
    }
    .relay-chip.is-active {
      background: var(--c-fur-glow);
      border-color: var(--c-fur);
      color: var(--c-fg);
      box-shadow: inset 0 0 0 1px var(--c-fur-line),
                  0 8px 24px -18px rgba(249, 215, 96, 0.8);
    }
    .relay-chip.is-active .relay-chip__num { color: var(--c-fur); }

    .relay-playground__stats {
      display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0; margin: 0;
    }
    .relay-playground__stats > div {
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: baseline;
      padding: 12px 0;
      border-top: 1px solid var(--c-hairline);
      gap: 10px;
    }
    .relay-playground__stats > div:nth-child(1),
    .relay-playground__stats > div:nth-child(2) { border-top: 0; }
    .relay-playground__stats > div.is-wide { grid-column: 1 / -1; grid-template-columns: auto 1fr; }
    .relay-playground__stats dt {
      font-family: var(--font-mono); font-size: 10px; letter-spacing: 1.6px;
      text-transform: uppercase; color: var(--c-fg-muted);
    }
    .relay-playground__stats dd {
      margin: 0;
      font-family: var(--font-mono); font-size: 13px;
      color: var(--c-fg);
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    .relay-playground__stats > div.is-wide dd {
      text-align: left; color: var(--c-fg-muted); font-size: 12px;
    }
    .relay-playground__foot {
      color: var(--c-fg-muted); margin: 0;
      padding-top: 10px; border-top: 1px solid var(--c-hairline);
    }

    .relay-playground__stage {
      margin: 0;
      display: flex; flex-direction: column; gap: 10px;
    }
    .relay-playground__canvas {
      position: relative;
      aspect-ratio: 4 / 3;
      width: 100%;
      /* No frame — asset floats on the page like Gallery/Sneaker/Atelier. */
      border: 0;
      overflow: visible;
      background: transparent;
    }
    .relay-playground__canvas canvas {
      display: block; width: 100% !important; height: 100% !important;
      background: transparent !important;
    }
    .relay-playground__hud {
      position: absolute; top: 6px; right: 6px;
      padding: 3px 10px;
      background: transparent;
      color: var(--c-fur);
      font-size: 9px;
    }
    .relay-playground__cap {
      display: flex; justify-content: space-between;
      color: var(--c-fg-muted);
    }

    /* ---------- specs ---------- */
    .relay-specs { padding: var(--section-y) 0; border-top: 1px solid var(--c-hairline); }
    .relay-specs__grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0;
    }
    .relay-specs__row {
      display: grid;
      grid-template-columns: 1fr 1.4fr;
      align-items: baseline;
      padding: 22px 0;
      border-top: 1px solid var(--c-hairline);
    }
    .relay-specs__row:nth-child(1),
    .relay-specs__row:nth-child(2) { border-top: 0; }
    .relay-specs__row dt {
      font-family: var(--font-mono); font-size: 11px; letter-spacing: 1.6px;
      text-transform: uppercase; color: var(--c-fg-muted);
    }
    .relay-specs__row dd { margin: 0; font-size: 16px; color: var(--c-fg); }
    @media (max-width: 760px) {
      .relay-specs__grid { grid-template-columns: 1fr; }
      .relay-specs__row { grid-template-columns: 1fr 1fr; }
    }

    /* ---------- manifesto ---------- */
    .relay-manifesto { padding: var(--section-y) 0; border-top: 1px solid var(--c-hairline); }
    .relay-manifesto__copy {
      margin-top: 30px;
      font-size: clamp(28px, 4.4vw, 56px);
      line-height: 1.15; letter-spacing: -0.02em; font-weight: 400;
      color: var(--c-fg);
      max-width: 22ch;
    }
    .relay-manifesto__accent { color: var(--c-accent); }

    /* ---------- footer ---------- */
    .relay-footer { padding: 36px 0 28px; border-top: 1px solid var(--c-hairline); }
    .relay-footer__inner {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      gap: 24px;
    }
    .relay-footer__brand { display: inline-flex; align-items: center; gap: 10px; font-family: var(--font-mono); font-size: 12px; letter-spacing: 1.4px; color: var(--c-fg-muted); }
    .relay-footer__links {
      display: flex; gap: 22px; justify-self: center;
      font-family: var(--font-mono); font-size: 12px; letter-spacing: 1.2px; color: var(--c-fg-muted);
    }
    .relay-footer__links a:hover { color: var(--c-accent); }
    .relay-footer__copy { justify-self: end; }
    @media (max-width: 760px) {
      .relay-footer__inner { grid-template-columns: 1fr; text-align: center; }
      .relay-footer__brand, .relay-footer__copy { justify-self: center; }
    }
  `}</style>
);
