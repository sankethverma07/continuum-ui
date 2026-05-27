-- ---------------------------------------------------------------------------
-- Storage RLS — allow the in-app dropzone to upload to the `raw` bucket
--
-- The original migration created `raw` as a private bucket but didn't add
-- INSERT policies, so storage RLS defaults to deny. The browser dropzone
-- (running with the anon key) hits "new row violates row-level security
-- policy" the first time it tries to upload.
--
-- Policies added here:
--
--   1. INSERT into raw — anyone can upload. The bucket stays private
--      (READ is still locked) so the source files aren't publicly listable;
--      only the ingest Edge Function (running as service role) and authed
--      project members can read them.
--
--   2. UPDATE into raw — needed for our `upsert: true` upload option,
--      which the dropzone uses so re-publishing the same asset id
--      overwrites the previous source.
--
--   3. SELECT on assets — the dropzone polls the catalog row to know when
--      the Edge Function finishes processing. Without an anon-readable
--      slice, the poll loop times out even when ingest succeeded.
--      The existing policy already allows SELECT on status='ready' rows;
--      this widens it to include 'processing' so the poll sees progress.
--
-- Run with: paste into Supabase SQL editor and click Run, OR
--           `supabase db push` from the project root.
-- ---------------------------------------------------------------------------

-- 1. Storage INSERT — anon can write to the raw bucket -----------------------

drop policy if exists "raw bucket insert (public)" on storage.objects;
create policy "raw bucket insert (public)"
  on storage.objects for insert
  to public
  with check (bucket_id = 'raw');

-- 2. Storage UPDATE — anon can overwrite (upsert: true) ----------------------

drop policy if exists "raw bucket update (public)" on storage.objects;
create policy "raw bucket update (public)"
  on storage.objects for update
  to public
  using (bucket_id = 'raw')
  with check (bucket_id = 'raw');

-- 3. Catalog SELECT — broaden so polling sees 'processing' rows --------------
-- The dropzone polls assets.status to track ingest progress. Without this,
-- the row exists during processing but the anon client can't see it,
-- so the dropzone reports "no row" until ingest flips to 'ready'.

drop policy if exists "read ready assets" on public.assets;
drop policy if exists "read trackable assets" on public.assets;
create policy "read trackable assets"
  on public.assets for select
  using (status in ('processing', 'ready', 'failed'));
