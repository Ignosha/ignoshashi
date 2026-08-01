import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "~/context/ThemeContext";

interface ChatMessage {
  role: "user" | "bot";
  text: string;
}

const PRELOADED_RESPONSES: { keywords: string[]; response: string }[] = [
  {
    keywords: ["create", "coin", "launch", "deploy", "make"],
    response:
      "Head to the Create page, upload an image, set your token details, and deploy! Currently supports Solana and Ethereum.",
  },
  {
    keywords: ["fee", "cost", "price", "charge"],
    response:
      "Creation fees: 0.01 SOL or 0.005 ETH. USD tool packs available in Tools.",
  },
  {
    keywords: ["safe", "risk", "secure", "scam", "rug"],
    response:
      "DYOR! Meme coins are extremely risky. ignoshashi provides the platform but does not guarantee any token.",
  },
  {
    keywords: ["buy", "tools", "purchase", "usd", "stripe", "pay"],
    response:
      "Visit the Tools page — we offer $10, $25, $50, and $100 USD tool packs via Stripe.",
  },
  {
    keywords: ["wallet", "connect", "phantom", "metamask"],
    response:
      "Click the CONNECT button in the navbar to connect your Solana or Ethereum wallet. Supports Phantom, MetaMask, and more.",
  },
  {
    keywords: ["trending", "trend", "popular", "hot"],
    response:
      "Check out the Trends page for real-time trending meme coins powered by CoinGecko and DexScreener data!",
  },
];

function getBotResponse(input: string): string {
  const lower = input.toLowerCase();

  for (const entry of PRELOADED_RESPONSES) {
    for (const kw of entry.keywords) {
      if (lower.includes(kw)) {
        return entry.response;
      }
    }
  }

  return "I'm still learning! Try asking about creating coins, fees, safety, or buying tools.";
}

function getSoundPref(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("ignoshashi_sound") !== "off";
}

export function ChatWidget() {
  const { theme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "bot", text: "IGNOSHASHI AI ONLINE. Ask me about creating coins, fees, safety, or buying tools!" },
  ]);
  const [input, setInput] = useState("");
  const [soundOn, setSoundOn] = useState(() => getSoundPref());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Listen for global sound changes
  useEffect(() => {
    const handleSoundChange = () => setSoundOn(getSoundPref());
    window.addEventListener("ignoshashi_sound_change", handleSoundChange);
    handleSoundChange();
    return () => window.removeEventListener("ignoshashi_sound_change", handleSoundChange);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    const userMsg: ChatMessage = { role: "user", text: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    setTimeout(() => {
      const botMsg: ChatMessage = { role: "bot", text: getBotResponse(trimmed) };
      setMessages((prev) => [...prev, botMsg]);
    }, 600);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSend();
    }
  };

  const toggleSound = () => {
    const next = !soundOn;
    localStorage.setItem("ignoshashi_sound", next ? "on" : "off");
    setSoundOn(next);
    window.dispatchEvent(new Event("ignoshashi_sound_change"));
  };

  // Derive colors from theme
  const primaryAlpha = theme.primary + "33"; // ~20%
  const primaryAlphaMid = theme.primary + "66"; // ~40%
  const borderColor = theme.border;
  const boxShadowOpen = `0 0 25px ${theme.primary}4D`;
  const boxShadowClosed = `0 0 15px ${theme.primary}33, 0 0 30px ${theme.primary}1A`;

  return (
    <>
      {/* Floating icon */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-24 right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center text-2xl cursor-pointer transition-all duration-200"
        style={{
          background: theme.cardBg,
          border: `2px solid ${primaryAlphaMid}`,
          boxShadow: isOpen ? boxShadowOpen : boxShadowClosed,
        }}
        aria-label={isOpen ? "Close chat" : "Open chat"}
      >
        <span className={isOpen ? "" : "retro-blink"}>🤖</span>
        {!isOpen && (
          <span
            className="absolute -top-1 -right-1 w-3 h-3 rounded-full"
            style={{
              background: theme.primary,
              boxShadow: `0 0 8px ${theme.primary}99`,
            }}
          />
        )}
      </button>

      {/* Global sound toggle */}
      <button
        onClick={toggleSound}
        className="fixed bottom-24 right-[88px] z-50 w-9 h-9 rounded-full flex items-center justify-center text-sm cursor-pointer transition-all duration-200"
        style={{
          background: theme.cardBg,
          border: `2px solid ${soundOn ? primaryAlphaMid : `${theme.textMuted}4D`}`,
          boxShadow: soundOn ? `0 0 12px ${theme.primary}33` : "none",
        }}
        title={soundOn ? "Sound ON" : "Sound OFF"}
        aria-label={soundOn ? "Sound ON" : "Sound OFF"}
      >
        {soundOn ? "🔊" : "🔇"}
      </button>

      {/* Chat panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ duration: 0.25, ease: [0.68, -0.55, 0.265, 1.55] }}
            className="fixed bottom-32 right-2 sm:right-6 z-50 w-[calc(100vw-16px)] sm:w-[350px] max-w-[350px] h-[450px] max-h-[calc(100dvh-200px)] flex flex-col"
            style={{
              background: theme.cardBg,
              border: `2px solid ${borderColor}`,
              borderRadius: "12px",
              boxShadow: `0 0 30px ${theme.primary}26, 0 4px 25px rgba(0,0,0,0.6)`,
              backdropFilter: "blur(12px)",
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-4 py-3 border-b shrink-0"
              style={{ borderColor: borderColor }}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">🤖</span>
                <h3
                  className="font-bold"
                  style={{
                    fontFamily: '"Press Start 2P", monospace',
                    fontSize: "0.45rem",
                    color: theme.primary,
                  }}
                >
                  IGNOSHASHI AI
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={toggleSound}
                  className="text-sm"
                  title={soundOn ? "🔊 SOUND ON" : "🔇 SOUND OFF"}
                >
                  {soundOn ? "🔊" : "🔇"}
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="hover:opacity-80 transition-colors text-lg"
                  style={{ color: theme.textMuted }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.color = theme.primary;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.color = theme.textMuted;
                  }}
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className="max-w-[85%] px-3 py-2 rounded-lg"
                    style={{
                      fontFamily: '"VT323", monospace',
                      fontSize: "1rem",
                      background:
                        msg.role === "user"
                          ? `${theme.primary}1F`
                          : `${theme.bgSecondary}e6`,
                      border:
                        msg.role === "user"
                          ? `1px solid ${primaryAlphaMid}`
                          : `1px solid ${theme.primary}1A`,
                      color: theme.text,
                    }}
                  >
                    {msg.role === "bot" && (
                      <span
                        className="block mb-1"
                        style={{
                          fontFamily: '"Press Start 2P", monospace',
                          fontSize: "0.35rem",
                          color: theme.primary,
                        }}
                      >
                        IGNOSHASHI AI:
                      </span>
                    )}
                    {msg.text}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="px-4 py-3 border-t shrink-0" style={{ borderColor: borderColor }}>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask something..."
                  className="retro-input flex-1 text-sm"
                  style={{ fontSize: "0.95rem" }}
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim()}
                  className="retro-btn retro-btn-orange text-[0.4rem] px-3 py-1 shrink-0"
                  style={{ fontFamily: '"Press Start 2P", monospace' }}
                >
                  SEND
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
