import { useMemo, useEffect, useRef, useState, useCallback } from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
  type TooltipItem,
  type ChartOptions,
  type ScriptableContext,
} from "chart.js";
import {
  getBondingCurvePrice,
  getBondingCurveChartData,
  getGraduationProgress,
  GRADUATION_SUPPLY_THRESHOLD,
  type BondingCurveState,
} from "~/services/bondingCurve";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

// ─── Pulsing dot plugin ──────────────────────
const pulsingDotPlugin = {
  id: "pulsingDot",
  afterDraw(chart: ChartJS) {
    const meta = chart.getDatasetMeta(1); // current position dataset
    if (!meta.data || meta.data.length === 0) return;
    const point = meta.data[0];
    const ctx = chart.ctx;
    const x = point.x;
    const y = point.y;
    const now = Date.now() / 1000;
    const pulseRadius = 6 + Math.sin(now * 4) * 3;

    ctx.save();
    // Outer pulse ring
    ctx.beginPath();
    ctx.arc(x, y, pulseRadius, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(0, 255, 65, 0.5)";
    ctx.lineWidth = 2;
    ctx.stroke();
    // Second pulse ring
    ctx.beginPath();
    ctx.arc(x, y, pulseRadius + 4, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(0, 255, 65, 0.2)";
    ctx.lineWidth = 1;
    ctx.stroke();
    // Glow
    const glow = ctx.createRadialGradient(x, y, 2, x, y, 16);
    glow.addColorStop(0, "rgba(0, 255, 65, 0.8)");
    glow.addColorStop(0.5, "rgba(0, 255, 65, 0.2)");
    glow.addColorStop(1, "rgba(0, 255, 65, 0)");
    ctx.beginPath();
    ctx.arc(x, y, 16, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();
    ctx.restore();
  },
};

// ─── Props ───────────────────────────────────
export interface BondingCurveChartProps {
  curve: BondingCurveState;
  /** Whether price is up over last 24h (for color) */
  priceUp?: boolean;
  /** Called when user clicks a point on the curve */
  onCurveClick?: (supplyPct: number, price: number) => void;
  /** Compact mode (smaller, fewer labels) */
  compact?: boolean;
}

// ─── Component ───────────────────────────────
export function BondingCurveChart({
  curve,
  priceUp = true,
  onCurveClick,
  compact = false,
}: BondingCurveChartProps) {
  const chartRef = useRef<ChartJS<"line">>(null);
  const [clickPoint, setClickPoint] = useState<{
    supplyPct: number;
    price: number;
  } | null>(null);

  const chartDataPoints = useMemo(
    () => getBondingCurveChartData(curve, compact ? 30 : 60),
    [curve],
  );

  const currentPrice = useMemo(() => getBondingCurvePrice(curve), [curve]);
  const currentSupplyPct = useMemo(
    () => (curve.currentSupply / curve.totalSupply) * 100,
    [curve],
  );
  const progress = useMemo(() => getGraduationProgress(curve), [curve]);
  const graduationPrice = useMemo(() => {
    const gradSupply = curve.totalSupply * GRADUATION_SUPPLY_THRESHOLD;
    const ratio = gradSupply / curve.totalSupply;
    return curve.basePrice + ratio * ratio * curve.maxPrice;
  }, [curve]);

  const color = priceUp ? "#00ff41" : "#ff4444";
  const fillGradient = priceUp
    ? ["rgba(0, 255, 65, 0.3)", "rgba(0, 255, 65, 0.0)"]
    : ["rgba(255, 68, 68, 0.3)", "rgba(255, 68, 68, 0.0)"];

  const currencySymbol = curve.blockchain === "solana" ? "SOL" : "ETH";

  // Labels: show supply % along X axis
  const labels = chartDataPoints.map((p) => {
    const pct = ((p.supply / curve.totalSupply) * 100).toFixed(0);
    return pct + "%";
  });

  // Dataset 0: the full curve line + fill
  const curveDataset = {
    label: "Bonding Curve",
    data: chartDataPoints.map((p) => p.price),
    borderColor: color,
    borderWidth: 2,
    pointRadius: 0,
    tension: 0.4,
    fill: true as const,
    backgroundColor: (ctx: ScriptableContext<"line">) => {
      if (!ctx.chart?.chartArea) return fillGradient[1];
      const { ctx: canvasCtx, chartArea } = ctx.chart;
      const gradient = canvasCtx.createLinearGradient(
        0,
        chartArea.bottom,
        0,
        chartArea.top,
      );
      gradient.addColorStop(0, fillGradient[1]);
      gradient.addColorStop(1, fillGradient[0]);
      return gradient;
    },
    order: 2,
  };

  // Dataset 1: current position point (just one point)
  const currentPosDataset = {
    label: "Current Price",
    data: [
      ...Array(chartDataPoints.length - 1).fill(null),
      currentPrice,
    ],
    borderColor: color,
    backgroundColor: color,
    pointRadius: 6,
    pointHoverRadius: 10,
    pointBorderColor: "#000",
    pointBorderWidth: 2,
    showLine: false,
    order: 1,
  };

  // Move the dot to the actual supply position (find closest x)
  // We'll do a transformation: place dot at the x-index corresponding to currentSupplyPct
  // Actually let's calculate where current supply falls
  const currentSupplyIdx = useMemo(() => {
    const rawIdx =
      (currentSupplyPct / 100) * (chartDataPoints.length - 1);
    return Math.round(rawIdx);
  }, [currentSupplyPct, chartDataPoints.length]);

  // Rebuild current pos dataset with proper placement
  const positionedCurrentDataset = useMemo(() => {
    const data = Array(chartDataPoints.length).fill(null);
    data[currentSupplyIdx] = currentPrice;
    return {
      ...currentPosDataset,
      data,
    };
  }, [currentSupplyIdx, currentPrice, chartDataPoints.length]);

  // Dataset 2: graduation threshold line (dashed)
  const graduationDataset = {
    label: "Graduation (80%)",
    data: Array(chartDataPoints.length).fill(graduationPrice),
    borderColor: "rgba(255, 210, 63, 0.6)",
    borderDash: [6, 4],
    borderWidth: 1.5,
    pointRadius: 0,
    fill: false,
    order: 3,
  };

  // Dataset 3: progress fill (area under curve UP TO current position)
  const progressDataset = {
    label: "Progress",
    data: chartDataPoints.map((p, i) => {
      const pct = ((p.supply / curve.totalSupply) * 100);
      return pct <= currentSupplyPct ? p.price : null;
    }),
    borderColor: "transparent",
    backgroundColor: priceUp
      ? "rgba(0, 255, 65, 0.08)"
      : "rgba(255, 68, 68, 0.08)",
    borderWidth: 0,
    pointRadius: 0,
    tension: 0.4,
    fill: true as const,
    order: 4,
  };

  const options: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 600,
      easing: "easeOutQuart",
    },
    interaction: {
      mode: "index" as const,
      intersect: false,
    },
    onClick: (_event, elements, chart) => {
      if (elements.length > 0 && onCurveClick) {
        const idx = elements[0].index;
        const point = chartDataPoints[idx];
        if (point) {
          const supplyPct = (point.supply / curve.totalSupply) * 100;
          setClickPoint({ supplyPct, price: point.price });
          onCurveClick(supplyPct, point.price);
        }
      }
    },
    scales: {
      x: {
        display: !compact,
        grid: {
          color: "rgba(0, 255, 65, 0.05)",
          lineWidth: 1,
          tickLength: 0,
        },
        ticks: {
          color: "#6b8f6b",
          font: { family: "VT323", size: compact ? 9 : 11 },
          maxTicksLimit: compact ? 5 : 10,
          callback: (val: string | number, index: number) => {
            if (compact && index % 2 !== 0) return "";
            return labels[index as number];
          },
        },
        title: {
          display: !compact,
          text: "SUPPLY SOLD (%)",
          color: "#6b8f6b",
          font: { family: '"Press Start 2P"', size: 7 },
        },
      },
      y: {
        grid: {
          color: "rgba(0, 255, 65, 0.05)",
          lineWidth: 1,
          tickLength: 0,
        },
        ticks: {
          color: "#6b8f6b",
          font: { family: "VT323", size: compact ? 9 : 11 },
          maxTicksLimit: compact ? 4 : 6,
          callback: (val: string | number) => {
            const v = Number(val);
            if (v < 0.00001) return v.toExponential(1);
            if (v < 0.001) return v.toFixed(6);
            return v.toFixed(4);
          },
        },
        title: {
          display: !compact,
          text: `PRICE (${currencySymbol})`,
          color: "#6b8f6b",
          font: { family: '"Press Start 2P"', size: 7 },
        },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "rgba(5, 5, 5, 0.95)",
        borderColor: "rgba(0, 255, 65, 0.3)",
        borderWidth: 2,
        titleColor: "#00ff41",
        titleFont: { family: '"Press Start 2P"', size: 8 },
        bodyColor: "#e0ffe0",
        bodyFont: { family: "VT323", size: 14 },
        callbacks: {
          title: (items: TooltipItem<"line">[]) => {
            const idx = items[0].dataIndex;
            const pt = chartDataPoints[idx];
            const pct = ((pt.supply / curve.totalSupply) * 100).toFixed(1);
            return `Supply: ${pct}%`;
          },
          label: (item: TooltipItem<"line">) => {
            const idx = item.dataIndex;
            const pt = chartDataPoints[idx];
            const mcap = pt.price * pt.supply;
            const priceStr =
              pt.price < 0.00001
                ? pt.price.toExponential(2)
                : pt.price.toFixed(6);
            return [
              `Price: ${priceStr} ${currencySymbol}`,
              `Market Cap: ${mcap < 0.01 ? mcap.toExponential(2) : mcap.toFixed(4)} ${currencySymbol}`,
            ];
          },
        },
      },
    },
  };

  // Animation loop for pulsing dot
  useEffect(() => {
    const interval = setInterval(() => {
      if (chartRef.current) {
        chartRef.current.update("none");
      }
    }, 250);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative">
      {/* Chart */}
      <div className={compact ? "h-24" : "h-72"}>
        <Line
          ref={chartRef}
          data={{
            labels,
            datasets: [
              curveDataset,
              positionedCurrentDataset,
              graduationDataset,
              progressDataset,
            ],
          }}
          options={options}
          plugins={[pulsingDotPlugin]}
        />
      </div>

      {/* Legend (non-compact only) */}
      {!compact && (
        <div
          className="flex items-center gap-4 mt-2 justify-center"
          style={{ fontFamily: '"VT323", monospace', fontSize: "0.85rem" }}
        >
          <div className="flex items-center gap-1">
            <div
              className="w-4 h-0.5 rounded"
              style={{ background: color }}
            />
            <span style={{ color: "#b0d0b0" }}>Curve</span>
          </div>
          <div className="flex items-center gap-1">
            <div
              className="w-3 h-3 rounded-full relative"
              style={{ background: color }}
            >
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  animation: "pulse-ring 1.5s ease-out infinite",
                  border: `2px solid ${color}`,
                }}
              />
            </div>
            <span style={{ color: "#b0d0b0" }}>
              Now ({currentSupplyPct.toFixed(1)}%)
            </span>
          </div>
          <div className="flex items-center gap-1">
            <div
              className="w-4 h-0"
              style={{
                borderTop: "2px dashed rgba(255, 210, 63, 0.6)",
              }}
            />
            <span style={{ color: "#ffd23f" }}>
              🌙 THE MOON ({((GRADUATION_SUPPLY_THRESHOLD) * 100).toFixed(0)}%)
            </span>
          </div>
        </div>
      )}

      {/* Click info overlay */}
      {clickPoint && !compact && (
        <div
          className="absolute top-2 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded text-center pointer-events-none z-10"
          style={{
            background: "rgba(5, 5, 5, 0.9)",
            border: "1px solid rgba(0, 255, 65, 0.3)",
          }}
        >
          <p
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: "0.4rem",
              color: "#ffd23f",
            }}
          >
            IF YOU BOUGHT HERE
          </p>
          <p
            style={{
              fontFamily: '"VT323", monospace',
              fontSize: "0.95rem",
              color: "#00ff41",
            }}
          >
            Supply: {clickPoint.supplyPct.toFixed(1)}% @{" "}
            {clickPoint.price < 0.00001
              ? clickPoint.price.toExponential(2)
              : clickPoint.price.toFixed(6)}{" "}
            {currencySymbol}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Mini Bonding Curve Sparkline (for token cards) ───
export function MiniBondingCurve({
  curve,
  priceUp = true,
}: {
  curve: BondingCurveState;
  priceUp?: boolean;
}) {
  const chartDataPoints = useMemo(
    () => getBondingCurveChartData(curve, 15),
    [curve],
  );
  const currentPrice = useMemo(() => getBondingCurvePrice(curve), [curve]);
  const currentSupplyPct = useMemo(
    () => (curve.currentSupply / curve.totalSupply) * 100,
    [curve],
  );

  const color = priceUp ? "#00ff41" : "#ff4444";

  const labels = chartDataPoints.map((_, i) => i.toString());

  // Find the index closest to the current supply
  const currentSupplyIdx = Math.round(
    (currentSupplyPct / 100) * (chartDataPoints.length - 1),
  );

  // Build progress data (up to current position)
  const progressData = chartDataPoints.map((p, i) => {
    const pct = ((p.supply / curve.totalSupply) * 100);
    return pct <= currentSupplyPct ? p.price : null;
  });

  const datasets = [
    // Faded background curve
    {
      data: chartDataPoints.map((p) => p.price),
      borderColor: "rgba(0, 255, 65, 0.15)",
      borderWidth: 1,
      pointRadius: 0,
      tension: 0.4,
      fill: false,
      order: 2,
    },
    // Progress line (bright)
    {
      data: progressData,
      borderColor: color,
      borderWidth: 2,
      pointRadius: 0,
      tension: 0.4,
      fill: false,
      order: 1,
    },
    // Current position dot
    {
      data: Array(chartDataPoints.length)
        .fill(null)
        .map((_, i) => (i === currentSupplyIdx ? currentPrice : null)),
      borderColor: color,
      backgroundColor: color,
      pointRadius: 3,
      pointHoverRadius: 5,
      showLine: false,
      order: 0,
    },
  ];

  const options: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 400 },
    scales: { x: { display: false }, y: { display: false } },
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
    events: [],
  };

  return (
    <div className="h-10 w-full">
      <Line data={{ labels, datasets }} options={options} />
    </div>
  );
}
