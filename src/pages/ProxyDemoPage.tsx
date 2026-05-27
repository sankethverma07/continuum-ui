/**
 * ProxyDemoPage — A/B test of two cold-load patterns:
 *
 *   LEFT  · No proxy
 *           ├─ Spinner / blank
 *           ├─ Wait for the full PBR glb to fetch + parse
 *           └─ Asset pops in
 *
 *   RIGHT · Proxy-first
 *           ├─ Fetch the position-only `.proxy.bin` (lightweight)
 *           ├─ Render its wireframe in <100 ms — user sees the SHAPE
 *           ├─ Full PBR streams in the background
 *           └─ Crossfade proxy → PBR when the full asset lands
 *
 * Both viewers use the exact same final asset (`spaceship.glb`) so the
 * variable is only the bridge tier between "loading" and "fully loaded".
 *
 * Why this exists:
 *   - Continuum's whole thesis is progressive loading. The proxy tier
 *     pushes that thesis one step further than what the wireframe-build
 *     phase can do, because the wireframe phase needs the parsed glb
 *     to densify; the proxy doesn't.
 *   - Quotable spec: "Continuum starts rendering before your asset
 *     finishes downloading."
 */

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import {
  ContactShadows,
  Environment,
  OrbitControls,
  useGLTF,
} from '@react-three/drei';
import * as THREE from 'three';
import { SkeletonUtils } from 'three-stdlib';

import { WireframeProxy } from '../continuum/components/WireframeProxy';
import type { ProxyMetrics } from '../continuum/components/WireframeProxy';
import { engineExtendLoader } from '../continuum/utils/configureGLTFLoader';
import { useShaderWarmup } from '../continuum/utils/useShaderWarmup';

/**
 * Clone a glTF scene safely so two side-by-side viewers don't trample
 * each other.
 *
 * **Critical: do NOT clone materials.** Three.js's `material.clone()`
 * silently drops texture bindings on complex PBR materials (those using
 * KHR_materials extensions like sheen, clearcoat, transmission, or
 * pbrSpecularGlossiness — exactly what this spaceship glb uses). The
 * cloned mesh renders with the base color but no diffuse/normal/ORM
 * maps, looking like grey clay instead of textured metal. This regression
 * was already documented in CLAUDE.md / engine task #215.
 *
 * The fix: SkeletonUtils.clone gives each viewer its own scene tree
 * (independent Object3D parents — needed because Three.js won't render
 * the same Object3D in two scenes), but materials stay SHARED across
 * viewers. To avoid one viewer's crossfade mutating the other's
 * materials, NEITHER viewer mutates materials at all — visibility is
 * controlled at the group level via `<group visible>`.
 */
