import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HiMiniMagnifyingGlass, HiMiniRocketLaunch } from "react-icons/hi2";
import {
  getLeaderboardData,
  type LeaderboardTab,
  type LeaderboardEntry,
} from "~/services/tracker";
import { sanitizeSearch } from "~/utils/sanitize";
import { useUsdPrice, formatUsd } from "~/hooks/useUsdPrice";
import { useBondingCurveTrade } from "~/hooks/useBondingCurveTrade";
import { useWallet } from "~/context/WalletContext";
import { fetchDexPrice, type DexPriceResult } from "~/services/dexPrices";
import { getTokens } from "~/services/tracker";

export const Route = createFileRoute("/leaderboard")({
  component: LeaderboardPage,
});

function formatCompact(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n.toFixed(0);
}

function formatPrice(p: number, blockchain: string): string {
  const symbol = blockchain === "solana" ? "◎" : "Ξ";
  if (p < 0.0001) return `${symbol}${p.toFixed(8)}`;
  if (p < 0.01) return `${symbol}${p.toFixed(6)}`;
  return `${symbol}${p.toFixed(4)}`;
}

function getRankLabel(rank: number): string {
  if (rank === 1) return "1ST";
  if (rank === 2) return "2ND";
  if (rank === 3) return "3RD";
  return `${rank}TH`;
}

function getOrdinalSuffix(n: number): string {
  const s = n % 100;
  if (s >= 11 && s <= 13) return "TH";
  switch (n % 10) {
    case 1: return "ST";
    case 2: return "ND";
    case 3: return "RD";
    default: return "TH";
  }
}

const TABS: { key: LeaderboardTab; label: string }[] = [
  { key: "marketcap", label: "MCAP" },
  { key: "volume", label: "VOLUME" },
  { key: "newest", label: "NEWEST" },
  { key: "graduating", label: "GRADING" },
];

const CHAIN_TABS: { key: "all" | "solana" | "ethereum"; label: string; btnClass: string }[] = [
  { key: "all", label: "ALL", btnClass: "" },
  { key: "solana", label: "SOL", btnClass: "arcade-mode-btn-sol" },
  { key: "ethereum", label: "ETH", btnClass: "arcade-mode-btn-eth" },
];

// ─── Podium Card Component ───

