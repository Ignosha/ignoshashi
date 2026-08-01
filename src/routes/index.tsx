import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  HiMiniRocketLaunch,
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
import { PixelCoinSVG } from "~/components/PixelCoinSVG";
import {
  getTokens,
  getTotalMarketCap,
  getSolVolume,
  getEthVolume,
  getCoinsLaunched,
  getComments,
  getTotalTrades,
  getActiveTraders,
  getFeesCollected,
  getEvents,
  getBondingCurveState,
  getBondingCurveStates,
  getTrades,
  isTokenVerified,
  type TokenData,
  type CommentData,
} from "~/services/tracker";
import type { BondingCurveState } from "~/services/bondingCurve";
import { useBondingCurveTrade } from "~/hooks/useBondingCurveTrade";
import { useDexPrice } from "~/hooks/useDexPrice";
import { useWallet } from "~/context/WalletContext";
import { getAlerts } from "~/services/priceAlerts";
import { StreamEmbeds } from "~/components/StreamEmbeds";
import { FOMOTimer } from "~/components/FOMOTimer";
import { CRTAnnouncementBoard } from "~/components/CRTAnnouncementBoard";
import { MiniBondingCurve } from "~/components/BondingCurveChart";
import { getCurrentBattle, castVote, getUserVoteForBattle, isBattleActive, type Battle } from "~/services/battles";
import { WatchlistToggle } from "~/components/WatchlistToggle";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);

export const Route = createFileRoute("/")({
  component: IndexPage,
});

type FilterTab = "new" | "top" | "gainers" | "volume";

/* ═══════════════════════════════════════════════
   SOUND SYSTEM — Web Audio API 8-bit sounds
   ═══════════════════════════════════════════════ */

let _audioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext {
  if (!_audioCtx) _audioCtx = new AudioContext();
  return _audioCtx;
}

function playTone(
  frequencies: number[],
  times: number[],
  duration: number,
  type: OscillatorType = "square",
  volume = 0.08,
) {
  try {
    const ctx = getAudioCtx();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    frequencies.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.connect(gain);
      osc.frequency.setValueAtTime(freq, ctx.currentTime + times[i]);
      osc.start(ctx.currentTime + times[i]);
      osc.stop(ctx.currentTime + duration);
    });
  } catch {
    /* audio not available */
  }
}

function playCoinSound() {
  playTone([523, 659, 784], [0, 0.08, 0.16], 0.28, "square", 0.08);
}
function playPowerupSound() {
  playTone([440, 554, 659, 880], [0, 0.06, 0.12, 0.18], 0.3, "square", 0.07);
}
function playDamageSound() {
  playTone([440, 349, 277], [0, 0.08, 0.16], 0.3, "square", 0.07);
}
function playJumpSound() {
  playTone([440, 660], [0, 0.06], 0.15, "square", 0.06);
}

function getSoundPref(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("ignoshashi_sound") !== "off";
}
function setSoundPref(on: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem("ignoshashi_sound", on ? "on" : "off");
}

/* ═══════════════════════════════════════════════
   MINI SPARKLINE
   ═══════════════════════════════════════════════ */

function MiniSparkline({ data, isUp }: { data: number[]; isUp: boolean }) {
  const color = isUp ? "#00ff41" : "#00cc33";
  const bgColor = isUp ? "rgba(67,176,71,0.1)" : "rgba(4,156,216,0.1)";

  const chartData = {
    labels: data.map((_, i) => i.toString()),
    datasets: [
      {
        data,
        borderColor: color,
        backgroundColor: bgColor,
        fill: true,
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.4,
      },
    ],
  };

  return (
    <div className="h-8 w-full">
      <Line
        data={chartData}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          scales: { x: { display: false }, y: { display: false } },
          plugins: { legend: { display: false }, tooltip: { enabled: false } },
        }}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════
   TOKEN COMMENTS
   ═══════════════════════════════════════════════ */

