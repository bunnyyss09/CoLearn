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
import { lumenWorkspace } from "../workspace/lumenTheme";

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
  const [chatId, setChatId] = useState<string>("");
  const theme = useRecoilValue(themeAtom);
  const isDark = theme === "dark";
  const lm = lumenWorkspace(isDark);
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
      <div className={`flex h-full min-h-0 flex-col border-lumen-line ${lm.rail}`}>
        <button
          type="button"
          onClick={() => setIsCheckpointsCollapsed(!isCheckpointsCollapsed)}
          className={`flex w-full items-center justify-between border-b border-lumen-line px-3 py-2.5 text-left transition hover:bg-lumen-signal/5`}
        >
          <div>
            <p className="font-display text-[10px] font-bold uppercase tracking-[0.25em] text-lumen-signal">Curriculum</p>
            <p className={`mt-0.5 font-mono text-[11px] ${lm.hi}`}>{module.title}</p>
          </div>
          <span className={`rounded border border-lumen-line px-1.5 py-0.5 font-mono text-[10px] ${lm.pill}`}>
            {completedCount}/{totalCount}
          </span>
          {isCheckpointsCollapsed ? <FiChevronDown className={lm.muted} /> : <FiChevronUp className="text-lumen-signal" />}
        </button>

        {!isCheckpointsCollapsed && (
          <div className="relative flex-1 overflow-y-auto px-2 py-3">
            <div className={`mb-3 px-2 text-[10px] ${lm.muted}`}>
              {module.language} · {module.difficulty} · ~{module.estimatedTimeMinutes}m
            </div>
            <div className="absolute bottom-3 left-[13px] top-14 w-px bg-lumen-line" aria-hidden />
            <ul className="relative space-y-0">
              {module.checkpoints.map((cp, index) => {
                const isActive = index === currentCheckpointIndex;
                const isPast = index < currentCheckpointIndex;
                return (
                  <li key={cp.checkpointId} className="relative flex gap-3 pl-1">
                    <div className="relative z-10 flex w-6 shrink-0 justify-center pt-0.5">
                      <span
                        className={`flex h-5 w-5 items-center justify-center rounded-full border text-[9px] font-bold ${
                          isActive
                            ? "border-lumen-signal bg-lumen-signal/20 text-lumen-signal shadow-signal"
                            : isPast
                              ? "border-lumen-ok/50 bg-lumen-ok/10 text-lumen-ok"
                              : "border-lumen-line bg-lumen-panel text-zinc-600"
                        }`}
                      >
                        {isPast ? <FiCheck className="h-3 w-3" /> : index + 1}
                      </span>
                    </div>
                    <div
                      className={`mb-3 min-w-0 flex-1 rounded-md border px-2 py-1.5 ${
                        isActive
                          ? "border-lumen-signal/50 bg-lumen-signal/5"
                          : isPast
                            ? "border-lumen-line/60 opacity-70"
                            : "border-lumen-line/40 opacity-50"
                      }`}
                    >
                      <p className={`text-[11px] font-medium leading-tight ${isActive ? lm.hi : lm.muted}`}>{cp.title}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className={`mx-2 mt-1 h-1 overflow-hidden rounded-full ${isDark ? "bg-lumen-ink" : "bg-zinc-200"}`}>
              <div className="h-full bg-lumen-signal transition-all duration-700" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderCenterPanel = () => {
    if (!currentCheckpoint) {
      return (
        <div className={`flex flex-1 items-center justify-center border border-lumen-line font-mono text-xs ${lm.inset}`}>
          <p className={lm.muted}>Loading checkpoint…</p>
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
      <div className="flex h-full min-h-0 flex-col gap-2">
        <div className={`flex-shrink-0 border border-lumen-line ${lm.briefing}`}>
          <div className="flex flex-col gap-3 p-4 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0 flex-1 border-l-2 border-lumen-signal pl-3">
              <p className="font-display text-[10px] font-bold uppercase tracking-[0.3em] text-lumen-signal">Briefing</p>
              <h2 className={`mt-1 font-display text-xl font-bold leading-tight md:text-2xl ${lm.hi}`}>{currentCheckpoint.title}</h2>
              {module && (
                <p className={`mt-1 font-mono text-[11px] ${lm.muted}`}>
                  Segment {currentCheckpointIndex + 1} / {module.checkpoints.length}
                </p>
              )}
              <div className={`prose prose-sm mt-3 max-w-none ${isDark ? "prose-invert prose-p:text-zinc-400" : "prose-p:text-zinc-700"}`}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{normalizeForDisplay(currentCheckpoint.description)}</ReactMarkdown>
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={handlePreviousCheckpoint}
                disabled={isPrevDisabled}
                className={`rounded-md border border-lumen-line px-3 py-2 font-display text-[10px] font-bold uppercase tracking-wider transition disabled:opacity-30 ${lm.inset}`}
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={handleAdvanceCheckpoint}
                disabled={isNextDisabled}
                className={`flex items-center gap-2 rounded-md px-4 py-2 font-display text-[10px] font-bold uppercase tracking-wider text-white transition disabled:opacity-45 ${lm.run}`}
              >
                {isAdvancing && <AiOutlineLoading3Quarters className="h-4 w-4 animate-spin" />}
                Advance →
              </button>
            </div>
          </div>
        </div>

        {navError && (
          <div className="flex-shrink-0 border border-lumen-heat/40 bg-lumen-heat/10 px-3 py-2 font-mono text-xs text-lumen-heatGlow">
            {navError}
          </div>
        )}

        <div className={`min-h-0 flex-1 overflow-hidden border border-lumen-line ${lm.editorFrame}`}>
          <MonacoEditor
            value={code}
            language={language}
            theme={isDark ? "vs-dark" : "vs"}
            onMount={handleEditorDidMount}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              readOnly: !canEditCode,
              fontFamily: "'IBM Plex Mono', monospace",
            }}
            height="100%"
          />
        </div>

        <div className={`flex-shrink-0 overflow-hidden border border-lumen-line ${lm.bar}`}>
          <button
            type="button"
            onClick={() => setIsIoCollapsed(!isIoCollapsed)}
            className={`flex w-full items-center justify-between border-b border-lumen-line px-3 py-2 transition hover:bg-lumen-signal/5`}
          >
            <div className="flex items-center gap-2 font-display text-[10px] font-bold uppercase tracking-[0.2em] text-lumen-signal">
              <FiPlay className="h-3.5 w-3.5" />
              Runspace
            </div>
            {isIoCollapsed ? <FiChevronDown className={lm.muted} /> : <FiChevronUp className="text-lumen-signal" />}
          </button>

          {!isIoCollapsed && (
            <div className="border-t border-lumen-line p-3">
              {/* Tabs */}
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <div className="flex gap-1 flex-1 min-w-0 overflow-x-auto">
                  <button
                    type="button"
                    onClick={() => setActiveIOTab("custom")}
                    className={`whitespace-nowrap rounded-md border px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider transition-all ${
                      activeIOTab === "custom"
                        ? "border-lumen-signal bg-lumen-signal/15 text-lumen-signal"
                        : `border-lumen-line ${lm.muted} hover:border-lumen-signal/40`
                    }`}
                  >
                    Custom I/O
                  </button>
                  {currentCheckpoint?.testCases?.map((_, index) => {
                    const result = testResult?.results?.[index];
                    const passed = result?.passed;
                    const ran = result !== undefined;
                    return (
                      <button
                        type="button"
                        key={`test-${index}`}
                        onClick={() => setActiveIOTab(`test-${index}`)}
                        className={`flex items-center gap-1 whitespace-nowrap rounded-md border px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider transition-all ${
                          activeIOTab === `test-${index}`
                            ? "border-lumen-signal bg-lumen-signal/15 text-lumen-signal"
                            : `border-lumen-line ${lm.muted}`
                        }`}
                      >
                        Test {index + 1}
                        {ran && (passed ? <FiCheck className="text-green-400" /> : <span className="text-red-400">✗</span>)}
                      </button>
                    );
                  })}
                </div>
                {currentCheckpoint?.testCases && currentCheckpoint.testCases.length > 0 && (
                  <button
                    type="button"
                    onClick={handleRunTests}
                    disabled={isRunningTests}
                    className="flex shrink-0 items-center gap-1.5 rounded-md border border-lumen-warn/50 bg-lumen-warn/20 px-3 py-1.5 font-display text-[10px] font-bold uppercase tracking-wider text-lumen-warn transition disabled:opacity-50"
                  >
                    {isRunningTests && <AiOutlineLoading3Quarters className="animate-spin" />}
                    Run All Tests
                  </button>
                )}
              </div>

              {/* Tab Content */}
              {activeIOTab === "custom" && (
                <div className="flex gap-3 max-h-40">
                  <div className="flex-1 flex flex-col gap-1">
                    <label className={`text-[10px] font-bold uppercase tracking-wider ${lm.muted}`}>Input</label>
                    <textarea
                      value={runInput}
                      onChange={(e) => setRunInput(e.target.value)}
                      placeholder="stdin…"
                      className={`min-h-[5rem] w-full flex-1 resize-none rounded-md border p-2 text-xs ${lm.input}`}
                    />
                  </div>
                  <div className="flex flex-col gap-1 items-center justify-center">
                    <button
                      type="button"
                      onClick={() => handleRunCodeForTab("custom")}
                      disabled={isRunning}
                      className={`flex items-center gap-1.5 rounded-md px-4 py-2 text-[10px] font-bold uppercase tracking-wider disabled:opacity-50 ${lm.run}`}
                    >
                      {isRunning ? <AiOutlineLoading3Quarters className="animate-spin" /> : <FiPlay size={14} />}
                      Run
                    </button>
                  </div>
                  <div className="flex-1 flex flex-col gap-1">
                    <label className={`text-[10px] font-bold uppercase tracking-wider ${lm.muted}`}>Output</label>
                    <div className={`min-h-[5rem] flex-1 overflow-y-auto rounded-md border border-lumen-line p-2 font-mono text-xs ${lm.console}`}>
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
                const passed = runResult?.passed;
                const hasRunResult = runResult !== undefined;

                return (
                  <div className="flex gap-3 max-h-40">
                    <div className="flex-1 flex flex-col gap-1">
                      <label className={`text-xs font-medium ${isDark ? "text-gray-400" : "text-gray-600"}`}>Input (read-only)</label>
                      <pre className={`text-xs p-2 rounded-md border font-mono flex-1 overflow-y-auto ${isDark ? "bg-gray-800 border-gray-700 text-gray-300" : "bg-gray-50 border-gray-200 text-gray-700"}`}>
                        {testCase.input || "(empty)"}
                      </pre>
                    </div>
                    <div className="flex flex-col gap-1 items-center justify-center">
                      <button
                        onClick={() => handleRunCodeForTab(`test-${testIndex}`)}
                        disabled={isRunning}
                        className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50 flex items-center gap-1.5 transition-all shadow-md"
                      >
                        {isRunning ? <AiOutlineLoading3Quarters className="animate-spin" /> : <FiPlay size={14} />}
                        Run
                      </button>
                      {hasRunResult && (
                        <span className={`text-xs font-semibold ${passed ? "text-green-500" : "text-red-500"}`}>
                          {passed ? "✓ Passed" : "✗ Failed"}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 flex flex-col gap-1">
                      <label className={`text-xs font-medium ${isDark ? "text-gray-400" : "text-gray-600"}`}>Expected</label>
                      <pre className={`text-xs p-2 rounded-md border font-mono flex-1 overflow-y-auto ${isDark ? "bg-green-900/30 border-green-800 text-green-300" : "bg-green-50 border-green-200 text-green-700"}`}>
                        {normalizeForDisplay(testCase.expectedOutput)}
                      </pre>
                    </div>
                    <div className="flex-1 flex flex-col gap-1">
                      <label className={`text-xs font-medium ${isDark ? "text-gray-400" : "text-gray-600"}`}>Actual</label>
                      <pre className={`text-xs p-2 rounded-md border font-mono flex-1 overflow-y-auto ${isDark ? "bg-gray-800 border-gray-700 text-gray-300" : "bg-gray-50 border-gray-200 text-gray-700"}`}>
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
          <div className={`flex-shrink-0 border border-lumen-warn/30 bg-lumen-warn/5 p-3 ${lm.briefing}`}>
            <p className="mb-2 font-display text-[10px] font-bold uppercase tracking-[0.2em] text-lumen-warn">Explanation required</p>
            <textarea
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              placeholder="Plain-language explanation…"
              className={`min-h-[5rem] w-full resize-y rounded-md border p-2 text-sm ${lm.input}`}
              rows={3}
            />
          </div>
        )}

        {isReflectionCheckpoint && (
          <div className={`flex-shrink-0 border border-lumen-signal/30 bg-lumen-signal/5 p-3 ${lm.briefing}`}>
            <p className="mb-2 font-display text-[10px] font-bold uppercase tracking-[0.2em] text-lumen-signal">Reflection</p>
            <textarea
              value={reflection}
              onChange={(e) => setReflection(e.target.value)}
              placeholder="What stuck? What is still fuzzy?"
              className={`min-h-[5rem] w-full resize-y rounded-md border p-2 text-sm ${lm.input}`}
              rows={3}
            />
          </div>
        )}
      </div>
    );
  };

  const renderRightPanel = () => {
    if (activePanel === "chat") {
      return (
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex items-center gap-2 border-b border-lumen-line px-3 py-2 font-display text-[10px] font-bold uppercase tracking-[0.2em] text-lumen-signal">
            <FiMessageCircle className="h-3.5 w-3.5" />
            Squad
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            {chatReady && chatId && socket ? (
              <Chat socket={socket} chatId={chatId} userId={user.id} userName={user.name} IP_ADDRESS={IP_ADDRESS} />
            ) : (
              <div className={`flex flex-1 items-center justify-center p-4 text-center text-xs ${lm.muted}`}>Connecting…</div>
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
            Lab bench
          </div>
          <div className="flex flex-col gap-4 p-3">
            <div>
              <h3 className={`mb-2 flex items-center gap-2 font-display text-[10px] font-bold uppercase tracking-wider ${lm.muted}`}>
                <FiUsers /> Here now
              </h3>
              <div className="space-y-2">
                {connectedUsers.length > 0 ? (
                  connectedUsers.map((u: any) => (
                    <div key={u.id} className={`flex items-center gap-3 rounded-md border p-2 ${lm.inset}`}>
                      <div className="flex h-9 w-9 items-center justify-center rounded border border-lumen-signal/30 bg-lumen-signal/10 font-display text-sm font-bold text-lumen-signal">
                        {u.name?.charAt(0).toUpperCase() || "?"}
                      </div>
                      <div className="min-w-0">
                        <p className={`truncate text-xs font-semibold ${lm.hi}`}>{u.name}</p>
                        <p className={`truncate font-mono text-[10px] ${lm.muted}`}>{u.id}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className={`text-center text-xs ${lm.muted}`}>Just you.</p>
                )}
              </div>
            </div>
            <div>
              <h3 className={`mb-2 flex items-center gap-2 font-display text-[10px] font-bold uppercase tracking-wider ${lm.muted}`}>
                <FiHash /> Room id
              </h3>
              <div className="flex gap-2">
                <code className={`flex-1 select-all rounded-md border border-lumen-line bg-lumen-void p-2 font-mono text-xs text-lumen-ok`}>
                  {roomIdFromUrl || "…"}
                </code>
                <button
                  type="button"
                  onClick={handleCopy}
                  className={`rounded-md border border-lumen-line px-3 ${isDark ? "bg-lumen-lift" : "bg-zinc-100"}`}
                >
                  {isCopied ? <AiOutlineCheck /> : <AiOutlineCopy />}
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-lumen-line px-3 py-2">
          <div className="flex items-center gap-2 font-display text-[10px] font-bold uppercase tracking-[0.2em] text-lumen-signal">
            <FiBox className="h-3.5 w-3.5" />
            Guide
          </div>
          <span className={`rounded border border-lumen-line px-1.5 py-0.5 font-mono text-[9px] uppercase text-lumen-signal`}>{currentAiMode || "auto"}</span>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
          {aiMessages.length === 0 && (
            <p className={`text-center text-xs ${lm.muted}`}>Ask about this checkpoint — mode: {currentAiMode || "tutor"}.</p>
          )}
          {aiMessages.map((msg, idx) => (
            <div key={idx} className={`flex items-start gap-2 ${msg.sender === "user" ? "justify-end" : ""}`}>
              {msg.sender === "ai" && (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-cyan-500/40 bg-cyan-500/10 font-display text-[10px] font-bold text-cyan-400">
                  AI
                </div>
              )}
              <div
                className={`max-w-[94%] rounded-lg border px-3 py-2 text-xs leading-relaxed ${
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
                  <div className={`prose prose-sm max-w-none ${isDark ? "prose-invert" : ""}`}>
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        code: ({ node, inline, className, children, ...props }: any) => {
                          const match = /language-(\w+)/.exec(className || "");
                          return !inline && match ? (
                            <pre className={`my-2 overflow-x-auto rounded p-2 ${isDark ? "bg-lumen-void" : "bg-zinc-100"}`}>
                              <code className={className} {...props}>
                                {children}
                              </code>
                            </pre>
                          ) : (
                            <code className={`rounded px-1 py-0.5 text-[11px] ${isDark ? "bg-lumen-void" : "bg-zinc-100"}`} {...props}>
                              {children}
                            </code>
                          );
                        },
                        p: ({ children }: any) => <p className="mb-2 last:mb-0">{children}</p>,
                        ul: ({ children }: any) => <ul className="mb-2 list-inside list-disc space-y-1">{children}</ul>,
                        ol: ({ children }: any) => <ol className="mb-2 list-inside list-decimal space-y-1">{children}</ol>,
                        li: ({ children }: any) => <li className="text-xs">{children}</li>,
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
          ))}
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
            placeholder="Ask the guide…"
            className={`min-w-0 flex-1 rounded-md border p-2 text-xs ${lm.input}`}
            disabled={isAiLoading}
          />
          <button type="submit" className={`rounded-md px-3 py-2 disabled:opacity-40 ${lm.run}`} disabled={isAiLoading || !aiInput.trim()}>
            <AiOutlineSend className="h-4 w-4" />
          </button>
        </form>
      </div>
    );
  };

  const studioTab = (id: ActivePanel, label: string, Icon: typeof FiBox) => (
    <button
      type="button"
      onClick={() => setActivePanel(id)}
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
      {toast && (
        <div className="pointer-events-none fixed inset-0 z-[9999] flex items-start justify-end p-4">
          <div
            className={`animate-slide-in-right pointer-events-auto flex max-w-sm items-start gap-3 border border-lumen-line px-4 py-3 font-mono text-xs shadow-2xl ${
              toast.type === "success" ? "bg-lumen-ok/95 text-lumen-void" : "bg-lumen-heat text-white"
            }`}
          >
            <span className="flex-1">{toast.message}</span>
            <button type="button" onClick={() => setToast(null)} className="font-bold hover:opacity-80">
              ×
            </button>
          </div>
        </div>
      )}
      <Sidebar showRooms onOpenAccount={() => setIsAccountOpen(true)} onOpenSettings={() => setIsSettingsOpen(true)} />
      <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col">
        <header className={`flex flex-shrink-0 flex-wrap items-center gap-3 border-b px-3 py-2 ${lm.header}`}>
          <button
            type="button"
            onClick={() => setIsSidebarOpen((v) => !v)}
            className={`hidden h-9 w-9 items-center justify-center rounded border border-lumen-line lg:flex ${lm.inset}`}
          >
            {isSidebarOpen ? <FiChevronsLeft className="h-4 w-4 text-lumen-signal" /> : <FiChevronsRight className="h-4 w-4 text-lumen-signal" />}
          </button>
          <button
            type="button"
            onClick={() => roomIdFromUrl && navigate(`/code/${roomIdFromUrl}`)}
            className={`rounded border border-lumen-line px-3 py-1.5 font-display text-[10px] font-bold uppercase tracking-widest transition hover:border-lumen-signal/50 ${lm.inset}`}
          >
            ← Editor
          </button>
          <span className="font-display text-lg font-extrabold tracking-tighter text-lumen-signal">STUDIO</span>
          <code className={`rounded border px-2 py-0.5 font-mono text-[11px] ${lm.pill}`}>{roomLabel}</code>
          <div className="flex-1" />
        </header>
        <div className={`flex flex-shrink-0 border-b px-2 ${lm.bar}`}>
          <div className="flex">{studioTab("ai", "Guide", FiBox)}{studioTab("chat", "Chat", FiMessageCircle)}{studioTab("info", "Bench", FiUsers)}</div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
          <div className={`max-h-[40vh] shrink-0 overflow-hidden border-b border-lumen-line lg:max-h-none lg:w-[260px] lg:border-b-0 lg:border-r`}>
            {renderCheckpointList()}
          </div>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-2 py-2 lg:px-3">
            {renderCenterPanel()}
          </div>
          <aside
            className={`flex max-h-[50vh] min-h-0 w-full flex-col overflow-hidden border-lumen-line lg:max-h-none lg:w-[min(100vw,400px)] lg:flex-shrink-0 lg:border-l lg:border-t-0 ${lm.rail}`}
          >
            {renderRightPanel()}
          </aside>
        </div>
      </div>
      <AccountModal isOpen={isAccountOpen} onClose={() => setIsAccountOpen(false)} />
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
};

export default LearningRoom;