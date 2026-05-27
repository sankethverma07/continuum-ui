/**
 * <WristwatchSemanticHero /> — semantic progressive rendering, watch edition.
 *
 * Structural sibling of <SemanticHydrationHero />. Drives the WristwatchAsset
 * through a per-region Doherty schedule where the dial (the subject) lands
 * first and the strap (peripheral) finishes last.
 *
 *   dial   — weight 1.0   → finishes at ~35 % of budget
 *   bezel  — weight 0.7   → finishes at ~55 %
 *   case   — weight 0.4   → finishes at ~75 %
 *   strap  — weight 0.2   → finishes at 100 %
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, ContactShadows } from '@react-three/drei';

import {
  WristwatchAsset,
  WATCH_COLORWAYS,
  WATCH_TIER_COUNT,
  WATCH_REGIONS,
  pickBlueprintColor,
  DEFAULT_BLUEPRINT_COLOR,
} from './WristwatchAsset';
import type {
  WatchTier,
  WatchRegion,
} from './WristwatchAsset';
import { totalDurationMs } from '../catalog/timeline';
import { useContinuumStore } from '../store/useContinuumStore';

const REGION_WEIGHTS: Record<WatchRegion, number> = {
  dial:  1.0,
  bezel: 0.7,
  case:  0.4,
  strap: 0.2,
};

const completionFraction = (weight: number): number => {
  const w = Math.max(0.2, Math.min(1.0, weight));
  const t = (1.0 - w) / (1.0 - 0.2);
  return 0.35 + (1.0 - 0.35) * t;
};

interface RegionSchedule {
  readonly region: WatchRegion;
  readonly steps: ReadonlyArray<{ readonly tier: WatchTier; readonly atMs: number }>;
}

const buildSchedules = (totalMs: number): ReadonlyArray<RegionSchedule> =>
  WATCH_REGIONS.map((region) => {
    const weight = REGION_WEIGHTS[region];
    // Early tiers (0 → N-2) spread across the weighted completion window so
    // the dial still reaches "detail" ahead of the strap — that's the
    // subject-first reveal. The FINAL tier (PBR hero) is pinned to totalMs
    // for every region so the watch's fully-loaded moment lines up with the
    // naive baseline's pop-in. User sees the same wall-clock completion on
    // both sides; the right watch just has meaningful content earlier.
    const earlyTierCount = WATCH_TIER_COUNT - 1;        // tiers 0..3
    const earlyCompleteBy = completionFraction(weight) * totalMs;
    const stepMs = earlyCompleteBy / Math.max(1, earlyTierCount - 1);
    const earlySteps = Array.from({ length: earlyTierCount }, (_, i) => ({
      tier: i as WatchTier,
      atMs: Math.round(i * stepMs),
    }));
    const finalStep = {
      tier: (WATCH_TIER_COUNT - 1) as WatchTier,
      atMs: totalMs,
    };
    return { region, steps: [...earlySteps, finalStep] };
  });

const TIER_BADGE: Record<WatchTier, string> = {
  0: 'blockout',
  1: 'structure',
  2: 'matte',
  3: 'detail',
  4: 'pbr hero',
};

const REGION_LABEL: Record<WatchRegion, string> = {
  dial:  'Dial',
  bezel: 'Bezel',
  case:  'Case',
  strap: 'Strap',
};

export interface WristwatchSemanticHeroProps {
  readonly colorway?: keyof typeof WATCH_COLORWAYS;
  readonly registryId?: string;
  readonly background?: string;
  readonly onHydrated?: () => void;
  readonly autoRotate?: number;
  /**
   * Fires whenever the per-region tier state changes. Lets the parent page
   * render the progress graph OUTSIDE the canvas overlay so it doesn't
   * shadow the watch itself.
   */
  readonly onTiersChange?: (tiers: Record<WatchRegion, WatchTier>) => void;
  /**
   * Bump this value to reset the hydration sequence WITHOUT remounting
   * the Canvas (which would destroy and recreate the WebGL context, paying
   * the shader-compile and texture-upload costs again). The hero's internal
   * tier + timer state resets whenever this token changes.
   */
  readonly runToken?: number;
  /** Optional explicit blueprint wire colour (overrides auto-pick). */
  readonly blueprintColor?: string;
  /**
   * Page background hex — when supplied without an explicit blueprintColor,
   * the hero auto-picks a readable blueprint tint via pickBlueprintColor().
   */
  readonly backgroundHex?: string;
}

