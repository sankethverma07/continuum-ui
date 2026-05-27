/**
 * <SkeletonStroke /> — a horizontal line that "draws itself" from left
 * to right via an SVG stroke-dashoffset animation. Used for nav-item
 * underlines, section dividers, or any thin wipe-in line.
 *
 * Visual: amber stroke, one pass of draw-in (1.1 s by default), then
 * the stroke sits solid with a subtle traveling bright spot (a tiny
 * pulse that loops along the line).
 */

import { useId } from 'react';
import type { CSSProperties } from 'react';

export interface SkeletonStrokeProps {
  readonly width?: number | string;
  readonly height?: number;
  readonly strokeWidth?: number;
  readonly color?: string;
  readonly drawDurationSec?: number;
  readonly pulseDurationSec?: number;
  readonly label?: string;
  readonly style?: CSSProperties;
}

export const SkeletonStroke = ({
  width = '100%',
  height = 2,
  strokeWidth = 2,
  color = '#D7A86E',
  drawDurationSec = 1.1,
  pulseDurationSec = 1.6,
  label,
  style,
}: SkeletonStrokeProps) => {
  const uid = useId();
  return (
    <div
      style={{ width, height, position: 'relative', ...style }}
      aria-busy="true"
      aria-label={label ?? 'Loading'}
      role="status"
    >
      <svg
        width="100%"
        height={height}
        preserveAspectRatio="none"
        viewBox="0 0 100 2"
        style={{ position: 'absolute', inset: 0, overflow: 'visible' }}
        aria-hidden
      >
        <defs>
          <linearGradient id={`strk-${uid}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0.85" />
          </linearGradient>
        </defs>
        {/* Background track — very dim amber so the stroke reads as layered. */}
        <line
          x1="0" y1="1" x2="100" y2="1"
          stroke={color}
          strokeOpacity="0.12"
          strokeWidth={strokeWidth}
          pathLength="100"
        />
        {/* Draw-in stroke — 0 → 100 over drawDurationSec, then stays. */}
        <line
          x1="0" y1="1" x2="100" y2="1"
          stroke={`url(#strk-${uid})`}
          strokeWidth={strokeWidth}
          pathLength="100"
          strokeLinecap="round"
          strokeDasharray="100 100"
          className="cont-strk__draw"
          style={{ animationDuration: `${drawDurationSec}s` }}
        />
        {/* Traveling pulse — short dashed segment cycling after the stroke draws in. */}
        <line
          x1="0" y1="1" x2="100" y2="1"
          stroke="#FFF5E0"
          strokeWidth={strokeWidth}
          pathLength="100"
          strokeLinecap="round"
          strokeDasharray="10 90"
          className="cont-strk__pulse"
          style={{
            animationDuration: `${pulseDurationSec}s`,
            animationDelay: `${drawDurationSec * 0.8}s`,
            filter: `drop-shadow(0 0 4px ${color})`,
          }}
        />
      </svg>
      <StrokeStyles />
    </div>
  );
};

const STROKE_STYLES = `
  .cont-strk__draw {
    stroke-dashoffset: 100;
    animation: cont-strk-draw linear forwards;
    filter: drop-shadow(0 0 3px rgba(215, 168, 110, 0.5));
  }
  @keyframes cont-strk-draw {
    from { stroke-dashoffset: 100; }
    to   { stroke-dashoffset: 0; }
  }
  .cont-strk__pulse {
    stroke-dashoffset: 0;
    animation: cont-strk-pulse linear infinite;
    opacity: 0;
  }
  @keyframes cont-strk-pulse {
    0%   { stroke-dashoffset: 0;    opacity: 0;   }
    10%  { opacity: 1; }
    90%  { opacity: 1; }
    100% { stroke-dashoffset: -100; opacity: 0;   }
  }
  @media (prefers-reduced-motion: reduce) {
    .cont-strk__draw,
    .cont-strk__pulse { animation-duration: 0s; }
  }
`;

let strokeStylesInjected = false;
const StrokeStyles = () => {
  if (strokeStylesInjected) return null;
  strokeStylesInjected = true;
  return <style dangerouslySetInnerHTML={{ __html: STROKE_STYLES }} />;
};

export default SkeletonStroke;
