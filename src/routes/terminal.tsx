import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  getTokens,
  getTradesForToken,
  addTrade,
  updateTokenPrice,
  getBondingCurveState,
  saveBondingCurveState,
  fetchTradesFromServer,
  fetchAllTradesFromServer,
  searchTokens,
  type TradeData,
  type TokenData,
} from "~/services/tracker";
import { useWallet, truncateAddress } from "~/context/WalletContext";
import {
  getBondingCurvePrice,
  getBuyFeeBreakdown,
  applyBuyToState,
} from "~/services/bondingCurve";
import { sendBondingCurveTransaction, calculateFeeBreakdown } from "~/services/walletTransactions";
import { TransactionModal, initialModalState, type TransactionModalState } from "~/components/TransactionModal";
import GameCandlestickChart, { type Timeframe, TIMEFRAME_MS } from "~/components/GameCandlestickChart";
import { aggregateOHLC, type OHLCData } from "~/utils/aggregateOHLC";
import { isSupported, getPermission, requestPermission, isNotificationsEnabled, playArcadeBeep } from "~/services/notifications";
import { HiMiniMagnifyingGlass, HiMiniXMark, HiMiniStar } from "react-icons/hi2";

export const Route = createFileRoute("/terminal")({
  component: TerminalPage,
});

// ═══════════════════════════════════════════════
// FUN FACTS
// ═══════════════════════════════════════════════

const FUN_FACTS: string[] = [
  "The first meme coin, Dogecoin, was created in 2013 as a joke.",
  "In crypto, 'WAGMI' means We're All Gonna Make It.",
  "The term 'HODL' came from a 2013 forum post typo of 'HOLD'.",
  "Shiba Inu (SHIB) was created as a Dogecoin killer in 2020.",
  "Bitcoin's creator, Satoshi Nakamoto, remains anonymous to this day.",
  "There are over 25,000 different cryptocurrencies in existence.",
  "The first Bitcoin transaction was for 10,000 BTC — for two pizzas.",
  "Ethereum introduced smart contracts, enabling decentralized apps.",
  "A 'rug pull' is when developers abandon a project and run away with investor funds.",
  "Solana can process up to 65,000 transactions per second.",
  "NFT stands for Non-Fungible Token — each one is unique.",
  "'DeFi' stands for Decentralized Finance.",
  "The total crypto market cap once exceeded $3 trillion.",
  "Proof of Work mining uses more electricity than some small countries.",
  "'FOMO' = Fear Of Missing Out — what drives many traders!",
];

function FunFacts() {
  const [factIndex, setFactIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setFactIndex((prev) => (prev + 1) % FUN_FACTS.length);
    }, 20000);
    return () => clearInterval(interval);
  }, []);

  const displayText = FUN_FACTS[factIndex] || "";

  return (
    <div className="max-w-3xl mx-auto px-4 mb-8 mt-8">
      <div
        className="retro-card p-4 text-center"
        style={{
          borderColor: "rgba(0,255,65,0.15)",
          boxShadow: "0 0 15px rgba(0,255,65,0.05)",
        }}
      >
        <div className="flex items-center justify-center gap-2 mb-2">
          <span className="text-lg">💡</span>
          <span
            className="text-[#00ff41] font-bold"
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: "0.4rem",
              textShadow: "0 0 8px rgba(0,255,65,0.3)",
            }}
          >
            FUN FACT
          </span>
        </div>
        <motion.p
          key={factIndex}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="text-[#e0ffe0]"
          style={{
            fontFamily: '"VT323", monospace',
            fontSize: "1.1rem",
            lineHeight: "1.4",
          }}
        >
          {displayText}
        </motion.p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// TOP 5 TOKENS — Mini Cards with Sparkline
// ═══════════════════════════════════════════════

interface TopTokenCard {
  token: TokenData;
  tradeCount: number;
  volume: number;
  lastPrice: number;
  priceChange: number;
}

function MiniSparkline({ data, width, height, color }: { data: number[]; width: number; height: number; color: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length < 2) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const stepX = width / (data.length - 1);

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = i * stepX;
      const y = height - ((data[i] - min) / range) * height;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Fill area under line
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, color + "30");
    grad.addColorStop(1, color + "00");
    ctx.fillStyle = grad;
    ctx.fill();
  }, [data, width, height, color]);

  if (data.length < 2) {
    return <div style={{ width, height, background: "rgba(0,255,65,0.05)" }} />;
  }
  return <canvas ref={canvasRef} style={{ width, height, display: "block" }} />;
}

