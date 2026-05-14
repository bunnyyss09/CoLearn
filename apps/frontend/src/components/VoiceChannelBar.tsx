import React from "react";
import { FiHeadphones, FiMic, FiMicOff, FiX } from "react-icons/fi";
import type { VoicePeer } from "../hooks/useVoiceSession";

export type VoiceControlApi = {
  inVoice: boolean;
  muted: boolean;
  remoteMuted: Record<string, boolean>;
  remoteInVoice: Record<string, boolean>;
  speaking: Record<string, boolean>;
  joinVoice: () => Promise<void>;
  leaveVoice: () => void;
  toggleMute: () => void;
  voiceError: string | null;
  clearVoiceError: () => void;
};

type Props = {
  isDark: boolean;
  myUserId: string;
  myName: string;
  myClientId: string;
  members: VoicePeer[];
  voice: VoiceControlApi;
  /** e.g. "Editor" or "Module" for the screen reader label */
  roomLabel?: string;
  /** Default `underNav` so the strip sits below the app bar and stays on screen. Use `pageBottom` only for a true footer dock. */
  placement?: "underNav" | "pageBottom";
  id?: string;
};

function peerKey(u: { id: string; clientId?: string }): string {
  return u.clientId && u.clientId.length > 0 ? u.clientId : u.id;
}

/**
 * Room voice strip: join, mute, leave, and see who is connected. Default `placement` is just under the
 * app nav so the controls stay visible; use `pageBottom` for a true footer dock.
 */
