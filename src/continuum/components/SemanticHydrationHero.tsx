/**
 * <SemanticHydrationHero /> — semantic progressive rendering showcase.
 *
 * Sibling of <PhoneHydrationHero />. Same asset, same total duration, same
 * Doherty ceiling. What differs is the SCHEDULE: instead of advancing every
 * surface in lockstep, this hero allocates the time budget across the phone's
 * four semantic regions by importance weight.
 *
 *   display  — weight 1.0   → finishes at ~35% of total budget
 *   cameras  — weight 0.7   → finishes at ~55%
 *   frame    — weight 0.4   → finishes at ~75%
 *   back     — weight 0.2   → finishes at  100%
 *
 * The total wall-clock matches PhoneHydrationHero exactly, so the two demos
 * are directly comparable — but the SEMANTIC hero reveals the thing the user
 * actually came to see (the display) in full PBR before the back panel has
 * even left wireframe.
 *
 * Prior art we're building on:
 *   - Hoppe progressive meshes (SIGGRAPH 1996) — continuous LOD per mesh.
 *   - Level-of-detail modeling (Luebke et al., 2002) — uniform tier descent.
 *
 * What's original here:
 *   - Region-aware scheduling driven by SEMANTIC importance, not screen-space
 *     error or camera distance. We're not asking "what's big" — we're asking
 *     "what's the subject of the shot?"
 *   - Shared Doherty ceiling across regions — every region fits inside the
 *     same 3.2s perceptual envelope, so the page still feels "done" at the
 *     same wall-clock moment regardless of which region finishes first.
 *   - Blueprint overlay keyed to the DISPLAY region (not the min region),
 *     so the scaffold disappears when the subject is ready — even though
 *     the back panel is still catching up.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, ContactShadows } from '@react-three/drei';

import { BlueprintSkeleton } from './BlueprintSkeleton';
import {
  RealisticPhoneAsset,
  PHONE_COLORWAYS,
  PHONE_TIER_COUNT,
  PHONE_REGIONS,
  approxTrianglesForRegion,
  approxTrianglesTotal,
} from './RealisticPhoneAsset';
import type {
  PhoneColorway,
  PhoneTier,
  PhoneRegion,
} from './RealisticPhoneAsset';
import { totalDurationMs } from '../catalog/timeline';
import { useContinuumStore } from '../store/useContinuumStore';

// ---------------------------------------------------------------------------
// Region importance weights. Higher weight = region finishes earlier in the
// global time budget. The specific numbers were chosen so that the display
// reaches the hero tier clearly before the midpoint, giving the user a strong
// "the thing I care about is already done" signal.
// ---------------------------------------------------------------------------

const REGION_WEIGHTS: Record<PhoneRegion, number> = {
  display: 1.0,
  cameras: 0.7,
  frame:   0.4,
  back:    0.2,
};

/**
 * Map importance weight → fraction of the total budget the region gets to
 * finish inside. Weight 1.0 completes in 35% of the budget; weight 0.2
 * stretches out to 100%. Tuned so the display is visibly done while the
 * frame / back are still transitioning.
 */
const completionFraction = (weight: number): number => {
  // Linear remap: weight 1.0 → 0.35, weight 0.2 → 1.00.
  const minFrac = 0.35;
  const maxFrac = 1.00;
  // Clamp weight to [0.2, 1.0] so we don't extrapolate past our tuned range.
  const w = Math.max(0.2, Math.min(1.0, weight));
  // Higher weight = smaller fraction (finishes sooner).
  const t = (1.0 - w) / (1.0 - 0.2); // 0 at w=1, 1 at w=0.2
  return minFrac + (maxFrac - minFrac) * t;
};

interface RegionSchedule {
  readonly region: PhoneRegion;
  /** ms from start → tier to land on at that mark. */
  readonly steps: ReadonlyArray<{ readonly tier: PhoneTier; readonly atMs: number }>;
}

/**
 * Build per-region schedules. Each region runs its 5-tier climb compressed
 * into `completionFraction(weight) * totalMs`, evenly spaced.
 */
const buildSchedules = (totalMs: number): ReadonlyArray<RegionSchedule> =>
  PHONE_REGIONS.map((region) => {
    const weight = REGION_WEIGHTS[region];
    const completeBy = completionFraction(weight) * totalMs;
    const stepMs = completeBy / (PHONE_TIER_COUNT - 1);
    const steps = Array.from({ length: PHONE_TIER_COUNT }, (_, i) => ({
      tier: i as PhoneTier,
      atMs: Math.round(i * stepMs),
    }));
    return { region, steps };
  });

// ---------------------------------------------------------------------------
// Tier → HUD label
// ---------------------------------------------------------------------------

