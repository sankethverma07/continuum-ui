/**
 * Continuum UI — public barrel.
 * External consumers should import from `@continuum` alias, not deep paths.
 */

export { ContinuumAsset, preloadContinuumSkeleton } from './components/ContinuumAsset';
export type { ContinuumAssetProps } from './components/ContinuumAsset';

export { Continuum } from './components/Continuum';
export type { ContinuumProps, ContinuumSchedule } from './components/Continuum';

export {
  detectElementKind,
  detectKind,
  detectAllKinds,
} from './skeleton/detectElementKind';
export type {
  DetectMeta,
  DetectOptions,
  SkeletonKind,
} from './skeleton/detectElementKind';

export { LatticeAsset } from './components/LatticeAsset';
export type { LatticeAssetProps } from './components/LatticeAsset';

export { TorusKnotAsset } from './components/TorusKnotAsset';
export type { TorusKnotAssetProps } from './components/TorusKnotAsset';

export { CrystalAsset } from './components/CrystalAsset';
export type { CrystalAssetProps } from './components/CrystalAsset';

export { HelixAsset } from './components/HelixAsset';
export type { HelixAssetProps } from './components/HelixAsset';

export { BottleAsset } from './components/BottleAsset';
export type { BottleAssetProps } from './components/BottleAsset';

export { SneakerAsset } from './components/SneakerAsset';
export type { SneakerAssetProps } from './components/SneakerAsset';

export { StreamingBottleHero } from './components/StreamingBottleHero';
export type { StreamingBottleHeroProps } from './components/StreamingBottleHero';

export { VariableTierImageHero } from './components/VariableTierImageHero';
export type { VariableTierImageHeroProps } from './components/VariableTierImageHero';

export { SweepRevealHero } from './components/SweepRevealHero';
export type { SweepRevealHeroProps } from './components/SweepRevealHero';

export { VariableTierMeshHero, MESH_TIER_COUNT } from './components/VariableTierMeshHero';
export type { VariableTierMeshHeroProps, MeshTier } from './components/VariableTierMeshHero';

export { RealisticPhoneAsset, PHONE_COLORWAYS, PHONE_TIER_COUNT, PHONE_REGIONS } from './components/RealisticPhoneAsset';
export type { RealisticPhoneAssetProps, PhoneColorway, PhoneTier, PhoneRegion } from './components/RealisticPhoneAsset';

export { PhoneHydrationHero } from './components/PhoneHydrationHero';
export type { PhoneHydrationHeroProps } from './components/PhoneHydrationHero';

export { SemanticHydrationHero } from './components/SemanticHydrationHero';
export type { SemanticHydrationHeroProps } from './components/SemanticHydrationHero';

export { NaiveLoadingHero } from './components/NaiveLoadingHero';
export type { NaiveLoadingHeroProps } from './components/NaiveLoadingHero';

export {
  WristwatchAsset,
  WATCH_COLORWAYS,
  WATCH_TIER_COUNT,
  WATCH_REGIONS,
  approxTrianglesForWatchRegion,
  approxTrianglesTotalWatch,
  pickBlueprintColor,
  DEFAULT_BLUEPRINT_COLOR,
} from './components/WristwatchAsset';
export type {
  WristwatchAssetProps,
  WatchColorway,
  WatchTier,
  WatchRegion,
} from './components/WristwatchAsset';

export {
  WristwatchSemanticHero,
  formatWatchTris,
  WATCH_REGION_WEIGHTS,
  WATCH_REGION_LABEL,
  WATCH_TIER_BADGE,
} from './components/WristwatchSemanticHero';
export type { WristwatchSemanticHeroProps } from './components/WristwatchSemanticHero';

export { WristwatchNaiveHero } from './components/WristwatchNaiveHero';
export type { WristwatchNaiveHeroProps } from './components/WristwatchNaiveHero';

export {
  AutoProgressiveGLBAsset,
  preloadCatalogGLBs,
} from './components/AutoProgressiveGLBAsset';
export type { AutoProgressiveGLBAssetProps } from './components/AutoProgressiveGLBAsset';

export { AutoProgressiveHero } from './components/AutoProgressiveHero';
export type { AutoProgressiveHeroProps } from './components/AutoProgressiveHero';

export * as catalog from './catalog';

export { BlueprintSkeleton } from './components/BlueprintSkeleton';
export type { BlueprintSkeletonProps } from './components/BlueprintSkeleton';

export { HydrationOverlay } from './components/HydrationOverlay';
export type { HydrationOverlayProps } from './components/HydrationOverlay';

export * as perceivedTiming from './constants/perceivedTiming';

export { useContinuumStore, selectAsset, selectPerfTier, selectTotalVRAM } from './store/useContinuumStore';
export type {
  AABBSize,
  AssetRegistration,
  AssetStatus,
  ContinuumState,
  LODTier,
  NetworkSnapshot,
  PerfTier,
} from './store/types';

export { useHydration } from './hooks/useHydration';
export { useAssetPriority } from './hooks/useAssetPriority';
export { selectLOD } from './hooks/useLODSelector';
export type { LODSelectionInput } from './hooks/useLODSelector';

export { assertSkeletonMirror, computeAABBSize } from './utils/skeletonMirror';

// Skeleton (text-side progressive reveal primitives)
export { BlueprintText, useRevealProgress } from './skeleton/BlueprintText';
export type { BlueprintTextProps } from './skeleton/BlueprintText';
export {
  PageConductor,
  ConductorStep,
  StaggerGroup,
  useConductor,
  useRevealed,
} from './skeleton/PageConductor';
export { SkeletonCardFrame } from './skeleton/SkeletonCardFrame';
export type { SkeletonCardFrameProps } from './skeleton/SkeletonCardFrame';
export { BlueprintParagraph } from './skeleton/BlueprintParagraph';
export type { BlueprintParagraphProps } from './skeleton/BlueprintParagraph';

export {
  hologramBoot,
  hologramBootScale,
  HOLOGRAM_BOOT_MS,
  HOLOGRAM_SCALE_BULGE,
} from './utils/hologram';

export {
  LOD_THRESHOLDS_SQ,
  HYSTERESIS_SQ,
  MAX_SWAPS_PER_SEC,
  MIN_SWAP_INTERVAL_MS,
  LOD_FADE_SECONDS,
  VRAM_BUDGET_BYTES,
  MAX_LOD_BY_TIER,
  CONTINUUM_COLORS,
  SKELETON_MIRROR_TOLERANCE,
} from './constants';
