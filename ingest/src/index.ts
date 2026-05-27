/**
 * Continuum ingest — public surface.
 *
 * Any consumer (Supabase Edge Function, Vercel route, CLI tool, direct
 * import from a Node script) should import from this barrel to avoid
 * coupling to internal module layout.
 */

export * from './types.js';
export * from './complexity.js';
export { generateImageLODs, generateImageLODsFromBuffer } from './generateImageLODs.js';
export type { GenerateImageLODsOptions } from './generateImageLODs.js';
export { generateMeshLODs } from './generateMeshLODs.js';
export type { GenerateMeshLODsOptions } from './generateMeshLODs.js';
