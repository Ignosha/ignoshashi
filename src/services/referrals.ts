/**
 * ignoshashi Referral Tracking Service
 *
 * Generates unique referral codes, tracks referral relationships,
 * and syncs data to the server for persistence across devices.
 *
 * Flow:
 * 1. User A shares link: https://ignoshashi.ctonew.app/?ref=ABC12345
 * 2. User B visits with ?ref=ABC12345 → cookie + localStorage stored
 * 3. User B creates first token → referrer credited (Tier 2)
 * 4. User B makes first bonding curve trade → referrer credited (Tier 3)
 */

import type { BondingCurveState } from "./bondingCurve";

const REFERRALS_KEY = "ignoshashi_referrals";
const REFERRER_CODE_KEY = "ignoshashi_referrer_code";
const REFERRER_COOKIE = "ignoshashi_ref";
const TIER_VISITED = "visited" as const;
const TIER_SIGNED_UP = "signed_up" as const;
const TIER_CREATED_TOKEN = "created_token" as const;
const TIER_MADE_TRADE = "made_trade" as const;

export type ReferralStatus = "visited" | "signed_up" | "created_token" | "made_trade";

export interface ReferralRecord {
  id: string;
  referrerCode: string;
  referrerWallet: string;
  referredWallet: string;
  timestamp: number;
  status: ReferralStatus;
  rewardTier: number; // 0=visited, 1=signed_up, 2=created_token, 3=made_trade
  rewardAmount: number;
  rewardChain: "solana" | "ethereum" | "";
  tokenId?: string; // the token that was created/traded
}

export interface ReferralStats {
  referralCode: string;
  totalReferrals: number;
  tokensCreated: number;
  tradesMade: number;
  totalRewards: number;
  referrals: ReferralRecord[];
}

export interface ReferralLeaderboardEntry {
  rank: number;
  referrerWallet: string;
  referralCode: string;
  referralCount: number;
  totalRewards: number;
}

// ─── Helpers ───────────────────────────────────────

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

function setCookie(name: string, value: string, days = 365): void {
  if (typeof document === "undefined") return;
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${value}; expires=${expires}; path=/; SameSite=Lax`;
}

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/([.$?*|{}()\[\]\\\/\+^])/g, "\\$1")}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

// ─── API Helpers ────────────────────────────────────

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

// ─── Code Generation ────────────────────────────────

/** Generate a referral code from a wallet address (first 8 chars, uppercase) */
export function generateReferralCode(walletAddress: string): string {
  if (!walletAddress) return "";
  return walletAddress.slice(0, 8).toUpperCase();
}

// ─── URL & Cookie Detection ─────────────────────────

/**
 * Check if a ?ref= param is in the URL and save the referrer.
 * Called from __root.tsx on app init.
 * Sets both a cookie (365 day expiry) and localStorage.
 */
export function checkAndSaveReferral(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const url = new URL(window.location.href);
    const refCode = url.searchParams.get("ref");
    if (refCode && refCode.length >= 4) {
      const clean = refCode.toUpperCase().trim();
      // Store in localStorage
      localStorage.setItem(REFERRER_CODE_KEY, clean);
      // Store in cookie
      setCookie(REFERRER_COOKIE, clean, 365);

      // Clean URL (remove ref param from address bar)
      if (url.searchParams.has("ref")) {
        url.searchParams.delete("ref");
        window.history.replaceState({}, "", url.toString());
      }

      // Track visit server-side
      trackReferralEvent(clean, "visited", window.location.hostname).catch(() => {});

      return clean;
    }

    // Also check cookie (for returning users)
    const cookieRef = getCookie(REFERRER_COOKIE);
    if (cookieRef && !localStorage.getItem(REFERRER_CODE_KEY)) {
      localStorage.setItem(REFERRER_CODE_KEY, cookieRef);
      return cookieRef;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Get the stored referrer code (from ?ref= param or cookie) */
export function getStoredReferrerCode(): string | null {
  if (typeof window === "undefined") return null;
  // Check localStorage first, then cookie
  const local = localStorage.getItem(REFERRER_CODE_KEY);
  if (local) return local;
  const cookie = getCookie(REFERRER_COOKIE);
  if (cookie) {
    localStorage.setItem(REFERRER_CODE_KEY, cookie);
    return cookie;
  }
  return null;
}

// ─── Local Storage ──────────────────────────────────

function getLocalReferrals(): ReferralRecord[] {
  return safeGet<ReferralRecord[]>(REFERRALS_KEY, []);
}

function saveLocalReferrals(records: ReferralRecord[]): void {
  safeSet(REFERRALS_KEY, records);
}

// ─── Server Sync ────────────────────────────────────

async function trackReferralEvent(
  referrerCode: string,
  status: ReferralStatus,
  referredWallet: string,
  rewardAmount = 0,
  rewardChain: "solana" | "ethereum" | "" = "",
  tokenId = "",
): Promise<void> {
  await apiPost("/referrals", {
    referrerCode,
    referredWallet,
    status,
    rewardAmount,
    rewardChain,
    tokenId,
  });
}

/** Fetch referral stats from server for a wallet */
export async function fetchReferralStats(walletAddress: string): Promise<ReferralStats | null> {
  return apiFetch<ReferralStats>(`/referrals?wallet=${encodeURIComponent(walletAddress)}`);
}

/** Fetch referral leaderboard from server */
export async function fetchReferralLeaderboard(): Promise<ReferralLeaderboardEntry[]> {
  const data = await apiFetch<ReferralLeaderboardEntry[]>("/referrals/leaderboard");
  return data || [];
}

// ─── Credit Referrer on Token Creation ──────────────

/**
 * Called when a referred user creates their first token.
 * Credits the referrer with 10% of the creation fee.
 */
export async function creditReferrerForTokenCreation(
  referredWallet: string,
  blockchain: "solana" | "ethereum",
  tokenId: string,
): Promise<void> {
  const refCode = getStoredReferrerCode();
  if (!refCode) return;

  // Don't self-refer
  if (generateReferralCode(referredWallet) === refCode) return;

  // Check if already credited for this status
  const local = getLocalReferrals();
  const alreadyCredited = local.some(
    (r) => r.referredWallet === referredWallet && r.referrerCode === refCode &&
      (r.status === TIER_CREATED_TOKEN || r.status === TIER_MADE_TRADE)
  );
  if (alreadyCredited) {
    // Just update server with the new status
    await trackReferralEvent(refCode, TIER_CREATED_TOKEN, referredWallet, 0, blockchain, tokenId);
    return;
  }

  // Tier 2: 10% of creation fee credited to referrer
  const creationFee = blockchain === "solana" ? 0.01 : 0.005;
  const rewardAmount = creationFee * 0.10;

  // Local record
  const record: ReferralRecord = {
    id: `ref-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    referrerCode: refCode,
    referrerWallet: refCode,
    referredWallet,
    timestamp: Date.now(),
    status: TIER_CREATED_TOKEN,
    rewardTier: 2,
    rewardAmount,
    rewardChain: blockchain,
    tokenId,
  };

  const records = getLocalReferrals();
  records.push(record);
  saveLocalReferrals(records);

  // Server sync
  await trackReferralEvent(refCode, TIER_CREATED_TOKEN, referredWallet, rewardAmount, blockchain, tokenId);
}

