/**
 * WatchShowcasePage — full-fidelity photorealistic dress watch.
 *
 * The /#/watch route. Unlike the latency page, this one does not gate the
 * asset behind tier progression — it's the "finished product shoot":
 *
 *   - WristwatchAsset at tier 4, all regions at full PBR.
 *   - Studio lighting: 3× RectAreaLight softboxes + key DirectionalLight.
 *   - Procedural environment map for dynamic metallic reflections.
 *   - OrbitControls with damping so the viewer can rotate, zoom, pan.
 *   - Real system time on the hands, sweeping seconds sub-dial.
 *   - Rotor swings via gravity when the viewer spins the watch.
 *
 * The layout is a single dark stage — no bordered panel, no chrome —
 * with a small info rail to the left listing the spec callouts.
 */

import React, { useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import {
  OrbitControls,
  ContactShadows,
  Environment,
} from '@react-three/drei';

import {
  WristwatchAsset,
  WATCH_TIER_COUNT,
} from '@continuum';
import type { WatchRegion, WatchTier } from '@continuum';

import { BlueprintMark } from '../continuum/skeleton/BlueprintMark';
import { SkeletonCardFrame } from '../continuum/skeleton/SkeletonCardFrame';
import { BlueprintParagraph } from '../continuum/skeleton/BlueprintParagraph';
import { BlueprintConstructionGrid } from '../continuum/skeleton/BlueprintConstructionGrid';
import { PageConductor, useRevealed } from '../continuum/skeleton/PageConductor';
import {
  BlueprintText,
  useRevealProgress,
} from '../continuum/skeleton/BlueprintText';

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

interface FeatureCardData {
  /** Two-digit ordinal shown in the corner of the card. */
  readonly index: string;
  /** Section keyword — small caps eyebrow above the title. */
  readonly label: string;
  /** Card title — the headline for the spec. */
  readonly title: string;
  /** Body copy — 2–3 lines of detail. */
  readonly body: string;
  /** Bottom-right stat — short, monospaced if applicable. */
  readonly stat: string;
}

const FEATURE_CARDS: readonly FeatureCardData[] = [
  {
    index: '01',
    label: 'Case',
    title: '40 mm · 18k rose gold',
    body: 'Polished bezel meets brushed flanks. Procedurally generated micro-scratches catch the rim light without ever repeating a pattern.',
    stat: 'Ø 40.0 mm',
  },
  {
    index: '02',
    label: 'Crystal',
    title: 'Domed sapphire',
    body: 'IOR 1.76 with attenuated blue AR-coating. Transmission ramps from 0.7 to 1.0 across the reveal so the dial seals under glass at the final tier.',
    stat: 'AR · IOR 1.76',
  },
  {
    index: '03',
    label: 'Dial',
    title: 'Champagne sunburst',
    body: 'Hand-applied baton indices, diamond-cut hour spokes, and a procedurally generated sunburst grain that radiates from the center pinion.',
    stat: 'Procedural · 12h',
  },
  {
    index: '04',
    label: 'Movement',
    title: 'Automatic · 5 jewel',
    body: 'Exhibition case-back exposes a half-disc rotor that swings under simulated gravity when the watch is rotated. Five rubies set into the bridges.',
    stat: 'Gravity wind',
  },
  {
    index: '05',
    label: 'Strap',
    title: 'Woven gold bracelet',
    body: 'Closed-loop Milanese-style mesh threaded through the lugs, anchored by a recessed deployment clasp at the back of the wrist.',
    stat: 'Closed loop · 1 piece',
  },
  {
    index: '06',
    label: 'Render',
    title: 'Real-time WebGL 2',
    body: 'No image assets. Every texture, dial pattern, and brushed-metal grain is generated at runtime — the entire watch ships in your JS bundle.',
    stat: 'R3F · 0 image bytes',
  },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const ZERO_TIERS: Record<WatchRegion, WatchTier> = {
  dial: 0, bezel: 0, case: 0, strap: 0,
};

// ---------------------------------------------------------------------------
// Atelier reveal schedule — the slow, cinematic variant.
//
//   0 – 1500 ms : BLUEPRINT HOLD
//     All regions held at tier 0. Hologram boot flickers the coarse
//     wireframe into being, then the wireframe density layers add
//     triangles inside the locked silhouette. You watch lines appear.
//   1500 – 3000 ms : ALBEDO
//     Tiers advance 0 → 2. Material opacity ramps in per-region
//     (sequential per the in-asset curves), roughness settles to matte.
//   3000 – 4200 ms : SHADOWS
//     Tiers advance 2 → 3. Metalness rises, contact shadows fade in
//     (driven by `shadowOpacity` state below).
//   4200 – 5500 ms : REFLECTIONS
//     Tiers reach 4. Clearcoat rises, environment intensity ramps up
//     for the final glaze (driven by `envIntensity` state).
//
// Total: 5500 ms. Well over Doherty's 2 s threshold, but this is a
// cinematic showcase page, not a landing-load. Perceived quality > speed.
// ---------------------------------------------------------------------------

const TOTAL_MS = 5500;
const BLUEPRINT_HOLD_MS = 1500;
const TIER_STEP_MS = (TOTAL_MS - BLUEPRINT_HOLD_MS) / (WATCH_TIER_COUNT - 1);

// ---------------------------------------------------------------------------
// Unified text-fill window.
//
// Every heading, body paragraph, callout, and spec row uses the SAME
// hollow-to-solid crossfade window. During 0 → TEXT_FILL_START_MS every
// text element renders as a 1px amber outline (the "skeleton structure"
// phase). From TEXT_FILL_START_MS to TEXT_FILL_END_MS the outline fades
// out and the solid colour fades in — happening simultaneously across
// the whole page, exactly as the 3D watch settles into its final PBR.
//
// End time aligns with TOTAL_MS so the text solidifies on the same frame
// the watch reaches tier 4.
// ---------------------------------------------------------------------------

const TEXT_FILL_START_MS = 4700;
const TEXT_FILL_END_MS = TOTAL_MS; // 5500

// ---------------------------------------------------------------------------
// Hollow-outline palette.
//
// Every text element has its own stroke colour so contrast stays readable
// against whatever background it sits on. These reference the design
// system's CSS variables where possible, then fall back to explicit hex
// values — tweak one entry to globally retune that element's blueprint
// phase.
// ---------------------------------------------------------------------------

const HOLLOW_HERO     = 'var(--c-fg,      #F5EEE0)'; // warm off-white — hero headline pops hard against dark bg
const HOLLOW_MUTED    = 'var(--c-fg-muted,#B6AA97)'; // taupe — low-importance rows
const HOLLOW_CALLOUT  = 'var(--c-fg,      #F5EEE0)'; // white — high-importance side callout
const HOLLOW_ACCENT   = 'var(--c-accent,  #F2B07A)'; // amber — section labels, hint, eyebrow, CTA hollow phase
// Body text no longer uses hollow letters — too small to read as
// outlines. Body paragraphs render as dimmed skeleton bars via
// BlueprintParagraph instead.

// ---------------------------------------------------------------------------
// TextReveal — thin wrapper around <BlueprintText />. Every instance
// uses the same unified fill window, so callers don't have to pass
// startMs/endMs; the skeleton-to-solid moment is page-wide.
// ---------------------------------------------------------------------------

interface TextRevealProps {
  readonly children: React.ReactNode;
  readonly as?: React.ElementType;
  readonly strokeColor?: string;
  readonly strokeWidth?: number;
  readonly className?: string;
}

const TextReveal = ({
  children,
  as,
  strokeColor,
  strokeWidth,
  className,
}: TextRevealProps) => {
  const progress = useRevealProgress(TEXT_FILL_START_MS, TEXT_FILL_END_MS);
  return (
    <BlueprintText
      progress={progress}
      {...(as ? { as } : {})}
      {...(strokeColor ? { strokeColor } : {})}
      {...(strokeWidth !== undefined ? { strokeWidth } : {})}
      {...(className ? { className } : {})}
    >
      {children}
    </BlueprintText>
  );
};

// (BlueprintCardLayers removed — the staggered "wireframe per child"
//  pattern made the wireframe and hollow text load sequentially. The
//  current pages render the wireframe outline + hollow headers +
//  dimmed body bars all together at t=0 and resolve them in parallel
//  at the unified TEXT_FILL window. No staggered per-element wrapping.)

// ---------------------------------------------------------------------------
// BlueprintCTA — the "Rebuild live" button as a hollow-to-fill shape.
// Pulls the same TEXT_FILL_* progress the text uses, writes it into a
// CSS custom property the .ws-cta class already reads, so the button's
// amber background fades in on the exact same frame the text fill lands.
// Keeps the button class + hover rule working — we only control the
// background-alpha during the reveal, nothing else.
// ---------------------------------------------------------------------------

interface BlueprintCTAProps {
  readonly onClick: () => void;
  readonly children: React.ReactNode;
}

const BlueprintCTA = ({ onClick, children }: BlueprintCTAProps) => {
  const progress = useRevealProgress(TEXT_FILL_START_MS, TEXT_FILL_END_MS);
  return (
    <button
      type="button"
      className="ws-cta"
      onClick={onClick}
      style={{ ['--cta-bg-alpha' as string]: String(progress) } as React.CSSProperties}
    >
      {/* Label stroke is AMBER (matches the border) during the hollow
          phase so it reads against the transparent interior. The fill
          layer inherits the button's dark color and takes over once
          progress = 1 and the amber background has filled in. */}
      <TextReveal strokeColor={HOLLOW_ACCENT}>{children}</TextReveal>
    </button>
  );
};

// ---------------------------------------------------------------------------
// RevealHost — sets a `--reveal` CSS variable on the page root from
// the same TEXT_FILL progress the cards use. CSS rules on the
// section ::before bloom backgrounds read this variable, so the
// page's ambient amber light fades in IN LOCKSTEP with the glass
// surfaces and text fill — keeping the wireframe phase visually
// uncluttered (no bloom visible until reveal time).
// ---------------------------------------------------------------------------

/**
 * ConstructionGridLayer — wraps BlueprintConstructionGrid with the
 * conductor's reveal clock so the engineering dot/cross paper backdrop
 * is fully visible during the skeleton phase and tapers to ~15%
 * opacity once the real content is on screen. Bruno-Simon-grade
 * "this is being constructed in place" stage dressing.
 */
const ConstructionGridLayer = () => {
  // The watch's full reveal lands at TOTAL_MS (≈ 4200ms). Hold the
  // grid at full strength until shortly before the wireframe finishes
  // building, then taper to a quiet residual presence so the live
  // content owns the page. The grid never fully disappears — the dim
  // dots add depth even in the steady state.
  const wireframeBuilding = !useRevealed(2400);
  return (
    <BlueprintConstructionGrid
      fade={wireframeBuilding ? 0.95 : 0.18}
      fadeMs={520}
    />
  );
};

const RevealHost = ({ children }: { readonly children: React.ReactNode }) => {
  const progress = useRevealProgress(TEXT_FILL_START_MS, TEXT_FILL_END_MS);
  return (
    <main style={{ ['--reveal' as string]: String(progress) } as React.CSSProperties}>
      {children}
    </main>
  );
};

// ---------------------------------------------------------------------------
// FeatureCard — one of the six glass cards in the spec grid. Renders
// the wireframe outline + glass surface + hollow header + dimmed
// body bars ALL TOGETHER from t=0, then resolves them in parallel at
// the unified TEXT_FILL window.
// ---------------------------------------------------------------------------

const FeatureCard = ({ card }: { readonly card: FeatureCardData }) => {
  const progress = useRevealProgress(TEXT_FILL_START_MS, TEXT_FILL_END_MS);
  return (
    <article className="ws-feature-card">
      {/* GLASS SURFACE LAYER — own div so we can fade it on top of
          the wireframe phase. Carries background, backdrop-filter,
          border, shadow. opacity = progress so it materializes at
          reveal time, not before. */}
      <div
        className="ws-feature-card__glass"
        aria-hidden
        style={{ opacity: progress }}
      />
      {/* Specular + bottom accent — also part of the glass material;
          fade in alongside the surface. */}
      <span className="ws-feature-card__shine" aria-hidden style={{ opacity: progress }} />
      <span className="ws-feature-card__edge" aria-hidden style={{ opacity: progress }} />
      {/* Wireframe outline overlay — visible during stage 1 (pure
          blueprint), fades out as glass + text + bloom fade in. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 1 - progress,
          transition: 'opacity 200ms linear',
          pointerEvents: 'none',
          zIndex: 2,
        }}
      >
        {/* Six feature cards × ~3 perimeter pulses each = 18 comets
            competing for attention. Demote feature cards to static and
            give each a centered blueprint mark (Sketchfab pattern) so
            they still feel like reserved content slots without animating.
            The HeroCard keeps the pulse — it's the lead card. */}
        <SkeletonCardFrame
          borderRadius={16}
          pulse={false}
          watermark={<BlueprintMark />}
          watermarkSize={56}
          style={{ borderRadius: 16 }}
        />
      </div>
      <header className="ws-feature-card__head">
        <span className="ws-feature-card__index">{card.index}</span>
        <span className="ws-feature-card__label">
          <TextReveal strokeColor={HOLLOW_ACCENT}>{card.label}</TextReveal>
        </span>
      </header>
      {/* Card title — header tier, hollow letters during loading. */}
      <h3 className="ws-feature-card__title">
        <TextReveal strokeColor={HOLLOW_HERO}>{card.title}</TextReveal>
      </h3>
      {/* Card body — paragraph tier, dimmed bars during loading.   */}
      <BlueprintParagraph
        progress={progress}
        lines={3}
        lineHeight={20}
        barHeight={10}
        barColor="rgba(242, 176, 122, 0.5)"
        className="ws-feature-card__body"
      >
        {card.body}
      </BlueprintParagraph>
      <footer className="ws-feature-card__stat">
        <TextReveal strokeColor={HOLLOW_ACCENT}>{card.stat}</TextReveal>
      </footer>
    </article>
  );
};

// ---------------------------------------------------------------------------
// HeroCard — the glass card on the left of the stage. Renders the
// wireframe outline + hollow headers + dimmed body bars + hollow
// button ALL TOGETHER from t=0, then resolves them all together at
// the unified TEXT_FILL window. No staggered per-element wireframes.
// ---------------------------------------------------------------------------

const HeroCard = ({ onRebuild }: { readonly onRebuild: () => void }) => {
  const progress = useRevealProgress(TEXT_FILL_START_MS, TEXT_FILL_END_MS);
  return (
    <aside className="ws-hero-card">
      {/* GLASS SURFACE LAYER — own div so the glass effect can fade
          IN at reveal time instead of being visible during the
          wireframe phase. */}
      <div
        className="ws-hero-card__glass"
        aria-hidden
        style={{ opacity: progress }}
      />
      {/* Specular + amber accent — also part of the glass material. */}
      <span className="ws-hero-card__shine" aria-hidden style={{ opacity: progress }} />
      <span className="ws-hero-card__edge" aria-hidden style={{ opacity: progress }} />
      {/* Wireframe outline overlay — stage-1 blueprint phase, fades
          out as glass + text + bloom fade in. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 1 - progress,
          transition: 'opacity 200ms linear',
          pointerEvents: 'none',
          zIndex: 2,
        }}
      >
        <SkeletonCardFrame
          borderRadius={18}
          style={{ borderRadius: 18 }}
        />
      </div>
      {/* Eyebrow — small caption-sized header. Hollow text. */}
      <span className="ws-eyebrow">
        <TextReveal strokeColor={HOLLOW_ACCENT}>Continuum · Atelier</TextReveal>
      </span>
      {/* H1 — the big headline. Hollow text from t=0, fills with
          warm off-white at the unified TEXT_FILL window. */}
      <h1 className="ws-title">
        <TextReveal strokeColor={HOLLOW_HERO}>Hand-built in code.</TextReveal>
        <br />
        <TextReveal strokeColor={HOLLOW_HERO}>Rendered in your browser.</TextReveal>
      </h1>
      {/* Lede paragraph — body text gets the SKELETON BAR treatment,
          NOT hollow letters. Bars are sized to roughly match the real
          text's wrapped lines so layout doesn't shift on reveal. */}
      <p className="ws-lede">
        <BlueprintParagraph
          progress={progress}
          lines={4}
          lineHeight={26}
          barHeight={12}
          barColor="rgba(242, 176, 122, 0.55)"
        >
          An 18-karat rose-gold dress watch, modelled from primitives and lit by
          studio softboxes. Every texture — sunburst dial, alligator leather,
          brushed metal flanks — is generated at runtime. Rotate it, zoom in,
          watch the rotor swing.
        </BlueprintParagraph>
      </p>
      {/* CTA — button shows in hollow form from t=0 (BlueprintCTA owns
          its own progress; same TEXT_FILL window). */}
      <BlueprintCTA onClick={onRebuild}>Rebuild live ↻</BlueprintCTA>
    </aside>
  );
};

export const WatchShowcasePage = () => {
  const [tiers, setTiers] = useState<Record<WatchRegion, WatchTier>>(ZERO_TIERS);
  const [runToken, setRunToken] = useState(0);
  const [shadowOpacity, setShadowOpacity] = useState(0);
  const [envIntensity, setEnvIntensity] = useState(0);

  useEffect(() => {
    setTiers(ZERO_TIERS);
    setShadowOpacity(0);
    setEnvIntensity(0);

    const timers: number[] = [];

    // Unified tier advance — every region moves in lockstep so the
    // silhouette build reads as a single coordinated reveal, not a
    // piecemeal "one part at a time" fill-in.
    for (let i = 1; i < WATCH_TIER_COUNT; i++) {
      const atMs = BLUEPRINT_HOLD_MS + (i - 1) * TIER_STEP_MS;
      timers.push(window.setTimeout(() => {
        const tier = i as WatchTier;
        setTiers({ dial: tier, bezel: tier, case: tier, strap: tier });
      }, atMs));
    }

    // Shadows fade in gradually across the second half of the reveal, so
    // the watch doesn't look like it's floating in pure light at the start.
    const shadowStart = BLUEPRINT_HOLD_MS + 1.5 * TIER_STEP_MS;
    const shadowEnd = BLUEPRINT_HOLD_MS + 3.0 * TIER_STEP_MS;
    for (let t = 0; t <= 1; t += 0.05) {
      const atMs = shadowStart + (shadowEnd - shadowStart) * t;
      const target = t * 0.6;
      timers.push(window.setTimeout(() => setShadowOpacity(target), atMs));
    }

    // Environment intensity ramps last — the "reflections glaze" stage.
    const envStart = BLUEPRINT_HOLD_MS + 2.5 * TIER_STEP_MS;
    const envEnd = TOTAL_MS;
    for (let t = 0; t <= 1; t += 0.05) {
      const atMs = envStart + (envEnd - envStart) * t;
      const target = t * 0.7;
      timers.push(window.setTimeout(() => setEnvIntensity(target), atMs));
    }

    return () => timers.forEach((h) => window.clearTimeout(h));
  }, [runToken]);

  return (
    <div className="ws-page">
      <Nav />
      {/* Conductor drives a single clock for all BlueprintText components on
          the page. Duration matches the 3D reveal (TOTAL_MS) so every text
          element finishes its outline→fill exactly when the last LOD lands.
          PageConductor keeps ticking for duration+400 so we add a small
          buffer. */}
      <PageConductor duration={TOTAL_MS} runToken={runToken}>
      <ConstructionGridLayer />
      <RevealHost>
        <section className="ws-stage" aria-label="Photorealistic dress watch">
          <HeroCard onRebuild={() => setRunToken((t) => t + 1)} />

          <div className="ws-stage__viewport">
            <Canvas
              camera={{ position: [0, 0.4, 10], fov: 26 }}
              dpr={[1, 2]}
              gl={{ antialias: true, alpha: true }}
              shadows
            >
              <StudioLights />
              <Environment preset="studio" environmentIntensity={envIntensity} />
              <WristwatchAsset
                colorway="gold"
                regionTiers={tiers}
                autoRotate={0}
                scale={0.95}
                liveTime
                initialRotationY={-0.35}
                runToken={runToken}
              />
              <ContactShadows
                position={[0, -2.2, 0]}
                opacity={shadowOpacity}
                scale={9}
                blur={2.4}
                far={3}
              />
              <OrbitControls
                enablePan={false}
                enableDamping
                dampingFactor={0.08}
                minDistance={5}
                maxDistance={14}
                minPolarAngle={Math.PI * 0.1}
                maxPolarAngle={Math.PI * 0.85}
              />
            </Canvas>

            {/* Cursor-drag instruction — crossfades in with everything    */}
            {/* else at the page-load completion moment.                    */}
            <div className="ws-hint-wrap">
              <div className="ws-hint">
                <TextReveal strokeColor={HOLLOW_ACCENT}>
                  Drag to rotate · Scroll to zoom
                </TextReveal>
              </div>
            </div>

            {/* Spec callout block — hovers over the lower-right of the    */}
            {/* stage, laid out like the reference luxury-watch annotation. */}
            <aside className="ws-callout" aria-label="Model callout">
              <div className="ws-callout__rule" />
              <div className="ws-callout__body">
                <div className="ws-callout__title">
                  <TextReveal strokeColor={HOLLOW_CALLOUT}>
                    ULTRA-LUXURY AURA &apos;CONTINUUM&apos; GOLD DRESS WATCH
                  </TextReveal>
                </div>
                <div className="ws-callout__meta">
                  <TextReveal strokeColor={HOLLOW_MUTED}>
                    Modeled alligator strap · Sapphire crystal · Hand-applied index spokes · Detailed movement view
                  </TextReveal>
                </div>
              </div>
            </aside>

            {/* Inset disabled — OrbitControls on the main viewport lets    */}
            {/* the viewer rotate to see the case-back, so a second GL      */}
            {/* context isn't worth the cost. Keeping the hint label below. */}
          </div>
        </section>

        <section className="ws-features" aria-label="Watch specifications">
          <div className="ws-features__head">
            <span className="ws-features__eyebrow">
              <TextReveal strokeColor={HOLLOW_ACCENT}>Specification · Atelier</TextReveal>
            </span>
            <h2 className="ws-features__title">
              <TextReveal strokeColor={HOLLOW_HERO}>
                Six surfaces. Zero image bytes.
              </TextReveal>
            </h2>
          </div>
          <div className="ws-features__grid">
            {FEATURE_CARDS.map((card) => (
              <FeatureCard key={card.index} card={card} />
            ))}
          </div>
        </section>
      </RevealHost>
      </PageConductor>
      <Footer />

      <style>{`
        .ws-page {
          position: relative;
          min-height: 100vh;
          background: #0A0704;
          color: var(--c-fg);
          font-family: var(--font-sans);
          overflow-x: hidden;
        }
        .ws-page * { font-family: var(--font-sans); }
        .ws-page main {
          max-width: 1480px;
          margin: 0 auto;
          padding: 0 var(--page-gutter-x) 120px;
        }

        /* Nav */
        .ws-nav {
          position: sticky; top: 36px; z-index: 20;
          background: rgba(10, 7, 4, 0.82);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border-bottom: 1px solid var(--c-hairline);
        }
        .ws-nav__inner {
          max-width: 1480px; margin: 0 auto;
          padding: 14px var(--page-gutter-x);
          display: flex; align-items: center; justify-content: space-between;
          font-size: 12px; letter-spacing: 0.18em;
          font-weight: 500;
        }
        .ws-nav__brand { display: inline-flex; align-items: center; gap: 10px; }
        .ws-nav__brand-dot {
          width: 7px; height: 7px; border-radius: 50%;
          background: var(--c-accent);
          box-shadow: 0 0 10px var(--c-accent);
        }
        .ws-nav__meta { color: var(--c-fg-muted); }

        /* Stage */
        .ws-stage {
          position: relative;
          display: grid;
          grid-template-columns: minmax(300px, 0.8fr) minmax(0, 1.3fr);
          gap: 64px;
          align-items: center;
          padding: 88px 0 64px;
          min-height: 720px;
        }
        /* Ambient bloom behind the hero card — gives the glass
           something warm to refract. Without it, blurring the flat
           dark page background produces flat dark, and the card
           reads as a coloured rectangle instead of glass. The bloom
           is large + diffuse on purpose so it's read as ambient
           lighting rather than a positioned shape (alignment-rule
           safe). */
        .ws-stage::before {
          content: '';
          position: absolute;
          left: -8%;
          top: 8%;
          width: 70%;
          height: 84%;
          background:
            radial-gradient(ellipse 65% 55% at 30% 50%, rgba(242, 176, 122, 0.20), transparent 70%),
            radial-gradient(ellipse 45% 45% at 25% 35%, rgba(255, 200, 140, 0.14), transparent 65%),
            radial-gradient(ellipse 50% 40% at 40% 70%, rgba(255, 220, 170, 0.10), transparent 70%);
          filter: blur(20px);
          pointer-events: none;
          z-index: 0;
          /* Bloom is part of the COLOUR layer — fades in with the
             glass at reveal time, not visible during the wireframe
             phase. Driven by the --reveal CSS variable that the
             page component writes from useRevealProgress. */
          opacity: var(--reveal, 1);
          transition: opacity 220ms linear;
        }
        .ws-stage > * { position: relative; z-index: 1; }
        .ws-stage__copy {
          display: flex; flex-direction: column; gap: 22px;
        }

        /* Hero card SHELL — just layout. Glass material is on a
           separate .__glass child so we can fade the glass IN at
           reveal time (stage 2) while the wireframe sits on top
           during stage 1. */
        .ws-hero-card {
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 24px;
          padding: 38px 34px 32px;
          border-radius: 18px;
          overflow: hidden;
          isolation: isolate;
          align-self: start;
        }
        /* Glass surface — translucent gradient + backdrop-filter +
           edge ring + shadow. Sits at z-index 0; opacity is driven
           inline from the reveal progress so it materializes only
           when the wireframe phase ends. */
        .ws-hero-card__glass {
          position: absolute;
          inset: 0;
          border-radius: 18px;
          background:
            linear-gradient(
              155deg,
              rgba(255, 255, 255, 0.06) 0%,
              rgba(255, 255, 255, 0.02) 50%,
              rgba(255, 255, 255, 0.04) 100%
            );
          backdrop-filter: blur(24px) saturate(180%);
          -webkit-backdrop-filter: blur(24px) saturate(180%);
          border: 1px solid rgba(255, 255, 255, 0.16);
          box-shadow:
            inset 0 1px 0 0 rgba(255, 255, 255, 0.22),
            inset 0 -1px 0 0 rgba(0, 0, 0, 0.40),
            0 24px 64px -28px rgba(0, 0, 0, 0.65);
          pointer-events: none;
          z-index: 0;
          transition: opacity 220ms linear;
        }
        .ws-hero-card > * {
          position: relative;
          z-index: 1;
        }
        .ws-hero-card__shine {
          position: absolute;
          top: 0; left: 0;
          width: 70%;
          height: 55%;
          background: radial-gradient(
            ellipse at 0% 0%,
            rgba(255, 247, 232, 0.18),
            rgba(255, 247, 232, 0.05) 35%,
            transparent 70%
          );
          pointer-events: none;
          z-index: 0;
        }
        .ws-hero-card__edge {
          position: absolute;
          left: 12%; right: 12%; bottom: 0;
          height: 1px;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(242, 176, 122, 0.65) 50%,
            transparent
          );
          pointer-events: none;
          z-index: 0;
        }
        .ws-eyebrow {
          font-size: 11px; letter-spacing: 0.22em;
          color: var(--c-accent);
          font-weight: 500;
          display: inline-flex; align-items: center; gap: 10px;
        }
        .ws-eyebrow::before {
          content: ''; display: inline-block;
          width: 22px; height: 1px; background: var(--c-accent);
        }
        .ws-title {
          margin: 0;
          font-size: clamp(34px, 4.8vw, 56px);
          font-weight: 500;
          letter-spacing: -0.02em;
          line-height: 1.05;
        }
        .ws-lede {
          margin: 0;
          color: var(--c-fg-muted);
          font-size: 16px;
          line-height: 1.65;
          max-width: 42ch;
        }
        .ws-cta {
          align-self: flex-start;
          padding: 14px 24px; border-radius: 2px;
          border: 1px solid var(--c-accent);
          /* Background is driven by --cta-bg-alpha (0 during the hollow
             blueprint phase, 1 after the fill completes). The border
             stays fully amber throughout so the button keeps its
             silhouette while the interior energizes. Uses rgba() with
             an alpha channel rather than opacity: 0 on the whole button
             (which would also kill the border + text). */
          background: rgba(242, 176, 122, var(--cta-bg-alpha, 1));
          color: #0A0704;
          font-weight: 500;
          font-size: 13px;
          letter-spacing: 0.12em;
          margin-top: 10px;
          transition: background-color 120ms linear;
        }
        .ws-cta:hover { background: #F8C591; border-color: #F8C591; }

        .ws-stage__viewport {
          position: relative;
          width: 100%;
          aspect-ratio: 1 / 1;
          min-height: 620px;
          background:
            radial-gradient(ellipse at 50% 45%, rgba(242, 176, 122, 0.12), transparent 60%),
            radial-gradient(ellipse at 50% 90%, rgba(215, 168, 110, 0.08), transparent 70%);
        }
        .ws-hint {
          position: absolute; bottom: 16px; left: 50%;
          transform: translateX(-50%);
          font-size: 11px;
          letter-spacing: 0.18em;
          color: var(--c-fg-muted);
          text-transform: uppercase;
          pointer-events: none;
          opacity: 0.7;
        }

        /* Spec callout — luxury-watch reference annotation block. Anchored
           to the BOTTOM-RIGHT of the stage (above the drag-hint) so it
           sits in empty negative space below the watch silhouette rather
           than overlapping the dial. Max-width is trimmed slightly to keep
           the block compact inside that corner. */
        .ws-callout {
          position: absolute;
          right: 4%;
          bottom: 56px;      /* clears the "drag to rotate" hint at bottom: 16px */
          max-width: 260px;
          display: grid;
          grid-template-columns: 32px 1fr;
          gap: 12px;
          align-items: start;
          pointer-events: none;
        }
        .ws-callout__rule {
          height: 1px;
          margin-top: 10px;
          background: var(--c-accent);
          opacity: 0.7;
        }
        .ws-callout__body {
          display: flex; flex-direction: column; gap: 6px;
        }
        .ws-callout__title {
          font-size: 11px;
          letter-spacing: 0.16em;
          color: var(--c-fg);
          font-weight: 500;
          line-height: 1.45;
          text-transform: uppercase;
        }
        .ws-callout__meta {
          font-size: 11px;
          color: var(--c-fg-muted);
          line-height: 1.55;
          letter-spacing: 0.04em;
        }
        /* Highlight only INLINE dot separators the caller explicitly tags
           with .ws-callout__sep. (Using a bare "span" selector here would
           also match the stroke/fill spans BlueprintText generates, which
           caused the call-out meta to render as overlapping gold on white.) */
        .ws-callout__meta .ws-callout__sep {
          color: var(--c-accent);
          margin: 0 4px;
        }

        /* Inset side-profile view — small square canvas in the lower-left */
        /* of the stage, showing the watch at a 3/4 angle.                  */
        .ws-inset {
          position: absolute;
          left: 2%;
          bottom: 2%;
          width: 180px;
          height: 180px;
          border: 1px solid rgba(215, 168, 110, 0.3);
          background: rgba(10, 7, 4, 0.35);
          border-radius: 2px;
          overflow: hidden;
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
        }
        .ws-inset__label {
          position: absolute;
          left: 10px; bottom: 8px;
          font-size: 9px;
          letter-spacing: 0.16em;
          color: var(--c-fg-muted);
          text-transform: uppercase;
          pointer-events: none;
        }

        /* ----- Feature cards (liquid glass) ------------------------- */
        /* Section wrapper — top divider + breathing room + ambient
           bloom behind the grid so the glass cards have something
           warm to refract. The bloom is FULL-WIDTH and diffuse on
           purpose: it reads as ambient page lighting rather than as
           a positioned shape, so it doesn't clash with the grid's
           alignment. */
        .ws-features {
          position: relative;
          border-top: 1px solid var(--c-hairline);
          padding: 88px 0 32px;
          display: flex;
          flex-direction: column;
          gap: 40px;
        }
        .ws-features::before {
          content: '';
          position: absolute;
          left: 0; right: 0; top: 60px; bottom: 40px;
          background:
            radial-gradient(ellipse 60% 60% at 20% 50%, rgba(242, 176, 122, 0.16), transparent 70%),
            radial-gradient(ellipse 50% 50% at 80% 60%, rgba(242, 176, 122, 0.12), transparent 70%),
            radial-gradient(ellipse 70% 40% at 50% 30%, rgba(255, 200, 140, 0.08), transparent 75%);
          filter: blur(30px);
          pointer-events: none;
          z-index: 0;
          /* Bloom is part of the COLOUR layer — fades in at reveal,
             not visible during the wireframe phase. */
          opacity: var(--reveal, 1);
          transition: opacity 220ms linear;
        }
        .ws-features__head,
        .ws-features__grid { position: relative; z-index: 1; }
        .ws-features__head {
          display: flex; flex-direction: column; gap: 14px;
          max-width: 720px;
        }
        .ws-features__eyebrow {
          font-size: 11px;
          letter-spacing: 0.22em;
          color: var(--c-accent);
          font-weight: 500;
          text-transform: uppercase;
        }
        .ws-features__title {
          margin: 0;
          font-size: clamp(28px, 3.4vw, 40px);
          font-weight: 500;
          letter-spacing: -0.015em;
          line-height: 1.05;
          color: var(--c-fg);
        }
        .ws-features__grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 22px;
        }

        /* The glass surface itself.
           Three blended layers create the "liquid glass" feel:
             1. A translucent gradient fill (warm-white → amber tint),
                strong enough to be visible against a flat dark page.
             2. backdrop-filter blur+saturate so anything behind the
                card (the section's radial glow) is frosted.
             3. Inset highlight on the top + 1px hairline ring around
                the whole card so the glass has a defined edge.
           A radial specular sits on top via .__shine for the
           characteristic top-left glint, and a 1px gradient line at
           the bottom adds the subtle amber accent.                       */
        /* Feature card SHELL — just layout. Glass on .__glass child
           so it can fade in at reveal time. */
        .ws-feature-card {
          position: relative;
          display: flex; flex-direction: column;
          gap: 14px;
          padding: 28px 26px 22px;
          height: 100%;
          min-height: 240px;
          border-radius: 16px;
          overflow: hidden;
          isolation: isolate;
        }
        .ws-feature-card__glass {
          position: absolute;
          inset: 0;
          border-radius: 16px;
          background:
            linear-gradient(
              155deg,
              rgba(255, 255, 255, 0.06) 0%,
              rgba(255, 255, 255, 0.02) 50%,
              rgba(255, 255, 255, 0.04) 100%
            );
          backdrop-filter: blur(24px) saturate(180%);
          -webkit-backdrop-filter: blur(24px) saturate(180%);
          border: 1px solid rgba(255, 255, 255, 0.16);
          box-shadow:
            inset 0 1px 0 0 rgba(255, 255, 255, 0.20),
            inset 0 -1px 0 0 rgba(0, 0, 0, 0.40),
            0 24px 64px -28px rgba(0, 0, 0, 0.65);
          pointer-events: none;
          z-index: 0;
          transition: opacity 220ms linear;
        }

        /* Top-left specular highlight — emulates the glint of light
           catching the front face of a real glass tile. Brightened to
           a clearly visible 0.22 peak so you read it as light catching
           the surface, not as page noise. */
        .ws-feature-card__shine {
          position: absolute;
          top: 0; left: 0;
          width: 80%;
          height: 65%;
          background: radial-gradient(
            ellipse at 0% 0%,
            rgba(255, 247, 232, 0.22),
            rgba(255, 247, 232, 0.07) 35%,
            transparent 70%
          );
          pointer-events: none;
          z-index: 0;
        }

        /* Bottom amber accent line — gives the card a defined sill
           and ties it to the page accent. */
        .ws-feature-card__edge {
          position: absolute;
          left: 14%; right: 14%; bottom: 0;
          height: 1px;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(242, 176, 122, 0.7) 50%,
            transparent
          );
          pointer-events: none;
          z-index: 0;
        }

        /* Card layout — header, title, body, stat. All children sit
           above the shine layer via z-index: 1. */
        .ws-feature-card__head,
        .ws-feature-card__title,
        .ws-feature-card__body,
        .ws-feature-card__stat {
          position: relative;
          z-index: 1;
        }
        .ws-feature-card__head {
          display: flex; align-items: baseline; justify-content: space-between;
          gap: 12px;
        }
        .ws-feature-card__index {
          font-family: var(--font-mono, ui-monospace, monospace);
          font-size: 11px;
          letter-spacing: 0.08em;
          color: var(--c-fg-muted);
        }
        .ws-feature-card__label {
          font-size: 10px;
          letter-spacing: 0.22em;
          color: var(--c-accent);
          font-weight: 600;
          text-transform: uppercase;
        }
        .ws-feature-card__title {
          margin: 0;
          font-size: 19px;
          font-weight: 500;
          letter-spacing: -0.005em;
          line-height: 1.2;
          color: var(--c-fg);
        }
        .ws-feature-card__body {
          margin: 0;
          font-size: 13.5px;
          line-height: 1.55;
          color: var(--c-fg-muted);
          flex: 1;
        }
        .ws-feature-card__stat {
          margin-top: auto;
          padding-top: 12px;
          font-family: var(--font-mono, ui-monospace, monospace);
          font-size: 11px;
          letter-spacing: 0.08em;
          color: var(--c-accent);
          border-top: 1px solid rgba(245, 238, 224, 0.08);
        }

        /* Footer */
        .ws-footer {
          border-top: 1px solid var(--c-hairline);
          padding: 32px var(--page-gutter-x);
          display: flex; justify-content: space-between;
          font-size: 12px; letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--c-fg-muted);
          font-weight: 500;
        }

        @media (max-width: 1100px) {
          .ws-stage { grid-template-columns: 1fr; gap: 32px; padding-top: 56px; }
          .ws-stage__viewport { min-height: 520px; }
          .ws-features__grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 680px) {
          .ws-features__grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Studio lighting — three RectAreaLight softboxes plus a key DirectionalLight
// for the specular punch. RectArea requires BRDF LUTs initialized in the
// asset module (idempotent).
// ---------------------------------------------------------------------------

const StudioLights = () => (
  <>
    <ambientLight intensity={0.18} />

    {/* Soft fill from above-front */}
    <rectAreaLight
      position={[0, 3.2, 3.2]}
      intensity={6}
      width={5}
      height={3}
      color="#FFF5E0"
      rotation={[-Math.PI / 3, 0, 0]}
    />
    {/* Left-side softbox */}
    <rectAreaLight
      position={[-3.5, 1.5, 2]}
      intensity={5}
      width={3}
      height={4}
      color="#FFE0BA"
      rotation={[0, -Math.PI / 3, 0]}
    />
    {/* Right rim */}
    <rectAreaLight
      position={[3.5, 1.5, 1.5]}
      intensity={4}
      width={2.5}
      height={3.5}
      color="#E9EEFF"
      rotation={[0, Math.PI / 3, 0]}
    />
    {/* Key specular spotlight */}
    <directionalLight
      position={[2, 3, 4]}
      intensity={1.4}
      color="#FFF5E0"
      castShadow
    />
    <directionalLight
      position={[-2, 1, -2]}
      intensity={0.6}
      color="#7A88A8"
    />
  </>
);

// ---------------------------------------------------------------------------
// Nav + Footer
// ---------------------------------------------------------------------------

const Nav = () => (
  <nav className="ws-nav" aria-label="Primary">
    <div className="ws-nav__inner">
      <span className="ws-nav__brand">
        <span className="ws-nav__brand-dot" aria-hidden />
        Continuum · Atelier
      </span>
      <span className="ws-nav__meta">
        Procedural · Real-time · No image assets
      </span>
    </div>
  </nav>
);

const Footer = () => (
  <footer className="ws-footer">
    <span>Continuum · Atelier · {new Date().getFullYear()}</span>
    <span>All textures procedural · R3F · WebGL 2</span>
  </footer>
);

export default WatchShowcasePage;
