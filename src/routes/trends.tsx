import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Card, Badge } from "~/components/UI";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

export const Route = createFileRoute("/trends")({
  component: TrendsPage,
});

// ─── Types ───────────────────────────────────────

interface TrendCoin {
  name: string;
  symbol: string;
  marketCapRank: number;
  moonshot: boolean;
}

interface DexPair {
  pairName: string;
  priceUsd: number;
  volume24h: number;
  liquidity: number;
  chain: string;
}

// ─── Mock fallback data ──────────────────────────

const MOCK_TRENDING: TrendCoin[] = [
  { name: "DOGE2049", symbol: "DOGE49", marketCapRank: 42, moonshot: true },
  { name: "PEPEGAINS", symbol: "PEPEG", marketCapRank: 87, moonshot: false },
  { name: "CATWIF", symbol: "CWIF", marketCapRank: 128, moonshot: false },
];

const MOCK_PAIRS: DexPair[] = [
  { pairName: "WIF/SOL", priceUsd: 2.34, volume24h: 45_000_000, liquidity: 12_000_000, chain: "solana" },
  { pairName: "BONK/SOL", priceUsd: 0.0000234, volume24h: 32_000_000, liquidity: 8_500_000, chain: "solana" },
  { pairName: "PEPE/ETH", priceUsd: 0.00000891, volume24h: 28_000_000, liquidity: 6_200_000, chain: "ethereum" },
  { pairName: "MEW/SOL", priceUsd: 0.00567, volume24h: 22_000_000, liquidity: 5_800_000, chain: "solana" },
  { pairName: "POPCAT/SOL", priceUsd: 0.89, volume24h: 18_000_000, liquidity: 4_500_000, chain: "solana" },
];

const HYPE_BLURBS = [
  "🔥 $WIF continues its memetic dominance — up 340% this week. Community growing exponentially.",
  "🚀 New meme meta emerging: cat coins are the new dog coins. $MEW leads the charge.",
  "💎 Solana meme season is here — gas fees near zero, launches accelerating.",
  "🐕 Dog-themed tokens still dominate volume but feline coins are closing the gap fast.",
  "📈 Meme coin total market cap approaching $60B — institutional interest growing.",
  "⚡ Lightning-fast launches on Solana making ETH gas wars obsolete for meme degens.",
];

const MOONSHOT_COINS = [
  { name: "WIF", hype: 94 },
  { name: "BONK", hype: 88 },
  { name: "MEW", hype: 76 },
  { name: "POPCAT", hype: 65 },
  { name: "SAMO", hype: 52 },
];

// ─── Helpers ─────────────────────────────────────

function formatCompact(n: number): string {
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
  if (n < 0.01 && n > 0) return "$" + n.toFixed(6);
  return "$" + n.toFixed(4);
}

function formatPrice(n: number): string {
  if (n < 0.0001 && n > 0) return "$" + n.toFixed(8);
  if (n < 0.01) return "$" + n.toFixed(6);
  return "$" + n.toFixed(4);
}

// ─── MoonshotTracker Chart ────────────────────────

function MoonshotTracker() {
  const data = {
    labels: MOONSHOT_COINS.map((c) => c.name),
    datasets: [
      {
        data: MOONSHOT_COINS.map((c) => c.hype),
        backgroundColor: MOONSHOT_COINS.map((c) => {
          if (c.hype >= 90) return "rgba(0, 255, 65, 0.6)";
          if (c.hype >= 70) return "rgba(0, 220, 55, 0.4)";
          return "rgba(0, 180, 40, 0.3)";
        }),
        borderColor: "#00ff41",
        borderWidth: 2,
        borderRadius: 4,
        borderSkipped: false,
      },
    ],
  };

  return (
    <div className="h-64">
      <Bar
        data={data}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: "x",
          scales: {
            x: {
              grid: { color: "rgba(0,255,65,0.08)" },
              ticks: {
                color: "#e0ffe0",
                font: { family: "VT323", size: 14 },
              },
            },
            y: {
              display: true,
              max: 100,
              grid: { color: "rgba(0,255,65,0.08)" },
              ticks: {
                color: "#b0d0b0",
                font: { family: "VT323", size: 12 },
                callback: (v) => v + "%",
              },
            },
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: "#0a0f0a",
              titleColor: "#00ff41",
              bodyColor: "#e0ffe0",
              borderColor: "rgba(0,255,65,0.2)",
              borderWidth: 2,
              callbacks: {
                label: (ctx) => `Hype Score: ${ctx.raw}%`,
              },
            },
          },
        }}
      />
    </div>
  );
}

// ─── AI Hype Roundup ──────────────────────────────

