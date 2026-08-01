import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useWallet } from "~/context/WalletContext";
import {
  getAchievementDefs,
  getEarnedAchievementIds,
  getEarnedAchievements,
  getEarnedCount,
  type AchievementDef,
  type AchievementTier,
} from "~/services/achievements";

export const Route = createFileRoute("/achievements")({
  component: AchievementsPage,
});

// ─── Tier Config ──────────────────────────────

const TIER_CONFIG: Record<
  AchievementTier,
  { label: string; color: string; bg: string; border: string; glow: string; order: number }
> = {
  diamond: {
    label: "DIAMOND",
    color: "#b4e6ff",
    bg: "rgba(180,230,255,0.1)",
    border: "rgba(180,230,255,0.35)",
    glow: "0 0 15px rgba(180,230,255,0.3)",
    order: 4,
  },
  gold: {
    label: "GOLD",
    color: "#ffd700",
    bg: "rgba(255,215,0,0.08)",
    border: "rgba(255,215,0,0.3)",
    glow: "0 0 15px rgba(255,215,0,0.25)",
    order: 3,
  },
  silver: {
    label: "SILVER",
    color: "#c0c0c0",
    bg: "rgba(192,192,192,0.06)",
    border: "rgba(192,192,192,0.25)",
    glow: "none",
    order: 2,
  },
  bronze: {
    label: "BRONZE",
    color: "#cd7f32",
    bg: "rgba(205,127,50,0.05)",
    border: "rgba(205,127,50,0.2)",
    glow: "none",
    order: 1,
  },
};

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Badge Card ───────────────────────────────

function BadgeCard({
  def,
  earned,
  earnedAt,
  index,
}: {
  def: AchievementDef;
  earned: boolean;
  earnedAt?: number;
  index: number;
}) {
  const c = TIER_CONFIG[def.tier];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: earned ? 1 : 0.5, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.5), duration: 0.3 }}
      whileHover={earned ? { scale: 1.03, y: -4 } : {}}
      className="relative rounded-lg p-4 transition-all duration-200"
      style={{
        background: earned ? c.bg : "rgba(10,15,10,0.3)",
        border: `2px solid ${earned ? c.border : "rgba(255,255,255,0.08)"}`,
        boxShadow: earned ? c.glow : "none",
        opacity: earned ? 1 : 0.45,
      }}
    >
      {/* Icon */}
      <div className="text-center mb-3">
        <motion.span
          className="inline-block text-4xl"
          animate={earned ? { y: [0, -4, 0] } : {}}
          transition={earned ? { duration: 3, repeat: Infinity, ease: "easeInOut" } : {}}
          style={{
            filter: earned ? "grayscale(0)" : "grayscale(100%)",
            opacity: earned ? 1 : 0.3,
          }}
        >
          {earned ? def.icon : "❓"}
        </motion.span>
      </div>

      {/* Name */}
      <p
        className="text-center font-bold mb-1 truncate"
        style={{
          fontFamily: '"Press Start 2P", monospace',
          fontSize: "0.38rem",
          color: earned ? c.color : "#333",
        }}
      >
        {earned ? def.name : "???"}
      </p>

      {/* Description */}
      <p
        className="text-center mb-2"
        style={{
          fontFamily: '"VT323", monospace',
          fontSize: "0.9rem",
          color: earned ? "#b0d0b0" : "#333",
        }}
      >
        {earned ? def.description : "Complete challenges to unlock"}
      </p>

      {/* Tier badge */}
      <div className="text-center">
        <span
          className="inline-block px-2 py-0.5 rounded font-bold"
          style={{
            fontFamily: '"Press Start 2P", monospace',
            fontSize: "0.3rem",
            color: earned ? c.color : "#333",
            background: earned ? "transparent" : "transparent",
            border: `1px solid ${earned ? c.border : "rgba(255,255,255,0.08)"}`,
          }}
        >
          {TIER_CONFIG[def.tier].label}
        </span>
      </div>

      {/* Earned date */}
      {earned && earnedAt && (
        <p
          className="text-center mt-2"
          style={{
            fontFamily: '"VT323", monospace',
            fontSize: "0.75rem",
            color: "#338833",
          }}
        >
          {formatDate(earnedAt)}
        </p>
      )}
    </motion.div>
  );
}

// ─── Main Page ────────────────────────────────