export const WristwatchSemanticHero = ({
  colorway = 'gold',
  registryId = 'continuum-watch-semantic',
  background,
  onHydrated,
  autoRotate = 0.45,
  onTiersChange,
  runToken = 0,
  blueprintColor,
  backgroundHex,
}: WristwatchSemanticHeroProps) => {
  // Resolve the blueprint wireframe colour. Explicit override > auto-pick
  // from backgroundHex > module default.
  const resolvedBlueprintColor = useMemo(() => {
    if (blueprintColor) return blueprintColor;
    if (backgroundHex) return pickBlueprintColor(backgroundHex);
    return DEFAULT_BLUEPRINT_COLOR;
  }, [blueprintColor, backgroundHex]);
  const id = registryId;
  // (palette no longer computed here — the parent page derives it from
  // colorway for its own progress panel. We just forward colorway down.)

  const totalMs = useMemo(() => totalDurationMs(WATCH_TIER_COUNT), []);
  const schedules = useMemo(() => buildSchedules(totalMs), [totalMs]);

  const [regionTiers, setRegionTiers] = useState<Record<WatchRegion, WatchTier>>({
    dial:  0,
    bezel: 0,
    case:  0,
    strap: 0,
  });

  const startedAtRef = useRef<number>(performance.now());

  useEffect(() => {
    const store = useContinuumStore.getState();
    store.registerAsset(id);
    store.setStatus(id, 'loading');
    startedAtRef.current = performance.now();
    return () => {
      useContinuumStore.getState().unregisterAsset(id);
    };
  }, [id]);

  useEffect(() => {
    const nudge = () => window.dispatchEvent(new Event('resize'));
    const t1 = window.setTimeout(nudge, 0);
    const t2 = window.setTimeout(nudge, 120);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  // Tier-advance timers. Re-runs whenever `runToken` bumps, which replays
  // the Doherty schedule WITHOUT destroying the Canvas or GL context —
  // so shader compilation + texture upload costs are paid once at first
  // mount and never again.
  useEffect(() => {
    // Reset tier + start clock on each new run.
    setRegionTiers({ dial: 0, bezel: 0, case: 0, strap: 0 });
    startedAtRef.current = performance.now();
    useContinuumStore.getState().setStatus(id, 'loading');

    const timers: number[] = [];
    const doneRegions = new Set<WatchRegion>();
    schedules.forEach(({ region, steps }) => {
      steps.forEach(({ tier, atMs }) => {
        const handle = window.setTimeout(() => {
          setRegionTiers((prev) => ({ ...prev, [region]: tier }));
          if (tier === WATCH_TIER_COUNT - 1) {
            doneRegions.add(region);
            if (doneRegions.size === WATCH_REGIONS.length) {
              useContinuumStore.getState().setStatus(id, 'ready');
              onHydrated?.();
            }
          }
        }, atMs);
        timers.push(handle);
      });
    });
    return () => timers.forEach((h) => window.clearTimeout(h));
  }, [id, schedules, onHydrated, runToken]);

  // Progress raf — also keyed to runToken so the elapsed-0→1 ramp restarts.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const elapsed = performance.now() - startedAtRef.current;
      const t = Math.min(1, elapsed / Math.max(1, totalMs));
      useContinuumStore.getState().setLoadingProgress(id, t);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [id, totalMs, runToken]);

  // Emit tier changes so the parent can render the progress graph OUTSIDE
  // the canvas overlay (i.e. below or beside the viewport, not on top of
  // the watch itself).
  useEffect(() => {
    onTiersChange?.(regionTiers);
  }, [regionTiers, onTiersChange]);

  return (
    <div
      data-continuum-hero={id}
      data-continuum-kind="watch-semantic-hydration"
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        background: background ?? 'transparent',
      }}
    >
      <Canvas
        style={{ position: 'absolute', inset: 0 }}
        camera={{ position: [0, 0, 7.2], fov: 30 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      >
        <ambientLight intensity={0.35} />
        <directionalLight position={[3, 4, 5]} intensity={1.15} color="#FFF5E0" />
        <directionalLight position={[-4, 2, -2]} intensity={0.55} color="#7A88A8" />
        <pointLight position={[0, -3, 2]} intensity={0.25} color="#D7A86E" />
        <WristwatchAsset
          colorway={colorway}
          regionTiers={regionTiers}
          autoRotate={autoRotate}
          blueprintColor={resolvedBlueprintColor}
          runToken={runToken}
        />
        <ContactShadows
          position={[0, -1.8, 0]}
          opacity={0.55}
          scale={6}
          blur={2.4}
          far={2}
        />
        {regionTiers.dial >= 3 && (
          <Environment preset="studio" environmentIntensity={0.55} />
        )}
      </Canvas>
      {/* (RegionReadout removed from the overlay — rendered by the parent  */}
      {/* page as a proper graph panel below the viewport so it doesn't     */}
      {/* shadow the watch.)                                                 */}
    </div>
  );
};

// Public helpers the parent page uses to render its own progress panel.
export const formatWatchTris = (n: number): string =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `${n}`;

export const WATCH_REGION_WEIGHTS: Record<WatchRegion, number> = REGION_WEIGHTS;
export const WATCH_REGION_LABEL: Record<WatchRegion, string> = REGION_LABEL;
export const WATCH_TIER_BADGE: Record<WatchTier, string> = TIER_BADGE;

export default WristwatchSemanticHero;
