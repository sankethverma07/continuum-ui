/**
 * CLI dry-run: generate an image LOD stack without touching Supabase.
 *
 * Usage:
 *   tsx src/cli/dryRunImage.ts <input.png> [assetId] [outDir]
 *
 * Writes lod0..lodN images into outDir and prints a JSON summary to stdout
 * so you can eyeball the result without any cloud wiring.
 */

import path from 'node:path';
import { generateImageLODs } from '../generateImageLODs.js';

const [, , inputPath, assetIdArg, outDirArg] = process.argv;

if (!inputPath) {
  console.error('Usage: tsx src/cli/dryRunImage.ts <input.png> [assetId] [outDir]');
  process.exit(1);
}

const assetId = assetIdArg ?? path.basename(inputPath, path.extname(inputPath));
const outDir = outDirArg ?? path.join(process.cwd(), 'out', assetId);

const run = async (): Promise<void> => {
  const result = await generateImageLODs(inputPath, { assetId, outDir });
  console.log(JSON.stringify(result, null, 2));
};

run().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
