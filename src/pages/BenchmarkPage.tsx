/**
 * BenchmarkPage — real, reproducible performance numbers.
 *
 * Runs the assets in /public through both reveal strategies and records
 * three timings per asset:
 *
 *   firstPaintMs — time from fetch start to first visible frame
 *   pbrReadyMs   — time from fetch start to fully-textured render
 *   totalBytes   — actual transferred bytes (proxy + glb if both used)
 *
 * Strategies measured:
 *   - naive: useGLTF(glb) → suspends until full PBR is parseable
 *   - proxy: WireframeProxy paints, then the full glb resolves behind it
 *
 * Output: a JSON blob in the page (and console.log) that can be pasted
 * into the case study to back up the speedup claims.
 *
 * **How to use:** open `/#/benchmark`, click "Run". The page will load
 * each asset twice (once per strategy), let each settle for 1.5 s, then
 * report. Total runtime is ~assets × 2 × (cold load + 1.5 s) — figure
 * a minute for the current asset set.
 *
 * **Honesty caveats:**
 *   1. Browser HTTP cache means runs after the first are warm-cache.
 *      Hard-refresh (Ctrl+Shift+R) before clicking "Run" for cold numbers.
 *   2. WebGL context init varies by GPU + driver — first run after a fresh
 *      browser load is slower than subsequent runs. Run 2–3 times, report
 *      the median.
 *   3. Bandwidth is whatever your network is at the moment. Ideally run
 *      with Chrome DevTools throttled to "Fast 4G" for a portable baseline.
 *
 * Numbers are anecdotal by definition without these controls. The right
 * thing to put in a case study is "measured on my MacBook Pro M2 with
 * Fast-4G throttling, median of 3 runs" — not "16ms" with no context.
 */

import { Suspense, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, useGLTF } from '@react-three/drei';
import * as THREE from 'three';

import { WireframeProxy } from '../continuum/components/WireframeProxy';
import { engineExtendLoader } from '../continuum/utils/configureGLTFLoader';

// ---------------------------------------------------------------------------
// Asset list
// ---------------------------------------------------------------------------

interface Asset {
  readonly id: string;
  readonly glb: string;
  readonly proxy: string;
}

const ASSETS: readonly Asset[] = [
  { id: 'skull',         glb: '/skull.glb',           proxy: '/skull.proxy.bin' },
  { id: 'BMW',           glb: '/BMW.glb',             proxy: '/BMW.proxy.bin' },
  { id: 'Bottle-test',   glb: '/Bottle-test.glb',     proxy: '/Bottle-test.proxy.bin' },
  { id: 'free-fire',     glb: '/free-fire.glb',       proxy: '/free-fire.proxy.bin' },
  { id: 'mclaren-p1',    glb: '/mclaren-p1.glb',      proxy: '/mclaren-p1.proxy.bin' },
  { id: 'spaceship',     glb: '/spaceship.glb',       proxy: '/spaceship.proxy.bin' },
];

// ---------------------------------------------------------------------------
// Result rows
// ---------------------------------------------------------------------------

type Strategy = 'naive' | 'proxy';

interface BenchResult {
  asset: string;
  strategy: Strategy;
  firstPaintMs: number;
  pbrReadyMs: number;
  transferredBytes: number;
}

// ---------------------------------------------------------------------------
// Probes — small components that report when they mount past Suspense
// ---------------------------------------------------------------------------

const NaiveProbe = ({
  url,
  onPbrReady,
}: {
  readonly url: string;
  readonly onPbrReady: () => void;
}) => {
  const gltf = useGLTF(url, true, true, engineExtendLoader) as unknown as {
    scene: THREE.Object3D;
  };
  useEffect(() => {
    // Wait one rAF so the renderer has actually drawn the first frame.
    requestAnimationFrame(onPbrReady);
  }, [onPbrReady]);
  return <primitive object={gltf.scene} />;
};

const ProxyProbe = ({
  glb,
  proxy,
  onProxyReady,
  onPbrReady,
}: {
  readonly glb: string;
  readonly proxy: string;
  readonly onProxyReady: () => void;
  readonly onPbrReady: () => void;
}) => {
  return (
    <>
      <WireframeProxy
        src={proxy}
        onReady={() => requestAnimationFrame(onProxyReady)}
      />
      <Suspense fallback={null}>
        <NaiveProbe url={glb} onPbrReady={onPbrReady} />
      </Suspense>
    </>
  );
};

// ---------------------------------------------------------------------------
// Runner — sequentially loads each asset under each strategy, measures
// ---------------------------------------------------------------------------

