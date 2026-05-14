import React, { useEffect, useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useRecoilValue } from "recoil";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { authAtom } from "../atoms/authAtom";
import { themeAtom } from "../atoms/themeAtom";
import { sidebarOpenAtom } from "../atoms/sidebarAtom";
import { IP_ADDRESS } from "../Globle";
import Sidebar from "../components/Sidebar";
import AccountModal from "../components/AccountModal";
import SettingsModal from "../components/SettingsModal";
import FadeIn from "../components/animations/FadeIn";
import StaggerContainer, { StaggerItem } from "../components/animations/StaggerContainer";
import { AiOutlineLoading3Quarters } from "react-icons/ai";
import {
  FiUsers,
  FiBook,
  FiCode,
  FiMessageCircle,
  FiCalendar,
  FiPlay,
  FiBarChart2,
  FiCpu,
  FiHeart,
  FiAward,
} from "react-icons/fi";

interface LearningProfile {
  weaknesses: { category: string; description: string; occurrences: number }[];
  strengths: string[];
  metrics: {
    totalAiQuestions: number;
    totalTestFailures: number;
    totalTestPasses: number;
    topTopics: { topic: string; count: number }[];
  };
  learningPace: string;
  recentErrors: { errorType: string; timestamp: Date }[];
}

interface RoomDetails {
  roomId: string;
  displayName?: string | null;
  ownerId: string;
  ownerName?: string;
  members: string[];
  memberNames?: string[];
  isLearningRoom: boolean;
  moduleId?: string;
  moduleName?: string;
  moduleDescription?: string;
  currentCheckpointIndex?: number;
  totalCheckpoints?: number;
  createdAt: string;
}

interface RoomContribution {
  userId: string;
  userName: string;
  chatMessages: number;
  aiQuestions: number;
  activityScore: number;
  contributionPercent: number;
}

interface RoomStats {
  summary: {
    totalChatMessages: number;
    totalAiQuestions: number;
    memberCount: number;
    language: string;
    lastActivityAt: string | null;
    codeLastUpdatedAt: string | null;
    hasLoggedActivity: boolean;
  };
  contributions: RoomContribution[];
  weights: { chatMessage: number; aiQuestion: number };
}

type TeachingCheckInHint =
  | "slow_pace"
  | "low_test_pass_rate"
  | "low_room_engagement"
  | "frequent_help_seeking";

interface TeachingLearnerRow {
  userId: string;
  userName: string;
  learningPace: string;
  testPassRatePercent: number | null;
  testsRunTotal: number;
  topFocusCategory: string | null;
  lifetimeAiQuestions: number;
  roomChatMessages: number;
  roomAiQuestions: number;
  suggestCheckIn: boolean;
  checkInHints: TeachingCheckInHint[];
}

interface TeachingInsights {
  disclaimer: string;
  sharedCheckpointIndex: number;
  moduleCompleted?: boolean;
  summary: {
    memberCount: number;
    checkInSuggestedCount: number;
    anyRoomActivity: boolean;
  };
  learners: TeachingLearnerRow[];
}

const TEACHING_HINT_COPY: Record<TeachingCheckInHint, string> = {
  slow_pace:
    "Learning pace flagged as slower — a short encouraging check-in can help.",
  low_test_pass_rate:
    "Several recorded test runs below 50% pass rate.",
  low_room_engagement:
    "Almost no chat or AI use in this room while others are active.",
  frequent_help_seeking:
    "Many AI questions with mixed tests — extra scaffolding may help.",
};

const CONTRIBUTION_BAR_COLORS = [
  "bg-brand-500",
  "bg-brand-400",
  "bg-accent-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
];

const PIE_COLORS = ["#3b82f6", "#6366f1", "#10b981", "#f59e0b", "#f43f5e", "#06b6d4"];

