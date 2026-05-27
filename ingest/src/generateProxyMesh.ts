/**
 * generateProxyMesh — write a position-only "shape proxy" of a glb.
 *
 * **Inspiration.** The Hogwarts Legacy / Avalanche-Pottermore web team
 * shipped the entire castle as ~2.1 MB by stripping every glTF buffer
 * except positions, clamping precision, and gzipping. We adopt the same
 * idea but use it as a SUB-LOD-0 preview tier: paint the wireframe
 * proxy in <100 ms while the full PBR glb streams behind it.
 *
 * **Format** — `.proxy.bin`, little-endian throughout:
 *
 *   offset  size  field
 *   0       4     magic "CPRX" (0x58525043)
 *   4       2     version (uint16, currently 1)
 *   6       2     flags  (uint16, bit0 = indices present)
 *   8       4     vertex count (uint32)
 *   12      4     index count (uint32, 0 if non-indexed)
 *   16      12    bbox min (3 × float32)
 *   28      12    bbox max (3 × float32)
 *   40      …     positions  → vertex_count × 3 × float32
 *           …     indices    → index_count × uint32 (omitted if non-indexed)
 *
 * **Why Float32 and not Int16/Float16.** First iteration: keep parsing
 * trivial in the browser (no dequantization step). Float32 + gzip
 * already lands in the 100-500 KB territory we want, since redundant
 * leading bits across vertices compress brutally well. If we want to
 * push further later, we add an Int16-quantized variant under flag bit1
 * — readers branch on flags. Today: simplest path.
 *
 * **Why we pre-merge primitives.** The glb may have many primitives
 * (one per material). For wireframe rendering we don't care about
 * materials at all — we want a single buffer of all positions + indices
 * concatenated, with index offsets fixed up. One big mesh = one draw
 * call = one geometry instantiation in the browser.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  MeshoptDecoder,
  MeshoptEncoder,
} from 'meshoptimizer';

const MAGIC = 0x58525043; // "CPRX" little-endian
const VERSION = 1;
const FLAG_HAS_INDICES = 1 << 0;

export interface GenerateProxyOptions {
  readonly outPath: string;
  /** When true, also writes `<outPath>.gz` with gzip pre-compression
   *  so static hosts that don't auto-gzip still serve compressed. */
  readonly emitGzip?: boolean;
}

export interface ProxyResult {
  readonly outPath: string;
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly rawBytes: number;
  readonly gzipBytes?: number | undefined;
  readonly bbox: { min: [number, number, number]; max: [number, number, number] };
}

export const generateProxyMesh = async (
  inputPath: string,
  opts: GenerateProxyOptions,
): Promise<ProxyResult> => {
  await MeshoptDecoder.ready;
  await MeshoptEncoder.ready;

  // Use the same full-extension I/O as generateMeshLODs so we can read
  // anything the publish pipeline emits — Meshopt-compressed glbs read
  // back to standard accessors transparently.
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'meshopt.encoder': MeshoptEncoder,
      'meshopt.decoder': MeshoptDecoder,
    });
  const doc = await io.read(inputPath);
  const root = doc.getRoot();

  // Walk every primitive in every mesh; collect positions + indices,
  // re-baseing indices into a single concatenated vertex buffer.
  const positions: number[] = [];
  let indices: number[] = [];
  let nextBase = 0;
  let bboxMin: [number, number, number] = [Infinity, Infinity, Infinity];
  let bboxMax: [number, number, number] = [-Infinity, -Infinity, -Infinity];

  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      if (!pos) continue;
      const arr = pos.getArray();
      if (!arr) continue;

      const vertexCount = pos.getCount();
      // Append positions; track running bbox for the runtime camera framing.
      for (let i = 0; i < vertexCount * 3; i += 3) {
        const x = arr[i] ?? 0;
        const y = arr[i + 1] ?? 0;
        const z = arr[i + 2] ?? 0;
        positions.push(x, y, z);
        if (x < bboxMin[0]) bboxMin[0] = x;
        if (y < bboxMin[1]) bboxMin[1] = y;
        if (z < bboxMin[2]) bboxMin[2] = z;
        if (x > bboxMax[0]) bboxMax[0] = x;
        if (y > bboxMax[1]) bboxMax[1] = y;
        if (z > bboxMax[2]) bboxMax[2] = z;
      }

      // Append indices, offset by current vertex base. If a primitive
      // is non-indexed, synthesize sequential indices so all primitives
      // share the same indexed format in our output.
      const indexAccessor = prim.getIndices();
      if (indexAccessor) {
        const idxArr = indexAccessor.getArray();
        if (idxArr) {
          for (let i = 0; i < idxArr.length; i++) {
            indices.push((idxArr[i] ?? 0) + nextBase);
          }
        }
      } else {
        for (let i = 0; i < vertexCount; i++) {
          indices.push(i + nextBase);
        }
      }

      nextBase += vertexCount;
    }
  }

  const vertexCount = positions.length / 3;
  const indexCount = indices.length;
  const triangleCount = Math.floor(indexCount / 3);

  // Allocate the binary blob.
  const HEADER_BYTES = 40;
  const positionBytes = vertexCount * 3 * 4; // Float32
  const indexBytes = indexCount * 4; // Uint32
  const totalBytes = HEADER_BYTES + positionBytes + indexBytes;

  const buf = Buffer.alloc(totalBytes);
  let o = 0;

  // Header
  buf.writeUInt32LE(MAGIC, o); o += 4;
  buf.writeUInt16LE(VERSION, o); o += 2;
  buf.writeUInt16LE(indexCount > 0 ? FLAG_HAS_INDICES : 0, o); o += 2;
  buf.writeUInt32LE(vertexCount, o); o += 4;
  buf.writeUInt32LE(indexCount, o); o += 4;
  buf.writeFloatLE(bboxMin[0], o); o += 4;
  buf.writeFloatLE(bboxMin[1], o); o += 4;
  buf.writeFloatLE(bboxMin[2], o); o += 4;
  buf.writeFloatLE(bboxMax[0], o); o += 4;
  buf.writeFloatLE(bboxMax[1], o); o += 4;
  buf.writeFloatLE(bboxMax[2], o); o += 4;

  // Positions
  for (let i = 0; i < positions.length; i++) {
    buf.writeFloatLE(positions[i] ?? 0, o); o += 4;
  }
  // Indices
  for (let i = 0; i < indices.length; i++) {
    buf.writeUInt32LE(indices[i] ?? 0, o); o += 4;
  }

  await fs.mkdir(path.dirname(opts.outPath), { recursive: true });
  await fs.writeFile(opts.outPath, buf);

  let gzipBytes: number | undefined;
  if (opts.emitGzip) {
    const gz = zlib.gzipSync(buf, { level: 9 });
    await fs.writeFile(`${opts.outPath}.gz`, gz);
    gzipBytes = gz.byteLength;
  }

  return {
    outPath: opts.outPath,
    vertexCount,
    triangleCount,
    rawBytes: totalBytes,
    gzipBytes,
    bbox: { min: bboxMin, max: bboxMax },
  };
};
