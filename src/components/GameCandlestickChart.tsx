import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import type { OHLCData } from "~/utils/aggregateOHLC";

export type Timeframe = "1H" | "6H" | "24H" | "7D";

export const TIMEFRAME_MS: Record<Timeframe, number> = {
  "1H": 60 * 60 * 1000,
  "6H": 6 * 60 * 60 * 1000,
  "24H": 24 * 60 * 60 * 1000,
  "7D": 7 * 24 * 60 * 60 * 1000,
};

export interface GameCandlestickChartProps {
  data: OHLCData[];
  tokenSymbol?: string;
  height?: string;
  showVolume?: boolean;
  onTimeframeChange?: (tf: Timeframe) => void;
  flashCandle?: boolean;
}

// ─── Constants ─────────────────────────────────

const UP_COLOR = "#00ff41";
const DOWN_COLOR = "#ff4444";
const BG_COLOR = "#050505";
const GRID_COLOR = "rgba(0, 255, 65, 0.05)";
const WICK_COLOR_UP = "#00ff41";
const WICK_COLOR_DOWN = "#ff4444";
const VOLUME_UP = "rgba(0, 255, 65, 0.3)";
const VOLUME_DOWN = "rgba(255, 68, 68, 0.25)";
const CROSSHAIR_COLOR = "rgba(0, 255, 65, 0.6)";
const TOOLTIP_BG = "rgba(5, 5, 5, 0.95)";
const TOOLTIP_BORDER = "#00ff41";
const GLOW_STRENGTH = 12;
const WICK_WIDTH = 2;
const MIN_CANDLE_BODY = 1;

// Layout margins (pixels)
const MARGIN = { top: 30, right: 60, bottom: 40, left: 10 };

// ─── Helpers ───────────────────────────────────

function formatPrice(p: number): string {
  if (p >= 1) return `$${p.toFixed(2)}`;
  if (p >= 0.001) return `$${p.toFixed(4)}`;
  return `$${p.toFixed(6)}`;
}

