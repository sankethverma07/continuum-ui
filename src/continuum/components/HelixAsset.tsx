/**
 * <HelixAsset /> — coiled-spring (helix) demonstrator for the 4-tier
 * Continuum LOD engine. Picked because the silhouette is unmistakably
 * "spring" — a sweep of stacked rings — so it sits visually next to the
 * sphere/knot/icosahedron without looking related.
 *
 *   LOD 0 — HelixSkeleton  TubeGeometry(curve, 60, r, 6)        coarse wireframe
 *   LOD 1 — HelixFine      TubeGeometry(curve, 220, r, 14)      dense wireframe
 *   LOD 2 — HelixMid       TubeGeometry(curve, 220, r, 14)      flat steel
 *   LOD 3 — HelixHero      TubeGeometry(curve, 360, r, 24)      polished chrome
 *                                                                + emissive band
 *                                                                + warm rim light
 *
 * Polished chrome at LOD 3 reads as "lighting loads at the end" because
 * metalness=1 surfaces show off envmap intensity dramatically.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useContinuumStore, selectAsset } from '../store/useContinuumStore';
import type { LODTier } from '../store/types';

// ---------------------------------------------------------------------------
// Helix curve — parametric path that produces a 3-turn vertical spring.
// ---------------------------------------------------------------------------

class HelixCurve extends THREE.Curve<THREE.Vector3> {
  constructor(private readonly turns = 3, private readonly radius = 0.85, private readonly height = 2.4) {
    super();
  }
  getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const angle = t * this.turns * Math.PI * 2;
    const x = Math.cos(angle) * this.radius;
    const z = Math.sin(angle) * this.radius;
    const y = (t - 0.5) * this.height;
    return target.set(x, y, z);
  }
}

const TUBE_RADIUS = 0.13;

export interface HelixAssetProps {
  readonly id: string;
  readonly forceLOD?: LODTier;
  readonly position?: [number, number, number];
}

interface VariantProps { readonly opacity: number; }

const buildCurve = () => new HelixCurve(3, 0.85, 2.4);

// -- LOD 0 -------------------------------------------------------------------
const HelixSkeleton = ({ opacity }: VariantProps) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const geom = useMemo(() => new THREE.TubeGeometry(buildCurve(), 60, TUBE_RADIUS, 6, false), []);

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
      <meshBasicMaterial ref={matRef} wireframe color="#9DD8FF" transparent opacity={opacity} />
    </mesh>
  );
};

// -- LOD 1 -------------------------------------------------------------------
const HelixFine = ({ opacity }: VariantProps) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const geom = useMemo(() => new THREE.TubeGeometry(buildCurve(), 220, TUBE_RADIUS, 14, false), []);

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
      <meshBasicMaterial ref={matRef} wireframe color="#BCE4FF" transparent opacity={opacity} />
    </mesh>
  );
};

// -- LOD 2 -------------------------------------------------------------------
const HelixMid = ({ opacity }: VariantProps) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const geom = useMemo(() => new THREE.TubeGeometry(buildCurve(), 220, TUBE_RADIUS, 14, false), []);

  useEffect(() => {
    const mat = matRef.current;
    return () => { geom.dispose(); mat?.dispose(); };
  }, [geom]);

  useFrame((_s, delta) => {
    if (meshRef.current) meshRef.current.rotation.y += 0.55 * delta;
    if (matRef.current) matRef.current.opacity = opacity;
  });

  return (
    <mesh ref={meshRef} geometry={geom}>
      <meshStandardMaterial
        ref={matRef}
        color="#5E7488"
        roughness={0.55}
        metalness={0.4}
        transparent
        opacity={opacity}
      />
    </mesh>
  );
};

// -- LOD 3 -------------------------------------------------------------------
const HelixHero = ({ opacity }: VariantProps) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const bandRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const matRef = useRef<THREE.MeshPhysicalMaterial | null>(null);
  const lightRef = useRef<THREE.PointLight>(null);

  const geom = useMemo(() => new THREE.TubeGeometry(buildCurve(), 360, TUBE_RADIUS, 24, false), []);
  // Scan-line halo: a thin emissive ring that *orbits OUTSIDE the helix* and
  // travels up/down. Center radius (1.32) is comfortably larger than the
  // helix outer edge (0.85 + 0.13 = 0.98), so it never intersects the spring
  // tubes — it reads as a beam sweeping the part, not slicing through it.
  const bandGeom = useMemo(() => new THREE.TorusGeometry(1.32, 0.045, 10, 128), []);

  useEffect(() => {
    const mat = matRef.current;
    const band = bandRef.current;
    return () => {
      geom.dispose();
      bandGeom.dispose();
      mat?.dispose();
      band?.dispose();
    };
  }, [geom, bandGeom]);

  const elapsed = useRef(0);
  const bandRefMesh = useRef<THREE.Mesh>(null);

  useFrame((_s, delta) => {
    elapsed.current += delta;
    if (meshRef.current) meshRef.current.rotation.y += 0.65 * delta;
    if (matRef.current) {
      matRef.current.opacity = opacity;
      // Push envmapIntensity in case the parent scene attaches one. Even
      // without an explicit Environment, metalness=1 + clearcoat reads as
      // chrome under directional lights.
      matRef.current.envMapIntensity = 1.4 * opacity;
    }
    // Scan-line band — sinusoidal y travel between ±0.95.
    if (bandRefMesh.current) {
      bandRefMesh.current.position.y = Math.sin(elapsed.current * 1.2) * 0.95;
      bandRefMesh.current.rotation.x = Math.PI / 2;
    }
    if (bandRef.current) {
      bandRef.current.opacity = (0.4 + 0.3 * (0.5 + 0.5 * Math.sin(elapsed.current * 3))) * opacity;
    }
    if (lightRef.current) lightRef.current.intensity = 1.1 * opacity;
  });

  return (
    <group>
      {/* Polished chrome spring — full PBR. */}
      <mesh ref={meshRef} geometry={geom}>
        <meshPhysicalMaterial
          ref={matRef}
          color="#E2EBF2"
          roughness={0.18}
          metalness={1}
          clearcoat={0.6}
          clearcoatRoughness={0.25}
          transparent
          opacity={opacity}
        />
      </mesh>

      {/* Scan-line band — emissive ring drifting up and down the spring. */}
      <mesh ref={bandRefMesh} geometry={bandGeom}>
        <meshBasicMaterial
          ref={bandRef}
          color="#7CC5FF"
          transparent
          opacity={0.5 * opacity}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Lighting-loads-last — cool blue rim light that arrives with LOD 3. */}
      <pointLight
        ref={lightRef}
        color="#A7D8FF"
        intensity={0}
        distance={6}
        decay={1.5}
        position={[1.4, 0.5, 1.2]}
      />
    </group>
  );
};

// -- root --------------------------------------------------------------------
type TierMap<V> = { 0: V; 1: V; 2: V; 3: V };
const TIERS = [0, 1, 2, 3] as const;

export const HelixAsset = ({
  id,
  forceLOD,
  position = [0, 0, 0],
}: HelixAssetProps): JSX.Element => {
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
      {mounted[0] && <HelixSkeleton opacity={opacities[0]} />}
      {mounted[1] && <HelixFine     opacity={opacities[1]} />}
      {mounted[2] && <HelixMid      opacity={opacities[2]} />}
      {mounted[3] && <HelixHero     opacity={opacities[3]} />}
    </group>
  );
};
