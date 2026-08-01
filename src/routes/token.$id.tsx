import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { Line, Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Filler,
  Tooltip,
  Legend,
} from "chart.js";
import { Card } from "~/components/UI";
import {
  getTokens,
  getBondingCurveState,
  saveBondingCurveState,
  getComments,
  addComment,
  addTrade,

  getTradesForToken,
  fetchTradesFromServer,
  updateTokenPrice,
  type TokenData,
  type CommentData,
  isTokenVerified,
  deleteToken,
} from "~/services/tracker";
import {
  getBondingCurvePrice,
  executeBuySimulated,
  executeSellSimulated,
  executeBuyOnChain,
  executeSellOnChain,
  getGraduationProgress,
  getBuyTotal,
  getBuyFeeBreakdown,
  getSellFeeBreakdown,
  applyBuyToState,
  applySellToState,
  type BondingCurveState,
} from "~/services/bondingCurve";
import { sendBondingCurveTransaction, calculateFeeBreakdown, buyFromBondingCurve, sellFromBondingCurve } from "~/services/walletTransactions";
import { graduateToken, type DeployProgress } from "~/services/bondingCurveDeploy";
import { DeployModal } from "~/components/DeployModal";
import { TransactionModal, type TransactionModalState } from "~/components/TransactionModal";
import { useWallet, truncateAddress } from "~/context/WalletContext";
import { useCoinRain } from "~/context/CoinRainContext";
import { sanitizeText } from "~/utils/sanitize";
import { PriceAlertModal } from "~/components/PriceAlertModal";
import { getAlertsForToken } from "~/services/priceAlerts";
import { checkAchievements, recordHoldStart, recordHoldEnd } from "~/services/achievements";
import { useAchievements } from "~/context/AchievementContext";
import { VideoEmbed } from "~/components/VideoEmbed";
import { OnChainTxHistory } from "~/components/OnChainTxHistory";
import { FOMOTimer } from "~/components/FOMOTimer";
import { WatchlistToggle } from "~/components/WatchlistToggle";
import { fetchDexPrice, type DexPriceResult } from "~/services/dexPrices";
import { BondingCurveChart } from "~/components/BondingCurveChart";
import { BondingCurveStats } from "~/components/BondingCurveStats";
import GameCandlestickChart, { type Timeframe, TIMEFRAME_MS } from "~/components/GameCandlestickChart";
import { aggregateOHLC, type OHLCData } from "~/utils/aggregateOHLC";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Filler, Tooltip, Legend);

import { useUsdPrice, formatUsd } from "~/hooks/useUsdPrice";
import { useBondingCurveTrade } from "~/hooks/useBondingCurveTrade";
export const Route = createFileRoute("/token/$id")({
  component: TokenDetailPage,
});

function formatCompact(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  if (n >= 1) return n.toFixed(2);
  return n.toFixed(6);
}

function getTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/* ─── Price History Chart ─────────────────────── */

function PriceHistoryChart({
  token,
  curve,
}: {
  token: TokenData;
  curve: BondingCurveState | undefined;
}) {
  const hist = token.priceHistory;

  // Build OHLCV mock candles from price history
  // Each candle uses 4 consecutive price points: O=first, H=max, L=min, C=last
  const candleData = useMemo(() => {
    const candles: { o: number; h: number; l: number; c: number; v: number }[] = [];
    if (hist.length < 2) return candles;

    // Group history into sets of 4 to create candles
    for (let i = 0; i < hist.length; i += 4) {
      const group = hist.slice(i, i + 4);
      if (group.length < 2) continue;
      const o = group[0];
      const c = group[group.length - 1];
      const h = Math.max(...group);
      const l = Math.min(...group);
      const v = Math.random() * 1000 + 100; // Estimated volume
      candles.push({ o, h, l, c, v });
    }
    return candles.slice(-30); // Last 30 candles
  }, [hist]);

  if (candleData.length === 0) {
    return (
      <div className="retro-card p-8 text-center">
        <p className="text-3xl mb-3">📊</p>
        <p
          className="text-[#00ff41]"
          style={{
            fontFamily: '"Press Start 2P", monospace',
            fontSize: "0.5rem",
          }}
        >
          AWAITING MARKET DATA...
        </p>
        <p
          className="text-[#b0d0b0] mt-2"
          style={{ fontFamily: '"VT323", monospace', fontSize: "0.95rem" }}
        >
          Candlestick data will appear once trading begins
        </p>
      </div>
    );
  }

  const labels = candleData.map((_, i) => `#${i + 1}`);

  // Price line chart
  const priceData = {
    labels,
    datasets: [
      {
        label: "Close",
        data: candleData.map((c) => c.c),
        borderColor: "#00ff41",
        backgroundColor: "rgba(0, 255, 65, 0.05)",
        fill: true,
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.3,
      },
    ],
  };

  // Volume bar chart
  const volumeData = {
    labels,
    datasets: [
      {
        label: "Volume",
        data: candleData.map((c) => c.v),
        backgroundColor: candleData.map((c) =>
          c.c >= c.o ? "rgba(0, 255, 65, 0.25)" : "rgba(255, 68, 68, 0.25)"
        ),
        borderColor: candleData.map((c) =>
          c.c >= c.o ? "rgba(0, 255, 65, 0.5)" : "rgba(255, 68, 68, 0.5)"
        ),
        borderWidth: 1,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        display: false,
      },
      y: {
        grid: { color: "rgba(0, 255, 65, 0.05)" },
        ticks: {
          color: "#b0d0b0",
          font: { family: "VT323", size: 11 },
          callback: (v: number) => `$${v < 0.001 ? v.toFixed(6) : v.toFixed(4)}`,
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
        titleFont: { family: "Press Start 2P", size: 8 },
        bodyColor: "#e0ffe0",
        bodyFont: { family: "VT323", size: 14 },
        callbacks: {
          label: (ctx: any) => {
            const i = ctx.dataIndex;
            const c = candleData[i];
            return [
              `O: $${c.o.toFixed(6)}`,
              `H: $${c.h.toFixed(6)}`,
              `L: $${c.l.toFixed(6)}`,
              `C: $${c.c.toFixed(6)}`,
              `Vol: ${c.v.toFixed(0)}`,
            ];
          },
        },
      },
    },
  };

  return (
    <div>
      {/* Price chart */}
      <div className="h-48 mb-2">
        <Line data={priceData} options={chartOptions as any} />
      </div>
      {/* Volume */}
      <div className="h-16">
        <Bar
          data={volumeData}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              x: { display: false },
              y: {
                display: false,
              },
            },
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
          }}
        />
      </div>
    </div>
  );
}

/* ─── Bonding Curve Panel ────────────────────── */

