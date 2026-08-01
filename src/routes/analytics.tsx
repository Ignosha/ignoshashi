import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { motion, useSpring, AnimatePresence } from "framer-motion";
import {
  HiMiniChartBar,
  HiMiniCurrencyDollar,
  HiMiniArrowPath,
  HiMiniRocketLaunch,
  HiMiniUserGroup,
  HiMiniTrophy,
  HiMiniBolt,
  HiMiniArrowsRightLeft,
} from "react-icons/hi2";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
} from "chart.js";
import { Card } from "~/components/UI";
import {
  getTokens,
  getTrades,
  getTotalVolume,
  getTotalTrades,
  getTotalTokens,
  getFeesCollected,
  getSolVolume,
  getEthVolume,
  getTotalMarketCap,
  getBondingCurveStates,
  getLeaderboardData,
  fetchAllTradesFromServer,
  type TradeData,
  type TokenData,
} from "~/services/tracker";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);

export const Route = createFileRoute("/analytics")({
  component: AnalyticsPage,
});

// ─── Helpers ───────────────────────────────────

function formatCompact(n: number): string {
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
  return "$" + n.toFixed(0);
}

function formatCompactRaw(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n.toFixed(0);
}

function truncateAddr(addr: string): string {
  if (addr.length <= 12) return addr;
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

function timeAgo(ts: number): string {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

function AnimatedNumber({ value, suffix = "" }: { value: number; suffix?: string }) {
  const [display, setDisplay] = useState("0");
  const spring = useSpring(0, { stiffness: 80, damping: 20 });

  useEffect(() => {
    const unsub = spring.on("change", (v) => {
      setDisplay(Math.round(v).toLocaleString());
    });
    spring.set(value);
    return () => unsub();
  }, [value, spring]);

  return (
    <motion.span>
      {display}
      {suffix}
    </motion.span>
  );
}

function AreaChart({
  label,
  data,
  color,
  emptyMessage,
}: {
  label: string;
  data: number[];
  color: string;
  emptyMessage?: string;
}) {
  const allZero = data.every((v) => v === 0);
  const chartData = {
    labels: data.map((_, i) => i.toString()),
    datasets: [
      {
        data,
        borderColor: color,
        backgroundColor: (ctx: any) => {
          if (!ctx.chart.chartArea) return "transparent";
          const { top, bottom } = ctx.chart.chartArea;
          const grad = ctx.chart.ctx.createLinearGradient(0, top, 0, bottom);
          grad.addColorStop(0, `${color}33`);
          grad.addColorStop(1, "rgba(0,0,0,0)");
          return grad;
        },
        fill: true,
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.4,
      },
    ],
  };

  return (
    <div className="relative">
      <h4
        className="text-xs font-bold text-[#e0ffe0] mb-3"
        style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.45rem" }}
      >
        {label}
      </h4>
      <div className="h-44 relative">
        <Line
          data={chartData}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              x: { display: false },
              y: {
                display: true,
                grid: { color: "rgba(0,255,65,0.1)" },
                ticks: { color: "#b0d0b0", font: { size: 10 } },
              },
            },
            plugins: {
              legend: { display: false },
              tooltip: {
                enabled: true,
                backgroundColor: "#0a0f0a",
                titleColor: "#00ff41",
                bodyColor: "#e0ffe0",
                borderColor: "rgba(0,255,65,0.2)",
                borderWidth: 2,
              },
            },
          }}
        />
        {allZero && emptyMessage && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-[#0d120d]/90 border border-[rgba(0,255,65,0.2)] rounded-md px-4 py-2">
              <p
                className="text-[#e0ffe0] text-center"
                style={{ fontFamily: '"VT323", monospace', fontSize: "0.95rem" }}
              >
                {emptyMessage}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Types for tabs ────────────────────────────

type TabKey = "overview" | "whales" | "volume" | "creators";
type ChainFilter = "all" | "solana" | "ethereum";

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "overview", label: "OVERVIEW", icon: <HiMiniChartBar size={12} /> },
  { key: "whales", label: "WHALES", icon: <HiMiniBolt size={12} /> },
  { key: "volume", label: "VOLUME", icon: <HiMiniArrowsRightLeft size={12} /> },
  { key: "creators", label: "CREATORS", icon: <HiMiniTrophy size={12} /> },
];

const CHAIN_FILTERS: { key: ChainFilter; label: string }[] = [
  { key: "all", label: "ALL" },
  { key: "solana", label: "SOL" },
  { key: "ethereum", label: "ETH" },
];

// ─── Main Page ─────────────────────────────────

function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [chainFilter, setChainFilter] = useState<ChainFilter>("all");
  const [sortKey, setSortKey] = useState<"size" | "recent">("size");

  // Core stats
  const [tokensLaunched, setTokensLaunched] = useState(0);
  const [totalVolume, setTotalVolume] = useState(0);
  const [totalTrades, setTotalTrades] = useState(0);
  const [fees, setFees] = useState({ sol: 0, eth: 0 });
  const [solVol, setSolVol] = useState(0);
  const [ethVol, setEthVol] = useState(0);
  const [graduatedCount, setGraduatedCount] = useState(0);
  const [activeTraders24h, setActiveTraders24h] = useState(0);
  const [volHistory, setVolHistory] = useState<number[]>([0]);
  const [tradeHistory, setTradeHistory] = useState<number[]>([0]);
  const [refreshing, setRefreshing] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // Whale data
  const [allTrades, setAllTrades] = useState<TradeData[]>([]);
  const [serverTradesLoading, setServerTradesLoading] = useState(false);

  // Compute derived data
  const tokens = useMemo(() => getTokens(), [tokensLaunched]);
  const localTrades = useMemo(() => getTrades(), [totalTrades]);
  const curves = useMemo(() => getBondingCurveStates(), [totalTrades]);
  const curveMap = useMemo(() => new Map(curves.map((c) => [c.tokenId, c])), [curves]);
  const tokenMap = useMemo(() => new Map(tokens.map((t) => [t.id, t])), [tokens]);

  // Refresh all stats
  const refreshData = useCallback(() => {
    setRefreshing(true);
    const allToks = getTokens();
    const realTokens = allToks.filter((t) => !t.isDemo);
    setTokensLaunched(realTokens.length);
    setTotalVolume(getTotalVolume());
    setTotalTrades(getTotalTrades());
    setFees(getFeesCollected());
    setSolVol(getSolVolume());
    setEthVol(getEthVolume());

    // Graduated count from bonding curves
    const allCurves = getBondingCurveStates();
    setGraduatedCount(allCurves.filter((c) => c.graduated).length);

    // Active traders from trades (unique wallets)
    const allLocalTrades = getTrades();
    const wallets = new Set(allLocalTrades.map((t) => t.wallet));
    setActiveTraders24h(wallets.size);

    const mcap = getTotalMarketCap();
    setVolHistory((prev) => {
      const next = [...prev, mcap];
      return next.slice(-30);
    });
    setTradeHistory((prev) => {
      const next = [...prev, getTotalTrades()];
      return next.slice(-30);
    });

    setTimeout(() => setRefreshing(false), 400);
  }, []);

  // Fetch server trades for whale tracking
  useEffect(() => {
    setServerTradesLoading(true);
    fetchAllTradesFromServer(200).then((trades) => {
      setAllTrades(trades);
      setServerTradesLoading(false);
    });
  }, [totalTrades]);

  // Initial load + polling
  useEffect(() => {
    refreshData();
    setInitialLoading(false);
    const interval = setInterval(refreshData, 5000);
    return () => clearInterval(interval);
  }, [refreshData]);

  const displayVol = volHistory.length >= 2 ? volHistory : Array(11).fill(0);
  const displayTrades = tradeHistory.length >= 2 ? tradeHistory : Array(11).fill(0);

  const hasData = totalVolume > 0 || totalTrades > 0 || tokensLaunched > 0;

  // ─── Whale data computation ──────────────────
  const whaleTrades = useMemo(() => {
    let trades = allTrades.length > 0 ? allTrades : localTrades;
    // Filter by chain
    if (chainFilter !== "all") {
      trades = trades.filter((t) => {
        const token = tokenMap.get(t.tokenId);
        return token?.blockchain === chainFilter;
      });
    }
    // Sort
    const sorted = [...trades].sort((a, b) => {
      if (sortKey === "size") return b.total - a.total;
      return b.timestamp - a.timestamp;
    });
    return sorted.slice(0, 20);
  }, [allTrades, localTrades, chainFilter, sortKey, tokenMap]);

  // ─── Volume heatmap data ─────────────────────
  const volumeHeatmap = useMemo(() => {
    const tokens = getTokens().filter((t) => !t.isDemo);
    // Compute 24h volume from local trades for bonding curve, plus token volume24h from storage
    const volumeMap = new Map<string, { vol: number; name: string; ticker: string; chain: string }>();

    for (const token of tokens) {
      volumeMap.set(token.id, {
        vol: token.volume24h || 0,
        name: token.name,
        ticker: token.ticker,
        chain: token.blockchain,
      });
    }

    // Also count recent trade volume (local trades)
    const oneDayAgo = Date.now() - 86400000;
    for (const trade of localTrades) {
      if (trade.timestamp > oneDayAgo) {
        const existing = volumeMap.get(trade.tokenId);
        if (existing) {
          existing.vol += trade.total;
        }
      }
    }

    const items = Array.from(volumeMap.values())
      .filter((v) => v.vol > 0)
      .sort((a, b) => b.vol - a.vol);

    return items;
  }, [localTrades]);

  const maxHeatVol = volumeHeatmap.length > 0 ? volumeHeatmap[0].vol : 1;

  // ─── Trending creators data ──────────────────
  const trendingCreators = useMemo(() => {
    const allToks = getTokens().filter((t) => !t.isDemo);
    const creatorMap = new Map<
      string,
      {
        addr: string;
        tokensCreated: number;
        totalVolume: number;
        totalFees: number;
        topToken: { name: string; ticker: string; vol: number };
      }
    >();

    for (const token of allToks) {
      const addr = token.creator;
      if (!addr) continue;
      const existing = creatorMap.get(addr);
      const curve = curveMap.get(token.id);
      const tokenVol = token.volume24h || 0;
      const earnings = curve?.creatorEarnings || 0;

      if (existing) {
        existing.tokensCreated++;
        existing.totalVolume += tokenVol;
        existing.totalFees += earnings;
        if (tokenVol > existing.topToken.vol) {
          existing.topToken = { name: token.name, ticker: token.ticker, vol: tokenVol };
        }
      } else {
        creatorMap.set(addr, {
          addr,
          tokensCreated: 1,
          totalVolume: tokenVol,
          totalFees: earnings,
          topToken: { name: token.name, ticker: token.ticker, vol: tokenVol },
        });
      }
    }

    return Array.from(creatorMap.values())
      .sort((a, b) => b.totalVolume + b.totalFees - (a.totalVolume + a.totalFees))
      .slice(0, 12);
  }, [curves, curveMap]);

  // ─── Chain color helper ──────────────────────
  const chainColor = (chain: string) =>
    chain === "solana" ? "#9945ff" : "#627eea";

  const chainLabel = (chain: string) =>
    chain === "solana" ? "SOL" : "ETH";

  return (
    <div className="min-h-dvh bg-[#050505] py-8">
      <div className="max-w-6xl mx-auto px-4">
        {/* ─── Header ─── */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <h1
              className="text-2xl font-bold text-[#00ff41] pixel-shadow-sm"
              style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "1rem" }}
            >
              ANALYTICS
            </h1>
            <span
              className="w-2.5 h-2.5 rounded-full retro-blink inline-block"
              style={{ background: hasData ? "#00ff41" : "#b0d0b0" }}
              title={hasData ? "Live" : "No data yet"}
            />
            <button
              onClick={refreshData}
              className="retro-tab text-[0.4rem] px-2 py-1 inline-flex items-center gap-1 ml-auto"
              style={{ fontFamily: '"Press Start 2P", monospace' }}
              title="Refresh all stats"
            >
              <HiMiniArrowPath size={10} className={refreshing ? "animate-spin" : ""} />
              REFRESH
            </button>
          </div>
          <p className="text-[#e0ffe0] mb-2" style={{ fontFamily: '"VT323", monospace', fontSize: "1.15rem" }}>
            Real-time platform analytics & whale tracking
          </p>
        </motion.div>

        {/* ─── Summary Stats Bar ─── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 mb-8"
        >
          {[
            { label: "TOKENS", value: tokensLaunched, icon: <HiMiniRocketLaunch size={16} />, color: "#00ff41" },
            { label: "24H VOL", value: totalVolume, icon: <HiMiniCurrencyDollar size={16} />, color: "#00ff41", isCurrency: true },
            { label: "TRADES", value: totalTrades, icon: <HiMiniArrowsRightLeft size={16} />, color: "#00cc33" },
            { label: "GRADUATED", value: graduatedCount, icon: <HiMiniTrophy size={16} />, color: "#ffd700" },
            { label: "TRADERS", value: activeTraders24h, icon: <HiMiniUserGroup size={16} />, color: "#06d6a0" },
          ].map((stat) => (
            <motion.div
              key={stat.label}
              whileHover={{ scale: 1.05, y: -2 }}
              transition={{ duration: 0.2, ease: [0.68, -0.55, 0.265, 1.55] }}
            >
              <Card>
                <div className="mb-2" style={{ color: stat.color }}>
                  {stat.icon}
                </div>
                <div
                  className="text-lg font-bold"
                  style={{
                    fontFamily: '"Press Start 2P", monospace',
                    fontSize: "0.65rem",
                    color: stat.color,
                  }}
                >
                  {stat.isCurrency ? formatCompact(stat.value) : <AnimatedNumber value={stat.value} />}
                </div>
                <div
                  className="text-[0.35rem] mt-1 text-[#e0ffe0]"
                  style={{ fontFamily: '"Press Start 2P", monospace' }}
                >
                  {stat.label}
                </div>
              </Card>
            </motion.div>
          ))}
        </motion.div>

        {/* ─── Tab Navigation ─── */}
        <div className="flex flex-wrap gap-1.5 mb-6">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`retro-tab inline-flex items-center gap-1 sm:gap-1.5 text-[0.38rem] sm:text-[0.4rem] py-1.5 px-2 sm:px-3 whitespace-nowrap ${
                activeTab === tab.key ? "retro-tab-active" : ""
              }`}
              style={{ fontFamily: '"Press Start 2P", monospace' }}
            >
              <span className="hidden sm:inline">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ─── Tab Content ─── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
          >
            {/* ═══════════════════════════════════════════════
                OVERVIEW TAB
                ═══════════════════════════════════════════════ */}
            {activeTab === "overview" && (
              <div>
                {/* Charts */}
                <div className="grid md:grid-cols-2 gap-6 mb-8">
                  {initialLoading ? (
                    <>
                      <Card>
                        <div className="space-y-3 p-2">
                          <div className="h-4 w-32 rounded retro-blink" style={{ background: "#0d120d", border: "1px solid rgba(0,255,65,0.08)" }} />
                          <div className="h-44 rounded-lg retro-blink" style={{ background: "#0d120d", border: "1px solid rgba(0,255,65,0.08)" }} />
                        </div>
                      </Card>
                      <Card>
                        <div className="space-y-3 p-2">
                          <div className="h-4 w-36 rounded retro-blink" style={{ background: "#0d120d", border: "1px solid rgba(0,255,65,0.08)" }} />
                          <div className="h-44 rounded-lg retro-blink" style={{ background: "#0d120d", border: "1px solid rgba(0,255,65,0.08)" }} />
                        </div>
                      </Card>
                    </>
                  ) : (
                    <>
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.05, duration: 0.2 }}
                      >
                        <Card>
                          <AreaChart
                            label="MARKET CAP TREND"
                            data={displayVol}
                            color="#00ff41"
                            emptyMessage="No market data yet — create and trade tokens"
                          />
                        </Card>
                      </motion.div>
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.1, duration: 0.2 }}
                      >
                        <Card>
                          <AreaChart
                            label="TRADE COUNT TREND"
                            data={displayTrades}
                            color="#9945ff"
                            emptyMessage="No trades recorded yet"
                          />
                        </Card>
                      </motion.div>
                    </>
                  )}
                </div>

                {/* Quick stats cards */}
                <div className="grid md:grid-cols-3 gap-4 mb-8">
                  {/* Fees */}
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15, duration: 0.2 }}>
                    <Card>
                      <div className="text-2xl mb-2 text-center">💎</div>
                      <h3
                        className="text-[#00ff41] font-bold mb-3 text-center"
                        style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem" }}
                      >
                        FEES COLLECTED
                      </h3>
                      <div className="flex justify-center gap-4">
                        <div className="text-center">
                          <div
                            className="text-lg font-bold text-[#9945ff]"
                            style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.6rem" }}
                          >
                            {fees.sol.toFixed(3)} SOL
                          </div>
                          <div className="text-[0.3rem] text-[#e0ffe0] mt-1" style={{ fontFamily: '"Press Start 2P", monospace' }}>
                            SOLANA
                          </div>
                        </div>
                        <div className="text-[#e0ffe0] text-xl">|</div>
                        <div className="text-center">
                          <div
                            className="text-lg font-bold text-[#627eea]"
                            style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.6rem" }}
                          >
                            {fees.eth.toFixed(4)} ETH
                          </div>
                          <div className="text-[0.3rem] text-[#e0ffe0] mt-1" style={{ fontFamily: '"Press Start 2P", monospace' }}>
                            ETHEREUM
                          </div>
                        </div>
                      </div>
                    </Card>
                  </motion.div>

                  {/* Chain volume */}
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2, duration: 0.2 }}>
                    <Card>
                      <div className="text-2xl mb-2 text-center">🌐</div>
                      <h3
                        className="text-[#00ff41] font-bold mb-3 text-center"
                        style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem" }}
                      >
                        CHAIN VOLUME
                      </h3>
                      <div className="flex justify-center gap-4">
                        <div className="text-center">
                          <div
                            className="text-lg font-bold text-[#9945ff]"
                            style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
                          >
                            {formatCompact(solVol)}
                          </div>
                          <div className="text-[0.3rem] text-[#e0ffe0] mt-1" style={{ fontFamily: '"Press Start 2P", monospace' }}>
                            ◎ SOLANA
                          </div>
                        </div>
                        <div className="text-[#e0ffe0] text-xl">|</div>
                        <div className="text-center">
                          <div
                            className="text-lg font-bold text-[#627eea]"
                            style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
                          >
                            {formatCompact(ethVol)}
                          </div>
                          <div className="text-[0.3rem] text-[#e0ffe0] mt-1" style={{ fontFamily: '"Press Start 2P", monospace' }}>
                            Ξ ETHEREUM
                          </div>
                        </div>
                      </div>
                    </Card>
                  </motion.div>

                  {/* Graduation stats */}
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25, duration: 0.2 }}>
                    <Card>
                      <div className="text-2xl mb-2 text-center">🎓</div>
                      <h3
                        className="text-[#00ff41] font-bold mb-3 text-center"
                        style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem" }}
                      >
                        GRADUATION
                      </h3>
                      <div className="text-center">
                        <div
                          className="text-lg font-bold text-[#ffd700]"
                          style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.7rem" }}
                        >
                          <AnimatedNumber value={graduatedCount} />
                        </div>
                        <div className="text-[0.35rem] text-[#e0ffe0] mt-1" style={{ fontFamily: '"Press Start 2P", monospace' }}>
                          TOKENS GRADUATED
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                </div>
              </div>
            )}

            {/* ═══════════════════════════════════════════════
                WHALES TAB
                ═══════════════════════════════════════════════ */}
            {activeTab === "whales" && (
              <div>
                {/* Filters */}
                <div className="flex flex-wrap items-center gap-3 mb-4">
                  <span
                    className="text-[0.4rem] text-[#b0d0b0]"
                    style={{ fontFamily: '"Press Start 2P", monospace' }}
                  >
                    FILTER:
                  </span>
                  {CHAIN_FILTERS.map((f) => (
                    <button
                      key={f.key}
                      onClick={() => setChainFilter(f.key)}
                      className={`retro-tab text-[0.35rem] py-1 px-3 ${
                        chainFilter === f.key ? "retro-tab-active" : ""
                      }`}
                      style={{ fontFamily: '"Press Start 2P", monospace' }}
                    >
                      {f.label}
                    </button>
                  ))}
                  <span className="text-[#b0d0b0] mx-1">|</span>
                  <button
                    onClick={() => setSortKey("size")}
                    className={`retro-tab text-[0.35rem] py-1 px-3 ${
                      sortKey === "size" ? "retro-tab-active" : ""
                    }`}
                    style={{ fontFamily: '"Press Start 2P", monospace' }}
                  >
                    BY SIZE
                  </button>
                  <button
                    onClick={() => setSortKey("recent")}
                    className={`retro-tab text-[0.35rem] py-1 px-3 ${
                      sortKey === "recent" ? "retro-tab-active" : ""
                    }`}
                    style={{ fontFamily: '"Press Start 2P", monospace' }}
                  >
                    RECENT
                  </button>
                </div>

                {serverTradesLoading ? (
                  <Card>
                    <div className="flex items-center justify-center gap-3 py-10">
                      <span className="retro-blink text-[#00ff41] text-lg">⬡</span>
                      <p
                        className="text-[#b0d0b0]"
                        style={{ fontFamily: '"VT323", monospace', fontSize: "1.1rem" }}
                      >
                        Loading whale trades...
                      </p>
                    </div>
                  </Card>
                ) : whaleTrades.length === 0 ? (
                  <Card>
                    <div className="text-center py-10">
                      <div className="text-4xl mb-3">🐋</div>
                      <p
                        className="text-[#b0d0b0] mb-2"
                        style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem" }}
                      >
                        NO WHALE TRADES YET
                      </p>
                      <p
                        className="text-[#6b6b55]"
                        style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
                      >
                        Large trades will appear here once the platform has activity
                      </p>
                    </div>
                  </Card>
                ) : (
                  <Card className="overflow-hidden p-0">
                    {/* Table header */}
                    <div
                      className="grid grid-cols-5 sm:grid-cols-12 gap-1 sm:gap-2 p-3 arcade-table-header"
                      style={{
                        fontFamily: '"Press Start 2P", monospace',
                        fontSize: "0.35rem",
                        color: "#338833",
                        borderBottom: "2px solid rgba(0,255,65,0.1)",
                      }}
                    >
                      <div className="col-span-1">#</div>
                      <div className="col-span-2 sm:col-span-3">TOKEN</div>
                      <div className="col-span-1 sm:col-span-2 text-right">SIZE</div>
                      <div className="hidden sm:block sm:col-span-2 text-right">USD</div>
                      <div className="hidden sm:block sm:col-span-2 text-center">TIME</div>
                      <div className="col-span-1 sm:col-span-2 text-right">TRADER</div>
                    </div>

                    {/* Table rows */}
                    <div className="max-h-[60vh] overflow-y-auto custom-scrollbar">
                      {whaleTrades.map((trade, i) => {
                        const token = tokenMap.get(trade.tokenId);
                        const chain = token?.blockchain || "solana";
                        const chainSym = chain === "solana" ? "◎" : "Ξ";
                        const clr = chainColor(chain);
                        const isBuy = trade.type === "BUY";
                        return (
                          <motion.div
                            key={trade.id}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.02, duration: 0.15 }}
                            className="grid grid-cols-5 sm:grid-cols-12 gap-1 sm:gap-2 p-3 arcade-score-row items-center"
                            style={{ borderBottom: "1px solid rgba(0,255,65,0.04)" }}
                          >
                            <div
                              className="col-span-1 font-bold"
                              style={{
                                fontFamily: '"Press Start 2P", monospace',
                                fontSize: "0.42rem",
                                color: i < 3 ? "#ffd700" : "#338833",
                              }}
                            >
                              {i + 1}
                            </div>
                            <div className="col-span-2 sm:col-span-3">
                              <div style={{ fontFamily: '"VT323", monospace', fontSize: "1rem", color: "#e0ffe0" }}>
                                {trade.tokenTicker || trade.tokenName}
                              </div>
                              <div
                                className="inline-flex items-center gap-1"
                                style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.3rem", color: clr }}
                              >
                                {chainSym} {chainLabel(chain)}
                              </div>
                            </div>
                            <div className="col-span-1 sm:col-span-2 text-right">
                              <div style={{ fontFamily: '"VT323", monospace', fontSize: "0.95rem", color: isBuy ? "#00ff41" : "#ef476f" }}>
                                {isBuy ? "+" : "-"}
                                {chainSym}
                                {trade.total.toFixed(4)}
                              </div>
                            </div>
                            <div className="hidden sm:block sm:col-span-2 text-right">
                              <div style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem", color: "#b0d0b0" }}>
                                ${trade.total.toFixed(2)}
                              </div>
                            </div>
                            <div className="hidden sm:block sm:col-span-2 text-center">
                              <div style={{ fontFamily: '"VT323", monospace', fontSize: "0.85rem", color: "#6b6b55" }}>
                                {timeAgo(trade.timestamp)}
                              </div>
                            </div>
                            <div className="col-span-1 sm:col-span-2 text-right">
                              <div
                                style={{
                                  fontFamily: '"VT323", monospace',
                                  fontSize: "0.8rem",
                                  color: "#b0d0b0",
                                }}
                                title={trade.wallet}
                              >
                                {truncateAddr(trade.wallet)}
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </Card>
                )}
              </div>
            )}

            {/* ═══════════════════════════════════════════════
                VOLUME HEATMAP TAB
                ═══════════════════════════════════════════════ */}
            {activeTab === "volume" && (
              <div>
                <div
                  className="grid grid-cols-4 sm:grid-cols-6 gap-1 mb-2 px-3"
                  style={{
                    fontFamily: '"Press Start 2P", monospace',
                    fontSize: "0.35rem",
                    color: "#338833",
                  }}
                >
                  <div className="col-span-1">RANK</div>
                  <div className="col-span-2">TOKEN</div>
                  <div className="hidden sm:block sm:col-span-1">CHAIN</div>
                  <div className="col-span-1 sm:col-span-2 text-right">24H VOLUME</div>
                </div>

                {volumeHeatmap.length === 0 ? (
                  <Card>
                    <div className="text-center py-10">
                      <div className="text-4xl mb-3">📊</div>
                      <p
                        className="text-[#b0d0b0] mb-2"
                        style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem" }}
                      >
                        NO VOLUME DATA YET
                      </p>
                      <p
                        className="text-[#6b6b55]"
                        style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
                      >
                        Volume data will appear as tokens are traded
                      </p>
                    </div>
                  </Card>
                ) : (
                  <div className="space-y-1.5">
                    {volumeHeatmap.slice(0, 20).map((item, i) => {
                      const barWidth = Math.max((item.vol / maxHeatVol) * 100, 2);
                      const clr = chainColor(item.chain);
                      return (
                        <motion.div
                          key={`${item.ticker}-${i}`}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.03, duration: 0.15 }}
                          className="arcade-score-row rounded-md relative overflow-hidden"
                          style={{ padding: "0.6rem 0.8rem", border: "1px solid rgba(0,255,65,0.06)" }}
                        >
                          {/* Background bar */}
                          <div
                            className="absolute inset-y-0 left-0 rounded-md transition-all duration-500"
                            style={{
                              width: `${barWidth}%`,
                              background: `linear-gradient(90deg, ${clr}22, ${clr}0D)`,
                              borderRight: `1px solid ${clr}33`,
                            }}
                          />
                          <div className="relative z-10 grid grid-cols-4 sm:grid-cols-6 gap-1 items-center">
                            <div
                              className="col-span-1 font-bold"
                              style={{
                                fontFamily: '"Press Start 2P", monospace',
                                fontSize: "0.42rem",
                                color: i < 3 ? "#ffd700" : "#338833",
                              }}
                            >
                              #{i + 1}
                            </div>
                            <div className="col-span-2">
                              <div style={{ fontFamily: '"VT323", monospace', fontSize: "1rem", color: "#e0ffe0" }}>
                                {item.ticker}
                              </div>
                              <div style={{ fontFamily: '"VT323", monospace', fontSize: "0.8rem", color: "#6b6b55" }}>
                                {item.name}
                              </div>
                            </div>
                            <div className="hidden sm:block sm:col-span-1">
                              <span
                                className="retro-badge-green"
                                style={{
                                  background: `${clr}1A`,
                                  color: clr,
                                  border: `1px solid ${clr}33`,
                                  boxShadow: `0 0 6px ${clr}22`,
                                }}
                              >
                                {item.chain === "solana" ? "SOL" : "ETH"}
                              </span>
                            </div>
                            <div className="col-span-1 sm:col-span-2 text-right">
                              <div style={{ fontFamily: '"VT323", monospace', fontSize: "1rem", color: clr }}>
                                {item.chain === "solana" ? "◎" : "Ξ"}
                                {item.vol.toFixed(4)}
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ═══════════════════════════════════════════════
                CREATORS TAB
                ═══════════════════════════════════════════════ */}
            {activeTab === "creators" && (
              <div>
                <div
                  className="grid grid-cols-4 sm:grid-cols-12 gap-1 sm:gap-2 mb-2 px-3"
                  style={{
                    fontFamily: '"Press Start 2P", monospace',
                    fontSize: "0.35rem",
                    color: "#338833",
                  }}
                >
                  <div className="col-span-1">#</div>
                  <div className="col-span-1 sm:col-span-3">CREATOR</div>
                  <div className="hidden sm:block sm:col-span-2 text-center">TOKENS</div>
                  <div className="col-span-1 sm:col-span-2 text-right">VOLUME</div>
                  <div className="col-span-1 sm:col-span-2 text-right">EARNED</div>
                  <div className="hidden sm:block sm:col-span-2 text-right">TOP</div>
                </div>

                {trendingCreators.length === 0 ? (
                  <Card>
                    <div className="text-center py-10">
                      <div className="text-4xl mb-3">👨‍🎨</div>
                      <p
                        className="text-[#b0d0b0] mb-2"
                        style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem" }}
                      >
                        NO CREATORS YET
                      </p>
                      <p
                        className="text-[#6b6b55]"
                        style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
                      >
                        Create a token to appear on the leaderboard
                      </p>
                    </div>
                  </Card>
                ) : (
                  <div className="space-y-1.5">
                    {trendingCreators.map((creator, i) => (
                      <motion.div
                        key={creator.addr}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.03, duration: 0.15 }}
                        className="arcade-score-row rounded-md grid grid-cols-4 sm:grid-cols-12 gap-1 sm:gap-2 items-center"
                        style={{ padding: "0.7rem 0.8rem", border: "1px solid rgba(0,255,65,0.06)" }}
                      >
                        <div
                          className="col-span-1 font-bold"
                          style={{
                            fontFamily: '"Press Start 2P", monospace',
                            fontSize: "0.45rem",
                            color: i === 0 ? "#ffd700" : i === 1 ? "#c0c0c0" : i === 2 ? "#cd7f32" : "#338833",
                          }}
                        >
                          {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                        </div>
                        <div className="col-span-1 sm:col-span-3">
                          <div
                            style={{
                              fontFamily: '"VT323", monospace',
                              fontSize: "0.9rem",
                              color: i === 0 ? "#ffd700" : "#e0ffe0",
                            }}
                            title={creator.addr}
                          >
                            {truncateAddr(creator.addr)}
                          </div>
                        </div>
                        <div className="hidden sm:block sm:col-span-2 text-center">
                          <span
                            className="retro-badge-green"
                            style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.4rem" }}
                          >
                            {creator.tokensCreated}
                          </span>
                        </div>
                        <div className="col-span-1 sm:col-span-2 text-right">
                          <div style={{ fontFamily: '"VT323", monospace', fontSize: "0.85rem", color: "#b0d0b0" }}>
                            ${formatCompactRaw(creator.totalVolume)}
                          </div>
                        </div>
                        <div className="col-span-1 sm:col-span-2 text-right">
                          <div style={{ fontFamily: '"VT323", monospace', fontSize: "0.85rem", color: "#00ff41" }}>
                            ${formatCompactRaw(creator.totalFees)}
                          </div>
                        </div>
                        <div className="hidden sm:block sm:col-span-2 text-right">
                          <div
                            style={{
                              fontFamily: '"VT323", monospace',
                              fontSize: "0.85rem",
                              color: "#ffd700",
                            }}
                          >
                            {creator.topToken.ticker || "—"}
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* ─── Footer note ─── */}
        <div className="mt-12 text-center">
          <p
            className="text-[#6b6b55] press-start-blink"
            style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.35rem" }}
          >
            ⬡ DATA REFRESHES EVERY 5s ⬡ PRESS REFRESH FOR INSTANT UPDATE ⬡
          </p>
        </div>
      </div>
    </div>
  );
}
