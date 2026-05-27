/**
 * <ColorCloud /> — surface-sampled color point cloud overlay.
 *
 * Inspired by Luma Labs' Interactive Scenes loading pattern, where a
 * sparse colored point cloud lands first and progressively densifies
 * into the final surface render. Used as a brief "splat moment" on
 * supported demo routes to bridge between the wireframe phase and the
 * fully-revealed PBR.
 *
 * **What this is NOT.** This is not real Gaussian Splatting — Luma's
 * tech needs splat-trained data which we can't generate from a glb.
 * This is the same visual reading achieved with primitives that
 * compose cleanly with our PBR pipeline:
 *
 *   1. Surface-sample N points across the loaded glb's meshes,
 *      proportional to each mesh's bbox area.
 *   2. For each point, sample the underlying material's albedo (diffuse
 *      texture at the sample's UV, or base color as fallback).
 *   3. Render as `THREE.Points` with a custom soft-Gaussian shader.
 *   4. Animate visible point count from sparse → dense.
 *
 * Materials are NOT mutated; the cloud is purely additive. Peak alpha
 * is capped at 0.55 so dense overlap doesn't occlude the PBR mesh
 * underneath — the visual reading stays splat-like but the surface
 * peeks through.
 */

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js';

// ---------------------------------------------------------------------------
// Color sampling — read pixel out of a material's diffuse map
// ---------------------------------------------------------------------------

const textureBufferCache = new WeakMap<
  THREE.Texture,
  { width: number; height: number; data: Uint8ClampedArray } | null
>();

const readTextureBuffer = (
  tex: THREE.Texture,
): { width: number; height: number; data: Uint8ClampedArray } | null => {
  const cached = textureBufferCache.get(tex);
  if (cached !== undefined) return cached;

  const image = tex.image as
    | HTMLImageElement
    | HTMLCanvasElement
    | ImageBitmap
    | undefined;
  if (!image || !('width' in image) || !image.width || !image.height) {
    textureBufferCache.set(tex, null);
    return null;
  }

  const w = Math.min(image.width, 256);
  const h = Math.min(image.height, 256);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    textureBufferCache.set(tex, null);
    return null;
  }
  try {
    ctx.drawImage(image as CanvasImageSource, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    const result = { width: w, height: h, data };
    textureBufferCache.set(tex, result);
    return result;
  } catch {
    textureBufferCache.set(tex, null);
    return null;
  }
};

const sampleAlbedo = (
  material: THREE.Material,
  uv: THREE.Vector2,
  out: THREE.Color,
): void => {
  const std = material as THREE.MeshStandardMaterial;
  const baseColor = std.color ?? new THREE.Color(0xcccccc);
  const map = std.map;
  if (!map) {
    out.copy(baseColor);
    return;
  }
  const buf = readTextureBuffer(map);
  if (!buf) {
    out.copy(baseColor);
    return;
  }
  const u = ((uv.x % 1) + 1) % 1;
  const v = 1 - ((uv.y % 1) + 1) % 1;
  const x = Math.min(buf.width - 1, Math.max(0, Math.floor(u * buf.width)));
  const y = Math.min(buf.height - 1, Math.max(0, Math.floor(v * buf.height)));
  const i = (y * buf.width + x) * 4;
  out.setRGB(
    (buf.data[i] ?? 200) / 255,
    (buf.data[i + 1] ?? 200) / 255,
    (buf.data[i + 2] ?? 200) / 255,
  );
  out.multiply(baseColor);
};

// ---------------------------------------------------------------------------
// Sampling — walk scene, distribute points proportional to mesh bbox area
// ---------------------------------------------------------------------------

interface SampledCloud {
  readonly positions: Float32Array;
  readonly colors: Float32Array;
  readonly count: number;
}

const sampleSceneToCloud = (
  scene: THREE.Object3D,
  totalPoints: number,
): SampledCloud => {
  type MeshEntry = { mesh: THREE.Mesh; area: number };
  const entries: MeshEntry[] = [];
  let totalArea = 0;

  scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    if (!obj.geometry || !(obj.geometry as THREE.BufferGeometry).attributes.position) return;
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const area = 2 * (size.x * size.y + size.y * size.z + size.x * size.z);
    if (area > 1e-6) {
      entries.push({ mesh: obj, area });
      totalArea += area;
    }
  });

  if (entries.length === 0 || totalArea === 0) {
    return { positions: new Float32Array(0), colors: new Float32Array(0), count: 0 };
  }

  const positions = new Float32Array(totalPoints * 3);
  const colors = new Float32Array(totalPoints * 3);
  const tempPos = new THREE.Vector3();
  const tempNormal = new THREE.Vector3();
  const tempUV = new THREE.Vector2();
  const tempColor = new THREE.Color();
  let written = 0;

  for (const { mesh, area } of entries) {
    if (written >= totalPoints) break;
    const share = Math.max(1, Math.round((area / totalArea) * totalPoints));
    const budget = Math.min(share, totalPoints - written);

    const sampler = new MeshSurfaceSampler(mesh).build();
    const matRaw = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (!matRaw) continue;
    const material = matRaw;

    for (let i = 0; i < budget; i++) {
      sampler.sample(tempPos, tempNormal, undefined, tempUV);
      tempPos.applyMatrix4(mesh.matrixWorld);
      const pi = (written + i) * 3;
      positions[pi]     = tempPos.x;
      positions[pi + 1] = tempPos.y;
      positions[pi + 2] = tempPos.z;

      sampleAlbedo(material, tempUV, tempColor);
      colors[pi]     = tempColor.r;
      colors[pi + 1] = tempColor.g;
      colors[pi + 2] = tempColor.b;
    }
    written += budget;
  }

  return { positions, colors, count: written };
};

