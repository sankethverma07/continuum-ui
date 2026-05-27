/**
 * <Continuum /> — the plug-and-play wrapper.
 *
 * Drop ANY block of normal HTML/JSX inside this component and the
 * skeleton-reveal system gets applied automatically. No prop drilling,
 * no per-element wiring, no PageConductor + ConductorStep boilerplate.
 *
 *   <Continuum>
 *     <h1>Marketing headline.</h1>
 *     <p>Some body copy that wraps.</p>
 *     <div className="card">…</div>
 *   </Continuum>
 *
 * Internally:
 *   1. Children paint at opacity tied to a `--reveal` CSS variable —
 *      0 during loading, 1 after reveal.
 *   2. After mount, a DOM scanner classifies each leaf element via
 *      `detectAllKinds` (heading / text-block / card / button / image).
 *   3. An absolutely-positioned overlay layer paints the right kind of
 *      skeleton on top of each detected element's rect. Overlay opacity
 *      is `1 - reveal`, so it crossfades out as the real content fades
 *      in — same staged-reveal behaviour the WatchShowcasePage gets,
 *      generalised.
 *   4. A ResizeObserver re-measures rects on layout shift so the
 *      overlay stays glued to the content even when fonts hydrate or
 *      images settle.
 *
 * The wrapper is intentionally non-invasive: it doesn't touch children's
 * markup, classes, or props. If a builder wants finer control over a
 * particular element they can add `data-continuum-skeleton` to opt that
 * element out and render it however they want.
 */

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { CSSProperties, ReactNode } from 'react';

import { detectAllKinds } from '../skeleton/detectElementKind';
import type { DetectMeta, SkeletonKind } from '../skeleton/detectElementKind';
import { SkeletonCardFrame } from '../skeleton/SkeletonCardFrame';
import { SkeletonTextBlock } from '../skeleton/SkeletonTextBlock';

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------

export interface ContinuumSchedule {
  /** Total time the wireframe phase holds before reveal begins. ms. */
  readonly wireframeHoldMs: number;
  /** When the colour/glass/text fill begins. ms from mount. */
  readonly fillStartMs: number;
  /** When the colour/glass/text fill completes. ms from mount. */
  readonly fillEndMs: number;
}

const DEFAULT_SCHEDULE: ContinuumSchedule = {
  wireframeHoldMs: 1200,
  fillStartMs: 1200,
  fillEndMs: 2400,
};

// ---------------------------------------------------------------------------
// Detected-element tracker — bounds + classification per leaf element
// ---------------------------------------------------------------------------

interface TrackedElement {
  readonly id: string;
  readonly el: HTMLElement;
  readonly meta: DetectMeta;
  readonly rect: { x: number; y: number; w: number; h: number };
}

const KEY_FOR = (el: HTMLElement, i: number): string => {
  // Stable-ish key per node for React reconciliation. Uses tag + position
  // + size — good enough across re-measures and avoids depending on
  // unstable WeakMap identity.
  const r = el.getBoundingClientRect();
  return `${el.tagName.toLowerCase()}-${i}-${Math.round(r.width)}x${Math.round(r.height)}`;
};

// ---------------------------------------------------------------------------
// Skeleton renderer per kind — what overlay to paint over which element
// ---------------------------------------------------------------------------

const ACCENT_COLOR = 'var(--c-accent, #D7A86E)';

