import Room from "../models/Room";

export async function userCanAccessRoom(
  userId: string,
  roomId: string
): Promise<boolean> {
  const room = await Room.findOne({ roomId });
  if (!room) return false;
  if (room.ownerId === userId) return true;
  if (Array.isArray(room.members) && room.members.includes(userId)) return true;
  return false;
}
