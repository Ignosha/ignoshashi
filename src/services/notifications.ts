// ignoshashi Browser Push Notifications Service
// Manages Web Notification API with cross-tab sync via BroadcastChannel
// Retro arcade styling: pixel coin icon, arcade beep sound

const CHANNEL_NAME = "ignoshashi";
const NOTIFICATION_PERMISSION_KEY = "ignoshashi_notification_permission";
const NOTIFICATIONS_ENABLED_KEY = "ignoshashi_notifications_enabled";

export type NotificationPermissionState = "granted" | "denied" | "default";

// ─── Permission Management ───────────────────────

/** Check if the Notification API is supported */
export function isSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/** Get current browser notification permission */
export function getPermission(): NotificationPermissionState {
  if (!isSupported()) return "denied";
  return Notification.permission as NotificationPermissionState;
}

/** Check if user has explicitly opted in to ignoshashi notifications */
export function isNotificationsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(NOTIFICATIONS_ENABLED_KEY) === "true";
  } catch {
    return false;
  }
}

/** Set the user's notification opt-in state */
export function setNotificationsEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(NOTIFICATIONS_ENABLED_KEY, String(enabled));
    // Broadcast to other tabs
    broadcastPermissionChange(enabled);
  } catch { /* ignore */ }
}

/** Request browser notification permission. Returns the resulting state. */
export async function requestPermission(): Promise<NotificationPermissionState> {
  if (!isSupported()) return "denied";

  try {
    const result = await Notification.requestPermission();
    if (result === "granted") {
      setNotificationsEnabled(true);
    }
    broadcastPermissionChange(result === "granted");
    return result as NotificationPermissionState;
  } catch {
    return "denied";
  }
}

// ─── Sound ───────────────────────────────────────

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  // Resume if suspended (autoplay policy)
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/** Play a retro arcade beep sound */
export function playArcadeBeep(frequency = 440, duration = 100, type: OscillatorType = "square"): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration / 1000);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration / 1000);
  } catch { /* ignore audio errors */ }
}

/** Play a retro two-tone alert (like a coin collect sound) */
export function playAlertSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    // First tone - low
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "square";
    osc1.frequency.setValueAtTime(330, ctx.currentTime);
    gain1.gain.setValueAtTime(0.25, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.08);

    // Second tone - high
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "square";
    osc2.frequency.setValueAtTime(660, ctx.currentTime + 0.08);
    gain2.gain.setValueAtTime(0.25, ctx.currentTime + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(ctx.currentTime + 0.08);
    osc2.stop(ctx.currentTime + 0.18);
  } catch { /* ignore */ }
}

// ─── Notification Sending ────────────────────────

export interface NotificationOptions {
  body: string;
  tag?: string;
  icon?: string;
  data?: Record<string, unknown>;
  requireInteraction?: boolean;
  silent?: boolean;
}

/** Check if we should send: permission granted AND user opted in */
function canSend(): boolean {
  return isSupported() && getPermission() === "granted" && isNotificationsEnabled();
}

/** Generate a retro pixel coin icon as a data URL for notifications */
function getDefaultIcon(): string {
  // Base64 of a tiny 16x16 pixel coin PNG (green/gold retro style)
  // This is a minimal 16x16 icon encoded for notifications
  return "data:image/svg+xml," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16"><rect x="3" y="1" width="10" height="1" fill="#1a1a0e"/><rect x="2" y="2" width="2" height="1" fill="#1a1a0e"/><rect x="12" y="2" width="2" height="1" fill="#1a1a0e"/><rect x="2" y="3" width="1" height="10" fill="#1a1a0e"/><rect x="13" y="3" width="1" height="10" fill="#1a1a0e"/><rect x="2" y="13" width="2" height="1" fill="#1a1a0e"/><rect x="12" y="13" width="2" height="1" fill="#1a1a0e"/><rect x="3" y="14" width="10" height="1" fill="#1a1a0e"/><rect x="3" y="2" width="10" height="1" fill="#ffd700"/><rect x="12" y="3" width="1" height="10" fill="#ffd700"/><rect x="3" y="3" width="2" height="10" fill="#00cc00"/><rect x="5" y="3" width="5" height="2" fill="#ffd700"/><rect x="11" y="3" width="1" height="10" fill="#ffd700"/><rect x="5" y="5" width="5" height="8" fill="#ffe44d"/><rect x="7" y="6" width="2" height="6" fill="#00ff41"/></svg>`
  );
}

/** Send a browser notification. Returns true if sent successfully. */
export function sendNotification(
  title: string,
  options: NotificationOptions
): boolean {
  if (!canSend()) return false;

  try {
    const notif = new Notification(title, {
      body: options.body,
      tag: options.tag,
      icon: options.icon || getDefaultIcon(),
      requireInteraction: options.requireInteraction || false,
      silent: options.silent || false,
      data: options.data || {},
    });

    // Click handler: navigate or focus window
    notif.onclick = () => {
      notif.close();
      if (options.data?.url) {
        window.focus();
        window.open(options.data.url as string, "_self");
      } else {
        window.focus();
      }
    };

    return true;
  } catch {
    return false;
  }
}

// ─── Specific Notification Types ─────────────────

export interface PriceAlertNotificationData {
  tokenId: string;
  tokenName: string;
  ticker: string;
  targetPrice: number;
  currentPrice: number;
  blockchain: "solana" | "ethereum";
}

