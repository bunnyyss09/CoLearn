/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Dev/LAN: hostname for API (port 3000) + WS (port 5000) when not using full base URLs. */
  readonly VITE_API_HOST?: string;
  /** Production: full REST origin, e.g. https://api.yourdomain.com */
  readonly VITE_API_BASE_URL?: string;
  /** Production: full WS origin without path/query, e.g. wss://ws.yourdomain.com */
  readonly VITE_WS_BASE_URL?: string;
}
