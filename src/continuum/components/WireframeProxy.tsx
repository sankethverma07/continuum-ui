/**
 * <WireframeProxy /> — sub-LOD-0 paint surface.
 *
 * **Why this exists.** The full PBR glb takes ~500-1500 ms cold from
 * fetch + parse + texture decode + shader compile, even after the
 * decoder pipeline (KTX2 + Draco + Meshopt) runs. During that window
 * the user sees nothing — or a generic spinner. Phase A's wireframe
 * build can't start until the glb has parsed, because Phase A needs
 * the full geometry to densify.
 *
 * The proxy fills that window. A `.proxy.bin` file ships only vertex
 * positions + triangle indices — no UVs, no normals, no materials, no
 * textures. The Hogwarts Legacy / Pottermore web team pioneered this
 * pattern; we use it as a sub-tier ABOVE Continuum's regular LOD-0.
 *
 * The .bin format is documented in `ingest/src/generateProxyMesh.ts`.
 *
 * **Render path.** Parse to a `THREE.BufferGeometry`, render as
 * `<lineSegments>` with a `WireframeGeometry`. The wireframe is the
 * shape silhouette — exactly the visual Phase A would have produced
 * if the full glb were available. When the full asset arrives, the
 * caller fades the proxy out and Phase B (material build) takes over.
 *
 * **Performance budget.** A 2.4 MB gzipped proxy fetches in ~50 ms
 * over a typical broadband connection, parses in <30 ms (no glTF
 * parse — just typed-array views over the .bin), and renders in <8 ms
 * (line segments are cheap). End-to-end first paint of a recognizable
 * shape: ~100 ms cold-load. Compare to ~600 ms for the equivalent
 * compressed glb's first paint.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

const MAGIC = 0x58525043; // "CPRX"
const HEADER_BYTES = 40;

interface ProxyData {
  readonly positions: Float32Array;
  readonly indices: Uint32Array | null;
  readonly bbox: { min: THREE.Vector3; max: THREE.Vector3 };
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly bytesTransferred: number;
}

/**
 * Parse a `.proxy.bin` ArrayBuffer into typed-array views.
 * Validates the magic + version. Returns null on any mismatch so
 * callers can handle gracefully (render nothing, log warning).
 */
const parseProxy = (
  buffer: ArrayBuffer,
  bytesTransferred: number,
): ProxyData | null => {
  if (buffer.byteLength < HEADER_BYTES) return null;
  const view = new DataView(buffer);
  const magic = view.getUint32(0, true);
  if (magic !== MAGIC) return null;
  const version = view.getUint16(4, true);
  if (version !== 1) return null;
  const flags = view.getUint16(6, true);
  const vertexCount = view.getUint32(8, true);
  const indexCount = view.getUint32(12, true);
  const min = new THREE.Vector3(
    view.getFloat32(16, true),
    view.getFloat32(20, true),
    view.getFloat32(24, true),
  );
  const max = new THREE.Vector3(
    view.getFloat32(28, true),
    view.getFloat32(32, true),
    view.getFloat32(36, true),
  );

  const posOffset = HEADER_BYTES;
  const positions = new Float32Array(buffer, posOffset, vertexCount * 3);

  let indices: Uint32Array | null = null;
  if (flags & 1 && indexCount > 0) {
    const idxOffset = posOffset + vertexCount * 3 * 4;
    indices = new Uint32Array(buffer, idxOffset, indexCount);
  }

  return {
    positions,
    indices,
    bbox: { min, max },
    vertexCount,
    triangleCount: indexCount > 0 ? Math.floor(indexCount / 3) : Math.floor(vertexCount / 3),
    bytesTransferred,
  };
};

export interface ProxyMetrics {
  readonly fetchMs: number;
  readonly parseMs: number;
  readonly bytesTransferred: number;
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly bbox: { min: THREE.Vector3; max: THREE.Vector3 };
}

export interface WireframeProxyProps {
  /** URL of the `.proxy.bin` file. */
  readonly src: string;
  /** Wireframe stroke color. Defaults to the orange Continuum accent. */
  readonly color?: string;
  /** Linear opacity for the wireframe lines. Default 0.85. */
  readonly opacity?: number;
  /** Optional callback fired once the proxy is ready, with metrics
   *  for the demo page to surface. */
  readonly onReady?: (metrics: ProxyMetrics) => void;
  /** Optional uniform scale applied to the rendered geometry. */
  readonly scale?: number;
  /** When false, the lines are invisible (opacity 0). Used to fade the
   *  proxy out as the full PBR fades in. Defaults to true. */
  readonly visible?: boolean;
}

export const WireframeProxy = ({
  src,
  color = '#F2B07A',
  opacity = 0.85,
  onReady,
  scale = 1,
  visible = true,
}: WireframeProxyProps) => {
  const [data, setData] = useState<ProxyData | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    let cancelled = false;
    const fetchStart = performance.now();
    fetch(src)
      .then(async (res) => {
        if (!res.ok) throw new Error(`proxy fetch ${res.status}`);
        const buf = await res.arrayBuffer();
        const fetchEnd = performance.now();
        const parseStart = performance.now();
        const parsed = parseProxy(buf, buf.byteLength);
        const parseEnd = performance.now();
        if (cancelled) return;
        if (!parsed) {
          // eslint-disable-next-line no-console
          console.warn(`[WireframeProxy] ${src} — invalid proxy file`);
          return;
        }
        setData(parsed);
        onReadyRef.current?.({
          fetchMs: Math.round(fetchEnd - fetchStart),
          parseMs: Math.round(parseEnd - parseStart),
          bytesTransferred: parsed.bytesTransferred,
          vertexCount: parsed.vertexCount,
          triangleCount: parsed.triangleCount,
          bbox: parsed.bbox,
        });
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn(`[WireframeProxy] ${src} — fetch failed:`, err);
      });
    return () => {
      cancelled = true;
    };
  }, [src]);

  // Build the geometry once when data is ready. We construct a triangle
  // mesh from positions + indices, then derive a WireframeGeometry from
  // it (THREE handles the edge extraction). The wireframe geometry is
  // what we actually render — line segments instead of solid faces, no
  // shading required.
  const wireframe = useMemo(() => {
    if (!data) return null;
    const triGeom = new THREE.BufferGeometry();
    triGeom.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    if (data.indices) {
      triGeom.setIndex(new THREE.BufferAttribute(data.indices, 1));
    }
    const wire = new THREE.WireframeGeometry(triGeom);
    triGeom.dispose();
    return wire;
  }, [data]);

  if (!wireframe) return null;

  return (
    <lineSegments geometry={wireframe} scale={scale}>
      <lineBasicMaterial
        color={color}
        transparent
        opacity={visible ? opacity : 0}
        // depthWrite false so the wireframe blends cleanly when the
        // full PBR fades in over it (otherwise the depth buffer makes
        // the wireframe occlude the solid mesh during crossfade).
        depthWrite={false}
      />
    </lineSegments>
  );
};

export default WireframeProxy;