function AchievementsPage() {
  const { connected, solAddress, ethAddress } = useWallet();
  const walletAddress = solAddress || ethAddress || "";
  const [earnedIds, setEarnedIds] = useState<string[]>([]);
  const [earnedList, setEarnedList] = useState<(AchievementDef & { earnedAt: number })[]>([]);

  useEffect(() => {
    if (walletAddress) {
      setEarnedIds(getEarnedAchievementIds(walletAddress));
      setEarnedList(getEarnedAchievements(walletAddress));
    } else {
      setEarnedIds([]);
      setEarnedList([]);
    }
  }, [walletAddress]);

  const defs = getAchievementDefs();
  const earnedMap = new Map(earnedList.map((e) => [e.id, e]));
  const total = defs.length;
  const earnedCount = earnedIds.length;

  // Tier breakdown
  const tierCounts = { bronze: 0, silver: 0, gold: 0, diamond: 0 };
  const tierEarned = { bronze: 0, silver: 0, gold: 0, diamond: 0 };
  for (const def of defs) {
    tierCounts[def.tier]++;
    if (earnedIds.includes(def.id)) tierEarned[def.tier]++;
  }

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
          {/* ─── CREDITS ─── */}
          <div className="absolute top-3 right-4 arcade-credits z-20">
            CREDITS: 99
          </div>

          {/* ─── HEADER ─── */}
          <motion.div
            className="text-center mb-6 relative z-10"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.3 }}
          >
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
              ACHIEVEMENTS
            </h1>
            <div className="flex justify-center gap-4 text-[#00ff41]/30 text-xs mb-1">
              <span>★ ★ ★</span>
            </div>

            <p
              className="arcade-blink mt-3"
              style={{
                fontFamily: '"Press Start 2P", monospace',
                fontSize: "0.55rem",
                color: "#ffd700",
                textShadow: "0 0 10px rgba(255,215,0,0.5)",
              }}
            >
              COMPLETE CHALLENGES, EARN BADGES
            </p>
          </motion.div>

          {/* ─── Top line ─── */}
          <div
            className="mx-auto mb-4"
            style={{
              width: "80%",
              height: "1px",
              background: "linear-gradient(90deg, transparent, rgba(0,255,65,0.3), transparent)",
            }}
          />

          {/* ─── Wallet prompt ─── */}
          {!connected && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-8 relative z-10"
            >
              <p className="text-5xl mb-4">🏆</p>
              <p
                className="mb-3"
                style={{
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: "0.55rem",
                  color: "#ffd700",
                }}
              >
                CONNECT WALLET
              </p>
              <p
                style={{
                  fontFamily: '"VT323", monospace',
                  fontSize: "1.1rem",
                  color: "#338833",
                }}
              >
                Connect your wallet to track and earn achievements
              </p>
            </motion.div>
          )}

          {/* ─── Stats ─── */}
          {connected && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="mb-6 relative z-10"
            >
              {/* Main stat */}
              <div className="text-center mb-4">
                <p
                  className="font-bold"
                  style={{
                    fontFamily: '"Press Start 2P", monospace',
                    fontSize: "1.2rem",
                    color: "#ffd700",
                    textShadow: "0 0 15px rgba(255,215,0,0.4)",
                  }}
                >
                  {earnedCount} / {total}
                </p>
                <p
                  style={{
                    fontFamily: '"Press Start 2P", monospace',
                    fontSize: "0.45rem",
                    color: "#338833",
                    marginTop: "0.25rem",
                  }}
                >
                  BADGES UNLOCKED
                </p>
              </div>

              {/* Tier breakdown */}
              <div className="flex justify-center gap-4 flex-wrap">
                {(["diamond", "gold", "silver", "bronze"] as AchievementTier[]).map(
                  (tier) => {
                    const cfg = TIER_CONFIG[tier];
                    const earned = tierEarned[tier];
                    const total = tierCounts[tier];
                    const pct = total > 0 ? (earned / total) * 100 : 0;

                    return (
                      <div
                        key={tier}
                        className="text-center px-3 py-2 rounded-md"
                        style={{
                          background: cfg.bg,
                          border: `1px solid ${cfg.border}`,
                        }}
                      >
                        <p
                          className="font-bold"
                          style={{
                            fontFamily: '"Press Start 2P", monospace',
                            fontSize: "0.35rem",
                            color: cfg.color,
                          }}
                        >
                          {cfg.label}
                        </p>
                        <p
                          style={{
                            fontFamily: '"Press Start 2P", monospace',
                            fontSize: "0.7rem",
                            color: cfg.color,
                          }}
                        >
                          {earned}/{total}
                        </p>
                        {/* Mini progress bar */}
                        <div
                          className="w-16 h-1.5 rounded-sm mt-1 mx-auto overflow-hidden"
                          style={{
                            background: "rgba(0,0,0,0.3)",
                            border: `1px solid ${cfg.border}`,
                          }}
                        >
                          <div
                            className="h-full transition-all duration-500"
                            style={{
                              width: `${pct}%`,
                              background: cfg.color,
                            }}
                          />
                        </div>
                      </div>
                    );
                  },
                )}
              </div>
            </motion.div>
          )}

          {/* ─── Badges Grid ─── */}
          {connected && (
            <div className="relative z-10">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 px-2">
                {defs.map((def, i) => (
                  <BadgeCard
                    key={def.id}
                    def={def}
                    earned={earnedIds.includes(def.id)}
                    earnedAt={earnedMap.get(def.id)?.earnedAt}
                    index={i}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ─── Bottom line ─── */}
          <div
            className="mx-auto mt-6"
            style={{
              width: "80%",
              height: "1px",
              background: "linear-gradient(90deg, transparent, rgba(0,255,65,0.3), transparent)",
            }}
          />

          {/* ─── Press Start ─── */}
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
