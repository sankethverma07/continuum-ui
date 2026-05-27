/**
 * Shared types for the Continuum ingest pipeline.
 *
 * Any module that exports or consumes LOD metadata should import these, so
 * the contract between ingestion (Node / Deno edge) and consumption
 * (React front-end) never drifts.
 */

// ---------------------------------------------------------------------------
// Asset kind — the ingest pipeline handles two fundamentally different
// inputs: pre-rendered images (2D stills or turnaround sequences) and live
// meshes (GLB / GLTF). The tier generator branches on this.
// ---------------------------------------------------------------------------

export type AssetKind = 'image' | 'mesh';

// ---------------------------------------------------------------------------
// Tier descriptor — one row per LOD in the stack.
// ---------------------------------------------------------------------------

export interface LODTierDescriptor {
  /** 0 = coarsest (blueprint / lowest poly), N-1 = hero. */
  readonly index: number;
  /** Public URL of the derived asset (image or GLB). */
  readonly url: string;
  /** Decimation ratio (for meshes) or quality fraction (for images). */
  readonly ratio: number;
  /** Approximate triangle count for meshes, undefined for images. */
  readonly triangles?: number;
  /** Image width in pixels (images only). */
  readonly width?: number;
  /** Image height in pixels (images only). */
  readonly height?: number;
  /** Byte size on disk — useful for budgeting decisions client-side. */
  readonly sizeBytes: number;
}

// ---------------------------------------------------------------------------
// Image-asset metadata extracted at ingest.
// ---------------------------------------------------------------------------

export interface ImageMetadata {
  readonly kind: 'image';
  readonly width: number;
  readonly height: number;
  readonly channels: number;
  readonly bytes: number;
  /** Optional: true if the source contains an alpha channel. */
  readonly hasAlpha: boolean;
}

// ---------------------------------------------------------------------------
// Mesh-asset metadata extracted at ingest.
// ---------------------------------------------------------------------------

export interface MeshMetadata {
  readonly kind: 'mesh';
  readonly triangles: number;
  readonly vertices: number;
  readonly meshCount: number;
  readonly materialCount: number;
  readonly textureCount: number;
  readonly maxTextureRes: number;
  readonly hasNormalMap: boolean;
  readonly hasClearcoat: boolean;
  readonly hasTransmission: boolean;
  readonly hasSheen: boolean;
  readonly drawCallEstimate: number;
  readonly bytes: number;
}

export type AssetMetadata = ImageMetadata | MeshMetadata;

// ---------------------------------------------------------------------------
// Catalog row — what ends up in Supabase Postgres.
// ---------------------------------------------------------------------------

export interface CatalogEntry {
  readonly assetId: string;
  readonly kind: AssetKind;
  readonly complexityScore: number;
  readonly tierCount: number;
  readonly tiers: ReadonlyArray<LODTierDescriptor>;
  /**
   * Optional pre-rendered hero (e.g. a UE5/Octane path-traced turnaround
   * stored as an image sequence). When present, the client can use it as
   * a bonus top tier that exceeds what a live GLB can render in-browser.
   */
  readonly heroRenderUrl: string | null;
  readonly createdAt: string; // ISO 8601
}

// ---------------------------------------------------------------------------
// Ingest result — returned by the generator functions.
// ---------------------------------------------------------------------------

export interface IngestResult {
  readonly assetId: string;
  readonly metadata: AssetMetadata;
  readonly complexityScore: number;
  readonly tierCount: number;
  readonly tiers: ReadonlyArray<LODTierDescriptor>;
}
