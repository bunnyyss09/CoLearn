import React, { useEffect } from "react";
import { useRecoilState } from "recoil";
import { themeAtom, Theme } from "../atoms/themeAtom";
import { motion, AnimatePresence } from "framer-motion";
import { AiOutlineClose } from "react-icons/ai";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [theme, setTheme] = useRecoilState(themeAtom);
  const isDark = theme === "dark";

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

  const changeTheme = (value: Theme) => {
    setTheme(value);
    localStorage.setItem("theme", value);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-2xl flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 24, filter: 'blur(12px)' }}
            animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 0.95, y: 12, filter: 'blur(8px)' }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className={`${isDark ? "glass-panel" : "glass-panel-light"} rounded-2xl w-full max-w-sm relative overflow-hidden`}
          >
            {/* Holographic top accent */}
            <div className="h-[2px]" style={{ background: 'linear-gradient(90deg, #00f0ff, #bf5af2, #ff2d55, #30d158, #00f0ff)', backgroundSize: '200% 100%', animation: 'text-shimmer 3s ease-in-out infinite' }} />

            <div className="p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className={`text-lg font-display font-bold ${isDark ? "text-white" : "text-gray-900"}`}>Settings</h2>
                <button
                  onClick={onClose}
                  className={`${isDark ? "text-gray-400 hover:text-white" : "text-gray-500 hover:text-gray-700"} p-1 rounded-lg hover:bg-surface-700/50 transition-colors`}
                >
                  <AiOutlineClose size={18} />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <p className={`text-sm font-semibold mb-3 ${isDark ? "text-gray-200" : "text-gray-700"}`}>Theme</p>
                  <div className="flex gap-3">
                    <motion.button
                      whileHover={{ scale: 1.05, y: -1 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => changeTheme("dark")}
                      className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 ${
                        theme === "dark"
                          ? "bg-gradient-to-r from-[rgba(0,240,255,0.2)] to-[rgba(191,90,242,0.2)] border border-[rgba(0,240,255,0.3)] text-white shadow-glow-neon"
                          : isDark ? "bg-surface-700/50 text-gray-300 hover:bg-surface-700/80 border border-surface-700" : "bg-surface-100 text-gray-700 hover:bg-surface-200 border border-surface-200"
                      }`}
                    >
                      Dark
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.05, y: -1 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => changeTheme("light")}
                      className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 ${
                        theme === "light"
                          ? "bg-gradient-to-r from-[rgba(0,240,255,0.2)] to-[rgba(191,90,242,0.2)] border border-[rgba(0,240,255,0.3)] text-white shadow-glow-neon"
                          : isDark ? "bg-surface-700/50 text-gray-300 hover:bg-surface-700/80 border border-surface-700" : "bg-surface-100 text-gray-700 hover:bg-surface-200 border border-surface-200"
                      }`}
                    >
                      Light
                    </motion.button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SettingsModal;