const renderSkeleton = (
  meta: DetectMeta,
  rect: TrackedElement['rect'],
): ReactNode => {
  const kind: SkeletonKind = meta.kind;
  const inset: CSSProperties = {
    position: 'absolute',
    left: rect.x,
    top: rect.y,
    width: rect.w,
    height: rect.h,
    pointerEvents: 'none',
  };

  switch (kind) {
    case 'card':
      return (
        <div style={inset}>
          <SkeletonCardFrame
            color={ACCENT_COLOR}
            borderRadius={meta.borderRadius || 14}
            strokeWidth={1}
            pulseDurationSec={5.0}
            pulseLengthPct={5.5}
          />
        </div>
      );

    case 'heading':
    case 'subheading':
      // Hollow stroke "ghost" rectangle — sized to the heading. The real
      // heading is hidden underneath until reveal fills it in.
      return (
        <div
          style={{
            ...inset,
            border: `1px solid ${ACCENT_COLOR}`,
            opacity: 0.45,
            borderRadius: 2,
          }}
        />
      );

    case 'text-block':
      // Multi-line paragraph → dimmed bars matching the wrapped lines.
      return (
        <div style={{ ...inset, padding: 0 }}>
          <SkeletonTextBlock
            lines={meta.lineCount}
            lineHeight={meta.lineHeight}
            color={ACCENT_COLOR}
          />
        </div>
      );

    case 'text-line':
    case 'caption':
      return (
        <div
          style={{
            ...inset,
            background: ACCENT_COLOR,
            opacity: 0.18,
            borderRadius: 2,
          }}
        />
      );

    case 'button':
      return (
        <div
          style={{
            ...inset,
            border: `1px solid ${ACCENT_COLOR}`,
            opacity: 0.55,
            borderRadius: meta.borderRadius || 4,
          }}
        />
      );

    case 'image':
    case 'avatar':
      return (
        <div
          style={{
            ...inset,
            border: `1px dashed ${ACCENT_COLOR}`,
            opacity: 0.4,
            borderRadius: meta.borderRadius || (kind === 'avatar' ? 999 : 6),
          }}
        />
      );

    case 'divider':
      return (
        <div
          style={{
            ...inset,
            background: ACCENT_COLOR,
            opacity: 0.35,
          }}
        />
      );

    default:
      return null;
  }
};

// ---------------------------------------------------------------------------
// Public props
// ---------------------------------------------------------------------------

export interface ContinuumProps {
  readonly children: ReactNode;
  /** Reveal schedule. Defaults to a snappy 2.4 s total. */
  readonly schedule?: Partial<ContinuumSchedule>;
  /** Bump to replay the reveal sequence. */
  readonly replayKey?: number;
  /** Disable the skeleton entirely (renders children at full opacity). */
  readonly disabled?: boolean;
  /** Optional CSS class on the host element. */
  readonly className?: string;
  /** Inline style on the host element. */
  readonly style?: CSSProperties;
  /**
   * Hook to override or extend skeleton rendering per element. Return
   * `undefined` to fall back to the default renderer; return any node to
   * use that instead.
   */
  readonly renderSkeletonOverride?: (
    meta: DetectMeta,
    rect: TrackedElement['rect'],
  ) => ReactNode | undefined;
  /**
   * Optional filter — return false to skip an element from skeleton
   * overlay (it'll just fade in with the parent reveal). Useful for
   * decorative wrappers the detector might guess wrong on.
   */
  readonly elementFilter?: (el: HTMLElement, meta: DetectMeta) => boolean;
}

// ---------------------------------------------------------------------------
// <Continuum />
// ---------------------------------------------------------------------------

