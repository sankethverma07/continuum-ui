/**
 * <AutoProgressiveHero /> — Canvas + lighting wrapper.
 *
 * Accepts EITHER a catalog `entry` (production path — .glb URLs loaded from
 * Supabase) OR a pre-built `tierObjects` array (demo path — e.g. the
 * reference watch). One of the two is required; `entry` wins if both are
 * supplied.
 */

import { Suspense, useEffect, useMemo, useState } from 'react';
import type { ComponentProps } from 'react';
import { Canvas } from '@react-three/fiber';
import { ContactShadows, Environment, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

import type { CatalogEntry } from '../catalog/types';
import {
  AutoProgressiveFromObjects,
  AutoProgressiveGLBAsset,
} from './AutoProgressiveGLBAsset';
import {
  DEFAULT_BLUEPRINT_COLOR,
  pickBlueprintColor,
} from './WristwatchAsset';
import { WireframeProxy } from './WireframeProxy';

export interface AutoProgressiveHeroProps {
  /**
   * Convenience API — pass a URL string and the engine constructs a
   * minimal CatalogEntry for you. Use this for one-line integration:
   *   <AutoProgressiveHero src="/my-hero.glb" />
   * Prefer `entry` when you need full control (Supabase rows, custom
   * tier ratios, opt-in proxy paint, etc).
   */
  readonly src?: string;
  /**
   * Opt the simple `src` path into the position-only proxy paint phase.
   * Pass `true` to auto-discover a sibling `<src>.proxy.bin`, or a
   * string to point at a specific proxy URL. Defaults to off — only
   * enable when the asset's native bbox is roughly the engine's
   * normalized size (~3 units) so the proxy doesn't render at a wildly
   * different scale than the engine's PBR pass.
   */
  readonly proxy?: boolean | string;
  readonly entry?: CatalogEntry;
  readonly tierObjects?: ReadonlyArray<THREE.Object3D>;
  readonly registryId?: string;
  readonly runToken?: number;
  readonly autoRotate?: number;
  readonly background?: string;
  readonly backgroundHex?: string;
  readonly blueprintColor?: string;
  readonly onHydrated?: () => void;
}

/**
 * Build a minimal one-tier CatalogEntry from a bare URL — used when a
 * page wants the simplest possible integration and doesn't need any of
 * the Supabase / ingest-pipeline metadata. Memoised by the caller via
 * useMemo so the entry reference is stable across renders.
 */
const entryFromSrc = (src: string, proxy: boolean | string | undefined): CatalogEntry => {
  const proxyUrl =
    typeof proxy === 'string'
      ? proxy
      : proxy === true
        ? src.replace(/\.glb$/i, '.proxy.bin')
        : undefined;
  const base: CatalogEntry = {
    id: src,
    kind: 'mesh',
    complexityScore: 1,
    tierCount: 1,
    tiers: [{ index: 0, url: src, ratio: 1, sizeBytes: 0 }],
    heroRenderUrl: null,
    status: 'ready',
    createdAt: new Date(0).toISOString(),
  };
  return proxyUrl ? { ...base, proxyUrl } : base;
};

export const AutoProgressiveHero = ({
  src,
  proxy,
  entry: entryProp,
  tierObjects,
  registryId,
  runToken = 0,
  autoRotate = 0.35,
  background,
  backgroundHex,
  blueprintColor,
  onHydrated,
}: AutoProgressiveHeroProps) => {
  // Derive entry from src if no explicit entry was passed. useMemo keeps
  // the reference stable so the engine doesn't reset on every render.
  const entry = useMemo<CatalogEntry | undefined>(() => {
    if (entryProp) return entryProp;
    if (src) return entryFromSrc(src, proxy);
    return undefined;
  }, [entryProp, src, proxy]);
  const id = registryId ?? (entry ? `auto-${entry.id}` : 'auto-reference');

  const resolvedBlueprintColor = useMemo(() => {
    if (blueprintColor) return blueprintColor;
    if (backgroundHex) return pickBlueprintColor(backgroundHex);
    return DEFAULT_BLUEPRINT_COLOR;
  }, [blueprintColor, backgroundHex]);

  // Tracks whether the engine has mounted past Suspense — i.e. the
  // hero glb is loaded and the engine is about to render. Until that
  // flips, the WireframeProxy (rendered OUTSIDE the Suspense boundary)
  // paints the asset's silhouette so the user sees something within
  // ~50 ms instead of staring at a blank canvas.
  const [engineReady, setEngineReady] = useState(false);
  // Reset proxy visibility on every replay or asset change so the
  // hand-off animates cleanly each time. MUST be useEffect, not
  // useMemo — setState inside useMemo runs during render and creates
  // a feedback loop that pins the flag to false (proxy stays stuck
  // visible forever).
  useEffect(() => {
    setEngineReady(false);
  }, [runToken, entry?.id]);

  return (
    <div
      data-continuum-hero={id}
      data-continuum-kind="auto-progressive"
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        background: background ?? 'transparent',
      }}
    >
      <Canvas
        style={{ position: 'absolute', inset: 0 }}
        // Camera at slight up-angle, distance 7 so 3.2-unit assets fit
        // comfortably. y=-0.4 looks slightly UP at face-level features
        // (skull eye sockets, character faces). Down/aerial views remain
        // available via OrbitControls.
        camera={{ position: [0, -0.4, 7.0], fov: 32 }}
        dpr={[1, 1.75]}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
          // Neutral tonemapping — Khronos glTF standard. Preserves PBR
          // base colors more faithfully than ACES (which crushes
          // saturated mid-tones into milky greys for dramatic film look).
          // Sketchfab's "PBR Neutral" profile uses this; we match it so
          // diffuse-painted assets (skull bone color, free-fire foliage)
          // appear as authored. Fully-metallic assets still get proper
          // env-map highlights via the boosted environmentIntensity.
          toneMapping: THREE.NeutralToneMapping,
          toneMappingExposure: 1.0,
          outputColorSpace: THREE.SRGBColorSpace,
        }}
      >
        {/* Raking studio rig — the key light comes from the SIDE
            (almost grazing) instead of front-top. Side-rake is what
            sculpts geometric detail: it casts deep shadows into recessed
            features (eye sockets, nasal cavity, jaw line on the skull;
            panel gaps + wheel arches on a car) and highlights the
            high-frequency surface variation. Front-top lighting (what we
            had before) flattens those same features into a uniform wash.

            Ambient stays low so the side-rake's shadows actually hold
            their darkness; a soft warm fill on the opposite side keeps
            the shadowed half from crushing to pure black. */}
        <ambientLight intensity={0.28} />
        {/* Key — almost-horizontal rake from the right, slightly above. */}
        <directionalLight position={[5, 1.2, 2]} intensity={1.7} color="#FFF5E0" />
        {/* Soft fill — opposite side, lower intensity, cooler so the
            shadow side reads as ambient-occluded rather than re-lit. */}
        <directionalLight position={[-3, 0.5, 1.5]} intensity={0.45} color="#9AAFD5" />
        {/* Top-down hair light — defines the cranium dome separately from
            the face, so the skull doesn't look like a single egg shape. */}
        <directionalLight position={[0, 5, 1]} intensity={0.55} color="#FFFFFF" />
        {/* Rim back-lights — punch out the silhouette so the model reads
            as a solid 3D form even when ambient is low. */}
        <directionalLight position={[-3, 1.5, -4]} intensity={0.9} color="#C9D6FF" />
        <directionalLight position={[3, 1.5, -4]} intensity={0.7} color="#FFE0B0" />
        <pointLight position={[0, -3, 2]} intensity={0.25} color="#D7A86E" />

        {/* Sub-LOD-0 proxy paint. Rendered OUTSIDE the Suspense boundary
            so it displays while the full glb is still parsing. The proxy
            fetches the position-only `.proxy.bin`, paints a wireframe
            silhouette in <100 ms, and fades out as soon as the engine
            mounts past Suspense. Only fires for catalog entries that
            opted in via `proxyUrl`. Pages without a proxy fall back
            cleanly to the previous "blank until Phase A" behaviour. */}
        {entry?.proxyUrl && !engineReady && (
          <WireframeProxy
            src={entry.proxyUrl}
            color={resolvedBlueprintColor}
            opacity={0.85}
          />
        )}

        <Suspense fallback={null}>
          {entry ? (
            <ProxyAwareGLBAsset
              entry={entry}
              registryId={id}
              autoRotate={0}
              runToken={runToken}
              blueprintColor={resolvedBlueprintColor}
              onHydrated={onHydrated}
              onMounted={() => setEngineReady(true)}
            />
          ) : tierObjects ? (
            <AutoProgressiveFromObjects
              tierObjects={tierObjects}
              registryId={id}
              autoRotate={0}
              runToken={runToken}
              blueprintColor={resolvedBlueprintColor}
              onHydrated={onHydrated}
            />
          ) : null}
          {/* Studio HDRI at 1.4 — calibrated specifically for the
              spaceship case where ALL hero materials have metallic=1.
              Fully-metallic PBR materials sample this environment to
              produce their entire surface appearance (no diffuse
              component to fall back on). At 0.55 they rendered nearly
              black; at 1.4 the chrome exoskeleton shows proper silver
              metallic highlights matching the Sketchfab reference. */}
          <Environment preset="studio" environmentIntensity={1.6} />
        </Suspense>
        <ContactShadows
          position={[0, -1.8, 0]}
          opacity={0.45}
          scale={6}
          blur={2.4}
          far={2}
        />
        {/* OrbitControls — mouse-wheel zooms in/out, left-drag orbits,
            right-drag pans. Damping smooths out the motion so it doesn't
            feel jittery. minDistance keeps the camera from clipping into
            small assets; maxDistance keeps you from losing the model. */}
        <OrbitControls
          enableZoom
          enableRotate
          enablePan
          enableDamping
          dampingFactor={0.08}
          minDistance={1.2}
          maxDistance={20}
          zoomSpeed={1.1}
          rotateSpeed={0.8}
          panSpeed={0.6}
          // Camera-orbit auto-rotation. Drives the camera around the
          // model rather than spinning the model itself, so the user can
          // grab the orbit and still see a stable, oriented asset.
          // Engines below get autoRotate={0} so they don't fight this.
          autoRotate={autoRotate > 0}
          autoRotateSpeed={autoRotate * 2.4}
        />
      </Canvas>
    </div>
  );
};

export default AutoProgressiveHero;

/**
 * ProxyAwareGLBAsset — thin wrapper around AutoProgressiveGLBAsset that
 * fires `onMounted` once it renders past the Suspense boundary. Because
 * `useGLTF` inside the engine suspends until the glb has parsed, this
 * component can only mount AFTER the glb is loaded. The `useEffect` on
 * first mount is therefore a reliable "engine is now ready" signal —
 * the parent uses it to fade the proxy wireframe out.
 */
const ProxyAwareGLBAsset = ({
  onMounted,
  ...rest
}: ComponentProps<typeof AutoProgressiveGLBAsset> & {
  readonly onMounted: () => void;
}) => {
  useEffect(() => {
    onMounted();
    // We only want the FIRST mount-past-Suspense to flip the flag.
    // The parent resets engineReady on replay, which remounts this
    // wrapper anyway. eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <AutoProgressiveGLBAsset {...rest} />;
};
