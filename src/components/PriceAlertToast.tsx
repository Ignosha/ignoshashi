import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HiMiniXMark, HiMiniBellAlert } from "react-icons/hi2";
import { checkAlerts, listenForCrossTabAlerts, type PriceAlert } from "~/services/priceAlerts";
import { getTokens } from "~/services/tracker";
import { getBondingCurvePrice } from "~/services/bondingCurve";
import { getBondingCurveStates } from "~/services/tracker";
import { sendPriceAlertNotification, broadcastPriceAlert } from "~/services/notifications";

const MAX_VISIBLE = 3;
const AUTO_DISMISS_MS = 10000;
const CHECK_INTERVAL_MS = 10000;

export function PriceAlertToast() {
  const [triggeredAlerts, setTriggeredAlerts] = useState<PriceAlert[]>([]);
  const seenRef = useRef<Set<string>>(new Set());

  // Handle new triggered alerts (from local check or cross-tab)
  const handleTriggered = useCallback((alert: PriceAlert) => {
    if (seenRef.current.has(alert.id)) return;
    seenRef.current.add(alert.id);

    setTriggeredAlerts((prev) => {
      const next = [...prev, alert];
      if (next.length > MAX_VISIBLE) return next.slice(next.length - MAX_VISIBLE);
      return next;
    });

    // Send browser push notification via BroadcastChannel for cross-tab dedup
    // Only the tab that detects it broadcasts; others receive and display
    broadcastPriceAlert({
      tokenId: alert.tokenId,
      tokenName: alert.tokenName,
      ticker: alert.ticker,
      targetPrice: alert.targetPrice,
      currentPrice: 0, // Will be populated by receiver
      blockchain: alert.blockchain,
    });

    // Also attempt direct notification for this tab
    const tokens = getTokens();
    const token = tokens.find((t) => t.id === alert.tokenId);
    const curves = getBondingCurveStates();
    const curve = curves.find((c) => c.tokenId === alert.tokenId);
    const currentPrice = curve ? getBondingCurvePrice(curve) : (token?.price || alert.targetPrice);

    sendPriceAlertNotification({
      tokenId: alert.tokenId,
      tokenName: alert.tokenName,
      ticker: alert.ticker,
      targetPrice: alert.targetPrice,
      currentPrice,
      blockchain: alert.blockchain,
    });
  }, []);

  // Periodically check prices against alerts
  useEffect(() => {
    const doCheck = () => {
      const curves = getBondingCurveStates();
      const tokens = getTokens();
      const tokenMap = new Map(tokens.map((t) => [t.id, t]));
      const prices: Record<string, number> = {};

      for (const curve of curves) {
        const token = tokenMap.get(curve.tokenId);
        prices[curve.tokenId] = getBondingCurvePrice(curve);
      }
      // Also include tokens without curves
      for (const token of tokens) {
        if (!prices[token.id]) {
          prices[token.id] = token.price;
        }
      }

      const newlyTriggered = checkAlerts(prices);
      for (const alert of newlyTriggered) {
        handleTriggered(alert);
      }
    };

    doCheck();
    const interval = setInterval(doCheck, CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [handleTriggered]);

  // Listen for cross-tab alerts
  useEffect(() => {
    const unsub = listenForCrossTabAlerts((alert) => {
      handleTriggered(alert);
    });
    return unsub;
  }, [handleTriggered]);

  // Listen for DOM events (from local checkAlerts)
  useEffect(() => {
    const handler = (e: Event) => {
      const alert = (e as CustomEvent).detail as PriceAlert;
      if (alert) handleTriggered(alert);
    };
    window.addEventListener("ignoshashi:price-alert-triggered", handler);
    return () => window.removeEventListener("ignoshashi:price-alert-triggered", handler);
  }, [handleTriggered]);

  // Auto-dismiss
  const dismissAlert = useCallback((id: string) => {
    setTriggeredAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  useEffect(() => {
    if (triggeredAlerts.length === 0) return;
    const timers = triggeredAlerts.map((a) =>
      setTimeout(() => dismissAlert(a.id), AUTO_DISMISS_MS)
    );
    return () => timers.forEach(clearTimeout);
  }, [triggeredAlerts, dismissAlert]);

  if (triggeredAlerts.length === 0) return null;

  return (
    <div
      className="fixed top-16 right-4 z-50 flex flex-col gap-2 pointer-events-none"
      style={{ maxWidth: "360px", width: "calc(100vw - 2rem)" }}
    >
      <AnimatePresence>
        {triggeredAlerts.map((alert) => (
          <motion.div
            key={alert.id}
            initial={{ opacity: 0, x: 80, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 80, scale: 0.95 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="pointer-events-auto retro-card p-3 relative overflow-hidden crt-effect"
            style={{
              background: "rgba(10, 15, 10, 0.95)",
              border: "2px solid rgba(255, 180, 60, 0.4)",
              boxShadow: "0 0 20px rgba(255, 180, 60, 0.2), 0 4px 20px rgba(0, 0, 0, 0.6)",
            }}
          >
            {/* Header bar */}
            <div
              className="flex items-center gap-2 mb-2"
              style={{
                borderBottom: "1px solid rgba(255, 180, 60, 0.15)",
                paddingBottom: "6px",
              }}
            >
              <HiMiniBellAlert size={14} className="text-[#ffb83c]" />
              <span
                className="text-[#ffb83c] font-bold"
                style={{
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: "0.4rem",
                }}
              >
                PRICE ALERT
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  dismissAlert(alert.id);
                }}
                className="ml-auto text-[#b0d0b0] hover:text-[#ffb83c] transition-colors"
                aria-label="Dismiss"
              >
                <HiMiniXMark size={14} />
              </button>
            </div>

            {/* Alert info */}
            <div>
              <p
                className="text-[#ffffff]"
                style={{
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: "0.4rem",
                }}
              >
                {alert.tokenName} (${alert.ticker})
              </p>
              <p
                className="text-[#e0ffe0] mt-1"
                style={{
                  fontFamily: '"VT323", monospace',
                  fontSize: "1.05rem",
                }}
              >
                🔔 {alert.condition === "above" ? "Above" : "Below"}{" "}
                {alert.targetPrice.toFixed(6)}{" "}
                {alert.blockchain === "solana" ? "SOL" : "ETH"}
              </p>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