function formatVolume(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return `${v.toFixed(0)}`;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

// ─── Component ─────────────────────────────────

export default function GameCandlestickChart({
  data,
  tokenSymbol,
  height = "100%",
  showVolume = true,
  onTimeframeChange,
  flashCandle = false,
}: GameCandlestickChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);
  const growProgressRef = useRef<number>(0);
  const flashIntensityRef = useRef<number>(0);
  const [timeframe, setTimeframe] = useState<Timeframe>("1H");
  const [volumeOn, setVolumeOn] = useState(true);
  const [hoveredCandle, setHoveredCandle] = useState<{
    index: number;
    candle: OHLCData;
    x: number;
    y: number;
  } | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [isNarrow, setIsNarrow] = useState(false);

  // Detect narrow screens for simplified rendering
  useEffect(() => {
    const check = () => setIsNarrow(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Auto-hide volume on narrow screens
  useEffect(() => {
    if (isNarrow) setVolumeOn(false);
  }, [isNarrow]);

  const handleTimeframe = useCallback(
    (tf: Timeframe) => {
      setTimeframe(tf);
      growProgressRef.current = 0;
      onTimeframeChange?.(tf);
    },
    [onTimeframeChange],
  );

  // ─── Canvas dimensions ────────────────────────

  const getCanvasSize = useCallback(() => {
    const el = containerRef.current;
    if (!el) return { w: 800, h: 400 };
    const rect = el.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    return { w: rect.width, h: rect.height, dpr };
  }, []);

  // ─── Draw function ────────────────────────────

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { w, h, dpr } = getCanvasSize();
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    const chartW = w - MARGIN.left - MARGIN.right;
    const chartH = h - MARGIN.top - MARGIN.bottom;

    // Downsample data on narrow screens (max ~40 candles)
    let displayData = data;
    if (isNarrow && data.length > 40) {
      const step = Math.ceil(data.length / 40);
      displayData = data.filter((_, i) => i % step === 0 || i === data.length - 1);
    }

    if (data.length === 0) {
      // Empty state
      ctx.fillStyle = BG_COLOR;
      ctx.fillRect(0, 0, w, h);
      drawEmptyState(ctx, w, h, Date.now());
      drawCRTOverlay(ctx, w, h);
      return;
    }

    // Compute price range
    let minPrice = Infinity;
    let maxPrice = -Infinity;
    let maxVolume = 0;
    for (const c of displayData) {
      if (c.l < minPrice) minPrice = c.l;
      if (c.h > maxPrice) maxPrice = c.h;
      if (c.v > maxVolume) maxVolume = c.v;
    }
    // Add padding
    const priceRange = maxPrice - minPrice || 1;
    const pricePad = priceRange * 0.06;
    minPrice -= pricePad;
    maxPrice += pricePad;
    const yScale = chartH / (maxPrice - minPrice);

    // Volume area height
    const volAreaH = volumeOn ? 50 : 0;
    const priceAreaH = chartH - volAreaH - (volumeOn ? 8 : 0);

    // Background
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, w, h);

    // Grid lines
    drawGrid(ctx, MARGIN.left, MARGIN.top, chartW, priceAreaH, minPrice, maxPrice);

    const growProgress = Math.min(growProgressRef.current, 1);
    const flashIntensity = Math.max(0, flashIntensityRef.current);
    const candleW = Math.max(2, (chartW / displayData.length) * 0.7);
    const candleGap = chartW / displayData.length;
    const scaleX = (i: number) => MARGIN.left + i * candleGap + candleGap / 2;

    // Clip for price area
    ctx.save();
    ctx.beginPath();
    ctx.rect(MARGIN.left, MARGIN.top, chartW, priceAreaH);
    ctx.clip();

    // Draw candles with grow animation
    for (let i = 0; i < displayData.length; i++) {
      const c = displayData[i];
      const cx = scaleX(i);
      const isUp = c.c >= c.o;
      const bodyTop = MARGIN.top + (maxPrice - (isUp ? c.c : c.o)) * yScale;
      const bodyBot = MARGIN.top + (maxPrice - (isUp ? c.o : c.c)) * yScale;
      const highY = MARGIN.top + (maxPrice - c.h) * yScale;
      const lowY = MARGIN.top + (maxPrice - c.l) * yScale;
      const bodyH = Math.max(MIN_CANDLE_BODY, bodyBot - bodyTop);

      // Grow animation: scale body height from bottom
      const candleBase = MARGIN.top + (maxPrice - c.l) * yScale;
      const growScale = Math.min(1, growProgress * 1.2);
      const animatedBot = candleBase;
      const animatedTop = candleBase - (candleBase - highY) * growScale;
      const animBodyTop = candleBase - (candleBase - bodyTop) * growScale;
      const animBodyH = Math.max(MIN_CANDLE_BODY, candleBase - animBodyTop);

      // Flash effect on current candle
      let extraGlow = 0;
      if (i === data.length - 1 && flashIntensity > 0.01) {
        extraGlow = flashIntensity * 20;
      }

      const color = isUp ? UP_COLOR : DOWN_COLOR;
      const wickColor = isUp ? WICK_COLOR_UP : WICK_COLOR_DOWN;
      const opacity = Math.min(1, growProgress * 1.5);

      // Glow behind candle body
      if (extraGlow > 0 || bodyH > 2) {
        ctx.save();
        ctx.globalAlpha = opacity * (0.3 + extraGlow * 0.03);
        ctx.shadowColor = color;
        ctx.shadowBlur = GLOW_STRENGTH + extraGlow;
        ctx.fillStyle = color;
        ctx.fillRect(cx - candleW / 2 - 2, animBodyTop, candleW + 4, animBodyH);
        ctx.restore();
      }

      // Wicks (2px wide pixel-perfect)
      ctx.strokeStyle = wickColor;
      ctx.lineWidth = WICK_WIDTH;
      ctx.globalAlpha = opacity;
      ctx.beginPath();
      ctx.moveTo(Math.round(cx), Math.round(animatedTop));
      ctx.lineTo(Math.round(cx), Math.round(animatedBot));
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Candle body
      ctx.fillStyle = color;
      ctx.globalAlpha = opacity;
      const bodyX = Math.round(cx - candleW / 2);
      const bodyW = Math.round(candleW);
      ctx.fillRect(bodyX, Math.round(animBodyTop), bodyW, Math.round(animBodyH));
      ctx.globalAlpha = 1;
    }

    ctx.restore();

    // Volume bars
    if (volumeOn && maxVolume > 0) {
      const volBase = MARGIN.top + priceAreaH + 8;
      const volScale = volAreaH / maxVolume;
      ctx.save();
      ctx.beginPath();
      ctx.rect(MARGIN.left, volBase, chartW, volAreaH);
      ctx.clip();
      for (let i = 0; i < displayData.length; i++) {
        const c = displayData[i];
        const cx = scaleX(i);
        const isUp = c.c >= c.o;
        const vh = c.v * volScale * growProgress;
        ctx.fillStyle = isUp ? VOLUME_UP : VOLUME_DOWN;
        ctx.fillRect(
          Math.round(cx - candleW / 2),
          Math.round(volBase + volAreaH - vh),
          Math.round(candleW),
          Math.round(vh),
        );
      }
      ctx.restore();

      // Volume separator line
      ctx.strokeStyle = "rgba(0,255,65,0.1)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(MARGIN.left, volBase);
      ctx.lineTo(MARGIN.left + chartW, volBase);
      ctx.stroke();
    }

    // Y-axis labels (right side)
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.fillStyle = "#b0d0b0";
    ctx.textAlign = "left";
    const yTicks = 5;
    for (let i = 0; i <= yTicks; i++) {
      const price = minPrice + (priceRange / yTicks) * i;
      const y = MARGIN.top + priceAreaH - (i / yTicks) * priceAreaH;
      ctx.fillText(formatPrice(price), MARGIN.left + chartW + 4, y + 3);
    }

    // X-axis labels (bottom) — fewer labels on narrow screens
    if (displayData.length > 0) {
      ctx.font = isNarrow ? '6px "Press Start 2P", monospace' : '7px "Press Start 2P", monospace';
      ctx.fillStyle = "#b0d0b0";
      ctx.textAlign = "center";
      const xTickCount = Math.min(displayData.length, isNarrow ? 3 : 5);
      const step = Math.max(1, Math.floor(displayData.length / xTickCount));
      for (let i = 0; i < displayData.length; i += step) {
        const cx = scaleX(i);
        ctx.fillText(formatTime(displayData[i].x), cx, MARGIN.top + chartH + 14);
      }
      // Always show last candle time
      const lastI = displayData.length - 1;
      if (lastI % step !== 0) {
        ctx.fillText(formatTime(displayData[lastI].x), scaleX(lastI), MARGIN.top + chartH + 14);
      }
    }

    // Crosshair
    if (mousePos && hoveredCandle) {
      const mx = mousePos.x;
      const my = mousePos.y;
      const inChart =
        mx >= MARGIN.left &&
        mx <= MARGIN.left + chartW &&
        my >= MARGIN.top &&
        my <= MARGIN.top + priceAreaH;

      if (inChart) {
        const cx = scaleX(hoveredCandle.index);
        ctx.strokeStyle = CROSSHAIR_COLOR;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        // Vertical line
        ctx.beginPath();
        ctx.moveTo(cx, MARGIN.top);
        ctx.lineTo(cx, MARGIN.top + priceAreaH);
        ctx.stroke();
        // Horizontal line
        ctx.beginPath();
        ctx.moveTo(MARGIN.left, my);
        ctx.lineTo(MARGIN.left + chartW, my);
        ctx.stroke();
        ctx.setLineDash([]);

        // Price label on y-axis
        const priceAtY = maxPrice - ((my - MARGIN.top) / priceAreaH) * (maxPrice - minPrice);
        ctx.font = '7px "Press Start 2P", monospace';
        ctx.fillStyle = CROSSHAIR_COLOR;
        ctx.textAlign = "left";
        const labelW = ctx.measureText(formatPrice(priceAtY)).width;
        ctx.fillStyle = TOOLTIP_BG;
        ctx.fillRect(MARGIN.left + chartW + 1, my - 7, labelW + 8, 14);
        ctx.fillStyle = "#00ff41";
        ctx.fillText(formatPrice(priceAtY), MARGIN.left + chartW + 5, my + 3);
      }
    }

    // CRT scanline overlay
    drawCRTOverlay(ctx, w, h);

    // Neon edge glow at bottom
    const glowGrad = ctx.createLinearGradient(0, h - 1, 0, h);
    glowGrad.addColorStop(0, "rgba(0,255,65,0)");
    glowGrad.addColorStop(0.5, "rgba(0,255,65,0.15)");
    glowGrad.addColorStop(1, "rgba(0,255,65,0)");
    ctx.fillStyle = glowGrad;
    ctx.fillRect(MARGIN.left, h - 1, chartW, 1);

    // Decrease flash intensity
    if (flashIntensityRef.current > 0) {
      flashIntensityRef.current = Math.max(0, flashIntensityRef.current - 0.05);
    }
  }, [data, volumeOn, mousePos, hoveredCandle, getCanvasSize, isNarrow]);

  // ─── Animation loop ───────────────────────────

  useEffect(() => {
    let running = true;
    const animate = () => {
      if (!running) return;
      // Grow animation: 0 → 1 over ~500ms
      if (growProgressRef.current < 1) {
        growProgressRef.current = Math.min(1, growProgressRef.current + 0.04);
      }
      // Pulse on current candle
      if (growProgressRef.current >= 1) {
        // Subtle pulse: oscillate glow slightly (implemented via flash)
      }
      draw();
      animFrameRef.current = requestAnimationFrame(animate);
    };
    animate();
    return () => {
      running = false;
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [draw]);

  // ─── Flash trigger on new data ────────────────

  useEffect(() => {
    if (flashCandle) {
      flashIntensityRef.current = 1;
    }
  }, [flashCandle, data.length]);

  // ─── Mouse handlers ───────────────────────────

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas || data.length === 0) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      setMousePos({ x: mx, y: my });

      const chartW = rect.width - MARGIN.left - MARGIN.right;
      const candleGap = chartW / data.length;
      const idx = Math.floor((mx - MARGIN.left) / candleGap);
      if (idx >= 0 && idx < data.length) {
        setHoveredCandle({ index: idx, candle: data[idx], x: mx, y: my });
      } else {
        setHoveredCandle(null);
      }
    },
    [data],
  );

  const handleMouseLeave = useCallback(() => {
    setMousePos(null);
    setHoveredCandle(null);
  }, []);

  // Touch handler for mobile crosshair
  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const canvas = canvasRef.current;
      if (!canvas || data.length === 0) return;
      const touch = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      const mx = touch.clientX - rect.left;
      const my = touch.clientY - rect.top;
      setMousePos({ x: mx, y: my });

      const chartW = rect.width - MARGIN.left - MARGIN.right;
      const candleGap = chartW / data.length;
      const idx = Math.floor((mx - MARGIN.left) / candleGap);
      if (idx >= 0 && idx < data.length) {
        setHoveredCandle({ index: idx, candle: data[idx], x: mx, y: my });
      } else {
        setHoveredCandle(null);
      }
    },
    [data],
  );

  const handleTouchEnd = useCallback(() => {
    setMousePos(null);
    setHoveredCandle(null);
  }, []);

  // ─── Debounced resize ──────────────────────────

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => draw(), 50);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      clearTimeout(timeout);
    };
  }, [draw]);

  // ─── Render ───────────────────────────────────

  const isUp = hoveredCandle && hoveredCandle.candle.c >= hoveredCandle.candle.o;

  return (
    <div className="relative" style={{ height }} ref={containerRef}>
      {/* Timeframe selector */}
      <div className="absolute top-0 left-0 z-20 flex gap-1 m-2">
        {(["1H", "6H", "24H", "7D"] as Timeframe[]).map((tf) => (
          <button
            key={tf}
            onClick={() => handleTimeframe(tf)}
            className={`arcade-mode-btn ${timeframe === tf ? "arcade-mode-active" : ""}`}
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: "0.35rem",
              padding: "0.3rem 0.6rem",
            }}
          >
            {tf}
          </button>
        ))}
      </div>

      {/* Volume toggle */}
      <div className="absolute top-0 right-0 z-20 flex gap-1 m-2">
        <button
          onClick={() => setVolumeOn((v) => !v)}
          className="arcade-mode-btn"
          style={{
            fontFamily: '"Press Start 2P", monospace',
            fontSize: "0.3rem",
            padding: "0.3rem 0.5rem",
            opacity: volumeOn ? 1 : 0.5,
          }}
        >
          VOL
        </button>
      </div>

      {/* Main canvas */}
      <canvas
        ref={canvasRef}
        className="w-full h-full rounded-xl"
        style={{
          display: "block",
          imageRendering: "pixelated",
          touchAction: "none",
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      />

      {/* Tooltip */}
      {hoveredCandle && mousePos && (() => {
        const tooltipX = Math.min(mousePos.x + 12, (containerRef.current?.getBoundingClientRect().width || 400) - 170);
        const tooltipY = Math.max(10, mousePos.y - 80);
        return (
          <div
            className="absolute z-30 pointer-events-none"
            style={{
              left: tooltipX,
              top: tooltipY,
              background: "rgba(5, 5, 5, 0.95)",
              border: `2px solid ${TOOLTIP_BORDER}`,
              borderRadius: "4px",
              padding: "8px 10px",
              minWidth: "150px",
              boxShadow: `0 0 12px ${isUp ? "rgba(0,255,65,0.3)" : "rgba(255,68,68,0.3)"}, inset 0 0 8px rgba(0,255,65,0.05)`,
            }}
          >
            <p
              style={{
                fontFamily: '"Press Start 2P", monospace',
                fontSize: "7px",
                color: "#00ff41",
                marginBottom: "4px",
                textAlign: "center",
              }}
            >
              {formatTime(hoveredCandle.candle.x)}
            </p>
            <div style={{ fontFamily: '"VT323", monospace', fontSize: "13px", lineHeight: "1.4" }}>
              <p style={{ color: "#e0ffe0" }}>
                O: <span style={{ color: "#ffffff" }}>${hoveredCandle.candle.o.toFixed(6)}</span>
              </p>
              <p style={{ color: "#e0ffe0" }}>
                H: <span style={{ color: UP_COLOR }}>${hoveredCandle.candle.h.toFixed(6)}</span>
              </p>
              <p style={{ color: "#e0ffe0" }}>
                L: <span style={{ color: DOWN_COLOR }}>${hoveredCandle.candle.l.toFixed(6)}</span>
              </p>
              <p style={{ color: "#e0ffe0" }}>
                C: <span style={{ color: isUp ? UP_COLOR : DOWN_COLOR }}>${hoveredCandle.candle.c.toFixed(6)}</span>
              </p>
              <p style={{ color: "#b0d0b0" }}>
                Vol: <span style={{ color: "#c0c0c0" }}>{formatVolume(hoveredCandle.candle.v)}</span>
              </p>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─── Drawing helpers ────────────────────────────

function drawGrid(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  minPrice: number,
  maxPrice: number,
) {
  ctx.strokeStyle = GRID_COLOR;
  ctx.lineWidth = 1;

  const priceRange = maxPrice - minPrice;
  const yTicks = 5;
  for (let i = 0; i <= yTicks; i++) {
    const py = y + (h / yTicks) * i;
    ctx.beginPath();
    ctx.moveTo(x, Math.round(py));
    ctx.lineTo(x + w, Math.round(py));
    ctx.stroke();
  }

  // Vertical grid lines
  ctx.strokeStyle = "rgba(0, 255, 65, 0.03)";
  const xTicks = 8;
  for (let i = 0; i <= xTicks; i++) {
    const px = x + (w / xTicks) * i;
    ctx.beginPath();
    ctx.moveTo(Math.round(px), y);
    ctx.lineTo(Math.round(px), y + h);
    ctx.stroke();
  }
}

function drawEmptyState(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  _time?: number,
) {
  // Pulse effect for the glow
  const t = _time || 0;
  const pulse = 0.6 + 0.4 * Math.sin(t * 0.003);
  const blinkAlpha = Math.sin(t * 0.005) > 0 ? 1 : 0.15;

  // Main title with neon glow
  ctx.save();
  ctx.shadowColor = "#00ff41";
  ctx.shadowBlur = 10 * pulse;
  ctx.font = 'bold 10px "Press Start 2P", monospace';
  ctx.fillStyle = "#00ff41";
  ctx.textAlign = "center";
  ctx.fillText("NO TRADES YET", w / 2, h / 2 - 8);
  ctx.shadowBlur = 0;
  ctx.restore();

  // Subtitle
  ctx.font = '14px "VT323", monospace';
  ctx.fillStyle = "#b0d0b0";
  ctx.textAlign = "center";
  ctx.fillText("BE THE FIRST TO TRADE", w / 2, h / 2 + 16);

  // Blinking cursor underscore
  ctx.globalAlpha = blinkAlpha;
  ctx.fillStyle = "#00ff41";
  ctx.fillRect(w / 2 - 42, h / 2 + 6, 8, 2);
  ctx.globalAlpha = 1;
}

function drawCRTOverlay(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // Scanlines: horizontal lines every 4px at 3% opacity
  ctx.fillStyle = "rgba(0, 255, 65, 0.015)";
  for (let y = 0; y < h; y += 4) {
    ctx.fillRect(0, y, w, 1);
  }

  // Vignette
  const vignetteGrad = ctx.createRadialGradient(w / 2, h / 2, w * 0.35, w / 2, h / 2, w * 0.75);
  vignetteGrad.addColorStop(0, "transparent");
  vignetteGrad.addColorStop(1, "rgba(0, 0, 0, 0.4)");
  ctx.fillStyle = vignetteGrad;
  ctx.fillRect(0, 0, w, h);

  // Border
  ctx.strokeStyle = "rgba(0, 255, 65, 0.15)";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, w - 2, h - 2);
}
