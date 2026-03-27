import React, { useEffect, useState } from "react";
import { useRecoilValue } from "recoil";
import { authAtom } from "../atoms/authAtom";
import { themeAtom } from "../atoms/themeAtom";
import { IP_ADDRESS } from "../Globle";
import { AiOutlineLoading3Quarters, AiOutlineClose } from "react-icons/ai";

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

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AccountModal: React.FC<AccountModalProps> = ({ isOpen, onClose }) => {
  const auth = useRecoilValue(authAtom);
  const theme = useRecoilValue(themeAtom);
  const user = auth.user;
  const isDark = theme === "dark";
  
  const [profile, setProfile] = useState<LearningProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [activeTab, setActiveTab] = useState<"account" | "insights">("account");

  // Handle Esc key to close modal
  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('keydown', handleEsc);
    };
  }, [isOpen, onClose]);

  // Fetch learning profile when insights tab is opened
  useEffect(() => {
    if (isOpen && activeTab === "insights" && user && auth.token && !profile) {
      setLoadingProfile(true);
      fetch(`http://${IP_ADDRESS}:3000/learning-profile/${user.id}`, {
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
    }
  }, [isOpen, activeTab, user, auth.token]);

  if (!isOpen) return null;

  const renderAccountTab = () => (
    <>
      {user ? (
        <div className={`space-y-2 text-sm ${isDark ? "text-gray-300" : "text-gray-700"}`}>
          <p>
            <span className={isDark ? "text-gray-400" : "text-gray-600"}>Name:</span> {user.name}
          </p>
          <p>
            <span className={isDark ? "text-gray-400" : "text-gray-600"}>Email:</span> {user.email}
          </p>
          <p>
            <span className={isDark ? "text-gray-400" : "text-gray-600"}>ID:</span> {user.id}
          </p>
        </div>
      ) : (
        <p className={isDark ? "text-gray-400" : "text-gray-600"} style={{ fontSize: '0.875rem' }}>Not signed in.</p>
      )}
    </>
  );

  const renderInsightsTab = () => {
    if (!user) {
      return <p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>Sign in to see your learning insights.</p>;
    }

    if (loadingProfile) {
      return (
        <div className="flex items-center justify-center py-8">
          <AiOutlineLoading3Quarters className="animate-spin text-blue-500" size={24} />
        </div>
      );
    }

    if (!profile) {
      return (
        <p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>
          No learning data yet. Start using the AI tutor and completing exercises to build your profile!
        </p>
      );
    }

    const passRate = profile.metrics.totalTestPasses + profile.metrics.totalTestFailures > 0
      ? Math.round((profile.metrics.totalTestPasses / (profile.metrics.totalTestPasses + profile.metrics.totalTestFailures)) * 100)
      : null;

    return (
      <div className="space-y-4 text-sm">
        {/* Stats Overview */}
        <div className={`grid grid-cols-3 gap-2 rounded-xl border p-3 ${isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-50/80"}`}>
          <div className="text-center">
            <div className={`text-lg font-bold ${isDark ? "text-white" : "text-gray-900"}`}>{profile.metrics.totalAiQuestions}</div>
            <div className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>AI Questions</div>
          </div>
          <div className="text-center">
            <div className={`text-lg font-bold ${passRate !== null && passRate >= 70 ? "text-green-500" : passRate !== null ? "text-yellow-500" : isDark ? "text-white" : "text-gray-900"}`}>
              {passRate !== null ? `${passRate}%` : "-"}
            </div>
            <div className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>Test Pass Rate</div>
          </div>
          <div className="text-center">
            <div className={`text-lg font-bold capitalize ${
              profile.learningPace === "fast" ? "text-green-500" :
              profile.learningPace === "slow" ? "text-yellow-500" :
              isDark ? "text-white" : "text-gray-900"
            }`}>
              {profile.learningPace === "unknown" ? "-" : profile.learningPace}
            </div>
            <div className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>Pace</div>
          </div>
        </div>

        {/* Areas to Improve */}
        {profile.weaknesses.length > 0 && (
          <div>
            <h4 className={`text-xs font-semibold uppercase tracking-wider mb-2 ${isDark ? "text-gray-400" : "text-gray-600"}`}>
              Areas to Focus On
            </h4>
            <div className={`space-y-1.5 rounded-xl border p-3 ${isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-white"}`}>
              {profile.weaknesses.slice(0, 4).map((w, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className={isDark ? "text-gray-300" : "text-gray-700"}>
                    <span className="capitalize">{w.category}</span>
                    {w.description !== w.category && `: ${w.description}`}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${isDark ? "bg-red-900/50 text-red-300" : "bg-red-100 text-red-700"}`}>
                    {w.occurrences}x
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Topics Asked About */}
        {profile.metrics.topTopics.length > 0 && (
          <div>
            <h4 className={`text-xs font-semibold uppercase tracking-wider mb-2 ${isDark ? "text-gray-400" : "text-gray-600"}`}>
              Frequently Asked Topics
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {profile.metrics.topTopics.map((t, i) => (
                <span key={i} className={`px-2 py-1 rounded-full text-xs ${isDark ? "bg-blue-900/50 text-blue-300" : "bg-blue-100 text-blue-700"}`}>
                  {t.topic} ({t.count})
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Encouragement */}
        <div className={`text-xs italic ${isDark ? "text-gray-500" : "text-gray-500"}`}>
          💡 The AI tutor uses this info to help you better!
        </div>
      </div>
    );
  };

  return (
    <div className={`colearn-modal-overlay z-[100] ${isDark ? "bg-black/55" : "bg-slate-900/40"}`}>
      <div
        className={`colearn-modal-panel max-w-md overflow-hidden border-2 p-0 ${
          isDark ? "border-white/10 bg-zinc-900/95" : "border-slate-200/90 bg-white shadow-2xl"
        }`}
      >
        <div className="h-1 w-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-400" />
        <div className={`flex items-center justify-between border-b px-5 py-4 ${isDark ? "border-white/10" : "border-slate-100"}`}>
          <h2 className={`text-lg font-bold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>
            {activeTab === "account" ? "Account" : "Learning insights"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className={`rounded-xl p-2 transition-all ${isDark ? "text-zinc-400 hover:bg-white/10 hover:text-white" : "text-slate-500 hover:bg-slate-100"}`}
            aria-label="Close"
          >
            <AiOutlineClose size={22} />
          </button>
        </div>

        <div className="px-5 pb-5 pt-4">
          <div className={`mb-4 flex rounded-xl border p-1 ${isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-100/80"}`}>
            <button
              type="button"
              onClick={() => setActiveTab("account")}
              className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-all duration-300 ${
                activeTab === "account"
                  ? "bg-gradient-to-r from-violet-600 to-cyan-600 text-white shadow-md"
                  : isDark
                    ? "text-zinc-400 hover:text-white"
                    : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Account
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("insights")}
              className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-all duration-300 ${
                activeTab === "insights"
                  ? "bg-gradient-to-r from-violet-600 to-cyan-600 text-white shadow-md"
                  : isDark
                    ? "text-zinc-400 hover:text-white"
                    : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Insights
            </button>
          </div>

          {activeTab === "account" ? renderAccountTab() : renderInsightsTab()}
        </div>
      </div>
    </div>
  );
};

export default AccountModal;


