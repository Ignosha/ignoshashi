import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  getBondingCurvePrice,
  getGraduationProgress,
  GRADUATION_SUPPLY_THRESHOLD,
  BONDING_FEE_PCT,
  PLATFORM_FEE_SHARE,
  CREATOR_FEE_SHARE,
  type BondingCurveState,
} from "~/services/bondingCurve";

export interface BondingCurveStatsProps {
  curve: BondingCurveState;
  priceUp?: boolean;
  compact?: boolean;
}

export function BondingCurveStats({
  curve,
  priceUp = true,
  compact = false,
}: BondingCurveStatsProps) {
  const currentPrice = useMemo(() => getBondingCurvePrice(curve), [curve]);
  const supplyPct = useMemo(
    () => (curve.currentSupply / curve.totalSupply) * 100,
    [curve],
  );
  const progress = useMemo(() => getGraduationProgress(curve), [curve]);
  const currencySymbol = curve.blockchain === "solana" ? "SOL" : "ETH";

  // Graduation price
  const graduationPrice = useMemo(() => {
    const gradSupply = curve.totalSupply * GRADUATION_SUPPLY_THRESHOLD;
    const ratio = gradSupply / curve.totalSupply;
    return curve.basePrice + ratio * ratio * curve.maxPrice;
  }, [curve]);

  // Until graduation
  const supplyRemaining = useMemo(() => {
    const gradSupply = curve.totalSupply * GRADUATION_SUPPLY_THRESHOLD;
    return Math.max(0, gradSupply - curve.currentSupply);
  }, [curve]);

  // Remaining SOL/ETH to graduate (rough estimate using current price)
  const remainingCost = useMemo(
    () => supplyRemaining * currentPrice,
    [supplyRemaining, currentPrice],
  );

  // Current market cap
  const marketCap = useMemo(
    () => currentPrice * curve.currentSupply,
    [currentPrice, curve.currentSupply],
  );

  // Fee breakdown for a typical trade
  const examplePrice = currentPrice;
  const platformFee = examplePrice * BONDING_FEE_PCT * PLATFORM_FEE_SHARE;
  const creatorFee = examplePrice * BONDING_FEE_PCT * CREATOR_FEE_SHARE;

  const priceColor = priceUp ? "#00ff41" : "#ff4444";

  const formatPrice = (p: number) => {
    if (p < 0.00001) return p.toExponential(2);
    if (p < 0.001) return p.toFixed(8);
    return p.toFixed(6);
  };

  const formatSupply = (n: number) => {
    if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
    return n.toFixed(0);
  };

  if (compact) {
    return (
      <div className="space-y-1.5">
        <div className="flex justify-between items-center">
          <span
            className="text-[#b0d0b0]"
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: "0.35rem",
            }}
          >
            PRICE
          </span>
          <span
            style={{
              fontFamily: '"VT323", monospace',
              fontSize: "1rem",
              color: priceColor,
            }}
          >
            {formatPrice(currentPrice)} {currencySymbol}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span
            className="text-[#b0d0b0]"
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: "0.35rem",
            }}
          >
            PROGRESS
          </span>
          <span
            style={{
              fontFamily: '"VT323", monospace',
              fontSize: "1rem",
              color: "#00ff41",
            }}
          >
            {progress.toFixed(1)}%
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Current Price */}
      <motion.div
        className="p-3 rounded"
        style={{
          background: "rgba(0, 255, 65, 0.03)",
          border: "1px solid rgba(0, 255, 65, 0.1)",
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.05 }}
      >
        <span
          className="block text-[#6b8f6b] mb-1"
          style={{
            fontFamily: '"Press Start 2P", monospace',
            fontSize: "0.4rem",
          }}
        >
          CURRENT PRICE
        </span>
        <span
          className="block font-bold"
          style={{
            fontFamily: '"Press Start 2P", monospace',
            fontSize: "0.9rem",
            color: priceColor,
          }}
        >
          {formatPrice(currentPrice)} {currencySymbol}
        </span>
      </motion.div>

      {/* Supply Sold + Progress Bar */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
      >
        <div className="flex justify-between mb-1">
          <span
            className="text-[#6b8f6b]"
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: "0.4rem",
            }}
          >
            SUPPLY SOLD
          </span>
          <span
            style={{
              fontFamily: '"VT323", monospace',
              fontSize: "1rem",
              color: "#00ff41",
            }}
          >
            {supplyPct.toFixed(1)}% of {formatSupply(curve.totalSupply)}
          </span>
        </div>
        <div className="w-full h-3 rounded overflow-hidden" style={{ background: "rgba(0,255,65,0.1)", border: "1px solid rgba(0,255,65,0.2)" }}>
          <motion.div
            className="h-full rounded"
            style={{ background: "linear-gradient(90deg, #00ff41, #00cc33)" }}
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(supplyPct, 100)}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
        </div>
        {/* Graduation marker at 80% */}
        <div className="relative w-full h-1 mt-0.5">
          <div
            className="absolute top-0"
            style={{ left: `${GRADUATION_SUPPLY_THRESHOLD * 100}%` }}
          >
            <span
              style={{
                fontFamily: '"Press Start 2P", monospace',
                fontSize: "0.3rem",
                color: "#ffd23f",
              }}
            >
              🌙
            </span>
          </div>
        </div>
      </motion.div>

      {/* Until Graduation */}
      <motion.div
        className="p-3 rounded"
        style={{
          background: "rgba(255, 210, 63, 0.05)",
          border: "1px solid rgba(255, 210, 63, 0.15)",
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15 }}
      >
        <span
          className="block text-[#6b8f6b] mb-1"
          style={{
            fontFamily: '"Press Start 2P", monospace',
            fontSize: "0.4rem",
          }}
        >
          UNTIL GRADUATION 🌙
        </span>
        {curve.graduated ? (
          <span
            className="block font-bold"
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: "0.55rem",
              color: "#ffd23f",
            }}
          >
            🎓 GRADUATED!
          </span>
        ) : (
          <>
            <span
              className="block"
              style={{
                fontFamily: '"VT323", monospace',
                fontSize: "1.1rem",
                color: "#ffd23f",
              }}
            >
              {supplyPct >= GRADUATION_SUPPLY_THRESHOLD * 100
                ? "PRICE TARGET REACHED!"
                : `${remainingCost < 0.01 ? remainingCost.toExponential(2) : remainingCost.toFixed(4)} ${currencySymbol} needed`}
            </span>
            <span
              className="block"
              style={{
                fontFamily: '"VT323", monospace',
                fontSize: "0.9rem",
                color: "#b0a050",
              }}
            >
              {supplyPct >= GRADUATION_SUPPLY_THRESHOLD * 100
                ? ""
                : `${((GRADUATION_SUPPLY_THRESHOLD * 100) - supplyPct).toFixed(1)}% to moon`}
            </span>
          </>
        )}
      </motion.div>

      {/* Graduation Price */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        <div className="flex justify-between">
          <span
            className="text-[#6b8f6b]"
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: "0.4rem",
            }}
          >
            GRADUATION PRICE
          </span>
          <span
            style={{
              fontFamily: '"VT323", monospace',
              fontSize: "1rem",
              color: "#ffd23f",
            }}
          >
            {formatPrice(graduationPrice)} {currencySymbol}
          </span>
        </div>
      </motion.div>

      {/* Market Cap */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.25 }}
      >
        <div className="flex justify-between">
          <span
            className="text-[#6b8f6b]"
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: "0.4rem",
            }}
          >
            MARKET CAP
          </span>
          <span
            style={{
              fontFamily: '"VT323", monospace',
              fontSize: "1rem",
              color: "#e0ffe0",
            }}
          >
            {marketCap < 0.01
              ? marketCap.toExponential(2)
              : marketCap.toFixed(4)}{" "}
            {currencySymbol}
          </span>
        </div>
      </motion.div>

      {/* Fee Breakdown */}
      <div
        className="p-2 rounded space-y-1"
        style={{
          background: "rgba(0,0,0,0.2)",
          border: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <span
          className="block text-[#6b8f6b] mb-1"
          style={{
            fontFamily: '"Press Start 2P", monospace',
            fontSize: "0.35rem",
          }}
        >
          FEE BREAKDOWN (per token)
        </span>
        <div className="flex justify-between">
          <span
            style={{
              fontFamily: '"VT323", monospace',
              fontSize: "0.85rem",
              color: "#b0d0b0",
            }}
          >
            Platform Fee ({(BONDING_FEE_PCT * PLATFORM_FEE_SHARE * 100).toFixed(1)}
            %)
          </span>
          <span
            style={{
              fontFamily: '"VT323", monospace',
              fontSize: "0.85rem",
              color: "#e0ffe0",
            }}
          >
            {formatPrice(platformFee)} {currencySymbol}
          </span>
        </div>
        <div className="flex justify-between">
          <span
            style={{
              fontFamily: '"VT323", monospace',
              fontSize: "0.85rem",
              color: "#b0d0b0",
            }}
          >
            Creator Fee ({(BONDING_FEE_PCT * CREATOR_FEE_SHARE * 100).toFixed(1)}
            %)
          </span>
          <span
            style={{
              fontFamily: '"VT323", monospace',
              fontSize: "0.85rem",
              color: "#e0ffe0",
            }}
          >
            {formatPrice(creatorFee)} {currencySymbol}
          </span>
        </div>
      </div>

      {/* Creator Earnings */}
      <motion.div
        className="p-3 rounded"
        style={{
          background: "rgba(6, 214, 160, 0.05)",
          border: "1px solid rgba(6, 214, 160, 0.15)",
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        <span
          className="block text-[#6b8f6b] mb-1"
          style={{
            fontFamily: '"Press Start 2P", monospace',
            fontSize: "0.4rem",
          }}
        >
          CREATOR EARNINGS
        </span>
        <span
          className="block font-bold"
          style={{
            fontFamily: '"VT323", monospace',
            fontSize: "1.2rem",
            color: "#06d6a0",
          }}
        >
          {curve.creatorEarnings < 0.00001
            ? curve.creatorEarnings.toExponential(2)
            : curve.creatorEarnings.toFixed(6)}{" "}
          {currencySymbol}
        </span>
        <span
          className="block"
          style={{
            fontFamily: '"VT323", monospace',
            fontSize: "0.85rem",
            color: "#b0d0b0",
          }}
        >
          from {curve.tradeHistory.length} trades
        </span>
      </motion.div>
    </div>
  );
}
