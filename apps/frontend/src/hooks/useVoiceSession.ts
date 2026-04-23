import { useCallback, useEffect, useRef, useState } from "react";

const ICE: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

export type VoicePeer = { id: string; name: string; clientId?: string };

type SignalPayload = {
  type: "offer" | "answer" | "ice";
  sdp?: string;
  candidate?: RTCIceCandidateInit;
};

function keyFor(p: { id: string; clientId?: string }): string {
  return p.clientId && p.clientId.length > 0 ? p.clientId : p.id;
}

function shouldInitiate(
  a: { id: string; cid: string },
  b: { id: string; cid: string }
): boolean {
  if (a.id < b.id) return true;
  if (a.id > b.id) return false;
  return a.cid < b.cid;
}

export function useVoiceSession(
  myUserId: string | undefined,
  myName: string,
  myClientId: string,
  socket: WebSocket | null,
  peerIds: VoicePeer[]
) {
  const [inVoice, setInVoice] = useState(false);
  const [muted, setMuted] = useState(false);
  const [remoteMuted, setRemoteMuted] = useState<Record<string, boolean>>({});
  const [remoteInVoice, setRemoteInVoice] = useState<Record<string, boolean>>({});
  const [speaking, setSpeaking] = useState<Record<string, boolean>>({});
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const analRef = useRef<Record<string, { ctx: AudioContext; node: AnalyserNode; raf: number }>>({});
  const inVoiceRef = useRef(false);
  const myClientIdRef = useRef(myClientId);
  myClientIdRef.current = myClientId;
  inVoiceRef.current = inVoice;

  const socketRef = useRef<WebSocket | null>(null);
  useEffect(() => {
    socketRef.current = socket;
  }, [socket]);

  const sendVoiceSignal = useCallback(
    (to: { id: string; clientId?: string }, payload: SignalPayload) => {
      const s = socketRef.current;
      if (!s || s.readyState !== WebSocket.OPEN) return;
      const body: Record<string, unknown> = {
        type: "voice-signal",
        toUserId: to.id,
        payload,
      };
      if (to.clientId) (body as { toClientId: string }).toClientId = to.clientId;
      s.send(JSON.stringify(body));
    },
    []
  );

  const ensurePeer = useCallback(
    async (remote: VoicePeer, createOffer: boolean) => {
      if (!myUserId) return;
      const k = keyFor(remote);
      if (k === myClientIdRef.current) return;
      if (peersRef.current.has(k)) return;

      const stream = streamRef.current;
      if (!stream) return;

      const toSignal = { id: remote.id, clientId: remote.clientId };
      if (!toSignal.clientId && remote.id === myUserId) {
        // Same account but server must send clientIds; skip
        return;
      }

      const pc = new RTCPeerConnection(ICE);
      peersRef.current.set(k, pc);
      pendingIceRef.current.set(k, []);

      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          sendVoiceSignal(toSignal, {
            type: "ice",
            candidate: e.candidate.toJSON(),
          });
        }
      };

      const attachRemoteAudio = (otherKey: string, e: RTCTrackEvent) => {
        const a = new Audio();
        a.autoplay = true;
        a.srcObject = e.streams[0];
        void a.play().catch(() => undefined);
        const ctx = new AudioContext();
        const source = ctx.createMediaStreamSource(e.streams[0]);
        const node = ctx.createAnalyser();
        node.fftSize = 256;
        source.connect(node);
        const tick = () => {
          const data = new Uint8Array(node.frequencyBinCount);
          node.getByteFrequencyData(data);
          let s = 0;
          for (let i = 0; i < data.length; i++) s += data[i];
          const level = s / (data.length * 255);
          setSpeaking((prev) => ({ ...prev, [otherKey]: level > 0.08 }));
          if (analRef.current[otherKey]) {
            analRef.current[otherKey].raf = requestAnimationFrame(tick);
          }
        };
        const raf = requestAnimationFrame(tick);
        analRef.current[otherKey] = { ctx, node, raf };
      };

      pc.ontrack = (e) => attachRemoteAudio(k, e);

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
          try {
            pc.close();
          } catch {
            /* ignore */
          }
          peersRef.current.delete(k);
        }
      };

      if (createOffer) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendVoiceSignal(toSignal, {
          type: "offer",
          sdp: offer.sdp || "",
        });
      }
    },
    [myUserId, sendVoiceSignal]
  );

  const handleSignal = useCallback(
    async (
      fromUserId: string,
      fromClientId: string | undefined,
      fromPeerKey: string,
      payload: SignalPayload
    ) => {
      if (!myUserId) return;
      const stream = streamRef.current;
      if (!stream && payload.type === "offer") {
        return;
      }

      const replyTo = { id: fromUserId, clientId: fromClientId };

      if (payload.type === "ice" && payload.candidate) {
        const pc = peersRef.current.get(fromPeerKey);
        if (pc && pc.remoteDescription) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
          } catch {
            /* ignore */
          }
        } else {
          const q = pendingIceRef.current.get(fromPeerKey) || [];
          q.push(payload.candidate);
          pendingIceRef.current.set(fromPeerKey, q);
        }
        return;
      }

      if (payload.type === "offer" && payload.sdp) {
        let pc = peersRef.current.get(fromPeerKey);
        if (!pc) {
          if (!stream) return;
          pc = new RTCPeerConnection(ICE);
          peersRef.current.set(fromPeerKey, pc);
          pendingIceRef.current.set(fromPeerKey, []);
          stream.getTracks().forEach((t) => pc!.addTrack(t, stream));
          pc.onicecandidate = (e) => {
            if (e.candidate) {
              sendVoiceSignal(replyTo, {
                type: "ice",
                candidate: e.candidate.toJSON(),
              });
            }
          };
          const otherKey = fromPeerKey;
          pc.ontrack = (e) => {
            const a = new Audio();
            a.autoplay = true;
            a.srcObject = e.streams[0];
            void a.play().catch(() => undefined);
            const ctx = new AudioContext();
            const source = ctx.createMediaStreamSource(e.streams[0]);
            const node = ctx.createAnalyser();
            node.fftSize = 256;
            source.connect(node);
            const tick = () => {
              const data = new Uint8Array(node.frequencyBinCount);
              node.getByteFrequencyData(data);
              let s = 0;
              for (let i = 0; i < data.length; i++) s += data[i];
              const level = s / (data.length * 255);
              setSpeaking((prev) => ({ ...prev, [otherKey]: level > 0.08 }));
              if (analRef.current[otherKey]) {
                analRef.current[otherKey].raf = requestAnimationFrame(tick);
              }
            };
            const raf = requestAnimationFrame(tick);
            analRef.current[otherKey] = { ctx, node, raf };
          };
        }
        await pc.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp: payload.sdp }));
        const pending = pendingIceRef.current.get(fromPeerKey) || [];
        for (const c of pending) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(c));
          } catch {
            /* ignore */
          }
        }
        pendingIceRef.current.set(fromPeerKey, []);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendVoiceSignal(replyTo, {
          type: "answer",
          sdp: answer.sdp || "",
        });
        return;
      }

      if (payload.type === "answer" && payload.sdp) {
        const pc = peersRef.current.get(fromPeerKey);
        if (!pc) return;
        await pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: payload.sdp }));
        const pending = pendingIceRef.current.get(fromPeerKey) || [];
        for (const c of pending) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(c));
          } catch {
            /* ignore */
          }
        }
        pendingIceRef.current.set(fromPeerKey, []);
      }
    },
    [myUserId, sendVoiceSignal]
  );

  useEffect(() => {
    if (!socket) return;
    const onMessage = (ev: MessageEvent) => {
      let data: {
        type?: string;
        fromUserId?: string;
        fromName?: string;
        fromClientId?: string;
        payload?: SignalPayload;
        userId?: string;
        name?: string;
        clientId?: string;
        muted?: boolean;
        inVoice?: boolean;
      } = {};
      try {
        data = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (data.type === "voice-signal" && data.fromUserId && data.payload) {
        const fromPeerKey = data.fromClientId || data.fromUserId;
        void handleSignal(
          String(data.fromUserId),
          data.fromClientId,
          String(fromPeerKey),
          data.payload
        );
      }
      if (data.type === "voice-state" && data.userId != null && data.userId !== "") {
        const uid = String(data.userId);
        const cid =
          data.clientId != null && String(data.clientId).length > 0
            ? String(data.clientId)
            : undefined;
        const inV = data.inVoice !== false;
        const m = !!data.muted;
        // Index by both userId and clientId so UI + peer lists always match the server shape.
        setRemoteMuted((prev) => {
          const next = { ...prev, [uid]: m };
          if (cid) next[cid] = m;
          return next;
        });
        setRemoteInVoice((prev) => {
          const next = { ...prev, [uid]: inV };
          if (cid) next[cid] = inV;
          return next;
        });
      }
      if (data.type === "voice-join" && data.userId && inVoiceRef.current && myUserId) {
        const ocid = data.clientId;
        if (data.userId === myUserId && ocid === myClientIdRef.current) return;
        const p: VoicePeer = {
          id: data.userId,
          name: data.name || "Learner",
          clientId: ocid,
        };
        const me = { id: myUserId, cid: myClientIdRef.current };
        const other = { id: p.id, cid: p.clientId || p.id };
        if (shouldInitiate(me, other)) {
          void ensurePeer(p, true);
        }
      }
    };
    socket.addEventListener("message", onMessage);
    return () => socket.removeEventListener("message", onMessage);
  }, [socket, handleSignal, myUserId, ensurePeer]);

  const joinVoice = useCallback(async () => {
    if (inVoice || !myUserId) return;
    setVoiceError(null);
    const s = socketRef.current;
    if (!s || s.readyState !== WebSocket.OPEN) {
      setVoiceError(
        "Not connected to the realtime server. Start Redis and ensure the app is running (port 5000)."
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;
      setInVoice(true);
      s.send(JSON.stringify({ type: "voice-join" }));
      s.send(
        JSON.stringify({
          type: "voice-state",
          name: myName,
          muted: false,
          inVoice: true,
        })
      );
      const me = { id: myUserId, cid: myClientIdRef.current };
      for (const p of peerIds) {
        if (p.id === myUserId && p.clientId === myClientIdRef.current) continue;
        if (p.id === myUserId && !p.clientId) continue;
        const other = { id: p.id, cid: p.clientId || p.id };
        if (shouldInitiate(me, other)) {
          void ensurePeer(p, true);
        }
      }
    } catch (e) {
      const m =
        e instanceof Error
          ? e.name === "NotAllowedError"
            ? "Microphone access was blocked. Allow the mic for this site and try again."
            : e.message
          : "Could not start microphone.";
      setVoiceError(m);
      console.error("Voice join failed", e);
    }
  }, [inVoice, myUserId, myName, peerIds, ensurePeer]);

  useEffect(() => {
    if (!inVoice || !myUserId || !streamRef.current) return;
    const me = { id: myUserId, cid: myClientIdRef.current };
    for (const p of peerIds) {
      if (p.id === myUserId && p.clientId === myClientIdRef.current) continue;
      if (p.id === myUserId && !p.clientId) continue;
      const other = { id: p.id, cid: p.clientId || p.id };
      if (shouldInitiate(me, other)) {
        void ensurePeer(p, true);
      }
    }
  }, [inVoice, myUserId, peerIds, ensurePeer]);

  const leaveVoice = useCallback(() => {
    setVoiceError(null);
    for (const [, pc] of peersRef.current) {
      try {
        pc.getSenders().forEach((s) => {
          try {
            s.track?.stop();
          } catch {
            /* ignore */
          }
        });
        pc.close();
      } catch {
        /* ignore */
      }
    }
    peersRef.current.clear();
    for (const k of Object.keys(analRef.current)) {
      const a = analRef.current[k];
      if (a) cancelAnimationFrame(a.raf);
    }
    analRef.current = {};
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setInVoice(false);
    setSpeaking({});
    const s = socketRef.current;
    if (s && s.readyState === WebSocket.OPEN) {
      s.send(
        JSON.stringify({
          type: "voice-state",
          name: myName,
          muted: true,
          inVoice: false,
        })
      );
    }
  }, [myName]);

  const toggleMute = useCallback(() => {
    const next = !muted;
    setMuted(next);
    streamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = !next;
    });
    const s = socketRef.current;
    if (s && s.readyState === WebSocket.OPEN) {
      s.send(
        JSON.stringify({
          type: "voice-state",
          name: myName,
          muted: next,
          inVoice: true,
        })
      );
    }
  }, [muted, myName]);

  return {
    inVoice,
    joinVoice,
    leaveVoice,
    toggleMute,
    muted,
    remoteMuted,
    remoteInVoice,
    speaking,
    voiceError,
    clearVoiceError: () => setVoiceError(null),
  };
}
