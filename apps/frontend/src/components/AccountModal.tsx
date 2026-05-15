import React, { useEffect, useState } from "react";
import { useRecoilValue } from "recoil";
import { authAtom } from "../atoms/authAtom";
import { themeAtom } from "../atoms/themeAtom";
import { API_BASE_URL } from "../Globle";
import { AiOutlineLoading3Quarters, AiOutlineClose } from "react-icons/ai";
import { motion, AnimatePresence } from "framer-motion";

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

  useEffect(() => {
    if (isOpen && activeTab === "insights" && user && auth.token && !profile) {
      setLoadingProfile(true);
      fetch(`${API_BASE_URL}/learning-profile/${user.id}`, {
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

  const renderAccountTab = () => (
    <>
      {user ? (
        <div className={`space-y-3 text-sm ${isDark ? "text-gray-300" : "text-gray-700"}`}>
          <div className={`p-3 rounded-xl ${isDark ? "bg-surface-700/50" : "bg-surface-50"}`}>
            <span className={`text-xs ${isDark ? "text-gray-500" : "text-gray-500"}`}>Name</span>
            <p className={`font-medium ${isDark ? "text-white" : "text-gray-900"}`}>{user.name}</p>
          </div>
          <div className={`p-3 rounded-xl ${isDark ? "bg-surface-700/50" : "bg-surface-50"}`}>
            <span className={`text-xs ${isDark ? "text-gray-500" : "text-gray-500"}`}>Email</span>
            <p className={`font-medium ${isDark ? "text-white" : "text-gray-900"}`}>{user.email}</p>
          </div>
          <div className={`p-3 rounded-xl ${isDark ? "bg-surface-700/50" : "bg-surface-50"}`}>
            <span className={`text-xs ${isDark ? "text-gray-500" : "text-gray-500"}`}>ID</span>
            <p className={`font-mono text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>{user.id}</p>
          </div>
        </div>
      ) : (
        <p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>Not signed in.</p>
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
          <AiOutlineLoading3Quarters className="animate-spin text-brand-400" size={24} />
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
        <div className={`grid grid-cols-3 gap-2 p-3 rounded-xl ${isDark ? "bg-surface-700/50" : "bg-surface-50 border border-surface-200"}`}>
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

        {profile.weaknesses.length > 0 && (
          <div>
            <h4 className={`text-xs font-semibold uppercase tracking-wider mb-2 ${isDark ? "text-gray-400" : "text-gray-600"}`}>
              Areas to Focus On
            </h4>
            <div className={`space-y-1.5 p-3 rounded-xl ${isDark ? "bg-surface-700/50" : "bg-surface-50 border border-surface-200"}`}>
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

        {profile.metrics.topTopics.length > 0 && (
          <div>
            <h4 className={`text-xs font-semibold uppercase tracking-wider mb-2 ${isDark ? "text-gray-400" : "text-gray-600"}`}>
              Frequently Asked Topics
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {profile.metrics.topTopics.map((t, i) => (
                <span key={i} className={`px-2 py-1 rounded-full text-xs ${isDark ? "bg-brand-900/50 text-brand-300" : "bg-brand-100 text-brand-700"}`}>
                  {t.topic} ({t.count})
                </span>
              ))}
            </div>
          </div>
        )}

        <div className={`text-xs italic ${isDark ? "text-gray-500" : "text-gray-500"}`}>
          The AI tutor uses this info to help you better!
        </div>
      </div>
    );
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className={`${isDark ? "bg-surface-800 border-surface-700" : "bg-white border-surface-200"} border rounded-2xl shadow-2xl w-full max-w-md relative overflow-hidden`}
          >
            {/* Gradient top accent */}
            <div className="h-1 bg-gradient-brand" />

            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className={`text-lg font-display font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                  {activeTab === "account" ? "Account" : "Learning Insights"}
                </h2>
                <button
                  onClick={onClose}
                  className={`${isDark ? "text-gray-400 hover:text-white" : "text-gray-500 hover:text-gray-700"} p-1 rounded-lg hover:bg-surface-700/50 transition-colors`}
                >
                  <AiOutlineClose size={18} />
                </button>
              </div>

              {/* Tab Switcher */}
              <div className={`flex mb-5 p-1 rounded-xl ${isDark ? "bg-surface-700/50" : "bg-surface-100"}`}>
                <button
                  onClick={() => setActiveTab("account")}
                  className={`flex-1 py-2 text-sm rounded-lg font-medium transition-all ${
                    activeTab === "account"
                      ? "bg-brand-600 text-white shadow-lg shadow-brand-600/30"
                      : isDark ? "text-gray-400 hover:text-white" : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  Account
                </button>
                <button
                  onClick={() => setActiveTab("insights")}
                  className={`flex-1 py-2 text-sm rounded-lg font-medium transition-all ${
                    activeTab === "insights"
                      ? "bg-brand-600 text-white shadow-lg shadow-brand-600/30"
                      : isDark ? "text-gray-400 hover:text-white" : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  Learning Insights
                </button>
              </div>

              {activeTab === "account" ? renderAccountTab() : renderInsightsTab()}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AccountModal;
