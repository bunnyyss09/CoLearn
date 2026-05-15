import React, { useEffect, useState, useRef, useMemo } from "react";
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
// import { IP_ADDRESS } from "../Globle";
import { createWsClientId } from "../utils/wsClientId";
import { API_BASE_URL, WS_BASE_URL } from "../Globle";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { normalizeForDisplay } from "../utils/outputNormalization.ts";
import { mergeSelfIntoMemberList, normalizeConnectedUsers, type RoomMember } from "../utils/roomMembers";
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
  FiHeart,
  FiBook,
  FiFileText,
  FiMic,
  FiHeadphones,
} from "react-icons/fi";
import { AiOutlineSend, AiOutlineLoading3Quarters, AiOutlineCopy, AiOutlineCheck } from "react-icons/ai";
import NotesPanel from "../components/NotesPanel";
import { useVoiceSession } from "../hooks/useVoiceSession";
import VoiceChannelBar, { VOICE_OPEN_JOIN_EVENT } from "../components/VoiceChannelBar";

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

type ActivePanel = "chat" | "ai" | "info" | "notes";

const LearningRoom: React.FC = () => {
  const params = useParams();
  // NOTE: navigate is intentionally not used yet; we keep it around
  // for future flows where learners might jump back to the main room.
  const navigate = useNavigate();
  const [user] = useRecoilState(userAtom);
  const [auth] = useRecoilState(authAtom);
  const effectiveUserId = user.id || auth.user?.id || "";
  const effectiveUserName = user.name || auth.user?.name || "Learner";
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
  const [roomOwnerId, setRoomOwnerId] = useState<string | null>(null);
  const [cohortMemberCount, setCohortMemberCount] = useState(0);
  /** Supportive coach strip: slow pace or struggling tests (from your profile only). */
  const [coachKind, setCoachKind] = useState<"slow" | "tests" | null>(null);

  // Debounce timer for code sync
  const codeSyncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Remote editor carets (Monaco)
  const monacoRef = useRef<any>(null);
  const editorInstanceRef = useRef<any>(null);
  const remoteCaretsRef = useRef<string[]>([]);
  const cursorSendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [remoteCursors, setRemoteCursors] = useState<
    Record<string, { lineNumber: number; column: number; name: string }>
  >({});

  const wsClientIdRef = useRef<string>(createWsClientId());

  const peerListForVoice = useMemo(
    () =>
      (connectedUsers as { id: string; name: string; clientId?: string }[]).map((u) => ({
        id: u.id,
        name: u.name || "Learner",
        clientId: u.clientId,
      })),
    [connectedUsers]
  );
  const membersInRoom = useMemo((): RoomMember[] => {
    if (!effectiveUserId) {
      return normalizeConnectedUsers(connectedUsers);
    }
    return mergeSelfIntoMemberList(connectedUsers as RoomMember[], {
      userId: effectiveUserId,
      name: effectiveUserName,
      clientId: wsClientIdRef.current,
    });
  }, [connectedUsers, effectiveUserId, effectiveUserName]);
  const voice = useVoiceSession(
    effectiveUserId || undefined,
    effectiveUserName,
    wsClientIdRef.current,
    socket,
    peerListForVoice
  );

  // Flag to prevent echo when receiving remote code
  const isRemoteUpdateRef = useRef(false);
  /** Monaco listeners run once; read latest WebSocket/room from refs. */
  const socketRef = useRef<WebSocket | null>(null);
  const codeRoomIdSyncRef = useRef<string | undefined>(undefined);

  const roomIdFromUrl = params.roomId || user.roomId;

  useEffect(() => {
    socketRef.current = socket;
  }, [socket]);
  useEffect(() => {
    codeRoomIdSyncRef.current = roomIdFromUrl || undefined;
  }, [roomIdFromUrl]);

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

  const isModuleComplete =
    !!module && currentCheckpointIndex >= module.checkpoints.length;

  const currentCheckpoint: Checkpoint | undefined =
    isModuleComplete ? undefined : module?.checkpoints[currentCheckpointIndex];

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
          `${API_BASE_URL}/learning/room/${roomIdFromUrl}/state`,
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
        if (data.room?.ownerId != null) {
          setRoomOwnerId(String(data.room.ownerId));
        }
        if (Array.isArray(data.room?.members)) {
          setCohortMemberCount(data.room.members.length);
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
          `${API_BASE_URL}/room/${roomIdFromUrl}`
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
          `${API_BASE_URL}/room/${roomIdFromUrl}/data`
        );
        if (dataRes.ok) {
          const roomPayload = await dataRes.json();
          if (roomPayload.aiMessages && Array.isArray(roomPayload.aiMessages)) {
            setAiMessages(
              roomPayload.aiMessages.map((m: { sender: string; text: string; userName?: string }) => ({
                sender: m.sender as "user" | "ai",
                text: m.text,
                userName: m.userName,
              }))
            );
          }
          // Seed current checkpoint from shared room code (one blob per room) so return visits match the editor.
          const mod = data.module as LearningModule | undefined;
          const rawIdx = data.room?.currentCheckpointIndex ?? 0;
          if (mod?.checkpoints?.length && rawIdx < mod.checkpoints.length) {
            const cp = mod.checkpoints[rawIdx];
            const src = roomPayload.code;
            const placeholder =
              typeof src === "string" &&
              (src.includes("Write your code here") || src.trim() === "// Write your code here...");
            if (typeof src === "string" && cp?.checkpointId && !placeholder) {
              setCode(src);
              setCodeByCheckpoint((prev) => ({ ...prev, [cp.checkpointId]: src }));
            }
          }
        }
      } catch (e) {
        console.error("Failed to fetch learning room state", e);
      }
    };
    fetchLearningState();
  }, [auth.token, roomIdFromUrl]);

  const coachStorageKey =
    roomIdFromUrl != null && roomIdFromUrl !== ""
      ? `colearn-encourage-dismiss-${roomIdFromUrl}`
      : null;

  useEffect(() => {
    setCoachKind(null);
  }, [roomIdFromUrl]);

  useEffect(() => {
    if (!auth.token || !user.id || !roomIdFromUrl || !coachStorageKey) return;
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(coachStorageKey) === "1") {
      return;
    }
    let cancelled = false;
    fetch(`${API_BASE_URL}/learning-profile/${user.id}`, {
      headers: { Authorization: `Bearer ${auth.token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const p = data.profile;
        if (!p) return;
        const pace = p.learningPace as string | undefined;
        const tp = p.metrics?.totalTestPasses ?? 0;
        const tf = p.metrics?.totalTestFailures ?? 0;
        const total = tp + tf;
        const rate = total > 0 ? (100 * tp) / total : null;
        if (pace === "slow") setCoachKind("slow");
        else if (total >= 3 && rate !== null && rate < 50) setCoachKind("tests");
        else setCoachKind(null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [auth.token, user.id, roomIdFromUrl, coachStorageKey]);

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
    setToast(null);
  }, [currentCheckpoint?.checkpointId]);

  // Save code whenever it changes for whichever checkpoint is currently active.
  // Do NOT depend on checkpoint id here: when the checkpoint changes, the first render still
  // has the previous checkpoint's code — syncing [code, checkpointId] would write that code
  // into the new checkpoint's slot and wipe the correct saved code when you go back (Prev).
  useEffect(() => {
    if (!currentCheckpoint) return;
    const checkpointId = currentCheckpoint.checkpointId;
    setCodeByCheckpoint((prev) => ({ ...prev, [checkpointId]: code }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- omit checkpointId so we don't copy old code into the new checkpoint slot on navigation
  }, [code]);

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
        `${WS_BASE_URL}?roomId=${effectiveRoomId}&id=${userIdForWs}&name=${encodeURIComponent(
          userNameForWs
        )}&clientId=${encodeURIComponent(wsClientIdRef.current)}`
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
        setConnectedUsers(normalizeConnectedUsers(data.users));
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
      if (data.type === "editor-cursor" && data.userId && data.lineNumber != null && data.column != null) {
        setRemoteCursors((prev) => ({
          ...prev,
          [String(data.userId)]: {
            lineNumber: Number(data.lineNumber),
            column: Number(data.column),
            name: typeof data.userName === "string" ? data.userName : "Peer",
          },
        }));
      }
      // In learning room we never override language from WebSocket—it comes from the module (Python).
    };

    socket.addEventListener("message", handleMessage);

    // Request full member list (must use same id as WS URL: auth can load before recoil user.id)
    const requestUsers = () => {
      if (socket.readyState === WebSocket.OPEN && userIdForWs) {
        socket.send(
          JSON.stringify({ type: "requestToGetUsers", userId: userIdForWs })
        );
      }
    };
    if (socket.readyState === WebSocket.OPEN) {
      requestUsers();
    } else {
      socket.addEventListener("open", requestUsers, { once: true });
    }

    return () => {
      socket.removeEventListener("message", handleMessage);
    };
  }, [socket, roomIdFromUrl, user.id, auth, setSocket, setConnectedUsers]);

  useEffect(() => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const authUser: any = (auth as any)?.user;
    const id = user.id || authUser?.id;
    if (!id) return;
    const send = () => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "requestToGetUsers", userId: id }));
      }
    };
    send();
    const t = window.setInterval(send, 20_000);
    const onVis = () => {
      if (document.visibilityState === "visible") send();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [socket, user.id, auth]);

  const handleEditorDidMount = (editor: any, monaco: any) => {
    editorInstanceRef.current = editor;
    monacoRef.current = monaco;

    editor.onDidChangeCursorPosition(() => {
      if (isRemoteUpdateRef.current) return;
      if (cursorSendTimerRef.current) clearTimeout(cursorSendTimerRef.current);
      cursorSendTimerRef.current = setTimeout(() => {
        const pos = editor.getPosition();
        const s = socketRef.current;
        if (pos && s?.readyState === WebSocket.OPEN) {
          s.send(
            JSON.stringify({
              type: "editor-cursor",
              lineNumber: pos.lineNumber,
              column: pos.column,
            })
          );
        }
      }, 300);
    });

    editor.onDidChangeModelContent(() => {
      const currentCode = editor.getValue();

      // Update local state immediately for responsive UI
      setCode(currentCode);

      // Also save to checkpoint-specific storage
      const checkpointId = currentCheckpointIdRef.current;
      if (checkpointId) {
        setCodeByCheckpoint((prev) => ({ ...prev, [checkpointId]: currentCode }));
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
        const s = socketRef.current;
        const roomId = codeRoomIdSyncRef.current;
        if (s?.readyState === WebSocket.OPEN && roomId) {
          s.send(
            JSON.stringify({
              type: "code",
              code: editor.getValue(),
              roomId,
            })
          );
        }
      }, CODE_SYNC_DEBOUNCE_MS);
    });
  };

  useEffect(() => {
    const ed = editorInstanceRef.current;
    const monaco = monacoRef.current;
    if (!ed || !monaco) return;
    const me = user.id;
    const decs: any[] = [];
    for (const [id, c] of Object.entries(remoteCursors)) {
      if (id === me) continue;
      const hash = id.split("").reduce((a, b) => a + b.charCodeAt(0), 0) % 6;
      decs.push({
        range: new monaco.Range(c.lineNumber, c.column, c.lineNumber, c.column),
        options: {
          before: { content: "|", inlineClassName: `remote-caret-c${hash}` },
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        },
      });
    }
    remoteCaretsRef.current = ed.deltaDecorations(remoteCaretsRef.current, decs);
  }, [remoteCursors, user.id, code]);


  const handleRunTests = async () => {
    if (!roomIdFromUrl || !auth.token) return;
    setIsRunningTests(true);
    setTestResult(null);
    try {
      const res = await fetch(
        `${API_BASE_URL}/learning/room/${roomIdFromUrl}/run-tests`,
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
        setToast({
          type: "error",
          message:
            data.error ||
            "Some tests did not pass. Fix the code or ask the AI guide for help.",
        });
      } else {
        setToast({
          type: "success",
          message: "All tests passed. You can safely move to the next checkpoint.",
        });
      }
    } catch (e) {
      console.error("Run tests failed", e);
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
      const res = await fetch(`${API_BASE_URL}/ai-tutor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submission),
      });
      const data = await res.json().catch(() => ({} as { error?: string; aiResponseText?: string }));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" && data.error
            ? data.error
            : `Server error (${res.status})`
        );
      }
      const aiResponseText = data.aiResponseText;
      const aiMsg: AiMessage = { sender: "ai", text: aiResponseText || "No response." };
      setAiMessages((prev) => [...prev, aiMsg]);
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "aiMessages", messages: [aiMsg] }));
      }
    } catch (err) {
      console.error("AI tutor error", err);
      const networkHint =
        "Could not reach the API server. If you opened the app using your computer's LAN address (not localhost), the app will use that same host for the API—ensure the Express server is running and reachable on port 3000.";
      const m = err instanceof Error ? err.message : "";
      const looksLikeNetworkFailure =
        err instanceof TypeError ||
        m === "Failed to fetch" ||
        m.includes("NetworkError") ||
        m.includes("Load failed");
      const errMsg: AiMessage = {
        sender: "ai",
        text: looksLikeNetworkFailure
          ? networkHint
          : m || "Error connecting to the AI guide. Please try again.",
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
    try {
      const res = await fetch(
        `${API_BASE_URL}/learning/room/${roomIdFromUrl}/next`,
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
        const leaving = currentCheckpoint;
        if (leaving) {
          setCodeByCheckpoint((prev) => ({
            ...prev,
            [leaving.checkpointId]: code,
          }));
        }
        if (data.room.moduleCompleted && roomIdFromUrl) {
          navigate(`/code/${roomIdFromUrl}`, { replace: true });
        } else {
          setCurrentCheckpointIndex(nextIndex);
        }
      } else if (!res.ok && data?.error) {
        if (data.results && !data.allPassed) {
          setToast({
            type: "error",
            message:
              data.error ||
              "Some tests did not pass. Check the Input / Output panel for details.",
          });
        } else {
          setToast({
            type: "error",
            message: data.error || "Cannot advance checkpoint.",
          });
        }
        console.warn("Cannot advance checkpoint:", data);
      } else if (!res.ok) {
        setToast({ type: "error", message: "Cannot advance checkpoint." });
      }
    } catch (e) {
      console.error("Failed to advance checkpoint", e);
      setToast({ type: "error", message: "Failed to advance checkpoint." });
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
        `${API_BASE_URL}/learning/room/${roomIdFromUrl}/previous`,
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
    const totalCount = module.checkpoints.length;
    const completedCount = Math.min(currentCheckpointIndex, totalCount);
    const progressPercent =
      totalCount > 0
        ? Math.round((completedCount / totalCount) * 100)
        : 0;
    
    return (
      <div className={`${isDark ? "glass-panel" : "glass-panel-light"} rounded-lg flex flex-col h-full transition-all duration-300`}>
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
                const isActive =
                  !isModuleComplete && index === currentCheckpointIndex;
                const isPast =
                  isModuleComplete || index < currentCheckpointIndex;
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
    if (!module) {
      return (
        <div className={`flex-1 flex items-center justify-center rounded-lg border ${isDark ? "bg-surface-900/40 border-[rgba(0,240,255,0.08)] backdrop-blur-sm" : "bg-white/60 border-gray-200"}`}>
          <p className={isDark ? "text-gray-400" : "text-gray-600"}>Loading module...</p>
        </div>
      );
    }

    if (isModuleComplete) {
      return (
        <div className="flex flex-col h-full gap-3 min-h-0">
          <div
            className={`flex-1 flex flex-col items-center justify-center text-center rounded-xl border-2 p-8 gap-4 ${isDark ? "bg-gray-900 border-green-800/80" : "bg-green-50 border-green-200"}`}
          >
            <div className={`rounded-full p-4 ${isDark ? "bg-green-900/40" : "bg-green-100"}`}>
              <FiCheck className="text-green-500" size={40} aria-hidden />
            </div>
            <div>
              <h2 className={`text-xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                Module complete
              </h2>
              <p className={`mt-2 text-sm max-w-md ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                You finished all checkpoints in <strong>{module.title}</strong>. You can review the last step, open the collaboration editor, or view the room dashboard.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              <button
                type="button"
                onClick={handlePreviousCheckpoint}
                disabled={isAdvancing}
                className={`px-4 py-2 rounded-lg text-sm font-medium border ${isDark ? "bg-gray-800 border-gray-600 text-gray-200 hover:bg-gray-700" : "bg-white border-gray-300 text-gray-800 hover:bg-gray-50"} disabled:opacity-40`}
              >
                ← Review last checkpoint
              </button>
              {roomIdFromUrl && (
                <>
                  <button
                    type="button"
                    onClick={() => navigate(`/code/${roomIdFromUrl}`)}
                    className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    Open collaboration editor
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate(`/dashboard/${roomIdFromUrl}`)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium border ${isDark ? "border-gray-600 text-gray-200 hover:bg-gray-800" : "border-gray-300 text-gray-800 hover:bg-gray-100"}`}
                  >
                    Room dashboard
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      );
    }

    if (!currentCheckpoint) {
      return (
        <div className={`flex-1 flex items-center justify-center rounded-lg border ${isDark ? "bg-surface-900/40 border-[rgba(0,240,255,0.08)] backdrop-blur-sm" : "bg-white/60 border-gray-200"}`}>
          <p className={isDark ? "text-gray-400" : "text-gray-600"}>Loading checkpoint...</p>
        </div>
      );
    }

    const lastCheckpointIndex = module.checkpoints.length - 1;
    const isLastCheckpoint = currentCheckpointIndex === lastCheckpointIndex;
    const lastHasTests = (currentCheckpoint.testCases?.length ?? 0) > 0;
    const lastStepReady = !lastHasTests || testResult?.allPassed === true;
    const primaryAdvanceDisabled =
      isAdvancing || (isLastCheckpoint && !lastStepReady);

    const isPrevDisabled = isAdvancing || currentCheckpointIndex === 0;

    const handleRunCodeForTab = async (tabId: string) => {
      if (!roomIdFromUrl) return;
      if (tabId === "custom") {
        setRunOutput([]);
        setIsRunning(true);
        try {
          const res = await fetch(`${API_BASE_URL}/submit`, {
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
          const res = await fetch(`${API_BASE_URL}/submit`, {
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
        <div className={`${isDark ? "glass-panel" : "glass-panel-light"} rounded-lg p-4 flex-shrink-0 transition-all duration-300`}>
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
                disabled={primaryAdvanceDisabled}
                title={
                  isLastCheckpoint && !lastStepReady && lastHasTests
                    ? "Run all tests and pass them to finish this module."
                    : undefined
                }
                className="px-4 py-1.5 rounded-md bg-green-600 hover:bg-green-700 text-white text-sm font-medium disabled:opacity-50 flex items-center gap-1 transition-all shadow-md hover:shadow-lg"
              >
                {isAdvancing && <AiOutlineLoading3Quarters className="animate-spin" />}
                {isLastCheckpoint ? "Finish" : "Next →"}
              </button>
            </div>
          </div>
        </div>

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
        <div className={`${isDark ? "glass-panel" : "glass-panel-light"} rounded-lg overflow-hidden flex-shrink-0 transition-all duration-300`}>
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
          <div className={`${isDark ? "glass-panel" : "bg-yellow-50/80 border border-yellow-200/60 backdrop-blur-sm"} rounded-lg p-3 flex-shrink-0`}>
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
          <div className={`${isDark ? "glass-panel" : "bg-purple-50/80 border border-purple-200/60 backdrop-blur-sm"} rounded-lg p-3 flex-shrink-0`}>
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

  const learningRoomChatShellClass = `${isDark ? "glass-panel" : "glass-panel-light"} rounded-lg flex flex-col h-full min-h-0 transition-all duration-300`;

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
            key="colearn-room-chat"
            socket={socket}
            chatId={chatId}
            userId={effectiveUserId || user.id}
            userName={user.name}
            panelActive={activePanel === "chat"}
            onLiveChatMessage={() => setChatPanelUnread(true)}
          />
        </div>
      </div>
    );
  };

  const renderRightPanel = () => {
    if (activePanel === "notes") {
      return (
        <div className="flex flex-col flex-1 min-h-0 h-full w-full min-w-0">
          {renderPersistentLearningChat()}
          <div
            className={`flex flex-col flex-1 min-h-0 overflow-hidden ${isDark ? "glass-panel" : "glass-panel-light"} rounded-lg transition-all duration-300 p-3`}
          >
            <NotesPanel
              roomId={roomIdFromUrl}
              userId={user.id}
              token={auth.token}
              isDark={isDark}
            />
          </div>
        </div>
      );
    }

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
      return (
        <div className="flex flex-col flex-1 min-h-0 h-full w-full min-w-0">
          {renderPersistentLearningChat()}
        </div>
      );
    }

    if (activePanel === "info") {
      return (
        <div className="flex flex-col flex-1 min-h-0 h-full w-full min-w-0">
          {renderPersistentLearningChat()}
        <div className={`flex flex-col flex-1 min-h-0 overflow-hidden ${isDark ? "glass-panel" : "glass-panel-light"} rounded-lg transition-all duration-300`}>
          <h2 className={`text-xl font-bold p-3 border-b flex items-center gap-2 ${isDark ? "text-gray-300 border-gray-800" : "text-gray-900 border-blue-200 bg-blue-100/50"}`}>
            <FiUsers /> Room
          </h2>
          <div className="p-4 flex-1 flex flex-col gap-4 overflow-y-auto">
            <div>
              <h3 className={`text-sm font-semibold mb-2 flex items-center gap-2 ${isDark ? "text-gray-200" : "text-gray-800"}`}>
                <FiUsers /> Members
              </h3>
              <div className="space-y-3">
                {membersInRoom.length > 0 ? (
                  membersInRoom.map((u: any) => {
                    const peerK = u.clientId || u.id;
                    const isMe = u.id === effectiveUserId && u.clientId === wsClientIdRef.current;
                    const inVoice = isMe
                      ? voice.inVoice
                      : !!(voice.remoteInVoice[peerK] || voice.remoteInVoice[u.id]);
                    const speaking = !!(voice.speaking[peerK] || voice.speaking[u.id]);
                    return (
                    <div key={`${u.id}-${u.clientId || "tab"}`} className={`flex items-center gap-3 rounded-lg p-3 border ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-300 shadow-sm"}`}>
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#00f0ff] to-[#bf5af2] text-white flex items-center justify-center text-lg font-bold">
                        {u.name?.charAt(0).toUpperCase() || "?"}
                      </div>
                      <div>
                        <p className={`text-sm font-semibold flex flex-wrap items-center gap-2 ${isDark ? "text-gray-200" : "text-gray-800"}`}>
                          {u.name}
                          {isMe && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-blue-500/40 text-blue-400" title="This device">
                              you
                            </span>
                          )}
                          {inVoice && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-500 border border-emerald-500/30" title="In voice">
                              in voice
                            </span>
                          )}
                          {speaking && inVoice && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-green-500/20 text-green-500" title="Speaking">
                              <FiMic className="inline mr-0.5" size={10} />
                              live
                            </span>
                          )}
                        </p>
                        <p className={`text-xs truncate ${isDark ? "text-gray-400" : "text-gray-600"}`}>{u.id}</p>
                      </div>
                    </div>
                  ); })
                ) : (
                  <p className={`text-sm text-center ${isDark ? "text-gray-500" : "text-gray-600"}`}>No one is connected to this room right now.</p>
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
            {roomOwnerId && user.id === roomOwnerId && (
              <div className={`rounded-lg border p-3 ${isDark ? "bg-indigo-950/40 border-indigo-800" : "bg-indigo-50 border-indigo-200"}`}>
                <h3 className={`text-sm font-semibold mb-1 flex items-center gap-2 ${isDark ? "text-indigo-200" : "text-indigo-900"}`}>
                  <FiBook size={16} /> Facilitating this module?
                </h3>
                <p className={`text-xs mb-2 ${isDark ? "text-indigo-300/90" : "text-indigo-800/90"}`}>
                  Open the room dashboard for class-wide participation stats and gentle “who might need a check-in” signals (no grades).
                </p>
                <button
                  type="button"
                  onClick={() => roomIdFromUrl && navigate(`/dashboard/${roomIdFromUrl}`)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  Open teaching dashboard
                </button>
              </div>
            )}
          </div>
        </div>
        </div>
      );
    }

    // Default: AI Guide
    return (
      <div className="flex flex-col flex-1 min-h-0 h-full w-full min-w-0">
        {renderPersistentLearningChat()}
      <div className={`flex flex-col flex-1 min-h-0 overflow-hidden ${isDark ? "glass-panel" : "glass-panel-light"} rounded-lg transition-all duration-300`}>
        <h2 className={`text-lg font-bold font-display p-3 border-b flex items-center gap-2 ${isDark ? "text-gray-200 border-[rgba(0,240,255,0.08)]" : "text-gray-900 border-surface-200/60 bg-white/30"}`}>
          <FiBox className="text-[#00f0ff]" /> AI Guide
        </h2>
        <div className="flex-grow p-4 overflow-y-auto space-y-4">
          {aiMessages.length === 0 && (
            <p className={`text-center mt-4 ${isDark ? "text-gray-500" : "text-gray-600"}`}>
              Ask the AI guide about this checkpoint. It responds in <strong>{currentAiMode || "tutor"}</strong> mode.
            </p>
          )}
          {aiMessages.map((msg, idx) => (
            <div key={idx} className={`flex items-start gap-3 ${msg.sender === 'user' ? 'justify-end' : ''}`}>
              {msg.sender === 'ai' && <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#00f0ff] to-[#bf5af2] flex-shrink-0 flex items-center justify-center font-bold text-white text-sm">AI</div>}
              <div className={`max-w-xs md:max-w-md lg:max-w-sm rounded-2xl px-4 py-2.5 shadow-sm transition-all ${msg.sender === 'user' ? (isDark ? 'bg-gradient-to-r from-[rgba(0,240,255,0.12)] to-[rgba(191,90,242,0.12)] text-white rounded-tr-sm border border-[rgba(0,240,255,0.15)]' : 'bg-brand-500 text-white rounded-tr-sm') : (isDark ? 'bg-surface-800/60 border border-[rgba(255,255,255,0.06)] backdrop-blur-sm' : 'bg-white/80 border border-gray-200 backdrop-blur-sm')} ${msg.sender === 'user' ? 'text-white' : (isDark ? 'text-gray-300' : 'text-gray-800')}`}>
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
        <form onSubmit={handleAiSubmit} className={`p-3 border-t flex gap-2 ${isDark ? "border-[rgba(0,240,255,0.08)]" : "border-surface-200/60 bg-white/20"}`}>
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
        isDark ? "app-shell-dark text-gray-200" : "app-shell-light"
      }`}
    >
      {/* Toast overlay */}
      {toast && (
        <div className="fixed inset-0 z-[9999] pointer-events-none flex items-start justify-center pt-4 px-4">
          <div
            className={`max-w-lg w-full sm:w-auto px-4 py-3 rounded-xl shadow-2xl border text-sm pointer-events-auto flex items-start gap-3 ${
              toast.type === "success"
                ? "bg-green-600 text-white border-green-500/80"
                : "bg-red-600 text-white border-red-500/80"
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
        <nav className={`${isDark ? "glass-panel" : "glass-panel-light"} rounded-xl px-4 py-3 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between transition-all duration-300`}>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSidebarOpen((v) => !v)}
              className={`hidden lg:inline-flex items-center justify-center w-9 h-9 rounded-md border transition-all duration-300 ${isDark ? "bg-surface-800/50 hover:bg-surface-700/60 text-gray-200 border-[rgba(0,240,255,0.08)] hover:border-[rgba(0,240,255,0.2)]" : "bg-white/60 hover:bg-gray-100 text-gray-800 border-gray-200"}`}
            >
              {isSidebarOpen ? <FiChevronsLeft size={18} /> : <FiChevronsRight size={18} />}
            </button>
            <button
              onClick={() => roomIdFromUrl && navigate(`/code/${roomIdFromUrl}`)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all duration-300 hover:scale-105 active:scale-95 ${isDark ? "bg-surface-800/50 hover:bg-surface-700/60 border-[rgba(0,240,255,0.08)] hover:border-[rgba(0,240,255,0.2)] text-gray-200" : "bg-white/60 hover:bg-gray-50 border-gray-200 text-gray-800 shadow-sm"}`}
            >
              <span>←</span>
              <span>Back to Editor</span>
            </button>
            <div>
              <span className={`text-2xl font-bold font-display ${isDark ? "text-white" : "text-gray-900"}`}><span className="gradient-text-neon">CoLearn</span></span>
              <span className={`text-xs font-mono px-2 py-1 rounded-full ml-2 ${isDark ? "text-gray-400 bg-surface-800/50 border border-[rgba(0,240,255,0.08)]" : "text-brand-700 bg-brand-50/80 border border-brand-200"}`}>
                Module · {roomDisplayName ? `${roomDisplayName} · ${roomLabel}` : roomLabel}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <button
              type="button"
              onClick={() => setActivePanel("ai")}
              title={aiPanelUnread ? "New AI messages" : undefined}
              className={`relative px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 transition-all duration-300 ${activePanel === 'ai' ? 'bg-gradient-to-r from-[rgba(0,240,255,0.2)] to-[rgba(191,90,242,0.2)] border border-[rgba(0,240,255,0.3)] text-white shadow-glow-neon' : (isDark ? 'bg-surface-800/50 text-gray-300 hover:bg-surface-700/60 border border-[rgba(0,240,255,0.06)]' : 'bg-white/60 text-gray-700 hover:bg-gray-50 border border-gray-200')} hover:scale-105 active:scale-95`}
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
              className={`relative px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 transition-all duration-300 ${activePanel === 'chat' ? 'bg-gradient-to-r from-[rgba(0,240,255,0.2)] to-[rgba(191,90,242,0.2)] border border-[rgba(0,240,255,0.3)] text-white shadow-glow-neon' : (isDark ? 'bg-surface-800/50 text-gray-300 hover:bg-surface-700/60 border border-[rgba(0,240,255,0.06)]' : 'bg-white/60 text-gray-700 hover:bg-gray-50 border border-gray-200')} hover:scale-105 active:scale-95`}
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
              className={`px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 transition-all duration-300 ${activePanel === 'info' ? 'bg-gradient-to-r from-[rgba(0,240,255,0.2)] to-[rgba(191,90,242,0.2)] border border-[rgba(0,240,255,0.3)] text-white shadow-glow-neon' : (isDark ? 'bg-surface-800/50 text-gray-300 hover:bg-surface-700/60 border border-[rgba(0,240,255,0.06)]' : 'bg-white/60 text-gray-700 hover:bg-gray-50 border border-gray-200')} hover:scale-105 active:scale-95`}
            >
              <FiUsers /> Room
            </button>
            {effectiveUserId && roomIdFromUrl && (
              <a
                href="#colearn-voice-channel"
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById("colearn-voice-channel")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                  window.dispatchEvent(new CustomEvent(VOICE_OPEN_JOIN_EVENT));
                }}
                className={`px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 border transition-all duration-200 ${
                  voice.inVoice
                    ? isDark
                      ? "bg-emerald-900/50 border-emerald-700/60 text-emerald-200"
                      : "bg-emerald-100 border-emerald-300 text-emerald-900"
                    : isDark
                      ? "bg-gray-800/80 text-gray-300 border-gray-600 hover:bg-gray-700"
                      : "bg-white text-gray-700 border-gray-300 hover:bg-slate-50"
                }`}
                title="Jump to room voice (below the top bar)"
              >
                <FiHeadphones className="shrink-0" size={16} aria-hidden />
                Voice
              </a>
            )}
            <button
              type="button"
              onClick={() => setActivePanel("notes")}
              className={`px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 transition-all duration-300 ${activePanel === 'notes' ? 'bg-gradient-to-r from-[rgba(0,240,255,0.2)] to-[rgba(191,90,242,0.2)] border border-[rgba(0,240,255,0.3)] text-white shadow-glow-neon' : (isDark ? 'bg-surface-800/50 text-gray-300 hover:bg-surface-700/60 border border-[rgba(0,240,255,0.06)]' : 'bg-white/60 text-gray-700 hover:bg-gray-50 border border-gray-200')} hover:scale-105 active:scale-95`}
            >
              <FiFileText /> Notes
            </button>
          </div>
        </nav>

        {effectiveUserId && roomIdFromUrl && (
          <VoiceChannelBar
            id="colearn-voice-channel"
            isDark={isDark}
            myUserId={effectiveUserId}
            myName={effectiveUserName}
            myClientId={wsClientIdRef.current}
            members={peerListForVoice}
            voice={voice}
            roomLabel="module room"
            placement="underNav"
          />
        )}

        {coachKind && coachStorageKey && typeof sessionStorage !== "undefined" && sessionStorage.getItem(coachStorageKey) !== "1" && (
          <div
            className={`flex-shrink-0 flex items-start gap-3 rounded-xl border px-4 py-3 ${isDark ? "bg-amber-950/50 border-amber-800 text-amber-100" : "bg-amber-50 border-amber-200 text-amber-950"}`}
            role="status"
          >
            <FiHeart className="shrink-0 mt-0.5 text-amber-500" size={20} aria-hidden />
            <div className="flex-1 min-w-0 text-sm leading-relaxed">
              <p className="font-semibold mb-1">You’ve got this</p>
              {coachKind === "slow" ? (
                <p>
                  Your practice history suggests a steadier pace — that is normal. Use the AI Guide for hints, take breaks, and use room chat if others are online.
                  {cohortMemberCount > 1 && " Everyone progresses differently; focus on understanding, not speed."}
                </p>
              ) : (
                <p>
                  Recent tests have been challenging — that usually means you are stretching. Try one small change at a time and ask the AI for a hint (not the full answer) first.
                  {connectedUsers.length > 0 && " A classmate is online — pairing can help."}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                if (coachStorageKey) sessionStorage.setItem(coachStorageKey, "1");
                setCoachKind(null);
              }}
              className={`shrink-0 text-xs font-semibold underline ${isDark ? "text-amber-300" : "text-amber-800"}`}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Main Content - Flex Layout */}
        <div className="flex min-h-0 flex-1 gap-4 overflow-hidden flex-col lg:flex-row">
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