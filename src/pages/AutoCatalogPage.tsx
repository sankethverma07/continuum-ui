/**
 * AutoCatalogPage — end-to-end demo of the automated ingest → blueprint flow.
 *
 * User uploads a .glb exported from Spline or Blender to the Supabase bucket.
 * The ingest worker chops it into N decimated tiers and writes a catalog row.
 * This page fetches the catalog row by id and renders it through
 * <AutoProgressiveHero />, which turns the tier stack into a
 * blueprint → material reveal WITHOUT any hand-authored code.
 *
 * This is the page we point at to prove the pipeline works on arbitrary
 * third-party assets.
 */

import { useEffect, useMemo, useState } from 'react';

import { AutoProgressiveHero } from '../continuum/components/AutoProgressiveHero';
import { preloadCatalogGLBs } from '../continuum/components/AutoProgressiveGLBAsset';
import {
  buildReferenceWatchTiers,
  countTriangles,
} from '../continuum/components/referenceWatchScene';
import { catalog as catalogNs } from '@continuum';
import type { CatalogEntry } from '../continuum/catalog/types';
import { UploadDropzone } from '../continuum/upload/UploadDropzone';
import type { LoadedAsset } from '../continuum/upload/assetLoader';
import * as THREE from 'three';

const DEFAULT_ASSET_ID = 'reference';
const REFERENCE_ID = 'reference';
const PAGE_BG_HEX = '#0B0F14';

/**
 * Local-files mode — when the asset ID matches one of these keys, we skip
 * Supabase entirely and load the .glb directly from the dev server's public/
 * folder. Lets us test arbitrary GLBs (free-fire, skull, mclaren-p1, etc.)
 * without round-tripping through the ingest pipeline.
 */
const LOCAL_GLB_FILES: Record<string, string> = {
  'free-fire':            '/free-fire.glb',
  'skull':                '/skull.glb',
  'mclaren-p1':           '/mclaren-p1.glb',
  'spaceship':            '/spaceship.glb',
  // Output of the new ingest pipeline (meshopt + WebP). 27 MB → 2.1 MB.
  // Visit /#/auto/spaceship-compressed to render the compressed copy
  // through the modern decoder pipeline (KTX2/Draco/Meshopt).
  'spaceship-compressed': '/spaceship-compressed.glb',
  'bmw':                  '/BMW.glb',
};

/**
 * Read an asset id out of the location hash. Supports:
 *   #/auto/free-fire        — path-style suffix
 *   #/auto?asset=free-fire  — query-style suffix
 * Falls back to the default if no asset id is present.
 */
