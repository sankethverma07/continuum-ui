/**
 * Chapter 4 · The Insight
 * -----------------------------------------------------------------
 * The keystone chapter. After two failures (Ch 2 & 3), this page
 * explains where the answer actually came from — modern game engines.
 *
 * Three sub-sections:
 *   1. Texture streaming, in plain language (no code, no R3F lingo)
 *   2. The mapping table: game engine concept ↔ Continuum concept
 *   3. The 7-week calendar of how this project actually went down
 *
 * No 3D canvas here either — this is pure narrative bridge. Chapter 5
 * is where the first technical demo (proxy paint) lands.
 */

export const TheInsightPage = () => {
  return (
    <main className="chap chap-insight">
      <header className="chap__head">
        <div className="chap__eyebrow">Chapter 04 · The Insight</div>
        <h1 className="chap__title">
          Games solved this twenty years ago. Web didn't notice.
        </h1>
        <p className="chap__lede">
          The two failure modes in chapters 2 and 3 share one mistake:
          they treat the load as a binary state — either nothing or
          everything. Modern game engines abandoned that model in the
          mid-2000s, and the technique they replaced it with maps almost
          one-to-one onto a hero asset on a product page.
        </p>
      </header>

      {/* ── Section 1 · the analogy ────────────────────────────────── */}
      <section className="chap__section">
        <h2 className="chap__h2">Texture streaming, in plain language</h2>
        <div className="chap__grid-3">
          <div className="chap__card">
            <div className="chap__card-tag">id Tech 5 · 2011</div>
            <div className="chap__card-title">MegaTexture / virtual texturing</div>
            <p>
              Rage shipped with a single ~20 GB texture covering the
              entire game world. It was streamed in tiles, only the bit
              your camera could actually see, sharpened progressively as
              you turned your head. You never saw a "loading texture"
              screen because there wasn't one — the texture was always
              there, just at the resolution the engine could afford that
              frame.
            </p>
          </div>
          <div className="chap__card">
            <div className="chap__card-tag">Halo / Battlefield / most AAA</div>
            <div className="chap__card-title">Mip streaming</div>
            <p>
              Every texture in the game ships with a chain of progressively
              smaller versions (mips). At distance, the engine uses the
              tiny mip — fast, blurry, cheap. As you walk closer, sharper
              mips stream in from disk and crossfade over the blurry one.
              The user never sees a swap; they see a slow sharpening.
              That sharpening reads as cinematic, not as loading.
            </p>
          </div>
          <div className="chap__card">
            <div className="chap__card-tag">Unreal Engine 5 · 2022</div>
            <div className="chap__card-title">Nanite continuous LOD</div>
            <p>
              Nanite swaps geometry detail in and out continuously as the
              camera moves — you never see a model "pop in." Triangles
              are added or culled at the cluster level so the silhouette
              of an object is always correct, even before the surface
              detail arrives. The asset is always recognizable; only the
              precision is in flight.
            </p>
          </div>
        </div>
        <p className="chap__after">
          The shared trick across all three: <strong>ship a low-cost
          version of the asset immediately, then resolve detail in the
          background while the user is already looking at it.</strong>
          Loading stops being a state the user waits through and becomes
          a thing they watch happen. Web 3D has somehow not absorbed this
          idea — almost every &lt;model-viewer&gt;, every Three.js demo,
          every React Three Fiber tutorial still ships the "spinner →
          everything" pattern. Continuum is what happens when you port
          the game pattern over.
        </p>
      </section>

      {/* ── Section 2 · the mapping table ──────────────────────────── */}
      <section className="chap__section">
        <h2 className="chap__h2">How the mapping works</h2>
        <table className="chap__table">
          <thead>
            <tr>
              <th>Game-engine concept</th>
              <th>Continuum equivalent</th>
              <th>What the user sees</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Lowest texture mip</td>
              <td>Position-only proxy (Chapter 5)</td>
              <td>An instant outline of the shape — under 100ms.</td>
            </tr>
            <tr>
              <td>Nanite geometry streaming</td>
              <td>Tier-by-tier triangle build (Chapter 6)</td>
              <td>The wireframe densifies — same mesh, more triangles drawn each tier.</td>
            </tr>
            <tr>
              <td>Texture mip crossfade</td>
              <td>PBR material crossfade (Chapter 7)</td>
              <td>Color and surface detail fade in over the wireframe in lockstep.</td>
            </tr>
            <tr>
              <td>Final asset, full LOD</td>
              <td>Photoreal hero, OrbitControls, contact shadows</td>
              <td>The asset is now real and the user is driving.</td>
            </tr>
          </tbody>
        </table>
        <p className="chap__after">
          None of the rows is a loading screen. Every row is already the
          object, just less finished than the next. That's the deliberate
          choice the next three chapters defend, one fix at a time.
        </p>
      </section>

      {/* ── Section 3 · the 7-week calendar ────────────────────────── */}
      <section className="chap__section">
        <h2 className="chap__h2">How the project actually went</h2>
        <p className="chap__sub">
          A calendar of decisions, not commits. Including the two weeks
          where the work pivoted hard.
        </p>
        <Timeline />
      </section>

      <nav className="chap__next">
        <a className="chap__next-card" href="#/proxy">
          <span className="chap__next-tag">Next · Chapter 05</span>
          <span className="chap__next-title">Fix #1 · Proxy Paint</span>
          <span className="chap__next-body">The first technical demo. A position-only outline that lands in under 100ms.</span>
        </a>
        <a className="chap__next-card" href="#/scenes">
          <span className="chap__next-tag">Jump ahead · Chapter 09</span>
          <span className="chap__next-title">The Choreography</span>
          <span className="chap__next-body">All three fixes composed: McLaren P1 from outline to photoreal.</span>
        </a>
      </nav>

      <style>{`
        .chap {
          max-width: 1180px;
          margin: 0 auto;
          padding: 64px var(--page-gutter-x, 32px) 96px;
          color: var(--c-fg, #f4ecd8);
          font-family: var(--font-sans);
        }
        .chap__head { margin-bottom: 64px; }
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
        .chap__section {
          padding-top: 40px;
          margin-top: 40px;
          border-top: 1px solid var(--c-hairline, rgba(244,236,216,0.12));
        }
        .chap__h2 {
          font-size: 13px;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: var(--c-accent, #e8a857);
          margin: 0 0 24px;
        }
        .chap__sub {
          font-size: 14px;
          line-height: 1.6;
          color: var(--c-fg-muted, rgba(244,236,216,0.6));
          margin: -8px 0 24px;
          max-width: 60ch;
        }
        .chap__grid-3 {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 18px;
          margin-bottom: 24px;
        }
        .chap__card {
          padding: 22px 20px;
          border: 1px solid var(--c-hairline, rgba(244,236,216,0.12));
          border-radius: 4px;
          background: rgba(244,236,216,0.02);
        }
        .chap__card-tag {
          font-size: 9px;
          letter-spacing: 1.6px;
          text-transform: uppercase;
          color: var(--c-accent, #e8a857);
          margin-bottom: 10px;
        }
        .chap__card-title {
          font-size: 16px;
          font-weight: 500;
          margin-bottom: 12px;
          letter-spacing: -0.005em;
        }
        .chap__card p {
          font-size: 13px;
          line-height: 1.55;
          color: var(--c-fg-muted, rgba(244,236,216,0.7));
          margin: 0;
        }
        .chap__after {
          font-size: 15px;
          line-height: 1.65;
          color: var(--c-fg-muted, rgba(244,236,216,0.78));
          max-width: 68ch;
          margin: 8px 0 0;
        }
        .chap__after strong { color: var(--c-fg, #f4ecd8); font-weight: 500; }
        .chap__table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 16px;
        }
        .chap__table th,
        .chap__table td {
          padding: 14px 16px;
          text-align: left;
          border-bottom: 1px solid var(--c-hairline, rgba(244,236,216,0.12));
          font-size: 13px;
          line-height: 1.5;
          vertical-align: top;
        }
        .chap__table th {
          font-size: 10px;
          letter-spacing: 1.6px;
          text-transform: uppercase;
          color: var(--c-accent, #e8a857);
          font-weight: 500;
          border-bottom-color: var(--c-accent, #e8a857);
        }
        .chap__table td:first-child { color: var(--c-fg, #f4ecd8); width: 26%; }
        .chap__table td:nth-child(2) { color: var(--c-fg, #f4ecd8); width: 30%; }
        .chap__table td:last-child  { color: var(--c-fg-muted, rgba(244,236,216,0.7)); }
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
        }
        .chap__next-body {
          font-size: 13px;
          color: var(--c-fg-muted, rgba(244,236,216,0.6));
          line-height: 1.4;
        }
        @media (max-width: 920px) {
          .chap__grid-3 { grid-template-columns: 1fr; }
          .chap__next { grid-template-columns: 1fr; gap: 12px; }
        }
      `}</style>
    </main>
  );
};

