import ChatMessage from "../models/Chat";
import AiMessage from "../models/AiMessage";
import User from "../models/User";

export type RoomActivityAggregate = {
  idToName: Map<string, string>;
  chatByUser: Map<string, number>;
  aiByUser: Map<string, number>;
  totalChatMessages: number;
  totalAiUserMessages: number;
  lastActivityAt: Date | null;
  /** True if any room member has at least one weighted chat/AI activity. */
  anyMemberActivity: boolean;
};

/**
 * Per-member chat and AI tutor question counts for a room, plus activity timestamps.
 * Used by dashboard stats and teaching insights.
 */
export async function aggregateRoomMemberActivity(room: {
  chatId: string;
  roomId: string;
  members: string[];
}): Promise<RoomActivityAggregate> {
  const memberUsers = await User.find({ _id: { $in: room.members } })
    .select("_id name")
    .lean();

  const idToName = new Map<string, string>(
    memberUsers.map((u) => [String(u._id), u.name || String(u._id)])
  );

  const lowerNameToId = new Map<string, string>();
  for (const u of memberUsers) {
    const n = (u.name || "").trim().toLowerCase();
    if (n) lowerNameToId.set(n, String(u._id));
  }

  const chatAgg = await ChatMessage.aggregate([
    { $match: { chatId: room.chatId } },
    { $group: { _id: "$userId", count: { $sum: 1 } } },
  ]);
  const chatByUser = new Map<string, number>();
  for (const row of chatAgg) {
    if (row._id) chatByUser.set(String(row._id), row.count);
  }

  const aiUserMsgs = await AiMessage.find({
    roomId: room.roomId,
    sender: "user",
  })
    .select("userId userName createdAt")
    .lean();

  const aiByUser = new Map<string, number>();
  for (const m of aiUserMsgs) {
    let uid: string | null = m.userId ? String(m.userId) : null;
    if (!uid && m.userName) {
      uid = lowerNameToId.get(m.userName.trim().toLowerCase()) || null;
    }
    if (uid && room.members.includes(uid)) {
      aiByUser.set(uid, (aiByUser.get(uid) || 0) + 1);
    }
  }

  const lastChat = await ChatMessage.findOne({ chatId: room.chatId })
    .sort({ timestamp: -1 })
    .select("timestamp")
    .lean();
  const lastAi = await AiMessage.findOne({ roomId: room.roomId })
    .sort({ createdAt: -1 })
    .select("createdAt")
    .lean();

  let lastActivityAt: Date | null = null;
  if (lastChat?.timestamp && lastAi?.createdAt) {
    lastActivityAt =
      new Date(lastChat.timestamp) > new Date(lastAi.createdAt)
        ? new Date(lastChat.timestamp)
        : new Date(lastAi.createdAt);
  } else if (lastChat?.timestamp) {
    lastActivityAt = new Date(lastChat.timestamp);
  } else if (lastAi?.createdAt) {
    lastActivityAt = new Date(lastAi.createdAt);
  }

  const CHAT_W = 1;
  const AI_W = 2;
  const scores = room.members.map((mid) => {
    const c = chatByUser.get(String(mid)) || 0;
    const a = aiByUser.get(String(mid)) || 0;
    return c * CHAT_W + a * AI_W;
  });
  const anyMemberActivity = scores.some((s) => s > 0);

  const totalChatMessages = chatAgg.reduce((s, r) => s + r.count, 0);

  return {
    idToName,
    chatByUser,
    aiByUser,
    totalChatMessages,
    totalAiUserMessages: aiUserMsgs.length,
    lastActivityAt,
    anyMemberActivity,
  };
}
