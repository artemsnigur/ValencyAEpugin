/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LICENSE_ENDPOINT?: string;
  readonly VITE_LICENSE_KEY?: string;
  readonly VITE_LICENSE_BYPASS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __APP_VERSION__: string;
