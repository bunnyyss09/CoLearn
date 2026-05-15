import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useRecoilState, useRecoilValue } from "recoil";
import { userAtom } from "../atoms/userAtom";
import { authAtom } from "../atoms/authAtom";
import { socketAtom } from "../atoms/socketAtom";
import { themeAtom } from "../atoms/themeAtom";
import { sidebarOpenAtom } from "../atoms/sidebarAtom";
import Sidebar from "../components/Sidebar";
import AccountModal from "../components/AccountModal";
import SettingsModal from "../components/SettingsModal";
import { API_BASE_URL } from "../Globle";
import { FiChevronsLeft, FiChevronsRight, FiBook, FiChevronDown, FiChevronRight } from "react-icons/fi";
import { motion } from "framer-motion";
import FadeIn from "../components/animations/FadeIn";
import StaggerContainer, { StaggerItem } from "../components/animations/StaggerContainer";
import AnimatedCard from "../components/animations/AnimatedCard";

interface LearningModuleSummary {
  moduleId: string;
  title: string;
  description?: string;
  language: string;
  difficulty: string;
  estimatedTimeMinutes: number;
  tags?: string[];
  prerequisites?: string[];
}

// Language display names and icons
const LANGUAGE_INFO: Record<string, { name: string; color: string; bgLight: string; bgDark: string }> = {
  python: { name: "Python", color: "text-yellow-500", bgLight: "bg-yellow-50", bgDark: "bg-yellow-900/20" },
  javascript: { name: "JavaScript", color: "text-yellow-400", bgLight: "bg-amber-50", bgDark: "bg-amber-900/20" },
  java: { name: "Java", color: "text-red-500", bgLight: "bg-red-50", bgDark: "bg-red-900/20" },
  cpp: { name: "C++", color: "text-brand-500", bgLight: "bg-brand-50", bgDark: "bg-blue-900/20" },
  c: { name: "C", color: "text-gray-500", bgLight: "bg-surface-50", bgDark: "bg-surface-800" },
  typescript: { name: "TypeScript", color: "text-brand-400", bgLight: "bg-brand-50", bgDark: "bg-blue-900/20" },
};

