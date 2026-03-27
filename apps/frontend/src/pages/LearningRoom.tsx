import React, { useEffect, useState, useRef } from "react";
import MonacoEditor from "@monaco-editor/react";
import { useParams, useNavigate } from "react-router-dom";
import { useRecoilState, useRecoilValue } from "recoil";
import { userAtom } from "../atoms/userAtom";
import { authAtom } from "../atoms/authAtom";
import { socketAtom } from "../atoms/socketAtom";
import { connectedUsersAtom } from "../atoms/connectedUsersAtom";
import { themeAtom } from "../atoms/themeAtom";
import { sidebarOpenAtom } from "../atoms/sidebarAtom";
import Sidebar from "../components/Sidebar";
import AccountModal from "../components/AccountModal";
import SettingsModal from "../components/SettingsModal";
import Chat from "../components/Chat";
import { IP_ADDRESS } from "../Globle";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { normalizeForDisplay } from "../utils/outputNormalization.ts";
import {
  FiChevronsLeft,
  FiChevronsRight,
  FiMessageCircle,
  FiUsers,
  FiBox,
  FiChevronDown,
  FiChevronUp,
  FiPlay,
  FiCheck,
  FiHash,
} from "react-icons/fi";
import { AiOutlineSend, AiOutlineLoading3Quarters, AiOutlineCopy, AiOutlineCheck } from "react-icons/ai";

// Debounce delay for code sync (ms)
const CODE_SYNC_DEBOUNCE_MS = 150;

type AiMode = "socratic" | "hint" | "review" | "summarizer" | undefined;

type CheckpointType =
  | "predict-output"
  | "fix-code"
  | "write-code"
  | "explain-to-unlock"
  | "reflection";

interface Checkpoint {
  checkpointId: string;
  title: string;
  type: CheckpointType;
  summary: string;
  description: string;
  starterCode?: string;
  readOnlyCode?: boolean;
  expectedOutput?: string;
  testCases?: Array<{ input: string; expectedOutput: string }>;
  requirePeerReview?: boolean;
  aiMode: AiMode;
}

interface LearningModule {
  moduleId: string;
  title: string;
  language: string;
  difficulty: string;
  estimatedTimeMinutes: number;
  checkpoints: Checkpoint[];
}

interface LearningProgressCheckpoint {
  checkpointId: string;
  status: "pending" | "in_progress" | "completed";
  explanationText?: string;
  explanationAccepted?: boolean;
  reflectionText?: string;
}

interface LearningProgress {
  currentCheckpointIndex: number;
  checkpoints: LearningProgressCheckpoint[];
}

type AiMessage = {
  sender: "user" | "ai";
  text: string;
  userName?: string;
};

type ActivePanel = "chat" | "ai" | "info";