const VoiceChannelBar: React.FC<Props> = ({
  isDark,
  myUserId,
  myName,
  myClientId,
  members,
  voice,
  roomLabel = "room",
  placement = "underNav",
  id,
}) => {
  const v = voice;

  const inVoiceUsers: Array<{
    key: string;
    label: string;
    isSelf: boolean;
    speaking: boolean;
    muted: boolean;
  }> = [];

  if (v.inVoice) {
    inVoiceUsers.push({
      key: `self-${myClientId}`,
      label: myName?.trim() || "You",
      isSelf: true,
      speaking: false,
      muted: v.muted,
    });
  }

  for (const u of members) {
    if (u.id === myUserId && u.clientId === myClientId) {
      continue;
    }
    const k = peerKey(u);
    const idStr = String(u.id);
    const inCall = !!(
      v.remoteInVoice[k] ||
      v.remoteInVoice[idStr] ||
      v.remoteInVoice[u.id]
    );
    if (!inCall) continue;
    const sp = !!(v.speaking[k] || v.speaking[idStr] || v.speaking[u.id]);
    const mu = !!(v.remoteMuted[k] || v.remoteMuted[idStr] || v.remoteMuted[u.id]);
    inVoiceUsers.push({
      key: k,
      label: u.name?.trim() || "Teammate",
      isSelf: false,
      speaking: sp,
      muted: mu,
    });
  }

  const otherCount = Math.max(0, inVoiceUsers.filter((p) => !p.isSelf).length);

  const shellClass =
    placement === "pageBottom"
      ? `flex-shrink-0 flex flex-col border-t ${
          isDark
            ? "border-[#1e1f22] bg-[#2b2d31] text-[#b5bac1]"
            : "border-slate-300 bg-slate-200/95 text-slate-700"
        }`
      : `flex-shrink-0 flex flex-col rounded-xl border shadow-sm ${
          isDark
            ? "border-gray-600/80 bg-[#2b2d31] text-[#b5bac1]"
            : "border-slate-300 bg-slate-200/95 text-slate-700"
        }`;

  return (
    <div
      id={id}
      className={shellClass}
      role="region"
      aria-label={`Voice for this ${roomLabel}`}
    >
      {v.voiceError && (
        <div
          className={`px-3 py-2 text-xs flex items-start gap-2 ${
            isDark
              ? "bg-red-950/80 text-red-200 border-b border-red-900/60"
              : "bg-red-100 text-red-900 border-b border-red-200"
          }`}
          role="alert"
        >
          <span className="flex-1 min-w-0 leading-snug">{v.voiceError}</span>
          <button
            type="button"
            onClick={() => v.clearVoiceError()}
            className="shrink-0 underline font-medium text-inherit"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="px-3 py-2.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-lg shrink-0 ${
              isDark ? "bg-[#1e1f22] text-[#949ba4]" : "bg-white text-slate-600 border border-slate-300"
            }`}
            aria-hidden
          >
            <FiHeadphones size={18} />
          </div>
          <div className="min-w-0">
            <p
              className={`text-[11px] font-semibold uppercase tracking-wide ${
                isDark ? "text-[#949ba4]" : "text-slate-500"
              }`}
            >
              Voice
            </p>
            <p className={`text-sm font-medium truncate ${isDark ? "text-[#f2f3f5]" : "text-slate-900"}`}>
              {v.inVoice
                ? otherCount === 0
                  ? "In voice (solo)"
                  : `In voice · ${otherCount} other${otherCount === 1 ? "" : "s"}`
                : "Not in voice"}
            </p>
          </div>
        </div>

        {inVoiceUsers.length > 0 && (
          <div className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto py-0.5">
            {inVoiceUsers.map((p) => (
              <div
                key={p.key}
                className="flex items-center gap-1 shrink-0"
                title={p.muted ? `${p.label} (muted)` : p.speaking ? `${p.label} (speaking)` : p.label}
              >
                <div
                  className={`relative h-9 w-9 rounded-full flex items-center justify-center text-xs font-bold ${
                    p.isSelf
                      ? isDark
                        ? "bg-indigo-600 text-white"
                        : "bg-indigo-500 text-white"
                      : isDark
                        ? "bg-emerald-700/90 text-white"
                        : "bg-emerald-600 text-white"
                  } ${p.speaking ? "ring-2 ring-[#23a55a] ring-offset-1 " + (isDark ? "ring-offset-[#2b2d31]" : "ring-offset-slate-200") : ""}`}
                >
                  {p.label.charAt(0).toUpperCase() || "?"}
                  {p.muted && (
                    <span
                      className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-[#f23f42] text-white flex items-center justify-center border-2"
                      style={{ borderColor: isDark ? "#2b2d31" : "rgb(226, 232, 240)" }}
                      aria-label="Muted"
                    >
                      <FiMicOff size={8} strokeWidth={3} />
                    </span>
                  )}
                </div>
                <span className={`max-w-[5rem] truncate text-xs ${isDark ? "text-[#b5bac1]" : "text-slate-600"}`}>
                  {p.isSelf ? "You" : p.label}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-end gap-1.5 shrink-0 sm:ml-auto">
          {!v.inVoice ? (
            <button
              type="button"
              onClick={() => void v.joinVoice()}
              className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold text-white transition shadow ${
                isDark
                  ? "bg-[#23a55a] hover:bg-[#1e8c4a] active:scale-[0.98]"
                  : "bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98]"
              }`}
            >
              <FiMic size={16} />
              Join voice
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={v.toggleMute}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-md border transition ${
                  v.muted
                    ? isDark
                      ? "border-amber-500/50 bg-amber-900/40 text-amber-200 hover:bg-amber-900/60"
                      : "border-amber-400 bg-amber-100 text-amber-900 hover:bg-amber-200"
                    : isDark
                      ? "border-[#1e1f22] bg-[#383a40] text-[#f2f3f5] hover:bg-[#3f4248]"
                      : "border-slate-300 bg-white text-slate-800 hover:bg-slate-100"
                }`}
                title={v.muted ? "Unmute" : "Mute"}
                aria-pressed={v.muted}
              >
                {v.muted ? <FiMicOff size={18} /> : <FiMic size={18} />}
              </button>
              <button
                type="button"
                onClick={v.leaveVoice}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-red-500/40 bg-red-600/90 text-white hover:bg-red-600 transition"
                title="Leave voice"
                aria-label="Leave voice"
              >
                <FiX size={18} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default VoiceChannelBar;
