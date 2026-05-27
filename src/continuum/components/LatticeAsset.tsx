/**
 * <LatticeAsset /> — the "ball with revolving cubes" demonstrator for the
 * 4-tier Continuum LOD engine. Pure procedural; no .glb, no Spline.
 *
 * All four tiers share the SAME sphere silhouette — only tessellation and
 * material progress. The user reads a single form picking up detail, not a
 * sequence of different shapes swapping:
 *
 *   LOD 0 — LatticeSkeleton     SphereGeometry(1.5, 12, 6)    coarse wireframe
 *   LOD 1 — LatticeFineBlueprint SphereGeometry(1.5, 48, 24)  dense wireframe
 *   LOD 2 — LatticeMid          SphereGeometry(1.5, 48, 24)   flat yellow base
 *   LOD 3 — LatticeHero         SphereGeometry(1.5, 128, 96)  AAA yellow fur +
 *                                                             glowing cubes
 *
 * LOD 3 is the "lighting loads last" moment — the orbiting cubes ramp up an
 * emissive glow and a tight point-light, sold like the final pass of an
 * Unreal cinematic. This matches the brief for the ball-with-revolving-cube
 * asset: a yellow-furred hero with a cube that *glows* to show lighting has
 * finally arrived.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useContinuumStore, selectAsset } from '../store/useContinuumStore';
import type { LODTier } from '../store/types';

// ---------------------------------------------------------------------------
// Shared geometry constants
// ---------------------------------------------------------------------------

const SPHERE_R = 1.5;

// ---------------------------------------------------------------------------
// Procedural yellow-fur textures for LOD 3
// ---------------------------------------------------------------------------

/**
 * Build canvas-backed textures that sell a soft yellow-fur finish:
 *   - colorMap:  warm yellow base with fine warm/cool fiber tufts
 *   - bumpMap:   grayscale field of short directional hair strokes
 *   - roughMap:  high roughness baseline with a few glossier tip highlights
 *
 * The "fur" is implied, not simulated — short directional strokes + bump
 * detail fool the eye into reading velvet / plush at normal viewing distance.
 */
