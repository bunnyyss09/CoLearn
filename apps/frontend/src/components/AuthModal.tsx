import React, { useState } from "react";
import { AiOutlineClose, AiOutlineMail, AiOutlineLock, AiOutlineUser } from "react-icons/ai";
import { useRecoilValue } from "recoil";
import { themeAtom } from "../atoms/themeAtom";
import { motion, AnimatePresence } from "framer-motion";
import { API_BASE_URL } from "../Globle";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (token: string, user: { id: string; name: string; email: string }) => void;
}

const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onSuccess }) => {
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
      const body = isSignUp
        ? { name, email, password }
        : { email, password };

      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
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

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className={`${isDark ? "bg-surface-800 border-surface-700" : "bg-white border-surface-200"} rounded-2xl shadow-2xl w-full max-w-md relative border overflow-hidden`}
          >
            {/* Gradient top accent */}
            <div className="h-1 bg-gradient-brand" />

            {/* Close button */}
            <button
              onClick={onClose}
              className={`absolute top-5 right-4 ${isDark ? "text-gray-400 hover:text-white" : "text-gray-500 hover:text-gray-700"} transition-colors p-1 rounded-lg hover:bg-surface-700/50`}
            >
              <AiOutlineClose size={20} />
            </button>

            {/* Header */}
            <div className="p-6 pb-4">
              <h2 className={`text-2xl font-display font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                {isSignUp ? "Create Account" : "Welcome Back"}
              </h2>
              <p className={`${isDark ? "text-gray-400" : "text-gray-600"} text-sm mt-1`}>
                {isSignUp
                  ? "Join CoLearn to start coding together"
                  : "Sign in to continue your learning journey"}
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-4">
              <AnimatePresence mode="wait">
                {isSignUp && (
                  <motion.div
                    key="name-field"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <label className={`block text-sm font-medium ${isDark ? "text-gray-300" : "text-gray-700"} mb-2`}>
                      Name
                    </label>
                    <div className="relative">
                      <AiOutlineUser className={`absolute left-3 top-1/2 transform -translate-y-1/2 ${isDark ? "text-gray-500" : "text-gray-400"}`} size={18} />
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Enter your name"
                        required
                        className={`w-full pl-10 pr-4 py-2.5 ${isDark ? "bg-surface-700 border-surface-700 text-white placeholder-gray-500" : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 hover:border-brand-400"} border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition`}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div>
                <label className={`block text-sm font-medium ${isDark ? "text-gray-300" : "text-gray-700"} mb-2`}>
                  Email
                </label>
                <div className="relative">
                  <AiOutlineMail className={`absolute left-3 top-1/2 transform -translate-y-1/2 ${isDark ? "text-gray-500" : "text-gray-400"}`} size={18} />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email"
                    required
                    className={`w-full pl-10 pr-4 py-2.5 ${isDark ? "bg-surface-700 border-surface-700 text-white placeholder-gray-500" : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 hover:border-brand-400"} border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition`}
                  />
                </div>
              </div>

              <div>
                <label className={`block text-sm font-medium ${isDark ? "text-gray-300" : "text-gray-700"} mb-2`}>
                  Password
                </label>
                <div className="relative">
                  <AiOutlineLock className={`absolute left-3 top-1/2 transform -translate-y-1/2 ${isDark ? "text-gray-500" : "text-gray-400"}`} size={18} />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={isSignUp ? "At least 6 characters" : "Enter your password"}
                    required
                    minLength={isSignUp ? 6 : undefined}
                    className={`w-full pl-10 pr-4 py-2.5 ${isDark ? "bg-surface-700 border-surface-700 text-white placeholder-gray-500" : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 hover:border-brand-400"} border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition`}
                  />
                </div>
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-sm"
                >
                  {error}
                </motion.div>
              )}

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white font-semibold py-2.5 px-4 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-glow-brand"
              >
                {loading ? "Processing..." : isSignUp ? "Sign Up" : "Sign In"}
              </motion.button>

              <div className={`text-center text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                {isSignUp ? (
                  <>
                    Already have an account?{" "}
                    <button
                      type="button"
                      onClick={switchMode}
                      className="text-brand-400 hover:text-brand-300 font-medium transition-colors"
                    >
                      Sign In
                    </button>
                  </>
                ) : (
                  <>
                    Don't have an account?{" "}
                    <button
                      type="button"
                      onClick={switchMode}
                      className="text-brand-400 hover:text-brand-300 font-medium transition-colors"
                    >
                      Sign Up
                    </button>
                  </>
                )}
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AuthModal;
