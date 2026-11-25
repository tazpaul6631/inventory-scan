/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_APP_NAME?: string
  /** `web` | `mobile` — force shell at build time. */
  readonly VITE_APP_SHELL?: string
  /** Production website origin; native opens these outside the WebView. */
  readonly VITE_PUBLIC_WEB_ORIGIN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module 'sql.js/dist/sql-wasm.js' {
  import type initSqlJs from 'sql.js'
  const init: typeof initSqlJs
  export default init
}
