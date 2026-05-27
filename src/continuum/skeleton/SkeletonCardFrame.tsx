/**
 * <SkeletonCardFrame /> — hollow card outline with one or more comet-
 * shaped pulses travelling along a SINGLE continuous closed path.
 *
 * Path geometry: a real rounded rectangle traced in actual pixel
 * coordinates (sized via ResizeObserver, corners via the
 * `borderRadius` prop). Single closed loop with C¹-smooth corners, so
 * comets glide around the rect without any tangent discontinuity.
 *
 * Comet anatomy: each visible comet is composed of FIVE stacked
 * <path> layers riding the same path with successive `begin`
 * offsets, so they appear at consecutive path positions. Opacity
 * fades from 0.90 (head, warm-white) down to 0.13 (tail, amber) —
 * almost matching the 0.10 track opacity, so the tail dissolves
 * INTO the wireframe instead of reading as a separate dash. The
 * effect: one continuous comet silhouette, alive but unobtrusive.
 *
 * Pulse count: derived from the actual card perimeter so density
 * scales with size — round(perimeter / 600). A standard card shows
 * 2 comets; a wide hero card shows 4-5.
 *
 * Speed: default 5 s per loop. Slow enough to feel ambient (not
 * anxious), fast enough to confirm the page is alive.
 */

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

export interface SkeletonCardFrameProps {
  readonly width?: number | string;
  readonly height?: number | string;
  readonly color?: string;
  readonly strokeWidth?: number;
  readonly pulseCount?: number | 'auto';
  readonly pulseDurationSec?: number;
  /**
   * Total visible length of one comet (head + 4 trail layers) as a
   * percentage of the perimeter. Default 5.5% — long enough to read
   * as a comet shape, short enough that the tail blends back into
   * the track quickly.
   */
  readonly pulseLengthPct?: number;
  /**
   * When false, render only the static hollow track without any
   * traveling comet. Use on secondary cards in dense grids — reserves
   * the animation for hero / lead cards so a 12-card grid doesn't
   * have a dozen perimeter pulses competing for attention.
   * (Pattern lifted from Sketchfab: their cards hold still, only
   * the load-progress signal animates.)
   */
  readonly pulse?: boolean;
  /**
   * Optional brand mark stamped faintly in the center of the card
   * while it loads. Sketchfab does this with their hexagon glyph;
   * Continuum can use any vector node — pass an `<svg>` element,
   * a unicode glyph in a `<span>`, or a small image. Rendered at
   * 22% opacity behind any `children`. Default off.
   */
  readonly watermark?: ReactNode;
  /**
   * Watermark size in CSS px (square). Default 64.
   */
  readonly watermarkSize?: number;
  /**
   * Corner radius in CSS pixels. MUST match the wrapper's CSS
   * border-radius so the pulse track aligns with the card silhouette.
   */
  readonly borderRadius?: number;
  readonly style?: CSSProperties;
  readonly className?: string;
  readonly children?: ReactNode;
  readonly label?: string;
}

/**
 * Auto-pick how many comets to deploy based on the actual perimeter.
 * Targets one comet per ~600 px so the visual density stays similar
 * across card sizes — small cards get 2, hero cards get 4-5.
 */
const pickPulseCount = (
  pulseCount: number | 'auto',
  width: number,
  height: number,
): number => {
  if (pulseCount !== 'auto') return Math.max(1, pulseCount);
  const perim = 2 * (width + height);
  return Math.max(1, Math.round(perim / 600));
};

/**
 * Comet layer recipe. The five entries are stacked back-to-back along
 * the path: layer 0 (head) is at the leading tip, each subsequent
 * layer sits IMMEDIATELY behind the previous one, fading toward the
 * track's own opacity. Together they form a single continuous comet
 * silhouette.
 *
 * `lenPct` — segment length as a fraction of `pulseLengthPct`.
 * `opacity` — multiplied against the comet's overall visibility.
 * `useHeadColor` — head layer paints in warm-white; trail in track color.
 */
