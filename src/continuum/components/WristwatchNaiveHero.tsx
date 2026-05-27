/**
 * <WristwatchNaiveHero /> — the "before" in a before/after, watch edition.
 *
 * Mirrors NaiveLoadingHero but renders WristwatchAsset at tier 4 after the
 * full Doherty envelope has elapsed. Same spinner + progress-bar idiom as
 * the phone version, same messaging ("Loading 3D asset…"), so the two
 * strategies are directly comparable when paired in a side-by-side page.
 */

import { useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, ContactShadows } from '@react-three/drei';

import {
  WristwatchAsset,
  WATCH_COLORWAYS,
} from './WristwatchAsset';
import type { WatchColorway } from './WristwatchAsset';

export interface WristwatchNaiveHeroProps {
  readonly colorway?: keyof typeof WATCH_COLORWAYS;
  readonly totalMs?: number;
  readonly autoRotate?: number;
  readonly background?: string;
  /** Bump to restart the spinner-then-pop sequence without remounting Canvas. */
  readonly runToken?: number;
  /**
   * Optional page background hex — forwarded to the asset so the spinner
   * and loading chrome match the contrast scheme of the surrounding page.
   */
  readonly backgroundHex?: string;
}

export const WristwatchNaiveHero = ({
  colorway = 'gold',
  totalMs = 3200,
  autoRotate = 0.45,
  background,
  runToken = 0,
}: WristwatchNaiveHeroProps) => {
  const palette: WatchColorway =
    WATCH_COLORWAYS[colorway] ?? (WATCH_COLORWAYS.gold as WatchColorway);

  const [loaded, setLoaded] = useState(false);
  const [progress, setProgress] = useState(0);
  const startedAtRef = useRef<number>(performance.now());

  useEffect(() => {
    startedAtRef.current = performance.now();
    setLoaded(false);
    setProgress(0);

    let raf = 0;
    const tick = () => {
      const elapsed = performance.now() - startedAtRef.current;
      const t = Math.min(1, elapsed / Math.max(1, totalMs));
      setProgress(t);
      if (t >= 1) {
        setLoaded(true);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // runToken intentionally in deps — bumping it re-runs this effect,
    // resetting the loading timer without remounting the Canvas.
  }, [totalMs, runToken]);

  return (
    <div
      data-continuum-hero="watch-naive-loading"
      data-continuum-kind="watch-naive-loading"
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        background: background ?? 'transparent',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: loaded ? 1 : 0,
          transition: 'opacity 220ms ease-out',
        }}
      >
        <Canvas
          style={{ position: 'absolute', inset: 0 }}
          camera={{ position: [0, 0, 7.2], fov: 30 }}
          dpr={[1, 1.5]}
          gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        >
          <ambientLight intensity={0.35} />
          <directionalLight position={[3, 4, 5]} intensity={1.15} color="#FFF5E0" />
          <directionalLight position={[-4, 2, -2]} intensity={0.55} color="#7A88A8" />
          <pointLight position={[0, -3, 2]} intensity={0.25} color="#D7A86E" />
          <WristwatchAsset
            colorway={colorway}
            tier={4}
            autoRotate={autoRotate}
          />
          <ContactShadows
            position={[0, -1.8, 0]}
            opacity={0.55}
            scale={6}
            blur={2.4}
            far={2}
          />
          <Environment preset="studio" environmentIntensity={0.55} />
        </Canvas>
      </div>

      {!loaded && (
        <LoadingIndicator progress={progress} accent={String(palette.accentColor)} />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// LoadingIndicator — Neue Montreal sans everywhere (no mono).
// ---------------------------------------------------------------------------

const LoadingIndicator = ({
  progress,
  accent,
}: {
  readonly progress: number;
  readonly accent: string;
}) => {
  const pct = Math.round(progress * 100);
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 18,
        color: '#B8A998',
        fontFamily: 'var(--font-sans)',
        fontSize: 12,
        letterSpacing: '0.04em',
      }}
    >
      <Spinner accent={accent} />
      <div style={{ color: '#D7C6B0', letterSpacing: '0.02em' }}>
        Loading 3D asset…
      </div>
      <div
        style={{
          width: 200,
          height: 2,
          background: 'rgba(215, 168, 110, 0.14)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: accent,
            transition: 'width 80ms linear',
          }}
        />
      </div>
      <div style={{ color: '#7F6E5E', fontSize: 11 }}>
        {pct}% · continuum-watch.glb · 11.2 MB
      </div>
    </div>
  );
};

const Spinner = ({ accent }: { readonly accent: string }) => (
  <svg width="48" height="48" viewBox="0 0 48 48" aria-hidden>
    <circle
      cx="24" cy="24" r="20"
      fill="none"
      stroke="rgba(215, 168, 110, 0.16)"
      strokeWidth="2"
    />
    <circle
      cx="24" cy="24" r="20"
      fill="none"
      stroke={accent}
      strokeWidth="2"
      strokeLinecap="round"
      strokeDasharray="36 140"
      transform="rotate(-90 24 24)"
    >
      <animateTransform
        attributeName="transform"
        type="rotate"
        from="0 24 24"
        to="360 24 24"
        dur="0.9s"
        repeatCount="indefinite"
      />
    </circle>
  </svg>
);

export default WristwatchNaiveHero;
