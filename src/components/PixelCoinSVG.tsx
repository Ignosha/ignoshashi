/* ══════════════════════════════════════════
   PixelCoinSVG — reusable 16×16 pixel coin
   ══════════════════════════════════════════ */

// 16×16 pixel coin: gold body, green "$" accent, dark outline
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
  G: "#ffd700",
  D: "#1a1a0e",
  E: "#00ff41",
  H: "#ffe44d",
};

interface PixelCoinSVGProps {
  size?: number;
}

export function PixelCoinSVG({ size = 24 }: PixelCoinSVGProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      style={{
        imageRendering: "pixelated",
        display: "inline-block",
        verticalAlign: "middle",
        filter: "drop-shadow(0 0 3px rgba(0,255,65,0.3))",
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
              width={1}
              height={1}
              fill={COIN_COLORS[char] || "#ffd700"}
              shapeRendering="crispEdges"
            />
          );
        }),
      )}
    </svg>
  );
}
