import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";

/* ══════════════════════════════════════════
   CoinRain — pixel-art jackpot coin rain
   ══════════════════════════════════════════ */

// 16×16 pixel coin SVG: gold body, green "$", dark outline
// . = transparent, G = gold, D = dark outline, E = green accent, H = gold highlight
const COIN_MAP: string[] = [
  "....DDDDDDD....",
  "..DDGGGGGGGDD..",
  ".DGGGEEEEGGGDD.",
  ".DGEEEEEEEGGD.",
  "DGEEHDDDHEEGGD",
  "DGEEHDDDHEEGGD",
  "DGEEHEEEHEEGGD",
  "DGEEHDDDHEEGGD",
  "DGEEHEEEHEEGGD",
  "DGEEHDDDHEEGGD",
  "DGEEHDDDHEEGGD",
  ".DGEEEEEEEGGD.",
  ".DGGGEEEEGGGDD.",
  "..DDGGGGGGGDD..",
  "....DDDDDDD....",
  "....DDDDDDD....",
];

const COIN_COLORS: Record<string, string> = {
  G: "#ffd700", // gold body
  D: "#1a1a0e", // dark outline
  E: "#00ff41", // green dollar sign / accent
  H: "#ffe44d", // gold highlight
};

const GRAD_COIN_COLORS: Record<string, string> = {
  G: "#ffaa00", // graduation gold body
  D: "#1a1a0e",
  E: "#ffd700", // golden accent
  H: "#ffcc33", // brighter highlight
};

const PIXEL_SIZE = 1;

interface CoinData {
  id: number;
  left: number; // 0-100 vw%
  speed: number; // seconds to fall
  size: number; // px
  wobble: number; // px amplitude
  delay: number; // seconds
  rotation: number;
  fromCenter: boolean;
  vx: number;
  vy: number;
}

interface CoinRainProps {
  active: boolean;
  count?: number;
  duration?: number; // ms over which coins spawn
  isGraduation?: boolean;
}

export function CoinRain({ active, count = 20, duration = 3000, isGraduation = false }: CoinRainProps) {
  const coins: CoinData[] = useMemo(() => {
    if (!active) return [];
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      left: isGraduation ? 50 : Math.random() * 96 + 2,
      speed: 2 + Math.random() * 2,
      size: isGraduation ? 18 + Math.random() * 22 : 16 + Math.random() * 16,
      wobble: 15 + Math.random() * 35,
      delay: (i / count) * (duration / 1000) * 0.8,
      rotation: Math.random() * 360,
      fromCenter: isGraduation,
      vx: isGraduation ? (Math.random() - 0.5) * 120 : 0,
      vy: isGraduation ? -Math.random() * 40 - 20 : 0,
    }));
  }, [active, count, duration, isGraduation]);

  const colors = isGraduation ? GRAD_COIN_COLORS : COIN_COLORS;
  const shadowColor = isGraduation
    ? "drop-shadow(0 0 4px rgba(255,170,0,0.5)) drop-shadow(0 0 8px rgba(255,170,0,0.3))"
    : "drop-shadow(0 0 4px rgba(0,255,65,0.4)) drop-shadow(0 0 8px rgba(0,255,65,0.2))";

  return (
    <AnimatePresence>
      {active && (
        <>
          {/* Screen flash for graduation */}
          {isGraduation && (
            <motion.div
              initial={{ opacity: 0.6 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 99,
                background: "#ffffff",
                pointerEvents: "none",
              }}
            />
          )}

          {/* "GRADUATED!" text */}
          {isGraduation && (
            <motion.div
              initial={{ scale: 0.2, opacity: 0 }}
              animate={{ scale: [0.2, 1.3, 1], opacity: [0, 1, 1] }}
              transition={{ duration: 0.8, ease: "easeOut", times: [0, 0.5, 1] }}
              style={{
                position: "fixed",
                top: "40%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                zIndex: 101,
                pointerEvents: "none",
                fontFamily: '"Press Start 2P", monospace',
                fontSize: "clamp(1.5rem, 8vw, 3rem)",
                color: "#ffaa00",
                textShadow: "0 0 20px rgba(255,170,0,0.8), 0 0 40px rgba(255,170,0,0.4)",
                textAlign: "center",
              }}
            >
              🎓 GRADUATED!
            </motion.div>
          )}

          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 100,
              pointerEvents: "none",
              overflow: "hidden",
            }}
          >
            {coins.map((coin) => (
              <motion.div
                key={coin.id}
                initial={{
                  y: coin.fromCenter ? "50vh" : "-10vh",
                  x: coin.fromCenter ? "50vw" : `${coin.left}vw`,
                  rotate: coin.rotation,
                  opacity: 1,
                }}
                animate={{
                  y: coin.fromCenter ? `calc(50vh + ${coin.vy}vh + 60vh)` : "110vh",
                  x: coin.fromCenter ? `calc(50vw + ${coin.vx}vw)` : `${coin.left}vw`,
                  rotate: coin.rotation + (coin.fromCenter ? 720 : 360),
                  opacity: [1, 1, 0.7, 0],
                }}
                exit={{ opacity: 0 }}
                transition={{
                  y: {
                    duration: coin.speed,
                    delay: coin.delay,
                    ease: coin.fromCenter ? [0.1, 0.8, 0.2, 1.0] : [0.32, 0.72, 0.35, 1.0],
                  },
                  x: {
                    duration: coin.speed,
                    delay: coin.delay,
                    ease: "easeOut",
                  },
                  rotate: {
                    duration: coin.speed,
                    delay: coin.delay,
                    ease: "linear",
                  },
                  opacity: {
                    duration: coin.speed,
                    delay: coin.delay,
                    ease: "easeIn",
                  },
                }}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: coin.size,
                  height: coin.size,
                }}
              >
                <motion.svg
                  viewBox="0 0 16 16"
                  width={coin.size}
                  height={coin.size}
                  style={{
                    imageRendering: "pixelated",
                    filter: shadowColor,
                  }}
                  animate={{
                    x: coin.fromCenter ? undefined : [-coin.wobble, coin.wobble * 0.6, -coin.wobble * 0.3, coin.wobble * 0.5, 0],
                  }}
                  transition={{
                    x: {
                      duration: coin.speed,
                      delay: coin.delay,
                      ease: "easeInOut",
                    },
                  }}
                >
                  {COIN_MAP.map((row, rowIdx) =>
                    [...row].map((char, colIdx) => {
                      if (char === ".") return null;
                      return (
                        <rect
                          key={`c-${rowIdx}-${colIdx}`}
                          x={colIdx}
                          y={rowIdx}
                          width={PIXEL_SIZE}
                          height={PIXEL_SIZE}
                          fill={colors[char] || "#ffd700"}
                          shapeRendering="crispEdges"
                        />
                      );
                    }),
                  )}
                </motion.svg>
              </motion.div>
            ))}
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
