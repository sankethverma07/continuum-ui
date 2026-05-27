/**
 * <NaiveLoadingHero /> — the "before" in a before/after.
 *
 * Mimics the dominant pattern on the web today for heavy 3D payloads: show
 * a loading indicator for the entire download window, then pop the fully
 * rendered asset in at the end. No progressive reveal, no skeleton, no
 * subject-first ordering. Just "please wait" → "here it is".
 *
 * Concretely, for `totalMs` milliseconds we render:
 *   - a faint ring spinner
 *   - a mono "LOADING 3D ASSET..." label
 *   - a determinate progress bar ticking from 0 → 100%
 *
 * At t = totalMs the phone pops in at the PBR hero tier (tier 4, full
 * fidelity) with a brief opacity crossfade to avoid a harsh snap.
 *
 * The point is to make the perceived-latency gap against the semantic
 * hydration hero legible: same wall-clock end time, completely different
 * perceived experience. Side-by-side on the Latency page.
 */

import { useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, ContactShadows } from '@react-three/drei';

import {
  RealisticPhoneAsset,
  PHONE_COLORWAYS,
} from './RealisticPhoneAsset';
import type { PhoneColorway } from './RealisticPhoneAsset';

export interface NaiveLoadingHeroProps {
  readonly colorway?: keyof typeof PHONE_COLORWAYS;
  /** Total wall-clock load window, ms. Defaults to the Doherty envelope. */
  readonly totalMs?: number;
  readonly autoRotate?: number;
  readonly pointerTilt?: number;
  /** Optional background override — usually the caller wants transparent. */
  readonly background?: string;
}

export const NaiveLoadingHero = ({
  colorway = 'titanium',
  totalMs = 3200,
  autoRotate = 0.0,
  pointerTilt = 0,
  background,
}: NaiveLoadingHeroProps) => {
  const palette: PhoneColorway =
    PHONE_COLORWAYS[colorway] ?? (PHONE_COLORWAYS.titanium as PhoneColorway);

  const [loaded, setLoaded] = useState(false);
  const [progress, setProgress] = useState(0);
  const startedAtRef = useRef<number>(performance.now());

  // Reset on mount (keyed replays remount us).
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
  }, [totalMs]);

  return (
    <div
      data-continuum-hero="naive-loading"
      data-continuum-kind="phone-naive-loading"
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        background: background ?? 'transparent',
      }}
    >
      {/* R3F canvas is always mounted so the pop-in doesn't re-initialize  */}
      {/* the GL context. Until `loaded` flips we render an invisible phone */}
      {/* at tier 4, but keep the canvas opacity 0.                          */}
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
          camera={{ position: [0, 0, 5.5], fov: 28 }}
          dpr={[1, 2]}
          gl={{ antialias: true, alpha: true }}
        >
          <ambientLight intensity={0.3} />
          <directionalLight position={[3, 4, 5]} intensity={1.1} color="#FFF5E0" />
          <directionalLight position={[-4, 2, -2]} intensity={0.55} color="#7A88A8" />
          <pointLight position={[0, -3, 2]} intensity={0.25} color="#D7A86E" />
          <RealisticPhoneAsset
            colorway={colorway}
            tier={4}
            autoRotate={autoRotate}
            pointerTilt={pointerTilt}
          />
          <ContactShadows
            position={[0, -1.55, 0]}
            opacity={0.55}
            scale={6}
            blur={2.4}
            far={2}
          />
          <Environment preset="studio" environmentIntensity={0.5} />
        </Canvas>
      </div>

      {/* Loading UI — centered ring spinner + progress bar. */}
      {!loaded && (
        <LoadingIndicator progress={progress} accent={String(palette.accent)} />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// LoadingIndicator — the "please wait" affordance. Spinner + progress bar.
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
        fontFamily:
          'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
        fontSize: 11,
        letterSpacing: '0.22em',
        textTransform: 'uppercase',
      }}
    >
      <Spinner accent={accent} />
      <div style={{ color: '#D7C6B0' }}>Loading 3D asset…</div>
      <div
        style={{
          width: 180,
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
      <div style={{ color: '#7F6E5E', fontSize: 10 }}>
        {pct}% · titanium.glb · 8.4 MB
      </div>
    </div>
  );
};

const Spinner = ({ accent }: { readonly accent: string }) => (
  <>
    <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden>
      <circle
        cx="22"
        cy="22"
        r="18"
        fill="none"
        stroke="rgba(215, 168, 110, 0.16)"
        strokeWidth="2"
      />
      <circle
        cx="22"
        cy="22"
        r="18"
        fill="none"
        stroke={accent}
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="32 120"
        transform="rotate(-90 22 22)"
      >
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 22 22"
          to="360 22 22"
          dur="0.9s"
          repeatCount="indefinite"
        />
      </circle>
    </svg>
  </>
);

export default NaiveLoadingHero;