const buildFurTextures = (): {
  colorMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} => {
  const SIZE = 512;

  // --- Color map: warm yellow with amber-blond fiber strokes ---------------
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = SIZE;
  colorCanvas.height = SIZE;
  const cctx = colorCanvas.getContext('2d')!;
  const base = cctx.createLinearGradient(0, 0, SIZE, SIZE);
  base.addColorStop(0, '#F9D760');
  base.addColorStop(0.5, '#F0C13F');
  base.addColorStop(1, '#C98E20');
  cctx.fillStyle = base;
  cctx.fillRect(0, 0, SIZE, SIZE);

  // Short directional fiber strokes — "hair" tufts at mixed angles.
  cctx.lineCap = 'round';
  for (let i = 0; i < 5200; i++) {
    const x = Math.random() * SIZE;
    const y = Math.random() * SIZE;
    const len = 4 + Math.random() * 11;
    // Slight diagonal bias so strokes feel combed rather than scattered.
    const ang = (Math.PI * 0.35) + (Math.random() - 0.5) * 0.9;
    const shade = Math.random();
    if (shade < 0.35) {
      // Highlights — pale champagne tips
      cctx.strokeStyle = `rgba(255, 238, 178, ${0.25 + Math.random() * 0.3})`;
      cctx.lineWidth = 0.7 + Math.random() * 0.7;
    } else if (shade < 0.72) {
      // Amber mids
      cctx.strokeStyle = `rgba(178, 120, 36, ${0.25 + Math.random() * 0.3})`;
      cctx.lineWidth = 0.8 + Math.random() * 0.8;
    } else {
      // Dark roots
      cctx.strokeStyle = `rgba(86, 55, 12, ${0.3 + Math.random() * 0.35})`;
      cctx.lineWidth = 0.7 + Math.random() * 0.7;
    }
    cctx.beginPath();
    cctx.moveTo(x, y);
    cctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    cctx.stroke();
  }

  const colorMap = new THREE.CanvasTexture(colorCanvas);
  colorMap.wrapS = colorMap.wrapT = THREE.RepeatWrapping;
  colorMap.repeat.set(3, 2);
  colorMap.anisotropy = 8;
  colorMap.colorSpace = THREE.SRGBColorSpace;

  // --- Bump map: directional hair-stroke height field ----------------------
  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = SIZE;
  bumpCanvas.height = SIZE;
  const bctx = bumpCanvas.getContext('2d')!;
  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, SIZE, SIZE);
  bctx.lineCap = 'round';
  for (let i = 0; i < 6400; i++) {
    const x = Math.random() * SIZE;
    const y = Math.random() * SIZE;
    const len = 3 + Math.random() * 10;
    const ang = (Math.PI * 0.35) + (Math.random() - 0.5) * 0.9;
    const v = 60 + Math.floor(Math.random() * 180);
    bctx.strokeStyle = `rgba(${v},${v},${v},${0.3 + Math.random() * 0.45})`;
    bctx.lineWidth = 0.6 + Math.random() * 0.8;
    bctx.beginPath();
    bctx.moveTo(x, y);
    bctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    bctx.stroke();
  }
  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(3, 2);
  bumpMap.anisotropy = 8;

  // --- Roughness map: high base + occasional shiny tip ---------------------
  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = SIZE;
  roughCanvas.height = SIZE;
  const rctx = roughCanvas.getContext('2d')!;
  rctx.fillStyle = '#D6D6D6'; // rough ~0.85 base — plush
  rctx.fillRect(0, 0, SIZE, SIZE);
  for (let i = 0; i < 1800; i++) {
    const x = Math.random() * SIZE;
    const y = Math.random() * SIZE;
    const r = 2 + Math.random() * 5;
    const v = Math.random() > 0.7
      ? 120 + Math.floor(Math.random() * 50)  // slightly less matte tips
      : 210 + Math.floor(Math.random() * 35); // very matte fur
    rctx.fillStyle = `rgba(${v},${v},${v},0.4)`;
    rctx.beginPath();
    rctx.arc(x, y, r, 0, Math.PI * 2);
    rctx.fill();
  }
  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(3, 2);
  roughnessMap.anisotropy = 8;

  return { colorMap, bumpMap, roughnessMap };
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface LatticeAssetProps {
  readonly id: string;
  readonly forceLOD?: LODTier;
  readonly position?: [number, number, number];
}

// ---------------------------------------------------------------------------
// LOD 0 — coarse wireframe skeleton
// ---------------------------------------------------------------------------

interface VariantProps {
  readonly opacity: number;
}

const LatticeSkeleton = ({ opacity }: VariantProps) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshBasicMaterial | null>(null);

  // Very coarse sphere — silhouette is legible, but you can count the facets.
  const geom = useMemo(() => new THREE.SphereGeometry(SPHERE_R, 12, 6), []);
  useEffect(() => {
    const mat = matRef.current;
    return () => { geom.dispose(); mat?.dispose(); };
  }, [geom]);

  useFrame((_s, delta) => {
    if (meshRef.current) meshRef.current.rotation.y += 0.22 * delta;
    if (matRef.current) matRef.current.opacity = opacity;
  });

  return (
    <mesh ref={meshRef} geometry={geom}>
      <meshBasicMaterial
        ref={matRef}
        wireframe
        color="#F4C430"
        transparent
        opacity={opacity}
      />
    </mesh>
  );
};

// ---------------------------------------------------------------------------
// LOD 1 — fine wireframe blueprint
// ---------------------------------------------------------------------------

