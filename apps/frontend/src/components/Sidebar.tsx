import React, { useEffect, useState } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import { authAtom } from "../atoms/authAtom";
import { userAtom } from "../atoms/userAtom";
import { sidebarOpenAtom } from "../atoms/sidebarAtom";
import { themeAtom } from "../atoms/themeAtom";
import { IP_ADDRESS } from "../Globle";
import { useNavigate } from "react-router-dom";
import { AiOutlineDelete, AiOutlineEdit } from "react-icons/ai";

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
        const res = await fetch(`http://${IP_ADDRESS}:3000/rooms/my`, {
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
    navigate("/");
  };

  const handleRoomClick = (roomId: string, e?: React.MouseEvent) => {
    if (e && (e.target as HTMLElement).closest(".room-actions, .room-edit-input")) {
      return;
    }
    
    // Navigate to dashboard with room selected
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
      const res = await fetch(`http://${IP_ADDRESS}:3000/room/${roomId}`, {
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
      const res = await fetch(`http://${IP_ADDRESS}:3000/room/${roomId}`, {
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
    ? "bg-gray-800 border border-gray-700"
    : "bg-white border border-gray-200";

  return (
    <>
      {deleteConfirmRoomId && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-room-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setDeleteConfirmRoomId(null);
          }}
        >
          <div
            className={`max-w-md w-full p-6 rounded-xl shadow-xl ${panelClass}`}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3
              id="delete-room-title"
              className={`text-lg font-bold mb-3 ${isDark ? "text-white" : "text-gray-900"}`}
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
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isDark
                    ? "bg-gray-700 hover:bg-gray-600 text-gray-200"
                    : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                }`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={performDeleteRoom}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-700 text-white transition-colors"
              >
                Delete room
              </button>
            </div>
          </div>
        </div>
      )}

      {noticeMessage && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
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
          <div
            className={`max-w-md w-full p-6 rounded-xl shadow-xl ${panelClass}`}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3
              id="notice-title"
              className={`text-lg font-bold mb-3 ${isDark ? "text-white" : "text-gray-900"}`}
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
                className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toggle button (mobile) */}
      <button
        className={`fixed top-4 left-4 z-40 ${isDark ? "bg-gray-900 text-white border-gray-700" : "bg-white text-gray-900 border-gray-300"} px-3 py-2 rounded-md border lg:hidden`}
        onClick={() => setIsOpen((v) => !v)}
      >
        {isOpen ? "Close" : "Menu"}
      </button>

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-64 ${isDark ? "bg-gray-900 border-gray-800" : "bg-blue-50/95 backdrop-blur-sm border-blue-200 shadow-xl"} border-r-2 p-4 flex flex-col transform transition-all duration-200
  ${isOpen
            ? "translate-x-0 lg:translate-x-0 lg:static" // Open: Static position (takes up space)
            : "-translate-x-full lg:hidden"              // Closed: Hidden on desktop (removes space)
          }`}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>Account</p>
            <p className={`text-sm font-semibold ${isDark ? "text-white" : "text-gray-900"}`}>
              {auth.user ? auth.user.name : "Guest"}
            </p>
          </div>
          {auth.isAuthenticated && (
            <button
              onClick={handleLogout}
              className="text-xs px-3 py-1 rounded-full bg-red-600 hover:bg-red-700 text-white"
            >
              Logout
            </button>
          )}
        </div>

        {showRooms && (
          <div className="mb-4">
            <h2 className={`text-sm font-semibold mb-2 ${isDark ? "text-gray-200" : "text-gray-800"}`}>
              Your Rooms
            </h2>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {auth.isAuthenticated ? (
                <>
                  {rooms.length > 0 ? (
                    rooms.map((room) => {
                      const isOwner = room.ownerId === auth.user?.id;
                      const title =
                        room.displayName?.trim() || `Room ${room.roomId}`;
                      const isEditing = editingRoomId === room.roomId;
                      return (
                        <div
                          key={room.roomId}
                          className={`relative group w-full text-left px-3 py-2 rounded-lg text-sm transition-all duration-200 ${isDark ? "bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-700" : "bg-white border-gray-300 text-gray-800 hover:bg-blue-100 shadow-sm"} border hover:scale-[1.02] active:scale-[0.98]`}
                        >
                          {isEditing ? (
                            <div className="pr-14">
                              <input
                                type="text"
                                className={`room-edit-input w-full px-2 py-1 rounded border text-sm ${isDark ? "bg-gray-900 border-gray-600 text-white" : "bg-white border-gray-300 text-gray-900"}`}
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
                                className="p-1 rounded hover:bg-blue-600 text-blue-500 hover:text-white"
                                title="Rename room"
                              >
                                <AiOutlineEdit size={16} />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => handleDeleteRoom(room.roomId, e)}
                                className="p-1 rounded hover:bg-red-600 text-red-500 hover:text-white"
                                title="Delete room"
                              >
                                <AiOutlineDelete size={16} />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <p className={`text-xs mb-2 ${isDark ? "text-gray-500" : "text-gray-600"}`}>
                      You are not part of any rooms yet.
                    </p>
                  )}
                  <button
                    onClick={() => navigate("/")}
                    className={`w-full px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${isDark ? "bg-blue-600 hover:bg-blue-500 text-white" : "bg-blue-600 hover:bg-blue-700 text-white shadow-sm"} hover:scale-[1.02] active:scale-[0.98]`}
                  >
                    + Create / Join Room
                  </button>
                </>
              ) : (
                <p className={`text-xs ${isDark ? "text-gray-500" : "text-gray-600"}`}>
                  Sign in to see your rooms.
                </p>
              )}
            </div>
          </div>
        )}

        <div className={`mt-auto pt-4 ${isDark ? "border-gray-700" : "border-blue-200"} border-t-2 flex flex-col gap-2`}>
          <button
            className={`w-full px-3 py-2 rounded-lg transition-all duration-200 border ${isDark ? "bg-gray-800 hover:bg-gray-700 text-gray-200 border-gray-700" : "bg-white hover:bg-blue-100 text-gray-800 border-gray-300 shadow-sm"} text-sm text-left hover:scale-[1.02] active:scale-[0.98]`}
            onClick={onOpenSettings}
          >
            Settings
          </button>
          <button
            className={`w-full px-3 py-2 rounded-lg transition-all duration-200 border ${isDark ? "bg-gray-800 hover:bg-gray-700 text-gray-200 border-gray-700" : "bg-white hover:bg-blue-100 text-gray-800 border-gray-300 shadow-sm"} text-sm text-left hover:scale-[1.02] active:scale-[0.98]`}
            onClick={onOpenAccount}
          >
            Account
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;


