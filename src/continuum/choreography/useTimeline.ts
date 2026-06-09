/**
 * useTimeline — RAF-driven sampler for the canonical reveal.
 *
 * Consumers receive a uniforms ref that's mutated every frame inside
 * a useFrame loop (R3F-native). This avoids React re-renders on every
 * tick — only the materials whose uniforms point at this ref will
 * re-render, and they do it on the render thread, not the React tree.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';

import {
  INITIAL_UNIFORMS,
  sampleTimeline,
  TIMELINE_RUNTIME_MS,
  type TimelineUniforms,
} from './timeline';

export interface TimelineHandle {
  /** Mutable ref always pointing at the current frame's uniforms. */
  readonly uniformsRef: React.MutableRefObject<TimelineUniforms>;
  /** Restart the timeline from t = 0. Cheap — no re-mount required. */
  readonly replay: () => void;
  /** Has the timeline reached its final stable state? */
  readonly isComplete: () => boolean;
}

/**
 * Boot the canonical timeline. The hook runs a RAF every frame and
 * keeps `uniformsRef.current` up to date. Pass `runToken` and bump it
 * to force a cold restart (e.g. on hot module reload during dev).
 */
export const useTimeline = (runToken: number = 0): TimelineHandle => {
  const uniformsRef = useRef<TimelineUniforms>(INITIAL_UNIFORMS);
  const startedAt = useRef<number>(performance.now());
  const completedAt = useRef<number | null>(null);

  // Reset on token bump.
  useEffect(() => {
    startedAt.current = performance.now();
    completedAt.current = null;
    uniformsRef.current = INITIAL_UNIFORMS;
  }, [runToken]);

  // Internal counter so an external replay() can also reset.
  const replayBumpRef = useRef(0);
  const replay = useMemo(
    () => () => {
      replayBumpRef.current += 1;
      startedAt.current = performance.now();
      completedAt.current = null;
      uniformsRef.current = INITIAL_UNIFORMS;
    },
    [],
  );

  // The actual per-frame sampler.
  useFrame(() => {
    const elapsed = performance.now() - startedAt.current;
    if (elapsed >= TIMELINE_RUNTIME_MS) {
      if (completedAt.current === null) {
        completedAt.current = performance.now();
      }
      // Pin uniforms to the final-frame values so the asset stays put.
      uniformsRef.current = sampleTimeline(TIMELINE_RUNTIME_MS);
      return;
    }
    uniformsRef.current = sampleTimeline(elapsed);
  });

  const isComplete = useMemo(
    () => () => completedAt.current !== null,
    [],
  );

  return { uniformsRef, replay, isComplete };
};