const TIER_BADGE: Record<PhoneTier, string> = {
  0: 'blockout',
  1: 'optics',
  2: 'matte',
  3: 'detail',
  4: 'pbr hero',
};

// ---------------------------------------------------------------------------
// Props — mirror PhoneHydrationHero so it's a drop-in comparison.
// ---------------------------------------------------------------------------

export interface SemanticHydrationHeroProps {
  readonly colorway?: keyof typeof PHONE_COLORWAYS;
  readonly registryId?: string;
  readonly background?: string;
  readonly onHydrated?: () => void;
  readonly autoRotate?: number;
  readonly pointerTilt?: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const SemanticHydrationHero = ({
  colorway = 'titanium',
  registryId = 'galaxy-z-fold-semantic',
  background,
  onHydrated,
  autoRotate = 0.35,
  pointerTilt = 0.3,
}: SemanticHydrationHeroProps) => {
  const id = registryId;
  const palette: PhoneColorway =
    PHONE_COLORWAYS[colorway] ?? (PHONE_COLORWAYS.titanium as PhoneColorway);

  // Same total envelope as the uniform hero — so the pages finish together.
  const totalMs = useMemo(() => totalDurationMs(PHONE_TIER_COUNT), []);
  const schedules = useMemo(() => buildSchedules(totalMs), [totalMs]);

  const [regionTiers, setRegionTiers] = useState<Record<PhoneRegion, PhoneTier>>({
    display: 0,
    cameras: 0,
    frame:   0,
    back:    0,
  });

  const startedAtRef = useRef<number>(performance.now());
  const containerRef = useRef<HTMLDivElement | null>(null);

  // -------------------------------------------------------------------
  // Register with the hydration store.
  // -------------------------------------------------------------------
  useEffect(() => {
    const store = useContinuumStore.getState();
    store.registerAsset(id);
    store.setStatus(id, 'loading');
    startedAtRef.current = performance.now();
    return () => {
      useContinuumStore.getState().unregisterAsset(id);
    };
  }, [id]);

  // -------------------------------------------------------------------
  // R3F ResizeObserver wobble after HMR — poke twice.
  // -------------------------------------------------------------------
  useEffect(() => {
    const nudge = () => window.dispatchEvent(new Event('resize'));
    const t1 = window.setTimeout(nudge, 0);
    const t2 = window.setTimeout(nudge, 120);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  // -------------------------------------------------------------------
  // Per-region tier advancers. Each region's own setTimeout chain walks
  // through its 5-tier schedule independently.
  // -------------------------------------------------------------------
  useEffect(() => {
    const timers: number[] = [];
    const doneRegions = new Set<PhoneRegion>();

    schedules.forEach(({ region, steps }) => {
      steps.forEach(({ tier, atMs }) => {
        const handle = window.setTimeout(() => {
          setRegionTiers((prev) => ({ ...prev, [region]: tier }));
          if (tier === PHONE_TIER_COUNT - 1) {
            doneRegions.add(region);
            if (doneRegions.size === PHONE_REGIONS.length) {
              useContinuumStore.getState().setStatus(id, 'ready');
              onHydrated?.();
            }
          }
        }, atMs);
        timers.push(handle);
      });
    });

    return () => timers.forEach((h) => window.clearTimeout(h));
  }, [id, schedules, onHydrated]);

  // -------------------------------------------------------------------
  // Progress engine — push overall fraction into the store.
  // -------------------------------------------------------------------
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
  }, [id, totalMs]);

  // Blueprint overlay is keyed to the DISPLAY region specifically — this is
  // the whole thesis: the scaffold disappears when the SUBJECT is ready,
  // even though the back panel is still a wireframe.
  const blueprintAlpha = (() => {
    const t = regionTiers.display;
    if (t <= 0) return 1;
    if (t === 1) return 0.55;
    return 0;
  })();

  const displayProgress =
    Math.min(1, (regionTiers.display + 1) / PHONE_TIER_COUNT);

  return (
    <div
      ref={containerRef}
      data-continuum-hero={id}
      data-continuum-kind="phone-semantic-hydration"
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        background: background ?? 'transparent',
      }}
    >
      <Canvas
        style={{ position: 'absolute', inset: 0 }}
        camera={{ position: [0, 0, 5.5], fov: 28 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={0.3} />
        <directionalLight position={[3, 4, 5]} intensity={1.1} color="#FFF5E0" />
        <directionalLight position={[-4, 2, -2]} intensity={0.55} color="#7A88A8" />
        <pointLight position={[0, -3, 2]} intensity={0.25} color="#D7A86E" />
        <RealisticPhoneAsset
          colorway={colorway}
          regionTiers={regionTiers}
          autoRotate={autoRotate}
          pointerTilt={pointerTilt}
        />
        <ContactShadows
          position={[0, -1.55, 0]}
          opacity={0.55}
          scale={6}
          blur={2.4}
          far={2}
        />
        {/* Env map is heavy — only spin it up once the display is past */}
        {/* the matte tier, same rule as the uniform hero.                */}
        {regionTiers.display >= 3 && (
          <Environment preset="studio" environmentIntensity={0.5} />
        )}
      </Canvas>

      {blueprintAlpha > 0.01 && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            opacity: blueprintAlpha,
            transition: 'opacity 380ms ease-out',
            pointerEvents: 'none',
          }}
        >
          <BlueprintSkeleton
            label={`HYDRATING DISPLAY · ${TIER_BADGE[
              regionTiers.display
            ].toUpperCase()}`}
            progress={displayProgress}
          />
        </div>
      )}

      <RegionReadout tiers={regionTiers} palette={palette} />
    </div>
  );
};

