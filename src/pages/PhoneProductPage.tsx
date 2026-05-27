/**
 * PhoneProductPage — Galaxy Z Fold-inspired foldable smartphone showcase.
 *
 * Design direction: modern Samsung foldable design language. Dense closed
 * form, semi-cylindrical waterdrop hinge, floating camera rings, tall narrow
 * 23.1:9 cover display. Brand mark: GALAXY Z Fold 7. No trademarked art
 * assets or trade-dress replication — the silhouette lands in the general
 * flagship-foldable category.
 *
 * Page stack:
 *   1. Nav          — brand mark, nav links, Buy button
 *   2. Hero         — 3D phone (R3F) + kicker + title + subtitle + CTAs
 *   3. Colorway     — four-chip picker that swaps the phone material
 *   4. Feature rail — three stat cards (display / camera / silicon)
 *   5. Display blk  — long copy + stat column
 *   6. Camera blk   — long copy + stat column
 *   7. Spec table   — dense technical specs
 *   8. Footer       — fine print + brand mark
 */

import { useState } from 'react';

import { PhoneHydrationHero, PHONE_COLORWAYS } from '@continuum';
import type { PhoneColorway } from '@continuum';

// ---------------------------------------------------------------------------
// Config — single source of truth for copy so the spec table + feature rail
// can't drift apart from the hero badge strip.
// ---------------------------------------------------------------------------

const BRAND       = 'GALAXY';
const MODEL_NAME  = 'Z Fold 7';
const TAGLINE     = 'A phone that unfolds a screen.';
const LEDE        = `A 6.3" cover display with a razor-thin 23.1:9 bezel, a 7.6" Dynamic AMOLED 2X main panel when unfolded, and a waterdrop hinge that closes flat with zero gap. Engineered as one silhouette, not two slabs bolted to a spine.`;

const COLORWAY_ORDER: readonly (keyof typeof PHONE_COLORWAYS)[] = [
  'titanium',
  'meteor',
  'platinum',
  'amber',
];

interface StatCard {
  readonly eyebrow: string;
  readonly headline: string;
  readonly body: string;
}

const FEATURE_CARDS: readonly StatCard[] = [
  {
    eyebrow: 'DISPLAY',
    headline: '7.6" Main + 6.3" Cover · Dynamic AMOLED 2X',
    body:
      'Two displays share one mental model. The cover panel runs One UI edge-to-edge at 23.1:9, and the inner panel unfolds to a 7.6" tablet with a virtually invisible crease. Both drive 120 Hz LTPO.',
  },
  {
    eyebrow: 'OPTICS',
    headline: '50 MP main · 10 MP 3× tele · 12 MP UW',
    body:
      'Three floating camera rings, sensor-shift OIS on the main and the tele. The 3× periscope keeps true optical reach at night without falling back to a crop of the main — per-lens ISP pipelines.',
  },
  {
    eyebrow: 'HINGE',
    headline: 'Waterdrop hinge · zero-gap close · 200k cycles',
    body:
      'The new waterdrop spine lets the two halves fold flat against each other with no visible gap — closing the foldable stops the dust and grit ingress problem that earlier hinges couldn\'t.',
  },
];

interface SpecRow {
  readonly label: string;
  readonly value: string;
}