const LearningRoom: React.FC = () => {
  const params = useParams();
  // NOTE: navigate is intentionally not used yet; we keep it around
  // for future flows where learners might jump back to the main room.
  const navigate = useNavigate();
  const [user] = useRecoilState(userAtom);
  const [auth] = useRecoilState(authAtom);
  const [socket, setSocket] = useRecoilState<WebSocket | null>(socketAtom);
  const [connectedUsers, setConnectedUsers] =
    useRecoilState<any[]>(connectedUsersAtom);
  const [activePanel, setActivePanel] = useState<ActivePanel>("ai");
  const [aiPanelUnread, setAiPanelUnread] = useState(false);
  const [chatPanelUnread, setChatPanelUnread] = useState(false);
  const lastSeenAiCountRef = useRef(0);
  const [chatId, setChatId] = useState<string>("");
  const theme = useRecoilValue(themeAtom);
  const isDark = theme === "dark";
  const [isSidebarOpen, setIsSidebarOpen] =
    useRecoilState(sidebarOpenAtom);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [module, setModule] = useState<LearningModule | null>(null);
  const [_progress, setProgress] = useState<LearningProgress | null>(null);
  const [currentCheckpointIndex, setCurrentCheckpointIndex] =
    useState<number>(0);

  const [code, setCode] = useState<string>("# Python\n# Loading checkpoint...\n");
  const [codeByCheckpoint, setCodeByCheckpoint] = useState<Record<string, string>>({});
  const [language, setLanguage] = useState<string>("python");
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [explanation, setExplanation] = useState("");
  const [reflection, setReflection] = useState("");
  const [navError, setNavError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ allPassed: boolean; results?: Array<{ passed: boolean; expectedOutput: string; actualOutput: string }> } | null>(null);
  const [isRunningTests, setIsRunningTests] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const [aiMessages, setAiMessages] = useState<AiMessage[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const aiChatEndRef = useRef<HTMLDivElement>(null);

  const [chatReady, setChatReady] = useState(false);
  const [roomDisplayName, setRoomDisplayName] = useState<string | null>(null);
  const [runInput, setRunInput] = useState("");
  const [runOutput, setRunOutput] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const runSessionIdRef = useRef(1);
  const [_ioPanelCollapsed, _setIoPanelCollapsed] = useState(false);
  const [activeIOTab, setActiveIOTab] = useState<string>("custom");
  const [testCaseOutputs, setTestCaseOutputs] = useState<Record<number, string[]>>({});
  const currentCheckpointIdRef = useRef<string | undefined>(undefined);
  const [isCheckpointsCollapsed, setIsCheckpointsCollapsed] = useState(false);
  const [isIoCollapsed, setIsIoCollapsed] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  
  // Debounce timer for code sync
  const codeSyncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Flag to prevent echo when receiving remote code
  const isRemoteUpdateRef = useRef(false);

  const roomIdFromUrl = params.roomId || user.roomId;

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (codeSyncTimeoutRef.current) {
        clearTimeout(codeSyncTimeoutRef.current);
      }
    };
  }, []);

  // Sidebar closed by default on LearningRoom (non-landing pages)
  useEffect(() => {
    setIsSidebarOpen(false);
  }, []);

  const currentCheckpoint: Checkpoint | undefined =
    module?.checkpoints[currentCheckpointIndex];

  const currentAiMode: AiMode = currentCheckpoint?.aiMode;

  // Per-checkpoint user progress is currently not surfaced in the UI.

  const canEditCode = !!currentCheckpoint && !currentCheckpoint.readOnlyCode;

  const roomLabel = roomIdFromUrl || "...";

  const isReflectionCheckpoint =
    currentCheckpoint?.type === "reflection";
  const isExplainCheckpoint =
    currentCheckpoint?.type === "explain-to-unlock";

  useEffect(() => {
    aiChatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [aiMessages]);

  useEffect(() => {
    if (activePanel === "ai") {
      setAiPanelUnread(false);
      lastSeenAiCountRef.current = aiMessages.length;
      return;
    }
    if (aiMessages.length > lastSeenAiCountRef.current) {
      setAiPanelUnread(true);
    }
    lastSeenAiCountRef.current = aiMessages.length;
  }, [aiMessages, activePanel]);

  useEffect(() => {
    if (activePanel === "chat") {
      setChatPanelUnread(false);
    }
  }, [activePanel]);


  // Fetch learning state (module + per-user progress).
  // If the room is not yet a learning room, we automatically attach the
  // default Python "Loops for Beginners" module the first time someone
  // navigates here from the Learn button.
  useEffect(() => {
    const fetchLearningState = async () => {
      if (!auth.token || !roomIdFromUrl) return;
      try {
        let res = await fetch(
          `http://${IP_ADDRESS}:3000/learning/room/${roomIdFromUrl}/state`,
          {
            headers: {
              Authorization: `Bearer ${auth.token}`,
            },
          }
        );

        // If this room has no learning module yet, go to the module picker.
        if (res.status === 404) {
          navigate(`/learn/${roomIdFromUrl}/choose`, { replace: true });
          return;
        }

        if (!res.ok) return;
        const data = await res.json();
        if (data.module) {
          setModule(data.module);
          setLanguage(data.module.language || "python");
        }
        if (data.room?.currentCheckpointIndex != null) {
          setCurrentCheckpointIndex(data.room.currentCheckpointIndex);
        }
        if (data.progress) {
          setProgress({
            currentCheckpointIndex:
              data.progress.currentCheckpointIndex ?? 0,
            checkpoints: data.progress.checkpoints || [],
          });
        }

        // Basic chatId fetch and shared AI messages for this room
        const roomRes = await fetch(
          `http://${IP_ADDRESS}:3000/room/${roomIdFromUrl}`
        );
        if (roomRes.ok) {
          const roomData = await roomRes.json();
          if (roomData.room && roomData.room.chatId) {
            setChatId(roomData.room.chatId);
            setChatReady(true);
          }
          if (roomData.room) {
            const dn = roomData.room.displayName;
            setRoomDisplayName(typeof dn === "string" && dn.trim() ? dn.trim() : null);
          }
        }
        const dataRes = await fetch(
          `http://${IP_ADDRESS}:3000/room/${roomIdFromUrl}/data`
        );
        if (dataRes.ok) {
          const data = await dataRes.json();
          if (data.aiMessages && Array.isArray(data.aiMessages)) {
            setAiMessages(
              data.aiMessages.map((m: { sender: string; text: string; userName?: string }) => ({
                sender: m.sender as "user" | "ai",
                text: m.text,
                userName: m.userName,
              }))
            );
          }
        }
      } catch (e) {
        console.error("Failed to fetch learning room state", e);
      }
    };
    fetchLearningState();
  }, [auth.token, roomIdFromUrl]);

  // Apply starter code when checkpoint changes; preserve code if we've seen this checkpoint before
  useEffect(() => {
    if (!currentCheckpoint) return;
    const checkpointId = currentCheckpoint.checkpointId;
    currentCheckpointIdRef.current = checkpointId;
    
    // If we have saved code for this checkpoint, restore it; otherwise use starter code
    if (codeByCheckpoint[checkpointId]) {
      setCode(codeByCheckpoint[checkpointId]);
    } else if (currentCheckpoint.starterCode) {
      const starterCode = currentCheckpoint.starterCode;
      setCode(starterCode);
      // Save starter code as initial state for this checkpoint
      setCodeByCheckpoint(prev => ({ ...prev, [checkpointId]: starterCode }));
    }
    
    setTestResult(null);
    setRunInput("");
    setRunOutput([]);
    setTestCaseOutputs({});
    setActiveIOTab("custom");
    setNavError(null);
  }, [currentCheckpoint?.checkpointId]);

  // Save code whenever it changes (for the current checkpoint)
  useEffect(() => {
    if (!currentCheckpoint) return;
    const checkpointId = currentCheckpoint.checkpointId;
    setCodeByCheckpoint(prev => ({ ...prev, [checkpointId]: code }));
  }, [code, currentCheckpoint?.checkpointId]);

  // Ensure there is a WebSocket connection for this room and
  // wire up basic listeners for users / code sync.
  useEffect(() => {
    const effectiveRoomId = roomIdFromUrl;
    if (!effectiveRoomId) return;

    const authUser: any = (auth as any)?.user;
    const userIdForWs = user.id || authUser?.id;
    const userNameForWs = user.name || authUser?.name || "Learner";

    // If there is no socket yet OR the existing one is closed
    // (e.g. it was created on the CodeEditor page and closed on unmount),
    // create a fresh connection for this learning room.
    if ((!socket || socket.readyState === WebSocket.CLOSED) && userIdForWs) {
      const ws = new WebSocket(
        `ws://${IP_ADDRESS}:5000?roomId=${effectiveRoomId}&id=${userIdForWs}&name=${encodeURIComponent(
          userNameForWs
        )}`
      );
      setSocket(ws);
      // We don't attach handlers here; they'll be attached below once
      // socket state is updated.
      return;
    }

    if (!socket || socket.readyState === WebSocket.CLOSED) return;

    const handleMessage = (event: MessageEvent) => {
      const data = JSON.parse(event.data);
      if (data.type === "users") {
        setConnectedUsers(data.users || []);
      }
      if (data.type === "code") {
        // Set flag to prevent echo when receiving remote code
        isRemoteUpdateRef.current = true;
        setCode(data.code);
        // Also save to checkpoint-specific storage if we have a current checkpoint
        const checkpointId = currentCheckpointIdRef.current;
        if (checkpointId) {
          setCodeByCheckpoint(prev => ({ ...prev, [checkpointId]: data.code }));
        }
        setTimeout(() => { isRemoteUpdateRef.current = false; }, 50);
      }
      if (data.type === "output") {
        if (data.sessionId === runSessionIdRef.current) {
          setRunOutput((prev) => [...prev, data.message ?? data.result ?? ""]);
        } else if (typeof data.sessionId === "string" && data.sessionId.startsWith("test-")) {
          const match = data.sessionId.match(/test-(\d+)-/);
          if (match) {
            const testIndex = parseInt(match[1], 10);
            setTestCaseOutputs((prev) => ({
              ...prev,
              [testIndex]: [...(prev[testIndex] || []), data.message ?? data.result ?? ""],
            }));
          }
        }
      }
      if (data.type === "aiMessages" && Array.isArray(data.messages)) {
        setAiMessages((prev) => [
          ...prev,
          ...data.messages.map((m: { sender: string; text: string; userName?: string }) => ({
            sender: m.sender as "user" | "ai",
            text: m.text,
            userName: m.userName,
          })),
        ]);
      }
      // In learning room we never override language from WebSocket—it comes from the module (Python).
    };

    socket.addEventListener("message", handleMessage);

    // request current users and typing state
    if (socket.readyState === WebSocket.OPEN && user.id) {
      socket.send(
        JSON.stringify({ type: "requestToGetUsers", userId: user.id })
      );
    } else {
      socket.addEventListener(
        "open",
        () => {
          if (user.id) {
            socket.send(
              JSON.stringify({ type: "requestToGetUsers", userId: user.id })
            );
          }
        },
        { once: true }
      );
    }

    return () => {
      socket.removeEventListener("message", handleMessage);
    };
  }, [socket, roomIdFromUrl, user.id, auth, setSocket, setConnectedUsers]);

  const handleEditorDidMount = (editor: any) => {
    editor.onDidChangeModelContent(() => {
      const currentCode = editor.getValue();
      
      // Update local state immediately for responsive UI
      setCode(currentCode);
      
      // Also save to checkpoint-specific storage
      const checkpointId = currentCheckpointIdRef.current;
      if (checkpointId) {
        setCodeByCheckpoint(prev => ({ ...prev, [checkpointId]: currentCode }));
      }
      
      // Skip sending if this is a remote update
      if (isRemoteUpdateRef.current) {
        return;
      }
      
      // Debounce the WebSocket send
      if (codeSyncTimeoutRef.current) {
        clearTimeout(codeSyncTimeoutRef.current);
      }
      
      codeSyncTimeoutRef.current = setTimeout(() => {
        if (socket?.readyState === WebSocket.OPEN) {
          socket.send(
            JSON.stringify({
              type: "code",
              code: currentCode,
              roomId: roomIdFromUrl,
            })
          );
        }
      }, CODE_SYNC_DEBOUNCE_MS);
    });
  };


  const handleRunTests = async () => {
    if (!roomIdFromUrl || !auth.token) return;
    setIsRunningTests(true);
    setTestResult(null);
    setNavError(null);
    try {
      const res = await fetch(
        `http://${IP_ADDRESS}:3000/learning/room/${roomIdFromUrl}/run-tests`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${auth.token}`,
          },
          body: JSON.stringify({ code }),
        }
      );
      const data = await res.json().catch(() => ({}));
      setTestResult({
        allPassed: !!data.allPassed,
        results: data.results,
      });
      if (!res.ok || !data.allPassed) {
        setNavError(data.error || "Some tests failed.");
        setToast({
          type: "error",
          message: "Some tests failed. Fix the code or ask the AI guide for help.",
        });
      } else {
        setToast({
          type: "success",
          message: "All tests passed. You can safely move to the next checkpoint.",
        });
      }
    } catch (e) {
      console.error("Run tests failed", e);
      setNavError("Failed to run tests.");
      setToast({
        type: "error",
        message: "Failed to run tests. Please try again.",
      });
    } finally {
      setIsRunningTests(false);
    }
  };

  // Auto-hide toast after a short delay
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  const handleAiSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiInput.trim() || isAiLoading || !currentCheckpoint) return;

    const userName = user.name || "Learner";
    const userMsg: AiMessage = { sender: "user", text: aiInput, userName };
    setAiMessages((prev) => [...prev, userMsg]);
    const currentInput = aiInput;
    setAiInput("");
    setIsAiLoading(true);

    const moduleSummary = module
      ? `${module.title}. Checkpoints: ${module.checkpoints.map((cp) => cp.title).join("; ")}. Current: ${currentCheckpoint.title} - ${currentCheckpoint.summary}`
      : "";

    const submission = {
      userQuery: currentInput,
      language,
      code,
      input: runInput,
      output: runOutput.join("\n"),
      roomId: roomIdFromUrl,
      userName,
      userId: user.id,  // Include userId for learning profile tracking
      checkpointType: currentCheckpoint.type,
      checkpointTitle: currentCheckpoint.title,
      checkpointDescription: currentCheckpoint.description,
      aiMode: currentCheckpoint.aiMode,
      moduleTitle: module?.title,
      moduleSummary,
    };

    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "aiMessages", messages: [userMsg] }));
    }

    try {
      const res = await fetch(`http://${IP_ADDRESS}:3000/ai-tutor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submission),
      });
      if (!res.ok) {
        throw new Error(`Server responded with status ${res.status}`);
      }
      const { aiResponseText } = await res.json();
      const aiMsg: AiMessage = { sender: "ai", text: aiResponseText || "No response." };
      setAiMessages((prev) => [...prev, aiMsg]);
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "aiMessages", messages: [aiMsg] }));
      }
    } catch (err) {
      console.error("AI tutor error", err);
      const errMsg: AiMessage = {
        sender: "ai",
        text: "Error connecting to the AI guide. Please try again.",
      };
      setAiMessages((prev) => [...prev, errMsg]);
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "aiMessages", messages: [errMsg] }));
      }
    } finally {
      setIsAiLoading(false);
    }
  };

  // NOTE (iteration choice): We are not using AI evaluation to unlock checkpoints.
  // Users can write explanations/reflections locally and manually move forward
  // using "Mark complete" + "Next".

  const handleAdvanceCheckpoint = async () => {
    if (!roomIdFromUrl) return;
    setIsAdvancing(true);
    setNavError(null);
    try {
      const res = await fetch(
        `http://${IP_ADDRESS}:3000/learning/room/${roomIdFromUrl}/next`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${auth.token}`,
          },
          body: JSON.stringify({ code }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.room?.currentCheckpointIndex != null) {
        const nextIndex = data.room.currentCheckpointIndex;
        setCurrentCheckpointIndex(nextIndex);
        if (nextIndex === currentCheckpointIndex && module) {
          setNavError(
            `Already at the last checkpoint (${currentCheckpointIndex + 1}/${module.checkpoints.length}).`
          );
        }
      } else if (!res.ok && data?.error) {
        if (data.results && !data.allPassed) {
          const failed = data.results.filter((r: { passed: boolean }) => !r.passed);
          setNavError(
            `${data.error} Failed: ${failed.map((r: { input: string; actualOutput: string; expectedOutput: string }) =>
              `expected "${r.expectedOutput}" got "${r.actualOutput}"`
            ).join("; ")}`
          );
        } else {
          setNavError(data.error || "Cannot advance checkpoint.");
        }
        console.warn("Cannot advance checkpoint:", data);
      } else if (!res.ok) {
        setNavError("Cannot advance checkpoint.");
      }
    } catch (e) {
      console.error("Failed to advance checkpoint", e);
      setNavError("Failed to advance checkpoint.");
    } finally {
      setIsAdvancing(false);
    }
  };

  // Explicit completion is no longer used; checkpoints advance strictly via tests + Next.

  const handlePreviousCheckpoint = async () => {
    if (!roomIdFromUrl) return;
    setIsAdvancing(true);
    try {
      const res = await fetch(
        `http://${IP_ADDRESS}:3000/learning/room/${roomIdFromUrl}/previous`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${auth.token}`,
          },
        }
      );
      const data = await res.json();
      if (res.ok && data.room?.currentCheckpointIndex != null) {
        setCurrentCheckpointIndex(data.room.currentCheckpointIndex);
      }
    } catch (e) {
      console.error("Failed to go to previous checkpoint", e);
    } finally {
      setIsAdvancing(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(roomIdFromUrl || "");
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const renderCheckpointList = () => {
    if (!module) return null;
    const completedCount = currentCheckpointIndex;
    const totalCount = module.checkpoints.length;
    const progressPercent = Math.round((completedCount / totalCount) * 100);
    
    return (
      <div className={`${isDark ? "bg-gray-900 border-gray-800" : "bg-blue-50 border-blue-200 shadow-lg"} border-2 rounded-lg flex flex-col h-full transition-all duration-200`}>
        <button
          onClick={() => setIsCheckpointsCollapsed(!isCheckpointsCollapsed)}
          className={`w-full p-3 flex items-center justify-between border-b ${isDark ? "border-gray-800 hover:bg-gray-800/50" : "border-blue-200 hover:bg-blue-100/50 bg-blue-100/30"} transition-colors`}
        >
          <div className="flex items-center gap-2">
            <FiCheck className={isDark ? "text-blue-400" : "text-blue-600"} />
            <span className={`font-bold ${isDark ? "text-gray-200" : "text-gray-900"}`}>Checkpoints</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${isDark ? "bg-gray-800 text-gray-400" : "bg-blue-200 text-blue-700"}`}>
              {completedCount}/{totalCount}
            </span>
          </div>
          {isCheckpointsCollapsed ? <FiChevronDown /> : <FiChevronUp />}
        </button>
        
        {!isCheckpointsCollapsed && (
          <div className="flex-1 overflow-y-auto p-3">
            <div className="mb-3">
              <h3 className={`text-sm font-semibold mb-1 ${isDark ? "text-gray-200" : "text-gray-800"}`}>
                {module.title}
              </h3>
              <p className={`text-xs ${isDark ? "text-gray-500" : "text-gray-600"}`}>
                {module.language} · {module.difficulty} · ~{module.estimatedTimeMinutes}min
              </p>
              <div className={`mt-2 h-1.5 rounded-full overflow-hidden ${isDark ? "bg-gray-800" : "bg-gray-200"}`}>
                <div 
                  className="h-full bg-gradient-to-r from-blue-500 to-green-500 transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
            
            <ul className="space-y-1.5">
              {module.checkpoints.map((cp, index) => {
                const isActive = index === currentCheckpointIndex;
                const isPast = index < currentCheckpointIndex;
                return (
                  <li
                    key={cp.checkpointId}
                    className={`flex items-center gap-2 rounded-lg p-2 text-sm transition-all duration-200 ${
                      isActive
                        ? isDark
                          ? "bg-blue-900/60 border border-blue-500 shadow-md"
                          : "bg-blue-100 border border-blue-400 shadow-md"
                        : isPast
                        ? isDark
                          ? "bg-green-900/30 border border-green-800"
                          : "bg-green-50 border border-green-200"
                        : isDark
                        ? "bg-gray-800/50 border border-gray-700 opacity-60"
                        : "bg-gray-50 border border-gray-200 opacity-60"
                    }`}
                  >
                    <div className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center">
                      {isPast ? (
                        <FiCheck className="text-green-500 text-xs" />
                      ) : isActive ? (
                        <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                      ) : (
                        <div className={`w-2 h-2 rounded-full ${isDark ? "bg-gray-600" : "bg-gray-300"}`} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`font-medium text-xs truncate ${isDark ? "text-gray-200" : "text-gray-800"}`}>
                        {index + 1}. {cp.title}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    );
  };

  const renderCenterPanel = () => {
    if (!currentCheckpoint) {
      return (
        <div className={`flex-1 flex items-center justify-center rounded-lg border ${isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"}`}>
          <p className={isDark ? "text-gray-400" : "text-gray-600"}>Loading checkpoint...</p>
        </div>
      );
    }

    const isNextDisabled = isAdvancing;
    const isPrevDisabled = isAdvancing || currentCheckpointIndex === 0;

    const handleRunCodeForTab = async (tabId: string) => {
      if (!roomIdFromUrl) return;
      if (tabId === "custom") {
        setRunOutput([]);
        setIsRunning(true);
        try {
          const res = await fetch(`http://${IP_ADDRESS}:3000/submit`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code, language, roomId: roomIdFromUrl, input: runInput, sessionId: runSessionIdRef.current }),
          });
          if (!res.ok) setRunOutput(["Failed to run code."]);
        } catch {
          setRunOutput(["Failed to connect to run server."]);
        } finally {
          setIsRunning(false);
        }
      } else if (tabId.startsWith("test-")) {
        const testIndex = parseInt(tabId.replace("test-", ""), 10);
        const testCase = currentCheckpoint?.testCases?.[testIndex];
        if (!testCase) return;
        setTestCaseOutputs((prev) => ({ ...prev, [testIndex]: [] }));
        setIsRunning(true);
        try {
          const res = await fetch(`http://${IP_ADDRESS}:3000/submit`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code, language, roomId: roomIdFromUrl, input: testCase.input || "", sessionId: `test-${testIndex}-${runSessionIdRef.current}` }),
          });
          if (!res.ok) setTestCaseOutputs((prev) => ({ ...prev, [testIndex]: ["Failed to run code."] }));
        } catch {
          setTestCaseOutputs((prev) => ({ ...prev, [testIndex]: ["Failed to connect to run server."] }));
        } finally {
          setIsRunning(false);
        }
      }
    };

    return (
      <div className="flex flex-col h-full gap-3">
        {/* Checkpoint Description Card */}
        <div className={`${isDark ? "bg-gray-900 border-gray-800" : "bg-blue-50 border-blue-200 shadow-lg"} border-2 rounded-lg p-4 flex-shrink-0 transition-all duration-200`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h2 className={`text-lg font-bold mb-1 ${isDark ? "text-white" : "text-gray-900"}`}>
                {currentCheckpoint.title}
              </h2>
              {module && (
                <p className={`text-xs mb-2 ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                  Checkpoint {currentCheckpointIndex + 1} of {module.checkpoints.length}
                </p>
              )}
              <div className={`prose prose-sm max-w-none ${isDark ? "prose-invert text-gray-300" : "text-gray-700"}`}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {normalizeForDisplay(currentCheckpoint.description)}
                </ReactMarkdown>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={handlePreviousCheckpoint}
                disabled={isPrevDisabled}
                className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1 transition-all ${isDark ? "bg-gray-800 hover:bg-gray-700 text-gray-300" : "bg-white hover:bg-gray-50 text-gray-700 border border-gray-300"} disabled:opacity-30`}
              >
                ← Prev
              </button>
              <button
                onClick={handleAdvanceCheckpoint}
                disabled={isNextDisabled}
                className="px-4 py-1.5 rounded-md bg-green-600 hover:bg-green-700 text-white text-sm font-medium disabled:opacity-50 flex items-center gap-1 transition-all shadow-md hover:shadow-lg"
              >
                {isAdvancing && <AiOutlineLoading3Quarters className="animate-spin" />}
                Next →
              </button>
            </div>
          </div>
        </div>

        {navError && (
          <div className={`rounded-lg border px-4 py-2 text-sm flex-shrink-0 ${isDark ? "bg-red-900/30 border-red-900 text-red-200" : "bg-red-50 border-red-200 text-red-700"}`}>
            {navError}
          </div>
        )}

        {/* Code Editor */}
        <div className={`flex-1 border-2 rounded-lg overflow-hidden shadow-2xl transition-all duration-200 ${isDark ? "border-gray-800" : "border-gray-300 bg-gray-50"}`}>
          <MonacoEditor
            value={code}
            language={language}
            theme={isDark ? "vs-dark" : "vs"}
            onMount={handleEditorDidMount}
            options={{ minimap: { enabled: false }, fontSize: 14, readOnly: !canEditCode }}
            height="100%"
          />
        </div>

        {/* I/O Panel - Collapsible like CodeEditor */}
        <div className={`${isDark ? "bg-gray-900 border-gray-800" : "bg-blue-50 border-blue-200 shadow-lg"} border-2 rounded-lg overflow-hidden flex-shrink-0 transition-all duration-200`}>
          <button
            onClick={() => setIsIoCollapsed(!isIoCollapsed)}
            className={`w-full px-3 py-2 flex items-center justify-between ${isDark ? "hover:bg-gray-800/50" : "hover:bg-blue-100/50 bg-blue-100/30"} transition-colors`}
          >
            <div className="flex items-center gap-2">
              <FiPlay className={isDark ? "text-blue-400" : "text-blue-600"} />
              <span className={`font-semibold text-sm ${isDark ? "text-gray-200" : "text-gray-900"}`}>Input / Output</span>
            </div>
            {isIoCollapsed ? <FiChevronDown /> : <FiChevronUp />}
          </button>
          
          {!isIoCollapsed && (
            <div className={`p-3 border-t ${isDark ? "border-gray-800" : "border-blue-200"}`}>
              {(() => {
                const ioTestCases = currentCheckpoint?.testCases;
                const activeTestIdx =
                  activeIOTab.startsWith("test-") && ioTestCases
                    ? parseInt(activeIOTab.replace("test-", ""), 10)
                    : -1;
                const activeTestValid =
                  activeTestIdx >= 0 && ioTestCases && activeTestIdx < ioTestCases.length;
                const activeRunResult =
                  activeTestValid && testResult?.results
                    ? testResult.results[activeTestIdx]
                    : undefined;
                const activeHasRunResult = activeRunResult !== undefined;

                return (
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <div className="flex gap-1 flex-1 min-w-0 overflow-x-auto">
                        <button
                          type="button"
                          onClick={() => setActiveIOTab("custom")}
                          className={`px-3 py-1.5 text-xs font-medium whitespace-nowrap rounded-md transition-all ${
                            activeIOTab === "custom"
                              ? "bg-blue-600 text-white shadow-md"
                              : isDark
                                ? "bg-gray-800 text-gray-400 hover:bg-gray-700"
                                : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
                          }`}
                        >
                          Custom I/O
                        </button>
                        {ioTestCases?.map((_, index) => {
                          const result = testResult?.results?.[index];
                          const passed = result?.passed;
                          const ran = result !== undefined;
                          return (
                            <button
                              type="button"
                              key={`test-${index}`}
                              onClick={() => setActiveIOTab(`test-${index}`)}
                              className={`px-3 py-1.5 text-xs font-medium whitespace-nowrap rounded-md transition-all flex items-center gap-1 ${
                                activeIOTab === `test-${index}`
                                  ? "bg-blue-600 text-white shadow-md"
                                  : isDark
                                    ? "bg-gray-800 text-gray-400 hover:bg-gray-700"
                                    : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
                              }`}
                            >
                              Test {index + 1}
                              {ran && (passed ? <FiCheck className="text-green-400" /> : <span className="text-red-400">✗</span>)}
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
                        {activeIOTab === "custom" && (
                          <button
                            type="button"
                            onClick={() => handleRunCodeForTab("custom")}
                            disabled={isRunning}
                            className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium disabled:opacity-50 flex items-center gap-1.5 transition-all shadow-md"
                          >
                            {isRunning ? <AiOutlineLoading3Quarters className="animate-spin" size={14} /> : <FiPlay size={14} />}
                            Run
                          </button>
                        )}
                        {activeIOTab.startsWith("test-") && activeTestValid && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleRunCodeForTab(`test-${activeTestIdx}`)}
                              disabled={isRunning}
                              className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium disabled:opacity-50 flex items-center gap-1.5 transition-all shadow-md"
                            >
                              {isRunning ? <AiOutlineLoading3Quarters className="animate-spin" size={14} /> : <FiPlay size={14} />}
                              Run
                            </button>
                            {activeHasRunResult && (
                              <span
                                className={`text-xs font-semibold whitespace-nowrap ${activeRunResult?.passed ? "text-green-500" : "text-red-500"}`}
                              >
                                {activeRunResult?.passed ? "✓ Passed" : "✗ Failed"}
                              </span>
                            )}
                          </>
                        )}
                        {ioTestCases && ioTestCases.length > 0 && (
                          <button
                            type="button"
                            onClick={handleRunTests}
                            disabled={isRunningTests}
                            className="px-3 py-1.5 rounded-md bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium disabled:opacity-50 flex items-center gap-1.5 shrink-0 transition-all shadow-md"
                          >
                            {isRunningTests && <AiOutlineLoading3Quarters className="animate-spin" size={14} />}
                            Run All Tests
                          </button>
                        )}
                      </div>
                    </div>
                );
              })()}

              {/* Tab Content */}
              {activeIOTab === "custom" && (
                <div className="flex gap-3 max-h-40 items-stretch">
                  <div className="flex-1 flex flex-col gap-1 min-h-0">
                    <label className={`text-xs font-medium ${isDark ? "text-gray-400" : "text-gray-600"}`}>Input</label>
                    <textarea
                      value={runInput}
                      onChange={(e) => setRunInput(e.target.value)}
                      placeholder="Enter input..."
                      className={`${isDark ? "bg-gray-800 border-gray-700 text-white placeholder-gray-500" : "bg-white border-gray-300 text-gray-900 placeholder-gray-500"} border w-full p-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs flex-1 min-h-0 resize-none transition`}
                    />
                  </div>
                  <div className="flex-1 flex flex-col gap-1 min-h-0">
                    <label className={`text-xs font-medium ${isDark ? "text-gray-400" : "text-gray-600"}`}>Output</label>
                    <div className={`${isDark ? "bg-gray-800 border-gray-700" : "bg-gray-100 border-gray-300"} border text-green-600 p-2 rounded-md overflow-y-auto font-mono text-xs flex-1 min-h-0 transition`}>
                      {runOutput.length > 0 ? runOutput.map((line, i) => <pre key={i} className="whitespace-pre-wrap">{normalizeForDisplay(line)}</pre>) : <p className={isDark ? "text-gray-500" : "text-gray-600"}>No output yet.</p>}
                    </div>
                  </div>
                </div>
              )}

              {activeIOTab.startsWith("test-") && (() => {
                const testIndex = parseInt(activeIOTab.replace("test-", ""), 10);
                const testCase = currentCheckpoint?.testCases?.[testIndex];
                if (!testCase) return null;
                const testOutput = testCaseOutputs[testIndex] || [];
                const runResult = testResult?.results?.[testIndex];
                const hasRunResult = runResult !== undefined;

                return (
                  <div className="flex gap-3 max-h-40 items-stretch">
                    <div className="flex-1 flex flex-col gap-1 min-h-0">
                      <label className={`text-xs font-medium ${isDark ? "text-gray-400" : "text-gray-600"}`}>Input (read-only)</label>
                      <pre className={`text-xs p-2 rounded-md border font-mono flex-1 min-h-0 overflow-y-auto ${isDark ? "bg-gray-800 border-gray-700 text-gray-300" : "bg-gray-50 border-gray-200 text-gray-700"}`}>
                        {testCase.input || "(empty)"}
                      </pre>
                    </div>
                    <div className="flex-1 flex flex-col gap-1 min-h-0">
                      <label className={`text-xs font-medium ${isDark ? "text-gray-400" : "text-gray-600"}`}>Expected</label>
                      <pre className={`text-xs p-2 rounded-md border font-mono flex-1 min-h-0 overflow-y-auto ${isDark ? "bg-green-900/30 border-green-800 text-green-300" : "bg-green-50 border-green-200 text-green-700"}`}>
                        {normalizeForDisplay(testCase.expectedOutput)}
                      </pre>
                    </div>
                    <div className="flex-1 flex flex-col gap-1 min-h-0">
                      <label className={`text-xs font-medium ${isDark ? "text-gray-400" : "text-gray-600"}`}>Actual</label>
                      <pre className={`text-xs p-2 rounded-md border font-mono flex-1 min-h-0 overflow-y-auto ${isDark ? "bg-gray-800 border-gray-700 text-gray-300" : "bg-gray-50 border-gray-200 text-gray-700"}`}>
                        {normalizeForDisplay(hasRunResult && runResult ? runResult.actualOutput : testOutput.join("\n")) || "(run to see output)"}
                      </pre>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* Explanation/Reflection sections for special checkpoints */}
        {isExplainCheckpoint && (
          <div className={`${isDark ? "bg-gray-900 border-gray-800" : "bg-yellow-50 border-yellow-200"} border-2 rounded-lg p-3 flex-shrink-0`}>
            <p className={`text-sm font-semibold mb-2 ${isDark ? "text-gray-200" : "text-gray-800"}`}>📝 Explain your understanding</p>
            <textarea
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              placeholder="Write your explanation in plain English..."
              className={`w-full rounded-md border p-2 text-sm ${isDark ? "bg-gray-800 border-gray-700 text-white" : "bg-white border-gray-300 text-gray-900"}`}
              rows={3}
            />
          </div>
        )}

        {isReflectionCheckpoint && (
          <div className={`${isDark ? "bg-gray-900 border-gray-800" : "bg-purple-50 border-purple-200"} border-2 rounded-lg p-3 flex-shrink-0`}>
            <p className={`text-sm font-semibold mb-2 ${isDark ? "text-gray-200" : "text-gray-800"}`}>💭 Reflect on what you learned</p>
            <textarea
              value={reflection}
              onChange={(e) => setReflection(e.target.value)}
              placeholder="What did you learn? What is still unclear?"
              className={`w-full rounded-md border p-2 text-sm ${isDark ? "bg-gray-800 border-gray-700 text-white" : "bg-white border-gray-300 text-gray-900"}`}
              rows={3}
            />
          </div>
        )}
      </div>
    );
  };

  const learningRoomChatShellClass = `${isDark ? "bg-gray-900 border-gray-800" : "bg-blue-50 border-blue-200 shadow-xl"} border-2 rounded-lg flex flex-col h-full min-h-0 transition-all duration-200`;

  const renderPersistentLearningChat = () => {
    if (!chatReady || !chatId || !socket) return null;
    return (
      <div
        className={`${learningRoomChatShellClass} ${activePanel === "chat" ? "flex" : "hidden"}`}
        aria-hidden={activePanel !== "chat"}
      >
        <h2 className={`text-xl font-bold p-3 border-b flex items-center gap-2 ${isDark ? "text-gray-300 border-gray-800" : "text-gray-900 border-blue-200 bg-blue-100/50"}`}>
          <FiMessageCircle /> Room Chat
        </h2>
        <div className="flex-1 min-h-0 overflow-hidden">
          <Chat
            socket={socket}
            chatId={chatId}
            userId={user.id}
            userName={user.name}
            IP_ADDRESS={IP_ADDRESS}
            panelActive={activePanel === "chat"}
            onLiveChatMessage={() => setChatPanelUnread(true)}
          />
        </div>
      </div>
    );
  };

  const renderRightPanel = () => {
    if (activePanel === "chat") {
      if (!chatReady || !chatId || !socket) {
        return (
          <div className={`${learningRoomChatShellClass} flex flex-col`}>
            <h2 className={`text-xl font-bold p-3 border-b flex items-center gap-2 ${isDark ? "text-gray-300 border-gray-800" : "text-gray-900 border-blue-200 bg-blue-100/50"}`}>
              <FiMessageCircle /> Room Chat
            </h2>
            <div className={`flex-1 flex items-center justify-center text-sm px-4 ${isDark ? "text-gray-500" : "text-gray-600 bg-gray-50"}`}>
              Chat is unavailable until the room is fully initialized.
            </div>
          </div>
        );
      }
      return renderPersistentLearningChat();
    }

    if (activePanel === "info") {
      return (
        <div className="flex flex-col flex-1 min-h-0 h-full">
          {renderPersistentLearningChat()}
        <div className={`flex flex-col flex-1 min-h-0 overflow-hidden ${isDark ? "bg-gray-900 border-gray-800" : "bg-blue-50 border-blue-200 shadow-xl"} border-2 rounded-lg transition-all duration-200`}>
          <h2 className={`text-xl font-bold p-3 border-b flex items-center gap-2 ${isDark ? "text-gray-300 border-gray-800" : "text-gray-900 border-blue-200 bg-blue-100/50"}`}>
            <FiUsers /> Room
          </h2>
          <div className="p-4 flex-1 flex flex-col gap-4 overflow-y-auto">
            <div>
              <h3 className={`text-sm font-semibold mb-2 flex items-center gap-2 ${isDark ? "text-gray-200" : "text-gray-800"}`}>
                <FiUsers /> Members
              </h3>
              <div className="space-y-3">
                {connectedUsers.length > 0 ? (
                  connectedUsers.map((u: any) => (
                    <div key={u.id} className={`flex items-center gap-3 rounded-lg p-3 border ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-300 shadow-sm"}`}>
                      <div className="w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center text-lg font-bold">
                        {u.name?.charAt(0).toUpperCase() || "?"}
                      </div>
                      <div>
                        <p className={`text-sm font-semibold ${isDark ? "text-gray-200" : "text-gray-800"}`}>{u.name}</p>
                        <p className={`text-xs truncate ${isDark ? "text-gray-400" : "text-gray-600"}`}>{u.id}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className={`text-sm text-center ${isDark ? "text-gray-500" : "text-gray-600"}`}>No other users connected.</p>
                )}
              </div>
            </div>
            <div>
              <h3 className={`text-sm font-semibold mb-2 flex items-center gap-2 ${isDark ? "text-gray-200" : "text-gray-800"}`}>
                <FiHash /> Invite Code
              </h3>
              <p className={`text-xs mb-1 ${isDark ? "text-gray-400" : "text-gray-600"}`}>Share this room code with your teammates</p>
              <div className="flex items-center gap-2">
                <p className={`text-green-600 font-mono ${isDark ? "bg-gray-800" : "bg-white border border-gray-300"} p-2 rounded select-all w-full truncate`}>{roomIdFromUrl || '...'}</p>
                <button onClick={handleCopy} className={`${isDark ? "bg-gray-700 hover:bg-gray-600" : "bg-blue-100 hover:bg-blue-200 border border-blue-300 text-blue-700"} p-2 rounded-md transition`}>
                  {isCopied ? <AiOutlineCheck /> : <AiOutlineCopy />}
                </button>
              </div>
            </div>
          </div>
        </div>
        </div>
      );
    }

    // Default: AI Guide
    return (
      <div className="flex flex-col flex-1 min-h-0 h-full">
        {renderPersistentLearningChat()}
      <div className={`flex flex-col flex-1 min-h-0 overflow-hidden ${isDark ? "bg-gray-900 border-gray-800" : "bg-blue-50 border-blue-200 shadow-xl"} border-2 rounded-lg transition-all duration-200`}>
        <h2 className={`text-xl font-bold p-3 border-b flex items-center gap-2 ${isDark ? "text-gray-300 border-gray-800" : "text-gray-900 border-blue-200 bg-blue-100/50"}`}>
          <FiBox /> AI Guide
        </h2>
        <div className="flex-grow p-4 overflow-y-auto space-y-4">
          {aiMessages.length === 0 && (
            <p className={`text-center mt-4 ${isDark ? "text-gray-500" : "text-gray-600"}`}>
              Ask the AI guide about this checkpoint. It responds in <strong>{currentAiMode || "tutor"}</strong> mode.
            </p>
          )}
          {aiMessages.map((msg, idx) => (
            <div key={idx} className={`flex items-start gap-3 ${msg.sender === 'user' ? 'justify-end' : ''}`}>
              {msg.sender === 'ai' && <div className="w-8 h-8 rounded-full bg-blue-500 flex-shrink-0 flex items-center justify-center font-bold text-white">A</div>}
              <div className={`max-w-xs md:max-w-md lg:max-w-sm rounded-2xl px-4 py-2.5 shadow-sm transition-all ${msg.sender === 'user' ? (isDark ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-blue-500 text-white rounded-tr-sm border border-blue-600') : (isDark ? 'bg-gray-800' : 'bg-white border border-gray-300')} ${msg.sender === 'user' ? 'text-white' : (isDark ? 'text-gray-300' : 'text-gray-800')}`}>
                {msg.sender === 'ai' ? (
                  <div className={`text-sm prose ${isDark ? "prose-invert" : ""} prose-sm max-w-none`}>
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        code: ({ node, inline, className, children, ...props }: any) => {
                          const match = /language-(\w+)/.exec(className || '');
                          return !inline && match ? (
                            <pre className={`${isDark ? "bg-gray-900" : "bg-gray-200"} rounded p-2 overflow-x-auto my-2`}>
                              <code className={className} {...props}>{children}</code>
                            </pre>
                          ) : (
                            <code className={`${isDark ? "bg-gray-900" : "bg-gray-200"} px-1 py-0.5 rounded text-xs`} {...props}>{children}</code>
                          );
                        },
                        p: ({ children }: any) => <p className="mb-2 last:mb-0">{children}</p>,
                        ul: ({ children }: any) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
                        ol: ({ children }: any) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
                        li: ({ children }: any) => <li className="text-sm">{children}</li>,
                      }}
                    >
                      {msg.text}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                )}
              </div>
            </div>
          ))}
          {isAiLoading && (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-500 flex-shrink-0 flex items-center justify-center font-bold text-white">A</div>
              <div className={`max-w-xs md:max-w-md lg:max-w-sm rounded-lg px-4 py-2 ${isDark ? "bg-gray-800" : "bg-gray-100"}`}>
                <AiOutlineLoading3Quarters className={`animate-spin ${isDark ? "text-gray-400" : "text-gray-600"}`} />
              </div>
            </div>
          )}
          <div ref={aiChatEndRef} />
        </div>
        <form onSubmit={handleAiSubmit} className={`p-3 border-t flex gap-2 ${isDark ? "border-gray-800" : "border-blue-200 bg-blue-50/30"}`}>
          <input
            type="text"
            value={aiInput}
            onChange={(e) => setAiInput(e.target.value)}
            placeholder="Ask the AI about this checkpoint..."
            className={`${isDark ? "bg-gray-800 border-gray-700 text-white placeholder-gray-500" : "bg-white border-gray-300 text-gray-900 placeholder-gray-500 hover:border-blue-400"} border w-full p-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm transition`}
            disabled={isAiLoading}
          />
          <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white p-2.5 rounded-lg disabled:opacity-50 transition-all shadow-md hover:shadow-lg transform hover:scale-105 active:scale-95" disabled={isAiLoading || !aiInput.trim()}>
            <AiOutlineSend size={20} />
          </button>
        </form>
      </div>
      </div>
    );
  };

  return (
    <div
      className={`h-screen font-sans flex overflow-hidden ${
        isDark ? "bg-black text-gray-200" : "bg-gradient-to-br from-gray-50 to-blue-50"
      }`}
    >
      {/* Toast overlay */}
      {toast && (
        <div className="fixed inset-0 z-[9999] pointer-events-none flex items-start justify-end">
          <div
            className={`mt-4 mr-4 px-4 py-2 rounded-lg shadow-lg text-sm pointer-events-auto flex items-start gap-3 ${
              toast.type === "success"
                ? "bg-green-600 text-white"
                : "bg-red-600 text-white"
            }`}
          >
            <span className="flex-1">{toast.message}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="ml-2 text-xs font-semibold hover:opacity-80"
            >
              ×
            </button>
          </div>
        </div>
      )}
      <Sidebar
        showRooms
        onOpenAccount={() => setIsAccountOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />
      <div className="flex flex-col flex-1 w-full gap-4 p-4 overflow-hidden">
        {/* Navigation Bar - matching CodeEditor style */}
        <nav className={`${isDark ? "bg-gray-900 border-gray-800" : "bg-blue-50/80 backdrop-blur-sm border-blue-200 shadow-lg"} border rounded-xl px-4 py-3 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between transition-all duration-200`}>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSidebarOpen((v) => !v)}
              className={`hidden lg:inline-flex items-center justify-center w-9 h-9 rounded-md border ${isDark ? "bg-gray-800 hover:bg-gray-700 text-gray-200 border-gray-700" : "bg-gray-100 hover:bg-gray-200 text-gray-800 border-gray-300"}`}
            >
              {isSidebarOpen ? <FiChevronsLeft size={18} /> : <FiChevronsRight size={18} />}
            </button>
            <button
              onClick={() => roomIdFromUrl && navigate(`/code/${roomIdFromUrl}`)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all hover:scale-105 active:scale-95 ${isDark ? "bg-gray-800 hover:bg-gray-700 border-gray-700 text-gray-200" : "bg-white hover:bg-gray-50 border-gray-300 text-gray-800 shadow-sm"}`}
            >
              <span>←</span>
              <span>Back to Editor</span>
            </button>
            <div>
              <span className={`text-2xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>CoLearn</span>
              <span className={`text-xs px-2 py-1 rounded-full ml-2 ${isDark ? "text-gray-500 bg-gray-800" : "text-blue-700 bg-blue-100 border border-blue-200"}`}>
                Module · {roomDisplayName ? `${roomDisplayName} · ${roomLabel}` : roomLabel}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <button
              type="button"
              onClick={() => setActivePanel("ai")}
              title={aiPanelUnread ? "New AI messages" : undefined}
              className={`relative px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 transition-all duration-200 ${activePanel === 'ai' ? 'bg-blue-600 text-white shadow-md' : (isDark ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-white text-gray-700 hover:bg-blue-50 border border-gray-300')} hover:scale-105 active:scale-95`}
            >
              <FiBox /> AI Guide
              {aiPanelUnread && (
                <span
                  className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500 shadow-sm"
                  aria-hidden
                />
              )}
            </button>
            <button
              type="button"
              onClick={() => setActivePanel("chat")}
              title={chatPanelUnread ? "New chat messages" : undefined}
              className={`relative px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 transition-all duration-200 ${activePanel === 'chat' ? 'bg-blue-600 text-white shadow-md' : (isDark ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200')} hover:scale-105 active:scale-95`}
            >
              <FiMessageCircle /> Chat
              {chatPanelUnread && (
                <span
                  className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500 shadow-sm"
                  aria-hidden
                />
              )}
            </button>
            <button
              onClick={() => setActivePanel("info")}
              className={`px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 transition-all duration-200 ${activePanel === 'info' ? 'bg-blue-600 text-white shadow-md' : (isDark ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200')} hover:scale-105 active:scale-95`}
            >
              <FiUsers /> Room
            </button>
          </div>
        </nav>

        {/* Main Content - Flex Layout */}
        <div className="flex flex-1 gap-4 overflow-hidden flex-col lg:flex-row">
          {/* Left: Checkpoints Panel */}
          <div className={`lg:w-64 flex-shrink-0 ${isCheckpointsCollapsed ? 'h-auto' : 'h-full lg:h-auto'}`}>
            {renderCheckpointList()}
          </div>

          {/* Center: Code Editor + I/O */}
          <div className="flex flex-col flex-1 overflow-hidden min-w-0">
            {renderCenterPanel()}
          </div>

          {/* Right: AI/Chat/Info Panel */}
          <div className="flex flex-col lg:w-1/3 flex-1 lg:flex-initial">
            {renderRightPanel()}
          </div>
        </div>
      </div>
      <AccountModal
        isOpen={isAccountOpen}
        onClose={() => setIsAccountOpen(false)}
      />
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
};

export default LearningRoom;