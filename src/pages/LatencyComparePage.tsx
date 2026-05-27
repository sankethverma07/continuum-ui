/**
 * LatencyComparePage — perceived-latency study using the Continuum
 * chronograph. Two floating watches, both rotating on the central Y axis,
 * loading inside the same 3.2 s Doherty envelope:
 *
 *   Left  · traditional spinner → asset pops in at the end.
 *   Right · semantic progressive rendering (dial-first reveal).
 *
 * No containers around the watches. No panel frames. Transparent viewports
 * so the watches genuinely float on the shared radial glow.
 *
 * Typography: Neue Montreal sans throughout — navigation, timers, HUD,
 * timeline strip, verdict, footer. No JetBrains Mono anywhere on this
 * page, per design direction.
 */

import { useEffect, useRef, useState } from 'react';

import {
  WristwatchNaiveHero,
  WristwatchSemanticHero,
  WATCH_REGIONS,
  WATCH_COLORWAYS,
  WATCH_REGION_LABEL,
  WATCH_REGION_WEIGHTS,
  WATCH_TIER_BADGE,
  WATCH_TIER_COUNT,
  approxTrianglesForWatchRegion,
  approxTrianglesTotalWatch,
  formatWatchTris,
} from '@continuum';
import type { WatchRegion, WatchTier } from '@continuum';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const TOTAL_MS = 3200;

interface TimelineMark {
  readonly atMs: number;
  readonly label: string;
  readonly detail: string;
}

const WITHOUT_MARKS: readonly TimelineMark[] = [
  { atMs: 0,        label: 'Spinner appears',    detail: 'Indeterminate loading state' },
  { atMs: 1600,     label: '50 % downloaded',     detail: 'Still nothing to look at' },
  { atMs: TOTAL_MS, label: 'Watch pops in',       detail: 'First visible frame of the product' },
];

const WITH_MARKS: readonly TimelineMark[] = [
  { atMs: 80,   label: 'Skeleton paints',      detail: 'Amber blueprint + case outline' },
  { atMs: 560,  label: 'First shape',          detail: 'Case silhouette lands, mesh visible' },
  { atMs: 1120, label: 'Dial is readable',     detail: 'Hands, indices, brand mark at detail tier' },
  { atMs: 3200, label: 'Full PBR polish',      detail: 'All regions reach hero tier — same wall-clock as naive' },
];

