/**
 * <BlueprintText /> — typography that mirrors the 3D blueprint-to-PBR
 * reveal. During the loading / skeleton phase the text renders as a
 * pure hollow outline (1px amber stroke, transparent fill), acting as a
 * structural placeholder alongside the wireframe 3D model. When the
 * page finishes loading — the same instant the 3D object reaches its
 * final PBR state — the solid colour fades IN over the outline, and
 * the outline fades OUT underneath, leaving crisp solid typography.
 *
 *   progress = 0            → pure 1px outline, fill transparent
 *   progress ∈ (0, 1)       → fill opacity fades in, stroke fades out
 *   progress = 1            → solid fill, no stroke
 *
 * This is a pure opacity crossfade — no directional clip-path sweep,
 * no positional animation. The two layers are perfectly registered so
 * the stroke simply disappears under a solidifying fill.
 *
 * A sibling `useRevealProgress(startMs, endMs)` hook is exposed so
 * pages wrapping a <PageConductor> can drive the text straight off the
 * conductor's clock without plumbing elapsed ms manually.
 */

import type { CSSProperties, ElementType, ReactNode } from 'react';
import { useConductor } from './PageConductor';

// ---------------------------------------------------------------------------
// Progress hook — maps a window of the conductor's elapsed clock to [0, 1].
// ---------------------------------------------------------------------------

/**
 * Returns a 0→1 value based on where the conductor's elapsed clock sits
 * within [startMs, endMs]. Clamps outside the window. Use this to sync
 * text reveal to the same schedule that drives the 3D hero.
 */
export const useRevealProgress = (startMs: number, endMs: number): number => {
  const { elapsedMs } = useConductor();
  if (endMs <= startMs) return elapsedMs >= startMs ? 1 : 0;
  const p = (elapsedMs - startMs) / (endMs - startMs);
  return p < 0 ? 0 : p > 1 ? 1 : p;
};

// ---------------------------------------------------------------------------
// BlueprintText
// ---------------------------------------------------------------------------

export interface BlueprintTextProps {
  /** Text content. */
  readonly children: ReactNode;
  /**
   * 0 → pure outline (hollow); 1 → pure solid fill. Values in between
   * crossfade the two layers via opacity. Typically sourced from
   * `useRevealProgress(startMs, endMs)`.
   */
  readonly progress: number;
  /** HTML element to render. Default 'span' so it's inline-safe. */
  readonly as?: ElementType;
  /**
   * Stroke colour during the hollow phase. Defaults to the project's
   * amber blueprint accent so it matches the 3D wireframe overlays.
   */
  readonly strokeColor?: string;
  /**
   * Stroke width in px. 1px hits the sharpest possible rendering on
   * hiDPI displays without visually crowding the glyphs; pass a larger
   * value for display-size headings if the outline reads too thin.
   */
  readonly strokeWidth?: number;
  /**
   * Final solid colour. Defaults to `currentColor` so the component
   * inherits from its parent (no prop-drilling needed inside a page).
   */
  readonly fillColor?: string;
  readonly className?: string;
  readonly style?: CSSProperties;
}

const STROKE_VAR = '--blueprint-text-stroke-color';
const STROKE_W_VAR = '--blueprint-text-stroke-width';
const FILL_VAR = '--blueprint-text-fill-color';

export const BlueprintText = ({
  children,
  progress,
  as,
  // Defaults to the design-system accent (amber, picked up from the
  // `--c-accent` CSS variable) so hollow outlines automatically match
  // the page's blueprint palette. Override per-instance for any element
  // that needs a custom hollow colour — e.g. a dark stroke on a light
  // button, or a higher-contrast stroke against a non-default backdrop.
  strokeColor = 'var(--c-accent, #D7A86E)',
  strokeWidth = 1,
  fillColor = 'currentColor',
  className,
  style,
}: BlueprintTextProps) => {
  const Tag = (as ?? 'span') as ElementType;
  // Simple opacity crossfade: stroke is 100% opaque at p=0 and fades
  // linearly to 0 at p=1; fill is 0 at p=0 and fades linearly to 1 at
  // p=1. Because both layers sit pixel-for-pixel on top of each other,
  // the transition reads as "colour filling into hollow letters."
  const p = Math.max(0, Math.min(1, progress));
  const strokeOpacity = 1 - p;
  const fillOpacity = p;

  // CSS custom properties let inner pseudo-layers pick up the theme
  // without a prop cascade — keeps the DOM tree flat.
  //
  // `display: inline-block` + `max-width: 100%` lets BlueprintText sit
  // inside a <p> with a constrained width: the wrapper won't break
  // across lines, but the text INSIDE wraps naturally inside the block.
  // `vertical-align: top` prevents baseline drift when the stroke/fill
  // layers stack — without it, inline-blocks align to text-baseline of
  // the parent, which shifts them a few pixels down relative to the
  // surrounding glyphs.
  const rootStyle = {
    position: 'relative',
    display: 'inline-block',
    maxWidth: '100%',
    verticalAlign: 'top',
    ...(style ?? {}),
    [STROKE_VAR]: strokeColor,
    [STROKE_W_VAR]: `${strokeWidth}px`,
    [FILL_VAR]: fillColor,
  } as CSSProperties;

  return (
    <Tag className={className} style={rootStyle}>
      {/* Stroke layer — the authoritative in-flow text. Uses
          -webkit-text-stroke for a real outline (respects kerning and
          descenders) with transparent fill. This layer also owns the
          layout — its height/width determine the container box the
          fill layer stacks against. */}
      <span
        style={{
          color: 'transparent',
          WebkitTextStroke: `var(${STROKE_W_VAR}) var(${STROKE_VAR})`,
          opacity: strokeOpacity,
          // Short transition so small progress jitter from the RAF
          // clock doesn't strobe. 120ms is roughly two display frames.
          transition: 'opacity 120ms linear',
          pointerEvents: strokeOpacity > 0.05 ? 'auto' : 'none',
        }}
      >
        {children}
      </span>
      {/* Fill layer — absolutely positioned pixel-for-pixel over the
          stroke, with opacity driven by progress. No clip-path, no
          positional offset: just a colour fade coming up underneath the
          dissolving outline. aria-hidden because the stroke layer is
          already readable by assistive tech. */}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          color: `var(${FILL_VAR})`,
          opacity: fillOpacity,
          transition: 'opacity 120ms linear',
          pointerEvents: 'none',
        }}
      >
        {children}
      </span>
    </Tag>
  );
};

export default BlueprintText;
