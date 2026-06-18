/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEEPORDER_API_URL?: string;
  readonly VITE_KDS_DEV_PREVIEW?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
