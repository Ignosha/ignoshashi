import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HiMiniMusicalNote, HiMiniSpeakerWave, HiMiniSpeakerXMark } from "react-icons/hi2";

const STORAGE_KEY = "ignoshashi_radio";
const DEFAULT_TRACK_URL =
  "https://w.soundcloud.com/player/?url=https%3A//api.soundcloud.com/tracks/293587249&color=%2300ff41&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false";

interface RadioState {
  on: boolean;
  volume: number;
  customUrl: string;
}

function loadState(): RadioState {
  if (typeof window === "undefined") return { on: false, volume: 50, customUrl: "" };
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return { on: false, volume: 50, customUrl: "" };
}

function saveState(state: RadioState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function SoundCloudRadio() {
  const [state, setState] = useState<RadioState>(loadState);
  const [expanded, setExpanded] = useState(false);
  const [customInput, setCustomInput] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);

  const embedUrl = state.customUrl || DEFAULT_TRACK_URL;

  // Persist state changes
  useEffect(() => {
    saveState(state);
  }, [state]);

  const toggle = () => {
    setState((s) => ({ ...s, on: !s.on }));
  };

  const setVolume = (v: number) => {
    setState((s) => ({ ...s, volume: v }));
  };

  const applyCustomUrl = () => {
    const trimmed = customInput.trim();
    if (!trimmed) return;
    // Accept both direct SoundCloud track URLs and embed URLs
    let embed = trimmed;
    if (trimmed.includes("soundcloud.com/") && !trimmed.includes("w.soundcloud.com")) {
      // Convert regular URL to embed URL
      const encoded = encodeURIComponent(trimmed);
      embed = `https://w.soundcloud.com/player/?url=${encoded}&color=%2300ff41&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false`;
    }
    setState((s) => ({ ...s, customUrl: embed, on: true }));
    setShowCustomInput(false);
    setCustomInput("");
  };

  return (
    <>
      {/* Toggle button — fixed bottom-left */}
      <motion.button
        onClick={() => setExpanded(!expanded)}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        className="fixed bottom-5 left-5 z-40 p-3 rounded-lg border-2 border-[rgba(0,255,65,0.3)] bg-[rgba(10,15,10,0.9)] backdrop-blur-md"
        style={{
          boxShadow: state.on
            ? "0 0 15px rgba(0,255,65,0.4), 4px 4px 0 rgba(0,255,65,0.2)"
            : "4px 4px 0 rgba(0,255,65,0.15)",
        }}
        title={state.on ? "📻 RADIO ON — Click to expand" : "📻 RADIO OFF — Click to expand"}
      >
        {state.on ? (
          <HiMiniMusicalNote size={20} color="#00ff41" />
        ) : (
          <HiMiniMusicalNote size={20} color="#6b6b55" />
        )}
      </motion.button>

      {/* Expanded panel */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed bottom-20 left-5 z-40 w-80 retro-card p-4"
            style={{
              border: "3px solid rgba(0,255,65,0.3)",
              boxShadow: "0 0 20px rgba(0,255,65,0.2), 6px 6px 0 rgba(0,255,65,0.15)",
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">📻</span>
                <span
                  className="text-[#00ff41] font-bold pixel-shadow-sm"
                  style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem" }}
                >
                  IGNOSHASHI RADIO
                </span>
              </div>
              <button
                onClick={() => setExpanded(false)}
                className="text-[#b0d0b0] hover:text-[#00ff41] text-sm"
              >
                ✕
              </button>
            </div>

            {/* ON/OFF Toggle */}
            <div className="flex items-center gap-3 mb-3">
              <button
                onClick={toggle}
                className={`relative w-16 h-8 rounded-full border-2 transition-all duration-200 ${
                  state.on
                    ? "border-[#00ff41] bg-[rgba(0,255,65,0.15)]"
                    : "border-[rgba(0,255,65,0.2)] bg-[rgba(10,15,10,0.8)]"
                }`}
                style={{
                  boxShadow: state.on ? "0 0 10px rgba(0,255,65,0.3)" : "none",
                }}
              >
                <motion.div
                  className={`absolute top-0.5 w-6 h-6 rounded-full border-2 ${
                    state.on
                      ? "left-[calc(100%-28px)] bg-[#00ff41] border-[#00ff41]"
                      : "left-1 bg-[#333] border-[#555]"
                  }`}
                  animate={{ left: state.on ? "calc(100% - 28px)" : "4px" }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              </button>
              <span
                className="font-bold"
                style={{
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: "0.45rem",
                  color: state.on ? "#00ff41" : "#6b6b55",
                }}
              >
                {state.on ? "📻 ON" : "📻 OFF"}
              </span>
            </div>

            {/* Volume slider */}
            <div className="mb-3">
              <div className="flex items-center gap-2 mb-1">
                <HiMiniSpeakerXMark size={12} color="#b0d0b0" />
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={state.volume}
                  onChange={(e) => setVolume(parseInt(e.target.value))}
                  className="w-full h-2 rounded-full appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, #00ff41 ${state.volume}%, #0d120d ${state.volume}%)`,
                    border: "1px solid rgba(0,255,65,0.3)",
                  }}
                />
                <HiMiniSpeakerWave size={14} color="#00ff41" />
              </div>
              <span
                className="text-[#b0d0b0]"
                style={{ fontFamily: '"VT323", monospace', fontSize: "0.85rem" }}
              >
                Vol: {state.volume}%
              </span>
            </div>

            {/* SoundCloud Embed */}
            {state.on && (
              <div className="mb-3 rounded-lg overflow-hidden border-2 border-[rgba(0,255,65,0.2)]">
                <iframe
                  width="100%"
                  height="120"
                  scrolling="no"
                  frameBorder="no"
                  allow="autoplay"
                  src={embedUrl}
                  style={{ display: "block" }}
                />
              </div>
            )}

            {/* Custom URL input */}
            <div>
              {showCustomInput ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={customInput}
                    onChange={(e) => setCustomInput(e.target.value)}
                    placeholder="Paste SoundCloud track URL..."
                    className="retro-input text-xs w-full"
                    style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem" }}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={applyCustomUrl}
                      className="retro-btn retro-btn-turquoise text-[0.35rem] px-3 py-1 flex-1"
                      style={{ fontFamily: '"Press Start 2P", monospace' }}
                    >
                      LOAD
                    </button>
                    <button
                      onClick={() => {
                        setShowCustomInput(false);
                        setCustomInput("");
                      }}
                      className="retro-btn retro-btn-outline text-[0.35rem] px-3 py-1"
                      style={{ fontFamily: '"Press Start 2P", monospace' }}
                    >
                      CANCEL
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowCustomInput(true)}
                  className="text-[#b0d0b0] hover:text-[#00ff41] text-xs underline w-full text-center"
                  style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem" }}
                >
                  📎 Paste your own track URL
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