function PodiumCard({
  entry,
  rank,
  dexPrice,
}: {
  entry: LeaderboardEntry;
  rank: number;
  dexPrice: DexPriceResult | null;
}) {
  const isUp = entry.change24h >= 0;
  const heightClass = rank === 1 ? "h-40" : rank === 2 ? "h-32" : "h-24";
  const podiumClass =
    rank === 1 ? "podium-1st podium-gold" : rank === 2 ? "podium-2nd" : "podium-3rd";
  const rankColor =
    rank === 1 ? "#ffd700" : rank === 2 ? "#c0c0c0" : "#cd7f32";

  // Buy state
  const trade = useBondingCurveTrade();
  const { isConnectedOnChain, connect } = useWallet();
  const [buyMsg, setBuyMsg] = useState<string | null>(null);
  const isBuyDisabled = entry.status === "graduated" || trade.status !== "idle";

  const handleBuy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (entry.status === "graduated") return;
    if (!isConnectedOnChain(entry.blockchain)) {
      setBuyMsg("Connect wallet...");
      await connect(entry.blockchain);
      setTimeout(() => setBuyMsg(null), 3000);
      return;
    }
    setBuyMsg("Confirm...");
    const result = await trade.buy({ tokenId: entry.tokenId, amount: 100, tokenTicker: entry.ticker });
    if (result.success) {
      setBuyMsg("✅ Bought!");
    } else {
      const err = result.error || "Failed";
      setBuyMsg(`❌ ${err.slice(0, 20)}`);
    }
    setTimeout(() => { setBuyMsg(null); trade.reset(); }, 5000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: rank * 0.15, duration: 0.4, ease: [0.68, -0.55, 0.265, 1.55] }}
      className="flex flex-col items-center justify-end"
      style={{ order: rank === 1 ? 2 : rank === 2 ? 1 : 3 }}
    >
      {/* Crown on #1 */}
      {rank === 1 && (
        <motion.span
          className="crown-float text-3xl mb-1"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.6, type: "spring", stiffness: 300 }}
        >
          👑
        </motion.span>
      )}

      {/* Token info above podium */}
      <div className="text-center mb-2 z-10">
        <div
          style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.4rem", color: rankColor }}
          className="truncate max-w-[120px]"
        >
          {entry.name}
        </div>
        <div
          style={{ fontFamily: '"VT323", monospace', fontSize: "1rem", color: "#e0ffe0" }}
        >
          ${entry.ticker}
        </div>
        <div
          style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem" }}
          className="font-bold"
        >
          <span style={{ color: rankColor }}>
            {entry.status === "graduated" && dexPrice
              ? `$${dexPrice.price < 0.0001 ? dexPrice.price.toFixed(8) : dexPrice.price.toFixed(6)}`
              : formatPrice(entry.price, entry.blockchain)}
          </span>
        </div>
        <div
          style={{
            fontFamily: '"VT323", monospace',
            fontSize: "0.85rem",
            color: isUp ? "#00ff41" : "#ff4444",
          }}
        >
          MCAP: ${formatCompact(entry.marketCap)}
        </div>
        <div
          style={{
            fontFamily: '"Press Start 2P", monospace',
            fontSize: "0.35rem",
            color: isUp ? "#00ff41" : "#ff4444",
          }}
        >
          {isUp ? "+" : ""}{entry.change24h.toFixed(1)}%
        </div>
      </div>

      {/* Podium block */}
      <Link to="/token/$id" params={{ id: entry.tokenId }}>
        <div
          className={`podium-block ${heightClass} ${podiumClass} flex items-center justify-center cursor-pointer hover:brightness-110 transition-all`}
          style={{ width: rank === 1 ? "120px" : rank === 2 ? "100px" : "85px" }}
        >
          <span
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: rank === 1 ? "1.5rem" : rank === 2 ? "1.2rem" : "1rem",
              color: rank === 1 ? "#5a3e00" : rank === 2 ? "#444" : "#3a2010",
              fontWeight: "bold",
            }}
          >
            {rank}
          </span>
        </div>
      </Link>

      {/* Rank label below podium */}
      <span
        style={{
          fontFamily: '"Press Start 2P", monospace',
          fontSize: "0.4rem",
          color: rankColor,
          marginTop: "0.5rem",
          fontWeight: "bold",
        }}
      >
        {getRankLabel(rank)}
      </span>

      {/* Buy button */}
      {entry.status === "bonding" && (
        <div className="flex flex-col items-center mt-1 gap-0.5">
          <button
            onClick={handleBuy}
            disabled={isBuyDisabled}
            className="arcade-mode-btn"
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: "0.3rem",
              padding: "0.15rem 0.5rem",
              opacity: isBuyDisabled ? 0.5 : 1,
            }}
          >
            {trade.status === "awaiting_wallet" || trade.status === "confirming" ? "⏳" : "BUY"}
          </button>
          {buyMsg && (
            <span
              style={{
                fontFamily: '"VT323", monospace',
                fontSize: "0.7rem",
                color: buyMsg.startsWith("✅") ? "#00ff41" : buyMsg.startsWith("❌") ? "#ff4444" : "#ffb83c",
                maxWidth: "100px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {buyMsg}
            </span>
          )}
        </div>
      )}
    </motion.div>
  );
}

// ─── Score Row Component ───