export const Continuum = ({
  children,
  schedule,
  replayKey = 0,
  disabled = false,
  className,
  style,
  renderSkeletonOverride,
  elementFilter,
}: ContinuumProps) => {
  const sched: ContinuumSchedule = { ...DEFAULT_SCHEDULE, ...(schedule ?? {}) };
  const uid = useId();
  const hostRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [reveal, setReveal] = useState(disabled ? 1 : 0);
  const [tracked, setTracked] = useState<readonly TrackedElement[]>([]);

  // ---- 1. Reveal clock --------------------------------------------------
  useEffect(() => {
    if (disabled) {
      setReveal(1);
      return;
    }
    setReveal(0);
    const start = performance.now();
    let raf = 0;
    const tick = () => {
      const e = performance.now() - start;
      if (e <= sched.fillStartMs) {
        setReveal(0);
      } else if (e >= sched.fillEndMs) {
        setReveal(1);
      } else {
        const p = (e - sched.fillStartMs) / (sched.fillEndMs - sched.fillStartMs);
        setReveal(p < 0 ? 0 : p > 1 ? 1 : p);
      }
      if (e < sched.fillEndMs + 200) {
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // sched values are primitives; using replayKey lets the user re-trigger.
  }, [disabled, replayKey, sched.fillStartMs, sched.fillEndMs]);

  // ---- 2. DOM scan + ResizeObserver for re-measurement -----------------
  useLayoutEffect(() => {
    if (disabled) return;
    const host = hostRef.current;
    const content = contentRef.current;
    if (!host || !content) return;

    const measure = () => {
      const detected = detectAllKinds(content);
      const hostRect = host.getBoundingClientRect();
      const list: TrackedElement[] = [];
      let i = 0;
      detected.forEach((meta, el) => {
        if (elementFilter && !elementFilter(el, meta)) return;
        const r = el.getBoundingClientRect();
        list.push({
          id: KEY_FOR(el, i++),
          el,
          meta,
          rect: {
            x: r.left - hostRect.left,
            y: r.top - hostRect.top,
            w: r.width,
            h: r.height,
          },
        });
      });
      setTracked(list);
    };

    measure();

    // Re-measure on size changes — fonts swapping, images loading,
    // browser zoom, layout reflow from CSS variable updates, etc.
    const ro = new ResizeObserver(() => {
      // Schedule on next frame so we capture the post-layout rects.
      requestAnimationFrame(measure);
    });
    ro.observe(content);

    // Also re-measure once everything has settled (font hydration etc).
    const settleTimer = window.setTimeout(measure, 350);
    return () => {
      ro.disconnect();
      window.clearTimeout(settleTimer);
    };
  }, [disabled, replayKey, children, elementFilter]);

  // ---- 3. Compose CSS variables for child cooperation ------------------
  const hostStyle: CSSProperties = useMemo(
    () => ({
      position: 'relative',
      // `--reveal` is exposed so children can opt into the system without
      // any JS — e.g. a custom card can use `opacity: var(--reveal, 1)`
      // on its glass layer to fade in alongside the wrapper.
      ['--reveal' as string]: String(reveal),
      ...style,
    }),
    [reveal, style],
  );

  const overlayOpacity = 1 - reveal;
  const showOverlay = !disabled && overlayOpacity > 0.01;

  return (
    <div
      ref={hostRef}
      className={className}
      style={hostStyle}
      data-continuum-host={uid}
    >
      {/* Real content. Always in flow so its layout drives the overlay
          geometry. Opacity ramps 0 → 1 from `fillStartMs` to `fillEndMs`,
          mirroring the wireframe-to-material progression of the 3D side. */}
      <div
        ref={contentRef}
        style={{
          opacity: disabled ? 1 : reveal,
          transition: 'opacity 200ms linear',
        }}
      >
        {children}
      </div>

      {/* Skeleton overlay — absolutely positioned per detected leaf
          element. Each tracked rect gets its own kind-specific overlay
          (card frame, hollow heading, dimmed paragraph bars, etc). The
          whole layer fades from opacity 1 → 0 as the reveal completes. */}
      {showOverlay && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            opacity: overlayOpacity,
            pointerEvents: 'none',
            transition: 'opacity 200ms linear',
            zIndex: 1,
          }}
        >
          {tracked.map((t) => {
            const overridden = renderSkeletonOverride?.(t.meta, t.rect);
            if (overridden !== undefined) {
              return <div key={t.id}>{overridden}</div>;
            }
            const node = renderSkeleton(t.meta, t.rect);
            if (!node) return null;
            return <div key={t.id}>{node}</div>;
          })}
        </div>
      )}
    </div>
  );
};

export default Continuum;
