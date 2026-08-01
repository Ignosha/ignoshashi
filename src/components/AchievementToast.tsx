import { motion, AnimatePresence } from "framer-motion";
import { HiMiniXMark } from "react-icons/hi2";
import { useAchievements } from "~/context/AchievementContext";
import type { AchievementTier } from "~/services/achievements";

// ─── Tier Color Map ───────────────────────────

const TIER_COLORS: Record<AchievementTier, { bg: string; border: string; glow: string; text: string }> = {
  bronze: {
    bg: "rgba(205,127,50,0.15)",
    border: "rgba(205,127,50,0.5)",
    glow: "rgba(205,127,50,0.4)",
    text: "#cd7f32",
  },
  silver: {
    bg: "rgba(192,192,192,0.15)",
    border: "rgba(192,192,192,0.5)",
    glow: "rgba(192,192,192,0.35)",
    text: "#c0c0c0",
  },
  gold: {
    bg: "rgba(255,215,0,0.15)",
    border: "rgba(255,215,0,0.55)",
    glow: "rgba(255,215,0,0.45)",
    text: "#ffd700",
  },
  diamond: {
    bg: "rgba(180,230,255,0.15)",
    border: "rgba(180,230,255,0.55)",
    glow: "rgba(180,230,255,0.5)",
    text: "#b4e6ff",
  },
};

// ─── Toast Component ──────────────────────────

function SingleAchievementToast({
  id,
  name,
  icon,
  tier,
  description,
  onDismiss,
}: {
  id: string;
  name: string;
  icon: string;
  tier: AchievementTier;
  description: string;
  onDismiss: () => void;
}) {
  const c = TIER_COLORS[tier];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -40, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.85 }}
      transition={{
        type: "spring",
        stiffness: 400,
        damping: 25,
      }}
      className="relative pointer-events-auto"
      style={{
        background: "rgba(10, 15, 10, 0.97)",
        border: `2px solid ${c.border}`,
        borderRadius: "8px",
        boxShadow: `0 0 25px ${c.glow}, 0 8px 32px rgba(0,0,0,0.6)`,
        backdropFilter: "blur(10px)",
      }}
    >
      {/* CRT scanline overlay */}
      <div
        className="absolute inset-0 pointer-events-none rounded-md overflow-hidden"
        style={{
          background:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)",
        }}
      />

      <div className="flex items-center gap-3 px-4 py-3 relative z-10">
        {/* Icon */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 500, delay: 0.1 }}
          className="text-3xl shrink-0 retro-float"
        >
          {icon}
        </motion.div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p
            className="font-bold mb-0.5"
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: "0.42rem",
              color: "#ffd700",
              textShadow: "0 0 8px rgba(255,215,0,0.5)",
            }}
          >
            ACHIEVEMENT UNLOCKED!
          </p>
          <p
            className="font-bold truncate"
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: "0.45rem",
              color: c.text,
            }}
          >
            {name}
          </p>
          <p
            className="truncate mt-0.5"
            style={{
              fontFamily: '"VT323", monospace',
              fontSize: "0.9rem",
              color: "#b0d0b0",
            }}
          >
            {description}
          </p>
          <span
            className="inline-block mt-1 px-1.5 py-0.5 rounded font-bold"
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: "0.3rem",
              color: c.text,
              background: c.bg,
              border: `1px solid ${c.border}`,
              textTransform: "uppercase",
            }}
          >
            {tier}
          </span>
        </div>

        {/* Close */}
        <button
          onClick={onDismiss}
          className="shrink-0 p-1 rounded transition-colors"
          style={{ color: "#555" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.color = c.text;
            (e.currentTarget as HTMLElement).style.background = c.bg;
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.color = "#555";
            (e.currentTarget as HTMLElement).style.background = "";
          }}
        >
          <HiMiniXMark size={14} />
        </button>
      </div>
    </motion.div>
  );
}

// ─── Toast Container ──────────────────────────

export function AchievementToast() {
  const { toasts, dismissToast } = useAchievements();

  return (
    <div
      className="fixed top-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none"
      style={{ zIndex: 200, maxWidth: "400px", width: "90vw" }}
    >
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <SingleAchievementToast
            key={toast.id}
            id={toast.id}
            name={toast.achievement.name}
            icon={toast.achievement.icon}
            tier={toast.achievement.tier}
            description={toast.achievement.description}
            onDismiss={() => dismissToast(toast.id)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
