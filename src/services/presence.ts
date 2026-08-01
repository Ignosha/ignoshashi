/**
 * ignoshashi Multi-User Presence Tracking
 * 
 * Dual-mode: BroadcastChannel API for same-device tab tracking, plus
 * WebSocket integration for cross-device per-callsign presence.
 * Each tab announces itself every 3 seconds with a unique ID + username.
 * Tabs that haven't pinged in 10 seconds are considered offline.
 * When WebSocket is connected, per-callsign presence is authoritative.
 */

const CHANNEL_NAME = "ignoshashi_presence";
const PING_INTERVAL = 3000; // 3 seconds
const STALE_THRESHOLD = 10000; // 10 seconds
const STORAGE_KEY = "ignoshashi_presence_users";

export interface PresenceUser {
  id: string;
  username: string;
  lastSeen: number;
}

export interface WsPresenceUser {
  callsign: string;
  online: boolean;
}

type PresenceCallback = (users: PresenceUser[], count: number) => void;
type WsPresenceCallback = (channel: string, users: WsPresenceUser[]) => void;

let channel: BroadcastChannel | null = null;
let userId: string = "";
let username: string = "";
let pingInterval: ReturnType<typeof setInterval> | null = null;
let listeners: Set<PresenceCallback> = new Set();
let currentUsers: PresenceUser[] = [];

// WebSocket presence state
let wsPresenceListeners: Set<WsPresenceCallback> = new Set();

