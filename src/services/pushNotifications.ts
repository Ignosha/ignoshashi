// ignoshashi Web Push Notifications Service
// Manages Push API subscriptions, server-side persistence, and notification delivery.
// Complements the existing Web Notification API in notifications.ts with true background push.

const PUBLIC_VAPID_KEY = "BA8lI9NcibEgk8A1zKpvwrwt_iKFtqBnePvrPwpW8Iw6Z8jNg_R8invKfYv0Czm0eWoY1bJIjmhC-CxgdUVNOJA";

// ─── Types ─────────────────────────────────────

export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  wallet?: string;
}

export interface StoredSubscription {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  wallet: string;
  created_at: string;
  notification_types: string; // JSON array of enabled notification types
}

export type NotificationType = "price_alerts" | "new_launches";

// ─── Local Settings ────────────────────────────

const SETTINGS_KEY = "ignoshashi_push_settings";

export interface PushSettings {
  enabled: boolean;
  types: NotificationType[];
}

export function getPushSettings(): PushSettings {
  if (typeof window === "undefined") return { enabled: false, types: [] };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { enabled: false, types: [] };
}

export function savePushSettings(settings: PushSettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {}
}

// ─── Service Worker Registration ───────────────

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function getSWRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    return reg;
  } catch {
    // Try to register if not already
    try {
      return await navigator.serviceWorker.register("/sw.js");
    } catch {
      return null;
    }
  }
}

// ─── Subscription Management ────────────────────

/** Check if Push API is supported in this browser */
export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

/** Get current push subscription if one exists */
export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  const reg = await getSWRegistration();
  if (!reg) return null;
  try {
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/** Subscribe to push notifications. Returns the subscription data or null. */
export async function subscribeToPush(wallet?: string): Promise<PushSubscriptionData | null> {
  if (!isPushSupported()) return null;

  const reg = await getSWRegistration();
  if (!reg) return null;

  // Check for existing subscription
  let sub = await reg.pushManager.getSubscription();
  if (sub) {
    // Already subscribed — return the data
    return subscriptionToData(sub);
  }

  try {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY),
    });

    const data = subscriptionToData(sub);
    if (data && wallet) data.wallet = wallet;

    // Persist to server
    await saveSubscriptionToServer(data);

    // Save settings
    const settings = getPushSettings();
    settings.enabled = true;
    if (!settings.types.includes("price_alerts")) settings.types.push("price_alerts");
    if (!settings.types.includes("new_launches")) settings.types.push("new_launches");
    savePushSettings(settings);

    return data;
  } catch (err) {
    console.error("Push subscription failed:", err);
    return null;
  }
}

/** Unsubscribe from push notifications */
export async function unsubscribeFromPush(): Promise<boolean> {
  const sub = await getCurrentSubscription();
  if (!sub) return true;

  try {
    // Remove from server
    await deleteSubscriptionFromServer(sub.endpoint);

    // Unsubscribe in browser
    await sub.unsubscribe();

    // Update settings
    const settings = getPushSettings();
    settings.enabled = false;
    savePushSettings(settings);

    return true;
  } catch {
    return false;
  }
}

/** Convert PushSubscription to serializable data */
function subscriptionToData(sub: PushSubscription): PushSubscriptionData {
  const rawKey = sub.getKey("p256dh");
  const rawAuth = sub.getKey("auth");
  return {
    endpoint: sub.endpoint,
    keys: {
      p256dh: rawKey ? btoa(String.fromCharCode(...new Uint8Array(rawKey))) : "",
      auth: rawAuth ? btoa(String.fromCharCode(...new Uint8Array(rawAuth))) : "",
    },
  };
}

// ─── Server API ─────────────────────────────────

async function saveSubscriptionToServer(data: PushSubscriptionData | null): Promise<void> {
  if (!data) return;
  try {
    await fetch("/api/push-subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  } catch {}
}

async function deleteSubscriptionFromServer(endpoint: string): Promise<void> {
  try {
    await fetch(`/api/push-subscriptions?endpoint=${encodeURIComponent(endpoint)}`, {
      method: "DELETE",
    });
  } catch {}
}

/** Fetch all subscriptions for the current wallet (for admin/debug) */
export async function getSubscriptions(wallet: string): Promise<StoredSubscription[]> {
  try {
    const res = await fetch(`/api/push-subscriptions?wallet=${encodeURIComponent(wallet)}`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

/** Update notification type preferences for a subscription */
export async function updateNotificationTypes(
  endpoint: string,
  types: NotificationType[]
): Promise<void> {
  try {
    await fetch("/api/push-subscriptions/types", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint, types }),
    });
  } catch {}
}

// ─── Push Trigger Helpers (called from other services) ──

/**
 * Request the server to send a push notification for a price alert trigger.
 * The server looks up all subscriptions with price_alerts enabled and sends.
 */
export async function triggerPriceAlertPush(alert: {
  tokenId: string;
  tokenName: string;
  ticker: string;
  targetPrice: number;
  currentPrice: number;
  blockchain: "solana" | "ethereum";
}): Promise<void> {
  try {
    await fetch("/api/push/send-price-alert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(alert),
    });
  } catch {}
}

/**
 * Request the server to send a push notification for a new token launch.
 * Pass creator address so server can find followers.
 */
export async function triggerNewLaunchPush(token: {
  tokenId: string;
  name: string;
  ticker: string;
  blockchain: "solana" | "ethereum";
  creator: string;
}): Promise<void> {
  try {
    await fetch("/api/push/send-new-launch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(token),
    });
  } catch {}
}

// ─── Permission Flow ────────────────────────────

/** Check current push permission via Notification API */
export function getPushPermission(): NotificationPermission {
  if (!("Notification" in window)) return "denied";
  return Notification.permission;
}

/** Request permission (friendly flow). Returns the new permission state. */
export async function requestPushPermission(): Promise<NotificationPermission> {
  if (!("Notification" in window)) return "denied";
  try {
    const result = await Notification.requestPermission();
    return result;
  } catch {
    return "denied";
  }
}