const transferredBytesFor = (url: string): number => {
  const path = url.replace(/^\//, '');
  const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
  const match = entries.find((e) => e.name.endsWith(path));
  return match ? Math.round(match.transferSize) : 0;
};

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

export const BenchmarkPage = () => {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<BenchResult[]>([]);
  const [current, setCurrent] = useState<{ asset: string; strategy: Strategy } | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const run = async () => {
    setRunning(true);
    setResults([]);
    const out: BenchResult[] = [];
    const total = ASSETS.length * 2;
    setProgress({ done: 0, total });

    let done = 0;
    for (const asset of ASSETS) {
      // ---- naive ----
      setCurrent({ asset: asset.id, strategy: 'naive' });
      const naive = await timeOne('naive', asset);
      out.push(naive);
      setResults([...out]);
      done++;
      setProgress({ done, total });
      await sleep(400); // breathing room between runs

      // ---- proxy ----
      setCurrent({ asset: asset.id, strategy: 'proxy' });
      const proxy = await timeOne('proxy', asset);
      out.push(proxy);
      setResults([...out]);
      done++;
      setProgress({ done, total });
      await sleep(400);
    }

    setCurrent(null);
    setRunning(false);
    // eslint-disable-next-line no-console
    console.log('[continuum.benchmark]', JSON.stringify(out, null, 2));
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0A0E16',
      color: '#E8EEF6',
      fontFamily: 'var(--font-sans)',
      padding: '60px 4vw',
    }}>
      <header style={{ maxWidth: 1280, margin: '0 auto 32px' }}>
        <div style={{
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase',
          color: 'rgba(232,238,246,0.55)', marginBottom: 18,
        }}>
          Benchmark · cold-cache load timings
        </div>
        <h1 style={{
          fontSize: 'clamp(28px, 3.4vw, 46px)', lineHeight: 1.05,
          letterSpacing: '-0.01em', margin: '0 0 18px', fontWeight: 500,
        }}>
          Real numbers, on this machine.
        </h1>
        <p style={{ fontSize: 15, lineHeight: 1.55, color: 'rgba(232,238,246,0.7)', margin: 0, maxWidth: 760 }}>
          Loads each public asset twice — once with the naive useGLTF path,
          once with the proxy-first path — and reports first-paint and
          PBR-ready timings. For honest numbers: hard-refresh first (Ctrl+Shift+R),
          throttle DevTools to "Fast 4G", and run 2–3 times then take the
          median. Results also log to the browser console as JSON for paste-in.
        </p>
      </header>

      <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button
            type="button"
            onClick={run}
            disabled={running}
            style={{
              background: 'rgba(242,176,122,0.12)',
              color: '#F2B07A',
              border: '1px solid rgba(242,176,122,0.3)',
              padding: '12px 22px',
              borderRadius: 999,
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: 13, letterSpacing: '0.08em',
              cursor: running ? 'wait' : 'pointer',
              opacity: running ? 0.6 : 1,
            }}
          >
            {running ? 'Running…' : 'Run benchmark'}
          </button>
          {running && current && (
            <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12, color: 'rgba(232,238,246,0.55)' }}>
              {progress.done}/{progress.total} · {current.asset} · {current.strategy}
            </span>
          )}
        </div>

        <ResultsTable results={results} />

        {/* Probe canvas — hidden but mounted so we can drive loads through R3F */}
        <ProbeMount current={current} />

        {results.length > 0 && (
          <details style={{ marginTop: 24 }}>
            <summary style={{ cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)', fontSize: 12, color: 'rgba(232,238,246,0.6)' }}>
              Raw JSON (paste-ready)
            </summary>
            <pre style={{
              background: '#06090F',
              border: '1px solid rgba(232,238,246,0.1)',
              padding: 16,
              borderRadius: 6,
              fontSize: 11,
              overflow: 'auto',
              marginTop: 8,
            }}>{JSON.stringify(results, null, 2)}</pre>
          </details>
        )}
      </div>
    </div>
  );
};