function TopTokenCards({
  tokens,
  activeTokenId,
  onSelect,
  trades,
}: {
  tokens: TokenData[];
  activeTokenId: string;
  onSelect: (id: string) => void;
  trades: TradeData[];
}) {
  const top5 = useMemo(() => {
    const tokenStats = tokens.map((t) => {
      const tokenTrades = trades.filter((tr) => tr.tokenId === t.id);
      const prices = tokenTrades.map((tr) => tr.price);
      return {
        token: t,
        tradeCount: tokenTrades.length,
        volume: tokenTrades.reduce((s, tr) => s + tr.total, 0),
        lastPrice: prices.length > 0 ? prices[prices.length - 1] : t.price,
        priceChange: prices.length >= 2
          ? ((prices[prices.length - 1] - prices[0]) / prices[0]) * 100
          : 0,
      };
    });
    return tokenStats
      .filter((s) => s.tradeCount > 0)
      .sort((a, b) => b.tradeCount - a.tradeCount)
      .slice(0, 5);
  }, [tokens, trades]);

  if (top5.length === 0) return null;

  return (
    <div className="flex gap-3 overflow-x-auto custom-scrollbar pb-2">
      {top5.map((card) => {
        const isActive = card.token.id === activeTokenId;
        const isUp = card.priceChange >= 0;
        const prices = trades
          .filter((tr) => tr.tokenId === card.token.id)
          .map((tr) => tr.price);
        const sparklineData = prices.length > 0 ? prices : [card.token.price, card.token.price];

        return (
          <motion.button
            key={card.token.id}
            onClick={() => onSelect(card.token.id)}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="retro-card p-3 shrink-0 cursor-pointer transition-all duration-150 min-w-[160px] text-left"
            style={{
              borderColor: isActive ? "#00ff41" : "rgba(0,255,65,0.2)",
              boxShadow: isActive ? "0 0 12px rgba(0,255,65,0.2)" : undefined,
              background: isActive ? "rgba(0,255,65,0.05)" : undefined,
            }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span
                className="font-bold text-[#ffffff] truncate"
                style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem" }}
              >
                ${card.token.ticker}
              </span>
              {isActive && <HiMiniStar className="text-[#ffd23f] shrink-0" size={10} />}
            </div>
            <div className="flex items-baseline gap-2 mb-1">
              <span
                className="text-[#00ff41]"
                style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
              >
                ${card.lastPrice < 0.001 ? card.lastPrice.toFixed(6) : card.lastPrice.toFixed(4)}
              </span>
              <span
                style={{
                  fontFamily: '"VT323", monospace',
                  fontSize: "0.85rem",
                  color: isUp ? "#00ff41" : "#ff4444",
                }}
              >
                {isUp ? "▲" : "▼"}{Math.abs(card.priceChange).toFixed(1)}%
              </span>
            </div>
            <MiniSparkline data={sparklineData} width={138} height={30} color={isUp ? "#00ff41" : "#ff4444"} />
            <div
              className="text-[#b0d0b0] mt-1"
              style={{ fontFamily: '"VT323", monospace', fontSize: "0.8rem" }}
            >
              {card.tradeCount} trades · ${card.volume < 1 ? card.volume.toFixed(2) : card.volume.toFixed(0)} vol
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════
// TOKEN SEARCH
// ═══════════════════════════════════════════════

function TokenSearchBar({
  onSelect,
  tokens,
}: {
  onSelect: (id: string) => void;
  tokens: TokenData[];
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TokenData[]>([]);
  const [focused, setFocused] = useState(false);
  const [serverResults, setServerResults] = useState<TokenData[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Local search (instant)
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const q = query.toLowerCase();
    const local = tokens.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.ticker.toLowerCase().includes(q) ||
        (t.tokenAddress && t.tokenAddress.toLowerCase().includes(q))
    );
    setResults(local.slice(0, 10));
  }, [query, tokens]);

  // Server search (debounced)
  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) {
      setServerResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const server = await searchTokens(query.trim());
      setServerResults(server);
      setSearching(false);
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Merge results, deduplicate
  const allResults = useMemo(() => {
    const seen = new Set<string>();
    const merged: TokenData[] = [];
    for (const r of [...results, ...serverResults]) {
      if (!seen.has(r.id)) {
        seen.add(r.id);
        merged.push(r);
      }
    }
    return merged.slice(0, 10);
  }, [results, serverResults]);

  const showDropdown = focused && query.trim().length > 0;

  const handleSelect = (id: string) => {
    onSelect(id);
    setQuery("");
    setResults([]);
    setServerResults([]);
    setFocused(false);
    inputRef.current?.blur();
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-2 retro-input" style={{
        padding: "0.4rem 0.6rem",
        background: "#0d120d",
      }}>
        <HiMiniMagnifyingGlass className="text-[#00ff41] shrink-0" size={14} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 200)}
          placeholder="Search by name, ticker, or address..."
          className="flex-1 bg-transparent text-[#00ff41] placeholder-[#2d7a30] outline-none"
          style={{ fontFamily: '"VT323", monospace', fontSize: "1.05rem" }}
        />
        {searching && (
          <span className="text-[#ffd23f] text-xs" style={{ fontFamily: '"VT323", monospace' }}>
            ...
          </span>
        )}
        {query && (
          <button
            onClick={() => { setQuery(""); setResults([]); setServerResults([]); inputRef.current?.focus(); }}
            className="text-[#b0d0b0] hover:text-[#00ff41]"
          >
            <HiMiniXMark size={14} />
          </button>
        )}
      </div>

      {/* Dropdown */}
      <AnimatePresence>
        {showDropdown && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute z-50 left-0 right-0 mt-1 retro-card overflow-hidden"
            style={{
              background: "#0d120d",
              borderColor: "rgba(0,255,65,0.3)",
              maxHeight: "320px",
              overflowY: "auto",
            }}
          >
            {allResults.length === 0 ? (
              <div className="p-3 text-center text-[#b0d0b0]" style={{ fontFamily: '"VT323", monospace', fontSize: "0.95rem" }}>
                {searching ? "Searching..." : "No tokens found"}
              </div>
            ) : (
              allResults.map((t) => (
                <button
                  key={t.id}
                  onMouseDown={(e) => { e.preventDefault(); handleSelect(t.id); }}
                  className="w-full text-left px-3 py-2 hover:bg-[rgba(0,255,65,0.05)] transition-colors border-b border-[rgba(0,255,65,0.1)] last:border-0 flex items-center gap-3"
                >
                  <div
                    className="w-8 h-8 rounded shrink-0 flex items-center justify-center text-[0.35rem] overflow-hidden"
                    style={{
                      fontFamily: '"Press Start 2P", monospace',
                      background: "#1a1a0f",
                      border: "1px solid rgba(0,255,65,0.15)",
                      color: "#00ff41",
                    }}
                  >
                    {t.image ? (
                      <img src={t.image} alt="" className="w-full h-full object-cover" />
                    ) : (
                      t.ticker.slice(0, 2)
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[#ffffff] truncate" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.4rem" }}>
                        ${t.ticker}
                      </span>
                      <span className="text-[#e0ffe0] truncate" style={{ fontFamily: '"VT323", monospace', fontSize: "0.95rem" }}>
                        {t.name}
                      </span>
                    </div>
                    {t.tokenAddress && (
                      <div className="text-[#6b6b55] truncate" style={{ fontFamily: '"VT323", monospace', fontSize: "0.8rem" }}>
                        {t.tokenAddress.length > 24
                          ? `${t.tokenAddress.slice(0, 10)}...${t.tokenAddress.slice(-6)}`
                          : t.tokenAddress}
                      </div>
                    )}
                  </div>
                  <span
                    className="text-[0.35rem] shrink-0"
                    style={{ fontFamily: '"Press Start 2P", monospace', color: t.blockchain === "solana" ? "#9945FF" : "#627EEA" }}
                  >
                    {t.blockchain === "solana" ? "SOL" : "ETH"}
                  </span>
                </button>
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════════════════════════════════
// MAIN TERMINAL PAGE
// ═══════════════════════════════════════════════

function TerminalPage() {
  const { connected, solAddress, ethAddress, connect, isConnectedOnChain, getAddressForChain } = useWallet();
  const [allTrades, setAllTrades] = useState<TradeData[]>([]);
  const [serverTrades, setServerTrades] = useState<TradeData[]>([]);
  const [chartTimeframe, setChartTimeframe] = useState<Timeframe>("1H");
  const [chartTokenId, setChartTokenId] = useState<string>("");
  const [notifBannerDismissed, setNotifBannerDismissed] = useState(false);
  const [notifState, setNotifState] = useState<"idle" | "requesting" | "granted" | "denied">("idle");
  const [buyPanel, setBuyPanel] = useState<{ tokenId: string; tokenTicker: string; price: number; blockchain: "solana" | "ethereum" } | null>(null);
  const [buyAmount, setBuyAmount] = useState("100");
  const [txModal, setTxModal] = useState<TransactionModalState>(initialModalState);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"all" | "BUY" | "SELL">("all");
  const searchRef = useRef<HTMLInputElement>(null);

  const tokens = useMemo(() => getTokens(), [allTrades]);

  // Set default chart token to #1 most active after tokens load
  useEffect(() => {
    if (chartTokenId) return; // Already selected
    if (tokens.length === 0) return;
    // Find the most active token
    const tokenActivity = tokens.map((t) => ({
      id: t.id,
      count: serverTrades.filter((tr) => tr.tokenId === t.id).length,
    }));
    tokenActivity.sort((a, b) => b.count - a.count);
    if (tokenActivity[0] && tokenActivity[0].count > 0) {
      setChartTokenId(tokenActivity[0].id);
    } else if (tokens[0]) {
      setChartTokenId(tokens[0].id);
    }
  }, [tokens, serverTrades, chartTokenId]);

  // Fetch server trades
  const fetchServerData = useCallback(async () => {
    const data = await fetchAllTradesFromServer(200);
    if (data.length > 0) {
      setServerTrades(data);
      setAllTrades(data);
    }
  }, []);

  // Poll server every 5 seconds
  useEffect(() => {
    fetchServerData();
    const interval = setInterval(fetchServerData, 5000);
    return () => clearInterval(interval);
  }, [fetchServerData]);

  // Also fetch specific token trades when chartTokenId changes
  useEffect(() => {
    if (!chartTokenId) return;
    let cancelled = false;
    fetchTradesFromServer(chartTokenId).then((data) => {
      if (!cancelled && data.length > 0) {
        setServerTrades((prev) => {
          const existing = new Map(prev.map((t) => [t.id, t]));
          for (const t of data) existing.set(t.id, t);
          return [...existing.values()].sort((a, b) => b.timestamp - a.timestamp);
        });
      }
    });
    return () => { cancelled = true; };
  }, [chartTokenId]);

  // Compute stats
  const stats = useMemo(() => {
    const wallets = new Set(serverTrades.map((t) => t.wallet));
    return {
      totalTrades: serverTrades.length,
      totalVolume: serverTrades.reduce((s, t) => s + t.total, 0),
      activeTraders: wallets.size,
    };
  }, [serverTrades]);

  // OHLC aggregation from server trades only (NO simulation)
  const ohlcData = useMemo(() => {
    const timeframeMs = TIMEFRAME_MS[chartTimeframe];
    const filteredTrades = chartTokenId
      ? serverTrades.filter((t) => t.tokenId === chartTokenId)
      : serverTrades;

    if (filteredTrades.length === 0) {
      return []; // Empty — chart will show "NO TRADES YET"
    }
    const candles = aggregateOHLC(filteredTrades, timeframeMs);
    return candles;
  }, [serverTrades, chartTimeframe, chartTokenId]);

  const chartToken = useMemo(() => {
    if (!chartTokenId) return undefined;
    return tokens.find((t) => t.id === chartTokenId);
  }, [chartTokenId, tokens]);

  const chartTokenSymbol = chartToken?.ticker;

  // Notification check
  useEffect(() => {
    if (isSupported() && getPermission() === "granted" && isNotificationsEnabled()) {
      setNotifState("granted");
    }
  }, []);

  const handleEnableAlerts = async () => {
    setNotifState("requesting");
    const result = await requestPermission();
    if (result === "granted") {
      setNotifState("granted");
      playArcadeBeep(523, 80);
      playArcadeBeep(784, 100);
    } else {
      setNotifState("denied");
    }
  };

  // Escape to clear search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSearchQuery("");
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Filtered trades for the feed
  const filteredTrades = useMemo(() => {
    let result = filterType === "all"
      ? serverTrades
      : serverTrades.filter((t) => t.type === filterType);

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.tokenName.toLowerCase().includes(q) ||
          t.tokenTicker.toLowerCase().includes(q) ||
          t.wallet.toLowerCase().includes(q) ||
          t.tokenId.toLowerCase().includes(q)
      );
    }
    return result;
  }, [serverTrades, filterType, searchQuery]);

  function formatCompact(n: number): string {
    if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
    return n.toFixed(0);
  }

  const handleOpenBuy = (trade: TradeData) => {
    const token = tokens.find((t) => t.id === trade.tokenId);
    setBuyPanel({
      tokenId: trade.tokenId,
      tokenTicker: trade.tokenTicker,
      price: token?.price || trade.price,
      blockchain: token?.blockchain || "solana",
    });
    setBuyAmount("100");
  };

  const handleQuickBuy = async () => {
    if (!buyPanel) return;
    const amount = parseInt(buyAmount) || 0;
    if (amount <= 0) return;

    const token = tokens.find((t) => t.id === buyPanel.tokenId);
    if (!token) return;

    const chain = buyPanel.blockchain;

    if (!isConnectedOnChain(chain)) {
      await connect(chain);
      const addr = getAddressForChain(chain);
      if (!addr) return;
      return;
    }

    const walletAddr = getAddressForChain(chain);
    if (!walletAddr) return;

    const curve = getBondingCurveState(buyPanel.tokenId);
    if (curve && curve.bondingCurveActive && !curve.graduated) {
      const breakdown = getBuyFeeBreakdown(curve, amount);
      if (breakdown.actualAmount <= 0) return;

      setTxModal({
        open: true,
        type: "BUY",
        tokenTicker: token.ticker,
        chain,
        amount: breakdown.actualAmount.toString(),
        step: "preparing",
        stepMessage: `Calculating price for ${breakdown.actualAmount} ${token.ticker}...`,
        txHash: "",
        error: "",
      });

      try {
        setTxModal((prev) => ({
          ...prev,
          step: "preparing",
          stepMessage: `Avg price: ${breakdown.avgPrice.toFixed(8)} ${chain === "solana" ? "SOL" : "ETH"} | Fee: ${breakdown.fee.toFixed(6)}`,
        }));
        await new Promise((r) => setTimeout(r, 500));

        setTxModal((prev) => ({
          ...prev,
          step: "awaiting_wallet",
          stepMessage: `Total: ${breakdown.totalWithFee.toFixed(6)} ${chain === "solana" ? "SOL" : "ETH"}. Check wallet...`,
        }));

        const feeBreakdown = calculateFeeBreakdown(breakdown.totalWithFee);
        const result = await sendBondingCurveTransaction(chain, walletAddr, feeBreakdown, curve.creatorAddress, "BUY");

        if (!result.success) {
          setTxModal((prev) => ({ ...prev, step: "error", error: result.error || "Transaction failed" }));
          return;
        }

        setTxModal((prev) => ({ ...prev, step: "confirming", txHash: result.txHash, stepMessage: "Confirming..." }));
        await new Promise((r) => setTimeout(r, 300));

        const newState = applyBuyToState(curve, breakdown.actualAmount, breakdown.avgPrice, breakdown.totalWithFee, breakdown.fee, truncateAddress(walletAddr));
        saveBondingCurveState(newState);

        addTrade({
          id: `trade-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          tokenId: token.id,
          tokenName: token.name,
          tokenTicker: token.ticker,
          type: "BUY",
          amount: breakdown.actualAmount,
          price: breakdown.avgPrice,
          total: breakdown.totalWithFee,
          wallet: truncateAddress(walletAddr),
          txHash: result.txHash,
          timestamp: Date.now(),
        });

        updateTokenPrice(token.id, getBondingCurvePrice(newState));

        setTxModal((prev) => ({
          ...prev,
          step: "complete",
          stepMessage: newState.graduated ? "🎓 Token graduated!" : `Bought ${breakdown.actualAmount.toLocaleString()} ${token.ticker}!`,
        }));
      } catch (err: any) {
        setTxModal((prev) => ({ ...prev, step: "error", error: err?.message || "Network error" }));
      }
    } else {
      // No active bonding curve — cannot trade without a real curve
      setTxModal({
        open: true,
        type: "BUY",
        tokenTicker: token.ticker,
        chain,
        amount: amount.toString(),
        step: "error",
        stepMessage: "",
        txHash: "",
        error: "No active bonding curve for this token. Only bonding-curve trades are supported.",
      });
    }
    setBuyPanel(null);
  };

  const handleRetry = () => {
    setTxModal(initialModalState);
    handleQuickBuy();
  };

  const handleTokenSelect = (id: string) => {
    setChartTokenId(id);
  };

  const isEmpty = serverTrades.length === 0;
  const hasSearchQuery = searchQuery.trim().length > 0;

  return (
    <div className="min-h-dvh bg-[#0d120d]">
      {/* Notification Banner */}
      <AnimatePresence>
        {isSupported() && notifState !== "granted" && !notifBannerDismissed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div
              className="px-4 py-2.5 flex items-center justify-center gap-3 flex-wrap"
              style={{
                background: "linear-gradient(180deg, rgba(0,255,65,0.08) 0%, rgba(0,255,65,0.03) 100%)",
                borderBottom: "2px solid rgba(0,255,65,0.25)",
              }}
            >
              <span style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.9rem" }}>🔔</span>
              <span className="text-[#00ff41] pixel-shadow-sm" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.45rem" }}>
                ENABLE PRICE ALERTS
              </span>
              <span className="hidden sm:inline text-[#e0ffe0]" style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}>
                Get browser push notifications for price movements and new launches
              </span>
              <button
                onClick={handleEnableAlerts}
                disabled={notifState === "requesting" || notifState === "denied"}
                className={`retro-btn text-[0.4rem] px-3 py-1.5 neon-glow-yellow ${notifState === "denied" ? "opacity-50 cursor-not-allowed" : "retro-btn-orange"}`}
                style={{ fontFamily: '"Press Start 2P", monospace' }}
              >
                {notifState === "requesting" ? "REQUESTING..." : notifState === "denied" ? "BLOCKED" : "ENABLE"}
              </button>
              <button
                onClick={() => setNotifBannerDismissed(true)}
                className="text-[#b0d0b0] hover:text-[#00ff41] transition-colors ml-1"
                aria-label="Dismiss"
                style={{ fontFamily: '"VT323", monospace', fontSize: "1.2rem" }}
              >
                ✕
              </button>
            </div>
          </motion.div>
        )}
        {notifState === "granted" && !notifBannerDismissed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div
              className="px-4 py-2 flex items-center justify-center gap-2"
              style={{
                background: "linear-gradient(180deg, rgba(0,255,65,0.12) 0%, rgba(0,255,65,0.04) 100%)",
                borderBottom: "1px solid rgba(0,255,65,0.2)",
              }}
            >
              <span className="text-[#00ff41]" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.45rem" }}>
                ✅ ALERTS ENABLED!
              </span>
              <button
                onClick={() => setNotifBannerDismissed(true)}
                className="text-[#b0d0b0] hover:text-[#00ff41] transition-colors"
                style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
              >
                [OK]
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ TOP SECTION: Search + Top 5 Tokens ═══ */}
      <div className="border-b-2 border-[rgba(0,255,65,0.15)]">
        <div className="max-w-7xl mx-auto px-4 py-3 space-y-3">
          {/* Search Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <span
              className="text-[#00ff41] pixel-shadow-sm shrink-0"
              style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem" }}
            >
              🔍 SEARCH
            </span>
            <div className="flex-1 max-w-xl">
              <TokenSearchBar onSelect={handleTokenSelect} tokens={tokens} />
            </div>
          </div>

          {/* Top 5 Tokens Row */}
          {!isEmpty && (
            <div>
              <span
                className="text-[#e0ffe0] mb-2 block"
                style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.4rem" }}
              >
                🏆 TOP TOKENS
              </span>
              <TopTokenCards
                tokens={tokens}
                activeTokenId={chartTokenId}
                onSelect={handleTokenSelect}
                trades={serverTrades}
              />
            </div>
          )}
        </div>
      </div>

      {/* ═══ MIDDLE SECTION: Main Candlestick Chart ═══ */}
      <div className="border-b-2 border-[rgba(0,255,65,0.15)]">
        <div className="max-w-7xl mx-auto px-4 py-3">
          {/* Chart header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
            <div className="flex items-center gap-3">
              <span
                className="text-[#00ff41] pixel-shadow-sm"
                style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem" }}
              >
                📈 CHART
              </span>
              <select
                value={chartTokenId}
                onChange={(e) => setChartTokenId(e.target.value)}
                className="retro-input w-full sm:w-48 text-xs"
                style={{
                  fontFamily: '"VT323", monospace',
                  fontSize: "0.95rem",
                  padding: "0.25rem 0.5rem",
                }}
              >
                {tokens.map((t) => (
                  <option key={t.id} value={t.id}>
                    ${t.ticker} - {t.name}
                  </option>
                ))}
                {tokens.length === 0 && (
                  <option value="" disabled>
                    No tokens yet
                  </option>
                )}
              </select>
              {chartToken && (
                <span className="text-[#e0ffe0] hidden sm:inline" style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}>
                  ${chartToken.price < 0.001 ? chartToken.price.toFixed(6) : chartToken.price.toFixed(4)}
                </span>
              )}
            </div>
          </div>
          {/* Chart */}
          <div className="retro-card h-72 sm:h-96 p-2 relative overflow-hidden">
            <GameCandlestickChart
              data={ohlcData}
              tokenSymbol={chartTokenSymbol}
              height="100%"
              showVolume={true}
              onTimeframeChange={setChartTimeframe}
            />
          </div>
        </div>
      </div>

      {/* ═══ Stats Bar ═══ */}
      <div className="bg-[#050505] border-b-4 border-[rgba(0,255,65,0.2)]">
        <div className="max-w-7xl mx-auto px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[0.4rem] text-[#e0ffe0] tracking-wider" style={{ fontFamily: '"Press Start 2P", monospace' }}>
              TRADES
            </span>
            <span className="text-sm font-bold text-[#00ff41]" style={{ fontFamily: '"VT323", monospace', fontSize: "1.1rem" }}>
              {formatCompact(stats.totalTrades)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[0.4rem] text-[#e0ffe0] tracking-wider" style={{ fontFamily: '"Press Start 2P", monospace' }}>
              VOLUME
            </span>
            <span className="text-sm font-bold text-[#00ff41]" style={{ fontFamily: '"VT323", monospace', fontSize: "1.1rem" }}>
              ${formatCompact(stats.totalVolume)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[0.4rem] text-[#e0ffe0] tracking-wider" style={{ fontFamily: '"Press Start 2P", monospace' }}>
              TRADERS
            </span>
            <span className="text-sm font-bold text-[#ffffff]" style={{ fontFamily: '"VT323", monospace', fontSize: "1.1rem" }}>
              {stats.activeTraders}
            </span>
          </div>
          {chartToken && chartToken.tokenAddress && (
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-[0.4rem] text-[#e0ffe0] tracking-wider" style={{ fontFamily: '"Press Start 2P", monospace' }}>
                CA
              </span>
              <code
                className="text-[#b0d0b0] cursor-pointer hover:text-[#00ff41] transition-colors"
                style={{
                  fontFamily: '"VT323", monospace',
                  fontSize: "0.85rem",
                }}
                title="Click to copy"
                onClick={() => navigator.clipboard.writeText(chartToken.tokenAddress || "")}
              >
                {chartToken.tokenAddress.length > 16
                  ? `${chartToken.tokenAddress.slice(0, 6)}...${chartToken.tokenAddress.slice(-4)}`
                  : chartToken.tokenAddress}
              </code>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            {(["all", "BUY", "SELL"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilterType(f)}
                className={`retro-tab text-[0.4rem] ${filterType === f ? "retro-tab-active" : ""}`}
                style={{ fontFamily: '"Press Start 2P", monospace' }}
              >
                {f === "all" ? "ALL" : f}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ═══ Buy Panel ═══ */}
      <AnimatePresence>
        {buyPanel && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-[#0d120d] border-b border-[rgba(0,255,65,0.2)] overflow-hidden"
          >
            <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <span className="text-[#00ff41] font-bold shrink-0" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem" }}>
                BUY {buyPanel.tokenTicker}
              </span>
              <span className="text-[#00ff41]" style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}>
                @ ${buyPanel.price.toFixed(6)}
              </span>
              <input
                type="number"
                value={buyAmount}
                onChange={(e) => setBuyAmount(e.target.value)}
                placeholder="Amount"
                className="retro-input w-full sm:w-32"
                style={{ fontFamily: '"VT323", monospace' }}
              />
              <div className="flex gap-2">
                <button onClick={handleQuickBuy} className="retro-btn retro-btn-turquoise text-[0.4rem] py-2 px-4 min-h-[44px]" style={{ fontFamily: '"Press Start 2P", monospace' }}>BUY</button>
                <button onClick={() => setBuyPanel(null)} className="retro-btn retro-btn-pink text-[0.4rem] py-2 px-4 min-h-[44px]" style={{ fontFamily: '"Press Start 2P", monospace' }}>CANCEL</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ BOTTOM SECTION: Trade Feed ═══ */}
      {/* Search bar for trade feed */}
      {!isEmpty && (
        <div className="bg-[#0a0a0a] border-b-2 border-[#00ff41]">
          <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-3">
            <span className="text-[#00ff41] shrink-0" style={{ fontFamily: '"VT323", monospace', fontSize: "1.1rem" }}>
              &gt;
            </span>
            <input
              ref={searchRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="filter trades by token name, ticker, wallet, or token ID..."
              className="flex-1 bg-transparent text-[#00ff41] placeholder-[#2d7a30] outline-none"
              style={{ fontFamily: '"VT323", monospace', fontSize: "1.05rem" }}
            />
            {hasSearchQuery && (
              <button
                onClick={() => { setSearchQuery(""); searchRef.current?.focus(); }}
                className="text-[#00ff41] hover:text-[#e0ffe0] transition-colors shrink-0"
                style={{ fontFamily: '"VT323", monospace', fontSize: "1.2rem" }}
                title="Clear search (Esc)"
              >
                [X]
              </button>
            )}
            <span className="text-[#2d7a30] text-xs shrink-0" style={{ fontFamily: '"VT323", monospace', fontSize: "0.85rem" }}>
              {filteredTrades.length}/{serverTrades.filter(t => filterType === "all" ? true : t.type === filterType).length}
            </span>
          </div>
        </div>
      )}

      {/* Empty state */}
      {isEmpty ? (
        <div className="flex items-center justify-center" style={{ minHeight: "calc(100dvh - 160px)" }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center max-w-md mx-auto px-4"
          >
            <p className="text-5xl mb-6 retro-float">🖥️</p>
            <p
              className="text-[#00ff41] mb-3 pixel-shadow-sm"
              style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.8rem" }}
            >
              NO TRADES YET
            </p>
            <p
              className="text-[#e0ffe0] mb-6"
              style={{ fontFamily: '"VT323", monospace', fontSize: "1.15rem" }}
            >
              Launch a token to get started! Trades will appear here in real-time.
            </p>
            <div className="retro-card p-4 text-left max-w-xs mx-auto">
              <p className="text-[#00ff41] text-xs" style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}>
                &gt; Terminal awaiting input...
              </p>
              <p className="text-[#b0d0b0] text-xs mt-1" style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem" }}>
                &gt; No trades yet. Launch a token to get started!
              </p>
              <span className="retro-blink text-[#00ff41]" style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}>▌</span>
            </div>
          </motion.div>
        </div>
      ) : (
        /* Trade feed */
        <div className="max-w-7xl mx-auto px-4 py-2">
          {/* Header */}
          <div className="overflow-x-auto custom-scrollbar">
            <div className="min-w-[500px] sm:min-w-[650px]">
              <div
                className="grid grid-cols-7 sm:grid-cols-8 gap-1 sm:gap-2 px-2 sm:px-3 py-2 text-[0.38rem] text-[#e0ffe0] tracking-wider border-b-2 border-[rgba(0,255,65,0.2)] mb-1"
                style={{ fontFamily: '"Press Start 2P", monospace' }}
              >
                <span>TIME</span>
                <span>TOKEN</span>
                <span>TYPE</span>
                <span className="text-right hidden sm:block">AMT</span>
                <span className="text-right">PRICE</span>
                <span className="hidden sm:block">TX</span>
                <span className="text-right">WALLET</span>
                <span />
              </div>
            </div>
          </div>

          {/* No results from search */}
          {filteredTrades.length === 0 && hasSearchQuery ? (
            <div className="flex items-center justify-center py-16">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
                <p className="text-[#b0d0b0] mb-2" style={{ fontFamily: '"VT323", monospace', fontSize: "1.1rem" }}>
                  &gt; No trades found for '<span className="text-[#00ff41]">{searchQuery}</span>'
                </p>
                <button
                  onClick={() => { setSearchQuery(""); searchRef.current?.focus(); }}
                  className="text-[#00ff41] hover:text-[#55c859] transition-colors"
                  style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
                >
                  [ clear search ]
                </button>
              </motion.div>
            </div>
          ) : (
            <div className="overflow-y-auto custom-scrollbar overflow-x-auto" style={{ maxHeight: "calc(100dvh - 210px)" }}>
              <div className="min-w-[500px] sm:min-w-[650px]">
                <AnimatePresence initial={false}>
                  {filteredTrades.slice(0, 200).map((trade, i) => (
                    <motion.div
                      key={trade.id}
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.1 }}
                      className={`grid grid-cols-7 sm:grid-cols-8 gap-1 sm:gap-2 px-2 sm:px-3 py-2 text-xs border-b border-[rgba(0,255,65,0.2)] hover:bg-[#0d150d]/50 transition-colors duration-75 ${
                        i % 2 === 0 ? "bg-[#0d120d]" : "bg-[#080c08]"
                      }`}
                      style={{ fontFamily: '"VT323", monospace' }}
                    >
                      <span className="text-[#b0d0b0]" style={{ fontSize: "0.85rem" }}>
                        {new Date(trade.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span
                        className="text-[#ffffff] font-bold truncate cursor-pointer hover:text-[#00ff41] transition-colors"
                        style={{ fontSize: "0.9rem" }}
                        onClick={() => handleTokenSelect(trade.tokenId)}
                        title="Click to chart this token"
                      >
                        {trade.tokenTicker}
                      </span>
                      <span>
                        <span
                          className="px-1 py-0.5 rounded text-[0.35rem] font-bold"
                          style={{
                            fontFamily: '"Press Start 2P", monospace',
                            background: trade.type === "BUY" ? "#00ff4120" : "#00cc3320",
                            color: trade.type === "BUY" ? "#00ff41" : "#00cc33",
                            border: `1px solid ${trade.type === "BUY" ? "#00ff4140" : "#00cc3340"}`,
                          }}
                        >
                          {trade.type}
                        </span>
                      </span>
                      <span className="text-[#e0ffe0] text-right hidden sm:block" style={{ fontSize: "0.9rem" }}>{formatCompact(trade.amount)}</span>
                      <span className="text-[#00ff41] text-right" style={{ fontSize: "0.9rem" }}>
                        ${trade.price < 0.001 ? trade.price.toFixed(6) : trade.price.toFixed(4)}
                      </span>
                      <span className="text-[#b0d0b0] truncate hidden sm:block" style={{ fontSize: "0.8rem" }}>{trade.txHash.slice(0, 10)}</span>
                      <span className="text-[#b0d0b0] text-right truncate" style={{ fontSize: "0.8rem" }}>{trade.wallet}</span>
                      <span className="text-right">
                        <button
                          onClick={() => handleOpenBuy(trade)}
                          className="retro-btn retro-btn-turquoise text-[0.3rem] px-1 py-0.5"
                          style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.3rem", minHeight: 32, minWidth: 32 }}
                        >
                          BUY
                        </button>
                      </span>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          )}

          {filteredTrades.length === 0 && !hasSearchQuery && filterType !== "all" && (
            <div className="text-center py-12">
              <p className="text-[#e0ffe0]" style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}>
                No {filterType} trades yet
              </p>
            </div>
          )}
        </div>
      )}

      {/* Fun Facts */}
      <FunFacts />

      {/* Transaction Modal */}
      <TransactionModal
        state={txModal}
        onClose={() => setTxModal(initialModalState)}
        onRetry={handleRetry}
      />
    </div>
  );
}
