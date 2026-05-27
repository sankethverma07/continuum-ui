/**
 * <UploadDropzone /> — drag-and-drop GLB ingest UI for the Auto page.
 *
 * Two paths from a single drop:
 *
 *   1. INSTANT PREVIEW (default): URL.createObjectURL(file) → blob URL.
 *      Zero network. The asset renders immediately in the auto viewport
 *      via the existing local-files mode. Perfect for "does my .glb even
 *      look right" inspection.
 *
 *   2. PUBLISH TO SUPABASE: `supabase.storage.from('raw').upload(...)`
 *      → the storage trigger fires the ingest Edge Function → the
 *      catalog row populates with status='ready'. Component polls the
 *      row and surfaces phase ("uploading", "processing", "ready",
 *      "failed") in the UI.
 *
 * Designed to live inside the AutoCatalogPage header. No global state —
 * parent owns the asset id + URL via callback.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  getSupabaseClient,
  isCatalogConfigured,
} from '../catalog/supabaseClient';
import {
  acceptedExtensions,
  formatLabelFor,
  isSplineSceneUrl,
  isSupportedFile,
  loadAsset,
  type LoadedAsset,
} from './assetLoader';
import { glbBufferToFile, sceneToGLB } from './gltfNormalizer';
import { loadSplineSceneFromURL } from './splineLoader';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UploadDropzoneProps {
  /** Called when a file (or bundle) finishes parsing. Gives the caller
   *  a fully-loaded THREE.Object3D scene plus metadata. */
  readonly onLocalPreview: (asset: LoadedAsset, id: string) => void;
  /** Called when the Supabase pipeline finishes processing and the
   *  catalog row is ready. Caller swaps to that asset id. */
  readonly onPublished?: (assetId: string) => void;
}

