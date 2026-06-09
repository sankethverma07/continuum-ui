/**
 * Chapter 06 · Fix · Tier Build
 * -----------------------------------------------------------------
 * Live demonstration of the canonical choreography running through
 * the new ChoreographedHero runtime. Same five-stage reveal that
 * every Continuum asset plays:
 *
 *   0.0 – 0.4 s  · proxy wireframe silhouette
 *   0.4 – 1.5 s  · ~10 % surface coverage (organic scatter)
 *   1.5 – 2.5 s  · ~50 % coverage
 *   2.5 – 3.5 s  · 100 % matte form
 *   3.5 – 4.2 s  · matte → full PBR crossfade
 *
 * Hit Replay to run it cold. The reveal is deterministic — the same
 * scatter pattern emerges every time because the runtime seeds the
 * per-vertex revealTime with a Mulberry32 PRNG.
 */

import { useState } from 'react';
import { ChoreographedHero } from '../continuum/choreography/ChoreographedHero';

export const WatchShowcasePage = () => {
  const [runToken, setRunToken] = useState(0);
  const replay = () => setRunToken((k) => k + 1);

  return (
    <main className="ch06">
      <header className="ch06__head">
        <div className="ch06__head-row">
          <div>
            <div className="ch06__eyebrow">Chapter 06 · Fix · Tier Build</div>
            <h1 className="ch06__title">
              Triangles emerge on the surface. Then materials crossfade in.
            </h1>
          </div>
          <button type="button" className="ch06__replay" onClick={replay}>
            Replay ↻
          </button>
        </div>
        <p className="ch06__lede">
          The canonical reveal — one timeline, one shader patch,
          deterministic per-vertex scatter. The asset below is loaded
          with no pre-processing; the runtime computes the
          per-vertex <code>revealTime</code> attribute on the fly and
          patches every material with the surface-discard shader.
          Hit Replay to watch it cold.
        </p>
      </header>

      <section className="ch06__stage">
        <ChoreographedHero
          src="/BMW.glb"
          backgroundHex="#0A0E16"
          edgeHex="#e8a857"
          autoRotate={0.35}
          runToken={runToken}
        />
      </section>

      <footer className="ch06__notes">
        <div className="ch06__note">
          <div className="ch06__note-tag">Stage 1–3 · Surface</div>
          <p>
            A <code>revealTime</code> float per vertex (0–1, seeded
            Mulberry32 scatter) gets compared against an animated
            uniform. Fragments whose revealTime exceeds the uniform
            are discarded — so the surface emerges progressively
            instead of popping in.
          </p>
        </div>
        <div className="ch06__note">
          <div className="ch06__note-tag">Stage 4 · Matte → PBR</div>
          <p>
            Once the surface hits 100 %, a second uniform crossfades
            between a neutral lit matte and the full PBR result.
            That's why you never see the "white blob" frame between
            wireframe and final.
          </p>
        </div>
        <div className="ch06__note">
          <div className="ch06__note-tag">Edge glow</div>
          <p>
            Fragments within ~4 % of the reveal threshold pick up the
            accent colour briefly. The emerging triangles glow — a
            cheap effect that reads as deliberate design, not a bug.
          </p>
        </div>
      </footer>

      <nav className="ch06__next">
        <a className="ch06__next-card" href="#/scenes">
          <span className="ch06__next-tag">Next · Chapter 08</span>
          <span className="ch06__next-title">The Choreography</span>
          <span className="ch06__next-body">All four phases composed on the McLaren P1.</span>
        </a>
        <a className="ch06__next-card" href="#/phone">
          <span className="ch06__next-tag">Jump to · Chapter 09</span>
          <span className="ch06__next-title">The Product Page</span>
          <span className="ch06__next-body">GALAXY Z Fold · the canonical real-world deployment.</span>
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
        .ch06__head { display: flex; flex-direction: column; gap: 18px; }
        .ch06__head-row {
          display: flex; justify-content: space-between; align-items: flex-start;
          gap: 24px; flex-wrap: wrap;
        }
        .ch06__eyebrow {
          font-size: 11px; letter-spacing: 2.4px; text-transform: uppercase;
          color: var(--c-accent, #e8a857); margin-bottom: 10px;
        }
        .ch06__title {
          font-size: clamp(28px, 3.6vw, 44px); line-height: 1.1;
          font-weight: 500; letter-spacing: -0.01em;
          margin: 0; max-width: 28ch;
        }
        .ch06__lede {
          font-size: 16px; line-height: 1.6;
          color: var(--c-fg-muted, rgba(244,236,216,0.72));
          max-width: 70ch; margin: 0;
        }
        .ch06__lede code, .ch06__note code {
          font-family: var(--font-mono, ui-monospace, monospace);
          font-size: 13px;
          padding: 1px 6px; border-radius: 2px;
          background: rgba(232,168,87,0.1);
          color: var(--c-accent, #e8a857);
        }
        .ch06__replay {
          background: transparent;
          color: var(--c-accent, #e8a857);
          border: 1px solid var(--c-accent, #e8a857);
          padding: 10px 22px;
          border-radius: 999px;
          font-family: var(--font-mono, monospace);
          font-size: 12px;
          letter-spacing: 0.12em;
          cursor: pointer;
          transition: background 160ms ease;
          align-self: center;
        }
        .ch06__replay:hover { background: rgba(232,168,87,0.12); }
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
          margin: 0; font-size: 13px; line-height: 1.55;
          color: var(--c-fg-muted, rgba(244,236,216,0.7));
        }
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
