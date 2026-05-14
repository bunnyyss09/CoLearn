export type RoomMember = { id: string; name: string; clientId?: string };

/** Stable key: one entry per account tab in the room. */
export function roomMemberKey(m: { id: string; clientId?: string }): string {
  const id = String(m.id);
  const cid =
    m.clientId != null && String(m.clientId).length > 0 ? String(m.clientId) : "";
  return `${id}::${cid}`;
}

/**
 * Dedupe and normalize ids from the server so string/number user ids never create
 * duplicate rows for the same person.
 */
export function normalizeConnectedUsers(raw: unknown): RoomMember[] {
  if (!Array.isArray(raw)) return [];
  const map = new Map<string, RoomMember>();
  for (const u of raw) {
    if (u == null || (u as { id?: unknown }).id == null) continue;
    const id = String((u as { id: unknown }).id);
    const rawCid = (u as { clientId?: unknown }).clientId;
    const clientId =
      rawCid != null && String(rawCid).length > 0 ? String(rawCid) : undefined;
    const name =
      typeof (u as { name?: unknown }).name === "string" && (u as { name: string }).name.trim()
        ? (u as { name: string }).name.trim()
        : "User";
    const row: RoomMember = { id, name, clientId };
    const key = roomMemberKey(row);
    if (!map.has(key)) map.set(key, row);
  }
  return [...map.values()];
}

/**
 * Ensure the current tab appears in the list when the server list was missing this clientId.
 */
export function mergeSelfIntoMemberList(
  raw: RoomMember[],
  self: { userId: string; name: string; clientId: string }
): RoomMember[] {
  const list = normalizeConnectedUsers(raw);
  if (!self.userId) return list;
  const selfRow: RoomMember = {
    id: String(self.userId),
    name: self.name || "You",
    clientId: self.clientId || undefined,
  };
  const k = roomMemberKey(selfRow);
  if (list.some((m) => roomMemberKey(m) === k)) return list;
  return [...list, selfRow];
}
