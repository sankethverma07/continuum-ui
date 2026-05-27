-- ---------------------------------------------------------------------------
-- Continuum UI catalog schema
--
-- One row per uploaded hero asset. The ingest edge function writes this
-- row after generating the LOD stack. The front-end reads it to drive the
-- variable-tier hydration timeline.
--
-- Run with: `supabase db push`, or paste into the Supabase SQL editor.
-- ---------------------------------------------------------------------------

-- 1. Storage buckets --------------------------------------------------------
-- `raw` is where the designer drops the original hero asset.
-- `cdn` is where derived LODs land after ingest. The cdn bucket is public
-- so the front-end can fetch without signed URLs; raw is private so you
-- can charge different tiers access to the source file.

insert into storage.buckets (id, name, public)
values
  ('raw', 'raw', false),
  ('cdn', 'cdn', true)
on conflict (id) do update set public = excluded.public;

-- 2. Catalog table ----------------------------------------------------------

create table if not exists public.assets (
  id                text primary key,               -- assetId from upload
  kind              text not null check (kind in ('image', 'mesh')),
  complexity_score  numeric not null,
  tier_count        smallint not null check (tier_count between 3 and 7),
  tiers             jsonb not null,                  -- LODTierDescriptor[]
  hero_render_url   text,                            -- optional offline UE5 still
  source_url        text not null,                   -- path in raw/ bucket
  metadata          jsonb not null default '{}'::jsonb,
  status            text not null default 'pending'  -- pending|processing|ready|failed
                    check (status in ('pending','processing','ready','failed')),
  error             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists assets_created_at_idx on public.assets (created_at desc);
create index if not exists assets_status_idx on public.assets (status);

-- Keep `updated_at` current.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists assets_touch_updated_at on public.assets;
create trigger assets_touch_updated_at
  before update on public.assets
  for each row execute function public.touch_updated_at();

-- 3. Row-level security -----------------------------------------------------
-- The front-end should only see `ready` assets. The ingest function uses
-- the service role which bypasses RLS, so writes still work.

alter table public.assets enable row level security;

drop policy if exists "read ready assets" on public.assets;
create policy "read ready assets"
  on public.assets for select
  using (status = 'ready');

-- 4. Ingest trigger ---------------------------------------------------------
-- Fires the `ingest-asset` edge function whenever a new object lands in
-- the raw/ bucket. The edge function does the heavy lifting (download,
-- run generator, upload derived LODs, update the catalog row).

create or replace function public.notify_ingest_asset()
returns trigger language plpgsql
security definer as $$
declare
  edge_url text;
begin
  edge_url := current_setting('app.ingest_edge_url', true);
  if edge_url is null or edge_url = '' then
    raise notice 'app.ingest_edge_url not set; skipping ingest trigger';
    return new;
  end if;

  perform net.http_post(
    url := edge_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization',
        'Bearer ' || current_setting('app.ingest_service_key', true)
    ),
    body := jsonb_build_object(
      'bucket_id', new.bucket_id,
      'object_name', new.name,
      'size', new.metadata->>'size'
    )
  );
  return new;
end $$;

-- Use `supabase_functions.http_request` if `net.http_post` is unavailable;
-- the exact RPC name varies across Supabase releases. The readme covers
-- the manual URL+key bootstrap step.

drop trigger if exists on_raw_upload on storage.objects;
create trigger on_raw_upload
  after insert on storage.objects
  for each row
  when (new.bucket_id = 'raw')
  execute function public.notify_ingest_asset();

-- ---------------------------------------------------------------------------
-- Bootstrap values the user sets after `supabase functions deploy`:
--
--   alter database postgres set app.ingest_edge_url =
--     'https://<project>.functions.supabase.co/ingest-asset';
--   alter database postgres set app.ingest_service_key =
--     '<service-role-jwt>';
--
-- See ingest/README.md for the full walkthrough.
-- ---------------------------------------------------------------------------
