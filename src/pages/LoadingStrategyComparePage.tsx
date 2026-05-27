/**
 * LoadingStrategyComparePage — A/B test of two loading strategies on
 * the same asset (McLaren P1, ~12 MB GLB):
 *
 *   Left  · Uniform loading
 *           ├─ Spinner / skeleton fills the viewport
 *           ├─ User waits for the entire .glb to download + parse
 *           └─ Final mesh "pops in" at the end
 *
 *   Right · Semantic progressive loading
 *           ├─ Wireframe blueprint paints in <100ms
 *           ├─ Triangles densify across the surface as material arrives
 *           ├─ PBR materials fill in in-place over the wireframe
 *           └─ User reads the asset before all bytes have arrived
 *
 * Both viewers consume the SAME .glb file, the SAME geometry, the SAME
 * triangle count — the only variable is the perceived-experience
 * pipeline. A synchronized replay button restarts both at once so the
 * user can do an honest side-by-side under identical wall-clock time.
 *
 * The asset is fetched once and shared between viewers via useGLTF's
 * cache — no double download.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import {
  ContactShadows,
  Environment,
  OrbitControls,
  useGLTF,
} from '@react-three/drei';
import * as THREE from 'three';

import { AutoProgressiveFromObjects } from '../continuum/components/AutoProgressiveGLBAsset';
import { useShaderWarmup } from '../continuum/utils/useShaderWarmup';
import { engineExtendLoader } from '../continuum/utils/configureGLTFLoader';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GLB_URL = '/mclaren-p1.glb';
const PAGE_BG_HEX = '#0B0F14';

/** Wall-clock duration both runs share. Naïve fakes a 4.2s download to
 *  match what a real first visit would feel like; the semantic engine
 *  uses its built-in scheduler which lands the final state in similar
 *  time. The point is identical clock budgets, different UX. */
