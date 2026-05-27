/**
 * <CrystalAsset /> — faceted icosahedron "crystal" demonstrator for the
 * 4-tier Continuum LOD engine. Unique silhouette (sharp polyhedron, not a
 * sphere / knot) so the Gallery visibly holds four DIFFERENT assets.
 *
 *   LOD 0 — CrystalSkeleton    IcosahedronGeometry(1.3, 0)    coarse wireframe
 *   LOD 1 — CrystalFine        IcosahedronGeometry(1.3, 1)    dense wireframe
 *   LOD 2 — CrystalMid         IcosahedronGeometry(1.3, 1)    flat violet facet
 *   LOD 3 — CrystalHero        IcosahedronGeometry(1.3, 2)    transmission +
 *                                                              refraction + inner core
 *
 * The hero tier is the payoff — a real MeshPhysicalMaterial with
 * `transmission: 1` and `ior: 1.55` so light bends through the facets, a
 * smaller inner icosahedron as the "core", and a tight point light that
 * only appears in LOD 3 (the "lighting loads last" beat, same as the other
 * hero tiers).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useContinuumStore, selectAsset } from '../store/useContinuumStore';
import type { LODTier } from '../store/types';

const RADIUS = 1.3;

export interface CrystalAssetProps {
  readonly id: string;
  readonly forceLOD?: LODTier;
  readonly position?: [number, number, number];
}

interface VariantProps { readonly opacity: number; }

// -- LOD 0 -------------------------------------------------------------------
const CrystalSkeleton = ({ opacity }: VariantProps) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const geom = useMemo(() => new THREE.IcosahedronGeometry(RADIUS, 0), []);

  useEffect(() => {
    const mat = matRef.current;
    return () => { geom.dispose(); mat?.dispose(); };
  }, [geom]);

  useFrame((_s, delta) => {
    if (meshRef.current) meshRef.current.rotation.y += 0.25 * delta;
    if (matRef.current) matRef.current.opacity = opacity;
  });

  return (
    <mesh ref={meshRef} geometry={geom}>
      <meshBasicMaterial ref={matRef} wireframe color="#C8A8FF" transparent opacity={opacity} />
    </mesh>
  );
};

// -- LOD 1 -------------------------------------------------------------------
const CrystalFine = ({ opacity }: VariantProps) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const geom = useMemo(() => new THREE.IcosahedronGeometry(RADIUS, 1), []);

  useEffect(() => {
    const mat = matRef.current;
    return () => { geom.dispose(); mat?.dispose(); };
  }, [geom]);

  useFrame((_s, delta) => {
    if (meshRef.current) meshRef.current.rotation.y += 0.32 * delta;
    if (matRef.current) matRef.current.opacity = opacity;
  });

  return (
    <mesh ref={meshRef} geometry={geom}>
      <meshBasicMaterial ref={matRef} wireframe color="#D8BFFF" transparent opacity={opacity} />
    </mesh>
  );
};

// -- LOD 2 -------------------------------------------------------------------
const CrystalMid = ({ opacity }: VariantProps) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshStandardMaterial | null>(null);
  // Flat-shaded icosahedron at detail 1 — the facets pop because normals are
  // per-face (flatShading) not smoothed.
  const geom = useMemo(() => {
    const g = new THREE.IcosahedronGeometry(RADIUS, 1);
    g.computeVertexNormals();
    return g;
  }, []);

  useEffect(() => {
    const mat = matRef.current;
    return () => { geom.dispose(); mat?.dispose(); };
  }, [geom]);

  useFrame((_s, delta) => {
    if (meshRef.current) meshRef.current.rotation.y += 0.42 * delta;
    if (matRef.current) matRef.current.opacity = opacity;
  });

  return (
    <mesh ref={meshRef} geometry={geom}>
      <meshStandardMaterial
        ref={matRef}
        color="#8A6BC8"
        flatShading
        roughness={0.6}
        metalness={0.1}
        transparent
        opacity={opacity}
      />
    </mesh>
  );
};

// -- LOD 3 -------------------------------------------------------------------
const CrystalHero = ({ opacity }: VariantProps) => {
  const spinRef = useRef<THREE.Group>(null);
  const shellRef = useRef<THREE.MeshPhysicalMaterial | null>(null);
  const coreRef  = useRef<THREE.MeshBasicMaterial | null>(null);
  const lightRef = useRef<THREE.PointLight>(null);

  // Detail 2 — ~320 faces. Enough to carry smooth facet highlights without
  // breaking the crystal silhouette into roundness.
  const shellGeom = useMemo(() => {
    const g = new THREE.IcosahedronGeometry(RADIUS, 2);
    g.computeVertexNormals();
    return g;
  }, []);
  const coreGeom = useMemo(() => new THREE.IcosahedronGeometry(RADIUS * 0.45, 0), []);

  useEffect(() => {
    const shell = shellRef.current;
    const core = coreRef.current;
    return () => {
      shellGeom.dispose();
      coreGeom.dispose();
      shell?.dispose();
      core?.dispose();
    };
  }, [shellGeom, coreGeom]);

  const elapsed = useRef(0);
  useFrame((_s, delta) => {
    elapsed.current += delta;
    if (spinRef.current) {
      spinRef.current.rotation.y += 0.45 * delta;
      spinRef.current.rotation.x += 0.08 * delta;
    }
    const breath = 0.5 + 0.5 * Math.sin(elapsed.current * 1.8);
    if (shellRef.current) {
      shellRef.current.opacity = opacity;
      shellRef.current.transmission = 0.95 * opacity;
    }
    if (coreRef.current) coreRef.current.opacity = (0.55 + 0.3 * breath) * opacity;
    if (lightRef.current) lightRef.current.intensity = (0.8 + 0.6 * breath) * opacity;
  });

  return (
    <group ref={spinRef}>
      {/* Outer refractive shell — real glass-gem behaviour. */}
      <mesh geometry={shellGeom}>
        <meshPhysicalMaterial
          ref={shellRef}
          color="#C8B5FF"
          roughness={0.06}
          metalness={0}
          transmission={0.95}
          thickness={0.6}
          ior={1.55}
          clearcoat={1}
          clearcoatRoughness={0.05}
          attenuationColor="#9B7CFF"
          attenuationDistance={1.6}
          transparent
          opacity={opacity}
        />
      </mesh>

      {/* Inner emissive core — seen THROUGH the transmissive shell. */}
      <mesh geometry={coreGeom}>
        <meshBasicMaterial
          ref={coreRef}
          color="#FFD9F5"
          transparent
          opacity={0.7 * opacity}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Lighting-loads-last beat — a violet point light tracking the core. */}
      <pointLight
        ref={lightRef}
        color="#B89DFF"
        intensity={0}
        distance={5}
        decay={1.4}
        position={[0, 0, 0]}
      />
    </group>
  );
};

