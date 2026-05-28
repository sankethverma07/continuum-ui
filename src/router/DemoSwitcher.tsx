/**
 * <DemoSwitcher /> — fixed pill bar at the top of every page.
 *
 * Ten chronological chapters that walk a reader from "why does 3D feel
 * broken on the web" → "here are two patterns that don't work" → "here's
 * what game engines do" → "here are the three fixes that compose into
 * Continuum" → "here is the perfected product page." The story is
 * deliberate; the chapter numbers are visible in the tab labels so the
 * narrative arc is legible at a glance.
 *
 * Three secondary routes (Engine landing, Auto sandbox, Benchmark) live
 * past the chapter arc and remain reachable via deep link.
 */

import { useHashRoute, navigate } from './useHashRoute';
import type { RouteKey } from './useHashRoute';

interface Seg {
  readonly key: RouteKey;
  readonly chapter?: string;
  readonly label: string;
  readonly hint: string;
}

const SEGMENTS: readonly Seg[] = [
  // ── The chapter arc ──────────────────────────────────────────────
  { key: 'brief',   chapter: '00', label: 'The Brief',         hint: 'PM view · research, sprint, A/B, decisions' },
  { key: 'problem', chapter: '01', label: 'The Problem',       hint: 'Why web 3D loads badly · framing' },
  { key: 'latency', chapter: '02', label: 'Bad Route · Spinner', hint: 'Naive load · the default failure' },
  { key: 'ab',      chapter: '03', label: 'A/B · Uniform vs Semantic', hint: 'Two Continuum variants · the comparison test' },
  { key: 'insight', chapter: '04', label: 'The Insight',       hint: 'Texture streaming, borrowed from games' },
  { key: 'proxy',   chapter: '05', label: 'Fix · Proxy Paint', hint: 'Position-only first paint · sub-100ms' },
  { key: 'watch',   chapter: '06', label: 'Fix · Tier Build',  hint: 'Triangles densify additively · no swap' },
  // NOTE: Chapter 07 ("Fix · Material Fade") was the SemanticComparePage
  // (Galaxy Z Fold), but it duplicated Ch 03's Uniform-vs-Semantic story
  // on a different asset. Removed from the chapter arc to keep the spine
  // legible. SemanticComparePage stays reachable via secondary route 'Semantic LOD'.
  { key: 'cloud',   chapter: '07', label: 'R&D · ColorCloud',  hint: 'Splat experiment · the honest side path' },
  { key: 'scenes',  chapter: '08', label: 'The Choreography',  hint: 'All four phases · McLaren P1' },
  { key: 'phone',   chapter: '09', label: 'The Product Page',  hint: 'GALAXY Z Fold · the perfected end-state' },
  // ── Secondary routes (out of arc) ────────────────────────────────
  { key: 'compare', label: 'Semantic LOD', hint: 'Galaxy Z Fold · semantic vs uniform LOD' },
  { key: 'demo',    label: 'Engine',      hint: 'Ingest + hydration showcase · landing' },
  { key: 'auto',    label: 'Sandbox',     hint: 'Drop any .glb and watch it reveal' },
  { key: 'benchmark', label: 'Benchmark', hint: 'Cold-cache load timings · methodology caveat' },
] as const;