function generateId(): string {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function loadStoredUsers(): PresenceUser[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveUsers(users: PresenceUser[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
  } catch { /* quota */ }
}

function mergeUsers(existing: PresenceUser[], newUser: PresenceUser): PresenceUser[] {
  const now = Date.now();
  // Filter out stale users
  const active = existing.filter((u) => now - u.lastSeen < STALE_THRESHOLD);
  // Upsert new user
  const idx = active.findIndex((u) => u.id === newUser.id);
  if (idx >= 0) {
    active[idx] = newUser;
  } else {
    active.push(newUser);
  }
  return active;
}

function removeUser(users: PresenceUser[], id: string): PresenceUser[] {
  const now = Date.now();
  return users.filter((u) => u.id !== id && now - u.lastSeen < STALE_THRESHOLD);
}

function notifyListeners(): void {
  const now = Date.now();
  const active = currentUsers.filter((u) => now - u.lastSeen < STALE_THRESHOLD);
  const count = active.length;
  listeners.forEach((cb) => cb(active, count));
}

function handleMessage(event: MessageEvent): void {
  const data = event.data;
  if (!data || !data.id) return;
  
  if (data.type === "ping") {
    currentUsers = mergeUsers(currentUsers, {
      id: data.id,
      username: data.username || "anon",
      lastSeen: Date.now(),
    });
    saveUsers(currentUsers);
    notifyListeners();
  } else if (data.type === "offline") {
    currentUsers = removeUser(currentUsers, data.id);
    saveUsers(currentUsers);
    notifyListeners();
  }
}

function sendPing(): void {
  if (!channel || !userId) return;
  
  channel.postMessage({
    type: "ping",
    id: userId,
    username: username || "user",
    timestamp: Date.now(),
  });
  
  // Also update self in current users
  currentUsers = mergeUsers(currentUsers, {
    id: userId,
    username: username || "user",
    lastSeen: Date.now(),
  });
  saveUsers(currentUsers);
  notifyListeners();
}

function sendOffline(): void {
  if (!channel || !userId) return;
  try {
    channel.postMessage({
      type: "offline",
      id: userId,
      timestamp: Date.now(),
    });
  } catch { /* channel may be closed */ }
}

/**
 * Initialize presence tracking.
 * Call once when the app loads (e.g., in __root or App component).
 */
export function initPresence(name?: string): void {
  if (typeof window === "undefined") return;
  if (channel) return; // Already initialized
  
  userId = generateId();
  username = name || localStorage.getItem("ignoshashi_community_username") || "anon";
  
  // Load existing users from localStorage
  currentUsers = loadStoredUsers();
  
  // Create BroadcastChannel
  try {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = handleMessage;
  } catch {
    // BroadcastChannel not supported — fall back to single-user mode
    console.warn("BroadcastChannel not supported. Multi-tab presence disabled.");
    channel = null;
    // Still track self
    currentUsers = [{
      id: userId,
      username,
      lastSeen: Date.now(),
    }];
    saveUsers(currentUsers);
    notifyListeners();
    return;
  }
  
  // Announce self
  sendPing();
  
  // Ping regularly
  pingInterval = setInterval(sendPing, PING_INTERVAL);
  
  // Handle unload
  window.addEventListener("beforeunload", () => {
    sendOffline();
    if (pingInterval) clearInterval(pingInterval);
    if (channel) {
      channel.close();
      channel = null;
    }
  });
  
  // Handle page hide (mobile)
  window.addEventListener("pagehide", () => {
    sendOffline();
  });
  
  // Initial notification
  notifyListeners();
}

/**
 * Subscribe to presence changes.
 * Returns unsubscribe function.
 */
export function onPresenceChange(callback: PresenceCallback): () => void {
  listeners.add(callback);
  // Immediately call with current state
  const now = Date.now();
  const active = currentUsers.filter((u) => now - u.lastSeen < STALE_THRESHOLD);
  callback(active, active.length);
  
  return () => {
    listeners.delete(callback);
  };
}

/**
 * Subscribe to WebSocket-based per-callsign presence updates.
 * Returns unsubscribe function.
 */
export function onWsPresenceChange(callback: WsPresenceCallback): () => void {
  wsPresenceListeners.add(callback);
  return () => {
    wsPresenceListeners.delete(callback);
  };
}

/**
 * Notify WS presence listeners of a presence update.
 * Called by the chatSocket when presence events arrive.
 */
export function notifyWsPresence(channel: string, users: WsPresenceUser[]): void {
  for (const cb of wsPresenceListeners) {
    try { cb(channel, users); } catch { /* */ }
  }
}

/**
 * Update the current user's display name.
 */
export function setPresenceUsername(name: string): void {
  username = name || "anon";
  if (typeof window !== "undefined") {
    localStorage.setItem("ignoshashi_community_username", name);
  }
  // Re-announce with new name
  sendPing();
}

/**
 * Get current online user count (synchronous).
 */
export function getOnlineCount(): number {
  const now = Date.now();
  return currentUsers.filter((u) => now - u.lastSeen < STALE_THRESHOLD).length;
}

/**
 * Get current online users (synchronous).
 */
export function getOnlineUsers(): PresenceUser[] {
  const now = Date.now();
  return currentUsers.filter((u) => now - u.lastSeen < STALE_THRESHOLD);
}

/**
 * Clean up. Call on app unmount.
 */
export function destroyPresence(): void {
  sendOffline();
  if (pingInterval) clearInterval(pingInterval);
  if (channel) {
    channel.close();
    channel = null;
  }
  listeners.clear();
  wsPresenceListeners.clear();
}

// ─── Global Visitor Counter (server-backed) ────

const VISITOR_ID_KEY = "ignoshashi_visitor_id";
let globalPollInterval: ReturnType<typeof setInterval> | null = null;

function getVisitorId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(VISITOR_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(VISITOR_ID_KEY, id);
  }
  return id;
}

/**
 * Send a heartbeat ping to the server to register this visitor.
 * Returns the visitor ID.
 */
export function pingServer(): void {
  const visitorId = getVisitorId();
  if (!visitorId) return;
  fetch(`/api/presence/ping?visitorId=${encodeURIComponent(visitorId)}`)
    .catch(() => { /* server may not be ready */ });
}

/**
 * Fetch the global online visitor count from the server.
 */
export async function fetchGlobalCount(): Promise<number> {
  try {
    const res = await fetch("/api/presence/count");
    if (res.ok) {
      const data = await res.json();
      return data.count || 0;
    }
  } catch {}
  return 0;
}

/**
 * Start global visitor polling (ping + count every 5 seconds).
 * Returns a stop function.
 */
export function startGlobalPresence(): () => void {
  pingServer();
  globalPollInterval = setInterval(pingServer, 5000);
  return () => {
    if (globalPollInterval) {
      clearInterval(globalPollInterval);
      globalPollInterval = null;
    }
  };
}
