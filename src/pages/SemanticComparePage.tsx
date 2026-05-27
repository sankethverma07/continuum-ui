/**
 * SemanticComparePage — side-by-side research surface for comparing two
 * perceived-experience hydration strategies against the same phone asset.
 *
 * Left panel:   <PhoneHydrationHero />      — uniform progressive rendering.
 *                                              Every surface advances through
 *                                              its 5-tier climb in lockstep.
 *                                              (This is what essentially every
 *                                              LOD system on the web does.)
 *
 * Right panel:  <SemanticHydrationHero />   — semantic progressive rendering.
 *                                              The asset is decomposed into
 *                                              four regions (display, cameras,
 *                                              frame, back). Each region gets
 *                                              an importance weight; the time
 *                                              budget is allocated by weight
 *                                              so the display (weight 1.0)
 *                                              reaches PBR hero at ~35% of
 *                                              the total envelope while the
 *                                              back (weight 0.2) finishes
 *                                              last.
 *
 * Both heroes share the same total Doherty envelope so the demos complete at
 * the same wall-clock moment. The difference is WHAT'S DONE WHEN — and the
 * page is instrumented so the user can watch both plays finish in lockstep.
 *
 * A shared Replay button remounts both heroes by bumping a key, so the user
 * can run the comparison as many times as they want without a page refresh.
 */

import { useState } from 'react';

import { PhoneHydrationHero, SemanticHydrationHero } from '@continuum';

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

const KICKER = 'RESEARCH · PERCEIVED EXPERIENCE';
const TITLE  = 'Semantic progressive rendering.';
const LEDE   =
  'Uniform LOD advances every surface of a mesh in lockstep. Semantic LOD reads the asset as a composition of regions — display, cameras, frame, back — and spends the time budget on what the user actually came to see. The Doherty envelope is identical; the subject arrives first.';

const UNIFORM_BLURB =
  'Every region walks the 5-tier climb together. Doherty-scaled setTimeout chain. Matches how every web LOD system behaves today.';

const SEMANTIC_BLURB =
  'Four parallel schedules. Display importance 1.0 → done at 35% of budget. Back importance 0.2 → done at 100%. Same asset, same envelope, reorganized budget.';

