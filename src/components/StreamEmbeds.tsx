import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

type StreamTab = "twitch" | "kick";

interface StreamConfig {
  channel: string;
  platform: StreamTab;
}

const DEFAULT_TWITCH_CHANNEL = ""; // No default — starts empty
const DEFAULT_KICK_CHANNEL = "";

export function StreamEmbeds() {
  const [activeTab, setActiveTab] = useState<StreamTab>("twitch");
  const [twitchChannel, setTwitchChannel] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_TWITCH_CHANNEL;
    return localStorage.getItem("ignoshashi_stream_twitch") || DEFAULT_TWITCH_CHANNEL;
  });
  const [kickChannel, setKickChannel] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_KICK_CHANNEL;
    return localStorage.getItem("ignoshashi_stream_kick") || DEFAULT_KICK_CHANNEL;
  });
  const [twitchInput, setTwitchInput] = useState("");
  const [kickInput, setKickInput] = useState("");
  const [showTwitchInput, setShowTwitchInput] = useState(false);
  const [showKickInput, setShowKickInput] = useState(false);

  const setAndSaveTwitch = (channel: string) => {
    setTwitchChannel(channel);
    if (typeof window !== "undefined") {
      localStorage.setItem("ignoshashi_stream_twitch", channel);
    }
  };

  const setAndSaveKick = (channel: string) => {
    setKickChannel(channel);
    if (typeof window !== "undefined") {
      localStorage.setItem("ignoshashi_stream_kick", channel);
    }
  };

  const twitchEmbedUrl = twitchChannel
    ? `https://player.twitch.tv/?channel=${twitchChannel}&parent=${typeof window !== "undefined" ? window.location.hostname : "localhost"}&muted=false`
    : "";

  const kickEmbedUrl = kickChannel
    ? `https://kick.com/${kickChannel}`
    : "";

  return (
    <div className="max-w-3xl mx-auto px-4 mb-8">
      {/* Section header */}
      <div className="flex items-center justify-between mb-4">
        <h3
          className="text-[#00ff41] pixel-shadow-sm"
          style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem" }}
        >
          📺 LIVE STREAMS
        </h3>
        <div className="flex gap-2">
          {(["twitch", "kick"] as StreamTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`text-[0.4rem] px-3 py-1.5 rounded-md font-bold border-2 transition-all duration-100 ${
                activeTab === tab
                  ? "bg-[rgba(0,255,65,0.12)] text-[#00ff41] border-[rgba(0,255,65,0.3)]"
                  : "bg-[rgba(10,15,10,0.6)] text-[#b0d0b0] border-[rgba(0,255,65,0.1)]"
              }`}
              style={{
                fontFamily: '"Press Start 2P", monospace',
                boxShadow: activeTab === tab ? "0 0 8px rgba(0,255,65,0.2)" : "none",
              }}
            >
              {tab === "twitch" ? "🎮 TWITCH" : "🟢 KICK"}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === "twitch" && (
          <motion.div
            key="twitch"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.15 }}
          >
            {twitchChannel ? (
              <div
                className="retro-card p-2 overflow-hidden relative"
                style={{
                  border: "3px solid rgba(100,65,165,0.4)",
                  boxShadow: "0 0 20px rgba(100,65,165,0.2), 6px 6px 0 rgba(100,65,165,0.15)",
                }}
              >
                {/* CRT scanline */}
                <div
                  className="absolute inset-0 pointer-events-none z-10 rounded-lg overflow-hidden"
                  style={{
                    background: "repeating-linear-gradient(0deg, rgba(0,0,0,0.06) 0px, rgba(0,0,0,0.06) 1px, transparent 1px, transparent 3px)",
                  }}
                />
                <div className="relative aspect-video">
                  <iframe
                    src={twitchEmbedUrl}
                    width="100%"
                    height="100%"
                    frameBorder="0"
                    allowFullScreen
                    allow="autoplay; fullscreen"
                    className="rounded"
                  />
                </div>
                <div className="flex items-center justify-between mt-2 px-1">
                  <span
                    className="text-[#e0ffe0]"
                    style={{ fontFamily: '"VT323", monospace', fontSize: "0.95rem" }}
                  >
                    🎮 twitch.tv/{twitchChannel}
                  </span>
                  <button
                    onClick={() => {
                      setAndSaveTwitch("");
                      setShowTwitchInput(false);
                    }}
                    className="text-[#b0d0b0] hover:text-[#ff4444] text-xs"
                    style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem" }}
                  >
                    ✕ Remove
                  </button>
                </div>
              </div>
            ) : (
              <div className="retro-card p-6 text-center">
                <div className="text-4xl mb-3">📺</div>
                <p
                  className="text-[#e0ffe0] mb-3"
                  style={{ fontFamily: '"VT323", monospace', fontSize: "1.1rem" }}
                >
                  No Twitch stream configured. Paste a Twitch channel to feature it here.
                </p>
                {showTwitchInput ? (
                  <div className="flex gap-2 max-w-xs mx-auto">
                    <input
                      type="text"
                      value={twitchInput}
                      onChange={(e) => setTwitchInput(e.target.value)}
                      placeholder="Channel name..."
                      className="retro-input text-xs flex-1"
                      style={{ fontFamily: '"VT323", monospace', fontSize: "0.95rem" }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && twitchInput.trim()) {
                          setAndSaveTwitch(twitchInput.trim());
                          setTwitchInput("");
                          setShowTwitchInput(false);
                        }
                      }}
                    />
                    <button
                      onClick={() => {
                        if (twitchInput.trim()) {
                          setAndSaveTwitch(twitchInput.trim());
                          setTwitchInput("");
                          setShowTwitchInput(false);
                        }
                      }}
                      className="retro-btn retro-btn-turquoise text-[0.35rem] px-3 py-1"
                      style={{ fontFamily: '"Press Start 2P", monospace' }}
                    >
                      GO
                    </button>
                    <button
                      onClick={() => setShowTwitchInput(false)}
                      className="text-[#b0d0b0] hover:text-[#ff4444]"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowTwitchInput(true)}
                    className="retro-btn retro-btn-outline text-[0.4rem] px-4 py-2"
                    style={{ fontFamily: '"Press Start 2P", monospace' }}
                  >
                    🎮 ADD TWITCH CHANNEL
                  </button>
                )}
              </div>
            )}
          </motion.div>
        )}

        {activeTab === "kick" && (
          <motion.div
            key="kick"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.15 }}
          >
            {kickChannel ? (
              <div
                className="retro-card p-2 overflow-hidden relative"
                style={{
                  border: "3px solid rgba(83,252,24,0.4)",
                  boxShadow: "0 0 20px rgba(83,252,24,0.2), 6px 6px 0 rgba(83,252,24,0.15)",
                }}
              >
                {/* CRT scanline */}
                <div
                  className="absolute inset-0 pointer-events-none z-10 rounded-lg overflow-hidden"
                  style={{
                    background: "repeating-linear-gradient(0deg, rgba(0,0,0,0.06) 0px, rgba(0,0,0,0.06) 1px, transparent 1px, transparent 3px)",
                  }}
                />
                <div className="relative aspect-video">
                  <iframe
                    src={kickEmbedUrl}
                    width="100%"
                    height="100%"
                    frameBorder="0"
                    allowFullScreen
                    allow="autoplay; fullscreen"
                    className="rounded"
                  />
                </div>
                <div className="flex items-center justify-between mt-2 px-1">
                  <span
                    className="text-[#e0ffe0]"
                    style={{ fontFamily: '"VT323", monospace', fontSize: "0.95rem" }}
                  >
                    🟢 kick.com/{kickChannel}
                  </span>
                  <button
                    onClick={() => {
                      setAndSaveKick("");
                      setShowKickInput(false);
                    }}
                    className="text-[#b0d0b0] hover:text-[#ff4444] text-xs"
                    style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem" }}
                  >
                    ✕ Remove
                  </button>
                </div>
              </div>
            ) : (
              <div className="retro-card p-6 text-center">
                <div className="text-4xl mb-3">🟢</div>
                <p
                  className="text-[#e0ffe0] mb-3"
                  style={{ fontFamily: '"VT323", monospace', fontSize: "1.1rem" }}
                >
                  No Kick stream configured. Paste a Kick channel to feature it here.
                </p>
                {showKickInput ? (
                  <div className="flex gap-2 max-w-xs mx-auto">
                    <input
                      type="text"
                      value={kickInput}
                      onChange={(e) => setKickInput(e.target.value)}
                      placeholder="Channel name..."
                      className="retro-input text-xs flex-1"
                      style={{ fontFamily: '"VT323", monospace', fontSize: "0.95rem" }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && kickInput.trim()) {
                          setAndSaveKick(kickInput.trim());
                          setKickInput("");
                          setShowKickInput(false);
                        }
                      }}
                    />
                    <button
                      onClick={() => {
                        if (kickInput.trim()) {
                          setAndSaveKick(kickInput.trim());
                          setKickInput("");
                          setShowKickInput(false);
                        }
                      }}
                      className="retro-btn retro-btn-turquoise text-[0.35rem] px-3 py-1"
                      style={{ fontFamily: '"Press Start 2P", monospace' }}
                    >
                      GO
                    </button>
                    <button
                      onClick={() => setShowKickInput(false)}
                      className="text-[#b0d0b0] hover:text-[#ff4444]"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowKickInput(true)}
                    className="retro-btn retro-btn-outline text-[0.4rem] px-4 py-2"
                    style={{ fontFamily: '"Press Start 2P", monospace' }}
                  >
                    🟢 ADD KICK CHANNEL
                  </button>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
