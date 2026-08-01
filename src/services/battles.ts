// ignoshashi Meme Battles Service
// Tournament bracket system with localStorage persistence

import { getTokens, getLeaderboardData, type LeaderboardEntry } from "./tracker";

const KEYS = {
  TOURNAMENT: "IGNOSHASHI_BATTLES_tournament",
  ARCHIVE: "IGNOSHASHI_BATTLES_archive",
  VOTES: "IGNOSHASHI_BATTLE_VOTES",
};

export interface BattleToken {
  tokenId: string;
  name: string;
  ticker: string;
  image: string;
  blockchain: string;
  marketCap: number;
  change24h: number;
  graduationProgress: number;
}

export interface Battle {
  id: string;
  round: number;
  battleIndex: number;
  tokenA: BattleToken;
  tokenB: BattleToken;
  votesA: number;
  votesB: number;
  winnerId: string | null;
  status: "active" | "pending" | "completed";
  startTime: number;
  endTime: number;
  voters: Record<string, "A" | "B">;
}

export interface Tournament {
  id: string;
  startedAt: number;
  endedAt: number | null;
  status: "active" | "completed";
  championId: string | null;
  championName: string | null;
  battles: Battle[];
}

export interface BattleStats {
  totalBattles: number;
  totalVotes: number;
  mostVotedToken: string;
}

const ROUND_DURATION_MS = 10 * 60 * 1000; // 10 minutes per round
const SEED_COUNT = 8;

function safeGet<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const val = localStorage.getItem(key);
    return val ? JSON.parse(val) : fallback;
  } catch {
    return fallback;
  }
}

function safeSet(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota exceeded */
  }
}

