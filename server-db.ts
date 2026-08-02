/**
 * ignoshashi Server-Side Database
 * Uses Bun's built-in SQLite. Runs directly in the Bun server (serve.ts),
 * NOT through Vite bundling. All /api/* requests are handled here.
 */
import { Database } from "bun:sqlite";
import type { ServerWebSocket } from "bun";
import Stripe from "stripe";

// ─── WebSocket State ───────────────────────────

/** channel name → set of connected sockets */
const channelSockets = new Map<string, Set<ServerWebSocket<unknown>>>();
/** socket → { channels subscribed to, callsign } */
const socketMeta = new Map<ServerWebSocket<unknown>, { channels: Set<string>; callsign: string }>();

function broadcastToChannel(channel: string, data: Record<string, unknown>): void {
  const sockets = channelSockets.get(channel);
  if (!sockets || sockets.size === 0) return;
  const payload = JSON.stringify(data);
  for (const ws of sockets) {
    try { ws.send(payload); } catch { /* socket may be closed */ }
  }
}

function broadcastPresence(channel: string): void {
  const sockets = channelSockets.get(channel);
  if (!sockets) return;
  // Collect unique callsigns in this channel
  const callsigns = new Map<string, boolean>();
  for (const ws of sockets) {
    const meta = socketMeta.get(ws);
    if (meta) callsigns.set(meta.callsign, true);
  }
  const users = Array.from(callsigns.entries()).map(([callsign]) => ({
    callsign,
    online: true,
  }));
  broadcastToChannel(channel, { type: "presence", channel, users });
}

export function handleWsOpen(ws: ServerWebSocket<unknown>): void {
  socketMeta.set(ws, { channels: new Set(), callsign: "" });
}

export function handleWsMessage(ws: ServerWebSocket<unknown>, raw: string | Uint8Array): void {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw));
  } catch {
    ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
    return;
  }

  const type = data.type as string;
  const meta = socketMeta.get(ws);
  if (!meta) return;

  switch (type) {
    case "subscribe": {
      const channel = data.channel as string;
      const callsign = (data.callsign as string) || "anon";
      if (!channel) return;
      meta.callsign = callsign;
      meta.channels.add(channel);
      if (!channelSockets.has(channel)) channelSockets.set(channel, new Set());
      channelSockets.get(channel)!.add(ws);
      // Broadcast updated presence
      broadcastPresence(channel);
      break;
    }
    case "unsubscribe": {
      const channel = data.channel as string;
      if (!channel) return;
      meta.channels.delete(channel);
      const set = channelSockets.get(channel);
      if (set) {
        set.delete(ws);
        if (set.size === 0) channelSockets.delete(channel);
      }
      broadcastPresence(channel);
      break;
    }
    case "message": {
      // Ignored — messages must go through REST API for persistence.
      // This is kept for compatibility but we don't persist from WS.
      break;
    }
    case "reaction": {
      const messageId = data.messageId as string;
      const emoji = data.emoji as string;
      if (!messageId || !emoji) return;
      // Reaction handled via REST API — but we can echo back
      break;
    }
    case "pin": {
      // Handled via REST API
      break;
    }
    case "typing": {
      const channel = data.channel as string;
      const isTyping = !!data.isTyping;
      if (!channel || !meta.callsign) return;
      // Broadcast typing to everyone else in channel
      const sockets = channelSockets.get(channel);
      if (!sockets) return;
      const payload = JSON.stringify({
        type: "typing",
        channel,
        callsign: meta.callsign,
        isTyping,
      });
      for (const other of sockets) {
        if (other === ws) continue;
        try { other.send(payload); } catch { /* */ }
      }
      break;
    }
    default:
      ws.send(JSON.stringify({ type: "error", message: `Unknown type: ${type}` }));
  }
}

export function handleWsClose(ws: ServerWebSocket<unknown>): void {
  const meta = socketMeta.get(ws);
  if (meta) {
    for (const channel of meta.channels) {
      const set = channelSockets.get(channel);
      if (set) {
        set.delete(ws);
        if (set.size === 0) channelSockets.delete(channel);
        else broadcastPresence(channel);
      }
    }
  }
  socketMeta.delete(ws);
}

// ─── Types ─────────────────────────────────────

export interface TokenRow {
  id: string;
  name: string;
  ticker: string;
  description: string;
  supply: number;
  blockchain: string;
  image: string;
  creator: string;
  marketCap: number;
  price: number;
  volume24h: number;
  priceHistory: string;
  createdAt: number;
  isDemo: number;
  tokenAddress: string | null;
  videoUrl: string | null;
  verified: number;
}

interface TradeRow {
  id: string;
  tokenId: string;
  tokenName: string;
  tokenTicker: string;
  type: string;
  amount: number;
  price: number;
  total: number;
  wallet: string;
  txHash: string;
  timestamp: number;
}

interface CommentRow {
  id: string;
  tokenId: string;
  wallet: string;
  message: string;
  timestamp: number;
}

interface BondingCurveRow {
  tokenId: string;
  state: string;
}

interface EventRow {
  id: string;
  type: string;
  message: string;
  tokenName: string;
  tokenTicker: string;
  blockchain: string;
  wallet: string;
  amount: number | null;
  timestamp: number;
}

interface BattleRow {
  id: string;
  name: string;
  status: string;
  tokens: string;
  votes: string;
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
}

interface AchievementRow {
  id: string;
  wallet: string;
  achievementId: string;
  name: string;
  description: string;
  tier: string;
  earnedAt: number;
}

interface ChatMessageRow {
  id: string;
  username: string;
  channel: string;
  text: string;
  timestamp: number;
  reactions: string;
  pinned: number;
  image: string | null;
}

interface UserRow {
  wallet: string;
  callsign: string;
  created_at: number;
  updated_at: number;
}

interface PurchaseRow {
  id: string;
  wallet: string;
  tool_id: string;
  stripe_session_id: string;
  status: string;
  amount_cents: number;
  created_at: string;
  updated_at: string;
}

// ─── Stripe Configuration ──────────────────────

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

const IS_STRIPE_PLACEHOLDER =
  !STRIPE_SECRET_KEY || STRIPE_SECRET_KEY.includes("placeholder");

if (IS_STRIPE_PLACEHOLDER) {
  console.warn(
    "⚠️ STRIPE_SECRET_KEY is still a placeholder — Stripe payments will not work. " +
    "Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in .env with real values."
  );
}

let stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (!stripe) {
    if (!STRIPE_SECRET_KEY || STRIPE_SECRET_KEY.includes("placeholder")) {
      throw new Error("Stripe is not configured. Set STRIPE_SECRET_KEY in .env");
    }
    stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: "2025-06-16.acacia" as Stripe.LatestApiVersion,
    });
  }
  return stripe;
}

// Tool ID → Stripe Price ID mapping (and reverse)
const TOOL_PRICE_MAP: Record<string, { priceId: string; amountCents: number }> = {
  "profit-calculator": { priceId: "price_1TyIRNDpL2ASZhIdQQAsS2ND", amountCents: 500 },
  "token-scanner": { priceId: "price_1TyIlMDpL2ASZhId8wjUtWm2", amountCents: 2500 },
  "rug-pull-scanner": { priceId: "price_1TyNuBDpL2ASZhIdJU3MfBL0", amountCents: 2500 },
  "portfolio-pro": { priceId: "price_1TyIRODpL2ASZhIdvCwnWU3U", amountCents: 2500 },
  // Tool packs
  "pack-10": { priceId: "price_1TyLaPDpL2ASZhIdF6CZYxuQ", amountCents: 1000 },
  "pack-25": { priceId: "price_1TyLaPDpL2ASZhIdXy7SDjdo", amountCents: 2500 },
  "pack-50": { priceId: "price_1TyLaPDpL2ASZhIdPJfo3Iuf", amountCents: 5000 },
  "pack-100": { priceId: "price_1TyLaPDpL2ASZhId6I0AQ4OU", amountCents: 10000 },
};

const PRICE_TO_TOOL_MAP: Record<string, string> = {};
for (const [toolId, info] of Object.entries(TOOL_PRICE_MAP)) {
  PRICE_TO_TOOL_MAP[info.priceId] = toolId;
}

// Which tools each pack unlocks
const PACK_TOOLS: Record<string, string[]> = {
  "pack-10": ["profit-calculator"],
  "pack-25": ["token-scanner"],
  "pack-50": ["token-scanner", "rug-pull-scanner"],
  "pack-100": ["profit-calculator", "token-scanner", "rug-pull-scanner", "portfolio-pro"],
};

// ─── Database Connection ───────────────────────

let db: Database | null = null;

function getDb(): Database {
  if (!db) {
    db = new Database("data/ignoshashi.db", { create: true });
    db.run("PRAGMA journal_mode=WAL");
    db.run("PRAGMA foreign_keys=ON");
  }
  return db;
}

// ─── Table Creation ────────────────────────────

