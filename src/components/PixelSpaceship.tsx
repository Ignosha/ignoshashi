import { useMemo } from "react";
import { motion } from "framer-motion";
import { useTheme } from "~/context/ThemeContext";

/* ══════════════════════════════════════════
   Pixel Spaceship — ignoshashi
   16×16 pixel art retro rocket, SVG rects
   ══════════════════════════════════════════ */

// . = transparent
// B = dark body,   S = silver nose,  C = cyan window
// G = green accent, L = lighter body, F = flame

const PIXEL_MAP: string[] = [
  "................",
  "......BB........",
  ".....BSSB.......",
  "....BSSSSB......",
  "...BSSSSSSB.....",
  "...BSCCCCSB.....",
  "...BSCCCCSB.....",
  "...BGLLLLGB.....",
  "...BGGGGGGB.....",
  "..BBGGGGGGBB....",
  ".B..BGGGGB..B...",
  "B...BGGGGB...B..",
  "......FFFF......",
  "......FFFF......",
  "......F..F......",
  "......F..F......",
];

const COLOR_MAP: Record<string, string> = {
  B: "#1a1a2e",
  S: "#d0d0d0",
  C: "#00d4ff",
  G: "var(--mascot-green, #00ff41)",
  L: "#2a2a3e",
  F: "#ff7b00",
};

const PIXEL_SIZE = 1;

interface PixelSpaceshipProps {
  size?: number;
  speed?: number; // seconds per full diagonal crossing
  startX?: number; // 0–1 fraction of viewport width
  startY?: number; // 0–1 fraction of viewport height
  direction?: "bl-tr" | "tl-br" | "br-tl" | "tr-bl";
}

export function PixelSpaceship({
  size = 48,
  speed = 40,
  startX: startXProp,
  startY: startYProp,
  direction: directionProp,
}: PixelSpaceshipProps) {
  const { theme } = useTheme();

  // Deterministic pseudo-random from seed props (SSR-safe, no window access)
  const rand = useMemo(() => {
    const seed = ((startXProp ?? 0.5) * 13 + (startYProp ?? 0.5) * 17) * 1000;
    let s = Math.floor(seed);
    return () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }, [startXProp, startYProp]);

  const r = rand;
  const direction = directionProp ?? (r() < 0.5 ? "bl-tr" : "tl-br");
  const startX = startXProp ?? r() * 0.8 + 0.1;
  const startY = startYProp ?? r() * 0.7 + 0.1;

  // Diagonal drift deltas in vw/vh so the ship crosses the full screen
  const { dx, dy, rotatePath } = useMemo(() => {
    const wobble = r() * 6 + 3; // degrees of wobble
    switch (direction) {
      case "bl-tr": // bottom-left → top-right
        return { dx: "120vw", dy: "-120vh", rotatePath: [0, wobble, -wobble * 0.6, wobble * 0.4, 0] };
      case "tl-br": // top-left → bottom-right
        return { dx: "120vw", dy: "120vh", rotatePath: [0, -wobble, wobble * 0.6, -wobble * 0.4, 0] };
      case "br-tl": // bottom-right → top-left
        return { dx: "-120vw", dy: "-120vh", rotatePath: [0, -wobble, wobble * 0.6, -wobble * 0.4, 0] };
      case "tr-bl": // top-right → bottom-left
        return { dx: "-120vw", dy: "120vh", rotatePath: [0, wobble, -wobble * 0.6, wobble * 0.4, 0] };
    }
  }, [direction, r]);

  const flameWobble = r() * 0.3 + 0.6; // seconds per flame pulse
  const flameDelay = r() * 0.5;

  // Resolve CSS variable colors
  const greenColor = theme.primary || "#00ff41";

  return (
    <motion.div
      style={{
        position: "fixed",
        zIndex: 1,
        pointerEvents: "none",
        width: size,
        height: size,
        left: `calc(${startX * 100}vw - ${size / 2}px)`,
        top: `calc(${startY * 100}vh - ${size / 2}px)`,
      }}
      animate={{
        x: [0, dx],
        y: [0, dy],
        rotate: rotatePath,
      }}
      transition={{
        x: { duration: speed, repeat: Infinity, ease: "linear" },
        y: { duration: speed, repeat: Infinity, ease: "linear" },
        rotate: { duration: speed / 3, repeat: Infinity, ease: "easeInOut" },
      }}
    >
      <motion.svg
        viewBox="0 0 16 16"
        width={size}
        height={size}
        style={{
          imageRendering: "pixelated",
          filter: `drop-shadow(0 0 6px ${greenColor}55) drop-shadow(0 0 12px ${greenColor}22)`,
        }}
      >
        {/* Body pixels (skip flame — rendered separately) */}
        {PIXEL_MAP.map((row, rowIdx) =>
          [...row].map((char, colIdx) => {
            if (char === "." || char === "F") return null;
            let color = COLOR_MAP[char];
            if (color?.startsWith("var(")) color = greenColor;
            return (
              <rect
                key={`b-${rowIdx}-${colIdx}`}
                x={colIdx}
                y={rowIdx}
                width={PIXEL_SIZE}
                height={PIXEL_SIZE}
                fill={color}
                shapeRendering="crispEdges"
              />
            );
          }),
        )}
        {/* Pulsing flame — grouped and scaled from the top */}
        <motion.g
          animate={{
            scaleY: [1, 1.6, 0.75, 1.35, 1],
          }}
          transition={{
            duration: flameWobble,
            repeat: Infinity,
            ease: "easeInOut",
            delay: flameDelay,
          }}
          style={{ originY: "12px", originX: "8px" }}
        >
          {PIXEL_MAP.map((row, rowIdx) =>
            [...row].map((char, colIdx) => {
              if (char !== "F") return null;
              // Flicker between orange shades
              const flicker = (rowIdx + colIdx) % 3 === 0 ? "#ffaa00" : "#ff7b00";
              return (
                <rect
                  key={`f-${rowIdx}-${colIdx}`}
                  x={colIdx}
                  y={rowIdx}
                  width={PIXEL_SIZE}
                  height={PIXEL_SIZE}
                  fill={flicker}
                  shapeRendering="crispEdges"
                />
              );
            }),
          )}
        </motion.g>
      </motion.svg>
    </motion.div>
  );
}