/* ── Embedded 7-week calendar ─────────────────────────────────────── */

interface WeekEntry {
  readonly num: string;
  readonly phase: 'research' | 'build' | 'polish' | 'ship';
  readonly phaseLabel: string;
  readonly title: string;
  readonly body: string;
  readonly tag: string;
}

const WEEKS: readonly WeekEntry[] = [
  {
    num: 'WEEK 1',
    phase: 'research',
    phaseLabel: 'Research',
    title: 'The texture streaming insight',
    body: 'Studied how game engines (Nanite, MegaTexture, mip streaming) hand the player detail progressively without ever showing a loading bar. Asked: can a website do this for one hero asset?',
    tag: '→ Chapter 1 · 4',
  },
  {
    num: 'WEEK 2–3',
    phase: 'build',
    phaseLabel: 'Core engine',
    title: 'The four-phase choreography',
    body: 'Position-only proxy paints sub-100ms. Triangles densify tier-by-tier on the same mesh (no swap). PBR materials fade in on top of the wireframe in lockstep with the geometry build.',
    tag: '→ Chapter 5 · 6 · 7',
  },
  {
    num: 'WEEK 4',
    phase: 'build',
    phaseLabel: 'Demo surfaces',
    title: 'Nine isolated proofs',
    body: 'Built one page per technique. Each isolates a single aspect of the reveal so the choice can be defended in interview, not just demonstrated. Two of these became the "bad routes" — the failures I needed to show.',
    tag: '→ Chapter 2 · 3 · 8 · 9',
  },
  {
    num: 'WEEK 5',
    phase: 'polish',
    phaseLabel: 'Bug pass',
    title: 'PBR texture binding bug',
    body: 'Discovered material cloning was silently destroying texture bindings on materials with KHR extensions. Fixed by cloning the scene graph without touching materials, so every instance shares the original texture refs.',
    tag: '→ Stability',
  },
  {
    num: 'WEEK 6',
    phase: 'polish',
    phaseLabel: 'Reality check',
    title: 'Benchmark broke. Cut the numbers.',
    body: 'Built a benchmark page. Realized the methodology was unreliable (asset cache pollution made proxy loads look slower than naive). Decision: drop "X% faster" claims and reframe the entire pitch around perception (Doherty threshold) instead of raw load time.',
    tag: '→ Major pivot',
  },
  {
    num: 'WEEK 7',
    phase: 'ship',
    phaseLabel: 'Ship',
    title: 'MIT · GitHub · Vercel',
    body: 'Licensed MIT for distribution. Three Vercel build attempts to land — first two failed on workspace-dep mismatches. Live at continuum-ui.vercel.app.',
    tag: '→ Chapter 10',
  },
];

