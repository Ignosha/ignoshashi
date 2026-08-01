import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { onPresenceChange, setPresenceUsername, getOnlineUsers, getOnlineCount, type PresenceUser } from "~/services/presence";
import { chatSocket, type WsChatMessage, type WsPresenceEntry } from "~/services/chatSocket";
import { sanitizeText, sanitizeCallsign, validateImageDataUrl, isValidImageMime } from "~/utils/sanitize";
import { useWallet } from "~/context/WalletContext";

export const Route = createFileRoute("/community")({
  component: CommunityPage,
});

/* ═══════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════ */

interface Message {
  id: string;
  username: string;
  channel: string;
  text: string;
  timestamp: number;
  reactions: Record<string, string[]>; // emoji -> usernames
  pinned: boolean;
  image?: string; // base64 data URL
}

const CHANNELS = [
  "General Chat",
  "Meme Coins",
  "Trading",
  "Ignosha",
  "Announcements",
  "Memes",
];

const REACTIONS = ["👍", "🚀", "💎", "🔥", "😂", "💀"];

const STORAGE_MESSAGES = "ignoshashi_messages";
const STORAGE_USERNAME = "ignoshashi_community_username";
const TYPING_TIMEOUT_MS = 5000; // how long a typing indicator persists

/* ═══════════════════════════════════════════════
   LOCAL STORAGE HELPERS (fallback)
   ═══════════════════════════════════════════════ */

function loadMessagesLocal(): Message[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_MESSAGES);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveMessagesLocal(msgs: Message[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_MESSAGES, JSON.stringify(msgs.slice(0, 500)));
  } catch { /* quota */ }
}

function loadUsernameLocal(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(STORAGE_USERNAME) || "";
}

function saveUsernameLocal(name: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_USERNAME, name);
}

/* ═══════════════════════════════════════════════
   API HELPERS (REST fallback)
   ═══════════════════════════════════════════════ */

async function fetchMessages(channel: string, since = 0): Promise<Message[]> {
  try {
    const params = new URLSearchParams({ channel });
    if (since > 0) params.set("since", String(since));
    const res = await fetch(`/api/chat/messages?${params.toString()}`);
    if (!res.ok) throw new Error("API error");
    return (await res.json()) as Message[];
  } catch {
    return [];
  }
}

