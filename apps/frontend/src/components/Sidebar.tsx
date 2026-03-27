import React, { useEffect, useState } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import { authAtom } from "../atoms/authAtom";
import { userAtom } from "../atoms/userAtom";
import { sidebarOpenAtom } from "../atoms/sidebarAtom";
import { themeAtom } from "../atoms/themeAtom";
import { IP_ADDRESS } from "../Globle";
import { useNavigate } from "react-router-dom";
import { AiOutlineDelete } from "react-icons/ai";
import AppDialog from "./AppDialog";

type Room = { roomId: string; members?: string[]; ownerId?: string };

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
  const [pendingDeleteRoomId, setPendingDeleteRoomId] = useState<string | null>(null);
  const [errorAlertMessage, setErrorAlertMessage] = useState<string | null>(null);
  const navigate = useNavigate();
  const isDark = theme === "dark";

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
    // Prevent delete action if clicking delete button
    if (e && (e.target as HTMLElement).closest('.delete-button')) {
      return;
    }
    
    // Navigate to dashboard with room selected
    navigate(`/dashboard/${roomId}`);
  };

  const handleDeleteRoomClick = (roomId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPendingDeleteRoomId(roomId);
  };

  const performDeleteRoom = async () => {
    const roomId = pendingDeleteRoomId;
    if (!roomId || !auth.token) {
      setPendingDeleteRoomId(null);
      return;
    }
    setPendingDeleteRoomId(null);

    try {
      const res = await fetch(`http://${IP_ADDRESS}:3000/room/${roomId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${auth.token}` },
      });

      if (res.ok) {
        setRooms((prev) => prev.filter((r) => r.roomId !== roomId));
      } else {
        let message = "Failed to delete room";
        try {
          const errorData = await res.json();
          if (errorData?.error) message = errorData.error;
        } catch {
          /* non-JSON body */
        }
        setErrorAlertMessage(message);
      }
    } catch (error) {
      console.error("Error deleting room:", error);
      setErrorAlertMessage("Failed to delete room. Please try again.");
    }
  };

  return (
    <>
      <AppDialog
        open={pendingDeleteRoomId !== null}
        onClose={() => setPendingDeleteRoomId(null)}
        mode="confirm"
        title="Delete this room?"
        message={
          pendingDeleteRoomId
            ? `Are you sure you want to delete room ${pendingDeleteRoomId}? This action cannot be undone.`
            : ""
        }
        tone="danger"
        cancelLabel="Cancel"
        confirmLabel="Delete room"
        onConfirm={performDeleteRoom}
      />
      <AppDialog
        open={errorAlertMessage !== null}
        onClose={() => setErrorAlertMessage(null)}
        mode="alert"
        title="Something went wrong"
        message={errorAlertMessage ?? ""}
        confirmLabel="OK"
      />

      {/* Toggle button (mobile) */}
      <button
        className={`fixed top-4 left-4 z-40 lg:hidden rounded-xl border px-3.5 py-2 text-sm font-medium shadow-lg backdrop-blur-md transition-all duration-300 hover:scale-105 active:scale-95 ${
          isDark
            ? "border-white/10 bg-zinc-900/90 text-white shadow-black/40"
            : "border-slate-200/80 bg-white/90 text-slate-900 shadow-panel"
        }`}
        onClick={() => setIsOpen((v) => !v)}
      >
        {isOpen ? "Close" : "Menu"}
      </button>

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-72 flex-col border-r p-5 backdrop-blur-xl transition-all duration-500 ease-out motion-safe:transition-transform ${
          isDark
            ? "border-white/10 bg-zinc-950/85 shadow-panel-dark"
            : "border-slate-200/60 bg-white/75 shadow-panel"
        }
  ${
            isOpen
              ? "translate-x-0 lg:static lg:translate-x-0"
              : "-translate-x-full lg:hidden"
          }`}
      >
        <div className="mb-6 flex items-center justify-between">
          <div className="animate-fade-up" style={{ animationDelay: "40ms" }}>
            <p className={`text-[11px] font-semibold uppercase tracking-wider ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
              Signed in
            </p>
            <p className={`mt-0.5 text-sm font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
              {auth.user ? auth.user.name : "Guest"}
            </p>
          </div>
          {auth.isAuthenticated && (
            <button
              onClick={handleLogout}
              className="rounded-full bg-gradient-to-r from-rose-600 to-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-md shadow-rose-500/20 transition-all duration-300 hover:shadow-lg hover:shadow-rose-500/30"
            >
              Logout
            </button>
          )}
        </div>

        {showRooms && (
          <div className="mb-4 flex-1 overflow-hidden">
            <h2 className={`mb-3 text-xs font-bold uppercase tracking-wider ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
              Your rooms
            </h2>
            <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {auth.isAuthenticated ? (
                <>
                  {rooms.length > 0 ? (
                    rooms.map((room, i) => {
                      const isOwner = room.ownerId === auth.user?.id;
                      return (
                        <div
                          key={room.roomId}
                          className={`group relative w-full rounded-xl border text-left text-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md ${
                            isDark
                              ? "border-white/10 bg-white/[0.04] text-zinc-200 hover:border-violet-500/30"
                              : "border-slate-200/80 bg-white/80 text-slate-900 shadow-sm hover:border-violet-300"
                          } animate-fade-up`}
                          style={{ animationDelay: `${80 + i * 45}ms` }}
                        >
                          <button onClick={(e) => handleRoomClick(room.roomId, e)} className="w-full px-3 py-2.5 text-left">
                            <p className="font-semibold">Room {room.roomId}</p>
                            <p className={`truncate text-xs ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
                              {room.members?.length ?? 1} member{(room.members?.length ?? 1) !== 1 ? "s" : ""}
                            </p>
                          </button>
                          {isOwner && (
                            <button
                              onClick={(e) => handleDeleteRoomClick(room.roomId, e)}
                              className="delete-button absolute right-2 top-2 rounded-lg p-1.5 text-rose-500 opacity-0 transition-all duration-200 hover:bg-rose-500 hover:text-white group-hover:opacity-100"
                              title="Delete room"
                            >
                              <AiOutlineDelete size={16} />
                            </button>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <p className={`mb-2 text-xs ${isDark ? "text-zinc-500" : "text-slate-500"}`}>No rooms yet — create one to start.</p>
                  )}
                  <button onClick={() => navigate("/")} className="colearn-btn-primary mt-2 w-full py-2.5 text-sm">
                    + Create / join room
                  </button>
                </>
              ) : (
                <p className={`text-xs ${isDark ? "text-zinc-500" : "text-slate-500"}`}>Sign in to list your rooms.</p>
              )}
            </div>
          </div>
        )}

        <div
          className={`mt-auto flex flex-col gap-2 border-t pt-4 ${isDark ? "border-white/10" : "border-slate-200/80"}`}
        >
          <button
            className={`colearn-btn-secondary w-full px-3 py-2.5 text-left text-sm ${
              isDark ? "border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10" : "border-slate-200 bg-white text-slate-800 hover:border-violet-200"
            }`}
            onClick={onOpenSettings}
          >
            Settings
          </button>
          <button
            className={`colearn-btn-secondary w-full px-3 py-2.5 text-left text-sm ${
              isDark ? "border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10" : "border-slate-200 bg-white text-slate-800 hover:border-violet-200"
            }`}
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


