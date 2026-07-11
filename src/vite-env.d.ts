/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TMDB_CONFIDENCE_THRESHOLD?: string;
  readonly VITE_TMDB_MULTI_SEARCH_PROXY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