const LatticeFineBlueprint = ({ opacity }: VariantProps) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshBasicMaterial | null>(null);

  // Dense wireframe — same silhouette, visibly finer grid.
  const geom = useMemo(() => new THREE.SphereGeometry(SPHERE_R, 48, 24), []);
  useEffect(() => {
    const mat = matRef.current;
    return () => { geom.dispose(); mat?.dispose(); };
  }, [geom]);

  useFrame((_s, delta) => {
    if (meshRef.current) meshRef.current.rotation.y += 0.3 * delta;
    if (matRef.current) matRef.current.opacity = opacity;
  });

  return (
    <mesh ref={meshRef} geometry={geom}>
      <meshBasicMaterial
        ref={matRef}
        wireframe
        color="#F9D760"
        transparent
        opacity={opacity}
      />
    </mesh>
  );
};

// ---------------------------------------------------------------------------
// LOD 2 — flat yellow mid-texture body
// ---------------------------------------------------------------------------

const LatticeMid = ({ opacity }: VariantProps) => {
  const groupRef = useRef<THREE.Group>(null);
  const matRef = useRef<THREE.MeshStandardMaterial | null>(null);

  // Same tessellation as the fine wireframe so the crossfade between LOD 1
  // and LOD 2 reads as "the outline is now a surface".
  const geom = useMemo(() => new THREE.SphereGeometry(SPHERE_R, 48, 24), []);
  useEffect(() => {
    const mat = matRef.current;
    return () => { geom.dispose(); mat?.dispose(); };
  }, [geom]);

  useFrame((_s, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += 0.45 * delta;
    if (matRef.current) matRef.current.opacity = opacity;
  });

  return (
    <group ref={groupRef}>
      <mesh geometry={geom}>
        {/* Flat-ish yellow — the "before the fur pack loads" read. */}
        <meshStandardMaterial
          ref={matRef}
          color="#E8BE47"
          roughness={0.75}
          metalness={0.05}
          transparent
          opacity={opacity}
        />
      </mesh>
    </group>
  );
};

// ---------------------------------------------------------------------------
// LOD 3 — AAA hero: yellow fur (REAL instanced strands + wind physics)
//                  + glowing orbiting cubes + point light
// ---------------------------------------------------------------------------

/** Count of fur strand instances covering the sphere. 900 is the sweet-spot —
 *  visually reads as a full coat without costing more than ~0.5ms/frame to
 *  update on a modern laptop GPU (each instance = one 4x4 matrix write). */
const FUR_STRAND_COUNT = 900;
const FUR_STRAND_LENGTH = 0.17;
const FUR_STRAND_BASE_R = 0.014;
const FUR_STRAND_TIP_R  = 0.0022;

/**
 * Fibonacci-sphere seed generator — evenly distributes N points on the unit
 * sphere, no clumping at the poles. Returns each strand's outward normal + a
 * per-strand phase offset so the wind sway isn't globally synchronised.
 */
const makeFurSeeds = (count: number): ReadonlyArray<{
  normal: THREE.Vector3;
  phase: number;
}> => {
  const phi = Math.PI * (3 - Math.sqrt(5)); // golden angle
  const out: Array<{ normal: THREE.Vector3; phase: number }> = [];
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / Math.max(count - 1, 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = phi * i;
    out.push({
      normal: new THREE.Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r),
      phase: (i * 0.917) % (Math.PI * 2),
    });
  }
  return out;
};

