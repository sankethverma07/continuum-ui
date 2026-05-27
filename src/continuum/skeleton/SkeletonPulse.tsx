/**
 * <SkeletonPulse /> — Continuum skeleton v2.
 *
 * A placeholder box with 1–3 amber pulses that travel around its
 * perimeter. The perimeter is drawn as an SVG rounded-rect stroke
 * with `pathLength="100"` so dash math is percentage-based — no
 * manual perimeter computation, no reflow-dependent recalculation.
 *
 * Each pulse is a short stroke-dash segment whose `stroke-dashoffset`
 * animates from 0 → 100, travelling a full loop per cycle. Multiple
 * pulses are drawn as stacked `<rect>` elements with staggered
 * animation-delays so they sit at evenly-spaced offsets around the
 * perimeter.
 *
 * For text-line / nav-item / heading kinds (which are too thin for
 * a perimeter loop to read well), the component switches to a
 * horizontal gradient sweep — same visual language, different path.
 */

import { useId } from 'react';
import type { CSSProperties } from 'react';

import type { SkeletonKind } from './detectElementKind';

export interface SkeletonPulseProps {
  readonly kind?: SkeletonKind;
  readonly width?: number | string;
  readonly height?: number | string;
  /** Corner radius in px. Defaults per kind. */
  readonly borderRadius?: number;
  /** Override the auto pulse count. */
  readonly pulseCount?: number;
  /** Loop duration in seconds. Defaults per kind. */
  readonly durationSec?: number;
  /** Pulse color — defaults to the Continuum amber. */
  readonly color?: string;
  /** Optional label for screen readers. */
  readonly label?: string;
  readonly style?: CSSProperties;
  readonly className?: string;
}

interface KindPreset {
  readonly radius: number;
  readonly pulses: number;
  readonly duration: number;
  /** Percent of the perimeter that's illuminated by a single pulse. */
  readonly pulsePct: number;
  readonly variant: 'loop' | 'sweep';
}

const PRESETS: Record<SkeletonKind, KindPreset> = {
  card:         { radius: 10,  pulses: 3, duration: 1.8, pulsePct: 10, variant: 'loop'  },
  floating:     { radius: 12,  pulses: 3, duration: 1.5, pulsePct: 11, variant: 'loop'  },
  button:       { radius: 24,  pulses: 2, duration: 1.1, pulsePct: 16, variant: 'loop'  },
  image:        { radius: 6,   pulses: 2, duration: 1.6, pulsePct: 9,  variant: 'loop'  },
  avatar:       { radius: 999, pulses: 2, duration: 1.3, pulsePct: 14, variant: 'loop'  },
  heading:      { radius: 4,   pulses: 1, duration: 1.2, pulsePct: 30, variant: 'sweep' },
  subheading:   { radius: 3,   pulses: 1, duration: 1.3, pulsePct: 32, variant: 'sweep' },
  'text-line':  { radius: 3,   pulses: 1, duration: 1.4, pulsePct: 32, variant: 'sweep' },
  'text-block': { radius: 3,   pulses: 1, duration: 1.4, pulsePct: 32, variant: 'sweep' },
  'nav-item':   { radius: 3,   pulses: 1, duration: 0.9, pulsePct: 36, variant: 'sweep' },
  caption:      { radius: 2,   pulses: 1, duration: 1.1, pulsePct: 40, variant: 'sweep' },
  divider:      { radius: 1,   pulses: 1, duration: 1.2, pulsePct: 36, variant: 'sweep' },
  unknown:      { radius: 6,   pulses: 2, duration: 1.5, pulsePct: 11, variant: 'loop'  },
};

export const SkeletonPulse = ({
  kind = 'unknown',
  width = '100%',
  height = 120,
  borderRadius,
  pulseCount,
  durationSec,
  color = '#D7A86E',
  label,
  style,
  className,
}: SkeletonPulseProps) => {
  const preset = PRESETS[kind];
  const r = borderRadius ?? preset.radius;
  const n = pulseCount ?? preset.pulses;
  const dur = durationSec ?? preset.duration;
  const uid = useId();

  const cssVars: CSSProperties = {
    ['--skel-r' as string]: `${r}px`,
    ['--skel-dur' as string]: `${dur}s`,
    ['--skel-color' as string]: color,
    width,
    height,
    borderRadius: r,
  };

  return (
    <div
      data-continuum-skeleton={kind}
      className={`cont-skel cont-skel--${preset.variant} ${className ?? ''}`}
      style={{ ...cssVars, ...style }}
      aria-busy="true"
      aria-label={label ?? 'Loading'}
      role="status"
    >
      {preset.variant === 'loop' ? (
        <LoopPulse
          uid={uid}
          count={n}
          duration={dur}
          pulsePct={preset.pulsePct}
          radius={r}
          color={color}
        />
      ) : (
        <span className="cont-skel__sweep" />
      )}
      {label ? <span className="cont-skel__sr">{label}</span> : null}
      <SkeletonStyles />
    </div>
  );
};

