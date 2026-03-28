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
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className={`${isDark ? "bg-surface-800 border-surface-700" : "bg-white border-surface-200"} border rounded-2xl shadow-2xl w-full max-w-sm relative overflow-hidden`}
          >
            {/* Gradient top accent */}
            <div className="h-1 bg-gradient-brand" />

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
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => changeTheme("dark")}
                      className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                        theme === "dark"
                          ? "bg-brand-600 text-white shadow-lg shadow-brand-600/30"
                          : isDark ? "bg-surface-700 text-gray-300 hover:bg-surface-700/80" : "bg-surface-100 text-gray-700 hover:bg-surface-200"
                      }`}
                    >
                      Dark
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => changeTheme("light")}
                      className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                        theme === "light"
                          ? "bg-brand-600 text-white shadow-lg shadow-brand-600/30"
                          : isDark ? "bg-surface-700 text-gray-300 hover:bg-surface-700/80" : "bg-surface-100 text-gray-700 hover:bg-surface-200"
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