function AIHypeRoundup() {
  const [blurbIdx, setBlurbIdx] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setBlurbIdx((prev) => (prev + 1) % HYPE_BLURBS.length);
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Card className="p-5 crt-effect">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">🤖</span>
        <h3
          className="text-[#00ff41] pixel-shadow-sm"
          style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem" }}
        >
          AI HYPE ROUNDUP
        </h3>
      </div>
      <div
        className="bg-[#0d120d] border border-[rgba(0,255,65,0.2)] rounded-md p-4 min-h-[80px] flex items-center"
        style={{
          fontFamily: '"VT323", monospace',
          fontSize: "1.1rem",
          color: "#e0ffe0",
        }}
      >
        <motion.p
          key={blurbIdx}
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -10 }}
          transition={{ duration: 0.4 }}
        >
          <span className="text-[#00ff41] mr-2">{">"}</span>
          {HYPE_BLURBS[blurbIdx]}
        </motion.p>
      </div>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────

function TrendsPage() {
  const [trending, setTrending] = useState<TrendCoin[]>([]);
  const [pairs, setPairs] = useState<DexPair[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setFetchError(false);

    // Fetch CoinGecko trending
    try {
      const cgRes = await fetch("https://api.coingecko.com/api/v3/search/trending");
      if (cgRes.ok) {
        const cgJson = await cgRes.json();
        const coins: TrendCoin[] = (cgJson.coins || []).slice(0, 5).map((c: any) => ({
          name: c.item?.name || "Unknown",
          symbol: (c.item?.symbol || "???").toUpperCase(),
          marketCapRank: c.item?.market_cap_rank || 999,
          moonshot: (c.item?.market_cap_rank || 999) <= 100,
        }));
        setTrending(coins);
      } else {
        setTrending(MOCK_TRENDING);
      }
    } catch {
      setTrending(MOCK_TRENDING);
    }

    // Fetch DexScreener meme pairs
    try {
      const dexRes = await fetch("https://api.dexscreener.com/latest/dex/search?q=meme");
      if (dexRes.ok) {
        const dexJson = await dexRes.json();
        const dexPairs: DexPair[] = (dexJson.pairs || []).slice(0, 10).map((p: any) => ({
          pairName: `${p.baseToken?.symbol || "???"}/${p.quoteToken?.symbol || "???"}`,
          priceUsd: parseFloat(p.priceUsd || "0"),
          volume24h: p.volume?.h24 || 0,
          liquidity: p.liquidity?.usd || 0,
          chain: p.chainId || "unknown",
        }));
        setPairs(dexPairs.length > 0 ? dexPairs : MOCK_PAIRS);
      } else {
        setPairs(MOCK_PAIRS);
      }
    } catch {
      setPairs(MOCK_PAIRS);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const getMoonshotBadge = (rank: number, moonshot: boolean) => {
    if (moonshot) return { label: "MOONSHOT", color: "#00ff41", emoji: "🟢" };
    if (rank <= 200) return { label: "WATCHING", color: "#ffd23f", emoji: "🟡" };
    return { label: "STEADY", color: "#00cc33", emoji: "🔴" };
  };

  const getChainBadge = (chain: string) => {
    if (chain === "solana") return { label: "SOL", color: "rgba(0,255,65,0.15)", textColor: "#00ff41" };
    if (chain === "ethereum") return { label: "ETH", color: "rgba(57,255,20,0.15)", textColor: "#39ff14" };
    return { label: chain.toUpperCase(), color: "rgba(0,255,65,0.1)", textColor: "#b0d0b0" };
  };

  return (
    <div className="min-h-dvh bg-[#050505] py-10">
      <div className="max-w-5xl mx-auto px-4">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="text-center mb-8"
        >
          <h1
            className="text-2xl font-bold text-[#00ff41] mb-2 pixel-shadow-sm"
            style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "1rem" }}
          >
            TRENDING NOW
          </h1>
          <p
            className="text-[#e0ffe0]"
            style={{ fontFamily: '"VT323", monospace', fontSize: "1.15rem" }}
          >
            📡 Live blockchain data from CoinGecko & DexScreener
          </p>
          <button
            onClick={fetchData}
            disabled={loading}
            className="retro-tab text-[0.4rem] px-2 py-1 mt-3 inline-flex items-center gap-1"
            style={{ fontFamily: '"Press Start 2P", monospace' }}
          >
            {loading ? "⏳ FETCHING..." : "🔄 REFRESH DATA"}
          </button>
        </motion.div>

        {/* Section 1: Top Meme Coins Exploding */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05, duration: 0.3 }}
          className="mb-8"
        >
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">🔥</span>
            <h2
              className="text-[#00ff41] pixel-shadow-sm"
              style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.55rem" }}
            >
              TOP MEME COINS EXPLODING RIGHT NOW
            </h2>
          </div>

          {trending.length === 0 && loading && (
            <Card className="p-6">
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="h-10 rounded-md retro-blink"
                    style={{
                      background: "#0d120d",
                      border: "1px solid rgba(0,255,65,0.08)",
                      opacity: 0.15 * i,
                      width: `${100 - (i - 1) * 10}%`,
                    }}
                  />
                ))}
              </div>
            </Card>
          )}

          <div className="space-y-3">
            {trending.map((coin, i) => {
              const badge = getMoonshotBadge(coin.marketCapRank, coin.moonshot);
              return (
                <motion.div
                  key={`${coin.symbol}-${i}`}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.08 + i * 0.04, duration: 0.3 }}
                >
                  <Card className="p-4">
                    <div className="flex items-center gap-4">
                      <div
                        className="text-[#00ff41] font-bold shrink-0"
                        style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.7rem" }}
                      >
                        #{i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className="text-[#ffffff] font-bold"
                            style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem" }}
                          >
                            {coin.name}
                          </span>
                          <span
                            className="text-[#00ff41]"
                            style={{ fontFamily: '"VT323", monospace', fontSize: "1.15rem" }}
                          >
                            ${coin.symbol}
                          </span>
                        </div>
                        <div
                          className="text-[#e0ffe0] mt-1"
                          style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
                        >
                          Market Cap Rank: #{coin.marketCapRank}
                        </div>
                      </div>
                      <span
                        className="text-[0.45rem] px-2 py-1 rounded font-bold"
                        style={{
                          fontFamily: '"Press Start 2P", monospace',
                          color: badge.color,
                          background: "rgba(0,255,65,0.08)",
                          border: `1px solid ${badge.color}33`,
                          boxShadow: `0 0 8px ${badge.color}22`,
                        }}
                      >
                        {badge.emoji} {badge.label}
                      </span>
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        {/* Section 2: DexScreener Live */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.3 }}
          className="mb-8"
        >
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">📡</span>
            <h2
              className="text-[#00ff41] pixel-shadow-sm"
              style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.55rem" }}
            >
              DEXSCREENER LIVE — LATEST MEME PAIRS
            </h2>
          </div>

          <Card className="p-0 overflow-hidden">
            {/* Table header */}
            <div className="overflow-x-auto custom-scrollbar">
              <div className="min-w-[500px]">
                <div
                  className="grid grid-cols-5 gap-2 px-4 py-3 border-b border-[rgba(0,255,65,0.15)] bg-[rgba(0,255,65,0.03)]"
                  style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.4rem", color: "#b0d0b0" }}
                >
                  <span>PAIR</span>
                  <span className="text-right">PRICE</span>
                  <span className="text-right">24H VOL</span>
                  <span className="text-right">LIQUIDITY</span>
                  <span className="text-right">CHAIN</span>
                </div>
                <div className="max-h-80 overflow-y-auto custom-scrollbar">
                  {pairs.map((pair, i) => {
                    const chainBadge = getChainBadge(pair.chain);
                    return (
                      <motion.div
                        key={`${pair.pairName}-${i}`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.02 * i }}
                        className="grid grid-cols-5 gap-2 px-4 py-3 border-b border-[rgba(0,255,65,0.06)] hover:bg-[rgba(0,255,65,0.03)] transition-colors"
                        style={{ fontFamily: '"VT323", monospace', fontSize: "1.1rem" }}
                      >
                        <span className="text-[#ffffff] font-bold">{pair.pairName}</span>
                        <span className="text-[#00ff41] text-right">{formatPrice(pair.priceUsd)}</span>
                        <span className="text-[#e0ffe0] text-right">{formatCompact(pair.volume24h)}</span>
                        <span className="text-[#e0ffe0] text-right">{formatCompact(pair.liquidity)}</span>
                        <span className="text-right">
                          <span
                            className="text-[0.4rem] px-1.5 py-0.5 rounded font-bold"
                            style={{
                              fontFamily: '"Press Start 2P", monospace',
                              background: chainBadge.color,
                              color: chainBadge.textColor,
                              border: `1px solid ${chainBadge.textColor}33`,
                            }}
                          >
                            {chainBadge.label}
                          </span>
                        </span>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* Section 3: AI Hype Roundup */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18, duration: 0.3 }}
          className="mb-8"
        >
          <AIHypeRoundup />
        </motion.div>

        {/* Section 4: Moonshot Tracker */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.22, duration: 0.3 }}
        >
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">📊</span>
            <h2
              className="text-[#00ff41] pixel-shadow-sm"
              style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.55rem" }}
            >
              MOONSHOT TRACKER
            </h2>
          </div>
          <Card className="p-5">
            <MoonshotTracker />
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
