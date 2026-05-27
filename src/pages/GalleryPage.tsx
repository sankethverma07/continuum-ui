/**
 * GalleryPage — third demo. Proves the Continuum engine scales to multiple
 * assets hydrating in parallel.
 *
 * Layout:
 *   <Header />
 *   <Gallery grid />   // 4 Canvas tiles, each with its own asset
 *   <StoreInspector />  // live panel reading the Zustand store
 *   <Footer />
 *
 * Each tile runs its OWN hydration: a BlueprintSkeleton paints first, the
 * R3F canvas mounts after its tile-specific delay, and the asset ramps LOD
 * 0 → 2. Stagger is deliberate so visually you can see the four arrivals
 * land at different moments — exactly the pattern a real gallery page
 * would exhibit as network bytes dribble in.
 *
 * The StoreInspector at the bottom subscribes to the whole asset table and
 * renders live currentLOD/status for each of the four tiles. That's what
 * makes the engine visible — Zustand is the single source of truth.
 */

import { useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { LatticeAsset } from '@continuum/components/LatticeAsset';
import { TorusKnotAsset } from '@continuum/components/TorusKnotAsset';
import { CrystalAsset } from '@continuum/components/CrystalAsset';
import { HelixAsset } from '@continuum/components/HelixAsset';
import { useContinuumStore } from '@continuum/store/useContinuumStore';
import type { AssetRegistration, LODTier } from '@continuum/store/types';

export const GalleryPage = () => (
  <div className="gallery">
    <Header />
    <GalleryGrid />
    <StoreInspector />
    <Footer />
    <PageStyles />
  </div>
);

// ---------------------------------------------------------------------------
// Tile definitions — 4 distinct demos on one page
// ---------------------------------------------------------------------------

// Four distinct asset families — each tile runs a visibly different silhouette
// so the page reads as "four different things hydrating in parallel", not
// "two copies of two things". Colors + light rigs are tuned per kind so each
// tile has its own visual identity.
type AssetKind = 'lattice' | 'knot' | 'crystal' | 'helix';

interface TileDef {
  readonly id: string;
  readonly kind: AssetKind;
  readonly label: string;
  readonly tag: string;             // caption sub-label
  readonly skeletonHoldMs: number;  // how long blueprint stays visible
  readonly climbToFineMs: number;   // when LOD goes 0 → 1 (AFTER canvas mount)
  readonly climbToMidMs: number;    // when LOD goes 1 → 2 (AFTER canvas mount)
  readonly climbToHeroMs: number;   // when LOD goes 2 → 3 (AFTER canvas mount)
}

const TILES: readonly TileDef[] = [
  { id: 'gallery-1', kind: 'lattice', label: 'Fur Ball · 01', tag: 'instanced-fur sphere',
    skeletonHoldMs: 800,  climbToFineMs: 350, climbToMidMs: 500, climbToHeroMs: 900 },
  { id: 'gallery-2', kind: 'knot',    label: 'Pretzel · 01', tag: 'procedural torus-knot',
    skeletonHoldMs: 1400, climbToFineMs: 300, climbToMidMs: 400, climbToHeroMs: 800 },
  { id: 'gallery-3', kind: 'crystal', label: 'Crystal · 01', tag: 'transmissive icosahedron',
    skeletonHoldMs: 2000, climbToFineMs: 450, climbToMidMs: 600, climbToHeroMs: 1100 },
  { id: 'gallery-4', kind: 'helix',   label: 'Coil · 01',     tag: 'chromed helix spring',
    skeletonHoldMs: 2600, climbToFineMs: 500, climbToMidMs: 700, climbToHeroMs: 1200 },
] as const;

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

const Header = () => (
  <section className="gallery-header">
    <div className="u-container">
      <div className="u-eyebrow">Gallery · Continuum Demo 03</div>
      <h1 className="gallery-header__title">
        Four different shapes. Four hydrations. One store.
      </h1>
      <p className="gallery-header__lede">
        Every tile below runs its own independent hydration pipeline:
        blueprint paints, canvas mounts, geometry climbs LOD 0 → 1 → 2 → 3.
        The stagger is deliberate — it models how real network traffic
        dribbles in. Scroll past the grid to watch the Zustand store tick in
        real time.
      </p>
    </div>
  </section>
);

// ---------------------------------------------------------------------------
// Grid
// ---------------------------------------------------------------------------

const GalleryGrid = () => (
  <section className="gallery-grid-wrap">
    <div className="u-container">
      <ul className="gallery-grid">
        {TILES.map((t) => (
          <li key={t.id}>
            <GalleryTile tile={t} />
          </li>
        ))}
      </ul>
    </div>
  </section>
);

// ---------------------------------------------------------------------------
// Individual tile — owns its own 3-phase timeline
// ---------------------------------------------------------------------------

const GalleryTile = ({ tile }: { tile: TileDef }) => {
  // Each tile owns its own stagger: the canvas mounts after `skeletonHoldMs`
  // (so the four tiles arrive at visibly different moments), then fades in
  // from transparent. No dark blueprint overlay — same pattern as the
  // Sneaker and Atelier heroes.
  const [mounted, setMounted] = useState(false);
  const [ready, setReady] = useState(false);
  const [tier, setTier] = useState<LODTier>(0);

  useEffect(() => {
    const mountAt = tile.skeletonHoldMs;
    const readyAt = mountAt + 40;       // single rAF after mount
    const fineAt  = mountAt + tile.climbToFineMs;
    const midAt   = fineAt + tile.climbToMidMs;
    const heroAt  = midAt + tile.climbToHeroMs;

    const t1 = window.setTimeout(() => setMounted(true), mountAt);
    const t2 = window.setTimeout(() => setReady(true),   readyAt);
    const t3 = window.setTimeout(() => setTier(1), fineAt);
    const t4 = window.setTimeout(() => setTier(2), midAt);
    const t5 = window.setTimeout(() => setTier(3), heroAt);
    return () => {
      [t1, t2, t3, t4, t5].forEach((id) => window.clearTimeout(id));
    };
  }, [tile.skeletonHoldMs, tile.climbToFineMs, tile.climbToMidMs, tile.climbToHeroMs]);

  const hudLabel =
    !mounted ? '—'
      : tier === 0 ? 'LOD 0 · BLUEPRINT'
        : tier === 1 ? 'LOD 1 · FINE'
          : tier === 2 ? 'LOD 2 · MID'
            : 'LOD 3 · AAA';

  return (
    <figure className={`gallery-tile gallery-tile--${tile.kind}`}>
      <div className="gallery-tile__stage">
        {mounted && (
          <div
            className="gallery-tile__canvas"
            style={{
              opacity: ready ? 1 : 0,
              transition: 'opacity 320ms ease-out',
            }}
          >
            <Canvas
              camera={{ position: [0, 0.3, 4.8], fov: 42 }}
              dpr={[1, 2]}
              gl={{ antialias: true, alpha: true }}
            >
              <ambientLight intensity={0.3} />
              <directionalLight
                position={[3, 4, 3]}
                intensity={0.9}
                color={
                  tile.kind === 'lattice' ? '#FFE6A8'
                    : tile.kind === 'knot'    ? '#FFE6A8'
                    : tile.kind === 'crystal' ? '#E0D0FF'
                    : '#D6EFFF'
                }
              />
              <pointLight
                position={[-3, -2, 2]}
                intensity={0.4}
                color={
                  tile.kind === 'lattice' ? '#F9D760'
                    : tile.kind === 'knot'    ? '#F2B07A'
                    : tile.kind === 'crystal' ? '#B89DFF'
                    : '#A7D8FF'
                }
              />
              {tile.kind === 'lattice' && <LatticeAsset   id={tile.id} forceLOD={tier} />}
              {tile.kind === 'knot'    && <TorusKnotAsset id={tile.id} forceLOD={tier} />}
              {tile.kind === 'crystal' && <CrystalAsset   id={tile.id} forceLOD={tier} />}
              {tile.kind === 'helix'   && <HelixAsset     id={tile.id} forceLOD={tier} />}
            </Canvas>
          </div>
        )}

        <span className="gallery-tile__hud u-label">{hudLabel}</span>
        <TileCorners />
      </div>
      <figcaption className="gallery-tile__cap">
        <span>{tile.label}</span>
        <span className="u-label">{tile.tag}</span>
      </figcaption>
    </figure>
  );
};

const TileCorners = () => (
  <>
    <span className="gallery-tile__corner gallery-tile__corner--tl" aria-hidden />
    <span className="gallery-tile__corner gallery-tile__corner--tr" aria-hidden />
    <span className="gallery-tile__corner gallery-tile__corner--bl" aria-hidden />
    <span className="gallery-tile__corner gallery-tile__corner--br" aria-hidden />
  </>
);

// ---------------------------------------------------------------------------
// Store inspector — subscribes to the whole assets table
// ---------------------------------------------------------------------------

const StoreInspector = () => {
  // Subscribe to the assets record; shallow-compare not needed because we
  // immediately derive an array for rendering.
  const assets = useContinuumStore((s) => s.assets);

  // Only show the gallery tiles (filter by id prefix).
  const rows: readonly AssetRegistration[] = Object.values(assets).filter(
    (a): a is AssetRegistration => a.id.startsWith('gallery-'),
  );

  return (
    <section className="gallery-inspector">
      <div className="u-container">
        <header className="gallery-section__head">
          <div className="u-eyebrow">Live store</div>
          <h2 className="gallery-section__title">
            Zustand, reading itself in real time.
          </h2>
          <p className="gallery-section__lede">
            This table is a live subscription to the Continuum store. Every
            tier change, every status flip, every registration writes here
            first, and the UI reads it second. One source of truth.
          </p>
        </header>
        <div className="gallery-inspector__table" role="table" aria-label="Live asset table">
          <div className="gallery-inspector__head" role="row">
            <span role="columnheader">asset.id</span>
            <span role="columnheader">status</span>
            <span role="columnheader">currentLOD</span>
            <span role="columnheader">maxLOD</span>
            <span role="columnheader">loadingProgress</span>
          </div>
          {rows.length === 0 ? (
            <div className="gallery-inspector__row" role="row">
              <span>—</span><span>—</span><span>—</span><span>—</span><span>—</span>
            </div>
          ) : (
            rows.map((r) => (
              <div key={r.id} className="gallery-inspector__row" role="row">
                <span>{r.id}</span>
                <span className={`gallery-pill gallery-pill--${r.status}`}>{r.status}</span>
                <span>LOD {r.currentLOD}</span>
                <span>LOD {r.maxLOD}</span>
                <span>{(r.loadingProgress * 100).toFixed(0)}%</span>
              </div>
            ))
          )}
        </div>
        <p className="gallery-inspector__foot u-label">
          subscription · useContinuumStore((s) ={'>'}  s.assets)
        </p>
      </div>
    </section>
  );
};

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

const Footer = () => (
  <footer className="gallery-footer">
    <div className="u-container gallery-footer__inner">
      <span className="u-label">Gallery · Continuum UI v2.0</span>
      <span className="u-label">Parallel hydration · live store</span>
    </div>
  </footer>
);

// ---------------------------------------------------------------------------
// PAGE STYLES
// ---------------------------------------------------------------------------
const PageStyles = () => (
  <style>{`
    .gallery {
      /* Per-asset pastel tokens — pale versions of each hero's signature hue.
         Lattice = yellow fur (#F9D760); Knot = warm apricot pretzel (#F2B07A);
         Crystal = soft violet gem (#B89DFF); Helix = cool chrome blue (#A7D8FF). */
      --c-fur:           #F9D760;
      --c-fur-soft:      #FCEBB8;
      --c-fur-deep:      #6B4A0C;
      --c-fur-line:      rgba(249, 215, 96, 0.35);
      --c-fur-glow:      rgba(249, 215, 96, 0.14);
      --c-apricot:       #F2B07A;
      --c-apricot-soft:  #F7D7B4;
      --c-apricot-deep:  #6B3C18;
      --c-apricot-line:  rgba(242, 176, 122, 0.35);
      --c-apricot-glow:  rgba(242, 176, 122, 0.14);
      --c-violet:        #B89DFF;
      --c-violet-line:   rgba(184, 157, 255, 0.35);
      --c-violet-glow:   rgba(184, 157, 255, 0.14);
      --c-azure:         #A7D8FF;
      --c-azure-line:    rgba(167, 216, 255, 0.35);
      --c-azure-glow:    rgba(167, 216, 255, 0.14);

      /* ---- Site-wide palette override — dark pastel blend of both assets.
             The gallery holds two hero colors (fur-gold + apricot), so we
             average them into a warm dark-pastel amber that sits between
             without favouring either. ---- */
      --c-bg:           #1A120A;               /* dark warm pastel base    */
      --c-bg-deep:      #0F0905;
      --c-fg:           #F4E6D1;               /* warm cream body          */
      --c-fg-muted:     #B5A380;               /* muted cream, passes AA   */
      --c-accent:       #F2B07A;               /* apricot as shared accent */
      --c-accent-dim:   rgba(242, 176, 122, 0.14);
      --c-hairline:     rgba(242, 176, 122, 0.22);
      --c-hairline-2:   rgba(242, 176, 122, 0.10);

      background:
        radial-gradient(ellipse at 15% -10%, rgba(249, 215, 96, 0.08) 0%, transparent 55%),
        radial-gradient(ellipse at 95% 110%, rgba(242, 176, 122, 0.08) 0%, transparent 60%),
        var(--c-bg);
      color: var(--c-fg); min-height: 100vh;
    }

    /* ---------- header ---------- */
    .gallery-header { padding: clamp(40px, 6vh, 80px) 0 48px; }
    .gallery-header__title {
      font-size: clamp(36px, 5vw, 72px);
      line-height: 1.05; letter-spacing: -0.03em; font-weight: 500;
      margin-top: 16px;
    }
    .gallery-header__lede {
      font-size: clamp(15px, 1.2vw, 17px);
      max-width: 60ch; margin-top: 20px;
      color: var(--c-fg-muted);
    }

    /* ---------- grid ----------
       No borders, no hairlines between tiles — each 3D asset floats on the
       page background, separated only by generous whitespace. That's the
       beat: the engine delivers the asset, not the frame.              */
    .gallery-grid-wrap { padding-bottom: var(--section-y); }
    .gallery-grid {
      list-style: none; padding: 0; margin: 0;
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: clamp(24px, 3vw, 48px);
      background: transparent;
      border: 0;
    }
    @media (max-width: 1100px) {
      .gallery-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 620px) {
      .gallery-grid { grid-template-columns: 1fr; }
    }
    .gallery-tile {
      margin: 0; background: transparent;
      display: flex; flex-direction: column;
    }
    .gallery-tile__stage {
      position: relative;
      aspect-ratio: 1 / 1;
      width: 100%;
      overflow: visible;
      background: transparent;
    }
    .gallery-tile__canvas { position: absolute; inset: 0; z-index: 1; }
    .gallery-tile__canvas canvas {
      display: block; width: 100% !important; height: 100% !important;
      background: transparent;
    }
    /* HUD label — now a light floating chip, no frame around the stage. */
    .gallery-tile__hud {
      position: absolute; top: 4px; right: 4px;
      padding: 3px 10px;
      background: transparent;
      font-size: 9px;
      z-index: 5;
    }
    .gallery-tile--lattice .gallery-tile__hud { color: var(--c-fur); }
    .gallery-tile--knot    .gallery-tile__hud { color: var(--c-apricot); }
    .gallery-tile--crystal .gallery-tile__hud { color: var(--c-violet); }
    .gallery-tile--helix   .gallery-tile__hud { color: var(--c-azure); }
    /* Corner brackets retired — no frame at all. The corner spans stay in the
       JSX but render nothing, which keeps the component API stable. */
    .gallery-tile__corner { display: none; }
    .gallery-tile__cap {
      padding: 14px 2px 4px;
      display: flex; justify-content: space-between; align-items: baseline;
      font-size: 13px;
      border-top: 0;
    }

    /* ---------- inspector ---------- */
    .gallery-inspector { padding: var(--section-y) 0; border-top: 1px solid var(--c-hairline); }
    .gallery-section__head {
      display: flex; flex-direction: column; gap: 14px;
      margin-bottom: 40px; max-width: 720px;
    }
    .gallery-section__title {
      font-size: clamp(26px, 3.4vw, 42px);
      line-height: 1.1; letter-spacing: -0.02em; font-weight: 500;
    }
    .gallery-section__lede { color: var(--c-fg-muted); font-size: 15px; }
    .gallery-inspector__table {
      border: 1px solid var(--c-hairline);
      font-family: var(--font-mono);
      font-size: 12px;
    }
    .gallery-inspector__head, .gallery-inspector__row {
      display: grid;
      grid-template-columns: 1.4fr 1fr 1fr 1fr 1.2fr;
      gap: 16px;
      padding: 12px 18px;
    }
    .gallery-inspector__head {
      font-size: 10px; letter-spacing: 1.6px; text-transform: uppercase;
      color: var(--c-fg-muted);
      background: var(--c-bg-deep);
      border-bottom: 1px solid var(--c-hairline);
    }
    .gallery-inspector__row {
      border-bottom: 1px solid var(--c-hairline-2);
      font-variant-numeric: tabular-nums;
    }
    .gallery-inspector__row:last-child { border-bottom: 0; }
    .gallery-pill {
      display: inline-block;
      padding: 1px 10px;
      border: 1px solid var(--c-hairline);
      border-radius: 2px;
      font-size: 10px; letter-spacing: 1.4px;
      text-transform: uppercase;
      color: var(--c-fg-muted);
      width: fit-content;
    }
    .gallery-pill--ready  { color: #B5F2A8; border-color: rgba(181,242,168,0.4); }
    .gallery-pill--loading { color: var(--c-accent); border-color: rgba(242, 176, 122, 0.55); }
    .gallery-pill--error  { color: #FF7474; border-color: rgba(255,116,116,0.4); }
    .gallery-inspector__foot {
      margin-top: 14px; color: var(--c-fg-muted);
    }
    @media (max-width: 760px) {
      .gallery-inspector__head { display: none; }
      .gallery-inspector__row {
        grid-template-columns: 1fr;
        gap: 6px; padding: 14px 16px;
      }
    }

    /* ---------- footer ---------- */
    .gallery-footer { padding: 28px 0; border-top: 1px solid var(--c-hairline); }
    .gallery-footer__inner {
      display: flex; justify-content: space-between; gap: 16px;
    }
  `}</style>
);