function BondingCurvePanel({
  token,
  curve,
  onRefresh,
}: {
  token: TokenData;
  curve: BondingCurveState;
  onRefresh: () => void;
}) {
  const { connected, solAddress, ethAddress, connect, isConnectedOnChain, getAddressForChain } = useWallet();
  const { triggerRain, triggerGraduation } = useCoinRain();
  const { triggerToast } = useAchievements();
  const trade = useBondingCurveTrade();
  const [buyAmount, setBuyAmount] = useState("1000");
  const usdPrices = useUsdPrice();
  const [sellAmount, setSellAmount] = useState("100");
  const [buyTab, setBuyTab] = useState<"buy" | "sell">("buy");
  const [message, setMessage] = useState("");
  const graduationTriggeredRef = useRef(false);

  // Detect graduation on initial load / refresh
  useEffect(() => {
    if (curve.graduated && !graduationTriggeredRef.current) {
      graduationTriggeredRef.current = true;
      triggerGraduation();
    }
  }, [curve.graduated, triggerGraduation]);

  const currentPrice = getBondingCurvePrice(curve);
  const progress = getGraduationProgress(curve);
  const currencySymbol = curve.blockchain === "solana" ? "SOL" : "ETH";

  const buyQuote = (() => {
    try {
      const amt = parseInt(buyAmount) || 0;
      if (amt <= 0) return null;
      return getBuyTotal(curve, amt);
    } catch {
      return null;
    }
  })();

  const sellQuote = (() => {
    try {
      const amt = parseInt(sellAmount) || 0;
      if (amt <= 0) return null;
      const price = getBondingCurvePrice(curve);
      const actualAmt = Math.min(amt, curve.currentSupply);
      return {
        price,
        total: price * actualAmt,
        fee: price * actualAmt * 0.01,
        totalAfterFee: price * actualAmt * 0.99,
      };
    } catch {
      return null;
    }
  })();

  const userWallet =
    curve.blockchain === "solana" ? solAddress : ethAddress;
  const isWalletConnected = isConnectedOnChain(curve.blockchain);
  const isProcessing = trade.status !== "idle";

  // Derive TransactionModal state from hook
  const txModal: TransactionModalState = {
    open: trade.status !== "idle",
    type: buyTab === "buy" ? "BUY" : "SELL",
    tokenTicker: token.ticker,
    chain: curve.blockchain,
    amount: buyTab === "buy" ? buyAmount : sellAmount,
    step: trade.status === "idle" ? "preparing" : (trade.status as any),
    stepMessage: trade.stepLabel,
    txHash: trade.txHash || "",
    error: trade.error || "",
  };

  const handleBuy = async () => {
    const amt = parseInt(buyAmount);
    if (!amt || amt <= 0) return;

    const result = await trade.buy({ tokenId: token.id, amount: amt, tokenTicker: token.ticker });

    if (result.success) {
      setBuyAmount("");
      setMessage(`✅ Bought ${token.ticker}!`);
      triggerRain();
      checkAchievements(getAddressForChain(curve.blockchain) || "anon", triggerToast);
      onRefresh();
      // Check graduation after buy
      const updatedCurve = getBondingCurveState(token.id);
      if (updatedCurve?.graduated) {
        triggerGraduation();
        setMessage("🎓 TOKEN GRADUATED! Trading moves to DEX.");
      }
      if (trade.txHash) {
        setMessage((prev) => prev + ` TX: ${trade.txHash.slice(0, 10)}...`);
      }
    } else {
      setMessage(`❌ ${result.error || "Transaction failed"}`);
    }
    setTimeout(() => setMessage(""), 6000);
  };

  const handleSell = async () => {
    const amt = parseInt(sellAmount);
    if (!amt || amt <= 0) return;

    const result = await trade.sell({ tokenId: token.id, amount: amt, tokenTicker: token.ticker });

    if (result.success) {
      setSellAmount("");
      setMessage(`✅ Sold ${token.ticker}!`);
      checkAchievements(getAddressForChain(curve.blockchain) || "anon", triggerToast);
      onRefresh();
      if (trade.txHash) {
        setMessage((prev) => prev + ` Received ${sellQuote?.totalAfterFee.toFixed(6) || "?"} ${currencySymbol}`);
      }
    } else {
      setMessage(`❌ ${result.error || "Transaction failed"}`);
    }
    setTimeout(() => setMessage(""), 6000);
  };
  if (curve.graduated) {
    return (
      <Card>
        <div className="text-center py-4">
          <p className="text-4xl mb-3">🎓</p>
          <p
            className="text-[#00ff41] mb-2"
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: "0.55rem",
            }}
          >
            GRADUATED!
          </p>
          <p
            className="text-[#e0ffe0] mb-3"
            style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
          >
            This token has graduated to{" "}
            {curve.blockchain === "solana" ? "Raydium" : "Uniswap"}
          </p>
          <a
            href={
              curve.blockchain === "solana"
                ? `https://raydium.io/swap/?inputMint=sol&outputMint=${token.tokenAddress || ""}`
                : `https://app.uniswap.org/#/swap?outputCurrency=${token.tokenAddress || ""}`
            }
            target="_blank"
            rel="noopener noreferrer"
            className="retro-btn retro-btn-turquoise inline-flex text-[0.45rem] px-4 py-2"
            style={{ fontFamily: '"Press Start 2P", monospace' }}
          >
            ↗ TRADE ON{" "}
            {curve.blockchain === "solana" ? "RAYDIUM" : "UNISWAP"}
          </a>
          {curve.dexAddress && (
            <p
              className="text-[#b0d0b0] mt-2"
              style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem" }}
            >
              CA: {curve.dexAddress.slice(0, 8)}...
            </p>
          )}
        </div>
      </Card>
    );
  }

  return (
    <Card>
      {/* Bonding Curve Status */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span
            className="text-[#ffb83c] font-bold"
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: "0.4rem",
            }}
          >
            ⚡ BONDING CURVE
          </span>
          <span
            className="text-[#e0ffe0]"
            style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
          >
            {progress >= 90 ? (
              <span className="text-[#ff6b35] retro-blink">🔥 ALMOST THERE</span>
            ) : (
              <>{progress.toFixed(0)}% TO GRADUATION</>
            )}
          </span>
        </div>
        {/* FOMO Countdown */}
        {progress < 100 && (
          <div
            className="text-center mb-1"
            style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem", color: "#ffb83c" }}
          >
            {formatCompact(curve.totalSupply - curve.currentSupply)} {currencySymbol} until graduation 🎓
          </div>
        )}
        {/* Progress bar */}
        <div
          className="h-5 rounded-sm overflow-hidden mb-1 relative"
          style={{
            background: "#0d120d",
            border: "2px solid rgba(0,255,65,0.15)",
          }}
        >
          {/* Pulse overlay for >= 90% */}
          {progress >= 90 && (
            <div
              className="absolute inset-0 rounded-sm pointer-events-none"
              style={{
                animation: `fomoPulse ${Math.max(0.3, 2 - progress / 50).toFixed(1)}s ease-in-out infinite`,
                boxShadow: "inset 0 0 20px rgba(255,107,53,0.5)",
              }}
            />
          )}
          <motion.div
            className="h-full flex items-center justify-end pr-2 relative z-[1]"
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(progress, 100)}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            style={{
              background:
                progress >= 90
                  ? "linear-gradient(90deg, #ef476f, #ff6b35)"
                  : progress >= 80
                    ? "linear-gradient(90deg, #00ff41, #39ff14)"
                    : progress >= 50
                      ? "linear-gradient(90deg, #ffb83c, #ffd700)"
                      : "linear-gradient(90deg, #ff6b35, #ffb347)",
              boxShadow: progress >= 90
                ? "0 0 15px rgba(239,71,111,0.6)"
                : progress >= 80
                  ? "0 0 10px rgba(0,255,65,0.4)"
                  : "none",
            }}
          >
            <span
              className="text-[0.35rem] font-bold"
              style={{
                fontFamily: '"Press Start 2P", monospace',
                color: progress >= 50 ? "#050505" : "#ffffff",
              }}
            >
              {progress >= 5 ? `${progress.toFixed(0)}%` : ""}
            </span>
          </motion.div>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span
            className="text-[#b0d0b0]"
            style={{ fontFamily: '"VT323", monospace', fontSize: "0.85rem" }}
          >
            {formatCompact(curve.currentSupply)}/{formatCompact(curve.totalSupply)}{" "}
            tokens
          </span>
          <span
            className="text-[#b0d0b0]"
            style={{ fontFamily: '"VT323", monospace', fontSize: "0.85rem" }}
          >
            🎓 at {formatCompact(curve.totalSupply * 0.8)}
          </span>
        </div>
      </div>

      {/* Current Price */}
      <div className="flex items-center justify-between mb-4 p-3 rounded-md bg-[rgba(0,255,65,0.03)] border border-[rgba(0,255,65,0.1)]">
        <span
          className="text-[#b0d0b0]"
          style={{
            fontFamily: '"Press Start 2P", monospace',
            fontSize: "0.4rem",
          }}
        >
          CUR PRICE
        </span>
        <span
          className="font-bold text-[#00ff41]"
          style={{ fontFamily: '"VT323", monospace', fontSize: "1.3rem" }}
        >
          {currentPrice < 0.0001
            ? currentPrice.toFixed(8)
            : currentPrice.toFixed(6)}{" "}
          {currencySymbol}
        </span>
      </div>

      {/* Creator Earnings */}
      {curve.creatorEarnings > 0 && (
        <div className="flex items-center justify-between mb-4 text-xs">
          <span
            className="text-[#b0d0b0]"
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: "0.35rem",
            }}
          >
            CREATOR EARNINGS
          </span>
          <span
            className="text-[#00ff41] font-bold"
            style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
          >
            {curve.creatorEarnings.toFixed(6)} {currencySymbol}
          </span>
        </div>
      )}

      {/* Buy/Sell Tabs */}
      <div className="flex gap-1 mb-3">
        <button
          onClick={() => setBuyTab("buy")}
          className={`flex-1 py-1.5 rounded font-bold text-[0.4rem] ${
            buyTab === "buy" ? "retro-tab-active" : "retro-tab"
          }`}
          style={{ fontFamily: '"Press Start 2P", monospace' }}
        >
          BUY
        </button>
        <button
          onClick={() => setBuyTab("sell")}
          className={`flex-1 py-1.5 rounded font-bold text-[0.4rem] ${
            buyTab === "sell" ? "retro-tab-active" : "retro-tab"
          }`}
          style={{ fontFamily: '"Press Start 2P", monospace' }}
        >
          SELL
        </button>
      </div>

      {/* Chain indicator */}
      <div className="flex items-center justify-center gap-2 mb-2 py-1 px-2 rounded" style={{background: "rgba(0,255,65,0.05)", border: "1px solid rgba(0,255,65,0.1)"}}>
        <span className="text-[#b0d0b0]" style={{fontFamily: '"Press Start 2P", monospace', fontSize: "0.3rem"}}>⛓ TRADES ON</span>
        <span className="font-bold text-[#00ff41]" style={{fontFamily: '"VT323", monospace', fontSize: "0.9rem"}}>{curve.blockchain === "solana" ? "SOLANA" : "ETHEREUM"}</span>
      </div>
      {/* Wrong chain warning */}
      {!isWalletConnected && (
        <div className="mb-2 p-2 rounded text-center" style={{background: "rgba(255,180,60,0.08)", border: "1px solid rgba(255,180,60,0.2)"}}>
          <span className="text-[#ffb83c]" style={{fontFamily: '"VT323", monospace', fontSize: "0.85rem"}}>⚠ Connect your {curve.blockchain === "solana" ? "Solana" : "Ethereum"} wallet to trade</span>
        </div>
      )}

      {buyTab === "buy" ? (
        <div className="space-y-2">
          <div>
            <label
              className="text-[#b0d0b0] mb-1 block"
              style={{
                fontFamily: '"Press Start 2P", monospace',
                fontSize: "0.35rem",
              }}
            >
              AMOUNT ({token.ticker})
            </label>
            <input
              type="number"
              value={buyAmount}
              onChange={(e) => setBuyAmount(e.target.value)}
              placeholder="1000"
              className="retro-input w-full"
              style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
            />
          </div>
          {buyQuote && (
            <div className="text-xs space-y-0.5 p-2 rounded bg-[rgba(0,255,65,0.03)]">
              <div
                className="flex justify-between text-[#e0ffe0]"
                style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem" }}
              >
                <span>Avg Price:</span>
                <span>{buyQuote.avgPrice.toFixed(8)} {currencySymbol}</span>{" "}<span className="text-[#b0d0b0]" style={{fontFamily: '"VT323", monospace', fontSize: "0.8rem"}}>(~{formatUsd(buyQuote.avgPrice * (token.blockchain === "solana" ? usdPrices.sol : usdPrices.eth))})</span>
              </div>
              <div
                className="flex justify-between text-[#e0ffe0]"
                style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem" }}
              >
                <span>Cost:</span>
                <span>{buyQuote.totalCost.toFixed(6)} {currencySymbol}</span>{" "}<span className="text-[#b0d0b0]" style={{fontFamily: '"VT323", monospace', fontSize: "0.8rem"}}>(~{formatUsd(buyQuote.totalCost * (token.blockchain === "solana" ? usdPrices.sol : usdPrices.eth))})</span>
              </div>
              <div
                className="flex justify-between text-[#ffb83c]"
                style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem" }}
              >
                <span>Fee (1%):</span>
                <span>{buyQuote.fee.toFixed(6)} {currencySymbol}</span>{" "}<span className="text-[#b0d0b0]" style={{fontFamily: '"VT323", monospace', fontSize: "0.8rem"}}>(~{formatUsd(buyQuote.fee * (token.blockchain === "solana" ? usdPrices.sol : usdPrices.eth))})</span>
              </div>
              <div
                className="flex justify-between text-[#00ff41] font-bold"
                style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
              >
                <span>Total:</span>
                <span>{buyQuote.totalWithFee.toFixed(6)} {currencySymbol}</span>{" "}<span className="text-[#b0d0b0]" style={{fontFamily: '"VT323", monospace', fontSize: "0.8rem"}}>(~{formatUsd(buyQuote.totalWithFee * (token.blockchain === "solana" ? usdPrices.sol : usdPrices.eth))})</span>
              </div>
            </div>
          )}
          <button
            onClick={handleBuy}
            disabled={isProcessing}
            className="retro-btn retro-btn-turquoise w-full justify-center text-[0.45rem] py-2"
            style={{ fontFamily: '"Press Start 2P", monospace' }}
          >
            {isProcessing ? "PENDING..." 
              : isWalletConnected
                ? `BUY ${token.ticker}`
                : "CONNECT WALLET"}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div>
            <label
              className="text-[#b0d0b0] mb-1 block"
              style={{
                fontFamily: '"Press Start 2P", monospace',
                fontSize: "0.35rem",
              }}
            >
              AMOUNT ({token.ticker})
            </label>
            <input
              type="number"
              value={sellAmount}
              onChange={(e) => setSellAmount(e.target.value)}
              placeholder="100"
              className="retro-input w-full"
              style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
            />
          </div>
          {sellQuote && (
            <div className="text-xs space-y-0.5 p-2 rounded bg-[rgba(255,68,68,0.03)]">
              <div
                className="flex justify-between text-[#e0ffe0]"
                style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem" }}
              >
                <span>Price:</span>
                <span>{sellQuote.price.toFixed(8)} {currencySymbol}</span>{" "}<span className="text-[#b0d0b0]" style={{fontFamily: '"VT323", monospace', fontSize: "0.8rem"}}>(~{formatUsd(sellQuote.price * (token.blockchain === "solana" ? usdPrices.sol : usdPrices.eth))})</span>
              </div>
              <div
                className="flex justify-between text-[#ffb83c]"
                style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem" }}
              >
                <span>Fee (1%):</span>
                <span>{sellQuote.fee.toFixed(6)} {currencySymbol}</span>{" "}<span className="text-[#b0d0b0]" style={{fontFamily: '"VT323", monospace', fontSize: "0.8rem"}}>(~{formatUsd(sellQuote.fee * (token.blockchain === "solana" ? usdPrices.sol : usdPrices.eth))})</span>
              </div>
              <div
                className="flex justify-between text-[#00ff41] font-bold"
                style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
              >
                <span>You receive:</span>
                <span>
                  {sellQuote.totalAfterFee.toFixed(6)} {currencySymbol}{" "}<span className="text-[#b0d0b0]" style={{fontFamily: '"VT323", monospace', fontSize: "0.8rem"}}>(~{formatUsd(sellQuote.totalAfterFee * (token.blockchain === "solana" ? usdPrices.sol : usdPrices.eth))})</span>
                </span>
              </div>
            </div>
          )}
          <button
            onClick={handleSell}
            disabled={isProcessing}
            className="retro-btn retro-btn-pink w-full justify-center text-[0.45rem] py-2"
            style={{ fontFamily: '"Press Start 2P", monospace' }}
          >
            {isProcessing ? "PENDING..." 
              : isWalletConnected
                ? `SELL ${token.ticker}`
                : "CONNECT WALLET"}
          </button>
        </div>
      )}

      {/* Message */}
      {message && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-3 p-2 rounded text-center font-bold"
          style={{
            background: message.startsWith("✅")
              ? "rgba(0,255,65,0.08)"
              : message.startsWith("❌")
                ? "rgba(255,68,68,0.08)"
                : "rgba(255,180,60,0.08)",
            border: `1px solid ${
              message.startsWith("✅")
                ? "rgba(0,255,65,0.2)"
                : message.startsWith("❌")
                  ? "rgba(255,68,68,0.2)"
                  : "rgba(255,180,60,0.2)"
            }`,
          }}
        >
          <span
            className="text-[#e0ffe0]"
            style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
          >
            {message}
          </span>
        </motion.div>
      )}

      {/* Transaction Modal */}
      <TransactionModal
        state={txModal}
        onClose={() => trade.reset()}
      />
    </Card>
  );
}

