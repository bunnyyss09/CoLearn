/** Unique per browser tab; sent on WebSocket URL so the server can route to one connection. */
export function createWsClientId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `c-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}