const LatticeHero = ({ opacity }: VariantProps) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const satGroupRef = useRef<THREE.Group>(null);
  const matRef = useRef<THREE.MeshPhysicalMaterial | null>(null);
  const glowMatRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const furGroupRef = useRef<THREE.Group>(null);
  const furMeshRef = useRef<THREE.InstancedMesh>(null);
  const furMatRef = useRef<THREE.MeshPhysicalMaterial | null>(null);

  // High-tessellation sphere — bump-map detail reads cleanly.
  const heroGeom = useMemo(() => new THREE.SphereGeometry(SPHERE_R, 128, 96), []);
  const glowGeom = useMemo(() => new THREE.SphereGeometry(SPHERE_R * 0.97, 32, 32), []);

  // Tapered cylinder strand — translated so the BASE of the strand sits at
  // origin in local space. When we then align +Y with the sphere normal, the
  // strand grows outward from the sphere surface.
  const furGeom = useMemo(() => {
    const g = new THREE.CylinderGeometry(FUR_STRAND_TIP_R, FUR_STRAND_BASE_R, FUR_STRAND_LENGTH, 4, 1);
    g.translate(0, FUR_STRAND_LENGTH / 2, 0);
    return g;
  }, []);

  const { colorMap, bumpMap, roughnessMap } = useMemo(buildFurTextures, []);

  const furSeeds = useMemo(() => makeFurSeeds(FUR_STRAND_COUNT), []);

  // Reusable objects for per-frame matrix computation — avoid allocation in
  // the hot loop (900 strands × 60fps = 54k ops/sec).
  const dummyRef = useRef(new THREE.Object3D());
  const alignQRef = useRef(new THREE.Quaternion());
  const swayQRef  = useRef(new THREE.Quaternion());
  const windAxisRef = useRef(new THREE.Vector3());
  const upRef = useRef(new THREE.Vector3(0, 1, 0));

  // ----- Ball-motion state (shared by fur physics) -----
  //
  // BALL_OMEGA is the ball's angular velocity around Y (rad/s). We both
  // integrate it to rotate the ball *and* feed it straight into the strand
  // inertial-drag term so the fur lags the ball exactly the way a real pelt
  // on a spinning body would. By treating this as a constant we avoid
  // finite-difference noise from frame-to-frame rotation deltas.
  const BALL_OMEGA = 0.55;
  const ballSpinRef = useRef(0);

  // Three satellite cube positions — evenly spaced, r = 2.4.
  const SAT_RADIUS = 2.4;
  const satellitePositions = useMemo<ReadonlyArray<readonly [number, number, number]>>(() => {
    return [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3].map(
      (a) => [SAT_RADIUS * Math.cos(a), 0, SAT_RADIUS * Math.sin(a)] as const,
    );
  }, []);

  // Reusable scratch vectors for cube-position transform per frame.
  const cubeLocalRef = useRef<ReadonlyArray<THREE.Vector3>>([
    new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(),
  ]);

  // Dispose on unmount.
  useEffect(() => {
    const mat = matRef.current;
    const furMat = furMatRef.current;
    return () => {
      heroGeom.dispose();
      glowGeom.dispose();
      furGeom.dispose();
      colorMap.dispose();
      bumpMap.dispose();
      roughnessMap.dispose();
      mat?.dispose();
      furMat?.dispose();
    };
  }, [heroGeom, glowGeom, furGeom, colorMap, bumpMap, roughnessMap]);

  // Animate.
  const elapsedRef = useRef(0);
  useFrame((_s, delta) => {
    elapsedRef.current += delta;
    const t = elapsedRef.current;

    // Integrate ball spin (shared — ball mesh + fur group both read this).
    ballSpinRef.current += BALL_OMEGA * delta;
    const ballSpin = ballSpinRef.current;

    // Hero Y rotation — ball and fur both track the same spin integrator,
    // so the fur RIDES the ball instead of staying statically aligned to
    // world space. Physics lag is layered on per strand below.
    if (meshRef.current) meshRef.current.rotation.y = ballSpin;
    if (furGroupRef.current) furGroupRef.current.rotation.y = ballSpin;

    // Satellites orbit.
    if (satGroupRef.current) satGroupRef.current.rotation.y += 0.5 * delta;

    // AAA emissive breath — subtle amber glow on the fur, synced to cubes.
    const breath = 0.5 + 0.5 * Math.sin(t * 1.6);
    if (matRef.current) {
      matRef.current.emissiveIntensity = 0.04 + 0.04 * breath;
      matRef.current.opacity = opacity;
    }
    if (glowMatRef.current) {
      // Inner bloom shell scales with opacity + breath so it reads as lighting.
      glowMatRef.current.opacity = (0.06 + 0.05 * breath) * opacity;
    }
    if (lightRef.current) {
      // Point light "lights load at the end" — grows with the tier fade-in.
      lightRef.current.intensity = (0.6 + 0.45 * breath) * opacity;
    }

    // ---- FUR PHYSICS — multi-force strand dynamics ---------------------------
    //
    // Every strand sits on the sphere skin and is oriented so its +Y points
    // outward (alignQ). On top of that alignment we layer a sway quaternion
    // derived from a single COMBINED force vector F. F is the sum of three
    // independent terms, all expressed in the fur's local (rotating) frame:
    //
    //   (a) Ambient wind — a slowly rotating XZ vector with per-strand sine
    //       jitter. Sells "there is air in this scene", not "each strand
    //       twitches independently".
    //
    //   (b) Inertial drag — when the ball accelerates/rotates, a fixed pelt
    //       would whip BACKWARD relative to the spin. We model this as a
    //       tangent-plane force opposite to rotation direction, scaled by
    //       BALL_OMEGA. Result: the coat visibly lags the ball.
    //
    //   (c) Cube repulsion — for each of the three orbiting emissive cubes,
    //       we add a radial push OUT from the cube direction, falling off
    //       with angular distance. As a cube sweeps past a region of the
    //       sphere, that patch of fur *parts around it*.
    //
    // We then project F onto the strand's tangent plane, convert to an
    // axis+angle pair around n, and compose with alignQ. The whole inner
    // loop is allocation-free — everything goes through preallocated refs.
    // ------------------------------------------------------------------------
    if (furMeshRef.current) {
      const fur = furMeshRef.current;
      const dummy = dummyRef.current;
      const alignQ = alignQRef.current;
      const swayQ = swayQRef.current;
      const windAxis = windAxisRef.current;
      const up = upRef.current;

      // --- (a) Ambient wind vector (slowly rotating in XZ) ---
      const windX = Math.cos(t * 0.35);
      const windZ = Math.sin(t * 0.35);

      // --- (b) Inertial drag gain. A real pelt would have spring stiffness;
      //        we approximate the steady-state lag as a direct multiple of
      //        angular speed. Negative sign so the drag points OPPOSITE to
      //        the rotation direction (i.e., strands whip backward).
      const DRAG_K = 0.38;
      const dragMag = -BALL_OMEGA * DRAG_K;

      // --- (c) Cube positions expressed in the fur's local (rotating) frame.
      //        Cubes orbit in world space at satRot; the fur group rotates
      //        with the ball at ballSpin. So world-frame cube angle =
      //        baseAngle + satRot, and local-frame angle = that minus
      //        ballSpin. Use this to rebuild three XZ positions once per
      //        frame (cheap — three trig evaluations).
      const satRot = satGroupRef.current?.rotation.y ?? 0;
      const cubeLocal = cubeLocalRef.current;
      const cubeLocal0 = cubeLocal[0]!;
      const cubeLocal1 = cubeLocal[1]!;
      const cubeLocal2 = cubeLocal[2]!;
      {
        const baseAng0 = 0;
        const baseAng1 = (2 * Math.PI) / 3;
        const baseAng2 = (4 * Math.PI) / 3;
        const la0 = baseAng0 + satRot - ballSpin;
        const la1 = baseAng1 + satRot - ballSpin;
        const la2 = baseAng2 + satRot - ballSpin;
        cubeLocal0.set(SAT_RADIUS * Math.cos(la0), 0, SAT_RADIUS * Math.sin(la0));
        cubeLocal1.set(SAT_RADIUS * Math.cos(la1), 0, SAT_RADIUS * Math.sin(la1));
        cubeLocal2.set(SAT_RADIUS * Math.cos(la2), 0, SAT_RADIUS * Math.sin(la2));
      }

      // Unit direction to each cube (centred at origin of the fur frame).
      const cubeDirX0 = cubeLocal0.x / SAT_RADIUS;
      const cubeDirZ0 = cubeLocal0.z / SAT_RADIUS;
      const cubeDirX1 = cubeLocal1.x / SAT_RADIUS;
      const cubeDirZ1 = cubeLocal1.z / SAT_RADIUS;
      const cubeDirX2 = cubeLocal2.x / SAT_RADIUS;
      const cubeDirZ2 = cubeLocal2.z / SAT_RADIUS;

      // Per-cube influence parameters.
      const CUBE_REACH = 0.45;       // how close (in dot-product space) a cube must be
      const CUBE_STRENGTH = 0.95;    // how hard the strand bends at peak alignment

      for (let i = 0; i < FUR_STRAND_COUNT; i++) {
        const seed = furSeeds[i]!;
        const n = seed.normal;

        // Base position — strand root sits on the sphere skin. Note: fur
        // group already rotates with the ball, so we don't re-rotate n here.
        const base = SPHERE_R + 0.005;
        dummy.position.set(n.x * base, n.y * base, n.z * base);

        // Orient +Y → outward normal.
        alignQ.setFromUnitVectors(up, n);

        // (a) Ambient wind — per-strand amplitude from dual-frequency sine.
        const windMag =
          0.11 * Math.sin(t * 1.9 + seed.phase) +
          0.05 * Math.sin(t * 3.4 + seed.phase * 2.7);
        let fx = windX * windMag;
        let fy = 0;
        let fz = windZ * windMag;

        // (b) Inertial drag — tangent direction is n × Y = (-n.z, 0, n.x).
        //     Strands at the equator feel the most drag; poles feel none
        //     (|n × Y| = sqrt(1 - n.y²)). We let that fall out naturally by
        //     using the raw (-n.z, 0, n.x) without normalising.
        fx += -n.z * dragMag;
        fz +=  n.x * dragMag;

        // (c) Cube repulsion — sum over three cubes. Falloff is a soft
        //     (d - threshold)² curve so strands only feel the cube once it
        //     passes within CUBE_REACH (dot-product) of their normal.
        //     Push direction = strand_normal − cube_direction → the strand
        //     bends AWAY from the cube.
        //
        //     Cube y = 0, so cube dir is purely XZ; we still use n.x/n.y/n.z
        //     in the dot product so cubes "fall off" as strands move poleward.
        // --- cube 0 ---
        {
          const d0 = n.x * cubeDirX0 + n.z * cubeDirZ0; // ignore n.y — cube is in XZ
          if (d0 > CUBE_REACH) {
            const s0 = ((d0 - CUBE_REACH) / (1 - CUBE_REACH));
            const push = s0 * s0 * CUBE_STRENGTH;
            fx += (n.x - cubeDirX0) * push;
            fy += (n.y) * push * 0.4;  // lift strands upward near a cube
            fz += (n.z - cubeDirZ0) * push;
          }
        }
        // --- cube 1 ---
        {
          const d1 = n.x * cubeDirX1 + n.z * cubeDirZ1;
          if (d1 > CUBE_REACH) {
            const s1 = ((d1 - CUBE_REACH) / (1 - CUBE_REACH));
            const push = s1 * s1 * CUBE_STRENGTH;
            fx += (n.x - cubeDirX1) * push;
            fy += (n.y) * push * 0.4;
            fz += (n.z - cubeDirZ1) * push;
          }
        }
        // --- cube 2 ---
        {
          const d2 = n.x * cubeDirX2 + n.z * cubeDirZ2;
          if (d2 > CUBE_REACH) {
            const s2 = ((d2 - CUBE_REACH) / (1 - CUBE_REACH));
            const push = s2 * s2 * CUBE_STRENGTH;
            fx += (n.x - cubeDirX2) * push;
            fy += (n.y) * push * 0.4;
            fz += (n.z - cubeDirZ2) * push;
          }
        }

        // Project F onto the tangent plane at the strand base (remove the
        // component along n — a strand can't grow longer/shorter, only bend).
        const dotFn = fx * n.x + fy * n.y + fz * n.z;
        const fpx = fx - dotFn * n.x;
        const fpy = fy - dotFn * n.y;
        const fpz = fz - dotFn * n.z;

        // Convert to axis-angle: axis = n × Fp, angle = |Fp| (capped).
        // This is the rotation that bends the strand TIP in the Fp direction.
        const axX = n.y * fpz - n.z * fpy;
        const axY = n.z * fpx - n.x * fpz;
        const axZ = n.x * fpy - n.y * fpx;
        const axLen = Math.sqrt(axX * axX + axY * axY + axZ * axZ);

        let swayAngle: number;
        if (axLen < 1e-5) {
          // Degenerate (Fp ≈ 0) — no bend this frame.
          windAxis.set(1, 0, 0);
          swayAngle = 0;
        } else {
          windAxis.set(axX / axLen, axY / axLen, axZ / axLen);
          // |Fp| is already in "radian-ish" units because our forces were
          // sized to yield natural bend angles. Cap to prevent any force
          // stack from flipping the strand inside-out.
          swayAngle = Math.min(Math.sqrt(fpx * fpx + fpy * fpy + fpz * fpz), 0.85);
        }

        swayQ.setFromAxisAngle(windAxis, swayAngle);

        // Compose: bend first, then align — the bend is expressed in world
        // axes (which for the aligned strand reduce to the tangent plane at n).
        dummy.quaternion.multiplyQuaternions(swayQ, alignQ);

        dummy.updateMatrix();
        fur.setMatrixAt(i, dummy.matrix);
      }
      fur.instanceMatrix.needsUpdate = true;
    }

    if (furMatRef.current) {
      furMatRef.current.opacity = opacity;
      furMatRef.current.emissiveIntensity = 0.06 + 0.05 * breath;
    }
  });

  return (
    <>
      {/* Primary hero mesh — yellow fur with fine directional bumps. */}
      <mesh ref={meshRef} geometry={heroGeom}>
        <meshPhysicalMaterial
          ref={matRef}
          map={colorMap}
          bumpMap={bumpMap}
          bumpScale={0.09}
          roughnessMap={roughnessMap}
          roughness={0.82}
          metalness={0.04}
          sheen={0.85}
          sheenColor="#FFE9A8"
          sheenRoughness={0.55}
          clearcoat={0.25}
          clearcoatRoughness={0.45}
          emissive="#FFC64A"
          emissiveIntensity={0.06}
          transparent
          opacity={opacity}
        />
      </mesh>

      {/* Real fur — 900 instanced tapered cylinder strands, physics-driven.
          The strands live inside a group that rotates *with the ball*
          (furGroupRef.rotation.y = ballSpin), so the coat rides the body
          instead of floating in world space. Per-strand sway then layers
          (a) ambient wind, (b) inertial drag opposite to spin direction,
          and (c) repulsion away from each orbiting emissive cube — summed
          into one force vector and converted to an axis-angle bend.
          That combination is why the pelt visibly ripples when a cube
          sweeps past, and whips back when the ball rotates faster. */}
      <group ref={furGroupRef}>
        <instancedMesh
          ref={furMeshRef}
          args={[undefined as unknown as THREE.BufferGeometry, undefined as unknown as THREE.Material, FUR_STRAND_COUNT]}
          frustumCulled={false}
        >
          <primitive object={furGeom} attach="geometry" />
          <meshPhysicalMaterial
            ref={furMatRef}
            color="#F0C740"
            roughness={0.72}
            metalness={0.03}
            sheen={0.9}
            sheenColor="#FFE49A"
            sheenRoughness={0.45}
            emissive="#B57A0F"
            emissiveIntensity={0.08}
            transparent
            opacity={opacity}
          />
        </instancedMesh>
      </group>

      {/* Inner additive halo — reads as "light wrapping around the fur". */}
      <mesh geometry={glowGeom}>
        <meshBasicMaterial
          ref={glowMatRef}
          color="#FFDE80"
          transparent
          opacity={0.08 * opacity}
          blending={THREE.AdditiveBlending}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>

      {/* "Lighting loads last" — a dedicated warm point light tracking the
          sphere, only present in the AAA tier. Its intensity ramps with
          the tier's opacity so the moment of arrival really reads as
          lighting coming online. */}
      <pointLight
        ref={lightRef}
        color="#FFD274"
        intensity={0}
        distance={7}
        decay={1.4}
        position={[0, 0.4, 1.6]}
      />

      {/* Three orbiting cubes — glow subtly (the "lighting loads at end"
          moment). Each has an emissive body + its own tiny point light so
          the cube reads as a light SOURCE, not just a lit object. */}
      <group ref={satGroupRef}>
        {satellitePositions.map((pos, i) => (
          <group key={i} position={pos as [number, number, number]}>
            <mesh>
              <boxGeometry args={[0.22, 0.22, 0.22]} />
              <meshStandardMaterial
                color="#FFE9A8"
                emissive="#FFB300"
                emissiveIntensity={1.2 * opacity}
                roughness={0.35}
                metalness={0.15}
                transparent
                opacity={opacity}
              />
            </mesh>
            {/* Soft bloom shell around each cube — reads as glow halo. */}
            <mesh>
              <boxGeometry args={[0.36, 0.36, 0.36]} />
              <meshBasicMaterial
                color="#FFB300"
                transparent
                opacity={0.18 * opacity}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </mesh>
            <pointLight
              color="#FFB300"
              intensity={0.55 * opacity}
              distance={2.4}
              decay={1.8}
            />
          </group>
        ))}
      </group>
    </>
  );
};

