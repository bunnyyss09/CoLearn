import React, { useCallback, useEffect, useRef, useState } from "react";
import { IP_ADDRESS } from "../Globle";
import { FiPlus } from "react-icons/fi";
import SessionNotesEditor from "./SessionNotesEditor";
import { firstLineFromNoteHtml } from "./sessionNoteText";

export interface SessionNote {
  id: string;
  content: string;
  createdBy: string;
  lastEditedAt: string;
}

interface NotesPanelProps {
  roomId: string | undefined;
  userId: string;
  token: string | null;
  isDark: boolean;
}

const AUTO_SAVE_MS = 2500;

function shortDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

const NotesPanel: React.FC<NotesPanelProps> = ({
  roomId,
  userId,
  token,
  isDark,
}) => {
  const [notes, setNotes] = useState<SessionNote[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedDraft = useRef<string>("");

  const base = `http://${IP_ADDRESS}:3000`;

  const load = useCallback(async () => {
    if (!roomId || !token) return;
    setLoadError(null);
    try {
      const res = await fetch(`${base}/session-notes/${encodeURIComponent(roomId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load notes");
      const data = await res.json();
      const list: SessionNote[] = (data.notes || []).map(
        (n: {
          id: string;
          content: string;
          createdBy: string;
          lastEditedAt: string;
        }) => ({
          id: n.id,
          content: n.content || "",
          createdBy: n.createdBy,
          lastEditedAt: n.lastEditedAt,
        })
      );
      setNotes(list);
      setSelectedId((prev) => {
        if (list.length === 0) return null;
        if (prev && list.some((n) => n.id === prev)) return prev;
        return list[0].id;
      });
    } catch (e) {
      console.error(e);
      setLoadError("Could not load notes.");
    }
  }, [roomId, token, base]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selectedId) {
      setDraft("");
      return;
    }
    const n = notes.find((x) => x.id === selectedId);
    if (n) {
      setDraft(n.content);
      lastSavedDraft.current = n.content;
    }
  }, [selectedId, notes]);

  const flushSave = useCallback(
    async (noteId: string, content: string) => {
      if (!token || !noteId) return;
      setSaving(true);
      try {
        await fetch(`${base}/session-notes/${encodeURIComponent(noteId)}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ content }),
        });
        lastSavedDraft.current = content;
        setNotes((prev) =>
          prev.map((n) =>
            n.id === noteId
              ? { ...n, content, lastEditedAt: new Date().toISOString() }
              : n
          )
        );
      } catch (e) {
        console.error(e);
      } finally {
        setSaving(false);
      }
    },
    [base, token]
  );

  const onDraftChange = (v: string) => {
    setDraft(v);
    if (!selectedId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void flushSave(selectedId, v);
    }, AUTO_SAVE_MS);
  };

  const createNote = async () => {
    if (!roomId || !token) return;
    try {
      const res = await fetch(`${base}/session-notes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ roomId, content: "" }),
      });
      if (!res.ok) throw new Error("create failed");
      const data = await res.json();
      const n = data.note as { id: string; content: string; createdBy: string; lastEditedAt: string };
      const newNote: SessionNote = {
        id: n.id,
        content: n.content || "",
        createdBy: n.createdBy,
        lastEditedAt: n.lastEditedAt,
      };
      setNotes((prev) => [newNote, ...prev]);
      setSelectedId(newNote.id);
      setDraft("");
      lastSavedDraft.current = "";
    } catch (e) {
      console.error(e);
    }
  };

  const openNote = (n: SessionNote) => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (selectedId && draft !== lastSavedDraft.current) {
      void flushSave(selectedId, draft);
    }
    setSelectedId(n.id);
    setDraft(n.content);
    lastSavedDraft.current = n.content;
  };

  const shell = isDark
    ? "bg-zinc-900/40 border border-zinc-700/60"
    : "bg-white/80 border border-stone-200/90 shadow-sm shadow-stone-200/40";

  const listItem = (selected: boolean) =>
    selected
      ? isDark
        ? "bg-violet-950/50 border-l-2 border-l-violet-400 text-zinc-100"
        : "bg-violet-50/90 border-l-[3px] border-l-violet-500 text-stone-900"
      : isDark
        ? "border-l-2 border-l-transparent text-zinc-300 hover:bg-zinc-800/50"
        : "border-l-[3px] border-l-transparent text-stone-700 hover:bg-stone-100/80";

  if (!roomId) {
    return (
      <p className={isDark ? "text-zinc-500 text-sm" : "text-stone-500 text-sm"}>No room.</p>
    );
  }

  return (
    <div className={`flex flex-col h-full min-h-0 rounded-2xl ${shell} overflow-hidden`}>
      <div
        className={`flex items-center justify-between gap-3 px-4 py-3 border-b ${
          isDark ? "border-zinc-700/60" : "border-stone-200/80"
        }`}
      >
        <div>
          <p
            className={`text-[10px] font-semibold uppercase tracking-[0.2em] ${
              isDark ? "text-zinc-500" : "text-stone-400"
            }`}
          >
            Notes
          </p>
          <p className={`text-sm font-medium ${isDark ? "text-zinc-200" : "text-stone-800"}`}>
            Scratch pad for this room
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedId && (
            <span
              className={`text-[11px] tabular-nums ${
                saving
                  ? isDark
                    ? "text-amber-400/90"
                    : "text-amber-700/90"
                  : isDark
                    ? "text-zinc-500"
                    : "text-stone-400"
              }`}
            >
              {saving ? "Saving…" : "Saved"}
            </span>
          )}
          <button
            type="button"
            onClick={createNote}
            disabled={!token}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
              isDark
                ? "bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-40"
                : "bg-stone-900 text-white hover:bg-stone-800 disabled:opacity-40"
            }`}
          >
            <FiPlus size={15} strokeWidth={2.5} />
            New
          </button>
        </div>
      </div>

      {loadError && (
        <p className="px-4 pt-3 text-sm text-red-500/90">{loadError}</p>
      )}

      <div className="flex flex-1 min-h-0">
        <aside
          className={`w-[38%] min-w-[7.5rem] max-w-[220px] flex flex-col border-r ${
            isDark ? "border-zinc-700/50 bg-zinc-950/20" : "border-stone-200/80 bg-stone-50/50"
          }`}
        >
          <div className="overflow-y-auto flex-1 p-2 space-y-0.5">
            {notes.length === 0 && (
              <p className={`px-2 py-3 text-xs leading-relaxed ${isDark ? "text-zinc-500" : "text-stone-500"}`}>
                Nothing here yet — add a note for the group.
              </p>
            )}
            {notes.map((n) => {
              const selected = selectedId === n.id;
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => openNote(n)}
                  className={`w-full text-left rounded-lg px-2.5 py-2.5 transition-colors ${listItem(
                    selected
                  )}`}
                >
                  <span
                    className={`block text-[13px] font-medium leading-snug line-clamp-2 ${
                      selected
                        ? ""
                        : isDark
                          ? "text-zinc-200"
                          : "text-stone-800"
                    }`}
                  >
                    {firstLineFromNoteHtml(n.content)}
                  </span>
                  <span
                    className={`mt-1 flex items-center justify-between gap-1 text-[10px] ${
                      isDark ? "text-zinc-500" : "text-stone-400"
                    }`}
                  >
                    <span>{n.createdBy === userId ? "You" : "Teammate"}</span>
                    {n.lastEditedAt && <span>{shortDate(n.lastEditedAt)}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <div
          className={`flex-1 flex flex-col min-w-0 min-h-0 ${
            isDark ? "bg-zinc-900/30" : "bg-white/60"
          }`}
        >
          {selectedId ? (
            <SessionNotesEditor
              key={selectedId}
              initialHtml={notes.find((n) => n.id === selectedId)?.content ?? ""}
              isDark={isDark}
              editable={Boolean(token)}
              onChange={onDraftChange}
            />
          ) : (
            <div
              className={`flex flex-1 flex-col items-center justify-center gap-1 px-6 text-center ${
                isDark ? "text-zinc-500" : "text-stone-500"
              }`}
            >
              <p className="text-sm font-medium">Pick a note or start a new one</p>
              <p className="text-xs max-w-[14rem] leading-relaxed">
                Your whole group sees the same notes — great for takeaways and links.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NotesPanel;