// ---------------------------------------------------------------------------
// RegionReadout — four-row HUD that shows the tier of every region
// simultaneously, so the "onion peel" effect is legible as data. This is the
// shape that makes semantic progressive rendering visible — in the uniform
// hero there'd be nothing to show but a single LOD number.
// ---------------------------------------------------------------------------

const REGION_LABEL: Record<PhoneRegion, string> = {
  display: 'Display',
  cameras: 'Cameras',
  frame:   'Frame',
  back:    'Back',
};

const RegionReadout = ({
  tiers,
  palette,
}: {
  readonly tiers: Record<PhoneRegion, PhoneTier>;
  readonly palette: PhoneColorway;
}) => (
  <div
    aria-hidden
    style={{
      position: 'absolute',
      top: 12,
      left: 12,
      padding: '6px 10px',
      border: '1px solid rgba(215, 168, 110, 0.3)',
      background: 'rgba(10, 8, 6, 0.72)',
      color: '#EEE3CD',
      fontFamily:
        'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)',
      fontSize: 10,
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      borderRadius: 2,
      pointerEvents: 'none',
      display: 'grid',
      gridTemplateColumns: 'auto auto auto',
      gap: '4px 12px',
      alignItems: 'center',
      zIndex: 3,
    }}
  >
    {PHONE_REGIONS.map((region) => {
      const tier = tiers[region];
      const weight = REGION_WEIGHTS[region];
      return (
        <RegionRow
          key={region}
          label={REGION_LABEL[region]}
          tier={tier}
          weight={weight}
          tris={approxTrianglesForRegion(region, tier)}
        />
      );
    })}
    <div
      style={{
        gridColumn: '1 / -1',
        marginTop: 4,
        paddingTop: 4,
        borderTop: '1px solid rgba(215, 168, 110, 0.18)',
        color: '#D7A86E',
        fontSize: 9,
        letterSpacing: '0.14em',
        display: 'flex',
        justifyContent: 'space-between',
      }}
    >
      <span>{palette.label} · semantic</span>
      <span>Σ {formatTris(approxTrianglesTotal(tiers))} tris</span>
    </div>
  </div>
);

const RegionRow = ({
  label,
  tier,
  weight,
  tris,
}: {
  readonly label: string;
  readonly tier: PhoneTier;
  readonly weight: number;
  readonly tris: number;
}) => {
  // Render a tiny 5-pip progress bar so the per-region state is scannable.
  const pips = Array.from({ length: PHONE_TIER_COUNT }, (_, i) => (
    <span
      key={i}
      style={{
        display: 'inline-block',
        width: 6,
        height: 6,
        marginRight: 2,
        borderRadius: 1,
        background:
          i <= tier ? '#D7A86E' : 'rgba(215, 168, 110, 0.18)',
        boxShadow:
          i === tier ? '0 0 6px rgba(215, 168, 110, 0.8)' : undefined,
      }}
    />
  ));

  return (
    <>
      <span style={{ color: '#B8A998', minWidth: 56 }}>{label}</span>
      <span style={{ display: 'inline-flex', alignItems: 'center' }}>
        {pips}
      </span>
      <span
        style={{
          color: '#8A7D70',
          fontSize: 9,
          display: 'inline-flex',
          gap: 6,
          alignItems: 'baseline',
        }}
      >
        <span>w{weight.toFixed(1)}</span>
        <span style={{ color: '#D7A86E' }}>{formatTris(tris)}△</span>
        <span>{TIER_BADGE[tier]}</span>
      </span>
    </>
  );
};

/** Compact 1.3k / 24k formatter for live triangle counts. */
const formatTris = (n: number): string =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `${n}`;

export default SemanticHydrationHero;