const ChooseModule: React.FC = () => {
  const params = useParams();
  const navigate = useNavigate();
  const [auth] = useRecoilState(authAtom);
  const [user] = useRecoilState(userAtom);
  const [socket] = useRecoilState<WebSocket | null>(socketAtom);
  const theme = useRecoilValue(themeAtom);
  const [sidebarOpen, setSidebarOpen] = useRecoilState(sidebarOpenAtom);
  const [modules, setModules] = useState<LearningModuleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [expandedLanguages, setExpandedLanguages] = useState<Set<string>>(new Set());
  const [switchConfirm, setSwitchConfirm] = useState<{
    show: boolean;
    newModuleId: string;
    currentModuleTitle: string;
  } | null>(null);

  const roomIdFromUrl = params.roomId || user.roomId;
  const isDark = theme === "dark";

  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Group modules by language
  const modulesByLanguage = React.useMemo(() => {
    const grouped: Record<string, LearningModuleSummary[]> = {};
    for (const mod of modules) {
      const lang = mod.language.toLowerCase();
      if (!grouped[lang]) grouped[lang] = [];
      grouped[lang].push(mod);
    }
    // Sort modules within each language by difficulty
    const difficultyOrder = { beginner: 0, intermediate: 1, advanced: 2 };
    for (const lang of Object.keys(grouped)) {
      grouped[lang].sort((a, b) =>
        (difficultyOrder[a.difficulty as keyof typeof difficultyOrder] || 0) -
        (difficultyOrder[b.difficulty as keyof typeof difficultyOrder] || 0)
      );
    }
    return grouped;
  }, [modules]);

  // Expand all languages by default when modules load
  useEffect(() => {
    if (modules.length > 0 && expandedLanguages.size === 0) {
      setExpandedLanguages(new Set(Object.keys(modulesByLanguage)));
    }
  }, [modules, modulesByLanguage]);

  const toggleLanguage = (lang: string) => {
    setExpandedLanguages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(lang)) {
        newSet.delete(lang);
      } else {
        newSet.add(lang);
      }
      return newSet;
    });
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'beginner': return isDark ? 'text-green-400' : 'text-green-600';
      case 'intermediate': return isDark ? 'text-yellow-400' : 'text-yellow-600';
      case 'advanced': return isDark ? 'text-red-400' : 'text-red-600';
      default: return isDark ? 'text-gray-400' : 'text-gray-600';
    }
  };

  // Sidebar closed by default on non-landing pages
  useEffect(() => {
    setSidebarOpen(false);
  }, []);

  useEffect(() => {
    const fetchModules = async () => {
      if (!auth.token) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE_URL}/learning/modules`, {
          headers: { Authorization: `Bearer ${auth.token}` },
        });
        if (!res.ok) {
          setError("Could not load modules.");
          return;
        }
        const data = await res.json();
        setModules(data.modules || []);
      } catch (e) {
        console.error("Failed to fetch modules", e);
        setError("Failed to load modules.");
      } finally {
        setLoading(false);
      }
    };
    fetchModules();
  }, [auth.token]);

  const handleStartModule = async (moduleId: string, forceSwitch = false) => {
    if (!roomIdFromUrl || !auth.token) return;
    setStartingId(moduleId);
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE_URL}/learning/room/create`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${auth.token}`,
          },
          body: JSON.stringify({ roomId: roomIdFromUrl, moduleId, forceSwitch }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        // Check if it's a module conflict - offer to switch
        if (err.code === "MODULE_CONFLICT") {
          setSwitchConfirm({
            show: true,
            newModuleId: moduleId,
            currentModuleTitle: err.currentModuleTitle || "another module"
          });
          return;
        }
        setError(err.error || "Failed to start module.");
        return;
      }
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({ type: "startLearningModule", moduleId })
        );
      }
      navigate(`/learn/${roomIdFromUrl}`);
    } catch (e) {
      console.error("Failed to start module", e);
      setError("Failed to start module.");
    } finally {
      setStartingId(null);
    }
  };

  const handleConfirmSwitch = () => {
    if (switchConfirm) {
      handleStartModule(switchConfirm.newModuleId, true);
      setSwitchConfirm(null);
    }
  };

  const handleCancelSwitch = () => {
    setSwitchConfirm(null);
  };

  const handleBackToEditor = () => {
    // Always go to the editor route for this room. The editor page will
    // handle joining/initialization if needed.
    if (roomIdFromUrl) {
      navigate(`/code/${roomIdFromUrl}`);
      return;
    }

    // Fallback: if for some reason we don't have a roomId, go home.
    navigate("/start");
  };

  return (
    <div
      className={`min-h-screen font-sans flex ${
        isDark
          ? "app-shell-dark text-gray-200"
          : "app-shell-light"
      }`}
    >
      <Sidebar
        showRooms
        onOpenAccount={() => setIsAccountOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />
      <div className="flex flex-col flex-1 p-4 gap-4 overflow-auto">
        <nav
          className={`rounded-2xl px-4 py-3 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 ${
            isDark
              ? "glass-panel"
              : "glass-panel-light"
          }`}
        >
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className={`hidden lg:inline-flex items-center justify-center w-9 h-9 rounded-md border transition-all duration-300 ${
                isDark
                  ? "bg-surface-800/50 hover:bg-surface-700/60 text-gray-200 border-[rgba(0,240,255,0.08)] hover:border-[rgba(0,240,255,0.2)]"
                  : "bg-white/60 hover:bg-gray-100 text-gray-800 border-gray-200"
              }`}
            >
              {sidebarOpen ? (
                <FiChevronsLeft size={18} />
              ) : (
                <FiChevronsRight size={18} />
              )}
            </button>
            <button
              onClick={handleBackToEditor}
              className={`p-2 rounded-lg border transition-all duration-300 ${
                isDark
                  ? "bg-surface-800/50 hover:bg-surface-700/60 border-[rgba(0,240,255,0.08)] hover:border-[rgba(0,240,255,0.2)]"
                  : "bg-white/60 hover:bg-gray-100 border-gray-200"
              }`}
              title="Back to editor"
            >
              <span className="text-lg">←</span>
            </button>
            <div>
              <div
                className={`text-xl font-bold font-display ${
                  isDark ? "text-white" : "text-gray-900"
                }`}
              >
                <span className="gradient-text-neon">CoLearn</span> · Learn
              </div>
              <p
                className={`text-xs font-mono ${
                  isDark ? "text-gray-400" : "text-gray-600"
                }`}
              >
                Room {roomIdFromUrl || "..."}
              </p>
            </div>
          </div>
        </nav>

        <div
          className={`flex-1 rounded-2xl p-6 ${
            isDark ? "glass-panel" : "glass-panel-light"
          }`}
        >
          <FadeIn>
            <h1
              className={`text-2xl font-bold font-display mb-2 ${
                isDark ? "text-white" : "text-gray-900"
              }`}
            >
              Choose a learning module
            </h1>
            <p
              className={`text-sm mb-6 ${
                isDark ? "text-gray-400" : "text-gray-600"
              }`}
            >
              Start a guided lesson with checkpoints and an AI tutor. More modules
              will appear here as they're added.
            </p>
          </FadeIn>

          {error && (
            <div
              className={`mb-4 px-4 py-2 rounded-lg text-sm ${
                isDark ? "bg-red-900/30 text-red-300" : "bg-red-50 text-red-700"
              }`}
            >
              {error}
            </div>
          )}

          {loading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className={`rounded-2xl p-6 animate-pulse ${isDark ? 'bg-surface-800' : 'bg-surface-100'}`}>
                  <div className={`h-4 w-2/3 rounded ${isDark ? 'bg-surface-700' : 'bg-surface-200'} mb-4`} />
                  <div className={`h-3 w-full rounded ${isDark ? 'bg-surface-700' : 'bg-surface-200'} mb-2`} />
                  <div className={`h-3 w-4/5 rounded ${isDark ? 'bg-surface-700' : 'bg-surface-200'}`} />
                </div>
              ))}
            </div>
          ) : modules.length === 0 ? (
            <p className={isDark ? "text-gray-400" : "text-gray-600"}>
              No modules available yet.
            </p>
          ) : (
            <div className="space-y-4">
              {Object.entries(modulesByLanguage).map(([lang, langModules]) => {
                const langInfo = LANGUAGE_INFO[lang] || {
                  name: lang.charAt(0).toUpperCase() + lang.slice(1),
                  color: "text-gray-500",
                  bgLight: "bg-surface-50",
                  bgDark: "bg-surface-800"
                };
                const isExpanded = expandedLanguages.has(lang);

                return (
                  <div key={lang} className={`rounded-2xl border overflow-hidden ${
                    isDark ? "border-surface-700" : "border-gray-200"
                  }`}>
                    {/* Language Header - Collapsible */}
                    <button
                      onClick={() => toggleLanguage(lang)}
                      className={`w-full px-4 py-3 flex items-center justify-between transition-colors ${
                        isDark
                          ? `${langInfo.bgDark} hover:bg-surface-800`
                          : `${langInfo.bgLight} hover:bg-surface-50`
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`text-xl font-bold font-display ${langInfo.color}`}>
                          {langInfo.name}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          isDark ? "bg-surface-700 text-gray-300" : "bg-gray-200 text-gray-600"
                        }`}>
                          {langModules.length} module{langModules.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      {isExpanded ? (
                        <FiChevronDown className={isDark ? "text-gray-400" : "text-gray-600"} size={20} />
                      ) : (
                        <FiChevronRight className={isDark ? "text-gray-400" : "text-gray-600"} size={20} />
                      )}
                    </button>

                    {/* Modules Grid */}
                    {isExpanded && (
                      <StaggerContainer className={`p-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${
                        isDark ? "bg-surface-900" : "bg-white"
                      }`}>
                        {langModules.map((mod) => (
                          <StaggerItem key={mod.moduleId}>
                            <AnimatedCard
                              className={`rounded-2xl p-4 flex flex-col transition-all duration-300 ${
                                isDark
                                  ? "glass-panel hover:border-[rgba(0,240,255,0.2)] hover:shadow-[0_0_20px_rgba(0,240,255,0.05)]"
                                  : "glass-panel-light hover:border-brand-300 hover:shadow-md"
                              }`}
                            >
                              <div className="flex items-start gap-3 mb-2">
                                <div
                                  className={`p-2 rounded-lg ${
                                    isDark ? "bg-blue-900/50" : "bg-brand-100"
                                  }`}
                                >
                                  <FiBook
                                    className={isDark ? "text-blue-300" : "text-brand-600"}
                                    size={20}
                                  />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h2
                                    className={`font-semibold font-display text-base truncate ${
                                      isDark ? "text-white" : "text-gray-900"
                                    }`}
                                  >
                                    {mod.title}
                                  </h2>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <span className={`text-xs font-medium capitalize ${getDifficultyColor(mod.difficulty)}`}>
                                      {mod.difficulty}
                                    </span>
                                    <span className={`text-xs ${isDark ? "text-gray-500" : "text-gray-400"}`}>•</span>
                                    <span className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                                      ~{mod.estimatedTimeMinutes} min
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {mod.description && (
                                <p className={`text-xs mb-3 line-clamp-2 ${
                                  isDark ? "text-gray-400" : "text-gray-600"
                                }`}>
                                  {mod.description}
                                </p>
                              )}

                              {mod.tags && mod.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1 mb-3">
                                  {mod.tags.slice(0, 3).map((tag, i) => (
                                    <span key={i} className={`text-xs px-2 py-0.5 rounded-full ${
                                      isDark ? "bg-surface-700 text-gray-300" : "bg-gray-200 text-gray-600"
                                    }`}>
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              )}

                              <motion.button
                                whileHover={{ scale: 1.03, y: -1 }}
                                whileTap={{ scale: 0.97 }}
                                onClick={() => handleStartModule(mod.moduleId)}
                                disabled={startingId !== null}
                                className={`mt-auto w-full py-2 px-4 rounded-lg font-medium text-sm transition-all duration-300 ${
                                  startingId === mod.moduleId
                                    ? "opacity-70 cursor-wait"
                                    : ""
                                } bg-gradient-to-r from-[rgba(0,240,255,0.15)] to-[rgba(191,90,242,0.15)] border border-[rgba(0,240,255,0.2)] hover:border-[rgba(0,240,255,0.4)] text-white shadow-lg hover:shadow-glow-neon backdrop-blur-sm`}
                              >
                                {startingId === mod.moduleId ? "Starting…" : "Start"}
                              </motion.button>
                            </AnimatedCard>
                          </StaggerItem>
                        ))}
                      </StaggerContainer>
                    )}
                  </div>
                );
              })}
            </div>
          )}
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

      {/* Switch Module Confirmation Modal */}
      {switchConfirm?.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`max-w-md w-full mx-4 p-6 rounded-2xl shadow-xl ${
              isDark ? "bg-surface-800 border border-surface-700" : "bg-white border border-gray-200"
            }`}
          >
            <h3 className={`text-lg font-bold font-display mb-3 ${isDark ? "text-white" : "text-gray-900"}`}>
              Switch Module?
            </h3>
            <p className={`text-sm mb-4 ${isDark ? "text-gray-300" : "text-gray-600"}`}>
              This room is currently using <strong>"{switchConfirm.currentModuleTitle}"</strong>.
              Switching will reset your progress for that module in this room.
            </p>
            <p className={`text-sm mb-6 ${isDark ? "text-gray-400" : "text-gray-500"}`}>
              Are you sure you want to switch to the new module?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleCancelSwitch}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isDark
                    ? "bg-surface-700 hover:bg-gray-600 text-gray-200"
                    : "bg-surface-50 hover:bg-gray-200 text-gray-700"
                }`}
              >
                Cancel
              </button>
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={handleConfirmSwitch}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-brand-600 to-accent-500 hover:from-brand-500 hover:to-accent-400 text-white shadow-lg hover:shadow-glow-brand transition-colors"
              >
                Switch Module
              </motion.button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default ChooseModule;
