import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "@tanstack/react-router";
import { HiMiniXMark } from "react-icons/hi2";

interface LaunchAlert {
  id: string;
  tokenId: string;
  name: string;
  ticker: string;
  blockchain: "solana" | "ethereum";
  timestamp: number;
}

const STORAGE_KEY = "ignoshashi_seen_alerts";
const MAX_VISIBLE = 3;
const AUTO_DISMISS_MS = 8000;
const CHANNEL_NAME = "ignoshashi_launches";

function getSeenIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function saveSeenId(id: string): void {
  if (typeof window === "undefined") return;
  try {
    const seen = getSeenIds();
    seen.add(id);
    // Keep only last 200 to prevent unbounded growth
    const arr = Array.from(seen).slice(-200);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
  } catch { /* ignore */ }
}

export function LaunchAlerts() {
  const [alerts, setAlerts] = useState<LaunchAlert[]>([]);
  const seenRef = useRef(getSeenIds());
  const channelRef = useRef<BroadcastChannel | null>(null);

  // Listen for custom events on the document
  const handleNewLaunch = useCallback((e: Event) => {
    const detail = (e as CustomEvent).detail as LaunchAlert;
    if (!detail || !detail.id) return;

    if (seenRef.current.has(detail.id)) return;
    seenRef.current.add(detail.id);
    saveSeenId(detail.id);

    setAlerts((prev) => {
      const next = [...prev, detail];
      if (next.length > MAX_VISIBLE) {
        return next.slice(next.length - MAX_VISIBLE);
      }
      return next;
    });
  }, []);

  // BroadcastChannel: send alerts to other tabs
  const broadcastNewLaunch = useCallback((alert: LaunchAlert) => {
    if (channelRef.current) {
      channelRef.current.postMessage({ type: "new-launch", alert });
    }
  }, []);

  useEffect(() => {
    // Set up BroadcastChannel for cross-tab communication
    try {
      channelRef.current = new BroadcastChannel(CHANNEL_NAME);
      channelRef.current.onmessage = (event) => {
        if (event.data?.type === "new-launch" && event.data?.alert) {
          handleNewLaunch(
            new CustomEvent("ignoshashi:new-launch", { detail: event.data.alert })
          );
        }
      };
    } catch { /* BroadcastChannel not supported */ }

    // Listen for the custom DOM event
    const onNewLaunch = (e: Event) => {
      handleNewLaunch(e);
      const alert = (e as CustomEvent).detail as LaunchAlert;
      if (alert) broadcastNewLaunch(alert);
    };

    window.addEventListener("ignoshashi:new-launch", onNewLaunch);

    return () => {
      window.removeEventListener("ignoshashi:new-launch", onNewLaunch);
      if (channelRef.current) {
        channelRef.current.close();
        channelRef.current = null;
      }
    };
  }, [handleNewLaunch, broadcastNewLaunch]);

  const dismissAlert = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  // Auto-dismiss alerts after AUTO_DISMISS_MS
  useEffect(() => {
    if (alerts.length === 0) return;
    const timers = alerts.map((a) =>
      setTimeout(() => dismissAlert(a.id), AUTO_DISMISS_MS)
    );
    return () => timers.forEach(clearTimeout);
  }, [alerts, dismissAlert]);

  if (alerts.length === 0) return null;

  return (
    <div
      className="fixed top-16 right-4 z-50 flex flex-col gap-2 pointer-events-none"
      style={{ maxWidth: "360px", width: "calc(100vw - 2rem)" }}
    >
      <AnimatePresence>
        {alerts.map((alert) => (
          <motion.div
            key={alert.id}
            initial={{ opacity: 0, x: 80, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 80, scale: 0.95 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="pointer-events-auto retro-card p-3 relative overflow-hidden crt-effect"
            style={{
              background: "rgba(10, 15, 10, 0.95)",
              border: "2px solid rgba(0, 255, 65, 0.3)",
              boxShadow: "0 0 20px rgba(0, 255, 65, 0.2), 0 4px 20px rgba(0, 0, 0, 0.6)",
            }}
          >
            {/* Green header bar */}
            <div
              className="flex items-center gap-2 mb-2"
              style={{
                borderBottom: "1px solid rgba(0,255,65,0.15)",
                paddingBottom: "6px",
              }}
            >
              <span className="text-sm">🚀</span>
              <span
                className="text-[#00ff41] font-bold"
                style={{
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: "0.4rem",
                }}
              >
                NEW LAUNCH
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  dismissAlert(alert.id);
                }}
                className="ml-auto text-[#b0d0b0] hover:text-[#00ff41] transition-colors"
                aria-label="Dismiss"
              >
                <HiMiniXMark size={14} />
              </button>
            </div>

            {/* Token info */}
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                style={{
                  background: "#0d120d",
                  border: "2px solid rgba(0,255,65,0.2)",
                }}
              >
                <span
                  className="font-bold text-[#00ff41]"
                  style={{
                    fontFamily: '"Press Start 2P", monospace',
                    fontSize: "0.45rem",
                  }}
                >
                  {alert.ticker.slice(0, 2)}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className="text-[#ffffff] truncate"
                  style={{
                    fontFamily: '"Press Start 2P", monospace',
                    fontSize: "0.45rem",
                  }}
                >
                  {alert.name}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span
                    className="text-[#00ff41]"
                    style={{
                      fontFamily: '"VT323", monospace',
                      fontSize: "1rem",
                    }}
                  >
                    ${alert.ticker}
                  </span>
                  <span
                    className="px-1.5 py-0 rounded text-[0.35rem] font-bold"
                    style={{
                      background: alert.blockchain === "solana"
                        ? "rgba(0,255,65,0.1)"
                        : "rgba(57,255,20,0.1)",
                      border: `1px solid ${
                        alert.blockchain === "solana"
                          ? "rgba(0,255,65,0.3)"
                          : "rgba(57,255,20,0.3)"
                      }`,
                      color: alert.blockchain === "solana" ? "#00ff41" : "#39ff14",
                      fontFamily: '"Press Start 2P", monospace',
                    }}
                  >
                    {alert.blockchain === "solana" ? "SOL" : "ETH"}
                  </span>
                </div>
              </div>
            </div>

            {/* View link */}
            <Link
              to="/token/$id"
              params={{ id: alert.tokenId }}
              onClick={() => dismissAlert(alert.id)}
              className="mt-2 block text-center retro-btn retro-btn-outline text-[0.35rem] py-1 w-full"
              style={{ fontFamily: '"Press Start 2P", monospace' }}
            >
              VIEW TOKEN →
            </Link>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/** Dispatch a new launch alert from anywhere in the app */
export function dispatchLaunchAlert(alert: LaunchAlert): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("ignoshashi:new-launch", { detail: alert })
  );
}
