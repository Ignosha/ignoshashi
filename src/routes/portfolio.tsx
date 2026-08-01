import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { HiMiniBellAlert, HiMiniTrash } from "react-icons/hi2";
import { useWallet, truncateAddress } from "~/context/WalletContext";
import { getTokens, getTrades, getBondingCurveStates, type TradeData, type TokenData } from "~/services/tracker";
import { fetchCreatorTokens, fetchCreatorEarnings, type CreatorTokenData, type CreatorEarnings } from "~/services/tracker";
import { getBondingCurvePrice, type BondingCurveState } from "~/services/bondingCurve";
import { getAlerts, removeAlert, getActiveAlerts, clearTriggeredAlerts, type PriceAlert } from "~/services/priceAlerts";
import { Card } from "~/components/UI";
import { useUsdPrice, formatUsd } from "~/hooks/useUsdPrice";
import { useDexPrice } from "~/hooks/useDexPrice";
import {
  isSupported,
  getPermission,
  requestPermission,
  isNotificationsEnabled,
  setNotificationsEnabled,
  playArcadeBeep,
} from "~/services/notifications";
import {
  isPushSupported,
  getCurrentSubscription,
  subscribeToPush,
  unsubscribeFromPush,
  getPushPermission,
  requestPushPermission,
  getPushSettings,
  savePushSettings,
  updateNotificationTypes,
  type NotificationType,
} from "~/services/pushNotifications";

export const Route = createFileRoute("/portfolio")({
  component: PortfolioPage,
});

type ChainFilter = "all" | "solana" | "ethereum";

interface HoldingData {
  tokenId: string;
  name: string;
  ticker: string;
  image: string;
  blockchain: "solana" | "ethereum";
  amount: number;
  avgBuyPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPct: number;
  portfolioShare: number;
  totalValue: number;
  curve: BondingCurveState | undefined;
  graduationProgress: number;
}

function formatCompact(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  if (n >= 1) return n.toFixed(2);
  return n.toFixed(6);
}

function getTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function PortfolioPage() {
  const { connected, solAddress, ethAddress } = useWallet();
  const usdPrices = useUsdPrice();
  const [holdings, setHoldings] = useState<HoldingData[]>([]);
  const [recentTrades, setRecentTrades] = useState<TradeData[]>([]);
  const [chainFilter, setChainFilter] = useState<ChainFilter>("all");
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [activeTab, setActiveTab] = useState<"holdings" | "alerts" | "notifications" | "creator">("holdings");
  const [notifEnabled, setNotifEnabled] = useState(isNotificationsEnabled());
  const [notifPermission, setNotifPermission] = useState<string>(
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "default"
  );
  const [pushAvailable, setPushAvailable] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushSettings, setPushSettingsState] = useState(getPushSettings());
  const [creatorTokens, setCreatorTokens] = useState<CreatorTokenData[]>([]);
  const [creatorEarnings, setCreatorEarnings] = useState<CreatorEarnings | null>(null);
  const [creatorLoading, setCreatorLoading] = useState(false);

  // Get the wallet address we care about
  const walletAddr = solAddress || ethAddress || null;
  const truncatedWallet = walletAddr ? truncateAddress(walletAddr) : null;

  const refresh = useCallback(() => {
    if (!walletAddr) {
      setHoldings([]);
      setRecentTrades([]);
      return;
    }

    const tokens = getTokens();
    const trades = getTrades();
    const curves = getBondingCurveStates();
    const curveMap = new Map(curves.map((c) => [c.tokenId, c]));
    const tokenMap = new Map(tokens.map((t) => [t.id, t]));

    // Filter trades by wallet
    const walletTrades = trades.filter(
      (t) => t.wallet === truncatedWallet || t.wallet === walletAddr
    );

    // Calculate holdings per token
    const holdingsMap = new Map<string, { buys: TradeData[]; sells: TradeData[] }>();
    for (const trade of walletTrades) {
      if (!holdingsMap.has(trade.tokenId)) {
        holdingsMap.set(trade.tokenId, { buys: [], sells: [] });
      }
      const entry = holdingsMap.get(trade.tokenId)!;
      if (trade.type === "BUY") {
        entry.buys.push(trade);
      } else {
        entry.sells.push(trade);
      }
    }

    const computedHoldings: HoldingData[] = [];
    for (const [tokenId, { buys, sells }] of holdingsMap) {
      const totalBought = buys.reduce((s, t) => s + t.amount, 0);
      const totalSold = sells.reduce((s, t) => s + t.amount, 0);
      const netAmount = totalBought - totalSold;
      if (netAmount <= 0) continue; // fully sold

      const token = tokenMap.get(tokenId);
      if (!token) continue;

      const totalBuyCost = buys.reduce((s, t) => s + t.total, 0);
      const avgBuyPrice = totalBuyCost / totalBought;

      const curve = curveMap.get(tokenId);
      const currentPrice = curve ? getBondingCurvePrice(curve) : token.price;

      const totalValue = netAmount * currentPrice;
      const totalCost = netAmount * avgBuyPrice;
      const pnl = totalValue - totalCost;
      const pnlPct = totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0;
      const graduationProgress = curve
        ? Math.min((curve.currentSupply / curve.totalSupply) * 100, 100)
        : 0;

      computedHoldings.push({
        tokenId,
        name: token.name,
        ticker: token.ticker,
        image: token.image,
        blockchain: token.blockchain,
        amount: netAmount,
        avgBuyPrice,
        currentPrice,
        pnl,
        pnlPct,
        portfolioShare: 0,
        totalValue,
        curve: curve || undefined,
        graduationProgress,
      });
    }

    // Sort by total value descending
    computedHoldings.sort((a, b) => b.totalValue - a.totalValue);

    // Calculate portfolio shares
    const totalPortfolio = computedHoldings.reduce((s, h) => s + h.totalValue, 0);
    for (const h of computedHoldings) {
      h.portfolioShare = totalPortfolio > 0 ? (h.totalValue / totalPortfolio) * 100 : 0;
    }

    setHoldings(computedHoldings);
    setRecentTrades(walletTrades.slice(0, 20));

    // Check alerts
    const allAlerts = getAlerts();
    setAlerts(allAlerts);
  }, [walletAddr, truncatedWallet]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  // Fetch creator analytics when wallet connected and creator tab active
  useEffect(() => {
    if (!walletAddr) {
      setCreatorTokens([]);
      setCreatorEarnings(null);
      return;
    }
    if (activeTab !== "creator") return;

    let cancelled = false;
    async function loadCreatorData() {
      setCreatorLoading(true);
      const [tokens, earnings] = await Promise.all([
        fetchCreatorTokens(walletAddr!),
        fetchCreatorEarnings(walletAddr!),
      ]);
      if (!cancelled) {
        setCreatorTokens(tokens);
        setCreatorEarnings(earnings);
        setCreatorLoading(false);
      }
    }
    loadCreatorData();
    const interval = setInterval(loadCreatorData, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [walletAddr, activeTab]);

  // Listen for notification permission changes from other tabs
  useEffect(() => {
    const handler = (e: Event) => {
      const { enabled } = (e as CustomEvent).detail as { enabled: boolean };
      setNotifEnabled(enabled);
      setNotifPermission(Notification.permission);
    };
    window.addEventListener("ignoshashi:notification-permission-changed", handler);
    return () => window.removeEventListener("ignoshashi:notification-permission-changed", handler);
  }, []);

  // Check push notification state on mount
  useEffect(() => {
    const checkPush = async () => {
      setPushAvailable(isPushSupported());
      const sub = await getCurrentSubscription();
      setPushSubscribed(!!sub);
      setPushSettingsState(getPushSettings());
    };
    checkPush();
  }, []);

  const handleToggleNotifications = async () => {
    if (!isSupported()) return;
    if (notifPermission !== "granted") {
      const result = await requestPermission();
      setNotifPermission(result);
      if (result === "granted") {
        setNotifEnabled(true);
        playArcadeBeep(523, 80);
        playArcadeBeep(784, 100);
      }
    } else {
      const next = !notifEnabled;
      setNotifEnabled(next);
      setNotificationsEnabled(next);
      if (next) {
        playArcadeBeep(440, 100);
      }
    }
  };

  // Summary calculations
  const summary = useMemo(() => {
    const filtered = chainFilter === "all"
      ? holdings
      : holdings.filter((h) => h.blockchain === chainFilter);

    const totalValue = filtered.reduce((s, h) => s + h.totalValue, 0);
    const totalPnl = filtered.reduce((s, h) => s + h.pnl, 0);
    const totalPnlPct = filtered.reduce((s, h) => s + h.totalValue * (h.pnlPct / 100), 0)
      / (totalValue || 1) * 100;
    const tokensCount = filtered.length;

    return { totalValue, totalPnl, totalPnlPct, tokensCount };
  }, [holdings, chainFilter]);

  const filteredHoldings = useMemo(() => {
    if (chainFilter === "all") return holdings;
    return holdings.filter((h) => h.blockchain === chainFilter);
  }, [holdings, chainFilter]);

  const currencySymbol = (blockchain: string) => blockchain === "solana" ? "SOL" : "ETH";

  function renderAlertsTab() {
    return (
      <div className="space-y-3">
        {alerts.length === 0 ? (
          <Card className="text-center py-8">
            <p className="text-3xl mb-3">🔔</p>
            <p
              className="text-[#ffffff] mb-1"
              style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.55rem" }}
            >
              NO PRICE ALERTS
            </p>
            <p
              className="text-[#e0ffe0]"
              style={{ fontFamily: '"VT323", monospace', fontSize: "1.1rem" }}
            >
              Set alerts on token pages to get notified of price movements!
            </p>
          </Card>
        ) : (
          <>
            {alerts.filter((a) => !a.triggered).length > 0 && (
              <div className="mb-4">
                <h3
                  className="text-[#ffb83c] mb-3 pixel-shadow-sm"
                  style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.45rem" }}
                >
                  ⚡ ACTIVE ALERTS
                </h3>
                <div className="space-y-2">
                  {alerts.filter((a) => !a.triggered).map((a) => (
                    <Card key={a.id} className="p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-[#ffffff]" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.4rem" }}>{a.tokenName}</span>
                            <span className="text-[#e0ffe0]" style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}>${a.ticker}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1" style={{ fontFamily: '"VT323", monospace', fontSize: "0.95rem", color: "#e0ffe0" }}>
                            <span>{a.condition === "above" ? "▲ Above" : "▼ Below"} {a.targetPrice.toFixed(6)} {a.blockchain === "solana" ? "SOL" : "ETH"}</span>
                            {a.note && <span className="text-[#b0d0b0]">— {a.note}</span>}
                          </div>
                        </div>
                        <button
                          onClick={(e) => { e.preventDefault(); removeAlert(a.id); setAlerts(getAlerts()); }}
                          className="text-[#b0d0b0] hover:text-[#ff4444] transition-colors"
                          aria-label="Remove alert"
                        >
                          <HiMiniTrash size={14} />
                        </button>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}
            {alerts.filter((a) => a.triggered).length > 0 && (
              <div>
                <h3 className="text-[#b0d0b0] mb-3 pixel-shadow-sm" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.45rem" }}>✓ TRIGGERED</h3>
                <div className="space-y-2">
                  {alerts.filter((a) => a.triggered).map((a) => (
                    <Card key={a.id} className="p-3" style={{ opacity: 0.6 }}>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[#b0d0b0]" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.4rem" }}>{a.tokenName}</span>
                          <span className="text-[#b0d0b0]" style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}>${a.ticker}</span>
                          <span className="text-[0.35rem] px-1.5 py-0.5 rounded" style={{ fontFamily: '"Press Start 2P", monospace', background: "rgba(0,255,65,0.1)", color: "#00ff41" }}>TRIGGERED</span>
                        </div>
                        <div className="mt-1" style={{ fontFamily: '"VT323", monospace', fontSize: "0.95rem", color: "#b0d0b0" }}>
                          {a.condition === "above" ? "Above" : "Below"} {a.targetPrice.toFixed(6)} {a.blockchain === "solana" ? "SOL" : "ETH"}
                          {a.triggeredAt && <> — {getTimeAgo(a.triggeredAt)}</>}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  function renderNotificationsTab() {
    const handleSubscribeToPush = async () => {
      if (!pushAvailable) return;
      const perm = await requestPushPermission();
      if (perm === "granted") {
        const wallet = solAddress || ethAddress || undefined;
        const sub = await subscribeToPush(wallet);
        if (sub) {
          setPushSubscribed(true);
          setPushSettingsState(getPushSettings());
          playArcadeBeep(523, 80);
          playArcadeBeep(784, 120);
        }
      }
    };

    const handleUnsubscribeFromPush = async () => {
      await unsubscribeFromPush();
      setPushSubscribed(false);
      const settings = getPushSettings();
      settings.enabled = false;
      settings.types = [];
      savePushSettings(settings);
      setPushSettingsState(settings);
    };

    const handlePushTypeToggle = async (type: NotificationType) => {
      const settings = getPushSettings();
      if (settings.types.includes(type)) {
        settings.types = settings.types.filter((t) => t !== type);
      } else {
        settings.types.push(type);
      }
      savePushSettings(settings);
      setPushSettingsState({ ...settings });

      // Update server-side
      const sub = await getCurrentSubscription();
      if (sub) {
        await updateNotificationTypes(sub.endpoint, settings.types);
      }
    };

    return (
      <div className="space-y-4">
        {/* Web Push Notifications Card */}
        <Card className="p-4">
          <h3
            className="text-[#00ff41] mb-3 pixel-shadow-sm"
            style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem" }}
          >
            🔔 WEB PUSH NOTIFICATIONS
          </h3>
          {!pushAvailable ? (
            <p
              className="text-[#ffb83c]"
              style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
            >
              ⚠️ Your browser doesn't support Web Push notifications. Try Chrome, Edge, or Firefox.
            </p>
          ) : pushSubscribed ? (
            <div className="space-y-3">
              {/* Status card */}
              <div
                className="retro-card p-3"
                style={{
                  borderColor: "rgba(0,255,65,0.4)",
                  background: "rgba(0,255,65,0.05)",
                }}
              >
                <div className="flex items-center gap-3">
                  <span style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.8rem" }}>🟢</span>
                  <div>
                    <p
                      className="font-bold"
                      style={{
                        fontFamily: '"Press Start 2P", monospace',
                        fontSize: "0.4rem",
                        color: "#00ff41",
                      }}
                    >
                      PUSH ENABLED
                    </p>
                    <p
                      className="text-[#e0ffe0]"
                      style={{ fontFamily: '"VT323", monospace', fontSize: "0.95rem" }}
                    >
                      You'll receive push notifications even when the site is closed!
                    </p>
                  </div>
                </div>
              </div>

              {/* Notification type toggles */}
              <div className="space-y-2">
                <p
                  className="text-[#ffb83c]"
                  style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.4rem" }}
                >
                  NOTIFICATION TYPES:
                </p>
                {[
                  { type: "price_alerts" as NotificationType, icon: "🚨", label: "Price Alerts", desc: "When a token hits your target price" },
                  { type: "new_launches" as NotificationType, icon: "🚀", label: "New Launches", desc: "When a followed creator launches a token" },
                ].map((item) => {
                  const isOn = pushSettings.types.includes(item.type);
                  return (
                    <div
                      key={item.type}
                      className="retro-card p-3 flex items-center justify-between"
                    >
                      <div className="flex items-start gap-2">
                        <span style={{ fontSize: "1rem" }}>{item.icon}</span>
                        <div>
                          <p
                            className="text-[#ffffff]"
                            style={{
                              fontFamily: '"Press Start 2P", monospace',
                              fontSize: "0.35rem",
                            }}
                          >
                            {item.label}
                          </p>
                          <p
                            className="text-[#e0ffe0]"
                            style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem" }}
                          >
                            {item.desc}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => handlePushTypeToggle(item.type)}
                        className={`retro-btn text-[0.35rem] px-2 py-1 ${isOn ? "retro-btn-turquoise" : "retro-btn-outline"}`}
                        style={{ fontFamily: '"Press Start 2P", monospace' }}
                      >
                        {isOn ? "ON" : "OFF"}
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Unsubscribe */}
              <button
                onClick={handleUnsubscribeFromPush}
                className="retro-btn retro-btn-pink w-full justify-center text-[0.4rem] py-2"
                style={{ fontFamily: '"Press Start 2P", monospace' }}
              >
                🔕 UNSUBSCRIBE FROM PUSH
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div
                className="retro-card p-4 text-center"
                style={{
                  borderColor: "rgba(255,180,60,0.4)",
                  background: "rgba(255,180,60,0.03)",
                }}
              >
                <p className="text-3xl mb-3">🔔</p>
                <p
                  className="text-[#ffffff] mb-2"
                  style={{
                    fontFamily: '"Press Start 2P", monospace',
                    fontSize: "0.5rem",
                  }}
                >
                  GET NOTIFIED ANYWHERE
                </p>
                <p
                  className="text-[#e0ffe0] mb-4"
                  style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
                >
                  Receive push notifications for price alerts and new token launches — even when you're not on the site!
                </p>
                <button
                  onClick={handleSubscribeToPush}
                  className="retro-btn retro-btn-orange neon-glow-yellow text-[0.45rem] px-6 py-2.5"
                  style={{ fontFamily: '"Press Start 2P", monospace' }}
                >
                  🔔 ENABLE PUSH NOTIFICATIONS
                </button>
              </div>
            </div>
          )}
        </Card>

        {/* Browser Notifications Card (existing) */}
        <Card className="p-4">
          <h3 className="text-[#00ff41] mb-3 pixel-shadow-sm" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem" }}>📲 BROWSER NOTIFICATIONS</h3>
          {!isSupported() ? (
            <p className="text-[#ffb83c]" style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}>⚠️ Your browser doesn't support browser notifications.</p>
          ) : (
            <div className="space-y-3">
              <div className="retro-card p-3" style={{ borderColor: notifPermission === "granted" ? "rgba(0,255,65,0.4)" : "rgba(255,180,60,0.4)", background: notifPermission === "granted" ? "rgba(0,255,65,0.05)" : "rgba(255,180,60,0.03)" }}>
                <div className="flex items-center gap-3">
                  <span style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.8rem" }}>{notifPermission === "granted" ? "🟢" : notifPermission === "denied" ? "🔴" : "🟡"}</span>
                  <div>
                    <p className="font-bold" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.4rem", color: notifPermission === "granted" ? "#00ff41" : "#ffb83c" }}>PERMISSION: {notifPermission.toUpperCase()}</p>
                    <p className="text-[#e0ffe0]" style={{ fontFamily: '"VT323", monospace', fontSize: "0.95rem" }}>
                      {notifPermission === "granted" ? "Notifications are allowed by your browser" : notifPermission === "denied" ? "Notifications are blocked. Update your browser settings to enable." : "Click below to enable browser notifications while the site is open"}
                    </p>
                  </div>
                </div>
              </div>
              {notifPermission === "granted" && (
                <div className="retro-card p-3 flex items-center justify-between">
                  <div>
                    <p className="font-bold text-[#ffffff]" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.4rem" }}>IN-TAB ALERTS</p>
                    <p className="text-[#e0ffe0]" style={{ fontFamily: '"VT323", monospace', fontSize: "0.95rem" }}>Show notification popups when price alerts trigger (while tab is open)</p>
                  </div>
                  <button onClick={handleToggleNotifications} className={`retro-btn text-[0.4rem] px-3 py-1.5 ${notifEnabled ? "retro-btn-turquoise" : "retro-btn-outline"}`} style={{ fontFamily: '"Press Start 2P", monospace' }}>{notifEnabled ? "🔔 ON" : "🔕 OFF"}</button>
                </div>
              )}
              {notifPermission !== "granted" && (
                <button onClick={handleToggleNotifications} disabled={notifPermission === "denied"} className={`retro-btn w-full justify-center text-[0.45rem] py-2 ${notifPermission === "denied" ? "opacity-50 cursor-not-allowed" : "retro-btn-orange neon-glow-yellow"}`} style={{ fontFamily: '"Press Start 2P", monospace' }}>{notifPermission === "denied" ? "🔒 NOTIFICATIONS BLOCKED" : "🔔 ENABLE NOTIFICATIONS"}</button>
              )}
            </div>
          )}
        </Card>

        {/* Info card */}
        <Card className="p-4">
          <h3 className="text-[#00ff41] mb-3 pixel-shadow-sm" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.45rem" }}>📋 WHAT YOU'LL GET</h3>
          <div className="space-y-2">
            {[
              { icon: "🚨", title: "Price Alerts", desc: "When a token hits your target price" },
              { icon: "🚀", title: "New Launches", desc: "When a new meme coin launches on the platform" },
              { icon: "🎓", title: "Graduations", desc: "When a token graduates from the bonding curve" },
              { icon: "📱", title: "Background Delivery", desc: "Web Push works even when the site is closed!" },
            ].map((item) => (
              <div key={item.title} className="flex items-start gap-2">
                <span style={{ fontSize: "1rem" }}>{item.icon}</span>
                <div>
                  <p className="text-[#ffffff]" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.35rem" }}>{item.title}</p>
                  <p className="text-[#e0ffe0]" style={{ fontFamily: '"VT323", monospace', fontSize: "0.95rem" }}>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
        {alerts.filter((a) => a.triggered).length > 0 && (
          <button onClick={() => { clearTriggeredAlerts(); setAlerts(getAlerts()); }} className="retro-btn retro-btn-outline w-full justify-center text-[0.4rem] py-2" style={{ fontFamily: '"Press Start 2P", monospace' }}>🧹 CLEAR TRIGGERED ALERTS ({alerts.filter((a) => a.triggered).length})</button>
        )}
      </div>
    );
  }

  function renderCreatorTab() {
    const summaryTokensCreated = creatorTokens.length;
    const summaryGraduated = creatorTokens.filter((t) => t.graduated).length;
    const summaryEarnings = creatorEarnings?.totalEarnings || creatorTokens.reduce((s, t) => s + t.earnings, 0);
    const summaryTotalTrades = creatorTokens.reduce((s, t) => s + t.tradeCount, 0);
    const chain = creatorTokens[0]?.blockchain || "solana";
    const chainSymbol = chain === "solana" ? "SOL" : "ETH";
    const earningsUsd = usdPrices[chain] * summaryEarnings;

    // Sparkline data: cumulative earnings over time
    const sorted = [...creatorTokens].sort((a, b) => a.createdAt - b.createdAt);
    let cumulative = 0;
    const sparklineData = sorted.map((t) => {
      cumulative += t.earnings;
      return cumulative;
    });

    return (
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            {
              label: "TOKENS CREATED",
              value: `${summaryTokensCreated}`,
              icon: "🚀",
              color: "#00ff41",
            },
            {
              label: "TOTAL EARNED",
              value: `${summaryEarnings.toFixed(4)} ${chainSymbol}`,
              sub: earningsUsd > 0 ? `~${formatUsd(earningsUsd)}` : "",
              icon: "💰",
              color: "#ffb83c",
            },
            {
              label: "TRADES RECEIVED",
              value: `${summaryTotalTrades}`,
              icon: "📊",
              color: "#00ff41",
            },
            {
              label: "GRADUATED",
              value: `${summaryGraduated}`,
              icon: "🎓",
              color: summaryGraduated > 0 ? "#ffd700" : "#00ff41",
            },
          ].map((s) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2 }}
              className="retro-card p-3 text-center"
            >
              <div className="text-lg mb-1">{s.icon}</div>
              <div
                className="text-sm font-bold"
                style={{
                  fontFamily: '"VT323", monospace',
                  fontSize: "1.05rem",
                  color: s.color,
                }}
              >
                {s.value}
              </div>
              <div
                className="text-[0.35rem] mt-0.5"
                style={{
                  fontFamily: '"Press Start 2P", monospace',
                  color: "#b0d0b0",
                }}
              >
                {s.label}
              </div>
              {"sub" in s && (
                <div
                  className="text-xs"
                  style={{
                    fontFamily: '"VT323", monospace',
                    fontSize: "0.85rem",
                    color: "#b0d0b0",
                  }}
                >
                  {s.sub}
                </div>
              )}
            </motion.div>
          ))}
        </div>

        {/* Revenue Sparkline */}
        {sparklineData.length > 1 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="retro-card p-4"
          >
            <h3
              className="text-[#00ff41] mb-3 pixel-shadow-sm"
              style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem" }}
            >
              📈 REVENUE TIMELINE
            </h3>
            <RevenueSparkline data={sparklineData} chainSymbol={chainSymbol} />
          </motion.div>
        )}

        {/* Per-Token Cards */}
        {creatorTokens.length === 0 ? (
          <Card className="text-center py-8">
            <p className="text-3xl mb-3">🪙</p>
            <p
              className="text-[#ffffff] mb-1"
              style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.55rem" }}
            >
              NO TOKENS CREATED YET
            </p>
            <p
              className="text-[#e0ffe0]"
              style={{ fontFamily: '"VT323", monospace', fontSize: "1.1rem" }}
            >
              Create your first token to see analytics here!
            </p>
            <Link to="/create" className="inline-block mt-3">
              <button
                className="retro-btn retro-btn-orange text-[0.45rem] px-4 py-2"
                style={{ fontFamily: '"Press Start 2P", monospace' }}
              >
                🚀 CREATE TOKEN
              </button>
            </Link>
          </Card>
        ) : (
          <div className="space-y-3">
            <h3
              className="text-[#00ff41] pixel-shadow-sm"
              style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem" }}
            >
              🎯 YOUR TOKENS
            </h3>
            {creatorTokens.map((token, i) => (
              <TokenPerformanceCard key={token.tokenId} token={token} chainSymbol={chainSymbol} index={i} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[#050505] py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-8">
          <h1
            className="text-[#00ff41] mb-2 pixel-shadow-sm"
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: "1rem",
            }}
          >
            💼 YOUR PORTFOLIO
          </h1>
          <p
            className="text-[#e0ffe0]"
            style={{ fontFamily: '"VT323", monospace', fontSize: "1.15rem" }}
          >
            Track your meme coin holdings and trades
          </p>
        </motion.div>

        {!walletAddr ? (
          /* Not Connected */
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card className="text-center py-12">
              <p className="text-5xl mb-4 retro-float">🔑</p>
              <p
                className="text-[#ffffff] mb-2 pixel-shadow-sm"
                style={{
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: "0.65rem",
                }}
              >
                CONNECT WALLET TO VIEW PORTFOLIO
              </p>
              <p
                className="text-[#e0ffe0] mb-6"
                style={{ fontFamily: '"VT323", monospace', fontSize: "1.1rem" }}
              >
                Connect your Solana or Ethereum wallet to see your holdings
              </p>
            </Card>
          </motion.div>
        ) : holdings.length === 0 ? (
          /* No Holdings */
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card className="text-center py-12">
              <p className="text-5xl mb-4 retro-float">📦</p>
              <p
                className="text-[#ffffff] mb-2 pixel-shadow-sm"
                style={{
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: "0.65rem",
                }}
              >
                NO HOLDINGS YET
              </p>
              <p
                className="text-[#e0ffe0] mb-2"
                style={{ fontFamily: '"VT323", monospace', fontSize: "1.1rem" }}
              >
                Start trading to build your portfolio!
              </p>
              <p
                className="text-[#b0d0b0] mb-6"
                style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
              >
                Wallet: {truncatedWallet}
              </p>
              <div className="flex flex-wrap gap-3 justify-center">
                <Link to="/terminal">
                  <button
                    className="retro-btn retro-btn-orange text-[0.5rem] px-4 py-2"
                    style={{ fontFamily: '"Press Start 2P", monospace' }}
                  >
                    💻 TERMINAL
                  </button>
                </Link>
                <Link to="/leaderboard">
                  <button
                    className="retro-btn retro-btn-turquoise text-[0.5rem] px-4 py-2"
                    style={{ fontFamily: '"Press Start 2P", monospace' }}
                  >
                    🏆 LEADERBOARD
                  </button>
                </Link>
              </div>
            </Card>
          </motion.div>
        ) : (
          <>
            {/* Summary Row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              {[
                {
                  label: "TOTAL VALUE",
                  value: `${summary.totalValue.toFixed(4)} SOL/ETH`,
                  sub: usdPrices.sol > 0 ? `~${formatUsd(summary.totalValue * usdPrices.sol)}` : "",
                  icon: "💰",
                  color: "#00ff41",
                },
                {
                  label: "24H P&L",
                  value: `${summary.totalPnl >= 0 ? "+" : ""}${summary.totalPnl.toFixed(4)}`,
                  sub: `${summary.totalPnlPct >= 0 ? "+" : ""}${summary.totalPnlPct.toFixed(2)}%`,
                  icon: summary.totalPnl >= 0 ? "📈" : "📉",
                  color: summary.totalPnl >= 0 ? "#00ff41" : "#ff4444",
                },
                {
                  label: "TOKENS",
                  value: `${summary.tokensCount}`,
                  sub: "unique tokens",
                  icon: "🪙",
                  color: "#ffb83c",
                },
                {
                  label: "UNREALIZED P&L",
                  value: `${summary.totalPnl >= 0 ? "+" : ""}${summary.totalPnl.toFixed(4)}`,
                  sub: currencySymbol(holdings[0]?.blockchain || "solana"),
                  icon: "💎",
                  color: summary.totalPnl >= 0 ? "#00ff41" : "#ff4444",
                },
              ].map((s) => (
                <motion.div
                  key={s.label}
                  whileHover={{ scale: 1.03, y: -2 }}
                  className="retro-card p-3 text-center"
                >
                  <div className="text-lg mb-1">{s.icon}</div>
                  <div
                    className="text-sm font-bold"
                    style={{
                      fontFamily: '"VT323", monospace',
                      fontSize: "1.05rem",
                      color: s.color,
                    }}
                  >
                    {s.value}
                  </div>
                  <div
                    className="text-[0.35rem]"
                    style={{
                      fontFamily: '"Press Start 2P", monospace',
                      color: "#b0d0b0",
                    }}
                  >
                    {s.label}
                  </div>
                  <div
                    className="text-[0.35rem] mt-0.5"
                    style={{
                      fontFamily: '"VT323", monospace',
                      color: "#b0d0b0",
                      fontSize: "0.85rem",
                    }}
                  >
                    {s.sub}
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Wallet Info */}
            <div
              className="mb-6 text-center"
              style={{ fontFamily: '"VT323", monospace', fontSize: "1rem", color: "#b0d0b0" }}
            >
              {solAddress && <span>SOL: {truncateAddress(solAddress)} </span>}
              {ethAddress && <span>ETH: {truncateAddress(ethAddress)}</span>}
            </div>

            {/* Tab Bar */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setActiveTab("holdings")}
                className={`retro-tab text-[0.4rem] ${activeTab === "holdings" ? "retro-tab-active" : ""}`}
                style={{ fontFamily: '"Press Start 2P", monospace' }}
              >
                💼 HOLDINGS ({holdings.length})
              </button>
              <button
                onClick={() => setActiveTab("alerts")}
                className={`retro-tab text-[0.4rem] ${activeTab === "alerts" ? "retro-tab-active" : ""}`}
                style={{ fontFamily: '"Press Start 2P", monospace' }}
              >
                🔔 MY ALERTS ({alerts.filter((a) => !a.triggered).length})
              </button>
              <button
                onClick={() => setActiveTab("notifications")}
                className={`retro-tab text-[0.4rem] ${activeTab === "notifications" ? "retro-tab-active" : ""}`}
                style={{ fontFamily: '"Press Start 2P", monospace' }}
              >
                📲 NOTIFICATIONS
              </button>
              {walletAddr && (
                <button
                  onClick={() => setActiveTab("creator")}
                  className={`retro-tab text-[0.4rem] ${activeTab === "creator" ? "retro-tab-active" : ""}`}
                  style={{ fontFamily: '"Press Start 2P", monospace' }}
                >
                  🎨 CREATOR
                </button>
              )}
            </div>

            {/* Chain Toggle */}
            <div className="flex gap-2 mb-4">
              {(["all", "solana", "ethereum"] as ChainFilter[]).map((ct) => (
                <button
                  key={ct}
                  onClick={() => setChainFilter(ct)}
                  className={`retro-tab text-[0.35rem] ${
                    chainFilter === ct ? "retro-tab-active" : ""
                  }`}
                  style={{ fontFamily: '"Press Start 2P", monospace' }}
                >
                  {ct === "all" ? "ALL" : ct === "solana" ? "◎ SOLANA" : "Ξ ETHEREUM"}
                </button>
              ))}
            </div>

            {activeTab === "holdings" ? (
              <>
                {/* Holdings Table */}
                {filteredHoldings.length === 0 ? (
                  <Card className="text-center py-8">
                    <p
                      className="text-[#b0d0b0]"
                      style={{ fontFamily: '"VT323", monospace', fontSize: "1.1rem" }}
                    >
                      No holdings on this chain.
                    </p>
                  </Card>
                ) : (
                  <div className="space-y-2 mb-8">
                    {filteredHoldings.map((h, i) => (
                      <motion.div
                        key={h.tokenId}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: Math.min(i * 0.03, 0.3) }}
                      >
                        <Link to="/token/$id" params={{ id: h.tokenId }}>
                          <Card className="p-3 group">
                            <div className="flex items-center gap-3">
                              {/* Token icon */}
                              <div
                                className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 overflow-hidden"
                                style={{
                                  background: "#0d120d",
                                  border: "2px solid rgba(0,255,65,0.2)",
                                }}
                              >
                                {h.image ? (
                                  <img src={h.image} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <span
                                    className="font-bold text-[#00ff41]"
                                    style={{
                                      fontFamily: '"Press Start 2P", monospace',
                                      fontSize: "0.45rem",
                                    }}
                                  >
                                    {h.ticker.slice(0, 2)}
                                  </span>
                                )}
                              </div>

                              {/* Info */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span
                                    className="font-bold text-[#ffffff]"
                                    style={{
                                      fontFamily: '"Press Start 2P", monospace',
                                      fontSize: "0.45rem",
                                    }}
                                  >
                                    {h.name}
                                  </span>
                                  <span
                                    className="text-[#e0ffe0]"
                                    style={{
                                      fontFamily: '"VT323", monospace',
                                      fontSize: "1rem",
                                    }}
                                  >
                                    ${h.ticker}
                                  </span>
                                </div>
                                <div
                                  className="flex items-center gap-3 mt-0.5"
                                  style={{
                                    fontFamily: '"VT323", monospace',
                                    fontSize: "0.9rem",
                                    color: "#e0ffe0",
                                  }}
                                >
                                  <span>{h.amount.toLocaleString()} tokens</span>
                                  <span>
                                    @ {h.currentPrice < 0.0001
                                      ? h.currentPrice.toFixed(8)
                                      : h.currentPrice.toFixed(6)}{" "}
                                    {currencySymbol(h.blockchain)}
                                  </span>
                                </div>
                              </div>

                              {/* P&L */}
                              <div className="text-right shrink-0">
                                <div
                                  className="font-bold"
                                  style={{
                                    fontFamily: '"VT323", monospace',
                                    fontSize: "1.1rem",
                                    color: h.pnl >= 0 ? "#00ff41" : "#ff4444",
                                  }}
                                >
                                  {h.pnl >= 0 ? "+" : ""}
                                  {h.pnl.toFixed(4)}
                                </div>
                                <div
                                  className="font-bold"
                                  style={{
                                    fontFamily: '"VT323", monospace',
                                    fontSize: "0.95rem",
                                    color: h.pnl >= 0 ? "#00ff41" : "#ff4444",
                                  }}
                                >
                                  {h.pnlPct >= 0 ? "+" : ""}
                                  {h.pnlPct.toFixed(2)}%
                                </div>
                                <div
                                  className="text-[#b0d0b0]"
                                  style={{
                                    fontFamily: '"VT323", monospace',
                                    fontSize: "0.8rem",
                                  }}
                                >
                                  {h.portfolioShare.toFixed(1)}% of portfolio
                                </div>
                              </div>
                            </div>

                            {/* Bonding curve progress */}
                            {h.curve && !h.curve.graduated && h.graduationProgress > 0 && (
                              <div className="mt-2">
                                <div
                                  className="h-1.5 rounded-sm overflow-hidden"
                                  style={{
                                    background: "#0d120d",
                                    border: "1px solid rgba(0,255,65,0.1)",
                                  }}
                                >
                                  <motion.div
                                    className="h-full"
                                    initial={{ width: 0 }}
                                    animate={{ width: `${Math.min(h.graduationProgress, 100)}%` }}
                                    transition={{ duration: 0.5 }}
                                    style={{
                                      background:
                                        h.graduationProgress >= 80
                                          ? "linear-gradient(90deg, #00ff41, #39ff14)"
                                          : "linear-gradient(90deg, #ffb83c, #ffd700)",
                                    }}
                                  />
                                </div>
                                <div
                                  className="text-right mt-0.5"
                                  style={{
                                    fontFamily: '"VT323", monospace',
                                    fontSize: "0.75rem",
                                    color: "#b0d0b0",
                                  }}
                                >
                                  {h.graduationProgress.toFixed(0)}% to 🎓
                                </div>
                              </div>
                            )}
                          </Card>
                        </Link>
                      </motion.div>
                    ))}
                  </div>
                )}

                {/* Recent Activity */}
                {recentTrades.length > 0 && (
                  <div className="mb-8">
                    <h3
                      className="text-[#00ff41] mb-4 pixel-shadow-sm"
                      style={{
                        fontFamily: '"Press Start 2P", monospace',
                        fontSize: "0.55rem",
                      }}
                    >
                      📜 RECENT ACTIVITY
                    </h3>
                    <div className="space-y-1.5">
                      {recentTrades.map((trade, i) => {
                        const isBuy = trade.type === "BUY";
                        return (
                          <motion.div
                            key={trade.id}
                            initial={{ opacity: 0, x: -5 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: Math.min(i * 0.02, 0.3) }}
                            className="retro-card p-2 flex items-center gap-3"
                          >
                            <span
                              className="font-bold shrink-0"
                              style={{
                                fontFamily: '"Press Start 2P", monospace',
                                fontSize: "0.35rem",
                                color: isBuy ? "#00ff41" : "#ff4444",
                              }}
                            >
                              {isBuy ? "💰 BUY" : "📉 SELL"}
                            </span>
                            <span
                              className="text-[#e0ffe0]"
                              style={{ fontFamily: '"VT323", monospace', fontSize: "0.95rem" }}
                            >
                              {trade.amount.toLocaleString()} ${trade.tokenTicker}
                            </span>
                            <span
                              className="text-[#b0d0b0] ml-auto"
                              style={{ fontFamily: '"VT323", monospace', fontSize: "0.85rem" }}
                            >
                              @ {trade.price.toFixed(6)}
                            </span>
                            <span
                              className="text-[#b0d0b0]"
                              style={{ fontFamily: '"VT323", monospace', fontSize: "0.85rem" }}
                            >
                              {getTimeAgo(trade.timestamp)}
                            </span>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            ) : null}

            {activeTab === "alerts" ? (
              renderAlertsTab()
            ) : null}

            {activeTab === "notifications" ? (
              renderNotificationsTab()
            ) : null}

            {activeTab === "creator" ? (
              renderCreatorTab()
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Sub-Components for Creator Tab ────────────

/** Retro canvas sparkline showing cumulative earnings over time */
function RevenueSparkline({ data, chainSymbol }: { data: number[]; chainSymbol: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || data.length < 2) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = rect.width;
    const h = 180;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    const maxVal = Math.max(...data, 0.0001);
    const minVal = Math.min(...data);
    const range = maxVal - minVal || 1;
    const pad = range * 0.1;
    const yMin = Math.max(0, minVal - pad);
    const yMax = maxVal + pad;

    const drawSparkline = (progress: number) => {
      ctx.clearRect(0, 0, w, h);

      // Background + CRT
      ctx.fillStyle = "#050505";
      ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 4) {
        ctx.fillStyle = "rgba(0,255,65,0.015)";
        ctx.fillRect(0, y, w, 1);
      }

      // Grid
      ctx.strokeStyle = "rgba(0,255,65,0.05)";
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const gy = 10 + ((h - 20) / 4) * i;
        ctx.beginPath();
        ctx.moveTo(10, Math.round(gy));
        ctx.lineTo(w - 10, Math.round(gy));
        ctx.stroke();
      }

      const plotW = w - 30;
      const plotH = h - 30;
      const drawCount = Math.floor(data.length * progress);

      if (drawCount < 2) return;

      // Draw neon green line
      ctx.beginPath();
      ctx.strokeStyle = "#00ff41";
      ctx.lineWidth = 2;
      ctx.shadowColor = "#00ff41";
      ctx.shadowBlur = 6;

      for (let i = 0; i < drawCount; i++) {
        const x = 15 + (i / (data.length - 1)) * plotW;
        const y = 15 + plotH - ((data[i] - yMin) / (yMax - yMin)) * plotH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Glowing dot at the latest point
      const lastIdx = drawCount - 1;
      const lx = 15 + (lastIdx / (data.length - 1)) * plotW;
      const ly = 15 + plotH - ((data[lastIdx] - yMin) / (yMax - yMin)) * plotH;
      ctx.beginPath();
      ctx.fillStyle = "#00ff41";
      ctx.shadowColor = "#00ff41";
      ctx.shadowBlur = 12;
      ctx.arc(lx, ly, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Trailing particles
      for (let p = 0; p < 4; p++) {
        const pi = lastIdx - p - 1;
        if (pi < 0) continue;
        const px = 15 + (pi / (data.length - 1)) * plotW;
        const py = 15 + plotH - ((data[pi] - yMin) / (yMax - yMin)) * plotH;
        ctx.beginPath();
        ctx.fillStyle = "#00ff41";
        ctx.globalAlpha = Math.max(0, 0.6 - p * 0.15);
        ctx.arc(px, py, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Y-axis labels
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillStyle = "#b0d0b0";
      ctx.textAlign = "right";
      for (let i = 0; i <= 3; i++) {
        const val = yMin + ((yMax - yMin) / 3) * i;
        const yy = 15 + plotH - (i / 3) * plotH;
        ctx.fillText(val < 0.001 ? val.toFixed(6) : val.toFixed(4), w - 5, yy + 3);
      }

      // Border
      ctx.strokeStyle = "rgba(0,255,65,0.15)";
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, w - 2, h - 2);
    };

    let progress = 0;
    const animate = () => {
      progress = Math.min(1, progress + 0.03);
      drawSparkline(progress);
      if (progress < 1) {
        animRef.current = requestAnimationFrame(animate);
      }
    };
    animate();

    return () => cancelAnimationFrame(animRef.current);
  }, [data]);

  return (
    <div ref={containerRef} className="w-full">
      <canvas ref={canvasRef} style={{ imageRendering: "pixelated", width: "100%", height: "180px" }} />
      <div className="flex justify-between mt-1" style={{ fontFamily: '"VT323", monospace', fontSize: "0.85rem", color: "#b0d0b0" }}>
        <span>Token #1</span>
        <span>{chainSymbol} earned over time</span>
        <span>Latest</span>
      </div>
    </div>
  );
}

/** Mini retro bar chart showing buys vs sells per token */
function MiniBuySellChart({ tokenId }: { tokenId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = 80;
    const h = 40;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, w, h);

    // Fetch trades count from localStorage synchronously
    const trades = (() => {
      try {
        const raw = localStorage.getItem("ignoshashi_trades");
        if (!raw) return [];
        return JSON.parse(raw);
      } catch { return []; }
    })() as any[];
    const tokenTrades = trades.filter((t: any) => t.tokenId === tokenId);
    const buys = tokenTrades.filter((t: any) => t.type === "BUY").length;
    const sells = tokenTrades.filter((t: any) => t.type === "SELL").length;
    const maxCount = Math.max(buys, sells, 1);
    const barH = (count: number) => Math.max(4, (count / maxCount) * 24);

    // Buy bar (green)
    ctx.fillStyle = "#00ff41";
    ctx.shadowColor = "#00ff41";
    ctx.shadowBlur = 4;
    const buyH = barH(buys);
    ctx.fillRect(14, 36 - buyH, 18, buyH);
    ctx.shadowBlur = 0;

    // Sell bar (red)
    ctx.fillStyle = "#ff4444";
    ctx.shadowColor = "#ff4444";
    ctx.shadowBlur = 4;
    const sellH = barH(sells);
    ctx.fillRect(48, 36 - sellH, 18, sellH);
    ctx.shadowBlur = 0;

    // Labels
    ctx.font = '6px "Press Start 2P", monospace';
    ctx.fillStyle = "#00ff41";
    ctx.textAlign = "center";
    ctx.fillText(`${buys}`, 23, 38);
    ctx.fillStyle = "#ff4444";
    ctx.fillText(`${sells}`, 57, 38);

    // Border
    ctx.strokeStyle = "rgba(0,255,65,0.1)";
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, w, h);
  }, [tokenId]);

  return <canvas ref={canvasRef} style={{ imageRendering: "pixelated", width: "80px", height: "40px" }} />;
}

/** Individual token performance card for the creator tab */
function TokenPerformanceCard({ token, chainSymbol, index }: { token: CreatorTokenData; chainSymbol: string; index: number }) {
  const isGraduated = token.status === "graduated";
  const [tokenAddress, setTokenAddress] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (isGraduated) {
      const tokens = getTokens();
      const t = tokens.find((x: any) => x.id === token.tokenId);
      if (t?.tokenAddress) setTokenAddress(t.tokenAddress);
    }
  }, [token.tokenId, isGraduated]);
  const { dexPrice } = useDexPrice({
    tokenAddress,
    chain: token.blockchain,
    isGraduated: !!(isGraduated && tokenAddress),
  });
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.3) }}
      className="retro-card p-3 cursor-pointer hover:border-[#00ff41] transition-colors"
      onClick={() => setExpanded((v) => !v)}
    >
      <div className="flex items-center gap-3">
        {/* Token image */}
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 overflow-hidden"
          style={{ background: "#0d120d", border: "2px solid rgba(0,255,65,0.2)" }}
        >
          {token.image ? (
            <img src={token.image} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="font-bold text-[#00ff41]" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.4rem" }}>
              {token.ticker.slice(0, 2)}
            </span>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[#ffffff]" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.45rem" }}>
              {token.tokenName}
            </span>
            <span className="text-[#e0ffe0]" style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}>
              ${token.ticker}
            </span>
            <span
              className="px-1.5 py-0.5 rounded text-[0.3rem]"
              style={{
                fontFamily: '"Press Start 2P", monospace',
                background: token.status === "graduated" ? "rgba(255,215,0,0.15)" : "rgba(0,255,65,0.1)",
                color: token.status === "graduated" ? "#ffd700" : "#00ff41",
              }}
            >
              {token.status === "graduated" ? "🎓 GRADUATED" : "📈 BONDING"}
            </span>
          </div>

          <div className="flex items-center gap-4 mt-1" style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem", color: "#e0ffe0" }}>
            <span>💰 {token.earnings.toFixed(4)} {chainSymbol}</span>
            <span>📊 {token.tradeCount} trades</span>
            <span>📅 {getTimeAgo(token.createdAt)}</span>
          </div>

          {/* Graduation progress */}
          <div className="mt-2">
            <div className="h-1.5 rounded-sm overflow-hidden" style={{ background: "#0d120d", border: "1px solid rgba(0,255,65,0.1)" }}>
              <motion.div
                className="h-full"
                initial={{ width: 0 }}
                animate={{ width: `${token.graduationProgress}%` }}
                transition={{ duration: 0.5 }}
                style={{
                  background: token.graduationProgress >= 80
                    ? "linear-gradient(90deg, #00ff41, #39ff14)"
                    : "linear-gradient(90deg, #ffb83c, #ffd700)",
                }}
              />
            </div>
            <div className="flex justify-between mt-0.5">
              <span style={{ fontFamily: '"VT323", monospace', fontSize: "0.75rem", color: "#b0d0b0" }}>
                {token.graduationProgress.toFixed(0)}% to 🎓
              </span>
              <MiniBuySellChart tokenId={token.tokenId} />
            </div>
          </div>
        </div>

        {/* Expand indicator */}
        <span className="text-[#b0d0b0] shrink-0" style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}>
          {expanded ? "▲" : "▼"}
        </span>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          className="mt-3 pt-3 border-t border-[rgba(0,255,65,0.1)]"
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            {[
              { label: "SUPPLY", value: token.supply.toLocaleString() },
              { label: "PRICE", value: (isGraduated && dexPrice ? `$${dexPrice.price < 0.0001 ? dexPrice.price.toFixed(8) : dexPrice.price.toFixed(6)} (DEX)` : `${token.price < 0.0001 ? token.price.toFixed(8) : token.price.toFixed(6)} ${chainSymbol}`) },
              { label: "MARKET CAP", value: `${token.marketCap.toFixed(2)} ${chainSymbol}` },
              { label: "VOLUME", value: `${token.volume.toFixed(2)} ${chainSymbol}` },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <div style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.3rem", color: "#b0d0b0" }}>{s.label}</div>
                <div style={{ fontFamily: '"VT323", monospace', fontSize: "0.95rem", color: "#ffffff" }}>{s.value}</div>
              </div>
            ))}
          </div>
          <Link
            to="/token/$id"
            params={{ id: token.tokenId }}
            className="retro-btn retro-btn-turquoise text-[0.35rem] px-3 py-1.5 inline-flex items-center gap-1"
            style={{ fontFamily: '"Press Start 2P", monospace' }}
          >
            🔍 VIEW TOKEN
          </Link>
        </motion.div>
      )}
    </motion.div>
  );
}