/* ─── Comment Section ────────────────────────── */

function CommentSection({ tokenId }: { tokenId: string }) {
  const { connected, solAddress, ethAddress } = useWallet();
  const [comments, setComments] = useState<CommentData[]>([]);
  const [newComment, setNewComment] = useState("");
  const [posting, setPosting] = useState(false);
  const [visibleCount, setVisibleCount] = useState(50);

  useEffect(() => {
    setComments(getComments(tokenId));
    const interval = setInterval(() => setComments(getComments(tokenId)), 5000);
    return () => clearInterval(interval);
  }, [tokenId]);

  const handlePost = async () => {
    const cleaned = sanitizeText(newComment, 500);
    if (!cleaned) return;
    setPosting(true);
    await new Promise((r) => setTimeout(r, 400));

    const walletAddr = solAddress || ethAddress || "anon";
    addComment({
      tokenId,
      wallet: truncateAddress(walletAddr),
      message: cleaned,
      timestamp: Date.now(),
    });

    setNewComment("");
    setComments(getComments(tokenId));
    setPosting(false);
  };

  const visibleComments = comments.slice(0, visibleCount);

  return (
    <Card>
      <h3
        className="text-[#00ff41] mb-4"
        style={{
          fontFamily: '"Press Start 2P", monospace',
          fontSize: "0.5rem",
        }}
      >
        💬 DISCUSSION ({comments.length})
      </h3>

      {/* Input */}
      <div className="mb-4 space-y-2">
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="What do you think about this coin?"
          rows={3}
          maxLength={500}
          className="retro-textarea w-full"
          style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
        />
        <div className="flex items-center justify-between">
          <span
            className="text-[#b0d0b0]"
            style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem" }}
          >
            {newComment.length}/500
          </span>
          <button
            onClick={handlePost}
            disabled={!newComment.trim() || posting}
            className="retro-btn retro-btn-turquoise text-[0.4rem] px-3 py-1.5"
            style={{ fontFamily: '"Press Start 2P", monospace' }}
          >
            {posting ? "POSTING..." : "POST"}
          </button>
        </div>
      </div>

      {/* Comments list */}
      {visibleComments.length === 0 ? (
        <div className="text-center py-4">
          <p
            className="text-[#b0d0b0]"
            style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
          >
            No comments yet. Start the discussion!
          </p>
        </div>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar">
          {visibleComments.map((c, i) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, x: -5 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: Math.min(i * 0.02, 0.3) }}
              className="p-2 rounded-md"
              style={{
                background: "rgba(0,255,65,0.02)",
                border: "1px solid rgba(0,255,65,0.08)",
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="text-[#00ff41] font-bold"
                  style={{
                    fontFamily: '"Press Start 2P", monospace',
                    fontSize: "0.35rem",
                  }}
                >
                  {c.wallet}
                </span>
                <span
                  className="text-[#b0d0b0]"
                  style={{
                    fontFamily: '"VT323", monospace',
                    fontSize: "0.8rem",
                  }}
                >
                  {getTimeAgo(c.timestamp)}
                </span>
              </div>
              <p
                className="text-[#e0ffe0]"
                style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
              >
                {c.message}
              </p>
            </motion.div>
          ))}
        </div>
      )}

      {comments.length > visibleCount && (
        <button
          onClick={() => setVisibleCount((c) => c + 50)}
          className="retro-btn retro-btn-outline w-full mt-3 text-[0.4rem] py-1.5"
          style={{ fontFamily: '"Press Start 2P", monospace' }}
        >
          SHOW MORE
        </button>
      )}
    </Card>
  );
}