const SPEC_ROWS: readonly SpecRow[] = [
  { label: 'Main display',     value: '7.6" Dynamic AMOLED 2X · 2160×1856 · 120Hz LTPO · 2600 nits' },
  { label: 'Cover display',    value: '6.3" Dynamic AMOLED 2X · 23.1:9 · 120Hz LTPO · 2600 nits' },
  { label: 'Silicon',          value: 'Snapdragon 8 Gen 4 for Galaxy · 3nm · 8-core CPU' },
  { label: 'Memory',           value: '12 GB / 16 GB LPDDR5X' },
  { label: 'Storage',          value: '256 GB / 512 GB / 1 TB UFS 4.0' },
  { label: 'Rear camera',      value: '50 MP main · 12 MP ultrawide · 10 MP 3× tele (OIS)' },
  { label: 'Front camera',     value: '10 MP cover · 4 MP under-display (main)' },
  { label: 'Battery',          value: 'Dual-cell 4400 mAh · 25W wired · 15W wireless · 4.5W reverse' },
  { label: 'Frame',            value: 'Armor Aluminum · bead-blasted · chamfered rails' },
  { label: 'Back',             value: 'Gorilla Glass Victus 2 · matte finish' },
  { label: 'Hinge',            value: 'Waterdrop · zero-gap close · 200,000-cycle rated' },
  { label: 'Connectivity',     value: 'Wi-Fi 7 · UWB · BT 5.4 · 5G mmWave+Sub-6' },
  { label: 'Dimensions',       value: 'Closed: 153.5 × 68.1 × 12.1 mm · Open: 153.5 × 132.6 × 6.1 mm · 239 g' },
  { label: 'Ingress',          value: 'IPX8 (1.5 m freshwater · 30 min)' },
  { label: 'OS',               value: 'One UI 8 · Android 16 · 7 years OS + security updates' },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export const PhoneProductPage = () => {
  const [colorway, setColorway] = useState<keyof typeof PHONE_COLORWAYS>('titanium');

  return (
    <div className="phone-page">
      <Nav />
      <Hero colorway={colorway} />
      <ColorwayPicker active={colorway} onChange={setColorway} />
      <FeatureRail />
      <DisplayBlock />
      <CameraBlock />
      <SpecTable />
      <Footer />
      <PageStyles />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Nav
// ---------------------------------------------------------------------------

const Nav = () => (
  <nav className="phone-nav" aria-label="Primary">
    <div className="phone-nav__inner">
      <a href="#" className="phone-nav__brand">
        <span className="phone-nav__brand-dot" aria-hidden />
        {BRAND}
      </a>
      <ul className="phone-nav__links">
        <li><a href="#display">Display</a></li>
        <li><a href="#camera">Camera</a></li>
        <li><a href="#specs">Specs</a></li>
        <li><a href="#compare">Compare</a></li>
      </ul>
      <div className="phone-nav__cta">
        <a href="#buy" className="phone-nav__buy">
          Pre-order — from $1,899
        </a>
      </div>
    </div>
  </nav>
);

// ---------------------------------------------------------------------------
// Hero — R3F phone on the left, typography on the right.
// ---------------------------------------------------------------------------

const Hero = ({ colorway }: { readonly colorway: keyof typeof PHONE_COLORWAYS }) => {
  const palette: PhoneColorway =
    PHONE_COLORWAYS[colorway] ?? (PHONE_COLORWAYS.titanium as PhoneColorway);

  return (
    <section className="phone-hero">
      <div className="phone-hero__viewer">
        {/* Dynamic ambient glow keyed to colorway */}
        <div
          className="phone-hero__glow"
          aria-hidden
          style={{
            background: `radial-gradient(ellipse at 50% 45%, ${palette.accent}22, transparent 60%)`,
          }}
        />
        {/* Continuum hydration engine: the phone enters as an amber         */}
        {/* blueprint wireframe and streams through 5 LOD tiers (blockout →  */}
        {/* optics → matte → detail → PBR hero) on the Doherty schedule,     */}
        {/* exactly like the /ingest demo's VariableTierMeshHero. The        */}
        {/* BlueprintSkeleton overlay fades out as materials arrive.          */}
        <PhoneHydrationHero
          colorway={colorway}
          registryId={`galaxy-z-fold-hero-${colorway}`}
          autoRotate={0.35}
          pointerTilt={0.3}
        />
        <div className="phone-hero__readout">
          <span>COLORWAY</span>
          <strong>{palette.label.toUpperCase()}</strong>
        </div>
      </div>

      <div className="phone-hero__copy">
        <div className="phone-hero__eyebrow">
          <span className="phone-hero__dot" aria-hidden />
          {BRAND} · {MODEL_NAME}
        </div>
        <h1 className="phone-hero__title">{TAGLINE}</h1>
        <p className="phone-hero__lede">{LEDE}</p>
        <div className="phone-hero__cta-row">
          <a href="#buy" className="phone-hero__btn phone-hero__btn--primary">
            Pre-order — from $1,899
          </a>
          <a href="#film" className="phone-hero__btn phone-hero__btn--ghost">
            Watch the film  &nbsp;→
          </a>
        </div>
        <div className="phone-hero__stat-strip">
          <Stat label="Main"      value="7.6&quot;"   detail="AMOLED 2X" />
          <Stat label="Cover"     value="6.3&quot;"   detail="23.1:9 aspect" />
          <Stat label="Hinge"     value="Zero-gap"    detail="Waterdrop" />
          <Stat label="Weight"    value="239 g"       detail="Armor Aluminum" />
        </div>
      </div>
    </section>
  );
};

const Stat = ({
  label, value, detail,
}: { label: string; value: string; detail: string }) => (
  <div className="phone-hero__stat">
    <span className="phone-hero__stat-label">{label}</span>
    <strong className="phone-hero__stat-value">{value}</strong>
    <span className="phone-hero__stat-detail">{detail}</span>
  </div>
);

// ---------------------------------------------------------------------------
// Colorway picker
// ---------------------------------------------------------------------------

const ColorwayPicker = ({
  active, onChange,
}: {
  readonly active: keyof typeof PHONE_COLORWAYS;
  readonly onChange: (next: keyof typeof PHONE_COLORWAYS) => void;
}) => (
  <section className="phone-colorway" aria-label="Choose colorway">
    <div className="phone-colorway__label">
      <span className="phone-colorway__eyebrow">COLORWAY · {COLORWAY_ORDER.length} FINISHES</span>
      <h2 className="phone-colorway__headline">Finished, not painted.</h2>
    </div>
    <div className="phone-colorway__chips" role="radiogroup" aria-label="Colorway">
      {COLORWAY_ORDER.map((key) => {
        const palette = PHONE_COLORWAYS[key] as PhoneColorway;
        const isActive = key === active;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={isActive}
            className={`phone-colorway__chip ${isActive ? 'is-active' : ''}`}
            onClick={() => onChange(key)}
          >
            <span
              className="phone-colorway__swatch"
              style={{
                background: `linear-gradient(135deg, ${palette.frame} 0%, ${palette.back} 55%, ${palette.accent} 100%)`,
              }}
              aria-hidden
            />
            <span className="phone-colorway__name">{palette.label}</span>
          </button>
        );
      })}
    </div>
  </section>
);

// ---------------------------------------------------------------------------
// Feature rail — three stat cards
// ---------------------------------------------------------------------------

const FeatureRail = () => (
  <section className="phone-rail" aria-label="Feature highlights">
    <div className="phone-rail__grid">
      {FEATURE_CARDS.map((card) => (
        <article key={card.eyebrow} className="phone-rail__card">
          <span className="phone-rail__eyebrow">{card.eyebrow}</span>
          <h3 className="phone-rail__headline">{card.headline}</h3>
          <p className="phone-rail__body">{card.body}</p>
        </article>
      ))}
    </div>
  </section>
);

// ---------------------------------------------------------------------------
// Display block
// ---------------------------------------------------------------------------

const DisplayBlock = () => (
  <section id="display" className="phone-block">
    <div className="phone-block__left">
      <span className="phone-block__eyebrow">01 · DISPLAY</span>
      <h2 className="phone-block__title">
        Two displays, one surface — and a crease you can't feel.
      </h2>
      <p className="phone-block__body">
        The 6.3" cover panel runs One UI at a proper 23.1:9 aspect. Razor-thin
        symmetric bezels on all four sides, a single centered hole-punch for
        the selfie camera, and corner radii that match the titanium frame — no
        mismatched rectangle in a rounded body.
      </p>
      <p className="phone-block__body">
        Unfolded, the 7.6" Dynamic AMOLED 2X main panel runs 120 Hz LTPO
        with a re-engineered polymer layer that flattens the crease against
        your finger. You can drag a window across the fold without feeling
        where one half ends and the other begins.
      </p>
    </div>
    <div className="phone-block__right">
      <BigStat value="2600" unit="nits" label="Peak HDR brightness" />
      <BigStat value="1 – 120" unit="Hz" label="LTPO refresh range" />
      <BigStat value="23.1 : 9" unit="cover" label="Cover-panel aspect ratio" />
      <BigStat value="7.6&quot;" unit="main" label="Unfolded tablet-class canvas" />
    </div>
  </section>
);

// ---------------------------------------------------------------------------
// Camera block
// ---------------------------------------------------------------------------

const CameraBlock = () => (
  <section id="camera" className="phone-block phone-block--flipped">
    <div className="phone-block__right">
      <BigStat value="50" unit="MP" label="Main sensor · sensor-shift OIS" />
      <BigStat value="3×" unit="optical" label="Periscope tele · native range" />
      <BigStat value="f/1.8" unit="aperture" label="Main · f/2.2 UW · f/2.4 tele" />
      <BigStat value="8K30" unit="video" label="On the main · HDR10+" />
    </div>
    <div className="phone-block__left">
      <span className="phone-block__eyebrow">02 · OPTICS</span>
      <h2 className="phone-block__title">
        Three floating rings. No bulky camera bump.
      </h2>
      <p className="phone-block__body">
        We threw out the rectangular camera plate. Each lens gets its own
        raised metallic bezel, machined directly into the back glass — the
        stack stays slim enough to close flat against its other half without
        the ring hitting the opposite panel.
      </p>
      <p className="phone-block__body">
        The glass elements use real IOR — when you tilt the phone, light
        refracts through the lens well instead of dancing across a flat
        decal. The flash sits on its own cutout outside the ring stack so
        its throw pattern doesn't get clipped by the 3× tele's housing.
      </p>
    </div>
  </section>
);

const BigStat = ({
  value, unit, label,
}: { value: string; unit: string; label: string }) => (
  <div className="phone-bigstat">
    <div className="phone-bigstat__top">
      <strong className="phone-bigstat__value">{value}</strong>
      <span className="phone-bigstat__unit">{unit}</span>
    </div>
    <span className="phone-bigstat__label" dangerouslySetInnerHTML={{ __html: label }} />
  </div>
);

// ---------------------------------------------------------------------------
// Spec table
// ---------------------------------------------------------------------------

const SpecTable = () => (
  <section id="specs" className="phone-specs">
    <div className="phone-specs__header">
      <span className="phone-specs__eyebrow">03 · TECHNICAL</span>
      <h2 className="phone-specs__title">Full specification.</h2>
    </div>
    <dl className="phone-specs__grid">
      {SPEC_ROWS.map((row) => (
        <div className="phone-specs__row" key={row.label}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  </section>
);

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

const Footer = () => (
  <footer className="phone-footer">
    <div className="phone-footer__brand">
      <span className="phone-footer__dot" aria-hidden />
      {BRAND} · {MODEL_NAME}
    </div>
    <div className="phone-footer__fine">
      Figures based on pre-production units tested in GALAXY labs, Jan 2026.
      Closed and open dimensions vary by configuration. 3× is native optical
      zoom at full sensor resolution. Hinge rated at 200,000 fold cycles.
    </div>
    <div className="phone-footer__meta">
      © 2026 GALAXY · Specifications subject to change without notice.
    </div>
  </footer>
);

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const PageStyles = () => (
  <style>{`
    .phone-page {
      --p-bg:         #09090C;
      --p-bg-deep:    #050507;
      --p-bg-elev:    #101015;
      --p-fg:         #ECE7DD;
      --p-fg-muted:   #8F8A80;
      --p-fg-dim:     #5A564E;
      --p-accent:     #D7A86E;
      --p-accent-dim: rgba(215, 168, 110, 0.14);
      --p-hairline:   rgba(236, 231, 221, 0.08);
      --p-hairline-hi:rgba(236, 231, 221, 0.18);
      --p-gutter: clamp(24px, 5vw, 96px);

      background: var(--p-bg);
      color: var(--p-fg);
      font-family: var(--font-sans);
      min-height: 100vh;
      overflow-x: hidden;
    }

    /* ----------------------- Nav ----------------------- */
    .phone-nav {
      position: sticky;
      top: 44px; /* sits below the demo switcher */
      z-index: 40;
      background: rgba(9, 9, 12, 0.72);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      border-bottom: 1px solid var(--p-hairline);
    }
    .phone-nav__inner {
      max-width: 1440px;
      margin: 0 auto;
      padding: 14px var(--p-gutter);
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      gap: 32px;
    }
    .phone-nav__brand {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      color: var(--p-fg);
      text-decoration: none;
      font-family: var(--font-sans);
      font-size: 14px;
      font-weight: 600;
      letter-spacing: 3px;
    }
    .phone-nav__brand-dot {
      width: 7px; height: 7px; border-radius: 50%;
      background: var(--p-accent);
      box-shadow: 0 0 10px var(--p-accent);
    }
    .phone-nav__links {
      list-style: none;
      padding: 0; margin: 0;
      display: flex;
      gap: 28px;
      justify-self: center;
    }
    .phone-nav__links a {
      color: var(--p-fg-muted);
      text-decoration: none;
      font-size: 13px;
      letter-spacing: 0.4px;
      transition: color 180ms ease;
    }
    .phone-nav__links a:hover { color: var(--p-fg); }
    .phone-nav__buy {
      display: inline-flex;
      align-items: center;
      padding: 9px 18px;
      border: 1px solid var(--p-accent);
      border-radius: 2px;
      background: var(--p-accent-dim);
      color: var(--p-fg);
      text-decoration: none;
      font-size: 13px;
      letter-spacing: 0.3px;
      transition: background 180ms ease, color 180ms ease;
    }
    .phone-nav__buy:hover {
      background: var(--p-accent);
      color: var(--p-bg-deep);
    }

    /* ----------------------- Hero ----------------------- */
    .phone-hero {
      position: relative;
      max-width: 1440px;
      margin: 0 auto;
      padding: clamp(48px, 8vh, 120px) var(--p-gutter) clamp(48px, 6vh, 80px);
      display: grid;
      grid-template-columns: 1.1fr 1fr;
      gap: clamp(32px, 5vw, 80px);
      align-items: center;
    }
    /* Viewer sits directly on the page background — no frame, no fill.     */
    /* The phone reads as floating in the hero, not docked in a panel.     */
    .phone-hero__viewer {
      position: relative;
      aspect-ratio: 4 / 5;
      background: transparent;
      border: 0;
      border-radius: 0;
      overflow: visible;
    }
    /* Soft radial wash behind the phone — no edges, blends into the page. */
    .phone-hero__glow {
      position: absolute;
      inset: -8% -12%;
      pointer-events: none;
      mix-blend-mode: screen;
      transition: background 500ms ease;
      filter: blur(24px);
      z-index: 0;
    }
    .phone-hero__canvas {
      position: absolute !important;
      inset: 0;
      z-index: 1;
    }
    /* Minimal floating label — tiny eyebrow + colorway, no framed pill.   */
    .phone-hero__readout {
      position: absolute;
      bottom: 8px;
      left: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
      font-family: var(--font-mono, ui-monospace, monospace);
      font-size: 10px;
      letter-spacing: 1.8px;
      color: var(--p-fg-dim);
      pointer-events: none;
      z-index: 2;
    }
    .phone-hero__readout strong {
      color: var(--p-fg-muted);
      font-weight: 500;
      letter-spacing: 2.4px;
    }

    .phone-hero__copy { display: flex; flex-direction: column; gap: 20px; }
    .phone-hero__eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      font-size: 11px;
      letter-spacing: 3px;
      color: var(--p-accent);
      text-transform: uppercase;
    }
    .phone-hero__dot {
      width: 6px; height: 6px; border-radius: 50%;
      background: var(--p-accent);
      box-shadow: 0 0 10px var(--p-accent);
    }
    .phone-hero__title {
      font-size: clamp(44px, 5.4vw, 84px);
      line-height: 0.98;
      letter-spacing: -0.03em;
      font-weight: 500;
      margin: 0;
      color: var(--p-fg);
      max-width: 11ch;
    }
    .phone-hero__lede {
      font-size: clamp(15px, 1.1vw, 17px);
      line-height: 1.6;
      color: var(--p-fg-muted);
      max-width: 52ch;
      margin: 0;
    }
    .phone-hero__cta-row {
      display: flex;
      gap: 14px;
      margin-top: 10px;
      flex-wrap: wrap;
    }
    .phone-hero__btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 14px 24px;
      border-radius: 2px;
      text-decoration: none;
      font-size: 14px;
      letter-spacing: 0.3px;
      transition: background 180ms ease, border-color 180ms ease, color 180ms ease;
    }
    .phone-hero__btn--primary {
      background: var(--p-accent);
      color: #1A0F02;
      font-weight: 600;
      border: 1px solid var(--p-accent);
    }
    .phone-hero__btn--primary:hover {
      background: #E8BD85;
      border-color: #E8BD85;
    }
    .phone-hero__btn--ghost {
      background: transparent;
      color: var(--p-fg);
      border: 1px solid var(--p-hairline-hi);
    }
    .phone-hero__btn--ghost:hover {
      border-color: var(--p-fg);
    }

    .phone-hero__stat-strip {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1px;
      margin-top: 24px;
      background: var(--p-hairline);
      border: 1px solid var(--p-hairline);
      border-radius: 2px;
    }
    .phone-hero__stat {
      padding: 14px 14px 16px;
      background: var(--p-bg-elev);
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .phone-hero__stat-label {
      font-size: 9px;
      letter-spacing: 2.4px;
      color: var(--p-fg-dim);
      text-transform: uppercase;
    }
    .phone-hero__stat-value {
      font-size: 22px;
      font-weight: 500;
      color: var(--p-fg);
      letter-spacing: -0.02em;
    }
    .phone-hero__stat-detail {
      font-size: 11px;
      letter-spacing: 0.2px;
      color: var(--p-fg-muted);
    }

    /* ----------------------- Colorway picker ----------------------- */
    .phone-colorway {
      max-width: 1440px;
      margin: 0 auto;
      padding: clamp(32px, 5vh, 72px) var(--p-gutter);
      display: grid;
      grid-template-columns: 1fr 1.2fr;
      gap: 48px;
      align-items: end;
      border-top: 1px solid var(--p-hairline);
    }
    .phone-colorway__eyebrow {
      display: block;
      font-size: 11px;
      letter-spacing: 3px;
      color: var(--p-accent);
      margin-bottom: 16px;
      text-transform: uppercase;
    }
    .phone-colorway__headline {
      font-size: clamp(28px, 3.2vw, 44px);
      line-height: 1.05;
      letter-spacing: -0.02em;
      font-weight: 500;
      margin: 0;
      color: var(--p-fg);
    }
    .phone-colorway__chips {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 14px;
    }
    .phone-colorway__chip {
      background: var(--p-bg-elev);
      border: 1px solid var(--p-hairline);
      border-radius: 3px;
      padding: 16px 14px 18px;
      color: var(--p-fg-muted);
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: 12px;
      align-items: flex-start;
      text-align: left;
      transition: border-color 180ms ease, background 180ms ease, color 180ms ease;
    }
    .phone-colorway__chip:hover {
      border-color: var(--p-hairline-hi);
      color: var(--p-fg);
    }
    .phone-colorway__chip.is-active {
      border-color: var(--p-accent);
      background: var(--p-accent-dim);
      color: var(--p-fg);
      box-shadow: inset 0 -2px 0 var(--p-accent);
    }
    .phone-colorway__swatch {
      display: block;
      width: 100%;
      aspect-ratio: 1 / 1;
      border-radius: 2px;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08);
    }
    .phone-colorway__name {
      font-size: 12px;
      letter-spacing: 0.4px;
      font-weight: 500;
    }

    /* ----------------------- Feature rail ----------------------- */
    .phone-rail {
      max-width: 1440px;
      margin: 0 auto;
      padding: clamp(32px, 5vh, 72px) var(--p-gutter);
      border-top: 1px solid var(--p-hairline);
    }
    .phone-rail__grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1px;
      background: var(--p-hairline);
      border: 1px solid var(--p-hairline);
      border-radius: 3px;
    }
    .phone-rail__card {
      background: var(--p-bg-elev);
      padding: 28px 28px 32px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .phone-rail__eyebrow {
      font-size: 10px;
      letter-spacing: 3px;
      color: var(--p-accent);
      text-transform: uppercase;
    }
    .phone-rail__headline {
      font-size: 20px;
      line-height: 1.25;
      letter-spacing: -0.015em;
      font-weight: 500;
      color: var(--p-fg);
      margin: 0;
    }
    .phone-rail__body {
      font-size: 13.5px;
      line-height: 1.6;
      color: var(--p-fg-muted);
      margin: 0;
    }

    /* ----------------------- Block (display / camera) ----------------------- */
    .phone-block {
      max-width: 1440px;
      margin: 0 auto;
      padding: clamp(56px, 8vh, 120px) var(--p-gutter);
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: clamp(40px, 6vw, 96px);
      align-items: start;
      border-top: 1px solid var(--p-hairline);
    }
    .phone-block--flipped .phone-block__left { order: 2; }
    .phone-block--flipped .phone-block__right { order: 1; }
    .phone-block__eyebrow {
      display: block;
      font-size: 11px;
      letter-spacing: 3px;
      color: var(--p-accent);
      margin-bottom: 20px;
      text-transform: uppercase;
    }
    .phone-block__title {
      font-size: clamp(32px, 3.6vw, 52px);
      line-height: 1.05;
      letter-spacing: -0.025em;
      font-weight: 500;
      margin: 0 0 20px;
      color: var(--p-fg);
      max-width: 18ch;
    }
    .phone-block__body {
      font-size: 15px;
      line-height: 1.7;
      color: var(--p-fg-muted);
      margin: 0 0 16px;
      max-width: 56ch;
    }
    .phone-block__right {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1px;
      background: var(--p-hairline);
      border: 1px solid var(--p-hairline);
      border-radius: 3px;
    }
    .phone-bigstat {
      background: var(--p-bg-elev);
      padding: 22px 22px 24px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      min-height: 140px;
    }
    .phone-bigstat__top {
      display: flex;
      align-items: baseline;
      gap: 8px;
    }
    .phone-bigstat__value {
      font-size: clamp(30px, 3.4vw, 44px);
      font-weight: 500;
      color: var(--p-fg);
      letter-spacing: -0.03em;
      line-height: 1;
    }
    .phone-bigstat__unit {
      font-size: 12px;
      letter-spacing: 2px;
      color: var(--p-accent);
      text-transform: uppercase;
    }
    .phone-bigstat__label {
      font-size: 12px;
      line-height: 1.5;
      color: var(--p-fg-muted);
    }

    /* ----------------------- Spec table ----------------------- */
    .phone-specs {
      max-width: 1440px;
      margin: 0 auto;
      padding: clamp(56px, 8vh, 120px) var(--p-gutter);
      border-top: 1px solid var(--p-hairline);
    }
    .phone-specs__header { margin-bottom: 40px; }
    .phone-specs__eyebrow {
      display: block;
      font-size: 11px;
      letter-spacing: 3px;
      color: var(--p-accent);
      margin-bottom: 14px;
      text-transform: uppercase;
    }
    .phone-specs__title {
      font-size: clamp(32px, 3.6vw, 52px);
      line-height: 1.05;
      letter-spacing: -0.025em;
      font-weight: 500;
      margin: 0;
      color: var(--p-fg);
    }
    .phone-specs__grid {
      display: flex;
      flex-direction: column;
      gap: 0;
      margin: 0;
      border-top: 1px solid var(--p-hairline);
    }
    .phone-specs__row {
      display: grid;
      grid-template-columns: 180px 1fr;
      padding: 18px 0;
      border-bottom: 1px solid var(--p-hairline);
      gap: 24px;
    }
    .phone-specs__row dt {
      font-size: 11px;
      letter-spacing: 2.4px;
      color: var(--p-fg-dim);
      text-transform: uppercase;
      padding-top: 3px;
    }
    .phone-specs__row dd {
      font-size: 15px;
      line-height: 1.5;
      color: var(--p-fg);
      margin: 0;
      font-weight: 400;
    }

    /* ----------------------- Footer ----------------------- */
    .phone-footer {
      max-width: 1440px;
      margin: 0 auto;
      padding: 56px var(--p-gutter) 96px;
      border-top: 1px solid var(--p-hairline);
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 40px;
      align-items: start;
    }
    .phone-footer__brand {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      font-size: 14px;
      font-weight: 600;
      letter-spacing: 3px;
      color: var(--p-fg);
    }
    .phone-footer__dot {
      width: 7px; height: 7px; border-radius: 50%;
      background: var(--p-accent);
      box-shadow: 0 0 10px var(--p-accent);
    }
    .phone-footer__fine {
      font-size: 11px;
      line-height: 1.7;
      color: var(--p-fg-dim);
      max-width: 60ch;
    }
    .phone-footer__meta {
      font-size: 11px;
      letter-spacing: 0.3px;
      color: var(--p-fg-dim);
      white-space: nowrap;
    }

    /* ----------------------- Responsive ----------------------- */
    @media (max-width: 1024px) {
      .phone-hero { grid-template-columns: 1fr; }
      .phone-hero__viewer { aspect-ratio: 16 / 9; max-width: 100%; }
      .phone-colorway { grid-template-columns: 1fr; gap: 24px; }
      .phone-block, .phone-block--flipped { grid-template-columns: 1fr; }
      .phone-block--flipped .phone-block__left { order: 1; }
      .phone-block--flipped .phone-block__right { order: 2; }
      .phone-rail__grid { grid-template-columns: 1fr; }
      .phone-footer { grid-template-columns: 1fr; }
      .phone-nav__links { display: none; }
    }
    @media (max-width: 640px) {
      .phone-hero__stat-strip { grid-template-columns: repeat(2, 1fr); }
      .phone-colorway__chips { grid-template-columns: repeat(2, 1fr); }
      .phone-block__right { grid-template-columns: 1fr; }
      .phone-specs__row { grid-template-columns: 1fr; gap: 4px; }
    }
  `}</style>
);

export default PhoneProductPage;
