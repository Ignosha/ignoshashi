import { useState, useEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { getTrades } from "~/services/tracker";
import { useTheme } from "~/context/ThemeContext";

interface FOMOTimerProps {
  tokenId: string;
  compact?: boolean;
}

export function FOMOTimer({ tokenId, compact = false }: FOMOTimerProps) {
  const { theme } = useTheme();
  const [lastBuyTime, setLastBuyTime] = useState<number | null>(null);
  const [rollingVolume, setRollingVolume] = useState(0);
  const [buyingPressure, setBuyingPressure] = useState<"HIGH" | "MEDIUM" | "LOW">("LOW");
  const [pulse, setPulse] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const updateFOMO = () => {
    const trades = getTrades().filter((t) => t.tokenId === tokenId);
    if (trades.length === 0) {
      setLastBuyTime(null);
      setRollingVolume(0);
      setBuyingPressure("LOW");
      return;
    }

    // Last buy time
    const buys = trades.filter((t) => t.type === "BUY");
    if (buys.length > 0) {
      const lastBuy = buys[0].timestamp;
      setLastBuyTime(lastBuy);
      const secondsSince = (Date.now() - lastBuy) / 1000;
      setPulse(secondsSince < 60);
    }

    // Rolling 5-minute volume
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    const recentTrades = trades.filter((t) => t.timestamp > fiveMinAgo);
    const recentVolume = recentTrades.reduce((sum, t) => sum + t.total, 0);
    setRollingVolume(recentVolume);

    // Buying pressure based on recent buy/sell ratio
    const recentBuys = recentTrades.filter((t) => t.type === "BUY").length;
    const recentSells = recentTrades.filter((t) => t.type === "SELL").length;
    const totalRecent = recentBuys + recentSells;

    if (totalRecent === 0) {
      setBuyingPressure("LOW");
    } else {
      const buyRatio = recentBuys / totalRecent;
      if (buyRatio >= 0.65) setBuyingPressure("HIGH");
      else if (buyRatio >= 0.4) setBuyingPressure("MEDIUM");
      else setBuyingPressure("LOW");
    }
  };

  useEffect(() => {
    updateFOMO();
    intervalRef.current = setInterval(updateFOMO, 10000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenId]);

  const timeSinceLastBuy = lastBuyTime
    ? Math.floor((Date.now() - lastBuyTime) / 1000)
    : null;

  const timeAgoStr = timeSinceLastBuy
    ? timeSinceLastBuy < 60
      ? `${timeSinceLastBuy}s ago`
      : timeSinceLastBuy < 3600
        ? `${Math.floor(timeSinceLastBuy / 60)}m ago`
        : `${Math.floor(timeSinceLastBuy / 3600)}h ago`
    : "—";

  const pressureColor =
    buyingPressure === "HIGH" ? "#00ff41" : buyingPressure === "MEDIUM" ? "#ffaa00" : "#b0d0b0";

  if (compact) {
    return (
      <div
        className="flex items-center gap-2 text-[0.6rem] py-0.5"
        style={{ fontFamily: '"VT323", monospace', fontSize: "0.75rem" }}
      >
        <span className="text-[#b0d0b0]">🔥</span>
        <span style={{ color: theme.textMuted }}>
          {timeAgoStr}
        </span>
        {buyingPressure === "HIGH" && (
          <motion.span
            className="text-[0.6rem]"
            style={{ color: pressureColor }}
            animate={pulse ? { opacity: [1, 0.5, 1] } : {}}
            transition={{ repeat: Infinity, duration: 1 }}
          >
            ⚡
          </motion.span>
        )}
      </div>
    );
  }

  return (
    <motion.div
      className="retro-card p-3 mb-3"
      style={{
        border: `1px solid ${theme.border}`,
        background: theme.cardBg,
      }}
    >
      <div className="flex items-center gap-4 flex-wrap">
        {/* Last Buy */}
        <div className="flex items-center gap-1.5">
          <span className="text-lg">🔥</span>
          <div>
            <span
              className="text-[0.35rem] block"
              style={{ fontFamily: '"Press Start 2P", monospace', color: theme.textMuted }}
            >
              LAST BUY
            </span>
            <motion.span
              className="text-sm font-bold"
              style={{
                fontFamily: '"VT323", monospace',
                fontSize: "1.05rem",
                color: pulse ? "#00ff41" : theme.text,
                textShadow: pulse ? "0 0 8px rgba(0,255,65,0.5)" : "none",
              }}
              animate={pulse ? { scale: [1, 1.05, 1] } : {}}
              transition={{ repeat: Infinity, duration: 1.5 }}
            >
              {timeAgoStr}
            </motion.span>
          </div>
        </div>

        {/* Divider */}
        <div className="w-px h-8" style={{ background: theme.border }} />

        {/* 5-min Volume */}
        <div className="flex items-center gap-1.5">
          <span className="text-lg">📊</span>
          <div>
            <span
              className="text-[0.35rem] block"
              style={{ fontFamily: '"Press Start 2P", monospace', color: theme.textMuted }}
            >
              VOLUME (5m)
            </span>
            <span
              className="text-sm font-bold"
              style={{
                fontFamily: '"VT323", monospace',
                fontSize: "1.05rem",
                color: theme.text,
              }}
            >
              {rollingVolume.toFixed(4)} SOL
            </span>
          </div>
        </div>

        {/* Divider */}
        <div className="w-px h-8" style={{ background: theme.border }} />

        {/* Buying Pressure */}
        <div className="flex items-center gap-1.5">
          <span className="text-lg">⚡</span>
          <div>
            <span
              className="text-[0.35rem] block"
              style={{ fontFamily: '"Press Start 2P", monospace', color: theme.textMuted }}
            >
              BUYING PRESSURE
            </span>
            <motion.span
              className="text-sm font-bold"
              style={{
                fontFamily: '"VT323", monospace',
                fontSize: "1.05rem",
                color: pressureColor,
                textShadow: buyingPressure === "HIGH" ? `0 0 10px ${pressureColor}` : "none",
              }}
              animate={buyingPressure === "HIGH" ? { opacity: [1, 0.7, 1] } : {}}
              transition={{ repeat: Infinity, duration: 1.2 }}
            >
              {buyingPressure}
            </motion.span>
          </div>
        </div>
      </div>

      {/* Pulse glow when buying pressure is high */}
      {buyingPressure === "HIGH" && (
        <motion.div
          className="absolute inset-0 pointer-events-none rounded-md"
          style={{
            border: "2px solid rgba(0,255,65,0.3)",
          }}
          animate={{ opacity: [0, 0.5, 0] }}
          transition={{ repeat: Infinity, duration: 2 }}
        />
      )}
    </motion.div>
  );
}
