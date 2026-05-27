/**
 * CLI dry-run: generate a mesh LOD stack without touching Supabase.
 *
 * Usage:
 *   tsx src/cli/dryRunMesh.ts <input.glb> [assetId] [outDir]
 */

import path from 'node:path';
import { generateMeshLODs } from '../generateMeshLODs.js';

const [, , inputPath, assetIdArg, outDirArg] = process.argv;

if (!inputPath) {
  console.error('Usage: tsx src/cli/dryRunMesh.ts <input.glb> [assetId] [outDir]');
  process.exit(1);
}

const assetId = assetIdArg ?? path.basename(inputPath, path.extname(inputPath));
const outDir = outDirArg ?? path.join(process.cwd(), 'out', assetId);

const run = async (): Promise<void> => {
  const result = await generateMeshLODs(inputPath, { assetId, outDir });
  console.log(JSON.stringify(result, null, 2));
};

run().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
