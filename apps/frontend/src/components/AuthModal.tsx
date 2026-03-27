import React, { useState } from "react";
import { AiOutlineClose, AiOutlineMail, AiOutlineLock, AiOutlineUser } from "react-icons/ai";
import { useRecoilValue } from "recoil";
import { themeAtom } from "../atoms/themeAtom";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (token: string, user: { id: string; name: string; email: string }) => void;
  IP_ADDRESS: string;
}

const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onSuccess, IP_ADDRESS }) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const theme = useRecoilValue(themeAtom);
  const isDark = theme === "dark";

  const resetForm = () => {
    setName("");
    setEmail("");
    setPassword("");
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const endpoint = isSignUp ? "/auth/signup" : "/auth/signin";
      const body = isSignUp ? { name, email, password } : { email, password };

      const response = await fetch(`http://${IP_ADDRESS}:3000${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "An error occurred");
        setLoading(false);
        return;
      }

      localStorage.setItem("authToken", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));

      onSuccess(data.token, data.user);
      resetForm();
      onClose();
    } catch (error) {
      console.error("Auth error:", error);
      setError("Failed to connect to server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const switchMode = () => {
    setIsSignUp(!isSignUp);
    resetForm();
  };

  if (!isOpen) return null;

  const inputBase = `${isDark ? "border-white/10 bg-white/5 text-white placeholder-zinc-500" : "border-slate-200 bg-white text-slate-900 placeholder-slate-400"} colearn-input border pl-10`;

  return (
    <div className={`colearn-modal-overlay z-[110] ${isDark ? "bg-black/60" : "bg-slate-900/45"}`}>
      <div
        className={`colearn-modal-panel relative max-w-md overflow-hidden border-2 ${
          isDark ? "border-white/10 bg-zinc-900/95" : "border-slate-200/80 bg-white/95 shadow-2xl"
        }`}
      >
        <div className="h-1 w-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-400" />
        <button
          onClick={onClose}
          className={`absolute right-3 top-5 rounded-xl p-2 transition-all ${isDark ? "text-zinc-400 hover:bg-white/10 hover:text-white" : "text-slate-500 hover:bg-slate-100"}`}
        >
          <AiOutlineClose size={24} />
        </button>

        <div className={`border-b px-6 pb-5 pt-8 ${isDark ? "border-white/10" : "border-slate-100"}`}>
          <h2 className={`text-2xl font-bold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>
            {isSignUp ? "Create account" : "Welcome back"}
          </h2>
          <p className={`mt-1.5 text-sm ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
            {isSignUp ? "Join CoLearn and start building together." : "Sign in to open your rooms and editor."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          {isSignUp && (
            <div className="animate-fade-up">
              <label className={`mb-2 block text-sm font-medium ${isDark ? "text-zinc-300" : "text-slate-700"}`}>Name</label>
              <div className="relative">
                <AiOutlineUser
                  className={`absolute left-3 top-1/2 -translate-y-1/2 transform ${isDark ? "text-zinc-500" : "text-slate-400"}`}
                  size={20}
                />
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" required className={`w-full ${inputBase}`} />
              </div>
            </div>
          )}

          <div className="animate-fade-up" style={{ animationDelay: "60ms" }}>
            <label className={`mb-2 block text-sm font-medium ${isDark ? "text-zinc-300" : "text-slate-700"}`}>Email</label>
            <div className="relative">
              <AiOutlineMail className={`absolute left-3 top-1/2 -translate-y-1/2 transform ${isDark ? "text-zinc-500" : "text-slate-400"}`} size={20} />
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required className={`w-full ${inputBase}`} />
            </div>
          </div>

          <div className="animate-fade-up" style={{ animationDelay: "120ms" }}>
            <label className={`mb-2 block text-sm font-medium ${isDark ? "text-zinc-300" : "text-slate-700"}`}>Password</label>
            <div className="relative">
              <AiOutlineLock className={`absolute left-3 top-1/2 -translate-y-1/2 transform ${isDark ? "text-zinc-500" : "text-slate-400"}`} size={20} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isSignUp ? "At least 6 characters" : "••••••••"}
                required
                minLength={isSignUp ? 6 : undefined}
                className={`w-full ${inputBase}`}
              />
            </div>
          </div>

          {error && (
            <div
              className={`animate-fade-up rounded-xl border px-4 py-3 text-sm ${
                isDark ? "border-red-500/30 bg-red-950/40 text-red-200" : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} className="colearn-btn-primary w-full py-3 text-sm disabled:opacity-50">
            {loading ? "Please wait…" : isSignUp ? "Create account" : "Sign in"}
          </button>

          <div className={`text-center text-sm ${isDark ? "text-zinc-500" : "text-slate-600"}`}>
            {isSignUp ? (
              <>
                Already have an account?{" "}
                <button type="button" onClick={switchMode} className="font-semibold text-violet-500 transition-colors hover:text-violet-400">
                  Sign in
                </button>
              </>
            ) : (
              <>
                New here?{" "}
                <button type="button" onClick={switchMode} className="font-semibold text-violet-500 transition-colors hover:text-violet-400">
                  Create account
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

export default AuthModal;
