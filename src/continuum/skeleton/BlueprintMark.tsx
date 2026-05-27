/**
 * <BlueprintMark /> — a small engineering-glyph SVG suitable for
 * stamping inside a SkeletonCardFrame's `watermark` slot.
 *
 * **Visual.** A circle (40% diameter) overlaid with a diagonal cross
 * and a horizontal/vertical crosshair, drawn as 1px hairlines. Reads
 * as "this slot is reserved for a 3D / engineering object." Strokes
 * use `currentColor` so the parent SkeletonCardFrame's `color` prop
 * tints the mark to match the rest of the card's outline.
 *
 * **Why this exists.** Sketchfab puts their hexagon brand mark inside
 * every empty card placeholder — gives the gray box a sense of
 * identity instead of feeling like a Bootstrap shimmer. Continuum's
 * version uses a generic blueprint glyph (not a literal logo) so the
 * same mark works regardless of which page the card lives on.
 *
 * **When to use.** Pass to `SkeletonCardFrame.watermark` on cards
 * that hold static (`pulse={false}`). Cards that already have the
 * comet pulse don't need the watermark — the pulse provides identity.
 */

import type { CSSProperties } from 'react';

export interface BlueprintMarkProps {
  /** Override stroke width (default 1.2). */
  readonly strokeWidth?: number;
  readonly style?: CSSProperties;
  readonly className?: string;
}

export const BlueprintMark = ({
  strokeWidth = 1.2,
  style,
  className,
}: BlueprintMarkProps) => (
  <svg
    viewBox="0 0 64 64"
    width="100%"
    height="100%"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    style={style}
    className={className}
    aria-hidden
  >
    {/* Outer light-touch crosshair — extends slightly past the circle */}
    <line x1="2" y1="32" x2="62" y2="32" strokeOpacity="0.55" />
    <line x1="32" y1="2" x2="32" y2="62" strokeOpacity="0.55" />

    {/* Center circle — the "subject" of the engineering schematic */}
    <circle cx="32" cy="32" r="14" />

    {/* Diagonal cross — reads as "construction lines" or "drafting axes" */}
    <line x1="20" y1="20" x2="44" y2="44" strokeOpacity="0.65" />
    <line x1="44" y1="20" x2="20" y2="44" strokeOpacity="0.65" />

    {/* Tick marks at the cardinal points — small touches that read as
        ruler/measurement notation. */}
    <line x1="32" y1="14" x2="32" y2="11" />
    <line x1="32" y1="50" x2="32" y2="53" />
    <line x1="14" y1="32" x2="11" y2="32" />
    <line x1="50" y1="32" x2="53" y2="32" />
  </svg>
);

export default BlueprintMark;
