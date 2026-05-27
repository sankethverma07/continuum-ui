/**
 * ScenesDemoPage — progressive reveal of the McLaren P1.
 *
 * **Architecture decision.** Building a custom McLaren renderer was a
 * mistake — the engine in `<AutoProgressiveHero>` already correctly
 * handles bbox normalization, multi-instance scenes, complex PBR with
 * KHR extensions (sheen / clearcoat / pbrSpecularGlossiness), and the
 * wireframe-then-PBR sequencing. We use it here directly. No custom
 * overlays beyond what the canonical engine ships.
 */

import { useMemo, useState } from 'react';
import { AutoProgressiveHero } from '../continuum/components/AutoProgressiveHero';
import type { CatalogEntry } from '../continuum/catalog/types';

const GLB_URL = '/mclaren-p1.glb';
const PAGE_BG_HEX = '#0A0E16';
const ACCENT = '#F5A85F';

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export const ScenesDemoPage = () => {
  const [runToken, setRunToken] = useState(0);
  const replay = () => setRunToken((k) => k + 1);

  // Build a synthetic catalog entry pointing at the local mclaren-p1 glb.
  // Same pattern AutoCatalogPage uses for local-file previews — see
  // LocalFileStage there.
  //
  // **No proxyUrl on purpose.** AutoProgressiveHero renders the proxy
  // wireframe OUTSIDE its engine's internal normalization, so a glb
  // with a huge native bbox (the McLaren is ~600 units long in source
  // coords vs. the engine's expected ~3 unit assets) ends up with the
  // wireframe filling the entire camera frustum as dense noise on top
  // of the correctly-sized PBR. Omitting the proxy here skips that
  // overlay; the engine falls back cleanly to the "blank canvas until
  // Phase A" path, which still hits Phase A inside ~200 ms for this
  // asset so the visual cost is negligible.
  const entry = useMemo<CatalogEntry>(
    () => ({
      id: 'scenes-mclaren',
      kind: 'mesh',
      complexityScore: 1,
      tierCount: 1,
      tiers: [
        { index: 0, url: GLB_URL, ratio: 1, sizeBytes: 0 },
      ],
      heroRenderUrl: null,
      status: 'ready',
      createdAt: new Date().toISOString(),
    }),
    [],
  );

  return (
    <div className="scenes-page">
      <Header onReplay={replay} />
      <main className="scenes-stage">
        <AutoProgressiveHero
          entry={entry}
          registryId={`scenes-mclaren-${runToken}`}
          runToken={runToken}
          autoRotate={0.4}
          backgroundHex={PAGE_BG_HEX}
        />
      </main>
      <Caption />
      <PageStyles />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

const Header = ({ onReplay }: { readonly onReplay: () => void }) => (
  <header className="scenes-header">
    <div>
      <div className="scenes-header__eyebrow">
        <span className="scenes-header__dot" aria-hidden />
        Scenes · Luma-inspired progressive reveal · McLaren P1
      </div>
      <h1 className="scenes-header__title">
        From wireframe blueprint to photoreal surface.
      </h1>
      <p className="scenes-header__lede">
        The position-only proxy lands in &lt;100 ms (orange wireframe). The
        canonical Continuum engine then builds the wireframe up tier-by-tier
        and reveals the PBR materials with all texture maps intact. Hit
        Replay to run it cold.
      </p>
    </div>
    <button type="button" className="scenes-header__replay" onClick={onReplay}>
      Replay ↻
    </button>
  </header>
);

const Caption = () => (
  <footer className="scenes-caption">
    <span>
      Powered by the same `&lt;AutoProgressiveHero&gt;` engine that drives the
      Auto tab. The Luma-style color cloud overlay is queued as a follow-up
      enhancement on top of this baseline.
    </span>
  </footer>
);

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const PageStyles = () => (
  <style>{`
    .scenes-page {
      min-height: 100vh;
      background: ${PAGE_BG_HEX};
      color: #E8EEF6;
      font-family: var(--font-sans);
      padding: 60px 4vw 40px;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }
    .scenes-header {
      display: flex;
      gap: 32px;
      justify-content: space-between;
      align-items: flex-start;
      flex-wrap: wrap;
      max-width: 1280px;
      margin: 0 auto;
      width: 100%;
    }
    .scenes-header > div { max-width: 760px; }
    .scenes-header__eyebrow {
      display: inline-flex; align-items: center; gap: 10px;
      font-family: var(--font-mono, monospace);
      font-size: 11px; letter-spacing: 0.16em;
      color: rgba(232, 238, 246, 0.55);
      text-transform: uppercase; margin-bottom: 18px;
    }
    .scenes-header__dot {
      width: 7px; height: 7px; border-radius: 50%;
      background: ${ACCENT};
      box-shadow: 0 0 10px ${ACCENT};
    }
    .scenes-header__title {
      font-size: clamp(28px, 3.4vw, 46px);
      line-height: 1.05; letter-spacing: -0.01em;
      margin: 0 0 18px; font-weight: 500;
    }
    .scenes-header__lede {
      font-size: 15px; line-height: 1.55;
      color: rgba(232, 238, 246, 0.7); margin: 0;
    }
    .scenes-header__replay {
      align-self: center;
      background: rgba(245, 168, 95, 0.12);
      color: ${ACCENT};
      border: 1px solid rgba(245, 168, 95, 0.3);
      padding: 12px 22px; border-radius: 999px;
      font-family: var(--font-mono, monospace);
      font-size: 13px; letter-spacing: 0.08em;
      cursor: pointer; transition: background 200ms ease;
    }
    .scenes-header__replay:hover { background: rgba(245, 168, 95, 0.2); }
    .scenes-stage {
      position: relative; width: 100%;
      max-width: 1480px; margin: 0 auto;
      aspect-ratio: 16 / 9; overflow: visible;
    }
    .scenes-caption {
      max-width: 1280px; margin: 0 auto; width: 100%;
      font-size: 13px; color: rgba(232, 238, 246, 0.55);
      font-family: var(--font-mono, monospace);
      letter-spacing: 0.04em; line-height: 1.6; padding-top: 8px;
    }
  `}</style>
);

export default ScenesDemoPage;
