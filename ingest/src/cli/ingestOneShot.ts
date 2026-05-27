/**
 * One-shot ingest CLI: uploads a local file to raw/, generates the LOD
 * stack, uploads all tiers to cdn/, writes the catalog row.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     tsx src/cli/ingestOneShot.ts <path> [assetId]
 *
 * Kind is inferred from file extension (.glb/.gltf → mesh, else → image).
 */

import path from 'node:path';

import { defaultConfig, ingestOneShot } from '../worker/supabaseWorker.js';

const [, , inputPath, assetIdArg] = process.argv;

if (!inputPath) {
  console.error(
    'Usage: tsx src/cli/ingestOneShot.ts <path> [assetId]',
  );
  process.exit(1);
}

const kind: 'image' | 'mesh' = /\.(glb|gltf)$/i.test(inputPath) ? 'mesh' : 'image';
const assetId = assetIdArg ?? path.basename(inputPath, path.extname(inputPath));

ingestOneShot({
  inputPath,
  assetId,
  kind,
  config: defaultConfig(),
})
  .then(() => {
    console.log(`[ok] ingested ${assetId} (${kind})`);
  })
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
