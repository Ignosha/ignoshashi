import { useEffect, useRef, useState, useCallback } from "react";
import { motion, useAnimationControls, useMotionValue, useTransform } from "framer-motion";
import { useTheme } from "~/context/ThemeContext";

/* ══════════════════════════════════════════
   Pixel Astronaut Mascot — ignoshashi
   16×16 pixel art rendered as SVG rects
   ══════════════════════════════════════════ */

type PixelColor = string | null;

// 0 = transparent, W = white, G = green, D = dark, S = silver, L = light gray, R = red
const PIXEL_MAP: string[] = [
  "................",
  ".....DDDDDD.....",
  "...DDDDDDDDDD...",
  "..DDWWWWWWWWDD..",
  "..DWGGGGGGGGWD..",
  "...DGGGGGGGGD...",
  ".....DDDDDD.....",
  "...DDDDDDDDDD...",
  "...DSSSSSSSSD...",
  "...DSDSSDDSSD...",
  "...DSSSSSSSSD...",
  "...DSDSSDDSSD...",
  "...DSSSSSSSSD...",
  "....DDDDDDDD....",
  ".....D....D.....",
  ".....D....D.....",
];

const COLOR_MAP: Record<string, string> = {
  W: "#ffffff",
  G: "var(--mascot-green, #00ff41)",
  D: "#1a1a2e",
  S: "#d0d0d0",
  L: "#e8e8e8",
  R: "#ff4444",
};

const PIXEL_SIZE = 1; // unit size in SVG, scaled by viewBox

interface PixelMascotProps {
  size?: number;
  position?: { top?: number | string; left?: number | string; right?: number | string; bottom?: number | string };
}

export function PixelMascot({ size = 64, position }: PixelMascotProps) {
  const { theme } = useTheme();
  const controls = useAnimationControls();
  const [isWaving, setIsWaving] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  const [driftDirection, setDriftDirection] = useState(1);

  // Drift animation
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const handleClick = useCallback(() => {
    // Do a spin on click
    setIsSpinning(true);
    setTimeout(() => setIsSpinning(false), 800);
  }, []);

  const handleHover = useCallback(() => {
    setIsWaving(true);
    setTimeout(() => setIsWaving(false), 600);
  }, []);

  // Continuous idle drift
  useEffect(() => {
    let frame: number;
    let startTime = performance.now();
    let localDir = driftDirection;
    let phaseX = Math.random() * Math.PI * 2;
    let phaseY = Math.random() * Math.PI * 2;

    const animate = (now: number) => {
      const elapsed = (now - startTime) / 1000;

      // Change direction occasionally
      if (Math.sin(elapsed * 0.3 + phaseX) > 0.95 && localDir === driftDirection) {
        setDriftDirection((d) => {
          localDir = -d;
          return localDir;
        });
      }

      // Gentle sinusoidal drift
      const driftX = Math.sin(elapsed * 0.4 + phaseX) * 30;
      const driftY = Math.sin(elapsed * 0.6 + phaseY) * 15;

      x.set(driftX);
      y.set(driftY);

      frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [driftDirection]);

  const posStyle: React.CSSProperties = position
    ? {
        position: "fixed",
        zIndex: 50,
        pointerEvents: "none",
        ...(position.top !== undefined && { top: typeof position.top === "number" ? `${position.top}px` : position.top }),
        ...(position.left !== undefined && { left: typeof position.left === "number" ? `${position.left}px` : position.left }),
        ...(position.right !== undefined && { right: typeof position.right === "number" ? `${position.right}px` : position.right }),
        ...(position.bottom !== undefined && { bottom: typeof position.bottom === "number" ? `${position.bottom}px` : position.bottom }),
      }
    : {
        position: "fixed",
        bottom: "80px",
        right: "20px",
        zIndex: 50,
        pointerEvents: "none",
      };

  return (
    <motion.div
      style={{
        ...posStyle,
        width: size,
        height: size,
        cursor: "pointer",
      }}
      animate={{
        y: [0, -6, 0],
        rotate: isSpinning ? [0, 360] : 0,
        scale: isSpinning ? [1, 1.2, 1] : [1, 1.03, 1],
      }}
      transition={{
        y: {
          duration: 2.5,
          repeat: Infinity,
          ease: "easeInOut",
        },
        rotate: isSpinning ? { duration: 0.8, ease: "easeInOut" } : { duration: 0.3 },
        scale: isSpinning
          ? { duration: 0.8, ease: "easeInOut" }
          : { duration: 2.5, repeat: Infinity, ease: "easeInOut" },
      }}
      onHoverStart={handleHover}
      onClick={handleClick}
      whileHover={{ scale: 1.15 }}
      title="ignoshashi Astronaut — click me!"
    >
      {/* Interactive hit area */}
      <div
        style={{
          position: "absolute",
          inset: "-10px",
          pointerEvents: "auto",
          cursor: "pointer",
          zIndex: 1,
        }}
      />
      <motion.svg
        viewBox="0 0 16 16"
        width={size}
        height={size}
        style={{
          imageRendering: "pixelated",
          filter: `drop-shadow(0 0 8px ${theme.primary}66) drop-shadow(0 0 16px ${theme.primary}33)`,
          position: "relative",
          zIndex: 0,
        }}
        animate={
          isWaving
            ? { rotate: [0, -10, 15, -10, 5, 0], scale: [1, 1.08, 1, 1.08, 1] }
            : {}
        }
        transition={{ duration: 0.6, ease: "easeInOut" }}
      >
        {PIXEL_MAP.map((row, y) =>
          [...row].map((char, x) => {
            if (char === ".") return null;
            const color = COLOR_MAP[char];
            // Resolve CSS variable for green
            const resolvedColor = color?.startsWith("var(") ? theme.primary : color;
            return (
              <rect
                key={`${x}-${y}`}
                x={x}
                y={y}
                width={PIXEL_SIZE}
                height={PIXEL_SIZE}
                fill={resolvedColor || "#00ff41"}
                shapeRendering="crispEdges"
              />
            );
          }),
        )}
      </motion.svg>
    </motion.div>
  );
}
