/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional override for API + WebSocket host (e.g. production API domain). */
  readonly VITE_API_HOST?: string;
}
