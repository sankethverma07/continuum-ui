/**
 * <PageConductor /> + <ConductorStep /> — page-level reveal choreography.
 *
 * Shared clock via React context. Each <ConductorStep delay={ms}> renders
 * its `skeleton` prop until the clock passes `delay`, then cross-fades
 * to `children`. The Conductor itself just drives the clock and exposes
 * a `runToken` so pressing "Replay" resets every child simultaneously.
 *
 * Typical usage:
 *
 *   <PageConductor duration={2800}>
 *     <ConductorStep delay={0}    skeleton={<SkeletonPulse kind="nav-item" />}>
 *       <NavItem label="Home" />
 *     </ConductorStep>
 *     <ConductorStep delay={400}  skeleton={<SkeletonPulse kind="heading" />}>
 *       <h1>Marketing headline.</h1>
 *     </ConductorStep>
 *     <ConductorStep delay={1100} skeleton={<SkeletonCard />}>
 *       <Card ... />
 *     </ConductorStep>
 *   </PageConductor>
 *
 * The conductor respects Doherty — total `duration` should stay under
 * 3000 ms regardless of how many elements are staggered.
 */

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';

interface ConductorValue {
  readonly elapsedMs: number;
  readonly runToken: number;
  readonly duration: number;
  readonly autoplay: boolean;
}

const Ctx = createContext<ConductorValue>({
  elapsedMs: Infinity,    // unbounded clock = everything revealed by default
  runToken: 0,
  duration: 2800,
  autoplay: true,
});

export interface PageConductorProps {
  readonly children: ReactNode;
  /** Total reveal duration in ms. Defaults to 2800 (~Doherty). */
  readonly duration?: number;
  /** When true, the clock runs on mount; when false, hold at 0 until runToken bumps. */
  readonly autoplay?: boolean;
  /** Bump this to replay the reveal sequence without remounting children. */
  readonly runToken?: number;
}

export const PageConductor = ({
  children,
  duration = 2800,
  autoplay = true,
  runToken = 0,
}: PageConductorProps) => {
  const [elapsed, setElapsed] = useState(autoplay ? 0 : Infinity);
  const startedAtRef = useRef<number>(performance.now());

  useEffect(() => {
    if (!autoplay) {
      setElapsed(Infinity);
      return;
    }
    startedAtRef.current = performance.now();
    setElapsed(0);
    let raf = 0;
    const tick = () => {
      const e = performance.now() - startedAtRef.current;
      setElapsed(e);
      if (e < duration + 400) {
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [autoplay, runToken, duration]);

  return (
    <Ctx.Provider value={{ elapsedMs: elapsed, runToken, duration, autoplay }}>
      {children}
    </Ctx.Provider>
  );
};

// ---------------------------------------------------------------------------
// useConductor — imperative hook for advanced consumers
// ---------------------------------------------------------------------------

export const useConductor = (): ConductorValue => useContext(Ctx);

/**
 * Returns whether a given delay has elapsed in the conductor's clock.
 * Useful when a component wants to manage its own skeleton/content swap
 * instead of using <ConductorStep>.
 */
export const useRevealed = (delayMs: number): boolean => {
  const { elapsedMs } = useConductor();
  return elapsedMs >= delayMs;
};

// ---------------------------------------------------------------------------
// <ConductorStep /> — wraps a child with skeleton → content crossfade
// ---------------------------------------------------------------------------

export interface ConductorStepProps {
  readonly children: ReactNode;
  readonly skeleton: ReactNode;
  /** Milliseconds after conductor start when this element reveals. */
  readonly delay?: number;
  /** Crossfade duration in ms. Defaults to 260. */
  readonly fadeMs?: number;
  readonly style?: React.CSSProperties;
  readonly className?: string;
}

export const ConductorStep = ({
  children,
  skeleton,
  delay = 0,
  fadeMs = 260,
  style,
  className,
}: ConductorStepProps) => {
  const revealed = useRevealed(delay);
  return (
    <div
      className={className}
      style={{
        position: 'relative',
        ...style,
      }}
    >
      {/* Content layer — ALWAYS in flow. Defines the wrapper's height
          so the layout never changes shape between skeleton and reveal
          phases. At opacity 0 the children still render and take their
          natural space (display is preserved); the skeleton overlay
          inherits that exact box via `inset: 0`. This is the fix for
          rows growing/shrinking when card transitions stagger across
          a multi-row grid. */}
      <div
        style={{
          opacity: revealed ? 1 : 0,
          transition: `opacity ${fadeMs}ms ease-out`,
          pointerEvents: revealed ? 'auto' : 'none',
        }}
      >
        {children}
      </div>
      {/* Skeleton layer — ALWAYS absolute, overlays the content area
          while loading and fades out on reveal. Pulled out of layout
          flow entirely so it never contributes height. zIndex keeps
          its outline + pulses painting on top of the (invisible)
          content layer. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: revealed ? 0 : 1,
          transition: `opacity ${fadeMs}ms ease-out`,
          pointerEvents: revealed ? 'none' : 'auto',
          zIndex: 1,
        }}
        aria-hidden={revealed}
      >
        {skeleton}
      </div>
    </div>
  );
};

/**
 * Convenience wrapper: a flex/grid container that auto-staggers its
 * direct children by `stepMs` — the first child reveals at `startMs`,
 * the next at `startMs + stepMs`, etc. Saves the caller from threading
 * delay props manually when rendering a list of cards.
 */
export interface StaggerGroupProps {
  readonly children: ReactNode[];
  readonly skeletonFor: (index: number) => ReactNode;
  readonly startMs?: number;
  readonly stepMs?: number;
  readonly className?: string;
  readonly style?: React.CSSProperties;
}

export const StaggerGroup = ({
  children,
  skeletonFor,
  startMs = 0,
  stepMs = 80,
  className,
  style,
}: StaggerGroupProps) => (
  <div className={className} style={style}>
    {children.map((child, i) => (
      <ConductorStep
        key={i}
        delay={startMs + i * stepMs}
        skeleton={skeletonFor(i)}
      >
        {child}
      </ConductorStep>
    ))}
  </div>
);
