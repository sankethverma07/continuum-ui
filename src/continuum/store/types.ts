/**
 * Continuum UI — shared type surface for the hydration store.
 * Kept in a dedicated module so components can import types without pulling
 * the Zustand store implementation.
 */

/**
 * Four-tier LOD contract. Never widen to `number`.
 *
 *   0 — coarse blueprint (wireframe proxy, <16ms paint)
 *   1 — fine blueprint  (denser wireframe, silhouette-accurate)
 *   2 — mid textures    (flat shaded, low-res material)
 *   3 — hero (AAA)      (full PBR, shadows, highlights, glow, subtle lighting)
 */
export type LODTier = 0 | 1 | 2 | 3;

/** Lifecycle of a single asset registration. */
export type AssetStatus = 'idle' | 'loading' | 'ready' | 'error';

/** System-level performance tier. Written by `useHydration`. */
export type PerfTier = 'low' | 'mid' | 'high';

/** AABB size as [width, height, depth] in world units. Used by Skeleton Mirror. */
export type AABBSize = readonly [number, number, number];

/** One entry in the hydration registry. */
export interface AssetRegistration {
  readonly id: string;
  status: AssetStatus;
  currentLOD: LODTier;
  /** Upper bound enforced by `useHydration` based on bandwidth / VRAM. */
  maxLOD: LODTier;
  /** Estimated VRAM consumption in bytes at the currently active LOD. */
  vramBytes: number;
  /** performance.now() timestamp of last LOD swap (for rate-limit). */
  lastSwapAt: number;
  /** Bounding box from LOD 0, used to assert Skeleton Mirror parity. */
  skeletonBounds: AABBSize | null;
  /**
   * Perceived-experience progress, 0 → 1. Driven by the asset's own loader
   * (Spline onLoad, @react-three/drei useProgress, or a simulated curve) and
   * consumed by <HydrationOverlay /> so the UI has a loop to render against
   * while KTX2/Draco payloads stream in. Never used for LOD gating.
   */
  loadingProgress: number;
  /**
   * Pre-hydration priority, 0 → 1. Composed by `useAssetPriority` from
   * multiple signals (viewport proximity, scroll velocity, dwell). Never
   * driven by cursor position — trackpad and keyboard users deserve the
   * same LOD ladder as mouse users.
   *
   * The cross-asset VRAM budget in `useHydration` reads this field to decide
   * *which* assets keep headroom when we run over-budget: lowest priority
   * gets its `maxLOD` clamped first.
   *
   * Default 0 — heroes become important only once they've demonstrated some
   * signal of being actually looked at.
   */
  priority: number;
}

/** Snapshot of live network conditions from the Network Information API. */
export interface NetworkSnapshot {
  readonly bandwidthMbps: number | null;
  readonly effectiveType: NetworkInformation['effectiveType'] | null;
  readonly saveData: boolean;
}

/** Full shape of `useContinuumStore`. */
export interface ContinuumState {
  // --- registry ---
  readonly assets: Readonly<Record<string, AssetRegistration>>;
  readonly totalVRAMBytes: number;

  // --- system telemetry (written by useHydration) ---
  readonly perfTier: PerfTier;
  readonly network: NetworkSnapshot;

  // --- actions ---
  registerAsset: (id: string, skeletonBounds?: AABBSize) => void;
  unregisterAsset: (id: string) => void;
  setStatus: (id: string, status: AssetStatus) => void;
  setLOD: (id: string, lod: LODTier) => void;
  setMaxLOD: (id: string, lod: LODTier) => void;
  updateVRAM: (id: string, bytes: number) => void;
  /**
   * Write a 0–1 perceived-progress value for an asset. Clamped at the action.
   * Should be driven by the asset's loader (Spline onLoad signal, drei
   * `useProgress`, or a research-backed simulated curve — see
   * `constants/perceivedTiming.ts`).
   */
  setLoadingProgress: (id: string, progress: number) => void;
  /**
   * Write a 0–1 pre-hydration priority for an asset. Clamped at the action.
   * Intended to be called from `useAssetPriority` — components should not
   * set priority by hand, or the cross-asset budget loses its contract.
   */
  setPriority: (id: string, priority: number) => void;
  setPerfTier: (tier: PerfTier) => void;
  setNetwork: (snapshot: NetworkSnapshot) => void;
}