function TokenComments({ tokenId }: { tokenId: string }) {
  const [comments, setComments] = useState<CommentData[]>([]);
  useEffect(() => {
    setComments(getComments(tokenId).slice(0, 3));
    const interval = setInterval(() => setComments(getComments(tokenId).slice(0, 3)), 5000);
    return () => clearInterval(interval);
  }, [tokenId]);

  if (comments.length === 0) return null;
  return (
    <div className="mt-2 pt-2 border-t-2 border-[#0d120d]">
      {comments.map((c) => (
        <div
          key={c.id}
          className="flex items-start gap-1.5 text-xs mb-1"
          style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem" }}
        >
          <span className="text-[#00ff41] shrink-0">💬</span>
          <span className="text-[#e0ffe0]">
            <span className="text-[#00cc33] font-bold">
              {c.wallet.slice(0, 4)}...{c.wallet.slice(-4)}:
            </span>{" "}
            {c.message.slice(0, 60)}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════ */

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

/* ═══════════════════════════════════════════════
   ANIMATED COUNTER HOOK
   ═══════════════════════════════════════════════ */

function useAnimatedCounter(target: number, duration = 400): number {
  const [display, setDisplay] = useState(target);
  const prevTarget = useRef(target);
  const raf = useRef<number>(0);

  useEffect(() => {
    if (target === prevTarget.current) return;
    prevTarget.current = target;
    const start = display;
    const diff = target - start;
    const startTime = performance.now();

    function step(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutExpo
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setDisplay(start + diff * eased);
      if (progress < 1) {
        raf.current = requestAnimationFrame(step);
      }
    }
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
    // display is intentionally excluded — we track start via ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  return display;
}

/* ═══════════════════════════════════════════════
   TOKEN CARD (with hover easter egg & value flash)
   ═══════════════════════════════════════════════ */

function TokenCard({
  token,
  isKing,
  prevVolume,
  prevPrice,
}: {
  token: TokenData;
  isKing?: boolean;
  prevVolume?: number;
  prevPrice?: number;
}) {
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

  // Buy button state
  const trade = useBondingCurveTrade();
  const { isConnectedOnChain, connect } = useWallet();
  const [buyMsg, setBuyMsg] = useState<string | null>(null);
  const bcData = getBondingCurveState(token.id);
  const chain = bcData?.blockchain || token.blockchain;
  const isBuyDisabled = (bcData && bcData.graduated) || trade.status !== "idle";

  const handleBuy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const curve = getBondingCurveState(token.id);
    if (!curve || curve.graduated || !curve.bondingCurveActive) return;
    if (!isConnectedOnChain(chain)) {
      setBuyMsg("Connect wallet...");
      await connect(chain);
      setTimeout(() => setBuyMsg(null), 3000);
      return;
    }
    setBuyMsg("Confirm in wallet...");
    const result = await trade.buy({ tokenId: token.id, amount: 100, tokenTicker: token.ticker });
    if (result.success) {
      setBuyMsg("✅ Bought!");
    } else {
      const err = result.error || "Failed";
      setBuyMsg(`❌ ${err.slice(0, 30)}`);
    }
    setTimeout(() => { setBuyMsg(null); trade.reset(); }, 5000);
  };

  // Sprite run easter egg (3s hover)
  const [spriteActive, setSpriteActive] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>(0);
  const spriteTimer = useRef<ReturnType<typeof setTimeout>>(0);

  const handleMouseEnter = useCallback(() => {
    hoverTimer.current = setTimeout(() => {
      if (getSoundPref()) playCoinSound();
      setSpriteActive(true);
      spriteTimer.current = setTimeout(() => setSpriteActive(false), 1300);
    }, 3000);
  }, []);

  const handleMouseLeave = useCallback(() => {
    clearTimeout(hoverTimer.current);
    clearTimeout(spriteTimer.current);
    setSpriteActive(false);
  }, []);

  // Volume flash detection
  const volChanged = prevVolume !== undefined && prevVolume !== token.volume24h;
  const priceChanged = prevPrice !== undefined && prevPrice !== token.price;

  const cardContent = (
    <Card
      className={`group relative overflow-hidden ${isKing ? "!border-[#00ff41] !shadow-[0_0_20px_rgba(251,208,0,0.3),0_0_40px_rgba(251,208,0,0.1),6px_6px_0_#8b4513]" : ""}`}
    >
      {/* Sprite runner — conditionally rendered to restart animation */}
      {spriteActive && <div className="sprite-runner active">🏃💨</div>}

      <div className="flex items-start gap-3 relative z-[2]">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 text-sm font-bold overflow-hidden"
          style={{
            background: "#0d120d",
            border: `3px solid ${isKing ? "#00ff41" : "rgba(0,255,65,0.2)"}`,
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
            <span className="text-xs text-[#e0ffe0]" style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}>
              ${token.ticker}
            </span>
            {isKing && (
              <span
                className="text-[0.35rem] px-1.5 py-0.5 rounded"
                style={{
                  fontFamily: '"Press Start 2P", monospace',
                  background: "#00ff41",
                  color: "#050505",
                  border: "1px solid #c49d00",
                  textShadow: "none",
                }}
              >
                👑 KING
              </span>
            )}
            {/* Verification badge for token cards */}
            {(() => {
              const v = isTokenVerified(token);
              return v ? (
                <span
                  className="text-[0.35rem] px-1 py-0.5 rounded"
                  style={{
                    fontFamily: '"Press Start 2P", monospace',
                    background: "rgba(0,255,65,0.1)",
                    color: "#00ff41",
                    border: "1px solid rgba(0,255,65,0.2)",
                    fontSize: "0.3rem",
                  }}
                >
                  ✅
                </span>
              ) : (
                <span
                  className="text-[0.35rem] px-1 py-0.5 rounded"
                  style={{
                    fontFamily: '"Press Start 2P", monospace',
                    background: "rgba(255,170,0,0.08)",
                    color: "#ffaa00",
                    border: "1px solid rgba(255,170,0,0.15)",
                    fontSize: "0.3rem",
                  }}
                >
                  ⚠️
                </span>
              );
            })()}
            <WatchlistToggle tokenId={token.id} size={14} />
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span
              className={`text-sm font-bold ${priceChanged && !isKing ? "value-flash" : ""}`}
              style={{
                fontFamily: '"VT323", monospace',
                fontSize: "1.1rem",
                color: isKing ? "#00ff41" : "#00ff41",
              }}
            >
              ${isGraduated && dexPrice ? (dexPrice.price < 0.001 ? dexPrice.price.toFixed(6) : dexPrice.price.toFixed(4)) : (token.price < 0.001 ? token.price.toFixed(6) : token.price.toFixed(4))}
            </span>
            {isGraduated && dexPrice && (
              <span
                className="text-[0.35rem] px-1 py-0.5 rounded font-bold"
                style={{
                  fontFamily: '"Press Start 2P", monospace',
                  background: "rgba(0,170,255,0.15)",
                  border: "1px solid rgba(0,170,255,0.3)",
                  color: "#0af",
                }}
              >
                📡 {dexPrice.source}
              </span>
            )}
            <span
              className="text-xs font-bold"
              style={{
                fontFamily: '"VT323", monospace',
                fontSize: "1rem",
                color: isUp ? "#00ff41" : "#00cc33",
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
            <span className={volChanged && !isKing ? "value-flash" : ""}>
              Vol: ${formatCompact(token.volume24h)}
            </span>
          </div>
        </div>
      </div>
      <div className="mt-3 relative z-[2]">
        <MiniSparkline data={history.slice(-20)} isUp={isUp} />
      </div>
      {/* Bonding curve mini sparkline */}
      {(() => {
        const bcData = getBondingCurveState(token.id);
        if (!bcData || bcData.graduated) return null;
        const progress = Math.min((bcData.currentSupply / bcData.totalSupply) * 100, 100);
        if (progress < 1) return null;
        return (
          <div className="mt-2 relative z-[2]">
            <div className="flex items-center gap-2">
              <div className="flex-1" style={{ maxWidth: 100 }}>
                <MiniBondingCurve curve={bcData} priceUp={isUp} />
              </div>
              <span style={{ fontFamily: '"VT323", monospace', fontSize: "0.75rem", color: "#b0d0b0" }}>
                {progress.toFixed(0)}% to 🎓
              </span>
            </div>
          </div>
        );
      })()}
      <div className="relative z-[2]">
        <FOMOTimer tokenId={token.id} compact />
        <TokenComments tokenId={token.id} />
      </div>
      <div className="flex items-center justify-between mt-3 pt-2 border-t-2 border-[#0d120d] relative z-[2] gap-2">
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-xs text-[#b0d0b0]" style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem" }}>
            {token.creator}
          </span>
          <WatchlistToggle creatorAddress={token.creator} size={12} />
        </div>
        <span className="text-xs text-[#b0d0b0]" style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem" }}>
          {timeAgo}
        </span>
        {bcData && bcData.bondingCurveActive && !bcData.graduated && (
          <button
            onClick={handleBuy}
            disabled={isBuyDisabled}
            className="retro-btn retro-btn-turquoise shrink-0"
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: "0.35rem",
              padding: "0.2rem 0.5rem",
              opacity: isBuyDisabled ? 0.5 : 1,
            }}
          >
            {trade.status === "awaiting_wallet" || trade.status === "confirming"
              ? "⏳"
              : "BUY"}
          </button>
        )}
        {buyMsg && (
          <span
            className="shrink-0 text-xs"
            style={{
              fontFamily: '"VT323", monospace',
              fontSize: "0.75rem",
              color: buyMsg.startsWith("✅") ? "#00ff41" : buyMsg.startsWith("❌") ? "#ff4444" : "#ffb83c",
              maxWidth: "120px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {buyMsg}
          </span>
        )}
      </div>
    </Card>
  );

  if (isKing) {
    // King card is larger and NOT a link — handled by KingOfTheHill
    return <div className="relative">{cardContent}</div>;
  }

  return (
    <Link to="/token/$id" params={{ id: token.id }} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      {cardContent}
    </Link>
  );
}

/* ═══════════════════════════════════════════════
   KING OF THE HILL
   ═══════════════════════════════════════════════ */

function KingOfTheHill({
  king,
  prevKingId,
}: {
  king: TokenData | null;
  prevKingId: string | null;
}) {
  const [sparkles, setSparkles] = useState<{ id: number; x: number; y: number }[]>([]);

  // Generate sparkles periodically
  useEffect(() => {
    if (!king) return;
    const interval = setInterval(() => {
      const id = Date.now();
      const newSparkle = {
        id,
        x: Math.random() * 100,
        y: Math.random() * 100,
      };
      setSparkles((s) => [...s.slice(-6), newSparkle]);
      setTimeout(() => setSparkles((s) => s.filter((sp) => sp.id !== id)), 1600);
    }, 800);
    return () => clearInterval(interval);
  }, [king]);

  if (!king) {
    return (
      <div className="max-w-3xl mx-auto px-4 mb-8">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="throne-empty retro-card p-6 text-center"
          style={{ borderColor: "#00ff41" }}
        >
          <div className="text-4xl mb-3">👑</div>
          <p
            className="text-[#00ff41] mb-2"
            style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.6rem" }}
          >
            THE THRONE IS EMPTY...
          </p>
          <p className="text-[#e0ffe0] mb-4" style={{ fontFamily: '"VT323", monospace', fontSize: "1.1rem" }}>
            Launch the first coin to claim the crown!
          </p>
          <Link to="/create">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="retro-btn retro-btn-orange neon-glow-yellow text-[0.5rem] px-5 py-2.5"
              style={{ fontFamily: '"Press Start 2P", monospace' }}
            >
              <HiMiniRocketLaunch size={14} />
              LAUNCH COIN
            </motion.button>
          </Link>
        </motion.div>
      </div>
    );
  }

  const isNewKing = prevKingId !== null && prevKingId !== king.id;

  return (
    <div className="max-w-3xl mx-auto px-4 mb-8">
      <div className="text-center mb-3">
        <p
          className="text-[#00ff41] inline-flex items-center gap-2"
          style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem" }}
        >
          <span className="retro-blink">👑</span> KING OF THE HILL <span className="retro-blink">👑</span>
        </p>
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={king.id}
          initial={isNewKing ? { scale: 0.8, opacity: 0 } : { opacity: 1 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 15 }}
          className="kotl-card relative"
        >
          {/* Sparkles */}
          {sparkles.map((s) => (
            <span
              key={s.id}
              className="king-sparkle"
              style={{ left: `${s.x}%`, top: `${s.y}%` }}
            >
              ⭐
            </span>
          ))}

          <div className="p-5 relative z-[2]">
            <div className="flex items-start gap-4">
              <div
                className="w-16 h-16 rounded-xl flex items-center justify-center shrink-0 overflow-hidden"
                style={{
                  background: "#0d120d",
                  border: "4px solid #00ff41",
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: "0.7rem",
                  color: "#00ff41",
                }}
              >
                {king.image ? (
                  <img src={king.image} alt="" className="w-full h-full object-cover" />
                ) : (
                  king.ticker.slice(0, 2)
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="font-bold text-[#ffffff]"
                    style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.65rem" }}
                  >
                    {king.name}
                  </span>
                  <span className="text-[#00ff41]" style={{ fontFamily: '"VT323", monospace', fontSize: "1.2rem" }}>
                    ${king.ticker}
                  </span>
                  <span
                    className="text-[0.4rem] px-1.5 py-0.5 rounded"
                    style={{
                      fontFamily: '"Press Start 2P", monospace',
                      background: "#00ff41",
                      color: "rgba(0,255,65,0.2)",
                      border: "2px solid #c49d00",
                    }}
                  >
                    👑 KING OF THE HILL
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-2">
                  <span
                    className="font-bold"
                    style={{ fontFamily: '"VT323", monospace', fontSize: "1.3rem", color: "#00ff41" }}
                  >
                    ${king.price < 0.001 ? king.price.toFixed(6) : king.price.toFixed(4)}
                  </span>
                </div>
                <div
                  className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm"
                  style={{ fontFamily: '"VT323", monospace', fontSize: "1.05rem", color: "#e0ffe0" }}
                >
                  <span>📊 Vol 24h: ${formatCompact(king.volume24h)}</span>
                  <span>💰 MC: ${formatCompact(king.marketCap)}</span>
                  <span>
                    💬 {getComments(king.id).length} comments
                  </span>
                </div>
                <div className="mt-3">
                  <Link to="/token/$id" params={{ id: king.id }}>
                    <motion.button
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      className="retro-btn retro-btn-yellow text-[0.45rem] px-4 py-2"
                      style={{ fontFamily: '"Press Start 2P", monospace' }}
                    >
                      👑 VIEW KING
                    </motion.button>
                  </Link>
                </div>
              </div>
              <div className="kotl-crown shrink-0">👑</div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   LIVE ACTIVITY COUNTERS
   ═══════════════════════════════════════════════ */

function LiveCounters({
  coinsLaunched,
  totalTrades,
  activeTraders,
  feesSol,
  feesEth,
}: {
  coinsLaunched: number;
  totalTrades: number;
  activeTraders: number;
  feesSol: number;
  feesEth: number;
}) {
  const animCoins = useAnimatedCounter(coinsLaunched);
  const animTrades = useAnimatedCounter(totalTrades);
  const animTraders = useAnimatedCounter(activeTraders);
  const animFees = useAnimatedCounter(feesSol + feesEth);

  const counters = [
    { label: "COINS CREATED", value: animCoins, icon: "🚀", color: "#00ff41", fmt: (v: number) => v.toString() },
    { label: "TRADES TODAY", value: animTrades, icon: "📈", color: "#ffffff", fmt: (v: number) => v.toString() },
    { label: "ACTIVE TRADERS", value: animTraders, icon: "👥", color: "#00ff41", fmt: (v: number) => v.toString() },
    { label: "FEES COLLECTED", value: animFees, icon: "💎", color: "#00cc33", fmt: (v: number) => `$${formatCompact(v)}` },
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 mb-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {counters.map((c) => (
          <motion.div
            key={c.label}
            whileHover={{ scale: 1.05, y: -2 }}
            className="retro-card p-3 text-center group cursor-default"
            style={{
              border: "3px solid rgba(0,255,65,0.2)",
              boxShadow: "4px 4px 0 rgba(0,255,65,0.2)",
            }}
          >
            <div className="text-lg mb-1">{c.icon}</div>
            <motion.div
              key={c.value}
              initial={{ scale: 1.15 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 300 }}
              className="text-sm font-bold"
              style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.55rem", color: c.color }}
            >
              {c.fmt(c.value)}
            </motion.div>
            <div
              className="text-[0.35rem] mt-1 text-[#e0ffe0]"
              style={{ fontFamily: '"Press Start 2P", monospace' }}
            >
              {c.label}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   LIVE SCROLLING TICKER BAR
   ═══════════════════════════════════════════════ */

function LiveTickerBar({ tokens }: { tokens: TokenData[] }) {
  if (tokens.length === 0) {
    return (
      <div
        className="py-2 text-center border-b border-[rgba(0,255,65,0.15)]"
        style={{ background: "#0a0a0a" }}
      >
        <span
          className="text-[#00ff41] font-bold"
          style={{
            fontFamily: '"Press Start 2P", monospace',
            fontSize: "0.45rem",
          }}
        >
          🚀 NO TOKENS LIVE — BE THE FIRST TO LAUNCH
        </span>
      </div>
    );
  }

  const tickerItems = tokens.slice(0, 20).map((t) => {
    const hist = t.priceHistory;
    const lastP = hist[hist.length - 1] || t.price;
    const prevP = hist[hist.length - 2] || lastP;
    const change = prevP ? ((lastP - prevP) / prevP) * 100 : 0;
    const isUp = change >= 0;
    return {
      ticker: t.ticker,
      change,
      isUp,
    };
  });

  // Duplicate to make a seamless loop
  const doubled = [...tickerItems, ...tickerItems];

  return (
    <div
      className="overflow-hidden whitespace-nowrap py-1.5 border-b border-[rgba(0,255,65,0.15)]"
      style={{ background: "#0a0a0a" }}
    >
      <div
        className="inline-block"
        style={{
          animation: "marquee-scroll 30s linear infinite",
        }}
      >
        {doubled.map((item, i) => (
          <span
            key={i}
            className="inline-block mx-4"
            style={{
              fontFamily: '"VT323", monospace',
              fontSize: "1.05rem",
              color: item.isUp ? "#00ff41" : "#ff4444",
            }}
          >
            ${item.ticker}{" "}
            <span style={{ color: item.isUp ? "#00ff41" : "#ff4444" }}>
              {item.isUp ? "▲" : "▼"} {Math.abs(item.change).toFixed(1)}%
            </span>
            {i < doubled.length - 1 && (
              <span className="text-[#333] mx-3">|</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   COIN RAIN (hero background)
   ═══════════════════════════════════════════════ */

function CoinRain() {
  const coins = useMemo(() => {
    return Array.from({ length: 10 }, (_, i) => ({
      id: i,
      left: `${Math.random() * 95}%`,
      delay: `${Math.random() * 6}s`,
      duration: `${4 + Math.random() * 6}s`,
      size: 14 + Math.random() * 14, // 14-28px
    }));
  }, []);

  return (
    <>
      {coins.map((c) => (
        <span
          key={c.id}
          className="coin-rain-coin"
          style={{
            left: c.left,
            animationDelay: c.delay,
            animationDuration: c.duration,
            fontSize: 0,
          }}
        >
          <PixelCoinSVG size={c.size} />
        </span>
      ))}
    </>
  );
}

/* ═══════════════════════════════════════════════
   STAR SPARKLES (hero background)
   ═══════════════════════════════════════════════ */

function StarSparkles() {
  const stars = useMemo(() => {
    return Array.from({ length: 4 }, (_, i) => ({
      id: i,
      left: `${10 + Math.random() * 80}%`,
      top: `${10 + Math.random() * 70}%`,
      delay: `${Math.random() * 3}s`,
    }));
  }, []);

  return (
    <>
      {stars.map((s) => (
        <span
          key={s.id}
          className="star-sparkle-el"
          style={{
            left: s.left,
            top: s.top,
            animationDelay: s.delay,
          }}
        >
          ⭐
        </span>
      ))}
    </>
  );
}

/* ═══════════════════════════════════════════════
   QUESTION BLOCK
   ═══════════════════════════════════════════════ */

const QBLOCK_MESSAGES = [
  "Launch a coin!",
  "To the moon! 🌙",
  "1-UP!",
  "It's-a me, ignoshashi!",
  "Wahoo!",
];

function QuestionBlock() {
  const [msgIdx, setMsgIdx] = useState(0);
  const [showMsg, setShowMsg] = useState(false);
  const soundOn = getSoundPref();

  const handleClick = () => {
    if (soundOn) playJumpSound();
    setMsgIdx((prev) => (prev + 1) % QBLOCK_MESSAGES.length);
    setShowMsg(true);
    setTimeout(() => setShowMsg(false), 1800);
  };

  return (
    <div className="relative inline-block">
      <motion.div
        className="qblock"
        onClick={handleClick}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
      >
        <span className="qblock-text">?</span>
      </motion.div>
      <AnimatePresence>
        {showMsg && (
          <motion.div
            className="qblock-message"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
          >
            {QBLOCK_MESSAGES[msgIdx]}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}


/* ═══════════════════════════════════════════════
   LIVE TRADE FEED
   ═══════════════════════════════════════════════ */

interface LiveTrade {
  id: string;
  tokenId: string;
  tokenName: string;
  tokenTicker: string;
  type: string;
  amount: number;
  price: number;
  total: number;
  wallet: string;
  txHash: string;
  timestamp: number;
}

function LiveTradeFeed() {
  const [trades, setTrades] = useState<LiveTrade[]>([]);
  const [hovering, setHovering] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevTradeCount = useRef(0);

  useEffect(() => {
    async function fetchTrades() {
      try {
        const res = await fetch("/api/trades?limit=50");
        if (res.ok) {
          const data = await res.json();
          setTrades((prev) => {
            // Detect new trades for animation
            return data.trades || [];
          });
        }
      } catch {
        /* server may not be ready */
      }
    }
    fetchTrades();
    const interval = setInterval(fetchTrades, 3000);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (hovering || !containerRef.current) return;
    const el = containerRef.current;
    const scrollStep = () => {
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 10) {
        el.scrollTop = 0;
      } else {
        el.scrollTop += 1;
      }
    };
    const interval = setInterval(scrollStep, 80);
    return () => clearInterval(interval);
  }, [hovering, trades.length]);

  function getTimeAgoShort(ts: number): string {
    const diff = Date.now() - ts;
    const secs = Math.floor(diff / 1000);
    if (secs < 5) return "now";
    if (secs < 60) return `${secs}s ago`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ago`;
  }

  function shortenWallet(w: string): string {
    if (!w || w === "anon") return "anon";
    return w.slice(0, 4) + "..." + w.slice(-2);
  }

  if (trades.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 mb-6">
        <div className="retro-card p-4" style={{ borderColor: "rgba(0,255,65,0.2)" }}>
          <div className="flex items-center gap-2 mb-3">
            <span
              className="w-2.5 h-2.5 rounded-full animate-pulse"
              style={{ background: "#00ff41", boxShadow: "0 0 8px #00ff41" }}
            />
            <h3
              className="text-[#00ff41]"
              style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem" }}
            >
              🟢 LIVE TRADES
            </h3>
          </div>
          <p
            className="text-center text-[#e0ffe0] py-3"
            style={{ fontFamily: '"VT323", monospace', fontSize: "1.1rem" }}
          >
            Waiting for trades... Be the first to trade! 🚀
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 mb-6">
      <div
        className="retro-card p-3"
        style={{
          borderColor: "rgba(0,255,65,0.2)",
          boxShadow: "0 0 15px rgba(0,255,65,0.1), 4px 4px 0 rgba(0,255,65,0.1)",
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 mb-2 pb-2 border-b" style={{ borderColor: "rgba(0,255,65,0.1)" }}>
          <motion.span
            className="w-2.5 h-2.5 rounded-full"
            style={{ background: "#00ff41", boxShadow: "0 0 8px #00ff41" }}
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
          <h3
            className="text-[#00ff41]"
            style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem" }}
          >
            🟢 LIVE TRADES
          </h3>
          <span
            className="ml-auto text-[#b0d0b0]"
            style={{ fontFamily: '"VT323", monospace', fontSize: "0.85rem" }}
          >
            {trades.length} trades
          </span>
        </div>

        {/* Trade List */}
        <div
          ref={containerRef}
          className="overflow-y-auto custom-scrollbar"
          style={{ maxHeight: "260px" }}
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
        >
          <AnimatePresence initial={false}>
            {trades.map((trade, i) => (
              <motion.div
                key={trade.id}
                initial={{ opacity: 0, height: 0, y: -8 }}
                animate={{ opacity: 1, height: "auto", y: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="flex items-center gap-2 py-1.5 border-b border-[rgba(0,255,65,0.05)] text-xs"
                style={{
                  animation: i < 3 ? `slideInTrade 0.3s ease-out ${i * 0.08}s both` : undefined,
                }}
              >
                {/* Ticker */}
                <span
                  className="font-bold shrink-0"
                  style={{
                    fontFamily: '"VT323", monospace',
                    fontSize: "1rem",
                    color: "#00ff41",
                    minWidth: "55px",
                  }}
                >
                  ${trade.tokenTicker}
                </span>

                {/* BUY/SELL Badge */}
                <span
                  className="font-bold px-1.5 py-0.5 rounded text-[0.35rem] shrink-0"
                  style={{
                    fontFamily: '"Press Start 2P", monospace',
                    background: trade.type === "BUY"
                      ? "rgba(0,255,65,0.15)"
                      : "rgba(255,68,68,0.15)",
                    color: trade.type === "BUY" ? "#00ff41" : "#ff4444",
                    border: `1px solid ${trade.type === "BUY" ? "rgba(0,255,65,0.3)" : "rgba(255,68,68,0.3)"}`,
                    fontSize: "0.35rem",
                  }}
                >
                  {trade.type === "BUY" ? "BUY" : "SELL"}
                </span>

                {/* Amount + Price */}
                <span
                  className="shrink-0"
                  style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem", color: "#e0ffe0" }}
                >
                  {typeof trade.amount === "number" ? trade.amount.toLocaleString() : trade.amount}
                </span>
                <span
                  className="shrink-0"
                  style={{ fontFamily: '"VT323", monospace', fontSize: "0.85rem", color: "#b0d0b0" }}
                >
                  @ {typeof trade.price === "number"
                    ? trade.price < 0.0001 ? trade.price.toFixed(8) : trade.price.toFixed(6)
                    : trade.price}
                </span>

                {/* Time ago */}
                <span
                  className="shrink-0 ml-auto"
                  style={{ fontFamily: '"VT323", monospace', fontSize: "0.8rem", color: "#6b6b55" }}
                >
                  {getTimeAgoShort(trade.timestamp)}
                </span>

                {/* Wallet */}
                <span
                  className="shrink-0 hidden sm:inline"
                  style={{ fontFamily: '"VT323", monospace', fontSize: "0.75rem", color: "#555" }}
                >
                  {shortenWallet(trade.wallet)}
                </span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════════════
    LIVE BATTLES SECTION (homepage card)
    ═══════════════════════════════════════════════ */

    function LiveBattlesSection() {
    const [battle, setBattle] = useState<Battle | null>(null);
    const [timeLeft, setTimeLeft] = useState(0);
    const [userVote, setUserVote] = useState<"A" | "B" | null>(null);
    const [voted, setVoted] = useState(false);

    useEffect(() => {
    const check = () => {
      const b = getCurrentBattle();
      setBattle(b);
      if (b && b.status === "active") {
        setTimeLeft(Math.max(0, b.endTime - Date.now()));
        const uv = getUserVoteForBattle(b.id);
        setUserVote(uv);
        setVoted(!!uv);
      }
    };
    check();
    const interval = setInterval(check, 5000);
    return () => clearInterval(interval);
    }, []);

    useEffect(() => {
    if (!battle || battle.status !== "active") return;
    const t = setInterval(() => {
      setTimeLeft(Math.max(0, battle.endTime - Date.now()));
    }, 1000);
    return () => clearInterval(t);
    }, [battle?.id]);

    const handleVote = (tokenId: string) => {
    if (!battle || voted) return;
    const result = castVote(battle.id, tokenId, "homepage-wallet");
    if (result.success) {
      setVoted(true);
      const side = tokenId === battle.tokenA?.tokenId ? "A" : "B";
      setUserVote(side);
      // Refresh battle data
      setTimeout(() => {
        const b = getCurrentBattle();
        setBattle(b);
      }, 200);
    }
    };

    if (!battle || battle.status !== "active") {
    return null; // Don't show if no active battle
    }

    const totalVotes = battle.votesA + battle.votesB;
    const pctA = totalVotes > 0 ? (battle.votesA / totalVotes) * 100 : 50;
    const pctB = totalVotes > 0 ? (battle.votesB / totalVotes) * 100 : 50;
    const secs = Math.max(0, Math.floor(timeLeft / 1000));
    const mins = Math.floor(secs / 60);
    const secsLeft = secs % 60;

    return (
    <div className="max-w-3xl mx-auto px-4 mb-8">
      <motion.div
        className="retro-card p-4 sm:p-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          borderColor: "rgba(255,107,53,0.4)",
          boxShadow: "0 0 25px rgba(255,107,53,0.15), 4px 4px 0 rgba(255,107,53,0.1)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <motion.span
              className="w-2.5 h-2.5 rounded-full"
              style={{ background: "#ef476f", boxShadow: "0 0 8px #ef476f" }}
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
            />
            <h3
              style={{
                fontFamily: '"Press Start 2P", monospace',
                fontSize: "clamp(0.5rem, 2vw, 0.6rem)",
                color: "#ff6b35",
              }}
            >
              ⚔️ LIVE BATTLES
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <span
              style={{
                fontFamily: '"Press Start 2P", monospace',
                fontSize: "0.4rem",
                color: timeLeft <= 30000 ? "#ef476f" : "#c4b998",
              }}
            >
              {mins}:{secsLeft.toString().padStart(2, "0")}
            </span>
            <Link
              to="/battles"
              className="retro-btn retro-btn-orange text-xs"
              style={{ fontSize: "0.4rem", padding: "0.25rem 0.6rem" }}
            >
              VIEW ALL
            </Link>
          </div>
        </div>

        {/* VS Battle */}
        <div className="flex items-center gap-3">
          {/* Token A */}
          <div className="flex-1 text-center">
            <div className="text-sm leading-tight" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "clamp(0.35rem, 1.5vw, 0.5rem)", color: "#f5f0e1" }}>
              {battle.tokenA?.name}
            </div>
            <div style={{ fontFamily: '"VT323", monospace', fontSize: "0.8rem", color: "#c4b998" }}>
              ${battle.tokenA?.ticker}
            </div>
            {/* Mini bar */}
            <div className="mt-1 w-full h-2 rounded-full overflow-hidden border" style={{ borderColor: "#3a2a15", background: "#1a1a0a" }}>
              <motion.div
                className="h-full rounded-full"
                animate={{ width: `${pctA}%` }}
                style={{ background: "#06d6a0", boxShadow: "0 0 6px #06d6a0" }}
              />
            </div>
            <div style={{ fontFamily: '"VT323", monospace', fontSize: "0.75rem", color: "#06d6a0", marginTop: "2px" }}>
              {battle.votesA} votes ({pctA.toFixed(0)}%)
            </div>
            {!voted && (
              <motion.button
                onClick={() => handleVote(battle.tokenA?.tokenId || "")}
                className="retro-btn retro-btn-turquoise mt-2 text-xs"
                style={{ fontSize: "0.4rem", padding: "0.2rem 0.8rem" }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                VOTE
              </motion.button>
            )}
            {userVote === "A" && (
              <div style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.35rem", color: "#06d6a0", marginTop: "4px" }}>
                ✓ VOTED
              </div>
            )}
          </div>

          {/* VS Glow */}
          <div className="flex flex-col items-center shrink-0">
            <span
              className="text-2xl sm:text-3xl font-bold"
              style={{
                fontFamily: '"Press Start 2P", monospace',
                color: "#ffd23f",
                textShadow: "0 0 15px rgba(255,210,63,0.6)",
              }}
            >
              VS
            </span>
          </div>

          {/* Token B */}
          <div className="flex-1 text-center">
            <div className="text-sm leading-tight" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "clamp(0.35rem, 1.5vw, 0.5rem)", color: "#f5f0e1" }}>
              {battle.tokenB?.name}
            </div>
            <div style={{ fontFamily: '"VT323", monospace', fontSize: "0.8rem", color: "#c4b998" }}>
              ${battle.tokenB?.ticker}
            </div>
            {/* Mini bar */}
            <div className="mt-1 w-full h-2 rounded-full overflow-hidden border" style={{ borderColor: "#3a2a15", background: "#1a1a0a" }}>
              <motion.div
                className="h-full rounded-full"
                animate={{ width: `${pctB}%` }}
                style={{ background: "#ef476f", boxShadow: "0 0 6px #ef476f" }}
              />
            </div>
            <div style={{ fontFamily: '"VT323", monospace', fontSize: "0.75rem", color: "#ef476f", marginTop: "2px" }}>
              {battle.votesB} votes ({pctB.toFixed(0)}%)
            </div>
            {!voted && (
              <motion.button
                onClick={() => handleVote(battle.tokenB?.tokenId || "")}
                className="retro-btn retro-btn-pink mt-2 text-xs"
                style={{ fontSize: "0.4rem", padding: "0.2rem 0.8rem" }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                VOTE
              </motion.button>
            )}
            {userVote === "B" && (
              <div style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.35rem", color: "#ef476f", marginTop: "4px" }}>
                ✓ VOTED
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
    );
    }

    /* ═══════════════════════════════════════════════
    RECENTLY GRADUATED SECTION
    ═══════════════════════════════════════════════ */

function RecentlyGraduated({
  graduatedTokens,
  curves,
}: {
  graduatedTokens: TokenData[];
  curves: BondingCurveState[];
}) {
  if (graduatedTokens.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 mb-8">
        <h3
          className="text-[#00ff41] mb-4 pixel-shadow-sm"
          style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem" }}
        >
          🎓 RECENTLY GRADUATED
        </h3>
        <div className="retro-card p-6 text-center">
          <p className="text-3xl mb-3">🎓</p>
          <p
            className="text-[#e0ffe0]"
            style={{ fontFamily: '"VT323", monospace', fontSize: "1.1rem" }}
          >
            No tokens have graduated yet. Launch one and pump it to graduation!
          </p>
        </div>
      </div>
    );
  }

  const curveMap = new Map(curves.map((c) => [c.tokenId, c]));

  return (
    <div className="max-w-3xl mx-auto px-4 mb-8">
      <h3
        className="text-[#00ff41] mb-4 pixel-shadow-sm"
        style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem" }}
      >
        🎓 RECENTLY GRADUATED
      </h3>
      <div className="flex gap-3 overflow-x-auto pb-2 custom-scrollbar">
        {graduatedTokens.slice(0, 3).map((token, i) => {
          const curve = curveMap.get(token.id);
          const gradTime = curve?.lastTradeTimestamp || token.createdAt;
          const dexName = token.blockchain === "solana" ? "Raydium" : "Uniswap";
          return (
            <motion.div
              key={token.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1, duration: 0.25 }}
              className="shrink-0"
            >
              <Link to="/token/$id" params={{ id: token.id }}>
                <Card className="p-3 w-[200px] group">
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 overflow-hidden"
                      style={{
                        background: "#0d120d",
                        border: "2px solid rgba(0,255,65,0.3)",
                      }}
                    >
                      {token.image ? (
                        <img src={token.image} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span
                          className="font-bold text-[#00ff41]"
                          style={{
                            fontFamily: '"Press Start 2P", monospace',
                            fontSize: "0.35rem",
                          }}
                        >
                          {token.ticker.slice(0, 2)}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div
                        className="font-bold text-[#ffffff] truncate"
                        style={{
                          fontFamily: '"Press Start 2P", monospace',
                          fontSize: "0.35rem",
                        }}
                      >
                        {token.name}
                      </div>
                      <div
                        className="text-[#e0ffe0]"
                        style={{
                          fontFamily: '"VT323", monospace',
                          fontSize: "0.9rem",
                        }}
                      >
                        ${token.ticker}
                      </div>
                    </div>
                  </div>
                  <div
                    className="text-[0.35rem] px-1.5 py-0.5 rounded inline-flex items-center gap-1 mb-1"
                    style={{
                      fontFamily: '"Press Start 2P", monospace',
                      background: "rgba(0,255,65,0.1)",
                      color: "#00ff41",
                      border: "1px solid rgba(0,255,65,0.2)",
                    }}
                  >
                    🎓 Graduated to {dexName}
                  </div>
                  <div
                    className="text-[#b0d0b0]"
                    style={{
                      fontFamily: '"VT323", monospace',
                      fontSize: "0.85rem",
                    }}
                  >
                    {getTimeAgo(gradTime)}
                  </div>
                </Card>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   TOP CREATORS SECTION
   ═══════════════════════════════════════════════ */

interface CreatorData {
  address: string;
  totalEarnings: number;
  tokensCreated: number;
  bestToken: string;
  blockchain: "solana" | "ethereum";
}

function TopCreators({
  tokens,
  curves,
}: {
  tokens: TokenData[];
  curves: BondingCurveState[];
}) {
  const creators = useMemo(() => {
    const map = new Map<
      string,
      {
        totalEarnings: number;
        tokensCreated: number;
        bestToken: string;
        bestTokenMC: number;
        blockchain: "solana" | "ethereum";
      }
    >();

    const curveMap = new Map(curves.map((c) => [c.tokenId, c]));

    for (const token of tokens) {
      const curve = curveMap.get(token.id);
      const earnings = curve?.creatorEarnings || 0;
      const creator = token.creator;

      if (!map.has(creator)) {
        map.set(creator, {
          totalEarnings: 0,
          tokensCreated: 0,
          bestToken: "",
          bestTokenMC: 0,
          blockchain: token.blockchain,
        });
      }

      const entry = map.get(creator)!;
      entry.totalEarnings += earnings;
      entry.tokensCreated += 1;
      if (token.marketCap > entry.bestTokenMC) {
        entry.bestTokenMC = token.marketCap;
        entry.bestToken = token.name;
      }
    }

    // Filter creators with earnings, sort by totalEarnings
    const result: CreatorData[] = [];
    for (const [address, data] of map) {
      if (data.totalEarnings > 0) {
        result.push({
          address,
          totalEarnings: data.totalEarnings,
          tokensCreated: data.tokensCreated,
          bestToken: data.bestToken,
          blockchain: data.blockchain,
        });
      }
    }
    result.sort((a, b) => b.totalEarnings - a.totalEarnings);
    return result.slice(0, 3);
  }, [tokens, curves]);

  if (creators.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 mb-8">
        <h3
          className="text-[#00ff41] mb-4 pixel-shadow-sm"
          style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem" }}
        >
          🏅 TOP CREATORS
        </h3>
        <div className="retro-card p-6 text-center">
          <p className="text-3xl mb-3">🏅</p>
          <p
            className="text-[#e0ffe0]"
            style={{ fontFamily: '"VT323", monospace', fontSize: "1.1rem" }}
          >
            Create a token and earn fees from every trade
          </p>
        </div>
      </div>
    );
  }

  const medalEmojis = ["🥇", "🥈", "🥉"];

  return (
    <div className="max-w-3xl mx-auto px-4 mb-8">
      <h3
        className="text-[#00ff41] mb-4 pixel-shadow-sm"
        style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem" }}
      >
        🏅 TOP CREATORS
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {creators.map((creator, i) => (
          <motion.div
            key={creator.address}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1, duration: 0.25 }}
          >
            <Card className="p-4 text-center">
              <div className="text-2xl mb-2">{medalEmojis[i]}</div>
              <div
                className="font-bold text-[#ffffff] mb-1"
                style={{
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: "0.4rem",
                }}
              >
                {creator.address.slice(0, 4)}...{creator.address.slice(-4)}
              </div>
              <div
                className="text-[#00ff41] font-bold mb-2"
                style={{
                  fontFamily: '"VT323", monospace',
                  fontSize: "1.1rem",
                }}
              >
                {creator.totalEarnings.toFixed(4)}{" "}
                {creator.blockchain === "solana" ? "SOL" : "ETH"}
              </div>
              <div
                className="flex justify-center gap-3"
                style={{
                  fontFamily: '"VT323", monospace',
                  fontSize: "0.9rem",
                  color: "#e0ffe0",
                }}
              >
                <span>{creator.tokensCreated} tokens</span>
              </div>
              {creator.bestToken && (
                <div
                  className="mt-1"
                  style={{
                    fontFamily: '"VT323", monospace',
                    fontSize: "0.85rem",
                    color: "#b0d0b0",
                  }}
                >
                  Best: {creator.bestToken}
                </div>
              )}
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════ */

function IndexPage() {
  const [tokens, setTokens] = useState<TokenData[]>([]);
  const [filter, setFilter] = useState<FilterTab>("new");
  const [refreshKey, setRefreshKey] = useState(0);
  const [coinsLaunched, setCoinsLaunched] = useState(0);
  const [totalTrades, setTotalTrades] = useState(0);
  const [activeTraders, setActiveTraders] = useState(0);
  const [feesSol, setFeesSol] = useState(0);
  const [feesEth, setFeesEth] = useState(0);
  const [curves, setCurves] = useState<BondingCurveState[]>([]);

  // Track previous state for animations
  const prevTokenIds = useRef<Set<string>>(new Set());
  const prevTokenData = useRef<Map<string, { volume: number; price: number }>>(new Map());
  const prevKingId = useRef<string | null>(null);

  useEffect(() => {
    function refresh() {
      const t = getTokens();
      setTokens(t);
      setCoinsLaunched(getCoinsLaunched());
      setTotalTrades(getTotalTrades());
      setActiveTraders(getActiveTraders());
      const fees = getFeesCollected();
      setFeesSol(fees.sol);
      setFeesEth(fees.eth);
      setCurves(getBondingCurveStates());
      setRefreshKey((k) => k + 1);
    }

    refresh();
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, []);

  // Track prev data for flash and new-token detection
  useEffect(() => {
    const map = new Map<string, { volume: number; price: number }>();
    tokens.forEach((t) => map.set(t.id, { volume: t.volume24h, price: t.price }));
    prevTokenData.current = map;
    prevTokenIds.current = new Set(tokens.map((t) => t.id));
  }, [refreshKey]);

  const sortedTokens = useMemo(() => {
    const list = [...tokens];
    switch (filter) {
      case "new":
        return list.sort((a, b) => b.createdAt - a.createdAt);
      case "top":
        return list.sort((a, b) => b.marketCap - a.marketCap);
      case "gainers":
        return list.sort((a, b) => {
          const aHist = a.priceHistory;
          const bHist = b.priceHistory;
          const aChange = aHist.length >= 2 ? (aHist[aHist.length - 1] - aHist[0]) / aHist[0] : 0;
          const bChange = bHist.length >= 2 ? (bHist[bHist.length - 1] - bHist[0]) / bHist[0] : 0;
          return bChange - aChange;
        });
      case "volume":
        return list.sort((a, b) => b.volume24h - a.volume24h);
      default:
        return list;
    }
  }, [tokens, filter, refreshKey]);

  // King of the Hill: #1 by volume
  const king = useMemo(() => {
    if (tokens.length === 0) return null;
    return [...tokens].sort((a, b) => b.volume24h - a.volume24h)[0];
  }, [tokens, refreshKey]);

  // Graduated tokens
  const graduatedTokens = useMemo(() => {
    const curveMap = new Map(curves.map((c) => [c.tokenId, c]));
    return tokens.filter((t) => {
      const curve = curveMap.get(t.id);
      return curve?.graduated;
    }).sort((a, b) => {
      const ca = curveMap.get(a.id);
      const cb = curveMap.get(b.id);
      return (cb?.lastTradeTimestamp || 0) - (ca?.lastTradeTimestamp || 0);
    });
  }, [tokens, curves, refreshKey]);

  useEffect(() => {
    if (king && king.id !== prevKingId.current) {
      prevKingId.current = king.id;
    }
  }, [king]);

  const filters: { key: FilterTab; icon: string; label: string }[] = [
    { key: "new", icon: "🆕", label: "NEW" },
    { key: "top", icon: "🔥", label: "TOP" },
    { key: "gainers", icon: "📈", label: "GAINERS" },
    { key: "volume", icon: "📊", label: "VOLUME" },
  ];

  // Detect new token IDs for pop animation
  const currentIds = new Set(tokens.map((t) => t.id));
  const newIds = useRef<Set<string>>(new Set());

  return (
    <div className="min-h-dvh bg-[#050505]">
      {/* ═══════════ HERO ═══════════ */}
      <div className="relative overflow-hidden pb-4 crt-effect">
        {/* Coin Rain */}
        <CoinRain />

        {/* Star Sparkles */}
        <StarSparkles />

        {/* Pixel Moon — hidden on mobile to prevent overflow */}
        <div
          className="pixel-moon hidden sm:block"
          style={{
            width: "140px",
            height: "140px",
            top: "10px",
            right: "-20px",
          }}
        />

        <div className="relative max-w-3xl mx-auto px-4 pt-16 pb-6 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, ease: [0.68, -0.55, 0.265, 1.55] }}
          >
            <div className="text-5xl mb-4 retro-float relative z-[2]">
              <span className="inline-block">⭐</span>
              <span className="retro-coin-spin inline-block mx-1"><PixelCoinSVG size={40} /></span>
              <span className="inline-block">⭐</span>
            </div>
            <h1
              className="text-3xl sm:text-4xl font-bold mb-3 pixel-shadow relative z-[2]"
              style={{
                fontFamily: '"Press Start 2P", monospace',
                fontSize: "clamp(1rem, 5vw, 1.8rem)",
                color: "#00ff41",
              }}
            >
              IGNOSHASHI
            </h1>
          </motion.div>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15, duration: 0.3 }}
            className="text-[#e0ffe0] mb-6 text-lg relative z-[2]"
            style={{ fontFamily: '"VT323", monospace', fontSize: "1.2rem" }}
          >
            ⭐ LAUNCH & TRADE MEME COINS ON SOLANA & ETHEREUM ⭐
          </motion.p>

          {/* ? Block */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mb-4 relative z-[2]"
          >
            <QuestionBlock />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.3 }}
            className="flex flex-wrap gap-3 justify-center relative z-[2]"
          >
            <Link to="/create">
              <button
                className="retro-btn retro-btn-orange text-[0.55rem] px-6 py-3 neon-glow-yellow"
                style={{ fontFamily: '"Press Start 2P", monospace' }}
              >
                <HiMiniRocketLaunch size={16} />
                LAUNCH COIN
              </button>
            </Link>
            <Link to="/buy">
              <button
                className="retro-btn retro-btn-turquoise text-[0.55rem] px-6 py-3"
                style={{ fontFamily: '"Press Start 2P", monospace' }}
              >
                🧰 BUY TOOLS
              </button>
            </Link>
          </motion.div>
        </div>
      </div>

      {/* ═══════════ LIVE TICKER BAR ═══════════ */}
      <LiveTickerBar tokens={tokens} />

      {/* ═══════════ CRT ANNOUNCEMENT BOARD ═══════════ */}
      <div className="mt-6 mb-4">
        <CRTAnnouncementBoard />
      </div>

      {/* ═══════════ LIVE TRADE FEED ═══════════ */}
      <LiveTradeFeed />

      {/* ═══════════ LIVE ACTIVITY COUNTERS ═══════════ */}
      <div className="pt-6">
        <LiveCounters
          coinsLaunched={coinsLaunched}
          totalTrades={totalTrades}
          activeTraders={activeTraders}
          feesSol={feesSol}
          feesEth={feesEth}
        />
      </div>

      {/* ═══════════ FILTER TABS — CENTERED ═══════════ */}
      <div className="max-w-3xl mx-auto px-4 mb-6">
        <div className="flex justify-center gap-2 flex-wrap">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-md font-bold border-2 transition-all duration-100 ${
                filter === f.key
                  ? "retro-tab-active border-[rgba(0,255,65,0.4)]"
                  : "retro-tab border-[rgba(0,255,65,0.1)]"
              }`}
              style={{
                fontFamily: '"Press Start 2P", monospace',
                fontSize: "0.45rem",
                boxShadow: filter === f.key ? "0 0 12px rgba(0,255,65,0.3), 3px 3px 0 rgba(0,255,65,0.2)" : "3px 3px 0 rgba(0,255,65,0.1)",
              }}
            >
              <span className="text-sm">{f.icon}</span>
              {f.label}
              {/* Scanline effect on active */}
              {filter === f.key && (
                <span
                  className="absolute inset-0 pointer-events-none rounded-md"
                  style={{
                    background: "repeating-linear-gradient(0deg, rgba(0,255,65,0.03) 0px, rgba(0,255,65,0.03) 1px, transparent 1px, transparent 4px)",
                  }}
                />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ═══════════ YOUR WATCHLIST ═══════════ */}
      {(() => {
        if (typeof window === "undefined") return null;
        let followedIds: string[] = [];
        try {
          followedIds = JSON.parse(localStorage.getItem("ignoshashi_followed") || "[]");
        } catch { /* */ }
        const followed = tokens.filter((t) => followedIds.includes(t.id)).slice(0, 5);
        if (followed.length === 0) {
          return (
            <div className="max-w-3xl mx-auto px-4 mb-8">
              <h3
                className="text-[#00ff41] mb-4 pixel-shadow-sm"
                style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.55rem" }}
              >
                ⭐ YOUR WATCHLIST
              </h3>
              <div className="retro-card p-4 text-center">
                <p className="text-2xl mb-2">⭐</p>
                <p className="text-[#e0ffe0]" style={{ fontFamily: '"VT323", monospace', fontSize: "1.1rem" }}>
                  Follow tokens to track them here.{" "}
                  <Link to="/leaderboard" className="text-[#00ff41] underline">
                    Browse the leaderboard →
                  </Link>
                </p>
              </div>
            </div>
          );
        }
        return (
          <div className="max-w-3xl mx-auto px-4 mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3
                className="text-[#00ff41] pixel-shadow-sm"
                style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.55rem" }}
              >
                ⭐ YOUR WATCHLIST
              </h3>
              <Link
                to="/portfolio"
                className="text-[#00ff41] hover:text-[#00ff41] underline"
                style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
              >
                View All →
              </Link>
            </div>
            <div className="space-y-2">
              {followed.map((token) => {
                const hist = token.priceHistory;
                const lastP = hist[hist.length - 1] || token.price;
                const prevP = hist[hist.length - 2] || lastP;
                const isUp = lastP >= prevP;
                const change = prevP ? ((lastP - prevP) / prevP) * 100 : 0;
                return (
                  <Link key={token.id} to="/token/$id" params={{ id: token.id }}>
                    <div
                      className="retro-card p-3 flex flex-wrap items-center gap-2"
                      style={{ border: "2px solid rgba(0,255,65,0.15)" }}
                    >
                      <span
                        className="font-bold shrink-0"
                        style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem", color: "#00ff41" }}
                      >
                        {token.ticker}
                      </span>
                      <span
                        className="flex-1 truncate"
                        style={{ fontFamily: '"VT323", monospace', fontSize: "1.1rem", color: "#e0ffe0" }}
                      >
                        {token.name}
                      </span>
                      <span
                        className="font-bold shrink-0"
                        style={{ fontFamily: '"VT323", monospace', fontSize: "1.15rem", color: "#00ff41" }}
                      >
                        ${token.price < 0.001 ? token.price.toFixed(6) : token.price.toFixed(4)}
                      </span>
                      <span
                        className={`font-bold shrink-0 ${change >= 0 ? "text-[#00ff41]" : "text-[#ff4444]"}`}
                        style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
                      >
                        {change >= 0 ? "+" : ""}{change.toFixed(1)}%
                      </span>
                      {/* Mini sparkline placeholder */}
                      <span className="text-sm shrink-0" style={{ color: isUp ? "#00ff41" : "#ff4444" }}>
                        {isUp ? "📈" : "📉"}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ═══════════ KING OF THE HILL ═══════════ */}
      <KingOfTheHill king={king} prevKingId={prevKingId.current} />

      {/* ═══════════ RECENTLY GRADUATED ═══════════ */}
      <RecentlyGraduated graduatedTokens={graduatedTokens} curves={curves} />

      {/* ═══════════ TOP CREATORS ═══════════ */}
      <TopCreators tokens={tokens} curves={curves} />

      {/* ═══════════ TRENDING NOW ═══════════ */}
      {(() => {
        const trending = [...tokens]
          .sort((a, b) => b.volume24h - a.volume24h)
          .slice(0, 3);
        if (trending.length === 0) return null;
        return (
          <div className="max-w-3xl mx-auto px-4 mb-8">
            <h3
              className="text-[#00ff41] mb-4 pixel-shadow-sm"
              style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem" }}
            >
              🔥 TRENDING NOW
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {trending.map((token, i) => {
                const hist = token.priceHistory;
                const lastP = hist[hist.length - 1] || token.price;
                const prevP = hist[hist.length - 2] || lastP;
                const isUp = lastP >= prevP;
                const change = prevP ? ((lastP - prevP) / prevP) * 100 : 0;
                return (
                  <Link key={token.id} to="/token/$id" params={{ id: token.id }}>
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.1 }}
                      className="retro-card p-3 group"
                      style={{
                        border: "2px solid rgba(0,255,65,0.2)",
                      }}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 overflow-hidden"
                          style={{
                            background: "#0d120d",
                            border: "2px solid rgba(0,255,65,0.3)",
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
                        <div className="min-w-0">
                          <div
                            className="font-bold text-[#ffffff] truncate"
                            style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.35rem" }}
                          >
                            {token.name}
                          </div>
                          <div
                            className="text-[#e0ffe0]"
                            style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem" }}
                          >
                            ${token.ticker}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span
                          className="font-bold"
                          style={{ fontFamily: '"VT323", monospace', fontSize: "1rem", color: "#00ff41" }}
                        >
                          ${token.price < 0.001 ? token.price.toFixed(6) : token.price.toFixed(4)}
                        </span>
                        <span
                          className="text-xs font-bold"
                          style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem", color: isUp ? "#00ff41" : "#ff4444" }}
                        >
                          {isUp ? "+" : ""}{change.toFixed(1)}%
                        </span>
                      </div>
                      <div
                        className="text-xs mt-1"
                        style={{ fontFamily: '"VT323", monospace', fontSize: "0.85rem", color: "#b0d0b0" }}
                      >
                        Vol: ${formatCompact(token.volume24h)}
                      </div>
                    </motion.div>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ═══════════ ANNOUNCEMENTS BANNER ═══════════ */}
      <div className="max-w-3xl mx-auto px-4 mb-8">
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="retro-card p-4 text-center relative overflow-hidden"
          style={{
            borderColor: "rgba(0,255,65,0.3)",
            boxShadow: "0 0 15px rgba(0,255,65,0.15), 4px 4px 0 rgba(0,255,65,0.15)",
          }}
        >
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: "repeating-linear-gradient(0deg, rgba(0,255,65,0.03) 0px, rgba(0,255,65,0.03) 1px, transparent 1px, transparent 4px)",
            }}
          />
          <div className="relative z-[2]">
            <span className="text-xl mr-2">📢</span>
            <span
              className="text-[#00ff41] font-bold"
              style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem" }}
            >
              ANNOUNCEMENTS
            </span>
          </div>
          <p
            className="text-[#e0ffe0] mt-2 relative z-[2]"
            style={{ fontFamily: '"VT323", monospace', fontSize: "1.1rem" }}
          >
            🚀 ignoshashi is live! Create your first meme coin today.
          </p>
        </motion.div>
      </div>

      {/* ═══════════ PIXEL DIVIDER ═══════════ */}
      <div className="pixel-divider">┈┈┈┈┈ ⭐ ┈┈┈┈┈</div>

      {/* ═══════════ TOKEN GRID ═══════════ */}
      <div className="max-w-3xl mx-auto px-4 pb-20">
        <AnimatePresence mode="popLayout">
          <div className="grid gap-3">
            {sortedTokens.map((token, i) => {
              const prevData = prevTokenData.current.get(token.id);
              const isNew = !prevTokenIds.current.has(token.id);
              return (
                <motion.div
                  key={token.id}
                  initial={
                    isNew
                      ? { opacity: 0, scale: 0 }
                      : { opacity: 0, y: 10, scale: 0.97 }
                  }
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={
                    isNew
                      ? { type: "spring", stiffness: 400, damping: 12, mass: 0.8 }
                      : { delay: Math.min(i * 0.03, 0.3), duration: 0.25, ease: "easeOut" }
                  }
                  layout
                >
                  <TokenCard
                    token={token}
                    isKing={king?.id === token.id}
                    prevVolume={prevData?.volume}
                    prevPrice={prevData?.price}
                  />
                </motion.div>
              );
            })}
          </div>
        </AnimatePresence>

        {/* Empty State */}
        {sortedTokens.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-16"
          >
            <p className="text-7xl mb-4 retro-float">📦</p>
            <p
              className="text-[#ffffff] mb-2 pixel-shadow-sm"
              style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.7rem" }}
            >
              NO COINS LAUNCHED YET
            </p>
            <p className="text-[#e0ffe0] mb-4" style={{ fontFamily: '"VT323", monospace', fontSize: "1.2rem" }}>
              Be the first to launch a meme coin!
            </p>
            <Link to="/create" className="inline-block">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="retro-btn retro-btn-orange neon-glow-yellow text-[0.55rem] px-6 py-3"
                style={{ fontFamily: '"Press Start 2P", monospace' }}
              >
                <HiMiniRocketLaunch size={16} />
                LAUNCH A MEME COIN
              </motion.button>
            </Link>
          </motion.div>
        )}
      </div>

      {/* ═══════════ STREAM EMBEDS ═══════════ */}
      <StreamEmbeds />

      {/* ═══════════ JOIN COMMUNITY ═══════════ */}
      <div className="max-w-3xl mx-auto px-4 mb-8">
        <h3
          className="text-[#00ff41] mb-4 text-center pixel-shadow-sm"
          style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem" }}
        >
          💬 JOIN OUR COMMUNITY
        </h3>
        <div className="flex justify-center gap-4 flex-wrap">
          <a
            href="https://discord.com/invite/Tu5P7y9Pj"
            target="_blank"
            rel="noopener noreferrer"
            className="retro-card px-6 py-3 flex items-center gap-2 hover:border-[#5865f2] transition-colors duration-200"
            style={{
              border: "3px solid rgba(88,101,242,0.3)",
              boxShadow: "4px 4px 0 rgba(88,101,242,0.15)",
            }}
          >
            <span className="text-xl">💬</span>
            <span
              className="font-bold"
              style={{
                fontFamily: '"Press Start 2P", monospace',
                fontSize: "0.45rem",
                color: "#5865f2",
              }}
            >
              JOIN DISCORD
            </span>
          </a>
          <a
            href="https://x.com/ignoshashi"
            target="_blank"
            rel="noopener noreferrer"
            className="retro-card px-6 py-3 flex items-center gap-2 hover:border-[#1da1f2] transition-colors duration-200"
            style={{
              border: "3px solid rgba(29,161,242,0.3)",
              boxShadow: "4px 4px 0 rgba(29,161,242,0.15)",
            }}
          >
            <span className="text-xl">🐦</span>
            <span
              className="font-bold"
              style={{
                fontFamily: '"Press Start 2P", monospace',
                fontSize: "0.45rem",
                color: "#1da1f2",
              }}
            >
              FOLLOW ON X
            </span>
          </a>
        </div>
      </div>

      {/* ═══════════ LIVE BATTLES ═══════════ */}
      <LiveBattlesSection />

      {/* ═══════════ DISCLAIMER BANNER ═══════════ */}
      <div className="max-w-3xl mx-auto px-4 pb-8">
        {(() => {
          // Followed tokens helper
          if (typeof window === "undefined") return null;
          let followedIds: string[] = [];
          try {
            followedIds = JSON.parse(localStorage.getItem("ignoshashi_followed") || "[]");
          } catch { /* ignore */ }
          const followedTokens = tokens.filter((t) => followedIds.includes(t.id));
          if (followedTokens.length === 0) return null;
          return (
            <div className="mb-8">
              <h3
                className="text-[#00ff41] mb-4 pixel-shadow-sm"
                style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.55rem" }}
              >
                ⭐ FOLLOWED TOKENS
              </h3>
              <div className="space-y-2">
                {followedTokens.map((token) => {
                  const hist = token.priceHistory;
                  const lastP = hist[hist.length - 1] || token.price;
                  const prevP = hist[hist.length - 2] || lastP;
                  const isUp = lastP >= prevP;
                  return (
                    <Link key={token.id} to="/token/$id" params={{ id: token.id }}>
                      <Card className="p-3">
                        <div className="flex items-center gap-3">
                          <span className="text-[#00ff41]" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem" }}>
                            {token.ticker}
                          </span>
                          <span className="text-[#e0ffe0] flex-1" style={{ fontFamily: '"VT323", monospace', fontSize: "1.1rem" }}>
                            {token.name}
                          </span>
                          <span
                            className="font-bold"
                            style={{ fontFamily: '"VT323", monospace', fontSize: "1.15rem", color: isUp ? "#00ff41" : "#00cc33" }}
                          >
                            ${token.price < 0.001 ? token.price.toFixed(6) : token.price.toFixed(4)}
                          </span>
                          <span
                            className="text-[0.45rem] px-1.5 py-0.5 rounded"
                            style={{
                              fontFamily: '"Press Start 2P", monospace',
                              background: "rgba(0,255,65,0.1)",
                              color: "#00ff41",
                            }}
                          >
                            {token.blockchain}
                          </span>
                        </div>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })()}
        <div
          className="retro-card p-3 text-center"
          style={{
            borderColor: "rgba(255,180,60,0.3)",
            boxShadow: "0 0 12px rgba(255,180,60,0.08)",
          }}
        >
          <p
            className="text-[#e0ffe0] leading-relaxed"
            style={{ fontFamily: '"VT323", monospace', fontSize: "0.95rem" }}
          >
            <span style={{ color: "#ffb83c" }}>⚠️ Disclaimer:</span>{" "}
            ignoshashi does not endorse any token. Meme coins carry extreme risk including total loss. DYOR. Not financial advice.
          </p>
        </div>
      </div>

      {/* ═══════════ STREAM EMBEDS ═══════════ */}
      <StreamEmbeds />
    </div>
  );
}
