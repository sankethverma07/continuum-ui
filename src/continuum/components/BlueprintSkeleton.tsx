/**
 * <BlueprintSkeleton /> — the engineering overlay shown while a hero asset
 * streams. Reads as "scaffold before the finished piece".
 *
 * Pure SVG + CSS. No external assets, paints on the first frame. Amber on
 * black per the Continuum visual language. This is what the user sees INSTEAD
 * of an empty rectangle while Spline / KTX2 / Draco payloads come down.
 */

import type { CSSProperties } from 'react';

export interface BlueprintSkeletonProps {
  /** HUD label; e.g. "HYDRATING TIER 2" or "LOADING RELAY 01". */
  readonly label?: string;
  /** Optional 0–1 progress. When provided, the progress bar becomes determinate. */
  readonly progress?: number;
  /** Optional additional style overrides for the container. */
  readonly style?: CSSProperties;
}

export const BlueprintSkeleton = ({
  label = 'HYDRATING TIER 2',
  progress,
  style,
}: BlueprintSkeletonProps) => {
  const progressPct = typeof progress === 'number' ? Math.round(progress * 100) : null;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: '#000000',
        color: '#FF8C00',
        fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
        overflow: 'hidden',
        ...style,
      }}
    >
      {/* --- background grid (subtle) --- */}
      <svg
        width="100%"
        height="100%"
        style={{ position: 'absolute', inset: 0 }}
        aria-hidden
      >
        <defs>
          <pattern id="continuum-grid" width="32" height="32" patternUnits="userSpaceOnUse">
            <path
              d="M 32 0 L 0 0 0 32"
              fill="none"
              stroke="#FFFFFF"
              strokeOpacity="0.06"
              strokeWidth="1"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#continuum-grid)" />
      </svg>

      {/* --- four corner brackets --- */}
      <CornerBracket corner="tl" />
      <CornerBracket corner="tr" />
      <CornerBracket corner="bl" />
      <CornerBracket corner="br" />

      {/* --- rotating wireframe shape (the 'skeleton mesh') --- */}
      <WireframeMarker />

      {/* --- scanning line --- */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          height: 1,
          background:
            'linear-gradient(90deg, transparent 0%, #FF8C00 50%, transparent 100%)',
          opacity: 0.6,
          animation: 'continuum-scan 2.4s cubic-bezier(0.65, 0, 0.35, 1) infinite',
          pointerEvents: 'none',
        }}
      />

      {/* --- HUD label (bottom-left) --- */}
      <div
        style={{
          position: 'absolute',
          left: 24,
          bottom: 24,
          fontSize: 10,
          letterSpacing: 2,
          textTransform: 'uppercase',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: '#FF8C00',
            boxShadow: '0 0 8px #FF8C00',
            animation: 'continuum-blink 1.2s ease-in-out infinite',
          }}
        />
        <span>{label}</span>
        {progressPct !== null && (
          <span style={{ opacity: 0.6 }}>· {progressPct.toString().padStart(3, '0')}%</span>
        )}
      </div>

      {/* --- dimensional ticks along the top edge --- */}
      <div
        style={{
          position: 'absolute',
          top: 24,
          right: 24,
          fontSize: 9,
          letterSpacing: 2,
          opacity: 0.55,
          textTransform: 'uppercase',
        }}
      >
        LOD&nbsp;0 · SKELETON&nbsp;MIRROR
      </div>

      {/* --- progress rail (bottom, hairline) --- */}
      <div
        style={{
          position: 'absolute',
          left: 24,
          right: 24,
          bottom: 12,
          height: 1,
          background: '#FFFFFF18',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            height: '100%',
            width: progressPct !== null ? `${progressPct}%` : '40%',
            background: '#FF8C00',
            opacity: 0.85,
            transition: 'width 240ms ease-out',
            animation:
              progressPct !== null ? undefined : 'continuum-rail 1.6s ease-in-out infinite',
          }}
        />
      </div>

      {/* Keyframes — inlined so the skeleton is self-contained. */}
      <style>{`
        @keyframes continuum-scan {
          0%   { transform: translateY(0); opacity: 0; }
          10%  { opacity: 0.6; }
          50%  { transform: translateY(50vh); opacity: 0.8; }
          90%  { opacity: 0.6; }
          100% { transform: translateY(100vh); opacity: 0; }
        }
        @keyframes continuum-blink {
          0%, 100% { opacity: 0.4; }
          50%      { opacity: 1; }
        }
        @keyframes continuum-rail {
          0%   { transform: translateX(-100%); width: 40%; }
          50%  { transform: translateX(150%);  width: 40%; }
          100% { transform: translateX(250%);  width: 40%; }
        }
        @keyframes continuum-spin {
          from { transform: rotateX(18deg) rotateY(0deg); }
          to   { transform: rotateX(18deg) rotateY(360deg); }
        }
      `}</style>
    </div>
  );
};