function ScoreRow({
  entry,
  rank,
  index,
  copiedId,
  onCopyLink,
}: {
  entry: LeaderboardEntry;
  rank: number;
  index: number;
  copiedId: string | null;
  onCopyLink: (e: React.MouseEvent, tokenId: string) => void;
}) {
  const isUp = entry.change24h >= 0;
  const isFirst = rank === 1;

  // Buy state
  const trade = useBondingCurveTrade();
  const { isConnectedOnChain, connect } = useWallet();
  const [buyMsg, setBuyMsg] = useState<string | null>(null);
  const isBuyDisabled = entry.status === "graduated" || trade.status !== "idle";

  const handleBuy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (entry.status === "graduated") return;
    if (!isConnectedOnChain(entry.blockchain)) {
      setBuyMsg("Connect wallet...");
      await connect(entry.blockchain);
      setTimeout(() => setBuyMsg(null), 3000);
      return;
    }
    setBuyMsg("Confirm...");
    const result = await trade.buy({ tokenId: entry.tokenId, amount: 100, tokenTicker: entry.ticker });
    if (result.success) {
      setBuyMsg("✅");
    } else {
      setBuyMsg("❌");
    }
    setTimeout(() => { setBuyMsg(null); trade.reset(); }, 5000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.4), duration: 0.2 }}
    >
      <Link to="/token/$id" params={{ id: entry.tokenId }}>
        <div
          className="arcade-score-row grid gap-1 sm:gap-2 items-center px-2 py-2.5"
          style={{
            gridTemplateColumns: "40px 1fr 65px 60px 55px 50px 50px 36px 40px",
          }}
        >
          {/* Rank */}
          <span
            className={isFirst ? "rank-flash-1" : ""}
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: "0.38rem",
              color: rank <= 3
                ? rank === 1 ? "#ffd700" : rank === 2 ? "#c0c0c0" : "#cd7f32"
                : "#338833",
              fontWeight: "bold",
              textShadow: rank <= 3 ? `0 0 8px ${rank === 1 ? 'rgba(255,215,0,0.5)' : rank === 2 ? 'rgba(192,192,192,0.4)' : 'rgba(205,127,50,0.3)'}` : "none",
            }}
          >
            {rank}{getOrdinalSuffix(rank)}
          </span>

          {/* Token info */}
          <div className="flex items-center gap-1.5 min-w-0">
            <div
              className="w-6 h-6 sm:w-7 sm:h-7 rounded flex items-center justify-center shrink-0 overflow-hidden"
              style={{
                background: "#0d150d",
                border: `2px solid ${rank <= 3
                  ? rank === 1 ? 'rgba(255,215,0,0.3)' : rank === 2 ? 'rgba(192,192,192,0.25)' : 'rgba(205,127,50,0.2)'
                  : 'rgba(0,255,65,0.12)'}`,
              }}
            >
              {entry.image ? (
                <img src={entry.image} alt="" className="w-full h-full object-cover" />
              ) : (
                <span
                  className="font-bold"
                  style={{
                    fontFamily: '"Press Start 2P", monospace',
                    fontSize: "0.28rem",
                    color: "#00ff41",
                  }}
                >
                  {entry.ticker.slice(0, 2)}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <div
                className="font-bold truncate"
                style={{
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: "0.35rem",
                  color: "#ffffff",
                }}
              >
                {entry.name}
              </div>
              <div
                className="hidden sm:block"
                style={{
                  fontFamily: '"VT323", monospace',
                  fontSize: "0.85rem",
                  color: "#b0d0b0",
                }}
              >
                ${entry.ticker}
              </div>
            </div>
          </div>

          {/* Price */}
          <span
            className="text-right font-bold"
            style={{
              fontFamily: '"VT323", monospace',
              fontSize: "0.85rem",
              color: "#00ff41",
            }}
          >
            {entry.status === "graduated" && dexPrice
              ? `${dexPrice.price < 0.0001 ? dexPrice.price.toFixed(8) : dexPrice.price.toFixed(6)}`
              : formatPrice(entry.price, entry.blockchain)}
          </span>

          {/* Market Cap */}
          <span
            className="text-right hidden sm:block"
            style={{
              fontFamily: '"VT323", monospace',
              fontSize: "0.95rem",
              color: "#e0ffe0",
            }}
          >
            ${formatCompact(entry.marketCap)}
          </span>

          {/* Volume */}
          <span
            className="text-right hidden sm:block"
            style={{
              fontFamily: '"VT323", monospace',
              fontSize: "0.95rem",
              color: "#e0ffe0",
            }}
          >
            ${formatCompact(entry.volume24h)}
          </span>

          {/* Change */}
          <span
            className="text-right font-bold"
            style={{
              fontFamily: '"VT323", monospace',
              fontSize: "0.8rem",
              color: isUp ? "#00ff41" : "#ff4444",
            }}
          >
            {isUp ? "+" : ""}{entry.change24h.toFixed(1)}%
          </span>

          {/* Status */}
          <span className="hidden sm:block">
            {entry.status === "graduated" ? (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-bold"
                style={{
                  background: "rgba(0,255,65,0.08)",
                  border: "1px solid rgba(0,255,65,0.2)",
                  color: "#00ff41",
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: "0.3rem",
                }}
              >
                GRAD
              </span>
            ) : (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-bold"
                style={{
                  background: "rgba(255,180,60,0.06)",
                  border: "1px solid rgba(255,180,60,0.18)",
                  color: "#ffb83c",
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: "0.3rem",
                }}
              >
                BOND
              </span>
            )}
          </span>

          {/* Progress */}
          <div className="hidden sm:block">
            <div
              className="h-2.5 rounded-sm overflow-hidden"
              style={{
                background: "#0a150a",
                border: "1px solid rgba(0,255,65,0.1)",
              }}
            >
              <motion.div
                className="h-full"
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(entry.graduationProgress, 100)}%` }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                style={{
                  background:
                    entry.graduationProgress >= 100
                      ? "linear-gradient(90deg, #00ff41, #39ff14)"
                      : "linear-gradient(90deg, #ffb83c, #ffd700)",
                }}
              />
            </div>
            <div
              className="text-right mt-0.5"
              style={{
                fontFamily: '"VT323", monospace',
                fontSize: "0.7rem",
                color: "#338833",
              }}
            >
              {entry.graduationProgress.toFixed(0)}%
            </div>
          </div>

          {/* Copy link */}
          <div className="flex justify-center">
            <button
              onClick={(e) => onCopyLink(e, entry.tokenId)}
              className="transition-colors p-1"
              style={{ color: copiedId === entry.tokenId ? "#00ff41" : "#226622", fontSize: "0.8rem", minWidth: 36, minHeight: 36 }}
              title="Copy token link"
            >
              {copiedId === entry.tokenId ? "✅" : "📋"}
            </button>
          </div>

          {/* Buy button */}
          <div className="flex justify-center">
            {entry.status === "bonding" ? (
              <div className="flex flex-col items-center gap-0.5">
                <button
                  onClick={handleBuy}
                  disabled={isBuyDisabled}
                  className="arcade-mode-btn touch-mini"
                  style={{
                    fontFamily: '"Press Start 2P", monospace',
                    fontSize: "0.28rem",
                    padding: "0.2rem 0.4rem",
                    opacity: isBuyDisabled ? 0.5 : 1,
                  }}
                >
                  {trade.status === "awaiting_wallet" || trade.status === "confirming"
                    ? "⏳"
                    : buyMsg === "✅" ? "✅" : buyMsg === "❌" ? "❌" : "BUY"}
                </button>
              </div>
            ) : (
              <span
                style={{
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: "0.3rem",
                  color: "#338833",
                }}
              >
                GRAD
              </span>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

// ─── Main Page ───

function LeaderboardPage() {
  const [sortBy, setSortBy] = useState<LeaderboardTab>("marketcap");
  const [chainFilter, setChainFilter] = useState<"all" | "solana" | "ethereum">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [dexPrices, setDexPrices] = useState<Map<string, DexPriceResult | null>>(new Map());
  const [leaderboardCopied, setLeaderboardCopied] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const usdPrices = useUsdPrice();

  useEffect(() => {
    setEntries(getLeaderboardData(sortBy, chainFilter));
    const interval = setInterval(() => {
      setEntries(getLeaderboardData(sortBy, chainFilter));
    }, 5000);
    return () => clearInterval(interval);
  }, [sortBy, chainFilter]);

  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return entries;
    const q = searchQuery.toLowerCase();
    return entries.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.ticker.toLowerCase().includes(q),
    );
  }, [entries, searchQuery]);

  // Top 3 for podium, rest for table
  const podiumEntries = filteredEntries.slice(0, 3);
  const tableEntries = filteredEntries.slice(3);

  const handleCopyLeaderboard = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      setLeaderboardCopied(true);
      setTimeout(() => setLeaderboardCopied(false), 2000);
    }).catch(() => {
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setLeaderboardCopied(true);
      setTimeout(() => setLeaderboardCopied(false), 2000);
    });
  };

  const handleCopyTokenLink = (e: React.MouseEvent, tokenId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const url = `${window.location.origin}/token/${tokenId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(tokenId);
      setTimeout(() => setCopiedId(null), 2000);
    }).catch(() => {
      setCopiedId(tokenId);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  return (
    <div className="min-h-dvh bg-[#050510] py-8 px-4 flex items-start justify-center">
      {/* ─── ARCADE CABINET ─── */}
      <motion.div
        className="arcade-cabinet w-full max-w-5xl"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.68, -0.55, 0.265, 1.55] }}
      >
        <div className="arcade-screen relative">
          {/* ─── CREDITS: 99 ─── */}
          <div className="absolute top-3 right-4 arcade-credits z-20">
            CREDITS: 99
          </div>

          {/* ─── HIGH SCORES MARQUEE ─── */}
          <motion.div
            className="text-center mb-6 relative z-10"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.3 }}
          >
            {/* Decorative stars */}
            <div className="flex justify-center gap-4 mb-1 text-[#00ff41]/30 text-xs">
              <span>★ ★ ★</span>
            </div>

            <h1
              className="arcade-title-glow inline-block mb-2"
              style={{
                fontFamily: '"Press Start 2P", monospace',
                fontSize: "clamp(1rem, 3vw, 1.6rem)",
                color: "#00ff41",
                letterSpacing: "0.1em",
              }}
            >
              HIGH SCORES
            </h1>

            <div className="flex justify-center gap-4 text-[#00ff41]/30 text-xs mb-1">
              <span>★ ★ ★</span>
            </div>

            {/* INSERT COIN blinking */}
            <p
              className="arcade-blink mt-3"
              style={{
                fontFamily: '"Press Start 2P", monospace',
                fontSize: "0.55rem",
                color: "#ffd700",
                textShadow: "0 0 10px rgba(255,215,0,0.5)",
              }}
            >
              INSERT COIN TO CONTINUE
            </p>

            {/* Share button */}
            <div className="mt-2">
              <button
                onClick={handleCopyLeaderboard}
                className="arcade-mode-btn text-[0.38rem] px-4 py-1.5"
                style={{ fontSize: "0.38rem" }}
              >
                {leaderboardCopied ? "COPIED!" : "SHARE"}
              </button>
            </div>
          </motion.div>

          {/* ─── Top bright line ─── */}
          <div
            className="mx-auto mb-4"
            style={{
              width: "80%",
              height: "1px",
              background: "linear-gradient(90deg, transparent, rgba(0,255,65,0.3), transparent)",
            }}
          />

          {/* ─── Chain Mode Select Buttons ─── */}
          <motion.div
            className="flex justify-center gap-3 mb-6 relative z-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            {CHAIN_TABS.map((ct) => (
              <button
                key={ct.key}
                onClick={() => setChainFilter(ct.key)}
                className={`arcade-mode-btn ${ct.btnClass} ${
                  chainFilter === ct.key ? "arcade-mode-active" : ""
                }`}
              >
                {ct.label}
              </button>
            ))}
          </motion.div>

          {/* ─── Sort Menu Tabs ─── */}
          <motion.div
            className="flex flex-wrap gap-1 justify-center mb-5 relative z-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35 }}
          >
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setSortBy(tab.key)}
                className={`arcade-menu-tab ${
                  sortBy === tab.key ? "arcade-menu-tab-active" : ""
                }`}
              >
                {tab.label}
              </button>
            ))}
          </motion.div>

          {/* ─── Search ─── */}
          <motion.div
            className="max-w-md mx-auto mb-6 relative z-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            <div className="flex items-center gap-2">
              <HiMiniMagnifyingGlass className="text-[#226622] text-sm shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(sanitizeSearch(e.target.value))}
                placeholder="ENTER NAME..."
                className="arcade-input"
              />
            </div>
          </motion.div>

          {/* ─── Content Area ─── */}
          <div className="relative z-10">
            {/* Empty State */}
            {filteredEntries.length === 0 && entries.length === 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-16"
              >
                <p className="text-5xl mb-4 retro-float">🕹️</p>
                <p
                  className="mb-2"
                  style={{
                    fontFamily: '"Press Start 2P", monospace',
                    fontSize: "0.7rem",
                    color: "#00ff41",
                  }}
                >
                  NO TOKENS YET
                </p>
                <p
                  className="mb-4"
                  style={{
                    fontFamily: '"VT323", monospace',
                    fontSize: "1.1rem",
                    color: "#338833",
                  }}
                >
                  Be the first — CREATE A COIN
                </p>
                <Link to="/create">
                  <button
                    className="arcade-mode-btn text-[0.45rem] px-5 py-2"
                  >
                    <HiMiniRocketLaunch size={14} className="inline mr-1" />
                    LAUNCH A COIN
                  </button>
                </Link>
              </motion.div>
            )}

            {filteredEntries.length === 0 && entries.length > 0 && (
              <div className="text-center py-12">
                <p
                  style={{
                    fontFamily: '"VT323", monospace',
                    fontSize: "1.1rem",
                    color: "#338833",
                  }}
                >
                  NO RESULTS FOR "{searchQuery}"
                </p>
              </div>
            )}

            {filteredEntries.length > 0 && (
              <>
                {/* ─── TOP 3 PODIUM ─── */}
                {podiumEntries.length > 0 && (
                  <motion.div
                    className="flex justify-center items-end gap-6 sm:gap-10 mb-10 mt-4 px-4"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                  >
                    <AnimatePresence mode="wait">
                      {podiumEntries.map((entry, i) => {
                        // Reorder: 2nd (index 1), 1st (index 0), 3rd (index 2)
                        const displayOrder = [1, 0, 2];
                        const e = podiumEntries[displayOrder[i]];
                        if (!e) return null;
                        const r = displayOrder[i] + 1;
                        return (
                          <PodiumCard key={e.tokenId} entry={e} rank={r} dexPrice={dexPrices.get(e.tokenId) ?? null} />
                        );
                      })}
                    </AnimatePresence>
                  </motion.div>
                )}

                {/* ─── TABLE HEADER ─── */}
                {tableEntries.length > 0 && (
                  <>
                    <div className="overflow-x-auto custom-scrollbar -mx-2 px-2">
                      <div className="min-w-[380px] sm:min-w-[700px]">
                        <div
                          className="grid gap-1 sm:gap-2 mb-1 px-2 arcade-table-header"
                          style={{
                            gridTemplateColumns: "40px 1fr 65px 60px 55px 50px 50px 36px 40px",
                          }}
                        >
                          <span style={{ fontSize: "0.32rem" }}>RANK</span>
                          <span style={{ fontSize: "0.32rem" }}>TOKEN</span>
                          <span className="text-right" style={{ fontSize: "0.32rem" }}>PRICE</span>
                          <span className="text-right hidden sm:block" style={{ fontSize: "0.32rem" }}>MCAP</span>
                          <span className="text-right hidden sm:block" style={{ fontSize: "0.32rem" }}>VOL</span>
                          <span className="text-right" style={{ fontSize: "0.32rem" }}>24H%</span>
                          <span className="hidden sm:block" style={{ fontSize: "0.32rem" }}>STATUS</span>
                          <span className="hidden sm:block" style={{ fontSize: "0.32rem" }}>STAGE</span>
                          <span></span>
                          <span style={{ fontSize: "0.32rem" }}>TRADE</span>
                        </div>

                        {/* ─── TABLE ROWS ─── */}
                        <div className="space-y-0.5">
                          {tableEntries.map((entry, i) => {
                            const rank = i + 4;
                            return (
                              <ScoreRow
                                key={entry.tokenId}
                                entry={entry}
                                rank={rank}
                                index={i}
                                copiedId={copiedId}
                                onCopyLink={handleCopyTokenLink}
                                dexPrice={dexPrices.get(entry.tokenId) ?? null}
                              />
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* If only 1-3 results, show them all in podium only — no table needed
                    But if no podium display (only 1-2 results somehow), show as table */}
                {tableEntries.length === 0 && podiumEntries.length > 0 && podiumEntries.length < 3 && (
                  <div className="overflow-x-auto custom-scrollbar -mx-2 px-2">
                    <div className="min-w-[380px] sm:min-w-[700px] space-y-0.5 mt-4">
                      {filteredEntries.map((entry, i) => {
                        const rank = i + 1;
                        return (
                          <ScoreRow
                            key={entry.tokenId}
                            entry={entry}
                            rank={rank}
                            index={i}
                            copiedId={copiedId}
                            onCopyLink={handleCopyTokenLink}
                            dexPrice={dexPrices.get(entry.tokenId) ?? null}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ─── Bottom bright line ─── */}
          <div
            className="mx-auto mt-6"
            style={{
              width: "80%",
              height: "1px",
              background: "linear-gradient(90deg, transparent, rgba(0,255,65,0.3), transparent)",
            }}
          />

          {/* ─── ← PRESS START → ─── */}
          <motion.div
            className="text-center mt-4 press-start-blink relative z-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
          >
            <p
              style={{
                fontFamily: '"Press Start 2P", monospace',
                fontSize: "0.5rem",
                color: "#ffd700",
                textShadow: "0 0 8px rgba(255,215,0,0.4)",
              }}
            >
              ← PRESS START →
            </p>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