/* ─── Main Page ──────────────────────────────── */

function TokenDetailPage() {
  const { id } = Route.useParams();
  const { solAddress, ethAddress } = useWallet();
  const navigate = useNavigate();
  const { triggerToast } = useAchievements();
  const usdPrices = useUsdPrice();
  const [token, setToken] = useState<TokenData | undefined>(undefined);
  const [curve, setCurve] = useState<BondingCurveState | undefined>(undefined);
  const [notFound, setNotFound] = useState(false);
  const [deployModalOpen, setDeployModalOpen] = useState(false);
  const [alertModalOpen, setAlertModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"bonding" | "candlestick">("bonding");
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [hasActiveAlert, setHasActiveAlert] = useState(false);
  const [dexPrice, setDexPrice] = useState<DexPriceResult | null>(null);

  const refresh = () => {
    const tokens = getTokens();
    const t = tokens.find((x) => x.id === id);
    if (!t) {
      setNotFound(true);
      return;
    }
    setToken(t);
    const bc = getBondingCurveState(id);
    setCurve(bc);
    setHasActiveAlert(getAlertsForToken(id).length > 0);
  };

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [id]);

  useEffect(() => {
    if (!token?.tokenAddress || !token?.verified) return;
    let cancelled = false;
    const doFetch = async () => {
      try {
        const result = await fetchDexPrice(token.tokenAddress!, token.blockchain);
        if (!cancelled) setDexPrice(result);
      } catch {
        if (!cancelled) setDexPrice(null);
      }
    };
    doFetch();
    const interval = setInterval(doFetch, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [token?.tokenAddress, token?.blockchain, token?.verified]);

  const [chartTimeframe, setChartTimeframe] = useState<Timeframe>("1H");

  const [serverTrades, setServerTrades] = useState<any[]>([]);
  const [flashCandle, setFlashCandle] = useState(false);

  // Fetch trades from server API, fall back to localStorage, then simulated
  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    const load = async () => {
      // Try server first
      const serverData = await fetchTradesFromServer(token.id);
      if (!cancelled && serverData.length > 0) {
        setServerTrades(serverData);
        setFlashCandle(true);
        setTimeout(() => setFlashCandle(false), 300);
        return;
      }
      // Fall back to localStorage
      const localTrades = getTradesForToken(token.id);
      if (!cancelled && localTrades.length > 0) {
        setServerTrades(localTrades);
        return;
      }
      // No data - will trigger simulated in ohlcData
      if (!cancelled) setServerTrades([]);
    };

    load();

    // Poll every 5s
    const interval = setInterval(async () => {
      const serverData = await fetchTradesFromServer(token.id);
      if (!cancelled && serverData.length > 0) {
        setServerTrades((prev) => {
          // Only flash if we have new trades
          if (serverData.length > prev.length) {
            setFlashCandle(true);
            setTimeout(() => setFlashCandle(false), 300);
          }
          return serverData;
        });
      }
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [token?.id]);

  // OHLC aggregation from server trades + localStorage fallback
  const ohlcData = useMemo(() => {
    if (!token) return [];
    const timeframeMs = TIMEFRAME_MS[chartTimeframe];

    // Server trades take priority
    if (serverTrades.length > 0) {
      const candles = aggregateOHLC(serverTrades, timeframeMs);
      if (candles.length >= 2) return candles;
    }

    // LocalStorage fallback
    const localTrades = getTradesForToken(token.id);
    if (localTrades.length > 0) {
      const candles = aggregateOHLC(localTrades, timeframeMs);
      if (candles.length >= 2) return candles;
    }

        // No real trades exist -- return empty array for chart empty state
    return [];
  }, [token, chartTimeframe, serverTrades]);

  if (notFound) {
    return (
      <div className="min-h-dvh bg-[#050505] flex items-center justify-center">
        <div className="text-center">
          <p className="text-5xl mb-4">🔍</p>
          <h1
            className="text-[#00ff41] mb-4 pixel-shadow"
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: "1rem",
            }}
          >
            TOKEN NOT FOUND
          </h1>
          <p
            className="text-[#e0ffe0] mb-6"
            style={{ fontFamily: '"VT323", monospace', fontSize: "1.2rem" }}
          >
            This token does not exist or has been removed.
          </p>
          <Link to="/">
            <button
              className="retro-btn retro-btn-orange text-[0.55rem] px-6 py-3"
              style={{ fontFamily: '"Press Start 2P", monospace' }}
            >
              ← BACK TO VAULT
            </button>
          </Link>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="min-h-dvh bg-[#050505] flex items-center justify-center">
        <p
          className="text-[#00ff41] retro-blink"
          style={{
            fontFamily: '"Press Start 2P", monospace',
            fontSize: "0.7rem",
          }}
        >
          LOADING...
        </p>
      </div>
    );
  }

  const hist = token.priceHistory;
  const lastP = hist[hist.length - 1] || token.price;
  const prevP = hist[hist.length - 2] || lastP;
  const isUp = lastP >= prevP;
  const change = prevP ? ((lastP - prevP) / prevP) * 100 : 0;
  const currencySymbol = token.blockchain === "solana" ? "SOL" : "ETH";

  const canGraduate = curve && curve.graduated && !curve.dexAddress;

  const handleGraduate = async (
    onProgress: (progress: DeployProgress) => void,
  ): Promise<DeployProgress> => {
    if (!curve || !token) {
      return { step: "error", message: "Missing token data" };
    }
    return graduateToken(
      {
        curve,
        tokenName: token.name,
        tokenSymbol: token.ticker,
        tokenSupply: token.supply,
      },
      onProgress,
    );
  };

  const handleCopyLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    }).catch(() => {
      // Fallback
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    });
  };

  const handleShareX = () => {
    const url = encodeURIComponent(window.location.href);
    const text = encodeURIComponent(`Check out ${token?.ticker || ""} on ignoshashi! 🚀`);
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, "_blank");
  };

  const handleShareNative = () => {
    const url = window.location.href;
    if (navigator.share) {
      navigator.share({
        title: `${token?.name || ""} (${token?.ticker || ""}) on ignoshashi`,
        text: `Check out ${token?.ticker || ""} on ignoshashi!`,
        url,
      }).catch(() => handleCopyLink());
    } else {
      handleCopyLink();
    }
  };


  const walletAddress = solAddress || ethAddress;
  const isOwner = token && walletAddress && token.creator === walletAddress;

  const handleDelete = () => {
    if (!token) return;
    const success = deleteToken(token.id, walletAddress!);
    if (success) {
      setDeleteConfirmOpen(false);
      navigate({ to: "/" });
      if (triggerToast) {
        triggerToast(`🗑️ "${token.name}" has been deleted.`, "success");
      }
    }
  };
  return (
    <div className="min-h-dvh bg-[#050505] py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Breadcrumb */}
        <div className="mb-4">
          <Link
            to="/"
            className="text-[#b0d0b0] hover:text-[#00ff41] transition-colors"
            style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
          >
            ← Back to Vault
          </Link>
        </div>

        {/* Token Header */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-6">
          <div className="flex items-start gap-4">
            <div
              className="w-16 h-16 rounded-xl flex items-center justify-center shrink-0 overflow-hidden"
              style={{
                background: "#0d120d",
                border: "3px solid rgba(0,255,65,0.2)",
              }}
            >
              {token.image ? (
                <img
                  src={token.image}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <span
                  className="font-bold text-[#00ff41]"
                  style={{
                    fontFamily: '"Press Start 2P", monospace',
                    fontSize: "0.6rem",
                  }}
                >
                  {token.ticker.slice(0, 2)}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1
                  className="font-bold text-[#ffffff]"
                  style={{
                    fontFamily: '"Press Start 2P", monospace',
                    fontSize: "0.7rem",
                  }}
                >
                  {token.name}
                </h1>
                <span
                  className="text-[#e0ffe0]"
                  style={{
                    fontFamily: '"VT323", monospace',
                    fontSize: "1.2rem",
                  }}
                >
                  ${token.ticker}
                </span>
                {curve?.graduated && (
                  <span
                    className="px-2 py-0.5 rounded font-bold"
                    style={{
                      background: "rgba(0,255,65,0.1)",
                      border: "1px solid rgba(0,255,65,0.3)",
                      color: "#00ff41",
                      fontFamily: '"Press Start 2P", monospace',
                      fontSize: "0.35rem",
                    }}
                  >
                    🎓 GRADUATED
                  </span>
                )}
                {/* Verification Badge */}
                {(() => {
                  const verified = isTokenVerified(token);
                  if (verified) {
                    return (
                      <span
                        className="px-2 py-0.5 rounded font-bold"
                        style={{
                          background: "rgba(0,255,65,0.1)",
                          border: "1px solid rgba(0,255,65,0.3)",
                          color: "#00ff41",
                          fontFamily: '"Press Start 2P", monospace',
                          fontSize: "0.35rem",
                        }}
                      >
                        ✅ VERIFIED
                      </span>
                    );
                  }
                  return (
                    <span
                      className="px-2 py-0.5 rounded font-bold"
                      style={{
                        background: "rgba(255,170,0,0.1)",
                        border: "1px solid rgba(255,170,0,0.3)",
                        color: "#ffaa00",
                        fontFamily: '"Press Start 2P", monospace',
                        fontSize: "0.35rem",
                      }}
                    >
                      ⚠️ UNVERIFIED
                    </span>
                  );
                })()}
            <WatchlistToggle tokenId={token.id} size={16} className="ml-1" />
              </div>
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                {/* DEX price (real) or bonding curve price (fallback) */}
                {dexPrice ? (
                  <>
                    <span
                      className="font-bold text-[#00ff41]"
                      style={{
                        fontFamily: '"VT323", monospace',
                        fontSize: "1.3rem",
                      }}
                    >
                      ${dexPrice.price < 0.0001
                        ? dexPrice.price.toFixed(8)
                        : dexPrice.price.toFixed(6)}
                    </span>
                    <span
                      className="text-[0.35rem] px-1.5 py-0.5 rounded font-bold"
                      style={{
                        fontFamily: '"Press Start 2P", monospace',
                        background: "rgba(0,170,255,0.15)",
                        border: "1px solid rgba(0,170,255,0.3)",
                        color: "#0af",
                      }}
                    >
                      📡 {dexPrice.source.toUpperCase()}
                    </span>
                  </>
                ) : token.verified ? (
                  <span
                    className="font-bold text-[#ff8844]"
                    style={{
                      fontFamily: '"VT323", monospace',
                      fontSize: "1.1rem",
                    }}
                  >
                    Price unavailable
                  </span>
                ) : (
                  <span
                    className="font-bold text-[#00ff41]"
                    style={{
                      fontFamily: '"VT323", monospace',
                      fontSize: "1.3rem",
                    }}
                  >
                    {lastP < 0.0001
                      ? `${lastP.toFixed(8)} ${currencySymbol}`
                      : `${lastP.toFixed(6)} ${currencySymbol}`}
                  </span>
                )}
                <span
                  className="font-bold"
                  style={{
                    fontFamily: '"VT323", monospace',
                    fontSize: "1.1rem",
                    color: (dexPrice?.priceChange24h ?? (isUp ? 1 : -1)) >= 0 ? "#00ff41" : "#ff4444",
                  }}
                >
                  {(dexPrice?.priceChange24h ?? change) >= 0 ? "+" : ""}
                  {(dexPrice?.priceChange24h ?? change).toFixed(2)}%
                </span>
              </div>
              <div
                className="flex flex-wrap gap-x-4 gap-y-1 mt-2"
                style={{
                  fontFamily: '"VT323", monospace',
                  fontSize: "1rem",
                  color: "#e0ffe0",
                }}
              >
                <span>💰 MC: ${formatCompact(dexPrice?.fdv || token.marketCap)}</span>
                <span>📈 Vol 24h: ${formatCompact(dexPrice?.volume24h || token.volume24h)}</span>
                <span>💧 Liq: ${dexPrice?.liquidity ? formatCompact(dexPrice.liquidity) : "—"}</span>
                <span>🏷 Supply: {formatCompact(token.supply)}</span>
                <span>⛓ {token.blockchain === "solana" ? "Solana" : "Ethereum"}</span>
              </div>
              {token.tokenAddress && (
                <div
                  className="flex items-center gap-2 mt-1"
                  style={{
                    fontFamily: '"VT323", monospace',
                    fontSize: "0.9rem",
                    color: "#b0d0b0",
                  }}
                >
                  <span>📋 CA:</span>
                  <code
                    className="text-[#00ff41] cursor-pointer hover:text-[#55c859] transition-colors"
                    style={{
                      fontFamily: '"VT323", monospace',
                      fontSize: "0.9rem",
                      background: "rgba(0,255,65,0.05)",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      border: "1px solid rgba(0,255,65,0.15)",
                    }}
                    title="Click to copy contract address"
                    onClick={() => {
                      navigator.clipboard.writeText(token.tokenAddress || "");
                    }}
                  >
                    {token.tokenAddress.length > 20
                      ? `${token.tokenAddress.slice(0, 8)}...${token.tokenAddress.slice(-8)}`
                      : token.tokenAddress}
                  </code>
                </div>
              )}
              {token.description && (
                <p
                  className="text-[#b0d0b0] mt-2"
                  style={{
                    fontFamily: '"VT323", monospace',
                    fontSize: "1rem",
                  }}
                >
                  {token.description}
                </p>
              )}
              {/* Video Embed */}
              {token.videoUrl && <VideoEmbed videoUrl={token.videoUrl} />}
              <div
                className="flex items-center gap-2 mt-2 text-xs"
                style={{
                  fontFamily: '"VT323", monospace',
                  fontSize: "0.9rem",
                  color: "#b0d0b0",
                }}
              >
                <span>Created by: {token.creator}</span> <WatchlistToggle creatorAddress={token.creator} size={14} />
                <span>·</span>
                <span>{getTimeAgo(token.createdAt)}</span>
                {/* Report Button */}
                <span className="ml-auto">
                  <button
                    onClick={() => {
                      const reportInfo = 'Token: ' + token.name + ' (' + token.ticker + ') | ID: ' + token.id + ' | URL: ' + (typeof window !== 'undefined' ? window.location.href : '');
                      if (typeof navigator !== 'undefined' && navigator.clipboard) {
                        navigator.clipboard.writeText(reportInfo).then(function() { alert('Token info copied! Report it to our moderators on Discord.'); });
                      } else {
                        alert('Report info: ' + reportInfo);
                      }
                    }}
                    className="text-[#ff6b6b] hover:text-[#ff4444] text-xs underline"
                    style={{ fontFamily: '"VT323", monospace', fontSize: "0.85rem" }}
                    title="Report this token"
                  >
                    🚩 REPORT
                  </button>
                {/* Delete Button - only visible to token creator */}
                {isOwner && (
                  <span>
                    <button
                      onClick={() => setDeleteConfirmOpen(true)}
                      className="retro-btn retro-btn-pink text-[0.35rem] px-2 py-1"
                      style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.35rem" }}
                      title="Delete this token"
                    >
                      🗑️ DELETE
                    </button>
                  </span>
                )}
                </span>
              </div>

              {/* Graduate Button */}
              {canGraduate && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-3"
                >
                  <button
                    onClick={() => setDeployModalOpen(true)}
                    className="retro-btn retro-btn-orange neon-glow-yellow text-[0.45rem] px-4 py-2"
                    style={{ fontFamily: '"Press Start 2P", monospace' }}
                  >
                    🚀 GRADUATE TOKEN
                  </button>
                  <p
                    className="text-[#ffb83c] mt-1"
                    style={{ fontFamily: '"VT323", monospace', fontSize: "0.85rem" }}
                  >
                    This token is ready to graduate to{" "}
                    {curve?.blockchain === "solana" ? "Raydium" : "Uniswap"}.
                    Deploy the real contract to complete graduation.
                  </p>
                </motion.div>
              )}

              {/* Share Bar */}
              <div className="flex items-center gap-2 mt-4 pt-3 border-t border-[rgba(0,255,65,0.1)]">
                <button
                  onClick={handleCopyLink}
                  className="retro-btn retro-btn-outline text-[0.35rem] px-2 py-1"
                  style={{ fontFamily: '"Press Start 2P", monospace' }}
                >
                  {copyFeedback ? "✅ COPIED!" : "📋 COPY LINK"}
                </button>
                <button
                  onClick={handleShareX}
                  className="retro-btn retro-btn-outline text-[0.35rem] px-2 py-1"
                  style={{ fontFamily: '"Press Start 2P", monospace' }}
                >
                  🐦 SHARE ON X
                </button>
                <button
                  onClick={handleShareNative}
                  className="retro-btn retro-btn-outline text-[0.35rem] px-2 py-1"
                  style={{ fontFamily: '"Press Start 2P", monospace' }}
                >
                  📱 SHARE
                </button>
                <button
                  onClick={() => setAlertModalOpen(true)}
                  className={`retro-btn text-[0.35rem] px-2 py-1 ${
                    hasActiveAlert ? "retro-btn-turquoise" : "retro-btn-outline"
                  }`}
                  style={{ fontFamily: '"Press Start 2P", monospace' }}
                >
                  🔔 {hasActiveAlert ? "ALERT SET" : "SET ALERT"}
                </button>
              </div>
            </div>
          </div>
        </motion.div>

        {/* FOMO Timer */}
        <div className="max-w-3xl mx-auto">
          <FOMOTimer tokenId={token.id} />
        </div>
        {/* ═══ BONDING CURVE VISUALIZER ═══ */}
        {curve ? (
          <div className="mb-6">
            <Card>
              <div className="flex items-center justify-between mb-3">
                <h3
                  className="text-[#00ff41]"
                  style={{
                    fontFamily: '"Press Start 2P", monospace',
                    fontSize: "0.45rem",
                  }}
                >
                  📈 BONDING CURVE — JOURNEY TO THE MOON
                </h3>
                <span
                  className="text-[#ffd23f]"
                  style={{
                    fontFamily: '"Press Start 2P", monospace',
                    fontSize: "0.35rem",
                  }}
                >
                  🌙 {((80 - ((curve.currentSupply / curve.totalSupply) * 100)).toFixed(1))}% TO GRADUATION
                </span>
              </div>
              <div className="grid lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                  <BondingCurveChart curve={curve} priceUp={(token.priceHistory.length >= 2 ? token.priceHistory[token.priceHistory.length - 1] >= token.priceHistory[token.priceHistory.length - 2] : true)} />
                </div>
                <div>
                  <BondingCurveStats curve={curve} priceUp={(token.priceHistory.length >= 2 ? token.priceHistory[token.priceHistory.length - 1] >= token.priceHistory[token.priceHistory.length - 2] : true)} />
                </div>
              </div>
            </Card>
          </div>
        ) : null}

        {/* Main content: Chart + Bonding Curve */}
        {/* View Toggle */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setViewMode("bonding")}
            className={`retro-tab text-[0.45rem] px-3 py-1.5 ${viewMode === "bonding" ? "retro-tab-active" : ""}`}
            style={{ fontFamily: '"Press Start 2P", monospace' }}
          >
            🔗 BONDING CURVE
          </button>
          <button
            onClick={() => setViewMode("candlestick")}
            className={`retro-tab text-[0.45rem] px-3 py-1.5 ${viewMode === "candlestick" ? "retro-tab-active" : ""}`}
            style={{ fontFamily: '"Press Start 2P", monospace' }}
          >
            🕯️ CANDLESTICK
          </button>
        </div>

        {viewMode === "bonding" ? (
          <div className="grid lg:grid-cols-3 gap-6 mb-6">
            {/* Chart area */}
            <div className="lg:col-span-2 space-y-4">
              <Card>
                <div className="flex items-center justify-between mb-3">
                  <h3
                    className="text-[#00ff41]"
                    style={{
                      fontFamily: '"Press Start 2P", monospace',
                      fontSize: "0.45rem",
                    }}
                  >
                    📊 PRICE CHART
                  </h3>
                  <div className="flex gap-1">
                    {["5m", "15m", "1H", "4H", "1D"].map((tf) => (
                      <button
                        key={tf}
                        className="retro-tab text-[0.35rem] px-1.5 py-0.5"
                        style={{ fontFamily: '"Press Start 2P", monospace' }}
                      >
                        {tf}
                      </button>
                    ))}
                  </div>
                </div>
                <PriceHistoryChart token={token} curve={curve} />
              </Card>
            </div>
            {/* Bonding Curve Panel */}
            <div>
              {curve ? (
                <BondingCurvePanel
                  token={token}
                  curve={curve}
                  onRefresh={refresh}
                />
              ) : (
                <Card>
                  <div className="text-center py-4">
                    <p className="text-3xl mb-2">⚡</p>
                    <p
                      className="text-[#b0d0b0]"
                      style={{
                        fontFamily: '"Press Start 2P", monospace',
                        fontSize: "0.45rem",
                      }}
                    >
                      NO BONDING CURVE
                    </p>
                    <p
                      className="text-[#e0ffe0] mt-1"
                      style={{
                        fontFamily: '"VT323", monospace',
                        fontSize: "0.95rem",
                      }}
                    >
                      This token was created before bonding curves.
                    </p>
                  </div>
                </Card>
              )}
            </div>
          </div>
        ) : (
          <div className="mb-6">
            <Card>
              <div className="flex items-center justify-between mb-3">
                <h3
                  className="text-[#00ff41]"
                  style={{
                    fontFamily: '"Press Start 2P", monospace',
                    fontSize: "0.45rem",
                  }}
                >
                  🕯️ CANDLESTICK CHART
                </h3>
              </div>
              <div className="h-80">
                <GameCandlestickChart
                  flashCandle={flashCandle}
                  data={ohlcData}
                  tokenSymbol={token?.ticker}
                  height="100%"
                  showVolume={true}
                  onTimeframeChange={setChartTimeframe}
                />
              </div>
            </Card>
          </div>
        )}

        {/* On-Chain TX History */}
        <OnChainTxHistory tokenId={token.id} />

        {/* Comment Section */}
        <div className="mb-8">
          <CommentSection tokenId={token.id} />
        </div>

        {/* Deploy Modal */}
        {curve && (
          <DeployModal
            open={deployModalOpen}
            onClose={() => { setDeployModalOpen(false); const chainAddr = curve?.blockchain === 'solana' ? solAddress : ethAddress; if (chainAddr) checkAchievements(chainAddr, triggerToast); }}
            tokenName={token.name}
            tokenTicker={token.ticker}
            tokenSupply={token.supply}
            curve={curve}
            onGraduate={handleGraduate}
          />
        )}

        {/* Price Alert Modal */}
        <PriceAlertModal
          open={alertModalOpen}
          onClose={() => setAlertModalOpen(false)}
          tokenId={token.id}
          tokenName={token.name}
          ticker={token.ticker}
          currentPrice={token.price}
          blockchain={token.blockchain}
          currencySymbol={currencySymbol}
        />

        {/* Delete Confirmation Modal */}
        {deleteConfirmOpen && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.7)" }}
            onClick={() => setDeleteConfirmOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="retro-card p-6 max-w-md mx-4"
              style={{ background: "#0d120d" }}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
            >
              <div className="text-center mb-4">
                <div className="text-4xl mb-3">⚠️</div>
                <h3
                  className="text-[#ff3333] mb-2"
                  style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.55rem" }}
                >
                  DELETE TOKEN
                </h3>
                <p
                  className="text-[#e0ffe0]"
                  style={{ fontFamily: '"VT323", monospace', fontSize: "1.1rem" }}
                >
                  Are you sure you want to delete{" "}
                  <span className="text-[#ffaa00] font-bold">{token?.name}</span>?
                </p>
                <p
                  className="text-[#ff6b6b] mt-2"
                  style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
                >
                  This cannot be undone.
                </p>
              </div>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => setDeleteConfirmOpen(false)}
                  className="retro-btn retro-btn-outline text-[0.4rem] px-4 py-2"
                  style={{ fontFamily: '"Press Start 2P", monospace' }}
                >
                  CANCEL
                </button>
                <button
                  onClick={handleDelete}
                  className="retro-btn retro-btn-pink text-[0.4rem] px-4 py-2"
                  style={{ fontFamily: '"Press Start 2P", monospace' }}
                >
                  🗑️ DELETE
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
}
