/**
 * Skeleton Mirror assertion (CLAUDE.md §3).
 *
 * LOD 0 and LOD 2 must share the same AABB dimensions (within tolerance).
 * If they don't, the LOD swap will "pop" visibly and break perceptual
 * continuity. We compute each tier's bounding box and compare sizes.
 *
 * Dev-only: no-op in production builds so it doesn't cost a traverse.
 */

import { Box3, Object3D, Vector3 } from 'three';
import { SKELETON_MIRROR_TOLERANCE } from '../constants';
import type { AABBSize } from '../store/types';

const _box = new Box3();
const _size = new Vector3();

/** Compute the AABB size of a scene/object as a tuple. */
export const computeAABBSize = (object: Object3D): AABBSize => {
  _box.setFromObject(object);
  _box.getSize(_size);
  return [_size.x, _size.y, _size.z] as const;
};

/**
 * Throws in development if LOD 0 and LOD 2 bounding-box dimensions diverge by
 * more than `SKELETON_MIRROR_TOLERANCE` (default 1%). No-ops in production.
 *
 * @param id  Asset id (for a readable error message).
 * @param lod0  The LOD 0 Object3D.
 * @param lod2  The LOD 2 Object3D.
 */
export const assertSkeletonMirror = (
  id: string,
  lod0: Object3D,
  lod2: Object3D,
): void => {
  if (import.meta.env.PROD) return;

  const a = computeAABBSize(lod0);
  const b = computeAABBSize(lod2);

  const axes: readonly ['x', 'y', 'z'] = ['x', 'y', 'z'];
  for (let i = 0; i < 3; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    const denom = Math.max(Math.abs(av), Math.abs(bv), 1e-6);
    const delta = Math.abs(av - bv) / denom;
    if (delta > SKELETON_MIRROR_TOLERANCE) {
      const axis = axes[i];
      throw new Error(
        `[Continuum] Skeleton Mirror violation on "${id}" (${axis}-axis): ` +
          `LOD0=${av.toFixed(4)} vs LOD2=${bv.toFixed(4)} ` +
          `(delta ${(delta * 100).toFixed(2)}% > ${(SKELETON_MIRROR_TOLERANCE * 100).toFixed(0)}%). ` +
          `Re-export LOD 0 with the same bounding box as LOD 2.`,
      );
    }
  }
};
