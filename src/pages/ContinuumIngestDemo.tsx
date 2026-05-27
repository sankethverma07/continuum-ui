/**
 * ContinuumIngestDemo — fifth demo. Live replay of the ingest pipeline's output.
 *
 * Consumes a catalog entry by id (typed into a small HUD input), then renders
 * both hero variants side-by-side against the same entry:
 *
 *   - VariableTierImageHero  — opacity crossfade between tiers.
 *   - SweepRevealHero        — diagonal mask sweep between tiers (video-feedback style).
 *
 * This is the first page in the demo set that reads real catalog data, not
 * procedurally-generated assets. When the env vars aren't set, or the entry
 * isn't in the table yet, the page renders a deliberate "waiting" state with
 * copy-pastable instructions instead of a silent blank.
 *
 * The timer button re-mounts both heroes so the reveal sequence can replay
 * without a page refresh — useful when showing this to investors and needing
 * to nail the rhythm.
 */

import { useState } from 'react';

import {
  VariableTierImageHero,
  SweepRevealHero,
  VariableTierMeshHero,
  catalog as catalogNs,
} from '@continuum';

// ---------------------------------------------------------------------------
// Public page component
// ---------------------------------------------------------------------------

const DEFAULT_ASSET_ID = 'bottle';

export const ContinuumIngestDemo = () => {
  const [assetId, setAssetId] = useState(DEFAULT_ASSET_ID);
  const [draftId, setDraftId] = useState(DEFAULT_ASSET_ID);
  // Bumping this key re-mounts the hero components, which restarts the
  // hydration sequence. Pure React — no hacks needed.
  const [replayKey, setReplayKey] = useState(0);

  return (
    <div className="ingest-demo">
      <Header
        assetId={assetId}
        draftId={draftId}
        onDraftChange={setDraftId}
        onLoad={() => {
          setAssetId(draftId.trim() || DEFAULT_ASSET_ID);
          setReplayKey((k) => k + 1);
        }}
        onReplay={() => setReplayKey((k) => k + 1)}
      />
      <HeroBody assetId={assetId} replayKey={replayKey} />
      <Footer />
      <PageStyles />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

const Header = ({
  assetId,
  draftId,
  onDraftChange,
  onLoad,
  onReplay,
}: {
  readonly assetId: string;
  readonly draftId: string;
  readonly onDraftChange: (next: string) => void;
  readonly onLoad: () => void;
  readonly onReplay: () => void;
}) => (
  <header className="ingest-demo__header">
    <div className="ingest-demo__eyebrow">
      <span className="ingest-demo__dot" aria-hidden />
      INGEST · LIVE CATALOG
    </div>
    <h1 className="ingest-demo__title">
      One asset, two reveal rhythms.
    </h1>
    <p className="ingest-demo__lede">
      The ingest pipeline writes a single row per hero asset — source + N
      derived tiers + a complexity score. The catalog row is the contract;
      these two heroes both replay it, one with an opacity crossfade and
      one with a diagonal mask sweep. Same data, different rhythm.
    </p>

    <div className="ingest-demo__controls">
      <label className="ingest-demo__label" htmlFor="asset-id">
        Asset id
      </label>
      <input
        id="asset-id"
        className="ingest-demo__input"
        type="text"
        value={draftId}
        placeholder="e.g. bottle"
        onChange={(e) => onDraftChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onLoad();
        }}
        spellCheck={false}
      />
      <button type="button" className="ingest-demo__btn" onClick={onLoad}>
        Load
      </button>
      <button
        type="button"
        className="ingest-demo__btn ingest-demo__btn--ghost"
        onClick={onReplay}
      >
        Replay
      </button>
      <span className="ingest-demo__status">
        showing <code>{assetId}</code>
      </span>
    </div>
  </header>
);

// ---------------------------------------------------------------------------
// Body — two variants side-by-side
// ---------------------------------------------------------------------------

const HeroBody = ({
  assetId,
  replayKey,
}: {
  readonly assetId: string;
  readonly replayKey: number;
}) => {
  // If env vars aren't set, short-circuit before the hook runs. The
  // useCatalogEntry hook throws loudly when called without config; here we
  // want a visible, actionable "you haven't wired Supabase yet" state.
  if (!catalogNs.isCatalogConfigured()) {
    return <UnconfiguredState />;
  }

  return <CatalogBackedBody assetId={assetId} replayKey={replayKey} />;
};

const CatalogBackedBody = ({
  assetId,
  replayKey,
}: {
  readonly assetId: string;
  readonly replayKey: number;
}) => {
  const state = catalogNs.useCatalogEntry(assetId);

  if (state.status === 'idle' || state.status === 'loading') {
    return <PendingState assetId={assetId} />;
  }
  if (state.status === 'error') {
    // The hook collapses "missing row" into an error with a recognizable
    // message. Split the two so the user gets actionable copy either way.
    if (state.error.startsWith('no catalog row')) {
      return <MissingState assetId={assetId} />;
    }
    return <ErrorState assetId={assetId} message={state.error} />;
  }

  const entry = state.entry;
  return (
    <section className="ingest-demo__panels">
      <VariantPanel
        title="Crossfade"
        caption="Uniform opacity ramp per tier. Calm, predictable, always safe."
      >
        <VariableTierImageHero
          key={`cross-${replayKey}`}
          entry={entry}
          registryId={`${entry.id}-crossfade`}
        />
      </VariantPanel>
      <VariantPanel
        title="Sweep"
        caption="Diagonal CSS-mask reveal per tier. The video-feedback cadence."
      >
        <SweepRevealHero
          key={`sweep-${replayKey}`}
          entry={entry}
          registryId={`${entry.id}-sweep`}
        />
      </VariantPanel>

      <VariantPanel
        title="Mesh (simulated)"
        caption="Full polish arc across 8 tiers. Wireframe → flat-shaded → matte → low textures → high textures → reflections → decals. Final frame is a photoreal baseball with stitched seams."
        wide
      >
        <VariableTierMeshHero
          key={`mesh-${replayKey}`}
          entry={entry}
          registryId={`${entry.id}-mesh`}
        />
      </VariantPanel>

      <aside className="ingest-demo__meta">
        <MetaRow label="Kind" value={entry.kind} />
        <MetaRow label="Tier count" value={String(entry.tierCount)} />
        <MetaRow
          label="Complexity"
          value={entry.complexityScore.toFixed(2)}
        />
        <MetaRow label="Status" value={entry.status} />
        <div className="ingest-demo__tiers">
          {entry.tiers.map((tier) => (
            <span key={tier.index} className="ingest-demo__tier-pill">
              LOD{tier.index} · {(tier.sizeBytes / 1024).toFixed(1)} KB
            </span>
          ))}
        </div>
      </aside>
    </section>
  );
};

// ---------------------------------------------------------------------------
// State panels — unconfigured / pending / error / missing
// ---------------------------------------------------------------------------

const UnconfiguredState = () => (
  <section className="ingest-demo__empty">
    <h2>Catalog not wired yet.</h2>
    <p>
      Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>{' '}
      in <code>.env.local</code>, then restart the dev server. The ingest
      README in <code>ingest/README.md</code> has the full 9-step setup.
    </p>
    <p className="ingest-demo__empty-foot">
      Once a catalog row exists, drop its id into the field above and press Load.
    </p>
  </section>
);

const PendingState = ({ assetId }: { readonly assetId: string }) => (
  <section className="ingest-demo__empty">
    <h2>Reading the catalog…</h2>
    <p>
      Looking for asset <code>{assetId}</code> with <code>status = 'ready'</code>.
    </p>
  </section>
);

const ErrorState = ({
  assetId,
  message,
}: {
  readonly assetId: string;
  readonly message: string;
}) => (
  <section className="ingest-demo__empty ingest-demo__empty--error">
    <h2>Catalog read failed.</h2>
    <p>
      Couldn't load <code>{assetId}</code>: {message}
    </p>
  </section>
);

const MissingState = ({ assetId }: { readonly assetId: string }) => (
  <section className="ingest-demo__empty">
    <h2>No ready row for that id.</h2>
    <p>
      <code>{assetId}</code> isn't in the <code>public.assets</code> table yet,
      or its status isn't <code>'ready'</code> yet. If you just dropped an
      upload, give the worker a few seconds and press Load again.
    </p>
  </section>
);

// ---------------------------------------------------------------------------
// VariantPanel — one labelled column
// ---------------------------------------------------------------------------

const VariantPanel = ({
  title,
  caption,
  children,
  wide = false,
}: {
  readonly title: string;
  readonly caption: string;
  readonly children: React.ReactNode;
  readonly wide?: boolean;
}) => (
  <article
    className={`ingest-demo__panel${wide ? ' ingest-demo__panel--wide' : ''}`}
  >
    <header className="ingest-demo__panel-head">
      <h3 className="ingest-demo__panel-title">{title}</h3>
      <p className="ingest-demo__panel-caption">{caption}</p>
    </header>
    <div className="ingest-demo__stage">{children}</div>
  </article>
);

const MetaRow = ({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) => (
  <div className="ingest-demo__meta-row">
    <span className="ingest-demo__meta-label">{label}</span>
    <span className="ingest-demo__meta-value">{value}</span>
  </div>
);

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

const Footer = () => (
  <footer className="ingest-demo__footer">
    <span>
      Catalog rows are written by the{' '}
      <code>ingest/</code> package and{' '}
      <code>supabase/functions/ingest-asset</code>.
    </span>
    <span>© Continuum 2026</span>
  </footer>
);

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const PageStyles = () => (
  <style>{`
    .ingest-demo {
      --c-bg:         #12100C;
      --c-bg-deep:    #0A0806;
      --c-fg:         #EEE3CD;
      --c-fg-muted:   #A99A76;
      --c-accent:     #D7A86E;
      --c-accent-dim: rgba(215, 168, 110, 0.14);
      --c-hairline:   rgba(215, 168, 110, 0.22);
      --page-gutter-x: clamp(24px, 5vw, 80px);
      --section-y: clamp(48px, 8vh, 96px);

      background:
        radial-gradient(ellipse at 10% -10%, rgba(215, 168, 110, 0.08) 0%, transparent 55%),
        radial-gradient(ellipse at 95% 105%, rgba(238, 227, 205, 0.05) 0%, transparent 60%),
        var(--c-bg);
      color: var(--c-fg);
      min-height: 100vh;
      font-family: var(--font-sans);
    }

    .ingest-demo__header {
      padding: clamp(40px, 6vh, 80px) var(--page-gutter-x) 32px;
      max-width: 1440px; margin: 0 auto;
    }
    .ingest-demo__eyebrow {
      display: inline-flex; align-items: center; gap: 8px;
      font-size: 10px; letter-spacing: 2.4px; text-transform: uppercase;
      color: var(--c-fg-muted);
    }
    .ingest-demo__dot {
      width: 6px; height: 6px; border-radius: 50%;
      background: var(--c-accent);
      box-shadow: 0 0 10px var(--c-accent);
    }
    .ingest-demo__title {
      font-size: clamp(36px, 5vw, 72px);
      line-height: 1.05; letter-spacing: -0.03em; font-weight: 500;
      margin: 16px 0 0;
    }
    .ingest-demo__lede {
      max-width: 62ch; margin-top: 18px;
      font-size: clamp(15px, 1.2vw, 17px);
      color: var(--c-fg-muted);
    }
    .ingest-demo__controls {
      margin-top: 28px;
      display: flex; align-items: center; flex-wrap: wrap; gap: 10px;
    }
    .ingest-demo__label {
      font-size: 10px; letter-spacing: 2px; text-transform: uppercase;
      color: var(--c-fg-muted);
    }
    .ingest-demo__input {
      background: var(--c-bg-deep);
      border: 1px solid var(--c-hairline);
      color: var(--c-fg);
      padding: 9px 12px;
      font-family: var(--font-mono, ui-monospace, monospace);
      font-size: 13px;
      min-width: 220px;
      border-radius: 2px;
    }
    .ingest-demo__input:focus {
      outline: none;
      border-color: var(--c-accent);
      box-shadow: 0 0 0 2px var(--c-accent-dim);
    }
    .ingest-demo__btn {
      background: var(--c-accent-dim);
      border: 1px solid var(--c-accent);
      color: var(--c-fg);
      padding: 9px 14px;
      font-family: var(--font-sans);
      font-size: 12px;
      letter-spacing: 0.6px;
      cursor: pointer;
      border-radius: 2px;
      transition: background 160ms ease, transform 160ms ease;
    }
    .ingest-demo__btn:hover { background: rgba(215, 168, 110, 0.22); }
    .ingest-demo__btn:active { transform: translateY(1px); }
    .ingest-demo__btn--ghost {
      background: transparent;
      border-color: var(--c-hairline);
      color: var(--c-fg-muted);
    }
    .ingest-demo__btn--ghost:hover {
      background: var(--c-accent-dim);
      color: var(--c-fg);
    }
    .ingest-demo__status {
      font-size: 11px; color: var(--c-fg-muted);
      margin-left: 8px;
    }
    .ingest-demo__status code {
      color: var(--c-fg);
      font-family: var(--font-mono, ui-monospace, monospace);
    }

    .ingest-demo__panels {
      max-width: 1440px; margin: 0 auto;
      padding: 24px var(--page-gutter-x) var(--section-y);
      display: grid;
      grid-template-columns: 1fr 1fr;
      grid-template-rows: auto auto;
      gap: clamp(24px, 3vw, 44px);
    }
    .ingest-demo__meta {
      grid-column: 1 / -1;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px 32px;
      padding: 20px;
      border: 1px solid var(--c-hairline);
      border-radius: 2px;
      background: rgba(215, 168, 110, 0.04);
    }
    .ingest-demo__meta-row {
      display: flex; flex-direction: column; gap: 4px;
    }
    .ingest-demo__meta-label {
      font-size: 10px; letter-spacing: 2px; text-transform: uppercase;
      color: var(--c-fg-muted);
    }
    .ingest-demo__meta-value {
      font-size: 14px; color: var(--c-fg);
      font-family: var(--font-mono, ui-monospace, monospace);
    }
    .ingest-demo__tiers {
      grid-column: 1 / -1;
      display: flex; flex-wrap: wrap; gap: 6px;
      margin-top: 4px;
    }
    .ingest-demo__tier-pill {
      font-size: 10px; letter-spacing: 0.8px;
      padding: 4px 8px;
      border: 1px solid var(--c-hairline);
      border-radius: 2px;
      color: var(--c-fg-muted);
      font-family: var(--font-mono, ui-monospace, monospace);
    }

    .ingest-demo__panel {
      display: flex; flex-direction: column; gap: 12px;
    }
    .ingest-demo__panel--wide { grid-column: 1 / -1; }
    .ingest-demo__panel--wide .ingest-demo__stage { aspect-ratio: 21 / 9; }
    .ingest-demo__panel-head { display: flex; flex-direction: column; gap: 4px; }
    .ingest-demo__panel-title {
      margin: 0;
      font-size: 14px; letter-spacing: 0.4px;
      color: var(--c-fg);
      font-weight: 500;
    }
    .ingest-demo__panel-caption {
      margin: 0;
      font-size: 12px;
      color: var(--c-fg-muted);
    }
    .ingest-demo__stage {
      position: relative;
      width: 100%;
      aspect-ratio: 16 / 9;
      border: 1px solid var(--c-hairline);
      background: var(--c-bg-deep);
      overflow: hidden;
    }

    .ingest-demo__empty {
      max-width: 640px;
      margin: clamp(40px, 6vh, 80px) auto;
      padding: 28px 32px;
      border: 1px dashed var(--c-hairline);
      border-radius: 2px;
      text-align: left;
      color: var(--c-fg-muted);
    }
    .ingest-demo__empty h2 {
      margin: 0 0 12px;
      font-size: 20px;
      color: var(--c-fg);
      font-weight: 500;
    }
    .ingest-demo__empty p { margin: 0 0 10px; font-size: 14px; line-height: 1.5; }
    .ingest-demo__empty code {
      font-family: var(--font-mono, ui-monospace, monospace);
      background: var(--c-accent-dim);
      color: var(--c-fg);
      padding: 1px 6px;
      border-radius: 2px;
      font-size: 13px;
    }
    .ingest-demo__empty-foot {
      margin-top: 16px;
      font-size: 12px;
      color: var(--c-fg-muted);
      opacity: 0.8;
    }
    .ingest-demo__empty--error { border-color: rgba(255, 120, 120, 0.35); }

    .ingest-demo__footer {
      max-width: 1440px; margin: 0 auto;
      padding: 24px var(--page-gutter-x) 48px;
      display: flex; justify-content: space-between; gap: 16px;
      font-size: 11px; color: var(--c-fg-muted);
      border-top: 1px solid var(--c-hairline);
    }
    .ingest-demo__footer code {
      font-family: var(--font-mono, ui-monospace, monospace);
      color: var(--c-fg);
    }

    @media (max-width: 880px) {
      .ingest-demo__panels { grid-template-columns: 1fr; }
    }
  `}</style>
);
