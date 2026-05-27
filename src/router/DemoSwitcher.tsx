/**
 * <DemoSwitcher /> — fixed pill bar at the top of every page.
 *
 * Three segments:
 *   - Continuum     → ingest + hydration engine showcase
 *   - Galaxy Z Fold → product page (uniform LOD hydration)
 *   - Compare       → semantic vs uniform progressive rendering research
 *
 * The active one gets an amber underline + cream label; the others stay
 * muted. Rendered ABOVE each page's own <Nav /> so the user can always
 * jump between surfaces without scrolling. Height ~36px.
 */

import { useHashRoute, navigate } from './useHashRoute';
import type { RouteKey } from './useHashRoute';

interface Seg {
  readonly key: RouteKey;
  readonly label: string;
  readonly hint: string;
}

const SEGMENTS: readonly Seg[] = [
  { key: 'demo',    label: 'Continuum',     hint: 'Hydration engine · variable-tier' },
  { key: 'phone',   label: 'GALAXY Z Fold', hint: 'Product page · uniform LOD' },
  { key: 'compare', label: 'Compare',       hint: 'Uniform vs semantic LOD · research' },
  { key: 'latency', label: 'Latency',       hint: 'Perceived-latency study · before vs after' },
  { key: 'watch',   label: 'Atelier',       hint: 'Photorealistic dress watch · procedural' },
  { key: 'auto',    label: 'Auto',          hint: 'Upload any .glb · ingest-driven blueprint' },
  { key: 'ab',      label: 'A/B Loading',   hint: 'Uniform vs semantic progressive · McLaren P1' },
  { key: 'proxy',   label: 'Proxy Tier',    hint: 'Position-only first paint · spaceship' },
  { key: 'scenes',    label: 'Scenes',    hint: 'Live wireframe → color cloud → PBR · McLaren' },
  { key: 'cloud',     label: 'Cloud',     hint: 'Surface-sampled splat moment · skull' },
  { key: 'benchmark', label: 'Benchmark', hint: 'Real cold-cache load timings · all assets' },
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
                className={`demo-switcher__tab ${isActive ? 'is-active' : ''}`}
                onClick={() => navigate(seg.key)}
              >
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
