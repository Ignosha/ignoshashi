import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getTokens } from "~/services/tracker";

/* ═══════════════════════════════════════════════
   CRT ANNOUNCEMENT BOARD
   Retro CRT-styled display showing top movers
   and auto-generated platform announcements
   ═══════════════════════════════════════════════ */

type Section = "movers" | "announcements";

interface MoverData {
  ticker: string;
  change: number;
  price: number;
  marketCap: number;
}

export function CRTAnnouncementBoard() {
  const [section, setSection] = useState<Section>("movers");
  const [topMovers, setTopMovers] = useState<MoverData[]>([]);
  const [announcements, setAnnouncements] = useState<string[]>([]);
  const [currentAnnouncement, setCurrentAnnouncement] = useState(0);
  const [announcementText, setAnnouncementText] = useState("");
  const [moverIndex, setMoverIndex] = useState(0);
  const typewriterRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cycle sections every 8 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setSection((prev) => (prev === "movers" ? "announcements" : "movers"));
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  // Fetch top movers
  useEffect(() => {
    function computeMovers() {
      const tokens = getTokens();
      if (tokens.length === 0) return;
      const movers: MoverData[] = tokens
        .map((t) => {
          const hist = t.priceHistory;
          let change = 0;
          if (hist.length >= 2) {
            const last = hist[hist.length - 1];
            const prev = hist[0];
            change = prev > 0 ? ((last - prev) / prev) * 100 : 0;
          }
          return {
            ticker: t.ticker,
            change,
            price: t.price,
            marketCap: t.marketCap,
          };
        })
        .filter((m) => Math.abs(m.change) > 0.01)
        .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
        .slice(0, 5);
      setTopMovers(movers);
    }
    computeMovers();
    const interval = setInterval(computeMovers, 5000);
    return () => clearInterval(interval);
  }, []);

  // Fetch announcements from API
  useEffect(() => {
    async function fetchAnnouncements() {
      try {
        const res = await fetch("/api/announcements");
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            setAnnouncements(data);
          }
        }
      } catch {}
    }
    fetchAnnouncements();
    const interval = setInterval(fetchAnnouncements, 15000);
    return () => clearInterval(interval);
  }, []);

  // Cycle through announcements with typewriter effect
  useEffect(() => {
    if (section !== "announcements" || announcements.length === 0) return;
    const fullText = announcements[currentAnnouncement] || "";
    let charIndex = 0;
    setAnnouncementText("");

    typewriterRef.current = setInterval(() => {
      charIndex++;
      if (charIndex <= fullText.length) {
        setAnnouncementText(fullText.slice(0, charIndex));
      } else {
        if (typewriterRef.current) clearInterval(typewriterRef.current);
      }
    }, 40);

    return () => {
      if (typewriterRef.current) clearInterval(typewriterRef.current);
    };
  }, [section, currentAnnouncement, announcements]);

  // Advance announcement every 4 seconds
  useEffect(() => {
    if (section !== "announcements" || announcements.length === 0) return;
    const interval = setInterval(() => {
      setCurrentAnnouncement((prev) => (prev + 1) % announcements.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [section, announcements]);

  // Cycle movers display
  useEffect(() => {
    if (section !== "movers" || topMovers.length === 0) return;
    const interval = setInterval(() => {
      setMoverIndex((prev) => (prev + 1) % topMovers.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [section, topMovers]);

  return (
    <div className="max-w-3xl mx-auto px-4 mb-6">
      {/* CRT Bezel */}
      <div
        className="relative rounded-2xl overflow-hidden"
        style={{
          background: "#1a1a1a",
          border: "6px solid #2a2a2a",
          boxShadow:
            "inset 0 0 40px rgba(0,0,0,0.8), 0 0 0 3px #0a0a0a, 0 0 0 9px #1a1a1a, 0 8px 30px rgba(0,0,0,0.7)",
        }}
      >
        {/* CRT Screen */}
        <div
          className="relative overflow-hidden"
          style={{
            background: "#0a0f0a",
            borderRadius: "8px",
            minHeight: "200px",
          }}
        >
          {/* Scanline overlay */}
          <div
            className="absolute inset-0 pointer-events-none z-10"
            style={{
              background:
                "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,65,0.03) 2px, rgba(0,255,65,0.03) 4px)",
            }}
          />
          {/* CRT vignette */}
          <div
            className="absolute inset-0 pointer-events-none z-9"
            style={{
              background:
                "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.5) 100%)",
            }}
          />
          {/* Screen glare */}
          <div
            className="absolute inset-0 pointer-events-none z-11 opacity-5"
            style={{
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.08) 0%, transparent 30%, transparent 70%, rgba(255,255,255,0.04) 100%)",
            }}
          />

          {/* Content */}
          <div className="relative z-20 p-5" style={{ minHeight: "200px" }}>
            {/* Section title */}
            <div className="flex items-center gap-2 mb-4">
              <motion.span
                className="w-2 h-2 rounded-full"
                style={{
                  background: "#00ff41",
                  boxShadow: "0 0 8px #00ff41",
                }}
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
              <span
                className="font-bold text-[#00ff41]"
                style={{
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: "0.5rem",
                  textShadow: "0 0 10px rgba(0,255,65,0.4)",
                }}
              >
                {section === "movers" ? "📊 TOP MOVERS" : "📡 BULLETIN"}
              </span>
            </div>

            {/* Movers Section */}
            <AnimatePresence mode="wait">
              {section === "movers" && (
                <motion.div
                  key="movers"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                >
                  {topMovers.length === 0 ? (
                    <div
                      className="flex items-center justify-center"
                      style={{ minHeight: "100px" }}
                    >
                      <span
                        className="text-[#00ff41] opacity-50"
                        style={{
                          fontFamily: '"VT323", monospace',
                          fontSize: "1.1rem",
                        }}
                      >
                        Waiting for market data...
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {topMovers.map((mover, i) => {
                        const isUp = mover.change >= 0;
                        const highlight = i === moverIndex;
                        return (
                          <motion.div
                            key={mover.ticker + "-" + i}
                            initial={{ opacity: 0, x: 30 }}
                            animate={{
                              opacity: highlight ? 1 : 0.6,
                              x: 0,
                              scale: highlight ? 1 : 0.97,
                            }}
                            transition={{ duration: 0.3 }}
                            className="flex items-center gap-3"
                          >
                            {/* Ticker */}
                            <span
                              className="font-bold shrink-0"
                              style={{
                                fontFamily: '"Press Start 2P", monospace',
                                fontSize: "0.45rem",
                                color: highlight ? "#00ff41" : "#338833",
                                textShadow: highlight
                                  ? "0 0 8px rgba(0,255,65,0.6)"
                                  : "none",
                                minWidth: "80px",
                              }}
                            >
                              ${mover.ticker}
                            </span>
                            {/* Change arrow */}
                            <span
                              className="font-bold shrink-0"
                              style={{
                                fontFamily: '"VT323", monospace',
                                fontSize: "1.1rem",
                                color: isUp ? "#00ff41" : "#ff4444",
                              }}
                            >
                              {isUp ? "▲" : "▼"} {Math.abs(mover.change).toFixed(1)}%
                            </span>
                            {/* Market cap */}
                            <span
                              className="shrink-0"
                              style={{
                                fontFamily: '"VT323", monospace',
                                fontSize: "0.95rem",
                                color: "#b0d0b0",
                              }}
                            >
                              MC: ${mover.marketCap >= 1e6
                                ? (mover.marketCap / 1e6).toFixed(1) + "M"
                                : mover.marketCap >= 1e3
                                ? (mover.marketCap / 1e3).toFixed(1) + "K"
                                : mover.marketCap.toFixed(0)}
                            </span>
                            {/* Bar */}
                            <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: "#0a1a0a" }}>
                              <motion.div
                                className="h-full rounded-full"
                                initial={{ width: 0 }}
                                animate={{
                                  width: `${Math.min(Math.abs(mover.change) * 2, 100)}%`,
                                }}
                                transition={{ duration: 0.8 }}
                                style={{
                                  background: isUp
                                    ? "linear-gradient(90deg, #00ff41, #00cc33)"
                                    : "linear-gradient(90deg, #ff4444, #cc3333)",
                                  boxShadow: isUp
                                    ? "0 0 8px rgba(0,255,65,0.3)"
                                    : "0 0 8px rgba(255,68,68,0.3)",
                                }}
                              />
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  )}
                </motion.div>
              )}

              {/* Announcements Section */}
              {section === "announcements" && (
                <motion.div
                  key="announcements"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                >
                  <div
                    className="flex items-center gap-3"
                    style={{ minHeight: "100px" }}
                  >
                    {/* Typewriter text */}
                    <div className="flex-1">
                      <span
                        className="text-[#00ff41]"
                        style={{
                          fontFamily: '"VT323", monospace',
                          fontSize: "1.3rem",
                          textShadow: "0 0 8px rgba(0,255,65,0.3)",
                          lineHeight: "1.5",
                        }}
                      >
                        {announcementText}
                      </span>
                      <span
                        className="inline-block w-2 h-5 ml-0.5 align-middle"
                        style={{
                          background: "#00ff41",
                          animation: "cursor-blink 1s step-end infinite",
                        }}
                      />
                    </div>
                    {/* Dots indicator */}
                    <div className="flex flex-col gap-1.5 shrink-0">
                      {announcements.slice(0, 5).map((_, i) => (
                        <span
                          key={i}
                          className="w-1.5 h-1.5 rounded-full"
                          style={{
                            background:
                              i === currentAnnouncement
                                ? "#00ff41"
                                : "#1a3a1a",
                            boxShadow:
                              i === currentAnnouncement
                                ? "0 0 6px #00ff41"
                                : "none",
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Bottom label */}
            <div className="mt-3 flex items-center justify-between">
              <span
                className="text-[#338833]"
                style={{
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: "0.35rem",
                }}
              >
                {section === "movers" ? "LIVE MARKET" : "CHANNEL 01"}
              </span>
              <span
                className="text-[#338833]"
                style={{
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: "0.35rem",
                }}
              >
                {new Date().toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          </div>
        </div>

        {/* LED light on bezel */}
        <div
          className="absolute top-3 right-4 w-2 h-2 rounded-full"
          style={{
            background: "#00ff41",
            boxShadow: "0 0 6px #00ff41, 0 0 12px rgba(0,255,65,0.5)",
            animation: "pulse 2s ease-in-out infinite",
          }}
        />
      </div>
    </div>
  );
}
