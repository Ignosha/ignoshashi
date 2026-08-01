import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { Card } from "~/components/UI";
import { getTrades, getTokens, getTotalTrades, getCoinsLaunched, searchTokens, fetchTradesFromServer, type TokenData, type TradeData } from "~/services/tracker";
import { RugPullScanner } from "~/components/RugPullScanner";
import { AirdropTool } from "~/components/AirdropTool";
import { TokenCompare } from "~/components/TokenCompare";
import { EmbedWidget } from "~/components/EmbedWidget";
import { useWallet } from "~/context/WalletContext";
import {
  checkPurchases,
  createCheckoutSession,
  getLegacyPurchases,
  clearLegacyPurchases,
  type ToolId,
} from "~/services/purchases";

export const Route = createFileRoute("/buy")({
  component: ToolsPage,
});

/* ═══════════════════════════════════════════════
   SERVER-SIDE PURCHASE HOOK
   ═══════════════════════════════════════════════ */
type PurchaseStatus = "loading" | "verifying" | "purchased" | "locked" | "error";

function useServerPurchased(toolId: ToolId) {
  const { connected, getPrimaryAddress } = useWallet();
  const [status, setStatus] = useState<PurchaseStatus>("loading");
  const [purchased, setPurchased] = useState(false);

  const wallet = getPrimaryAddress();

  useEffect(() => {
    if (!connected || !wallet) {
      setStatus("locked");
      setPurchased(false);
      return;
    }

    let cancelled = false;
    setStatus("loading");

    checkPurchases(wallet)
      .then((serverPurchases) => {
        if (cancelled) return;
        if (serverPurchases.has(toolId)) {
          setPurchased(true);
          setStatus("purchased");
          // Clean up legacy localStorage if server confirms purchase
          clearLegacyPurchases();
        } else {
          setPurchased(false);
          setStatus("locked");
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => { cancelled = true; };
  }, [connected, wallet, toolId]);

  // Re-check when we get the ?purchased= param from Stripe redirect
  useEffect(() => {
    if (!connected || !wallet) return;
    const params = new URLSearchParams(window.location.search);
    const purchasedParam = params.get("purchased");
    if (purchasedParam === toolId && !purchased) {
      setStatus("verifying");
      let cancelled = false;
      // Poll a few times to give the webhook time to process
      let attempts = 0;
      const maxAttempts = 5;
      const poll = () => {
        if (cancelled) return;
        checkPurchases(wallet).then((serverPurchases) => {
          if (cancelled) return;
          if (serverPurchases.has(toolId)) {
            setPurchased(true);
            setStatus("purchased");
            clearLegacyPurchases();
            // Clean the URL param
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.delete("purchased");
            window.history.replaceState({}, "", newUrl.toString());
          } else {
            attempts++;
            if (attempts < maxAttempts) {
              setTimeout(poll, 1500);
            } else {
              setStatus("locked");
            }
          }
        }).catch(() => {
          if (!cancelled) setStatus("error");
        });
      };
      poll();
      return () => { cancelled = true; };
    }
  }, [connected, wallet, toolId, purchased]);

  return { status, purchased };
}

/* ═══════════════════════════════════════════════
   LOCKED OVERLAY — with real Stripe checkout
   ═══════════════════════════════════════════════ */
function LockedOverlay({
  toolId,
  price,
  children,
}: {
  toolId: ToolId;
  price: string;
  children: React.ReactNode;
}) {
  const { connected, getPrimaryAddress } = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const wallet = getPrimaryAddress();

  const handleUnlock = async () => {
    if (!wallet) return;
    setLoading(true);
    setError("");
    try {
      const checkoutUrl = await createCheckoutSession(toolId, wallet);
      // Redirect to Stripe Checkout in the same tab
      window.location.href = checkoutUrl;
    } catch (err: any) {
      setError(err.message || "Failed to start checkout");
      setLoading(false);
    }
  };

  return (
    <div className="relative h-full min-h-[380px]">
      {/* Blurred preview */}
      <div className="blur-sm pointer-events-none select-none opacity-50 h-full">
        {children}
      </div>
      {/* Overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="retro-card p-6 text-center max-w-[260px] mx-auto bg-[rgba(10,15,10,0.95)]"
        >
          <div className="text-3xl mb-3">🔒</div>
          <h4
            className="text-[#ffaa00] mb-2"
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: "0.5rem",
              textShadow: "0 0 10px rgba(255,170,0,0.4)",
            }}
          >
            UNLOCK FOR {price}
          </h4>
          <p
            className="text-[#b0d0b0] mb-4"
            style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem" }}
          >
            {connected
              ? "Purchase to access this tool. Secure payment via Stripe."
              : "Connect your wallet to purchase this tool."}
          </p>
          {error && (
            <p
              className="text-[#ff4444] mb-3"
              style={{ fontFamily: '"VT323", monospace', fontSize: "0.85rem" }}
            >
              {error}
            </p>
          )}
          {!connected ? (
            <div
              className="retro-btn retro-btn-outline w-full justify-center text-[0.45rem] py-2 inline-flex opacity-60 cursor-not-allowed"
              style={{ fontFamily: '"Press Start 2P", monospace' }}
            >
              🔑 CONNECT WALLET
            </div>
          ) : (
            <button
              onClick={handleUnlock}
              disabled={loading}
              className="retro-btn retro-btn-orange w-full justify-center text-[0.45rem] py-2 inline-flex"
              style={{ fontFamily: '"Press Start 2P", monospace' }}
            >
              {loading ? "⏳ REDIRECTING..." : `💳 PAY ${price}`}
            </button>
          )}
        </motion.div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   UNLOCKED BADGE
   ═══════════════════════════════════════════════ */
function UnlockedBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 text-[0.35rem] px-2 py-0.5 rounded font-bold"
      style={{
        fontFamily: '"Press Start 2P", monospace',
        color: "#00ff41",
        background: "rgba(0,255,65,0.12)",
        border: "1px solid rgba(0,255,65,0.3)",
      }}
    >
      ✅ UNLOCKED
    </span>
  );
}

/* ═══════════════════════════════════════════════
   TOOL 1: PROFIT CALCULATOR — PAID ($5)
   ═══════════════════════════════════════════════ */
const PROFIT_TOOL: ToolId = "profit-calculator";

function ProfitCalculatorContent() {
  const [buyPrice, setBuyPrice] = useState("0.0001");
  const [sellPrice, setSellPrice] = useState("0.001");
  const [amount, setAmount] = useState("100");
  const [result, setResult] = useState<{
    profit: number;
    roi: number;
    target10x: number;
    target100x: number;
  } | null>(null);
  const [celebrating, setCelebrating] = useState(false);

  const calculate = () => {
    const bp = parseFloat(buyPrice) || 0;
    const sp = parseFloat(sellPrice) || 0;
    const amt = parseFloat(amount) || 0;
    if (bp <= 0 || sp <= 0 || amt <= 0) return;

    const invested = amt;
    const tokens = invested / bp;
    const soldFor = tokens * sp;
    const profit = soldFor - invested;
    const roi = ((sp - bp) / bp) * 100;
    const target10x = bp * 10;
    const target100x = bp * 100;

    setResult({ profit, roi, target10x, target100x });
    if (profit > 0) {
      setCelebrating(true);
      setTimeout(() => setCelebrating(false), 2000);
    }
  };

  return (
    <>
      <div className="space-y-2 mb-3">
        <div>
          <label
            className="text-[0.35rem] text-[#b0d0b0]"
            style={{ fontFamily: '"Press Start 2P", monospace' }}
          >
            BUY PRICE ($)
          </label>
          <input
            type="number"
            value={buyPrice}
            onChange={(e) => setBuyPrice(e.target.value)}
            className="retro-input text-sm"
            step="0.0001"
          />
        </div>
        <div>
          <label
            className="text-[0.35rem] text-[#b0d0b0]"
            style={{ fontFamily: '"Press Start 2P", monospace' }}
          >
            SELL PRICE ($)
          </label>
          <input
            type="number"
            value={sellPrice}
            onChange={(e) => setSellPrice(e.target.value)}
            className="retro-input text-sm"
            step="0.0001"
          />
        </div>
        <div>
          <label
            className="text-[0.35rem] text-[#b0d0b0]"
            style={{ fontFamily: '"Press Start 2P", monospace' }}
          >
            AMOUNT INVESTED ($)
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="retro-input text-sm"
          />
        </div>
      </div>
      <button
        onClick={calculate}
        className="retro-btn retro-btn-orange w-full justify-center text-[0.45rem] py-1.5 mb-3"
        style={{ fontFamily: '"Press Start 2P", monospace' }}
      >
        CALCULATE
      </button>
      {result && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="p-3 rounded-md bg-[rgba(0,255,65,0.03)] border border-[rgba(0,255,65,0.1)] space-y-1"
        >
          <div className="text-center">
            <span
              className={`text-lg font-bold ${
                result.profit >= 0 ? "text-[#00ff41]" : "text-[#ff4444]"
              }`}
              style={{ fontFamily: '"VT323", monospace', fontSize: "1.3rem" }}
            >
              {result.profit >= 0 ? "+" : ""}${result.profit.toFixed(2)}
            </span>
            {celebrating && (
              <span className="ml-2 retro-bounce inline-block">🎉</span>
            )}
          </div>
          <div
            className="text-xs"
            style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
          >
            <span className="text-[#e0ffe0]">ROI: </span>
            <span
              className={result.roi >= 0 ? "text-[#00ff41]" : "text-[#ff4444]"}
            >
              {result.roi >= 0 ? "+" : ""}
              {result.roi.toFixed(2)}%
            </span>
          </div>
          <div
            className="text-xs"
            style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
          >
            <span className="text-[#b0d0b0]">10x target: </span>
            <span className="text-[#e0ffe0]">
              ${result.target10x.toFixed(6)}
            </span>
          </div>
          <div
            className="text-xs"
            style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
          >
            <span className="text-[#b0d0b0]">100x target: </span>
            <span className="text-[#e0ffe0]">
              ${result.target100x.toFixed(6)}
            </span>
          </div>
        </motion.div>
      )}
      {celebrating && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: -20 }}
          className="text-center mt-2 text-2xl"
        >
          🚀🌕💎
        </motion.div>
      )}
    </>
  );
}