interface CometLayer {
  readonly lenPct: number;
  readonly opacity: number;
  readonly useHeadColor: boolean;
}
const COMET_LAYERS: readonly CometLayer[] = [
  { lenPct: 0.10, opacity: 0.90, useHeadColor: true  }, // head — bright tip
  { lenPct: 0.16, opacity: 0.62, useHeadColor: false }, // first trail step
  { lenPct: 0.22, opacity: 0.40, useHeadColor: false },
  { lenPct: 0.26, opacity: 0.24, useHeadColor: false },
  { lenPct: 0.26, opacity: 0.13, useHeadColor: false }, // tail — almost track opacity
];

/**
 * Build the SVG path for a rounded rectangle inset by half a stroke
 * width. Returns a closed path string suitable for `<path d="…">`.
 */
const buildRoundedRectPath = (
  w: number,
  h: number,
  r: number,
  strokeWidth: number,
): string => {
  const sw = strokeWidth;
  const ox = sw / 2;
  const oy = sw / 2;
  const W = Math.max(0, w - sw);
  const H = Math.max(0, h - sw);
  const rr = Math.max(0, Math.min(r, W / 2, H / 2));
  return [
    `M ${ox + rr} ${oy}`,
    `L ${ox + W - rr} ${oy}`,
    `A ${rr} ${rr} 0 0 1 ${ox + W} ${oy + rr}`,
    `L ${ox + W} ${oy + H - rr}`,
    `A ${rr} ${rr} 0 0 1 ${ox + W - rr} ${oy + H}`,
    `L ${ox + rr} ${oy + H}`,
    `A ${rr} ${rr} 0 0 1 ${ox} ${oy + H - rr}`,
    `L ${ox} ${oy + rr}`,
    `A ${rr} ${rr} 0 0 1 ${ox + rr} ${oy}`,
    'Z',
  ].join(' ');
};

const HEAD_COLOR = '#FFE9C7'; // warm-white tip — slightly amber-tinted

/**
 * Subscribe to `prefers-reduced-motion`. Returns `true` when the user
 * has asked the OS to reduce motion. SMIL animations don't honor the
 * media query natively, so callers gate the `<animate>` element on
 * this. When reduced, we render the comet's frozen first frame —
 * dashes are still visible (they signal "loading"), they just don't
 * travel. No jarring pop-in, no motion vestibular trigger.
 */
const useReducedMotion = (): boolean => {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return reduced;
};

