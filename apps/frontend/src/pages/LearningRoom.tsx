import React, { useEffect, useState, useRef } from "react";
import MonacoEditor from "@monaco-editor/react";
// @ts-ignore - library has no bundled types
import SplitPane from "react-split-pane";
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
// Local alias to keep SplitPane typing simple in this file.
const AnySplitPane: any = SplitPane;
import {
  FiChevronsLeft,
  FiChevronsRight,
  FiMessageCircle,
  FiUsers,
  FiBox,
} from "react-icons/fi";
import { AiOutlineSend, AiOutlineLoading3Quarters } from "react-icons/ai";

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

const loadSize = (key: string, fallback: number) => {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : fallback;
};

const saveSize = (key: string, value: number) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, String(value));
};

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
  const [isSidebarOpen, setIsSidebarOpen] =
    useRecoilState(sidebarOpenAtom);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [module, setModule] = useState<LearningModule | null>(null);
  const [progress, setProgress] = useState<LearningProgress | null>(null);
  const [currentCheckpointIndex, setCurrentCheckpointIndex] =
    useState<number>(0);

  const [code, setCode] = useState<string>("# Python\n# Loading checkpoint...\n");
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
  const [ioPanelCollapsed, setIoPanelCollapsed] = useState(false);
  const [activeIOTab, setActiveIOTab] = useState<string>("custom");
  const [testCaseOutputs, setTestCaseOutputs] = useState<Record<number, string[]>>({});

  const roomIdFromUrl = params.roomId || user.roomId;

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

  // Apply starter code when checkpoint changes; clear run/test state
  useEffect(() => {
    if (!currentCheckpoint) return;
    if (currentCheckpoint.starterCode) {
      setCode(currentCheckpoint.starterCode);
    }
    setTestResult(null);
     setRunInput("");
     setRunOutput([]);
     setTestCaseOutputs({});
     setActiveIOTab("custom");
     setNavError(null);
  }, [currentCheckpoint?.checkpointId]);

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
      if (data.type === "code") setCode(data.code);
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
      if (currentCode !== code && socket?.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({
            type: "code",
            code: currentCode,
            roomId: roomIdFromUrl,
          })
        );
      }
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

  const renderCheckpointList = () => {
    if (!module) return null;
    return (
      <div
        className={`border rounded-lg p-4 h-full overflow-y-auto ${
          isDark ? "bg-gray-900 border-gray-800" : "bg-blue-50 border-blue-200"
        }`}
      >
        <div className="mb-2">
          <h2
            className={`text-lg font-semibold ${
              isDark ? "text-gray-200" : "text-gray-800"
            }`}
          >
            {module.title}
          </h2>
        </div>
        <p
          className={`text-xs mb-4 ${
            isDark ? "text-gray-400" : "text-gray-600"
          }`}
        >
          Language: {module.language} · Difficulty: {module.difficulty} ·
          Est. {module.estimatedTimeMinutes} min
        </p>
        <ul className="space-y-2">
          {module.checkpoints.map((cp, index) => {
            const cpProgress = progress?.checkpoints.find(
              (p) => p.checkpointId === cp.checkpointId
            );
            const isActive = index === currentCheckpointIndex;
            const isPast = index < currentCheckpointIndex;
            const isLocked = index > currentCheckpointIndex;
            return (
              <li
                key={cp.checkpointId}
                className={`flex items-start gap-2 rounded-md p-2 text-sm ${
                  isActive
                    ? isDark
                      ? "bg-blue-900 border border-blue-600"
                      : "bg-blue-100 border border-blue-400"
                    : isPast
                    ? isDark
                      ? "bg-gray-800 border border-gray-700"
                      : "bg-white border border-gray-200"
                    : isDark
                    ? "bg-gray-900 border border-gray-800 opacity-70"
                    : "bg-gray-100 border border-gray-200 opacity-70"
                }`}
              >
                <div className="mt-1">
                  {isPast ? "✅" : isLocked ? "🔒" : "➡️"}
                </div>
                <div>
                  <p
                    className={`font-semibold ${
                      isDark ? "text-gray-200" : "text-gray-800"
                    }`}
                  >
                    {index + 1}. {cp.title}
                  </p>
                  <p
                    className={`text-xs ${
                      isDark ? "text-gray-400" : "text-gray-600"
                    }`}
                  >
                    {cp.summary}
                  </p>
                  {cpProgress && (
                    <p className="text-[10px] mt-1 text-green-400">
                      Status: {cpProgress.status}
                      {cpProgress.explanationAccepted && " · Explanation accepted"}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  const renderCenterPanel = () => {
    if (!currentCheckpoint) {
      return (
        <div
          className={`flex-1 flex items-center justify-center rounded-lg border ${
            isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"
          }`}
        >
          <p
            className={isDark ? "text-gray-400" : "text-gray-600"}
          >
            Loading checkpoint...
          </p>
        </div>
      );
    }

        const isNextDisabled = isAdvancing;
        const isPrevDisabled = isAdvancing || currentCheckpointIndex === 0;

    const topPanel = (
      <div className="flex flex-col gap-3">
        <div
          className={`rounded-lg border p-4 ${
            isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"
          }`}
        >
          <h2
            className={`text-xl font-semibold mb-2 ${
              isDark ? "text-white" : "text-gray-900"
            }`}
          >
            {currentCheckpoint.title}
          </h2>
          {module && (
            <p className={`text-xs mb-2 ${isDark ? "text-gray-400" : "text-gray-600"}`}>
              Checkpoint {currentCheckpointIndex + 1} of {module.checkpoints.length}
            </p>
          )}
          <div
            className={`prose prose-sm max-w-none ${
              isDark ? "prose-invert text-gray-200" : "text-gray-800"
            }`}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {normalizeForDisplay(currentCheckpoint.description)}
            </ReactMarkdown>
          </div>
        </div>

        {navError && (
          <div
            className={`rounded-lg border px-4 py-2 text-sm ${
              isDark
                ? "bg-red-900/30 border-red-900 text-red-200"
                : "bg-red-50 border-red-200 text-red-700"
            }`}
          >
            {navError}
          </div>
        )}

        <div
          className={`flex-1 rounded-lg border overflow-hidden ${
            isDark ? "bg-gray-900 border-gray-800" : "bg-gray-50 border-gray-200"
          }`}
        >
          <MonacoEditor
            value={code}
            language={language}
            theme={isDark ? "vs-dark" : "vs"}
            onMount={handleEditorDidMount}
            onChange={(value) => {
              setCode(value || "");
            }}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              readOnly: !canEditCode,
            }}
          />
        </div>
      </div>
    );

    const renderOutputBlock = (label: string, text: string) => (
      <div>
        <div
          className={`text-[11px] font-semibold mb-1 ${
            isDark ? "text-gray-400" : "text-gray-500"
          }`}
        >
          {label}
        </div>
        <pre
          className={`text-xs rounded border px-2 py-1 font-mono overflow-x-auto ${
            isDark
              ? "bg-gray-900 border-gray-700 text-gray-100"
              : "bg-gray-50 border-gray-300 text-gray-900"
          }`}
          style={{ whiteSpace: "pre-wrap" }}
        >
          {normalizeForDisplay(text)}
        </pre>
      </div>
    );

    const renderLineDiff = (expectedRaw: string, actualRaw: string) => {
      const expected = normalizeForDisplay(expectedRaw).split("\n");
      const actual = normalizeForDisplay(actualRaw).split("\n");
      const maxLen = Math.max(expected.length, actual.length);
      return (
        <div className="mt-2 border rounded text-[11px] overflow-auto">
          <div
            className={`px-2 py-1 font-semibold ${
              isDark ? "bg-gray-900 text-gray-200" : "bg-gray-100 text-gray-800"
            }`}
          >
            Line-by-line diff
          </div>
          <div className="max-h-40 overflow-auto">
            {Array.from({ length: maxLen }).map((_, i) => {
              const e = expected[i] ?? "";
              const a = actual[i] ?? "";
              const same = e === a;
              return (
                <div
                  key={i}
                  className={`grid grid-cols-2 gap-1 px-2 py-0.5 border-t ${
                    same
                      ? isDark
                        ? "border-gray-800"
                        : "border-gray-200"
                      : isDark
                      ? "bg-red-900/30 border-red-900"
                      : "bg-red-50 border-red-200"
                  }`}
                >
                  <div className="font-mono">
                    <span className="mr-1 text-[10px] opacity-60">{i + 1}E:</span>
                    {e === "" ? "∅" : e}
                  </div>
                  <div className="font-mono">
                    <span className="mr-1 text-[10px] opacity-60">{i + 1}A:</span>
                    {a === "" ? "∅" : a}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    };

    const handleRunCodeForTab = async (tabId: string) => {
      if (!roomIdFromUrl) return;
      if (tabId === "custom") {
        setRunOutput([]);
        setIsRunning(true);
        try {
          const res = await fetch(`http://${IP_ADDRESS}:3000/submit`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              code,
              language,
              roomId: roomIdFromUrl,
              input: runInput,
              sessionId: runSessionIdRef.current,
            }),
          });
          if (!res.ok) {
            setRunOutput(["Failed to run code."]);
          }
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
            body: JSON.stringify({
              code,
              language,
              roomId: roomIdFromUrl,
              input: testCase.input || "",
              sessionId: `test-${testIndex}-${runSessionIdRef.current}`,
            }),
          });
          if (!res.ok) {
            setTestCaseOutputs((prev) => ({ ...prev, [testIndex]: ["Failed to run code."] }));
          }
        } catch {
          setTestCaseOutputs((prev) => ({ ...prev, [testIndex]: ["Failed to connect to run server."] }));
        } finally {
          setIsRunning(false);
        }
      }
    };

    const bottomPanel = (
      <div className="flex flex-col gap-3">
        <details
          open={!ioPanelCollapsed}
          className={`rounded-lg border ${
            isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"
          }`}
        >
          <summary
            className={`px-3 py-2 cursor-pointer select-none flex items-center justify-between ${
              isDark ? "hover:bg-gray-800" : "hover:bg-gray-50"
            }`}
            onClick={(e) => {
              e.preventDefault();
              setIoPanelCollapsed(!ioPanelCollapsed);
            }}
          >
            <p className={`text-sm font-semibold ${isDark ? "text-gray-200" : "text-gray-800"}`}>
              Input / Output
            </p>
            <span className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>
              {ioPanelCollapsed ? "▼" : "▲"}
            </span>
          </summary>
          {!ioPanelCollapsed && (
            <div className="p-3 flex flex-col gap-3">
              {/* Tabs */}
              <div className="flex gap-2 border-b overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setActiveIOTab("custom")}
                  className={`px-3 py-1.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                    activeIOTab === "custom"
                      ? isDark
                        ? "border-blue-500 text-blue-400"
                        : "border-blue-600 text-blue-600"
                      : isDark
                      ? "border-transparent text-gray-400 hover:text-gray-300"
                      : "border-transparent text-gray-600 hover:text-gray-800"
                  }`}
                >
                  Custom I/O
                </button>
                {currentCheckpoint?.testCases?.map((_, index) => (
                  <button
                    key={`test-${index}`}
                    type="button"
                    onClick={() => setActiveIOTab(`test-${index}`)}
                    className={`px-3 py-1.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                      activeIOTab === `test-${index}`
                        ? isDark
                          ? "border-blue-500 text-blue-400"
                          : "border-blue-600 text-blue-600"
                        : isDark
                        ? "border-transparent text-gray-400 hover:text-gray-300"
                        : "border-transparent text-gray-600 hover:text-gray-800"
                    }`}
                  >
                    Test {index + 1}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              {activeIOTab === "custom" && (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-col gap-1">
                    <label className={`text-xs font-medium ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                      Input
                    </label>
                    <textarea
                      value={runInput}
                      onChange={(e) => setRunInput(e.target.value)}
                      placeholder="Enter custom input..."
                      className={`w-full rounded-md border p-2 text-sm font-mono resize-none ${
                        isDark ? "bg-gray-800 border-gray-700 text-white" : "bg-white border-gray-300 text-gray-900"
                      }`}
                      rows={3}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRunCodeForTab("custom")}
                    disabled={isRunning}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium ${
                      isDark ? "bg-blue-600 hover:bg-blue-500 text-white" : "bg-blue-600 hover:bg-blue-700 text-white"
                    } disabled:opacity-50`}
                  >
                    {isRunning ? "Running…" : "Run"}
                  </button>
                  {runOutput.length > 0 && (
                    <div className="flex flex-col gap-1">
                      <label className={`text-xs font-medium ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                        Output
                      </label>
                      <pre
                        className={`text-xs p-2 rounded border overflow-x-auto font-mono ${
                          isDark ? "bg-gray-800 border-gray-700 text-gray-200" : "bg-gray-50 border-gray-200 text-gray-800"
                        }`}
                        style={{ whiteSpace: "pre-wrap" }}
                      >
                        {normalizeForDisplay(runOutput.join("\n"))}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {activeIOTab.startsWith("test-") && (() => {
                const testIndex = parseInt(activeIOTab.replace("test-", ""), 10);
                const testCase = currentCheckpoint?.testCases?.[testIndex];
                if (!testCase) return null;
                const testOutput = testCaseOutputs[testIndex] || [];

                return (
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-col gap-1">
                      <label className={`text-xs font-medium ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                        Input (from test case)
                      </label>
                      <pre
                        className={`text-xs p-2 rounded border font-mono ${
                          testCase.input
                            ? isDark
                              ? "bg-gray-800 border-gray-700 text-gray-200"
                              : "bg-gray-50 border-gray-200 text-gray-800"
                            : isDark
                            ? "bg-gray-900 border-gray-800 text-gray-500"
                            : "bg-gray-100 border-gray-300 text-gray-500"
                        }`}
                        style={{ whiteSpace: "pre-wrap" }}
                      >
                        {testCase.input || "(empty)"}
                      </pre>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className={`text-xs font-medium ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                        Expected Output
                      </label>
                      <pre
                        className={`text-xs p-2 rounded border font-mono ${
                          isDark ? "bg-gray-800 border-gray-700 text-green-300" : "bg-green-50 border-green-200 text-green-800"
                        }`}
                        style={{ whiteSpace: "pre-wrap" }}
                      >
                        {normalizeForDisplay(testCase.expectedOutput)}
                      </pre>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRunCodeForTab(`test-${testIndex}`)}
                      disabled={isRunning}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium ${
                        isDark ? "bg-blue-600 hover:bg-blue-500 text-white" : "bg-blue-600 hover:bg-blue-700 text-white"
                      } disabled:opacity-50`}
                    >
                      {isRunning ? "Running…" : "Run Test"}
                    </button>
                    {testOutput.length > 0 && (
                      <div className="flex flex-col gap-1">
                        <label className={`text-xs font-medium ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                          Actual Output
                        </label>
                        <pre
                          className={`text-xs p-2 rounded border overflow-x-auto font-mono ${
                            isDark ? "bg-gray-800 border-gray-700 text-gray-200" : "bg-gray-50 border-gray-200 text-gray-800"
                          }`}
                          style={{ whiteSpace: "pre-wrap" }}
                        >
                          {normalizeForDisplay(testOutput.join("\n"))}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </details>

        {isExplainCheckpoint && (
          <div
            className={`rounded-lg border p-3 flex flex-col gap-2 ${
              isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"
            }`}
          >
            <p
              className={`text-sm font-semibold ${
                isDark ? "text-gray-200" : "text-gray-800"
              }`}
            >
              Explanation
            </p>
            <textarea
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              placeholder="Write your explanation in plain English..."
              className={`w-full rounded-md border p-2 text-sm ${
                isDark
                  ? "bg-gray-800 border-gray-700 text-white"
                  : "bg-white border-gray-300 text-gray-900"
              }`}
              rows={4}
            />
          </div>
        )}

        {isReflectionCheckpoint && (
          <div
            className={`rounded-lg border p-3 flex flex-col gap-2 ${
              isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"
            }`}
          >
            <p
              className={`text-sm font-semibold ${
                isDark ? "text-gray-200" : "text-gray-800"
              }`}
            >
              Reflection
            </p>
            <textarea
              value={reflection}
              onChange={(e) => setReflection(e.target.value)}
              placeholder="What did you learn about loops? What is still fuzzy?"
              className={`w-full rounded-md border p-2 text-sm ${
                isDark
                  ? "bg-gray-800 border-gray-700 text-white"
                  : "bg-white border-gray-300 text-gray-900"
              }`}
              rows={3}
            />
          </div>
        )}

        {currentCheckpoint?.testCases && currentCheckpoint.testCases.length > 0 && (
          <div
            className={`rounded-lg border p-3 flex flex-col gap-2 ${
              isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"
            }`}
          >
            <p className={`text-sm ${isDark ? "text-gray-300" : "text-gray-700"}`}>
              This checkpoint has test cases. Run tests and pass all before moving to Next.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRunTests}
                disabled={isRunningTests}
                className="px-3 py-1.5 rounded-md bg-amber-600 text-white text-sm disabled:opacity-50 flex items-center gap-2"
              >
                {isRunningTests && <AiOutlineLoading3Quarters className="animate-spin" />}
                Run tests
              </button>
              {testResult !== null && (
                <span
                  className={
                    testResult.allPassed ? "text-green-600 font-medium" : "text-red-600 font-medium"
                  }
                >
                  {testResult.allPassed ? "All tests passed" : "Some tests failed"}
                </span>
              )}
            </div>
            {testResult?.results && testResult.results.length > 0 && (
              <div className="mt-2 space-y-3 text-xs max-h-64 overflow-y-auto">
                {testResult.results.map((r, i) => {
                  const isError = r.actualOutput.startsWith("Error:");
                  const passed = r.passed && !isError;
                  const rawExpected =
                    currentCheckpoint.testCases?.[i]?.expectedOutput ?? r.expectedOutput;
                  const isExpanded = !passed;
                  return (
                    <details
                      key={i}
                      className={`rounded border p-2 ${
                        passed
                          ? isDark
                            ? "border-green-500/60 bg-green-950/40"
                            : "border-green-400 bg-green-50"
                          : isDark
                          ? "border-red-500/60 bg-red-950/40"
                          : "border-red-400 bg-red-50"
                      }`}
                      open={isExpanded}
                    >
                      <summary className="flex items-center justify-between cursor-pointer select-none">
                        <span className="font-semibold">Test {i + 1}</span>
                        <span className={passed ? "text-green-500" : "text-red-500"}>
                          {passed ? "✓ Passed" : "✗ Failed – click for details"}
                        </span>
                      </summary>
                      <div className="mt-1 space-y-1">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {renderOutputBlock("Expected", rawExpected ?? r.expectedOutput)}
                          {renderOutputBlock("Actual", r.actualOutput)}
                        </div>
                        {!passed &&
                          renderLineDiff(
                            rawExpected ?? r.expectedOutput,
                            r.actualOutput
                          )}
                        {isError && (
                          <div className="mt-1 text-[11px] text-red-400">
                            Runtime error detected – fix the error or ask the AI guide for help.
                          </div>
                        )}
                      </div>
                    </details>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-between items-center mt-1">
          <div />
          <div className="flex items-center gap-2">
            <button
              onClick={handlePreviousCheckpoint}
              disabled={isPrevDisabled}
              className="px-3 py-1.5 rounded-md bg-gray-700 text-white text-sm disabled:opacity-30 flex items-center gap-2"
            >
              Previous
            </button>
            <button
              onClick={handleAdvanceCheckpoint}
              disabled={isNextDisabled}
              className="px-4 py-1.5 rounded-md bg-green-600 text-white text-sm disabled:opacity-50 flex items-center gap-2"
            >
              {isAdvancing && (
                <AiOutlineLoading3Quarters className="animate-spin" />
              )}
              Next
            </button>
          </div>
        </div>
      </div>
    );

    return (
      <AnySplitPane
        split="horizontal"
        minSize={220}
        defaultSize={loadSize("learn-editor-height", 420)}
        onChange={(size: number) => saveSize("learn-editor-height", size)}
        style={{ height: "100%" }}
      >
        {topPanel}
        {bottomPanel}
      </AnySplitPane>
    );
  };

  const renderRightPanel = () => {
    if (activePanel === "chat") {
      return (
        <div
          className={`flex flex-col h-full border rounded-lg ${
            isDark ? "bg-gray-900 border-gray-800" : "bg-blue-50 border-blue-200"
          }`}
        >
          <h2
            className={`text-lg font-semibold p-3 border-b ${
              isDark ? "border-gray-800 text-gray-200" : "border-blue-200"
            }`}
          >
            <span className="inline-flex items-center gap-2">
              <FiMessageCircle /> Chat
            </span>
          </h2>
          <div className="flex-1">
            {chatReady && chatId && socket ? (
              <Chat
                socket={socket}
                chatId={chatId}
                userId={user.id}
                userName={user.name}
                IP_ADDRESS={IP_ADDRESS}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
                Chat loading...
              </div>
            )}
          </div>
        </div>
      );
    }

    if (activePanel === "info") {
      return (
        <div
          className={`flex flex-col h-full border rounded-lg p-3 ${
            isDark ? "bg-gray-900 border-gray-800" : "bg-blue-50 border-blue-200"
          }`}
        >
          <h2
            className={`text-lg font-semibold mb-3 ${
              isDark ? "text-gray-200" : "text-gray-800"
            }`}
          >
            <FiUsers className="inline-block mr-1" /> Learners
          </h2>
          <div className="space-y-2 overflow-y-auto text-sm">
            {connectedUsers.length > 0 ? (
              connectedUsers.map((u: any) => (
                <div
                  key={u.id}
                  className={`flex items-center gap-2 rounded-md border px-2 py-1 ${
                    isDark
                      ? "bg-gray-800 border-gray-700"
                      : "bg-white border-gray-200"
                  }`}
                >
                  <div className="w-7 h-7 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-semibold">
                    {u.name?.charAt(0).toUpperCase() || "?"}
                  </div>
                  <div className="flex-1">
                    <p
                      className={
                        isDark ? "text-gray-200" : "text-gray-800"
                      }
                    >
                      {u.name}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p
                className={
                  isDark ? "text-gray-500" : "text-gray-600"
                }
              >
                Waiting for other learners to join this room.
              </p>
            )}
          </div>
        </div>
      );
    }

    // Default: AI Guide
    return (
      <div
        className={`flex flex-col h-full border rounded-lg ${
          isDark ? "bg-gray-900 border-gray-800" : "bg-blue-50 border-blue-200"
        }`}
      >
        <h2
          className={`text-lg font-semibold p-3 border-b flex items-center gap-2 ${
            isDark ? "border-gray-800 text-gray-200" : "border-blue-200"
          }`}
        >
          <FiBox /> AI Guide
        </h2>
        <div className="flex-1 p-3 overflow-y-auto space-y-3">
          {aiMessages.length === 0 && (
            <p
              className={`text-sm ${
                isDark ? "text-gray-400" : "text-gray-600"
              }`}
            >
              Ask the AI guide about this checkpoint. It will respond in{" "}
              <strong>{currentAiMode || "tutor"}</strong> mode and stay
              scoped to the current task.
            </p>
          )}
          {aiMessages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex flex-col ${
                msg.sender === "user" ? "items-end" : "items-start"
              }`}
            >
              {msg.sender === "user" && msg.userName && (
                <span className={`text-xs mb-0.5 ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                  {msg.userName}
                </span>
              )}
              <div
                className={`max-w-xs md:max-w-sm rounded-2xl px-3 py-2 text-sm ${
                  msg.sender === "user"
                    ? "bg-blue-600 text-white rounded-tr-sm"
                    : isDark
                    ? "bg-gray-800 text-gray-200 rounded-tl-sm"
                    : "bg-white text-gray-800 rounded-tl-sm border border-gray-200"
                }`}
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {msg.text}
                </ReactMarkdown>
              </div>
            </div>
          ))}
          {isAiLoading && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <AiOutlineLoading3Quarters className="animate-spin" /> AI
              thinking...
            </div>
          )}
          <div ref={aiChatEndRef} />
        </div>
        <form
          onSubmit={handleAiSubmit}
          className={`p-3 border-t flex gap-2 ${
            isDark ? "border-gray-800" : "border-blue-200"
          }`}
        >
          <input
            type="text"
            value={aiInput}
            onChange={(e) => setAiInput(e.target.value)}
            placeholder="Ask the AI about this checkpoint..."
            className={`flex-1 rounded-md border px-3 py-2 text-sm ${
              isDark
                ? "bg-gray-800 border-gray-700 text-white"
                : "bg-white border-gray-300 text-gray-900"
            }`}
            disabled={isAiLoading}
          />
          <button
            type="submit"
            disabled={isAiLoading || !aiInput.trim()}
            className="px-3 py-2 rounded-md bg-blue-600 text-white disabled:opacity-50 flex items-center justify-center"
          >
            <AiOutlineSend size={18} />
          </button>
        </form>
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
      <div className="flex flex-col flex-1 p-4 gap-4 overflow-hidden">
        <nav
          className={`border rounded-xl px-4 py-3 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 ${
            isDark
              ? "bg-gray-900 border-gray-800"
              : "bg-blue-50/80 border-blue-200"
          }`}
        >
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSidebarOpen((v) => !v)}
              className={`hidden lg:inline-flex items-center justify-center w-9 h-9 rounded-md border ${
                isDark
                  ? "bg-gray-800 hover:bg-gray-700 text-gray-200 border-gray-700"
                  : "bg-gray-100 hover:bg-gray-200 text-gray-800 border-gray-300"
              }`}
            >
              {isSidebarOpen ? (
                <FiChevronsLeft size={18} />
              ) : (
                <FiChevronsRight size={18} />
              )}
            </button>
            <button
              onClick={() => roomIdFromUrl && navigate(`/code/${roomIdFromUrl}`)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium ${
                isDark
                  ? "bg-gray-800 hover:bg-gray-700 border-gray-700 text-gray-200"
                  : "bg-white hover:bg-gray-100 border-gray-300 text-gray-800"
              }`}
              title="Back to editor"
            >
              <span className="text-lg">←</span>
              <span>Back to editor</span>
            </button>
            <div>
              <div
                className={`text-xl font-bold ${
                  isDark ? "text-white" : "text-gray-900"
                }`}
              >
                CoLearn · Guided Module
              </div>
              <p
                className={`text-xs ${
                  isDark ? "text-gray-400" : "text-gray-600"
                }`}
              >
                Room {roomLabel}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setActivePanel("ai")}
              className={`px-3 py-2 rounded-md text-sm flex items-center gap-2 ${
                activePanel === "ai"
                  ? "bg-blue-600 text-white"
                  : isDark
                  ? "bg-gray-800 text-gray-300"
                  : "bg-white text-gray-800"
              }`}
            >
              <FiBox /> AI Guide
            </button>
            <button
              onClick={() => setActivePanel("chat")}
              className={`px-3 py-2 rounded-md text-sm flex items-center gap-2 ${
                activePanel === "chat"
                  ? "bg-blue-600 text-white"
                  : isDark
                  ? "bg-gray-800 text-gray-300"
                  : "bg-white text-gray-800"
              }`}
            >
              <FiMessageCircle /> Chat
            </button>
            <button
              onClick={() => setActivePanel("info")}
              className={`px-3 py-2 rounded-md text-sm flex items-center gap-2 ${
                activePanel === "info"
                  ? "bg-blue-600 text-white"
                  : isDark
                  ? "bg-gray-800 text-gray-300"
                  : "bg-white text-gray-800"
              }`}
            >
              <FiUsers /> Learners
            </button>
          </div>
        </nav>

        <div className="flex flex-1 overflow-hidden min-h-0 relative" style={{ position: "relative" }}>
          <AnySplitPane
            split="vertical"
            minSize={220}
            defaultSize={loadSize("learn-left-width", 260)}
            onChange={(size: number) => saveSize("learn-left-width", size)}
            style={{ height: "100%" }}
          >
            <div className="w-full h-full flex-shrink-0 pr-2">
              {renderCheckpointList()}
            </div>
            <AnySplitPane
              split="vertical"
              minSize={400}
              defaultSize={loadSize("learn-center-width", 640)}
              onChange={(size: number) => saveSize("learn-center-width", size)}
              style={{ height: "100%" }}
            >
              <div className="flex-1 h-full pr-2 flex flex-col">
                {renderCenterPanel()}
              </div>
              <div className="w-full h-full flex-shrink-0">
                {renderRightPanel()}
              </div>
            </AnySplitPane>
          </AnySplitPane>
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