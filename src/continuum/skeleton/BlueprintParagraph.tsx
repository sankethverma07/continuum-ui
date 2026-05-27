/**
 * <BlueprintParagraph /> — body-text loading state.
 *
 * Body text is too small for the hollow-letter outline trick to read
 * (you'd be staring at a tangle of unreadable strokes). Instead this
 * paragraph shows as N dimmed amber bars during loading — the
 * standard "skeleton text block" pattern — sized to roughly match
 * the final text's wrapped lines. On reveal it crossfades into the
 * real text via a simple opacity swap.
 *
 *   progress = 0      → only skeleton bars visible
 *   progress ∈ (0, 1) → bars fade out, text fades in
 *   progress = 1      → only the real text
 *
 * The real text is ALWAYS in the DOM (just at low opacity during
 * loading) so its natural wrapping defines the wrapper height. The
 * skeleton bars overlay absolutely on top — same layout, no jump on
 * reveal.
 */

import type { CSSProperties, ReactNode } from 'react';
import { SkeletonTextBlock } from './SkeletonTextBlock';

export interface BlueprintParagraphProps {
  /** The real paragraph text. */
  readonly children: ReactNode;
  /** 0 → all skeleton bars; 1 → all real text. */
  readonly progress: number;
  /** Number of skeleton bars to draw. Tune to match wrapped line count. */
  readonly lines?: number;
  /** Line height in px — drives bar spacing. */
  readonly lineHeight?: number;
  /** Bar height in px — usually ~60-70% of lineHeight. */
  readonly barHeight?: number;
  /** Amber accent for the bars. */
  readonly barColor?: string;
  /** Last bar's width as a fraction of full width — gives the "ragged
   *  right edge" look of real wrapped text. */
  readonly lastLineFraction?: number;
  readonly className?: string;
  readonly style?: CSSProperties;
}

export const BlueprintParagraph = ({
  children,
  progress,
  lines = 3,
  lineHeight = 22,
  barHeight,
  barColor,
  lastLineFraction = 0.62,
  className,
  style,
}: BlueprintParagraphProps) => {
  const p = Math.max(0, Math.min(1, progress));
  return (
    <div
      className={className}
      style={{
        position: 'relative',
        ...style,
      }}
    >
      {/* Real text — always in flow so its natural height anchors the
          layout. Opacity drives visibility. */}
      <span
        style={{
          display: 'block',
          opacity: p,
          transition: 'opacity 160ms linear',
        }}
      >
        {children}
      </span>
      {/* Skeleton bars — absolute overlay during loading, fades out as
          the real text fades in. aria-hidden because the real text is
          already in the DOM for assistive tech. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 1 - p,
          transition: 'opacity 160ms linear',
          pointerEvents: 'none',
        }}
      >
        <SkeletonTextBlock
          lines={lines}
          lineHeight={lineHeight}
          {...(barHeight !== undefined ? { barHeight } : {})}
          {...(barColor ? { color: barColor } : {})}
          lastLineFraction={lastLineFraction}
        />
      </div>
    </div>
  );
};

export default BlueprintParagraph;
