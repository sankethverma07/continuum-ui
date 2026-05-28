import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// The continuum-proxy plugin pulls in @gltf-transform/* + meshoptimizer
// from the `ingest/` package, which aren't dependencies of the root
// project. Vercel's CI runs `npm install` only at the root and would
// fail to resolve them during a production build.
//
// The proxies are committed to public/ alongside their glbs, so prod
// builds don't NEED to regenerate them — only dev needs the auto-gen
// for the convenience of "drop a glb in public/ and forget."
//
// So: load the plugin lazily and only register it in dev mode.

export default defineConfig(async ({ command }) => {
  const plugins: import('vite').PluginOption[] = [react()];

  if (command === 'serve') {
    try {
      const { continuumProxyPlugin } = await import(
        './tools/vite-plugin-continuum-proxy'
      );
      plugins.push(continuumProxyPlugin({ emitGzip: true }));
    } catch (err) {
      // Plugin's optional. If the ingest deps aren't installed
      // (e.g. fresh clone, npm install not yet run in ingest/),
      // dev mode just skips proxy auto-generation. Committed
      // .proxy.bin files in public/ still work.
      // eslint-disable-next-line no-console
      console.warn(
        '[vite] continuum-proxy plugin not loaded — committed .proxy.bin files will still serve.',
        (err as Error).message,
      );
    }
  }

  return {
    plugins,
    resolve: {
      alias: {
        '@continuum': path.resolve(__dirname, 'src/continuum'),
      },
    },
    assetsInclude: ['**/*.glb', '**/*.ktx2'],
    server: {
      port: 5173,
      host: true,
    },
    build: {
      target: 'es2022',
      sourcemap: true,
    },
  };
});
