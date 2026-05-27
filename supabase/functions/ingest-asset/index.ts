/**
 * Supabase Edge Function: ingest-asset (zero-deps build)
 *
 * Storage trigger handler — fired when an object lands in `raw`.
 *
 * Pipeline:
 *   1. Validate the trigger payload.
 *   2. Insert a `processing` row in public.assets.
 *   3. Download the source GLB from `raw`.
 *   4. Compute tier count from byte size and upload N copies of the
 *      source to `cdn` as tier-0.glb ... tier-(N-1).glb.
 *   5. Patch the row with tier descriptors and flip to `ready`.
 *
 * Decimation deferred: this build skips per-tier polygon reduction —
 * all tiers point at the same GLB. The front-end's blueprint reveal
 * still plays correctly because the engine treats each tier as a
 * separate URL it can crossfade between.
 *
 * Real per-tier decimation (gltf-transform + meshoptimizer) needs a
 * Deno-compatible packaging that hasn't been finalised yet — adding it
 * requires only swapping the upload loop to call a `decimate(srcBuf, ratio)`
 * helper before each upload.
 */

// @ts-expect-error — Deno std URL imports resolve at deploy time.
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
// @ts-expect-error — Supabase client resolves at deploy time.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

interface TriggerPayload {
  bucket_id: string;
  object_name: string;
  size?: string;
}

interface TierDescriptor {
  index: number;
  url: string;
  ratio: number;
  sizeBytes: number;
}

const tierCountFor = (bytes: number): number => {
  if (bytes < 100_000) return 3;
  if (bytes < 500_000) return 4;
  if (bytes < 2_000_000) return 5;
  if (bytes < 8_000_000) return 6;
  return 7;
};

const ratiosFor = (n: number): number[] => {
  switch (n) {
    case 3: return [0.02, 0.3, 1.0];
    case 4: return [0.01, 0.08, 0.3, 1.0];
    case 5: return [0.008, 0.04, 0.15, 0.4, 1.0];
    case 6: return [0.005, 0.02, 0.08, 0.2, 0.5, 1.0];
    default: return [0.004, 0.015, 0.05, 0.15, 0.35, 0.65, 1.0];
  }
};

// @ts-expect-error — Deno global resolves at deploy time.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
// @ts-expect-error — Deno global resolves at deploy time.
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req: Request) => {
  let payload: TriggerPayload;
  try {
    payload = (await req.json()) as TriggerPayload;
  } catch {
    return new Response('invalid payload', { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const path = payload.object_name;
  const firstSegment = path.split('/')[0] ?? path;
  const assetId = firstSegment !== path
    ? firstSegment
    : path.replace(/\.[^.]+$/, '');

  if (!/\.(glb|gltf)$/i.test(path)) {
    return new Response(
      JSON.stringify({ ok: false, error: 'only .glb/.gltf supported' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  await supabase.from('assets').upsert({
    id: assetId,
    kind: 'mesh',
    complexity_score: 0,
    tier_count: 3,
    tiers: [],
    source_url: `${payload.bucket_id}/${path}`,
    status: 'processing',
  });

  try {
    const { data: blob, error: dlErr } = await supabase.storage
      .from(payload.bucket_id)
      .download(path);
    if (dlErr || !blob) throw dlErr ?? new Error('empty download');
    const srcBuf = new Uint8Array(await blob.arrayBuffer());

    const tierCount = tierCountFor(srcBuf.byteLength);
    const ratios = ratiosFor(tierCount);
    const tiers: TierDescriptor[] = [];

    for (let i = 0; i < tierCount; i++) {
      const ratio = ratios[i] ?? 1.0;
      const filename = `${assetId}/tier-${i}.glb`;
      const { error: upErr } = await supabase.storage
        .from('cdn')
        .upload(filename, srcBuf, {
          contentType: 'model/gltf-binary',
          upsert: true,
        });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage
        .from('cdn')
        .getPublicUrl(filename);
      tiers.push({
        index: i,
        url: pub.publicUrl,
        ratio,
        sizeBytes: srcBuf.byteLength,
      });
    }

    const score = Math.log2(Math.max(1, srcBuf.byteLength / 100_000)) * 2;

    await supabase.from('assets').update({
      complexity_score: score,
      tier_count: tierCount,
      tiers,
      metadata: { sourceBytes: srcBuf.byteLength, decimation: 'deferred' },
      status: 'ready',
    }).eq('id', assetId);

    return new Response(
      JSON.stringify({ ok: true, assetId, tierCount }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from('assets')
      .update({ status: 'failed', error: message })
      .eq('id', assetId);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
