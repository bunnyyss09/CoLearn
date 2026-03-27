import React, { useState, useEffect, useRef } from "react";
import { AiOutlineSend } from "react-icons/ai";
import { useRecoilValue } from "recoil";
import { themeAtom } from "../atoms/themeAtom";

interface ChatMessage {
  userId: string;
  userName: string;
  message: string;
  timestamp: string;
}

interface ChatProps {
  socket: WebSocket | null;
  chatId: string;
  userId: string;
  userName: string;
  IP_ADDRESS: string;
}

const Chat: React.FC<ChatProps> = ({ socket, chatId, userId, userName: _userName, IP_ADDRESS }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const theme = useRecoilValue(themeAtom);
  const isDark = theme === "dark";

  // Load chat history from backend
  useEffect(() => {
    const loadChatHistory = async () => {
      try {
        const response = await fetch(`http://${IP_ADDRESS}:3000/chat/${chatId}?limit=50`);
        if (response.ok) {
          const data = await response.json();
          setMessages(data.messages || []);
        }
      } catch (error) {
        console.error("Error loading chat history:", error);
      }
    };

    if (chatId) {
      loadChatHistory();
    }
  }, [chatId, IP_ADDRESS]);

  // Listen for chat messages from WebSocket
  useEffect(() => {
    if (socket) {
      const handleMessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "chat" && data.chatMessage) {
            setMessages((prev) => [...prev, data.chatMessage]);
            
            // Only save to backend if this is the sender's message
            // This prevents duplicate saves when multiple clients receive the broadcast
            if (data.chatMessage.userId === userId) {
              fetch(`http://${IP_ADDRESS}:3000/chat/send`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  chatId,
                  userId: data.chatMessage.userId,
                  userName: data.chatMessage.userName,
                  message: data.chatMessage.message,
                }),
              }).catch((error) => {
                console.error("Error saving chat message:", error);
              });
            }
          }
        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
        }
      };

      socket.addEventListener("message", handleMessage);

      return () => {
        socket.removeEventListener("message", handleMessage);
      };
    }
  }, [socket, chatId, IP_ADDRESS, userId]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" , block: "nearest"});
  }, [messages]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || !socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    const message = inputMessage.trim();
    setInputMessage("");

    // Send via WebSocket for real-time broadcasting
    socket.send(
      JSON.stringify({
        type: "chat",
        message: message,
      })
    );
  };

  return (
    <div
      className={`flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border backdrop-blur-md ${
        isDark ? "border-white/10 bg-zinc-900/80 shadow-panel-dark" : "border-slate-200/90 bg-white/90 shadow-panel"
      }`}
    >
      <h2
        className={`border-b p-3 text-sm font-bold uppercase tracking-wider ${isDark ? "border-white/10 text-zinc-400" : "border-slate-200 bg-slate-50/80 text-slate-500"}`}
      >
        Messages
      </h2>
      <div className="flex-1 min-h-0 p-4 overflow-y-auto overscroll-contain space-y-3 scroll-smooth">
        {messages.length > 0 ? (
          messages.map((msg, index) => (
            <div
              key={index}
              className={`w-full flex items-start gap-3 animate-fade-in ${
                msg.userId === userId ? "flex-row-reverse" : "flex-row"
              }`}
            >
              <div
                className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white shadow-md ${
                  msg.userId === userId ? "bg-gradient-to-br from-violet-500 to-fuchsia-600" : "bg-gradient-to-br from-emerald-500 to-cyan-600"
                }`}
              >
                {msg.userName.charAt(0).toUpperCase()}
              </div>
              <div className="flex flex-col max-w-xs md:max-w-md lg:max-w-sm">
                {msg.userId !== userId && (
                  <p className={`text-xs font-semibold mb-1 px-1 ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                    {msg.userName}
                  </p>
                )}
                <div
                  className={`rounded-2xl border px-4 py-2.5 shadow-sm transition-all duration-300 ${
                    msg.userId === userId
                      ? "rounded-tr-sm border-transparent bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-violet-500/20"
                      : isDark
                        ? "rounded-tl-sm border-white/10 bg-white/5 text-zinc-200"
                        : "rounded-tl-sm border-slate-200 bg-white text-slate-800 shadow-sm"
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap break-words">{msg.message}</p>
                  <p className={`text-xs mt-1.5 ${msg.userId === userId ? "text-blue-100" : isDark ? "text-gray-500" : "text-gray-500"}`}>
                    {new Date(msg.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className={`flex flex-col items-center justify-center h-full ${isDark ? "text-gray-500" : "text-gray-400 bg-gray-50"}`}>
            <svg className="w-16 h-16 mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p className="text-center">No messages yet. Start chatting!</p>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>
      <form
        onSubmit={handleSendMessage}
        className={`flex gap-2 border-t p-3 ${isDark ? "border-white/10 bg-white/[0.02]" : "border-slate-200 bg-slate-50/50"}`}
      >
        <input
          type="text"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          placeholder="Type a message..."
          className={`w-full rounded-xl border p-2.5 text-sm transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-violet-500/40 ${
            isDark ? "border-white/10 bg-white/5 text-white placeholder-zinc-500" : "border-slate-200 bg-white text-slate-900 placeholder-slate-400"
          }`}
          disabled={!socket || socket.readyState !== WebSocket.OPEN}
        />
        <button
          type="submit"
          className="rounded-xl bg-gradient-to-r from-violet-600 to-cyan-600 p-2.5 text-white shadow-lg shadow-violet-500/25 transition-all duration-300 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
          disabled={
            !inputMessage.trim() ||
            !socket ||
            socket.readyState !== WebSocket.OPEN
          }
        >
          <AiOutlineSend size={20} />
        </button>
      </form>
    </div>
  );
};

export default Chat;