type UploadPhase =
  | { readonly kind: 'idle' }
  | { readonly kind: 'parsing'; readonly fileName: string }
  | { readonly kind: 'staged'; readonly asset: LoadedAsset; readonly file: File; readonly id: string }
  /** Running GLTFExporter on a non-glTF scene before upload. */
  | { readonly kind: 'normalising'; readonly id: string; readonly fromFormat: string }
  | { readonly kind: 'uploading'; readonly id: string; readonly file: File; readonly progress: number }
  | { readonly kind: 'processing'; readonly id: string; readonly waitedMs: number }
  | { readonly kind: 'ready'; readonly id: string }
  | { readonly kind: 'error'; readonly id: string; readonly message: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sanitise a filename into a safe Supabase asset id. Lower-case, slugified. */
const idFromFile = (file: File): string =>
  file.name
    .replace(/\.[a-z0-9]+$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'untitled';

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

/** Pick the "primary" asset file from a multi-file drop. We prefer the
 *  scene-graph file (.glb / .gltf / .fbx / .obj / etc.) and treat the rest
 *  as siblings (textures, .bin, .mtl, etc.). If multiple primaries are
 *  dropped, the first one wins. */
const choosePrimary = (files: ReadonlyArray<File>): File | null => {
  // Prefer in this order — richer manifests first.
  const order = ['gltf', 'glb', 'fbx', 'obj', 'dae', 'usdz', 'stl', 'ply', '3ds', 'wrl', 'vrml'];
  for (const ext of order) {
    const found = files.find((f) => f.name.toLowerCase().endsWith(`.${ext}`));
    if (found) return found;
  }
  return files.find(isSupportedFile) ?? null;
};

// ---------------------------------------------------------------------------
// Polling helper — waits for the catalog row to flip to 'ready' or 'failed'
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 90_000;

interface PollResult {
  readonly status: 'ready' | 'failed';
  readonly error?: string;
}

const pollForCatalogRow = async (id: string, signal: AbortSignal): Promise<PollResult> => {
  const client = getSupabaseClient();
  const startedAt = performance.now();
  while (!signal.aborted) {
    const elapsed = performance.now() - startedAt;
    if (elapsed > POLL_TIMEOUT_MS) {
      return { status: 'failed', error: 'timed out waiting for ingest worker' };
    }
    const { data, error } = await client
      .from('assets')
      .select('status, error')
      .eq('id', id)
      .maybeSingle();
    if (error) {
      // Non-fatal — keep polling. PostgREST cache lag is common immediately
      // after an upsert; we forgive transient errors.
    } else if (data?.status === 'ready') {
      return { status: 'ready' };
    } else if (data?.status === 'failed') {
      return { status: 'failed', error: (data.error as string) ?? 'ingest failed' };
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return { status: 'failed', error: 'cancelled' };
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const UploadDropzone = ({ onLocalPreview, onPublished }: UploadDropzoneProps) => {
  const [phase, setPhase] = useState<UploadPhase>({ kind: 'idle' });
  const [splineUrl, setSplineUrl] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Last-staged record so "Try again" after a failure can return to the
  // exact stage the user was at instead of dropping back to idle.
  const lastStagedRef = useRef<
    { asset: LoadedAsset; file: File; id: string } | null
  >(null);
  // We don't need to manually revoke blob URLs anymore — assetLoader does
  // that internally per file. We do keep an abort controller for the
  // Supabase publish path.
  useEffect(() => () => {
    abortRef.current?.abort();
  }, []);

  /**
   * Handle one or more dropped files. Picks the primary file (.glb, .fbx,
   * .obj, etc.), passes the rest as siblings (textures, .bin, .mtl), and
   * invokes the universal loader to produce a THREE.Object3D scene.
   */
  const handleFiles = useCallback(async (files: ReadonlyArray<File>) => {
    if (!files.length) return;
    const primary = choosePrimary(files);
    if (!primary) {
      setPhase({
        kind: 'error',
        id: files[0]!.name,
        message: `Unsupported file. Try one of: ${acceptedExtensions.join(', ')}`,
      });
      return;
    }
    const id = idFromFile(primary);
    setPhase({ kind: 'parsing', fileName: primary.name });
    try {
      const asset = await loadAsset({ primary, siblings: files });
      lastStagedRef.current = { asset, file: primary, id };
      setPhase({ kind: 'staged', asset, file: primary, id });
      onLocalPreview(asset, id);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setPhase({ kind: 'error', id, message });
    }
  }, [onLocalPreview]);

  const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const onDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const list = e.dataTransfer.files;
    if (!list || list.length === 0) return;
    const files: File[] = [];
    for (let i = 0; i < list.length; i++) files.push(list.item(i)!);
    void handleFiles(files);
  }, [handleFiles]);

  const onPick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const onInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list || list.length === 0) return;
    const files: File[] = [];
    for (let i = 0; i < list.length; i++) files.push(list.item(i)!);
    void handleFiles(files);
    // Reset the input so picking the same file again still fires onChange.
    e.target.value = '';
  }, [handleFiles]);

  /** Load a Spline scene from a public URL. The runtime is lazy-loaded
   *  from esm.sh on first call; subsequent loads are cached. The
   *  loader returns the underlying THREE.Scene the Spline Application
   *  builds, which feeds straight into the LOD engine via the same
   *  onLocalPreview path used by file drops. */
  const onSplineLoad = useCallback(async () => {
    const url = splineUrl.trim();
    if (!url) return;
    if (!isSplineSceneUrl(url)) {
      setPhase({
        kind: 'error',
        id: 'spline-url',
        message: 'Not a recognised Spline URL. Expected https://prod.spline.design/...',
      });
      return;
    }
    // Sanitise URL → asset id. Spline URLs look like
    // https://prod.spline.design/<scene-id>/scene.splinecode — we use
    // the scene-id as the id so refreshing the page deduces it.
    const idMatch = url.match(/spline\.design\/([^/?#]+)/i);
    const id = (idMatch?.[1] ?? 'spline-scene').toLowerCase().slice(0, 60);

    setPhase({ kind: 'parsing', fileName: 'Spline scene' });
    try {
      const scene = await loadSplineSceneFromURL(url);
      // Tally the same way the file path does so the sidebar shows
      // matching numbers regardless of source.
      let triangleCount = 0;
      const seenMaterials = new Set<unknown>();
      scene.traverse((obj) => {
        // Avoid importing THREE just for instanceof; structural check.
        const mesh = obj as { isMesh?: boolean; geometry?: { index?: { count: number }; getAttribute?: (n: string) => { count: number } | undefined }; material?: unknown };
        if (!mesh.isMesh) return;
        const g = mesh.geometry;
        if (g?.index) triangleCount += Math.floor(g.index.count / 3);
        else if (g?.getAttribute) {
          const pos = g.getAttribute('position');
          if (pos) triangleCount += Math.floor(pos.count / 3);
        }
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) if (m) seenMaterials.add(m);
      });
      const asset: LoadedAsset = {
        scene,
        format: 'spline',
        displayName: url,
        triangleCount,
        materialCount: seenMaterials.size,
      };
      // Stage it so the user sees a Previewing line + Publish button,
      // exactly as if they had dropped a file.
      const placeholderFile = new File([new ArrayBuffer(0)], `${id}.spline`, { type: 'application/octet-stream' });
      lastStagedRef.current = { asset, file: placeholderFile, id };
      setPhase({
        kind: 'staged',
        asset,
        // Synthesise a placeholder File for the staged record. We never
        // use it for non-glTF publishing (GLTFExporter takes the scene
        // directly), but the type system wants one.
        file: placeholderFile,
        id,
      });
      onLocalPreview(asset, id);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setPhase({ kind: 'error', id, message });
    }
  }, [splineUrl, onLocalPreview]);

  const publish = useCallback(async () => {
    if (phase.kind !== 'staged') return;
    const { file, id, asset } = phase;
    if (!isCatalogConfigured()) {
      setPhase({ kind: 'error', id, message: 'Supabase env vars missing — see ingest/README.md.' });
      return;
    }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      // Normalise non-glTF formats to .glb in-browser before upload.
      // The Edge Function only knows how to derive LOD tiers from a .glb;
      // converting here keeps the server simple and the client universal.
      // Already-glTF input is uploaded as-is (no double conversion).
      let uploadFile: File;
      if (asset.format === 'glb' || asset.format === 'gltf') {
        uploadFile = file;
      } else {
        setPhase({ kind: 'normalising', id, fromFormat: formatLabelFor(asset.format) });
        const glbBuf = await sceneToGLB(asset.scene);
        uploadFile = glbBufferToFile(glbBuf, file.name);
      }

      setPhase({ kind: 'uploading', id, file: uploadFile, progress: 0 });
      const client = getSupabaseClient();
      // After normalisation everything lands as source.glb. The Edge
      // Function's extension check (`/\.(glb|gltf)$/i`) passes uniformly.
      const path = `${id}/source.glb`;
      const { error: upErr } = await client.storage
        .from('raw')
        .upload(path, uploadFile, {
          contentType: 'model/gltf-binary',
          upsert: true,
        });
      if (upErr) throw upErr;

      // Now wait for the trigger → Edge Function → catalog update.
      setPhase({ kind: 'processing', id, waitedMs: 0 });
      const tickStart = performance.now();
      const tickHandle = window.setInterval(() => {
        setPhase((p) =>
          p.kind === 'processing' ? { ...p, waitedMs: performance.now() - tickStart } : p,
        );
      }, 250);

      const result = await pollForCatalogRow(id, ctrl.signal);
      clearInterval(tickHandle);

      if (result.status === 'ready') {
        setPhase({ kind: 'ready', id });
        onPublished?.(id);
      } else {
        setPhase({ kind: 'error', id, message: result.error ?? 'unknown error' });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setPhase({ kind: 'error', id, message });
    }
  }, [phase, onPublished]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    lastStagedRef.current = null;
    setPhase({ kind: 'idle' });
  }, []);

  /**
   * "Try again" handler — return to the staged state so publish() works
   * on the original asset without forcing the user to re-pick the file
   * or re-import the Spline URL. If we have no staged record (somehow
   * the error fired before staging) fall back to a full reset.
   */
  const retry = useCallback(() => {
    abortRef.current?.abort();
    const staged = lastStagedRef.current;
    if (staged) {
      setPhase({ kind: 'staged', asset: staged.asset, file: staged.file, id: staged.id });
    } else {
      setPhase({ kind: 'idle' });
    }
  }, []);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div
      className={`upload-dropzone${dragOver ? ' upload-dropzone--drag' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={`.zip,${acceptedExtensions.join(',')}`}
        onChange={onInputChange}
        style={{ display: 'none' }}
      />

      {phase.kind === 'idle' && (
        <div className="upload-dropzone__cta">
          <strong>Drop a 3D file (or a .zip bundle) here</strong>
          <span className="upload-dropzone__sub">
            .zip · {acceptedExtensions.join(' · ')} · multi-file drops resolve textures by basename
          </span>
          <div className="upload-dropzone__row">
            <button type="button" className="upload-dropzone__btn" onClick={onPick}>
              Choose file(s)
            </button>
            <span className="upload-dropzone__sub">or paste a Spline URL →</span>
            <input
              className="upload-dropzone__url"
              type="text"
              placeholder="https://prod.spline.design/..."
              value={splineUrl}
              onChange={(e) => setSplineUrl(e.target.value)}
            />
            <button
              type="button"
              className="upload-dropzone__btn"
              onClick={() => void onSplineLoad()}
              disabled={!splineUrl.trim()}
              title="Loads via Spline runtime, then routes through the LOD engine like any other 3D file."
            >
              Import
            </button>
          </div>
        </div>
      )}

      {phase.kind === 'parsing' && (
        <PhaseLine
          label="Parsing"
          detail={phase.fileName}
          spinner
        />
      )}

      {phase.kind === 'staged' && (
        <StagedView
          file={phase.file}
          id={phase.id}
          asset={phase.asset}
          onPublish={publish}
          onReset={reset}
          publishable={isCatalogConfigured()}
        />
      )}

      {phase.kind === 'normalising' && (
        <PhaseLine
          label="Converting to glTF"
          detail={`${phase.id} · ${phase.fromFormat} → .glb in browser`}
          spinner
        />
      )}

      {phase.kind === 'uploading' && (
        <PhaseLine
          label="Uploading to Supabase"
          detail={`${phase.id} · ${formatBytes(phase.file.size)}`}
          spinner
        />
      )}

      {phase.kind === 'processing' && (
        <PhaseLine
          label="Ingesting"
          detail={`${phase.id} · waited ${(phase.waitedMs / 1000).toFixed(1)}s`}
          spinner
        />
      )}

      {phase.kind === 'ready' && (
        <PhaseLine
          label="Published"
          detail={`${phase.id} is in the catalog`}
          tone="ok"
          actionLabel="Upload another"
          onAction={reset}
        />
      )}

      {phase.kind === 'error' && (
        <PhaseLine
          label="Upload failed"
          detail={`${phase.id}: ${phase.message}`}
          tone="error"
          actionLabel={lastStagedRef.current ? 'Try again' : 'Reset'}
          onAction={retry}
        />
      )}

      <DropzoneStyles />
    </div>
  );
};

const StagedView = ({
  file,
  id,
  asset,
  onPublish,
  onReset,
  publishable,
}: {
  readonly file: File;
  readonly id: string;
  readonly asset: LoadedAsset;
  readonly onPublish: () => void;
  readonly onReset: () => void;
  readonly publishable: boolean;
}) => {
  const isGltf = asset.format === 'glb' || asset.format === 'gltf';
  return (
    <div className="upload-dropzone__staged">
      <div className="upload-dropzone__row">
        <strong>Previewing</strong>
        <code className="upload-dropzone__pill">{file.name}</code>
        <span className="upload-dropzone__sub">
          {formatLabelFor(asset.format)} · {formatBytes(file.size)} · {asset.triangleCount.toLocaleString()} tris · {asset.materialCount} mats · id <code>{id}</code>
        </span>
      </div>
      <div className="upload-dropzone__row">
        <button
          type="button"
          className="upload-dropzone__btn upload-dropzone__btn--primary"
          onClick={onPublish}
          disabled={!publishable}
          title={
            !publishable
              ? 'Set VITE_SUPABASE_URL/ANON_KEY to enable publishing.'
              : isGltf
                ? 'Upload to raw bucket; the trigger handles the rest.'
                : `Convert ${formatLabelFor(asset.format)} to .glb in browser, then upload.`
          }
        >
          Publish to Supabase
        </button>
        <button type="button" className="upload-dropzone__btn" onClick={onReset}>
          Drop a different file
        </button>
      </div>
      {!publishable && (
        <span className="upload-dropzone__sub upload-dropzone__sub--warn">
          Supabase env vars missing — local preview only.
        </span>
      )}
      {publishable && !isGltf && (
        <span className="upload-dropzone__sub">
          {formatLabelFor(asset.format)} will be converted to .glb in your browser via GLTFExporter before upload.
        </span>
      )}
    </div>
  );
};

const PhaseLine = ({
  label,
  detail,
  spinner,
  tone,
  actionLabel,
  onAction,
}: {
  readonly label: string;
  readonly detail: string;
  readonly spinner?: boolean;
  readonly tone?: 'ok' | 'error';
  readonly actionLabel?: string;
  readonly onAction?: () => void;
}) => (
  <div className={`upload-dropzone__phase upload-dropzone__phase--${tone ?? 'info'}`}>
    {spinner && <span className="upload-dropzone__spinner" aria-hidden />}
    <strong>{label}</strong>
    <span className="upload-dropzone__sub">{detail}</span>
    {actionLabel && onAction && (
      <button type="button" className="upload-dropzone__btn" onClick={onAction}>
        {actionLabel}
      </button>
    )}
  </div>
);

// ---------------------------------------------------------------------------
// Styles — co-located so the consumer page doesn't have to import a CSS file
// ---------------------------------------------------------------------------

const DropzoneStyles = () => (
  <style>{`
    .upload-dropzone {
      border: 1.5px dashed rgba(255, 255, 255, 0.18);
      border-radius: 14px;
      padding: 18px 22px;
      background: rgba(20, 28, 40, 0.55);
      transition: border-color 160ms ease, background 160ms ease;
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-height: 96px;
      box-sizing: border-box;
    }
    .upload-dropzone--drag {
      border-color: rgba(120, 200, 255, 0.75);
      background: rgba(30, 50, 80, 0.7);
    }
    .upload-dropzone__cta {
      display: flex;
      flex-direction: column;
      gap: 6px;
      align-items: flex-start;
    }
    .upload-dropzone__sub {
      color: rgba(200, 210, 225, 0.65);
      font-size: 12px;
    }
    .upload-dropzone__sub--warn {
      color: #ffb86b;
    }
    .upload-dropzone__btn {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.18);
      color: #eaf0f8;
      padding: 6px 14px;
      border-radius: 8px;
      font-size: 13px;
      font-family: inherit;
      cursor: pointer;
      transition: background 120ms ease;
    }
    .upload-dropzone__btn:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.16);
    }
    .upload-dropzone__btn:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
    .upload-dropzone__btn--primary {
      background: rgba(120, 200, 255, 0.18);
      border-color: rgba(120, 200, 255, 0.55);
      color: #cce8ff;
    }
    .upload-dropzone__btn--primary:hover:not(:disabled) {
      background: rgba(120, 200, 255, 0.3);
    }
    .upload-dropzone__staged {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .upload-dropzone__row {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .upload-dropzone__pill {
      background: rgba(255, 255, 255, 0.08);
      padding: 2px 8px;
      border-radius: 6px;
      font-size: 12px;
      font-family: 'JetBrains Mono', ui-monospace, monospace;
    }
    .upload-dropzone__url {
      flex: 1 1 280px;
      min-width: 220px;
      background: rgba(0, 0, 0, 0.32);
      border: 1px solid rgba(255, 255, 255, 0.14);
      color: #eaf0f8;
      padding: 6px 10px;
      border-radius: 8px;
      font-size: 12px;
      font-family: 'JetBrains Mono', ui-monospace, monospace;
    }
    .upload-dropzone__url::placeholder {
      color: rgba(200, 210, 225, 0.4);
    }
    .upload-dropzone__phase {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 13px;
      flex-wrap: wrap;
    }
    .upload-dropzone__phase--ok strong { color: #84e09a; }
    .upload-dropzone__phase--error strong { color: #ff8b80; }
    .upload-dropzone__spinner {
      width: 14px;
      height: 14px;
      border: 2px solid rgba(255, 255, 255, 0.18);
      border-top-color: #cce8ff;
      border-radius: 50%;
      animation: dz-spin 700ms linear infinite;
      display: inline-block;
    }
    @keyframes dz-spin { to { transform: rotate(360deg); } }
  `}</style>
);

export default UploadDropzone;