/** Send a price alert push notification */
export function sendPriceAlertNotification(data: PriceAlertNotificationData): boolean {
  const currencySymbol = data.blockchain === "solana" ? "SOL" : "ETH";
  const fmtTarget = data.targetPrice < 0.0001 ? data.targetPrice.toFixed(8) : data.targetPrice.toFixed(6);
  const fmtCurrent = data.currentPrice < 0.0001 ? data.currentPrice.toFixed(8) : data.currentPrice.toFixed(6);

  const sent = sendNotification(
    `🚨 PRICE ALERT: $${data.ticker}`,
    {
      body: `Hit ${fmtTarget} ${currencySymbol} — current: ${fmtCurrent} ${currencySymbol}`,
      tag: `price-alert-${data.tokenId}`,
      data: { url: `/token/${data.tokenId}`, type: "price-alert", tokenId: data.tokenId },
      requireInteraction: true,
    }
  );

  if (sent) {
    playAlertSound();
  }

  return sent;
}

export interface NewLaunchNotificationData {
  tokenId: string;
  name: string;
  ticker: string;
  blockchain: "solana" | "ethereum";
  initialPrice: number;
}

// Track recently sent launch notifications to prevent duplicates
const sentLaunchNotifications = new Set<string>();

/** Send a new token launch push notification */
export function sendNewLaunchNotification(data: NewLaunchNotificationData): boolean {
  // Deduplicate: don't send the same token launch notification twice
  const dedupeKey = `new-launch-${data.tokenId}`;
  if (sentLaunchNotifications.has(dedupeKey)) return false;
  sentLaunchNotifications.add(dedupeKey);

  // Keep the set bounded
  if (sentLaunchNotifications.size > 200) {
    const arr = Array.from(sentLaunchNotifications);
    for (let i = 0; i < 50; i++) sentLaunchNotifications.delete(arr[i]);
  }

  const currencySymbol = data.blockchain === "solana" ? "SOL" : "ETH";
  const fmtPrice = data.initialPrice < 0.0001 ? data.initialPrice.toFixed(8) : data.initialPrice.toFixed(6);

  const sent = sendNotification(
    `🆕 NEW LAUNCH: $${data.ticker}`,
    {
      body: `${data.name} just launched — ${fmtPrice} ${currencySymbol} initial price`,
      tag: `new-launch-${data.tokenId}`,
      data: { url: `/token/${data.tokenId}`, type: "new-launch", tokenId: data.tokenId },
    }
  );

  if (sent) {
    playArcadeBeep(523, 80, "square"); // C5 note, short beep
  }

  return sent;
}

// ─── Cross-Tab BroadcastChannel ──────────────────

let broadcastChannel: BroadcastChannel | null = null;

function getBroadcastChannel(): BroadcastChannel | null {
  if (typeof window === "undefined") return null;
  if (!broadcastChannel) {
    try {
      broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
    } catch {
      return null;
    }
  }
  return broadcastChannel;
}

/** Broadcast that notification permission has changed */
function broadcastPermissionChange(enabled: boolean): void {
  const channel = getBroadcastChannel();
  if (!channel) return;
  try {
    channel.postMessage({ type: "notification-permission-changed", enabled });
  } catch { /* ignore */ }
}

/** Broadcast a price alert so other tabs can display the browser notification */
export function broadcastPriceAlert(data: PriceAlertNotificationData): void {
  const channel = getBroadcastChannel();
  if (!channel) return;
  try {
    channel.postMessage({ type: "broadcast-price-alert", data });
  } catch { /* ignore */ }
}

/** Broadcast a new launch so other tabs can display the browser notification */
export function broadcastNewLaunch(data: NewLaunchNotificationData): void {
  const channel = getBroadcastChannel();
  if (!channel) return;
  try {
    channel.postMessage({ type: "broadcast-new-launch", data });
  } catch { /* ignore */ }
}

/**
 * Listen for cross-tab notification broadcasts.
 * Handles deduplication: only the receiving tab shows the browser notification.
 */
export type BroadcastHandler = (event: {
  type: string;
  data: unknown;
}) => void;

export function listenForBroadcasts(handler: BroadcastHandler): () => void {
  if (typeof window === "undefined") return () => {};

  const channel = getBroadcastChannel();
  if (!channel) return () => {};

  const onMessage = (event: MessageEvent) => {
    if (!event.data?.type) return;
    handler({ type: event.data.type, data: event.data.data || event.data });
  };

  channel.addEventListener("message", onMessage);

  return () => {
    channel.removeEventListener("message", onMessage);
  };
}

/**
 * Initialize the notification broadcast listener.
 * When another tab broadcasts a notification request, this tab shows the browser notification.
 */
export function initNotificationBroadcastListener(): () => void {
  return listenForBroadcasts((event) => {
    switch (event.type) {
      case "broadcast-price-alert": {
        const data = event.data as PriceAlertNotificationData;
        if (data?.tokenId) {
          sendPriceAlertNotification(data);
        }
        break;
      }
      case "broadcast-new-launch": {
        const data = event.data as NewLaunchNotificationData;
        if (data?.tokenId) {
          sendNewLaunchNotification(data);
        }
        break;
      }
      case "notification-permission-changed": {
        // Sync localStorage state across tabs
        const { enabled } = event.data as { enabled: boolean };
        try {
          localStorage.setItem(NOTIFICATIONS_ENABLED_KEY, String(enabled));
          // Dispatch a local event so UI can react
          window.dispatchEvent(
            new CustomEvent("ignoshashi:notification-permission-changed", { detail: { enabled } })
          );
        } catch { /* ignore */ }
        break;
      }
    }
  });
}
