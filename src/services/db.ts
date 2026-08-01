/**
 * ignoshashi Database Service (Client-Side)
 *
 * This module provides typed API fetch wrappers for the server-side SQLite database.
 * The actual database logic lives in /server-db.ts (runs directly in Bun).
 *
 * For server-side code (e.g. TanStack Start server functions), import from the
 * @tanstack/react-start server module and use fetch() to call these same endpoints.
 */

const API_BASE = "/api";

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// ─── Types (mirrors server-db.ts) ──────────────

export interface TokenRow {
  id: string; name: string; ticker: string; description: string;
  supply: number; blockchain: string; image: string; creator: string;
  marketCap: number; price: number; volume24h: number;
  priceHistory: string; createdAt: number; isDemo: number;
  tokenAddress: string | null; videoUrl: string | null; verified: number;
}

export interface TradeRow {
  id: string; tokenId: string; tokenName: string; tokenTicker: string;
  type: string; amount: number; price: number; total: number;
  wallet: string; txHash: string; timestamp: number;
}

export interface CommentRow {
  id: string; tokenId: string; wallet: string; message: string; timestamp: number;
}

export interface EventRow {
  id: string; type: string; message: string; tokenName: string;
  tokenTicker: string; blockchain: string; wallet: string;
  amount: number | null; timestamp: number;
}

export interface BattleRow {
  id: string; name: string; status: string; tokens: string; votes: string;
  createdAt: number; startedAt: number | null; endedAt: number | null;
}

export interface AchievementRow {
  id: string; wallet: string; achievementId: string;
  name: string; description: string; tier: string; earnedAt: number;
}

// ─── API Functions ─────────────────────────────

export async function fetchAllTokens(): Promise<TokenRow[]> {
  return (await apiFetch<TokenRow[]>("/tokens")) || [];
}

export async function fetchTokenById(id: string): Promise<TokenRow | null> {
  return apiFetch<TokenRow>(`/tokens/${encodeURIComponent(id)}`);
}

export async function createToken(token: Partial<TokenRow>): Promise<boolean> {
  const res = await apiFetch("/tokens", { method: "POST", body: JSON.stringify(token) });
  return res !== null;
}

export async function deleteTokenById(id: string, wallet: string): Promise<boolean> {
  const res = await apiFetch(`/tokens/${encodeURIComponent(id)}`, {
    method: "DELETE", body: JSON.stringify({ wallet }),
  });
  return res !== null;
}

export async function fetchTrades(tokenId: string): Promise<TradeRow[]> {
  return (await apiFetch<TradeRow[]>(`/trades/${encodeURIComponent(tokenId)}`)) || [];
}

export async function fetchComments(tokenId: string): Promise<CommentRow[]> {
  return (await apiFetch<CommentRow[]>(`/comments/${encodeURIComponent(tokenId)}`)) || [];
}

export async function fetchBondingCurve(tokenId: string): Promise<unknown | null> {
  return apiFetch(`/bonding-curve/${encodeURIComponent(tokenId)}`);
}

export async function fetchAllBondingCurves(): Promise<unknown[]> {
  return (await apiFetch<unknown[]>("/bonding-curves")) || [];
}

export async function fetchBattles(): Promise<BattleRow[]> {
  return (await apiFetch<BattleRow[]>("/battles")) || [];
}

export async function fetchAchievements(wallet: string): Promise<AchievementRow[]> {
  return (await apiFetch<AchievementRow[]>(`/achievements/${encodeURIComponent(wallet)}`)) || [];
}

export async function fetchEvents(limit = 100): Promise<EventRow[]> {
  return (await apiFetch<EventRow[]>(`/events?limit=${limit}`)) || [];
}

export async function fetchStats(): Promise<{
  tokens: number; trades: number; volume: number;
  feesSol: number; feesEth: number; activeTraders: number; marketCap: number;
} | null> {
  return apiFetch("/stats");
}