function generateId(): string {
  return `battle-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function leaderboardToBattleToken(e: LeaderboardEntry): BattleToken {
  return {
    tokenId: e.tokenId,
    name: e.name,
    ticker: e.ticker,
    image: e.image,
    blockchain: e.blockchain,
    marketCap: e.marketCap,
    change24h: e.change24h,
    graduationProgress: e.graduationProgress,
  };
}

function seedTokens(): BattleToken[] {
  // Use real tokens from the platform, sorted by market cap (top 8)
  const tokens = getTokens().filter((t) => !t.isDemo);
  if (tokens.length === 0) {
    return [];
  }
  // Sort by market cap descending, take top 8
  const sorted = [...tokens].sort((a, b) => b.marketCap - a.marketCap);
  const top8 = sorted.slice(0, SEED_COUNT);
  return top8.map((t) => ({
    tokenId: t.id,
    name: t.name,
    ticker: t.ticker,
    image: t.image,
    blockchain: t.blockchain,
    marketCap: t.marketCap,
    change24h: 0,
    graduationProgress: 0,
  }));
}

/** Check if there are enough real tokens to seed a tournament */
export function getAvailableTokenCount(): number {
  const tokens = getTokens().filter((t) => !t.isDemo);
  return tokens.length;
}

function createBattlesForRound(tokens: BattleToken[], round: number, startTime: number): Battle[] {
  const battles: Battle[] = [];
  const pairCount = tokens.length / 2;
  for (let i = 0; i < pairCount; i++) {
    const endTime = startTime + ROUND_DURATION_MS;
    battles.push({
      id: generateId(),
      round,
      battleIndex: i,
      tokenA: tokens[i * 2],
      tokenB: tokens[i * 2 + 1],
      votesA: 0,
      votesB: 0,
      winnerId: null,
      status: round === 1 ? "active" : "pending",
      startTime,
      endTime,
      voters: {},
    });
  }
  return battles;
}

export function createTournament(): Tournament | null {
  const tokens = seedTokens();
  
  // Need at least 2 tokens for a tournament (for 1 battle)
  if (tokens.length < 2) return null;
  
  // If we don't have 8, we pad to the next power of 2 by duplicating
  // This keeps the bracket structure but means fewer unique tokens
  if (tokens.length < SEED_COUNT) {
    // Only use what we have — the tournament will have fewer battles
  }
  
  // Shuffle tokens
  for (let i = tokens.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tokens[i], tokens[j]] = [tokens[j], tokens[i]];
  }

  const now = Date.now();
  const tournament: Tournament = {
    id: `tourney-${now}`,
    startedAt: now,
    endedAt: null,
    status: "active",
    championId: null,
    championName: null,
    battles: [],
  };

  // Only create battles for the tokens we have
  // For non-power-of-2 token counts, create what we can
  const pairCount = Math.floor(tokens.length / 2);
  const r1Tokens = tokens.slice(0, pairCount * 2);
  const r1 = createBattlesForRound(r1Tokens, 1, now);
  tournament.battles.push(...r1);

  // Round 2 & 3 will be populated when round completes
  // Determine how many rounds based on pair count
  const totalRounds = pairCount > 2 ? 3 : pairCount > 1 ? 2 : 1;
  for (let r = 2; r <= totalRounds; r++) {
    const nextPairCount = Math.floor(pairCount / Math.pow(2, r - 1));
    for (let i = 0; i < nextPairCount; i++) {
      tournament.battles.push({
        id: generateId(),
        round: r,
        battleIndex: i,
        tokenA: { tokenId: "", name: "???", ticker: "???", image: "", blockchain: "solana", marketCap: 0, change24h: 0, graduationProgress: 0 },
        tokenB: { tokenId: "", name: "???", ticker: "???", image: "", blockchain: "solana", marketCap: 0, change24h: 0, graduationProgress: 0 },
        votesA: 0,
        votesB: 0,
        winnerId: null,
        status: "pending",
        startTime: 0,
        endTime: 0,
        voters: {},
      });
    }
  }

  saveTournament(tournament);
  return tournament;
}

export function getTournament(): Tournament | null {
  return safeGet<Tournament | null>(KEYS.TOURNAMENT, null);
}

export function saveTournament(t: Tournament): void {
  safeSet(KEYS.TOURNAMENT, t);
}

export function getArchivedTournaments(): Tournament[] {
  return safeGet<Tournament[]>(KEYS.ARCHIVE, []);
}

export function archiveTournament(t: Tournament): void {
  const archives = getArchivedTournaments();
  archives.unshift({ ...t, status: "completed" as const, endedAt: Date.now() });
  if (archives.length > 50) archives.length = 50;
  safeSet(KEYS.ARCHIVE, archives);
  // Clear active tournament
  try { localStorage.removeItem(KEYS.TOURNAMENT); } catch { /* */ }
  // Clear votes for a fresh start
  try { localStorage.removeItem(KEYS.VOTES); } catch { /* */ }
}

export function getCurrentBattle(): Battle | null {
  const tournament = getTournament();
  if (!tournament) return null;
  const now = Date.now();

  // Find active battle
  let active = tournament.battles.find(
    (b) => b.status === "active" && now < b.endTime
  );
  if (active) return active;

  // Check if any active battles have expired
  const expiredActive = tournament.battles.find(
    (b) => b.status === "active" && now >= b.endTime
  );
  if (expiredActive) {
    resolveBattle(tournament, expiredActive);
    const resolved = getTournament();
    if (resolved) {
      const nextActive = resolved.battles.find(
        (b) => b.status === "active" && now < b.endTime
      );
      return nextActive || null;
    }
  }

  return null;
}

function resolveBattle(tournament: Tournament, battle: Battle): void {
  // Determine winner
  const winner =
    battle.votesA > battle.votesB
      ? "A"
      : battle.votesB > battle.votesA
        ? "B"
        : Math.random() < 0.5
          ? "A"
          : "B";

  battle.winnerId = winner === "A" ? battle.tokenA.tokenId : battle.tokenB.tokenId;
  battle.status = "completed";

  // Advance winner to next round
  const nextRound = battle.round + 1;
  const nextBattleIndex = Math.floor(battle.battleIndex / 2);
  const nextBattle = tournament.battles.find(
    (b) => b.round === nextRound && b.battleIndex === nextBattleIndex
  );

  if (nextBattle) {
    const winningToken = winner === "A" ? battle.tokenA : battle.tokenB;
    if (battle.battleIndex % 2 === 0) {
      nextBattle.tokenA = winningToken;
    } else {
      nextBattle.tokenB = winningToken;
    }

    // If both slots filled, activate next battle
    if (nextBattle.tokenA.tokenId && nextBattle.tokenB.tokenId) {
      const now = Date.now();
      nextBattle.status = "active";
      nextBattle.startTime = now;
      nextBattle.endTime = now + ROUND_DURATION_MS;
    }
  }

  // If finals completed, crown champion
  if (battle.round === 3) {
    const champion = winner === "A" ? battle.tokenA : battle.tokenB;
    tournament.championId = champion.tokenId;
    tournament.championName = champion.name;
    tournament.status = "completed";
    tournament.endedAt = Date.now();

    // Auto-archive after a short delay (will be archived on next access)
    setTimeout(() => {
      const current = getTournament();
      if (current && current.status === "completed") {
        archiveTournament(current);
        // Start a new tournament
        createTournament();
      }
    }, 30000);
  }

  saveTournament(tournament);
}

export function castVote(
  battleId: string,
  tokenId: string,
  walletAddress: string
): { success: boolean; message: string; votesA: number; votesB: number } {
  const tournament = getTournament();
  if (!tournament) return { success: false, message: "No active tournament", votesA: 0, votesB: 0 };

  const battle = tournament.battles.find((b) => b.id === battleId);
  if (!battle) return { success: false, message: "Battle not found", votesA: 0, votesB: 0 };
  if (battle.status !== "active")
    return { success: false, message: "Battle is not active", votesA: 0, votesB: 0 };
  if (Date.now() >= battle.endTime)
    return { success: false, message: "Battle has ended", votesA: 0, votesB: 0 };

  // Check if wallet already voted in this battle
  if (battle.voters[walletAddress]) {
    return {
      success: false,
      message: "Already voted in this battle",
      votesA: battle.votesA,
      votesB: battle.votesB,
    };
  }

  // Record vote
  const side = tokenId === battle.tokenA.tokenId ? "A" : "B";
  battle.voters[walletAddress] = side;
  if (side === "A") battle.votesA++;
  else battle.votesB++;

  // Persist votes to per-user storage
  const allVotes = safeGet<Record<string, string>>(KEYS.VOTES, {});
  allVotes[battleId] = side;
  safeSet(KEYS.VOTES, allVotes);

  saveTournament(tournament);

  return {
    success: true,
    message: `Voted for ${side === "A" ? battle.tokenA.name : battle.tokenB.name}!`,
    votesA: battle.votesA,
    votesB: battle.votesB,
  };
}

export function getUserVoteForBattle(battleId: string): "A" | "B" | null {
  const allVotes = safeGet<Record<string, string>>(KEYS.VOTES, {});
  return (allVotes[battleId] as "A" | "B") || null;
}

export function getBracket(): Tournament | null {
  return getTournament();
}

export function getPastBattles(): Battle[] {
  const tournament = getTournament();
  const completed: Battle[] = [];
  if (tournament) {
    completed.push(...tournament.battles.filter((b) => b.status === "completed"));
  }
  const archives = getArchivedTournaments();
  for (const t of archives) {
    completed.push(...t.battles.filter((b) => b.status === "completed"));
  }
  return completed.sort((a, b) => b.endTime - a.endTime);
}

export function getBattleStats(): BattleStats {
  const past = getPastBattles();
  let totalVotes = 0;
  const tokenVoteCounts: Record<string, { name: string; votes: number }> = {};

  for (const battle of past) {
    totalVotes += battle.votesA + battle.votesB;

    const track = (id: string, name: string, votes: number) => {
      if (!tokenVoteCounts[id]) tokenVoteCounts[id] = { name, votes: 0 };
      tokenVoteCounts[id].votes += votes;
    };
    track(battle.tokenA.tokenId, battle.tokenA.name, battle.votesA);
    track(battle.tokenB.tokenId, battle.tokenB.name, battle.votesB);
  }

  let mostVotedToken = "None";
  let maxVotes = 0;
  for (const [id, data] of Object.entries(tokenVoteCounts)) {
    if (data.votes > maxVotes) {
      maxVotes = data.votes;
      mostVotedToken = data.name;
    }
  }

  return {
    totalBattles: past.length,
    totalVotes,
    mostVotedToken,
  };
}

export function isBattleActive(): boolean {
  const battle = getCurrentBattle();
  return battle !== null && battle.status === "active" && Date.now() < battle.endTime;
}

export function getPreviousChampion(): { name: string; tokenId: string } | null {
  const archives = getArchivedTournaments();
  if (archives.length === 0) return null;
  const lastCompleted = archives[0];
  if (lastCompleted.championId && lastCompleted.championName) {
    return { name: lastCompleted.championName, tokenId: lastCompleted.championId };
  }
  return null;
}

// Initialize a tournament if none exists
export function ensureTournament(): Tournament | null {
  let tournament = getTournament();
  if (!tournament) {
    tournament = createTournament();
  }
  return tournament;
}
