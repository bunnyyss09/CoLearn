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
import { IP_ADDRESS } from "../Globle";
import { FiChevronsLeft, FiChevronsRight, FiBook, FiChevronDown, FiChevronRight } from "react-icons/fi";

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
  cpp: { name: "C++", color: "text-blue-500", bgLight: "bg-blue-50", bgDark: "bg-blue-900/20" },
  c: { name: "C", color: "text-gray-500", bgLight: "bg-gray-50", bgDark: "bg-gray-800" },
  typescript: { name: "TypeScript", color: "text-blue-400", bgLight: "bg-blue-50", bgDark: "bg-blue-900/20" },
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
        const res = await fetch(`http://${IP_ADDRESS}:3000/learning/modules`, {
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
        `http://${IP_ADDRESS}:3000/learning/room/create`,
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
    navigate("/");
  };

  return (
    <div
      className={`min-h-screen font-sans flex ${
        isDark
          ? "bg-black text-gray-200"
          : "bg-gradient-to-br from-gray-50 to-blue-50"
      }`}
    >
      <Sidebar
        showRooms
        onOpenAccount={() => setIsAccountOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />
      <div className="flex flex-col flex-1 p-4 gap-4 overflow-auto">
        <nav
          className={`border rounded-xl px-4 py-3 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 ${
            isDark
              ? "bg-gray-900 border-gray-800"
              : "bg-blue-50/80 border-blue-200"
          }`}
        >
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className={`hidden lg:inline-flex items-center justify-center w-9 h-9 rounded-md border ${
                isDark
                  ? "bg-gray-800 hover:bg-gray-700 text-gray-200 border-gray-700"
                  : "bg-gray-100 hover:bg-gray-200 text-gray-800 border-gray-300"
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
              className={`p-2 rounded-lg border ${
                isDark
                  ? "bg-gray-800 hover:bg-gray-700 border-gray-700"
                  : "bg-white hover:bg-gray-100 border-gray-300"
              }`}
              title="Back to editor"
            >
              <span className="text-lg">←</span>
            </button>
            <div>
              <div
                className={`text-xl font-bold ${
                  isDark ? "text-white" : "text-gray-900"
                }`}
              >
                CoLearn · Learn
              </div>
              <p
                className={`text-xs ${
                  isDark ? "text-gray-400" : "text-gray-600"
                }`}
              >
                Room {roomIdFromUrl || "..."}
              </p>
            </div>
          </div>
        </nav>

        <div
          className={`flex-1 rounded-xl border p-6 ${
            isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"
          }`}
        >
          <h1
            className={`text-2xl font-bold mb-2 ${
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
            will appear here as they’re added.
          </p>

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
            <p className={isDark ? "text-gray-400" : "text-gray-600"}>
              Loading modules...
            </p>
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
                  bgLight: "bg-gray-50",
                  bgDark: "bg-gray-800"
                };
                const isExpanded = expandedLanguages.has(lang);
                
                return (
                  <div key={lang} className={`rounded-xl border overflow-hidden ${
                    isDark ? "border-gray-700" : "border-gray-200"
                  }`}>
                    {/* Language Header - Collapsible */}
                    <button
                      onClick={() => toggleLanguage(lang)}
                      className={`w-full px-4 py-3 flex items-center justify-between transition-colors ${
                        isDark 
                          ? `${langInfo.bgDark} hover:bg-gray-800` 
                          : `${langInfo.bgLight} hover:bg-gray-100`
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`text-xl font-bold ${langInfo.color}`}>
                          {langInfo.name}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          isDark ? "bg-gray-700 text-gray-300" : "bg-gray-200 text-gray-600"
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
                      <div className={`p-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${
                        isDark ? "bg-gray-900" : "bg-white"
                      }`}>
                        {langModules.map((mod) => (
                          <div
                            key={mod.moduleId}
                            className={`rounded-xl border p-4 flex flex-col transition-all hover:scale-[1.02] ${
                              isDark
                                ? "bg-gray-800 border-gray-700 hover:border-gray-500"
                                : "bg-gray-50 border-gray-200 hover:border-blue-300 hover:shadow-md"
                            }`}
                          >
                            <div className="flex items-start gap-3 mb-2">
                              <div
                                className={`p-2 rounded-lg ${
                                  isDark ? "bg-blue-900/50" : "bg-blue-100"
                                }`}
                              >
                                <FiBook
                                  className={isDark ? "text-blue-300" : "text-blue-600"}
                                  size={20}
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h2
                                  className={`font-semibold text-base truncate ${
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
                                    isDark ? "bg-gray-700 text-gray-300" : "bg-gray-200 text-gray-600"
                                  }`}>
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                            
                            <button
                              onClick={() => handleStartModule(mod.moduleId)}
                              disabled={startingId !== null}
                              className={`mt-auto w-full py-2 px-4 rounded-lg font-medium text-sm transition-colors ${
                                startingId === mod.moduleId
                                  ? "opacity-70 cursor-wait"
                                  : ""
                              } ${
                                isDark
                                  ? "bg-blue-600 hover:bg-blue-500 text-white"
                                  : "bg-blue-600 hover:bg-blue-700 text-white"
                              }`}
                            >
                              {startingId === mod.moduleId ? "Starting…" : "Start"}
                            </button>
                          </div>
                        ))}
                      </div>
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
          <div className={`max-w-md w-full mx-4 p-6 rounded-xl shadow-xl ${
            isDark ? "bg-gray-800 border border-gray-700" : "bg-white border border-gray-200"
          }`}>
            <h3 className={`text-lg font-bold mb-3 ${isDark ? "text-white" : "text-gray-900"}`}>
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
                    ? "bg-gray-700 hover:bg-gray-600 text-gray-200" 
                    : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                }`}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSwitch}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors"
              >
                Switch Module
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChooseModule;