async function postMessage(msg: Message): Promise<boolean> {
  try {
    const res = await fetch("/api/chat/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: msg.id,
        username: msg.username,
        channel: msg.channel,
        text: msg.text,
        timestamp: msg.timestamp,
        reactions: msg.reactions,
        pinned: msg.pinned,
        image: msg.image || undefined,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function postReaction(msgId: string, emoji: string, username: string): Promise<Record<string, string[]> | null> {
  try {
    const res = await fetch(`/api/chat/messages/${encodeURIComponent(msgId)}/reaction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emoji, username }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.reactions;
  } catch {
    return null;
  }
}

async function postPin(msgId: string): Promise<boolean | null> {
  try {
    const res = await fetch(`/api/chat/messages/${encodeURIComponent(msgId)}/pin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.pinned;
  } catch {
    return null;
  }
}

async function registerCallsignAPI(wallet: string, callsign: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch("/api/users/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet, callsign }),
    });
    if (res.status === 409) return { success: false, error: "Callsign taken" };
    if (!res.ok) return { success: false, error: "Registration failed" };
    return { success: true };
  } catch {
    return { success: false, error: "Network error" };
  }
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  const s = d.getSeconds().toString().padStart(2, "0");
  return `[${h}:${m}:${s}]`;
}

/* ═══════════════════════════════════════════════
   SOUND EFFECTS
   ═══════════════════════════════════════════════ */

let _audioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext {
  if (!_audioCtx) _audioCtx = new AudioContext();
  return _audioCtx;
}

function getSoundPref(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("ignoshashi_sound") !== "off";
}

function playBlip() {
  if (!getSoundPref()) return;
  try {
    const ctx = getAudioCtx();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.connect(gain);
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.08);
  } catch { /* */ }
}

/* ═══════════════════════════════════════════════
   COMPONENTS
   ═══════════════════════════════════════════════ */

function CommunityPage() {
  const wallet = useWallet();
  const walletAddress = wallet.getPrimaryAddress();
  const walletCallsign = wallet.callsign;

  // Determine initial callsign: server > localStorage
  const initialCallsign = (() => {
    if (walletCallsign) return walletCallsign;
    const localName = loadUsernameLocal();
    if (localName) return localName;
    return "";
  })();

  const [username, setUsername] = useState(initialCallsign);
  const [usernameInput, setUsernameInput] = useState("");
  const [showUsernamePrompt, setShowUsernamePrompt] = useState(!initialCallsign);
  const [callsignError, setCallsignError] = useState("");
  const [activeChannel, setActiveChannel] = useState(CHANNELS[0]);
  const [messages, setMessages] = useState<Message[]>(() => loadMessagesLocal());
  const [inputText, setInputText] = useState("");
  const [presenceUsers, setPresenceUsers] = useState<PresenceUser[]>(() => {
    if (typeof window !== "undefined") return getOnlineUsers();
    return [];
  });
  const [activeOnlineCount, setActiveOnlineCount] = useState(() => {
    if (typeof window !== "undefined") return getOnlineCount();
    return 0;
  });
  // WS-specific presence: callsigns currently online in this channel
  const [wsPresenceUsers, setWsPresenceUsers] = useState<string[]>([]);
  // Typing indicators: callsign → last typing timestamp
  const [typingUsers, setTypingUsers] = useState<Map<string, number>>(new Map());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const lastTimestampRef = useRef(0);
  const apiAvailableRef = useRef(true);
  const [wsConnected, setWsConnected] = useState(false);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingSentRef = useRef(false);

  // Migration: if wallet connected with server callsign, use it
  useEffect(() => {
    if (walletCallsign) {
      setUsername(walletCallsign);
      setPresenceUsername(walletCallsign);
      setShowUsernamePrompt(false);
      const localName = loadUsernameLocal();
      if (localName && localName !== walletCallsign) {
        saveUsernameLocal(walletCallsign);
      }
    }
  }, [walletCallsign]);

  // Migration: if wallet connected but no server callsign, try to register localStorage callsign
  useEffect(() => {
    if (walletAddress && !walletCallsign) {
      const localName = loadUsernameLocal();
      if (localName) {
        registerCallsignAPI(walletAddress, localName).then((result) => {
          if (result.success) {
            wallet.setCallsign(localName);
            setUsername(localName);
            setPresenceUsername(localName);
            setShowUsernamePrompt(false);
            setCallsignError("");
          } else {
            setUsername("");
            saveUsernameLocal("");
            setShowUsernamePrompt(true);
            setCallsignError("Your localStorage callsign is taken on server — choose a new one");
          }
        });
      }
    }
  }, [walletAddress, walletCallsign]);

  // Restore presence username on page load
  useEffect(() => {
    if (username) {
      setPresenceUsername(username);
    }
  }, []);

  // Subscribe to BroadcastChannel presence (tabs on same device)
  useEffect(() => {
    const unsub = onPresenceChange((users, count) => {
      setPresenceUsers(users);
      setActiveOnlineCount(count);
    });
    return unsub;
  }, []);

  // ─── WebSocket Connection ───────────────────
  useEffect(() => {
    if (!username) return;

    chatSocket.connect(username);

    const unsubConn = chatSocket.onConnectionChange((connected) => {
      setWsConnected(connected);
    });

    // Listen for new messages via WS
    const unsubMsg = chatSocket.onMessage((msg: WsChatMessage) => {
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        if (existingIds.has(msg.id)) return prev; // Deduplicate
        const updated = [...prev, {
          id: msg.id,
          username: msg.username,
          channel: msg.channel,
          text: msg.text,
          timestamp: msg.timestamp,
          reactions: msg.reactions || {},
          pinned: msg.pinned || false,
          image: msg.image,
        }];
        saveMessagesLocal(updated);
        // Only play sound if we didn't send it
        if (msg.username !== username) playBlip();
        return updated;
      });
    });

    // Listen for reaction updates via WS
    const unsubReact = chatSocket.onReaction((messageId, reactions) => {
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === messageId);
        if (idx === -1) return prev;
        const updated = [...prev];
        updated[idx] = { ...updated[idx], reactions };
        saveMessagesLocal(updated);
        return updated;
      });
    });

    // Listen for pin updates via WS
    const unsubPin = chatSocket.onPin((messageId, pinned, channel) => {
      setMessages((prev) => {
        let updated = prev.map((m) => ({
          ...m,
          pinned: m.channel === channel ? false : m.pinned,
        }));
        const idx = updated.findIndex((m) => m.id === messageId);
        if (idx >= 0) {
          updated[idx] = { ...updated[idx], pinned };
        }
        saveMessagesLocal(updated);
        return updated;
      });
    });

    // Listen for typing indicators via WS
    const unsubTyping = chatSocket.onTyping((channel, callsign, isTyping) => {
      if (channel !== activeChannel) return;
      if (callsign === username) return; // Don't show our own typing
      setTypingUsers((prev) => {
        const next = new Map(prev);
        if (isTyping) {
          next.set(callsign, Date.now());
        } else {
          next.delete(callsign);
        }
        return next;
      });
    });

    // Listen for WS-based presence in current channel
    const unsubPres = chatSocket.onPresence((channel, users) => {
      if (channel === activeChannel) {
        setWsPresenceUsers(users.filter((u) => u.online).map((u) => u.callsign));
      }
    });

    return () => {
      unsubConn();
      unsubMsg();
      unsubReact();
      unsubPin();
      unsubTyping();
      unsubPres();
      chatSocket.disconnect();
    };
  }, [username]);

  // Re-subscribe when activeChannel changes
  useEffect(() => {
    if (!username) return;
    // Unsubscribe from previous
    for (const ch of CHANNELS) {
      chatSocket.unsubscribe(ch);
    }
    // Subscribe to new
    chatSocket.subscribe(activeChannel);
    // Clear typing for this channel
    setTypingUsers(new Map());
  }, [activeChannel, username]);

  // Clean up stale typing indicators
  useEffect(() => {
    const interval = setInterval(() => {
      setTypingUsers((prev) => {
        const now = Date.now();
        const next = new Map(prev);
        let changed = false;
        for (const [callsign, ts] of next) {
          if (now - ts > TYPING_TIMEOUT_MS) {
            next.delete(callsign);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Initial fetch of messages for current channel (REST)
  useEffect(() => {
    let cancelled = false;
    fetchMessages(activeChannel).then((msgs) => {
      if (cancelled) return;
      if (msgs.length > 0) {
        setMessages((prev) => {
          // Merge: keep messages from other channels, replace this channel's
          const otherMsgs = prev.filter((m) => m.channel !== activeChannel);
          // But keep any very recent messages that might have arrived via WS during fetch
          const now = Date.now();
          const recentFromOtherChannels = prev.filter(
            (m) => m.channel !== activeChannel && now - m.timestamp < 5000
          );
          const existingIds = new Set(msgs.map((m) => m.id));
          const strayRecent = recentFromOtherChannels.filter((m) => !existingIds.has(m.id));
          const merged = [...msgs, ...strayRecent];
          lastTimestampRef.current = Math.max(...merged.map((m) => m.timestamp));
          saveMessagesLocal(merged);
          return merged;
        });
        apiAvailableRef.current = true;
      } else {
        const local = loadMessagesLocal();
        const channelMsgs = local.filter((m) => m.channel === activeChannel);
        if (channelMsgs.length > 0) {
          setMessages(channelMsgs);
          lastTimestampRef.current = Math.max(...channelMsgs.map((m) => m.timestamp));
        }
        apiAvailableRef.current = true;
      }
    }).catch(() => {
      apiAvailableRef.current = false;
      const local = loadMessagesLocal();
      setMessages(local);
    });
    return () => { cancelled = true; };
  }, [activeChannel]);

  const channelMessages = useMemo(() => {
    return messages.filter((m) => m.channel === activeChannel);
  }, [messages, activeChannel]);

  const pinnedMessage = useMemo(() => {
    return channelMessages.find((m) => m.pinned);
  }, [channelMessages]);

  // Compute typing display text
  const typingText = useMemo(() => {
    const now = Date.now();
    const active = Array.from(typingUsers.entries())
      .filter(([, ts]) => now - ts < TYPING_TIMEOUT_MS)
      .map(([callsign]) => callsign);
    if (active.length === 0) return "";
    if (active.length === 1) return `${active[0]} is typing...`;
    if (active.length === 2) return `${active[0]} and ${active[1]} are typing...`;
    return `${active[0]} and ${active.length - 1} others are typing...`;
  }, [typingUsers]);

  const handleSetUsername = async () => {
    const rawName = sanitizeCallsign(usernameInput);
    const fallback = `anon_${Math.random().toString(36).slice(2, 6)}`;
    const displayName = rawName || fallback;

    if (!walletAddress) {
      const existingMsgNames = new Set(
        messages.map((m) => m.username.toLowerCase())
      );
      const existingPresenceNames = new Set(
        presenceUsers.map((u) => u.username.toLowerCase())
      );
      const name = displayName.toLowerCase();

      if (existingMsgNames.has(name) || existingPresenceNames.has(name)) {
        setCallsignError("CALLSIGN TAKEN — CHOOSE ANOTHER");
        return;
      }

      setCallsignError("");
      saveUsernameLocal(displayName);
      setUsername(displayName);
      setPresenceUsername(displayName);
      setShowUsernamePrompt(false);
      return;
    }

    setCallsignError("");
    const result = await registerCallsignAPI(walletAddress, displayName);
    if (!result.success) {
      setCallsignError(result.error === "Callsign taken" ? "CALLSIGN TAKEN — CHOOSE ANOTHER" : (result.error || "Registration failed"));
      return;
    }
    await wallet.setCallsign(displayName);
    setUsername(displayName);
    setPresenceUsername(displayName);
    saveUsernameLocal(displayName);
    setShowUsernamePrompt(false);
  };

  const handleSend = useCallback(async () => {
    const text = sanitizeText(inputText, 1000);
    if ((!text && !uploadedImage) || !username) return;
    if (uploadedImage && !validateImageDataUrl(uploadedImage)) {
      alert("Invalid image format. Only PNG, JPEG, GIF, and WebP are supported.");
      setUploadedImage(null);
      return;
    }
    const msg: Message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      username,
      channel: activeChannel,
      text: text || "",
      timestamp: Date.now(),
      reactions: {},
      pinned: false,
      ...(uploadedImage ? { image: uploadedImage } : {}),
    };

    // Optimistic local update
    setMessages((prev) => {
      const existingIds = new Set(prev.map((m) => m.id));
      if (existingIds.has(msg.id)) return prev;
      const updated = [...prev, msg];
      saveMessagesLocal(updated);
      return updated;
    });
    setInputText("");
    setUploadedImage(null);
    playBlip();

    // Send via REST API (persists to SQLite + broadcasts via WS)
    if (apiAvailableRef.current && walletAddress) {
      const ok = await postMessage(msg);
      if (!ok) {
        apiAvailableRef.current = false;
      }
    } else if (!walletAddress) {
      saveMessagesLocal([...messages, msg]);
    }
  }, [inputText, username, activeChannel, uploadedImage, messages, walletAddress]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg")) {
      alert("SVG images are not supported for security reasons.");
      return;
    }
    if (!isValidImageMime(file.type)) {
      alert("Only PNG, JPEG, GIF, and WebP images are supported.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      alert("Image must be under 2MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      if (!validateImageDataUrl(result)) {
        alert("Invalid image data. Only PNG, JPEG, GIF, and WebP are supported.");
        return;
      }
      setUploadedImage(result);
    };
    reader.readAsDataURL(file);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Typing indicator: send via WS when user types
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);

    // Debounced typing indicator via WS
    if (!typingSentRef.current && username && wsConnected) {
      typingSentRef.current = true;
      chatSocket.sendTyping(activeChannel, true);
    }
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      if (username && wsConnected) {
        chatSocket.sendTyping(activeChannel, false);
      }
      typingSentRef.current = false;
    }, 3000);
  };

  const handleReaction = async (msgId: string, emoji: string) => {
    // Optimistic local update
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === msgId);
      if (idx === -1) return prev;
      const updated = [...prev];
      const msg = { ...updated[idx], reactions: { ...updated[idx].reactions } };
      if (!msg.reactions[emoji]) msg.reactions[emoji] = [];
      const userIdx = msg.reactions[emoji].indexOf(username);
      if (userIdx >= 0) {
        msg.reactions[emoji] = [...msg.reactions[emoji]];
        msg.reactions[emoji].splice(userIdx, 1);
        if (msg.reactions[emoji].length === 0) {
          const { [emoji]: _, ...rest } = msg.reactions;
          msg.reactions = rest;
        }
      } else {
        msg.reactions[emoji] = [...msg.reactions[emoji], username];
      }
      updated[idx] = msg;
      saveMessagesLocal(updated);
      return updated;
    });

    // Server sync (will broadcast back via WS)
    if (apiAvailableRef.current) {
      const serverReactions = await postReaction(msgId, emoji, username);
      if (serverReactions) {
        setMessages((prev) => {
          const idx = prev.findIndex((m) => m.id === msgId);
          if (idx === -1) return prev;
          const updated = [...prev];
          updated[idx] = { ...updated[idx], reactions: serverReactions };
          return updated;
        });
      }
    }
  };

  const handlePin = async (msgId: string) => {
    // Optimistic local update
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === msgId);
      if (idx === -1) return prev;
      const updated = prev.map((m) => ({
        ...m,
        pinned: m.channel === activeChannel ? false : m.pinned,
      }));
      updated[idx === -1 ? updated.length : idx] = {
        ...updated[idx],
        pinned: !prev[idx]?.pinned,
      };
      saveMessagesLocal(updated);
      return updated;
    });

    // Server sync (will broadcast back via WS)
    if (apiAvailableRef.current) {
      const serverPinned = await postPin(msgId);
      if (serverPinned !== null) {
        setMessages((prev) => {
          return prev.map((m) => ({
            ...m,
            pinned: m.channel === activeChannel ? false : m.pinned,
          })).map((m) =>
            m.id === msgId ? { ...m, pinned: serverPinned } : m
          );
        });
      }
    }
  };

  // Simulated space background stars
  const bgStars = useMemo(() => {
    return Array.from({ length: 60 }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      size: `${1 + Math.random() * 2}px`,
      delay: `${Math.random() * 3}s`,
    }));
  }, []);

  // Combined online count: BroadcastChannel + WS
  const displayOnlineCount = useMemo(() => {
    // Use WS presence count when connected, else fall back to BroadcastChannel
    if (wsConnected && wsPresenceUsers.length > 0) {
      return wsPresenceUsers.length;
    }
    return activeOnlineCount;
  }, [wsConnected, wsPresenceUsers, activeOnlineCount]);

  return (
    <div className="min-h-dvh bg-[#050505] relative overflow-hidden">
      {/* Background stars */}
      {bgStars.map((s) => (
        <div
          key={s.id}
          className="fixed rounded-full pointer-events-none z-0"
          style={{
            left: s.left,
            top: s.top,
            width: s.size,
            height: s.size,
            background: "#ffffff",
            opacity: 0.4 + Math.random() * 0.5,
            animation: `retro-blink ${2 + Math.random() * 3}s ease-in-out ${s.delay} infinite`,
          }}
        />
      ))}

      {/* Username prompt */}
      <AnimatePresence>
        {showUsernamePrompt && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-[#050505]/95 flex items-center justify-center z-50"
          >
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              className="retro-card p-8 max-w-sm w-full mx-4"
            >
              <div className="text-center mb-4 text-3xl">🛸</div>
              <h2
                className="text-center mb-4"
                style={{
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: "0.55rem",
                  color: "#00ff41",
                  textShadow: "0 0 10px rgba(0,255,65,0.4)",
                }}
              >
                ENTER CALLSIGN
              </h2>
              {walletAddress && (
                <p
                  className="text-center mb-3"
                  style={{
                    fontFamily: '"VT323", monospace',
                    fontSize: "0.85rem",
                    color: "#b0d0b0",
                  }}
                >
                  Wallet: {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                </p>
              )}
              {callsignError && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-center mb-3 retro-blink"
                  style={{
                    fontFamily: '"Press Start 2P", monospace',
                    fontSize: "0.4rem",
                    color: "#ff3333",
                    textShadow: "0 0 8px rgba(255,51,51,0.5)",
                  }}
                >
                  {callsignError}
                </motion.p>
              )}
              <input
                type="text"
                value={usernameInput}
                onChange={(e) => {
                  setUsernameInput(e.target.value.slice(0, 20));
                  setCallsignError("");
                }}
                placeholder="your callsign..."
                maxLength={20}
                className="retro-input mb-4"
                onKeyDown={(e) => e.key === "Enter" && handleSetUsername()}
                autoFocus
              />
              <button
                onClick={handleSetUsername}
                className="retro-btn retro-btn-orange w-full justify-center text-[0.5rem] py-2"
                style={{ fontFamily: '"Press Start 2P", monospace' }}
              >
                JOIN CHANNEL
              </button>
              {walletAddress && (
                <p
                  className="text-center mt-3"
                  style={{
                    fontFamily: '"VT323", monospace',
                    fontSize: "0.75rem",
                    color: "#6b6b55",
                  }}
                >
                  Your callsign is linked to your wallet and unique across the platform.
                </p>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main layout */}
      <div className="relative z-[1] max-w-7xl mx-auto px-2 sm:px-4 py-4">
        {/* CHAT header with blinking cursor */}
        <div className="flex items-center gap-3 mb-4 px-2">
          <span className="text-xl">🖥️</span>
          <h1
            className="text-lg font-bold"
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: "0.65rem",
              color: "#00ff41",
              textShadow: "0 0 12px rgba(0,255,65,0.5)",
            }}
          >
            CHAT<span className="terminal-cursor">_</span>
          </h1>
          <div className="ml-auto flex items-center gap-2">
            <span className={`${wsConnected ? "online-dot" : ""}`} style={!wsConnected ? {
              width: 8, height: 8, borderRadius: "50%", background: "#ff3333",
              display: "inline-block", boxShadow: "0 0 6px rgba(255,51,51,0.5)",
            } : undefined} />
            <span
              className="text-xs"
              style={{
                fontFamily: '"Press Start 2P", monospace',
                fontSize: "0.45rem",
                color: wsConnected ? "#00ff41" : "#ffd23f",
              }}
            >
              {wsConnected ? `USERS ONLINE: ${displayOnlineCount}` : "CONNECTING..."}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          {/* Left sidebar - channels */}
          <div className="md:col-span-3">
            <div className="retro-card p-3">
              <h3
                className="mb-3 px-1"
                style={{
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: "0.4rem",
                  color: "#b0d0b0",
                }}
              >
                📡 CHANNELS
              </h3>
              <div className="space-y-1">
                {CHANNELS.map((ch) => (
                  <button
                    key={ch}
                    onClick={() => setActiveChannel(ch)}
                    className={`w-full text-left px-3 py-2 rounded-md transition-all duration-100 ${
                      activeChannel === ch
                        ? "bg-[rgba(0,255,65,0.08)] border border-[rgba(0,255,65,0.3)] text-[#00ff41]"
                        : "border border-transparent text-[#b0d0b0] hover:bg-[rgba(0,255,65,0.03)] hover:text-[#e0ffe0]"
                    }`}
                    style={{
                      fontFamily: '"VT323", monospace',
                      fontSize: "1.05rem",
                    }}
                  >
                    {activeChannel === ch && "▸ "}
                    #{ch}
                  </button>
                ))}
              </div>

              {/* Your info */}
              <div className="mt-4 pt-3 border-t border-[rgba(0,255,65,0.1)]">
                <div
                  className="flex items-center gap-2 px-1"
                  style={{ fontFamily: '"VT323", monospace', fontSize: "0.95rem", color: "#b0d0b0" }}
                >
                  <span className="online-dot" style={{ width: 6, height: 6 }} />
                  {username || "disconnected"}
                  {walletAddress && (
                    <span style={{ fontSize: "0.7rem", color: "#6b6b55" }}>
                      (🔗 wallet)
                    </span>
                  )}
                </div>
                <div
                  className="px-1 mt-1"
                  style={{ fontFamily: '"VT323", monospace', fontSize: "0.75rem", color: "#6b6b55" }}
                >
                  WS: {wsConnected ? "🟢 LIVE" : "⚫ OFF"}
                  {!apiAvailableRef.current && " ⚠"}
                </div>
                <button
                  onClick={() => { saveUsernameLocal(""); setUsername(""); setShowUsernamePrompt(true); }}
                  className="mt-2 text-xs text-[#b0d0b0] hover:text-[#00ff41] transition-colors px-1"
                  style={{ fontFamily: '"VT323", monospace', fontSize: "0.85rem" }}
                >
                  [ change callsign ]
                </button>
                {!apiAvailableRef.current && (
                  <p
                    className="mt-1 text-xs px-1"
                    style={{
                      fontFamily: '"VT323", monospace',
                      fontSize: "0.75rem",
                      color: "#ffd23f",
                    }}
                  >
                    ⚠ Offline mode — using local storage
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Center - message feed */}
          <div className="md:col-span-6">
            <div className="retro-card flex flex-col" style={{ minHeight: "calc(100dvh - 160px)" }}>
              {/* Channel header */}
              <div
                className="px-3 py-2 border-b border-[rgba(0,255,65,0.1)] flex items-center gap-2"
                style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.45rem", color: "#00ff41" }}
              >
                # {activeChannel}
                <span className="text-[#b0d0b0] ml-auto" style={{ fontSize: "0.4rem" }}>
                  {channelMessages.length} messages
                </span>
              </div>

              {/* Pinned message */}
              {pinnedMessage && (
                <div
                  className="px-3 py-2 border-b border-[rgba(0,255,65,0.1)] bg-[rgba(0,255,65,0.03)]"
                >
                  <div className="flex items-center gap-1 mb-1">
                    <span style={{ fontSize: "0.7rem" }}>📌</span>
                    <span style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.35rem", color: "#00ff41" }}>
                      PINNED
                    </span>
                  </div>
                  <div style={{ fontFamily: '"VT323", monospace', fontSize: "0.95rem", color: "#00ff41" }}>
                    <span className="text-[#b0d0b0]">{formatTimestamp(pinnedMessage.timestamp)}</span>{" "}
                    <span style={{ color: "#39ff14", fontWeight: "bold" }}>{pinnedMessage.username}:</span>{" "}
                    <span className="text-[#e0ffe0]">{pinnedMessage.text}</span>
                  </div>
                </div>
              )}

              {/* Typing indicator */}
              {typingText && (
                <div
                  className="px-3 py-1 border-b border-[rgba(0,255,65,0.05)] bg-[rgba(0,255,65,0.02)]"
                >
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    style={{
                      fontFamily: '"VT323", monospace',
                      fontSize: "0.85rem",
                      color: "#b0d0b0",
                    }}
                  >
                    {typingText}
                  </motion.span>
                </div>
              )}

              {/* Messages */}
              <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                {channelMessages.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-center"
                    >
                      <p className="text-3xl mb-3">📡</p>
                      <p
                        className="text-[#b0d0b0]"
                        style={{ fontFamily: '"VT323", monospace', fontSize: "1.1rem" }}
                      >
                        No messages in #{activeChannel} yet.
                      </p>
                      <p
                        className="text-[#b0d0b0]"
                        style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem" }}
                      >
                        Be the first to transmit!
                      </p>
                    </motion.div>
                  </div>
                ) : (
                  <AnimatePresence initial={false}>
                    {channelMessages.map((msg, i) => (
                      <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className={`community-message group rounded ${
                          i % 2 === 0 ? "bg-[rgba(0,255,65,0.01)]" : ""
                        }`}
                        style={{ fontFamily: '"VT323", monospace' }}
                      >
                        <div className="flex items-start gap-2">
                          <span className="text-[#b0d0b0] shrink-0" style={{ fontSize: "0.85rem" }}>
                            {formatTimestamp(msg.timestamp)}
                          </span>
                          <div className="flex-1 min-w-0">
                            <span style={{ color: "#39ff14", fontWeight: "bold", fontSize: "1rem" }}>
                              {msg.username}:
                            </span>{" "}
                            <span className="text-[#e0ffe0]" style={{ fontSize: "1rem", wordBreak: "break-word" }}>
                              {msg.text}
                            </span>
                            {/* Image display */}
                            {msg.image && (
                              <div className="mt-1.5">
                                <img
                                  src={msg.image}
                                  alt="Shared image"
                                  className="rounded-md max-w-full"
                                  style={{
                                    maxWidth: "min(100%, 300px)",
                                    maxHeight: "300px",
                                    border: "2px solid rgba(0,255,65,0.2)",
                                    boxShadow: "0 0 10px rgba(0,255,65,0.1)",
                                  }}
                                />
                              </div>
                            )}
                          </div>
                          {msg.pinned && <span className="text-xs shrink-0" title="Pinned">📌</span>}
                        </div>

                        {/* Reactions */}
                        <div className="flex items-center gap-1 mt-1 ml-0 sm:ml-20 flex-wrap">
                          {Object.entries(msg.reactions).map(([emoji, users]) => (
                            <button
                              key={emoji}
                              onClick={() => handleReaction(msg.id, emoji)}
                              className={`reaction-btn ${
                                users.includes(username) ? "active" : ""
                              }`}
                              title={users.join(", ")}
                            >
                              {emoji} <span style={{ fontSize: "0.7rem" }}>{users.length}</span>
                            </button>
                          ))}
                          {/* Quick reaction picker */}
                          <div className="hidden group-hover:flex items-center gap-0.5 ml-1">
                            {REACTIONS.map((r) => (
                              <button
                                key={r}
                                onClick={() => handleReaction(msg.id, r)}
                                className="reaction-btn text-xs opacity-60 hover:opacity-100"
                              >
                                {r}
                              </button>
                            ))}
                          </div>
                          {/* Pin button */}
                          <button
                            onClick={() => handlePin(msg.id)}
                            className="hidden group-hover:inline-block reaction-btn text-xs opacity-40 hover:opacity-100 ml-2"
                            title="Toggle pin"
                          >
                            📌
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="p-3 border-t border-[rgba(0,255,65,0.1)]">
                {/* Image preview */}
                {uploadedImage && (
                  <div className="mb-2 flex items-start gap-2">
                    <img
                      src={uploadedImage}
                      alt="Upload preview"
                      className="rounded-md"
                      style={{
                        maxWidth: "120px",
                        maxHeight: "80px",
                        border: "2px solid rgba(0,255,65,0.3)",
                        boxShadow: "0 0 8px rgba(0,255,65,0.15)",
                      }}
                    />
                    <button
                      onClick={() => { setUploadedImage(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                      className="text-[#ff4444] hover:text-[#ff6666] text-xs"
                      style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem" }}
                    >
                      ✕ remove
                    </button>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <span
                    className="text-[#00ff41] shrink-0"
                    style={{ fontFamily: '"VT323", monospace', fontSize: "1.1rem" }}
                  >
                    &gt;
                  </span>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="image/png,image/jpeg,image/gif,image/webp"
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="shrink-0 text-lg hover:scale-110 transition-transform cursor-pointer"
                    title="Attach image"
                    style={{ filter: "drop-shadow(0 0 4px rgba(0,255,65,0.4))" }}
                  >
                    📷
                  </button>
                  <input
                    type="text"
                    value={inputText}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    placeholder="Type message..."
                    className="flex-1 bg-transparent border-none outline-none text-[#e0ffe0] placeholder-[#b0d0b0]/50"
                    style={{ fontFamily: '"VT323", monospace', fontSize: "1.05rem" }}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!inputText.trim() && !uploadedImage}
                    className="retro-btn retro-btn-turquoise text-[0.4rem] px-3 py-1.5 shrink-0"
                    style={{ fontFamily: '"Press Start 2P", monospace' }}
                  >
                    SEND
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right sidebar - online users (WS-based + BroadcastChannel fallback) */}
          <div className="md:col-span-3">
            <div className="retro-card p-3">
              <h3
                className="mb-3 px-1 flex items-center gap-2"
                style={{
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: "0.4rem",
                  color: "#b0d0b0",
                }}
              >
                <span className="online-dot" style={{ width: 6, height: 6 }} />
                ONLINE ({displayOnlineCount})
              </h3>
              <div className="space-y-1 max-h-[300px] overflow-y-auto custom-scrollbar">
                {/* WS presence users (in this channel) */}
                {wsConnected && wsPresenceUsers.length > 0 ? (
                  wsPresenceUsers.map((callsign) => (
                    <div
                      key={callsign}
                      className="flex items-center gap-2 px-2 py-1 rounded-md"
                      style={{ fontFamily: '"VT323", monospace', fontSize: "0.95rem", color: "#e0ffe0" }}
                    >
                      <span className="online-dot" style={{ width: 6, height: 6 }} />
                      {callsign}
                      {callsign === username && (
                        <span style={{ color: "#00ff41", fontSize: "0.7rem" }}>(you)</span>
                      )}
                    </div>
                  ))
                ) : presenceUsers.length > 0 ? (
                  presenceUsers
                    .sort((a, b) => b.lastSeen - a.lastSeen)
                    .map((u) => (
                      <div
                        key={u.id}
                        className="flex items-center gap-2 px-2 py-1 rounded-md"
                        style={{ fontFamily: '"VT323", monospace', fontSize: "0.95rem", color: "#e0ffe0" }}
                      >
                        <span className="online-dot" style={{ width: 6, height: 6 }} />
                        {u.username}
                        {u.username === username && (
                          <span style={{ color: "#00ff41", fontSize: "0.7rem" }}>(you)</span>
                        )}
                      </div>
                    ))
                ) : (
                  <p
                    className="text-[#b0d0b0] px-2"
                    style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem" }}
                  >
                    No one online...
                  </p>
                )}
              </div>

              {/* Stats */}
              <div className="mt-4 pt-3 border-t border-[rgba(0,255,65,0.1)]">
                <div
                  className="text-xs space-y-1"
                  style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem", color: "#b0d0b0" }}
                >
                  <div>📊 Total messages: {messages.length}</div>
                  <div>👥 Active users: {displayOnlineCount}</div>
                  <div>💬 Channels: {CHANNELS.length}</div>
                  {walletAddress && (
                    <div>🔗 Sync: {wsConnected ? "Live WS" : apiAvailableRef.current ? "REST" : "Offline"}</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
