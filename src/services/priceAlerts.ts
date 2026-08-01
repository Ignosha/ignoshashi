// ignoshashi Price Alerts Service
// Manages user-configured price alerts stored in localStorage

export interface PriceAlert {
  id: string;
  tokenId: string;
  tokenName: string;
  ticker: string;
  targetPrice: number;
  condition: "above" | "below";
  note: string;
  blockchain: "solana" | "ethereum";
  createdAt: number;
  triggered: boolean;
  triggeredAt?: number;
}

const STORAGE_KEY = "ignoshashi_alerts";
const CHANNEL_NAME = "ignoshashi_price_alerts";

export function getAlerts(): PriceAlert[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function getAlertsForToken(tokenId: string): PriceAlert[] {
  return getAlerts().filter((a) => a.tokenId === tokenId && !a.triggered);
}

export function getActiveAlerts(): PriceAlert[] {
  return getAlerts().filter((a) => !a.triggered);
}

export function addAlert(alert: Omit<PriceAlert, "id" | "triggered" | "createdAt">): PriceAlert {
  const newAlert: PriceAlert = {
    ...alert,
    id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    triggered: false,
    createdAt: Date.now(),
  };
  const alerts = getAlerts();
  alerts.push(newAlert);
  safeSet(STORAGE_KEY, alerts);
  return newAlert;
}

export function removeAlert(id: string): void {
  const alerts = getAlerts().filter((a) => a.id !== id);
  safeSet(STORAGE_KEY, alerts);
}

export function clearTriggeredAlerts(): void {
  const alerts = getAlerts().filter((a) => !a.triggered);
  safeSet(STORAGE_KEY, alerts);
}

/**
 * Check all active alerts against current prices.
 * Returns newly triggered alerts and dispatches events.
 */
export function checkAlerts(currentPrices: Record<string, number>): PriceAlert[] {
  const alerts = getAlerts();
  const newlyTriggered: PriceAlert[] = [];

  let changed = false;
  const updated = alerts.map((a) => {
    if (a.triggered) return a;
    const currentPrice = currentPrices[a.tokenId];
    if (currentPrice === undefined) return a;

    let shouldTrigger = false;
    if (a.condition === "above" && currentPrice >= a.targetPrice) {
      shouldTrigger = true;
    } else if (a.condition === "below" && currentPrice <= a.targetPrice) {
      shouldTrigger = true;
    }

    if (shouldTrigger) {
      changed = true;
      const triggered: PriceAlert = {
        ...a,
        triggered: true,
        triggeredAt: Date.now(),
      };
      newlyTriggered.push(triggered);
      return triggered;
    }
    return a;
  });

  if (changed) {
    safeSet(STORAGE_KEY, updated);
  }

  // Dispatch events for newly triggered alerts
  for (const alert of newlyTriggered) {
    dispatchPriceAlertTrigger(alert);
  }

  return newlyTriggered;
}

function safeSet(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* ignore */ }
}

function dispatchPriceAlertTrigger(alert: PriceAlert): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("ignoshashi:price-alert-triggered", { detail: alert })
  );

  // Broadcast to other tabs
  try {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage({ type: "price-alert-triggered", alert });
    channel.close();
  } catch { /* BroadcastChannel not supported */ }

  // Trigger Web Push notification via server
  triggerPushForAlert(alert);
}

/** Listen for cross-tab price alert triggers */
export function listenForCrossTabAlerts(
  handler: (alert: PriceAlert) => void
): () => void {
  if (typeof window === "undefined") return () => {};
  try {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (event) => {
      if (event.data?.type === "price-alert-triggered" && event.data?.alert) {
        handler(event.data.alert);
      }
    };
    return () => channel.close();
  } catch {
    return () => {};
  }
}

/** Trigger a server-side Web Push notification for a triggered price alert */
async function triggerPushForAlert(alert: PriceAlert): Promise<void> {
  try {
    await fetch("/api/push/send-price-alert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tokenId: alert.tokenId,
        tokenName: alert.tokenName,
        ticker: alert.ticker,
        targetPrice: alert.targetPrice,
        currentPrice: alert.targetPrice, // The target was the trigger point
        blockchain: alert.blockchain,
      }),
    });
  } catch { /* non-critical */ }
}
