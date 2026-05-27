/**
 * vite-plugin-continuum-proxy
 *
 * Scans the project's `public/` directory for `.glb` files that don't yet
 * have a sibling `.proxy.bin`, and generates the missing proxies via the
 * existing ingest pipeline (`@continuum/ingest`). Eliminates the manual
 * CLI step — drop a glb in `public/` and the position-only proxy is
 * built automatically on `vite` and `vite build`.
 *
 * **Behaviour**
 *   - Runs once at server start (`configureServer`) and at build start
 *     (`buildStart`). Cheap to call repeatedly: if `<asset>.proxy.bin`
 *     already exists, the asset is skipped.
 *   - Logs one line per generated proxy (or one summary line if none
 *     needed updating).
 *   - Generation is async and non-blocking; the dev server starts
 *     immediately, proxies catch up as they finish.
 *   - Failures are logged but do NOT crash the build — a missing proxy
 *     just means the engine falls back to the "blank-canvas-until-PhaseA"
 *     path for that asset, which is graceful.
 *
 * **Why a plugin rather than a build script**
 *   - Zero per-project configuration. Drop the plugin in `vite.config.ts`
 *     and forget it.
 *   - Hooks into the same lifecycle as the rest of Vite, so HMR /
 *     production builds / preview all get consistent behaviour.
 *   - The "one-line wrapper" promise of `<AutoProgressiveHero src=...>`
 *     becomes truly true: no CLI, no manual prep, just point at a glb.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';

import { generateProxyMesh } from '../ingest/src/generateProxyMesh';

export interface ContinuumProxyPluginOptions {
  /**
   * Directory (relative to project root) to scan for glb files.
   * Defaults to `public`, matching Vite's static-asset convention.
   */
  readonly publicDir?: string;
  /**
   * When true, also writes `<asset>.proxy.bin.gz` so static hosts that
   * don't auto-gzip still serve compressed. Defaults to true — the gzip
   * variant is tiny extra work and large savings on the wire.
   */
  readonly emitGzip?: boolean;
  /**
   * Force regenerate even when a sibling `.proxy.bin` already exists.
   * Useful when the source glb changed without the proxy being deleted.
   * Defaults to false.
   */
  readonly force?: boolean;
}

const TAG = '[continuum-proxy]';

const exists = async (p: string): Promise<boolean> => {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
};

const listGlbs = async (dir: string): Promise<string[]> => {
  const out: string[] = [];
  const walk = async (d: string) => {
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.glb')) {
        out.push(full);
      }
    }
  };
  await walk(dir);
  return out;
};

const proxyPathFor = (glbPath: string): string =>
  glbPath.replace(/\.glb$/i, '.proxy.bin');

export const continuumProxyPlugin = (
  options: ContinuumProxyPluginOptions = {},
): Plugin => {
  const emitGzip = options.emitGzip ?? true;
  const force = options.force ?? false;
  let resolvedConfig: ResolvedConfig | undefined;
  let ranOnce = false;

  const run = async (): Promise<void> => {
    if (ranOnce) return;
    ranOnce = true;
    const root = resolvedConfig?.root ?? process.cwd();
    const publicDir = path.resolve(root, options.publicDir ?? 'public');

    if (!(await exists(publicDir))) {
      // Nothing to do — no public directory yet. Silent return; not an
      // error, just an empty project state.
      return;
    }

    const glbs = await listGlbs(publicDir);
    if (glbs.length === 0) return;

    const toBuild: string[] = [];
    for (const glb of glbs) {
      const proxy = proxyPathFor(glb);
      if (force || !(await exists(proxy))) toBuild.push(glb);
    }

    if (toBuild.length === 0) {
      // eslint-disable-next-line no-console
      console.log(`${TAG} ${glbs.length} glb(s) found, all proxies present.`);
      return;
    }

    // eslint-disable-next-line no-console
    console.log(`${TAG} generating ${toBuild.length} proxy file(s)…`);
    // Generate in parallel — each glb is independent. Cap concurrency at
    // 3 so we don't blow the Node main thread on a heavy public/ folder.
    const CONCURRENCY = 3;
    let cursor = 0;
    const worker = async (): Promise<void> => {
      while (cursor < toBuild.length) {
        const i = cursor++;
        const glb = toBuild[i]!;
        const outPath = proxyPathFor(glb);
        try {
          const result = await generateProxyMesh(glb, { outPath, emitGzip });
          const kb = Math.round(result.rawBytes / 1024);
          const gz = result.gzipBytes != null ? ` (${Math.round(result.gzipBytes / 1024)} KB gzip)` : '';
          // eslint-disable-next-line no-console
          console.log(
            `${TAG}   ${path.relative(root, outPath)} — ${result.triangleCount.toLocaleString()} tri, ${kb} KB${gz}`,
          );
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn(
            `${TAG}   FAILED ${path.relative(root, glb)}: ${(err as Error).message}`,
          );
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, toBuild.length) }, () => worker()),
    );
  };

  return {
    name: 'continuum-proxy',
    apply: () => true, // run in both serve and build
    configResolved(config) {
      resolvedConfig = config;
    },
    async configureServer() {
      // Fire-and-forget — server starts immediately, proxies catch up.
      run().catch((err) => {
        // eslint-disable-next-line no-console
        console.warn(`${TAG} background generation error:`, err);
      });
    },
    async buildStart() {
      // For production builds, wait so the built artifacts include the
      // proxies before Vite copies public/ to dist.
      await run();
    },
  };
};

export default continuumProxyPlugin;
