/**
 * CLI: build a position-only proxy from a glb.
 *
 *   tsx src/cli/buildProxy.ts <input.glb> [outPath]
 */

import { generateProxyMesh } from '../generateProxyMesh.js';

const [, , inputPath, outPathArg] = process.argv;

if (!inputPath) {
  console.error('Usage: tsx src/cli/buildProxy.ts <input.glb> [outPath]');
  process.exit(1);
}

const outPath =
  outPathArg ?? inputPath.replace(/\.glb$/i, '.proxy.bin');

const run = async (): Promise<void> => {
  const result = await generateProxyMesh(inputPath, {
    outPath,
    emitGzip: true,
  });
  const kb = (n: number) => (n / 1024).toFixed(1) + ' KB';
  console.log(JSON.stringify({
    outPath: result.outPath,
    vertices: result.vertexCount,
    triangles: result.triangleCount,
    raw: kb(result.rawBytes),
    gzip: result.gzipBytes ? kb(result.gzipBytes) : undefined,
    ratio_to_glb: result.gzipBytes
      ? `${(result.gzipBytes / 1024 / 1024).toFixed(2)} MB`
      : undefined,
    bbox: result.bbox,
  }, null, 2));
};

run().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