// ---------------------------------------------------------------------------
// Soft-blob points material
// ---------------------------------------------------------------------------

const buildPointsMaterial = () => {
  const uniforms = {
    uTime: { value: 0 },
    uOpacity: { value: 1 },
    uPointSize: { value: 6.0 },
    uAttack: { value: 0 },
    uSeedScramble: { value: 1.0 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    vertexShader: `
      attribute vec3 color;
      attribute float aSeed;
      varying vec3 vColor;
      varying float vSeed;
      uniform float uTime;
      uniform float uPointSize;
      uniform float uAttack;
      uniform float uSeedScramble;

      void main() {
        vColor = color;
        vSeed = aSeed;
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = uPointSize * (1.0 / -mvPos.z) * 100.0;
        float liveness = step(aSeed, uAttack);
        gl_PointSize *= liveness;
        float settle = max(0.0, uAttack - aSeed) * 4.0;
        float wob = (1.0 - exp(-settle));
        float jitter = (1.0 - wob) * 0.04;
        mvPos.xy += vec2(
          sin(aSeed * 31.7 + uTime * uSeedScramble) * jitter,
          cos(aSeed * 17.3 + uTime * uSeedScramble) * jitter
        );
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vSeed;
      uniform float uOpacity;

      void main() {
        // Soft Gaussian falloff. Peak alpha capped at 0.55 so dense
        // overlap doesn't occlude the PBR mesh underneath.
        vec2 d = gl_PointCoord - 0.5;
        float r = length(d);
        if (r > 0.5) discard;
        float falloff = exp(-r * r * 12.0);
        gl_FragColor = vec4(vColor, falloff * uOpacity * 0.55);
      }
    `,
  });

  (material as unknown as { uniforms: typeof uniforms }).uniforms = uniforms;
  return material;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface ColorCloudProps {
  readonly source: THREE.Object3D;
  readonly pointCount?: number;
  readonly densifyDuration?: number;
  readonly visible?: boolean;
  readonly active?: boolean;
  readonly pointSize?: number;
  readonly onSampled?: (info: { count: number; ms: number }) => void;
}

export const ColorCloud = ({
  source,
  pointCount = 50000,
  densifyDuration = 1.4,
  visible = true,
  active = true,
  pointSize = 6.0,
  onSampled,
}: ColorCloudProps) => {
  const onSampledRef = useRef(onSampled);
  onSampledRef.current = onSampled;

  const cloud = useMemo(() => {
    const t0 = performance.now();
    const result = sampleSceneToCloud(source, pointCount);
    const ms = Math.round(performance.now() - t0);
    onSampledRef.current?.({ count: result.count, ms });
    return result;
  }, [source, pointCount]);

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(cloud.positions, 3));
    g.setAttribute('color', new THREE.BufferAttribute(cloud.colors, 3));
    const seeds = new Float32Array(cloud.count);
    for (let i = 0; i < cloud.count; i++) seeds[i] = Math.random();
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    return g;
  }, [cloud]);

  const material = useMemo(() => buildPointsMaterial(), []);
  useEffect(() => {
    const u = material.uniforms.uPointSize;
    if (u) u.value = pointSize;
  }, [material, pointSize]);

  const startedAt = useRef<number | null>(null);
  useFrame(() => {
    const m = material as unknown as {
      uniforms: {
        uTime: { value: number };
        uOpacity: { value: number };
        uAttack: { value: number };
      };
    };
    const t = performance.now() / 1000;
    m.uniforms.uTime.value = t;

    if (active) {
      if (startedAt.current == null) startedAt.current = t;
      const elapsed = t - startedAt.current;
      m.uniforms.uAttack.value = Math.min(1, elapsed / densifyDuration);
    }

    const target = visible ? 1 : 0;
    const cur = m.uniforms.uOpacity.value;
    m.uniforms.uOpacity.value = cur + (target - cur) * 0.18;
  });

  if (cloud.count === 0) return null;
  return <points geometry={geometry} material={material} />;
};

export default ColorCloud;