export const SkeletonCardFrame = ({
  width = '100%',
  height = '100%',
  color = '#D7A86E',
  strokeWidth = 1,
  pulseCount = 'auto',
  pulseDurationSec = 5.0,
  pulseLengthPct = 5.5,
  pulse = true,
  watermark,
  watermarkSize = 64,
  borderRadius = 0,
  style,
  className,
  children,
  label,
}: SkeletonCardFrameProps) => {
  const reducedMotion = useReducedMotion();
  const uid = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 320, h: 220 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setSize((prev) => {
        if (
          Math.abs(prev.w - rect.width) < 0.5 &&
          Math.abs(prev.h - rect.height) < 0.5
        ) {
          return prev;
        }
        return { w: rect.width, h: rect.height };
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { w, h } = size;
  const path = useMemo(
    () => buildRoundedRectPath(w, h, borderRadius, strokeWidth),
    [w, h, borderRadius, strokeWidth],
  );

  const n = useMemo(
    () => pickPulseCount(pulseCount, w, h),
    [pulseCount, w, h],
  );

  // Pre-compute each comet layer's dasharray + path-position offset.
  // The "offset" is how far BEHIND the head the layer's leading edge
  // sits; we feed it into SMIL's `begin` to phase-shift the layer so
  // that at any moment, each layer's dash starts where the previous
  // layer's dash ended.
  const layers = useMemo(() => {
    let cumulativeOffset = 0;
    return COMET_LAYERS.map((layer) => {
      const len = pulseLengthPct * layer.lenPct;
      const gap = Math.max(0, 100 / n - len);
      const dashArray = Array.from({ length: n }, () => `${len} ${gap}`).join(' ');
      // Phase shift this layer back by `cumulativeOffset` units so its
      // dash sits immediately after the previous layer's dash. Negative
      // `begin` means "started in the past" — the layer is already that
      // far along its cycle at t=0.
      //
      // The math: at t=0 we want the layer's dashoffset to be
      // `cumulativeOffset - 100` (i.e. the dash sits at path position
      // `100 - cumulativeOffset`, which on the closed loop is the same
      // as "K behind the head"). Solving:
      //   dashoffset(t=0) = -(elapsed/D) * 100
      //   elapsed at t=0 = -begin
      //   so begin = -(elapsed) where elapsed = D * (1 - cumulativeOffset/100)
      const elapsed = pulseDurationSec * (1 - cumulativeOffset / 100);
      const begin = `${-elapsed}s`;
      const stroke = layer.useHeadColor ? HEAD_COLOR : color;
      const layerStrokeWidth = layer.useHeadColor
        ? strokeWidth * 1.25
        : strokeWidth;
      const filter = layer.useHeadColor
        ? `drop-shadow(0 0 4px ${color})`
        : undefined;
      const result = {
        dashArray,
        begin,
        opacity: layer.opacity,
        stroke,
        strokeWidth: layerStrokeWidth,
        filter,
      };
      cumulativeOffset += len;
      return result;
    });
  }, [n, pulseLengthPct, pulseDurationSec, color, strokeWidth]);

  return (
    <div
      ref={containerRef}
      className={className}
      role="status"
      aria-busy="true"
      aria-label={label ?? 'Loading card'}
      style={{
        position: 'relative',
        width,
        height,
        ...style,
      }}
    >
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        style={{
          position: 'absolute',
          inset: 0,
          overflow: 'visible',
          pointerEvents: 'none',
        }}
        aria-hidden
      >
        {/* Track — the dim ambient line the comet rides on. Same
            rounded path as every other layer. Track opacity is the
            "floor" — the comet's tail-end opacity is set just above
            this so it dissolves into the track instead of standing
            out as a separate dash. */}
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeOpacity="0.10"
          strokeWidth={strokeWidth}
          pathLength="100"
        />
        {/* Comet layers. Each layer is the same path with a different
            dasharray length + opacity + start phase. Stacked back-to-
            back, they form a single continuous comet shape that fades
            smoothly from the bright head into the dim track.

            Two opt-out paths share the same code:
            - `pulse={false}` — caller wants the static track only
              (e.g. secondary cards in a dense grid).
            - prefers-reduced-motion — system asked us not to animate;
              we still render the dashes (so the card looks "alive"
              with broken segments) but skip the <animate> element so
              they hold still. */}
        {pulse && layers.map((layer, i) => (
          <path
            key={i}
            d={path}
            fill="none"
            stroke={layer.stroke}
            strokeOpacity={layer.opacity}
            strokeWidth={layer.strokeWidth}
            strokeLinecap="round"
            pathLength="100"
            strokeDasharray={layer.dashArray}
            style={layer.filter ? { filter: layer.filter } : undefined}
          >
            {!reducedMotion && (
              <animate
                attributeName="stroke-dashoffset"
                from="0"
                to="-100"
                dur={`${pulseDurationSec}s`}
                begin={layer.begin}
                repeatCount="indefinite"
              />
            )}
          </path>
        ))}
      </svg>
      {/* Watermark — Sketchfab-style centered brand mark, faint enough
          to read as "this slot is reserved for content" without
          competing with the comet pulse for attention. Rendered ABOVE
          the SVG track but BELOW any children, so a card with both a
          watermark and live content puts the watermark behind the real
          payload as it crossfades in. */}
      {watermark && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: 0.22,
            pointerEvents: 'none',
            zIndex: 0,
          }}
        >
          <div
            style={{
              width: watermarkSize,
              height: watermarkSize,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color, // inherits the track color so SVGs using `currentColor` pick it up
            }}
          >
            {watermark}
          </div>
        </div>
      )}
      {children && (
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            width: '100%',
            height: '100%',
          }}
        >
          {children}
        </div>
      )}
      <span data-uid={uid} hidden />
    </div>
  );
};

export default SkeletonCardFrame;