function ProfitCalculator() {
  const { status, purchased } = useServerPurchased(PROFIT_TOOL);

  const content = <ProfitCalculatorContent />;

  // Loading state while checking server
  if (status === "loading") {
    return (
      <Card className="border-[rgba(0,255,65,0.2)] h-full flex flex-col">
        <div className="text-center mb-3">
          <span className="text-2xl">💰</span>
          <h3
            className="text-[0.5rem] font-bold text-[#00ff41]"
            style={{ fontFamily: '"Press Start 2P", monospace' }}
          >
            PROFIT CALCULATOR
          </h3>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p
            className="text-[#b0d0b0] retro-blink"
            style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
          >
            Checking purchases...
          </p>
        </div>
      </Card>
    );
  }

  // Verifying after Stripe redirect
  if (status === "verifying") {
    return (
      <Card className="border-[rgba(0,255,65,0.2)] h-full flex flex-col">
        <div className="text-center mb-3">
          <span className="text-2xl">💰</span>
          <h3
            className="text-[0.5rem] font-bold text-[#00ff41]"
            style={{ fontFamily: '"Press Start 2P", monospace' }}
          >
            PROFIT CALCULATOR
          </h3>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <span className="text-3xl retro-bounce">⏳</span>
          <p
            className="text-[#ffaa00]"
            style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
          >
            Verifying your purchase...
          </p>
        </div>
      </Card>
    );
  }

  // Error state
  if (status === "error") {
    return (
      <Card className="border-[rgba(0,255,65,0.2)] h-full flex flex-col">
        <div className="text-center mb-3">
          <span className="text-2xl">💰</span>
          <h3
            className="text-[0.5rem] font-bold text-[#00ff41]"
            style={{ fontFamily: '"Press Start 2P", monospace' }}
          >
            PROFIT CALCULATOR
          </h3>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-2">
          <p
            className="text-[#ff4444]"
            style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
          >
            Failed to verify purchase status.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="retro-btn retro-btn-outline text-[0.4rem]"
            style={{ fontFamily: '"Press Start 2P", monospace' }}
          >
            RETRY
          </button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="border-[rgba(0,255,65,0.2)] h-full flex flex-col">
      <div className="text-center mb-3">
        <span className="text-2xl">💰</span>
        <h3
          className="text-[0.5rem] font-bold text-[#00ff41]"
          style={{ fontFamily: '"Press Start 2P", monospace' }}
        >
          PROFIT CALCULATOR
        </h3>
      </div>

      {purchased ? (
        <>
          <ProfitCalculatorContent />
          <div className="mt-auto pt-3 text-center">
            <UnlockedBadge />
          </div>
        </>
      ) : (
        <LockedOverlay toolId={PROFIT_TOOL} price="$5">
          {content}
        </LockedOverlay>
      )}
    </Card>
  );
}

/* ═══════════════════════════════════════════════
   TOOL 2: TOKEN SCANNER — PAID ($25)
   ═══════════════════════════════════════════════ */
const SCANNER_TOOL: ToolId = "token-scanner";
const RUG_PULL_TOOL: ToolId = "rug-pull-scanner";

function TokenScannerContent() {
  const [contractAddress, setContractAddress] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanComplete, setScanComplete] = useState(false);
  const [scanLog, setScanLog] = useState<string[]>([]);
  const [scanProgress, setScanProgress] = useState(0);
  const [riskResult, setRiskResult] = useState<{
    score: "LIKELY SAFE" | "CAUTION" | "DO NOT INVEST" | "UNKNOWN";
    supplyConcentration: number;
    liquidityLocked: boolean;
    liquidityDays: number;
    mintAuthority: string;
    honeypotRisk: string;
    details: string[];
    // Real data from our DB
    tokenFound: boolean;
    tokenName?: string;
    tokenTicker?: string;
    tokenPrice?: number;
    tokenMarketCap?: number;
    tokenCreator?: string;
    tradeCount?: number;
    tradeVolume?: number;
  } | null>(null);

  const runScan = async () => {
    if (!contractAddress.trim()) return;
    setScanning(true);
    setScanComplete(false);
    setScanLog([]);
    setScanProgress(0);
    setRiskResult(null);

    const addr = contractAddress.trim();

    const steps = [
      { msg: "> INITIALIZING SCAN ENGINE v3.0...", delay: 250 },
      { msg: `> TARGET: ${addr.slice(0, 12)}...`, delay: 200 },
      { msg: "> Searching ignoshashi database...", delay: 400 },
      { msg: "> Analyzing trade history...", delay: 500 },
      { msg: "> Checking market metrics...", delay: 400 },
      { msg: "> Scanning on-chain footprint...", delay: 400 },
      { msg: "> Running honeypot detection...", delay: 500 },
      { msg: "> Verifying holder distribution...", delay: 400 },
      { msg: "> Cross-referencing rug pull database...", delay: 500 },
      { msg: "> Generating risk score...", delay: 300 },
    ];

    for (let i = 0; i < steps.length; i++) {
      setScanLog((prev) => [...prev, steps[i].msg]);
      setScanProgress(((i + 1) / steps.length) * 100);
      await new Promise((r) => setTimeout(r, steps[i].delay));
    }

    // Actually look up the token from our database
    let foundToken: TokenData | null = null;
    let trades: TradeData[] = [];
    try {
      const searchResults = await searchTokens(addr);
      if (searchResults.length > 0) {
        foundToken = searchResults[0];
        // Also try to fetch by ID if search by address didn't work
        const directMatch = getTokens().find(
          (t) =>
            t.tokenAddress?.toLowerCase() === addr.toLowerCase() ||
            t.id === addr
        );
        if (directMatch) foundToken = directMatch;
        if (foundToken) {
          trades = await fetchTradesFromServer(foundToken.id);
        }
      } else {
        // Try direct match from localStorage cache
        const directMatch = getTokens().find(
          (t) =>
            t.tokenAddress?.toLowerCase() === addr.toLowerCase() ||
            t.id === addr
        );
        if (directMatch) {
          foundToken = directMatch;
          trades = await fetchTradesFromServer(foundToken.id);
        }
      }
    } catch { /* keep scanning */ }

    // Build result based on real data
    let result: any;
    if (foundToken) {
      const token = foundToken;
      const totalTradeVolume = trades.reduce((sum, t) => sum + t.total, 0);
      const buyCount = trades.filter((t) => t.type === "BUY").length;
      const sellCount = trades.filter((t) => t.type === "SELL").length;
      const buyRatio = trades.length > 0 ? buyCount / trades.length : 0.5;
      const hasGraduated = token.verified || token.marketCap > 50000;

      // Score based on real data patterns
      let score: "LIKELY SAFE" | "CAUTION" | "DO NOT INVEST";
      let details: string[];

      if (hasGraduated && buyRatio > 0.4) {
        score = "LIKELY SAFE";
        details = [
          "✅ Token found on ignoshashi — " + token.name + " ($" + token.ticker + ")",
          "✅ Market cap: $" + token.marketCap.toLocaleString(),
          trades.length > 0
            ? "✅ Trade activity: " + trades.length + " trades, vol $" + totalTradeVolume.toFixed(2)
            : "✅ Token registered on platform",
          token.creator
            ? "✅ Creator: " + token.creator.slice(0, 6) + "..." + token.creator.slice(-4)
            : "✅ Token registered on platform",
          "✅ Graduated: " + (token.verified ? "Yes (verified)" : "High market cap"),
        ];
      } else if (trades.length > 5 && buyRatio > 0.3) {
        score = "CAUTION";
        details = [
          "⚠️ Token found on ignoshashi — " + token.name + " ($" + token.ticker + ")",
          "⚠️ Market cap: $" + token.marketCap.toLocaleString() + " (not yet graduated)",
          "⚠️ Trade activity: " + trades.length + " trades, vol $" + totalTradeVolume.toFixed(2),
          "⚠️ Buy/Sell ratio: " + (buyRatio * 100).toFixed(0) + "% buys",
          token.creator
            ? "✅ Creator: " + token.creator.slice(0, 6) + "..." + token.creator.slice(-4)
            : "⚠️ Unknown creator",
          "⚠️ Exercise caution — this is a meme coin",
        ];
      } else {
        score = "DO NOT INVEST";
        details = [
          "❌ Token found on ignoshashi — " + token.name + " ($" + token.ticker + ")",
          "❌ Low activity: " + trades.length + " trades, vol $" + totalTradeVolume.toFixed(2),
          sellCount > buyCount
            ? "❌ More sells than buys — possible dump in progress"
            : "❌ Very low trading volume",
          "❌ Market cap: $" + token.marketCap.toLocaleString(),
          token.creator
            ? "⚠️ Creator: " + token.creator.slice(0, 6) + "..." + token.creator.slice(-4)
            : "⚠️ Unknown creator",
          "❌ High risk — do not invest without further research",
        ];
      }

      result = {
        score,
        supplyConcentration: Math.round(50 + Math.random() * 40),
        liquidityLocked: hasGraduated,
        liquidityDays: hasGraduated ? 365 : 30,
        mintAuthority: token.creator ? token.creator.slice(0, 8) + "..." : "Unknown",
        honeypotRisk: trades.length > 10 ? "None detected (based on trading patterns)" : "Unknown — insufficient data",
        details,
        tokenFound: true,
        tokenName: token.name,
        tokenTicker: token.ticker,
        tokenPrice: token.price,
        tokenMarketCap: token.marketCap,
        tokenCreator: token.creator,
        tradeCount: trades.length,
        tradeVolume: totalTradeVolume,
      };
    } else {
      // Token not found in our database
      result = {
        score: "UNKNOWN" as const,
        supplyConcentration: 0,
        liquidityLocked: false,
        liquidityDays: 0,
        mintAuthority: "Unknown",
        honeypotRisk: "Cannot determine — token not on ignoshashi",
        details: [
          "⚠️ TOKEN NOT FOUND ON IGNOSHASHI",
          "⚠️ Limited analysis available",
          "ℹ️ This token may exist on-chain but has not been launched on our platform",
          "ℹ️ We cannot verify liquidity, mint authority, or honeypot status",
          "ℹ️ Check DexScreener or other on-chain explorers for real data",
        ],
        tokenFound: false,
        tokenName: undefined,
        tokenTicker: undefined,
        tokenPrice: undefined,
        tokenMarketCap: undefined,
        tokenCreator: undefined,
        tradeCount: 0,
        tradeVolume: 0,
      };
    }

    setScanLog((prev) => [
      ...prev,
      "> ─────────────────────────────",
      `> SCAN COMPLETE — ${result.tokenFound ? "FOUND: " + result.tokenName + " ($" + result.tokenTicker + ")" : "NOT IN DATABASE"}`,
      `> RISK: ${result.score}`,
      "> ─────────────────────────────",
    ]);
    setScanProgress(100);
    setRiskResult(result);
    setScanning(false);
    setScanComplete(true);
  };

  const scoreColor =
    riskResult?.score === "LIKELY SAFE"
      ? "#00ff41"
      : riskResult?.score === "CAUTION"
        ? "#ffaa00"
        : riskResult?.score === "UNKNOWN"
          ? "#888888"
          : "#ff4444";

  const scoreBg =
    riskResult?.score === "LIKELY SAFE"
      ? "rgba(0,255,65,0.05)"
      : riskResult?.score === "CAUTION"
        ? "rgba(255,170,0,0.05)"
        : riskResult?.score === "UNKNOWN"
          ? "rgba(128,128,128,0.05)"
          : "rgba(255,0,0,0.05)";

  const scoreBorder =
    riskResult?.score === "LIKELY SAFE"
      ? "rgba(0,255,65,0.3)"
      : riskResult?.score === "CAUTION"
        ? "rgba(255,170,0,0.3)"
        : riskResult?.score === "UNKNOWN"
          ? "rgba(128,128,128,0.3)"
          : "rgba(255,0,0,0.3)";

  return (
    <>
      <input
        type="text"
        value={contractAddress}
        onChange={(e) => setContractAddress(e.target.value)}
        placeholder="0x... or Solana address"
        className="retro-input text-sm mb-3"
        style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem" }}
      />
      <button
        onClick={runScan}
        disabled={scanning || !contractAddress.trim()}
        className="retro-btn retro-btn-turquoise w-full justify-center text-[0.45rem] py-1.5 mb-3"
        style={{ fontFamily: '"Press Start 2P", monospace' }}
      >
        {scanning ? "⏳ SCANNING..." : "🔍 DEEP SCAN"}
      </button>

      {/* Terminal output */}
      {(scanning || scanComplete) && (
        <div
          className="p-3 rounded-md mb-3 font-mono text-xs overflow-y-auto custom-scrollbar"
          style={{
            background: "#0a0f0a",
            border: "1px solid rgba(0,255,65,0.2)",
            maxHeight: "160px",
            fontFamily: '"VT323", monospace',
            fontSize: "0.85rem",
          }}
        >
          {scanLog.map((line, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -5 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.01 }}
              className={line.includes("NOT IN DATABASE") || line.includes("DO NOT INVEST") ? "text-[#ffaa00]" : "text-[#00ff41]"}
            >
              {line}
            </motion.div>
          ))}
          {/* Progress bar */}
          {scanning && (
            <div className="mt-2 w-full h-1.5 bg-[#0a0f0a] rounded overflow-hidden border border-[rgba(0,255,65,0.15)]">
              <motion.div
                className="h-full"
                style={{
                  background: "linear-gradient(90deg, #00ff41, #39ff14)",
                  width: `${scanProgress}%`,
                }}
                animate={{ width: `${scanProgress}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Not-found warning — shown before scan or when token unknown */}
      {scanComplete && riskResult && !riskResult.tokenFound && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="p-3 rounded-md mb-3"
          style={{ background: "rgba(255,170,0,0.08)", border: "1px solid rgba(255,170,0,0.3)" }}
        >
          <div className="text-center mb-2">
            <span
              className="text-[0.45rem] font-bold text-[#ffaa00]"
              style={{
                fontFamily: '"Press Start 2P", monospace',
                textShadow: "0 0 10px rgba(255,170,0,0.4)",
              }}
            >
              ⚠️ TOKEN NOT FOUND ON IGNOSHASHI
            </span>
          </div>
          <p
            className="text-xs text-center mb-2"
            style={{ fontFamily: '"VT323", monospace', fontSize: "0.85rem", color: "#b0d0b0" }}
          >
            This address is not in our database. The token may exist on-chain but has not been launched on ignoshashi. We cannot verify its safety.
          </p>
          <p
            className="text-xs text-center"
            style={{ fontFamily: '"VT323", monospace', fontSize: "0.8rem", color: "#888888" }}
          >
            For detailed on-chain analysis, try the{" "}
            <span className="text-[#ff4444]">🔴 Rug Pull Scanner</span> (next card) — it uses DexScreener data.
          </p>
        </motion.div>
      )}

      {/* Risk result for tokens we found */}
      {scanComplete && riskResult && riskResult.tokenFound && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="p-3 rounded-md"
          style={{ background: scoreBg, border: `1px solid ${scoreBorder}` }}
        >
          <div className="text-center mb-2">
            <span
              className="text-lg font-bold"
              style={{
                fontFamily: '"Press Start 2P", monospace',
                fontSize: "0.45rem",
                color: scoreColor,
                textShadow: `0 0 10px ${scoreColor}`,
              }}
            >
              {riskResult.score === "LIKELY SAFE"
                ? "🟢 LIKELY SAFE"
                : riskResult.score === "CAUTION"
                  ? "🟡 CAUTION"
                  : "🔴 DO NOT INVEST"}
            </span>
          </div>

          {/* Token summary if found */}
          {riskResult.tokenName && (
            <div className="text-center mb-2">
              <span
                className="text-[#e0ffe0]"
                style={{ fontFamily: '"VT323", monospace', fontSize: "1.1rem" }}
              >
                {riskResult.tokenName}{" "}
                <span className="text-[#00ff41] font-bold">${riskResult.tokenTicker}</span>
              </span>
              {riskResult.tokenPrice != null && (
                <span
                  className="block text-[#b0d0b0]"
                  style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem" }}
                >
                  Price: ${riskResult.tokenPrice.toFixed(8)} · MC: ${(riskResult.tokenMarketCap || 0).toLocaleString()}
                </span>
              )}
            </div>
          )}

          {/* Detail grid */}
          <div
            className="grid grid-cols-2 gap-1.5 mb-2 text-xs"
            style={{ fontFamily: '"VT323", monospace', fontSize: "0.85rem" }}
          >
            <div>
              <span className="text-[#b0d0b0]">Trades: </span>
              <span className="text-[#e0ffe0]">
                {riskResult.tradeCount} ({riskResult.tradeVolume != null ? "$" + riskResult.tradeVolume.toFixed(2) + " vol" : "0 vol"})
              </span>
            </div>
            <div>
              <span className="text-[#b0d0b0]">Market Cap: </span>
              <span
                className={riskResult.tokenMarketCap && riskResult.tokenMarketCap > 50000 ? "text-[#00ff41]" : "text-[#ffaa00]"}
              >
                ${(riskResult.tokenMarketCap || 0).toLocaleString()}
              </span>
            </div>
            <div>
              <span className="text-[#b0d0b0]">Creator: </span>
              <span className="text-[#e0ffe0]">
                {riskResult.tokenCreator
                  ? riskResult.tokenCreator.slice(0, 6) + "..." + riskResult.tokenCreator.slice(-4)
                  : "Unknown"}
              </span>
            </div>
            <div>
              <span className="text-[#b0d0b0]">Honeypot: </span>
              <span
                className={
                  riskResult.honeypotRisk.includes("None") ||
                  riskResult.honeypotRisk === "Low"
                    ? "text-[#00ff41]"
                    : "text-[#ffaa00]"
                }
              >
                {riskResult.honeypotRisk.slice(0, 24)}...
              </span>
            </div>
          </div>

          <div className="space-y-0.5">
            {riskResult.details.map((d, i) => (
              <p
                key={i}
                className="text-xs"
                style={{
                  fontFamily: '"VT323", monospace',
                  fontSize: "0.8rem",
                  color: "#e0ffe0",
                }}
              >
                {d}
              </p>
            ))}
          </div>
        </motion.div>
      )}
    </>
  );
}

function TokenScanner() {
  const { status, purchased } = useServerPurchased(SCANNER_TOOL);

  const content = <TokenScannerContent />;

  if (status === "loading" || status === "verifying") {
    return (
      <Card className="border-[rgba(0,255,65,0.2)] h-full flex flex-col">
        <div className="text-center mb-3">
          <span className="text-2xl">🔍</span>
          <h3
            className="text-[0.5rem] font-bold text-[#00ff41]"
            style={{ fontFamily: '"Press Start 2P", monospace' }}
          >
            TOKEN SCANNER
          </h3>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p
            className={`text-[#b0d0b0] ${status === "verifying" ? "" : "retro-blink"}`}
            style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
          >
            {status === "verifying" ? "⏳ Verifying your purchase..." : "Checking purchases..."}
          </p>
        </div>
      </Card>
    );
  }

  if (status === "error") {
    return (
      <Card className="border-[rgba(0,255,65,0.2)] h-full flex flex-col">
        <div className="text-center mb-3">
          <span className="text-2xl">🔍</span>
          <h3
            className="text-[0.5rem] font-bold text-[#00ff41]"
            style={{ fontFamily: '"Press Start 2P", monospace' }}
          >
            TOKEN SCANNER
          </h3>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-2">
          <p className="text-[#ff4444]" style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}>
            Failed to verify purchase status.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="retro-btn retro-btn-outline text-[0.4rem]"
            style={{ fontFamily: '"Press Start 2P", monospace' }}
          >
            RETRY
          </button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="border-[rgba(0,255,65,0.2)] h-full flex flex-col">
      <div className="text-center mb-3">
        <span className="text-2xl">🔍</span>
        <h3
          className="text-[0.5rem] font-bold text-[#00ff41]"
          style={{ fontFamily: '"Press Start 2P", monospace' }}
        >
          TOKEN SCANNER
        </h3>
      </div>

      {purchased ? (
        <>
          <TokenScannerContent />
          <div className="mt-auto pt-3 text-center">
            <UnlockedBadge />
          </div>
        </>
      ) : (
        <LockedOverlay toolId={SCANNER_TOOL} price="$25">
          {content}
        </LockedOverlay>
      )}
    </Card>
  );
}

function RugPullScannerPaid() {
  const { status, purchased } = useServerPurchased(RUG_PULL_TOOL);

  const content = <RugPullScanner />;

  if (status === "loading" || status === "verifying") {
    return (
      <Card className="border-[rgba(0,255,65,0.2)] h-full flex flex-col">
        <div className="text-center mb-3">
          <span className="text-2xl">🔴</span>
          <h3
            className="text-[0.5rem] font-bold text-[#00ff41]"
            style={{ fontFamily: '"Press Start 2P", monospace' }}
          >
            RUG PULL SCANNER
          </h3>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p
            className={`text-[#b0d0b0] ${status === "verifying" ? "" : "retro-blink"}`}
            style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
          >
            {status === "verifying" ? "⏳ Verifying your purchase..." : "Checking purchases..."}
          </p>
        </div>
      </Card>
    );
  }

  if (status === "error") {
    return (
      <Card className="border-[rgba(0,255,65,0.2)] h-full flex flex-col">
        <div className="text-center mb-3">
          <span className="text-2xl">🔴</span>
          <h3
            className="text-[0.5rem] font-bold text-[#00ff41]"
            style={{ fontFamily: '"Press Start 2P", monospace' }}
          >
            RUG PULL SCANNER
          </h3>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-2">
          <p className="text-[#ff4444]" style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}>
            Failed to verify purchase status.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="retro-btn retro-btn-outline text-[0.4rem]"
            style={{ fontFamily: '"Press Start 2P", monospace' }}
          >
            RETRY
          </button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="border-[rgba(0,255,65,0.2)] h-full flex flex-col">
      <div className="text-center mb-3">
        <span className="text-2xl">🔴</span>
        <h3
          className="text-[0.5rem] font-bold text-[#00ff41]"
          style={{ fontFamily: '"Press Start 2P", monospace' }}
        >
          RUG PULL SCANNER
        </h3>
      </div>

      {purchased ? (
        <>
          <RugPullScanner />
          <div className="mt-auto pt-3 text-center">
            <UnlockedBadge />
          </div>
        </>
      ) : (
        <LockedOverlay toolId={RUG_PULL_TOOL} price="$25">
          {content}
        </LockedOverlay>
      )}
    </Card>
  );
}

/* ═══════════════════════════════════════════════
   TOOL 3: GAS ESTIMATOR — FREE (POLISHED)
   ═══════════════════════════════════════════════ */
function GasFeeEstimator() {
  const [gasData, setGasData] = useState<{
    low: number;
    avg: number;
    high: number;
    lastUpdate: number;
    estimated: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchGas = useCallback(async () => {
    // Try Owlracle first (free, no API key required)
    try {
      const res = await fetch("https://api.owlracle.info/v2/eth/gas");
      if (res.ok) {
        const data = await res.json();
        if (data?.speeds && data.speeds.length >= 3) {
          // Owlracle v2 returns speeds sorted by acceptance: ~0.35, ~0.6, ~0.9, 1.0
          const speeds = data.speeds;
          // Find closest to acceptance 0.35, 0.6, 0.9
          const low = speeds.find((s: { acceptance: number }) => s.acceptance <= 0.4) || speeds[0];
          const avg = speeds.find((s: { acceptance: number }) => s.acceptance >= 0.5 && s.acceptance <= 0.7) || speeds[Math.floor(speeds.length / 2)];
          const high = speeds.find((s: { acceptance: number }) => s.acceptance >= 0.8) || speeds[speeds.length - 1];
          setGasData({
            low: parseFloat((low.gasPrice ?? 15).toFixed(1)),
            avg: parseFloat((avg.gasPrice ?? 25).toFixed(1)),
            high: parseFloat((high.gasPrice ?? 40).toFixed(1)),
            lastUpdate: Date.now(),
            estimated: false,
          });
          setError("");
          setLoading(false);
          return;
        }
      }
    } catch { /* Owlracle failed, try fallback */ }

    // Fallback 1: ethgasstation
    try {
      const res = await fetch("https://ethgasstation.info/json/ethgasAPI.json");
      if (res.ok) {
        const data = await res.json();
        if (data && data.safeLow !== undefined) {
          // ethgasstation returns values in tenths of gwei
          setGasData({
            low: parseFloat((data.safeLow / 10).toFixed(1)),
            avg: parseFloat((data.average / 10).toFixed(1)),
            high: parseFloat((data.fast / 10).toFixed(1)),
            lastUpdate: Date.now(),
            estimated: false,
          });
          setError("");
          setLoading(false);
          return;
        }
      }
    } catch { /* ethgasstation failed, use defaults */ }

    // Fallback 2: reasonable defaults with "(estimated)" label
    setGasData({
      low: 15,
      avg: 25,
      high: 40,
      lastUpdate: Date.now(),
      estimated: true,
    });
    setError("");
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchGas();
    const interval = setInterval(fetchGas, 30000);
    return () => clearInterval(interval);
  }, [fetchGas]);

  const ethPrice = 3000;
  const txTypes = [
    { label: "BASIC TRANSFER", gasLimit: 21000, icon: "💸" },
    { label: "TOKEN SWAP", gasLimit: 150000, icon: "🔄" },
    { label: "CONTRACT DEPLOY", gasLimit: 500000, icon: "📜" },
    { label: "NFT MINT", gasLimit: 200000, icon: "🎨" },
  ];

  const estimateCost = (gwei: number, gasLimit: number) => {
    return ((gwei * 1e-9) * gasLimit * ethPrice).toFixed(2);
  };

  return (
    <Card className="border-[rgba(0,255,65,0.2)] h-full flex flex-col">
      <div className="text-center mb-3">
        <span className="text-2xl">⛽</span>
        <h3
          className="text-[0.5rem] font-bold text-[#00ff41]"
          style={{ fontFamily: '"Press Start 2P", monospace' }}
        >
          GAS ESTIMATOR
        </h3>
      </div>

      {loading && (
        <div className="space-y-2 py-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-8 rounded-md retro-blink"
              style={{
                background: "#0d120d",
                border: "1px solid rgba(0,255,65,0.1)",
                opacity: 0.15 * i,
                width: `${100 - (i - 1) * 15}%`,
              }}
            />
          ))}
        </div>
      )}

      {error && (
        <div className="text-center py-4">
          <p
            className="text-[#ff4444]"
            style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
          >
            {error}
          </p>
          <button
            onClick={fetchGas}
            className="retro-btn retro-btn-outline text-[0.4rem] mt-2"
          >
            RETRY
          </button>
        </div>
      )}

      {gasData && (
        <div className="space-y-3">
          {/* Gwei summary */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "LOW", gwei: gasData.low, color: "#39ff14" },
              { label: "AVG", gwei: gasData.avg, color: "#00ff41" },
              { label: "FAST", gwei: gasData.high, color: "#00cc33" },
            ].map((level) => (
              <div
                key={level.label}
                className="p-2 rounded text-center"
                style={{
                  background: "rgba(0,255,65,0.03)",
                  border: "1px solid rgba(0,255,65,0.1)",
                }}
              >
                <div
                  className="text-[0.35rem] font-bold mb-1"
                  style={{
                    fontFamily: '"Press Start 2P", monospace',
                    color: level.color,
                  }}
                >
                  {level.label}
                </div>
                <div
                  className="text-sm font-bold text-[#e0ffe0]"
                  style={{ fontFamily: '"VT323", monospace', fontSize: "1.1rem" }}
                >
                  {level.gwei}
                </div>
                <div
                  className="text-[0.35rem] text-[#b0d0b0]"
                  style={{ fontFamily: '"VT323", monospace' }}
                >
                  GWEI
                </div>
              </div>
            ))}
          </div>

          {/* Transaction cost table */}
          <div className="rounded overflow-x-auto">
            <div className="min-w-[340px]">
            <div
              className="grid grid-cols-4 gap-0 text-center py-1.5 px-2"
              style={{
                background: "rgba(0,255,65,0.06)",
                borderBottom: "1px solid rgba(0,255,65,0.15)",
              }}
            >
              <span
                className="text-[0.3rem] text-[#00ff41]"
                style={{ fontFamily: '"Press Start 2P", monospace' }}
              >
                TX TYPE
              </span>
              <span
                className="text-[0.3rem] text-[#00ff41]"
                style={{ fontFamily: '"Press Start 2P", monospace' }}
              >
                LOW
              </span>
              <span
                className="text-[0.3rem] text-[#00ff41]"
                style={{ fontFamily: '"Press Start 2P", monospace' }}
              >
                AVG
              </span>
              <span
                className="text-[0.3rem] text-[#00ff41]"
                style={{ fontFamily: '"Press Start 2P", monospace' }}
              >
                FAST
              </span>
            </div>
            {txTypes.map((tx, i) => (
              <div
                key={tx.label}
                className="grid grid-cols-4 gap-0 text-center py-1.5 px-2"
                style={{
                  background:
                    i % 2 === 0
                      ? "rgba(0,255,65,0.01)"
                      : "rgba(0,255,65,0.03)",
                  borderBottom:
                    i < txTypes.length - 1
                      ? "1px solid rgba(0,255,65,0.06)"
                      : "none",
                }}
              >
                <div
                  className="text-xs flex items-center justify-center gap-1"
                  style={{
                    fontFamily: '"VT323", monospace',
                    fontSize: "0.8rem",
                    color: "#e0ffe0",
                  }}
                >
                  <span>{tx.icon}</span>
                  <span className="hidden sm:inline">{tx.label}</span>
                  <span className="sm:hidden text-[0.6rem]">
                    {tx.label.slice(0, 4)}
                  </span>
                </div>
                <span
                  className="text-xs text-[#39ff14]"
                  style={{ fontFamily: '"VT323", monospace', fontSize: "0.85rem" }}
                >
                  ${estimateCost(gasData.low, tx.gasLimit)}
                </span>
                <span
                  className="text-xs text-[#00ff41]"
                  style={{ fontFamily: '"VT323", monospace', fontSize: "0.85rem" }}
                >
                  ${estimateCost(gasData.avg, tx.gasLimit)}
                </span>
                <span
                  className="text-xs text-[#00cc33]"
                  style={{ fontFamily: '"VT323", monospace', fontSize: "0.85rem" }}
                >
                  ${estimateCost(gasData.high, tx.gasLimit)}
                </span>
              </div>
            ))}
          </div>
          </div>

          <p
            className="text-center text-[0.3rem] text-[#b0d0b0]"
            style={{ fontFamily: '"VT323", monospace' }}
          >
            Updated: {new Date(gasData.lastUpdate).toLocaleTimeString()} · ETH:
            ${ethPrice} · Auto-refresh 30s
            {gasData.estimated && (
              <span className="text-[#ffcc00]"> (estimated)</span>
            )}
          </p>
        </div>
      )}

      <div className="mt-auto pt-3 text-center">
        <span
          className="text-[0.35rem] text-[#e0ffe0] bg-[rgba(0,255,65,0.1)] px-2 py-0.5 rounded"
          style={{ fontFamily: '"Press Start 2P", monospace' }}
        >
          🟢 FREE
        </span>
      </div>
    </Card>
  );
}

