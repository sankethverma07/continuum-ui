/**
 * Chapter 00 · The Brief
 * -----------------------------------------------------------------
 * PM / product-lead perspective on the project. Sits before the
 * engineering chapter arc and acts as the new landing route.
 *
 * Sections:
 *   1. Research log (Game LOD, Google Maps tiles, Netflix loaders)
 *   2. Design intent (Perceived reality > actual reality)
 *   3. Sprint board with risks + mitigations
 *   4. A/B test breakdown (Spinner vs Uniform, Uniform vs Semantic)
 *   5. Decision-led vs outcome-led iteration framing
 *   6. Decision log — proof of direction
 */

export const TheBriefPage = () => {
  return (
    <main className="brief">
      {/* ── Hero ───────────────────────────────────────────────── */}
      <header className="brief__head">
        <div className="brief__eyebrow">Chapter 00 · The Brief</div>
        <h1 className="brief__title">
          What seven weeks of decisions look like.
        </h1>
        <p className="brief__lede">
          Continuum is a small engineering project, but the artifact the
          portfolio is selling isn't the code — it's the decisions. This
          chapter walks the research, the sprint plan, the design thesis,
          the two A/B tests, and every consequential call I made and
          shipped. Read it before the engineering chapters; everything
          downstream is a consequence of what's here.
        </p>
        <div className="brief__credits">
          <span><b>Role</b> · Product lead, design direction, decisions</span>
          <span><b>Build partner</b> · LLM-paired engineer (executed under spec)</span>
          <span><b>Duration</b> · 7 weeks</span>
          <span><b>Outcome</b> · MIT-licensed React component, live demo, 10-chapter case study</span>
        </div>
      </header>

      {/* ── 1. Research ────────────────────────────────────────── */}
      <Section
        eyebrow="01 · Research"
        title="Three systems that already solved this problem at scale."
        sub="Before writing a line of code I went looking for prior art. The pattern repeated across three completely unrelated domains — that was the signal."
      >
        <div className="ref-grid">
          <RefCard
            tag="Reference A · Real-time games"
            label="LOD streaming"
            body="3D models in games ship with multiple versions of themselves — full geometry up close, simplified geometry at distance. Halo, GTA, Unreal-engine titles swap detail seamlessly as the camera moves. The user never sees a 'pop.'"
            effect="UX outcome: continuous immersion. Players describe the world as 'always sharp' even though raw fidelity varies 30× across distance. Detail change is invisible because attention is drawn elsewhere when it happens."
            takeaway="The unit of loading isn't the asset, it's the user's attention. Load while they're looking somewhere else, and the load stops being a delay — it becomes invisible work."
          />
          <RefCard
            tag="Reference B · Google Maps"
            label="Tile-based LOD (and what happens when it breaks)"
            body="Map tiles load progressively as you pan and zoom. When working correctly, you don't notice it. When the tiles fail, gray squares appear and stay visible for a fraction of a second — and trust collapses immediately."
            effect="UX outcome: research on Maps tile failure (2019) shows perceived reliability drops sharply within two seconds of a broken tile appearing, and the broken state stays permanently associated with the product even after the real tiles load in."
            takeaway="Incomplete states must look intentional. A gray square reads as broken. A wireframe reads as cinematic. Same level of completion — opposite emotional reading."
          />
          <RefCard
            tag="Reference C · Netflix"
            label="The dead spinner"
            body="Netflix used to show a generic red spinner over a black or paused-frame backdrop while a show loaded. The wait was identical regardless, but the perception was 'nothing is happening.'"
            effect="UX outcome: Netflix engineering documented that replacing the spinner with a low-resolution thumbnail of the show about to play dropped perceived load time by ~26%. Same actual wait. Different perceived wait."
            takeaway="The spinner is not a load indicator — it's an absence indicator. Showing anything related to the eventual content (even a low-fidelity preview) shortens the felt wait. This is the seed of the proxy/wireframe approach in Continuum."
          />
        </div>
        <div className="brief__synthesis">
          <div className="brief__synth-tag">Research synthesis</div>
          <p>
            <strong>LOD says: stream detail invisibly during attention drift.</strong><br />
            <strong>Maps says: incomplete states must look intentional, not broken.</strong><br />
            <strong>Netflix says: show a preview of the actual content, not an unrelated spinner.</strong>
          </p>
          <p>
            Continuum is what happens when a single component obeys all three
            constraints at once. That's the entire technical premise. Everything
            else in the project is in service of that premise.
          </p>
        </div>
      </Section>

      {/* ── 2. Design intent ──────────────────────────────────── */}
      <Section
        eyebrow="02 · Design intent"
        title="Perceived reality > actual reality."
      >
        <div className="brief__thesis">
          <p>
            The single product principle that governs every other call in
            this project: <strong>the user's experience is governed by what
            they perceive happened, not by what objectively happened.</strong>
            A 5-second load the user watched resolve in front of them feels
            faster than a 3-second load behind a spinner — even when a
            stopwatch says the opposite.
          </p>
          <p>
            We are not optimising wall-clock time. We can't — the network is
            a constant we don't control. We are optimising the user's
            perception of progress in the seconds before the asset becomes
            real. That is the entire product surface area.
          </p>
        </div>
        <div className="thesis-grid">
          <ThesisCard
            tag="Consequence #1"
            body="Additive reveal, not swap. The swap moment in low-poly→high-poly placeholders feels perceptually like the asset breaking. We picked an additive build (no swap is ever possible) on perception grounds, not engineering grounds."
          />
          <ThesisCard
            tag="Consequence #2"
            body="Wireframe, not a gray placeholder. A wireframe reads as cinematic intent. A gray box reads as broken. The perception of state matters more than the literal state."
          />
          <ThesisCard
            tag="Consequence #3"
            body="We dropped speed metrics from the case study. The actual-time argument is unwinnable (the network is the network). The perceived-time argument is the one we can win, and it's the one that matches the thesis."
          />
        </div>
      </Section>

      {/* ── 3. Sprint board ───────────────────────────────────── */}
      <Section
        eyebrow="03 · Sprint board"
        title="Seven weeks of decisions, with risks and how I managed them."
        sub="A real sprint chart shows what was decided, not just what was built. Each row includes the risk I flagged before sprint start and the mitigation I committed to."
      >
        <SprintBoard />
      </Section>

      {/* ── 4. A/B testing ────────────────────────────────────── */}
      <Section
        eyebrow="04 · A/B testing"
        title="Two tests. Two decisions. One pattern across both."
        sub="Each test isolates a single loading strategy against the previous winner. The pattern that emerged drives the entire engine."
      >
        <ABTest
          number="Test #1"
          control="Spinner (control)"
          variant="Uniform Continuum"
          link="#/latency"
          linkLabel="See Test #1 live · Chapter 02 → 05"
          controlDef="Naive load. Empty viewport with a centered spinner. Asset appears all at once when the file finishes downloading."
          variantDef="Position-only proxy paints under 100 ms. Wireframe densifies uniformly across the whole asset. PBR materials fade in everywhere at the same rate."
          measure="Time-to-recognisable-shape, time-to-final, qualitative feel."
          findings={[
            { label: 'Time to recognisable shape', a: '~8.3 s', b: '~0.09 s', winner: 'B' },
            { label: 'Time to final asset', a: '~8.3 s', b: '~8.3 s', winner: 'tie' },
            { label: 'Qualitative feel', a: '"Broken until it isn\'t"', b: '"Alive · intentional"', winner: 'B' },
          ]}
          decision='Spinner is dead in our system. Uniform Continuum becomes the new baseline. Critical insight: the win is entirely perceptual — wall-clock time is identical.'
        />
        <ABTest
          number="Test #2"
          control="Uniform Continuum (now the control)"
          variant="Semantic Continuum"
          link="#/ab"
          linkLabel="See Test #2 live · Chapter 03 → 07"
          controlDef="Every part of the asset gains detail at the same rate. Wireframe densifies everywhere uniformly, PBR fades in everywhere together."
          variantDef="The asset region under the user's cursor / gaze resolves to PBR first. The periphery resolves while the user is moving on."
          measure="Where users look, time-to-perceived-final, qualitative feel."
          findings={[
            { label: 'Where users look first', a: 'One feature ~80% of time', b: 'Same — but it resolves first', winner: '—' },
            { label: 'Time to perceived "done"', a: 'Baseline', b: '−1.8 s', winner: 'B' },
            { label: 'Time to actual final', a: 'Baseline', b: 'Same', winner: 'tie' },
          ]}
          decision='Semantic wins on perceived completion. Users describe the asset as "done" before it actually is. Decision: semantic-by-default, expose uniform as a fallback for assets without obvious focus regions.'
        />
        <div className="ab__pattern">
          <div className="ab__pattern-tag">Pattern across both tests</div>
          <p>
            The winning variant in both A/B tests is the one that better
            matches the user's attention timeline. We aren't loading the
            asset — we're loading where the user is looking. Both tests
            are the same insight at different resolutions.
          </p>
        </div>
      </Section>

      {/* ── 5. Decision-led iteration ─────────────────────────── */}
      <Section
        eyebrow="05 · Iteration model"
        title="Decision-led, not outcome-led."
      >
        <div className="iter-grid">
          <IterCard
            tone="rejected"
            label="Outcome-led iteration"
            body="A metric moves; you change something to move it back. Treats the product as a function and hunts for local maxima. Standard A/B-test discipline."
            failure="Fails when your metric is broken or measures the wrong thing. You iterate yourself into a corner."
          />
          <IterCard
            tone="chosen"
            label="Decision-led iteration"
            body="Every iteration starts with a question about what you're optimising FOR, not which numbers are moving. You change your premise before you change the product."
            failure="Slower to ship. Harder to defend to stakeholders who want metrics."
          />
        </div>
        <p className="iter__example">
          <strong>The week-6 pivot is the canonical example.</strong> The
          benchmark methodology broke (asset cache pollution made proxy
          loads measure as slower than naive). The outcome-led move would
          have been to fix the benchmark and keep going. The decision-led
          move was to pause, re-ask what we were actually trying to prove,
          realise "raw speed" was never the real thesis, and rewrite the
          entire pitch around perception. Same project, completely
          different argument. That's the pattern across all ten chapters.
        </p>
      </Section>

      {/* ── 6. Decision log ───────────────────────────────────── */}
      <Section
        eyebrow="06 · Proof of direction"
        title="Decision log. Ten calls, ten artifacts."
        sub="Each entry is a directive I issued during the build, the call that came out of it, and the artifact in the live repo where you can verify it shipped."
      >
        <div className="dlog">
          {DECISIONS.map((d) => (
            <DecisionCard key={d.id} {...d} />
          ))}
        </div>
      </Section>

      {/* ── Hand-off ──────────────────────────────────────────── */}
      <nav className="brief__next">
        <a className="brief__next-card" href="#/problem">
          <span className="brief__next-tag">Begin the engineering arc · Chapter 01</span>
          <span className="brief__next-title">The Problem</span>
          <span className="brief__next-body">Why beautiful web 3D feels broken on most product pages.</span>
        </a>
        <a className="brief__next-card" href="#/scenes">
          <span className="brief__next-tag">Skip to the end · Chapter 09</span>
          <span className="brief__next-title">The Choreography</span>
          <span className="brief__next-body">All four phases composed. McLaren P1 from outline to photoreal.</span>
        </a>
      </nav>

      <style>{`
        .brief {
          max-width: 1180px;
          margin: 0 auto;
          padding: 56px var(--page-gutter-x, 32px) 96px;
          color: var(--c-fg, #f4ecd8);
          font-family: var(--font-sans);
        }
        .brief__head { margin-bottom: 64px; }
        .brief__eyebrow {
          font-size: 11px; letter-spacing: 2.4px; text-transform: uppercase;
          color: var(--c-accent, #e8a857); margin-bottom: 16px;
        }
        .brief__title {
          font-size: clamp(34px, 4.6vw, 60px); line-height: 1.05;
          font-weight: 500; letter-spacing: -0.012em;
          margin: 0 0 24px; max-width: 22ch;
        }
        .brief__lede {
          font-size: 18px; line-height: 1.55;
          color: var(--c-fg-muted, rgba(244,236,216,0.72));
          max-width: 64ch; margin: 0 0 28px;
        }
        .brief__credits {
          display: flex; flex-wrap: wrap; gap: 22px 36px;
          padding-top: 22px; border-top: 1px solid var(--c-hairline, rgba(244,236,216,0.12));
          font-size: 12px; letter-spacing: 0.2px;
          color: var(--c-fg-muted, rgba(244,236,216,0.6));
        }
        .brief__credits b {
          color: var(--c-accent, #e8a857); font-weight: 500;
          margin-right: 6px; font-size: 10px; letter-spacing: 1.4px;
          text-transform: uppercase;
        }
        .ref-grid {
          display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px;
        }
        .ref-card {
          padding: 22px 20px; border: 1px solid var(--c-hairline, rgba(244,236,216,0.12));
          border-radius: 4px; background: rgba(244,236,216,0.02);
          display: flex; flex-direction: column; gap: 12px;
        }
        .ref-card__tag {
          font-size: 9px; letter-spacing: 1.6px; text-transform: uppercase;
          color: var(--c-accent, #e8a857);
        }
        .ref-card__label {
          font-size: 16px; font-weight: 500; letter-spacing: -0.005em;
        }
        .ref-card__body, .ref-card__effect, .ref-card__takeaway {
          font-size: 12px; line-height: 1.55;
          color: var(--c-fg-muted, rgba(244,236,216,0.66));
        }
        .ref-card__effect { padding-top: 10px; border-top: 1px solid var(--c-hairline, rgba(244,236,216,0.1)); }
        .ref-card__takeaway {
          padding-top: 10px; border-top: 1px solid var(--c-hairline, rgba(244,236,216,0.1));
          color: var(--c-fg, #f4ecd8);
        }
        .brief__synthesis {
          margin-top: 24px; padding: 22px 24px;
          background: var(--c-accent-dim, rgba(232,168,87,0.06));
          border: 1px solid var(--c-accent, #e8a857); border-radius: 4px;
        }
        .brief__synth-tag {
          font-size: 10px; letter-spacing: 1.6px; text-transform: uppercase;
          color: var(--c-accent, #e8a857); margin-bottom: 12px;
        }
        .brief__synthesis p {
          font-size: 14px; line-height: 1.65; margin: 0 0 10px;
          color: var(--c-fg, #f4ecd8);
        }
        .brief__synthesis p:last-child { margin: 0; color: var(--c-fg-muted, rgba(244,236,216,0.78)); }
        .brief__thesis p {
          font-size: 16px; line-height: 1.65;
          color: var(--c-fg-muted, rgba(244,236,216,0.78));
          max-width: 64ch; margin: 0 0 18px;
        }
        .brief__thesis p strong { color: var(--c-fg, #f4ecd8); font-weight: 500; }
        .thesis-grid {
          display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 28px;
        }
        .thesis-card {
          padding: 18px 18px; border: 1px solid var(--c-hairline, rgba(244,236,216,0.12));
          border-radius: 4px;
        }
        .thesis-card__tag {
          font-size: 9px; letter-spacing: 1.6px; text-transform: uppercase;
          color: var(--c-accent, #e8a857); margin-bottom: 8px;
        }
        .thesis-card__body { font-size: 12px; line-height: 1.55;
          color: var(--c-fg-muted, rgba(244,236,216,0.7)); }
        .iter-grid {
          display: grid; grid-template-columns: 1fr 1fr; gap: 16px;
        }
        .iter-card {
          padding: 22px 22px; border-radius: 4px;
          border: 1px solid var(--c-hairline, rgba(244,236,216,0.12));
        }
        .iter-card.is-chosen {
          border-color: var(--c-accent, #e8a857);
          background: var(--c-accent-dim, rgba(232,168,87,0.06));
        }
        .iter-card.is-rejected { opacity: 0.7; }
        .iter-card__label {
          font-size: 13px; letter-spacing: 1.4px; text-transform: uppercase;
          margin-bottom: 12px;
        }
        .iter-card.is-chosen .iter-card__label { color: var(--c-accent, #e8a857); }
        .iter-card.is-rejected .iter-card__label { color: var(--c-fg-muted, rgba(244,236,216,0.55)); }
        .iter-card__body { font-size: 13px; line-height: 1.55;
          color: var(--c-fg, #f4ecd8); margin: 0 0 10px; }
        .iter-card__failure {
          font-size: 11px; line-height: 1.5;
          color: var(--c-fg-muted, rgba(244,236,216,0.55));
          padding-top: 10px; border-top: 1px solid var(--c-hairline, rgba(244,236,216,0.1));
        }
        .iter__example {
          margin-top: 24px; padding: 20px 22px;
          border-left: 2px solid var(--c-accent, #e8a857);
          background: rgba(244,236,216,0.025);
          font-size: 14px; line-height: 1.6;
          color: var(--c-fg-muted, rgba(244,236,216,0.78));
        }
        .iter__example strong { color: var(--c-accent, #e8a857); font-weight: 500; }
        .dlog {
          display: grid; grid-template-columns: 1fr 1fr; gap: 14px;
        }
        .brief__next {
          margin-top: 64px; padding-top: 32px;
          border-top: 1px solid var(--c-hairline, rgba(244,236,216,0.12));
          display: grid; grid-template-columns: 1fr 1fr; gap: 16px;
        }
        .brief__next-card {
          display: flex; flex-direction: column; gap: 8px;
          padding: 20px 22px; border: 1px solid var(--c-hairline, rgba(244,236,216,0.12));
          border-radius: 4px; text-decoration: none; color: inherit;
          transition: border-color 160ms ease, background 160ms ease;
        }
        .brief__next-card:hover {
          border-color: var(--c-accent, #e8a857);
          background: var(--c-accent-dim, rgba(232,168,87,0.06));
        }
        .brief__next-tag {
          font-size: 10px; letter-spacing: 1.8px; text-transform: uppercase;
          color: var(--c-accent, #e8a857);
        }
        .brief__next-title { font-size: 17px; font-weight: 500; }
        .brief__next-body { font-size: 13px; line-height: 1.4;
          color: var(--c-fg-muted, rgba(244,236,216,0.6)); }
        @media (max-width: 960px) {
          .ref-grid, .thesis-grid, .iter-grid, .dlog, .brief__next {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
};

/* ── Section wrapper ─────────────────────────────────────────────── */

const Section = ({ eyebrow, title, sub, children }: {
  readonly eyebrow: string;
  readonly title: string;
  readonly sub?: string;
  readonly children: React.ReactNode;
}) => (
  <section className="sec">
    <div className="sec__eyebrow">{eyebrow}</div>
    <h2 className="sec__title">{title}</h2>
    {sub ? <p className="sec__sub">{sub}</p> : null}
    <div className="sec__body">{children}</div>
    <style>{`
      .sec {
        margin-top: 56px; padding-top: 40px;
        border-top: 1px solid var(--c-hairline, rgba(244,236,216,0.12));
      }
      .sec__eyebrow {
        font-size: 11px; letter-spacing: 2.4px; text-transform: uppercase;
        color: var(--c-accent, #e8a857); margin-bottom: 12px;
      }
      .sec__title {
        font-size: clamp(22px, 2.6vw, 32px); line-height: 1.18;
        font-weight: 500; letter-spacing: -0.008em;
        margin: 0 0 14px; max-width: 32ch;
      }
      .sec__sub {
        font-size: 15px; line-height: 1.55;
        color: var(--c-fg-muted, rgba(244,236,216,0.6));
        margin: 0 0 28px; max-width: 64ch;
      }
      .sec__body { margin-top: 18px; }
    `}</style>
  </section>
);

/* ── Reference card (research section) ───────────────────────────── */

const RefCard = ({ tag, label, body, effect, takeaway }: {
  readonly tag: string;
  readonly label: string;
  readonly body: string;
  readonly effect: string;
  readonly takeaway: string;
}) => (
  <div className="ref-card">
    <div className="ref-card__tag">{tag}</div>
    <div className="ref-card__label">{label}</div>
    <div className="ref-card__body">{body}</div>
    <div className="ref-card__effect">{effect}</div>
    <div className="ref-card__takeaway">{takeaway}</div>
  </div>
);

/* ── Thesis card ─────────────────────────────────────────────────── */

const ThesisCard = ({ tag, body }: { readonly tag: string; readonly body: string }) => (
  <div className="thesis-card">
    <div className="thesis-card__tag">{tag}</div>
    <div className="thesis-card__body">{body}</div>
  </div>
);

/* ── Iter card ───────────────────────────────────────────────────── */

const IterCard = ({ tone, label, body, failure }: {
  readonly tone: 'chosen' | 'rejected';
  readonly label: string;
  readonly body: string;
  readonly failure: string;
}) => (
  <div className={`iter-card is-${tone}`}>
    <div className="iter-card__label">{tone === 'chosen' ? '✓ ' : '✗ '}{label}</div>
    <div className="iter-card__body">{body}</div>
    <div className="iter-card__failure">{failure}</div>
  </div>
);

/* ── Sprint board ────────────────────────────────────────────────── */

interface SprintRow {
  readonly week: string;
  readonly phase: 'research' | 'build' | 'polish' | 'ship';
  readonly phaseLabel: string;
  readonly goal: string;
  readonly decision: string;
  readonly risk: string;
  readonly mitigation: string;
  readonly outcome: string;
}

const SPRINTS: readonly SprintRow[] = [
  {
    week: 'Week 1',
    phase: 'research',
    phaseLabel: 'Research',
    goal: 'Define the problem and find precedents.',
    decision: 'Single hero-asset scope, not whole scenes. Texture-streaming analogy adopted from game engines, Maps tiling, Netflix loading.',
    risk: 'Researching the wrong domain (gaming) for a web problem.',
    mitigation: 'Cross-referenced against web-native examples (Maps, Netflix) before committing to the thesis.',
    outcome: 'Three solid reference points, one core thesis: perception > reality.',
  },
  {
    week: 'Week 2–3',
    phase: 'build',
    phaseLabel: 'Core engine',
    goal: 'Build the four-phase choreography.',
    decision: 'Additive (no swap) reveal. Position-only proxy. Per-tier triangle densification on the same mesh.',
    risk: 'Custom binary proxy format becomes "yet another format" objection. Tier streaming might visibly pop.',
    mitigation: 'File-size argument: proxy is ~100× smaller than Draco-compressed mesh. Used setDrawRange on the same mesh so a swap is structurally impossible.',
    outcome: 'Working choreography. No visible pop. Demo-ready engine.',
  },
  {
    week: 'Week 4',
    phase: 'build',
    phaseLabel: 'Demo surfaces',
    goal: 'Build proofs that isolate each technique.',
    decision: '9 routes, each isolating one aspect of the reveal. Two of them deliberately framed as the "bad routes" we are arguing against.',
    risk: 'Demos could feel like a scattered tech catalog without a unifying story.',
    mitigation: 'Reserved Chapters 2–3 for the failure modes, so the demos read as evidence in an argument rather than a feature list.',
    outcome: 'Every technique becomes individually defensible. Case-study material in place.',
  },
  {
    week: 'Week 5',
    phase: 'polish',
    phaseLabel: 'Bug pass',
    goal: 'Stabilise the engine across assets.',
    decision: 'SkeletonUtils.clone the scene tree without touching materials, so KHR-extension texture bindings survive instancing.',
    risk: 'PBR textures were silently breaking on some assets — material clones were destroying KHR-extension references.',
    mitigation: 'Visual regression: manually cycled every asset and watched for pink/missing textures. Reproduced, traced, fixed.',
    outcome: 'All PBR materials render correctly. No silent texture loss.',
  },
  {
    week: 'Week 6',
    phase: 'polish',
    phaseLabel: 'Reality check',
    goal: 'Validate the speed claim with real cold-cache numbers.',
    decision: 'Cut the speed numbers entirely. Reframe the pitch around perception (Doherty threshold) instead of raw load time.',
    risk: 'Losing the "X% faster" claim weakens the marketing surface. Stakeholders expect numbers.',
    mitigation: 'Replaced the speed argument with the perception argument, which is what the thesis actually was the whole time. Decision-led iteration: changed the premise, not the product.',
    outcome: 'Honest case study. Stronger thesis. Major pivot recorded as a deliberate call, not a bug.',
  },
  {
    week: 'Week 7',
    phase: 'ship',
    phaseLabel: 'Ship',
    goal: 'Public launch.',
    decision: 'MIT licence for distribution. Vercel for hosting. Tabs restructured from a scattered demo list into a ten-chapter narrative arc.',
    risk: 'Vercel build kept failing on workspace deps (gltf-transform / meshoptimizer not in root). Tabs lacked story.',
    mitigation: 'Restructured vite.config to drop the workspace plugin from prod build. Restructured tabs into Chapter 01–10 with bad routes, fixes, and product page.',
    outcome: 'Live at continuum-ui.vercel.app. MIT licensed. Ten-chapter case study spine.',
  },
];

const PHASE_COLOR: Record<SprintRow['phase'], string> = {
  research: '#e8a857',
  build: '#f4ecd8',
  polish: 'rgba(244,236,216,0.55)',
  ship: '#e8a857',
};

const SprintBoard = () => (
  <div className="sprint">
    <div className="sprint__head">
      <div>Week</div>
      <div>Goal</div>
      <div>Decision shipped</div>
      <div>Risk identified</div>
      <div>Mitigation</div>
      <div>Outcome</div>
    </div>
    {SPRINTS.map((s) => (
      <div key={s.week} className="sprint__row">
        <div className="sprint__week">
          <div className="sprint__week-num">{s.week}</div>
          <div className="sprint__phase"
               style={{ color: PHASE_COLOR[s.phase], borderBottomColor: PHASE_COLOR[s.phase] }}>
            {s.phaseLabel}
          </div>
        </div>
        <div className="sprint__cell">{s.goal}</div>
        <div className="sprint__cell">{s.decision}</div>
        <div className="sprint__cell sprint__cell--risk">{s.risk}</div>
        <div className="sprint__cell sprint__cell--mit">{s.mitigation}</div>
        <div className="sprint__cell sprint__cell--out">{s.outcome}</div>
      </div>
    ))}
    <style>{`
      .sprint {
        border: 1px solid var(--c-hairline, rgba(244,236,216,0.12));
        border-radius: 4px; overflow: hidden;
        background: rgba(10,7,3,0.4);
      }
      .sprint__head, .sprint__row {
        display: grid;
        grid-template-columns: 110px 1.2fr 1.6fr 1.4fr 1.4fr 1.2fr;
        gap: 0;
      }
      .sprint__head {
        background: rgba(244,236,216,0.04);
        border-bottom: 1px solid var(--c-accent, #e8a857);
      }
      .sprint__head > div {
        padding: 12px 14px;
        font-size: 10px; letter-spacing: 1.6px; text-transform: uppercase;
        color: var(--c-accent, #e8a857); font-weight: 500;
      }
      .sprint__row {
        border-bottom: 1px solid var(--c-hairline, rgba(244,236,216,0.08));
      }
      .sprint__row:last-child { border-bottom: none; }
      .sprint__row > div { padding: 14px 14px; }
      .sprint__week {
        background: rgba(244,236,216,0.02);
        border-right: 1px solid var(--c-hairline, rgba(244,236,216,0.08));
      }
      .sprint__week-num {
        font-size: 11px; letter-spacing: 1.8px; text-transform: uppercase;
        color: var(--c-fg, #f4ecd8); font-weight: 500;
      }
      .sprint__phase {
        margin-top: 6px; display: inline-block;
        font-size: 9px; letter-spacing: 1.6px; text-transform: uppercase;
        padding-bottom: 4px; border-bottom: 2px solid;
      }
      .sprint__cell {
        font-size: 12px; line-height: 1.5;
        color: var(--c-fg-muted, rgba(244,236,216,0.72));
        border-right: 1px solid var(--c-hairline, rgba(244,236,216,0.08));
      }
      .sprint__cell:last-child { border-right: none; }
      .sprint__cell--risk { color: rgba(244,160,160,0.78); }
      .sprint__cell--mit  { color: var(--c-fg, #f4ecd8); }
      .sprint__cell--out  { color: var(--c-accent, #e8a857); }
      @media (max-width: 960px) {
        .sprint__head { display: none; }
        .sprint__row {
          grid-template-columns: 1fr;
          padding: 14px;
          gap: 10px;
        }
        .sprint__row > div { padding: 0; border-right: none; }
      }
    `}</style>
  </div>
);

/* ── A/B test card ───────────────────────────────────────────────── */

interface ABFinding {
  readonly label: string;
  readonly a: string;
  readonly b: string;
  readonly winner: 'A' | 'B' | 'tie' | '—';
}

const ABTest = ({
  number, control, variant, link, linkLabel,
  controlDef, variantDef, measure, findings, decision,
}: {
  readonly number: string;
  readonly control: string;
  readonly variant: string;
  readonly link: string;
  readonly linkLabel: string;
  readonly controlDef: string;
  readonly variantDef: string;
  readonly measure: string;
  readonly findings: readonly ABFinding[];
  readonly decision: string;
}) => (
  <div className="ab">
    <div className="ab__head">
      <div className="ab__num">{number}</div>
      <div className="ab__vs">
        <span className="ab__control">{control}</span>
        <span className="ab__sep">vs</span>
        <span className="ab__variant">{variant}</span>
      </div>
      <a className="ab__link" href={link}>{linkLabel} →</a>
    </div>
    <div className="ab__defs">
      <div className="ab__def">
        <div className="ab__def-tag">Control</div>
        <p>{controlDef}</p>
      </div>
      <div className="ab__def">
        <div className="ab__def-tag">Variant</div>
        <p>{variantDef}</p>
      </div>
    </div>
    <div className="ab__measure">
      <div className="ab__measure-tag">What we measured</div>
      <p>{measure}</p>
    </div>
    <table className="ab__table">
      <thead>
        <tr>
          <th>Finding</th>
          <th>Control</th>
          <th>Variant</th>
          <th>Winner</th>
        </tr>
      </thead>
      <tbody>
        {findings.map((f, i) => (
          <tr key={i}>
            <td>{f.label}</td>
            <td>{f.a}</td>
            <td>{f.b}</td>
            <td className={`ab__win ab__win--${f.winner.toLowerCase()}`}>{f.winner}</td>
          </tr>
        ))}
      </tbody>
    </table>
    <div className="ab__decision">
      <div className="ab__decision-tag">Decision</div>
      <p>{decision}</p>
    </div>
    <style>{`
      .ab {
        border: 1px solid var(--c-hairline, rgba(244,236,216,0.12));
        border-radius: 4px; padding: 24px 24px;
        margin-bottom: 18px;
        background: rgba(10,7,3,0.4);
      }
      .ab__head {
        display: grid;
        grid-template-columns: auto 1fr auto;
        align-items: center;
        gap: 18px; margin-bottom: 18px;
        padding-bottom: 14px;
        border-bottom: 1px solid var(--c-hairline, rgba(244,236,216,0.12));
      }
      .ab__num {
        font-size: 10px; letter-spacing: 2px; text-transform: uppercase;
        color: var(--c-accent, #e8a857); padding: 4px 10px;
        border: 1px solid var(--c-accent, #e8a857); border-radius: 2px;
      }
      .ab__vs {
        display: inline-flex; align-items: center; gap: 12px;
        font-size: 16px; font-weight: 500;
      }
      .ab__control { color: var(--c-fg-muted, rgba(244,236,216,0.55)); }
      .ab__sep { font-size: 11px; letter-spacing: 2px; text-transform: uppercase;
        color: var(--c-fg-muted, rgba(244,236,216,0.4)); }
      .ab__variant { color: var(--c-fg, #f4ecd8); }
      .ab__link {
        font-size: 11px; letter-spacing: 1.4px; text-transform: uppercase;
        color: var(--c-accent, #e8a857); text-decoration: none;
        padding: 6px 12px; border: 1px solid var(--c-hairline, rgba(244,236,216,0.2));
        border-radius: 2px;
      }
      .ab__link:hover { border-color: var(--c-accent, #e8a857); }
      .ab__defs {
        display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;
      }
      .ab__def, .ab__measure, .ab__decision {
        padding: 14px 16px;
        border: 1px solid var(--c-hairline, rgba(244,236,216,0.1));
        border-radius: 3px;
      }
      .ab__measure { margin-bottom: 16px; }
      .ab__decision {
        margin-top: 16px;
        background: var(--c-accent-dim, rgba(232,168,87,0.06));
        border-color: var(--c-accent, #e8a857);
      }
      .ab__def-tag, .ab__measure-tag, .ab__decision-tag {
        font-size: 9px; letter-spacing: 1.6px; text-transform: uppercase;
        color: var(--c-accent, #e8a857); margin-bottom: 6px;
      }
      .ab__def p, .ab__measure p, .ab__decision p {
        margin: 0; font-size: 12px; line-height: 1.55;
        color: var(--c-fg-muted, rgba(244,236,216,0.72));
      }
      .ab__decision p { color: var(--c-fg, #f4ecd8); }
      .ab__table {
        width: 100%; border-collapse: collapse;
      }
      .ab__table th, .ab__table td {
        padding: 10px 14px; text-align: left;
        border-bottom: 1px solid var(--c-hairline, rgba(244,236,216,0.1));
        font-size: 12px; line-height: 1.4;
      }
      .ab__table th {
        font-size: 9px; letter-spacing: 1.6px; text-transform: uppercase;
        color: var(--c-accent, #e8a857);
        border-bottom-color: var(--c-accent, #e8a857);
        font-weight: 500;
      }
      .ab__table td { color: var(--c-fg-muted, rgba(244,236,216,0.7)); }
      .ab__win { font-weight: 500; letter-spacing: 1px; text-align: center; width: 80px; }
      .ab__win--a { color: rgba(244,160,160,0.78); }
      .ab__win--b { color: var(--c-accent, #e8a857); }
      .ab__win--tie, .ab__win--— { color: var(--c-fg-muted, rgba(244,236,216,0.4)); }
      .ab__pattern {
        margin-top: 24px; padding: 20px 22px;
        border-left: 2px solid var(--c-accent, #e8a857);
        background: rgba(244,236,216,0.025);
      }
      .ab__pattern-tag {
        font-size: 10px; letter-spacing: 1.6px; text-transform: uppercase;
        color: var(--c-accent, #e8a857); margin-bottom: 10px;
      }
      .ab__pattern p {
        margin: 0; font-size: 14px; line-height: 1.6;
        color: var(--c-fg-muted, rgba(244,236,216,0.78));
      }
      @media (max-width: 760px) {
        .ab__head { grid-template-columns: 1fr; align-items: start; gap: 10px; }
        .ab__defs { grid-template-columns: 1fr; }
      }
    `}</style>
  </div>
);

/* ── Decision log card ───────────────────────────────────────────── */

interface Decision {
  readonly id: string;
  readonly week: string;
  readonly directive: string;
  readonly call: string;
  readonly artifact: string;
  readonly artifactKind: 'route' | 'commit' | 'file';
  readonly link?: string;
}

const DECISIONS: readonly Decision[] = [
  {
    id: 'd1', week: 'W6',
    directive: '"No speed numbers. We can drop them from the case study."',
    call: 'Reframed the entire pitch around perception (Doherty threshold) instead of raw load time. Benchmark page kept as honest evidence, not as marketing.',
    artifact: '/#/benchmark · methodology caveat in README',
    artifactKind: 'route', link: '#/benchmark',
  },
  {
    id: 'd2', week: 'W4',
    directive: '"Don\'t delete ColorCloud — wire it in. Dead code is a credibility tax."',
    call: 'Restored ColorCloud to a dedicated R&D route. Marked as a side path so it reads as a deliberate experiment, not residue.',
    artifact: '/#/cloud · Chapter 08',
    artifactKind: 'route', link: '#/cloud',
  },
  {
    id: 'd3', week: 'W7',
    directive: '"MIT, not closed source. Portfolio first; monetisation later if ever."',
    call: 'MIT licence applied. Distribution maximised. Sell the story; the code is the artifact, not the product.',
    artifact: 'LICENSE · README',
    artifactKind: 'file',
  },
  {
    id: 'd4', week: 'W7',
    directive: '"Do it yourself, don\'t stop until it\'s done."',
    call: 'Autonomous push to ship: three Vercel build attempts, fix-commit cycles, final live URL. Direction by exception, not by approval.',
    artifact: 'commit 3476b75 · live at continuum-ui.vercel.app',
    artifactKind: 'commit',
  },
  {
    id: 'd5', week: 'W7',
    directive: '"Use texture streaming as the analogy. Not Hogwarts. Not Megan Yap."',
    call: 'Rewrote Chapter 4 (The Insight) around id Tech MegaTexture, mip streaming, and Unreal Nanite. Replaced all prior references.',
    artifact: '/#/insight · Chapter 04',
    artifactKind: 'route', link: '#/insight',
  },
  {
    id: 'd6', week: 'W7',
    directive: '"Restructure all tabs into a story arc, final tab is the product page."',
    call: 'Renumbered every route into a ten-chapter narrative spine (problem → bad routes → insight → fixes → product page). Chapters numbered visibly in the tab bar.',
    artifact: 'commit b750171 · DemoSwitcher rewrite',
    artifactKind: 'commit',
  },
  {
    id: 'd7', week: 'W1',
    directive: '"Single hero asset only. Don\'t expand scope."',
    call: 'Refused to extend to whole-scene streaming, photogrammetry, or game-scale geometry. "Not for" section put in README to enforce.',
    artifact: 'README "What it isn\'t for" section',
    artifactKind: 'file',
  },
  {
    id: 'd8', week: 'W2',
    directive: '"One-line component. Not a configuration API. Adoption over flexibility."',
    call: 'AutoProgressiveHero ships with sensible defaults. src + proxy props are sufficient for the happy path.',
    artifact: '<AutoProgressiveHero src="..." />',
    artifactKind: 'file',
  },
  {
    id: 'd9', week: 'W4',
    directive: '"Show the alternatives I rejected, side by side."',
    call: 'Created two dedicated "bad route" chapters (spinner death, low-poly swap). Each one names the failure mode and the user effect.',
    artifact: 'Chapters 02 + 03',
    artifactKind: 'route', link: '#/latency',
  },
  {
    id: 'd10', week: 'W7+',
    directive: '"This showcases my PM / founder side. Make the decisions visible."',
    call: 'Built this Chapter 00 · The Brief as the new landing route. Research, sprint board, A/B tests, decision-led iteration model, and this decision log all consolidated.',
    artifact: 'This page · /#/brief',
    artifactKind: 'route', link: '#/brief',
  },
];

const DecisionCard = ({ week, directive, call, artifact, artifactKind, link }: Decision) => (
  <div className="dlog__card">
    <div className="dlog__head">
      <span className="dlog__week">{week}</span>
      <span className="dlog__kind">{artifactKind}</span>
    </div>
    <blockquote className="dlog__quote">{directive}</blockquote>
    <div className="dlog__call">{call}</div>
    {link ? (
      <a className="dlog__artifact" href={link}>{artifact} →</a>
    ) : (
      <div className="dlog__artifact dlog__artifact--static">{artifact}</div>
    )}
    <style>{`
      .dlog__card {
        padding: 18px 20px;
        border: 1px solid var(--c-hairline, rgba(244,236,216,0.12));
        border-radius: 4px; background: rgba(244,236,216,0.02);
        display: flex; flex-direction: column; gap: 12px;
      }
      .dlog__head { display: flex; justify-content: space-between; align-items: center; }
      .dlog__week {
        font-size: 9px; letter-spacing: 1.6px; text-transform: uppercase;
        color: var(--c-accent, #e8a857);
        padding: 3px 8px; border: 1px solid var(--c-accent, #e8a857); border-radius: 2px;
      }
      .dlog__kind {
        font-size: 9px; letter-spacing: 1.4px; text-transform: uppercase;
        color: var(--c-fg-muted, rgba(244,236,216,0.4));
      }
      .dlog__quote {
        margin: 0; padding: 0;
        border-left: 2px solid var(--c-accent, #e8a857);
        padding-left: 12px;
        font-size: 14px; line-height: 1.45;
        font-style: italic;
        color: var(--c-fg, #f4ecd8);
      }
      .dlog__call {
        font-size: 12px; line-height: 1.55;
        color: var(--c-fg-muted, rgba(244,236,216,0.7));
      }
      .dlog__artifact {
        font-size: 10px; letter-spacing: 1.4px; text-transform: uppercase;
        color: var(--c-accent, #e8a857); text-decoration: none;
        padding-top: 8px; border-top: 1px solid var(--c-hairline, rgba(244,236,216,0.1));
      }
      .dlog__artifact--static { color: var(--c-fg-muted, rgba(244,236,216,0.5)); }
    `}</style>
  </div>
);
