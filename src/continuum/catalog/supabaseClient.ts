/**
 * Lazy Supabase client singleton.
 *
 * We defer instantiation so apps that never use the catalog don't pay the
 * bundle/init cost. Throws a loud, actionable error if the env vars are
 * missing — this is strictly better than a silent "fetched 0 rows".
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

export const getSupabaseClient = (): SupabaseClient => {
  if (cached) return cached;

  const url = import.meta.env['VITE_SUPABASE_URL'];
  const anonKey = import.meta.env['VITE_SUPABASE_ANON_KEY'];

  if (!url || !anonKey) {
    throw new Error(
      '[continuum/catalog] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is ' +
        'missing. Add them to .env.local — see ingest/README.md.',
    );
  }

  cached = createClient(url, anonKey, {
    auth: { persistSession: false },
  });
  return cached;
};

/**
 * True if env vars are present. Components can use this to decide whether
 * to attempt a catalog fetch at all (e.g. during local-only development
 * where nothing is wired yet).
 */
export const isCatalogConfigured = (): boolean =>
  Boolean(
    import.meta.env['VITE_SUPABASE_URL'] &&
      import.meta.env['VITE_SUPABASE_ANON_KEY'],
  );
