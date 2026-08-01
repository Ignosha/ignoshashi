import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { HiMiniStar } from "react-icons/hi2";
import { useWatchlist } from "~/context/WatchlistContext";
import { WatchlistToggle } from "~/components/WatchlistToggle";
import { Card } from "~/components/UI";
import { PixelCoinSVG } from "~/components/PixelCoinSVG";
import { useBondingCurveTrade } from "~/hooks/useBondingCurveTrade";
import { useDexPrice } from "~/hooks/useDexPrice";
import { useWallet } from "~/context/WalletContext";
import {
  getTokens,
  getBondingCurveState,
  getEvents,
  getTrades,
  isTokenVerified,
  type TokenData,
  type PlatformEvent,
} from "~/services/tracker";
import { FOMOTimer } from "~/components/FOMOTimer";

export const Route = createFileRoute("/watchlist")({
  component: WatchlistPage,
});

/* ─── Helpers ─────────────────────────────────── */

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
  return n.toFixed(0);
}

/* ─── Mini Sparkline ──────────────────────────── */

function MiniSparkline({ data, isUp }: { data: number[]; isUp: boolean }) {
  if (!data.length) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const width = 60;
  const height = 24;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  });
  const color = isUp ? "#00ff41" : "#ef476f";
  return (
    <svg width={width} height={height} className="shrink-0">
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ─── Watched Token Card ──────────────────────── */

function WatchedTokenCard({ token }: { token: TokenData }) {
  const isGraduated = !!(token.verified && token.tokenAddress);
  const { dexPrice } = useDexPrice({
    tokenAddress: token.tokenAddress,
    chain: token.blockchain,
    verified: token.verified,
    isGraduated,
  });
  const history = token.priceHistory;
  const lastPrice = history[history.length - 1] || token.price;
  const prevP = history[history.length - 2] || lastPrice;
  const isUp = lastPrice >= prevP;
  const change = prevP ? ((lastPrice - prevP) / prevP) * 100 : 0;
  const timeAgo = getTimeAgo(token.createdAt);
  const bcData = getBondingCurveState(token.id);
  const trade = useBondingCurveTrade();
  const { isConnectedOnChain, connect } = useWallet();

  return (
    <Link to="/token/$id" params={{ id: token.id }} className="block group">
      <Card className="relative overflow-hidden">
        <div className="flex items-start gap-3 relative z-[2]">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 text-sm font-bold overflow-hidden"
            style={{
              background: "#0d120d",
              border: "3px solid rgba(0,255,65,0.2)",
              fontFamily: '"Press Start 2P", monospace',
              fontSize: "0.5rem",
              color: "#00ff41",
            }}
          >
            {token.image ? (
              <img src={token.image} alt="" className="w-full h-full object-cover" />
            ) : (
              token.ticker.slice(0, 2)
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span
                className="font-bold text-[#ffffff] text-sm"
                style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem" }}
              >
                {token.name}
              </span>
              <span
                className="text-xs text-[#e0ffe0]"
                style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
              >
                ${token.ticker}
              </span>
              {/* Watch toggle */}
              <WatchlistToggle tokenId={token.id} size={14} />
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span
                className="text-sm font-bold"
                style={{
                  fontFamily: '"VT323", monospace',
                  fontSize: "1.1rem",
                  color: "#00ff41",
                }}
              >
                $
                {isGraduated && dexPrice
                  ? dexPrice.price < 0.001
                    ? dexPrice.price.toFixed(6)
                    : dexPrice.price.toFixed(4)
                  : token.price < 0.001
                    ? token.price.toFixed(6)
                    : token.price.toFixed(4)}
              </span>
              <span
                className="text-xs font-bold"
                style={{
                  fontFamily: '"VT323", monospace',
                  fontSize: "1rem",
                  color: isUp ? "#00ff41" : "#ef476f",
                }}
              >
                {change >= 0 ? "+" : ""}
                {change.toFixed(2)}%
              </span>
            </div>
            <div
              className="flex items-center gap-3 mt-1 text-xs"
              style={{ fontFamily: '"VT323", monospace', fontSize: "0.95rem", color: "#e0ffe0" }}
            >
              <span>MC: ${formatCompact(token.marketCap)}</span>
              <span>Vol: ${formatCompact(token.volume24h)}</span>
            </div>
          </div>
        </div>
        <div className="mt-2 relative z-[2]">
          <MiniSparkline data={history.slice(-20)} isUp={isUp} />
        </div>
        <div className="relative z-[2] mt-1">
          <FOMOTimer tokenId={token.id} compact />
        </div>
        <div className="flex items-center justify-between mt-2 pt-2 border-t-2 border-[#0d120d] relative z-[2]">
          <span
            className="text-xs text-[#b0d0b0]"
            style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem" }}
          >
            {token.creator}
          </span>
          <span
            className="text-xs text-[#b0d0b0]"
            style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem" }}
          >
            {timeAgo}
          </span>
        </div>
      </Card>
    </Link>
  );
}

/* ─── Watched Creator Card ────────────────────── */

function WatchedCreatorCard({
  creator,
  tokens,
}: {
  creator: string;
  tokens: TokenData[];
}) {
  const latestToken = tokens[0];

  return (
    <Card className="relative overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            className="font-bold text-[#ffffff]"
            style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem" }}
          >
            👤 {creator.slice(0, 6)}...{creator.slice(-4)}
          </span>
          <WatchlistToggle creatorAddress={creator} size={14} />
        </div>
        <span
          className="text-xs"
          style={{
            fontFamily: '"VT323", monospace',
            fontSize: "1rem",
            color: "#00ff41",
          }}
        >
          {tokens.length} token{tokens.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="space-y-2">
        {tokens.slice(0, 5).map((token) => {
          const history = token.priceHistory;
          const lastPrice = history[history.length - 1] || token.price;
          const prevP = history[history.length - 2] || lastPrice;
          const isUp = lastPrice >= prevP;
          const change = prevP ? ((lastPrice - prevP) / prevP) * 100 : 0;
          const bcData = getBondingCurveState(token.id);
          const timeAgo = getTimeAgo(token.createdAt);

          return (
            <Link
              key={token.id}
              to="/token/$id"
              params={{ id: token.id }}
              className="flex items-center gap-3 p-2 rounded-md hover:bg-[#ffffff05] transition-colors"
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 overflow-hidden"
                style={{
                  background: "#0d120d",
                  border: "2px solid rgba(0,255,65,0.15)",
                }}
              >
                {token.image ? (
                  <img src={token.image} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span
                    className="font-bold text-[#00ff41]"
                    style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.35rem" }}
                  >
                    {token.ticker.slice(0, 2)}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className="font-bold text-[#ffffff]"
                    style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.4rem" }}
                  >
                    {token.name}
                  </span>
                  <span
                    className="text-xs"
                    style={{ fontFamily: '"VT323", monospace', fontSize: "0.95rem", color: "#e0ffe0" }}
                  >
                    ${token.ticker}
                  </span>
                  {bcData?.graduated && (
                    <span
                      className="px-1 py-0.5 rounded text-[0.3rem]"
                      style={{
                        background: "rgba(0,255,65,0.1)",
                        border: "1px solid rgba(0,255,65,0.2)",
                        color: "#00ff41",
                        fontFamily: '"Press Start 2P", monospace',
                      }}
                    >
                      🎓
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span
                    className="text-sm font-bold"
                    style={{ fontFamily: '"VT323", monospace', fontSize: "1rem", color: "#00ff41" }}
                  >
                    ${lastPrice < 0.001 ? lastPrice.toFixed(6) : lastPrice.toFixed(4)}
                  </span>
                  <span
                    className="text-xs font-bold"
                    style={{
                      fontFamily: '"VT323", monospace',
                      fontSize: "0.9rem",
                      color: isUp ? "#00ff41" : "#ef476f",
                    }}
                  >
                    {change >= 0 ? "+" : ""}
                    {change.toFixed(2)}%
                  </span>
                </div>
              </div>
              <span
                className="text-xs shrink-0"
                style={{ fontFamily: '"VT323", monospace', fontSize: "0.85rem", color: "#6b6b55" }}
              >
                {timeAgo}
              </span>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}

/* ─── Activity Feed ───────────────────────────── */

function ActivityFeed({
  watchedTokenIds,
  watchedCreators,
}: {
  watchedTokenIds: string[];
  watchedCreators: string[];
}) {
  const events = useMemo(() => {
    const allEvents = getEvents(200);
    const allTokens = getTokens();

    // Build lookup for tokenId -> token
    const tokenMap = new Map(allTokens.map((t) => [t.id, t]));

    return allEvents.filter((event) => {
      // Check if the event is for a watched token
      const token = allTokens.find(
        (t) =>
          t.name === event.tokenName && t.ticker === event.tokenTicker,
      );
      if (token && watchedTokenIds.includes(token.id)) return true;

      // Check if the event is from a watched creator
      if (token && watchedCreators.includes(token.creator)) return true;

      // Check if wallet in the event matches a watched creator
      if (event.wallet && watchedCreators.includes(event.wallet)) return true;

      return false;
    }).slice(0, 50);
  }, [watchedTokenIds, watchedCreators]);

  if (events.length === 0) {
    return (
      <div className="retro-card p-6 text-center">
        <p className="text-3xl mb-3">📡</p>
        <p
          className="text-[#6b6b55]"
          style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem" }}
        >
          NO ACTIVITY YET
        </p>
        <p
          className="text-[#6b6b55] mt-2"
          style={{ fontFamily: '"VT323", monospace', fontSize: "0.95rem" }}
        >
          Activity from your watched tokens &amp; creators will appear here
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-[500px] overflow-y-auto custom-scrollbar">
      {events.map((event) => {
        const emoji =
          event.type === "launch"
            ? "🚀"
            : event.type === "buy"
              ? "💰"
              : event.type === "sell"
                ? "📉"
                : event.type === "comment"
                  ? "💬"
                  : "📢";
        return (
          <div
            key={event.id}
            className="flex items-start gap-2 p-3 rounded-md"
            style={{ background: "#1e1e0f", border: "1px solid #2a2a15" }}
          >
            <span className="text-lg shrink-0">{emoji}</span>
            <div className="flex-1 min-w-0">
              <p
                className="text-[#e0ffe0]"
                style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
              >
                {event.message.slice(0, 120)}
              </p>
              <span
                className="text-xs"
                style={{ fontFamily: '"VT323", monospace', fontSize: "0.85rem", color: "#6b6b55" }}
              >
                {getTimeAgo(event.timestamp)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Main Page ───────────────────────────────── */

function WatchlistPage() {
  const { watchedTokenIds, watchedCreators, watchCount, isTokenWatched, isCreatorWatched } =
    useWatchlist();
  const [activeTab, setActiveTab] = useState<"tokens" | "creators">("tokens");

  // Get real-time token data
  const allTokens = useMemo(() => getTokens(), []);
  const watchedTokens = useMemo(
    () => allTokens.filter((t) => watchedTokenIds.includes(t.id)),
    [allTokens, watchedTokenIds],
  );

  // Group tokens by creator for creators tab
  const creatorGroups = useMemo(() => {
    const groups = new Map<string, TokenData[]>();
    for (const creator of watchedCreators) {
      const creatorTokens = allTokens
        .filter((t) => t.creator === creator)
        .sort((a, b) => b.createdAt - a.createdAt);
      if (creatorTokens.length > 0) {
        groups.set(creator, creatorTokens);
      }
    }
    return Array.from(groups.entries())
      .sort(([, a], [, b]) => (b[0]?.createdAt || 0) - (a[0]?.createdAt || 0));
  }, [allTokens, watchedCreators]);

  const isEmpty = watchCount === 0;
  const hasTokens = watchedTokens.length > 0;
  const hasCreators = creatorGroups.length > 0;

  return (
    <div className="min-h-dvh bg-[#050505] py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 text-center"
        >
          <div className="inline-flex items-center gap-2 mb-2">
            <HiMiniStar size={24} style={{ color: "#ffd700", filter: "drop-shadow(0 0 8px rgba(255,215,0,0.5))" }} />
            <h1
              className="font-bold"
              style={{
                fontFamily: '"Press Start 2P", monospace',
                fontSize: "0.8rem",
                color: "#ffd700",
                textShadow: "0 0 10px rgba(255,215,0,0.3)",
              }}
            >
              WATCHLIST
            </h1>
          </div>
          <p
            className="text-[#6b6b55]"
            style={{ fontFamily: '"VT323", monospace', fontSize: "1.1rem" }}
          >
            Track your favorite tokens &amp; creators
          </p>
        </motion.div>

        {/* Empty State */}
        {isEmpty && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="retro-card p-10 text-center max-w-lg mx-auto"
          >
            <div className="text-6xl mb-4" style={{ filter: "grayscale(0.5)" }}>
              ⭐
            </div>
            <p
              className="text-[#ffd700] mb-4"
              style={{
                fontFamily: '"Press Start 2P", monospace',
                fontSize: "0.55rem",
                textShadow: "0 0 8px rgba(255,215,0,0.3)",
              }}
            >
              NO TOKENS WATCHED YET
            </p>
            <p
              className="text-[#b0d0b0] mb-6"
              style={{ fontFamily: '"VT323", monospace', fontSize: "1.05rem" }}
            >
              Go explore the feed and star tokens or creators you want to follow!
            </p>
            <Link to="/feed">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="retro-btn retro-btn-orange"
                style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem", padding: "0.5rem 1.5rem" }}
              >
                🚀 EXPLORE FEED
              </motion.button>
            </Link>
          </motion.div>
        )}

        {/* Content */}
        {!isEmpty && (
          <>
            {/* Tabs */}
            <div className="flex gap-2 mb-6 justify-center">
              <button
                onClick={() => setActiveTab("tokens")}
                className={`px-4 py-2 rounded font-bold text-[0.45rem] ${
                  activeTab === "tokens" ? "retro-tab-active" : "retro-tab"
                }`}
                style={{ fontFamily: '"Press Start 2P", monospace' }}
              >
                ⭐ TOKENS ({watchedTokens.length})
              </button>
              <button
                onClick={() => setActiveTab("creators")}
                className={`px-4 py-2 rounded font-bold text-[0.45rem] ${
                  activeTab === "creators" ? "retro-tab-active" : "retro-tab"
                }`}
                style={{ fontFamily: '"Press Start 2P", monospace' }}
              >
                👤 CREATORS ({creatorGroups.length})
              </button>
            </div>

            {/* Tokens Tab */}
            {activeTab === "tokens" && (
              <>
                {hasTokens ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8"
                  >
                    {watchedTokens.map((token) => (
                      <WatchedTokenCard key={token.id} token={token} />
                    ))}
                  </motion.div>
                ) : (
                  <div className="retro-card p-6 text-center">
                    <p className="text-[#6b6b55]" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem" }}>
                      NO TOKENS WATCHED
                    </p>
                    <p className="text-[#6b6b55] mt-2" style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}>
                      You have watched creators but no tokens. Star some tokens from the feed!
                    </p>
                  </div>
                )}
              </>
            )}

            {/* Creators Tab */}
            {activeTab === "creators" && (
              <>
                {hasCreators ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8"
                  >
                    {creatorGroups.map(([creator, tokens]) => (
                      <WatchedCreatorCard key={creator} creator={creator} tokens={tokens} />
                    ))}
                  </motion.div>
                ) : (
                  <div className="retro-card p-6 text-center">
                    <p className="text-[#6b6b55]" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem" }}>
                      NO CREATORS WATCHED
                    </p>
                    <p className="text-[#6b6b55] mt-2" style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}>
                      You have watched tokens but no creators. Star some creators from the feed!
                    </p>
                  </div>
                )}
              </>
            )}

            {/* Activity Feed Section */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mt-8"
            >
              <h2
                className="font-bold mb-4 text-center"
                style={{
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: "0.55rem",
                  color: "#ffd700",
                  textShadow: "0 0 6px rgba(255,215,0,0.2)",
                }}
              >
                📡 ACTIVITY FEED
              </h2>
              <ActivityFeed watchedTokenIds={watchedTokenIds} watchedCreators={watchedCreators} />
            </motion.div>
          </>
        )}
      </div>
    </div>
  );
}
