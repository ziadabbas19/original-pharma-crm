/// <reference types="vite/client" />

declare const __APP_VERSION__: string

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_DEV_API_TARGET?: string
  readonly VITE_FCM_ENABLED?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
