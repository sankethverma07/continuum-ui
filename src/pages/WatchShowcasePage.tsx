/**
 * Chapter 06 · Fix · Tier Build
 * -----------------------------------------------------------------
 * Demonstrates the second fix in the Continuum choreography:
 * triangles densify additively on the same mesh — no swap from a
 * low-poly placeholder to a high-poly final asset.
 *
 * We use a real-world BMW glb as the hero. The same engine that
 * appears on Chapter 09 (the full choreography) is isolated here so
 * the viewer can watch the geometry build step in particular —
 * proxy → wireframe densification → PBR fade.
 *
 * The previous version of this page used a procedurally-generated
 * watch built from primitives, which read as unfinished. Replaced
 * with a real PBR asset so the demo lands on its actual technical
 * claim: "we can stream detail into a real-world hero asset without
 * a placeholder swap."
 */

import { AutoProgressiveHero } from '../continuum/components/AutoProgressiveHero';

export const WatchShowcasePage = () => {
  return (
    <main className="ch06">
      <header className="ch06__head">
        <div className="ch06__eyebrow">Chapter 06 · Fix · Tier Build</div>
        <h1 className="ch06__title">
          Triangles densify additively. No swap ever happens.
        </h1>
        <p className="ch06__lede">
          The asset on the right starts as a position-only proxy
          (sub-100 ms outline), then triangles get drawn in tiers via
          <code> setDrawRange </code> on the <em>same mesh</em>. A
          conventional progressive loader would ship a low-poly
          placeholder and swap it for the high-poly version at the
          end — that swap moment is the worst frame in the load. We
          deliberately made that moment structurally impossible.
        </p>
      </header>

      <section className="ch06__stage">
        <AutoProgressiveHero
          src="/BMW.glb"
          proxy={true}
          autoRotate={0.35}
          backgroundHex="#0A0E16"
        />
      </section>

      <footer className="ch06__notes">
        <div className="ch06__note">
          <div className="ch06__note-tag">Decision</div>
          <p>
            Additive reveal over swap. The same <code>BufferGeometry</code> is
            used from the first frame to the last — only the visible triangle
            count changes. That choice is the entire reason the build feels
            cinematic rather than glitchy.
          </p>
        </div>
        <div className="ch06__note">
          <div className="ch06__note-tag">Trade-off</div>
          <p>
            We pay a small render cost per tier transition (the new triangles
            recompute lighting on their first visible frame). On any modern
            GPU this is invisible — under 1 ms at the densification points.
            On older mobile hardware it shows up as a single dropped frame.
          </p>
        </div>
        <div className="ch06__note">
          <div className="ch06__note-tag">What this is not</div>
          <p>
            This is not Nanite. Nanite streams clusters from a virtualised
            mesh; we stream <em>triangle ranges from a single mesh</em>. The
            outcomes overlap (progressive geometry) but the systems are
            architecturally different. Same insight, web-scale.
          </p>
        </div>
      </footer>

      <nav className="ch06__next">
        <a className="ch06__next-card" href="#/compare">
          <span className="ch06__next-tag">Next · Chapter 07</span>
          <span className="ch06__next-title">Fix · Material Fade</span>
          <span className="ch06__next-body">PBR materials crossfade in over the wireframe in lockstep.</span>
        </a>
        <a className="ch06__next-card" href="#/scenes">
          <span className="ch06__next-tag">Jump ahead · Chapter 08</span>
          <span className="ch06__next-title">The Choreography</span>
          <span className="ch06__next-body">All three fixes composed on the McLaren P1.</span>
        </a>
      </nav>

      <style>{`
        .ch06 {
          max-width: 1280px;
          margin: 0 auto;
          padding: 56px var(--page-gutter-x, 32px) 96px;
          color: var(--c-fg, #f4ecd8);
          font-family: var(--font-sans);
          display: flex;
          flex-direction: column;
          gap: 36px;
        }
        .ch06__head { display: flex; flex-direction: column; gap: 16px; }
        .ch06__eyebrow {
          font-size: 11px; letter-spacing: 2.4px; text-transform: uppercase;
          color: var(--c-accent, #e8a857);
        }
        .ch06__title {
          font-size: clamp(28px, 3.6vw, 44px); line-height: 1.1;
          font-weight: 500; letter-spacing: -0.01em;
          margin: 0; max-width: 24ch;
        }
        .ch06__lede {
          font-size: 16px; line-height: 1.6;
          color: var(--c-fg-muted, rgba(244,236,216,0.72));
          max-width: 68ch; margin: 0;
        }
        .ch06__lede code {
          font-family: var(--font-mono, ui-monospace, monospace);
          font-size: 13px;
          padding: 1px 6px; border-radius: 2px;
          background: rgba(232,168,87,0.1);
          color: var(--c-accent, #e8a857);
        }
        .ch06__stage {
          position: relative;
          width: 100%;
          height: clamp(440px, 64vh, 720px);
          background: transparent;
        }
        .ch06__notes {
          display: grid; grid-template-columns: repeat(3, 1fr);
          gap: 36px;
        }
        .ch06__note {
          padding: 0;
          border-top: 1px solid var(--c-hairline, rgba(244,236,216,0.18));
          padding-top: 18px;
        }
        .ch06__note-tag {
          font-size: 10px; letter-spacing: 1.6px; text-transform: uppercase;
          color: var(--c-accent, #e8a857); margin-bottom: 10px;
        }
        .ch06__note p {
          margin: 0; font-size: 12px; line-height: 1.55;
          color: var(--c-fg-muted, rgba(244,236,216,0.7));
        }
        .ch06__note code {
          font-family: var(--font-mono, monospace);
          font-size: 11px;
          color: var(--c-fg, #f4ecd8);
        }
        .ch06__note em { color: var(--c-fg, #f4ecd8); font-style: italic; }
        .ch06__next {
          display: grid; grid-template-columns: 1fr 1fr; gap: 14px;
          padding-top: 24px;
          border-top: 1px solid var(--c-hairline, rgba(244,236,216,0.12));
        }
        .ch06__next-card {
          display: flex; flex-direction: column; gap: 8px;
          padding: 0;
          text-decoration: none; color: inherit;
          transition: opacity 160ms ease;
        }
        .ch06__next-card:hover { opacity: 0.75; }
        .ch06__next-tag {
          font-size: 10px; letter-spacing: 1.8px; text-transform: uppercase;
          color: var(--c-accent, #e8a857);
        }
        .ch06__next-title { font-size: 17px; font-weight: 500; }
        .ch06__next-body {
          font-size: 13px; line-height: 1.4;
          color: var(--c-fg-muted, rgba(244,236,216,0.6));
        }
        @media (max-width: 960px) {
          .ch06__notes { grid-template-columns: 1fr; }
          .ch06__next { grid-template-columns: 1fr; }
        }
      `}</style>
    </main>
  );
};

export default WatchShowcasePage;
