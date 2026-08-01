import { useState, useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { useTheme } from "~/context/ThemeContext";
import { getAlerts, type PriceAlert } from "~/services/priceAlerts";

// ─── Notification History ──────────────────────────

export interface NotificationEvent {
  id: string;
  type: "price_alert" | "new_launch" | "graduation" | "generic";
  title: string;
  body: string;
  tokenId?: string;
  url?: string;
  timestamp: number;
  read: boolean;
}

const HISTORY_KEY = "ignoshashi_notification_history";
const MAX_HISTORY = 50;

function getHistory(): NotificationEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(events: NotificationEvent[]): void {
  if (typeof window === "undefined") return;
  try {
    // Keep only the latest MAX_HISTORY
    const trimmed = events.slice(0, MAX_HISTORY);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
  } catch {}
}

export function addNotificationEvent(event: Omit<NotificationEvent, "id" | "read">): void {
  const history = getHistory();
  const newEvent: NotificationEvent = {
    ...event,
    id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    read: false,
  };
  history.unshift(newEvent);
  saveHistory(history);
  // Dispatch event for real-time UI update
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("ignoshashi:new-notification-event", { detail: newEvent }));
  }
}

export function markAllRead(): void {
  const history = getHistory();
  const updated = history.map((e) => ({ ...e, read: true }));
  saveHistory(updated);
}

function getTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Component ──────────────────────────────────────

export function NotificationBell() {
  const themeCtx = useTheme();
  const { theme } = themeCtx;
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<NotificationEvent[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const refreshHistory = () => {
    const h = getHistory();
    setHistory(h.slice(0, 20));
    setUnreadCount(h.filter((e) => !e.read).length);
  };

  useEffect(() => {
    refreshHistory();

    // Listen for new events
    const handler = () => refreshHistory();
    window.addEventListener("ignoshashi:new-notification-event", handler);

    // Also check for triggered price alerts and add them to history
    const alertHandler = (e: Event) => {
      const alert = (e as CustomEvent).detail as PriceAlert;
      if (alert) {
        const alreadyExists = getHistory().some(
          (h) => h.tokenId === alert.tokenId && h.type === "price_alert" && h.timestamp > Date.now() - 30000
        );
        if (!alreadyExists) {
          const currencySymbol = alert.blockchain === "solana" ? "SOL" : "ETH";
          addNotificationEvent({
            type: "price_alert",
            title: `🔔 ${alert.ticker} Alert Triggered`,
            body: `Hit ${alert.targetPrice.toFixed(6)} ${currencySymbol}`,
            tokenId: alert.tokenId,
            url: `/token/${alert.tokenId}`,
            timestamp: Date.now(),
          });
        }
      }
    };
    window.addEventListener("ignoshashi:price-alert-triggered", alertHandler);

    // Listen for new launches
    const launchHandler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { id: string; name: string; ticker: string; blockchain: string; timestamp: number };
      if (detail) {
        addNotificationEvent({
          type: "new_launch",
          title: `🚀 ${detail.ticker} Launched!`,
          body: `${detail.name} just launched on ${detail.blockchain === "solana" ? "Solana" : "Ethereum"}`,
          tokenId: detail.id,
          url: `/token/${detail.id}`,
          timestamp: detail.timestamp || Date.now(),
        });
      }
    };
    window.addEventListener("ignoshashi:new-launch", launchHandler);

    // Close on outside click
    const clickHandler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", clickHandler);

    return () => {
      window.removeEventListener("ignoshashi:new-notification-event", handler);
      window.removeEventListener("ignoshashi:price-alert-triggered", alertHandler);
      window.removeEventListener("ignoshashi:new-launch", launchHandler);
      document.removeEventListener("mousedown", clickHandler);
    };
  }, []);

  const handleToggle = () => {
    if (!open) {
      refreshHistory();
    }
    setOpen(!open);
  };

  const handleMarkAllRead = () => {
    markAllRead();
    refreshHistory();
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={handleToggle}
        className="p-1.5 rounded-md transition-colors duration-100 relative"
        style={{ color: theme.textMuted }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.color = theme.primary;
          (e.currentTarget as HTMLElement).style.background = `${theme.primary}0F`;
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.color = theme.textMuted;
          (e.currentTarget as HTMLElement).style.background = "";
        }}
        title="Notifications"
      >
        <span style={{ fontSize: "1.1rem" }}>🔔</span>
        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full flex items-center justify-center text-[0.35rem] font-bold px-1"
            style={{
              background: "#ef476f",
              color: "#fff",
              fontFamily: '"Press Start 2P", monospace',
              fontSize: "0.35rem",
              boxShadow: "0 0 8px #ef476f",
            }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute top-full right-0 mt-2 retro-card p-2 z-50 min-w-[280px] max-h-80 overflow-y-auto custom-scrollbar"
          style={{ background: `${theme.bgSecondary}f5` }}
        >
          <div className="flex items-center justify-between mb-2 px-1">
            <p
              className="font-bold"
              style={{
                fontFamily: '"Press Start 2P", monospace',
                fontSize: "0.4rem",
                color: theme.primary,
              }}
            >
              🔔 NOTIFICATIONS
            </p>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-[0.35rem] px-1.5 py-0.5 rounded"
                style={{
                  fontFamily: '"Press Start 2P", monospace',
                  background: `${theme.primary}15`,
                  border: `1px solid ${theme.border}`,
                  color: theme.primary,
                }}
              >
                MARK READ
              </button>
            )}
          </div>

          {history.length === 0 ? (
            <div className="text-center py-6">
              <p style={{ fontFamily: '"VT323", monospace', fontSize: "1rem", color: theme.textMuted }}>
                No notifications yet
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {history.map((event) => (
                <Link
                  key={event.id}
                  to={event.url || "/"}
                  onClick={() => setOpen(false)}
                  className={`block p-2 rounded-md transition-colors duration-100 ${
                    !event.read ? "" : "opacity-60"
                  }`}
                  style={{
                    background: !event.read ? `${theme.primary}0D` : "transparent",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = `${theme.primary}1a`;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = !event.read
                      ? `${theme.primary}0D`
                      : "transparent";
                  }}
                >
                  <div className="flex items-start gap-2">
                    {!event.read && (
                      <span
                        className="w-2 h-2 rounded-full mt-1 shrink-0"
                        style={{
                          background: "#00ff41",
                          boxShadow: "0 0 6px #00ff41",
                        }}
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p
                        className="font-bold truncate"
                        style={{
                          fontFamily: '"Press Start 2P", monospace',
                          fontSize: "0.35rem",
                          color: theme.text,
                        }}
                      >
                        {event.title}
                      </p>
                      <p
                        className="truncate mt-0.5"
                        style={{
                          fontFamily: '"VT323", monospace',
                          fontSize: "0.95rem",
                          color: theme.textMuted,
                        }}
                      >
                        {event.body}
                      </p>
                      <p
                        className="mt-0.5"
                        style={{
                          fontFamily: '"VT323", monospace',
                          fontSize: "0.8rem",
                          color: theme.textMuted,
                        }}
                      >
                        {getTimeAgo(event.timestamp)}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