const cloneSceneSharedMaterials = (source: THREE.Object3D): THREE.Object3D => {
  return SkeletonUtils.clone(source);
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GLB_URL = '/spaceship.glb';
const PROXY_URL = '/spaceship.proxy.bin';
const PAGE_BG_HEX = '#0B0F14';

/**
 * Asset framing.
 *
 * We tried runtime auto-fit with `Box3.setFromObject`, but the spaceship
 * GLB contains multiple ship instances spread out in world space, so the
 * union bbox is much larger than any single ship — auto-fit made
 * everything tiny.
 *
 * We tried using the proxy.bin's header bbox, but the proxy strips
 * non-position primitives, so its bbox is tighter than the glb's, which
 * caused antennas and superstructure to clip past the top of frame
 * ("chopped" look).
 *
 * Solution: hardcode a slightly-larger-than-proxy bbox derived from the
 * actual glb content, with enough headroom that antennas, spires, and
 * the top instance of the multi-ship layout all fit comfortably. We
 * also tilt the camera down a touch so the long Y axis of the asset
 * reads as horizontal in frame instead of being clipped vertically.
 */
const SPACESHIP_BBOX_MIN = new THREE.Vector3(-15, -19, -8);
const SPACESHIP_BBOX_MAX = new THREE.Vector3(15, 39, 9);
const NORMALIZED_SIZE = 4.0; // longest-axis target. Combined with the
                              // camera fov below this leaves ~25% margin
                              // on every edge so multi-ship layouts and
                              // antenna spires don't clip.

const NORMALIZATION = (() => {
  const center = new THREE.Vector3()
    .addVectors(SPACESHIP_BBOX_MIN, SPACESHIP_BBOX_MAX)
    .multiplyScalar(0.5);
  const size = new THREE.Vector3()
    .subVectors(SPACESHIP_BBOX_MAX, SPACESHIP_BBOX_MIN);
  const maxDim = Math.max(size.x, size.y, size.z);
  const scale = NORMALIZED_SIZE / maxDim;
  return {
    scale,
    translate: center.clone().multiplyScalar(-scale),
  };
})();

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export const ProxyDemoPage = () => {
  const [runToken, setRunToken] = useState(0);
  const replay = () => setRunToken((k) => k + 1);

  return (
    <div className="proxy-page">
      <Header onReplay={replay} />
      <main className="proxy-stage">
        <Panel
          label="No proxy"
          sublabel="Wait for full PBR glb. Blank until ready."
          tone="naive"
        >
          <NaiveViewer runToken={runToken} />
        </Panel>
        <Panel
          label="Proxy-first"
          sublabel="Wireframe paints in <100 ms while PBR streams."
          tone="continuum"
        >
          <ProxyViewer runToken={runToken} />
        </Panel>
      </main>
      <PageStyles />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

const Header = ({ onReplay }: { readonly onReplay: () => void }) => (
  <header className="proxy-header">
    <div className="proxy-header__lede">
      <div className="proxy-header__eyebrow">
        <span className="proxy-header__dot" aria-hidden />
        Proxy tier · Position-only first paint · Spaceship · 27 MB glb
      </div>
      <h1 className="proxy-header__title">
        Render the shape before the file finishes downloading.
      </h1>
      <p className="proxy-header__lede-text">
        Both viewers load the same `spaceship.glb`. The right side ships an
        extra 2.4 MB position-only proxy that paints a wireframe of the asset's
        silhouette in &lt;100 ms — long before the full PBR is ready. When the
        full glb lands, it crossfades over the wireframe. Hit Replay to run both
        cold again.
      </p>
    </div>
    <button type="button" className="proxy-header__replay" onClick={onReplay}>
      Replay ↻
    </button>
  </header>
);

// ---------------------------------------------------------------------------
// Panel — viewport frame
// ---------------------------------------------------------------------------

const Panel = ({
  label,
  sublabel,
  tone,
  children,
}: {
  readonly label: string;
  readonly sublabel: string;
  readonly tone: 'naive' | 'continuum';
  readonly children: React.ReactNode;
}) => (
  <section className={`proxy-panel proxy-panel--${tone}`}>
    <div className="proxy-panel__head">
      <div className="proxy-panel__head-label">
        <span className="proxy-panel__tag">
          {tone === 'naive' ? 'Without' : 'With'}
        </span>
        <strong>{label}</strong>
      </div>
      <span className="proxy-panel__sub">{sublabel}</span>
    </div>
    <div className="proxy-panel__viewport">{children}</div>
  </section>
);

// ---------------------------------------------------------------------------
// NormalizedGroup — applies the static spaceship normalization computed
// above. Both viewers use this so the proxy wireframe and the PBR mesh
// stay aligned during the crossfade.
// ---------------------------------------------------------------------------

const NormalizedGroup = ({ children }: { readonly children: ReactNode }) => (
  <group
    scale={NORMALIZATION.scale}
    position={NORMALIZATION.translate.toArray()}
  >
    {children}
  </group>
);

// ---------------------------------------------------------------------------
// Standard rig — same camera + lights for both viewers.
// ---------------------------------------------------------------------------

const RigLights = () => (
  <>
    <ambientLight intensity={0.35} />
    {/* Side-rake key light — sculpts the panel detail on the hull. */}
    <directionalLight position={[5, 1.5, 2]} intensity={1.6} color="#FFF5E0" />
    {/* Cool fill on the opposite side. */}
    <directionalLight position={[-3, 0.5, 1.5]} intensity={0.4} color="#9AAFD5" />
    {/* Top hair light — separates the top of the hull from the dark bg. */}
    <directionalLight position={[0, 5, 1]} intensity={0.5} color="#FFFFFF" />
    {/* Rim back-lights for silhouette punch. */}
    <directionalLight position={[-3, 1.5, -4]} intensity={0.8} color="#C9D6FF" />
    <directionalLight position={[3, 1.5, -4]} intensity={0.6} color="#FFE0B0" />
    <Environment preset="studio" environmentIntensity={1.4} />
  </>
);

// ---------------------------------------------------------------------------
// Naïve viewer — only the full glb. Blank canvas until it's loaded.
// ---------------------------------------------------------------------------

const NaiveViewer = ({ runToken }: { readonly runToken: number }) => {
  const [stats, setStats] = useState<{ ms: number; kb: number } | null>(null);

  return (
    <div style={{ position: 'absolute', inset: 0 }} key={runToken}>
      <Canvas
        style={{ position: 'absolute', inset: 0 }}
        // Camera looks slightly down at the ship from a bit above
        // (y=0.6) so the long-axis multi-ship layout reads horizontally
        // in frame instead of clipping the verticals.
        camera={{ position: [0, 0.6, 7.5], fov: 32 }}
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: true, outputColorSpace: THREE.SRGBColorSpace }}
      >
        <RigLights />
        <Suspense fallback={null}>
          <NormalizedGroup>
            <NaiveSpaceship onLoaded={setStats} />
          </NormalizedGroup>
        </Suspense>
        <ContactShadows position={[0, -2.2, 0]} opacity={0.45} scale={8} blur={2.6} far={3} />
        <OrbitControls
          enableZoom
          enableDamping
          dampingFactor={0.08}
          minDistance={2}
          maxDistance={18}
          target={[0, 0, 0]}
        />
      </Canvas>
      <Stats stats={stats} kind="full glb" />
    </div>
  );
};

const NaiveSpaceship = ({
  onLoaded,
}: {
  readonly onLoaded: (s: { ms: number; kb: number }) => void;
}) => {
  const startedAt = useRef(performance.now());
  const gltf = useGLTF(GLB_URL, true, true, engineExtendLoader) as unknown as {
    scene: THREE.Object3D;
  };
  // Scene-tree-only clone. Materials are shared with the proxy viewer
  // (and the underlying useGLTF cache) — see cloneSceneSharedMaterials
  // docstring for why we never clone materials on PBR assets.
  const scene = useMemo(() => cloneSceneSharedMaterials(gltf.scene), [gltf.scene]);
  useShaderWarmup(scene, { label: 'proxy-demo:naive' });
  useEffect(() => {
    const ms = Math.round(performance.now() - startedAt.current);
    // Approximate transferred bytes from performance entry.
    const entry = performance
      .getEntriesByType('resource')
      .find((r) => r.name.endsWith(GLB_URL.replace(/^\//, '')));
    const kb =
      entry && 'transferSize' in entry
        ? Math.round((entry as PerformanceResourceTiming).transferSize / 1024)
        : 0;
    onLoaded({ ms, kb });
  }, [onLoaded]);
  return <primitive object={scene} />;
};

// ---------------------------------------------------------------------------
// Proxy viewer — wireframe paints first, full glb crossfades on top.
// ---------------------------------------------------------------------------

const ProxyViewer = ({ runToken }: { readonly runToken: number }) => {
  const [proxyMetrics, setProxyMetrics] = useState<ProxyMetrics | null>(null);
  const [glbReady, setGlbReady] = useState(false);
  const [glbStats, setGlbStats] = useState<{ ms: number; kb: number } | null>(null);

  // We use the same key trick as the naive viewer to fully reset on replay.
  return (
    <div style={{ position: 'absolute', inset: 0 }} key={runToken}>
      <Canvas
        style={{ position: 'absolute', inset: 0 }}
        camera={{ position: [0, 0.6, 7.5], fov: 32 }}
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: true, outputColorSpace: THREE.SRGBColorSpace }}
      >
        <RigLights />

        {/* Both the proxy wireframe and the PBR mesh share the same
            normalization transform — they're sourced from the SAME glb
            so they line up pixel-perfect during the crossfade. */}
        <NormalizedGroup>
          {/* Proxy wireframe — paints almost instantly, fades out when
              the full PBR is ready. */}
          <WireframeProxy
            src={PROXY_URL}
            color="#F2B07A"
            opacity={0.9}
            visible={!glbReady}
            onReady={setProxyMetrics}
          />

          {/* Full PBR — fades in when ready. Wraps in Suspense so it
              doesn't block the proxy from rendering. */}
          <Suspense fallback={null}>
            <ProxySpaceship
              onLoaded={(stats) => {
                setGlbStats(stats);
                // Small delay so the user actually sees the wireframe
                // settle before the PBR takes over. Otherwise on a fast
                // local connection the two land together.
                setTimeout(() => setGlbReady(true), 200);
              }}
              visible={glbReady}
            />
          </Suspense>
        </NormalizedGroup>

        <ContactShadows position={[0, -2.2, 0]} opacity={0.45} scale={8} blur={2.6} far={3} />
        <OrbitControls
          enableZoom
          enableDamping
          dampingFactor={0.08}
          minDistance={2}
          maxDistance={18}
          target={[0, 0, 0]}
        />
      </Canvas>

      <Stats
        stats={glbStats}
        kind="full glb"
        proxyMetrics={proxyMetrics}
      />
    </div>
  );
};

const ProxySpaceship = ({
  onLoaded,
  visible,
}: {
  readonly onLoaded: (s: { ms: number; kb: number }) => void;
  readonly visible: boolean;
}) => {
  const startedAt = useRef(performance.now());
  const gltf = useGLTF(GLB_URL, true, true, engineExtendLoader) as unknown as {
    scene: THREE.Object3D;
  };
  // Scene-tree-only clone. Materials are SHARED with the naive viewer
  // and the useGLTF cache. We do NOT mutate them — visibility is
  // controlled at the group level. See cloneSceneSharedMaterials for
  // why we can't clone materials on this asset.
  const scene = useMemo(() => cloneSceneSharedMaterials(gltf.scene), [gltf.scene]);
  useShaderWarmup(scene, { label: 'proxy-demo:proxy-first' });

  useEffect(() => {
    const ms = Math.round(performance.now() - startedAt.current);
    const entry = performance
      .getEntriesByType('resource')
      .find((r) => r.name.endsWith(GLB_URL.replace(/^\//, '')));
    const kb =
      entry && 'transferSize' in entry
        ? Math.round((entry as PerformanceResourceTiming).transferSize / 1024)
        : 0;
    onLoaded({ ms, kb });
  }, [scene, onLoaded]);

  // Group-level visibility toggle — the wireframe is rendered above and
  // hides via its own (owned) line material's opacity. The PBR pops on
  // when `visible` flips true; the wireframe fade-out provides the
  // visual continuity.
  return <primitive object={scene} visible={visible} />;
};

useGLTF.preload(GLB_URL);

// ---------------------------------------------------------------------------
// Stats overlay — corner readouts for the demo
// ---------------------------------------------------------------------------

const Stats = ({
  stats,
  kind,
  proxyMetrics,
}: {
  readonly stats: { ms: number; kb: number } | null;
  readonly kind: string;
  readonly proxyMetrics?: ProxyMetrics | null;
}) => (
  <div className="proxy-stats" aria-hidden>
    {proxyMetrics && (
      <div className="proxy-stats__row proxy-stats__row--proxy">
        <span className="proxy-stats__k">PROXY</span>
        <span>
          {Math.round(proxyMetrics.bytesTransferred / 1024)} KB ·{' '}
          {proxyMetrics.fetchMs + proxyMetrics.parseMs} ms ·{' '}
          {proxyMetrics.triangleCount.toLocaleString()} tri
        </span>
      </div>
    )}
    {stats ? (
      <div className="proxy-stats__row">
        <span className="proxy-stats__k">{kind.toUpperCase()}</span>
        <span>
          {stats.kb} KB · {stats.ms} ms
        </span>
      </div>
    ) : (
      <div className="proxy-stats__row proxy-stats__row--pending">
        <span className="proxy-stats__k">{kind.toUpperCase()}</span>
        <span>loading…</span>
      </div>
    )}
  </div>
);

// ---------------------------------------------------------------------------
// Useful inline helper - avoid importing PerformanceResourceTiming in TS-strict
// ---------------------------------------------------------------------------

// (left intentionally — type-only narrowing happens inline above)

// ---------------------------------------------------------------------------
// Page styles — same dark + amber language as the A/B page
// ---------------------------------------------------------------------------

const PageStyles = () => (
  <style>{`
    .proxy-page {
      min-height: 100vh;
      background: ${PAGE_BG_HEX};
      color: #E8EEF6;
      font-family: var(--font-sans);
      padding: 60px 4vw 80px;
      box-sizing: border-box;
    }
    .proxy-header {
      max-width: 1280px;
      margin: 0 auto 40px;
      display: flex;
      gap: 32px;
      align-items: flex-start;
      justify-content: space-between;
      flex-wrap: wrap;
    }
    .proxy-header__lede { max-width: 760px; }
    .proxy-header__eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      font-family: var(--font-mono, 'JetBrains Mono', monospace);
      font-size: 11px;
      letter-spacing: 0.16em;
      color: rgba(232, 238, 246, 0.55);
      text-transform: uppercase;
      margin-bottom: 18px;
    }
    .proxy-header__dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #F2B07A;
      box-shadow: 0 0 8px rgba(242, 176, 122, 0.7);
    }
    .proxy-header__title {
      font-size: clamp(28px, 3.4vw, 46px);
      line-height: 1.05;
      letter-spacing: -0.01em;
      margin: 0 0 18px;
      font-weight: 500;
    }
    .proxy-header__lede-text {
      font-size: 15px;
      line-height: 1.55;
      color: rgba(232, 238, 246, 0.7);
      margin: 0;
    }
    .proxy-header__replay {
      align-self: center;
      background: rgba(242, 176, 122, 0.12);
      color: #F2B07A;
      border: 1px solid rgba(242, 176, 122, 0.3);
      padding: 12px 22px;
      border-radius: 999px;
      font-family: var(--font-mono, 'JetBrains Mono', monospace);
      font-size: 13px;
      letter-spacing: 0.08em;
      cursor: pointer;
      transition: background 200ms ease, color 200ms ease;
    }
    .proxy-header__replay:hover {
      background: rgba(242, 176, 122, 0.2);
    }

    .proxy-stage {
      max-width: 1480px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
    }
    @media (max-width: 900px) {
      .proxy-stage { grid-template-columns: 1fr; }
    }

    .proxy-panel {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .proxy-panel__head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }
    .proxy-panel__head-label {
      display: inline-flex;
      gap: 12px;
      align-items: baseline;
      font-size: 16px;
    }
    .proxy-panel__tag {
      font-family: var(--font-mono, monospace);
      font-size: 11px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: rgba(232, 238, 246, 0.45);
    }
    .proxy-panel--naive .proxy-panel__tag { color: #F08F7A; }
    .proxy-panel--continuum .proxy-panel__tag { color: #BCEBA0; }

    .proxy-panel__sub {
      font-size: 13px;
      color: rgba(232, 238, 246, 0.55);
    }
    .proxy-panel__viewport {
      position: relative;
      width: 100%;
      aspect-ratio: 4 / 3;
      border: 0;
      background: transparent;
      overflow: visible;
      border-radius: 0;
    }

    .proxy-stats {
      position: absolute;
      bottom: 16px;
      left: 16px;
      right: 16px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      pointer-events: none;
      font-family: var(--font-mono, monospace);
      font-size: 11px;
      letter-spacing: 0.06em;
    }
    .proxy-stats__row {
      display: inline-flex;
      gap: 12px;
      align-items: center;
      color: rgba(232, 238, 246, 0.85);
      width: fit-content;
      padding: 6px 10px;
      border-radius: 6px;
      background: rgba(11, 15, 20, 0.55);
      backdrop-filter: blur(8px);
    }
    .proxy-stats__row--proxy { color: #F2B07A; }
    .proxy-stats__row--pending { color: rgba(232, 238, 246, 0.5); font-style: italic; }
    .proxy-stats__k {
      font-size: 9px;
      letter-spacing: 0.18em;
      opacity: 0.65;
    }
  `}</style>
);

export default ProxyDemoPage;
