import React from 'react';
import ReactDOM from 'react-dom/client';
import { useGLTF } from '@react-three/drei';
import { App } from './App';
import { DRACO_DECODER_PATH } from './continuum/utils/configureGLTFLoader';
import './styles/globals.css';

// Tell drei's cached useGLTF loader pool where the Draco decoder lives.
// This covers KHR_draco_mesh_compression for every catalog asset loaded
// via useGLTF(). KTX2 + Meshopt require an extendLoader callback per
// useGLTF call site (see engineExtendLoader in configureGLTFLoader.ts).
useGLTF.setDecoderPath(DRACO_DECODER_PATH);

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root missing from index.html');

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