const WHY_IT_WORKS: readonly { readonly title: string; readonly body: string }[] = [
  {
    title: 'Doherty stays intact',
    body:
      'Each region fits inside the same 3.2s envelope. The page still feels "done" at the same wall-clock moment — the semantic pass only reorders work inside that window.',
  },
  {
    title: 'Subject-first reveal',
    body:
      'The display is the subject of a phone render. By giving it weight 1.0 we let PBR shading and the lockscreen wallpaper land before the user has stopped reading the headline.',
  },
  {
    title: 'Scaffold fades when it matters',
    body:
      'Blueprint overlay is keyed to the display region — so the amber engineering wash retires the moment the subject is PBR-ready, even if the back panel is still wireframe.',
  },
  {
    title: 'Compounds with network LOD',
    body:
      'Orthogonal to Hoppe progressive meshes and KTX2 streaming. You can adopt either, both, or add semantic scheduling on top.',
  },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export const SemanticComparePage = () => {
  // Keys force both heroes to remount so the Doherty schedule restarts.
  const [runKey, setRunKey] = useState(0);

  const replay = () => setRunKey((k) => k + 1);

  return (
    <div className="cmp-page">
      <Nav onReplay={replay} />
      <main>
        <Header onReplay={replay} />
        <section className="cmp-grid" aria-label="Hydration comparison">
          <ComparePanel
            kind="uniform"
            label="Uniform LOD"
            badge="Baseline · every surface in lockstep"
            blurb={UNIFORM_BLURB}
          >
            <PhoneHydrationHero
              key={`uniform-${runKey}`}
              colorway="titanium"
              registryId={`compare-uniform-${runKey}`}
              autoRotate={0.0}
              pointerTilt={0}
            />
          </ComparePanel>
          <ComparePanel
            kind="semantic"
            label="Semantic LOD"
            badge="Region-weighted Doherty budget"
            blurb={SEMANTIC_BLURB}
          >
            <SemanticHydrationHero
              key={`semantic-${runKey}`}
              colorway="titanium"
              registryId={`compare-semantic-${runKey}`}
              autoRotate={0.0}
              pointerTilt={0}
            />
          </ComparePanel>
        </section>
        <Legend />
        <WhyItWorks />
      </main>
      <Footer />

      <style>{`
        .cmp-page {
          background: var(--c-bg);
          color: var(--c-fg);
          min-height: 100vh;
          font-family: var(--font-sans);
        }
        .cmp-page main {
          max-width: 1440px;
          margin: 0 auto;
          padding: 0 var(--page-gutter-x) 96px;
        }

        .cmp-nav {
          position: sticky; top: 36px; z-index: 30;
          background: rgba(18, 13, 8, 0.82);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border-bottom: 1px solid var(--c-hairline);
        }
        .cmp-nav__inner {
          max-width: 1440px;
          margin: 0 auto;
          padding: 14px var(--page-gutter-x);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
        }
        .cmp-nav__brand {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          font-size: 11px;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: var(--c-fg);
        }
        .cmp-nav__brand-dot {
          width: 7px; height: 7px; border-radius: 50%;
          background: var(--c-accent);
          box-shadow: 0 0 10px var(--c-accent);
        }
        .cmp-nav__links {
          display: flex; gap: 28px;
          font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase;
          color: var(--c-fg-muted);
        }
        .cmp-nav__links a { color: inherit; text-decoration: none; }
        .cmp-nav__links a:hover { color: var(--c-accent); }
        .cmp-nav__replay {
          font-size: 11px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          padding: 7px 14px;
          border: 1px solid var(--c-accent);
          color: var(--c-fg);
          background: var(--c-accent-dim);
          border-radius: 2px;
        }
        .cmp-nav__replay:hover { background: var(--c-accent); color: #120D08; }

        .cmp-header {
          padding: 72px 0 32px;
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 32px;
          align-items: end;
          border-bottom: 1px solid var(--c-hairline);
        }
        .cmp-header__eyebrow {
          font-size: 10px;
          letter-spacing: 0.28em;
          text-transform: uppercase;
          color: var(--c-accent);
          display: inline-flex;
          align-items: center;
          gap: 10px;
        }
        .cmp-header__eyebrow::before {
          content: '';
          display: inline-block;
          width: 22px;
          height: 1px;
          background: var(--c-accent);
        }
        .cmp-header h1 {
          margin: 18px 0 14px;
          font-size: clamp(36px, 5vw, 64px);
          font-weight: 500;
          letter-spacing: -0.02em;
          line-height: 1.05;
          max-width: 18ch;
        }
        .cmp-header__lede {
          color: var(--c-fg-muted);
          font-size: 15px;
          line-height: 1.55;
          max-width: 62ch;
          margin: 0;
        }
        .cmp-header__run {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 10px;
          padding-bottom: 8px;
        }
        .cmp-header__runmeta {
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--c-fg-muted);
        }
        .cmp-header__replay {
          padding: 12px 22px;
          font-size: 12px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          border: 1px solid var(--c-accent);
          background: var(--c-accent);
          color: #120D08;
          border-radius: 2px;
          font-weight: 500;
        }
        .cmp-header__replay:hover { background: #F8C591; border-color: #F8C591; }

        .cmp-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
          padding: 48px 0 32px;
        }

        .cmp-panel {
          position: relative;
          border: 1px solid var(--c-hairline);
          background:
            linear-gradient(180deg, rgba(20, 14, 8, 0.7), rgba(12, 9, 5, 0.92));
          border-radius: 4px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .cmp-panel--semantic {
          border-color: rgba(242, 176, 122, 0.35);
          box-shadow: 0 0 0 1px rgba(242, 176, 122, 0.08);
        }
        .cmp-panel__head {
          display: grid;
          grid-template-columns: auto 1fr auto;
          align-items: center;
          gap: 14px;
          padding: 14px 18px;
          border-bottom: 1px solid var(--c-hairline);
          background: rgba(8, 6, 3, 0.6);
        }
        .cmp-panel__kind {
          font-family: var(--font-mono);
          font-size: 9px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          padding: 4px 8px;
          border: 1px solid var(--c-hairline);
          border-radius: 2px;
          color: var(--c-fg-muted);
        }
        .cmp-panel--semantic .cmp-panel__kind {
          color: var(--c-accent);
          border-color: var(--c-accent);
          background: var(--c-accent-dim);
        }
        .cmp-panel__label {
          font-size: 14px;
          letter-spacing: -0.005em;
          color: var(--c-fg);
          font-weight: 500;
        }
        .cmp-panel__badge {
          font-family: var(--font-mono);
          font-size: 9px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--c-fg-muted);
        }
        .cmp-panel__viewer {
          position: relative;
          aspect-ratio: 4 / 5;
          min-height: 440px;
          background:
            radial-gradient(ellipse at 50% 45%, rgba(242, 176, 122, 0.10), transparent 60%),
            #0b0805;
        }
        .cmp-panel__blurb {
          padding: 14px 18px 18px;
          font-size: 13px;
          line-height: 1.55;
          color: var(--c-fg-muted);
          border-top: 1px solid var(--c-hairline-2);
        }

        .cmp-legend {
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 24px 40px;
          padding: 24px 0 48px;
          border-top: 1px solid var(--c-hairline);
        }
        .cmp-legend__title {
          font-size: 10px;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: var(--c-accent);
          padding-top: 6px;
        }
        .cmp-legend__rows {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
          padding-top: 4px;
        }
        .cmp-legend__row {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 12px 14px;
          border: 1px solid var(--c-hairline-2);
          border-radius: 3px;
          background: rgba(20, 14, 8, 0.4);
        }
        .cmp-legend__region {
          font-size: 11px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--c-fg);
        }
        .cmp-legend__weight {
          font-family: var(--font-mono);
          font-size: 10px;
          color: var(--c-accent);
          letter-spacing: 0.1em;
        }
        .cmp-legend__completes {
          font-size: 11px;
          color: var(--c-fg-muted);
        }

        .cmp-why {
          padding: 56px 0 16px;
          border-top: 1px solid var(--c-hairline);
        }
        .cmp-why__eyebrow {
          font-size: 10px;
          letter-spacing: 0.28em;
          text-transform: uppercase;
          color: var(--c-fg-muted);
        }
        .cmp-why h2 {
          font-size: 32px;
          font-weight: 500;
          letter-spacing: -0.015em;
          margin: 14px 0 28px;
          max-width: 24ch;
        }
        .cmp-why__grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 20px;
        }
        .cmp-why__card {
          padding: 20px;
          border: 1px solid var(--c-hairline);
          border-radius: 3px;
          background: rgba(20, 14, 8, 0.35);
        }
        .cmp-why__card h3 {
          font-size: 14px;
          margin: 0 0 10px;
          font-weight: 500;
          letter-spacing: -0.005em;
          color: var(--c-fg);
        }
        .cmp-why__card p {
          margin: 0;
          font-size: 13px;
          line-height: 1.55;
          color: var(--c-fg-muted);
        }

        .cmp-footer {
          border-top: 1px solid var(--c-hairline);
          padding: 32px var(--page-gutter-x);
          display: flex;
          justify-content: space-between;
          gap: 24px;
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--c-fg-muted);
        }

        @media (max-width: 1100px) {
          .cmp-grid { grid-template-columns: 1fr; }
          .cmp-legend__rows { grid-template-columns: repeat(2, 1fr); }
          .cmp-why__grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 700px) {
          .cmp-header { grid-template-columns: 1fr; }
          .cmp-header__run { align-items: flex-start; }
          .cmp-legend { grid-template-columns: 1fr; }
          .cmp-legend__rows { grid-template-columns: 1fr; }
          .cmp-why__grid { grid-template-columns: 1fr; }
          .cmp-nav__links { display: none; }
        }
      `}</style>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Nav
// ---------------------------------------------------------------------------

const Nav = ({ onReplay }: { readonly onReplay: () => void }) => (
  <nav className="cmp-nav" aria-label="Primary">
    <div className="cmp-nav__inner">
      <span className="cmp-nav__brand">
        <span className="cmp-nav__brand-dot" aria-hidden />
        CONTINUUM · COMPARE
      </span>
      <div className="cmp-nav__links">
        <a href="#thesis">Thesis</a>
        <a href="#result">Result</a>
        <a href="#why">Why it works</a>
      </div>
      <button
        type="button"
        className="cmp-nav__replay"
        onClick={onReplay}
      >
        Replay ↻
      </button>
    </div>
  </nav>
);

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

const Header = ({ onReplay }: { readonly onReplay: () => void }) => (
  <header className="cmp-header" id="thesis">
    <div>
      <span className="cmp-header__eyebrow">{KICKER}</span>
      <h1>{TITLE}</h1>
      <p className="cmp-header__lede">{LEDE}</p>
    </div>
    <div className="cmp-header__run">
      <span className="cmp-header__runmeta">Both runs · 3.2 s Doherty envelope</span>
      <button
        type="button"
        className="cmp-header__replay"
        onClick={onReplay}
      >
        Replay both →
      </button>
    </div>
  </header>
);

// ---------------------------------------------------------------------------
// ComparePanel — wraps a hero in the left/right frame.
// ---------------------------------------------------------------------------

const ComparePanel = ({
  kind,
  label,
  badge,
  blurb,
  children,
}: {
  readonly kind: 'uniform' | 'semantic';
  readonly label: string;
  readonly badge: string;
  readonly blurb: string;
  readonly children: React.ReactNode;
}) => (
  <article
    className={`cmp-panel ${kind === 'semantic' ? 'cmp-panel--semantic' : ''}`}
    id={kind === 'semantic' ? 'result' : undefined}
  >
    <header className="cmp-panel__head">
      <span className="cmp-panel__kind">{kind}</span>
      <span className="cmp-panel__label">{label}</span>
      <span className="cmp-panel__badge">{badge}</span>
    </header>
    <div className="cmp-panel__viewer">{children}</div>
    <p className="cmp-panel__blurb">{blurb}</p>
  </article>
);

// ---------------------------------------------------------------------------
// Legend — spells out the weight ladder used by the semantic panel. Lets a
// reader map the per-region HUD they're watching back to the policy numbers.
// ---------------------------------------------------------------------------

const Legend = () => (
  <section className="cmp-legend" aria-label="Region weights">
    <span className="cmp-legend__title">
      Region weights
      <br />
      (semantic panel)
    </span>
    <div className="cmp-legend__rows">
      <LegendRow region="Display" weight="w 1.0" completesAt="35 % of budget" />
      <LegendRow region="Cameras" weight="w 0.7" completesAt="55 % of budget" />
      <LegendRow region="Frame"   weight="w 0.4" completesAt="75 % of budget" />
      <LegendRow region="Back"    weight="w 0.2" completesAt="100 % of budget" />
    </div>
  </section>
);

const LegendRow = ({
  region,
  weight,
  completesAt,
}: {
  readonly region: string;
  readonly weight: string;
  readonly completesAt: string;
}) => (
  <div className="cmp-legend__row">
    <span className="cmp-legend__region">{region}</span>
    <span className="cmp-legend__weight">{weight}</span>
    <span className="cmp-legend__completes">Finishes by {completesAt}</span>
  </div>
);

// ---------------------------------------------------------------------------
// Why it works — four-card explainer so the page carries its own argument.
// ---------------------------------------------------------------------------

const WhyItWorks = () => (
  <section className="cmp-why" id="why" aria-label="Why semantic rendering works">
    <span className="cmp-why__eyebrow">MECHANISM</span>
    <h2>A universal policy for perceived load.</h2>
    <div className="cmp-why__grid">
      {WHY_IT_WORKS.map((card) => (
        <article key={card.title} className="cmp-why__card">
          <h3>{card.title}</h3>
          <p>{card.body}</p>
        </article>
      ))}
    </div>
  </section>
);

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

const Footer = () => (
  <footer className="cmp-footer">
    <span>CONTINUUM · RESEARCH · {new Date().getFullYear()}</span>
    <span>BUILT ON R3F · DOHERTY-AWARE · SEMANTIC LOD v0.1</span>
  </footer>
);

export default SemanticComparePage;