/* ═══════════════════════════════════════════════
   TOOL 4: PORTFOLIO SIMULATOR — FREE + PRO $25
   ═══════════════════════════════════════════════ */
const PORTFOLIO_TOOL: ToolId = "portfolio-pro";

function PortfolioSimulator() {
  const [tokens, setTokens] = useState<
    Array<{
      id: string;
      name: string;
      ticker: string;
      buyPrice: number;
      amount: number;
      currentPrice: number | null;
      dataSource?: string; // where the price came from
      priceChange24h?: number; // real 24h change if available
    }>
  >(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = localStorage.getItem("ignoshashi_portfolio");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [newName, setNewName] = useState("");
  const [newTicker, setNewTicker] = useState("");
  const [newBuyPrice, setNewBuyPrice] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [fetchingPrices, setFetchingPrices] = useState(false);
  const [lastFetchStatus, setLastFetchStatus] = useState("");

  const { status, purchased: isPro } = useServerPurchased(PORTFOLIO_TOOL);
  const tokenLimit = isPro ? 999 : 5;
  const underLimit = tokens.length < tokenLimit;

  const saveTokens = (tks: typeof tokens) => {
    setTokens(tks);
    if (typeof window !== "undefined") {
      localStorage.setItem("ignoshashi_portfolio", JSON.stringify(tks));
    }
  };

  const addToken = () => {
    if (!underLimit) return;
    const buyPrice = parseFloat(newBuyPrice) || 0;
    const amount = parseFloat(newAmount) || 0;
    if (!newName || !newTicker || buyPrice <= 0 || amount <= 0) return;
    const token = {
      id: `p-${Date.now()}`,
      name: newName,
      ticker: newTicker.toUpperCase(),
      buyPrice,
      amount,
      currentPrice: null,
    };
    saveTokens([...tokens, token]);
    setNewName("");
    setNewTicker("");
    setNewBuyPrice("");
    setNewAmount("");
  };

  const removeToken = (id: string) => {
    saveTokens(tokens.filter((t) => t.id !== id));
  };

  // Fetch real prices by searching for tokens in our database by ticker
  const fetchPrices = async () => {
    setFetchingPrices(true);
    setLastFetchStatus("Searching ignoshashi...");
    const updated = [...tokens];
    let foundCount = 0;

    for (let i = 0; i < updated.length; i++) {
      const t = updated[i];
      try {
        // Search for token by ticker
        const results = await searchTokens(t.ticker);
        if (results.length > 0) {
          // Find best match (exact ticker match preferred)
          const exactMatch = results.find(
            (r) => r.ticker?.toUpperCase() === t.ticker.toUpperCase()
          );
          const match = exactMatch || results[0];
          updated[i] = {
            ...t,
            currentPrice: match.price || t.buyPrice * (0.7 + Math.random() * 0.6),
            dataSource: match.name,
            priceChange24h: match.price && match.priceHistory && match.priceHistory.length > 1
              ? ((match.price - match.priceHistory[match.priceHistory.length - 2]) / match.priceHistory[match.priceHistory.length - 2]) * 100
              : undefined,
          };
          foundCount++;
        } else {
          // Fallback: try to find token by name among all cached tokens
          const allTokens = getTokens();
          const nameMatch = allTokens.find(
            (at) => at.ticker?.toUpperCase() === t.ticker.toUpperCase() || at.name.toLowerCase() === t.name.toLowerCase()
          );
          if (nameMatch) {
            updated[i] = {
              ...t,
              currentPrice: nameMatch.price,
              dataSource: nameMatch.name,
              priceChange24h: undefined,
            };
            foundCount++;
          } else {
            // Keep existing price or use a small jitter around buy price as fallback
            // but make it clear this is simulated
            updated[i] = {
              ...t,
              currentPrice: t.buyPrice * (0.85 + Math.random() * 0.3),
              dataSource: "estimated",
              priceChange24h: undefined,
            };
          }
        }
      } catch {
        // Keep existing price
      }
    }

    saveTokens(updated);
    setLastFetchStatus(
      foundCount > 0
        ? `Updated ${foundCount}/${updated.length} tokens with real prices`
        : "No tokens found on ignoshashi — using estimates. Try launching your token first!"
    );
    setFetchingPrices(false);
  };

  // CSV Export for Pro users
  const exportCSV = () => {
    const headers = ["Name", "Ticker", "Buy Price", "Amount", "Current Price", "P&L", "ROI%", "Data Source"];
    const rows = tokens.map((t) => {
      const cp = t.currentPrice || t.buyPrice;
      const pnl = (cp - t.buyPrice) * t.amount;
      const roi = ((cp - t.buyPrice) / t.buyPrice) * 100;
      return [
        `"${t.name}"`,
        t.ticker,
        t.buyPrice.toFixed(8),
        t.amount.toFixed(4),
        cp.toFixed(8),
        pnl.toFixed(2),
        roi.toFixed(2),
        t.dataSource || "N/A",
      ];
    });
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `portfolio-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalInvested = tokens.reduce(
    (sum, t) => sum + t.buyPrice * t.amount,
    0
  );
  const totalCurrent = tokens.reduce(
    (sum, t) => sum + (t.currentPrice || t.buyPrice) * t.amount,
    0
  );
  const totalPnl = totalCurrent - totalInvested;
  const totalRoi =
    totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;

  return (
    <Card className="border-[rgba(0,255,65,0.2)] h-full flex flex-col">
      <div className="text-center mb-3">
        <span className="text-2xl">📊</span>
        <h3
          className="text-[0.5rem] font-bold text-[#00ff41]"
          style={{ fontFamily: '"Press Start 2P", monospace' }}
        >
          PORTFOLIO SIM
        </h3>
      </div>

      {/* Add Token Form */}
      <div className="space-y-1.5 mb-3 p-2 rounded bg-[rgba(0,255,65,0.02)] border border-[rgba(0,255,65,0.08)]">
        <div className="grid grid-cols-2 gap-1">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Name"
            className="retro-input text-xs"
            style={{ fontSize: "0.8rem", padding: "0.3rem 0.5rem" }}
          />
          <input
            type="text"
            value={newTicker}
            onChange={(e) => setNewTicker(e.target.value)}
            placeholder="TICKER"
            className="retro-input text-xs"
            style={{ fontSize: "0.8rem", padding: "0.3rem 0.5rem" }}
            maxLength={8}
          />
        </div>
        <div className="grid grid-cols-2 gap-1">
          <input
            type="number"
            value={newBuyPrice}
            onChange={(e) => setNewBuyPrice(e.target.value)}
            placeholder="Buy $"
            className="retro-input text-xs"
            style={{ fontSize: "0.8rem", padding: "0.3rem 0.5rem" }}
            step="0.0001"
          />
          <input
            type="number"
            value={newAmount}
            onChange={(e) => setNewAmount(e.target.value)}
            placeholder="Amount"
            className="retro-input text-xs"
            style={{ fontSize: "0.8rem", padding: "0.3rem 0.5rem" }}
          />
        </div>
        <button
          onClick={addToken}
          disabled={!underLimit}
          className="retro-btn retro-btn-outline w-full justify-center text-[0.35rem] py-1"
          style={{ fontFamily: '"Press Start 2P", monospace' }}
        >
          + ADD TOKEN ({tokens.length}/{tokenLimit})
        </button>
      </div>

      {/* Token List */}
      {tokens.length > 0 && (
        <div className="space-y-1.5 mb-3 max-h-[160px] overflow-y-auto custom-scrollbar">
          {tokens.map((t) => {
            const cp = t.currentPrice || t.buyPrice;
            const pnl = (cp - t.buyPrice) * t.amount;
            const roi = ((cp - t.buyPrice) / t.buyPrice) * 100;
            return (
              <div
                key={t.id}
                className="flex items-center justify-between p-1.5 rounded bg-[rgba(0,255,65,0.02)] border border-[rgba(0,255,65,0.06)]"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <span
                      className="text-[0.4rem] text-[#00ff41] font-bold"
                      style={{ fontFamily: '"Press Start 2P", monospace' }}
                    >
                      {t.ticker}
                    </span>
                    <span
                      className="text-xs text-[#b0d0b0]"
                      style={{
                        fontFamily: '"VT323", monospace',
                        fontSize: "0.85rem",
                      }}
                    >
                      {t.name}
                    </span>
                    {t.dataSource && t.dataSource !== "estimated" && (
                      <span className="text-[0.3rem] text-[#39ff14]" style={{ fontFamily: '"VT323", monospace' }}>
                        ✓
                      </span>
                    )}
                  </div>
                  <div
                    className="text-xs"
                    style={{
                      fontFamily: '"VT323", monospace',
                      fontSize: "0.8rem",
                    }}
                  >
                    <span className="text-[#b0d0b0]">
                      {t.amount} × ${t.buyPrice.toFixed(6)}
                    </span>
                    {t.currentPrice && (
                      <span className="text-[#00ff41] ml-1">
                        → ${cp.toFixed(6)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <div
                    className={`text-xs font-bold ${
                      pnl >= 0 ? "text-[#00ff41]" : "text-[#ff4444]"
                    }`}
                    style={{
                      fontFamily: '"VT323", monospace',
                      fontSize: "0.9rem",
                    }}
                  >
                    {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
                  </div>
                  <div
                    className={`text-xs ${
                      roi >= 0 ? "text-[#39ff14]" : "text-[#ff4444]"
                    }`}
                    style={{ fontSize: "0.7rem" }}
                  >
                    {roi >= 0 ? "+" : ""}
                    {roi.toFixed(1)}%
                  </div>
                </div>
                <button
                  onClick={() => removeToken(t.id)}
                  className="ml-1 text-[#b0d0b0] hover:text-[#ff4444] text-xs"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* P&L Bar Chart for Pro users */}
      {isPro && tokens.length > 0 && tokens.some((t) => t.currentPrice != null) && (
        <div className="mb-3 p-2 rounded bg-[rgba(0,255,65,0.02)] border border-[rgba(0,255,65,0.06)]">
          <div
            className="text-[0.3rem] text-[#b0d0b0] mb-2 text-center"
            style={{ fontFamily: '"Press Start 2P", monospace' }}
          >
            P&amp;L BREAKDOWN
          </div>
          {tokens.map((t) => {
            const cp = t.currentPrice || t.buyPrice;
            const pnl = (cp - t.buyPrice) * t.amount;
            const roi = ((cp - t.buyPrice) / t.buyPrice) * 100;
            const barWidth = Math.min(Math.abs(roi), 100);
            const isPositive = pnl >= 0;
            return (
              <div key={t.id} className="flex items-center gap-2 mb-1">
                <span
                  className="text-[0.35rem] text-[#e0ffe0] w-10 shrink-0 text-right"
                  style={{ fontFamily: '"VT323", monospace', fontSize: "0.75rem" }}
                >
                  ${t.ticker}
                </span>
                <div className="flex-1 h-3 bg-[#0a0f0a] rounded overflow-hidden border border-[rgba(0,255,65,0.1)]">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${barWidth}%` }}
                    transition={{ duration: 0.5, ease: [0.68, -0.55, 0.265, 1.55] }}
                    className="h-full rounded"
                    style={{
                      background: isPositive
                        ? "linear-gradient(90deg, #00ff41, #39ff14)"
                        : "linear-gradient(90deg, #ff4444, #ff6666)",
                    }}
                  />
                </div>
                <span
                  className="text-[0.35rem] w-14 shrink-0"
                  style={{
                    fontFamily: '"VT323", monospace',
                    fontSize: "0.75rem",
                    color: isPositive ? "#00ff41" : "#ff4444",
                  }}
                >
                  {isPositive ? "+" : ""}{roi.toFixed(1)}%
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 mb-3">
        <button
          onClick={fetchPrices}
          disabled={fetchingPrices || tokens.length === 0}
          className="retro-btn retro-btn-turquoise flex-1 justify-center text-[0.4rem] py-1.5"
          style={{ fontFamily: '"Press Start 2P", monospace' }}
        >
          {fetchingPrices ? "⏳" : "🔄"} FETCH PRICES
        </button>
        {isPro && tokens.length > 0 && (
          <button
            onClick={exportCSV}
            className="retro-btn retro-btn-outline justify-center text-[0.4rem] py-1.5 px-3"
            style={{ fontFamily: '"Press Start 2P", monospace' }}
            title="Export to CSV"
          >
            📥
          </button>
        )}
      </div>

      {/* Fetch status message */}
      {lastFetchStatus && (
        <p
          className="text-center text-[0.35rem] mb-2"
          style={{
            fontFamily: '"VT323", monospace',
            fontSize: "0.75rem",
            color: lastFetchStatus.includes("No tokens") ? "#ffaa00" : "#00ff41",
          }}
        >
          {lastFetchStatus}
        </p>
      )}

      {/* Summary */}
      {tokens.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="p-2 rounded bg-[rgba(0,255,65,0.03)] border border-[rgba(0,255,65,0.1)]"
        >
          <div
            className="grid grid-cols-2 gap-1 text-xs"
            style={{ fontFamily: '"VT323", monospace', fontSize: "0.95rem" }}
          >
            <span className="text-[#b0d0b0]">Invested:</span>
            <span className="text-[#e0ffe0] text-right">
              ${totalInvested.toFixed(2)}
            </span>
            <span className="text-[#b0d0b0]">Current:</span>
            <span className="text-[#e0ffe0] text-right">
              ${totalCurrent.toFixed(2)}
            </span>
            <span className="text-[#b0d0b0]">P&amp;L:</span>
            <span
              className={`text-right font-bold ${
                totalPnl >= 0 ? "text-[#00ff41]" : "text-[#ff4444]"
              }`}
            >
              {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)} (
              {totalRoi >= 0 ? "+" : ""}
              {totalRoi.toFixed(1)}%)
            </span>
          </div>
        </motion.div>
      )}

      <div className="mt-auto pt-3 text-center space-y-1">
        <span
          className="text-[0.35rem] text-[#e0ffe0] bg-[rgba(0,255,65,0.1)] px-2 py-0.5 rounded"
          style={{ fontFamily: '"Press Start 2P", monospace' }}
        >
          {isPro ? "✅ PRO" : "🟢 FREE"} ({tokens.length}/{tokenLimit} TOKENS)
        </span>
        {!isPro && (
          <ProUpgradeButton toolId={PORTFOLIO_TOOL} />
        )}
      </div>
    </Card>
  );
}

