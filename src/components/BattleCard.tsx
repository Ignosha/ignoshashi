import { motion } from "framer-motion";
import { HiMiniBolt, HiMiniRocketLaunch } from "react-icons/hi2";
import type { BattleToken } from "~/services/battles";

interface BattleCardProps {
  token: BattleToken;
  votes: number;
  totalVotes: number;
  onVote: () => void;
  disabled: boolean;
  side: "left" | "right";
  isWinner: boolean | null; // null = still fighting, true = won, false = lost
  hasVoted: boolean;
  needsWallet?: boolean; // true if wallet not connected
}

export function BattleCard({
  token,
  votes,
  totalVotes,
  onVote,
  disabled,
  side,
  isWinner,
  hasVoted,
  needsWallet,
}: BattleCardProps) {
  const percent = totalVotes > 0 ? (votes / totalVotes) * 100 : 50;
  const isLeading = percent > 50;
  const isTied = totalVotes > 0 && votes === totalVotes - votes;

  const barColor =
    isWinner === true
      ? "#ffd700"
      : isWinner === false
        ? "#6b3a2a"
        : isLeading
          ? "#06d6a0"
          : "#ef476f";

  const glowColor =
    isWinner === true
      ? "rgba(255,215,0,0.4)"
      : isWinner === false
        ? "rgba(107,58,42,0.3)"
        : isLeading
          ? "rgba(6,214,160,0.3)"
          : "rgba(239,71,111,0.3)";

  return (
    <motion.div
      className="relative flex flex-col items-center w-full"
      animate={{
        scale: isWinner === true ? 1.03 : isWinner === false ? 0.95 : 1,
      }}
      transition={{ duration: 0.4, ease: [0.68, -0.55, 0.265, 1.55] }}
    >
      {/* Glow aura on winner */}
      {isWinner === true && (
        <motion.div
          className="absolute inset-0 rounded-xl pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 1, repeat: Infinity }}
          style={{
            background: `radial-gradient(ellipse at center, rgba(255,215,0,0.25) 0%, transparent 70%)`,
            filter: "blur(20px)",
          }}
        />
      )}

      {/* Token card */}
      <div
        className="retro-card w-full p-3 sm:p-5 flex flex-col items-center gap-3 relative z-10"
        style={{
          boxShadow: `0 0 20px ${glowColor}, 0 4px 20px rgba(0,0,0,0.5)`,
          borderColor: barColor,
          opacity: isWinner === false ? 0.5 : 1,
        }}
      >
        {/* Token image or generated avatar */}
        <div className="relative">
          {token.image ? (
            <img
              src={token.image}
              alt={token.name}
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover border-2"
              style={{ borderColor: barColor }}
            />
          ) : (
            <div
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center text-3xl font-bold border-2"
              style={{
                background: "linear-gradient(135deg, #2a2a15, #1e1e0f)",
                borderColor: barColor,
                fontFamily: '"Press Start 2P", monospace',
                color: barColor,
              }}
            >
              {token.ticker.slice(0, 2)}
            </div>
          )}

          {/* Blockchain badge */}
          <span
            className="absolute -top-1 -right-1 text-[0.5rem] px-1.5 py-0.5 rounded-full font-bold uppercase"
            style={{
              fontFamily: '"Press Start 2P", monospace',
              background: token.blockchain === "solana" ? "#06d6a0" : "#ef476f",
              color: "#1a1a0a",
            }}
          >
            {token.blockchain === "solana" ? "SOL" : "ETH"}
          </span>
        </div>

        {/* Token name */}
        <h3
          className="text-center text-sm sm:text-lg leading-tight"
          style={{
            fontFamily: '"Press Start 2P", monospace',
            color: isWinner === true ? "#ffd700" : "#f5f0e1",
            textShadow: isWinner === true ? "0 0 10px rgba(255,215,0,0.5)" : "none",
            fontSize: "clamp(0.55rem, 2vw, 0.8rem)",
          }}
        >
          {token.name}
        </h3>

        {/* Ticker & price info */}
        <div className="flex flex-col items-center gap-1">
          <span
            className="text-sm"
            style={{
              fontFamily: '"Press Start 2P", monospace',
              color: "#c4b998",
              fontSize: "0.45rem",
            }}
          >
            ${token.ticker}
          </span>
          <span
            className="text-xs"
            style={{
              fontFamily: '"VT323", monospace',
              color: token.change24h >= 0 ? "#06d6a0" : "#ef476f",
              fontSize: "0.9rem",
            }}
          >
            {token.change24h >= 0 ? "▲" : "▼"}{" "}
            {Math.abs(token.change24h).toFixed(1)}%
          </span>
          <span
            className="text-xs"
            style={{ fontFamily: '"VT323", monospace', color: "#6b6b55", fontSize: "0.8rem" }}
          >
            MC: ${(token.marketCap / 1000).toFixed(1)}K
          </span>
        </div>

        {/* Vote count */}
        <div
          className="text-center"
          style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.55rem", color: "#f5f0e1" }}
        >
          <motion.span
            key={votes}
            initial={{ scale: 1.5, color: "#ffd700" }}
            animate={{ scale: 1, color: "#f5f0e1" }}
            transition={{ duration: 0.3 }}
          >
            {votes}
          </motion.span>{" "}
          VOTES
        </div>

        {/* Percentage bar */}
        <div className="w-full h-4 rounded-full overflow-hidden border" style={{ borderColor: "#3a2a15", background: "#1a1a0a" }}>
          <motion.div
            className="h-full rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${percent}%` }}
            transition={{ duration: 0.5, ease: [0.68, -0.55, 0.265, 1.55] }}
            style={{
              background: `linear-gradient(90deg, ${barColor}, ${barColor}88)`,
              boxShadow: `0 0 10px ${barColor}`,
            }}
          />
        </div>

        {/* Percentage text */}
        <span
          style={{
            fontFamily: '"VT323", monospace',
            fontSize: "0.85rem",
            color: barColor,
          }}
        >
          {percent.toFixed(1)}%
        </span>

        {/* VOTE button */}
        {isWinner === null && (
          <motion.button
            onClick={onVote}
            disabled={disabled || hasVoted}
            className="retro-btn retro-btn-orange w-full justify-center py-2 sm:py-3 text-xs"
            style={{ fontSize: "clamp(0.4rem, 1.5vw, 0.55rem)" }}
            whileHover={!disabled && !hasVoted ? { scale: 1.05 } : {}}
            whileTap={!disabled && !hasVoted ? { scale: 0.95 } : {}}
          >
            {hasVoted ? (
              <>✓ VOTED</>
            ) : needsWallet ? (
              <>
                <HiMiniBolt className="text-sm" /> CONNECT WALLET
              </>
            ) : (
              <>
                <HiMiniBolt className="text-sm" /> VOTE
              </>
            )}
          </motion.button>
        )}

        {/* Winner indicator */}
        {isWinner === true && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.5, ease: [0.68, -0.55, 0.265, 1.55] }}
            className="flex items-center gap-1"
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: "0.5rem",
              color: "#ffd700",
              textShadow: "0 0 10px rgba(255,215,0,0.6)",
            }}
          >
            <HiMiniRocketLaunch /> WINNER!
          </motion.div>
        )}

        {/* Loser indicator */}
        {isWinner === false && (
          <motion.div
            initial={{ opacity: 1 }}
            animate={{ opacity: 0.5 }}
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: "0.45rem",
              color: "#6b6b55",
            }}
          >
            ELIMINATED
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
