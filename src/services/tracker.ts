// ignoshashi Platform Tracker
// Server-backed persistence via SQLite API with localStorage cache for instant reads.
// Data lives on the server — shared across all devices/browsers.

import type { BondingCurveState } from "./bondingCurve";

export const DATA_VERSION = "v4";
const VERSION_KEY = "ignoshashi_data_version";

// ─── API Helpers ───────────────────────────────

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

async function apiPost<T>(path: string, body: unknown): Promise<T | null> {
  return apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) });
}

let syncTimer: ReturnType<typeof setInterval> | null = null;

/** Call once on app init. Syncs with server and sets up periodic refresh. */
export function initTracker(): void {
  if (typeof window === "undefined") return;

  // Check for forced reset via URL param
  const url = new URL(window.location.href);
  if (url.searchParams.get("reset") === "true") {
    clearAllTrackerData();
    localStorage.setItem(VERSION_KEY, DATA_VERSION);
    url.searchParams.delete("reset");
    window.history.replaceState({}, "", url.toString());
    syncFromServer();
    return;
  }

  const stored = localStorage.getItem(VERSION_KEY);
  if (stored !== DATA_VERSION) {
    clearAllTrackerData();
    localStorage.setItem(VERSION_KEY, DATA_VERSION);
  }

  // Initial sync from server
  syncFromServer();

  // Periodic sync every 30 seconds
  if (!syncTimer) {
    syncTimer = setInterval(syncFromServer, 30_000);
  }

  // Listen for cross-tab broadcasts (for launch alerts, etc.)
  try {
    const bc = new BroadcastChannel("ignoshashi");
    bc.onmessage = (event) => {
      if (event.data?.type === "data-changed") {
        syncFromServer();
      }
    };
  } catch { /* BroadcastChannel not supported */ }
}

function clearAllTrackerData(): void {
  const keys = Object.values(KEYS);
  for (const key of keys) {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  }
}

/** Fetch all data from server and update localStorage cache */
async function syncFromServer(): Promise<void> {
  try {
    // Fetch tokens
    const tokens = await apiFetch<TokenRow[]>(`/tokens`);
    if (tokens) {
      // Convert server rows to client TokenData
      const clientTokens: TokenData[] = tokens.map(rowToTokenData);
      safeSet(KEYS.TOKENS, clientTokens);
    }

    // Fetch bonding curves
    const curves = await apiFetch<BondingCurveState[]>(`/bonding-curves`);
    if (curves) {
      safeSet(KEYS.BONDING_CURVES, curves);
    }

    // Fetch events
    const events = await apiFetch<PlatformEvent[]>(`/events?limit=200`);
    if (events) {
      safeSet(KEYS.EVENTS, events);
    }

    // Fetch fees
    const fees = await apiFetch<FeeData>(`/fees`);
    if (fees) {
      safeSet(KEYS.FEES, fees);
    }
  } catch {
    // Server unavailable — continue with localStorage data
  }
}

/** Broadcast data change to other tabs */
function broadcastChange(): void {
  try {
    const bc = new BroadcastChannel("ignoshashi");
    bc.postMessage({ type: "data-changed" });
    bc.close();
  } catch { /* ignore */ }
}

// ─── Row Conversion ────────────────────────────

interface TokenRow {
  id: string; name: string; ticker: string; description: string;
  supply: number; blockchain: string; image: string; creator: string;
  marketCap: number; price: number; volume24h: number;
  priceHistory: string; createdAt: number; isDemo: number;
  tokenAddress: string | null; videoUrl: string | null; verified: number;
}

function rowToTokenData(row: TokenRow): TokenData {
  return {
    id: row.id,
    name: row.name,
    ticker: row.ticker,
    description: row.description || "",
    supply: row.supply,
    blockchain: row.blockchain as "solana" | "ethereum",
    image: row.image || "",
    creator: row.creator || "",
    marketCap: row.marketCap || 0,
    price: row.price || 0,
    volume24h: row.volume24h || 0,
    priceHistory: safeJsonParse<number[]>(row.priceHistory, []),
    createdAt: row.createdAt || 0,
    isDemo: row.isDemo === 1,
    tokenAddress: row.tokenAddress || undefined,
    videoUrl: row.videoUrl || undefined,
    verified: row.verified === 1,
  };
}

