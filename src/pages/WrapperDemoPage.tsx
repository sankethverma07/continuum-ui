/**
 * WrapperDemoPage — proves out the <Continuum> plug-and-play wrapper.
 *
 * This page contains nothing that knows about the skeleton system. It's
 * just a normal hero + 3-card grid + paragraph + button. Wrapping it in
 * <Continuum> is the entire integration: the wrapper detects the
 * elements, paints kind-appropriate skeleton overlays on top, and fades
 * them out as the real content fades in.
 *
 * That's the contract: "drop your existing JSX inside <Continuum> and
 * the loading choreography happens for free."
 */

import { useState } from 'react';
import { Continuum } from '@continuum';

export const WrapperDemoPage = () => {
  const [replayKey, setReplayKey] = useState(0);

  return (
    <div className="wrap-demo">
      <header className="wrap-demo__header">
        <span className="wrap-demo__eyebrow">
          <span className="wrap-demo__dot" aria-hidden />
          PLUG-AND-PLAY · &lt;CONTINUUM /&gt;
        </span>
        <h2 className="wrap-demo__h2">
          The wrapper detects elements and paints their skeletons. Zero
          per-element wiring.
        </h2>
        <button
          type="button"
          className="wrap-demo__replay"
          onClick={() => setReplayKey((k) => k + 1)}
        >
          ↻ Replay reveal
        </button>
      </header>

      {/* Everything inside <Continuum> is normal JSX. The wrapper does
          all the skeleton orchestration on top. */}
      <Continuum
        key={replayKey}
        replayKey={replayKey}
        schedule={{
          wireframeHoldMs: 1200,
          fillStartMs: 1200,
          fillEndMs: 2600,
        }}
      >
        <section className="wrap-demo__hero">
          <h1>Built for builders who want it to just work.</h1>
          <p>
            Wrap any block of JSX in &lt;Continuum&gt;. Headings render as
            hollow outlines, paragraphs as dimmed bars, cards as wireframe
            frames with traveling pulses — all crossfading into your real
            UI as the page hydrates.
          </p>
          <button className="btn">Get started</button>
        </section>

        <section className="wrap-demo__grid">
          <article className="card">
            <h3>Auto-detection</h3>
            <p>
              The wrapper walks the DOM after mount, classifies each leaf
              element, and renders the right skeleton archetype on top.
            </p>
          </article>
          <article className="card">
            <h3>Staged reveal</h3>
            <p>
              Wireframe phase first, then a colour/glass fill mirroring the
              3D side's blueprint-to-material progression.
            </p>
          </article>
          <article className="card">
            <h3>Zero wiring</h3>
            <p>
              No per-element delays, no skeleton props, no PageConductor
              boilerplate. Drop it in and ship.
            </p>
          </article>
        </section>
      </Continuum>

      <PageStyles />
    </div>
  );
};

const PageStyles = () => (
  <style>{`
    .wrap-demo {
      --c-bg:        #12100C;
      --c-fg:        #EEE3CD;
      --c-fg-muted:  #A99A76;
      --c-accent:    #D7A86E;
      --c-hairline:  rgba(215, 168, 110, 0.22);
      min-height: 100vh;
      background:
        radial-gradient(ellipse at 50% -20%, rgba(215, 168, 110, 0.08) 0%, transparent 60%),
        var(--c-bg);
      color: var(--c-fg);
      font-family: var(--font-sans);
      padding: 56px clamp(24px, 5vw, 80px) 96px;
    }
    .wrap-demo__header {
      max-width: 1200px;
      margin: 0 auto 56px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .wrap-demo__eyebrow {
      display: inline-flex; align-items: center; gap: 8px;
      font-size: 10px; letter-spacing: 2.4px; text-transform: uppercase;
      color: var(--c-fg-muted);
    }
    .wrap-demo__dot {
      width: 6px; height: 6px; border-radius: 50%;
      background: var(--c-accent); box-shadow: 0 0 10px var(--c-accent);
    }
    .wrap-demo__h2 {
      margin: 0;
      font-size: clamp(20px, 2vw, 26px);
      font-weight: 500; letter-spacing: -0.01em;
      color: var(--c-fg-muted);
      max-width: 56ch;
    }
    .wrap-demo__replay {
      align-self: flex-start;
      background: rgba(215, 168, 110, 0.12);
      border: 1px solid var(--c-accent);
      color: var(--c-fg);
      padding: 8px 14px;
      font-family: inherit;
      font-size: 12px;
      letter-spacing: 0.4px;
      cursor: pointer;
      border-radius: 4px;
    }

    .wrap-demo__hero {
      max-width: 1200px;
      margin: 0 auto 48px;
      display: flex; flex-direction: column;
      gap: 20px;
    }
    .wrap-demo__hero h1 {
      margin: 0;
      font-size: clamp(40px, 5vw, 72px);
      line-height: 1.05; letter-spacing: -0.03em; font-weight: 500;
      max-width: 18ch;
    }
    .wrap-demo__hero p {
      margin: 0;
      max-width: 56ch;
      font-size: clamp(15px, 1.2vw, 17px);
      line-height: 1.55;
      color: var(--c-fg-muted);
    }
    .btn {
      align-self: flex-start;
      background: var(--c-accent);
      color: #1A1611;
      border: none;
      padding: 12px 22px;
      font-family: inherit;
      font-weight: 600;
      font-size: 13px;
      letter-spacing: 0.3px;
      cursor: pointer;
      border-radius: 4px;
    }

    .wrap-demo__grid {
      max-width: 1200px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 20px;
    }
    .card {
      background: rgba(238, 227, 205, 0.04);
      border: 1px solid var(--c-hairline);
      border-radius: 14px;
      padding: 22px 24px;
      backdrop-filter: blur(12px) saturate(120%);
      -webkit-backdrop-filter: blur(12px) saturate(120%);
      display: flex; flex-direction: column; gap: 10px;
    }
    .card h3 {
      margin: 0;
      font-size: 18px;
      font-weight: 500;
      color: var(--c-fg);
    }
    .card p {
      margin: 0;
      font-size: 14px;
      line-height: 1.5;
      color: var(--c-fg-muted);
    }
  `}</style>
);

export default WrapperDemoPage;
