/**
 * <SkeletonTextBlock /> — a stack of N text-line skeletons simulating a
 * wrapped paragraph. Last line is deliberately shorter (~55–75 % width) so
 * the skeleton reads as natural prose rather than a uniform bar chart.
 *
 * Auto-derives sensible defaults from font-size + line-height (supplied
 * directly or read via the detector), so a 16 px body and a 24 px lead
 * paragraph both look correct.
 */

import { SkeletonPulse } from './SkeletonPulse';

export interface SkeletonTextBlockProps {
  /** Number of wrapped lines to render. */
  readonly lines?: number;
  /** Rendered line height in px (CSS line-height). */
  readonly lineHeight?: number;
  /** Height of each individual line bar — usually ~0.7× line-height. */
  readonly barHeight?: number;
  /** Container width override. */
  readonly width?: number | string;
  /** Amber pulse colour. */
  readonly color?: string;
  /** Last-line width as a 0–1 fraction of full width. */
  readonly lastLineFraction?: number;
  /** Optional label for screen readers. */
  readonly label?: string;
}

export const SkeletonTextBlock = ({
  lines = 3,
  lineHeight = 22,
  barHeight,
  width = '100%',
  color,
  lastLineFraction = 0.62,
  label,
}: SkeletonTextBlockProps) => {
  const h = barHeight ?? Math.max(10, Math.round(lineHeight * 0.6));
  const gap = Math.max(4, lineHeight - h);
  return (
    <div
      style={{ width, display: 'flex', flexDirection: 'column', gap }}
      aria-busy="true"
      aria-label={label ?? 'Loading paragraph'}
      role="status"
    >
      {Array.from({ length: Math.max(1, lines) }, (_, i) => {
        const isLast = i === lines - 1 && lines > 1;
        const w = isLast ? `${Math.round(lastLineFraction * 100)}%` : '100%';
        return (
          <SkeletonPulse
            key={i}
            kind="text-line"
            width={w}
            height={h}
            {...(color ? { color } : {})}
          />
        );
      })}
    </div>
  );
};

export default SkeletonTextBlock;