// ─── Credit Referrer on Bonding Curve Buy ───────────

/**
 * Called when a referred user makes a bonding curve buy.
 * Credits the referrer with 5% of the platform fee from that trade.
 */
export async function creditReferrerForTrade(
  referredWallet: string,
  blockchain: "solana" | "ethereum",
  platformFee: number,
  tokenId: string,
): Promise<void> {
  const refCode = getStoredReferrerCode();
  if (!refCode) return;

  // Don't self-refer
  if (generateReferralCode(referredWallet) === refCode) return;

  // Local record
  const rewardAmount = platformFee * 0.05;

  const record: ReferralRecord = {
    id: `ref-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    referrerCode: refCode,
    referrerWallet: refCode,
    referredWallet,
    timestamp: Date.now(),
    status: TIER_MADE_TRADE,
    rewardTier: 3,
    rewardAmount,
    rewardChain: blockchain,
    tokenId,
  };

  const records = getLocalReferrals();
  records.push(record);
  saveLocalReferrals(records);

  // Server sync
  await trackReferralEvent(refCode, TIER_MADE_TRADE, referredWallet, rewardAmount, blockchain, tokenId);
}

// ─── Referral Link ───────────────────────────────────

/** Generate a referral link for a wallet */
export function getReferralLink(walletAddress: string): string {
  const code = generateReferralCode(walletAddress);
  const base = typeof window !== "undefined" ? window.location.origin : "https://ignoshashi.ctonew.app";
  return `${base}/?ref=${code}`;
}

/** Get referral stats from local storage (instant, fallback) */
export function getLocalReferralStats(walletAddress: string): ReferralStats {
  const records = getLocalReferrals();
  const code = generateReferralCode(walletAddress);

  const myReferrals = records.filter(
    (r) => r.referrerCode === code || r.referrerWallet === walletAddress,
  );

  const tokensCreated = myReferrals.filter(
    (r) => r.status === TIER_CREATED_TOKEN || r.status === TIER_MADE_TRADE,
  ).length;
  const tradesMade = myReferrals.filter(
    (r) => r.status === TIER_MADE_TRADE,
  ).length;
  const totalRewards = myReferrals.reduce((sum, r) => sum + r.rewardAmount, 0);

  return {
    referralCode: code,
    totalReferrals: myReferrals.length,
    tokensCreated,
    tradesMade,
    totalRewards,
    referrals: myReferrals,
  };
}

/** Clear the stored referrer code */
export function clearStoredReferrer(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(REFERRER_CODE_KEY);
    setCookie(REFERRER_COOKIE, "", -1); // Expire the cookie
  } catch { /* ignore */ }
}

// Backward-compatible alias
export const getReferralStats = getLocalReferralStats;
