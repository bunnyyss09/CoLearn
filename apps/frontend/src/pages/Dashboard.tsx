import React, { useEffect, useState } from "react";
import { useRecoilValue } from "recoil";
import { useNavigate, useParams } from "react-router-dom";
import { authAtom } from "../atoms/authAtom";
import { themeAtom } from "../atoms/themeAtom";
import { sidebarOpenAtom } from "../atoms/sidebarAtom";
import { IP_ADDRESS } from "../Globle";
import Sidebar from "../components/Sidebar";
import AccountModal from "../components/AccountModal";
import SettingsModal from "../components/SettingsModal";
import { AiOutlineLoading3Quarters } from "react-icons/ai";
import { FiUsers, FiBook, FiCode, FiMessageCircle, FiCalendar, FiPlay } from "react-icons/fi";

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

  // Fetch user learning profile
  useEffect(() => {
    if (!roomId && auth.user && auth.token) {
      setLoadingProfile(true);
      fetch(`http://${IP_ADDRESS}:3000/learning-profile/${auth.user.id}`, {
        headers: { Authorization: `Bearer ${auth.token}` },
      })
        .then((res) => res.json())
        .then((data) => {
          setProfile(data.profile || null);
        })
        .catch((err) => {
          console.error("Error fetching learning profile:", err);
        })
        .finally(() => {
          setLoadingProfile(false);
        });
    } else {
      setLoadingProfile(false);
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
          <AiOutlineLoading3Quarters className="animate-spin text-blue-500" size={32} />
        </div>
      );
    }

    const passRate = profile && (profile.metrics.totalTestPasses + profile.metrics.totalTestFailures > 0)
      ? Math.round((profile.metrics.totalTestPasses / (profile.metrics.totalTestPasses + profile.metrics.totalTestFailures)) * 100)
      : null;

    return (
      <div className="space-y-6">
        {/* Welcome Header */}
        <div className={`p-6 rounded-xl ${isDark ? "bg-gradient-to-r from-blue-900/50 to-purple-900/50 border-gray-700" : "bg-gradient-to-r from-blue-100 to-purple-100 border-blue-200"} border`}>
          <h1 className={`text-2xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
            Welcome back, {auth.user?.name || "Learner"}!
          </h1>
          <p className={`mt-2 ${isDark ? "text-gray-300" : "text-gray-600"}`}>
            Ready to continue your coding journey? Select a room from the sidebar or check your progress below.
          </p>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className={`p-4 rounded-xl ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200 shadow-sm"} border`}>
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${isDark ? "bg-blue-900/50" : "bg-blue-100"}`}>
                <FiMessageCircle className="text-blue-500" size={20} />
              </div>
              <div>
                <p className={`text-2xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                  {profile?.metrics.totalAiQuestions || 0}
                </p>
                <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>AI Questions</p>
              </div>
            </div>
          </div>

          <div className={`p-4 rounded-xl ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200 shadow-sm"} border`}>
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

          <div className={`p-4 rounded-xl ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200 shadow-sm"} border`}>
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

          <div className={`p-4 rounded-xl ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200 shadow-sm"} border`}>
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${isDark ? "bg-purple-900/50" : "bg-purple-100"}`}>
                <FiPlay className="text-purple-500" size={20} />
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
        </div>

        {/* Areas to Improve & Topics */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* Areas to Focus On */}
          <div className={`p-5 rounded-xl ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200 shadow-sm"} border`}>
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
          <div className={`p-5 rounded-xl ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200 shadow-sm"} border`}>
            <h3 className={`font-semibold mb-3 ${isDark ? "text-white" : "text-gray-900"}`}>
              Topics You're Exploring
            </h3>
            {profile?.metrics.topTopics && profile.metrics.topTopics.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {profile.metrics.topTopics.map((t, i) => (
                  <span key={i} className={`px-3 py-1.5 rounded-full text-sm ${isDark ? "bg-blue-900/50 text-blue-300" : "bg-blue-100 text-blue-700"}`}>
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
        <div className={`p-5 rounded-xl ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200 shadow-sm"} border`}>
          <h3 className={`font-semibold mb-3 ${isDark ? "text-white" : "text-gray-900"}`}>
            Quick Actions
          </h3>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => navigate("/")}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              + Create / Join Room
            </button>
          </div>
        </div>

        {/* Tip */}
        <div className={`p-4 rounded-lg ${isDark ? "bg-gray-800/50 border-gray-700" : "bg-blue-50 border-blue-200"} border text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>
          💡 <strong>Tip:</strong> Select a room from the sidebar to start coding, or create a new room to begin a fresh session!
        </div>
      </div>
    );
  };

  const renderRoomDetails = () => {
    if (loadingRoom) {
      return (
        <div className="flex items-center justify-center py-20">
          <AiOutlineLoading3Quarters className="animate-spin text-blue-500" size={32} />
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
        <div className={`p-6 rounded-xl ${isDark ? "bg-gradient-to-r from-indigo-900/50 to-blue-900/50 border-gray-700" : "bg-gradient-to-r from-indigo-100 to-blue-100 border-blue-200"} border`}>
          <div className="flex items-start justify-between">
            <div>
              <h1 className={`text-2xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
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
                ? isDark ? "bg-purple-900/50 text-purple-300" : "bg-purple-100 text-purple-700"
                : isDark ? "bg-blue-900/50 text-blue-300" : "bg-blue-100 text-blue-700"
            }`}>
              {roomDetails.isLearningRoom ? "Learning Room" : "Collaboration Room"}
            </span>
          </div>
        </div>

        {/* Room Info Grid */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* Members */}
          <div className={`p-5 rounded-xl ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200 shadow-sm"} border`}>
            <h3 className={`font-semibold mb-3 flex items-center gap-2 ${isDark ? "text-white" : "text-gray-900"}`}>
              <FiUsers size={18} />
              Members ({roomDetails.members?.length || 0})
            </h3>
            <div className="space-y-2">
              {roomDetails.memberNames && roomDetails.memberNames.length > 0 ? (
                roomDetails.memberNames.map((name, i) => (
                  <div key={i} className={`flex items-center gap-2 text-sm ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ${isDark ? "bg-gray-700 text-gray-200" : "bg-gray-200 text-gray-700"}`}>
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
            <div className={`p-5 rounded-xl ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200 shadow-sm"} border`}>
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
                  {roomDetails.totalCheckpoints && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className={isDark ? "text-gray-400" : "text-gray-600"}>Progress</span>
                        <span className={isDark ? "text-gray-300" : "text-gray-700"}>
                          {(roomDetails.currentCheckpointIndex || 0) + 1} / {roomDetails.totalCheckpoints} checkpoints
                        </span>
                      </div>
                      <div className={`h-2 rounded-full ${isDark ? "bg-gray-700" : "bg-gray-200"}`}>
                        <div 
                          className="h-full rounded-full bg-green-500 transition-all"
                          style={{ width: `${((roomDetails.currentCheckpointIndex || 0) + 1) / roomDetails.totalCheckpoints * 100}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className={`text-sm ${isDark ? "text-gray-500" : "text-gray-500"}`}>No module selected yet.</p>
              )}
            </div>
          ) : (
            <div className={`p-5 rounded-xl ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200 shadow-sm"} border`}>
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

        {/* Enter Room Button */}
        <button
          onClick={handleEnterRoom}
          className="w-full py-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold text-lg transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-lg"
        >
          {roomDetails.isLearningRoom ? "Continue Learning" : "Enter Room"}
        </button>
      </div>
    );
  };

  return (
    <div className={`flex h-screen ${isDark ? "bg-gray-950" : "bg-gray-100"}`}>
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
