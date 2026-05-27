/**
 * `useCatalogEntry` — fetches a catalog row from Supabase and returns it
 * in a React-friendly shape.
 *
 * Keeps its own local state rather than wiring into the Zustand store,
 * because catalog entries are content, not hydration lifecycle. The store
 * already tracks hydration lifecycle per asset.
 */

import { useEffect, useState } from 'react';

import { getSupabaseClient, isCatalogConfigured } from './supabaseClient.js';
import type { CatalogEntry } from './types.js';

export type CatalogFetchState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly error: string }
  | { readonly status: 'ready'; readonly entry: CatalogEntry };

export const useCatalogEntry = (assetId: string | null): CatalogFetchState => {
  const [state, setState] = useState<CatalogFetchState>({ status: 'idle' });

  useEffect(() => {
    if (!assetId) {
      setState({ status: 'idle' });
      return;
    }
    if (!isCatalogConfigured()) {
      setState({
        status: 'error',
        error: 'Supabase env vars missing — running in local-only mode.',
      });
      return;
    }

    let cancelled = false;
    setState({ status: 'loading' });

    const load = async (): Promise<void> => {
      try {
        const client = getSupabaseClient();
        const { data, error } = await client
          .from('assets')
          .select('*')
          .eq('id', assetId)
          .eq('status', 'ready')
          .maybeSingle();

        if (cancelled) return;
        if (error) {
          setState({ status: 'error', error: error.message });
          return;
        }
        if (!data) {
          setState({ status: 'error', error: `no catalog row for ${assetId}` });
          return;
        }

        const entry: CatalogEntry = {
          id: data['id'] as string,
          kind: data['kind'] as CatalogEntry['kind'],
          complexityScore: Number(data['complexity_score']),
          tierCount: Number(data['tier_count']),
          tiers: data['tiers'] as CatalogEntry['tiers'],
          heroRenderUrl: (data['hero_render_url'] as string | null) ?? null,
          status: data['status'] as CatalogEntry['status'],
          createdAt: data['created_at'] as string,
        };
        setState({ status: 'ready', entry });
      } catch (err: unknown) {
        if (cancelled) return;
        setState({
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [assetId]);

  return state;
};
