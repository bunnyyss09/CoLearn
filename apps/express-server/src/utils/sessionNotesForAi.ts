import SessionNote from "../models/SessionNote";
import { htmlToPlainTextForSessionNotes } from "./htmlToPlainText";

const MAX_TOTAL_CHARS = 12000;

/**
 * Concatenate recent session notes for AI context (room = session).
 */
export async function getSessionNotesContextForAi(roomId: string): Promise<string> {
  if (!roomId || !String(roomId).trim()) return "";
  const notes = await SessionNote.find({ roomId: String(roomId).trim() })
    .sort({ updatedAt: -1 })
    .limit(24)
    .lean();
  if (!notes.length) return "";

  const parts: string[] = [];
  let total = 0;
  for (const n of notes.reverse()) {
    const plain = htmlToPlainTextForSessionNotes(n.content || "");
    if (!plain.trim()) continue;
    const block = `[${n.noteId.slice(0, 8)}] ${plain.trim()}`;
    if (total + block.length > MAX_TOTAL_CHARS) break;
    parts.push(block);
    total += block.length;
  }
  if (!parts.length) return "";
  return "Session notes (collaborative):\n" + parts.join("\n---\n");
}