function safeJsonParse<T>(str: string, fallback: T): T {
  try { return JSON.parse(str); } catch { return fallback; }
}

// ─── Types ─────────────────────────────────────

export interface TokenData {
  id: string;
  name: string;
  ticker: string;
  description: string;
  supply: number;
  blockchain: "solana" | "ethereum";
  image: string;
  creator: string;
  marketCap: number;
  price: number;
  volume24h: number;
  priceHistory: number[];
  createdAt: number;
  isDemo?: boolean;
  tokenAddress?: string;
  videoUrl?: string;
  verified?: boolean;
}

export function isTokenVerified(token: TokenData): boolean {
  if (token.verified !== undefined) return token.verified;
  const bc = getBondingCurveState(token.id);
  if (bc?.graduated) return true;
  const allTokens = getTokens();
  const creatorTokens = allTokens.filter((t) => t.creator === token.creator);
  if (creatorTokens.length >= 3) return true;
  try {
    const cacheKey = `ignoshashi_dex_verified_${token.id}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached === "true") return true;
  } catch { /* ignore */ }
  return false;
}

export function setTokenDexVerified(tokenId: string): void {
  try { localStorage.setItem(`ignoshashi_dex_verified_${tokenId}`, "true"); } catch {}
}

export interface TradeData {
  id: string;
  tokenId: string;
  tokenName: string;
  tokenTicker: string;
  type: "BUY" | "SELL";
  amount: number;
  price: number;
  total: number;
  wallet: string;
  txHash: string;
  timestamp: number;
}

export interface PlatformEvent {
  id: string;
  type: "launch" | "buy" | "sell" | "fee" | "comment";
  message: string;
  tokenName: string;
  tokenTicker: string;
  blockchain: string;
  wallet: string;
  amount?: number;
  timestamp: number;
}

export interface CommentData {
  id: string;
  tokenId: string;
  wallet: string;
  message: string;
  timestamp: number;
}

export interface FeeData {
  sol: number;
  eth: number;
}

const KEYS = {
  TOKENS: "ignoshashi_tokens",
  TRADES: "ignoshashi_trades",
  VOLUME: "ignoshashi_total_volume",
  TRADE_COUNT: "ignoshashi_total_trades",
  FEES: "ignoshashi_fees",
  EVENTS: "ignoshashi_events",
  SOL_VOL: "ignoshashi_sol_volume",
  ETH_VOL: "ignoshashi_eth_volume",
  COMMENTS: "ignoshashi_comments",
  BONDING_CURVES: "ignoshashi_bonding_curves",
};

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
  } catch { /* quota exceeded */ }
}

// ─── Tokens ─────────────────────────────────

export function getTokens(): TokenData[] {
  return safeGet<TokenData[]>(KEYS.TOKENS, []);
}

export function getTokenById(id: string): TokenData | undefined {
  return getTokens().find((t) => t.id === id);
}

export function addToken(token: TokenData): void {
  const tokens = getTokens();
  tokens.unshift(token);
  safeSet(KEYS.TOKENS, tokens);

  // Sync to server asynchronously
  apiPost("/tokens", {
    id: token.id, name: token.name, ticker: token.ticker,
    description: token.description || "", supply: token.supply,
    blockchain: token.blockchain, image: token.image || "",
    creator: token.creator, marketCap: token.marketCap, price: token.price,
    volume24h: token.volume24h, priceHistory: JSON.stringify(token.priceHistory || []),
    createdAt: token.createdAt, isDemo: token.isDemo || false,
    tokenAddress: token.tokenAddress || null, videoUrl: token.videoUrl || null,
    verified: token.verified || false,
  }).catch(() => {});

  // Add launch event
  addEvent({
    type: "launch",
    message: `🚀 ${token.name} launched on ${token.blockchain === "solana" ? "Solana" : "Ethereum"} by ${token.creator}`,
    tokenName: token.name,
    tokenTicker: token.ticker,
    blockchain: token.blockchain,
    wallet: token.creator,
    timestamp: Date.now(),
  });

  // Dispatch launch alert for toast notification
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("ignoshashi:new-launch", {
        detail: { id: token.id, tokenId: token.id, name: token.name, ticker: token.ticker, blockchain: token.blockchain, timestamp: Date.now() },
      })
    );

    // Trigger Web Push notification for new launch (for followers of this creator)
    triggerPushForLaunch(token);
  }

  broadcastChange();
}

export function updateTokenPrice(tokenId: string, newPrice: number): void {
  const tokens = getTokens();
  const idx = tokens.findIndex((t) => t.id === tokenId);
  if (idx === -1) return;
  tokens[idx].price = newPrice;
  tokens[idx].priceHistory.push(newPrice);
  tokens[idx].marketCap = newPrice * tokens[idx].supply;
  safeSet(KEYS.TOKENS, tokens);

  // Sync to server
  apiFetch(`/tokens/${encodeURIComponent(tokenId)}/price`, {
    method: "PATCH",
    body: JSON.stringify({ price: newPrice }),
  }).catch(() => {});
}

// ─── Trades ─────────────────────────────────

/** Returns true if a trade has a pending payout (no on-chain tx yet) */
export function isPendingTrade(txHash: string): boolean {
  return !txHash || txHash.startsWith("pending-");
}

export function getTrades(): TradeData[] {
  // Filter out pending payouts — we only show real transactions
  return safeGet<TradeData[]>(KEYS.TRADES, []).filter((t) => !isPendingTrade(t.txHash));
}

export function getTradesForToken(tokenId: string): TradeData[] {
  return getTrades().filter((t) => t.tokenId === tokenId);
}

/** Search tokens by name, ticker, or address from the server API */
export async function searchTokens(query: string): Promise<TokenData[]> {
  if (!query.trim()) return [];
  try {
    const res = await fetch(`/api/tokens/search?q=${encodeURIComponent(query.trim())}`);
    if (!res.ok) return [];
    const rows = await res.json();
    if (!Array.isArray(rows)) return [];
    return rows.map(rowToTokenData);
  } catch {
    return [];
  }
}

/** Fetch ALL trades from the server (across all tokens) */
export async function fetchAllTradesFromServer(limit = 100): Promise<TradeData[]> {
  try {
    const res = await fetch(`/api/trades?limit=${limit}`);
    if (!res.ok) return [];
    const data = await res.json();
    const trades = data?.trades || (Array.isArray(data) ? data : []);
    if (!Array.isArray(trades)) return [];
    return trades
      .map((row: any) => ({
        id: row.id,
        tokenId: row.tokenId,
        tokenName: row.tokenName || "",
        tokenTicker: row.tokenTicker || "",
        type: row.type as "BUY" | "SELL",
        amount: row.amount || 0,
        price: row.price || 0,
        total: row.total || 0,
        wallet: row.wallet || "",
        txHash: row.txHash || "",
        timestamp: row.timestamp || 0,
      }))
      .filter((t) => !isSimulatedTrade(t.txHash));
  } catch {
    return [];
  }
}

/** Fetch real trades from the server API for a given token */
export async function fetchTradesFromServer(tokenId: string): Promise<TradeData[]> {
  try {
    const res = await fetch(`/api/trades/${encodeURIComponent(tokenId)}`);
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    // Map server row format to TradeData
    return data
      .map((row: any) => ({
        id: row.id,
        tokenId: row.tokenId,
        tokenName: row.tokenName || "",
        tokenTicker: row.tokenTicker || "",
        type: row.type as "BUY" | "SELL",
        amount: row.amount || 0,
        price: row.price || 0,
        total: row.total || 0,
        wallet: row.wallet || "",
        txHash: row.txHash || "",
        timestamp: row.timestamp || 0,
      }))
      .filter((t) => !isSimulatedTrade(t.txHash));
  } catch {
    return [];
  }
}

export function addTrade(trade: TradeData): void {
  const trades = getTrades();
  trades.unshift(trade);
  if (trades.length > 500) trades.length = 500;
  safeSet(KEYS.TRADES, trades);

  // Sync to server
  apiPost("/trades", trade).catch(() => {});

  // Update volume
  const vol = safeGet<number>(KEYS.VOLUME, 0);
  const count = safeGet<number>(KEYS.TRADE_COUNT, 0);
  safeSet(KEYS.VOLUME, vol + trade.total);
  safeSet(KEYS.TRADE_COUNT, count + 1);

  // Update chain-specific volume
  const tokens = getTokens();
  const token = tokens.find((t) => t.id === trade.tokenId);
  if (token) {
    if (token.blockchain === "solana") {
      const solVol = safeGet<number>(KEYS.SOL_VOL, 0);
      safeSet(KEYS.SOL_VOL, solVol + trade.total);
    } else {
      const ethVol = safeGet<number>(KEYS.ETH_VOL, 0);
      safeSet(KEYS.ETH_VOL, ethVol + trade.total);
    }
  }

  // Add event for feed
  const emoji = trade.type === "BUY" ? "💰" : "📉";
  const action = trade.type === "BUY" ? "bought" : "sold";
  addEvent({
    type: trade.type.toLowerCase() as "buy" | "sell",
    message: `${emoji} ${trade.wallet} ${action} ${trade.amount.toLocaleString()} ${trade.tokenTicker} for $${trade.total.toFixed(4)}`,
    tokenName: trade.tokenName,
    tokenTicker: trade.tokenTicker,
    blockchain: token?.blockchain || "solana",
    wallet: trade.wallet,
    amount: trade.total,
    timestamp: trade.timestamp,
  });

  broadcastChange();
}

// ─── Comments ───────────────────────────────

export function getComments(tokenId?: string): CommentData[] {
  const all = safeGet<CommentData[]>(KEYS.COMMENTS, []);
  if (tokenId) return all.filter((c) => c.tokenId === tokenId);
  return all;
}

export function addComment(comment: Omit<CommentData, "id">): void {
  const comments = safeGet<CommentData[]>(KEYS.COMMENTS, []);
  const newComment: CommentData = {
    ...comment,
    id: `comment-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  };
  comments.unshift(newComment);
  if (comments.length > 500) comments.length = 500;
  safeSet(KEYS.COMMENTS, comments);

  // Sync to server
  apiPost("/comments", newComment).catch(() => {});

  // Also add as an event for the feed
  addEvent({
    type: "comment",
    message: `💬 ${comment.wallet} commented on a token: "${comment.message.slice(0, 60)}${comment.message.length > 60 ? "..." : ""}"`,
    tokenName: "",
    tokenTicker: "",
    blockchain: "",
    wallet: comment.wallet,
    timestamp: comment.timestamp,
  });

  broadcastChange();
}

