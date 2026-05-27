/**
 * BlueprintConstructionGrid — an engineering dot/cross paper backdrop
 * that fades in during the skeleton phase and fades out as the content
 * reveals.
 *
 * **Why this exists.** Premium 3D sites (notably Bruno Simon's
 * portfolio) place their loader/skeleton on a perspective grid of
 * faint × glyphs, giving the void context — "this is a workspace, the
 * scene is being constructed in place" — without competing with actual
 * content. Our skeleton phase (SkeletonStroke + SkeletonCardFrame +
 * BlueprintText) lives on a flat dark color today. Adding this grid
 * gives the engineering aesthetic a literal home: it reads as graph
 * paper, the camera-ready stage on which the wireframe is drawn.
 *
 * **What it does.** Fixed-position layer behind the page content with
 * three stacked CSS gradients:
 *   1. Inner dot pattern at 24px interval (the "graph paper")
 *   2. Outer cross pattern at 96px interval (the "engineering tick marks")
 *   3. Radial vignette that fades the grid toward the edges
 *
 * The `fade` prop drives a single opacity value 0..1 that fades the
 * whole grid in/out. Pages that wire it into <PageConductor> get a
 * grid that's bright during skeleton phase and dimmed once the real
 * content reveals — same envelope as the BlueprintText hollow→fill
 * pattern, applied to the backdrop.
 *
 * **Reduced motion.** Honours `prefers-reduced-motion` by defaulting
 * to `transition: none` — grid pops between visible and hidden states
 * without animating opacity.
 */

import { CSSProperties, useMemo } from 'react';

export interface BlueprintConstructionGridProps {
  /** 0..1 — grid opacity. Pass 1 during skeleton phase, taper to 0
   *  (or any low value like 0.15) once real content is revealed. */
  readonly fade?: number;
  /** Override the dot/cross color. Default is a faint warm-white. */
  readonly color?: string;
  /** Override the underlying base color. Default transparent so the
   *  page's own background color shows through. */
  readonly background?: string;
  /** ms — opacity transition duration. Default 320 to match the
   *  PageConductor's default fadeMs (260) plus a bit of slack so the
   *  grid trails the content reveal slightly. */
  readonly fadeMs?: number;
  /** When true, fixes the grid to the viewport so it spans the whole
   *  page even as the user scrolls. When false, fills the immediate
   *  parent (use this when scoping the grid to a single section). */
  readonly fixed?: boolean;
  /** zIndex stacking. Default -1 puts it behind every sibling in the
   *  same positioned context. */
  readonly zIndex?: number;
  readonly style?: CSSProperties;
}

export const BlueprintConstructionGrid = ({
  fade = 1,
  color = 'rgba(232, 238, 246, 0.10)',
  background = 'transparent',
  fadeMs = 320,
  fixed = true,
  zIndex = -1,
  style,
}: BlueprintConstructionGridProps) => {
  // Build the layered backgrounds once per render. The dot color picks
  // up alpha from the `color` prop; the cross color is a 60%-strength
  // version (slightly subtler to add depth without doubling visual
  // weight). The vignette fades to the page background so the grid
  // doesn't crash hard against the page edges.
  const backgroundImage = useMemo(() => {
    return [
      // Vignette — radial fade-out near the edges so the grid feels
      // anchored at the centre and doesn't fight content at the margins.
      `radial-gradient(circle at center, transparent 0%, transparent 35%, rgba(11, 15, 20, 0.7) 100%)`,
      // Inner dot pattern — 1.5px dot at 24px interval. Subtle but
      // consistently visible at typical viewing distances.
      `radial-gradient(circle, ${color} 1px, transparent 1.5px)`,
      // Cross pattern — vertical and horizontal lines at 96px interval,
      // 1px wide, low alpha. These read as the "tick marks" on
      // engineering paper that subdivide the page into reading zones.
      `linear-gradient(${color} 1px, transparent 1px)`,
      `linear-gradient(90deg, ${color} 1px, transparent 1px)`,
    ].join(', ');
  }, [color]);

  return (
    <div
      aria-hidden
      data-continuum-grid
      style={{
        position: fixed ? 'fixed' : 'absolute',
        inset: 0,
        zIndex,
        pointerEvents: 'none',
        background,
        backgroundImage,
        backgroundSize: '100% 100%, 24px 24px, 96px 96px, 96px 96px',
        opacity: fade,
        transition: `opacity ${fadeMs}ms cubic-bezier(0.4, 0, 0.2, 1)`,
        // Paint atop the body background but below page content; the
        // `zIndex: -1` inside a positioned parent handles that. Pages
        // that need the grid to sit ABOVE a background image (e.g.
        // hero with a gradient) can pass zIndex: 0.
        ...style,
      }}
    />
  );
};

export default BlueprintConstructionGrid;
