import React, { useEffect, useState } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import { authAtom } from "../atoms/authAtom";
import { userAtom } from "../atoms/userAtom";
import { sidebarOpenAtom } from "../atoms/sidebarAtom";
import { themeAtom } from "../atoms/themeAtom";
import { API_BASE_URL } from "../Globle";
import { useNavigate } from "react-router-dom";
import { AiOutlineDelete, AiOutlineEdit } from "react-icons/ai";
import { FiMenu, FiX, FiSettings, FiUser, FiPlus } from "react-icons/fi";
import { motion, AnimatePresence } from "framer-motion";

type Room = {
  roomId: string;
  displayName?: string | null;
  members?: string[];
  ownerId?: string;
};

interface SidebarProps {
  showRooms?: boolean;
  onOpenAccount: () => void;
  onOpenSettings: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  showRooms = true,
  onOpenAccount,
  onOpenSettings,
}) => {
  const [auth, setAuth] = useRecoilState(authAtom);
  const [, setUser] = useRecoilState(userAtom);
  const [isOpen, setIsOpen] = useRecoilState(sidebarOpenAtom);
  const theme = useRecoilValue(themeAtom);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [deleteConfirmRoomId, setDeleteConfirmRoomId] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [noticeTitle, setNoticeTitle] = useState("Notice");
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const navigate = useNavigate();
  const isDark = theme === "dark";

  const modalOpen = deleteConfirmRoomId !== null || noticeMessage !== null;

  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDeleteConfirmRoomId(null);
        setNoticeMessage(null);
        setNoticeTitle("Notice");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalOpen]);

  useEffect(() => {
    const fetchRooms = async () => {
      if (!auth.token || !showRooms) return;
      try {
        const res = await fetch(`${API_BASE_URL}/rooms/my`, {
          headers: { Authorization: `Bearer ${auth.token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        setRooms(data.rooms || []);
      } catch (e) {
        console.error("Failed to fetch rooms:", e);
      }
    };
    fetchRooms();
  }, [auth.token, showRooms]);

  const handleLogout = () => {
    localStorage.removeItem("authToken");
    localStorage.removeItem("user");
    setAuth({ isAuthenticated: false, user: null, token: null });
    setUser({ id: "", name: "", roomId: "" });
    navigate("/start");
  };

  const handleRoomClick = (roomId: string, e?: React.MouseEvent) => {
    if (e && (e.target as HTMLElement).closest(".room-actions, .room-edit-input")) {
      return;
    }
    navigate(`/dashboard/${roomId}`);
  };

  const handleDeleteRoom = (roomId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingRoomId(null);
    setDeleteConfirmRoomId(roomId);
  };

  const beginRenameRoom = (e: React.MouseEvent, room: Room) => {
    e.stopPropagation();
    setEditingRoomId(room.roomId);
    setEditDraft(room.displayName || "");
  };

  const cancelRenameRoom = () => {
    setEditingRoomId(null);
    setEditDraft("");
  };

  const commitRenameRoom = async (roomId: string) => {
    if (editingRoomId !== roomId) return;
    const trimmed = editDraft.trim();
    const prev = (rooms.find((r) => r.roomId === roomId)?.displayName || "").trim();
    if (trimmed === prev) {
      cancelRenameRoom();
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/room/${roomId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth.token}`,
        },
        body: JSON.stringify({ displayName: trimmed }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setNoticeTitle("Could not rename room");
        setNoticeMessage((err as { error?: string }).error || "Failed to rename room.");
        return;
      }
      const data = await res.json();
      const nextName = data.room?.displayName as string | undefined;
      setRooms((prevRooms) =>
        prevRooms.map((r) =>
          r.roomId === roomId ? { ...r, displayName: nextName } : r
        )
      );
      cancelRenameRoom();
    } catch {
      setNoticeTitle("Could not rename room");
      setNoticeMessage("Failed to rename room. Please try again.");
    }
  };

  const performDeleteRoom = async () => {
    const roomId = deleteConfirmRoomId;
    if (!roomId) return;
    setDeleteConfirmRoomId(null);

    try {
      const res = await fetch(`${API_BASE_URL}/room/${roomId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${auth.token}` },
      });

      if (res.ok) {
        setRooms((prev) => prev.filter((r) => r.roomId !== roomId));
      } else {
        const errorData = await res.json().catch(() => ({}));
        setNoticeTitle("Could not delete room");
        setNoticeMessage(
          (errorData as { error?: string }).error || "Failed to delete room."
        );
      }
    } catch (error) {
      console.error("Error deleting room:", error);
      setNoticeTitle("Could not delete room");
      setNoticeMessage("Failed to delete room. Please try again.");
    }
  };

  const panelClass = isDark
    ? "glass-panel rounded-2xl"
    : "glass-panel-light rounded-2xl";

  return (
    <>
      {/* Delete confirm modal */}
      <AnimatePresence>
        {deleteConfirmRoomId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-room-title"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setDeleteConfirmRoomId(null);
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2 }}
              className={`max-w-md w-full p-6 rounded-2xl shadow-xl ${panelClass}`}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <h3
                id="delete-room-title"
                className={`text-lg font-display font-bold mb-3 ${isDark ? "text-white" : "text-gray-900"}`}
              >
                Delete room?
              </h3>
              <p className={`text-sm ${isDark ? "text-gray-300" : "text-gray-600"}`}>
                Are you sure you want to delete{" "}
                <strong>
                  {rooms.find((r) => r.roomId === deleteConfirmRoomId)?.displayName?.trim() ||
                    `Room ${deleteConfirmRoomId}`}
                </strong>
                ? This cannot be undone.
              </p>
              <p className={`text-xs font-mono mt-2 mb-6 ${isDark ? "text-gray-500" : "text-gray-500"}`}>
                ID: {deleteConfirmRoomId}
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmRoomId(null)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                    isDark
                      ? "bg-surface-700 hover:bg-surface-700/80 text-gray-200"
                      : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={performDeleteRoom}
                  className="px-4 py-2 rounded-xl text-sm font-medium bg-red-600 hover:bg-red-700 text-white transition-colors"
                >
                  Delete room
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Notice modal */}
      <AnimatePresence>
        {noticeMessage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="notice-title"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) {
                setNoticeMessage(null);
                setNoticeTitle("Notice");
              }
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2 }}
              className={`max-w-md w-full p-6 rounded-2xl shadow-xl ${panelClass}`}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <h3
                id="notice-title"
                className={`text-lg font-display font-bold mb-3 ${isDark ? "text-white" : "text-gray-900"}`}
              >
                {noticeTitle}
              </h3>
              <p className={`text-sm mb-6 ${isDark ? "text-gray-300" : "text-gray-600"}`}>
                {noticeMessage}
              </p>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setNoticeMessage(null);
                    setNoticeTitle("Notice");
                  }}
                  className="px-4 py-2 rounded-xl text-sm font-medium bg-brand-600 hover:bg-brand-700 text-white transition-colors"
                >
                  OK
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toggle button (mobile) */}
      <button
        className={`fixed top-4 left-4 z-40 p-2.5 rounded-xl border shadow-lg lg:hidden transition-all duration-300 ${isDark ? "glass-panel text-white hover:shadow-glow-neon" : "glass-panel-light text-gray-900 hover:shadow-glow-brand"}`}
        onClick={() => setIsOpen((v) => !v)}
        aria-label={isOpen ? "Close menu" : "Open menu"}
      >
        {isOpen ? <FiX size={20} /> : <FiMenu size={20} />}
      </button>

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-64 border-r p-4 flex flex-col transform transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]
  ${isDark
            ? "bg-surface-900/80 backdrop-blur-2xl border-[rgba(0,240,255,0.08)]"
            : "bg-white/80 backdrop-blur-2xl border-surface-200/60 shadow-xl"
          }
  ${isOpen
            ? "translate-x-0 lg:translate-x-0 lg:static"
            : "-translate-x-full lg:hidden"
          }`}
      >
        {/* Sidebar glow accent */}
        <div className="absolute top-0 right-0 w-px h-full bg-gradient-to-b from-[rgba(0,240,255,0.2)] via-[rgba(191,90,242,0.1)] to-transparent pointer-events-none" />
        {/* Account header with gradient accent */}
        <div className={`flex items-center justify-between mb-5 pb-4 border-b ${isDark ? "border-[rgba(0,240,255,0.08)]" : "border-surface-200/60"}`}>
          <div>
            <p className={`text-xs ${isDark ? "text-gray-500" : "text-gray-500"}`}>Account</p>
            <p className={`text-sm font-semibold ${isDark ? "text-white" : "text-gray-900"}`}>
              {auth.user ? auth.user.name : "Guest"}
            </p>
          </div>
          {auth.isAuthenticated && (
            <button
              onClick={handleLogout}
              className="text-xs px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/20 transition-all duration-300 hover:shadow-[0_0_12px_rgba(239,68,68,0.2)]"
            >
              Logout
            </button>
          )}
        </div>

        {showRooms && (
          <div className="mb-4 flex-1 overflow-hidden flex flex-col">
            <h2 className={`text-xs font-semibold uppercase tracking-wider mb-3 ${isDark ? "text-gray-500" : "text-gray-500"}`}>
              Your Rooms
            </h2>
            <div className="space-y-1.5 flex-1 overflow-y-auto pr-1">
              {auth.isAuthenticated ? (
                <>
                  {rooms.length > 0 ? (
                    rooms.map((room) => {
                      const isOwner = room.ownerId === auth.user?.id;
                      const title =
                        room.displayName?.trim() || `Room ${room.roomId}`;
                      const isEditing = editingRoomId === room.roomId;
                      return (
                        <motion.div
                          layout
                          key={room.roomId}
                          className={`relative group w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all duration-300 border ${isDark ? "bg-surface-800/50 border-[rgba(0,240,255,0.06)] text-gray-200 hover:bg-surface-700/60 hover:border-[rgba(0,240,255,0.15)] hover:shadow-[0_0_15px_rgba(0,240,255,0.05)]" : "bg-white/60 border-surface-200/60 text-gray-800 hover:bg-brand-50/60 hover:border-brand-200 shadow-sm"}`}
                        >
                          {isEditing ? (
                            <div className="pr-14">
                              <input
                                type="text"
                                className={`room-edit-input w-full px-2 py-1 rounded-lg border text-sm ${isDark ? "bg-surface-900 border-surface-700 text-white" : "bg-white border-gray-300 text-gray-900"}`}
                                maxLength={80}
                                value={editDraft}
                                autoFocus
                                onChange={(e) => setEditDraft(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    void commitRenameRoom(room.roomId);
                                  }
                                  if (e.key === "Escape") {
                                    e.preventDefault();
                                    cancelRenameRoom();
                                  }
                                }}
                                onBlur={() => void commitRenameRoom(room.roomId)}
                              />
                              <p className={`text-xs font-mono mt-1 truncate ${isDark ? "text-gray-500" : "text-gray-500"}`}>
                                {room.roomId}
                              </p>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => handleRoomClick(room.roomId, e)}
                              className="w-full text-left pr-14"
                            >
                              <p className="font-semibold truncate" title={title}>
                                {title}
                              </p>
                              <p className={`text-xs font-mono truncate ${isDark ? "text-gray-500" : "text-gray-500"}`}>
                                {room.roomId}
                              </p>
                              <p className={`text-xs truncate ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                                Members: {room.members?.length ?? 1}
                              </p>
                            </button>
                          )}
                          {isOwner && !isEditing && (
                            <div className="room-actions absolute top-2 right-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                type="button"
                                onClick={(e) => beginRenameRoom(e, room)}
                                className="p-1.5 rounded-lg hover:bg-brand-500/20 text-brand-400 hover:text-brand-300 transition-colors"
                                title="Rename room"
                              >
                                <AiOutlineEdit size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => handleDeleteRoom(room.roomId, e)}
                                className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors"
                                title="Delete room"
                              >
                                <AiOutlineDelete size={14} />
                              </button>
                            </div>
                          )}
                        </motion.div>
                      );
                    })
                  ) : (
                    <p className={`text-xs mb-2 ${isDark ? "text-gray-500" : "text-gray-500"}`}>
                      You are not part of any rooms yet.
                    </p>
                  )}
                  <motion.button
                    whileHover={{ scale: 1.02, y: -1 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => navigate("/start")}
                    className="w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 bg-gradient-to-r from-[rgba(0,240,255,0.15)] to-[rgba(191,90,242,0.15)] hover:from-[rgba(0,240,255,0.25)] hover:to-[rgba(191,90,242,0.25)] text-white border border-[rgba(0,240,255,0.2)] hover:border-[rgba(0,240,255,0.4)] shadow-lg hover:shadow-glow-neon flex items-center justify-center gap-2 backdrop-blur-sm"
                  >
                    <FiPlus size={16} />
                    Create / Join Room
                  </motion.button>
                </>
              ) : (
                <p className={`text-xs ${isDark ? "text-gray-500" : "text-gray-600"}`}>
                  Sign in to see your rooms.
                </p>
              )}
            </div>
          </div>
        )}

        <div className={`mt-auto pt-4 ${isDark ? "border-[rgba(0,240,255,0.08)]" : "border-surface-200/60"} border-t flex flex-col gap-2`}>
          <button
            className={`w-full px-3 py-2.5 rounded-xl transition-all duration-300 border ${isDark ? "bg-surface-800/40 hover:bg-surface-700/50 text-gray-300 border-[rgba(0,240,255,0.06)] hover:border-[rgba(0,240,255,0.15)] hover:shadow-[0_0_10px_rgba(0,240,255,0.05)]" : "bg-white/40 hover:bg-brand-50/60 text-gray-700 border-surface-200/60"} text-sm text-left flex items-center gap-3`}
            onClick={onOpenSettings}
          >
            <FiSettings size={16} className="text-[#00f0ff]" />
            Settings
          </button>
          <button
            className={`w-full px-3 py-2.5 rounded-xl transition-all duration-300 border ${isDark ? "bg-surface-800/40 hover:bg-surface-700/50 text-gray-300 border-[rgba(0,240,255,0.06)] hover:border-[rgba(191,90,242,0.15)] hover:shadow-[0_0_10px_rgba(191,90,242,0.05)]" : "bg-white/40 hover:bg-brand-50/60 text-gray-700 border-surface-200/60"} text-sm text-left flex items-center gap-3`}
            onClick={onOpenAccount}
          >
            <FiUser size={16} className="text-[#bf5af2]" />
            Account
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
