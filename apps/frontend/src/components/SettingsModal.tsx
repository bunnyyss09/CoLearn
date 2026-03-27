import React, { useEffect } from "react";
import { useRecoilState } from "recoil";
import { themeAtom, Theme } from "../atoms/themeAtom";
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
      if (event.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const changeTheme = (value: Theme) => {
    setTheme(value);
    localStorage.setItem("theme", value);
  };

  return (
    <div className={`colearn-modal-overlay z-[100] ${isDark ? "bg-black/55" : "bg-slate-900/40"}`}>
      <div
        className={`colearn-modal-panel max-w-sm border-2 p-0 ${
          isDark ? "border-white/10 bg-zinc-900/95" : "border-slate-200/90 bg-white shadow-2xl"
        }`}
      >
        <div className="h-1 w-full bg-gradient-to-r from-violet-500 to-cyan-400" />
        <div className={`flex items-center justify-between border-b px-5 py-4 ${isDark ? "border-white/10" : "border-slate-100"}`}>
          <h2 className={`text-lg font-bold ${isDark ? "text-white" : "text-slate-900"}`}>Settings</h2>
          <button
            type="button"
            onClick={onClose}
            className={`rounded-xl p-2 transition-all ${isDark ? "text-zinc-400 hover:bg-white/10 hover:text-white" : "text-slate-500 hover:bg-slate-100"}`}
            aria-label="Close"
          >
            <AiOutlineClose size={22} />
          </button>
        </div>
        <div className="space-y-4 p-5">
          <div>
            <p className={`mb-3 text-sm font-semibold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>Appearance</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => changeTheme("dark")}
                className={`flex-1 rounded-xl border py-2.5 text-sm font-semibold transition-all duration-300 ${
                  theme === "dark"
                    ? "border-violet-500/50 bg-violet-500/20 text-white shadow-glow"
                    : isDark
                      ? "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:border-violet-200"
                }`}
              >
                Dark
              </button>
              <button
                type="button"
                onClick={() => changeTheme("light")}
                className={`flex-1 rounded-xl border py-2.5 text-sm font-semibold transition-all duration-300 ${
                  theme === "light"
                    ? "border-cyan-500/50 bg-cyan-500/15 text-slate-900 shadow-glow-cyan"
                    : isDark
                      ? "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:border-cyan-200"
                }`}
              >
                Light
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