const FIRST_SUBJECT_WITHOUT = TOTAL_MS;
const FIRST_SUBJECT_WITH    = 1120;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export const LatencyComparePage = () => {
  const [runKey, setRunKey] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  // Tier state lifted out of the hero so the progress graph can render
  // OUTSIDE the canvas overlay (below the viewport, not on top of the watch).
  const [semanticTiers, setSemanticTiers] = useState<Record<WatchRegion, WatchTier>>({
    dial: 0, bezel: 0, case: 0, strap: 0,
  });
  const startedAtRef = useRef<number>(performance.now());

  useEffect(() => {
    startedAtRef.current = performance.now();
    setElapsedMs(0);
    let raf = 0;
    const tick = () => {
      const t = performance.now() - startedAtRef.current;
      setElapsedMs(Math.min(TOTAL_MS, t));
      if (t < TOTAL_MS + 400) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [runKey]);

  const replay = () => setRunKey((k) => k + 1);
  const percent = Math.min(1, elapsedMs / TOTAL_MS);

  return (
    <div className="lat-page">
      <BackgroundGlow />
      <Nav onReplay={replay} />

      <main>
        <Header elapsedMs={elapsedMs} totalMs={TOTAL_MS} onReplay={replay} />

        <section className="lat-stage" aria-label="Perceived latency comparison">
          <FloatingHero
            label="Without Continuum"
            sublabel="Traditional spinner → pop-in"
            side="left"
            firstSubjectAtMs={FIRST_SUBJECT_WITHOUT}
          >
            {/* runToken in place of key — replays restart the sequence    */}
            {/* WITHOUT destroying the Canvas + GL context. Shader compile */}
            {/* and texture-upload costs are paid only on first mount.     */}
            <WristwatchNaiveHero
              colorway="gold"
              totalMs={TOTAL_MS}
              autoRotate={0.45}
              runToken={runKey}
            />
          </FloatingHero>
          <FloatingHero
            label="With Continuum"
            sublabel="Semantic progressive rendering"
            side="right"
            firstSubjectAtMs={FIRST_SUBJECT_WITH}
            accent
            extra={<RegionProgressPanel tiers={semanticTiers} colorway="gold" />}
          >
            {/* Page background is #0B0805 (warm near-black). The hero feeds */}
            {/* that through pickBlueprintColor() to auto-derive a readable  */}
            {/* complement for the wireframe. Drop any other colour in and   */}
            {/* the blueprint re-tints automatically.                          */}
            <WristwatchSemanticHero
              colorway="gold"
              registryId="latency-watch"
              autoRotate={0.45}
              onTiersChange={setSemanticTiers}
              runToken={runKey}
              backgroundHex="#0B0805"
            />
          </FloatingHero>
        </section>

        <TimelineStrip
          totalMs={TOTAL_MS}
          percent={percent}
          without={WITHOUT_MARKS}
          withContinuum={WITH_MARKS}
        />

        <VerdictStrip
          firstSubjectWithout={FIRST_SUBJECT_WITHOUT}
          firstSubjectWith={FIRST_SUBJECT_WITH}
        />
      </main>

      <Footer />

      <style>{`
        /* ---- Page shell ------------------------------------------------- */
        .lat-page {
          position: relative;
          min-height: 100vh;
          background: #0B0805;
          color: var(--c-fg);
          font-family: var(--font-sans);
          overflow-x: hidden;
        }
        .lat-page * { font-family: var(--font-sans); }
        .lat-bgglow {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background:
            radial-gradient(ellipse at 30% 40%, rgba(242, 176, 122, 0.08), transparent 60%),
            radial-gradient(ellipse at 75% 55%, rgba(242, 176, 122, 0.10), transparent 62%),
            radial-gradient(ellipse at 50% 100%, rgba(242, 176, 122, 0.06), transparent 75%);
        }
        .lat-page main {
          position: relative;
          max-width: 1480px;
          margin: 0 auto;
          padding: 0 var(--page-gutter-x) 96px;
        }

        /* ---- Nav --------------------------------------------------------- */
        .lat-nav {
          position: sticky; top: 36px; z-index: 30;
          background: rgba(11, 8, 5, 0.82);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border-bottom: 1px solid var(--c-hairline);
        }
        .lat-nav__inner {
          max-width: 1480px; margin: 0 auto;
          padding: 14px var(--page-gutter-x);
          display: flex; align-items: center; justify-content: space-between;
          gap: 24px;
        }
        .lat-nav__brand {
          display: inline-flex; align-items: center; gap: 10px;
          font-size: 12px; letter-spacing: 0.18em;
          color: var(--c-fg);
          font-weight: 500;
        }
        .lat-nav__brand-dot {
          width: 7px; height: 7px; border-radius: 50%;
          background: var(--c-accent);
          box-shadow: 0 0 10px var(--c-accent);
        }
        .lat-nav__replay {
          font-size: 12px; letter-spacing: 0.14em;
          padding: 8px 16px;
          border: 1px solid var(--c-accent);
          color: var(--c-fg);
          background: var(--c-accent-dim);
          border-radius: 2px;
          font-weight: 500;
        }
        .lat-nav__replay:hover { background: var(--c-accent); color: #0B0805; }

        /* ---- Header ------------------------------------------------------ */
        .lat-header {
          padding: 80px 0 48px;
          display: grid;
          grid-template-columns: minmax(0, 1.4fr) auto;
          gap: 48px;
          align-items: end;
        }
        .lat-header__eyebrow {
          font-size: 11px; letter-spacing: 0.22em;
          color: var(--c-accent);
          display: inline-flex; align-items: center; gap: 10px;
          text-transform: uppercase;
          font-weight: 500;
        }
        .lat-header__eyebrow::before {
          content: ''; display: inline-block;
          width: 22px; height: 1px; background: var(--c-accent);
        }
        .lat-header h1 {
          margin: 20px 0 18px;
          font-size: clamp(38px, 5.2vw, 64px);
          font-weight: 500; letter-spacing: -0.02em;
          line-height: 1.05; max-width: 20ch;
        }
        .lat-header__lede {
          color: var(--c-fg-muted);
          font-size: 16px; line-height: 1.6;
          max-width: 58ch; margin: 0;
        }
        .lat-header__timer {
          display: flex; flex-direction: column;
          align-items: flex-end; gap: 14px;
          padding-bottom: 4px;
        }
        .lat-header__t {
          font-size: 48px;
          letter-spacing: -0.01em;
          color: var(--c-accent);
          line-height: 1;
          font-variant-numeric: tabular-nums;
          font-weight: 500;
        }
        .lat-header__tunit {
          color: var(--c-fg-muted);
          font-size: 12px; letter-spacing: 0.14em;
        }
        .lat-header__replay {
          padding: 14px 26px; font-size: 13px; letter-spacing: 0.14em;
          border: 1px solid var(--c-accent); background: var(--c-accent);
          color: #120D08; border-radius: 2px; font-weight: 500;
        }
        .lat-header__replay:hover { background: #F8C591; border-color: #F8C591; }

        /* ---- Free-floating stage (no boxes around the watches) ---------- */
        .lat-stage {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0;
          padding: 56px 0 72px;
          position: relative;
        }
        .lat-stage::before {
          content: '';
          position: absolute;
          top: 56px; bottom: 72px; left: 50%;
          width: 1px;
          background: linear-gradient(
            to bottom,
            transparent,
            rgba(215, 168, 110, 0.14),
            transparent
          );
          pointer-events: none;
        }

        .lat-float {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 32px;
        }
        /* Sized, transparent viewport. Large enough to fit the whole watch
           with comfortable breathing room — the watch strap is ~3 units
           tall, and we need air above/below for the contact shadow + room
           to rotate without clipping.                                      */
        .lat-float__viewport {
          position: relative;
          width: 100%;
          max-width: 640px;
          aspect-ratio: 1 / 1;
          min-height: 560px;
        }
        .lat-float__label {
          display: flex; flex-direction: column; gap: 6px;
          text-align: center;
          padding: 0 12px;
        }
        .lat-float__tag {
          font-size: 11px; letter-spacing: 0.22em;
          text-transform: uppercase; color: var(--c-fg-muted);
          font-weight: 500;
        }
        .lat-float--accent .lat-float__tag { color: var(--c-accent); }
        .lat-float__headline {
          font-size: 20px; color: var(--c-fg);
          letter-spacing: -0.005em; font-weight: 500;
        }
        .lat-float__sub {
          font-size: 13px; color: var(--c-fg-muted);
          letter-spacing: 0.04em;
          line-height: 1.5;
        }
        .lat-float__firstpx {
          margin-top: 8px;
          font-size: 12px;
          color: var(--c-accent);
          letter-spacing: 0.08em;
          font-weight: 500;
        }
        .lat-float--no-accent .lat-float__firstpx {
          color: #8A7D70;
        }

        /* ---- Region progress panel (semantic side) ----------------------- */
        .lat-panel {
          width: 100%;
          max-width: 640px;
          margin: 0 auto;
          border: 1px solid var(--c-hairline);
          border-radius: 4px;
          background: linear-gradient(180deg,
            rgba(20, 14, 8, 0.55),
            rgba(12, 9, 5, 0.75));
          padding: 20px 22px;
          display: flex; flex-direction: column; gap: 16px;
        }
        .lat-panel__head {
          display: flex; justify-content: space-between; align-items: baseline;
        }
        .lat-panel__tag {
          font-size: 12px; letter-spacing: 0.22em;
          text-transform: uppercase; color: var(--c-accent);
          font-weight: 500;
        }
        .lat-panel__meta {
          font-size: 12px; letter-spacing: 0.16em;
          color: var(--c-fg-muted);
          text-transform: uppercase;
        }
        .lat-panel__rows {
          display: flex; flex-direction: column; gap: 12px;
        }
        .lat-panel__row {
          display: grid;
          grid-template-columns: 80px 48px 1fr 84px 68px;
          align-items: center;
          gap: 14px;
          font-size: 13px;
        }
        .lat-panel__rowLabel {
          color: var(--c-fg);
          letter-spacing: 0.02em;
          font-weight: 500;
        }
        .lat-panel__weight {
          color: var(--c-fg-muted);
          font-size: 12px;
          letter-spacing: 0.04em;
        }
        .lat-panel__bar {
          height: 6px;
          background: rgba(215, 168, 110, 0.12);
          border-radius: 3px;
          overflow: hidden;
          position: relative;
        }
        .lat-panel__barFill {
          position: absolute; top: 0; left: 0; bottom: 0;
          background: linear-gradient(90deg,
            rgba(242, 176, 122, 0.55),
            var(--c-accent));
          border-radius: 3px;
          transition: width 420ms cubic-bezier(0.25, 0.9, 0.25, 1);
          box-shadow: 0 0 10px rgba(242, 176, 122, 0.35);
        }
        .lat-panel__tier {
          color: var(--c-accent);
          font-size: 12px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          font-weight: 500;
          text-align: right;
        }
        .lat-panel__tris {
          color: var(--c-fg);
          font-size: 13px;
          letter-spacing: 0.02em;
          text-align: right;
          font-variant-numeric: tabular-nums;
        }
        .lat-panel__tris span {
          color: var(--c-accent);
          margin-left: 4px;
        }
        .lat-panel__foot {
          display: flex; justify-content: space-between; align-items: baseline;
          padding-top: 12px;
          border-top: 1px solid var(--c-hairline-2);
          font-size: 12px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--c-fg-muted);
        }
        .lat-panel__total {
          color: var(--c-fg);
          font-size: 18px;
          letter-spacing: 0;
          text-transform: none;
          font-variant-numeric: tabular-nums;
          font-weight: 500;
        }
        .lat-panel__total span {
          color: var(--c-fg-muted);
          font-size: 12px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          font-weight: 400;
          margin-left: 4px;
        }

        /* ---- Timeline strip --------------------------------------------- */
        .lat-tl {
          position: relative;
          padding: 72px 0 64px;
          border-top: 1px solid var(--c-hairline);
          border-bottom: 1px solid var(--c-hairline);
          margin-top: 24px;
        }
        .lat-tl__title {
          font-size: 13px; letter-spacing: 0.18em;
          color: var(--c-fg-muted);
          margin-bottom: 48px;
          text-transform: uppercase;
          font-weight: 500;
        }
        .lat-tl__track {
          position: relative;
          height: 180px;
          /* Generous side gutters so the 0ms and 3200ms endpoint labels
             have room to breathe without wrapping against the edge. */
          margin: 0 clamp(100px, 12%, 220px);
        }
        .lat-tl__ruler {
          position: absolute; top: 90px; left: 0; right: 0;
          height: 1px;
          background: var(--c-hairline);
        }
        .lat-tl__playhead {
          position: absolute; top: 72px; bottom: 72px;
          width: 1px;
          background: var(--c-accent);
          box-shadow: 0 0 12px var(--c-accent);
          transition: left 60ms linear;
        }
        .lat-tl__lane {
          position: absolute; left: 0; right: 0;
          display: flex; align-items: center;
        }
        .lat-tl__lane--upper { top: 0; }
        .lat-tl__lane--lower { bottom: 0; }
        .lat-tl__mark {
          position: absolute;
          transform: translateX(-50%);
          display: flex; flex-direction: column;
          align-items: center; gap: 8px;
          font-size: 14px;
          color: var(--c-fg);
          width: 150px;               /* narrow so adjacent marks don't overlap */
          text-align: center;
          line-height: 1.45;
        }
        .lat-tl__mark span.dot {
          width: 11px; height: 11px; border-radius: 50%;
          background: var(--c-fg-muted);
          border: 1px solid var(--c-hairline);
        }
        .lat-tl__mark--accent span.dot {
          background: var(--c-accent);
          box-shadow: 0 0 10px var(--c-accent);
          border-color: var(--c-accent);
        }
        .lat-tl__mark strong {
          font-weight: 500;
          font-size: 15px;
          letter-spacing: -0.005em;
          color: var(--c-fg);
        }
        .lat-tl__mark em {
          font-style: normal;
          color: var(--c-fg-muted);
          font-size: 13px;
          line-height: 1.5;
        }
        .lat-tl__axislbl {
          font-size: 12px;
          letter-spacing: 0.1em;
          color: var(--c-fg-muted);
          font-weight: 500;
        }
        .lat-tl__sideline {
          position: absolute;
          font-size: 13px; letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--c-fg-muted);
          font-weight: 500;
          padding-left: 4px;
        }
        .lat-tl__sideline--upper { top: 14px; left: 0; }
        .lat-tl__sideline--lower { bottom: 14px; left: 0; color: var(--c-accent); }

        /* ---- Verdict ----------------------------------------------------- */
        .lat-verdict {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr) auto;
          align-items: start;
          gap: 64px;
          padding: 96px 0 56px;
        }
        .lat-verdict__tag {
          font-size: 13px; letter-spacing: 0.28em;
          text-transform: uppercase; color: var(--c-accent);
          font-weight: 500;
          padding-top: 18px;
        }
        .lat-verdict__stat {
          display: flex; flex-direction: column; gap: 20px;
        }
        .lat-verdict__stat-big {
          font-size: clamp(44px, 4.4vw, 64px);
          letter-spacing: -0.02em;
          color: var(--c-fg);
          line-height: 1.1;
          font-variant-numeric: tabular-nums;
          font-weight: 500;
        }
        .lat-verdict__stat-big span.accent { color: var(--c-accent); }
        .lat-verdict__stat-sub {
          font-size: 16px; color: var(--c-fg-muted);
          line-height: 1.65; max-width: 48ch;
        }

        /* ---- Footer ------------------------------------------------------ */
        .lat-footer {
          border-top: 1px solid var(--c-hairline);
          padding: 36px var(--page-gutter-x);
          display: flex; justify-content: space-between;
          gap: 24px;
          font-size: 12px; letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--c-fg-muted);
          font-weight: 500;
        }

        @media (max-width: 1100px) {
          .lat-stage { grid-template-columns: 1fr; gap: 64px; }
          .lat-stage::before { display: none; }
          .lat-verdict { grid-template-columns: 1fr; gap: 18px; }
          .lat-header { grid-template-columns: 1fr; }
          .lat-header__timer { align-items: flex-start; }
        }
      `}</style>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

const BackgroundGlow = () => <div className="lat-bgglow" aria-hidden />;

const Nav = ({ onReplay }: { readonly onReplay: () => void }) => (
  <nav className="lat-nav" aria-label="Primary">
    <div className="lat-nav__inner">
      <span className="lat-nav__brand">
        <span className="lat-nav__brand-dot" aria-hidden />
        Continuum · Latency study
      </span>
      <button
        type="button"
        className="lat-nav__replay"
        onClick={onReplay}
      >
        Replay ↻
      </button>
    </div>
  </nav>
);

const Header = ({
  elapsedMs,
  totalMs,
  onReplay,
}: {
  readonly elapsedMs: number;
  readonly totalMs: number;
  readonly onReplay: () => void;
}) => {
  const remaining = Math.max(0, totalMs - elapsedMs);
  return (
    <header className="lat-header">
      <div>
        <span className="lat-header__eyebrow">Research · Perceived latency</span>
        <h1>Perceived latency is not wall-clock latency.</h1>
        <p className="lat-header__lede">
          The two watches below load inside the same 3.2-second Doherty envelope.
          The last byte arrives at the same millisecond on both sides. What differs
          is when the user&apos;s eye has something meaningful to look at. On the
          left: nothing for 3.2 seconds, then the watch appears. On the right: a
          scaffold by 80 ms, the dial in full PBR by 1.1 seconds.
        </p>
      </div>
      <div className="lat-header__timer">
        <div>
          <div className="lat-header__t">
            {(elapsedMs / 1000).toFixed(2)}s
          </div>
          <div className="lat-header__tunit">
            Elapsed · {(remaining / 1000).toFixed(2)}s remaining
          </div>
        </div>
        <button
          type="button"
          className="lat-header__replay"
          onClick={onReplay}
        >
          Replay both →
        </button>
      </div>
    </header>
  );
};

const FloatingHero = ({
  label,
  sublabel,
  side,
  firstSubjectAtMs,
  accent,
  extra,
  children,
}: {
  readonly label: string;
  readonly sublabel: string;
  readonly side: 'left' | 'right';
  readonly firstSubjectAtMs: number;
  readonly accent?: boolean;
  readonly extra?: React.ReactNode;
  readonly children: React.ReactNode;
}) => (
  <div
    className={`lat-float ${accent ? 'lat-float--accent' : 'lat-float--no-accent'}`}
    data-side={side}
  >
    <div className="lat-float__viewport">{children}</div>
    {extra}
    <div className="lat-float__label">
      <span className="lat-float__tag">
        {accent ? 'With · Continuum' : 'Without · Baseline'}
      </span>
      <span className="lat-float__headline">{label}</span>
      <span className="lat-float__sub">{sublabel}</span>
      <span className="lat-float__firstpx">
        First subject ready · {firstSubjectAtMs} ms
      </span>
    </div>
  </div>
);

const TimelineStrip = ({
  totalMs,
  percent,
  without,
  withContinuum,
}: {
  readonly totalMs: number;
  readonly percent: number;
  readonly without: readonly TimelineMark[];
  readonly withContinuum: readonly TimelineMark[];
}) => {
  const leftOf = (ms: number) => `${Math.min(100, (ms / totalMs) * 100)}%`;

  return (
    <section className="lat-tl" aria-label="Perceived-latency timeline">
      <div className="lat-tl__title">
        Shared 3.2-second Doherty envelope · both strategies, same clock
      </div>
      <div className="lat-tl__track">
        <span className="lat-tl__sideline lat-tl__sideline--upper">Without</span>
        <span className="lat-tl__sideline lat-tl__sideline--lower">With Continuum</span>

        <div className="lat-tl__ruler" />
        <div
          className="lat-tl__playhead"
          style={{ left: `${percent * 100}%` }}
          aria-hidden
        />

        <div className="lat-tl__lane lat-tl__lane--upper">
          {without.map((m) => (
            <div
              key={m.label}
              className="lat-tl__mark lat-tl__mark--upper"
              style={{ left: leftOf(m.atMs) }}
            >
              <strong>{m.label}</strong>
              <em>{m.detail}</em>
              <span className="dot" />
              <span className="lat-tl__axislbl">{m.atMs} ms</span>
            </div>
          ))}
        </div>

        <div className="lat-tl__lane lat-tl__lane--lower">
          {withContinuum.map((m) => (
            <div
              key={m.label}
              className="lat-tl__mark lat-tl__mark--lower lat-tl__mark--accent"
              style={{ left: leftOf(m.atMs) }}
            >
              <span className="lat-tl__axislbl">{m.atMs} ms</span>
              <span className="dot" />
              <strong>{m.label}</strong>
              <em>{m.detail}</em>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

const VerdictStrip = ({
  firstSubjectWithout,
  firstSubjectWith,
}: {
  readonly firstSubjectWithout: number;
  readonly firstSubjectWith: number;
}) => {
  const ratio = firstSubjectWithout / firstSubjectWith;
  return (
    <section className="lat-verdict" aria-label="Verdict">
      <span className="lat-verdict__tag">Verdict</span>
      <div className="lat-verdict__stat">
        <div className="lat-verdict__stat-big">
          <span className="accent">{ratio.toFixed(1)}×</span> earlier subject ready
        </div>
        <div className="lat-verdict__stat-sub">
          Same payload, same bandwidth, same final frame. The user perceives the watch
          as &ldquo;there&rdquo; at {firstSubjectWith} ms instead of {firstSubjectWithout} ms.
          The remaining two seconds are spent catching up on the surfaces the user
          isn&apos;t looking at.
        </div>
      </div>
      <div className="lat-verdict__stat" style={{ textAlign: 'right' }}>
        <div className="lat-verdict__stat-big">
          {firstSubjectWithout} → <span className="accent">{firstSubjectWith}</span> ms
        </div>
        <div className="lat-verdict__stat-sub">First subject-ready frame</div>
      </div>
    </section>
  );
};

// ---------------------------------------------------------------------------
// RegionProgressPanel — live graph of per-region hydration. Sits BELOW the
// watch viewport (not overlaid on top), so it reads as a proper data panel
// instead of a floating HUD that shadows the model. Each region gets a
// horizontal progress bar that fills smoothly as its tier climbs; the bar's
// width tracks `(tier+1)/5`, intrinsically animated by CSS transition.
// ---------------------------------------------------------------------------

const RegionProgressPanel = ({
  tiers,
  colorway,
}: {
  readonly tiers: Record<WatchRegion, WatchTier>;
  readonly colorway: keyof typeof WATCH_COLORWAYS;
}) => {
  const palette = WATCH_COLORWAYS[colorway] ?? WATCH_COLORWAYS.gold!;
  const totalTris = approxTrianglesTotalWatch(tiers);
  return (
    <section className="lat-panel" aria-label="Region hydration progress">
      <header className="lat-panel__head">
        <span className="lat-panel__tag">Region progress</span>
        <span className="lat-panel__meta">
          {palette.label} · Semantic
        </span>
      </header>
      <div className="lat-panel__rows">
        {WATCH_REGIONS.map((region) => {
          const tier = tiers[region];
          const weight = WATCH_REGION_WEIGHTS[region];
          const tris = approxTrianglesForWatchRegion(region, tier);
          const pct = ((tier + 1) / WATCH_TIER_COUNT) * 100;
          return (
            <div key={region} className="lat-panel__row">
              <span className="lat-panel__rowLabel">
                {WATCH_REGION_LABEL[region]}
              </span>
              <span className="lat-panel__weight">w {weight.toFixed(1)}</span>
              <div className="lat-panel__bar">
                <div
                  className="lat-panel__barFill"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="lat-panel__tier">{WATCH_TIER_BADGE[tier]}</span>
              <span className="lat-panel__tris">
                {formatWatchTris(tris)}<span>△</span>
              </span>
            </div>
          );
        })}
      </div>
      <footer className="lat-panel__foot">
        <span>Σ total</span>
        <span className="lat-panel__total">
          {formatWatchTris(totalTris)}<span> triangles live</span>
        </span>
      </footer>
    </section>
  );
};

const Footer = () => (
  <footer className="lat-footer">
    <span>Continuum · Perceived-latency study · {new Date().getFullYear()}</span>
    <span>Doherty envelope · 3.2 s shared · Free-floating stage</span>
  </footer>
);

export default LatencyComparePage;
