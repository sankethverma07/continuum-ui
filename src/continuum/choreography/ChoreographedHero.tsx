/**
 * <ChoreographedHero src="..." /> — the real-world drop-in.
 *
 * Given any glb URL, this component renders the canonical 5-stage
 * reveal: proxy wireframe → organic surface emergence → matte form
 * → full PBR. One line of consumer code, deterministic output, no
 * pre-processing required (the Blender script optimises the result
 * but the runtime computes a sensible fallback when it's missing).
 *
 *   import { ChoreographedHero } from '@continuum/choreography/ChoreographedHero';
 *   <ChoreographedHero src="/mclaren-p1.glb" />
 *
 * Optional props let consumers re-skin the matte colour for their
 * site palette and the edge colour for their accent — both auto-adapt
 * for contrast against the supplied backgroundHex.
 */

import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import {
  ContactShadows,
  Environment,
  OrbitControls,
  useGLTF,
} from '@react-three/drei';
import * as THREE from 'three';
import { SkeletonUtils } from 'three-stdlib';

import {
  applySurfaceReveal,
  createChoreographyUniforms,
  type ChoreographyUniformGroup,
} from './surfaceReveal';
import { ensureRevealTime } from './computeRevealTime';
import {
  collectWireframeShells,
  createWireframeUniforms,
  type WireframeShellMaterialUniforms,
} from './wireframeShell';
import {
  buildRisingTriangles,
  createRisingTrianglesUniforms,
  type RisingTrianglesUniforms,
} from './risingTriangles';
import { useTimeline } from './useTimeline';
import { engineExtendLoader } from '../utils/configureGLTFLoader';

export interface ChoreographedHeroProps {
  /** The glb to reveal. Required. */
  readonly src: string;
  /** Page background colour — used to pick a contrasting matte tone if you don't override matteHex. */
  readonly backgroundHex?: string;
  /** Override the matte form colour. */
  readonly matteHex?: string;
  /** Override the emerging-edge accent colour. */
  readonly edgeHex?: string;
  /** Auto-rotate speed (rad/s × 0.4 by default). 0 disables. */
  readonly autoRotate?: number;
  /** Bump to replay the reveal cold. */
  readonly runToken?: number;
  /** Fires once the reveal hits its final PBR state. */
  readonly onRevealComplete?: () => void;
}

/** WCAG-ish neutral-grey picker — gives a matte colour that reads on both light and dark BGs. */
const pickMatteHex = (backgroundHex: string | undefined): string => {
  if (!backgroundHex) return '#bdb5a4';
  const bg = new THREE.Color(backgroundHex);
  // Compute relative luminance (rec 709).
  const lum = 0.2126 * bg.r + 0.7152 * bg.g + 0.0722 * bg.b;
  // On a dark BG, return a warm light grey; on a light BG, return a cool mid grey.
  return lum < 0.4 ? '#c8bfa9' : '#7a8087';
};

export const ChoreographedHero = ({
  src,
  backgroundHex = '#0A0E16',
  matteHex,
  edgeHex = '#e8a857',
  autoRotate = 0.35,
  runToken = 0,
  onRevealComplete,
}: ChoreographedHeroProps) => {
  return (
    <Canvas
      style={{ position: 'absolute', inset: 0 }}
      camera={{ position: [0, 0.4, 5.0], fov: 32 }}
      dpr={[1, 1.75]}
      gl={{
        antialias: true,
        alpha: true,
        toneMapping: THREE.NeutralToneMapping,
        toneMappingExposure: 1.0,
        outputColorSpace: THREE.SRGBColorSpace,
      }}
    >
      <ambientLight intensity={0.4} />
      <directionalLight position={[4, 4, 5]} intensity={1.3} color="#FFF5E0" />
      <directionalLight position={[-4, 2, -2]} intensity={0.55} color="#9AAFD5" />
      <Environment preset="studio" environmentIntensity={1.15} />

      <Suspense fallback={null}>
        <ChoreographyStage
          src={src}
          matteHex={matteHex ?? pickMatteHex(backgroundHex)}
          edgeHex={edgeHex}
          autoRotate={autoRotate}
          runToken={runToken}
          onRevealComplete={onRevealComplete}
        />
      </Suspense>

      <ContactShadows position={[0, -1.4, 0]} opacity={0.45} scale={6} blur={2.4} far={2} />
      <OrbitControls
        enableZoom enableRotate enablePan
        enableDamping dampingFactor={0.08}
        minDistance={1.2} maxDistance={20}
      />
    </Canvas>
  );
};

interface StageProps {
  readonly src: string;
  readonly matteHex: string;
  readonly edgeHex: string;
  readonly autoRotate: number;
  readonly runToken: number;
  readonly onRevealComplete: (() => void) | undefined;
}