// ---------------------------------------------------------------------------
// LoopPulse — SVG stroke-dash pulses orbiting the element's perimeter.
//
// preserveAspectRatio="none" lets the rect stretch with any container size;
// pathLength="100" normalises the stroke so our dash/offset math is in
// percent and doesn't care what the actual perimeter in px is.
// ---------------------------------------------------------------------------

interface LoopPulseProps {
  readonly uid: string;
  readonly count: number;
  readonly duration: number;
  readonly pulsePct: number;
  readonly radius: number;
  readonly color: string;
}

const LoopPulse = ({
  uid,
  count,
  duration,
  pulsePct,
  radius,
  color,
}: LoopPulseProps) => {
  // Viewbox is arbitrary — preserveAspectRatio="none" stretches.
  const W = 100;
  const H = 100;
  // Clamp radius inside the svg viewbox (radius is px on screen; with
  // preserveAspectRatio="none" that mostly preserves shape since we're
  // setting rx/ry in the same user-units as w/h). Use a modest default
  // that reads as rounded without getting squashed on stretched rects.
  const rx = Math.min(radius, 18);

  // Dash lengths: visible pulse + invisible remainder. On pathLength=100
  // dash values are percentages.
  const pulseLen = pulsePct;
  const gapLen = 100 - pulseLen;

  return (
    <svg
      className="cont-skel__svg"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id={`skel-grad-${uid}`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={color} stopOpacity="0" />
          <stop offset="55%" stopColor={color} stopOpacity="1" />
          <stop offset="85%" stopColor="#FFF5E0" stopOpacity="1" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {Array.from({ length: count }, (_, i) => {
        // Stagger each pulse by 1/count of the loop so N pulses sit
        // evenly spaced around the perimeter.
        const delay = `${(-duration * i) / count}s`;
        return (
          <rect
            key={i}
            x="0.5"
            y="0.5"
            width={W - 1}
            height={H - 1}
            rx={rx}
            ry={rx}
            fill="none"
            stroke={color}
            strokeWidth="1.6"
            strokeLinecap="round"
            pathLength="100"
            strokeDasharray={`${pulseLen} ${gapLen}`}
            className="cont-skel__loop-rect"
            style={{ animationDelay: delay }}
          />
        );
      })}
    </svg>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const SKEL_STYLES = `
  .cont-skel {
    position: relative;
    display: block;
    background:
      linear-gradient(
        90deg,
        rgba(255,255,255,0.025) 0%,
        rgba(255,255,255,0.05) 50%,
        rgba(255,255,255,0.025) 100%
      );
    border: 1px solid rgba(215, 168, 110, 0.14);
    overflow: hidden;
    isolation: isolate;
  }
  .cont-skel__svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    overflow: visible;
  }
  .cont-skel__loop-rect {
    stroke-dashoffset: 0;
    animation: cont-skel-travel var(--skel-dur, 1.5s) linear infinite;
    filter:
      drop-shadow(0 0 4px var(--skel-color, #D7A86E))
      drop-shadow(0 0 10px rgba(215, 168, 110, 0.45));
    will-change: stroke-dashoffset;
  }
  @keyframes cont-skel-travel {
    from { stroke-dashoffset: 0; }
    to   { stroke-dashoffset: -100; }
  }
  .cont-skel--sweep .cont-skel__sweep {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(215, 168, 110, 0.02) 30%,
      rgba(215, 168, 110, 0.55) 48%,
      rgba(255, 245, 220, 0.85) 52%,
      rgba(215, 168, 110, 0.55) 56%,
      rgba(215, 168, 110, 0.02) 70%,
      transparent 100%
    );
    background-size: 38% 100%;
    background-repeat: no-repeat;
    background-position: -40% 0;
    animation: cont-skel-sweep var(--skel-dur, 1.3s) linear infinite;
    filter: drop-shadow(0 0 4px rgba(215, 168, 110, 0.55));
    pointer-events: none;
  }
  @keyframes cont-skel-sweep {
    from { background-position: -40% 0; }
    to   { background-position: 140% 0; }
  }
  .cont-skel__sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
  @media (prefers-reduced-motion: reduce) {
    .cont-skel__loop-rect,
    .cont-skel--sweep .cont-skel__sweep {
      animation-duration: 0s;
      opacity: 0.45;
    }
  }
`;

let stylesInjected = false;
const SkeletonStyles = () => {
  if (stylesInjected) return null;
  stylesInjected = true;
  return <style dangerouslySetInnerHTML={{ __html: SKEL_STYLES }} />;
};

export default SkeletonPulse;
