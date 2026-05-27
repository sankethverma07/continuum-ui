/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_N8N_HYDRATION_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Minimal typing for navigator.connection (Network Information API).
// The API is still non-standard; we narrow at the call site.
interface NetworkInformation extends EventTarget {
  readonly downlink?: number;
  readonly effectiveType?: '2g' | '3g' | '4g' | 'slow-2g';
  readonly rtt?: number;
  readonly saveData?: boolean;
  onchange?: ((this: NetworkInformation, ev: Event) => unknown) | null;
}

interface Navigator {
  readonly connection?: NetworkInformation;
}
