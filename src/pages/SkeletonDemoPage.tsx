/**
 * SkeletonDemoPage — Continuum skeleton v2 · orchestrated reveal.
 *
 * Every element on this page is wrapped in a ConductorStep with a
 * delay that choreographs a page-wide reveal under the Doherty budget:
 *
 *   0–120 ms    Nav + logo underline (the anchor)
 *   280–560 ms  Hero heading (redacts in), body text, CTA
 *   900–1280 ms 4-card grid cascade (95 ms between cards)
 *   1500 ms     Floating tooltip + menu + avatar
 *   2600 ms     Full content ready
 *
 * Hit "Replay" to watch the sequence again — PageConductor bumps its
 * runToken which resets every child step without remounting.
 */

import { useState } from 'react';

import { SkeletonPulse } from '../continuum/skeleton/SkeletonPulse';
import { SkeletonTextBlock } from '../continuum/skeleton/SkeletonTextBlock';
import { SkeletonStroke } from '../continuum/skeleton/SkeletonStroke';
import { SkeletonCardFrame } from '../continuum/skeleton/SkeletonCardFrame';
import {
  PageConductor,
  ConductorStep,
} from '../continuum/skeleton/PageConductor';

export const SkeletonDemoPage = () => {
  const [runToken, setRunToken] = useState(0);

  return (
    <div className="skel-page">
      <header className="skel-header">
        <div className="skel-header__eyebrow">
          <span className="skel-header__dot" aria-hidden />
          CONTINUUM · SKELETON V2
        </div>
        <h1 className="skel-header__title">
          Skeletons that know their shape.
        </h1>
        <p className="skel-header__lede">
          Cards get circuits, buttons get quick orbits, text lines get
          horizontal sweeps, nav underlines draw themselves in. One
          PageConductor times the whole reveal under Doherty.
        </p>
        <button
          type="button"
          className="skel-header__btn"
          onClick={() => setRunToken((t) => t + 1)}
        >
          Replay ↻
        </button>
      </header>

      <PageConductor duration={2800} runToken={runToken}>
        <main className="skel-main">
          <NavRow />
          <Hero />
          <CardGrid />
          <FloatingRow />
        </main>
      </PageConductor>
      <PageStyles />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Nav — logo draws in first, items cascade left-to-right
// ---------------------------------------------------------------------------

const NAV_ITEMS = ['Product', 'Pipeline', 'Research', 'Pricing', 'Contact'];

const NavRow = () => (
  <nav className="skel-nav">
    <div className="skel-nav__logo">
      <ConductorStep
        delay={0}
        skeleton={<SkeletonPulse kind="nav-item" width={140} height={20} />}
      >
        <span className="skel-nav__logo-text">CONTINUUM</span>
      </ConductorStep>
    </div>
    <ul className="skel-nav__items">
      {NAV_ITEMS.map((label, i) => (
        <li key={label}>
          <ConductorStep
            delay={80 + i * 60}
            skeleton={
              <SkeletonPulse
                kind="nav-item"
                width={64 + label.length * 2}
                height={16}
              />
            }
          >
            <span className="skel-nav__item-text">{label}</span>
          </ConductorStep>
        </li>
      ))}
    </ul>
    <ConductorStep
      delay={400}
      skeleton={<SkeletonPulse kind="button" width={104} height={38} borderRadius={20} />}
    >
      <span className="skel-nav__cta-btn">Start free</span>
    </ConductorStep>
    <div className="skel-nav__underline">
      <SkeletonStroke width="100%" height={1} drawDurationSec={1.0} />
    </div>
  </nav>
);

// ---------------------------------------------------------------------------
// Hero — heading first, body second, CTA third, media last
// ---------------------------------------------------------------------------

const Hero = () => (
  <section className="skel-hero">
    <div className="skel-hero__copy">
      <ConductorStep
        delay={280}
        skeleton={<SkeletonPulse kind="heading" width="100%" height={44} />}
      >
        <h2 className="skel-hero__title">
          Progressive everything.
        </h2>
      </ConductorStep>
      <ConductorStep
        delay={360}
        skeleton={<SkeletonPulse kind="heading" width="78%" height={44} />}
      >
        <h2 className="skel-hero__title skel-hero__title--2">
          Zero per-asset work.
        </h2>
      </ConductorStep>

      <div style={{ height: 24 }} />

      <ConductorStep
        delay={540}
        skeleton={<SkeletonTextBlock lines={3} lineHeight={22} />}
      >
        <p className="skel-hero__body">
          Continuum unifies your 3D hydration, image crossfades, and UI
          skeleton states under one visual language. Drop a file, drop a
          component, ship the reveal.
        </p>
      </ConductorStep>

      <div style={{ height: 20 }} />

      <ConductorStep
        delay={780}
        skeleton={<SkeletonPulse kind="caption" width={140} height={12} />}
      >
        <span className="skel-hero__caption">Research · April 2026</span>
      </ConductorStep>

      <div style={{ height: 14 }} />

      <ConductorStep
        delay={900}
        skeleton={<SkeletonPulse kind="button" width={140} height={44} borderRadius={8} />}
      >
        <button className="skel-hero__cta" type="button">
          Try it live →
        </button>
      </ConductorStep>
    </div>
    <div className="skel-hero__media">
      <ConductorStep
        delay={720}
        skeleton={
          // Biggest card on the page — explicit pulseCount=3 so the
          // outline reads active even at a wide aspect ratio.
          <SkeletonCardFrame
            height={340}
            pulseCount={3}
            pulseDurationSec={3.6}
            borderRadius={10}
            style={{ borderRadius: 10 }}
          />
        }
      >
        <div className="skel-hero__image">
          <div className="skel-hero__image-tag">Your 3D asset here</div>
        </div>
      </ConductorStep>
    </div>
  </section>
);

// ---------------------------------------------------------------------------
// Card grid — cascaded reveal, ~95 ms between cards, all text inside each
// card is text-block so multi-line paragraphs render as stacked bars.
// ---------------------------------------------------------------------------

const CARDS = [
  {
    tag: 'INGEST',
    title: 'Ingest',
    body: 'meshoptimizer decimates any glTF into N progressively simpler tiers, sized to asset complexity.',
  },
  {
    tag: 'ENGINE',
    title: 'Engine',
    body: 'ProgressiveEngine hot-swaps tiers inside the Doherty envelope, with a hologram boot pre-phase.',
  },
  {
    tag: 'ATELIER',
    title: 'Atelier',
    body: 'Hand-authored showcase asset with real-time subdivision — the marquee visual for the pipeline.',
  },
  {
    tag: 'SKELETON',
    title: 'Skeleton',
    body: 'Traveling-pulse placeholders for UI elements outside the 3D canvas.',
  },
];

const CardGrid = () => (
  <section className="skel-cards">
    <ConductorStep
      delay={880}
      skeleton={<SkeletonPulse kind="heading" width={360} height={28} />}
    >
      <h3 className="skel-cards__title">Four surfaces, one language</h3>
    </ConductorStep>

    <div style={{ height: 28 }} />

    <div className="skel-cards__grid">
      {CARDS.map((c, i) => (
        <ConductorStep
          key={c.tag}
          delay={1000 + i * 95}
          skeleton={
            // SkeletonCardFrame wraps the placeholder content in a
            // pulsing amber outline. The inner pulses + text bars stay
            // the same — the frame just replaces the flat ghost border
            // with a line that's visibly alive. pulseCount="auto" picks
            // 2 pulses for these medium cards.
            <SkeletonCardFrame pulseCount="auto" borderRadius={10} style={{ borderRadius: 10 }}>
              <article className="skel-card skel-card--ghost">
                <SkeletonPulse kind="image" width="100%" height={140} borderRadius={6} />
                <div className="skel-card__stack">
                  <SkeletonPulse kind="heading" width="70%" height={20} />
                  <div style={{ height: 12 }} />
                  <SkeletonTextBlock lines={3} lineHeight={18} barHeight={11} />
                  <div style={{ height: 14 }} />
                  <div className="skel-card__row">
                    <SkeletonPulse kind="button" width={52} height={22} borderRadius={12} />
                    <SkeletonPulse kind="caption" width={56} height={12} />
                  </div>
                </div>
              </article>
            </SkeletonCardFrame>
          }
        >
          <article className="skel-card">
            <div className="skel-card__image">
              <span className="skel-card__image-tag">{c.tag}</span>
            </div>
            <div className="skel-card__content">
              <h4 className="skel-card__title">{c.title}</h4>
              <p className="skel-card__body">{c.body}</p>
              <div className="skel-card__meta">
                <span className="skel-card__chip">Live</span>
                <span className="skel-card__link">Open →</span>
              </div>
            </div>
          </article>
        </ConductorStep>
      ))}
    </div>
  </section>
);

// ---------------------------------------------------------------------------
// Floating row — tooltip, context menu, avatar
// ---------------------------------------------------------------------------

const FloatingRow = () => (
  <section className="skel-floats">
    <ConductorStep
      delay={1500}
      skeleton={
        <SkeletonCardFrame
          width={260}
          height={88}
          pulseCount={1}
          pulseDurationSec={2.6}
          borderRadius={10}
          style={{ borderRadius: 10 }}
        />
      }
    >
      <div className="skel-tooltip">
        <span className="skel-tooltip__title">Pulse speed</span>
        <span className="skel-tooltip__body">
          Cards loop 1.8 s · buttons 1.1 s · text 1.4 s
        </span>
        <div className="skel-tooltip__arrow" />
      </div>
    </ConductorStep>

    <ConductorStep
      delay={1650}
      skeleton={
        <SkeletonCardFrame
          width={200}
          height={160}
          pulseCount={1}
          pulseDurationSec={2.8}
          borderRadius={10}
          style={{ borderRadius: 10 }}
        />
      }
    >
      <div className="skel-menu">
        <div className="skel-menu__item">Duplicate</div>
        <div className="skel-menu__item">Rename</div>
        <div className="skel-menu__divider" />
        <div className="skel-menu__item skel-menu__item--danger">Delete</div>
      </div>
    </ConductorStep>

    <ConductorStep
      delay={1780}
      skeleton={<SkeletonPulse kind="avatar" width={64} height={64} borderRadius={999} />}
    >
      <div className="skel-avatar">S</div>
    </ConductorStep>
  </section>
);

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const PageStyles = () => (
  <style>{`
    .skel-page {
      min-height: 100vh;
      background: #0B0805;
      color: #F5EDDC;
      font-family: var(--font-sans);
      padding: 32px 56px 140px;
    }
    .skel-header__eyebrow {
      display: inline-flex; align-items: center; gap: 10px;
      font-size: 11px; letter-spacing: 0.18em;
      color: #B8A07D; text-transform: uppercase;
    }
    .skel-header__dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: #D7A86E;
      box-shadow: 0 0 12px rgba(215,168,110,0.7);
    }
    .skel-header__title {
      font-size: clamp(40px, 4.6vw, 60px);
      letter-spacing: -0.02em;
      margin: 16px 0 12px;
      max-width: 18ch;
    }
    .skel-header__lede {
      max-width: 62ch;
      font-size: 15px; line-height: 1.6;
      color: #B8A07D;
      margin: 0 0 24px;
    }
    .skel-header__btn {
      background: #D7A86E;
      color: #0B0805;
      font-family: inherit;
      font-size: 13px; font-weight: 500;
      letter-spacing: 0.02em;
      padding: 10px 18px;
      border: none; border-radius: 4px;
      cursor: pointer;
    }
    .skel-header__btn:hover { background: #E5BE87; }

    .skel-main { margin-top: 60px; }

    /* Nav ------------------------------------------------------------------- */
    .skel-nav {
      position: relative;
      display: flex; align-items: center;
      padding: 20px 0 24px;
      gap: 32px;
    }
    .skel-nav__underline {
      position: absolute;
      left: 0; right: 0; bottom: 0;
      pointer-events: none;
    }
    .skel-nav__logo { min-width: 140px; }
    .skel-nav__logo-text {
      font-size: 12px; letter-spacing: 0.22em;
      color: #D7A86E; font-weight: 500;
    }
    .skel-nav__items {
      display: flex; gap: 28px; flex: 1;
      list-style: none; padding: 0; margin: 0;
    }
    .skel-nav__item-text {
      font-size: 13px; color: #B8A07D;
      letter-spacing: 0.02em;
    }
    .skel-nav__cta-btn {
      display: inline-block;
      background: rgba(215,168,110,0.14);
      color: #D7A86E;
      border: 1px solid rgba(215,168,110,0.4);
      padding: 8px 16px; border-radius: 20px;
      font-size: 12px; letter-spacing: 0.04em;
    }

    /* Hero ------------------------------------------------------------------ */
    .skel-hero {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 40px;
      padding: 56px 0 48px;
      border-bottom: 1px solid rgba(215,168,110,0.1);
    }
    .skel-hero__title {
      font-size: clamp(32px, 3.6vw, 48px);
      margin: 0;
      letter-spacing: -0.02em;
      line-height: 1.05;
    }
    .skel-hero__title--2 { color: #D7A86E; font-style: italic; }
    .skel-hero__body {
      font-size: 15px; line-height: 1.6;
      color: #B8A07D;
      max-width: 46ch;
      margin: 0;
    }
    .skel-hero__caption {
      font-size: 11px; letter-spacing: 0.18em;
      text-transform: uppercase;
      color: #8B7355;
    }
    .skel-hero__cta {
      background: #D7A86E; color: #0B0805;
      font-family: inherit; font-size: 14px;
      font-weight: 500; letter-spacing: 0.02em;
      padding: 12px 22px;
      border: none; border-radius: 8px;
      cursor: pointer;
    }
    .skel-hero__image {
      position: relative;
      height: 340px;
      background:
        radial-gradient(ellipse at center,
          rgba(215,168,110,0.12) 0%,
          rgba(215,168,110,0.04) 60%,
          transparent 100%),
        rgba(255,255,255,0.02);
      border: 1px solid rgba(215,168,110,0.18);
      border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
    }
    .skel-hero__image-tag {
      font-size: 11px; letter-spacing: 0.18em;
      color: #8B7355; text-transform: uppercase;
    }

    /* Card grid ------------------------------------------------------------- */
    .skel-cards { padding: 56px 0; }
    .skel-cards__title {
      font-size: 22px; letter-spacing: -0.01em;
      margin: 0;
    }
    .skel-cards__grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 20px;
    }
    .skel-card {
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(215,168,110,0.12);
      border-radius: 10px;
      overflow: hidden;
      display: flex; flex-direction: column;
      height: 100%;
    }
    .skel-card--ghost {
      background: transparent;
      border: 1px solid rgba(215,168,110,0.08);
    }
    .skel-card__image {
      height: 140px;
      background: linear-gradient(
        135deg,
        rgba(215,168,110,0.24),
        rgba(215,168,110,0.08)
      );
      display: flex; align-items: center; justify-content: center;
    }
    .skel-card__image-tag {
      font-size: 10px; letter-spacing: 0.2em;
      color: #0B0805; font-weight: 600;
    }
    .skel-card__content, .skel-card__stack {
      padding: 16px 18px 18px;
      flex: 1;
    }
    .skel-card__title {
      font-size: 16px; margin: 0 0 8px;
      letter-spacing: -0.01em;
    }
    .skel-card__body {
      font-size: 12.5px; line-height: 1.55;
      color: #B8A07D;
      margin: 0 0 14px;
    }
    .skel-card__meta, .skel-card__row {
      display: flex; align-items: center; justify-content: space-between;
      gap: 10px;
    }
    .skel-card__chip {
      font-size: 10px; letter-spacing: 0.16em;
      color: #D7A86E;
      background: rgba(215,168,110,0.1);
      padding: 4px 10px; border-radius: 10px;
    }
    .skel-card__link {
      font-size: 11px; color: #8B7355;
      letter-spacing: 0.04em;
    }

    /* Floating row ---------------------------------------------------------- */
    .skel-floats {
      display: grid;
      grid-template-columns: 1fr 1fr auto;
      gap: 32px;
      align-items: start;
      padding: 48px 0 0;
      border-top: 1px solid rgba(215,168,110,0.1);
      margin-top: 28px;
    }
    .skel-tooltip {
      position: relative;
      background: rgba(215,168,110,0.08);
      border: 1px solid rgba(215,168,110,0.3);
      border-radius: 10px;
      padding: 16px 18px;
      width: 260px;
      box-shadow: 0 12px 32px rgba(215,168,110,0.08),
                  0 4px 12px rgba(0,0,0,0.45);
    }
    .skel-tooltip__title {
      font-size: 11px; letter-spacing: 0.18em;
      color: #D7A86E; text-transform: uppercase;
      display: block; margin-bottom: 6px;
    }
    .skel-tooltip__body {
      font-size: 12px; color: #B8A07D; line-height: 1.5;
    }
    .skel-tooltip__arrow {
      position: absolute; bottom: -6px; left: 24px;
      width: 12px; height: 12px;
      background: rgba(215,168,110,0.08);
      border-right: 1px solid rgba(215,168,110,0.3);
      border-bottom: 1px solid rgba(215,168,110,0.3);
      transform: rotate(45deg);
    }
    .skel-menu {
      width: 200px;
      background: rgba(20,14,8,0.96);
      border: 1px solid rgba(215,168,110,0.18);
      border-radius: 10px;
      padding: 6px;
      box-shadow: 0 16px 48px rgba(0,0,0,0.5);
    }
    .skel-menu__item {
      padding: 10px 12px;
      font-size: 13px;
      color: #E7DABF;
      border-radius: 6px;
      cursor: pointer;
    }
    .skel-menu__item:hover { background: rgba(215,168,110,0.1); }
    .skel-menu__item--danger { color: #E87A7A; }
    .skel-menu__divider {
      height: 1px;
      background: rgba(215,168,110,0.15);
      margin: 4px 0;
    }
    .skel-avatar {
      width: 64px; height: 64px;
      border-radius: 999px;
      background: linear-gradient(135deg, #D7A86E, #8B5E2E);
      color: #0B0805;
      font-weight: 600; font-size: 22px;
      display: flex; align-items: center; justify-content: center;
    }

    @media (max-width: 1080px) {
      .skel-cards__grid { grid-template-columns: repeat(2, 1fr); }
      .skel-hero { grid-template-columns: 1fr; }
      .skel-floats { grid-template-columns: 1fr; }
    }
  `}</style>
);

export default SkeletonDemoPage;