// -----------------------------------------------------------------------------
// Corner bracket — a 28px L-shape. `corner` sets which corner it pins to.
// -----------------------------------------------------------------------------
const CORNER_SIZE = 28;
const CORNER_INSET = 16;
const CORNER_STROKE = 1.5;

const CornerBracket = ({ corner }: { corner: 'tl' | 'tr' | 'bl' | 'br' }) => {
  const pos: CSSProperties =
    corner === 'tl'
      ? { top: CORNER_INSET, left: CORNER_INSET }
      : corner === 'tr'
      ? { top: CORNER_INSET, right: CORNER_INSET, transform: 'scaleX(-1)' }
      : corner === 'bl'
      ? { bottom: CORNER_INSET, left: CORNER_INSET, transform: 'scaleY(-1)' }
      : { bottom: CORNER_INSET, right: CORNER_INSET, transform: 'scale(-1,-1)' };

  return (
    <svg
      width={CORNER_SIZE}
      height={CORNER_SIZE}
      style={{ position: 'absolute', ...pos }}
      aria-hidden
    >
      <path
        d={`M 0 ${CORNER_SIZE} L 0 0 L ${CORNER_SIZE} 0`}
        stroke="#FF8C00"
        strokeWidth={CORNER_STROKE}
        fill="none"
      />
    </svg>
  );
};

// -----------------------------------------------------------------------------
// Wireframe marker — a rotating SVG octahedron that stands in for the
// asset-in-progress. CSS keeps it GPU-accelerated.
// -----------------------------------------------------------------------------
const WireframeMarker = () => (
  <div
    style={{
      position: 'absolute',
      top: '50%',
      left: '50%',
      width: 160,
      height: 160,
      transform: 'translate(-50%, -50%)',
      pointerEvents: 'none',
      opacity: 0.75,
    }}
  >
    <div
      style={{
        width: '100%',
        height: '100%',
        animation: 'continuum-spin 8s linear infinite',
        transformStyle: 'preserve-3d',
        transformOrigin: 'center',
      }}
    >
      <svg viewBox="-100 -100 200 200" width="100%" height="100%" aria-hidden>
        {/* Octahedron projection — 6 vertices, 12 edges. */}
        <g
          fill="none"
          stroke="#FF8C00"
          strokeWidth="1"
          strokeLinecap="round"
        >
          {/* upper 4 edges */}
          <line x1="0" y1="-80" x2="80" y2="0" />
          <line x1="80" y1="0" x2="0" y2="80" />
          <line x1="0" y1="80" x2="-80" y2="0" />
          <line x1="-80" y1="0" x2="0" y2="-80" />
          {/* inner diagonals (suggests depth) */}
          <line x1="0" y1="-80" x2="0" y2="80" strokeOpacity="0.3" />
          <line x1="-80" y1="0" x2="80" y2="0" strokeOpacity="0.3" />
          {/* vertex dots */}
          <circle cx="0"   cy="-80" r="2.5" fill="#FF8C00" />
          <circle cx="80"  cy="0"   r="2.5" fill="#FF8C00" />
          <circle cx="0"   cy="80"  r="2.5" fill="#FF8C00" />
          <circle cx="-80" cy="0"   r="2.5" fill="#FF8C00" />
        </g>
      </svg>
    </div>
  </div>
);