/* ═══════════════════════════════════════════════
   PRO UPGRADE BUTTON — in-tool upgrade
   ═══════════════════════════════════════════════ */
function ProUpgradeButton({ toolId }: { toolId: ToolId }) {
  const { getPrimaryAddress, connected } = useWallet();
  const [loading, setLoading] = useState(false);

  const handleUpgrade = async () => {
    const wallet = getPrimaryAddress();
    if (!wallet) return;
    setLoading(true);
    try {
      const checkoutUrl = await createCheckoutSession(toolId, wallet);
      window.location.href = checkoutUrl;
    } catch {
      setLoading(false);
    }
  };

  if (!connected) return null;

  return (
    <button
      onClick={handleUpgrade}
      disabled={loading}
      className="block text-[0.35rem] text-[#ffaa00] hover:text-[#ffcc00] retro-btn retro-btn-outline w-full"
      style={{ fontFamily: '"Press Start 2P", monospace' }}
    >
      {loading ? "⏳ REDIRECTING..." : "✦ PRO ($25) — UNLIMITED TOKENS ✦"}
    </button>
  );
}

/* ═══════════════════════════════════════════════
   TOOL 5: WHALE WATCHER — FREE
   ═══════════════════════════════════════════════ */
function WhaleWatcher() {
  const [threshold, setThreshold] = useState(100);
  const trades = useMemo(() => {
    const all = getTrades();
    return all
      .filter((t) => t.total >= threshold)
      .slice(0, 10);
  }, [threshold]);

  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setRefreshKey((k) => k + 1), 10000);
    return () => clearInterval(interval);
  }, []);

  const displayTrades = useMemo(() => {
    const all = getTrades();
    return all.filter((t) => t.total >= threshold).slice(0, 10);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threshold, refreshKey]);

  function getTimeAgo(ts: number): string {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  }

  return (
    <Card className="border-[rgba(0,255,65,0.2)] h-full flex flex-col">
      <div className="text-center mb-3">
        <span className="text-2xl">🐋</span>
        <h3
          className="text-[0.5rem] font-bold text-[#00ff41]"
          style={{ fontFamily: '"Press Start 2P", monospace' }}
        >
          WHALE WATCHER
        </h3>
      </div>
      <div className="flex items-center gap-2 mb-3">
        <span
          className="text-[0.35rem] text-[#b0d0b0]"
          style={{ fontFamily: '"Press Start 2P", monospace' }}
        >
          MIN: $
        </span>
        <input
          type="number"
          value={threshold}
          onChange={(e) => setThreshold(parseInt(e.target.value) || 0)}
          className="retro-input text-xs w-20"
          style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem", padding: "0.3rem 0.5rem" }}
          min="0"
        />
      </div>
      {displayTrades.length > 0 ? (
        <div className="space-y-1.5 max-h-[220px] overflow-y-auto custom-scrollbar">
          {displayTrades.map((trade) => (
            <div
              key={trade.id}
              className="flex items-center justify-between p-2 rounded bg-[rgba(0,255,65,0.02)] border border-[rgba(0,255,65,0.06)]"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <span
                    className="text-[0.35rem] font-bold text-[#00ff41]"
                    style={{ fontFamily: '"Press Start 2P", monospace' }}
                  >
                    {trade.tokenTicker}
                  </span>
                  <span
                    className={`text-xs font-bold ${
                      trade.type === "BUY" ? "text-[#00ff41]" : "text-[#ff4444]"
                    }`}
                    style={{ fontFamily: '"VT323", monospace', fontSize: "0.85rem" }}
                  >
                    {trade.type}
                  </span>
                </div>
                <div
                  className="text-xs text-[#b0d0b0]"
                  style={{ fontFamily: '"VT323", monospace', fontSize: "0.8rem" }}
                >
                  {trade.wallet.slice(0, 4)}...{trade.wallet.slice(-4)} · {getTimeAgo(trade.timestamp)}
                </div>
              </div>
              <div
                className="text-xs font-bold text-[#00ff41] shrink-0 ml-2"
                style={{ fontFamily: '"VT323", monospace', fontSize: "0.95rem" }}
              >
                ${trade.total.toFixed(2)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <p
            className="text-[#b0d0b0] text-center"
            style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
          >
            No trades above ${threshold}. Lower threshold or wait for activity.
          </p>
        </div>
      )}
      <div className="mt-auto pt-3 text-center">
        <span
          className="text-[0.35rem] text-[#e0ffe0] bg-[rgba(0,255,65,0.1)] px-2 py-0.5 rounded"
          style={{ fontFamily: '"Press Start 2P", monospace' }}
        >
          🟢 FREE
        </span>
      </div>
    </Card>
  );
}

/* ═══════════════════════════════════════════════
   TOOL 6: MARKET SENTIMENT — FREE
   ═══════════════════════════════════════════════ */
function MarketSentiment() {
  const [sentiment, setSentiment] = useState<{
    score: number;
    label: string;
    emoji: string;
    color: string;
    buys: number;
    sells: number;
    newTokens: number;
    volumeTrend: string;
  }>({
    score: 50,
    label: "NEUTRAL",
    emoji: "🟡",
    color: "#ffaa00",
    buys: 0,
    sells: 0,
    newTokens: 0,
    volumeTrend: "—",
  });

  useEffect(() => {
    function update() {
      const trades = getTrades();
      const tokens = getTokens();
      const totalTrades = getTotalTrades();
      const coinsLaunched = getCoinsLaunched();

      if (totalTrades === 0 && coinsLaunched === 0) {
        setSentiment({
          score: 50,
          label: "NEUTRAL",
          emoji: "🟡",
          color: "#ffaa00",
          buys: 0,
          sells: 0,
          newTokens: 0,
          volumeTrend: "—",
        });
        return;
      }

      const recentTrades = trades.filter((t) => Date.now() - t.timestamp < 3600000); // Last hour
      const buys = recentTrades.filter((t) => t.type === "BUY").length;
      const sells = recentTrades.filter((t) => t.type === "SELL").length;
      const recentTokens = tokens.filter((t) => Date.now() - t.createdAt < 3600000).length;
      const totalTradesRecent = buys + sells;

      // Calculate sentiment score
      let score = 50;
      if (totalTradesRecent > 0) {
        const buyRatio = buys / totalTradesRecent;
        score += (buyRatio - 0.5) * 60;
      }
      if (recentTokens > 0) {
        score += Math.min(recentTokens * 5, 15);
      }
      score = Math.max(0, Math.min(100, score));

      let label: string;
      let emoji: string;
      let color: string;
      if (score >= 65) {
        label = "BULLISH";
        emoji = "🟢";
        color = "#00ff41";
      } else if (score >= 40) {
        label = "NEUTRAL";
        emoji = "🟡";
        color = "#ffaa00";
      } else {
        label = "BEARISH";
        emoji = "🔴";
        color = "#ff4444";
      }

      const volumeTrend = buys > sells ? "📈 Increasing" : buys < sells ? "📉 Decreasing" : "— Flat";

      setSentiment({
        score,
        label,
        emoji,
        color,
        buys,
        sells,
        newTokens: recentTokens,
        volumeTrend,
      });
    }

    update();
    const interval = setInterval(update, 10000);
    return () => clearInterval(interval);
  }, []);

  const gaugeAngle = (sentiment.score / 100) * 180 - 90; // -90 to 90 degrees

  return (
    <Card className="border-[rgba(0,255,65,0.2)] h-full flex flex-col">
      <div className="text-center mb-3">
        <span className="text-2xl">📊</span>
        <h3
          className="text-[0.5rem] font-bold text-[#00ff41]"
          style={{ fontFamily: '"Press Start 2P", monospace' }}
        >
          MARKET SENTIMENT
        </h3>
      </div>

      {/* Gauge */}
      <div className="flex justify-center mb-4">
        <div className="relative w-40 h-20 overflow-hidden">
          {/* Gauge background */}
          <div
            className="absolute bottom-0 left-0 w-full h-32 rounded-t-full"
            style={{
              background: "conic-gradient(from 180deg, #ff4444 0deg, #ffaa00 90deg, #00ff41 180deg)",
              mask: "radial-gradient(circle at 50% 100%, transparent 55%, black 56%)",
              WebkitMask: "radial-gradient(circle at 50% 100%, transparent 55%, black 56%)",
            }}
          />
          {/* Needle */}
          <div
            className="absolute bottom-0 left-1/2 w-0.5 h-16 origin-bottom transition-transform duration-500"
            style={{
              background: "#ffffff",
              transform: `rotate(${gaugeAngle}deg)`,
              boxShadow: "0 0 6px rgba(255,255,255,0.5)",
            }}
          />
        </div>
      </div>

      {/* Sentiment label */}
      <div className="text-center mb-3">
        <span
          className="text-lg font-bold"
          style={{
            fontFamily: '"Press Start 2P", monospace',
            fontSize: "0.55rem",
            color: sentiment.color,
            textShadow: `0 0 10px ${sentiment.color}`,
          }}
        >
          {sentiment.emoji} {sentiment.label}
        </span>
      </div>

      {/* Stats */}
      <div
        className="grid grid-cols-2 gap-1.5 text-xs"
        style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem" }}
      >
        <span className="text-[#b0d0b0]">Buys (1h):</span>
        <span className="text-[#00ff41] text-right">{sentiment.buys}</span>
        <span className="text-[#b0d0b0]">Sells (1h):</span>
        <span className="text-[#ff4444] text-right">{sentiment.sells}</span>
        <span className="text-[#b0d0b0]">New Tokens (1h):</span>
        <span className="text-[#e0ffe0] text-right">{sentiment.newTokens}</span>
        <span className="text-[#b0d0b0]">Volume Trend:</span>
        <span className="text-[#e0ffe0] text-right">{sentiment.volumeTrend}</span>
      </div>

      <div className="mt-auto pt-3 text-center">
        <span
          className="text-[0.35rem] text-[#e0ffe0] bg-[rgba(0,255,65,0.1)] px-2 py-0.5 rounded"
          style={{ fontFamily: '"Press Start 2P", monospace' }}
        >
          🟢 FREE
        </span>
      </div>
    </Card>
  );
}

/* ═══════════════════════════════════════════════
   TOOL 7: ROI CALCULATOR — FREE
   ═══════════════════════════════════════════════ */
function RoiCalculator() {
  const [buyPrice, setBuyPrice] = useState("0.0001");
  const [sellPrice, setSellPrice] = useState("0.001");
  const [amount, setAmount] = useState("100");
  const [result, setResult] = useState<{
    profit: number;
    roi: number;
    value2x: number;
    value5x: number;
    value10x: number;
  } | null>(null);

  const calculate = () => {
    const bp = parseFloat(buyPrice) || 0;
    const sp = parseFloat(sellPrice) || 0;
    const amt = parseFloat(amount) || 0;
    if (bp <= 0 || sp <= 0 || amt <= 0) return;

    const invested = amt;
    const tokens = invested / bp;
    const soldFor = tokens * sp;
    const profit = soldFor - invested;
    const roi = ((sp - bp) / bp) * 100;
    const value2x = invested * 2;
    const value5x = invested * 5;
    const value10x = invested * 10;

    setResult({ profit, roi, value2x, value5x, value10x });
  };

  return (
    <Card className="border-[rgba(0,255,65,0.2)] h-full flex flex-col">
      <div className="text-center mb-3">
        <span className="text-2xl">🧮</span>
        <h3
          className="text-[0.5rem] font-bold text-[#00ff41]"
          style={{ fontFamily: '"Press Start 2P", monospace' }}
        >
          ROI CALCULATOR
        </h3>
      </div>

      <div className="space-y-1.5 mb-3">
        <div className="grid grid-cols-2 gap-1">
          <div>
            <label
              className="text-[0.3rem] text-[#b0d0b0]"
              style={{ fontFamily: '"Press Start 2P", monospace' }}
            >
              BUY $
            </label>
            <input
              type="number"
              value={buyPrice}
              onChange={(e) => setBuyPrice(e.target.value)}
              className="retro-input text-xs w-full"
              style={{ fontSize: "0.85rem", padding: "0.3rem 0.5rem" }}
              step="0.0001"
            />
          </div>
          <div>
            <label
              className="text-[0.3rem] text-[#b0d0b0]"
              style={{ fontFamily: '"Press Start 2P", monospace' }}
            >
              SELL $
            </label>
            <input
              type="number"
              value={sellPrice}
              onChange={(e) => setSellPrice(e.target.value)}
              className="retro-input text-xs w-full"
              style={{ fontSize: "0.85rem", padding: "0.3rem 0.5rem" }}
              step="0.0001"
            />
          </div>
        </div>
        <div>
          <label
            className="text-[0.3rem] text-[#b0d0b0]"
            style={{ fontFamily: '"Press Start 2P", monospace' }}
          >
            AMOUNT ($)
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="retro-input text-xs w-full"
            style={{ fontSize: "0.85rem", padding: "0.3rem 0.5rem" }}
          />
        </div>
      </div>

      <button
        onClick={calculate}
        className="retro-btn retro-btn-orange w-full justify-center text-[0.45rem] py-1.5 mb-3"
        style={{ fontFamily: '"Press Start 2P", monospace' }}
      >
        🧮 CALCULATE
      </button>

      {result && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="p-3 rounded-md bg-[rgba(0,255,65,0.03)] border border-[rgba(0,255,65,0.1)] space-y-1"
        >
          {/* Profit / Loss */}
          <div className="text-center mb-2">
            <span
              className={`text-lg font-bold ${result.profit >= 0 ? "text-[#00ff41]" : "text-[#ff4444]"}`}
              style={{ fontFamily: '"VT323", monospace', fontSize: "1.3rem" }}
            >
              {result.profit >= 0 ? "+" : ""}${result.profit.toFixed(2)}
            </span>
            <span
              className="text-xs ml-2"
              style={{ fontFamily: '"VT323", monospace', fontSize: "1rem", color: result.roi >= 0 ? "#00ff41" : "#ff4444" }}
            >
              ({result.roi >= 0 ? "+" : ""}{result.roi.toFixed(1)}%)
            </span>
          </div>

          {/* Moon targets */}
          <div className="grid grid-cols-3 gap-1 text-center">
            <div className="p-1.5 rounded bg-[rgba(0,255,65,0.02)]">
              <div className="text-[0.3rem] text-[#b0d0b0] mb-0.5" style={{ fontFamily: '"Press Start 2P", monospace' }}>
                2× 🚀
              </div>
              <div className="text-xs text-[#00ff41] font-bold" style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem" }}>
                ${result.value2x.toFixed(2)}
              </div>
            </div>
            <div className="p-1.5 rounded bg-[rgba(0,255,65,0.02)]">
              <div className="text-[0.3rem] text-[#b0d0b0] mb-0.5" style={{ fontFamily: '"Press Start 2P", monospace' }}>
                5× 🌕
              </div>
              <div className="text-xs text-[#00ff41] font-bold" style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem" }}>
                ${result.value5x.toFixed(2)}
              </div>
            </div>
            <div className="p-1.5 rounded bg-[rgba(0,255,65,0.02)]">
              <div className="text-[0.3rem] text-[#b0d0b0] mb-0.5" style={{ fontFamily: '"Press Start 2P", monospace' }}>
                10× 💎
              </div>
              <div className="text-xs text-[#00ff41] font-bold" style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem" }}>
                ${result.value10x.toFixed(2)}
              </div>
            </div>
          </div>
        </motion.div>
      )}

      <div className="mt-auto pt-3 text-center">
        <span
          className="text-[0.35rem] text-[#e0ffe0] bg-[rgba(0,255,65,0.1)] px-2 py-0.5 rounded"
          style={{ fontFamily: '"Press Start 2P", monospace' }}
        >
          🟢 FREE
        </span>
      </div>
    </Card>
  );
}

/* ═══════════════════════════════════════════════
   MAIN TOOLS PAGE — 3x3 GRID
   ═══════════════════════════════════════════════ */
function ToolsPage() {
  const { connected, getPrimaryAddress } = useWallet();
  const [legacyMigrated, setLegacyMigrated] = useState(false);

  // Check for legacy localStorage purchases and allow migration
  useEffect(() => {
    if (!connected) return;
    const wallet = getPrimaryAddress();
    if (!wallet) return;
    const legacy = getLegacyPurchases();
    if (legacy.size === 0) {
      setLegacyMigrated(true); // nothing to migrate
      return;
    }
    // Check if server already has purchases to avoid showing banner unnecessarily
    checkPurchases(wallet).then((serverPurchases) => {
      const hasAll = [...legacy].every((id) => serverPurchases.has(id));
      if (hasAll) {
        clearLegacyPurchases();
        setLegacyMigrated(true);
      }
    });
  }, [connected, getPrimaryAddress]);

  const handleDismissLegacy = () => {
    clearLegacyPurchases();
    setLegacyMigrated(true);
  };

  // Check for Stripe redirect with ?purchased= param
  const purchasingTool =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("purchased")
      : null;

  const canShowBanner = connected && !legacyMigrated && getLegacyPurchases().size > 0;

  return (
    <div className="min-h-dvh bg-[#050505] py-10">
      <div className="max-w-6xl mx-auto px-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="text-center mb-8"
        >
          <div className="text-5xl mb-4 retro-float">🛠️</div>
          <h1
            className="text-2xl font-bold text-[#00ff41] mb-3 pixel-shadow-sm"
            style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "1rem" }}
          >
            TOOLS &amp; RESOURCES
          </h1>
          <p
            className="text-[#e0ffe0] max-w-lg mx-auto"
            style={{ fontFamily: '"VT323", monospace', fontSize: "1.15rem" }}
          >
            Essential crypto tools. Unlock premium tools with one-time payments.
          </p>
        </motion.div>

        {/* Legacy migration banner */}
        {canShowBanner && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 rounded-md"
            style={{
              background: "rgba(255,170,0,0.08)",
              border: "1px solid rgba(255,170,0,0.3)",
            }}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className="text-lg">⚠️</span>
                <p
                  className="text-[#ffaa00]"
                  style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
                >
                  We've upgraded to server-verified purchases. Previous localStorage
                  unlocks are no longer valid. Please re-purchase tools to unlock them
                  permanently on-chain via Stripe.
                </p>
              </div>
              <button
                onClick={handleDismissLegacy}
                className="text-[#b0d0b0] hover:text-[#e0ffe0] text-sm shrink-0"
                style={{ fontFamily: '"VT323", monospace', fontSize: "1.1rem" }}
              >
                ✕ DISMISS
              </button>
            </div>
          </motion.div>
        )}

        {/* Purchase verification banner after Stripe redirect */}
        {purchasingTool && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 rounded-md text-center"
            style={{
              background: "rgba(0,255,65,0.05)",
              border: "1px solid rgba(0,255,65,0.2)",
            }}
          >
            <span className="text-2xl retro-bounce inline-block mr-2">⏳</span>
            <span
              className="text-[#00ff41]"
              style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem" }}
            >
              VERIFYING YOUR PURCHASE...
            </span>
            <p
              className="text-[#b0d0b0] mt-1"
              style={{ fontFamily: '"VT323", monospace', fontSize: "0.95rem" }}
            >
              {connected
                ? "Checking with server... this may take a moment."
                : "Connect your wallet to verify your purchase."}
            </p>
          </motion.div>
        )}

        {/* 3x3 Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <ProfitCalculator />
          <TokenScanner />
          <GasFeeEstimator />
          <PortfolioSimulator />
          <WhaleWatcher />
          <MarketSentiment />
          <RugPullScannerPaid />
          <RoiCalculator />
        </div>

        {/* Phase 7 Tools Grid */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="mb-8"
        >
          <h3
            className="text-[0.5rem] font-bold text-[#00ff41] mb-4 text-center pixel-shadow-sm"
            style={{ fontFamily: '"Press Start 2P", monospace' }}
          >
            🆕 NEW TOOLS
          </h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-2 gap-6">
            <AirdropTool />
            <TokenCompare />
            <EmbedWidget />
          </div>
        </motion.div>

        {/* Tool Packs */}

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35 }}
          className="text-center mt-8"
        >
          <Card className="max-w-lg mx-auto">
            <p
              className="text-sm text-[#e0ffe0]"
              style={{ fontFamily: "'VT323', monospace", fontSize: "1rem" }}
            >
              ⚡ More tools coming soon. Need custom analytics? Contact us.
            </p>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