// ---------------------------------------------------------------------------
// LatticeAsset — root component
// ---------------------------------------------------------------------------

type TierMap<V> = { 0: V; 1: V; 2: V; 3: V };
const TIERS = [0, 1, 2, 3] as const;

export const LatticeAsset = ({
  id,
  forceLOD,
  position = [0, 0, 0],
}: LatticeAssetProps): JSX.Element => {
  const reg = useContinuumStore(selectAsset(id));
  const effectiveLOD: LODTier =
    forceLOD ?? (Math.min(reg?.maxLOD ?? 3, 3) as LODTier);

  useEffect(() => {
    const store = useContinuumStore.getState();
    store.registerAsset(id);
    store.setStatus(id, 'ready');
    return () => {
      useContinuumStore.getState().unregisterAsset(id);
    };
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

  const [opacities, setOpacities] = useState<TierMap<number>>(
    () => ({ ...opacityRef.current }),
  );

  const [mounted, setMounted] = useState<TierMap<boolean>>(() => ({
    0: effectiveLOD === 0,
    1: effectiveLOD === 1,
    2: effectiveLOD === 2,
    3: effectiveLOD === 3,
  }));

  useEffect(() => {
    setMounted((prev) => ({ ...prev, [effectiveLOD]: true }));
  }, [effectiveLOD]);

  useFrame(() => {
    const LERP = 0.18;
    let needsRenderSync = false;
    for (const tier of TIERS) {
      const target = tier === effectiveLOD ? 1 : 0;
      const current = opacityRef.current[tier];
      const next = current + (target - current) * LERP;
      opacityRef.current[tier] = next;
      if ((current >= 0.01 && next < 0.01) || (current < 0.01 && next >= 0.01)) {
        needsRenderSync = true;
      }
    }
    if (needsRenderSync) {
      const snap = { ...opacityRef.current };
      setOpacities(snap);
      setMounted({
        0: snap[0] >= 0.01,
        1: snap[1] >= 0.01,
        2: snap[2] >= 0.01,
        3: snap[3] >= 0.01,
      });
    }
  });

  return (
    <group position={position}>
      {mounted[0] && <LatticeSkeleton opacity={opacities[0]} />}
      {mounted[1] && <LatticeFineBlueprint opacity={opacities[1]} />}
      {mounted[2] && <LatticeMid opacity={opacities[2]} />}
      {mounted[3] && <LatticeHero opacity={opacities[3]} />}
    </group>
  );
};
