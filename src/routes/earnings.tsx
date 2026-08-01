/**
 * Earnings Dashboard — Creator earnings overview
 *
 * Shows each creator's tokens with real earnings data:
 * - Token name, ticker, total earned (SOL/ETH), number of trades, graduation status
 * - Summary card: "Total Earned: X SOL + Y ETH" with approximate USD value
 * - "View on Explorer" links for creator fee transactions
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { HiMiniCurrencyDollar, HiMiniChartBar, HiMiniRocketLaunch, HiMiniArrowTopRightOnSquare } from "react-icons/hi2";
import { useWallet, truncateAddress } from "~/context/WalletContext";
import {
  getTokens,
  getBondingCurveStates,
  fetchCreatorTokens,
  type CreatorTokenData,
} from "~/services/tracker";
import type { BondingCurveState } from "~/services/bondingCurve";
import { getExplorerUrl, getExplorerName } from "~/services/walletTransactions";
import { Card } from "~/components/UI";
import { useUsdPrice, formatUsd } from "~/hooks/useUsdPrice";

export const Route = createFileRoute("/earnings")({
  component: EarningsPage,
});

function getTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatCompact(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  if (n >= 1) return n.toFixed(2);
  return n.toFixed(6);
}

function EarningsPage() {
  const { connected, solAddress, ethAddress } = useWallet();
  const usdPrices = useUsdPrice();

  const [creatorTokens, setCreatorTokens] = useState<CreatorTokenData[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeChain, setActiveChain] = useState<"all" | "solana" | "ethereum">("all");

  const walletAddr = solAddress || ethAddress || null;
  const truncatedWallet = walletAddr ? truncateAddress(walletAddr) : null;

  // Refresh creator tokens
  useEffect(() => {
    if (!walletAddr) {
      setCreatorTokens([]);
      return;
    }

    let cancelled = false;
    async function load() {
      setLoading(true);
      const tokens = await fetchCreatorTokens(walletAddr!);
      if (!cancelled) {
        setCreatorTokens(tokens);
        setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [walletAddr]);

  // Filter by chain
  const filteredTokens = useMemo(() => {
    if (activeChain === "all") return creatorTokens;
    return creatorTokens.filter((t) => t.blockchain === activeChain);
  }, [creatorTokens, activeChain]);

  // Summary calculations
  const summary = useMemo(() => {
    const solTokens = creatorTokens.filter((t) => t.blockchain === "solana");
    const ethTokens = creatorTokens.filter((t) => t.blockchain === "ethereum");
    const solEarnings = solTokens.reduce((s, t) => s + t.earnings, 0);
    const ethEarnings = ethTokens.reduce((s, t) => s + t.earnings, 0);
    const totalTokens = creatorTokens.length;
    const graduated = creatorTokens.filter((t) => t.graduated).length;
    const totalTrades = creatorTokens.reduce((s, t) => s + t.tradeCount, 0);

    const solUsd = solEarnings * usdPrices.sol;
    const ethUsd = ethEarnings * usdPrices.eth;
    const totalUsd = solUsd + ethUsd;

    return { solEarnings, ethEarnings, totalTokens, graduated, totalTrades, solUsd, ethUsd, totalUsd };
  }, [creatorTokens, usdPrices]);

  function getChainSymbol(blockchain: string): string {
    return blockchain === "solana" ? "SOL" : "ETH";
  }

  function getExplorerLink(blockchain: "solana" | "ethereum", address: string): string {
    if (blockchain === "solana") return `https://solscan.io/account/${address}`;
    return `https://etherscan.io/address/${address}`;
  }

  return (
    <div className="min-h-dvh bg-[#050505] py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-8">
          <h1
            className="text-[#00ff41] mb-2 pixel-shadow-sm"
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: "1rem",
            }}
          >
            💰 EARNINGS DASHBOARD
          </h1>
          <p
            className="text-[#e0ffe0]"
            style={{ fontFamily: '"VT323", monospace', fontSize: "1.15rem" }}
          >
            Track real creator earnings from your meme coin tokens
          </p>
        </motion.div>

        {!walletAddr ? (
          /* Not Connected */
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="text-center py-12">
              <p className="text-5xl mb-4">🔑</p>
              <p
                className="text-[#ffffff] mb-2 pixel-shadow-sm"
                style={{
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: "0.65rem",
                }}
              >
                CONNECT WALLET TO VIEW EARNINGS
              </p>
              <p
                className="text-[#e0ffe0] mb-6"
                style={{ fontFamily: '"VT323", monospace', fontSize: "1.1rem" }}
              >
                Connect your Solana or Ethereum wallet to see your creator earnings
              </p>
            </Card>
          </motion.div>
        ) : loading && creatorTokens.length === 0 ? (
          /* Loading */
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="retro-card p-4 animate-pulse">
                <div className="h-4 bg-[#1a1a0a] rounded w-3/4 mb-3" />
                <div className="h-3 bg-[#1a1a0a] rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : creatorTokens.length === 0 ? (
          /* No Tokens */
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="text-center py-12">
              <p className="text-5xl mb-4">🪙</p>
              <p
                className="text-[#ffffff] mb-2 pixel-shadow-sm"
                style={{
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: "0.65rem",
                }}
              >
                NO TOKENS CREATED YET
              </p>
              <p
                className="text-[#e0ffe0] mb-2"
                style={{ fontFamily: '"VT323", monospace', fontSize: "1.1rem" }}
              >
                You haven't created any tokens yet. Launch your first meme coin to start earning!
              </p>
              <p
                className="text-[#b0d0b0] mb-6"
                style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
              >
                You earn 0.5% on all trades of your tokens on the bonding curve.
              </p>
              <Link to="/create" className="inline-block">
                <button
                  className="retro-btn retro-btn-orange text-[0.5rem] px-4 py-2"
                  style={{ fontFamily: '"Press Start 2P", monospace' }}
                >
                  🚀 CREATE TOKEN
                </button>
              </Link>
            </Card>
          </motion.div>
        ) : (
          <>
            {/* Wallet Info */}
            <div
              className="mb-6 text-center"
              style={{ fontFamily: '"VT323", monospace', fontSize: "1rem", color: "#b0d0b0" }}
            >
              Creator Wallet: {truncatedWallet}
              {solAddress && (
                <a
                  href={getExplorerLink("solana", solAddress)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-2 text-[#00ff41] hover:underline"
                >
                  [Solscan ↗]
                </a>
              )}
              {ethAddress && (
                <a
                  href={getExplorerLink("ethereum", ethAddress)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-2 text-[#00ff41] hover:underline"
                >
                  [Etherscan ↗]
                </a>
              )}
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              {[
                {
                  label: "TOTAL EARNED",
                  value: (
                    <div>
                      {summary.solEarnings > 0 && (
                        <div>{summary.solEarnings.toFixed(4)} SOL</div>
                      )}
                      {summary.ethEarnings > 0 && (
                        <div>{summary.ethEarnings.toFixed(4)} ETH</div>
                      )}
                      {summary.solEarnings === 0 && summary.ethEarnings === 0 && (
                        <div>0.0000</div>
                      )}
                    </div>
                  ),
                  sub: summary.totalUsd > 0 ? `~${formatUsd(summary.totalUsd)}` : "",
                  icon: "💰",
                  color: "#ffd700",
                },
                {
                  label: "TOKENS CREATED",
                  value: `${summary.totalTokens}`,
                  icon: "🚀",
                  color: "#00ff41",
                },
                {
                  label: "GRADUATED",
                  value: `${summary.graduated}`,
                  icon: "🎓",
                  color: summary.graduated > 0 ? "#ffd700" : "#00ff41",
                },
                {
                  label: "TOTAL TRADES",
                  value: `${summary.totalTrades}`,
                  icon: "📊",
                  color: "#00ff41",
                },
              ].map((s) => (
                <motion.div
                  key={s.label}
                  whileHover={{ scale: 1.03, y: -2 }}
                  className="retro-card p-3 text-center"
                >
                  <div className="text-lg mb-1">{s.icon}</div>
                  <div
                    className="text-sm font-bold"
                    style={{
                      fontFamily: '"VT323", monospace',
                      fontSize: "1.05rem",
                      color: s.color,
                    }}
                  >
                    {s.value}
                  </div>
                  <div
                    className="text-[0.35rem]"
                    style={{
                      fontFamily: '"Press Start 2P", monospace',
                      color: "#b0d0b0",
                    }}
                  >
                    {s.label}
                  </div>
                  {"sub" in s && typeof s.sub === "string" && s.sub && (
                    <div
                      className="text-xs mt-0.5"
                      style={{
                        fontFamily: '"VT323", monospace',
                        fontSize: "0.85rem",
                        color: "#b0d0b0",
                      }}
                    >
                      {s.sub}
                    </div>
                  )}
                </motion.div>
              ))}
            </div>

            {/* Chain Filter */}
            <div className="flex gap-2 mb-4">
              {(["all", "solana", "ethereum"] as const).map((ct) => (
                <button
                  key={ct}
                  onClick={() => setActiveChain(ct)}
                  className={`retro-tab text-[0.35rem] ${
                    activeChain === ct ? "retro-tab-active" : ""
                  }`}
                  style={{ fontFamily: '"Press Start 2P", monospace' }}
                >
                  {ct === "all" ? "ALL" : ct === "solana" ? "◎ SOLANA" : "Ξ ETHEREUM"}
                </button>
              ))}
            </div>

            {/* Per-Token Earnings */}
            <div className="space-y-3">
              <h3
                className="text-[#00ff41] pixel-shadow-sm"
                style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem" }}
              >
                📋 PER-TOKEN BREAKDOWN
              </h3>

              {filteredTokens.length === 0 ? (
                <Card className="text-center py-6">
                  <p
                    className="text-[#b0d0b0]"
                    style={{ fontFamily: '"VT323", monospace', fontSize: "1.1rem" }}
                  >
                    No tokens on this chain.
                  </p>
                </Card>
              ) : (
                filteredTokens.map((token, i) => (
                  <EarningsTokenCard key={token.tokenId} token={token} index={i} />
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Individual token earnings card */
function EarningsTokenCard({
  token,
  index,
}: {
  token: CreatorTokenData;
  index: number;
}) {
  const chainSymbol = token.blockchain === "solana" ? "SOL" : "ETH";
  const explorerName = token.blockchain === "solana" ? "Solscan" : "Etherscan";
  const explorerLink =
    token.blockchain === "solana"
      ? `https://solscan.io/account/${token.tokenId}`
      : `https://etherscan.io/address/${token.tokenId}`;

  const isGraduated = token.status === "graduated";

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.3) }}
      className="retro-card p-4 hover:border-[#00ff41] transition-colors"
    >
      <div className="flex items-start gap-4">
        {/* Token image */}
        <div
          className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0 overflow-hidden"
          style={{ background: "#0d120d", border: "2px solid rgba(0,255,65,0.2)" }}
        >
          {token.image ? (
            <img src={token.image} alt="" className="w-full h-full object-cover" />
          ) : (
            <span
              className="font-bold text-[#00ff41]"
              style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.4rem" }}
            >
              {token.ticker.slice(0, 2)}
            </span>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="font-bold text-[#ffffff]"
              style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem" }}
            >
              {token.tokenName}
            </span>
            <span
              className="text-[#e0ffe0]"
              style={{ fontFamily: '"VT323", monospace', fontSize: "1.1rem" }}
            >
              ${token.ticker}
            </span>
            <span
              className="px-1.5 py-0.5 rounded text-[0.3rem]"
              style={{
                fontFamily: '"Press Start 2P", monospace',
                background: isGraduated
                  ? "rgba(255,215,0,0.15)"
                  : "rgba(0,255,65,0.1)",
                color: isGraduated ? "#ffd700" : "#00ff41",
              }}
            >
              {isGraduated ? "🎓 GRADUATED" : "📈 BONDING"}
            </span>
          </div>

          {/* Stats row */}
          <div
            className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3"
            style={{ fontFamily: '"VT323", monospace', fontSize: "0.95rem" }}
          >
            <div>
              <span className="text-[#b0d0b0]">Earned: </span>
              <span className="text-[#ffd700] font-bold">
                {token.earnings.toFixed(6)} {chainSymbol}
              </span>
            </div>
            <div>
              <span className="text-[#b0d0b0]">Trades: </span>
              <span className="text-[#e0ffe0]">{token.tradeCount}</span>
            </div>
            <div>
              <span className="text-[#b0d0b0]">Price: </span>
              <span className="text-[#e0ffe0]">
                {token.price < 0.0001
                  ? token.price.toFixed(8)
                  : token.price.toFixed(6)}{" "}
                {chainSymbol}
              </span>
            </div>
            <div>
              <span className="text-[#b0d0b0]">MCap: </span>
              <span className="text-[#e0ffe0]">
                {formatCompact(token.marketCap)} {chainSymbol}
              </span>
            </div>
          </div>

          {/* Graduation progress bar */}
          {!isGraduated && (
            <div className="mt-3">
              <div
                className="h-1.5 rounded-sm overflow-hidden"
                style={{ background: "#0d120d", border: "1px solid rgba(0,255,65,0.1)" }}
              >
                <motion.div
                  className="h-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(token.graduationProgress, 100)}%` }}
                  transition={{ duration: 0.5 }}
                  style={{
                    background:
                      token.graduationProgress >= 80
                        ? "linear-gradient(90deg, #00ff41, #39ff14)"
                        : "linear-gradient(90deg, #ffb83c, #ffd700)",
                  }}
                />
              </div>
              <div className="flex justify-between mt-0.5">
                <span
                  style={{
                    fontFamily: '"VT323", monospace',
                    fontSize: "0.75rem",
                    color: "#b0d0b0",
                  }}
                >
                  {token.graduationProgress.toFixed(0)}% to 🎓
                </span>
              </div>
            </div>
          )}

          {/* Actions row */}
          <div className="flex items-center gap-3 mt-3 pt-3" style={{ borderTop: "1px solid rgba(0,255,65,0.1)" }}>
            <Link
              to="/token/$id"
              params={{ id: token.tokenId }}
              className="retro-btn retro-btn-turquoise text-[0.35rem] px-3 py-1.5 inline-flex items-center gap-1"
              style={{ fontFamily: '"Press Start 2P", monospace' }}
            >
              🔍 VIEW TOKEN
            </Link>
            <a
              href={explorerLink}
              target="_blank"
              rel="noopener noreferrer"
              className="retro-btn retro-btn-outline text-[0.35rem] px-3 py-1.5 inline-flex items-center gap-1"
              style={{ fontFamily: '"Press Start 2P", monospace' }}
            >
              {explorerName} <HiMiniArrowTopRightOnSquare size={10} />
            </a>
            <span
              className="text-[#b0d0b0] ml-auto"
              style={{ fontFamily: '"VT323", monospace', fontSize: "0.85rem" }}
            >
              {getTimeAgo(token.createdAt)}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