// -- root --------------------------------------------------------------------
type TierMap<V> = { 0: V; 1: V; 2: V; 3: V };
const TIERS = [0, 1, 2, 3] as const;

export const CrystalAsset = ({
  id,
  forceLOD,
  position = [0, 0, 0],
}: CrystalAssetProps): JSX.Element => {
  const reg = useContinuumStore(selectAsset(id));
  const effectiveLOD: LODTier =
    forceLOD ?? (Math.min(reg?.maxLOD ?? 3, 3) as LODTier);

  useEffect(() => {
    const store = useContinuumStore.getState();
    store.registerAsset(id);
    store.setStatus(id, 'ready');
    return () => { useContinuumStore.getState().unregisterAsset(id); };
  }, [id]);

  useEffect(() => {
    useContinuumStore.getState().setLOD(id, effectiveLOD);
  }, [id, effectiveLOD]);

  const opacityRef = useRef<TierMap<number>>({
    0: effectiveLOD === 0 ? 1 : 0,
    1: effectiveLOD === 1 ? 1 : 0,
    2: effectiveLOD === 2 ? 1 : 0,
    3: effectiveLOD === 3 ? 1 : 0,
  });

  const [opacities, setOpacities] = useState<TierMap<number>>(() => ({ ...opacityRef.current }));
  const [mounted, setMounted] = useState<TierMap<boolean>>(() => ({
    0: effectiveLOD === 0, 1: effectiveLOD === 1,
    2: effectiveLOD === 2, 3: effectiveLOD === 3,
  }));

  useEffect(() => {
    setMounted((p) => ({ ...p, [effectiveLOD]: true }));
  }, [effectiveLOD]);

  useFrame(() => {
    const LERP = 0.18;
    let sync = false;
    for (const t of TIERS) {
      const target = t === effectiveLOD ? 1 : 0;
      const cur = opacityRef.current[t];
      const next = cur + (target - cur) * LERP;
      opacityRef.current[t] = next;
      if ((cur >= 0.01 && next < 0.01) || (cur < 0.01 && next >= 0.01)) sync = true;
    }
    if (sync) {
      const snap = { ...opacityRef.current };
      setOpacities(snap);
      setMounted({
        0: snap[0] >= 0.01, 1: snap[1] >= 0.01,
        2: snap[2] >= 0.01, 3: snap[3] >= 0.01,
      });
    }
  });

  return (
    <group position={position}>
      {mounted[0] && <CrystalSkeleton opacity={opacities[0]} />}
      {mounted[1] && <CrystalFine     opacity={opacities[1]} />}
      {mounted[2] && <CrystalMid      opacity={opacities[2]} />}
      {mounted[3] && <CrystalHero     opacity={opacities[3]} />}
    </group>
  );
};
