import React, { useState, useEffect, useRef } from "react";
import MonacoEditor from '@monaco-editor/react';
import { userAtom } from "../atoms/userAtom";
import { authAtom } from "../atoms/authAtom";
import { useRecoilState, useRecoilValue } from "recoil";
import { AiOutlineLoading3Quarters, AiOutlineSend, AiOutlineCopy, AiOutlineCheck } from "react-icons/ai"; // Import icons
import { FiMessageCircle, FiUsers, FiHash, FiBox, FiChevronsLeft, FiChevronsRight } from "react-icons/fi";
import { socketAtom } from "../atoms/socketAtom";
import { useNavigate, useParams } from "react-router-dom";
import { connectedUsersAtom } from "../atoms/connectedUsersAtom";
import { IP_ADDRESS } from "../Globle";
import Chat from "../components/Chat";
import Sidebar from "../components/Sidebar";
import AccountModal from "../components/AccountModal";
import SettingsModal from "../components/SettingsModal";
import { themeAtom } from "../atoms/themeAtom";
import { sidebarOpenAtom } from "../atoms/sidebarAtom";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { lumenWorkspace } from "../workspace/lumenTheme";

// Debounce delay for code sync (ms) - prevents flooding WebSocket on fast typing
const CODE_SYNC_DEBOUNCE_MS = 150;

// AI Message type
type AiMessage = {
  sender: 'user' | 'ai';
  text: string;
  // Optional display name for the user who asked the question.
  // Present when sender === 'user'.
  userName?: string;
};

// Type for an Input/Output session
type IOSession = {
  id: number;
  input: string;
  output: string[];
};

