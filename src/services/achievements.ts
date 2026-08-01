// ignoshashi Achievement/Badge System
// Defines achievements, checks conditions, persists to localStorage

import { getTokens, getTrades, getBondingCurveStates } from "./tracker";

// ─── Achievement Definition ──────────────────

export type AchievementTier = "bronze" | "silver" | "gold" | "diamond";

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  tier: AchievementTier;
  condition: (walletAddress: string) => boolean;
}

export interface EarnedAchievement {
  id: string;
  earnedAt: number;
}

// ─── LOCAL STORAGE KEY ────────────────────────

const STORAGE_KEY = "IGNOSHASHI_ACHIEVEMENTS";

function safeRead(): Record<string, EarnedAchievement[]> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function safeWrite(data: Record<string, EarnedAchievement[]>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* quota exceeded */ }
}

// ─── Scanner tracking ─────────────────────────

const SCANNER_KEY = "IGNOSHASHI_SCAN_COUNT";
export function getScanCount(walletAddress: string): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem(SCANNER_KEY);
    const data: Record<string, number> = raw ? JSON.parse(raw) : {};
    return data[walletAddress] || 0;
  } catch { return 0; }
}

export function incrementScanCount(walletAddress: string): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem(SCANNER_KEY);
    const data: Record<string, number> = raw ? JSON.parse(raw) : {};
    data[walletAddress] = (data[walletAddress] || 0) + 1;
    localStorage.setItem(SCANNER_KEY, JSON.stringify(data));
    return data[walletAddress];
  } catch { return 0; }
}

// ─── Hold tracking ────────────────────────────

const HOLD_KEY = "IGNOSHASHI_HOLD_START";
interface HoldRecord {
  tokenId: string;
  startTime: number;
}

export function recordHoldStart(walletAddress: string, tokenId: string): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(HOLD_KEY);
    const data: Record<string, HoldRecord[]> = raw ? JSON.parse(raw) : {};
    const holds = data[walletAddress] || [];
    // Don't re-record if already holding
    if (!holds.find((h) => h.tokenId === tokenId)) {
      holds.push({ tokenId, startTime: Date.now() });
    }
    data[walletAddress] = holds;
    localStorage.setItem(HOLD_KEY, JSON.stringify(data));
  } catch { /* */ }
}

export function recordHoldEnd(walletAddress: string, tokenId: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(HOLD_KEY);
    const data: Record<string, HoldRecord[]> = raw ? JSON.parse(raw) : {};
    const holds = data[walletAddress] || [];
    const record = holds.find((h) => h.tokenId === tokenId);
    if (record) {
      const duration = Date.now() - record.startTime;
      // Remove from tracking
      data[walletAddress] = holds.filter((h) => h.tokenId !== tokenId);
      localStorage.setItem(HOLD_KEY, JSON.stringify(data));
      return duration;
    }
    return null;
  } catch { return null; }
}

export function hasHeldSevenDays(walletAddress: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(HOLD_KEY);
    const data: Record<string, HoldRecord[]> = raw ? JSON.parse(raw) : {};
    const holds = data[walletAddress] || [];
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    return holds.some((h) => Date.now() - h.startTime >= sevenDays);
  } catch { return false; }
}

// ─── Achievement Definitions ──────────────────

