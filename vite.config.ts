import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// NOTE: the continuum-proxy plugin (auto-generates .proxy.bin for any
// .glb in public/) is NOT imported here, because it depends on
// @gltf-transform/* + meshoptimizer which live in the `ingest/`
// workspace, not the root. Vercel's CI installs only the root
// dependencies; importing the plugin from this config breaks prod
// builds with ERR_MODULE_NOT_FOUND.
//
// To regenerate proxies locally, run:  npm run gen:proxies
// (defined in package.json — it shells out to the ingest pipeline).
// Committed .proxy.bin files in public/ serve normally regardless.

export default defineConfig({
  plugins: [react()],
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
