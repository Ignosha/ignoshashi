import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  HiMiniBolt,
  HiMiniTrophy,
  HiMiniClock,
  HiMiniArrowPath,
  HiMiniFire,
  HiMiniRocketLaunch,
  HiMiniChartBar,
} from "react-icons/hi2";
import { BattleCard } from "~/components/BattleCard";
import {
  ensureTournament,
  getCurrentBattle,
  getTournament,
  castVote,
  getUserVoteForBattle,
  getBracket,
  getPastBattles,
  getBattleStats,
  getPreviousChampion,
  getArchivedTournaments,
  isBattleActive,
  createTournament,
  getAvailableTokenCount,
  type Battle,
  type Tournament,
} from "~/services/battles";
import { useWallet } from "~/context/WalletContext";
import {
  sendBondingCurveTransaction,
  calculateFeeBreakdown,
  getExplorerUrl,
  type TxResult,
} from "~/services/walletTransactions";
import {
  getBondingCurveState,
  saveBondingCurveState,
  type LeaderboardEntry,
} from "~/services/tracker";
import {
  executeBuySimulated,
  getBuyFeeBreakdown,
  applyBuyToState,
} from "~/services/bondingCurve";

export const Route = createFileRoute("/battles")({
  component: BattlesPage,
});

function formatCompact(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n.toFixed(0);
}

function formatTime(ms: number): string {
  if (ms <= 0) return "00:00";
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
}

