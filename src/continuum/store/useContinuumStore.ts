/**
 * Continuum UI — global hydration store.
 *
 * Single source of truth for every 3D asset's loading status, active LOD,
 * VRAM cost, and system-level performance tier. `<ContinuumAsset />` reads
 * from and writes to this store; `useHydration` writes `perfTier`, `network`,
 * and per-asset `maxLOD`.
 *
 * Discipline (see CLAUDE.md §9):
 *   - Components read via selectors, never the whole state.
 *   - Mutations flow only through the actions defined here.
 *   - Never store THREE.Object3D instances in this store — refs only.
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type {
  AABBSize,
  AssetRegistration,
  AssetStatus,
  ContinuumState,
  LODTier,
  NetworkSnapshot,
  PerfTier,
} from './types';

const INITIAL_NETWORK: NetworkSnapshot = {
  bandwidthMbps: null,
  effectiveType: null,
  saveData: false,
};

const makeRegistration = (
  id: string,
  skeletonBounds: AABBSize | null,
): AssetRegistration => ({
  id,
  status: 'idle',
  currentLOD: 0,
  // Default ceiling is 3 (AAA hero) now that the LOD ladder has four rungs.
  // useHydration may clamp this down per asset.
  maxLOD: 3,
  vramBytes: 0,
  lastSwapAt: 0,
  skeletonBounds,
  loadingProgress: 0,
  // Default 0: assets earn priority through signals, they don't start with it.
  priority: 0,
});

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * Recompute aggregate VRAM from the registry. Called inside actions that
 * mutate any asset's `vramBytes` so consumers of `totalVRAMBytes` stay
 * consistent without having to subscribe to every asset individually.
 */
const sumVRAM = (assets: Record<string, AssetRegistration>): number => {
  let total = 0;
  for (const id in assets) {
    const a = assets[id];
    if (a) total += a.vramBytes;
  }
  return total;
};

export const useContinuumStore = create<ContinuumState>()(
  subscribeWithSelector((set) => ({
    // --- initial state -----------------------------------------------------
    assets: {},
    totalVRAMBytes: 0,
    perfTier: 'mid',
    network: INITIAL_NETWORK,

    // --- registry actions --------------------------------------------------
    registerAsset: (id, skeletonBounds) =>
      set((state) => {
        if (state.assets[id]) return state; // idempotent
        const next: Record<string, AssetRegistration> = {
          ...state.assets,
          [id]: makeRegistration(id, skeletonBounds ?? null),
        };
        return { assets: next, totalVRAMBytes: sumVRAM(next) };
      }),

    unregisterAsset: (id) =>
      set((state) => {
        if (!state.assets[id]) return state;
        const next = { ...state.assets };
        delete next[id];
        return { assets: next, totalVRAMBytes: sumVRAM(next) };
      }),

    setStatus: (id, status: AssetStatus) =>
      set((state) => {
        const current = state.assets[id];
        if (!current) return state;
        return {
          assets: { ...state.assets, [id]: { ...current, status } },
        };
      }),

    setLOD: (id, lod: LODTier) =>
      set((state) => {
        const current = state.assets[id];
        if (!current) return state;
        if (current.currentLOD === lod) return state;
        return {
          assets: {
            ...state.assets,
            [id]: { ...current, currentLOD: lod, lastSwapAt: performance.now() },
          },
        };
      }),

    setMaxLOD: (id, lod: LODTier) =>
      set((state) => {
        const current = state.assets[id];
        if (!current || current.maxLOD === lod) return state;
        // Clamp current down if we just lowered the ceiling.
        const clampedCurrent = (Math.min(current.currentLOD, lod) as LODTier);
        return {
          assets: {
            ...state.assets,
            [id]: { ...current, maxLOD: lod, currentLOD: clampedCurrent },
          },
        };
      }),

    updateVRAM: (id, bytes) =>
      set((state) => {
        const current = state.assets[id];
        if (!current || current.vramBytes === bytes) return state;
        const next = {
          ...state.assets,
          [id]: { ...current, vramBytes: bytes },
        };
        return { assets: next, totalVRAMBytes: sumVRAM(next) };
      }),

    setLoadingProgress: (id, progress) =>
      set((state) => {
        const current = state.assets[id];
        if (!current) return state;
        const clamped = clamp01(progress);
        if (current.loadingProgress === clamped) return state;
        return {
          assets: {
            ...state.assets,
            [id]: { ...current, loadingProgress: clamped },
          },
        };
      }),

    setPriority: (id, priority) =>
      set((state) => {
        const current = state.assets[id];
        if (!current) return state;
        const clamped = clamp01(priority);
        // 2dp dead-zone: priority is a smooth signal, so we don't want every
        // sub-percent jitter to force a re-render across the registry.
        const quantized = Math.round(clamped * 100) / 100;
        if (current.priority === quantized) return state;
        return {
          assets: {
            ...state.assets,
            [id]: { ...current, priority: quantized },
          },
        };
      }),

    // --- system telemetry --------------------------------------------------
    setPerfTier: (tier: PerfTier) =>
      set((state) => (state.perfTier === tier ? state : { perfTier: tier })),

    setNetwork: (snapshot: NetworkSnapshot) =>
      set(() => ({ network: snapshot })),
  })),
);

// --- selector helpers --------------------------------------------------------
// These are the recommended read patterns; components should import them
// instead of subscribing to the whole store.

export const selectAsset = (id: string) => (s: ContinuumState) => s.assets[id];

export const selectPerfTier = (s: ContinuumState): PerfTier => s.perfTier;

export const selectTotalVRAM = (s: ContinuumState): number => s.totalVRAMBytes;