// ─── Fees ───────────────────────────────────

export function getFeesCollected(): FeeData {
  return safeGet<FeeData>(KEYS.FEES, { sol: 0, eth: 0 });
}

export function recordFeeCollection(chain: "solana" | "ethereum", amount: number): void {
  const fees = getFeesCollected();
  fees[chain] += amount;
  safeSet(KEYS.FEES, fees);

  // Sync to server
  apiPost("/fees", { chain, amount }).catch(() => {});

  addEvent({
    type: "fee",
    message: `💎 Fee collected: ${amount} ${chain === "solana" ? "SOL" : "ETH"}`,
    tokenName: "ignoshashi",
    tokenTicker: chain.toUpperCase(),
    blockchain: chain,
    wallet: "ignoshashi",
    amount,
    timestamp: Date.now(),
  });
}

// ─── Events (Feed) ──────────────────────────

export function getEvents(limit = 100): PlatformEvent[] {
  const events = safeGet<PlatformEvent[]>(KEYS.EVENTS, []);
  return events.slice(0, limit);
}

function addEvent(event: Omit<PlatformEvent, "id">): void {
  const events = safeGet<PlatformEvent[]>(KEYS.EVENTS, []);
  const newEvent: PlatformEvent = {
    ...event,
    id: `event-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  };
  events.unshift(newEvent);
  if (events.length > 500) events.length = 500;
  safeSet(KEYS.EVENTS, events);

  // Sync to server
  apiPost("/events", newEvent).catch(() => {});
}

// ─── Platform stats ─────────────────────────

export function getTotalVolume(): number {
  return safeGet<number>(KEYS.VOLUME, 0);
}

export function getTotalTrades(): number {
  return safeGet<number>(KEYS.TRADE_COUNT, 0);
}

export function getTotalTokens(): number {
  return getTokens().filter((t) => !t.isDemo).length;
}

export function getActiveTraders(): number {
  const trades = getTrades();
  const wallets = new Set(trades.map((t) => t.wallet));
  return wallets.size;
}

export function getSolVolume(): number {
  return safeGet<number>(KEYS.SOL_VOL, 0);
}

export function getEthVolume(): number {
  return safeGet<number>(KEYS.ETH_VOL, 0);
}

export function getTotalMarketCap(): number {
  return getTokens().reduce((s, t) => s + t.marketCap, 0);
}

export function getCoinsLaunched(): number {
  return getTotalTokens();
}

// ─── Bonding Curve State ────────────────────

export function getBondingCurveStates(): BondingCurveState[] {
  return safeGet<BondingCurveState[]>(KEYS.BONDING_CURVES, []);
}

export function getBondingCurveState(tokenId: string): BondingCurveState | undefined {
  return getBondingCurveStates().find((bc) => bc.tokenId === tokenId);
}

export function saveBondingCurveState(state: BondingCurveState): void {
  const curves = getBondingCurveStates();
  const idx = curves.findIndex((bc) => bc.tokenId === state.tokenId);
  if (idx >= 0) {
    curves[idx] = state;
  } else {
    curves.push(state);
  }
  safeSet(KEYS.BONDING_CURVES, curves);

  // Sync to server
  apiPost(`/bonding-curve/${encodeURIComponent(state.tokenId)}`, state).catch(() => {});
  broadcastChange();
}

export function removeBondingCurveState(tokenId: string): void {
  const curves = getBondingCurveStates().filter((bc) => bc.tokenId !== tokenId);
  safeSet(KEYS.BONDING_CURVES, curves);
}

// ─── Delete Token ────────────────────────────

export function deleteToken(tokenId: string, walletAddress: string): boolean {
  const tokens = getTokens();
  const token = tokens.find((t) => t.id === tokenId);
  if (!token) return false;
  if (token.creator !== walletAddress) return false;

  const filtered = tokens.filter((t) => t.id !== tokenId);
  safeSet(KEYS.TOKENS, filtered);
  removeBondingCurveState(tokenId);

  const comments = safeGet<CommentData[]>(KEYS.COMMENTS, []);
  const filteredComments = comments.filter((c) => c.tokenId !== tokenId);
  safeSet(KEYS.COMMENTS, filteredComments);

  const trades = safeGet<TradeData[]>(KEYS.TRADES, []);
  const filteredTrades = trades.filter((t) => t.tokenId !== tokenId);
  safeSet(KEYS.TRADES, filteredTrades);

  const events = safeGet<PlatformEvent[]>(KEYS.EVENTS, []);
  const filteredEvents = events.filter((e) => {
    if (e.tokenName === token.name && e.tokenTicker === token.ticker) return false;
    return true;
  });
  safeSet(KEYS.EVENTS, filteredEvents);

  // Sync to server
  apiFetch(`/tokens/${encodeURIComponent(tokenId)}`, {
    method: "DELETE",
    body: JSON.stringify({ wallet: walletAddress }),
  }).catch(() => {});

  broadcastChange();
  return true;
}

// ─── Leaderboard helpers ────────────────────

export type LeaderboardTab = "marketcap" | "volume" | "newest" | "graduating";

export interface LeaderboardEntry {
  tokenId: string;
  name: string;
  ticker: string;
  image: string;
  blockchain: "solana" | "ethereum";
  price: number;
  marketCap: number;
  volume24h: number;
  change24h: number;
  status: "bonding" | "graduated";
  graduationProgress: number;
  createdAt: number;
}

export function getLeaderboardData(
  sortBy: LeaderboardTab = "marketcap",
  chainFilter: "all" | "solana" | "ethereum" = "all",
): LeaderboardEntry[] {
  const tokens = getTokens();
  const curves = getBondingCurveStates();
  const curveMap = new Map(curves.map((c) => [c.tokenId, c]));

  let entries: LeaderboardEntry[] = tokens.map((t) => {
    const curve = curveMap.get(t.id);
    const hist = t.priceHistory;
    const lastP = hist[hist.length - 1] || t.price;
    const prev24h = hist[Math.max(0, hist.length - 2)] || lastP;
    const change24h = prev24h > 0 ? ((lastP - prev24h) / prev24h) * 100 : 0;

    const graduationProgress = curve
      ? Math.min((curve.currentSupply / curve.totalSupply) * 100, 100)
      : 0;
    const status = curve?.graduated
      ? ("graduated" as const)
      : ("bonding" as const);

    return {
      tokenId: t.id,
      name: t.name,
      ticker: t.ticker,
      image: t.image,
      blockchain: t.blockchain,
      price: lastP,
      marketCap: t.marketCap,
      volume24h: t.volume24h,
      change24h,
      status: curve ? status : "bonding",
      graduationProgress: curve ? graduationProgress : 0,
      createdAt: t.createdAt,
    };
  });

  if (chainFilter !== "all") {
    entries = entries.filter((e) => e.blockchain === chainFilter);
  }

  switch (sortBy) {
    case "marketcap":
      entries.sort((a, b) => b.marketCap - a.marketCap);
      break;
    case "volume":
      entries.sort((a, b) => b.volume24h - a.volume24h);
      break;
    case "newest":
      entries.sort((a, b) => b.createdAt - a.createdAt);
      break;
    case "graduating":
      entries.sort((a, b) => b.graduationProgress - a.graduationProgress);
      break;
  }

  return entries;
}

// ─── No simulation — platform starts empty ───

export function startTradeSimulation(): void {
  // No-op: Platform starts empty, no mock trades
}

export function stopTradeSimulation(): void {
  // No-op
}

export function isSimulationRunning(): boolean {
  return false;
}

/**
 * Public wrapper for adding platform events (graduations, etc.)
 * from external modules like the trade hook.
 */
export function addPlatformEvent(event: Omit<PlatformEvent, "id">): void {
  addEvent(event);
}

// ─── Creator Analytics ────────────────────────

export interface CreatorTokenData {
  tokenId: string;
  tokenName: string;
  ticker: string;
  image: string;
  blockchain: "solana" | "ethereum";
  earnings: number;
  tradeCount: number;
  volume: number;
  graduated: boolean;
  createdAt: number;
  marketCap: number;
  price: number;
  supply: number;
  graduationProgress: number;
  status: "bonding" | "graduated";
}

export interface CreatorEarnings {
  totalEarnings: number;
  tokens: {
    tokenId: string;
    tokenName: string;
    ticker: string;
    earnings: number;
    tradeCount: number;
    volume: number;
    graduated: boolean;
  }[];
}

/** Fetch all tokens created by a wallet from the server */
export async function fetchCreatorTokens(wallet: string): Promise<CreatorTokenData[]> {
  try {
    const res = await fetch(`/api/tokens/creator/${encodeURIComponent(wallet)}`);
    if (!res.ok) return [];
    const rows = await res.json() as TokenRow[];
    const curves = getBondingCurveStates();
    const curveMap = new Map(curves.map((c) => [c.tokenId, c]));

    return rows.map((row) => {
      const token = rowToTokenData(row);
      const curve = curveMap.get(token.id);
      const progress = curve ? Math.min((curve.currentSupply / curve.totalSupply) * 100, 100) : 0;
      return {
        tokenId: token.id,
        tokenName: token.name,
        ticker: token.ticker,
        image: token.image,
        blockchain: token.blockchain,
        earnings: curve?.creatorEarnings || 0,
        tradeCount: 0,
        volume: 0,
        graduated: curve?.graduated || false,
        createdAt: token.createdAt,
        marketCap: token.marketCap,
        price: token.price,
        supply: token.supply,
        graduationProgress: curve?.graduated ? 100 : progress,
        status: curve?.graduated ? ("graduated" as const) : ("bonding" as const),
      };
    });
  } catch {
    return [];
  }
}

/** Fetch aggregated creator earnings from the server */
export async function fetchCreatorEarnings(wallet: string): Promise<CreatorEarnings | null> {
  try {
    const res = await fetch(`/api/creators/${encodeURIComponent(wallet)}/earnings`);
    if (!res.ok) return null;
    return await res.json() as CreatorEarnings;
  } catch {
    return null;
  }
}

/** Trigger a server-side Web Push notification for a new token launch */
async function triggerPushForLaunch(token: TokenData): Promise<void> {
  try {
    await fetch("/api/push/send-new-launch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tokenId: token.id,
        name: token.name,
        ticker: token.ticker,
        blockchain: token.blockchain,
        creator: token.creator,
      }),
    });
  } catch { /* non-critical */ }
}