const ChoreographyStage = ({
  src, matteHex, edgeHex, autoRotate, runToken, onRevealComplete,
}: StageProps) => {
  // Load via the engine's configured loader (KTX2 + Draco worker pool).
  const gltf = useGLTF(src, true, true, engineExtendLoader) as unknown as { scene: THREE.Object3D };

  // Per-mount scene clone — SkeletonUtils preserves materials (per CLAUDE.md §8).
  const scene = useMemo(() => SkeletonUtils.clone(gltf.scene), [gltf.scene, runToken]);

  // One uniform group per stage instance — shared across all materials in this scene.
  const uniforms = useMemo<ChoreographyUniformGroup>(
    () => createChoreographyUniforms(matteHex, edgeHex),
    // We only recreate on a colour change. runToken-bumped replays reuse the same group.
    [matteHex, edgeHex],
  );

  // Wireframe-shell uniforms — drive the signature blueprint moment.
  const wireUniforms = useMemo<WireframeShellMaterialUniforms>(
    () => createWireframeUniforms(edgeHex),
    [edgeHex],
  );

  // Rising-triangles uniforms — particle layer that forms the surface.
  const triUniforms = useMemo<RisingTrianglesUniforms>(
    () => createRisingTrianglesUniforms(matteHex, edgeHex),
    [matteHex, edgeHex],
  );

  // Bake (or read pre-baked) revealTime per vertex, then patch materials.
  useMemo(() => {
    ensureRevealTime(scene, 42);
    applySurfaceReveal(scene, uniforms);
  }, [scene, uniforms]);

  // Build the wireframe shells once per scene. We materialise the result
  // as a memoized list of THREE.LineSegments and render them as primitives
  // alongside the asset.
  const shells = useMemo(
    () => collectWireframeShells(scene, wireUniforms, 42),
    [scene, wireUniforms],
  );

  // Build the rising-triangles particle layer. Sampled uniformly across
  // every mesh's surface. Defaults: 3000 small triangles (0.05 obj-space
  // units each). This becomes the visible surface during the rise stage;
  // the actual mesh stays hidden (uSurfaceReveal=0) until particles
  // complete.
  //
  // Diagnostic mode: append "?diag=tri" to the URL to render the
  // particles as bright red MeshBasicMaterial with no displacement,
  // no discard, always on top — used to prove whether the sampler is
  // producing geometry in the right position.
  const isDiagMode =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('diag') === 'tri';

  const risingTriangles = useMemo(
    () => buildRisingTriangles(scene, triUniforms, {
      // Target edge length 0.12 — only faces with edges LARGER than this
      // get subdivided. Smaller source faces stay as-is, which naturally
      // gives the BMW variable triangle sizes: large panels (hood, doors)
      // get coarser triangulation, detailed areas (wheel arches, grille)
      // keep their finer source geometry. Reads as "designed for the shape."
      targetEdgeLength: 0.12,
      diag: isDiagMode,
    }),
    [scene, triUniforms, isDiagMode],
  );

  // Normalize position + scale to a unit-ish cube so any asset frames cleanly.
  const fit = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxAxis = Math.max(size.x, size.y, size.z) || 1;
    return { offset: center.clone().negate(), scale: 3.4 / maxAxis };
  }, [scene]);

  const { uniformsRef, isComplete } = useTimeline(runToken);

  // Push the sampled uniforms into the shader uniform group every frame.
  const groupRef = useRef<THREE.Group>(null);
  const reportedRef = useRef(false);
  const loggedSamplesRef = useRef(0);
  useEffect(() => {
    reportedRef.current = false;
    loggedSamplesRef.current = 0;
  }, [runToken]);

  useFrame((_, dt) => {
    const u = uniformsRef.current;
    uniforms.uSurfaceReveal.value        = u.surfaceReveal;
    uniforms.uPbrMix.value               = u.pbrMix;
    uniforms.uColorMix.value             = u.colorMix;
    uniforms.uShadowMix.value            = u.shadowMix;
    uniforms.uReflectionMix.value        = u.reflectionMix;
    uniforms.uBuildShimmer.value         = u.buildShimmer;
    wireUniforms.uWireframeReveal.value  = u.wireframeReveal;
    wireUniforms.uWireframeFadeOut.value = u.wireframeFadeOut;
    wireUniforms.uBuildShimmer.value     = u.buildShimmer;
    triUniforms.uAttack.value            = u.trianglesReveal;
    triUniforms.uFadeOut.value           = u.trianglesFadeOut;
    triUniforms.uTime.value              = performance.now() / 1000;

    // Debug: emit one log line each time trianglesReveal crosses a 25 %
    // threshold so we can confirm in the console that the particle stage
    // is actually ticking up. Drop after the rise is verified.
    const crossedAt = Math.floor(u.trianglesReveal * 4);
    if (crossedAt > loggedSamplesRef.current) {
      loggedSamplesRef.current = crossedAt;
      // eslint-disable-next-line no-console
      console.info(`[continuum-choreo] trianglesReveal=${u.trianglesReveal.toFixed(2)}  surfaceReveal=${u.surfaceReveal.toFixed(2)}  wire=${u.wireframeFadeOut.toFixed(2)}`);
    }

    if (groupRef.current && autoRotate > 0) {
      groupRef.current.rotation.y += autoRotate * dt;
    }
    if (!reportedRef.current && isComplete()) {
      reportedRef.current = true;
      onRevealComplete?.();
    }
  });

  return (
    <group
      ref={groupRef}
      position={[fit.offset.x * fit.scale, fit.offset.y * fit.scale, fit.offset.z * fit.scale]}
      scale={fit.scale}
    >
      <primitive object={scene} />
      {shells.map((shell, i) => (
        <primitive key={i} object={shell} />
      ))}
      {risingTriangles ? <primitive object={risingTriangles} /> : null}
    </group>
  );
};

export default ChoreographedHero;
