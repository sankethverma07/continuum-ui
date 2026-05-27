/**
 * Catalog barrel — consumers should import from this file, not deep paths.
 */

export * from './types';
export { getSupabaseClient, isCatalogConfigured } from './supabaseClient';
export { useCatalogEntry } from './useCatalogEntry';
export type { CatalogFetchState } from './useCatalogEntry';
export { timelineFor, totalDurationMs } from './timeline';
export type { TimelineStep } from './timeline';