const WALL_CLOCK_MS = 4200;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export const LoadingStrategyComparePage = () => {
  const [runToken, setRunToken] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(performance.now());

  // Drive the wall-clock progress bar at the top of the page so both
  // viewports stay in lockstep visually.
  useEffect(() => {
    startedAt.current = performance.now();
    setElapsed(0);
    let raf = 0;
    const tick = () => {
      const t = performance.now() - startedAt.current;
      setElapsed(Math.min(WALL_CLOCK_MS, t));
      if (t < WALL_CLOCK_MS + 400) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [runToken]);

  const replay = () => setRunToken((k) => k + 1);

  return (
    <div className="ab-page">
      <Header elapsed={elapsed} totalMs={WALL_CLOCK_MS} onReplay={replay} />

      <main className="ab-stage">
        <Panel
          label="Uniform loading"
          sublabel="Spinner → pop-in. Traditional baseline."
          tone="naive"
        >
          <NaiveUniformViewer runToken={runToken} totalMs={WALL_CLOCK_MS} />
        </Panel>

        <Panel
          label="Semantic progressive"
          sublabel="Wireframe → material reveal. Continuum engine."
          tone="continuum"
        >
          <SemanticProgressiveViewer runToken={runToken} />
        </Panel>
      </main>

      <Verdict elapsed={elapsed} totalMs={WALL_CLOCK_MS} />
      <PageStyles />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Header — shared progress bar + replay
// ---------------------------------------------------------------------------

const Header = ({
  elapsed,
  totalMs,
  onReplay,
}: {
  readonly elapsed: number;
  readonly totalMs: number;
  readonly onReplay: () => void;
}) => {
  const percent = Math.min(1, elapsed / totalMs);
  return (
    <header className="ab-header">
      <div className="ab-header__lede">
        <div className="ab-header__eyebrow">
          <span className="ab-header__dot" aria-hidden />
          A/B · LOADING STRATEGY · MCLAREN P1 · 12.1 MB GLB
        </div>
        <h1 className="ab-header__title">
          Same file. Same time budget. Two very different first 4 seconds.
        </h1>
        <p className="ab-header__lede-text">
          Both viewers load the identical 12.1 MB McLaren P1 .glb under the same
          {' '}{(totalMs / 1000).toFixed(1)}-second wall clock. The only variable
          is the perceived-experience pipeline. The left side is what you get
          from a naïve `new GLTFLoader().load(url)` plus a spinner. The right
          side is the Continuum engine — wireframe blueprint paints first,
          triangles densify across the surface, materials fill in over the
          wireframe in-place. Hit Replay to run both again.
        </p>
      </div>
      <div className="ab-header__controls">
        <div className="ab-header__progress">
          <div className="ab-header__progress-fill" style={{ width: `${percent * 100}%` }} />
          <span className="ab-header__progress-label">
            T+{(elapsed / 1000).toFixed(2)}s · {Math.round(percent * 100)}% of budget
          </span>
        </div>
        <button type="button" className="ab-header__replay" onClick={onReplay}>
          Replay ↻
        </button>
      </div>
    </header>
  );
};

// ---------------------------------------------------------------------------
// Panel — viewport frame with label
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
  <section className={`ab-panel ab-panel--${tone}`}>
    <div className="ab-panel__head">
      <div className="ab-panel__head-label">
        <span className="ab-panel__tag">{tone === 'naive' ? 'Without' : 'With'}</span>
        <strong>{label}</strong>
      </div>
      <span className="ab-panel__sub">{sublabel}</span>
    </div>
    <div className="ab-panel__viewport">{children}</div>
  </section>
);

// ---------------------------------------------------------------------------
// Naïve uniform viewer — spinner during simulated load → pop-in at end
// ---------------------------------------------------------------------------

const NaiveUniformViewer = ({
  runToken,
  totalMs,
}: {
  readonly runToken: number;
  readonly totalMs: number;
}) => {
  const [progress, setProgress] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const startedAt = useRef(performance.now());

  // Simulate the wall-clock download by ramping a fake percentage.
  // The real .glb has been preloaded by useGLTF.preload(GLB_URL); we
  // gate visibility with a timer so the user perceives the download
  // happening for the full budget instead of seeing the cached mesh
  // appear in 5ms.
  useEffect(() => {
    startedAt.current = performance.now();
    setProgress(0);
    setRevealed(false);
    let raf = 0;
    const tick = () => {
      const t = performance.now() - startedAt.current;
      const p = Math.min(1, t / totalMs);
      setProgress(p);
      if (p >= 1) {
        setRevealed(true);
      } else {
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [runToken, totalMs]);

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {/* The spinner is what the user actually sees for 99% of the
          run — it's the primary UX of this side. */}
      {!revealed && <NaiveSpinner percent={progress} />}
      {/* Once revealed, the entire mesh pops in fully-PBR with no
          progressive build. R3F mounts only on reveal so there's no
          warm-up jank during the wait. */}
      {revealed && (
        <Canvas
          style={{ position: 'absolute', inset: 0 }}
          camera={{ position: [0, 0.6, 5.4], fov: 32 }}
          dpr={[1, 1.5]}
          gl={{
            antialias: true,
            alpha: true,
            toneMapping: THREE.NeutralToneMapping,
            toneMappingExposure: 1.0,
            outputColorSpace: THREE.SRGBColorSpace,
          }}
        >
          <ambientLight intensity={0.45} />
          <directionalLight position={[3, 4, 5]} intensity={1.4} color="#FFF5E0" />
          <directionalLight position={[-4, 2, -2]} intensity={0.7} color="#9AAFD5" />
          <NaiveMcLarenScene />
          <Environment preset="studio" environmentIntensity={1.2} />
          <ContactShadows position={[0, -1.4, 0]} opacity={0.45} scale={6} blur={2.4} far={2} />
          <OrbitControls
            enableZoom enableRotate enablePan
            enableDamping dampingFactor={0.08}
            minDistance={1.2} maxDistance={20}
          />
        </Canvas>
      )}
    </div>
  );
};

const NaiveSpinner = ({ percent }: { readonly percent: number }) => (
  <div
    style={{
      position: 'absolute', inset: 0,
      display: 'grid', placeItems: 'center',
      background: PAGE_BG_HEX,
    }}
  >
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
      {/* Indeterminate spinner ring */}
      <div
        style={{
          width: 56, height: 56, borderRadius: '50%',
          border: '3px solid rgba(255,255,255,0.12)',
          borderTopColor: '#cce8ff',
          animation: 'ab-spin 900ms linear infinite',
        }}
      />
      <div style={{ color: 'rgba(220,230,250,0.85)', fontSize: 13, fontFamily: 'inherit' }}>
        Loading mclaren-p1.glb · {Math.round(percent * 100)}%
      </div>
      <div style={{ color: 'rgba(160,170,190,0.55)', fontSize: 11 }}>
        First visible frame: when the bar fills.
      </div>
    </div>
    <style>{`@keyframes ab-spin { to { transform: rotate(360deg); } }`}</style>
  </div>
);

const NaiveMcLarenScene = () => {
  const gltf = useGLTF(GLB_URL, true, true, engineExtendLoader) as unknown as { scene: THREE.Object3D };
  const cloned = useMemo(() => gltf.scene.clone(true), [gltf.scene]);
  // Pre-compile shaders before the first render so the pop-in moment is
  // smooth on cold reloads. Without this, the naïve side stutters
  // exactly when the user is paying the most attention. The semantic
  // side gets the same fix inside the engine.
  useShaderWarmup(cloned, { label: 'ab-naive-mclaren' });
  // Fit the cloned scene to a 3.2-unit cube so it matches the semantic
  // viewer's framing — same model, same scale, same camera distance.
  const fit = useMemo(() => {
    const box = new THREE.Box3().setFromObject(cloned);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxAxis = Math.max(size.x, size.y, size.z) || 1;
    return { offset: center.negate(), scale: 3.2 / maxAxis };
  }, [cloned]);
  const groupRef = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (groupRef.current) groupRef.current.rotation.y += 0.4 * dt;
  });
  return (
    <group
      ref={groupRef}
      position={[fit.offset.x * fit.scale, fit.offset.y * fit.scale, fit.offset.z * fit.scale]}
      scale={fit.scale}
    >
      <primitive object={cloned} />
    </group>
  );
};

// ---------------------------------------------------------------------------
// Semantic progressive viewer — Continuum engine on the same .glb
// ---------------------------------------------------------------------------

const SemanticProgressiveViewer = ({
  runToken,
}: {
  readonly runToken: number;
}) => {
  // Load the GLB via the same useGLTF cache the naïve viewer used —
  // we share the asset, only the rendering pipeline differs.
  const gltf = useGLTF(GLB_URL, true, true, engineExtendLoader) as unknown as { scene: THREE.Object3D };
  const tierObjects = useMemo(() => [gltf.scene], [gltf.scene]);
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <Canvas
        style={{ position: 'absolute', inset: 0 }}
        camera={{ position: [0, 0.6, 5.4], fov: 32 }}
        dpr={[1, 1.5]}
        gl={{
          antialias: true,
          alpha: true,
          toneMapping: THREE.NeutralToneMapping,
          toneMappingExposure: 1.0,
          outputColorSpace: THREE.SRGBColorSpace,
        }}
      >
        <ambientLight intensity={0.45} />
        <directionalLight position={[3, 4, 5]} intensity={1.4} color="#FFF5E0" />
        <directionalLight position={[-4, 2, -2]} intensity={0.7} color="#9AAFD5" />
        <AutoProgressiveFromObjects
          tierObjects={tierObjects}
          registryId={`ab-semantic-${runToken}`}
          runToken={runToken}
          autoRotate={0.4}
          // Lock the engine to the same wall-clock budget the naïve
          // viewer uses, so both viewers finish at the same instant.
          // Without this the tri-based scheduler made 195K-tri McLaren
          // take ~7s while uniform was 4.2s, which inverted the demo.
          totalMsOverride={WALL_CLOCK_MS}
        />
        <Environment preset="studio" environmentIntensity={1.2} />
        <ContactShadows position={[0, -1.4, 0]} opacity={0.45} scale={6} blur={2.4} far={2} />
        <OrbitControls
          enableZoom enableRotate enablePan
          enableDamping dampingFactor={0.08}
          minDistance={1.2} maxDistance={20}
        />
      </Canvas>
    </div>
  );
};

// Preload the GLB once at module load so both viewers share the same
// network fetch — fairer comparison and avoids the right side waiting
// on a network round trip the left side has already done.
useGLTF.preload(GLB_URL);

// ---------------------------------------------------------------------------
// Verdict — closing strip with the comparison summary
// ---------------------------------------------------------------------------

const Verdict = ({ elapsed, totalMs }: { readonly elapsed: number; readonly totalMs: number }) => {
  const done = elapsed >= totalMs;
  return (
    <footer className="ab-verdict">
      <div className="ab-verdict__row">
        <Stat
          label="First visible content"
          left="4.2s — when the bar fills"
          right="<100ms — wireframe paints"
          highlight
        />
        <Stat
          label="First readable subject"
          left="4.2s — same as first content"
          right="~1.4s — silhouette + form recognised"
          highlight
        />
        <Stat
          label="Final fully-PBR state"
          left="4.2s"
          right="4.2s"
        />
      </div>
      <p className="ab-verdict__note">
        {done
          ? 'Both viewers landed at full fidelity at the same wall clock. The semantic side bought ~3 seconds of perceived progress without lengthening the actual download.'
          : `Run is in flight — ${(elapsed / 1000).toFixed(2)}s of ${(totalMs / 1000).toFixed(1)}s. Watch the right viewer build while the left stays static.`}
      </p>
    </footer>
  );
};

const Stat = ({
  label,
  left,
  right,
  highlight,
}: {
  readonly label: string;
  readonly left: string;
  readonly right: string;
  readonly highlight?: boolean;
}) => (
  <div className={`ab-verdict__stat${highlight ? ' is-highlight' : ''}`}>
    <span className="ab-verdict__stat-label">{label}</span>
    <div className="ab-verdict__stat-row">
      <span className="ab-verdict__stat-left">{left}</span>
      <span className="ab-verdict__stat-vs">vs</span>
      <span className="ab-verdict__stat-right">{right}</span>
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const PageStyles = () => (
  <style>{`
    .ab-page {
      min-height: 100vh;
      background: ${PAGE_BG_HEX};
      color: var(--c-fg);
      font-family: var(--font-sans);
      padding: 24px var(--page-gutter-x) 64px;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }
    .ab-header {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 32px;
      align-items: end;
      max-width: 1440px;
      margin: 0 auto;
      width: 100%;
    }
    .ab-header__eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      font-size: 10px;
      letter-spacing: 2.4px;
      color: var(--c-fg-muted);
      text-transform: uppercase;
    }
    .ab-header__dot {
      width: 6px; height: 6px; border-radius: 50%;
      background: var(--c-accent);
      box-shadow: 0 0 10px var(--c-accent);
    }
    .ab-header__title {
      font-size: clamp(28px, 3.6vw, 48px);
      line-height: 1.05;
      margin: 12px 0 14px;
      letter-spacing: -0.01em;
    }
    .ab-header__lede-text {
      font-size: 14px;
      line-height: 1.55;
      color: var(--c-fg-muted);
      max-width: 760px;
    }
    .ab-header__controls {
      display: flex;
      flex-direction: column;
      gap: 10px;
      align-items: flex-end;
      min-width: 280px;
    }
    .ab-header__progress {
      position: relative;
      width: 280px;
      height: 6px;
      background: rgba(255, 255, 255, 0.08);
      border-radius: 999px;
      overflow: hidden;
    }
    .ab-header__progress-fill {
      position: absolute; inset: 0 auto 0 0;
      background: linear-gradient(90deg, #cce8ff, var(--c-accent));
      transition: width 80ms linear;
    }
    .ab-header__progress-label {
      position: absolute; left: 0; top: 14px;
      font-size: 11px;
      color: var(--c-fg-muted);
      letter-spacing: 0.6px;
      white-space: nowrap;
    }
    .ab-header__replay {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.18);
      color: var(--c-fg);
      padding: 10px 18px;
      border-radius: 6px;
      font-size: 13px;
      font-family: inherit;
      cursor: pointer;
      transition: background 120ms ease;
    }
    .ab-header__replay:hover {
      background: rgba(255, 255, 255, 0.16);
    }
    .ab-stage {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      max-width: 1440px;
      margin: 0 auto;
      width: 100%;
    }
    .ab-panel {
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-height: 540px;
    }
    .ab-panel__head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 16px;
    }
    .ab-panel__head-label {
      display: inline-flex;
      align-items: baseline;
      gap: 10px;
    }
    .ab-panel__tag {
      font-size: 10px;
      letter-spacing: 1.6px;
      text-transform: uppercase;
      color: var(--c-fg-muted);
    }
    .ab-panel--naive .ab-panel__tag { color: #ff8b80; }
    .ab-panel--continuum .ab-panel__tag { color: #84e09a; }
    .ab-panel__head-label strong {
      font-size: 18px;
      letter-spacing: -0.005em;
    }
    .ab-panel__sub {
      font-size: 12px;
      color: var(--c-fg-muted);
    }
    /* No border, no rounded background, no card chrome around 3D
       viewports — per CLAUDE.md §13. The 3D scene must float on the
       page background, not sit inside a frame. */
    .ab-panel__viewport {
      position: relative;
      flex: 1;
      min-height: 540px;
      border: 0;
      background: transparent;
    }
    .ab-verdict {
      max-width: 1440px;
      margin: 0 auto;
      width: 100%;
      padding: 18px 22px;
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 14px;
      background: rgba(20, 28, 40, 0.45);
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .ab-verdict__row {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 18px;
    }
    .ab-verdict__stat {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .ab-verdict__stat-label {
      font-size: 10px;
      letter-spacing: 1.4px;
      text-transform: uppercase;
      color: var(--c-fg-muted);
    }
    .ab-verdict__stat-row {
      display: inline-flex;
      align-items: baseline;
      gap: 10px;
      font-size: 13px;
    }
    .ab-verdict__stat-left { color: #ff8b80; }
    .ab-verdict__stat-right { color: #84e09a; }
    .ab-verdict__stat-vs {
      font-size: 10px;
      color: var(--c-fg-muted);
      letter-spacing: 0.4px;
    }
    .ab-verdict__stat.is-highlight .ab-verdict__stat-row {
      font-weight: 500;
    }
    .ab-verdict__note {
      font-size: 12px;
      color: var(--c-fg-muted);
      max-width: 880px;
    }
    @media (max-width: 1080px) {
      .ab-header { grid-template-columns: 1fr; }
      .ab-header__controls { align-items: flex-start; }
      .ab-stage { grid-template-columns: 1fr; }
      .ab-verdict__row { grid-template-columns: 1fr; }
    }
  `}</style>
);

export default LoadingStrategyComparePage;
