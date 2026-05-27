/**
 * Supabase ingest worker (Node side).
 *
 * Responsibilities:
 *   - Poll the `assets` table for rows in status = 'pending' and kind = 'mesh'
 *     (the edge function defers mesh work to us because gltf-transform
 *     needs native bindings that Deno edge can't host reliably).
 *   - Also handles image ingest manually when invoked with --one-shot, so
 *     users can run the full pipeline from their laptop without deploying
 *     the edge function at all.
 *   - Downloads the source file from the raw bucket, runs the generator,
 *     uploads every tier to the cdn bucket, patches the catalog row.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { generateImageLODs } from '../generateImageLODs.js';
import { generateMeshLODs } from '../generateMeshLODs.js';
import type { IngestResult, LODTierDescriptor } from '../types.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

interface WorkerConfig {
  readonly supabaseUrl: string;
  readonly serviceKey: string;
  readonly rawBucket: string;
  readonly cdnBucket: string;
  readonly pollIntervalMs: number;
}

export const defaultConfig = (): WorkerConfig => {
  const need = (key: string): string => {
    const v = process.env[key];
    if (!v) throw new Error(`Missing env var: ${key}`);
    return v;
  };
  return {
    supabaseUrl: need('SUPABASE_URL'),
    serviceKey: need('SUPABASE_SERVICE_ROLE_KEY'),
    rawBucket: process.env['CONTINUUM_RAW_BUCKET'] ?? 'raw',
    cdnBucket: process.env['CONTINUUM_CDN_BUCKET'] ?? 'cdn',
    pollIntervalMs: Number(process.env['CONTINUUM_POLL_MS'] ?? '5000'),
  };
};

// ---------------------------------------------------------------------------
// Public: one-shot ingest for a specific local file.
// Useful when the user wants to push an asset from their laptop without
// deploying the edge function at all. Works for both image and mesh.
// ---------------------------------------------------------------------------

export interface OneShotOptions {
  readonly inputPath: string;
  readonly assetId: string;
  readonly kind: 'image' | 'mesh';
  readonly config: WorkerConfig;
}

export const ingestOneShot = async (opts: OneShotOptions): Promise<void> => {
  const client = createClient(opts.config.supabaseUrl, opts.config.serviceKey);
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'continuum-'));

  // Upload the original to raw/ so the catalog row has a meaningful
  // source_url and the pipeline matches what happens with a real drop.
  const rawKey = `${opts.assetId}${path.extname(opts.inputPath)}`;
  const sourceBuf = await fs.readFile(opts.inputPath);
  await uploadToBucket(client, opts.config.rawBucket, rawKey, sourceBuf);

  await client.from('assets').upsert({
    id: opts.assetId,
    kind: opts.kind,
    complexity_score: 0,
    tier_count: 0,
    tiers: [],
    source_url: `${opts.config.rawBucket}/${rawKey}`,
    status: 'processing',
  });

  try {
    const result =
      opts.kind === 'mesh'
        ? await generateMeshLODs(opts.inputPath, {
            outDir: tmpDir,
            assetId: opts.assetId,
          })
        : await generateImageLODs(opts.inputPath, {
            outDir: tmpDir,
            assetId: opts.assetId,
          });

    const publishedTiers = await uploadTiers(client, opts.config, result);

    await client
      .from('assets')
      .update({
        complexity_score: result.complexityScore,
        tier_count: result.tierCount,
        tiers: publishedTiers,
        metadata: result.metadata,
        status: 'ready',
      })
      .eq('id', opts.assetId);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await client
      .from('assets')
      .update({ status: 'failed', error: message })
      .eq('id', opts.assetId);
    throw err;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
};

// ---------------------------------------------------------------------------
// Public: long-running poll loop for mesh rows the edge function punted.
// ---------------------------------------------------------------------------

export const runPollLoop = async (config: WorkerConfig): Promise<never> => {
  const client = createClient(config.supabaseUrl, config.serviceKey);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await client
      .from('assets')
      .select('id, kind, source_url')
      .eq('status', 'pending')
      .eq('kind', 'mesh')
      .order('created_at', { ascending: true })
      .limit(1);

    if (error) {
      console.error('[worker] poll error:', error.message);
    } else if (data && data.length > 0) {
      const row = data[0]!;
      await processMeshRow(client, config, row.id, row.source_url);
    }

    await new Promise((r) => setTimeout(r, config.pollIntervalMs));
  }
};

// ---------------------------------------------------------------------------
// Internal: process a single pending mesh row.
// ---------------------------------------------------------------------------

const processMeshRow = async (
  client: SupabaseClient,
  config: WorkerConfig,
  assetId: string,
  sourceUrl: string,
): Promise<void> => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'continuum-'));
  const [bucket, ...rest] = sourceUrl.split('/');
  const objectName = rest.join('/');
  if (!bucket || !objectName) {
    await client
      .from('assets')
      .update({ status: 'failed', error: `bad source_url: ${sourceUrl}` })
      .eq('id', assetId);
    return;
  }

  await client.from('assets').update({ status: 'processing' }).eq('id', assetId);

  try {
    const { data: blob, error } = await client.storage
      .from(bucket)
      .download(objectName);
    if (error || !blob) throw error ?? new Error('empty download');

    const localPath = path.join(tmpDir, path.basename(objectName));
    await fs.writeFile(localPath, Buffer.from(await blob.arrayBuffer()));

    const result = await generateMeshLODs(localPath, {
      outDir: tmpDir,
      assetId,
    });
    const publishedTiers = await uploadTiers(client, config, result);

    await client
      .from('assets')
      .update({
        complexity_score: result.complexityScore,
        tier_count: result.tierCount,
        tiers: publishedTiers,
        metadata: result.metadata,
        status: 'ready',
      })
      .eq('id', assetId);

    console.log(
      `[worker] ingested ${assetId}: ${result.tierCount} tiers, ` +
        `score=${result.complexityScore.toFixed(2)}`,
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await client
      .from('assets')
      .update({ status: 'failed', error: message })
      .eq('id', assetId);
    console.error(`[worker] failed ${assetId}:`, message);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
};

// ---------------------------------------------------------------------------
// Internal: upload every derived tier and rewrite URL fields to public URLs.
// ---------------------------------------------------------------------------

const uploadTiers = async (
  client: SupabaseClient,
  config: WorkerConfig,
  result: IngestResult,
): Promise<LODTierDescriptor[]> => {
  const published: LODTierDescriptor[] = [];
  for (const tier of result.tiers) {
    const body = await fs.readFile(tier.url);
    const ext = path.extname(tier.url);
    const key = `${result.assetId}/lod${tier.index}${ext}`;
    await uploadToBucket(client, config.cdnBucket, key, body);
    const { data: pub } = client.storage.from(config.cdnBucket).getPublicUrl(key);
    published.push({ ...tier, url: pub.publicUrl });
  }
  return published;
};

const uploadToBucket = async (
  client: SupabaseClient,
  bucket: string,
  key: string,
  body: Buffer,
): Promise<void> => {
  const { error } = await client.storage.from(bucket).upload(key, body, {
    upsert: true,
  });
  if (error) throw error;
};
