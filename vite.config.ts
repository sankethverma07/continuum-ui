import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

import { continuumProxyPlugin } from './tools/vite-plugin-continuum-proxy';

export default defineConfig({
  plugins: [
    react(),
    // Auto-generate position-only `.proxy.bin` for every `.glb` in
    // public/ at server start + build start. Removes the manual CLI
    // step and makes the `<AutoProgressiveHero src=... proxy />` API
    // truly one-line. See tools/vite-plugin-continuum-proxy.ts.
    continuumProxyPlugin({ emitGzip: true }),
  ],
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
});