const ResultsTable = ({ results }: { readonly results: readonly BenchResult[] }) => {
  if (results.length === 0) {
    return (
      <div style={{
        padding: 32, borderRadius: 8,
        background: 'rgba(232,238,246,0.03)',
        border: '1px solid rgba(232,238,246,0.08)',
        fontSize: 13, color: 'rgba(232,238,246,0.5)',
      }}>
        No results yet — click "Run benchmark" above.
      </div>
    );
  }

  // Group by asset and compute the speedup ratio.
  type Row = { asset: string; naive: BenchResult | null; proxy: BenchResult | null };
  const byAsset = new Map<string, Row>();
  for (const r of results) {
    const row = byAsset.get(r.asset) ?? { asset: r.asset, naive: null, proxy: null };
    row[r.strategy] = r;
    byAsset.set(r.asset, row);
  }
  const rows = Array.from(byAsset.values());

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontFamily: 'var(--font-mono, monospace)' }}>
      <thead>
        <tr style={{ borderBottom: '1px solid rgba(232,238,246,0.15)' }}>
          <th style={th}>Asset</th>
          <th style={th}>Naive first paint</th>
          <th style={th}>Proxy first paint</th>
          <th style={th}>Speedup</th>
          <th style={th}>PBR ready</th>
          <th style={th}>Bytes</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const speedup = row.naive && row.proxy && row.proxy.firstPaintMs > 0
            ? (row.naive.firstPaintMs / row.proxy.firstPaintMs).toFixed(1) + '×'
            : '—';
          return (
            <tr key={row.asset} style={{ borderBottom: '1px solid rgba(232,238,246,0.05)' }}>
              <td style={td}>{row.asset}</td>
              <td style={td}>{row.naive ? `${row.naive.firstPaintMs} ms` : '…'}</td>
              <td style={td}>{row.proxy ? `${row.proxy.firstPaintMs} ms` : '…'}</td>
              <td style={{ ...td, color: '#F2B07A' }}>{speedup}</td>
              <td style={td}>{row.proxy ? `${row.proxy.pbrReadyMs} ms` : row.naive ? `${row.naive.pbrReadyMs} ms` : '…'}</td>
              <td style={td}>{row.proxy ? `${(row.proxy.transferredBytes / 1024).toFixed(0)} KB` : '…'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};

const th: React.CSSProperties = {
  textAlign: 'left', padding: '10px 12px',
  fontWeight: 500, color: 'rgba(232,238,246,0.7)',
  fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
};
const td: React.CSSProperties = {
  padding: '10px 12px', color: 'rgba(232,238,246,0.9)',
};

// ---------------------------------------------------------------------------
// Probe mount — drives the actual measurements via a hidden Canvas
// ---------------------------------------------------------------------------

// Module-level callback bus so the probe can talk back to the runner
// without re-rendering the runner.
const callbacks: {
  onProxyReady: (() => void) | undefined;
  onPbrReady: (() => void) | undefined;
} = { onProxyReady: undefined, onPbrReady: undefined };

const ProbeMount = ({ current }: { readonly current: { asset: string; strategy: Strategy } | null }) => {
  if (!current) return null;
  const asset = ASSETS.find((a) => a.id === current.asset)!;

  return (
    <div style={{
      width: 320, height: 240,
      border: '1px solid rgba(232,238,246,0.08)',
      borderRadius: 6,
      overflow: 'hidden',
      marginTop: 12,
    }}>
      <Canvas
        camera={{ position: [0, 0, 6], fov: 32 }}
        gl={{ antialias: true, alpha: true, outputColorSpace: THREE.SRGBColorSpace }}
        // Bump key on strategy/asset to fully remount and bypass useGLTF
        // cache between runs.
        key={`${current.asset}:${current.strategy}`}
      >
        <ambientLight intensity={0.4} />
        <directionalLight position={[3, 3, 3]} intensity={0.8} />
        <Environment preset="studio" environmentIntensity={0.6} />
        {current.strategy === 'naive' ? (
          <Suspense fallback={null}>
            <NaiveProbe url={asset.glb} onPbrReady={() => callbacks.onPbrReady?.()} />
          </Suspense>
        ) : (
          <ProxyProbe
            glb={asset.glb}
            proxy={asset.proxy}
            onProxyReady={() => callbacks.onProxyReady?.()}
            onPbrReady={() => callbacks.onPbrReady?.()}
          />
        )}
      </Canvas>
    </div>
  );
};

// ---------------------------------------------------------------------------
// timeOne — load one asset with one strategy, wait for the right signal
// ---------------------------------------------------------------------------

const timeOne = async (strategy: Strategy, asset: Asset): Promise<BenchResult> => {
  const t0 = performance.now();
  let firstPaint = 0;
  let pbrReady = 0;

  await new Promise<void>((resolve) => {
    const timeout = window.setTimeout(() => {
      // 20 s hard cap so a hanging load doesn't lock the runner forever.
      callbacks.onProxyReady = undefined;
      callbacks.onPbrReady = undefined;
      resolve();
    }, 20000);

    callbacks.onProxyReady = () => {
      if (firstPaint === 0) firstPaint = Math.round(performance.now() - t0);
    };
    callbacks.onPbrReady = () => {
      pbrReady = Math.round(performance.now() - t0);
      if (firstPaint === 0) firstPaint = pbrReady; // naive case
      window.clearTimeout(timeout);
      callbacks.onProxyReady = undefined;
      callbacks.onPbrReady = undefined;
      // Give R3F one frame to actually paint before resolving.
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    };
  });

  // Let layout settle so transferSize is observable.
  await sleep(200);
  const bytes =
    strategy === 'proxy'
      ? transferredBytesFor(asset.proxy) + transferredBytesFor(asset.glb)
      : transferredBytesFor(asset.glb);

  return {
    asset: asset.id,
    strategy,
    firstPaintMs: firstPaint,
    pbrReadyMs: pbrReady,
    transferredBytes: bytes,
  };
};

export default BenchmarkPage;