function BattlesPage() {
  const { connected, connect, solAddress, ethAddress } = useWallet();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [currentBattle, setCurrentBattle] = useState<Battle | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [userVote, setUserVote] = useState<"A" | "B" | null>(null);
  const [voteResult, setVoteResult] = useState<{ success: boolean; message: string } | null>(null);
  const [pastBattles, setPastBattles] = useState<Battle[]>([]);
  const [stats, setStats] = useState({ totalBattles: 0, totalVotes: 0, mostVotedToken: "None" });
  const [champion, setChampion] = useState<{ name: string; tokenId: string } | null>(null);
  const [archives, setArchives] = useState<Tournament[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [knockoutAnim, setKnockoutAnim] = useState<"A" | "B" | null>(null);
  const [confettiBurst, setConfettiBurst] = useState<{ side: "left" | "right"; x: number; y: number } | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [votePending, setVotePending] = useState(false);
  const [voteTxHash, setVoteTxHash] = useState<string>("");
  const [availableTokens, setAvailableTokens] = useState(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = useCallback(() => {
    ensureTournament();
    const t = getTournament();
    setTournament(t);
    
    const battle = getCurrentBattle();
    setCurrentBattle(battle);

    if (battle) {
      setTimeLeft(Math.max(0, battle.endTime - Date.now()));
      const uv = getUserVoteForBattle(battle.id);
      setUserVote(uv);
    } else {
      setTimeLeft(0);
    }

    setPastBattles(getPastBattles());
    setStats(getBattleStats());
    setChampion(getPreviousChampion());
    setArchives(getArchivedTournaments());
    setAvailableTokens(getAvailableTokenCount());
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Timer
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    
    if (currentBattle && currentBattle.status === "active") {
      timerRef.current = setInterval(() => {
        const remaining = Math.max(0, (currentBattle.endTime - Date.now()));
        setTimeLeft(remaining);

        if (remaining <= 0) {
          // Battle ended — trigger knockout
          if (timerRef.current) clearInterval(timerRef.current);
          const winner =
            currentBattle.votesA > currentBattle.votesB
              ? "A"
              : currentBattle.votesB > currentBattle.votesA
                ? "B"
                : Math.random() < 0.5
                  ? "A"
                  : "B";
          setKnockoutAnim(winner as "A" | "B");

          // Reload data after animation
          setTimeout(() => {
            loadData();
            setKnockoutAnim(null);
          }, 2500);
        }
      }, 1000);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [currentBattle?.id]);

  const handleVote = useCallback(
    async (tokenId: string) => {
      if (!currentBattle || currentBattle.status !== "active") return;
      if (userVote) return; // Already voted
      if (votePending) return; // Already processing

      // Require wallet connection
      if (!connected) {
        setVoteResult({ success: false, message: "Connect wallet to vote" });
        setTimeout(() => setVoteResult(null), 3000);
        // Prompt to connect
        const battleToken =
          tokenId === currentBattle.tokenA?.tokenId
            ? currentBattle.tokenA
            : currentBattle.tokenB;
        if (!battleToken) return;
        connect(battleToken.blockchain as "solana" | "ethereum");
        return;
      }

      const battleToken =
        tokenId === currentBattle.tokenA?.tokenId
          ? currentBattle.tokenA
          : currentBattle.tokenB;
      if (!battleToken) return;

      setVotePending(true);
      setVoteResult({ success: true, message: "Processing vote transaction..." });

      try {
        // Try real transaction first — 0.01 SOL/ETH vote buy
        const chain = battleToken.blockchain as "solana" | "ethereum";
        const walletAddr = chain === "solana" ? solAddress! : ethAddress!;
        const voteAmount = 0.01; // Small buy as vote

        // Check if there's a bonding curve to use
        const bcState = getBondingCurveState(tokenId);
        let txResult: TxResult;

        if (bcState && !bcState.graduated && bcState.bondingCurveActive) {
          // Use bonding curve buy as vote
          const feeBreakdown = calculateFeeBreakdown(voteAmount);
          
          txResult = await sendBondingCurveTransaction(
            chain,
            walletAddr,
            feeBreakdown,
            bcState.creatorAddress,
            "BUY",
          );

          if (txResult.success) {
            // Apply buy to bonding curve state
            const breakdown = getBuyFeeBreakdown(bcState, voteAmount * 1e6); // approximate tokens
            const updated = applyBuyToState(
              bcState,
              breakdown.actualAmount,
              breakdown.avgPrice,
              breakdown.totalWithFee,
              breakdown.fee,
              walletAddr,
            );
            saveBondingCurveState(updated);
          }
        } else {
          // No bonding curve — just send as a direct vote transfer
          const feeBreakdown = calculateFeeBreakdown(voteAmount);
          txResult = await sendBondingCurveTransaction(
            chain,
            walletAddr,
            feeBreakdown,
            walletAddr, // self as creator for vote purposes
            "BUY",
          );
        }

        if (txResult.success) {
          setVoteTxHash(txResult.txHash);
          // Record the vote in the battle system using volume contributed
          const result = castVote(currentBattle.id, tokenId, walletAddr);
          if (result.success) {
            const side = tokenId === currentBattle.tokenA?.tokenId ? "A" : "B";
            setUserVote(side);
            setConfettiBurst({
              side: side === "A" ? "left" : "right",
              x: 0,
              y: 0,
            });
            setTimeout(() => setConfettiBurst(null), 1500);
            setVoteResult({ success: true, message: `Voted! TX: ${txResult.txHash.slice(0, 8)}...` });

            // Refresh
            setTimeout(() => {
              const t = getTournament();
              setTournament(t);
              const cb = t?.battles.find((b) => b.id === currentBattle.id);
              if (cb) setCurrentBattle(cb);
            }, 100);
          } else {
            setVoteResult({ success: false, message: result.message });
          }
        } else {
          setVoteResult({ success: false, message: txResult.error || "Transaction failed" });
        }
      } catch (err: any) {
        setVoteResult({ success: false, message: err?.message || "Vote failed" });
      } finally {
        setVotePending(false);
        setTimeout(() => setVoteResult(null), 5000);
      }
    },
    [currentBattle, userVote, votePending, connected, solAddress, ethAddress, connect]
  );

  const handleForceReset = () => {
    const t = getTournament();
    if (t) {
      const { archiveTournament } = require("~/services/battles");
      // Import dynamically within the function to avoid circular issues
    }
    // Just create a new one
    import("~/services/battles").then((mod) => {
      const current = mod.getTournament();
      if (current) {
        mod.archiveTournament(current);
      }
      mod.createTournament();
      loadData();
      setShowResetConfirm(false);
      setKnockoutAnim(null);
      setUserVote(null);
    });
  };

  // Clean up knockout animation
  useEffect(() => {
    if (knockoutAnim) {
      const t = setTimeout(() => setKnockoutAnim(null), 2500);
      return () => clearTimeout(t);
    }
  }, [knockoutAnim]);

  const totalVotes = currentBattle
    ? currentBattle.votesA + currentBattle.votesB
    : 0;
  const isVotingClosed = timeLeft <= 0;

  // Determine winner state for cards
  const winnerA =
    knockoutAnim === "A" ||
    (currentBattle?.status === "completed" && currentBattle?.winnerId === currentBattle?.tokenA?.tokenId);
  const winnerB =
    knockoutAnim === "B" ||
    (currentBattle?.status === "completed" && currentBattle?.winnerId === currentBattle?.tokenB?.tokenId);

  return (
    <div className="min-h-screen px-3 sm:px-6 py-6 sm:py-10 max-w-6xl mx-auto">
      {/* ═══ CONFETTI BURST ═══ */}
      <AnimatePresence>
        {confettiBurst && (
          <motion.div
            className="fixed inset-0 pointer-events-none z-[999]"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {Array.from({ length: 30 }).map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-2 h-2 rounded-full"
                style={{
                  background: ["#ffd700", "#ff6b35", "#06d6a0", "#ef476f", "#ffd23f"][i % 5],
                  left: confettiBurst.side === "left" ? `${20 + Math.random() * 30}%` : `${50 + Math.random() * 30}%`,
                  top: `${30 + Math.random() * 20}%`,
                }}
                initial={{ y: 0, x: 0, opacity: 1, scale: 1 }}
                animate={{
                  y: -100 - Math.random() * 200,
                  x: (Math.random() - 0.5) * 200,
                  opacity: 0,
                  scale: 0,
                  rotate: Math.random() * 720,
                }}
                transition={{ duration: 0.8 + Math.random() * 0.6, ease: "easeOut" }}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ PAGE HEADER ═══ */}
      <div className="text-center mb-8">
        <motion.h1
          className="text-3xl sm:text-5xl mb-2"
          style={{
            fontFamily: '"Press Start 2P", monospace',
            color: "#ffd23f",
            textShadow: "0 0 20px rgba(255,210,63,0.5), 0 0 40px rgba(255,107,53,0.3)",
            fontSize: "clamp(1.2rem, 5vw, 2.5rem)",
          }}
          initial={{ y: -30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, ease: [0.68, -0.55, 0.265, 1.55] }}
        >
          ⚔️ BATTLE ROYALE ⚔️
        </motion.h1>
        <motion.p
          className="text-sm"
          style={{ fontFamily: '"VT323", monospace', color: "#c4b998", fontSize: "1.1rem" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          Community voting arena — pick winners, earn glory
        </motion.p>

        {/* Previous champion banner */}
        {champion && (
          <motion.div
            className="inline-flex items-center gap-2 mt-3 px-4 py-2 rounded-lg"
            style={{
              background: "linear-gradient(135deg, rgba(255,215,0,0.15), rgba(255,107,53,0.1))",
              border: "1px solid rgba(255,215,0,0.3)",
            }}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.5, duration: 0.4, ease: [0.68, -0.55, 0.265, 1.55] }}
          >
            <HiMiniTrophy style={{ color: "#ffd700" }} />
            <span style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.45rem", color: "#ffd700" }}>
              PREVIOUS CHAMPION: {champion.name} 👑
            </span>
          </motion.div>
        )}
      </div>

      {/* ═══ BATTLE ARENA ═══ */}
      {currentBattle && currentBattle.status === "active" ? (
        <div className="mb-10">
          {/* Round indicator */}
          <div className="text-center mb-4">
            <span
              className="px-3 py-1 rounded-full text-xs"
              style={{
                fontFamily: '"Press Start 2P", monospace',
                fontSize: "0.45rem",
                background: "#2a2a15",
                border: "2px solid #ff6b35",
                color: "#ff6b35",
              }}
            >
              ROUND {currentBattle.round} —{" "}
              {currentBattle.round === 1
                ? "QUARTERFINALS"
                : currentBattle.round === 2
                  ? "SEMIFINALS"
                  : "🏆 FINALS"}
            </span>
          </div>

          {/* Timer */}
          <div className="text-center mb-6">
            <motion.div
              className="inline-flex items-center gap-2 px-6 py-2 rounded-lg"
              style={{
                background: timeLeft <= 30000 ? "rgba(239,71,111,0.2)" : "rgba(6,214,160,0.1)",
                border: `2px solid ${timeLeft <= 30000 ? "#ef476f" : "#06d6a0"}`,
              }}
              animate={timeLeft <= 10000 ? { scale: [1, 1.03, 1] } : {}}
              transition={{ duration: 0.5, repeat: timeLeft <= 10000 ? Infinity : 0 }}
            >
              <HiMiniClock style={{ color: timeLeft <= 30000 ? "#ef476f" : "#06d6a0" }} />
              <span
                style={{
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: "clamp(0.55rem, 2vw, 0.8rem)",
                  color: timeLeft <= 30000 ? "#ef476f" : "#06d6a0",
                }}
              >
                {timeLeft <= 0 ? "MATCH OVER!" : formatTime(timeLeft)}
              </span>
            </motion.div>
          </div>

          {/* VS Arena */}
          <div className="flex items-stretch gap-2 sm:gap-6 justify-center">
            {/* Left fighter */}
            <div className="flex-1 max-w-xs">
              <BattleCard
                token={currentBattle.tokenA}
                votes={currentBattle.votesA}
                totalVotes={totalVotes}
                onVote={() => handleVote(currentBattle.tokenA?.tokenId || "")}
                disabled={currentBattle.status !== "active" || timeLeft <= 0 || votePending}
                side="left"
                isWinner={winnerA ? true : winnerB ? false : null}
                hasVoted={userVote === "A"}
                needsWallet={!connected}
              />
            </div>

            {/* VS Center */}
            <div className="flex flex-col items-center justify-center px-1 sm:px-4">
              <motion.div
                className="relative"
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ duration: 0.6, ease: [0.68, -0.55, 0.265, 1.55] }}
              >
                {/* VS glow */}
                <motion.div
                  className="absolute inset-0 rounded-full"
                  animate={{
                    boxShadow: [
                      "0 0 30px rgba(255,107,53,0.4)",
                      "0 0 60px rgba(255,210,63,0.6)",
                      "0 0 30px rgba(255,107,53,0.4)",
                    ],
                  }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />

                <span
                  className="relative z-10 block text-4xl sm:text-6xl font-bold"
                  style={{
                    fontFamily: '"Press Start 2P", monospace',
                    color: "#ffd23f",
                    textShadow: "0 0 20px rgba(255,210,63,0.8), 0 0 40px rgba(255,107,53,0.6)",
                  }}
                >
                  VS
                </span>

                {/* Lightning bolts */}
                <motion.div
                  className="absolute -top-4 -left-4"
                  animate={{ rotate: [0, 10, -10, 0], opacity: [0.7, 1, 0.7] }}
                  transition={{ duration: 0.5, repeat: Infinity }}
                >
                  <HiMiniBolt style={{ color: "#ffd23f", fontSize: "1.5rem" }} />
                </motion.div>
                <motion.div
                  className="absolute -bottom-4 -right-4"
                  animate={{ rotate: [0, -10, 10, 0], opacity: [0.7, 1, 0.7] }}
                  transition={{ duration: 0.5, repeat: Infinity, delay: 0.25 }}
                >
                  <HiMiniBolt style={{ color: "#ffd23f", fontSize: "1.5rem" }} />
                </motion.div>
              </motion.div>

              {/* Total votes info */}
              <div className="mt-3 text-center">
                <span
                  style={{
                    fontFamily: '"VT323", monospace',
                    fontSize: "1rem",
                    color: "#c4b998",
                  }}
                >
                  {totalVotes} vote{totalVotes !== 1 ? "s" : ""}
                </span>
              </div>
            </div>

            {/* Right fighter */}
            <div className="flex-1 max-w-xs">
              <BattleCard
                token={currentBattle.tokenB}
                votes={currentBattle.votesB}
                totalVotes={totalVotes}
                onVote={() => handleVote(currentBattle.tokenB?.tokenId || "")}
                disabled={currentBattle.status !== "active" || timeLeft <= 0 || votePending}
                side="right"
                isWinner={winnerB ? true : winnerA ? false : null}
                hasVoted={userVote === "B"}
                needsWallet={!connected}
              />
            </div>
          </div>

          {/* Vote feedback toast */}
          <AnimatePresence>
            {voteResult && (
              <motion.div
                className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-lg"
                style={{
                  background: voteResult.success ? "rgba(6,214,160,0.9)" : "rgba(239,71,111,0.9)",
                  border: "2px solid #1a1a0a",
                  color: "#1a1a0a",
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: "0.5rem",
                }}
                initial={{ y: 50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 50, opacity: 0 }}
              >
                {voteResult.message}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ) : (
        /* No active battle state */
        <motion.div
          className="retro-card p-8 text-center max-w-lg mx-auto mb-10"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <HiMiniFire style={{ fontSize: "3rem", color: "#ff6b35", margin: "0 auto" }} />
          <h2
            className="mt-4 mb-2"
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: "0.7rem",
              color: "#f5f0e1",
            }}
          >
            {availableTokens < 2
              ? "NOT ENOUGH TOKENS"
              : tournament?.status === "completed"
                ? `Tournament complete! Champion: ${tournament.championName || "Unknown"} 👑`
                : "NO ACTIVE BATTLE"}
          </h2>
          <p style={{ fontFamily: '"VT323", monospace', color: "#6b6b55", fontSize: "1rem" }}>
            {availableTokens < 2
              ? `Need 8 tokens to start a tournament. Currently: ${availableTokens} tokens. Create one!`
              : tournament?.status === "completed"
                ? "Start a new tournament to crown a new champion!"
                : "Waiting for the next battle to begin..."}
          </p>
          {availableTokens < 2 && (
            <Link to="/create" className="inline-block mt-4">
              <button
                className="retro-btn retro-btn-orange text-xs"
                style={{ fontSize: "0.5rem" }}
              >
                <HiMiniRocketLaunch /> CREATE TOKEN
              </button>
            </Link>
          )}
          {availableTokens >= 2 && (
            <button
              onClick={handleForceReset}
              className="retro-btn retro-btn-orange mt-4 mx-auto text-xs"
              style={{ fontSize: "0.5rem" }}
            >
              <HiMiniArrowPath /> NEW TOURNAMENT
            </button>
          )}
        </motion.div>
      )}

      {/* ═══ BRACKET / TOURNAMENT TREE ═══ */}
      {tournament && (
        <div className="mb-10">
          <h2
            className="text-center mb-6"
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: "clamp(0.6rem, 2vw, 0.75rem)",
              color: "#ffd23f",
              textShadow: "0 0 10px rgba(255,210,63,0.3)",
            }}
          >
            🏟️ TOURNAMENT BRACKET
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Round 1 */}
            <div>
              <h3
                className="text-center mb-3"
                style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.4rem", color: "#c4b998" }}
              >
                QUARTERFINALS
              </h3>
              <div className="flex flex-col gap-2">
                {tournament.battles
                  .filter((b) => b.round === 1)
                  .map((b) => (
                    <BracketSlot key={b.id} battle={b} />
                  ))}
              </div>
            </div>

            {/* Round 2 */}
            <div>
              <h3
                className="text-center mb-3"
                style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.4rem", color: "#c4b998" }}
              >
                SEMIFINALS
              </h3>
              <div className="flex flex-col gap-2">
                {tournament.battles
                  .filter((b) => b.round === 2)
                  .map((b) => (
                    <BracketSlot key={b.id} battle={b} />
                  ))}
              </div>
            </div>

            {/* Round 3 (Finals) */}
            <div>
              <h3
                className="text-center mb-3"
                style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.4rem", color: "#ffd700" }}
              >
                🏆 FINALS
              </h3>
              <div className="flex flex-col gap-2">
                {tournament.battles
                  .filter((b) => b.round === 3)
                  .map((b) => (
                    <BracketSlot key={b.id} battle={b} />
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ BATTLE STATS ═══ */}
      <div className="retro-card p-4 sm:p-6 mb-10">
        <h3
          className="text-center mb-4"
          style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.55rem", color: "#ffd23f" }}
        >
          <HiMiniChartBar className="inline mr-1" /> ARENA STATS
        </h3>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div
              className="text-xl"
              style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.7rem", color: "#ff6b35" }}
            >
              {stats.totalBattles}
            </div>
            <div style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem", color: "#c4b998" }}>BATTLES</div>
          </div>
          <div>
            <div
              className="text-xl"
              style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.7rem", color: "#06d6a0" }}
            >
              {formatCompact(stats.totalVotes)}
            </div>
            <div style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem", color: "#c4b998" }}>TOTAL VOTES</div>
          </div>
          <div>
            <div
              className="text-xl"
              style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem", color: "#ffd700" }}
            >
              {stats.mostVotedToken}
            </div>
            <div style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem", color: "#c4b998" }}>MOST VOTED</div>
          </div>
        </div>
      </div>

      {/* ═══ PAST BATTLES ═══ */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: "clamp(0.55rem, 2vw, 0.7rem)",
              color: "#ffd23f",
            }}
          >
            📜 BATTLE HISTORY
          </h2>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="retro-btn retro-btn-yellow text-xs"
            style={{ fontSize: "0.4rem", padding: "0.3rem 0.8rem" }}
          >
            {showHistory ? "COLLAPSE" : "VIEW FULL HISTORY"}
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {pastBattles.slice(0, showHistory ? pastBattles.length : 5).map((b) => {
            const winnerToken =
              b.winnerId === b.tokenA?.tokenId
                ? b.tokenA
                : b.winnerId === b.tokenB?.tokenId
                  ? b.tokenB
                  : null;
            return (
              <motion.div
                key={b.id}
                className="retro-card p-3 sm:p-4"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
              >
                <div className="flex items-center gap-3">
                  <div className="flex-1 text-right">
                    <span
                      style={{
                        fontFamily: '"Press Start 2P", monospace',
                        fontSize: "clamp(0.35rem, 1.5vw, 0.5rem)",
                        color: b.winnerId === b.tokenA?.tokenId ? "#ffd700" : "#c4b998",
                      }}
                    >
                      {b.tokenA.name || "???"}
                    </span>
                  </div>
                  <div className="text-center">
                    <span
                      style={{
                        fontFamily: '"Press Start 2P", monospace',
                        fontSize: "0.5rem",
                        color: "#ff6b35",
                      }}
                    >
                      {b.votesA} — {b.votesB}
                    </span>
                  </div>
                  <div className="flex-1">
                    <span
                      style={{
                        fontFamily: '"Press Start 2P", monospace',
                        fontSize: "clamp(0.35rem, 1.5vw, 0.5rem)",
                        color: b.winnerId === b.tokenB?.tokenId ? "#ffd700" : "#c4b998",
                      }}
                    >
                      {b.tokenB.name || "???"}
                    </span>
                  </div>
                  <div className="text-right" style={{ minWidth: "60px" }}>
                    {b.status === "completed" && (
                      <span
                        style={{
                          fontFamily: '"VT323", monospace',
                          fontSize: "0.7rem",
                          color: "#6b6b55",
                        }}
                      >
                        R{b.round}
                      </span>
                    )}
                  </div>
                </div>
                {winnerToken && (
                  <div className="text-center mt-1">
                    <span
                      style={{
                        fontFamily: '"VT323", monospace',
                        fontSize: "0.75rem",
                        color: "#ffd700",
                      }}
                    >
                      🏆 {winnerToken.name} won!
                    </span>
                  </div>
                )}
              </motion.div>
            );
          })}
          {pastBattles.length === 0 && (
            <p className="text-center" style={{ fontFamily: '"VT323", monospace', color: "#6b6b55" }}>
              No battles have been fought yet. Be the first to vote!
            </p>
          )}
        </div>
      </div>

      {/* ═══ ARCHIVED TOURNAMENTS ═══ */}
      {archives.length > 0 && (
        <div className="mb-10">
          <h2
            className="mb-4"
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: "clamp(0.55rem, 2vw, 0.7rem)",
              color: "#ffd23f",
            }}
          >
            👑 PAST CHAMPIONS
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {archives.slice(0, 4).map((t) => (
              <div key={t.id} className="retro-card p-3 flex items-center gap-3">
                <HiMiniTrophy style={{ color: "#ffd700", fontSize: "1.5rem" }} />
                <div>
                  <div
                    style={{
                      fontFamily: '"Press Start 2P", monospace',
                      fontSize: "0.5rem",
                      color: "#ffd700",
                    }}
                  >
                    {t.championName || "Unknown"}
                  </div>
                  <div style={{ fontFamily: '"VT323", monospace', fontSize: "0.8rem", color: "#6b6b55" }}>
                    {new Date(t.startedAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ RESET CONFIRMATION ═══ */}
      <AnimatePresence>
        {showResetConfirm && (
          <motion.div
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100] p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowResetConfirm(false)}
          >
            <motion.div
              className="retro-card p-6 max-w-sm text-center"
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.8 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.55rem", color: "#ef476f" }}>
                RESET TOURNAMENT?
              </h3>
              <p style={{ fontFamily: '"VT323", monospace', fontSize: "1rem", color: "#c4b998", marginTop: "0.5rem" }}>
                This will archive the current tournament and start a fresh one.
              </p>
              <div className="flex gap-3 mt-4 justify-center">
                <button
                  onClick={handleForceReset}
                  className="retro-btn retro-btn-pink text-xs"
                  style={{ fontSize: "0.45rem" }}
                >
                  CONFIRM
                </button>
                <button
                  onClick={() => setShowResetConfirm(false)}
                  className="retro-btn retro-btn-turquoise text-xs"
                  style={{ fontSize: "0.45rem" }}
                >
                  CANCEL
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Bracket Slot Component ─── */

function BracketSlot({ battle }: { battle: Battle }) {
  const tokenA = battle.tokenA;
  const tokenB = battle.tokenB;

  if (!tokenA || !tokenB) {
    return (
      <div className="retro-card p-2 sm:p-3 text-center" style={{ opacity: 0.5, borderColor: "#3a2a15" }}>
        <div className="text-center" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.35rem", color: "#c4b998" }}>
          ???
        </div>
      </div>
    );
  }

  return (
    <div
      className="retro-card p-2 sm:p-3 text-center"
      style={{
        opacity: battle.status === "pending" ? 0.5 : 1,
        borderColor: battle.status === "active" ? "#ffd23f" : battle.status === "completed" ? "#06d6a0" : "#3a2a15",
      }}
    >
      {/* Token A */}
      <div className="flex items-center gap-2 justify-center mb-1">
        <div
          className="w-5 h-5 rounded-full flex items-center justify-center text-[0.5rem] font-bold"
          style={{
            background: battle.status === "completed" && battle.winnerId === tokenA?.tokenId
              ? "linear-gradient(135deg, #ffd700, #ff6b35)"
              : "#2a2a15",
            fontFamily: '"Press Start 2P", monospace',
            color: battle.status === "completed" && battle.winnerId === tokenA?.tokenId ? "#1a1a0a" : "#c4b998",
          }}
        >
          {tokenA?.tokenId ? (battle.status === "completed" && battle.winnerId === tokenA?.tokenId ? "👑" : tokenA.ticker.slice(0, 1)) : "?"}
        </div>
        <span
          style={{
            fontFamily: '"Press Start 2P", monospace',
            fontSize: "0.35rem",
            color: battle.status === "completed" && battle.winnerId === tokenA?.tokenId ? "#ffd700" : "#c4b998",
            textDecoration: battle.status === "completed" && battle.winnerId !== tokenA?.tokenId && battle.winnerId ? "line-through" : "none",
          }}
        >
          {tokenA?.name || "???"}
        </span>
      </div>

      {/* VS divider */}
      <div
        className="text-[0.4rem] my-1"
        style={{ fontFamily: '"Press Start 2P", monospace', color: "#ff6b35" }}
      >
        VS
      </div>

      {/* Token B */}
      <div className="flex items-center gap-2 justify-center">
        <div
          className="w-5 h-5 rounded-full flex items-center justify-center text-[0.5rem] font-bold"
          style={{
            background: battle.status === "completed" && battle.winnerId === tokenB?.tokenId
              ? "linear-gradient(135deg, #ffd700, #ff6b35)"
              : "#2a2a15",
            fontFamily: '"Press Start 2P", monospace',
            color: battle.status === "completed" && battle.winnerId === tokenB?.tokenId ? "#1a1a0a" : "#c4b998",
          }}
        >
          {tokenB?.tokenId ? (battle.status === "completed" && battle.winnerId === tokenB?.tokenId ? "👑" : tokenB.ticker.slice(0, 1)) : "?"}
        </div>
        <span
          style={{
            fontFamily: '"Press Start 2P", monospace',
            fontSize: "0.35rem",
            color: battle.status === "completed" && battle.winnerId === tokenB?.tokenId ? "#ffd700" : "#c4b998",
            textDecoration: battle.status === "completed" && battle.winnerId !== tokenB?.tokenId && battle.winnerId ? "line-through" : "none",
          }}
        >
          {tokenB?.name || "???"}
        </span>
      </div>

      {/* Status badge */}
      {battle.status === "completed" && (
        <div className="mt-1 text-[0.35rem]" style={{ fontFamily: '"VT323", monospace', color: "#06d6a0" }}>
          ✓ COMPLETE ({battle.votesA + battle.votesB} votes)
        </div>
      )}
      {battle.status === "active" && (
        <div className="mt-1 text-[0.35rem]" style={{ fontFamily: '"VT323", monospace', color: "#ffd23f" }}>
          ⚡ LIVE
        </div>
      )}
    </div>
  );
}
