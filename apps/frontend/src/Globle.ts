// Host for HTTP API (port 3000) and WebSocket (port 5000).
//
// Vite uses `server.host: true`, so you often open the app as http://<LAN-IP>:5173.
// Hardcoding "localhost" breaks in that case: the browser would call port 3000 on the
// phone/tablet, not your dev machine. Using the page hostname keeps API + WS aligned.
//
// Override with VITE_API_HOST in .env when the API lives on a different host.
const envHost = (import.meta.env.VITE_API_HOST as string | undefined)?.trim();

export const IP_ADDRESS =
  envHost ||
  (typeof window !== "undefined" ? window.location.hostname : "localhost");
