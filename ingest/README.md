# Continuum Ingest — Supabase-backed auto-LOD pipeline

One hero asset in, a full variable-tier LOD stack out, catalog row written, ready for the client.

---

## What this gives you

- **One upload → N tiers.** A designer drops `bottle.png` (or `bottle.glb`) into a Supabase bucket. The pipeline auto-generates 3 to 7 LODs depending on asset complexity and writes a catalog row the front-end can read.
- **Image pipeline** (`sharp`): Sobel wireframe, tinted wireframe, posterized flats, blurred final, sharp hero — all derived from the single source image.
- **Mesh pipeline** (`gltf-transform` + `meshoptimizer`): quadric edge-collapse decimation at logarithmic ratios, silhouette-preserving, plus metadata extraction for PBR features.
- **Variable tier count** driven by a complexity score. Trivial cubes get 3 tiers, flagship assets get 7.
- **Doherty-windowed timeline** replayed on the client from the catalog row.

---

## Architecture

```
  designer drop
     │
     ▼
┌─────────────────────────────┐
│ Supabase Storage (raw/)     │   private bucket — source hero assets
└──────────────┬──────────────┘
               │ AFTER INSERT trigger
               ▼
┌─────────────────────────────┐
│ Edge Function: ingest-asset │   Deno runtime, image pipeline inline
│ (supabase/functions/...)    │   Mesh uploads → marked `pending`, picked
└──────────────┬──────────────┘   up by the Node worker
               │
     ┌─────────┴─────────┐
     ▼                   ▼
┌──────────┐      ┌─────────────────┐
│ cdn/     │      │ Node worker     │   Polls for pending mesh rows,
│ (public) │      │ (runWorker.ts)  │   runs gltf-transform, uploads LODs
└──────────┘      └──────────┬──────┘
                             │
                             ▼
                   ┌─────────────────┐
                   │ public.assets   │   Postgres catalog row: tiers jsonb,
                   │ (row ← status)  │   complexity_score, hero_render_url
                   └─────────────────┘
                             │
                             ▼
                   ┌─────────────────┐
                   │ React front-end │   useCatalogEntry + VariableTierImageHero
                   └─────────────────┘
```

---

## Setup (one-time)

### 1. Create a Supabase project

