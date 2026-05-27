/**
 * <HydrationOverlay /> — the perceived-experience layer.
 *
 * Sits ON TOP of the proxy (Spline) mesh while it streams. Reads as a small
 * bento card: monospace percentage, a four-segment phase rail, a tight amber
 * progress bar. On completion it scales down + fades out under Doherty's
 * 400ms threshold so the handoff feels responsive.
 *
 * Every timing/curve/blur value is anchored in `constants/perceivedTiming.ts`
 * — see that file for citations (Nielsen 1993, Doherty 1982, Harrison 2007,
 * Nah 2004, Chung 2018).
 *
 * The overlay is a pure presentation component: progress 0–1 comes in as a
 * prop, lifecycle is owned by the host (e.g. <SplineEmbed />). Keeps it
 * trivially testable and reusable for the real .glb pipeline later.
 */

import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import {
  GHOST_BLUR_PX,
  OVERLAY_ENTER_MS,
  OVERLAY_EXIT_MS,
  OVERLAY_EXIT_SCALE,
  OVERLAY_EASE,
} from '../constants/perceivedTiming';

export interface HydrationOverlayProps {
  /** Perceived progress, 0 → 1. Drive from the host's loader. */
  readonly progress: number;
  /** Eyebrow / label string above the percentage. */
  readonly label?: string;
  /** Sub-label shown beneath the percentage. */
  readonly subLabel?: string;
  /**
   * When true, the overlay tweens out (scale + opacity) over OVERLAY_EXIT_MS
   * and unmounts when the tween finishes. Keep `progress` at 1 while this is
   * true — the host controls both.
   */
  readonly dismissed: boolean;
  /** Optional callback fired after the exit tween completes. */
  readonly onDismissed?: () => void;
}

/** Phase labels driven by progress thresholds — gives the user a narrative. */
const PHASES = [
  { from: 0.0,  label: 'BLUEPRINT' },
  { from: 0.2,  label: 'GEOMETRY'  },
  { from: 0.55, label: 'TEXTURES'  },
  { from: 0.85, label: 'BIND'      },
] as const;

const phaseFor = (p: number): string => {
  let active: string = PHASES[0]!.label;
  for (const phase of PHASES) {
    if (p >= phase.from) active = phase.label;
  }
  return active;
};

export const HydrationOverlay = ({
  progress,
  label = 'HYDRATION.LOG',
  subLabel = 'Streaming asset tiers',
  dismissed,
  onDismissed,
}: HydrationOverlayProps) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(true);

  // Enter animation — once on mount.
  useEffect(() => {
    if (!rootRef.current) return;
    gsap.fromTo(
      rootRef.current,
      { opacity: 0, scale: 0.985 },
      { opacity: 1, scale: 1, duration: OVERLAY_ENTER_MS / 1000, ease: OVERLAY_EASE },
    );
  }, []);

  // Exit animation — when host flips `dismissed` true.
  useEffect(() => {
    if (!dismissed || !rootRef.current) return;
    const tween = gsap.to(rootRef.current, {
      opacity: 0,
      scale: OVERLAY_EXIT_SCALE,
      duration: OVERLAY_EXIT_MS / 1000,
      ease: OVERLAY_EASE,
      onComplete: () => {
        setMounted(false);
        onDismissed?.();
      },
    });
    return () => {
      tween.kill();
    };
  }, [dismissed, onDismissed]);

  if (!mounted) return null;

  const pct = Math.max(0, Math.min(1, progress));
  const pctText = Math.round(pct * 100).toString().padStart(2, '0');
  const phase = phaseFor(pct);

  return (
    <div
      ref={rootRef}
      role="status"
      aria-live="polite"
      aria-label={`${label} ${pctText} percent`}
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'flex-start',
        padding: 24,
        pointerEvents: 'none',
        // Subtle vignette so the percentage card has weight against the
        // ghost mesh behind it without occluding the silhouette.
        background:
          'radial-gradient(ellipse at center, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.55) 100%)',
        zIndex: 5,
      }}
    >
      <div
        style={{
          width: 'min(420px, 100%)',
          padding: '20px 22px 18px',
          background: 'rgba(8, 8, 8, 0.62)',
          backdropFilter: `blur(${GHOST_BLUR_PX}px) saturate(1.1)`,
          WebkitBackdropFilter: `blur(${GHOST_BLUR_PX}px) saturate(1.1)`,
          border: '1px solid rgba(255, 140, 0, 0.42)',
          borderRadius: 4,
          boxShadow:
            '0 10px 32px -16px rgba(255, 140, 0, 0.45), inset 0 0 0 1px rgba(255,255,255,0.04)',
          color: '#F5F2EC',
          fontFamily:
            '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
        }}
      >
        {/* --- eyebrow row: label + heartbeat dot --- */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 9,
            letterSpacing: 2.4,
            textTransform: 'uppercase',
            color: '#FF8C00',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                display: 'inline-block',
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#FF8C00',
                boxShadow: '0 0 8px #FF8C00',
                animation: 'continuum-overlay-blink 1.1s ease-in-out infinite',
              }}
            />
            {label}
          </span>
          <span style={{ opacity: 0.55 }}>{phase}</span>
        </div>

        {/* --- percentage + sub-label --- */}
        <div
          style={{
            marginTop: 10,
            display: 'flex',
            alignItems: 'baseline',
            gap: 12,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          <span
            style={{
              fontSize: 56,
              lineHeight: 0.95,
              fontWeight: 500,
              letterSpacing: '-0.02em',
              color: '#FF8C00',
            }}
          >
            {pctText}
          </span>
          <span
            style={{
              fontSize: 18,
              color: '#FF8C00',
              opacity: 0.55,
              letterSpacing: 1,
            }}
          >
            %
          </span>
          <span
            style={{
              marginLeft: 'auto',
              fontSize: 10,
              letterSpacing: 1.6,
              textTransform: 'uppercase',
              color: '#A9A39A',
            }}
          >
            {subLabel}
          </span>
        </div>

        {/* --- progress rail (1px hairline + amber fill) --- */}
        <div
          style={{
            marginTop: 16,
            position: 'relative',
            height: 2,
            background: 'rgba(255,255,255,0.10)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              transformOrigin: '0% 50%',
              transform: `scaleX(${pct})`,
              background:
                'linear-gradient(90deg, rgba(255,140,0,0.85) 0%, #FF8C00 100%)',
              transition: 'transform 120ms linear',
            }}
          />
          {/* faint forward-trailing tick to cue motion (Chung 2018: slow-steady
              left→right motion is perceived as shorter than pulses). */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              width: 24,
              left: `calc(${(pct * 100).toFixed(2)}% - 24px)`,
              background:
                'linear-gradient(90deg, rgba(255,140,0,0) 0%, rgba(255,210,140,0.8) 100%)',
              opacity: pct > 0 && pct < 1 ? 1 : 0,
              transition: 'opacity 240ms ease-out',
            }}
          />
        </div>

        {/* --- footer meta row --- */}
        <div
          style={{
            marginTop: 12,
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 9,
            letterSpacing: 1.4,
            textTransform: 'uppercase',
            color: '#A9A39A',
          }}
        >
          <span>LOD&nbsp;0&nbsp;·&nbsp;Skeleton&nbsp;mirror</span>
          <span>
            ETA&nbsp;<span style={{ color: '#FF8C00' }}>
              {pct < 1 ? '<2s' : 'READY'}
            </span>
          </span>
        </div>
      </div>

      <style>{`
        @keyframes continuum-overlay-blink {
          0%, 100% { opacity: 0.4; }
          50%      { opacity: 1; }
        }
      `}</style>
    </div>
  );
};