const CodeEditor: React.FC = () => {
  const [code, setCode] = useState<any>("// Write your code here...");
  const [language, setLanguage] = useState("javascript");
  const [socket, setSocket] = useRecoilState<WebSocket | null>(socketAtom);
  const [isLoading, setIsLoading] = useState(false); // Loading state for code submission
  const [currentButtonState, setCurrentButtonState] = useState("Run Code");
  const [user, setUser] = useRecoilState(userAtom);
  const auth = useRecoilValue(authAtom);
  const navigate = useNavigate();
  const [isCopied, setIsCopied] = useState(false);
  const theme = useRecoilValue(themeAtom);
  const isDark = theme === "dark";
  const lm = lumenWorkspace(isDark);
  const [isSidebarOpen, setIsSidebarOpen] = useRecoilState(sidebarOpenAtom);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // --- I/O Tabs State ---
  const [ioSessions, setIoSessions] = useState<IOSession[]>([{ id: 1, input: "", output: [] }]);
  const [activeIoSessionId, setActiveIoSessionId] = useState<number>(1);
  const activeSession = ioSessions.find(s => s.id === activeIoSessionId) || ioSessions[0];

  // I/O panel layout & behavior
  const [isIoCollapsed, setIsIoCollapsed] = useState(false);
  const [ioPanelHeight, setIoPanelHeight] = useState(200);
  const ioDragInfoRef = useRef<{ startY: number; startHeight: number } | null>(null);

  // Refs to prevent stale closures in WebSocket handlers
  const codeRef = useRef(code);
  const languageRef = useRef(language);
  const currentButtonStateRef = useRef(currentButtonState);
  const isLoadingRef = useRef(isLoading);
  const ioSessionsRef = useRef(ioSessions);
  const activeIoSessionIdRef = useRef(activeIoSessionId);
  
  // Debounce timer ref for code sync
  const codeSyncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Flag to prevent echo: when we receive code from server, don't re-send it
  const isRemoteUpdateRef = useRef(false);


  // AI Assistant State
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const aiChatEndRef = useRef<HTMLDivElement>(null);


  // multiplayer state
  const [connectedUsers, setConnectedUsers] = useRecoilState<any[]>(connectedUsersAtom);
  const params = useParams();

  // Chat state
  const [chatId, setChatId] = useState<string>("");

  // Learning room metadata (if this room has been upgraded to a module)
  const [_isLearningRoom, setIsLearningRoom] = useState<boolean>(false);
  const [_learningModuleId, setLearningModuleId] = useState<string | null>(null);

  // Sidebar panel state
  const [activePanel, setActivePanel] = useState<"ai" | "chat" | "info" | null>("ai");

  // Keep refs in sync with state to avoid stale closures in callbacks
  useEffect(() => { codeRef.current = code; }, [code]);
  useEffect(() => { languageRef.current = language; }, [language]);
  useEffect(() => { currentButtonStateRef.current = currentButtonState; }, [currentButtonState]);
  useEffect(() => { isLoadingRef.current = isLoading; }, [isLoading]);
  useEffect(() => { ioSessionsRef.current = ioSessions; }, [ioSessions]);
  useEffect(() => { activeIoSessionIdRef.current = activeIoSessionId; }, [activeIoSessionId]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (codeSyncTimeoutRef.current) {
        clearTimeout(codeSyncTimeoutRef.current);
      }
    };
  }, []);

  // Sidebar closed by default on non-landing pages
  useEffect(() => {
    setIsSidebarOpen(false);
  }, []);

  // Handle Ctrl+Enter or Ctrl+' to run code
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && (event.key === 'Enter' || event.key === "'")) {
        event.preventDefault();
        if (!isLoading) {
          handleSubmit();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isLoading, code, activeSession]); // Rerun if dependencies change


  // Fetch room data to get chatId and load room data
  useEffect(() => {
    const effectiveRoomId = user.roomId || params.roomId;
    if (!effectiveRoomId) return;

    const fetchRoomData = async () => {
      try {
        // Get room info for chatId and learning metadata
        const roomResponse = await fetch(`http://${IP_ADDRESS}:3000/room/${effectiveRoomId}`);
        if (roomResponse.ok) {
          const roomData = await roomResponse.json();
          if (roomData.room && roomData.room.chatId) {
            setChatId(roomData.room.chatId);
          }
          if (roomData.room) {
            setIsLearningRoom(!!roomData.room.isLearningRoom);
            setLearningModuleId(roomData.room.moduleId || null);
          }
        }

        // Get all room data (code, language, AI messages)
        // Load from database if WebSocket hasn't synced yet (initial page load)
        const dataResponse = await fetch(`http://${IP_ADDRESS}:3000/room/${effectiveRoomId}/data`);
        if (dataResponse.ok) {
          const data = await dataResponse.json();
          
          // Load code and language from database (will be overridden by WebSocket sync if connected)
          if (data.code !== undefined) {
            setCode(data.code);
          }
          if (data.language) {
            setLanguage(data.language);
          }
          
          // Always load AI messages from database (they're not synced via WebSocket on initial load)
          if (data.aiMessages && Array.isArray(data.aiMessages)) {
            setAiMessages(data.aiMessages);
          }
        }
      } catch (error) {
        console.error("Error fetching room data:", error);
      }
    };

    fetchRoomData();
  }, [user.roomId, params.roomId, IP_ADDRESS]);

  // WebSocket connection logic
  useEffect(() => {
    const effectiveRoomId = user.roomId || params.roomId;
    
    // If no socket but we have a roomId in URL, create a socket here.
    // This prevents "Back to editor" from bouncing to the landing page.
    if ((!socket || socket.readyState === WebSocket.CLOSED) && effectiveRoomId) {
      const authUser = auth.user || (() => {
        try {
          const stored = localStorage.getItem("user");
          return stored ? JSON.parse(stored) : null;
        } catch {
          return null;
        }
      })();

      const userIdForWs = user.id || authUser?.id;
      const userNameForWs = user.name || authUser?.name || "User";

      if (userIdForWs) {
        // Ensure user atom has the roomId so downstream code uses it consistently
        if (!user.roomId && params.roomId) {
          setUser((prev) => ({ ...prev, roomId: params.roomId as string }));
        }

        const ws = new WebSocket(
          `ws://${IP_ADDRESS}:5000?roomId=${effectiveRoomId}&id=${userIdForWs}&name=${encodeURIComponent(
            userNameForWs
          )}`
        );
        
        ws.onopen = () => {
          // Once connected, request initial data
          if (user.id) {
            ws.send(JSON.stringify({ type: "requestToGetUsers", userId: user.id }));
            ws.send(JSON.stringify({ type: "requestForAllData" }));
          }
        };
        
        ws.onclose = () => {
          console.log("Connection closed");
          setUser({ id: "", name: "", roomId: "" });
          setSocket(null);
        };
        
        setSocket(ws);
        return;
      }
    }
    
    // If we have a socket but user.roomId doesn't match params.roomId, we need to reconnect
    if (socket && params.roomId && user.roomId !== params.roomId) {
      // Close existing socket and redirect to join the new room
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
      setSocket(null);
      return;
    }
    
    // Only send messages if socket is OPEN (not CONNECTING or CLOSED)
    if (socket && socket.readyState === WebSocket.OPEN) {
      if (user.id) {
        socket.send(JSON.stringify({ type: "requestToGetUsers", userId: user.id }));
        socket.send(JSON.stringify({ type: "requestForAllData" }));
      }
      socket.onclose = () => {
        console.log("Connection closed");
        setUser({ id: "", name: "", roomId: "" });
        setSocket(null);
      }
    }
    
    return () => {
      // Clean up socket on unmount - handle both OPEN and CONNECTING states
      if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        socket.close();
      }
    };
  }, [socket, params.roomId, user.roomId, user.id, auth.user, setSocket, setUser]);


  useEffect(() => {
    if (socket) {
      socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "users") setConnectedUsers(data.users);
        if (data.type === "code") {
          // Set flag to prevent echo when we receive remote code
          isRemoteUpdateRef.current = true;
          setCode(data.code);
          // Clear the flag after a short delay to allow state to settle
          setTimeout(() => { isRemoteUpdateRef.current = false; }, 50);
        }
        if (data.type === "language") setLanguage(data.language);
        if (data.type === "submitBtnStatus") {
          setCurrentButtonState(data.value);
          setIsLoading(data.isLoading);
        }
        // ... other message types

        // Handle I/O session updates
        if (data.type === "ioSessions") setIoSessions(data.sessions);
        if (data.type === "activeIoSession") setActiveIoSessionId(data.sessionId);
        if (data.type === "output") {
          console.log(data)
          setIoSessions(prev => prev.map(s => s.id === data.sessionId ? { ...s, output: [...s.output, data.message] } : s));
          handleButtonStatus("Run Code", false);
        }

        if (data.type === "requestForAllData" && socket.readyState === WebSocket.OPEN) {
          // Use refs to get current values (avoids stale closure)
          socket.send(JSON.stringify({
            type: "allData",
            code: codeRef.current,
            language: languageRef.current,
            currentButtonState: currentButtonStateRef.current,
            isLoading: isLoadingRef.current,
            ioSessions: ioSessionsRef.current,
            activeIoSessionId: activeIoSessionIdRef.current,
            userId: data.userId
          }));
        }

        if (data.type === "allData") {
          isRemoteUpdateRef.current = true;
          setCode(data.code);
          setLanguage(data.language);
          setCurrentButtonState(data.currentButtonState);
          setIsLoading(data.isLoading);
          setIoSessions(data.ioSessions || [{ id: 1, input: "", output: [] }]); // fallback for older clients
          setActiveIoSessionId(data.activeIoSessionId || 1);
          setTimeout(() => { isRemoteUpdateRef.current = false; }, 50);
        }

        // Shared AI assistant messages: whenever any user in the room
        // sends an AI query, the sender broadcasts both their question
        // and the AI's reply via WebSocket so everyone sees the same
        // AI conversation in real time.
        if (data.type === "aiMessages" && Array.isArray(data.messages)) {
          setAiMessages(prev => [...prev, ...data.messages]);
        // When a learning module is started by someone, move everyone to the
        // learning room view for this room.
        }
        if (data.type === "enterLearningModule") {
          const effectiveRoomId = user.roomId || params.roomId;
          if (effectiveRoomId) {
            navigate(`/learn/${effectiveRoomId}`);
          }
        }
      };
    }
  }, [socket, user.roomId, params.roomId, navigate, setConnectedUsers]);

  useEffect(() => {
    aiChatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [aiMessages]);

  const startIoResizeDrag = (event: React.MouseEvent<HTMLDivElement>) => {
    if (isIoCollapsed) return;
    ioDragInfoRef.current = {
      startY: event.clientY,
      startHeight: ioPanelHeight,
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!ioDragInfoRef.current) return;
      const delta = ioDragInfoRef.current.startY - e.clientY;
      let newHeight = ioDragInfoRef.current.startHeight + delta;
      newHeight = Math.max(120, Math.min(newHeight, 400));
      setIoPanelHeight(newHeight);
    };

    const handleMouseUp = () => {
      ioDragInfoRef.current = null;
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };


  const handleSubmit = async () => {
    handleButtonStatus("Submitting...", true);
    // Clear output for the current tab only
    setIoSessions(prev => prev.map(s => s.id === activeIoSessionId ? { ...s, output: [] } : s));

    const submission = {
      code,
      language,
      roomId: user.roomId,
      input: activeSession.input,
      sessionId: activeIoSessionId // Send session ID with submission
    };

    try {
      const res = await fetch(`http://${IP_ADDRESS}:3000/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submission),
      });

      handleButtonStatus("Compiling...", true);

      if (!res.ok) {
        setIoSessions(prev => prev.map(s => s.id === activeIoSessionId ? { ...s, output: [...s.output, "Error submitting code. Please try again."] } : s));
        handleButtonStatus("Run Code", false);
      }
    } catch (error) {
      console.error("Submission failed:", error);
      setIoSessions(prev => prev.map(s => s.id === activeIoSessionId ? { ...s, output: [...s.output, "Failed to connect to the execution server."] } : s));
      handleButtonStatus("Run Code", false);
    }
  };

  const handlePanelToggle = (panel: "ai" | "chat" | "info") => {
    setActivePanel(prev => (prev === panel ? null : panel));
  };

  const renderIoPanelRight = () => (
    <div className={`flex h-full min-h-0 flex-col border-lumen-line ${lm.rail}`}>
      <div className="border-b border-lumen-line px-3 py-2 font-display text-[10px] font-bold uppercase tracking-[0.2em] text-lumen-signal">
        I/O console
      </div>
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
        <div>
          <p className={`mb-1 text-[10px] font-semibold uppercase tracking-wider ${lm.muted}`}>stdin</p>
          <textarea
            value={activeSession.input}
            onChange={handleInputChange}
            placeholder="stdin…"
            className={`h-28 w-full resize-none rounded-md border p-2 text-xs ${lm.input}`}
          />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <p className={`text-[10px] font-semibold uppercase tracking-wider ${lm.muted}`}>stdout / stderr</p>
            <button
              type="button"
              onClick={() =>
                setIoSessions((prev) =>
                  prev.map((s) => (s.id === activeIoSessionId ? { ...s, output: [] } : s))
                )
              }
              className="text-[10px] font-bold uppercase tracking-wider text-lumen-heat hover:text-lumen-heatGlow"
            >
              Clear
            </button>
          </div>
          <div className={`min-h-[7rem] rounded-md border border-lumen-line p-2 text-xs ${lm.console}`}>
            {activeSession.output.length > 0 ? (
              activeSession.output.map((line, index) => (
                <pre key={index} className="whitespace-pre-wrap">
                  {line}
                </pre>
              ))
            ) : (
              <span className="text-zinc-600">— waiting for run —</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const renderPanelContent = () => {
    if (!activePanel) {
      return renderIoPanelRight();
    }

    if (activePanel === "ai") {
      return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
          <div className="flex items-center gap-2 border-b border-lumen-line px-3 py-2 font-display text-[10px] font-bold uppercase tracking-[0.2em] text-lumen-signal">
            <FiBox className="h-3.5 w-3.5" />
            Neural tutor
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
            {aiMessages.length > 0 ? (
              aiMessages.map((msg, index) => (
                <div key={index} className={`flex items-start gap-2 ${msg.sender === "user" ? "justify-end" : ""}`}>
                  {msg.sender === "ai" && (
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-cyan-500/40 bg-cyan-500/10 font-display text-[10px] font-bold text-cyan-400">
                      AI
                    </div>
                  )}
                  <div
                    className={`max-w-[92%] rounded-lg border px-3 py-2 text-xs leading-relaxed md:max-w-md ${
                      msg.sender === "user"
                        ? isDark
                          ? "border-lumen-heat/40 bg-lumen-heat/15 text-zinc-100"
                          : "border-rose-200 bg-rose-50 text-zinc-900"
                        : isDark
                          ? "border-lumen-line bg-lumen-ink text-zinc-300"
                          : "border-lumen-line bg-white text-zinc-800"
                    }`}
                  >
                    {msg.sender === 'ai' ? (
                      <div className={`text-sm prose ${isDark ? "prose-invert" : ""} prose-sm max-w-none`}>
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            code: ({ node, inline, className, children, ...props }: any) => {
                              const match = /language-(\w+)/.exec(className || '');
                              return !inline && match ? (
                                <pre className={`${isDark ? "bg-gray-900" : "bg-gray-200"} rounded p-2 overflow-x-auto my-2`}>
                                  <code className={className} {...props}>
                                    {children}
                                  </code>
                                </pre>
                              ) : (
                                <code className={`${isDark ? "bg-gray-900" : "bg-gray-200"} px-1 py-0.5 rounded text-xs`} {...props}>
                                  {children}
                                </code>
                              );
                            },
                            p: ({ children }: any) => <p className="mb-2 last:mb-0">{children}</p>,
                            ul: ({ children }: any) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
                            ol: ({ children }: any) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
                            li: ({ children }: any) => <li className="text-sm">{children}</li>,
                            h1: ({ children }: any) => <h1 className="text-lg font-bold mb-2">{children}</h1>,
                            h2: ({ children }: any) => <h2 className="text-base font-bold mb-2">{children}</h2>,
                            h3: ({ children }: any) => <h3 className="text-sm font-bold mb-1">{children}</h3>,
                            strong: ({ children }: any) => <strong className="font-semibold">{children}</strong>,
                            em: ({ children }: any) => <em className="italic">{children}</em>,
                            blockquote: ({ children }: any) => (
                              <blockquote className={`my-2 border-l-2 pl-3 italic ${isDark ? "border-zinc-600 text-zinc-400" : "border-zinc-300 text-zinc-600"}`}>{children}</blockquote>
                            ),
                          }}
                        >
                          {msg.text}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.text}</p>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className={`py-6 text-center text-xs ${lm.muted}`}>
                Ask about your code — context from the editor is sent automatically.
              </p>
            )}
            {isAiLoading && (
              <div className="flex items-start gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-cyan-500/40 bg-cyan-500/10 font-display text-[10px] font-bold text-cyan-400">
                  AI
                </div>
                <div className={`rounded-lg border border-lumen-line px-3 py-2 ${isDark ? "bg-lumen-ink" : "bg-zinc-50"}`}>
                  <AiOutlineLoading3Quarters className={`h-4 w-4 animate-spin ${lm.muted}`} />
                </div>
              </div>
            )}
            <div ref={aiChatEndRef} />
          </div>
          <form onSubmit={handleAiSubmit} className={`flex gap-2 border-t border-lumen-line p-2 ${isDark ? "bg-lumen-void" : "bg-lumen-canvas"}`}>
            <input
              type="text"
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              placeholder="Prompt…"
              className={`min-w-0 flex-1 rounded-md border p-2 text-xs ${lm.input}`}
              disabled={isAiLoading}
            />
            <button
              type="submit"
              className={`rounded-md px-3 py-2 transition disabled:opacity-40 ${lm.run}`}
              disabled={isAiLoading || !aiInput.trim()}
            >
              <AiOutlineSend className="h-4 w-4" />
            </button>
          </form>
        </div>
      );
    }

    if (activePanel === "chat") {
      return (
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex items-center gap-2 border-b border-lumen-line px-3 py-2 font-display text-[10px] font-bold uppercase tracking-[0.2em] text-lumen-signal">
            <FiMessageCircle className="h-3.5 w-3.5" />
            Squad channel
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            {chatId ? (
              <Chat socket={socket} chatId={chatId} userId={user.id} userName={user.name} IP_ADDRESS={IP_ADDRESS} />
            ) : (
              <div className={`flex flex-1 items-center justify-center p-4 text-center text-xs ${lm.muted}`}>
                Initializing channel…
              </div>
            )}
          </div>
        </div>
      );
    }

    if (activePanel === "info") {
      return (
        <div className="flex h-full min-h-0 flex-col overflow-y-auto">
          <div className="flex items-center gap-2 border-b border-lumen-line px-3 py-2 font-display text-[10px] font-bold uppercase tracking-[0.2em] text-lumen-signal">
            <FiUsers className="h-3.5 w-3.5" />
            Session
          </div>
          <div className="flex flex-col gap-4 p-3">
            <div>
              <h3 className={`mb-2 flex items-center gap-2 font-display text-[10px] font-bold uppercase tracking-wider ${lm.muted}`}>
                <FiUsers /> Peers
              </h3>
              <div className="space-y-2">
                {connectedUsers.length > 0 ? (
                  connectedUsers.map((u: any) => (
                    <div key={u.id} className={`flex items-center gap-3 rounded-md border p-2 ${lm.inset}`}>
                      <div className="flex h-9 w-9 items-center justify-center rounded border border-lumen-signal/30 bg-lumen-signal/10 font-display text-sm font-bold text-lumen-signal">
                        {u.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className={`truncate text-xs font-semibold ${lm.hi}`}>{u.name}</p>
                        <p className={`truncate font-mono text-[10px] ${lm.muted}`}>{u.id}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className={`text-center text-xs ${lm.muted}`}>Solo in room.</p>
                )}
              </div>
            </div>
            <div>
              <h3 className={`mb-2 flex items-center gap-2 font-display text-[10px] font-bold uppercase tracking-wider ${lm.muted}`}>
                <FiHash /> Room id
              </h3>
              <div className="flex items-stretch gap-2">
                <p className={`flex-1 select-all rounded-md border border-lumen-line bg-lumen-void p-2 font-mono text-xs text-lumen-ok`}>{user.roomId || "…"}</p>
                <button
                  type="button"
                  onClick={handleCopy}
                  className={`rounded-md border border-lumen-line px-3 transition hover:border-lumen-signal/50 ${isDark ? "bg-lumen-lift text-zinc-200" : "bg-zinc-100 text-zinc-800"}`}
                >
                  {isCopied ? <AiOutlineCheck /> : <AiOutlineCopy />}
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  const handleAiSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiInput.trim() || isAiLoading) return;

    const userMessage: AiMessage = { sender: 'user', text: aiInput, userName: user.name };
    setAiMessages(prev => [...prev, userMessage]);
    const currentAiInput = aiInput;
    setAiInput("");
    setIsAiLoading(true);

    // Broadcast the user's question to everyone in the room so the
    // AI chat appears shared instead of per-user.
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: "aiMessages",
        messages: [userMessage],
      }));
    }

    // Prepare the payload for the backend
    const effectiveRoomId = user.roomId || params.roomId;
    const aiSubmission = {
      userQuery: currentAiInput,
      language: language,
      code: code,
      input: activeSession.input,
      output: activeSession.output.join('\n'), // Send joined output
      roomId: effectiveRoomId, // Include roomId to save messages
      userName: user.name,     // Send the user's name so the AI can address them
      userId: user.id,         // Send userId for learning profile tracking
    };

    try {
      const res = await fetch(`http://${IP_ADDRESS}:3000/ai-tutor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(aiSubmission),
      });

      if (!res.ok) {
        throw new Error(`Server responded with status: ${res.status}`);
      }

      const { aiResponseText } = await res.json();
      const aiMessage: AiMessage = {
        sender: 'ai',
        text: aiResponseText || "Sorry, I couldn't generate a response.",
      };
      setAiMessages(prev => [...prev, aiMessage]);

      // Broadcast the AI's response so everyone sees the same AI reply.
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
          type: "aiMessages",
          messages: [aiMessage],
        }));
      }
    } catch (error) {
      console.error("Error communicating with AI service:", error);
      setAiMessages(prev => [...prev, { sender: 'ai', text: "Error connecting to the AI assistant via the server." }]);
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(user.roomId);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000); // Reset after 2 seconds
  };

  const syncIoSessions = (newSessions: IOSession[]) => {
    setIoSessions(newSessions);
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "ioSessions", sessions: newSessions, roomId: user.roomId }));
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const newSessions = ioSessions.map(s => s.id === activeIoSessionId ? { ...s, input: newValue } : s);
    syncIoSessions(newSessions);
  };

  const handleLanguageChange = (value: string) => {
    setLanguage(value);
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "language", language: value, roomId: user.roomId }));
  }

  const handleButtonStatus = (value: string, isLoading: boolean) => {
    setCurrentButtonState(value);
    setIsLoading(isLoading);
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "submitBtnStatus", value, isLoading, roomId: user.roomId }));
  };

  const handleEditorDidMount = (editor: any) => {
    editor.onDidChangeModelContent(() => {
      const currentCode = editor.getValue();
      
      // Update local state immediately for responsive UI
      setCode(currentCode);
      
      // Skip sending if this is a remote update (received from another user)
      if (isRemoteUpdateRef.current) {
        return;
      }
      
      // Debounce the WebSocket send to prevent flooding
      if (codeSyncTimeoutRef.current) {
        clearTimeout(codeSyncTimeoutRef.current);
      }
      
      codeSyncTimeoutRef.current = setTimeout(() => {
        if (socket?.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "code", code: currentCode, roomId: user.roomId }));
        }
      }, CODE_SYNC_DEBOUNCE_MS);
    });
  };

  const shouldShowBottomIo = !!activePanel;

  const renderBottomIoPanel = () => {
    if (!shouldShowBottomIo) return null;

    return (
      <div
        className={`mt-0 flex flex-shrink-0 flex-col border-t border-lumen-line ${lm.bar}`}
        style={{ height: isIoCollapsed ? 36 : ioPanelHeight }}
      >
        <div
          className={`flex cursor-row-resize select-none items-center justify-between border-b border-lumen-line px-3 py-1.5 ${isDark ? "bg-lumen-void" : "bg-lumen-canvas"}`}
          onMouseDown={startIoResizeDrag}
        >
          <div className="flex items-center gap-2">
            <span className="font-display text-[10px] font-bold uppercase tracking-[0.2em] text-lumen-signal">Dock</span>
            <span className={`text-[10px] ${lm.muted}`}>drag edge · stdin / stdout</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setIoSessions((prev) =>
                  prev.map((s) => (s.id === activeIoSessionId ? { ...s, output: [] } : s))
                )
              }
              className="text-[10px] font-bold uppercase tracking-wider text-lumen-heat hover:underline"
            >
              Clear out
            </button>
            <button
              type="button"
              onClick={() => setIsIoCollapsed((v) => !v)}
              className={`rounded border border-lumen-line px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${lm.inset}`}
            >
              {isIoCollapsed ? "Expand" : "Collapse"}
            </button>
          </div>
        </div>
        {!isIoCollapsed && (
          <div className="flex min-h-0 flex-1 gap-2 overflow-hidden p-2">
            <div className="flex min-h-0 w-1/2 flex-col">
              <p className={`mb-0.5 text-[10px] font-semibold uppercase tracking-wider ${lm.muted}`}>stdin</p>
              <textarea
                value={activeSession.input}
                onChange={handleInputChange}
                placeholder="stdin…"
                className={`min-h-0 flex-1 resize-none rounded-md border p-2 text-xs ${lm.input}`}
              />
            </div>
            <div className="flex min-h-0 w-1/2 flex-col">
              <p className={`mb-0.5 text-[10px] font-semibold uppercase tracking-wider ${lm.muted}`}>out</p>
              <div className={`min-h-0 flex-1 overflow-y-auto rounded-md border border-lumen-line p-2 text-xs ${lm.console}`}>
                {activeSession.output.length > 0 ? (
                  activeSession.output.map((line, index) => (
                    <pre key={index} className="whitespace-pre-wrap">
                      {line}
                    </pre>
                  ))
                ) : (
                  <span className="text-zinc-600">—</span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const tabBtn = (id: "ai" | "chat" | "info", label: string, Icon: typeof FiBox) => (
    <button
      type="button"
      onClick={() => handlePanelToggle(id)}
      className={`flex items-center gap-2 border-b-2 px-3 py-2 font-display text-[10px] font-bold uppercase tracking-[0.2em] transition-colors ${
        activePanel === id ? lm.tabActive : lm.tabIdle
      }`}
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );

  return (
    <div className={`flex h-screen min-h-0 overflow-hidden font-mono text-[13px] ${lm.page}`}>
      <Sidebar showRooms onOpenAccount={() => setIsAccountOpen(true)} onOpenSettings={() => setIsSettingsOpen(true)} />
      <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col">
        <header className={`flex flex-shrink-0 flex-wrap items-center gap-3 border-b px-3 py-2 ${lm.header}`}>
          <button
            type="button"
            onClick={() => setIsSidebarOpen((v) => !v)}
            className={`hidden h-9 w-9 items-center justify-center rounded border border-lumen-line transition hover:border-lumen-signal/50 lg:flex ${lm.inset}`}
            aria-label="Toggle rooms"
          >
            {isSidebarOpen ? <FiChevronsLeft className="h-4 w-4 text-lumen-signal" /> : <FiChevronsRight className="h-4 w-4 text-lumen-signal" />}
          </button>
          <span className="font-display text-lg font-extrabold tracking-tighter text-lumen-signal">COLEARN</span>
          <code className={`rounded border px-2 py-0.5 font-mono text-[11px] ${lm.pill}`}>{user.roomId || "———"}</code>
          <span className={`hidden sm:inline text-[10px] ${lm.muted}`}>⌘↵ run</span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => {
              const effectiveRoomId = user.roomId || params.roomId;
              if (!effectiveRoomId) return;
              navigate(`/learn/${effectiveRoomId}/choose`);
            }}
            className={`rounded border border-lumen-signal/40 px-3 py-1.5 font-display text-[10px] font-bold uppercase tracking-[0.2em] text-lumen-signal transition hover:bg-lumen-signal/10`}
          >
            Modules →
          </button>
        </header>

        <div className={`flex flex-shrink-0 flex-wrap items-end justify-between gap-2 border-b px-2 ${lm.bar}`}>
          <div className="flex">{tabBtn("ai", "Tutor", FiBox)}{tabBtn("chat", "Chat", FiMessageCircle)}{tabBtn("info", "Session", FiUsers)}</div>
          <div className="flex items-center gap-2 pb-1">
            <select
              value={language}
              onChange={(e) => handleLanguageChange(e.target.value)}
              className={`rounded-md border py-1.5 pl-2 pr-6 text-xs ${lm.input}`}
            >
              <option value="javascript">JavaScript</option>
              <option value="python">Python</option>
              <option value="cpp">C++</option>
              <option value="java">Java</option>
              <option value="rust">Rust</option>
              <option value="go">Go</option>
            </select>
            <button
              type="button"
              onClick={handleSubmit}
              className={`flex items-center gap-2 rounded-md px-4 py-2 text-[10px] font-bold uppercase tracking-[0.2em] transition ${lm.run} ${isLoading ? "pointer-events-none opacity-60" : ""}`}
              disabled={isLoading}
            >
              {isLoading && <AiOutlineLoading3Quarters className="h-4 w-4 animate-spin" />}
              {currentButtonState}
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className={`min-h-0 flex-1 overflow-hidden border-b border-lumen-line lg:border-b-0 lg:border-r ${lm.editorFrame}`}>
              <MonacoEditor
                height="100%"
                value={code}
                language={language}
                theme={isDark ? "vs-dark" : "vs"}
                onMount={handleEditorDidMount}
                options={{ minimap: { enabled: false }, fontSize: 14, fontFamily: "'IBM Plex Mono', monospace" }}
              />
            </div>
            {renderBottomIoPanel()}
          </div>
          <aside
            className={`flex max-h-[48vh] min-h-0 w-full flex-col overflow-hidden border-lumen-line lg:max-h-none lg:w-[min(100vw,420px)] lg:flex-shrink-0 lg:border-l ${lm.rail}`}
          >
            {renderPanelContent()}
          </aside>
        </div>
      </div>
      <AccountModal isOpen={isAccountOpen} onClose={() => setIsAccountOpen(false)} />
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
};

export default CodeEditor;