export const ACHIEVEMENT_DEFS: AchievementDef[] = [
  {
    id: "first-blood",
    name: "First Blood",
    description: "Create your first token",
    icon: "🩸",
    tier: "bronze",
    condition: (wallet: string) => {
      const tokens = getTokens();
      const userTokens = tokens.filter((t) => t.creator === wallet || t.creator === "You");
      return userTokens.length >= 1;
    },
  },
  {
    id: "five-mints",
    name: "Five Mints",
    description: "Create 5 tokens",
    icon: "🔥",
    tier: "silver",
    condition: (wallet: string) => {
      const tokens = getTokens();
      const userTokens = tokens.filter((t) => t.creator === wallet || t.creator === "You");
      return userTokens.length >= 5;
    },
  },
  {
    id: "token-factory",
    name: "Token Factory",
    description: "Create 20 tokens",
    icon: "🏭",
    tier: "gold",
    condition: (wallet: string) => {
      const tokens = getTokens();
      const userTokens = tokens.filter((t) => t.creator === wallet || t.creator === "You");
      return userTokens.length >= 20;
    },
  },
  {
    id: "graduate",
    name: "Graduate",
    description: "One of your tokens graduated to DEX",
    icon: "🎓",
    tier: "silver",
    condition: (wallet: string) => {
      const tokens = getTokens();
      const curves = getBondingCurveStates();
      const curveMap = new Map(curves.map((c) => [c.tokenId, c]));
      const userTokens = tokens.filter((t) => t.creator === wallet || t.creator === "You");
      return userTokens.some((t) => {
        const curve = curveMap.get(t.id);
        return curve?.graduated === true;
      });
    },
  },
  {
    id: "deans-list",
    name: "Dean's List",
    description: "5 tokens graduated to DEX",
    icon: "🏆",
    tier: "gold",
    condition: (wallet: string) => {
      const tokens = getTokens();
      const curves = getBondingCurveStates();
      const curveMap = new Map(curves.map((c) => [c.tokenId, c]));
      const userTokens = tokens.filter((t) => t.creator === wallet || t.creator === "You");
      const graduated = userTokens.filter((t) => {
        const curve = curveMap.get(t.id);
        return curve?.graduated === true;
      });
      return graduated.length >= 5;
    },
  },
  {
    id: "diamond-hands",
    name: "Diamond Hands",
    description: "Held a token for 7+ days without selling",
    icon: "💎",
    tier: "gold",
    condition: (wallet: string) => {
      return hasHeldSevenDays(wallet);
    },
  },
  {
    id: "whale",
    name: "Whale",
    description: "Single trade over 10 SOL or 5 ETH",
    icon: "🐋",
    tier: "silver",
    condition: (wallet: string) => {
      const trades = getTrades();
      const userTrades = trades.filter((t) => t.wallet === wallet);
      return userTrades.some((t) => t.total >= 10);
    },
  },
  {
    id: "day-trader",
    name: "Day Trader",
    description: "50+ trades total",
    icon: "📈",
    tier: "gold",
    condition: (wallet: string) => {
      const trades = getTrades();
      const userTrades = trades.filter((t) => t.wallet === wallet);
      return userTrades.length >= 50;
    },
  },
  {
    id: "early-bird",
    name: "Early Bird",
    description: "Bought a token within first hour of creation",
    icon: "🐦",
    tier: "bronze",
    condition: (wallet: string) => {
      const trades = getTrades();
      const tokens = getTokens();
      const tokenMap = new Map(tokens.map((t) => [t.id, t]));
      const userTrades = trades.filter((t) => t.wallet === wallet && t.type === "BUY");
      return userTrades.some((trade) => {
        const token = tokenMap.get(trade.tokenId);
        if (!token) return false;
        const hourMs = 60 * 60 * 1000;
        return trade.timestamp - token.createdAt <= hourMs;
      });
    },
  },
  {
    id: "bag-holder",
    name: "Bag Holder",
    description: "Own tokens from 10+ different creators",
    icon: "👜",
    tier: "silver",
    condition: (wallet: string) => {
      const trades = getTrades();
      const tokens = getTokens();
      const tokenMap = new Map(tokens.map((t) => [t.id, t]));
      // Track which creators the user has bought from
      const creators = new Set<string>();
      const userTrades = trades.filter((t) => t.wallet === wallet && t.type === "BUY");
      for (const trade of userTrades) {
        const token = tokenMap.get(trade.tokenId);
        if (token && token.creator && token.creator !== wallet) {
          creators.add(token.creator);
        }
      }
      return creators.size >= 10;
    },
  },
  {
    id: "meme-lord",
    name: "Meme Lord",
    description: "Your token reached top 3 on leaderboard",
    icon: "👑",
    tier: "diamond",
    condition: (wallet: string) => {
      const tokens = getTokens();
      const userTokens = tokens.filter((t) => t.creator === wallet || t.creator === "You");
      // Sort all tokens by market cap
      const sorted = [...tokens].sort((a, b) => b.marketCap - a.marketCap);
      const top3 = sorted.slice(0, 3);
      return userTokens.some((ut) => top3.some((t) => t.id === ut.id));
    },
  },
  {
    id: "sheriff",
    name: "Sheriff",
    description: "Scanned 10+ tokens with Rug Pull Scanner",
    icon: "🔍",
    tier: "bronze",
    condition: (wallet: string) => {
      return getScanCount(wallet) >= 10;
    },
  },
];

// ─── Public API ───────────────────────────────

/** Get all achievement definitions */
export function getAchievementDefs(): AchievementDef[] {
  return ACHIEVEMENT_DEFS;
}

/** Get a single definition by id */
export function getAchievementDef(id: string): AchievementDef | undefined {
  return ACHIEVEMENT_DEFS.find((a) => a.id === id);
}

/** Unlock an achievement for a wallet address. Returns true if newly unlocked. */
export function unlockAchievement(walletAddress: string, achievementId: string): boolean {
  const data = safeRead();
  const earned = data[walletAddress] || [];
  if (earned.find((e) => e.id === achievementId)) {
    return false; // already earned
  }
  earned.push({ id: achievementId, earnedAt: Date.now() });
  data[walletAddress] = earned;
  safeWrite(data);
  return true;
}

/** Get all earned achievement IDs for a wallet */
export function getEarnedAchievementIds(walletAddress: string): string[] {
  const data = safeRead();
  return (data[walletAddress] || []).map((e) => e.id);
}

/** Get all earned achievements with full details */
export function getEarnedAchievements(walletAddress: string): (AchievementDef & { earnedAt: number })[] {
  const data = safeRead();
  const earned = data[walletAddress] || [];
  return earned
    .map((e) => {
      const def = getAchievementDef(e.id);
      return def ? { ...def, earnedAt: e.earnedAt } : null;
    })
    .filter(Boolean) as (AchievementDef & { earnedAt: number })[];
}

/** Get count of earned achievements */
export function getEarnedCount(walletAddress: string): number {
  return getEarnedAchievementIds(walletAddress).length;
}

/** Run all conditions and return newly unlocked achievements */
export function checkAchievements(
  walletAddress: string,
  onNewUnlock?: (achievement: AchievementDef) => void,
): AchievementDef[] {
  const alreadyEarned = getEarnedAchievementIds(walletAddress);
  const newlyUnlocked: AchievementDef[] = [];

  for (const def of ACHIEVEMENT_DEFS) {
    if (alreadyEarned.includes(def.id)) continue;
    try {
      if (def.condition(walletAddress)) {
        const unlocked = unlockAchievement(walletAddress, def.id);
        if (unlocked) {
          newlyUnlocked.push(def);
          if (onNewUnlock) onNewUnlock(def);
        }
      }
    } catch {
      // condition threw - skip
    }
  }

  return newlyUnlocked;
}
