function trimTrailingSlashes(s: string): string {
  return s.replace(/\/+$/, "");
}

// Optional full REST API origin (no path). Use in production when API is on another
// host than the Vercel frontend, e.g. https://api.example.com
const apiBaseFromEnv = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();

// Optional WebSocket origin without query string, e.g. wss://ws.example.com
const wsBaseFromEnv = (import.meta.env.VITE_WS_BASE_URL as string | undefined)?.trim();

// Dev / LAN: hostname only; Express 3000 + WS 5000 on same host.
const envHost = (import.meta.env.VITE_API_HOST as string | undefined)?.trim();

export const IP_ADDRESS =
  envHost ||
  (typeof window !== "undefined" ? window.location.hostname : "localhost");

const defaultHttpBase = `http://${IP_ADDRESS}:3000`;
const defaultWsBase = `ws://${IP_ADDRESS}:5000`;

/** Full base URL for REST API (no trailing slash). */
export const API_BASE_URL = trimTrailingSlashes(apiBaseFromEnv || defaultHttpBase);

/** WebSocket URL without ?query (scheme + host [+ port]). */
export const WS_BASE_URL = trimTrailingSlashes(wsBaseFromEnv || defaultWsBase);
