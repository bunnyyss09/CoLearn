import React, { useEffect } from "react";
import { useRecoilValue } from "recoil";
import { themeAtom } from "../atoms/themeAtom";
import { AiOutlineClose } from "react-icons/ai";

export interface AppDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  message: string;
  mode: "alert" | "confirm";
  onConfirm?: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
}

const AppDialog: React.FC<AppDialogProps> = ({
  open,
  onClose,
  title,
  message,
  mode,
  onConfirm,
  confirmLabel = "OK",
  cancelLabel = "Cancel",
  tone = "default",
}) => {
  const theme = useRecoilValue(themeAtom);
  const isDark = theme === "dark";

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const confirmClasses =
    tone === "danger"
      ? "bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 shadow-lg shadow-rose-500/25"
      : "bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 shadow-lg shadow-violet-500/25";

  return (
    <div
      className={`colearn-modal-overlay ${isDark ? "bg-black/65" : "bg-slate-900/45"}`}
      onClick={onClose}
      aria-hidden={false}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-dialog-title"
        className={`colearn-modal-panel max-w-md overflow-hidden ${
          isDark
            ? "border-white/10 bg-zinc-900/95 shadow-panel-dark"
            : "border-slate-200/90 bg-white/95 shadow-2xl shadow-slate-400/15"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`h-1 w-full bg-gradient-to-r ${tone === "danger" ? "from-rose-500 to-red-500" : "from-violet-500 via-fuchsia-500 to-cyan-400"}`}
        />
        <button
          type="button"
          onClick={onClose}
          className={`absolute right-3 top-4 rounded-xl p-2 transition-all duration-200 ${
            isDark ? "text-zinc-400 hover:bg-white/10 hover:text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          }`}
          aria-label="Close"
        >
          <AiOutlineClose size={22} />
        </button>

        <div className={`px-6 pb-4 pt-7 pr-14 ${isDark ? "border-white/10" : "border-slate-100"} border-b`}>
          <h2 id="app-dialog-title" className={`text-xl font-bold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>
            {title}
          </h2>
        </div>

        <div className="px-6 py-5">
          <p className={`text-sm leading-relaxed whitespace-pre-wrap ${isDark ? "text-zinc-400" : "text-slate-600"}`}>{message}</p>
        </div>

        <div
          className={`flex flex-col-reverse gap-2 px-6 pb-6 sm:flex-row sm:justify-end ${isDark ? "border-white/10" : "border-slate-100"} border-t pt-4`}
        >
          {mode === "confirm" && (
            <button
              type="button"
              onClick={onClose}
              className={`colearn-btn-secondary w-full px-4 py-2.5 text-sm font-semibold sm:w-auto ${
                isDark ? "border-white/15 bg-white/5 text-zinc-200 hover:bg-white/10" : "border-slate-200 bg-white text-slate-800"
              }`}
            >
              {cancelLabel}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (mode === "alert") {
                onClose();
              } else {
                onConfirm?.();
              }
            }}
            className={`w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0 sm:w-auto ${confirmClasses}`}
          >
            {mode === "confirm" ? confirmLabel ?? "Confirm" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AppDialog;