export const DemoSwitcher = () => {
  const active = useHashRoute();

  return (
    <div className="demo-switcher" role="tablist" aria-label="Continuum demo switcher">
      <div className="demo-switcher__inner">
        <span className="demo-switcher__brand">
          <span className="demo-switcher__dot" aria-hidden />
          CONTINUUM · v2.0
        </span>
        <nav className="demo-switcher__tabs">
          {SEGMENTS.map((seg) => {
            const isActive = seg.key === active;
            return (
              <button
                key={seg.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`demo-switcher__tab ${isActive ? 'is-active' : ''} ${seg.chapter ? 'has-chapter' : 'is-secondary'}`}
                onClick={() => navigate(seg.key)}
              >
                {seg.chapter ? (
                  <span className="demo-switcher__chapter">CH {seg.chapter}</span>
                ) : null}
                <span className="demo-switcher__label">{seg.label}</span>
                <span className="demo-switcher__hint">{seg.hint}</span>
              </button>
            );
          })}
        </nav>
        <span className="demo-switcher__meta">
          Engine + showcase · built on R3F
        </span>
      </div>
      <style>{`
        .demo-switcher {
          position: sticky;
          top: 0;
          z-index: 60;
          /* Slightly tinted dark wash so the bar sits naturally on top of
             whichever pastel page background is active.                   */
          background: rgba(10, 7, 3, 0.82);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          border-bottom: 1px solid var(--c-hairline);
          /* PP Neue Montreal universally — the same face body text uses,
             applied here so the HUD reads as part of the site, not an
             engineering overlay. The old mono-everywhere read as code. */
          font-family: var(--font-sans);
        }
        .demo-switcher__inner {
          max-width: 1440px;
          margin: 0 auto;
          padding: 10px var(--page-gutter-x);
          display: grid;
          grid-template-columns: auto 1fr auto;
          align-items: center;
          gap: 24px;
        }
        .demo-switcher__brand {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          font-size: 10px;
          letter-spacing: 2.4px;
          color: var(--c-fg-muted);
          text-transform: uppercase;
        }
        .demo-switcher__dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: var(--c-accent);
          box-shadow: 0 0 10px var(--c-accent);
        }
        .demo-switcher__tabs {
          display: flex; justify-content: center; gap: 6px;
        }
        .demo-switcher__tab {
          background: transparent;
          border: 1px solid transparent;
          color: var(--c-fg-muted);
          padding: 6px 14px;
          display: inline-flex;
          align-items: baseline;
          gap: 10px;
          cursor: pointer;
          transition: color 160ms ease, border-color 160ms ease, background 160ms ease;
          border-radius: 2px;
        }
        .demo-switcher__tab:hover {
          color: var(--c-fg);
          border-color: var(--c-hairline);
        }
        .demo-switcher__tab.is-active {
          color: var(--c-fg);
          background: var(--c-accent-dim);
          border-color: var(--c-accent);
          box-shadow: inset 0 -2px 0 var(--c-accent);
        }
        .demo-switcher__chapter {
          font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
          font-size: 9px;
          letter-spacing: 1.4px;
          color: var(--c-accent);
          padding: 2px 6px;
          border: 1px solid var(--c-accent);
          border-radius: 2px;
          opacity: 0.7;
        }
        .demo-switcher__tab.is-active .demo-switcher__chapter {
          opacity: 1;
          background: var(--c-accent);
          color: var(--c-bg, #0a0703);
        }
        .demo-switcher__tab.is-secondary {
          opacity: 0.55;
          margin-left: 16px;
          padding-left: 16px;
          border-left: 1px solid var(--c-hairline);
          border-radius: 0;
        }
        .demo-switcher__tab.is-secondary:hover { opacity: 0.9; }
        .demo-switcher__label {
          font-family: var(--font-sans);
          font-size: 12px;
          letter-spacing: 0.4px;
          text-transform: none;
          font-weight: 500;
        }
        .demo-switcher__tab.is-active .demo-switcher__label { color: var(--c-fg); }
        .demo-switcher__hint {
          font-size: 9px;
          letter-spacing: 1.4px;
          text-transform: uppercase;
          color: var(--c-fg-muted);
          opacity: 0.8;
        }
        .demo-switcher__meta {
          font-size: 10px;
          letter-spacing: 1.8px;
          text-transform: uppercase;
          color: var(--c-fg-muted);
          justify-self: end;
        }
        @media (max-width: 880px) {
          .demo-switcher__inner { grid-template-columns: 1fr; gap: 10px; }
          .demo-switcher__brand, .demo-switcher__meta { justify-self: center; }
          .demo-switcher__hint { display: none; }
        }
      `}</style>
    </div>
  );
};