const PHASE_COLOR: Record<WeekEntry['phase'], string> = {
  research: '#e8a857',
  build: '#f4ecd8',
  polish: 'rgba(244,236,216,0.55)',
  ship: '#e8a857',
};

const Timeline = () => {
  return (
    <div className="tl">
      <div className="tl__head">
        <div className="tl__eyebrow">Continuum · 7-Week Build Log</div>
        <div className="tl__sub">From "why does 3D feel broken on the web" to a live MIT-licensed component.</div>
      </div>
      <div className="tl__grid">
        {WEEKS.map((w) => (
          <div key={w.num} className="tl__cell">
            <div className="tl__num">{w.num}</div>
            <div className="tl__phase" style={{ color: PHASE_COLOR[w.phase], borderBottomColor: PHASE_COLOR[w.phase] }}>
              {w.phaseLabel}
            </div>
            <div className="tl__title">{w.title}</div>
            <div className="tl__body">{w.body}</div>
            <div className="tl__tag">{w.tag}</div>
          </div>
        ))}
      </div>
      <div className="tl__legend">
        <span><i style={{ background: '#e8a857' }} /> Research / Ship</span>
        <span><i style={{ background: '#f4ecd8' }} /> Build</span>
        <span><i style={{ background: 'rgba(244,236,216,0.55)' }} /> Polish / Decision</span>
      </div>
      <style>{`
        .tl {
          background: rgba(10,7,3,0.55);
          border: 1px solid var(--c-hairline, rgba(244,236,216,0.12));
          padding: 28px;
          border-radius: 4px;
        }
        .tl__head {
          margin-bottom: 24px;
          padding-bottom: 14px;
          border-bottom: 1px solid var(--c-hairline, rgba(244,236,216,0.12));
        }
        .tl__eyebrow {
          font-size: 10px;
          letter-spacing: 2.4px;
          text-transform: uppercase;
          color: var(--c-accent, #e8a857);
          margin-bottom: 8px;
        }
        .tl__sub {
          font-size: 14px;
          line-height: 1.5;
          color: var(--c-fg, #f4ecd8);
        }
        .tl__grid {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          border-left: 1px solid var(--c-hairline, rgba(244,236,216,0.12));
        }
        .tl__cell {
          padding: 14px 12px;
          border-right: 1px solid var(--c-hairline, rgba(244,236,216,0.12));
        }
        .tl__num {
          font-size: 10px;
          letter-spacing: 1.8px;
          color: var(--c-fg-muted, rgba(244,236,216,0.5));
        }
        .tl__phase {
          font-size: 9px;
          letter-spacing: 1.6px;
          text-transform: uppercase;
          margin-top: 4px;
          padding-bottom: 6px;
          border-bottom: 2px solid;
          display: inline-block;
        }
        .tl__title {
          margin-top: 14px;
          font-size: 13px;
          line-height: 1.35;
          font-weight: 500;
        }
        .tl__body {
          margin-top: 8px;
          font-size: 11px;
          line-height: 1.5;
          color: var(--c-fg-muted, rgba(244,236,216,0.55));
        }
        .tl__tag {
          margin-top: 12px;
          font-size: 9px;
          letter-spacing: 1.4px;
          text-transform: uppercase;
          color: var(--c-accent, #e8a857);
          opacity: 0.8;
        }
        .tl__legend {
          margin-top: 22px;
          padding-top: 14px;
          border-top: 1px solid var(--c-hairline, rgba(244,236,216,0.12));
          display: flex;
          gap: 22px;
          font-size: 9px;
          letter-spacing: 1.6px;
          text-transform: uppercase;
          color: var(--c-fg-muted, rgba(244,236,216,0.5));
        }
        .tl__legend span { display: inline-flex; align-items: center; gap: 6px; }
        .tl__legend i { width: 10px; height: 2px; display: inline-block; }
        @media (max-width: 920px) {
          .tl__grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 520px) {
          .tl__grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
};