Go to [supabase.com](https://supabase.com/), create a new project. Free tier is fine. Note the project URL and both API keys (anon + service role). You'll find them under **Project Settings → API**.

### 2. Install the Supabase CLI

```bash
npm install -g supabase
supabase login
```

### 3. Link the project

From the `continuum UI/` directory:

```bash
supabase link --project-ref <your-project-ref>
```

The project ref is the subdomain of your Supabase URL (`<ref>.supabase.co`).

### 4. Apply the migration

```bash
supabase db push
```

This creates the `raw` and `cdn` storage buckets, the `public.assets` catalog table, the row-level security policies, and the trigger that fires the edge function on upload. If `supabase db push` errors, paste `supabase/migrations/001_continuum_catalog.sql` directly into the **SQL Editor** in the Supabase dashboard.

### 5. Deploy the edge function

```bash
supabase functions deploy ingest-asset --no-verify-jwt
```

`--no-verify-jwt` is required because the Postgres trigger calls the function with a service-role bearer, not a user JWT.

### 6. Tell Postgres where the edge function lives

Copy the function URL from the deploy output (looks like `https://<ref>.functions.supabase.co/ingest-asset`), then in the **SQL Editor** run:

```sql
alter database postgres set app.ingest_edge_url =
  'https://<ref>.functions.supabase.co/ingest-asset';
alter database postgres set app.ingest_service_key =
  '<your-service-role-key>';
```

### 7. Install ingest package deps

```bash
cd ingest
npm install
```

### 8. Wire env vars

Create `continuum UI/.env.local`:

```bash
# Client-visible (exposed to the browser — anon key only)
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>

# Server-only (never committed, never bundled)
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```

Add `.env.local` to `.gitignore` if it isn't already.

### 9. Start the Node worker (for mesh ingest)

In a second terminal:

```bash
cd ingest
npm run build   # or: npx tsx src/cli/runWorker.ts
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node dist/cli/runWorker.js
```

Or just run it dev-style with `tsx`:

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx src/cli/runWorker.ts
```

For production, deploy this worker to Railway, Fly.io, Render, or any Node host. It's a long-running process that polls the catalog.

---

## Usage

### Drop a hero image from the Supabase dashboard

1. Go to **Storage → raw** bucket.
2. Upload `bottle.png`.
3. Watch **Table Editor → assets** — a row appears with `status: processing`, then `ready` once the pipeline finishes (usually under 2 seconds for images).
4. In the client, the catalog entry is now reachable via `useCatalogEntry('bottle')`.

### Drop a hero GLB

Same flow, but the edge function marks it `pending` and the Node worker picks it up on its next poll. Expect 5–30 seconds depending on mesh complexity.

### Manual one-shot ingest from your laptop

If you don't want to deploy the edge function yet:

```bash
cd ingest
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  npx tsx src/cli/ingestOneShot.ts ./bottle.png
```

This uploads the file to `raw/`, runs the full pipeline locally, writes the derived tiers to `cdn/`, and writes the catalog row. Identical end state to the edge function flow.

### Local dry run (no Supabase at all)

```bash
cd ingest
npx tsx src/cli/dryRunImage.ts ./bottle.png
# writes ./out/bottle/*.webp and prints the IngestResult to stdout
```

---

## Consuming a catalog entry in the front-end

```tsx
import { useCatalogEntry, VariableTierImageHero } from '@continuum';

export const Hero = () => {
  const state = useCatalogEntry('bottle');

  if (state.status !== 'ready') {
    return <div style={{ aspectRatio: '1 / 1' }} />;
  }
  return <VariableTierImageHero entry={state.entry} />;
};
```

The component pre-loads every tier URL, plays the Doherty-windowed cross-fade, and reports progress into the Continuum hydration store.

---

## Fallback — what if the edge function won't deploy?

Supabase Edge Functions run in Deno. The `npm:sharp@0.33.5` specifier works in most regions, but native binding support has edge cases.

If `supabase functions deploy ingest-asset` errors, or you see `Error: Cannot find module 'sharp'` in the function logs:

- Skip the edge function entirely.
- Run `runWorker.ts` on your own infra (Node, any host).
- Modify the worker to poll `status='pending'` regardless of `kind` — it already handles both images and meshes, just remove the `.eq('kind', 'mesh')` filter in `supabaseWorker.ts::runPollLoop`.

Nothing about the client changes.

---

## What the catalog row looks like

```jsonc
{
  "id": "bottle",
  "kind": "image",
  "complexity_score": 14.7,
  "tier_count": 5,
  "tiers": [
    { "index": 0, "url": "…/bottle/lod0.webp", "ratio": 0.008, "width": 1920, "height": 1920, "sizeBytes": 18_340 },
    { "index": 1, "url": "…/bottle/lod1.webp", "ratio": 0.04,  "width": 1920, "height": 1920, "sizeBytes": 42_180 },
    { "index": 2, "url": "…/bottle/lod2.webp", "ratio": 0.15,  "width": 1920, "height": 1920, "sizeBytes": 84_320 },
    { "index": 3, "url": "…/bottle/lod3.webp", "ratio": 0.4,   "width": 1920, "height": 1920, "sizeBytes": 162_440 },
    { "index": 4, "url": "…/bottle/lod4.webp", "ratio": 1.0,   "width": 1920, "height": 1920, "sizeBytes": 392_180 }
  ],
  "hero_render_url": null,
  "status": "ready",
  "created_at": "2026-04-21T20:07:14Z"
}
```

---

## Costs

At time of writing, Supabase free tier covers:

- 1 GB database, 1 GB file storage, 2 GB egress
- 500K edge function invocations / month

An image ingest costs 1 edge-function invocation + N+1 storage writes (original + N tiers). A 5-tier image stack is ~700 KB on average. Free tier handles roughly 1,500 ingested assets before you pay anything.