const Dashboard: React.FC = () => {
  const { roomId } = useParams<{ roomId?: string }>();
  const auth = useRecoilValue(authAtom);
  const theme = useRecoilValue(themeAtom);
  const isSidebarOpen = useRecoilValue(sidebarOpenAtom);
  const isDark = theme === "dark";
  const navigate = useNavigate();

  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // User profile state
  const [profile, setProfile] = useState<LearningProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  // Room details state
  const [roomDetails, setRoomDetails] = useState<RoomDetails | null>(null);
  const [loadingRoom, setLoadingRoom] = useState(false);
  const [roomStats, setRoomStats] = useState<RoomStats | null>(null);
  const [loadingRoomStats, setLoadingRoomStats] = useState(false);
  const [teachingInsights, setTeachingInsights] = useState<TeachingInsights | null>(null);
  const [loadingTeaching, setLoadingTeaching] = useState(false);
  const [userStats, setUserStats] = useState<{
    problemsSolved: number;
    topicsCovered: string[];
    streak: number;
    badges: string[];
    timeSpent: number;
    weakTopics: string[];
    progressOverTime: { at: string; problemsSolved: number }[];
  } | null>(null);
  const [loadingUserStats, setLoadingUserStats] = useState(false);

  // Fetch user learning profile + aggregate user stats
  useEffect(() => {
    if (!roomId && auth.user && auth.token) {
      setLoadingProfile(true);
      setLoadingUserStats(true);
      const headers = { Authorization: `Bearer ${auth.token}` };
      Promise.all([
        fetch(`http://${IP_ADDRESS}:3000/learning-profile/${auth.user.id}`, { headers })
          .then((res) => res.json())
          .then((data) => {
            setProfile(data.profile || null);
          }),
        fetch(`http://${IP_ADDRESS}:3000/stats/${auth.user.id}`, { headers })
          .then((res) => (res.ok ? res.json() : { stats: null }))
          .then((data) => {
            setUserStats(data.stats || null);
          }),
      ])
        .catch((err) => {
          console.error("Error fetching profile/stats:", err);
        })
        .finally(() => {
          setLoadingProfile(false);
          setLoadingUserStats(false);
        });
    } else {
      setLoadingProfile(false);
      setUserStats(null);
    }
  }, [roomId, auth.user, auth.token]);

  // Fetch room details when roomId changes
  useEffect(() => {
    if (roomId && auth.token) {
      setLoadingRoom(true);
      fetch(`http://${IP_ADDRESS}:3000/room/${roomId}/details`, {
        headers: { Authorization: `Bearer ${auth.token}` },
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.room) {
            setRoomDetails(data.room);
          }
        })
        .catch((err) => {
          console.error("Error fetching room details:", err);
        })
        .finally(() => {
          setLoadingRoom(false);
        });
    } else {
      setRoomDetails(null);
    }
  }, [roomId, auth.token]);

  useEffect(() => {
    if (roomId && auth.token) {
      setLoadingRoomStats(true);
      fetch(`http://${IP_ADDRESS}:3000/room/${roomId}/stats`, {
        headers: { Authorization: `Bearer ${auth.token}` },
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.summary && Array.isArray(data.contributions)) {
            setRoomStats(data as RoomStats);
          } else {
            setRoomStats(null);
          }
        })
        .catch((err) => {
          console.error("Error fetching room stats:", err);
          setRoomStats(null);
        })
        .finally(() => setLoadingRoomStats(false));
    } else {
      setRoomStats(null);
    }
  }, [roomId, auth.token]);

  useEffect(() => {
    if (
      !roomId ||
      !auth.token ||
      !roomDetails?.isLearningRoom ||
      roomDetails.ownerId !== auth.user?.id
    ) {
      setTeachingInsights(null);
      return;
    }
    setLoadingTeaching(true);
    fetch(`http://${IP_ADDRESS}:3000/room/${roomId}/teaching-insights`, {
      headers: { Authorization: `Bearer ${auth.token}` },
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: TeachingInsights) => {
        if (data.learners && Array.isArray(data.learners)) setTeachingInsights(data);
        else setTeachingInsights(null);
      })
      .catch(() => setTeachingInsights(null))
      .finally(() => setLoadingTeaching(false));
  }, [roomId, auth.token, roomDetails?.isLearningRoom, roomDetails?.ownerId, auth.user?.id]);

  const handleEnterRoom = () => {
    if (!roomDetails) return;
    if (roomDetails.isLearningRoom) {
      navigate(`/learn/${roomDetails.roomId}`);
    } else {
      navigate(`/code/${roomDetails.roomId}`);
    }
  };

  const renderUserProfile = () => {
    if (loadingProfile) {
      return (
        <div className="flex items-center justify-center py-20">
          <AiOutlineLoading3Quarters className="animate-spin text-brand-400" size={32} />
        </div>
      );
    }

    const passRate = profile && (profile.metrics.totalTestPasses + profile.metrics.totalTestFailures > 0)
      ? Math.round((profile.metrics.totalTestPasses / (profile.metrics.totalTestPasses + profile.metrics.totalTestFailures)) * 100)
      : null;

    return (
      <div className="space-y-6">
        {/* Welcome Header */}
        <FadeIn>
        <div className={`p-6 rounded-2xl ${isDark ? "bg-gradient-to-r from-brand-900/50 to-brand-800/50 border-surface-700" : "bg-gradient-to-r from-brand-100 to-brand-50 border-brand-200"} border`}>
          <h1 className={`text-2xl font-bold font-display ${isDark ? "text-white" : "text-gray-900"}`}>
            Welcome back, {auth.user?.name || "Learner"}!
          </h1>
          <p className={`mt-2 ${isDark ? "text-gray-300" : "text-gray-600"}`}>
            Ready to continue your coding journey? Select a room from the sidebar or check your progress below.
          </p>
        </div>
        </FadeIn>

        {/* Stats Overview */}
        <StaggerContainer className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StaggerItem>
          <div className={`p-4 rounded-2xl ${isDark ? "bg-surface-800 border-surface-700" : "bg-white border-gray-200 shadow-sm"} border`}>
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${isDark ? "bg-brand-900/50" : "bg-brand-100"}`}>
                <FiMessageCircle className="text-brand-400" size={20} />
              </div>
              <div>
                <p className={`text-2xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                  {profile?.metrics.totalAiQuestions || 0}
                </p>
                <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>AI Questions</p>
              </div>
            </div>
          </div>
          </StaggerItem>

          <StaggerItem>
          <div className={`p-4 rounded-2xl ${isDark ? "bg-surface-800 border-surface-700" : "bg-white border-gray-200 shadow-sm"} border`}>
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${passRate !== null && passRate >= 70 ? "bg-green-900/50" : "bg-yellow-900/50"}`}>
                <FiCode className={passRate !== null && passRate >= 70 ? "text-green-500" : "text-yellow-500"} size={20} />
              </div>
              <div>
                <p className={`text-2xl font-bold ${passRate !== null && passRate >= 70 ? "text-green-500" : passRate !== null ? "text-yellow-500" : isDark ? "text-white" : "text-gray-900"}`}>
                  {passRate !== null ? `${passRate}%` : "-"}
                </p>
                <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>Test Pass Rate</p>
              </div>
            </div>
          </div>
          </StaggerItem>

          <StaggerItem>
          <div className={`p-4 rounded-2xl ${isDark ? "bg-surface-800 border-surface-700" : "bg-white border-gray-200 shadow-sm"} border`}>
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${isDark ? "bg-green-900/50" : "bg-green-100"}`}>
                <FiBook className="text-green-500" size={20} />
              </div>
              <div>
                <p className={`text-2xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                  {profile?.metrics.totalTestPasses || 0}
                </p>
                <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>Tests Passed</p>
              </div>
            </div>
          </div>
          </StaggerItem>

          <StaggerItem>
          <div className={`p-4 rounded-2xl ${isDark ? "bg-surface-800 border-surface-700" : "bg-white border-gray-200 shadow-sm"} border`}>
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${isDark ? "bg-brand-800/50" : "bg-brand-100"}`}>
                <FiPlay className="text-brand-400" size={20} />
              </div>
              <div>
                <p className={`text-2xl font-bold capitalize ${
                  profile?.learningPace === "fast" ? "text-green-500" :
                  profile?.learningPace === "slow" ? "text-yellow-500" :
                  isDark ? "text-white" : "text-gray-900"
                }`}>
                  {profile?.learningPace === "unknown" ? "-" : profile?.learningPace || "-"}
                </p>
                <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>Learning Pace</p>
              </div>
            </div>
          </div>
          </StaggerItem>
        </StaggerContainer>

        {/* Session-based stats (checkpoints / tests) */}
        {!loadingUserStats && userStats && (
          <>
            <h2 className={`text-lg font-bold ${isDark ? "text-gray-200" : "text-gray-800"}`}>
              Learning analytics
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className={`p-4 rounded-xl ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200 shadow-sm"} border`}>
                <p className={`text-2xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                  {userStats.problemsSolved}
                </p>
                <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>Problems solved</p>
              </div>
              <div className={`p-4 rounded-xl ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200 shadow-sm"} border`}>
                <p className={`text-2xl font-bold text-orange-500`}>{userStats.streak}</p>
                <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>Day streak</p>
              </div>
              <div className={`p-4 rounded-xl ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200 shadow-sm"} border`}>
                <p className={`text-2xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                  {Math.floor(userStats.timeSpent / 60)}m
                </p>
                <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>Est. practice time</p>
              </div>
              <div className={`p-4 rounded-xl ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200 shadow-sm"} border`}>
                <div className="flex items-center gap-1 flex-wrap">
                  {userStats.badges.length === 0 && (
                    <p className={`text-sm ${isDark ? "text-gray-500" : "text-gray-500"}`}>—</p>
                  )}
                  {userStats.badges.map((b) => (
                    <span
                      key={b}
                      title={b}
                      className="inline-flex items-center gap-0.5 text-xs font-medium px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-600 dark:text-amber-300"
                    >
                      <FiAward size={12} />
                      {b.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
                <p className={`text-xs mt-1 ${isDark ? "text-gray-400" : "text-gray-600"}`}>Badges</p>
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div
                className={`p-4 rounded-xl min-h-[260px] ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border border-gray-200 shadow-sm"}`}
              >
                <h3 className={`text-sm font-semibold mb-2 ${isDark ? "text-white" : "text-gray-900"}`}>
                  Topics covered (from checkpoints)
                </h3>
                {userStats.topicsCovered.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={userStats.topicsCovered.map((t) => ({ name: t.length > 24 ? `${t.slice(0, 24)}…` : t, value: 1 }))}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={70}
                        label
                      >
                        {userStats.topicsCovered.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className={`text-sm ${isDark ? "text-gray-500" : "text-gray-500"}`}>
                    Pass checkpoint tests in learning rooms to see topics here.
                  </p>
                )}
              </div>
              <div
                className={`p-4 rounded-xl min-h-[260px] ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border border-gray-200 shadow-sm"}`}
              >
                <h3 className={`text-sm font-semibold mb-2 ${isDark ? "text-white" : "text-gray-900"}`}>
                  Cumulative problems solved
                </h3>
                {userStats.progressOverTime.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart
                      data={userStats.progressOverTime.map((p) => ({
                        t: new Date(p.at).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
                        n: p.problemsSolved,
                      }))}
                    >
                      <XAxis dataKey="t" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                      <Tooltip />
                      <Line type="monotone" dataKey="n" stroke="#3b82f6" dot={false} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className={`text-sm ${isDark ? "text-gray-500" : "text-gray-500"}`}>
                    Your progress will appear as you complete checkpoints.
                  </p>
                )}
              </div>
            </div>
          </>
        )}

        {/* Areas to Improve & Topics */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* Areas to Focus On */}
          <div className={`p-5 rounded-2xl ${isDark ? "bg-surface-800 border-surface-700" : "bg-white border-gray-200 shadow-sm"} border`}>
            <h3 className={`font-semibold mb-3 ${isDark ? "text-white" : "text-gray-900"}`}>
              Areas to Focus On
            </h3>
            {profile?.weaknesses && profile.weaknesses.length > 0 ? (
              <div className="space-y-2">
                {profile.weaknesses.slice(0, 5).map((w, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className={`text-sm ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                      <span className="capitalize">{w.category}</span>
                      {w.description !== w.category && `: ${w.description}`}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${isDark ? "bg-red-900/50 text-red-300" : "bg-red-100 text-red-700"}`}>
                      {w.occurrences}x
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className={`text-sm ${isDark ? "text-gray-500" : "text-gray-500"}`}>
                No areas identified yet. Keep coding to build your profile!
              </p>
            )}
          </div>

          {/* Frequently Asked Topics */}
          <div className={`p-5 rounded-2xl ${isDark ? "bg-surface-800 border-surface-700" : "bg-white border-gray-200 shadow-sm"} border`}>
            <h3 className={`font-semibold mb-3 ${isDark ? "text-white" : "text-gray-900"}`}>
              Topics You're Exploring
            </h3>
            {profile?.metrics.topTopics && profile.metrics.topTopics.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {profile.metrics.topTopics.map((t, i) => (
                  <span key={i} className={`px-3 py-1.5 rounded-full text-sm ${isDark ? "bg-brand-800/50 text-brand-300" : "bg-brand-100 text-brand-700"}`}>
                    {t.topic} ({t.count})
                  </span>
                ))}
              </div>
            ) : (
              <p className={`text-sm ${isDark ? "text-gray-500" : "text-gray-500"}`}>
                Ask the AI tutor questions to see your topics here!
              </p>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className={`p-5 rounded-2xl ${isDark ? "bg-surface-800 border-surface-700" : "bg-white border-gray-200 shadow-sm"} border`}>
          <h3 className={`font-semibold mb-3 ${isDark ? "text-white" : "text-gray-900"}`}>
            Quick Actions
          </h3>
          <div className="flex flex-wrap gap-3">
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => navigate("/")}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white shadow-lg hover:shadow-glow-brand font-medium transition-all"
            >
              + Create / Join Room
            </motion.button>
          </div>
        </div>

        {/* Tip */}
        <div className={`p-4 rounded-lg ${isDark ? "bg-surface-800/50 border-surface-700" : "bg-brand-50 border-brand-200"} border text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>
          💡 <strong>Tip:</strong> Select a room from the sidebar to start coding, or create a new room to begin a fresh session!
        </div>

        <div className={`p-4 rounded-lg ${isDark ? "bg-brand-950/40 border-brand-900/50" : "bg-brand-50 border-brand-200"} border text-sm ${isDark ? "text-brand-200/90" : "text-brand-900/90"}`}>
          <strong className="font-semibold">For instructors:</strong> After students join a <strong>learning room</strong>, open that room from the sidebar and use <strong>Class insights</strong> on the dashboard for participation signals and supportive check-in ideas — not grades.
        </div>
      </div>
    );
  };

  const renderRoomDetails = () => {
    if (loadingRoom) {
      return (
        <div className="flex items-center justify-center py-20">
          <AiOutlineLoading3Quarters className="animate-spin text-brand-400" size={32} />
        </div>
      );
    }

    if (!roomDetails) {
      return (
        <div className={`text-center py-20 ${isDark ? "text-gray-400" : "text-gray-600"}`}>
          Room not found or you don't have access to this room.
        </div>
      );
    }

    const createdDate = new Date(roomDetails.createdAt).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    return (
      <div className="space-y-6">
        {/* Room Header */}
        <FadeIn>
        <div className={`p-6 rounded-2xl ${isDark ? "bg-gradient-to-r from-brand-900/50 to-brand-700/50 border-surface-700" : "bg-gradient-to-r from-brand-100 to-brand-50 border-brand-200"} border`}>
          <div className="flex items-start justify-between">
            <div>
              <h1 className={`text-2xl font-bold font-display ${isDark ? "text-white" : "text-gray-900"}`}>
                {roomDetails.displayName?.trim() || `Room ${roomDetails.roomId}`}
              </h1>
              {roomDetails.displayName?.trim() && (
                <p className={`mt-1 text-xs font-mono ${isDark ? "text-gray-500" : "text-gray-500"}`}>
                  {roomDetails.roomId}
                </p>
              )}
              <p className={`${roomDetails.displayName?.trim() ? "mt-2" : "mt-1"} flex items-center gap-2 ${isDark ? "text-gray-300" : "text-gray-600"}`}>
                <FiCalendar size={14} />
                Created {createdDate}
              </p>
            </div>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              roomDetails.isLearningRoom 
                ? isDark ? "bg-brand-800/50 text-brand-300" : "bg-brand-100 text-brand-700"
                : isDark ? "bg-brand-800/50 text-brand-300" : "bg-brand-100 text-brand-700"
            }`}>
              {roomDetails.isLearningRoom ? "Learning Room" : "Collaboration Room"}
            </span>
          </div>
        </div>
        </FadeIn>

        {/* Room Info Grid */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* Members */}
          <div className={`p-5 rounded-2xl ${isDark ? "bg-surface-800 border-surface-700" : "bg-white border-gray-200 shadow-sm"} border`}>
            <h3 className={`font-semibold mb-3 flex items-center gap-2 ${isDark ? "text-white" : "text-gray-900"}`}>
              <FiUsers size={18} />
              Members ({roomDetails.members?.length || 0})
            </h3>
            <div className="space-y-2">
              {roomDetails.memberNames && roomDetails.memberNames.length > 0 ? (
                roomDetails.memberNames.map((name, i) => (
                  <div key={i} className={`flex items-center gap-2 text-sm ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ${isDark ? "bg-surface-700 text-gray-200" : "bg-gray-200 text-gray-700"}`}>
                      {name.charAt(0).toUpperCase()}
                    </div>
                    <span>{name}</span>
                    {roomDetails.members[i] === roomDetails.ownerId && (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${isDark ? "bg-yellow-900/50 text-yellow-300" : "bg-yellow-100 text-yellow-700"}`}>Owner</span>
                    )}
                  </div>
                ))
              ) : (
                roomDetails.members?.map((memberId, i) => (
                  <div key={i} className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                    {memberId === roomDetails.ownerId ? `${memberId} (Owner)` : memberId}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Learning Module Info (if learning room) */}
          {roomDetails.isLearningRoom ? (
            <div className={`p-5 rounded-2xl ${isDark ? "bg-surface-800 border-surface-700" : "bg-white border-gray-200 shadow-sm"} border`}>
              <h3 className={`font-semibold mb-3 flex items-center gap-2 ${isDark ? "text-white" : "text-gray-900"}`}>
                <FiBook size={18} />
                Learning Module
              </h3>
              {roomDetails.moduleName ? (
                <div className="space-y-2">
                  <p className={`font-medium ${isDark ? "text-gray-200" : "text-gray-800"}`}>{roomDetails.moduleName}</p>
                  {roomDetails.moduleDescription && (
                    <p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>{roomDetails.moduleDescription}</p>
                  )}
                  {roomDetails.totalCheckpoints && (() => {
                    const totalCp = roomDetails.totalCheckpoints;
                    const rawIdx = roomDetails.currentCheckpointIndex ?? 0;
                    const moduleDoneLearn = rawIdx >= totalCp;
                    const progressPct = moduleDoneLearn
                      ? 100
                      : Math.min(100, ((rawIdx + 1) / totalCp) * 100);
                    return (
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className={isDark ? "text-gray-400" : "text-gray-600"}>Progress</span>
                        <span className={isDark ? "text-gray-300" : "text-gray-700"}>
                          {moduleDoneLearn
                            ? `Complete (${totalCp}/${totalCp} checkpoints)`
                            : `${rawIdx + 1} / ${totalCp} checkpoints`}
                        </span>
                      </div>
                      <div className={`h-2 rounded-full ${isDark ? "bg-surface-700" : "bg-gray-200"}`}>
                        <div 
                          className="h-full rounded-full bg-green-500 transition-all"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </div>
                    );
                  })()}
                </div>
              ) : (
                <p className={`text-sm ${isDark ? "text-gray-500" : "text-gray-500"}`}>No module selected yet.</p>
              )}
            </div>
          ) : (
            <div className={`p-5 rounded-2xl ${isDark ? "bg-surface-800 border-surface-700" : "bg-white border-gray-200 shadow-sm"} border`}>
              <h3 className={`font-semibold mb-3 flex items-center gap-2 ${isDark ? "text-white" : "text-gray-900"}`}>
                <FiCode size={18} />
                Collaboration Mode
              </h3>
              <p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                This is a free-form collaboration room where you can code together with your team in real-time.
              </p>
              <ul className={`mt-3 space-y-1 text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                <li>• Real-time code synchronization</li>
                <li>• Built-in chat</li>
                <li>• AI tutor assistance</li>
                <li>• Multi-language support</li>
              </ul>
            </div>
          )}
        </div>

        {/* Room activity overview & contributions */}
        <div className={`p-6 rounded-2xl border ${isDark ? "bg-surface-900/80 border-surface-700" : "bg-white border-gray-200 shadow-sm"}`}>
          <div className="flex items-center gap-2 mb-4">
            <FiBarChart2 className={isDark ? "text-brand-400" : "text-brand-600"} size={22} />
            <h2 className={`text-lg font-bold font-display ${isDark ? "text-white" : "text-gray-900"}`}>
              Room activity & contributions
            </h2>
          </div>
          <p className={`text-sm mb-5 ${isDark ? "text-gray-400" : "text-gray-600"}`}>
            Overview of collaboration in this room. Contribution % is based on{" "}
            <strong>room chat messages</strong> and <strong>AI tutor questions</strong> (weighted more).
            Shared code edits are not attributed per person yet.
          </p>

          {loadingRoomStats ? (
            <div className="flex justify-center py-10">
              <AiOutlineLoading3Quarters className="animate-spin text-brand-400" size={28} />
            </div>
          ) : roomStats ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <div className={`rounded-lg p-4 ${isDark ? "bg-surface-800/80 border border-surface-700" : "bg-brand-50/80 border border-brand-100"}`}>
                  <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide opacity-80">
                    <FiMessageCircle size={14} />
                    Chat
                  </div>
                  <p className={`text-2xl font-bold mt-1 ${isDark ? "text-white" : "text-gray-900"}`}>
                    {roomStats.summary.totalChatMessages}
                  </p>
                  <p className={`text-xs mt-0.5 ${isDark ? "text-gray-500" : "text-gray-500"}`}>messages</p>
                </div>
                <div className={`rounded-lg p-4 ${isDark ? "bg-surface-800/80 border border-surface-700" : "bg-violet-50/80 border border-violet-100"}`}>
                  <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide opacity-80">
                    <FiCpu size={14} />
                    AI tutor
                  </div>
                  <p className={`text-2xl font-bold mt-1 ${isDark ? "text-white" : "text-gray-900"}`}>
                    {roomStats.summary.totalAiQuestions}
                  </p>
                  <p className={`text-xs mt-0.5 ${isDark ? "text-gray-500" : "text-gray-500"}`}>questions asked</p>
                </div>
                <div className={`rounded-lg p-4 ${isDark ? "bg-surface-800/80 border border-surface-700" : "bg-emerald-50/80 border border-emerald-100"}`}>
                  <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide opacity-80">
                    <FiCode size={14} />
                    Language
                  </div>
                  <p className={`text-lg font-bold mt-1 capitalize ${isDark ? "text-white" : "text-gray-900"}`}>
                    {roomStats.summary.language}
                  </p>
                  <p className={`text-xs mt-0.5 ${isDark ? "text-gray-500" : "text-gray-500"}`}>editor</p>
                </div>
                <div className={`rounded-lg p-4 ${isDark ? "bg-surface-800/80 border border-surface-700" : "bg-amber-50/80 border border-amber-100"}`}>
                  <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide opacity-80">
                    <FiCalendar size={14} />
                    Last activity
                  </div>
                  <p className={`text-sm font-semibold mt-1 leading-snug ${isDark ? "text-white" : "text-gray-900"}`}>
                    {roomStats.summary.lastActivityAt
                      ? new Date(roomStats.summary.lastActivityAt).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                  </p>
                  <p className={`text-xs mt-0.5 ${isDark ? "text-gray-500" : "text-gray-500"}`}>chat or AI</p>
                </div>
              </div>

              <h3 className={`text-sm font-semibold mb-3 ${isDark ? "text-gray-200" : "text-gray-800"}`}>
                Member contribution
              </h3>
              {!roomStats.summary.hasLoggedActivity ? (
                <p className={`text-sm ${isDark ? "text-gray-500" : "text-gray-600"}`}>
                  No chat or AI tutor activity recorded yet. Open the room and start chatting or ask the AI tutor—stats
                  will show up here.
                </p>
              ) : (
                <ul className="space-y-4">
                  {[...roomStats.contributions]
                    .sort((a, b) => b.contributionPercent - a.contributionPercent)
                    .map((c, idx) => (
                      <li key={c.userId}>
                        <div className="flex items-center justify-between gap-3 text-sm mb-1">
                          <span className={`font-medium truncate ${isDark ? "text-gray-200" : "text-gray-800"}`}>
                            {c.userName}
                            {c.userId === roomDetails.ownerId && (
                              <span className={`ml-2 text-xs font-normal ${isDark ? "text-yellow-500/90" : "text-yellow-700"}`}>
                                (owner)
                              </span>
                            )}
                          </span>
                          <span className={`shrink-0 font-semibold tabular-nums ${isDark ? "text-brand-300" : "text-brand-700"}`}>
                            {c.contributionPercent}%
                          </span>
                        </div>
                        <div className={`h-2.5 rounded-full overflow-hidden ${isDark ? "bg-surface-800" : "bg-gray-200"}`}>
                          <div
                            className={`h-full rounded-full transition-all ${CONTRIBUTION_BAR_COLORS[idx % CONTRIBUTION_BAR_COLORS.length]}`}
                            style={{
                              width: `${c.contributionPercent > 0 ? Math.max(c.contributionPercent, 3) : 0}%`,
                            }}
                          />
                        </div>
                        <p className={`text-xs mt-1 ${isDark ? "text-gray-500" : "text-gray-500"}`}>
                          {c.chatMessages} chat · {c.aiQuestions} AI questions
                        </p>
                      </li>
                    ))}
                </ul>
              )}
            </>
          ) : (
            <p className={`text-sm ${isDark ? "text-gray-500" : "text-gray-600"}`}>
              Could not load activity stats.
            </p>
          )}
        </div>

        {/* Teaching insights — learning room owners only */}
        {roomDetails.isLearningRoom && auth.user?.id === roomDetails.ownerId && (
          <div
            className={`p-6 rounded-2xl border ${isDark ? "bg-surface-900/90 border-amber-900/50" : "bg-amber-50/90 border-amber-200 shadow-sm"}`}
          >
            <div className="flex items-center gap-2 mb-2">
              <FiHeart className={isDark ? "text-amber-400" : "text-amber-700"} size={22} />
              <h2 className={`text-lg font-bold font-display ${isDark ? "text-white" : "text-gray-900"}`}>
                Class insights (for instructors)
              </h2>
            </div>
            <p className={`text-xs mb-4 ${isDark ? "text-gray-400" : "text-gray-600"}`}>
              Supportive signals from participation and practice history — not grades. Use for check-ins and grouping, not ranking.
            </p>
            {loadingTeaching ? (
              <div className="flex justify-center py-8">
                <AiOutlineLoading3Quarters className="animate-spin text-amber-500" size={28} />
              </div>
            ) : teachingInsights ? (
              <>
                <p className={`text-xs mb-4 italic ${isDark ? "text-gray-500" : "text-gray-500"}`}>
                  {teachingInsights.disclaimer}
                </p>
                <div className="flex flex-wrap gap-3 mb-4 text-sm">
                  {teachingInsights.moduleCompleted && (
                    <span
                      className={`px-3 py-1 rounded-full font-medium ${isDark ? "bg-green-900/50 text-green-300" : "bg-green-100 text-green-800 border border-green-200"}`}
                    >
                      Module completed for this room
                    </span>
                  )}
                  <span
                    className={`px-3 py-1 rounded-full ${isDark ? "bg-surface-800 text-gray-200" : "bg-white text-gray-800 border border-amber-200"}`}
                  >
                    Shared checkpoint: {teachingInsights.moduleCompleted ? "final" : teachingInsights.sharedCheckpointIndex + 1}
                  </span>
                  <span
                    className={`px-3 py-1 rounded-full ${isDark ? "bg-surface-800 text-gray-200" : "bg-white text-gray-800 border border-amber-200"}`}
                  >
                    Check-in suggested: {teachingInsights.summary.checkInSuggestedCount} /{" "}
                    {teachingInsights.summary.memberCount}
                  </span>
                </div>
                <ul className="space-y-3">
                  {teachingInsights.learners.map((L) => (
                    <li
                      key={L.userId}
                      className={`rounded-lg border p-4 ${isDark ? "bg-surface-800/80 border-surface-700" : "bg-white border-amber-100"}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <span className={`font-semibold ${isDark ? "text-gray-100" : "text-gray-900"}`}>
                          {L.userName}
                        </span>
                        {L.suggestCheckIn && (
                          <span
                            className={`text-xs font-medium px-2 py-0.5 rounded-full ${isDark ? "bg-amber-900/60 text-amber-200" : "bg-amber-200 text-amber-900"}`}
                          >
                            Consider a check-in
                          </span>
                        )}
                      </div>
                      <div className={`flex flex-wrap gap-x-4 gap-y-1 text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                        <span className="capitalize">Pace: {L.learningPace}</span>
                        <span>
                          Tests:{" "}
                          {L.testPassRatePercent !== null
                            ? `${L.testPassRatePercent}% pass (${L.testsRunTotal} runs)`
                            : L.testsRunTotal > 0
                              ? `${L.testsRunTotal} runs`
                              : "no data yet"}
                        </span>
                        <span>
                          This room: {L.roomChatMessages} chat · {L.roomAiQuestions} AI
                        </span>
                        {L.topFocusCategory && (
                          <span className="capitalize">Focus area: {L.topFocusCategory}</span>
                        )}
                      </div>
                      {L.checkInHints.length > 0 && (
                        <ul className={`mt-2 text-xs space-y-1 list-disc list-inside ${isDark ? "text-amber-200/90" : "text-amber-900/90"}`}>
                          {L.checkInHints.map((h) => (
                            <li key={h}>{TEACHING_HINT_COPY[h]}</li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className={`text-sm ${isDark ? "text-gray-500" : "text-gray-600"}`}>
                Could not load teaching insights.
              </p>
            )}
          </div>
        )}

        {/* Enter Room Button */}
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={handleEnterRoom}
          className="w-full py-4 rounded-2xl bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white font-semibold text-lg transition-all duration-200 shadow-lg hover:shadow-glow-brand"
        >
          {roomDetails.isLearningRoom ? "Continue Learning" : "Enter Room"}
        </motion.button>
      </div>
    );
  };

  return (
    <div className={`flex h-screen ${isDark ? "bg-surface-900" : "bg-surface-50"}`}>
      <Sidebar
        showRooms={true}
        onOpenAccount={() => setIsAccountOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      <main className={`flex-1 overflow-y-auto p-6 ${isSidebarOpen ? "" : ""}`}>
        <div className="max-w-4xl mx-auto">
          {roomId ? renderRoomDetails() : renderUserProfile()}
        </div>
      </main>

      <AccountModal isOpen={isAccountOpen} onClose={() => setIsAccountOpen(false)} />
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
};

export default Dashboard;
