/**
 * CloudDemoPage — the ColorCloud overlay, isolated.
 *
 * Why a dedicated route: the ColorCloud effect needs an asset whose
 * native bbox matches the engine's framing assumptions (~3 units), and
 * a single-instance scene so the per-mesh area sampling produces an
 * even point distribution. The skull glb fits both — 3.2 × 3.3 × 3.2
 * units, one mesh, simple PBR.
 *
 * Sequence:
 *   t=0    glb fetch begins
 *   t=~1s  glb parsed; ColorCloud surface-samples 25k points and stages
 *          a "splat moment" — sparse → dense over 1.2s, holds, then
 *          fades out as the PBR settles. The PBR is always mounted;
 *          the cloud is purely additive overlay.
 *
 * This is the Luma-inspired path. The McLaren on /scenes uses the
 * canonical wireframe→PBR engine; this page is the alternative reveal.
 */

import { Suspense, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import {
  ContactShadows,
  Environment,
  OrbitControls,
  useGLTF,
} from '@react-three/drei';
import * as THREE from 'three';
import { SkeletonUtils } from 'three-stdlib';

import { ColorCloud } from '../continuum/components/ColorCloud';
import { engineExtendLoader } from '../continuum/utils/configureGLTFLoader';
import { useShaderWarmup } from '../continuum/utils/useShaderWarmup';

const GLB_URL = '/skull.glb';
const PAGE_BG_HEX = '#0A0E16';
const ACCENT = '#F2B07A';

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export const CloudDemoPage = () => {
  const [runToken, setRunToken] = useState(0);
  const replay = () => setRunToken((k) => k + 1);

  return (
    <div className="cloud-page">
      <Header onReplay={replay} />
      <main className="cloud-stage">
        <Stage runToken={runToken} />
      </main>
      <Caption />
      <PageStyles />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Header / caption
// ---------------------------------------------------------------------------

const Header = ({ onReplay }: { readonly onReplay: () => void }) => (
  <header className="cloud-header">
    <div>
      <div className="cloud-header__eyebrow">
        <span className="cloud-header__dot" aria-hidden />
        Cloud · Surface-sampled splat moment · Skull
      </div>
      <h1 className="cloud-header__title">
        Scattered color resolves into surface.
      </h1>
      <p className="cloud-header__lede">
        25,000 points sampled across the loaded glb's surfaces — each point
        coloured from the diffuse map at its UV. The cloud densifies over the
        wireframe, holds for a beat, then fades as the PBR settles. Same
        loading pattern Luma uses for their interactive scenes, ported to
        triangle-mesh PBR assets.
      </p>
    </div>
    <button type="button" className="cloud-header__replay" onClick={onReplay}>
      Replay ↻
    </button>
  </header>
);

const Caption = () => (
  <footer className="cloud-caption">
    <span>
      The cloud bridges between abstract geometry (wireframe / proxy) and
      photoreal surface (PBR) — so the eye never has to cross the whole gap
      in a single beat.
    </span>
  </footer>
);

// ---------------------------------------------------------------------------
// Stage — skull PBR + ColorCloud overlay
// ---------------------------------------------------------------------------

const Stage = ({ runToken }: { readonly runToken: number }) => (
  <div style={{ position: 'absolute', inset: 0 }} key={runToken}>
    <Canvas
      style={{ position: 'absolute', inset: 0 }}
      camera={{ position: [0, 0.4, 6.5], fov: 32 }}
      dpr={[1, 1.75]}
      gl={{
        antialias: true,
        alpha: true,
        outputColorSpace: THREE.SRGBColorSpace,
        toneMapping: THREE.NeutralToneMapping,
        toneMappingExposure: 1.0,
      }}
    >
      <RigLights />
      <Suspense fallback={null}>
        <SkullWithCloud />
      </Suspense>
      <ContactShadows
        position={[0, -1.7, 0]}
        opacity={0.5}
        scale={6}
        blur={2.4}
        far={2.5}
      />
      <OrbitControls
        enableZoom
        enableDamping
        dampingFactor={0.08}
        minDistance={3}
        maxDistance={14}
        target={[0, 0, 0]}
        autoRotate
        autoRotateSpeed={0.5}
      />
    </Canvas>
  </div>
);

const RigLights = () => (
  <>
    {/* Sculpting side-rake — eye sockets read deep, nasal cavity holds
        a hard shadow. Front-fill softens the contrast just enough. */}
    <ambientLight intensity={0.32} />
    <directionalLight position={[5, 1.5, 2]} intensity={1.5} color="#FFF5E0" />
    <directionalLight position={[-3, 0.5, 1.5]} intensity={0.5} color="#9AAFD5" />
    <directionalLight position={[0, 5, 1]} intensity={0.6} color="#FFFFFF" />
    <Environment preset="studio" environmentIntensity={0.9} />
  </>
);

// ---------------------------------------------------------------------------
// Skull + cloud orchestration
// ---------------------------------------------------------------------------

/** Scene-tree clone, materials shared — see CLAUDE.md / task #215. */
const cloneSceneSharedMaterials = (source: THREE.Object3D): THREE.Object3D =>
  SkeletonUtils.clone(source);

const SkullWithCloud = () => {
  const gltf = useGLTF(GLB_URL, true, true, engineExtendLoader) as unknown as {
    scene: THREE.Object3D;
  };
  const scene = useRef<THREE.Object3D>(cloneSceneSharedMaterials(gltf.scene)).current;
  useShaderWarmup(scene, { label: 'cloud-demo:skull' });

  // Cloud orchestration: short delay so the user sees the bare PBR for
  // ~150 ms first, then the cloud lands as a single "splat moment" and
  // fades out 1.8 s later. The PBR is mounted continuously underneath.
  const [cloudActive, setCloudActive] = useState(false);
  const [cloudVisible, setCloudVisible] = useState(false);

  useEffect(() => {
    const t1 = window.setTimeout(() => {
      setCloudActive(true);
      setCloudVisible(true);
    }, 150);
    const t2 = window.setTimeout(() => {
      setCloudVisible(false);
    }, 150 + 1800);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  return (
    <>
      <primitive object={scene} />
      <ColorCloud
        source={scene}
        pointCount={25000}
        densifyDuration={1.2}
        active={cloudActive}
        visible={cloudVisible}
        pointSize={5.5}
      />
    </>
  );
};

useGLTF.preload(GLB_URL);

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const PageStyles = () => (
  <style>{`
    .cloud-page {
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
    .cloud-header {
      display: flex;
      gap: 32px;
      justify-content: space-between;
      align-items: flex-start;
      flex-wrap: wrap;
      max-width: 1280px;
      margin: 0 auto;
      width: 100%;
    }
    .cloud-header > div { max-width: 760px; }
    .cloud-header__eyebrow {
      display: inline-flex; align-items: center; gap: 10px;
      font-family: var(--font-mono, monospace);
      font-size: 11px; letter-spacing: 0.16em;
      color: rgba(232, 238, 246, 0.55);
      text-transform: uppercase; margin-bottom: 18px;
    }
    .cloud-header__dot {
      width: 7px; height: 7px; border-radius: 50%;
      background: ${ACCENT};
      box-shadow: 0 0 10px ${ACCENT};
    }
    .cloud-header__title {
      font-size: clamp(28px, 3.4vw, 46px);
      line-height: 1.05; letter-spacing: -0.01em;
      margin: 0 0 18px; font-weight: 500;
    }
    .cloud-header__lede {
      font-size: 15px; line-height: 1.55;
      color: rgba(232, 238, 246, 0.7); margin: 0;
    }
    .cloud-header__replay {
      align-self: center;
      background: rgba(242, 176, 122, 0.12);
      color: ${ACCENT};
      border: 1px solid rgba(242, 176, 122, 0.3);
      padding: 12px 22px; border-radius: 999px;
      font-family: var(--font-mono, monospace);
      font-size: 13px; letter-spacing: 0.08em;
      cursor: pointer; transition: background 200ms ease;
    }
    .cloud-header__replay:hover { background: rgba(242, 176, 122, 0.2); }
    .cloud-stage {
      position: relative; width: 100%;
      max-width: 1480px; margin: 0 auto;
      aspect-ratio: 16 / 9; overflow: visible;
    }
    .cloud-caption {
      max-width: 1280px; margin: 0 auto; width: 100%;
      font-size: 13px; color: rgba(232, 238, 246, 0.55);
      font-family: var(--font-mono, monospace);
      letter-spacing: 0.04em; line-height: 1.6; padding-top: 8px;
    }
  `}</style>
);

export default CloudDemoPage;
