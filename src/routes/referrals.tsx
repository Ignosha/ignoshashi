import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HiMiniLink, HiMiniUserGroup, HiMiniRocketLaunch, HiMiniChartBar, HiMiniCurrencyDollar, HiMiniArrowTrendingUp, HiMiniTrophy } from "react-icons/hi2";
import { useWallet, truncateAddress } from "~/context/WalletContext";
import {
  generateReferralCode,
  getReferralLink,
  getLocalReferralStats,
  fetchReferralStats,
  fetchReferralLeaderboard,
  type ReferralStats,
  type ReferralRecord,
  type ReferralLeaderboardEntry,
} from "~/services/referrals";

export const Route = createFileRoute("/referrals")({
  component: ReferralsPage,
});

// ─── Helpers ────────────────────────────────────

function truncateAddr(addr: string): string {
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 5)}...${addr.slice(-4)}`;
}

function statusBadge(status: string): { label: string; color: string; bg: string } {
  switch (status) {
    case "visited":
      return { label: "VISITED", color: "#8899aa", bg: "rgba(136,153,170,0.1)" };
    case "signed_up":
      return { label: "SIGNED UP", color: "#ffb83c", bg: "rgba(255,184,60,0.1)" };
    case "created_token":
      return { label: "CREATED", color: "#06d6a0", bg: "rgba(6,214,160,0.1)" };
    case "made_trade":
      return { label: "TRADED", color: "#00ff41", bg: "rgba(0,255,65,0.1)" };
    default:
      return { label: status.toUpperCase(), color: "#8899aa", bg: "rgba(136,153,170,0.1)" };
  }
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

// ─── Share Buttons ──────────────────────────────

function ShareButtons({ referralLink, referralCode }: { referralLink: string; referralCode: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(referralLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      // Fallback
      const input = document.createElement("input");
      input.value = referralLink;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [referralLink]);

  const tweetText = `🚀 Create meme coins on ignoshashi! Join with my link: ${referralLink}`;
  const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
  const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent("Join ignoshashi — the ultimate meme coin launchpad! 🚀")}`;

  return (
    <div className="flex flex-wrap gap-2 mt-2">
      <button
        onClick={handleCopy}
        className="retro-btn retro-btn-turquoise text-[0.38rem] px-3 py-1.5 flex items-center gap-1.5"
        style={{ fontFamily: '"Press Start 2P", monospace' }}
      >
        {copied ? "✅" : "🔗"} {copied ? "COPIED!" : "COPY LINK"}
      </button>
      <a
        href={tweetUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="retro-btn text-[0.38rem] px-3 py-1.5 flex items-center gap-1.5"
        style={{
          fontFamily: '"Press Start 2P", monospace',
          background: "rgba(29,161,242,0.15)",
          border: "2px solid rgba(29,161,242,0.4)",
          color: "#1da1f2",
        }}
      >
        🐦 SHARE ON X
      </a>
      <a
        href={telegramUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="retro-btn text-[0.38rem] px-3 py-1.5 flex items-center gap-1.5"
        style={{
          fontFamily: '"Press Start 2P", monospace',
          background: "rgba(0,136,204,0.15)",
          border: "2px solid rgba(0,136,204,0.4)",
          color: "#0088cc",
        }}
      >
        ✈️ TELEGRAM
      </a>
    </div>
  );
}

// ─── Leaderboard Tab ────────────────────────────

function LeaderboardPanel({ entries }: { entries: ReferralLeaderboardEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-5xl mb-3 retro-float">🏆</p>
        <p
          className="text-[#338833]"
          style={{ fontFamily: '"VT323", monospace', fontSize: "1.1rem" }}
        >
          No referrals yet — be the first!
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto custom-scrollbar">
      <table className="w-full min-w-[500px]">
        <thead>
          <tr
            className="border-b"
            style={{ borderColor: "rgba(0,255,65,0.15)" }}
          >
            <th className="text-left py-2 px-2" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.35rem", color: "#338833" }}>RANK</th>
            <th className="text-left py-2 px-2" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.35rem", color: "#338833" }}>REFERRER</th>
            <th className="text-right py-2 px-2" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.35rem", color: "#338833" }}>REFERRALS</th>
            <th className="text-right py-2 px-2" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.35rem", color: "#338833" }}>REWARDS</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, i) => {
            const isTop3 = entry.rank <= 3;
            const rankColor = entry.rank === 1 ? "#ffd700" : entry.rank === 2 ? "#c0c0c0" : entry.rank === 3 ? "#cd7f32" : "#338833";
            return (
              <motion.tr
                key={entry.referrerWallet}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03, duration: 0.15 }}
                className="border-b"
                style={{ borderColor: "rgba(0,255,65,0.05)" }}
              >
                <td className="py-2 px-2">
                  <span
                    style={{
                      fontFamily: '"Press Start 2P", monospace',
                      fontSize: "0.4rem",
                      color: rankColor,
                      textShadow: isTop3 ? `0 0 8px ${rankColor}40` : "none",
                    }}
                  >
                    {entry.rank}{getOrdinalSuffix(entry.rank)}
                  </span>
                  {isTop3 && <span className="ml-1">{entry.rank === 1 ? "👑" : entry.rank === 2 ? "🥈" : "🥉"}</span>}
                </td>
                <td className="py-2 px-2">
                  <span
                    style={{
                      fontFamily: '"VT323", monospace',
                      fontSize: "1rem",
                      color: isTop3 ? "#ffffff" : "#b0d0b0",
                    }}
                  >
                    {truncateAddr(entry.referrerWallet)}
                  </span>
                </td>
                <td className="py-2 px-2 text-right">
                  <span
                    style={{
                      fontFamily: '"VT323", monospace',
                      fontSize: "1.05rem",
                      color: "#00ff41",
                    }}
                  >
                    {entry.referralCount}
                  </span>
                </td>
                <td className="py-2 px-2 text-right">
                  <span
                    style={{
                      fontFamily: '"VT323", monospace',
                      fontSize: "1rem",
                      color: "#ffd700",
                    }}
                  >
                    {entry.totalRewards.toFixed(6)}
                  </span>
                </td>
              </motion.tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Referred Users Table ───────────────────────

function ReferredUsersTable({ referrals }: { referrals: ReferralRecord[] | { referredWallet: string; status: string; rewardAmount: number; rewardChain: string; timestamp: number; }[] }) {
  if (referrals.length === 0) {
    return (
      <div className="text-center py-6">
        <p
          className="text-[#6b6b55]"
          style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
        >
          No referred users yet
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto custom-scrollbar">
      <table className="w-full min-w-[450px]">
        <thead>
          <tr className="border-b" style={{ borderColor: "rgba(0,255,65,0.1)" }}>
            <th className="text-left py-2 px-2" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.32rem", color: "#6b6b55" }}>USER</th>
            <th className="text-center py-2 px-2" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.32rem", color: "#6b6b55" }}>STATUS</th>
            <th className="text-right py-2 px-2" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.32rem", color: "#6b6b55" }}>REWARD</th>
          </tr>
        </thead>
        <tbody>
          {referrals.map((ref, i) => {
            const badge = statusBadge(ref.status);
            return (
              <tr
                key={`${ref.referredWallet}-${i}`}
                className="border-b"
                style={{ borderColor: "rgba(0,255,65,0.04)" }}
              >
                <td className="py-2 px-2">
                  <span style={{ fontFamily: '"VT323", monospace', fontSize: "1rem", color: "#b0d0b0" }}>
                    {truncateAddr(ref.referredWallet)}
                  </span>
                </td>
                <td className="py-2 px-2 text-center">
                  <span
                    className="inline-block px-2 py-0.5 rounded font-bold"
                    style={{
                      fontFamily: '"Press Start 2P", monospace',
                      fontSize: "0.3rem",
                      color: badge.color,
                      background: badge.bg,
                      border: `1px solid ${badge.color}30`,
                    }}
                  >
                    {badge.label}
                  </span>
                </td>
                <td className="py-2 px-2 text-right">
                  <span style={{ fontFamily: '"VT323", monospace', fontSize: "1rem", color: ref.rewardAmount > 0 ? "#ffd700" : "#6b6b55" }}>
                    {ref.rewardAmount > 0 ? `${ref.rewardAmount.toFixed(6)} ${ref.rewardChain?.toUpperCase() || ""}` : "—"}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────

function ReferralsPage() {
  const { connected, solAddress, ethAddress } = useWallet();
  const walletAddr = solAddress || ethAddress || "";

  const [tab, setTab] = useState<"dashboard" | "leaderboard">("dashboard");
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [leaderboard, setLeaderboard] = useState<ReferralLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const referralCode = walletAddr ? generateReferralCode(walletAddr) : "";
  const referralLink = walletAddr ? getReferralLink(walletAddr) : "";

  // Fetch stats
  useEffect(() => {
    if (!walletAddr) {
      setStats(null);
      return;
    }

    // Show local immediately
    setStats(getLocalReferralStats(walletAddr));

    // Fetch from server
    setLoading(true);
    fetchReferralStats(walletAddr).then((data) => {
      if (data) setStats(data);
      setLoading(false);
    });
  }, [walletAddr]);

  // Fetch leaderboard
  useEffect(() => {
    fetchReferralLeaderboard().then(setLeaderboard);
  }, []);

  // Refresh leaderboard periodically
  useEffect(() => {
    const interval = setInterval(() => {
      fetchReferralLeaderboard().then(setLeaderboard);
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-dvh py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="text-center mb-8"
        >
          <p className="text-4xl mb-2 retro-float">🔗</p>
          <h1
            className="text-[#00ff41] font-bold pixel-shadow-sm mb-2"
            style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "clamp(0.8rem, 2.5vw, 1.2rem)" }}
          >
            REFERRAL PROGRAM
          </h1>
          <p
            className="text-[#b0d0b0]"
            style={{ fontFamily: '"VT323", monospace', fontSize: "1.15rem" }}
          >
            Share ignoshashi with friends and earn rewards!
          </p>
        </motion.div>

        {/* Wallet not connected */}
        {!connected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="retro-card p-6 text-center"
          >
            <p className="text-3xl mb-3">🔒</p>
            <p
              className="text-[#ffb83c] font-bold mb-2"
              style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem" }}
            >
              CONNECT WALLET
            </p>
            <p
              className="text-[#b0d0b0]"
              style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
            >
              Connect your wallet to get your referral link and track your referrals.
            </p>
          </motion.div>
        )}

        {/* Connected Content */}
        {connected && (
          <>
            {/* Referral Link Card */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="retro-card p-5 mb-6"
              style={{
                border: "3px solid rgba(0,255,65,0.25)",
                boxShadow: "0 0 20px rgba(0,255,65,0.08)",
              }}
            >
              <div className="flex items-center gap-2 mb-3">
                <HiMiniLink className="text-[#00ff41]" size={20} />
                <span
                  className="text-[#00ff41] font-bold"
                  style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem" }}
                >
                  YOUR REFERRAL LINK
                </span>
              </div>

              <div
                className="flex items-center gap-2 p-3 rounded-md mb-3 break-all"
                style={{
                  background: "rgba(0,255,65,0.05)",
                  border: "1px solid rgba(0,255,65,0.15)",
                }}
              >
                <span
                  className="flex-1"
                  style={{
                    fontFamily: '"VT323", monospace',
                    fontSize: "1rem",
                    color: "#e0ffe0",
                  }}
                >
                  {referralLink}
                </span>
              </div>

              <div
                className="mb-3"
                style={{ fontFamily: '"VT323", monospace', fontSize: "0.95rem", color: "#b0d0b0" }}
              >
                Your code: <span style={{ color: "#00ff41", fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem" }}>{referralCode}</span>
              </div>

              <ShareButtons referralLink={referralLink} referralCode={referralCode} />
            </motion.div>

            {/* Tabs: Dashboard / Leaderboard */}
            <div className="flex gap-2 mb-6">
              <button
                onClick={() => setTab("dashboard")}
                className={`retro-tab ${tab === "dashboard" ? "retro-tab-active" : ""}`}
                style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.4rem" }}
              >
                📊 DASHBOARD
              </button>
              <button
                onClick={() => setTab("leaderboard")}
                className={`retro-tab ${tab === "leaderboard" ? "retro-tab-active" : ""}`}
                style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.4rem" }}
              >
                🏆 LEADERBOARD
              </button>
            </div>

            <AnimatePresence mode="wait">
              {tab === "dashboard" && (
                <motion.div
                  key="dashboard"
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  {/* Stats Cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                    <StatCard
                      icon={<HiMiniUserGroup size={18} />}
                      label="TOTAL REFERRED"
                      value={stats?.totalReferrals ?? 0}
                      color="#00ff41"
                      delay={0}
                    />
                    <StatCard
                      icon={<HiMiniRocketLaunch size={18} />}
                      label="TOKENS CREATED"
                      value={stats?.tokensCreated ?? 0}
                      color="#06d6a0"
                      delay={0.05}
                    />
                    <StatCard
                      icon={<HiMiniArrowTrendingUp size={18} />}
                      label="TRADES MADE"
                      value={stats?.tradesMade ?? 0}
                      color="#ffb83c"
                      delay={0.1}
                    />
                    <StatCard
                      icon={<HiMiniCurrencyDollar size={18} />}
                      label="TOTAL REWARDS"
                      value={stats?.totalRewards ?? 0}
                      color="#ffd700"
                      delay={0.15}
                      isReward
                    />
                  </div>

                  {/* Reward Tiers */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="retro-card p-4 mb-6"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <HiMiniTrophy className="text-[#ffd700]" size={16} />
                      <span style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.45rem", color: "#ffd700" }}>
                        REWARD TIERS
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="p-3 rounded-md" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <span style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.38rem", color: "#8899aa" }}>TIER 1</span>
                        <p style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem", color: "#b0d0b0", marginTop: "0.25rem" }}>
                          Referral visits — tracked
                        </p>
                      </div>
                      <div className="p-3 rounded-md" style={{ background: "rgba(6,214,160,0.05)", border: "1px solid rgba(6,214,160,0.15)" }}>
                        <span style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.38rem", color: "#06d6a0" }}>TIER 2</span>
                        <p style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem", color: "#06d6a0", marginTop: "0.25rem" }}>
                          Token created → 10% of creation fee
                        </p>
                      </div>
                      <div className="p-3 rounded-md" style={{ background: "rgba(0,255,65,0.05)", border: "1px solid rgba(0,255,65,0.15)" }}>
                        <span style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.38rem", color: "#00ff41" }}>TIER 3</span>
                        <p style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem", color: "#00ff41", marginTop: "0.25rem" }}>
                          Bonding trade → 5% of platform fee
                        </p>
                      </div>
                    </div>
                  </motion.div>

                  {/* Referred Users Table */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.25 }}
                    className="retro-card p-4"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <HiMiniChartBar className="text-[#00ff41]" size={16} />
                      <span style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.45rem", color: "#00ff41" }}>
                        REFERRED USERS
                      </span>
                    </div>
                    {loading && !stats ? (
                      <p style={{ fontFamily: '"VT323", monospace', fontSize: "1rem", color: "#6b6b55" }}>Loading...</p>
                    ) : (
                      <ReferredUsersTable referrals={stats?.referrals || []} />
                    )}
                  </motion.div>
                </motion.div>
              )}

              {tab === "leaderboard" && (
                <motion.div
                  key="leaderboard"
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="retro-card p-4"
                  style={{
                    border: "3px solid rgba(255,215,0,0.15)",
                    boxShadow: "0 0 20px rgba(255,215,0,0.06)",
                  }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <HiMiniTrophy className="text-[#ffd700]" size={18} />
                    <span style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.45rem", color: "#ffd700" }}>
                      TOP REFERRERS
                    </span>
                  </div>
                  <LeaderboardPanel entries={leaderboard} />
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Stat Card ──────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  color,
  delay,
  isReward,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
  delay: number;
  isReward?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, duration: 0.2, ease: [0.68, -0.55, 0.265, 1.55] }}
      className="retro-card p-3 text-center"
    >
      <div className="flex justify-center mb-1" style={{ color }}>
        {icon}
      </div>
      <div
        className="font-bold mb-0.5"
        style={{
          fontFamily: '"Press Start 2P", monospace',
          fontSize: "0.3rem",
          color,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: '"VT323", monospace',
          fontSize: "1.3rem",
          color: "#ffffff",
          fontWeight: "bold",
        }}
      >
        {isReward ? value.toFixed(4) : value.toLocaleString()}
      </div>
    </motion.div>
  );
}