const readAssetIdFromHash = (): string => {
  if (typeof window === 'undefined') return DEFAULT_ASSET_ID;
  const hash = window.location.hash || '';
  // Path-style: #/auto/<asset-id>
  const pathMatch = hash.match(/^#\/auto\/([^?#]+)/);
  if (pathMatch && pathMatch[1]) return decodeURIComponent(pathMatch[1]);
  // Query-style: #/auto?asset=<asset-id>
  const queryMatch = hash.match(/[?&]asset=([^&]+)/);
  if (queryMatch && queryMatch[1]) return decodeURIComponent(queryMatch[1]);
  return DEFAULT_ASSET_ID;
};

/**
 * A dropped file becomes a runtime-only asset — the pre-loaded
 * THREE.Object3D scene (already parsed by the universal loader) is
 * fed directly into AutoProgressiveFromObjects. No URL round-trip,
 * no engine-side re-parsing.
 */
interface DroppedAsset {
  readonly id: string;
  readonly scene: THREE.Object3D;
  readonly displayName: string;
  readonly format: LoadedAsset['format'];
  readonly triangleCount: number;
  readonly materialCount: number;
}

export const AutoCatalogPage = () => {
  const initialId = readAssetIdFromHash();
  const [assetId, setAssetId] = useState(initialId);
  const [draftId, setDraftId] = useState(initialId);
  const [runToken, setRunToken] = useState(0);
  const [dropped, setDropped] = useState<DroppedAsset | null>(null);

  // React to hashchange so navigating between #/auto/free-fire and
  // #/auto/skull in a single tab swaps the asset live.
  useEffect(() => {
    const onHash = () => {
      const next = readAssetIdFromHash();
      setAssetId(next);
      setDraftId(next);
      setRunToken((t) => t + 1);
      // Hash change = explicit nav, drop the staged blob (we'd otherwise
      // keep showing the dropped file even after the user picked another).
      setDropped(null);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  return (
    <div className="auto-page">
      <Header
        assetId={assetId}
        draftId={draftId}
        onDraftChange={setDraftId}
        onLoad={() => {
          setDropped(null);
          setAssetId(draftId.trim() || DEFAULT_ASSET_ID);
          setRunToken((t) => t + 1);
        }}
        onReplay={() => setRunToken((t) => t + 1)}
      />
      <UploadDropzone
        onLocalPreview={(asset, id) => {
          setDropped({
            id,
            scene: asset.scene,
            displayName: asset.displayName,
            format: asset.format,
            triangleCount: asset.triangleCount,
            materialCount: asset.materialCount,
          });
          setDraftId(id);
          setRunToken((t) => t + 1);
        }}
        onPublished={(id) => {
          // Once the row is in the catalog, ditch the blob preview and
          // load the real catalog entry — that path is the one users
          // will reach via shareable URLs.
          setDropped(null);
          setAssetId(id);
          setDraftId(id);
          setRunToken((t) => t + 1);
        }}
      />
      <Body
        assetId={assetId}
        runToken={runToken}
        dropped={dropped}
      />
      <FormatShowcase />
      <HowItWorks />
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
  <header className="auto-page__header">
    <div className="auto-page__eyebrow">AUTO INGEST</div>
    <h1 className="auto-page__title">Drop in your asset.</h1>
    <h2 className="auto-page__subtitle">We render it beautifully.</h2>
    <p className="auto-page__lede">
      Twelve formats, one engine. Blueprint reveal, progressive material build,
      automatic LOD. Ship faster than your file.
    </p>

    <div className="auto-page__controls">
      <input
        id="asset-id"
        className="auto-page__input"
        type="text"
        value={draftId}
        placeholder="Asset id · e.g. mclaren-p1"
        onChange={(e) => onDraftChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onLoad();
        }}
        spellCheck={false}
      />
      <button type="button" className="auto-page__btn" onClick={onLoad}>
        Load
      </button>
      <button
        type="button"
        className="auto-page__btn auto-page__btn--ghost"
        onClick={onReplay}
      >
        Replay
      </button>
      <span className="auto-page__status">
        Showing <code>{assetId}</code>
      </span>
    </div>
  </header>
);

// ---------------------------------------------------------------------------
// FormatShowcase — Apple-style grid of every supported format with what
// each preserves and how to publish it. Replaces the dense instruction list.
// ---------------------------------------------------------------------------

interface FormatCard {
  readonly ext: string;
  readonly name: string;
  readonly tagline: string;
  readonly preserves: string;
  readonly tier: 'recommended' | 'core' | 'legacy';
}

const FORMATS: ReadonlyArray<FormatCard> = [
  { ext: '.glb',  name: 'glTF Binary',     tagline: 'The web standard.',                preserves: 'Geometry · PBR · textures · animation',  tier: 'recommended' },
  { ext: '.gltf', name: 'glTF JSON',       tagline: 'Same, with sibling files.',        preserves: 'Drop the .gltf with .bin + textures',     tier: 'recommended' },
  { ext: '.zip',  name: 'Zip bundle',      tagline: 'Multi-file in one.',               preserves: 'Auto-unpacks; basename-resolves textures', tier: 'recommended' },
  { ext: 'URL',   name: 'Spline scene',    tagline: 'Live design, baked.',              preserves: 'Runtime → THREE → bake to glTF',          tier: 'recommended' },

  { ext: '.fbx',  name: 'FBX',             tagline: 'Maya · Blender · C4D.',            preserves: 'Geometry · materials · textures via siblings', tier: 'core' },
  { ext: '.obj',  name: 'Wavefront OBJ',   tagline: 'Pair with .mtl + maps.',           preserves: 'Geometry · materials · textures',         tier: 'core' },
  { ext: '.usdz', name: 'USDZ',            tagline: 'Apple AR Quick Look.',             preserves: 'Geometry · PBR · materials',              tier: 'core' },
  { ext: '.dae',  name: 'Collada',         tagline: 'COLLADA interchange.',             preserves: 'Geometry · materials · textures',         tier: 'core' },

  { ext: '.stl',  name: 'STL',             tagline: '3D printing standard.',            preserves: 'Geometry only',                            tier: 'legacy' },
  { ext: '.ply',  name: 'PLY',             tagline: 'Stanford polygon.',                preserves: 'Geometry · vertex colors',                tier: 'legacy' },
  { ext: '.3ds',  name: '3D Studio',       tagline: 'Legacy 3DS Max.',                  preserves: 'Geometry · materials',                     tier: 'legacy' },
  { ext: '.wrl',  name: 'VRML',            tagline: 'Old-school 3D web.',               preserves: 'Geometry · basic materials',              tier: 'legacy' },
];

const FormatShowcase = () => (
  <section className="format-showcase">
    <div className="format-showcase__head">
      <span className="format-showcase__tag">SUPPORTED FORMATS</span>
      <h2 className="format-showcase__title">Twelve ways in. One engine.</h2>
      <p className="format-showcase__sub">
        Every popular 3D format works the same way. Drop, preview, publish.
        Multi-file bundles auto-resolve their textures by basename.
      </p>
    </div>
    <div className="format-showcase__grid">
      {FORMATS.map((f) => (
        <article key={f.ext} className={`format-card format-card--${f.tier}`}>
          <div className="format-card__top">
            <span className="format-card__ext">{f.ext}</span>
            <span className="format-card__tier-mark">
              {f.tier === 'recommended' ? '✓' : f.tier === 'core' ? '·' : ''}
            </span>
          </div>
          <h3 className="format-card__name">{f.name}</h3>
          <p className="format-card__tagline">{f.tagline}</p>
          <p className="format-card__preserves">{f.preserves}</p>
        </article>
      ))}
    </div>
  </section>
);

// ---------------------------------------------------------------------------
// HowItWorks — three-step Apple-style walkthrough, replaces the
// instruction-list UploadGuide.
// ---------------------------------------------------------------------------

const HowItWorks = () => (
  <section className="how-it-works">
    <div className="how-it-works__head">
      <span className="how-it-works__tag">HOW IT WORKS</span>
      <h2 className="how-it-works__title">Three steps. No code per asset.</h2>
    </div>
    <div className="how-it-works__steps">
      <div className="how-step">
        <span className="how-step__num">01</span>
        <h3 className="how-step__title">Drop your file.</h3>
        <p className="how-step__body">
          Drag any supported format into the dropzone above. Zip bundles
          unpack in your browser — no upload yet. The engine renders the
          preview as a blueprint that fills in over the real geometry.
        </p>
      </div>
      <div className="how-step">
        <span className="how-step__num">02</span>
        <h3 className="how-step__title">Inspect locally.</h3>
        <p className="how-step__body">
          The viewport shows your asset rendered through the same pipeline
          the catalog uses. Orbit, zoom, replay the build. Detected
          materials, triangles and elements show in the panel.
        </p>
      </div>
      <div className="how-step">
        <span className="how-step__num">03</span>
        <h3 className="how-step__title">Publish to the catalog.</h3>
        <p className="how-step__body">
          One click. Non-glTF formats convert in your browser via
          GLTFExporter, then upload to Supabase. The ingest worker derives
          LOD tiers and the asset becomes a sharable URL.
        </p>
      </div>
    </div>
    <p className="how-it-works__foot">
      No code changes per asset. If the reveal looks off — scale, rotation,
      missing materials — that's an exporter issue. Fix it at export time and
      drop the file again.
    </p>
  </section>
);

// ---------------------------------------------------------------------------
// Reference stage — built-in watch tiers, no Supabase needed
// ---------------------------------------------------------------------------

const ReferenceStage = ({
  runToken,
}: {
  readonly runToken: number;
}) => {
  // Build the four LOD tiers once. The engine animates opacity on these
  // same instances every replay — no rebuilds needed.
  const tiers = useMemo(() => buildReferenceWatchTiers(), []);
  const tierTris = useMemo(() => tiers.map((t) => countTriangles(t)), [tiers]);
  const totalTris = useMemo(() => tierTris.reduce((a, b) => a + b, 0), [tierTris]);

  return (
    <section className="auto-page__stage-wrap">
      <div className="auto-page__viewport">
        <AutoProgressiveHero
          tierObjects={tiers}
          runToken={runToken}
          backgroundHex={PAGE_BG_HEX}
          autoRotate={0.4}
        />
      </div>
      <aside className="auto-page__meta">
        <h3>Reference asset</h3>
        <dl>
          <dt>Id</dt>
          <dd><code>reference</code></dd>
          <dt>Tiers</dt>
          <dd>{tiers.length}</dd>
          <dt>Source</dt>
          <dd>in-process (no Supabase)</dd>
          <dt>Sum of tier tris</dt>
          <dd>{totalTris.toLocaleString()}</dd>
        </dl>
        <div className="auto-page__tier-pills">
          {tierTris.map((tris, i) => (
            <span key={i} className="auto-page__pill">
              LOD{i} · {tris.toLocaleString()} tris
            </span>
          ))}
        </div>
        <p className="auto-page__meta-note">
          This stand-in watch scene is built from plain THREE primitives at
          four progressive segment budgets. When you upload a real .glb, type
          its id above to swap in the Supabase-backed pipeline.
        </p>
      </aside>
    </section>
  );
};

// ---------------------------------------------------------------------------
// Body — fetches the catalog row and renders the hero
// ---------------------------------------------------------------------------

const Body = ({
  assetId,
  runToken,
  dropped,
}: {
  readonly assetId: string;
  readonly runToken: number;
  readonly dropped: DroppedAsset | null;
}) => {
  // Dropped-file preview wins — if the user just dropped a 3D file in the
  // dropzone, show that immediately regardless of what the asset id field
  // says. This is the "instant preview" path that supports any format the
  // universal loader can parse (.glb, .gltf, .fbx, .obj, .stl, .ply, .usdz,
  // .dae, .3ds, .vrml).
  if (dropped) {
    return <DroppedSceneStage dropped={dropped} runToken={runToken} />;
  }
  // Reference mode — built-in watch-shaped tiers. Always available even
  // without Supabase, so the demo works out of the box.
  if (assetId === REFERENCE_ID) {
    return <ReferenceStage runToken={runToken} />;
  }
  // Local-files mode — IDs that match a public/ .glb skip Supabase entirely.
  const localUrl = LOCAL_GLB_FILES[assetId.toLowerCase()];
  if (localUrl) {
    return <LocalFileStage assetId={assetId} url={localUrl} runToken={runToken} />;
  }
  if (!catalogNs.isCatalogConfigured()) return <UnconfiguredState />;
  return <CatalogBackedBody assetId={assetId} runToken={runToken} />;
};

/**
 * DroppedSceneStage — feeds a pre-loaded THREE.Object3D scene (returned
 * by the universal asset loader) directly into AutoProgressiveFromObjects.
 * Bypasses the catalog entirely. Renders a CATALOG-style sidebar that
 * shows the actual format, tri count, and material count detected from
 * the dropped file.
 */
const DroppedSceneStage = ({
  dropped,
  runToken,
}: {
  readonly dropped: DroppedAsset;
  readonly runToken: number;
}) => {
  const tierObjects = useMemo(() => [dropped.scene], [dropped.scene]);
  return (
    <section className="auto-page__stage-wrap">
      <div className="auto-page__viewport">
        <AutoProgressiveHero
          tierObjects={tierObjects}
          registryId={`dropped-${dropped.id}`}
          runToken={runToken}
          backgroundHex={PAGE_BG_HEX}
          autoRotate={0.4}
        />
      </div>
      <aside className="auto-page__meta">
        <h3>Dropped asset</h3>
        <dl>
          <dt>Id</dt>
          <dd><code>{dropped.id}</code></dd>
          <dt>File</dt>
          <dd><code>{dropped.displayName}</code></dd>
          <dt>Format</dt>
          <dd>{dropped.format.toUpperCase()}</dd>
          <dt>Triangles</dt>
          <dd>{dropped.triangleCount.toLocaleString()}</dd>
          <dt>Materials</dt>
          <dd>{dropped.materialCount}</dd>
        </dl>
        <p className="auto-page__meta-note">
          Local preview — running through the engine without touching Supabase.
          Use Publish to round-trip via the ingest pipeline (glTF only).
        </p>
      </aside>
    </section>
  );
};

/**
 * LocalFileStage — synthesises a single-tier CatalogEntry that points at
 * a static URL served by Vite from public/. The engine treats it like any
 * other catalog row but skips the ingest pipeline.
 */
const LocalFileStage = ({
  assetId,
  url,
  runToken,
}: {
  readonly assetId: string;
  readonly url: string;
  readonly runToken: number;
}) => {
  const entry = useMemo<CatalogEntry>(
    () => ({
      id: assetId,
      kind: 'mesh',
      complexityScore: 1,
      tierCount: 1,
      tiers: [
        {
          index: 0,
          url,
          ratio: 1,
          sizeBytes: 0,
        },
      ],
      heroRenderUrl: null,
      status: 'ready',
      createdAt: new Date().toISOString(),
      // Convention: if a `<asset>.proxy.bin` sits next to `<asset>.glb`
      // in /public, opt the local stage in to the proxy tier. Pages that
      // ship a proxy get the sub-100ms first paint; the rest fall back
      // to the previous "blank until Phase A" behaviour. The hero will
      // 404 silently if the .proxy.bin is missing.
      proxyUrl: url.replace(/\.glb$/i, '.proxy.bin'),
    }),
    [assetId, url],
  );
  return <CatalogStage entry={entry} runToken={runToken} />;
};

const CatalogBackedBody = ({
  assetId,
  runToken,
}: {
  readonly assetId: string;
  readonly runToken: number;
}) => {
  const state = catalogNs.useCatalogEntry(assetId);

  if (state.status === 'idle' || state.status === 'loading') {
    return <PendingState assetId={assetId} />;
  }
  if (state.status === 'error') {
    if (state.error.startsWith('no catalog row')) {
      return <MissingState assetId={assetId} />;
    }
    return <ErrorState assetId={assetId} message={state.error} />;
  }

  const entry = state.entry;
  if (entry.kind !== 'mesh') {
    return (
      <section className="auto-page__empty">
        <h2>Not a mesh asset.</h2>
        <p>
          <code>{assetId}</code> ingested as an image, not a glTF. This page
          only renders 3D catalog rows. Try <code>/#/ingest-demo</code> for
          the image variants.
        </p>
      </section>
    );
  }

  return <CatalogStage entry={entry} runToken={runToken} />;
};

const CatalogStage = ({
  entry,
  runToken,
}: {
  readonly entry: CatalogEntry;
  readonly runToken: number;
}) => {
  // Preload the tier .glbs so the first replay is instant.
  useEffect(() => {
    preloadCatalogGLBs(entry);
  }, [entry]);

  const totalTris = useMemo(
    () =>
      entry.tiers.reduce((acc, t) => acc + (t.triangles ?? 0), 0),
    [entry],
  );
  const heroSize = useMemo(() => {
    const hero = entry.tiers[entry.tiers.length - 1];
    return hero ? (hero.sizeBytes / 1024 / 1024).toFixed(2) : '—';
  }, [entry]);

  return (
    <section className="auto-page__stage-wrap">
      <div className="auto-page__viewport">
        <AutoProgressiveHero
          entry={entry}
          runToken={runToken}
          backgroundHex={PAGE_BG_HEX}
          autoRotate={0.4}
        />
      </div>
      <aside className="auto-page__meta">
        <h3>Catalog row</h3>
        <dl>
          <dt>Id</dt>
          <dd><code>{entry.id}</code></dd>
          <dt>Tiers</dt>
          <dd>{entry.tierCount}</dd>
          <dt>Complexity</dt>
          <dd>{entry.complexityScore.toFixed(2)}</dd>
          <dt>Hero size</dt>
          <dd>{heroSize} MB</dd>
          <dt>Sum of tier tris</dt>
          <dd>{totalTris.toLocaleString()}</dd>
        </dl>
        <div className="auto-page__tier-pills">
          {entry.tiers.map((t) => (
            <span key={t.index} className="auto-page__pill">
              LOD{t.index} · {(t.triangles ?? 0).toLocaleString()} tris ·{' '}
              {(t.sizeBytes / 1024).toFixed(1)} KB
            </span>
          ))}
        </div>
      </aside>
    </section>
  );
};

// ---------------------------------------------------------------------------
// State panels
// ---------------------------------------------------------------------------

const UnconfiguredState = () => (
  <section className="auto-page__empty">
    <h2>Catalog not wired yet.</h2>
    <p>
      Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>{' '}
      in <code>.env.local</code> and restart the dev server. See{' '}
      <code>ingest/README.md</code>.
    </p>
  </section>
);

const PendingState = ({ assetId }: { readonly assetId: string }) => (
  <section className="auto-page__empty">
    <h2>Reading the catalog…</h2>
    <p>Looking for <code>{assetId}</code>.</p>
  </section>
);

const ErrorState = ({
  assetId,
  message,
}: {
  readonly assetId: string;
  readonly message: string;
}) => (
  <section className="auto-page__empty auto-page__empty--error">
    <h2>Catalog read failed.</h2>
    <p>Couldn't load <code>{assetId}</code>: {message}</p>
  </section>
);

const MissingState = ({ assetId }: { readonly assetId: string }) => (
  <section className="auto-page__empty">
    <h2>Nothing ready for that id yet.</h2>
    <p>
      <code>{assetId}</code> isn't in <code>public.assets</code> with{' '}
      <code>status = 'ready'</code>. If you just uploaded, the worker may still
      be decimating — give it ~10 s and press Load again.
    </p>
  </section>
);

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const PageStyles = () => (
  <style>{`
    .auto-page {
      min-height: 100vh;
      background: ${PAGE_BG_HEX};
      color: #E7EDF2;
      font-family: var(--font-sans);
      padding: 56px 56px 160px;
      max-width: 1280px;
      margin: 0 auto;
    }
    .auto-page__header {
      max-width: 920px;
      margin: 64px auto 80px;
      text-align: center;
    }
    .auto-page__eyebrow {
      display: inline-block;
      font-size: 12px;
      font-weight: 500;
      letter-spacing: 0.32em;
      color: rgba(231, 237, 242, 0.55);
      text-transform: uppercase;
      margin-bottom: 24px;
    }
    .auto-page__title {
      font-size: clamp(48px, 6.4vw, 88px);
      line-height: 1.02;
      letter-spacing: -0.035em;
      font-weight: 600;
      margin: 0 0 4px;
      color: #f6f8fb;
    }
    .auto-page__subtitle {
      font-size: clamp(48px, 6.4vw, 88px);
      line-height: 1.02;
      letter-spacing: -0.035em;
      font-weight: 600;
      margin: 0 0 28px;
      background: linear-gradient(180deg, #8eb4d8 0%, #5d7a9e 100%);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }
    .auto-page__lede {
      max-width: 560px;
      margin: 0 auto 36px;
      font-size: 19px;
      line-height: 1.45;
      color: rgba(231, 237, 242, 0.72);
      letter-spacing: -0.005em;
    }
    .auto-page__controls {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      justify-content: center;
      margin: 0 auto;
      padding: 6px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 999px;
    }
    .auto-page__label {
      font-size: 11px;
      letter-spacing: 0.18em;
      color: #6E8FB5;
      text-transform: uppercase;
    }
    .auto-page__input {
      background: transparent;
      border: 0;
      color: #E7EDF2;
      font-family: var(--font-sans);
      font-size: 14px;
      padding: 10px 16px;
      border-radius: 999px;
      min-width: 240px;
      outline: none;
    }
    .auto-page__input::placeholder {
      color: rgba(231, 237, 242, 0.4);
    }
    .auto-page__btn {
      background: #ffffff;
      color: #0B0F14;
      font-family: var(--font-sans);
      font-size: 13px;
      font-weight: 500;
      padding: 9px 18px;
      border: none;
      border-radius: 999px;
      cursor: pointer;
      letter-spacing: 0;
      transition: background 160ms ease, transform 160ms ease;
    }
    .auto-page__btn:hover {
      background: rgba(255, 255, 255, 0.88);
      transform: translateY(-0.5px);
    }
    .auto-page__btn--ghost {
      background: transparent;
      color: #E7EDF2;
      border: 0;
      padding: 9px 14px;
    }
    .auto-page__btn--ghost:hover {
      background: rgba(255, 255, 255, 0.06);
      transform: none;
    }
    .auto-page__status {
      font-size: 12px;
      color: rgba(231, 237, 242, 0.52);
      padding: 0 10px;
    }
    .auto-page__status code {
      color: #E7EDF2;
      font-family: var(--font-sans);
    }
    .auto-page__stage-wrap {
      display: grid;
      grid-template-columns: 1fr 320px;
      gap: 32px;
      margin-bottom: 56px;
    }
    /* No border, no rounded background — 3D scene floats on the page.
       Per CLAUDE.md §13. The faint radial glow is fine because it's
       a soft ambient backdrop, not a frame. */
    .auto-page__viewport {
      position: relative;
      aspect-ratio: 16 / 10;
      background: radial-gradient(
        ellipse at center,
        rgba(110,143,181,0.08) 0%,
        transparent 70%
      );
      border: 0;
    }
    .auto-page__meta {
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 6px;
      padding: 20px 22px;
      font-size: 13px;
    }
    .auto-page__meta h3 {
      margin: 0 0 14px;
      font-size: 11px;
      letter-spacing: 0.18em;
      color: #6E8FB5;
      text-transform: uppercase;
    }
    .auto-page__meta dl {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 6px 14px;
      margin: 0 0 18px;
    }
    .auto-page__meta dt {
      color: #6E8FB5;
      font-size: 12px;
    }
    .auto-page__meta dd {
      margin: 0;
      color: #E7EDF2;
    }
    .auto-page__meta code {
      font-size: 12px;
      color: #E7EDF2;
    }
    .auto-page__tier-pills {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .auto-page__pill {
      font-size: 11px;
      color: #A9B7C6;
      background: rgba(255,255,255,0.04);
      padding: 6px 10px;
      border-radius: 3px;
    }
    .auto-page__meta-note {
      margin-top: 14px;
      font-size: 12px;
      color: #6E8FB5;
      line-height: 1.6;
    }
    .auto-page__empty {
      padding: 60px 40px;
      text-align: center;
      color: #A9B7C6;
      background: rgba(255,255,255,0.03);
      border-radius: 6px;
      margin-bottom: 40px;
    }
    .auto-page__empty h2 {
      font-size: 20px;
      color: #E7EDF2;
      margin: 0 0 10px;
    }
    .auto-page__empty--error h2 {
      color: #E87A7A;
    }
    .auto-page__guide {
      max-width: 780px;
      margin: 0 auto;
      padding: 32px 36px;
      background: rgba(255,255,255,0.025);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 6px;
    }
    .auto-page__guide h2 {
      font-size: 22px;
      margin: 0 0 16px;
      color: #E7EDF2;
    }
    .auto-page__guide ol {
      padding-left: 18px;
      color: #A9B7C6;
      font-size: 14px;
      line-height: 1.7;
    }
    .auto-page__guide code {
      background: rgba(110,143,181,0.12);
      color: #B9CDE4;
      padding: 1px 6px;
      border-radius: 3px;
      font-size: 12px;
    }
    .auto-page__guide-foot {
      margin-top: 20px;
      color: #6E8FB5;
      font-size: 13px;
    }
    @media (max-width: 1080px) {
      .auto-page__stage-wrap {
        grid-template-columns: 1fr;
      }
    }

    /* ----- Format showcase (Apple-style format grid) -------------------- */
    .format-showcase {
      max-width: 1080px;
      margin: 96px auto 80px;
      text-align: center;
    }
    .format-showcase__head { margin-bottom: 48px; }
    .format-showcase__tag {
      display: inline-block;
      font-size: 12px;
      font-weight: 500;
      letter-spacing: 0.32em;
      color: rgba(231, 237, 242, 0.55);
      text-transform: uppercase;
      margin-bottom: 18px;
    }
    .format-showcase__title {
      font-size: clamp(32px, 4vw, 56px);
      line-height: 1.05;
      letter-spacing: -0.025em;
      font-weight: 600;
      margin: 0 0 16px;
      color: #f6f8fb;
    }
    .format-showcase__sub {
      max-width: 560px;
      margin: 0 auto;
      font-size: 17px;
      line-height: 1.5;
      color: rgba(231, 237, 242, 0.66);
    }
    .format-showcase__grid {
      margin-top: 56px;
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      text-align: left;
    }
    .format-card {
      position: relative;
      padding: 24px 22px 22px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 18px;
      transition: background 200ms ease, border-color 200ms ease, transform 200ms ease;
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-height: 168px;
    }
    .format-card:hover {
      background: rgba(255, 255, 255, 0.05);
      border-color: rgba(255, 255, 255, 0.12);
      transform: translateY(-2px);
    }
    .format-card--recommended {
      background: linear-gradient(180deg, rgba(110, 143, 181, 0.12) 0%, rgba(110, 143, 181, 0.03) 100%);
      border-color: rgba(142, 180, 216, 0.28);
    }
    .format-card--recommended:hover {
      border-color: rgba(142, 180, 216, 0.55);
    }
    .format-card__top {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .format-card__ext {
      font-family: var(--font-sans);
      font-size: 13px;
      font-weight: 500;
      color: #8eb4d8;
      letter-spacing: 0.04em;
    }
    .format-card--recommended .format-card__ext { color: #b6d4ee; }
    .format-card__tier-mark {
      width: 18px; height: 18px;
      display: grid; place-items: center;
      font-size: 11px;
      color: rgba(231, 237, 242, 0.4);
      border-radius: 50%;
    }
    .format-card--recommended .format-card__tier-mark {
      color: #0B0F14;
      background: #b6d4ee;
      font-weight: 600;
    }
    .format-card__name {
      margin: 8px 0 0;
      font-size: 19px;
      font-weight: 500;
      letter-spacing: -0.01em;
      color: #f6f8fb;
    }
    .format-card__tagline {
      margin: 0;
      font-size: 13px;
      color: rgba(231, 237, 242, 0.62);
      line-height: 1.4;
    }
    .format-card__preserves {
      margin: auto 0 0;
      padding-top: 14px;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
      font-size: 11px;
      color: rgba(231, 237, 242, 0.5);
      line-height: 1.5;
      letter-spacing: 0;
    }

    /* ----- How-it-works (three Apple-style steps) ----------------------- */
    .how-it-works {
      max-width: 1080px;
      margin: 80px auto 0;
      text-align: center;
    }
    .how-it-works__head { margin-bottom: 56px; }
    .how-it-works__tag {
      display: inline-block;
      font-size: 12px;
      font-weight: 500;
      letter-spacing: 0.32em;
      color: rgba(231, 237, 242, 0.55);
      text-transform: uppercase;
      margin-bottom: 18px;
    }
    .how-it-works__title {
      font-size: clamp(32px, 4vw, 56px);
      line-height: 1.05;
      letter-spacing: -0.025em;
      font-weight: 600;
      margin: 0;
      color: #f6f8fb;
    }
    .how-it-works__steps {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
      text-align: left;
    }
    .how-step {
      padding: 32px 28px 36px;
      background: rgba(255, 255, 255, 0.025);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 22px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      transition: background 200ms ease, border-color 200ms ease;
    }
    .how-step:hover {
      background: rgba(255, 255, 255, 0.04);
      border-color: rgba(255, 255, 255, 0.12);
    }
    .how-step__num {
      font-size: 13px;
      letter-spacing: 0.18em;
      color: rgba(142, 180, 216, 0.85);
      font-weight: 500;
    }
    .how-step__title {
      margin: 4px 0 6px;
      font-size: 22px;
      font-weight: 500;
      letter-spacing: -0.018em;
      color: #f6f8fb;
    }
    .how-step__body {
      margin: 0;
      font-size: 14px;
      line-height: 1.55;
      color: rgba(231, 237, 242, 0.7);
    }
    .how-it-works__foot {
      max-width: 640px;
      margin: 48px auto 0;
      font-size: 13px;
      color: rgba(231, 237, 242, 0.5);
      line-height: 1.55;
    }

    @media (max-width: 880px) {
      .auto-page { padding: 32px 24px 96px; }
      .format-showcase__grid { grid-template-columns: repeat(2, 1fr); }
      .how-it-works__steps { grid-template-columns: 1fr; }
    }
  `}</style>
);

export default AutoCatalogPage;
