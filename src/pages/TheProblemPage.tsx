/**
 * Chapter 1 · The Problem
 * -----------------------------------------------------------------
 * Opens the case. Frames why 3D loading on the web feels broken, and
 * sets up the two failure modes (Chapters 2 & 3) before we get to the
 * insight (Chapter 4).
 *
 * Deliberately text-first — no 3D canvas here. Each subsequent
 * chapter has its own demo; this one's job is to make the reader
 * agree there's a real problem worth solving before the demos start.
 */

export const TheProblemPage = () => {
  return (
    <main className="chap chap-problem">
      <header className="chap__head">
        <div className="chap__eyebrow">Chapter 01 · The Problem</div>
        <h1 className="chap__title">
          Beautiful web 3D is the worst-feeling thing on most product pages.
        </h1>
        <p className="chap__lede">
          A modern hero asset — a car, a watch, a sneaker, a phone — is
          tens of megabytes once the textures and meshes are real. While
          the file downloads, the visitor stares at a spinner or an empty
          panel. The most expensive asset on the page becomes its worst
          moment of UX.
        </p>
      </header>

      <section className="chap__body">
        <div className="chap__col">
          <h2 className="chap__h2">The 400ms cliff</h2>
          <p>
            There is a well-studied threshold in human-computer interaction
            called the <em>Doherty threshold</em>. Past roughly 400ms of
            unresponsive delay, the user's perception of "instant" collapses
            and attention starts to leak away. Google's own mobile research
            shows bounce probability climbs <strong>32% past 3 seconds</strong>
            of load, and over 100% past 6 seconds.
          </p>
          <p>
            A naive 3D load on a fresh visit easily blows past both of these
            numbers. The result: the marketing team paid a 3D studio for a
            beautiful asset, and the first thing every visitor sees is
            nothing at all.
          </p>
        </div>

        <div className="chap__col">
          <h2 className="chap__h2">The product question</h2>
          <p>
            The total wall-clock time to download the file is a network
            constant. It will not get smaller without sacrificing quality.
            The question isn't <em>"how do we make it faster?"</em> — it's
            <strong> "what does the user look at during those seconds?"</strong>
          </p>
          <p>
            The next two chapters walk through the two patterns the industry
            has tried, why each one fails, and what they have in common.
            Chapter 4 borrows the answer from a place most web developers
            have never looked: the texture-streaming systems inside modern
            game engines.
          </p>
        </div>
      </section>

      <nav className="chap__next">
        <a className="chap__next-card" href="#/latency">
          <span className="chap__next-tag">Next · Chapter 02</span>
          <span className="chap__next-title">Bad Route #1 · Spinner Death</span>
          <span className="chap__next-body">The naive load. What every R3F starter ships by default.</span>
        </a>
        <a className="chap__next-card" href="#/ab">
          <span className="chap__next-tag">Then · Chapter 03</span>
          <span className="chap__next-title">Bad Route #2 · The Swap</span>
          <span className="chap__next-body">Low-poly placeholder, jarring pop to high-poly.</span>
        </a>
      </nav>

      <style>{`
        .chap {
          max-width: 1080px;
          margin: 0 auto;
          padding: 64px var(--page-gutter-x, 32px) 96px;
          color: var(--c-fg, #f4ecd8);
          font-family: var(--font-sans);
        }
        .chap__head { margin-bottom: 56px; }
        .chap__eyebrow {
          font-size: 11px;
          letter-spacing: 2.4px;
          text-transform: uppercase;
          color: var(--c-accent, #e8a857);
          margin-bottom: 18px;
        }
        .chap__title {
          font-size: clamp(32px, 4.4vw, 56px);
          line-height: 1.08;
          font-weight: 500;
          letter-spacing: -0.01em;
          margin: 0 0 24px;
          max-width: 22ch;
        }
        .chap__lede {
          font-size: 18px;
          line-height: 1.55;
          color: var(--c-fg-muted, rgba(244,236,216,0.72));
          max-width: 62ch;
          margin: 0;
        }
        .chap__body {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 56px;
          padding-top: 40px;
          border-top: 1px solid var(--c-hairline, rgba(244,236,216,0.12));
        }
        .chap__h2 {
          font-size: 13px;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: var(--c-accent, #e8a857);
          margin: 0 0 16px;
        }
        .chap__col p {
          font-size: 15px;
          line-height: 1.65;
          color: var(--c-fg-muted, rgba(244,236,216,0.72));
          margin: 0 0 14px;
        }
        .chap__col strong { color: var(--c-fg, #f4ecd8); font-weight: 500; }
        .chap__col em { color: var(--c-fg, #f4ecd8); font-style: italic; }
        .chap__next {
          margin-top: 56px;
          padding-top: 32px;
          border-top: 1px solid var(--c-hairline, rgba(244,236,216,0.12));
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        .chap__next-card {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 20px 22px;
          border: 1px solid var(--c-hairline, rgba(244,236,216,0.12));
          border-radius: 4px;
          text-decoration: none;
          color: inherit;
          transition: border-color 160ms ease, background 160ms ease;
        }
        .chap__next-card:hover {
          border-color: var(--c-accent, #e8a857);
          background: var(--c-accent-dim, rgba(232,168,87,0.06));
        }
        .chap__next-tag {
          font-size: 10px;
          letter-spacing: 1.8px;
          text-transform: uppercase;
          color: var(--c-accent, #e8a857);
        }
        .chap__next-title {
          font-size: 17px;
          font-weight: 500;
          letter-spacing: -0.005em;
        }
        .chap__next-body {
          font-size: 13px;
          color: var(--c-fg-muted, rgba(244,236,216,0.6));
          line-height: 1.4;
        }
        @media (max-width: 760px) {
          .chap__body, .chap__next { grid-template-columns: 1fr; gap: 32px; }
        }
      `}</style>
    </main>
  );
};