export function initDb(): void {
  const d = getDb();

  d.run(`
    CREATE TABLE IF NOT EXISTS tokens (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      ticker TEXT NOT NULL,
      description TEXT DEFAULT '',
      supply REAL DEFAULT 1000000000,
      blockchain TEXT NOT NULL DEFAULT 'solana',
      image TEXT DEFAULT '',
      creator TEXT NOT NULL DEFAULT '',
      marketCap REAL DEFAULT 0,
      price REAL DEFAULT 0,
      volume24h REAL DEFAULT 0,
      priceHistory TEXT DEFAULT '[]',
      createdAt INTEGER DEFAULT 0,
      isDemo INTEGER DEFAULT 0,
      tokenAddress TEXT,
      videoUrl TEXT,
      verified INTEGER DEFAULT 0
    )
  `);

  d.run(`
    CREATE TABLE IF NOT EXISTS trades (
      id TEXT PRIMARY KEY,
      tokenId TEXT NOT NULL,
      tokenName TEXT DEFAULT '',
      tokenTicker TEXT DEFAULT '',
      type TEXT NOT NULL,
      amount REAL DEFAULT 0,
      price REAL DEFAULT 0,
      total REAL DEFAULT 0,
      wallet TEXT DEFAULT '',
      txHash TEXT DEFAULT '',
      timestamp INTEGER DEFAULT 0
    )
  `);

  d.run(`
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      tokenId TEXT NOT NULL,
      wallet TEXT DEFAULT '',
      message TEXT DEFAULT '',
      timestamp INTEGER DEFAULT 0
    )
  `);

  d.run(`
    CREATE TABLE IF NOT EXISTS bonding_curves (
      tokenId TEXT PRIMARY KEY,
      state TEXT NOT NULL DEFAULT '{}'
    )
  `);

  d.run(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      message TEXT DEFAULT '',
      tokenName TEXT DEFAULT '',
      tokenTicker TEXT DEFAULT '',
      blockchain TEXT DEFAULT '',
      wallet TEXT DEFAULT '',
      amount REAL,
      timestamp INTEGER DEFAULT 0
    )
  `);

  d.run(`
    CREATE TABLE IF NOT EXISTS battles (
      id TEXT PRIMARY KEY,
      name TEXT DEFAULT '',
      status TEXT DEFAULT 'upcoming',
      tokens TEXT DEFAULT '[]',
      votes TEXT DEFAULT '{}',
      createdAt INTEGER DEFAULT 0,
      startedAt INTEGER,
      endedAt INTEGER
    )
  `);

  d.run(`
    CREATE TABLE IF NOT EXISTS achievements (
      id TEXT PRIMARY KEY,
      wallet TEXT NOT NULL,
      achievementId TEXT NOT NULL,
      name TEXT DEFAULT '',
      description TEXT DEFAULT '',
      tier TEXT DEFAULT 'bronze',
      earnedAt INTEGER DEFAULT 0
    )
  `);

  d.run(`
    CREATE TABLE IF NOT EXISTS platform_fees (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      sol REAL DEFAULT 0,
      eth REAL DEFAULT 0
    )
  `);

  d.run("INSERT OR IGNORE INTO platform_fees (id, sol, eth) VALUES (1, 0, 0)");

  d.run(`
    CREATE TABLE IF NOT EXISTS pool_balances (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      sol REAL DEFAULT 0,
      eth REAL DEFAULT 0
    )
  `);

  d.run("INSERT OR IGNORE INTO pool_balances (id, sol, eth) VALUES (1, 0, 0)");

  d.run(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT 'General Chat',
      text TEXT DEFAULT '',
      timestamp INTEGER NOT NULL DEFAULT 0,
      reactions TEXT DEFAULT '{}',
      pinned INTEGER DEFAULT 0,
      image TEXT
    )
  `);
  d.run("CREATE INDEX IF NOT EXISTS idx_chat_channel ON chat_messages(channel)");
  d.run("CREATE INDEX IF NOT EXISTS idx_chat_timestamp ON chat_messages(timestamp)");

  d.run(`
    CREATE TABLE IF NOT EXISTS users (
      wallet TEXT PRIMARY KEY,
      callsign TEXT UNIQUE NOT NULL,
      created_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0
    )
  `);

  d.run("CREATE INDEX IF NOT EXISTS idx_trades_tokenId ON trades(tokenId)");
  d.run("CREATE INDEX IF NOT EXISTS idx_comments_tokenId ON comments(tokenId)");
  d.run("CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp)");
  d.run("CREATE INDEX IF NOT EXISTS idx_achievements_wallet ON achievements(wallet)");
  d.run("CREATE INDEX IF NOT EXISTS idx_tokens_creator ON tokens(creator)");
  d.run("CREATE INDEX IF NOT EXISTS idx_trades_wallet ON trades(wallet)");

  d.run(`
    CREATE TABLE IF NOT EXISTS presence (
      visitorId TEXT PRIMARY KEY,
      lastSeen INTEGER NOT NULL DEFAULT 0
    )
  `);
  d.run("CREATE INDEX IF NOT EXISTS idx_presence_lastSeen ON presence(lastSeen)");

  d.run(`
    CREATE TABLE IF NOT EXISTS purchases (
      id TEXT PRIMARY KEY,
      wallet TEXT NOT NULL,
      tool_id TEXT NOT NULL,
      stripe_session_id TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending',
      amount_cents INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  d.run("CREATE INDEX IF NOT EXISTS idx_purchases_wallet ON purchases(wallet)");
  d.run("CREATE INDEX IF NOT EXISTS idx_purchases_session ON purchases(stripe_session_id)");

  d.run(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint TEXT UNIQUE NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      wallet TEXT DEFAULT '',
      notification_types TEXT DEFAULT '["price_alerts","new_launches"]',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  d.run("CREATE INDEX IF NOT EXISTS idx_push_sub_wallet ON push_subscriptions(wallet)");
  d.run("CREATE INDEX IF NOT EXISTS idx_push_sub_endpoint ON push_subscriptions(endpoint)");

  d.run(`
    CREATE TABLE IF NOT EXISTS referrals (
      id TEXT PRIMARY KEY,
      referrer_code TEXT NOT NULL,
      referred_wallet TEXT NOT NULL,
      timestamp INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'visited',
      reward_tier INTEGER NOT NULL DEFAULT 0,
      reward_amount REAL NOT NULL DEFAULT 0,
      reward_chain TEXT NOT NULL DEFAULT '',
      token_id TEXT DEFAULT ''
    )
  `);
  d.run("CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_code)");
  d.run("CREATE INDEX IF NOT EXISTS idx_referrals_referred ON referrals(referred_wallet)");
  d.run("CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status)");

  // ─── Migration: Clean up simulated trades ────
  // Remove any trades that have simulated tx hashes (sim-* prefix)
  const simTradeCount = (d.query(
    "SELECT COUNT(*) as c FROM trades WHERE txHash LIKE 'sim-%'"
  ).get() as { c: number } | null)?.c || 0;
  if (simTradeCount > 0) {
    console.log(`🧹 Cleaning up ${simTradeCount} simulated trades from server database...`);
    d.run("DELETE FROM trades WHERE txHash LIKE 'sim-%'");
  }

  // Also clean up simulated events that reference sim-* tx hashes
  const simEventCount = (d.query(
    "SELECT COUNT(*) as c FROM events WHERE wallet = 'sim-wallet' OR message LIKE '%sim-%' OR message LIKE '%SIM-%'"
  ).get() as { c: number } | null)?.c || 0;
  if (simEventCount > 0) {
    console.log(`🧹 Cleaning up ${simEventCount} simulated events from server database...`);
    d.run("DELETE FROM events WHERE wallet = 'sim-wallet' OR message LIKE '%sim-%' OR message LIKE '%SIM-%'");
  }
  }

// ─── API Route Handler ─────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

function parseBody(req: Request): Promise<unknown> {
  return req.json().catch(() => ({}));
}

/** Reads a non-empty server-only secret without logging or returning its value. */
function getRequiredServerSecret(name: string): string | null {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Validates the JSON-encoded 64-byte Solana secret-key array. */
function decodeSolanaSecretKey(value: string): Uint8Array | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      Array.isArray(parsed) &&
      parsed.length === 64 &&
      parsed.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)
    ) {
      return Uint8Array.from(parsed);
    }
  } catch {
    // Invalid configuration is handled by the calling route without exposing it.
  }
  return null;
}

function isEthereumPrivateKey(value: string): boolean {
  return /^(?:0x)?[0-9a-fA-F]{64}$/.test(value);
}

// ─── Web Push Sending ───────────────────────────

let webPushLib: any = null;

function getWebPush() {
  if (!webPushLib) {
    try {
      webPushLib = require("web-push");
    } catch {
      console.warn("web-push module not available — push sending disabled");
      return null;
    }

    const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    const vapidSubject = process.env.VAPID_SUBJECT || "mailto:notifications@ignoshashi.xyz";

    if (vapidPublicKey && vapidPrivateKey) {
      webPushLib.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    } else {
      console.warn("VAPID keys not configured — push sending disabled");
      return null;
    }
  }
  return webPushLib;
}

interface PushSubRow {
  endpoint: string;
  p256dh: string;
  auth: string;
  wallet: string;
  notification_types: string;
}

async function sendPriceAlertPush(alert: {
  tokenId: string;
  tokenName: string;
  ticker: string;
  targetPrice: number;
  currentPrice: number;
  blockchain: string;
}): Promise<{ sent: number; errors: number }> {
  const wp = getWebPush();
  if (!wp) return { sent: 0, errors: 0 };

  const d = getDb();
  const subs = d.query(
    "SELECT * FROM push_subscriptions WHERE notification_types LIKE '%price_alerts%'"
  ).all() as PushSubRow[];

  if (subs.length === 0) return { sent: 0, errors: 0 };

  const currencySymbol = alert.blockchain === "solana" ? "SOL" : "ETH";
  const fmtTarget = alert.targetPrice < 0.0001 ? alert.targetPrice.toFixed(8) : alert.targetPrice.toFixed(6);
  const fmtCurrent = alert.currentPrice < 0.0001 ? alert.currentPrice.toFixed(8) : alert.currentPrice.toFixed(6);

  const payload = JSON.stringify({
    title: `🔔 ${alert.ticker} HIT PRICE TARGET!`,
    body: `Hit ${fmtTarget} ${currencySymbol} — now at ${fmtCurrent} ${currencySymbol}`,
    icon: "/icon-192.png",
    badge: "/favicon-32.png",
    tag: `price-alert-${alert.tokenId}`,
    data: { url: `/token/${alert.tokenId}`, type: "price-alert", tokenId: alert.tokenId },
    requireInteraction: true,
    vibrate: [200, 100, 200, 100, 200],
    timestamp: Date.now(),
  });

  let sent = 0;
  let errors = 0;

  for (const sub of subs) {
    try {
      await wp.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        payload
      );
      sent++;
    } catch (err: any) {
      errors++;
      // If subscription is expired/invalid (410 Gone), remove it
      if (err?.statusCode === 410 || err?.statusCode === 404) {
        d.run("DELETE FROM push_subscriptions WHERE endpoint = $endpoint", {
          $endpoint: sub.endpoint,
        });
      }
    }
  }

  return { sent, errors };
}

async function sendNewLaunchPush(token: {
  tokenId: string;
  name: string;
  ticker: string;
  blockchain: string;
  creator: string;
}): Promise<{ sent: number; errors: number }> {
  const wp = getWebPush();
  if (!wp) return { sent: 0, errors: 0 };

  const d = getDb();

  // Find all subscriptions with new_launches enabled
  const subs = d.query(
    "SELECT * FROM push_subscriptions WHERE notification_types LIKE '%new_launches%'"
  ).all() as PushSubRow[];

  if (subs.length === 0) return { sent: 0, errors: 0 };

  const chainName = token.blockchain === "solana" ? "Solana" : "Ethereum";
  const payload = JSON.stringify({
    title: `🚀 NEW LAUNCH: ${token.ticker}`,
    body: `${token.name} just launched on ${chainName} — check it out!`,
    icon: "/icon-192.png",
    badge: "/favicon-32.png",
    tag: `new-launch-${token.tokenId}`,
    data: { url: `/token/${token.tokenId}`, type: "new-launch", tokenId: token.tokenId },
    vibrate: [100, 50, 100],
    timestamp: Date.now(),
  });

  let sent = 0;
  let errors = 0;

  for (const sub of subs) {
    try {
      await wp.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        payload
      );
      sent++;
    } catch (err: any) {
      errors++;
      if (err?.statusCode === 410 || err?.statusCode === 404) {
        d.run("DELETE FROM push_subscriptions WHERE endpoint = $endpoint", {
          $endpoint: sub.endpoint,
        });
      }
    }
  }

  return { sent, errors };
}

export async function handleApiRequest(req: Request): Promise<Response | null> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method.toUpperCase();

  // CORS preflight
  if (method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (!path.startsWith("/api/")) return null;

  // ─── POST /api/solana-rpc ─────────────────────
  // Proxy Solana JSON-RPC requests to avoid CORS issues with wallets
  if (path === "/api/solana-rpc" && method === "POST") {
    const SOLANA_PUBLIC_RPC = "https://api.mainnet-beta.solana.com";
    try {
      const body = await req.text();
      let parsed: any;
      try {
        parsed = JSON.parse(body);
      } catch {
        return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
      }

      if (!parsed || parsed.jsonrpc !== "2.0" || !parsed.method) {
        return json({ jsonrpc: "2.0", id: parsed?.id ?? null, error: { code: -32600, message: "Invalid Request" } });
      }

      const upstream = await fetch(SOLANA_PUBLIC_RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
        signal: AbortSignal.timeout(30_000),
      });

      if (!upstream.ok) {
        return json({
          jsonrpc: "2.0",
          id: parsed.id ?? null,
          error: { code: -32000, message: `Upstream RPC returned status ${upstream.status}` },
        });
      }

      const data = await upstream.json();
      return json(data);
    } catch (err: any) {
      if (err?.name === "TimeoutError" || err?.name === "AbortError") {
        return json({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "Upstream RPC request timed out" } });
      }
      return json({ jsonrpc: "2.0", id: null, error: { code: -32000, message: err?.message || "Internal proxy error" } });
    }
  }

  const d = getDb();

  // ─── GET /api/tokens ─────────────────────────
  if (path === "/api/tokens" && method === "GET") {
    const tokens = d.query("SELECT * FROM tokens ORDER BY createdAt DESC").all();
    return json(tokens);
  }

  // ─── GET /api/tokens/search?q= ───────────────
  if (path === "/api/tokens/search" && method === "GET") {
    const q = url.searchParams.get("q") || "";
    if (!q.trim()) return json([]);
    const searchTerm = `%${q.trim()}%`;
    const tokens = d.query(
      "SELECT * FROM tokens WHERE name LIKE $q OR ticker LIKE $q2 OR tokenAddress LIKE $q3 ORDER BY createdAt DESC LIMIT 20",
      { $q: searchTerm, $q2: searchTerm, $q3: searchTerm }
    ).all();
    return json(tokens);
  }

  // ─── POST /api/tokens ────────────────────────
  if (path === "/api/tokens" && method === "POST") {
    const body = (await parseBody(req)) as Record<string, unknown>;
    d.run(
      `INSERT OR REPLACE INTO tokens (id, name, ticker, description, supply, blockchain, image, creator, marketCap, price, volume24h, priceHistory, createdAt, isDemo, tokenAddress, videoUrl, verified)
       VALUES ($id, $name, $ticker, $description, $supply, $blockchain, $image, $creator, $marketCap, $price, $volume24h, $priceHistory, $createdAt, $isDemo, $tokenAddress, $videoUrl, $verified)`,
      {
        $id: body.id, $name: body.name, $ticker: body.ticker, $description: body.description || "",
        $supply: body.supply || 1_000_000_000, $blockchain: body.blockchain || "solana",
        $image: body.image || "", $creator: body.creator || "",
        $marketCap: body.marketCap || 0, $price: body.price || 0,
        $volume24h: body.volume24h || 0, $priceHistory: body.priceHistory || "[]",
        $createdAt: body.createdAt || Date.now(), $isDemo: body.isDemo ? 1 : 0,
        $tokenAddress: body.tokenAddress || null, $videoUrl: body.videoUrl || null,
        $verified: body.verified ? 1 : 0,
      }
    );
    return json({ success: true, id: body.id });
  }

  // ─── GET /api/tokens/creator/:wallet ──────────
  const creatorTokensMatch = path.match(/^\/api\/tokens\/creator\/(.+)$/);
  if (creatorTokensMatch && method === "GET") {
    const tokens = d.query("SELECT * FROM tokens WHERE creator = $creator ORDER BY createdAt DESC").all({ $creator: creatorTokensMatch[1] });
    return json(tokens);
  }

  // ─── GET /api/tokens/:id ─────────────────────
  const tokenMatch = path.match(/^\/api\/tokens\/(.+)$/);
  if (tokenMatch && method === "GET") {
    const token = d.query("SELECT * FROM tokens WHERE id = $id").get({ $id: tokenMatch[1] });
    return token ? json(token) : json({ error: "Not found" }, 404);
  }

  // ─── DELETE /api/tokens/:id ──────────────────
  if (tokenMatch && method === "DELETE") {
    const body = (await parseBody(req)) as Record<string, unknown>;
    const token = d.query("SELECT * FROM tokens WHERE id = $id").get({ $id: tokenMatch[1] }) as TokenRow | null;
    if (!token) return json({ error: "Not found" }, 404);
    if (token.creator !== body.wallet) return json({ error: "Not authorized" }, 403);
    d.run("DELETE FROM tokens WHERE id = $id", { $id: tokenMatch[1] });
    d.run("DELETE FROM bonding_curves WHERE tokenId = $id", { $id: tokenMatch[1] });
    d.run("DELETE FROM comments WHERE tokenId = $id", { $id: tokenMatch[1] });
    d.run("DELETE FROM trades WHERE tokenId = $id", { $id: tokenMatch[1] });
    return json({ success: true });
  }

  // ─── PATCH /api/tokens/:id/price ─────────────
  const priceMatch = path.match(/^\/api\/tokens\/(.+)\/price$/);
  if (priceMatch && method === "PATCH") {
    const body = (await parseBody(req)) as { price: number };
    const token = d.query("SELECT * FROM tokens WHERE id = $id").get({ $id: priceMatch[1] }) as TokenRow | null;
    if (!token) return json({ error: "Not found" }, 404);
    const history: number[] = JSON.parse(token.priceHistory || "[]");
    history.push(body.price);
    d.run("UPDATE tokens SET price = $p, marketCap = $m, priceHistory = $h WHERE id = $id", {
      $p: body.price, $m: body.price * token.supply, $h: JSON.stringify(history), $id: priceMatch[1],
    });
    return json({ success: true });
  }

  // ─── GET /api/trades (ALL tokens) ────────────
  if (path === "/api/trades" && method === "GET") {
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const trades = d.query("SELECT * FROM trades ORDER BY timestamp DESC LIMIT $limit").all({ $limit: limit });
    return json({ trades });
  }

  // ─── GET /api/trades/:tokenId ────────────────
  const tradesMatch = path.match(/^\/api\/trades\/(.+)$/);
  if (tradesMatch && method === "GET") {
    const trades = d.query("SELECT * FROM trades WHERE tokenId = $id ORDER BY timestamp DESC LIMIT 100").all({ $id: tradesMatch[1] });
    return json(trades);
  }

  // ─── POST /api/trades ────────────────────────
  if (path === "/api/trades" && method === "POST") {
    const body = (await parseBody(req)) as Record<string, unknown>;
    d.run(
      `INSERT OR REPLACE INTO trades (id, tokenId, tokenName, tokenTicker, type, amount, price, total, wallet, txHash, timestamp)
       VALUES ($id, $tokenId, $tokenName, $tokenTicker, $type, $amount, $price, $total, $wallet, $txHash, $timestamp)`,
      {
        $id: body.id, $tokenId: body.tokenId, $tokenName: body.tokenName || "",
        $tokenTicker: body.tokenTicker || "", $type: body.type, $amount: body.amount || 0,
        $price: body.price || 0, $total: body.total || 0, $wallet: body.wallet || "",
        $txHash: body.txHash || "", $timestamp: body.timestamp || Date.now(),
      }
    );
    return json({ success: true });
  }

  // ─── GET /api/comments/:tokenId ──────────────
  const commentsMatch = path.match(/^\/api\/comments\/(.+)$/);
  if (commentsMatch && method === "GET") {
    const comments = d.query("SELECT * FROM comments WHERE tokenId = $id ORDER BY timestamp DESC LIMIT 200").all({ $id: commentsMatch[1] });
    return json(comments);
  }

  // ─── POST /api/comments ──────────────────────
  if (path === "/api/comments" && method === "POST") {
    const body = (await parseBody(req)) as Record<string, unknown>;
    d.run(
      "INSERT OR REPLACE INTO comments (id, tokenId, wallet, message, timestamp) VALUES ($id, $tokenId, $wallet, $message, $timestamp)",
      { $id: body.id, $tokenId: body.tokenId, $wallet: body.wallet || "", $message: body.message || "", $timestamp: body.timestamp || Date.now() }
    );
    return json({ success: true });
  }

  // ─── GET /api/bonding-curve/:tokenId ─────────
  const bcMatch = path.match(/^\/api\/bonding-curve\/(.+)$/);
  if (bcMatch && method === "GET") {
    const row = d.query("SELECT * FROM bonding_curves WHERE tokenId = $id").get({ $id: bcMatch[1] }) as BondingCurveRow | null;
    return row ? json(JSON.parse(row.state)) : json({ error: "Not found" }, 404);
  }

  // ─── POST /api/bonding-curve/:tokenId ────────
  if (bcMatch && method === "POST") {
    const body = await parseBody(req);
    d.run("INSERT OR REPLACE INTO bonding_curves (tokenId, state) VALUES ($id, $state)", {
      $id: bcMatch[1], $state: JSON.stringify(body),
    });
    return json({ success: true });
  }

  // ─── GET /api/bonding-curves ─────────────────
  if (path === "/api/bonding-curves" && method === "GET") {
    const rows = d.query("SELECT * FROM bonding_curves").all() as BondingCurveRow[];
    return json(rows.map((r) => JSON.parse(r.state)));
  }

  // ─── GET /api/events ─────────────────────────
  if (path === "/api/events" && method === "GET") {
    const limit = parseInt(url.searchParams.get("limit") || "100");
    const events = d.query("SELECT * FROM events ORDER BY timestamp DESC LIMIT $limit").all({ $limit: limit });
    return json(events);
  }

  // ─── POST /api/events ────────────────────────
  if (path === "/api/events" && method === "POST") {
    const body = (await parseBody(req)) as Record<string, unknown>;
    d.run(
      `INSERT OR REPLACE INTO events (id, type, message, tokenName, tokenTicker, blockchain, wallet, amount, timestamp)
       VALUES ($id, $type, $message, $tokenName, $tokenTicker, $blockchain, $wallet, $amount, $timestamp)`,
      {
        $id: body.id, $type: body.type, $message: body.message || "",
        $tokenName: body.tokenName || "", $tokenTicker: body.tokenTicker || "",
        $blockchain: body.blockchain || "", $wallet: body.wallet || "",
        $amount: body.amount || null, $timestamp: body.timestamp || Date.now(),
      }
    );
    return json({ success: true });
  }

  // ─── GET /api/battles ────────────────────────
  if (path === "/api/battles" && method === "GET") {
    const battles = d.query("SELECT * FROM battles ORDER BY createdAt DESC").all();
    return json(battles);
  }

  // ─── POST /api/battles/vote ──────────────────
  if (path === "/api/battles/vote" && method === "POST") {
    const body = (await parseBody(req)) as { battleId: string; tokenId: string; wallet: string };
    const battle = d.query("SELECT * FROM battles WHERE id = $id").get({ $id: body.battleId }) as BattleRow | null;
    if (!battle) return json({ error: "Battle not found" }, 404);
    const votes = JSON.parse(battle.votes || "{}");
    votes[body.tokenId] = (votes[body.tokenId] || 0) + 1;
    d.run("UPDATE battles SET votes = $votes WHERE id = $id", { $votes: JSON.stringify(votes), $id: body.battleId });
    return json({ success: true, votes });
  }

  // ─── GET /api/achievements/:wallet ───────────
  const achMatch = path.match(/^\/api\/achievements\/(.+)$/);
  if (achMatch && method === "GET") {
    const achievements = d.query("SELECT * FROM achievements WHERE wallet = $wallet ORDER BY earnedAt DESC").all({ $wallet: achMatch[1] });
    return json(achievements);
  }

  // ─── POST /api/achievements ──────────────────
  if (path === "/api/achievements" && method === "POST") {
    const body = (await parseBody(req)) as Record<string, unknown>;
    d.run(
      "INSERT OR REPLACE INTO achievements (id, wallet, achievementId, name, description, tier, earnedAt) VALUES ($id, $wallet, $achievementId, $name, $description, $tier, $earnedAt)",
      {
        $id: body.id, $wallet: body.wallet, $achievementId: body.achievementId,
        $name: body.name || "", $description: body.description || "",
        $tier: body.tier || "bronze", $earnedAt: body.earnedAt || Date.now(),
      }
    );
    return json({ success: true });
  }

  // ─── GET /api/fees ───────────────────────────
  if (path === "/api/fees" && method === "GET") {
    const fees = d.query("SELECT sol, eth FROM platform_fees WHERE id = 1").get() as { sol: number; eth: number } | null;
    return json(fees || { sol: 0, eth: 0 });
  }

  // ─── POST /api/fees ──────────────────────────
  if (path === "/api/fees" && method === "POST") {
    const body = (await parseBody(req)) as { chain: string; amount: number };
    d.run(`UPDATE platform_fees SET ${body.chain} = ${body.chain} + $amount WHERE id = 1`, { $amount: body.amount });
    return json({ success: true });
  }

  // ─── GET /api/stats ──────────────────────────
  if (path === "/api/stats" && method === "GET") {
    const tokens = (d.query("SELECT COUNT(*) as c FROM tokens WHERE isDemo = 0").get() as { c: number })?.c || 0;
    const trades = (d.query("SELECT COUNT(*) as c FROM trades").get() as { c: number })?.c || 0;
    const volume = (d.query("SELECT COALESCE(SUM(total), 0) as v FROM trades").get() as { v: number })?.v || 0;
    const fees = d.query("SELECT sol, eth FROM platform_fees WHERE id = 1").get() as { sol: number; eth: number } | null;
    const wallets = new Set((d.query("SELECT DISTINCT wallet FROM trades").all() as { wallet: string }[]).map(r => r.wallet));
    const marketCap = (d.query("SELECT COALESCE(SUM(marketCap), 0) as m FROM tokens").get() as { m: number })?.m || 0;
    return json({ tokens, trades, volume, feesSol: fees?.sol || 0, feesEth: fees?.eth || 0, activeTraders: wallets.size, marketCap });
  }

  // ─── GET /api/chat/messages ──────────────────
  if (path === "/api/chat/messages" && method === "GET") {
    const channel = url.searchParams.get("channel") || "General Chat";
    const since = parseInt(url.searchParams.get("since") || "0", 10);
    let messages: ChatMessageRow[];
    if (since > 0) {
      messages = d.query("SELECT * FROM chat_messages WHERE channel = $channel AND timestamp > $since ORDER BY timestamp ASC LIMIT 500")
        .all({ $channel: channel, $since: since }) as ChatMessageRow[];
    } else {
      messages = d.query("SELECT * FROM chat_messages WHERE channel = $channel ORDER BY timestamp ASC LIMIT 500")
        .all({ $channel: channel }) as ChatMessageRow[];
    }
    // Parse reactions JSON for each message
    const result = messages.map((m) => ({
      ...m,
      reactions: JSON.parse(m.reactions || "{}"),
      pinned: !!m.pinned,
    }));
    return json(result);
  }

  // ─── POST /api/chat/messages ──────────────────
  if (path === "/api/chat/messages" && method === "POST") {
    const body = (await parseBody(req)) as Record<string, unknown>;
    const text = String(body.text || "").slice(0, 1000);
    const username = String(body.username || "");
    const channel = (body.channel as string) || "General Chat";
    // Validate username exists in users table
    const user = d.query("SELECT callsign FROM users WHERE callsign = $callsign")
      .get({ $callsign: username }) as UserRow | null;
    if (!user) return json({ error: "Unknown user" }, 403);
    d.run(
      `INSERT OR REPLACE INTO chat_messages (id, username, channel, text, timestamp, reactions, pinned, image)
       VALUES ($id, $username, $channel, $text, $timestamp, $reactions, $pinned, $image)`,
      {
        $id: body.id,
        $username: username,
        $channel: channel,
        $text: text,
        $timestamp: body.timestamp || Date.now(),
        $reactions: body.reactions ? JSON.stringify(body.reactions) : "{}",
        $pinned: body.pinned ? 1 : 0,
        $image: body.image || null,
      }
    );
    // Broadcast via WebSocket to channel subscribers
    broadcastToChannel(channel, {
      type: "message",
      message: {
        id: body.id,
        username,
        channel,
        text,
        timestamp: body.timestamp || Date.now(),
        reactions: {},
        pinned: false,
        image: (body.image as string) || undefined,
      },
    });
    return json({ success: true, id: body.id });
  }

  // ─── POST /api/chat/messages/:id/reaction ─────
  const chatReactionMatch = path.match(/^\/api\/chat\/messages\/(.+)\/reaction$/);
  if (chatReactionMatch && method === "POST") {
    const body = (await parseBody(req)) as { emoji: string; username: string };
    const msg = d.query("SELECT * FROM chat_messages WHERE id = $id")
      .get({ $id: chatReactionMatch[1] }) as ChatMessageRow | null;
    if (!msg) return json({ error: "Message not found" }, 404);
    const reactions: Record<string, string[]> = JSON.parse(msg.reactions || "{}");
    if (!reactions[body.emoji]) reactions[body.emoji] = [];
    const idx = reactions[body.emoji].indexOf(body.username);
    if (idx >= 0) {
      reactions[body.emoji].splice(idx, 1);
      if (reactions[body.emoji].length === 0) delete reactions[body.emoji];
    } else {
      reactions[body.emoji].push(body.username);
    }
    d.run("UPDATE chat_messages SET reactions = $reactions WHERE id = $id", {
      $reactions: JSON.stringify(reactions),
      $id: chatReactionMatch[1],
    });
    // Broadcast reaction update via WebSocket
    broadcastToChannel(msg.channel, {
      type: "reaction",
      messageId: chatReactionMatch[1],
      reactions,
    });
    return json({ success: true, reactions });
  }

  // ─── POST /api/chat/messages/:id/pin ──────────
  const chatPinMatch = path.match(/^\/api\/chat\/messages\/(.+)\/pin$/);
  if (chatPinMatch && method === "POST") {
    const msg = d.query("SELECT * FROM chat_messages WHERE id = $id")
      .get({ $id: chatPinMatch[1] }) as ChatMessageRow | null;
    if (!msg) return json({ error: "Message not found" }, 404);
    const newPinned = msg.pinned ? 0 : 1;
    if (newPinned) {
      // Unpin any other message in the same channel
      d.run("UPDATE chat_messages SET pinned = 0 WHERE channel = $channel", {
        $channel: msg.channel,
      });
    }
    d.run("UPDATE chat_messages SET pinned = $pinned WHERE id = $id", {
      $pinned: newPinned,
      $id: chatPinMatch[1],
    });
    // Broadcast pin update via WebSocket
    broadcastToChannel(msg.channel, {
      type: "pin",
      messageId: chatPinMatch[1],
      pinned: !!newPinned,
      channel: msg.channel,
    });
    return json({ success: true, pinned: !!newPinned });
  }

  // ─── POST /api/users/register ─────────────────
  if (path === "/api/users/register" && method === "POST") {
    const body = (await parseBody(req)) as { wallet: string; callsign: string };
    // Validate callsign: alphanumeric + underscore + hyphen, max 30 chars
    const callsign = String(body.callsign || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 30);
    if (!callsign || !body.wallet) return json({ error: "Invalid wallet or callsign" }, 400);
    // Check uniqueness
    const existing = d.query("SELECT callsign FROM users WHERE callsign = $callsign")
      .get({ $callsign: callsign }) as UserRow | null;
    if (existing) return json({ error: "Callsign taken" }, 409);
    const now = Date.now();
    d.run(
      "INSERT INTO users (wallet, callsign, created_at, updated_at) VALUES ($wallet, $callsign, $created_at, $updated_at)",
      { $wallet: body.wallet, $callsign: callsign, $created_at: now, $updated_at: now }
    );
    return json({ wallet: body.wallet, callsign, created_at: now });
  }

  // ─── GET /api/users/callsign/:callsign ────────
  const callsignCheckMatch = path.match(/^\/api\/users\/callsign\/(.+)$/);
  if (callsignCheckMatch && method === "GET") {
    const existing = d.query("SELECT callsign FROM users WHERE callsign = $callsign")
      .get({ $callsign: callsignCheckMatch[1] }) as UserRow | null;
    return json({ available: !existing });
  }

  // ─── GET /api/users/:wallet ───────────────────
  if (path.startsWith("/api/users/") && method === "GET") {
    // skip the /callsign/ sub-path and the register endpoint
    if (path.includes("/callsign/")) return null; // let it fall through
    const wallet = path.slice("/api/users/".length);
    const user = d.query("SELECT * FROM users WHERE wallet = $wallet")
      .get({ $wallet: wallet }) as UserRow | null;
    if (!user) return json({ error: "Not found" }, 404);
    return json({ wallet: user.wallet, callsign: user.callsign, created_at: user.created_at });
  }

  // ─── POST /api/sell/payout ──────────────────
  if (path === "/api/sell/payout" && method === "POST") {
    const body = (await parseBody(req)) as {
      chain: "solana" | "ethereum";
      toAddress: string;
      amount: number;
      tokenId: string;
      userId: string;
    };

    const chain = body.chain;
    const toAddress = body.toAddress;
    const amount = body.amount;

    if ((chain !== "solana" && chain !== "ethereum") || !toAddress || !amount || amount <= 0) {
      return json({ success: false, error: "Invalid payout request" }, 400);
    }

    // Payout signing is a protected server-runtime concern, not a build/startup
    // prerequisite. Fail closed before inspecting balances when its route secret is
    // absent or malformed; never queue or simulate a payout without a signer.
    if (chain === "solana" && !decodeSolanaSecretKey(
      getRequiredServerSecret("SELL_POOL_SOLANA_PRIVATE_KEY") || "",
    )) {
      return json({ success: false, error: "Server payout is not configured." }, 503);
    }
    if (chain === "ethereum" && !isEthereumPrivateKey(
      getRequiredServerSecret("SELL_POOL_ETHEREUM_PRIVATE_KEY") || "",
    )) {
      return json({ success: false, error: "Server payout is not configured." }, 503);
    }
    // Check pool balance
    const poolBal = d.query("SELECT sol, eth FROM pool_balances WHERE id = 1").get() as { sol: number; eth: number } | null;
    const poolBalance = poolBal ? (chain === "solana" ? poolBal.sol : poolBal.eth) : 0;

    if (poolBalance < amount) {
      return json({
        success: false,
        error: `Insufficient pool balance. Pool has ${poolBalance.toFixed(6)} ${chain === "solana" ? "SOL" : "ETH"}, requested ${amount.toFixed(6)}`,
        poolBalance,
      }, 400);
    }

    // Try server-side signing if private key is configured
    let txHash = "";
    let realTx = false;

    if (chain === "solana") {
      const secretKey = decodeSolanaSecretKey(
        getRequiredServerSecret("SELL_POOL_SOLANA_PRIVATE_KEY") || "",
      );
      if (!secretKey) {
        return json({ success: false, error: "Server payout is not configured." }, 503);
      }
      try {
        const { Keypair, Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL, sendAndConfirmTransaction } = await import("@solana/web3.js");
        const poolKeypair = Keypair.fromSecretKey(secretKey);
        const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");
        const toPubkey = new PublicKey(toAddress);
        const lamports = Math.floor(amount * LAMPORTS_PER_SOL);

        const transaction = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: poolKeypair.publicKey,
            toPubkey: toPubkey,
            lamports,
          })
        );

        const signature = await sendAndConfirmTransaction(connection, transaction, [poolKeypair]);
        txHash = signature;
        realTx = true;
      } catch {
        console.error("Solana sell payout failed");
        return json({ success: false, error: "Transaction failed." }, 500);
      }
    } else if (chain === "ethereum") {
      const privKey = getRequiredServerSecret("SELL_POOL_ETHEREUM_PRIVATE_KEY");
      if (!privKey || !isEthereumPrivateKey(privKey)) {
        return json({ success: false, error: "Server payout is not configured." }, 503);
      }
      try {
        const { Wallet, JsonRpcProvider, parseEther } = await import("ethers");
        const provider = new JsonRpcProvider("https://eth.llamarpc.com");
        const wallet = new Wallet(privKey, provider);
        const tx = await wallet.sendTransaction({
          to: toAddress,
          value: parseEther(amount.toFixed(18)),
        });
        await tx.wait();
        txHash = tx.hash;
        realTx = true;
      } catch {
        console.error("Ethereum sell payout failed");
        return json({ success: false, error: "Transaction failed." }, 500);
      }
    }

    // Deduct from pool balance
    d.run(
      `UPDATE pool_balances SET ${chain} = ${chain} - $amount WHERE id = 1`,
      { $amount: amount }
    );

    // Record the payout in events
    const eventId = `payout-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    d.run(
      `INSERT OR REPLACE INTO events (id, type, message, tokenName, tokenTicker, blockchain, wallet, amount, timestamp)
       VALUES ($id, $type, $message, $tokenName, $tokenTicker, $blockchain, $wallet, $amount, $timestamp)`,
      {
        $id: eventId,
        $type: "sell_payout",
        $message: realTx ? `Sent ${amount.toFixed(6)} ${chain === "solana" ? "SOL" : "ETH"} payout` : `Queued ${amount.toFixed(6)} ${chain === "solana" ? "SOL" : "ETH"} payout (pending)`,
        $tokenName: body.tokenId || "",
        $tokenTicker: "",
        $blockchain: chain,
        $wallet: toAddress,
        $amount: amount,
        $timestamp: Date.now(),
      }
    );

    return json({
      success: true,
      txHash: txHash || `pending-${Date.now().toString(36)}`,
      realTx,
      amount,
      chain,
    });
  }

  // ─── GET /api/trades/wallet/:wallet ────────────
  const walletTradesMatch = path.match(/^\/api\/trades\/wallet\/(.+)$/);
  if (walletTradesMatch && method === "GET") {
    const trades = d.query("SELECT * FROM trades WHERE wallet = $wallet ORDER BY timestamp DESC LIMIT 500").all({ $wallet: walletTradesMatch[1] });
    return json(trades);
  }

  // ─── GET /api/creators/:wallet/earnings ─────────
  const creatorEarningsMatch = path.match(/^\/api\/creators\/(.+)\/earnings$/);
  if (creatorEarningsMatch && method === "GET") {
    const wallet = creatorEarningsMatch[1];
    const tokens = d.query("SELECT * FROM tokens WHERE creator = $creator").all({ $creator: wallet }) as TokenRow[];
    const bcRows = d.query("SELECT * FROM bonding_curves").all() as BondingCurveRow[];
    const bcMap = new Map(bcRows.map((r) => [r.tokenId, JSON.parse(r.state)]));

    let totalEarnings = 0;
    const perToken: { tokenId: string; tokenName: string; ticker: string; earnings: number; tradeCount: number; volume: number; graduated: boolean; }[] = [];

    for (const token of tokens) {
      const bcState = bcMap.get(token.id);
      const earnings = bcState?.creatorEarnings || 0;
      totalEarnings += earnings;
      const tokenTrades = d.query("SELECT COUNT(*) as c, COALESCE(SUM(total), 0) as v FROM trades WHERE tokenId = $tid").get({ $tid: token.id }) as { c: number; v: number };
      perToken.push({
        tokenId: token.id,
        tokenName: token.name,
        ticker: token.ticker,
        earnings,
        tradeCount: tokenTrades.c,
        volume: tokenTrades.v,
        graduated: bcState?.graduated || false,
      });
    }

    return json({ totalEarnings, tokens: perToken });
  }


  // ─── GET /api/presence/ping ──────────────────
  if (path === "/api/presence/ping" && method === "GET") {
    const visitorId = url.searchParams.get("visitorId") || "unknown";
    const now = Date.now();
    d.run(
      "INSERT OR REPLACE INTO presence (visitorId, lastSeen) VALUES ($vid, $ts)",
      { $vid: visitorId, $ts: now }
    );
    return json({ ok: true });
  }

  // ─── GET /api/presence/count ──────────────────
  if (path === "/api/presence/count" && method === "GET") {
    const cutoff = Date.now() - 15000; // 15 seconds
    const row = d.query(
      "SELECT COUNT(DISTINCT visitorId) as c FROM presence WHERE lastSeen > $cutoff"
    ).get({ $cutoff: cutoff }) as { c: number } | null;
    return json({ count: row?.c || 0 });
  }

  // ─── GET /api/announcements ──────────────────
  if (path === "/api/announcements" && method === "GET") {
    const announcements: string[] = [];

    // 1. Recently created tokens (last 10 min)
    const recentCutoff = Date.now() - 600000;
    const recentTokens = d.query(
      "SELECT ticker, createdAt FROM tokens WHERE createdAt > $cutoff ORDER BY createdAt DESC LIMIT 5"
    ).all({ $cutoff: recentCutoff }) as { ticker: string; createdAt: number }[];
    for (const t of recentTokens) {
      announcements.push("🚀 $" + t.ticker + " JUST LAUNCHED");
    }

    // 2. Recently graduated tokens
    const bcRows = d.query("SELECT * FROM bonding_curves").all() as BondingCurveRow[];
    const graduatedTokens: { ticker: string; tokenId: string }[] = [];
    for (const bc of bcRows) {
      const state = JSON.parse(bc.state);
      if (state.graduated && state.lastTradeTimestamp > Date.now() - 3600000) {
        const tok = d.query("SELECT ticker FROM tokens WHERE id = $id").get({ $id: bc.tokenId }) as { ticker: string } | null;
        if (tok) graduatedTokens.push({ ticker: tok.ticker, tokenId: bc.tokenId });
      }
    }
    for (const gt of graduatedTokens.slice(0, 3)) {
      announcements.push("🎓 $" + gt.ticker + " GRADUATED TO DEX");
    }

    // 3. Largest trade in last hour
    const hourAgo = Date.now() - 3600000;
    const bigTrade = d.query(
      "SELECT total, tokenTicker FROM trades WHERE timestamp > $cutoff ORDER BY total DESC LIMIT 1"
    ).get({ $cutoff: hourAgo }) as { total: number; tokenTicker: string } | null;
    if (bigTrade && bigTrade.total > 0) {
      announcements.push("🐋 WHALE ALERT: " + bigTrade.total.toFixed(2) + " SOL TRADE ON $" + bigTrade.tokenTicker);
    }

    // 4. Top creator by earnings
    const creators = new Map<string, number>();
    for (const bc of bcRows) {
      const state = JSON.parse(bc.state);
      if (state.creatorEarnings > 0 && state.creatorAddress) {
        creators.set(state.creatorAddress, (creators.get(state.creatorAddress) || 0) + state.creatorEarnings);
      }
    }
    const topCreator = [...creators.entries()].sort((a, b) => b[1] - a[1])[0];
    if (topCreator) {
      announcements.push(`🏆 ${topCreator[0].slice(0, 4)}...${topCreator[0].slice(-4)} IS TOP CREATOR THIS WEEK`);
    }

    // 5. Tokens created today
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const todayTokens = d.query(
      "SELECT COUNT(*) as c FROM tokens WHERE createdAt > $cutoff"
    ).get({ $cutoff: startOfDay.getTime() }) as { c: number } | null;
    const todayCount = todayTokens?.c || 0;
    if (todayCount > 0) {
      announcements.push(`📊 ${todayCount} TOKENS CREATED TODAY`);
    }

    // 6. Top gainer (by price history change)
    const allTokens = d.query("SELECT * FROM tokens ORDER BY createdAt DESC LIMIT 50").all() as TokenRow[];
    let bestGainer = { ticker: "", change: 0 };
    for (const t of allTokens) {
      try {
        const hist: number[] = JSON.parse(t.priceHistory || "[]");
        if (hist.length >= 2) {
          const change = ((hist[hist.length - 1] - hist[0]) / hist[0]) * 100;
          if (change > bestGainer.change && change > 0) {
            bestGainer = { ticker: t.ticker, change };
          }
        }
      } catch {}
    }
    if (bestGainer.ticker) {
      announcements.push("💎 $" + bestGainer.ticker + " UP " + bestGainer.change.toFixed(1) + "% IN 24H");
    }

    // Default if no announcements generated
    if (announcements.length === 0) {
      announcements.push("📡 NETWORK STATUS: ALL SYSTEMS NOMINAL");
      announcements.push("🚀 LAUNCH YOUR FIRST MEME COIN TODAY");
      announcements.push("💡 PRO TIP: CREATE A TOKEN TO START EARNING FEES");
    }

    return json(announcements);
  }

  // ─── POST /api/stripe/create-checkout-session ──
  if (path === "/api/stripe/create-checkout-session" && method === "POST") {
    const body = (await parseBody(req)) as {
      tool_id: string;
      wallet: string;
      success_url: string;
      cancel_url: string;
    };
    const { tool_id, wallet, success_url, cancel_url } = body;

    if (!tool_id || !wallet) {
      return json({ error: "Missing tool_id or wallet" }, 400);
    }

    const toolInfo = TOOL_PRICE_MAP[tool_id];
    if (!toolInfo) {
      return json({ error: `Unknown tool_id: ${tool_id}` }, 400);
    }

    try {
      const s = getStripe();
      const session = await s.checkout.sessions.create({
        mode: "payment",
        line_items: [
          {
            price: toolInfo.priceId,
            quantity: 1,
          },
        ],
        success_url: success_url || `${new URL(req.url).origin}/buy?purchased=${tool_id}`,
        cancel_url: cancel_url || `${new URL(req.url).origin}/buy`,
        metadata: {
          wallet,
          tool_id,
        },
      });

      // Store a pending purchase record
      const purchaseId = `purch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      d.run(
        `INSERT INTO purchases (id, wallet, tool_id, stripe_session_id, status, amount_cents, created_at, updated_at)
         VALUES ($id, $wallet, $tool_id, $sessionId, 'pending', $amount, datetime('now'), datetime('now'))`,
        {
          $id: purchaseId,
          $wallet: wallet,
          $tool_id: tool_id,
          $sessionId: session.id,
          $amount: toolInfo.amountCents,
        }
      );

      return json({ url: session.url, sessionId: session.id });
    } catch (err: any) {
      console.error("Stripe checkout session creation failed:", err);
      return json({ error: err.message || "Failed to create checkout session" }, 500);
    }
  }

  // ─── POST /api/stripe/webhook ──────────────────
  if (path === "/api/stripe/webhook" && method === "POST") {
    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      return json({ error: "Missing stripe-signature header" }, 400);
    }

    try {
      const rawBody = await req.text();

      if (!STRIPE_WEBHOOK_SECRET || STRIPE_WEBHOOK_SECRET.includes("placeholder")) {
        console.warn("⚠️ Received webhook but STRIPE_WEBHOOK_SECRET is a placeholder — skipping verification");
        return json({ received: true, warning: "Webhook secret not configured" });
      }

      const s = getStripe();
      const event = s.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET);

      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          const sessionId = session.id;
          const toolId = session.metadata?.tool_id || PRICE_TO_TOOL_MAP[session.line_items?.data?.[0]?.price?.id || ""] || "unknown";
          const wallet = session.metadata?.wallet || "";

          // Mark the original purchase record as completed
          d.run(
            "UPDATE purchases SET status = 'completed', updated_at = datetime('now') WHERE stripe_session_id = $sessionId",
            { $sessionId: sessionId }
          );

          // If this is a tool pack, create purchase records for each included tool
          const packTools = PACK_TOOLS[toolId];
          if (packTools && packTools.length > 0 && wallet) {
            for (const includedToolId of packTools) {
              // Check if this tool was already purchased by this wallet
              const existing = d.query(
                "SELECT id FROM purchases WHERE wallet = $wallet AND tool_id = $toolId AND status = 'completed' LIMIT 1"
              ).get({ $wallet: wallet, $toolId: includedToolId });
              if (!existing) {
                const purchaseId = `purch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${includedToolId}`;
                d.run(
                  `INSERT INTO purchases (id, wallet, tool_id, stripe_session_id, status, amount_cents, created_at, updated_at)
                   VALUES ($id, $wallet, $toolId, $sessionId, 'completed', 0, datetime('now'), datetime('now'))`,
                  { $id: purchaseId, $wallet: wallet, $toolId: includedToolId, $sessionId: `${sessionId}:${includedToolId}` }
                );
              }
            }
            console.log(`✅ Pack purchase completed: session=${sessionId}, pack=${toolId}, tools=${packTools.join(", ")}`);
          } else {
            console.log(`✅ Purchase completed: session=${sessionId}, tool=${toolId}`);
          }
          break;
        }

        case "checkout.session.expired": {
          const session = event.data.object as Stripe.Checkout.Session;
          d.run(
            "UPDATE purchases SET status = 'expired', updated_at = datetime('now') WHERE stripe_session_id = $sessionId",
            { $sessionId: session.id }
          );

          console.log(`⏰ Purchase expired: session=${session.id}`);
          break;
        }

        default:
          console.log(`Unhandled webhook event type: ${event.type}`);
      }

      return json({ received: true });
    } catch (err: any) {
      console.error("Stripe webhook error:", err);
      return json({ error: `Webhook error: ${err.message}` }, 400);
    }
  }

  // ─── POST /api/graduate/solana ──────────────────
  // Server-side Solana token graduation.
  // Uses SOLANA_POOL_PRIVATE_KEY env var to deploy SPL token.
  // Platform wallet pays gas — no user wallet needed.
  if (path === "/api/graduate/solana" && method === "POST") {
    const body = (await parseBody(req)) as {
      tokenId: string;
      tokenName: string;
      tokenSymbol: string;
      tokenSupply: number;
      creatorAddress: string;
    };

    const { tokenId, tokenName, tokenSymbol, tokenSupply, creatorAddress } = body;

    if (!tokenId || !tokenName || !tokenSymbol || !tokenSupply) {
      return json({ success: false, error: "Missing required fields" }, 400);
    }

    const secretKey = decodeSolanaSecretKey(
      getRequiredServerSecret("SOLANA_POOL_PRIVATE_KEY") || "",
    );
    if (!secretKey) {
      return json({
        success: false,
        error: "Server graduation wallet is not configured.",
        needsManual: true,
      }, 503);
    }

    try {
      const {
        Keypair,
        Connection,
        PublicKey,
        Transaction,
      } = await import("@solana/web3.js");
      const {
        createMint,
        getOrCreateAssociatedTokenAccount,
        mintTo,
      } = await import("@solana/spl-token");

      const poolKeypair = Keypair.fromSecretKey(secretKey);

      const connection = new Connection(
        "https://api.mainnet-beta.solana.com",
        "confirmed",
      );

      const decimals = 6;
      const mintAmount = BigInt(tokenSupply) * BigInt(10 ** decimals);

      // Step 1: Create SPL token mint
      const mint = await createMint(
        connection,
        poolKeypair,
        poolKeypair.publicKey,
        null,
        decimals,
      );

      // Step 2: Create associated token account
      const ata = await getOrCreateAssociatedTokenAccount(
        connection,
        poolKeypair,
        mint,
        poolKeypair.publicKey,
      );

      // Step 3: Mint total supply
      await mintTo(
        connection,
        poolKeypair,
        mint,
        ata.address,
        poolKeypair.publicKey,
        mintAmount,
      );

      const dexAddress = mint.toBase58();

      // Step 4: Update bonding curve state
      const bcRow = d.query("SELECT * FROM bonding_curves WHERE tokenId = $id").get({
        $id: tokenId,
      }) as BondingCurveRow | null;

      if (bcRow) {
        const state = JSON.parse(bcRow.state);
        state.graduated = true;
        state.bondingCurveActive = false;
        state.dexAddress = dexAddress;
        d.run("UPDATE bonding_curves SET state = $state WHERE tokenId = $id", {
          $state: JSON.stringify(state),
          $id: tokenId,
        });
      }

      // Step 5: Update token record
      d.run("UPDATE tokens SET tokenAddress = $addr, verified = 1 WHERE id = $id", {
        $addr: dexAddress,
        $id: tokenId,
      });

      // Step 6: Record graduation event
      const eventId = `grad-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      d.run(
        `INSERT OR REPLACE INTO events (id, type, message, tokenName, tokenTicker, blockchain, wallet, amount, timestamp)
         VALUES ($id, $type, $message, $tokenName, $tokenTicker, $blockchain, $wallet, $amount, $timestamp)`,
        {
          $id: eventId,
          $type: "graduation",
          $message: `🎓 ${tokenName} (${tokenSymbol}) graduated to Raydium!`,
          $tokenName: tokenName,
          $tokenTicker: tokenSymbol,
          $blockchain: "solana",
          $wallet: creatorAddress || "",
          $amount: null,
          $timestamp: Date.now(),
        },
      );

      return json({
        success: true,
        txHash: dexAddress,
        dexAddress,
        message: "Token graduated to Raydium!",
      });
    } catch {
      console.error("Solana graduation failed");
      return json({
        success: false,
        error: "Failed to graduate Solana token",
      }, 500);
    }
  }

  // ─── GET /api/purchases?wallet= ────────────────
  if (path === "/api/purchases" && method === "GET") {
    const wallet = url.searchParams.get("wallet");
    if (!wallet) {
      return json({ error: "Missing wallet parameter" }, 400);
    }

    const purchases = d.query(
      "SELECT tool_id, status, amount_cents, created_at FROM purchases WHERE wallet = $wallet AND status = 'completed' ORDER BY created_at DESC"
    ).all({ $wallet: wallet }) as { tool_id: string; status: string; amount_cents: number; created_at: string }[];

    return json(purchases);
  }

  // ─── Push Subscription API ────────────────────

  // POST /api/push-subscriptions — save a new subscription
  if (path === "/api/push-subscriptions" && method === "POST") {
    const body = (await parseBody(req)) as {
      endpoint: string;
      keys: { p256dh: string; auth: string };
      wallet?: string;
    };
    if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
      return json({ error: "Missing required fields: endpoint, keys.p256dh, keys.auth" }, 400);
    }
    try {
      d.run(
        `INSERT OR REPLACE INTO push_subscriptions (endpoint, p256dh, auth, wallet, notification_types)
         VALUES ($endpoint, $p256dh, $auth, $wallet, $types)`,
        {
          $endpoint: body.endpoint,
          $p256dh: body.keys.p256dh,
          $auth: body.keys.auth,
          $wallet: body.wallet || "",
          $types: JSON.stringify(["price_alerts", "new_launches"]),
        }
      );
      return json({ success: true });
    } catch (err: any) {
      return json({ error: err?.message || "Failed to save subscription" }, 500);
    }
  }

  // GET /api/push-subscriptions?wallet= — list subscriptions
  if (path === "/api/push-subscriptions" && method === "GET") {
    const wallet = url.searchParams.get("wallet");
    const endpoint = url.searchParams.get("endpoint");

    if (endpoint) {
      const sub = d.query(
        "SELECT * FROM push_subscriptions WHERE endpoint = $endpoint"
      ).get({ $endpoint: endpoint });
      return json(sub || null);
    }

    if (wallet) {
      const subs = d.query(
        "SELECT * FROM push_subscriptions WHERE wallet = $wallet ORDER BY created_at DESC"
      ).all({ $wallet: wallet });
      return json(subs);
    }

    return json({ error: "Missing wallet or endpoint parameter" }, 400);
  }

  // DELETE /api/push-subscriptions?endpoint= — remove a subscription
  if (path === "/api/push-subscriptions" && method === "DELETE") {
    const endpoint = url.searchParams.get("endpoint");
    if (!endpoint) {
      return json({ error: "Missing endpoint parameter" }, 400);
    }
    d.run("DELETE FROM push_subscriptions WHERE endpoint = $endpoint", {
      $endpoint: endpoint,
    });
    return json({ success: true });
  }

  // PATCH /api/push-subscriptions/types — update notification type preferences
  if (path === "/api/push-subscriptions/types" && method === "PATCH") {
    const body = (await parseBody(req)) as {
      endpoint: string;
      types: string[];
    };
    if (!body.endpoint || !body.types) {
      return json({ error: "Missing required fields" }, 400);
    }
    d.run(
      "UPDATE push_subscriptions SET notification_types = $types WHERE endpoint = $endpoint",
      {
        $types: JSON.stringify(body.types),
        $endpoint: body.endpoint,
      }
    );
    return json({ success: true });
  }

  // ─── Push Sending Endpoints ───────────────────

  // POST /api/push/send-price-alert — send push to subscribers
  if (path === "/api/push/send-price-alert" && method === "POST") {
    const body = (await parseBody(req)) as {
      tokenId: string;
      tokenName: string;
      ticker: string;
      targetPrice: number;
      currentPrice: number;
      blockchain: string;
    };
    if (!body.tokenId || !body.ticker) {
      return json({ error: "Missing required fields" }, 400);
    }
    const result = await sendPriceAlertPush(body);
    return json(result);
  }

  // POST /api/push/send-new-launch — send push to followers of creator
  if (path === "/api/push/send-new-launch" && method === "POST") {
    const body = (await parseBody(req)) as {
      tokenId: string;
      name: string;
      ticker: string;
      blockchain: string;
      creator: string;
    };
    if (!body.tokenId || !body.ticker) {
      return json({ error: "Missing required fields" }, 400);
    }
    const result = await sendNewLaunchPush(body);
    return json(result);
  }

  // ─── Referral API ────────────────────────────

  // POST /api/referrals — track a referral event
  if (path === "/api/referrals" && method === "POST") {
    const body = (await parseBody(req)) as {
      referrerCode: string;
      referredWallet: string;
      status: string;
      rewardAmount?: number;
      rewardChain?: string;
      tokenId?: string;
    };
    if (!body.referrerCode || !body.referredWallet) {
      return json({ error: "Missing referrerCode or referredWallet" }, 400);
    }

    const tierMap: Record<string, number> = {
      visited: 0,
      signed_up: 1,
      created_token: 2,
      made_trade: 3,
    };
    const rewardTier = tierMap[body.status] || 0;
    const rewardAmount = body.rewardAmount || 0;
    const rewardChain = body.rewardChain || "";

    // Upsert: if already exists with equal or higher tier, skip
    const existing = d.query(
      "SELECT reward_tier FROM referrals WHERE referrer_code = $rc AND referred_wallet = $rw AND status = $status"
    ).get({ $rc: body.referrerCode, $rw: body.referredWallet, $status: body.status }) as { reward_tier: number } | null;

    if (existing) {
      // Already tracked at this status, nothing to do
      return json({ success: true, alreadyTracked: true });
    }

    const id = `ref-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    d.run(
      `INSERT INTO referrals (id, referrer_code, referred_wallet, timestamp, status, reward_tier, reward_amount, reward_chain, token_id)
       VALUES ($id, $rc, $rw, $ts, $st, $rt, $ra, $rch, $tid)`,
      {
        $id: id,
        $rc: body.referrerCode,
        $rw: body.referredWallet,
        $ts: Date.now(),
        $st: body.status,
        $rt: rewardTier,
        $ra: rewardAmount,
        $rch: rewardChain,
        $tid: body.tokenId || "",
      }
    );
    return json({ success: true, id });
  }

  // GET /api/referrals?wallet= — get referral stats for a wallet
  if (path === "/api/referrals" && method === "GET") {
    const wallet = url.searchParams.get("wallet");
    if (!wallet) {
      return json({ error: "Missing wallet parameter" }, 400);
    }
    const code = wallet.slice(0, 8).toUpperCase();

    const allRefs = d.query(
      "SELECT * FROM referrals WHERE referrer_code = $code ORDER BY timestamp DESC"
    ).all({ $code: code }) as {
      id: string; referrer_code: string; referred_wallet: string;
      timestamp: number; status: string; reward_tier: number;
      reward_amount: number; reward_chain: string; token_id: string;
    }[];

    const totalReferrals = allRefs.length;
    const tokensCreated = allRefs.filter((r) => r.reward_tier >= 2).length;
    const tradesMade = allRefs.filter((r) => r.reward_tier >= 3).length;
    const totalRewards = allRefs.reduce((sum, r) => sum + r.reward_amount, 0);

    // Group by referred wallet to get the highest status per user
    const walletMap = new Map<string, {
      referredWallet: string; status: string; rewardTier: number;
      rewardAmount: number; rewardChain: string; tokenId: string; timestamp: number;
    }>();
    for (const r of allRefs) {
      const existing = walletMap.get(r.referred_wallet);
      if (!existing || r.reward_tier > existing.rewardTier) {
        walletMap.set(r.referred_wallet, {
          referredWallet: r.referred_wallet,
          status: r.status,
          rewardTier: r.reward_tier,
          rewardAmount: r.reward_amount,
          rewardChain: r.reward_chain,
          tokenId: r.token_id,
          timestamp: r.timestamp,
        });
      }
    }

    const referrals = Array.from(walletMap.values());

    return json({
      referralCode: code,
      totalReferrals,
      tokensCreated,
      tradesMade,
      totalRewards,
      referrals,
    });
  }

  // GET /api/referrals/leaderboard — top referrers
  if (path === "/api/referrals/leaderboard" && method === "GET") {
    const rows = d.query(
      `SELECT referrer_code, COUNT(DISTINCT referred_wallet) as referral_count,
              COALESCE(SUM(reward_amount), 0) as total_rewards
       FROM referrals
       GROUP BY referrer_code
       ORDER BY referral_count DESC, total_rewards DESC
       LIMIT 50`
    ).all() as { referrer_code: string; referral_count: number; total_rewards: number }[];

    const leaderboard = rows.map((r, i) => ({
      rank: i + 1,
      referrerWallet: r.referrer_code,
      referralCode: r.referrer_code,
      referralCount: r.referral_count,
      totalRewards: r.total_rewards,
    }));

    return json(leaderboard);
  }

  return json({ error: "Not found" }, 404);
}
/home/agent-lead/.profile: line 29: /home/agent-lead/.cargo/env: No such file or directory
/home/agent-lead/.profile: line 29: /home/agent-lead/.cargo/env: No such file or directory
