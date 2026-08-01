import { Link, useLocation } from "@tanstack/react-router";
import { useState, useEffect, useRef, useCallback } from "react";
import { HiMiniBars3, HiMiniXMark, HiMiniMagnifyingGlass } from "react-icons/hi2";
import { useWallet, truncateAddress, getSolanaWallets, getEthereumWallets } from "~/context/WalletContext";
import { useTheme } from "~/context/ThemeContext";
import { ThemePicker } from "~/components/ThemePicker";
import { NotificationBell } from "~/components/NotificationBell";
import { getTokens, addToken, type TokenData } from "~/services/tracker";
import { getEarnedCount } from "~/services/achievements";
import { onPresenceChange, getOnlineCount, fetchGlobalCount, startGlobalPresence } from "~/services/presence";
import { isBattleActive } from "~/services/battles";
import { sanitizeSearch } from "~/utils/sanitize";

// Contract address detection
function isSolanaAddress(q: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(q);
}
function isEthereumAddress(q: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(q);
}
function looksLikeCA(q: string): "solana" | "ethereum" | false {
  if (isSolanaAddress(q)) return "solana";
  if (isEthereumAddress(q)) return "ethereum";
  return false;
}

// DexScreener API helper for search
async function searchDexScreener(query: string): Promise<{
  name: string; ticker: string; address: string; chain: string;
  priceUsd?: string; priceChange24h?: number;
}[]> {
  try {
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query)}`
    );
    if (!res.ok) return [];
    const json = await res.json();
    const pairs: any[] = json.pairs || [];
    const seen = new Set<string>();
    const results: any[] = [];
    for (const p of pairs) {
      const addr = p.baseToken?.address || "";
      if (!seen.has(addr)) {
        seen.add(addr);
        results.push({
          name: p.baseToken?.name || "Unknown",
          ticker: p.baseToken?.symbol || "???",
          address: addr,
          chain: p.chainId || "unknown",
          priceUsd: p.priceUsd,
          priceChange24h: p.priceChange?.h24,
        });
      }
    }
    return results.slice(0, 5);
  } catch {
    return [];
  }
}

const navCategories = [
  {
    label: "🚀",
    links: [
      { to: "/", label: "Home" },
      { to: "/create", label: "Create" },
      { to: "/portfolio", label: "Folio" },
      { to: "/earnings", label: "💰" },
      { to: "/feed", label: "Feed" },
      { to: "/watchlist", label: "⭐" },
    ],
  },
  {
    label: "📊",
    links: [
      { to: "/terminal", label: "Terminal" },
      { to: "/trends", label: "Trends" },
      { to: "/leaderboard", label: "Ranks" },
      { to: "/analytics", label: "Stats" },
    ],
  },
  {
    label: "👥",
    links: [
      { to: "/community", label: "Chat" },
      { to: "/battles", label: "⚔️", badge: true },
      { to: "/referrals", label: "🔗" },
      { to: "/creator", label: "Creator" },
      { to: "/achievements", label: "🏆", badge: true },
    ],
  },
  {
    label: "🛠",
    links: [
      { to: "/buy", label: "Tools" },
      { to: "/about", label: "About" },
    ],
  },
];

export function Navbar() {
  const themeCtx = useTheme();
  const { theme } = themeCtx;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [hamburgerOpen, setHamburgerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<TokenData[]>([]);
  const [dexResults, setDexResults] = useState<{ name: string; ticker: string; address: string; chain: string; priceUsd?: string }[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [searchingDex, setSearchingDex] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const walletRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const currentPath = location.pathname;
  const { connected, solAddress, ethAddress, connect, disconnect, getBalance, isMobileNoWallet, isPhantomInApp, phantomDeepLink, phantomDownloadUrl } = useWallet();
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [ethBalance, setEthBalance] = useState<number | null>(null);
  const [onlineCount, setOnlineCount] = useState(() => {
    if (typeof window !== "undefined") return getOnlineCount();
    return 0;
  });
  const [globalCount, setGlobalCount] = useState(0);
  const [achievementCount, setAchievementCount] = useState(0);
  const [battleLive, setBattleLive] = useState(false);

  // Fetch wallet balances
  const fetchBalances = useCallback(async () => {
    if (solAddress) {
      try {
        const bal = await getBalance("solana");
        setSolBalance(bal);
      } catch {
        setSolBalance(null);
      }
    } else {
      setSolBalance(null);
    }
    if (ethAddress) {
      try {
        const bal = await getBalance("ethereum");
        setEthBalance(bal);
      } catch {
        setEthBalance(null);
      }
    } else {
      setEthBalance(null);
    }
  }, [solAddress, ethAddress, getBalance]);

  // Fetch balances on connect and every 30s
  useEffect(() => {
    fetchBalances();
    const interval = setInterval(fetchBalances, 30000);
    return () => clearInterval(interval);
  }, [fetchBalances]);

  // Subscribe to presence changes
  useEffect(() => {
    const unsub = onPresenceChange((_users, count) => {
      setOnlineCount(count);
    });
    return unsub;
  }, []);

  // Global visitor counter polling
  useEffect(() => {
    fetchGlobalCount().then(setGlobalCount);
    const stopGlobal = startGlobalPresence();
    const countInterval = setInterval(() => {
      fetchGlobalCount().then(setGlobalCount);
    }, 5000);
    return () => {
      stopGlobal();
      clearInterval(countInterval);
    };
  }, []);

  // Update achievement count when wallet changes
  useEffect(() => {
    const walletAddr = solAddress || ethAddress || "";
    if (walletAddr) {
      setAchievementCount(getEarnedCount(walletAddr));
    } else {
      setAchievementCount(0);
    }
  }, [solAddress, ethAddress]);

  // Poll battle live status
  useEffect(() => {
    const check = () => setBattleLive(isBattleActive());
    check();
    const interval = setInterval(check, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
        if (!searchQuery) setSearchOpen(false);
      }
      if (walletRef.current && !walletRef.current.contains(e.target as Node)) {
        setWalletOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [searchQuery]);

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); setDexResults([]); return; }
    const timer = setTimeout(async () => {
      const q = searchQuery.toLowerCase();
      
      // Check if it looks like a contract address
      const ca = looksLikeCA(searchQuery.trim());
      
      // Always search local tokens
      const tokens = getTokens();
      const localResults = tokens.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.ticker.toLowerCase().includes(q) ||
          (t.tokenAddress && t.tokenAddress.toLowerCase().includes(q))
      );
      setSearchResults(localResults);
      
      // If it's a CA or very specific query, search DexScreener
      if (ca || localResults.length === 0) {
        setSearchingDex(true);
        const dex = await searchDexScreener(searchQuery.trim());
        setDexResults(dex);
        setSearchingDex(false);
      } else {
        setDexResults([]);
      }
      
      setShowResults(true);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Follow functionality
  const [followedIds, setFollowedIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(localStorage.getItem("ignoshashi_followed") || "[]");
    } catch {
      return [];
    }
  });
  const [searchTab, setSearchTab] = useState<"all" | "following">("all");

  const followedTokens = (() => {
    if (followedIds.length === 0) return [];
    const allTokens = getTokens();
    return allTokens.filter((t) => followedIds.includes(t.id));
  })();

  const displayResults = searchTab === "following" ? followedTokens : searchResults;

  // Convert hex bg to "95% opacity" version for glassmorphic navbar
  const navBg = theme.bg + "/95";

  return (
    <nav
      className="sticky top-0 z-50 backdrop-blur-md"
      style={{
        background: `${theme.bg}f2`, /* ~95% opacity */
        borderBottom: `1px solid ${theme.border}`,
        boxShadow: `0 0 20px ${theme.primary}0D`,
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 gap-3">
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <span className="text-xl retro-float inline-block mr-1">🚀</span>
            <span
              className="text-sm font-bold pixel-shadow-sm tracking-wider"
              style={{
                fontFamily: '"Press Start 2P", monospace',
                fontSize: "0.65rem",
                color: theme.primary,
              }}
            >
              IGNOSHASHI
            </span>
          </Link>

          {(globalCount > 0 || onlineCount > 0) && (
            <div
              className="flex items-center gap-1.5 px-2 py-1 rounded-md"
              style={{
                background: `${theme.primary}0F`,
                border: `1px solid ${theme.border}`,
              }}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{
                  background: "#00ff41",
                  boxShadow: "0 0 6px #00ff41, 0 0 12px rgba(0,255,65,0.4)",
                  animation: "pulse 1.5s ease-in-out infinite",
                }}
              />
              <span
                style={{
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: "0.4rem",
                  color: "#00ff41",
                  textShadow: "0 0 8px rgba(0,255,65,0.5)",
                }}
              >
                {globalCount > 0 ? globalCount : onlineCount}
              </span>
            </div>
          )}

          <div
            className="hidden md:flex items-center gap-0 justify-center"
          >
            {navCategories.map((cat, ci) => (
              <div key={cat.label} className="flex items-center gap-0">
                {ci > 0 && (
                  <span className="text-[0.35rem] opacity-20 mx-0.5 select-none" style={{ fontFamily: '"Press Start 2P", monospace' }}>|</span>
                )}
                {cat.links.map((link) => {
                  const isActive = currentPath === link.to || (link.to === "/" && currentPath === "/");
                  const isBattles = link.to === "/battles";
                  return (
                    <Link
                      key={link.to}
                      to={link.to}
                      className={`px-0.5 py-1 rounded text-[0.4rem] font-bold transition-all duration-100 relative whitespace-nowrap ${
                        isActive ? "retro-tab-active" : "retro-tab"
                      }`}
                      style={{ fontFamily: '"Press Start 2P", monospace' }}
                    >
                      {link.label}
                      {isBattles && battleLive && (
                        <span
                          className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full"
                          style={{
                            background: "#ef476f",
                            boxShadow: "0 0 6px #ef476f",
                          }}
                        />
                      )}
                      {"badge" in link && achievementCount > 0 && (
                        <span
                          className="absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full flex items-center justify-center text-[0.3rem] font-bold"
                          style={{
                            background: "#ffd700",
                            color: "#000",
                            fontSize: "0.3rem",
                          }}
                        >
                          {achievementCount > 9 ? "9+" : achievementCount}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-3 shrink-0">
            <div ref={searchRef} className="relative">
              {searchOpen ? (
                <div
                  className="flex items-center gap-2 rounded-md px-2 py-1"
                  style={{
                    background: theme.bgSecondary + "e6",
                    border: `1px solid ${theme.border}`,
                  }}
                >
                  <HiMiniMagnifyingGlass style={{ color: theme.textMuted }} className="text-sm shrink-0" />
                  <input
                    type="text" value={searchQuery} onChange={(e) => setSearchQuery(sanitizeSearch(e.target.value))}
                    placeholder="SEARCH..." autoFocus
                    className="bg-transparent text-sm outline-none w-32 lg:w-40"
                    style={{
                      fontFamily: '"VT323", monospace',
                      fontSize: "1rem",
                      color: theme.text,
                    }}
                    onBlur={() => { if (!searchQuery) setSearchOpen(false); }}
                  />
                </div>
              ) : (
                <button
                  onClick={() => setSearchOpen(true)}
                  className="p-1.5 rounded-md transition-colors duration-100"
                  style={{
                    color: theme.text,
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.color = theme.primary;
                    (e.currentTarget as HTMLElement).style.background = `${theme.primary}0F`;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.color = theme.text;
                    (e.currentTarget as HTMLElement).style.background = "";
                  }}
                >
                  <HiMiniMagnifyingGlass size={16} />
                </button>
              )}
              {showResults && (displayResults.length > 0 || dexResults.length > 0 || searchingDex || searchTab === "following") && (
                <div className="absolute top-full mt-2 left-0 right-0 retro-card p-2 z-50 max-h-72 overflow-y-auto custom-scrollbar min-w-[240px]">
                  {/* Tabs */}
                  <div className="flex gap-1 mb-2">
                    <button
                      onClick={() => { setSearchTab("all"); setShowResults(true); }}
                      className={`text-[0.4rem] px-2 py-1 rounded font-bold ${searchTab === "all" ? "retro-tab-active" : "retro-tab"}`}
                      style={{ fontFamily: '"Press Start 2P", monospace' }}
                    >
                      ALL
                    </button>
                    <button
                      onClick={() => { setSearchTab("following"); setShowResults(true); }}
                      className={`text-[0.4rem] px-2 py-1 rounded font-bold ${searchTab === "following" ? "retro-tab-active" : "retro-tab"}`}
                      style={{ fontFamily: '"Press Start 2P", monospace' }}
                    >
                      ⭐ FOLLOWING ({followedIds.length})
                    </button>
                  </div>
                  {searchingDex && (
                    <p className="text-center py-2" style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem", color: theme.textMuted }}>
                      Searching DexScreener...
                    </p>
                  )}
                  {/* ignoshashi results */}
                  {displayResults.length > 0 && (
                    <>
                      {dexResults.length > 0 && (
                        <div className="text-[0.35rem] px-1 mb-1" style={{ fontFamily: '"Press Start 2P", monospace', color: theme.primary }}>
                          🏠 IGNOSHASHI
                        </div>
                      )}
                      {displayResults.map((t) => (
                        <Link key={t.id} to="/token/$id" params={{ id: t.id }}
                          onClick={() => { setShowResults(false); setSearchQuery(""); setSearchOpen(false); setDexResults([]); }}
                          className="flex items-center gap-2 p-2 rounded-md transition-colors duration-100"
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLElement).style.background = `${theme.primary}0D`;
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLElement).style.background = "";
                          }}
                        >
                          <span style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem", color: theme.text }}>{t.ticker}</span>
                          <span style={{ fontFamily: '"VT323", monospace', fontSize: "1rem", color: theme.text }}>{t.name}</span>
                          <span style={{ fontFamily: '"VT323", monospace', fontSize: "1rem", color: theme.primary, marginLeft: "auto" }}>${t.price.toFixed(6)}</span>
                        </Link>
                      ))}
                    </>
                  )}
                  {/* DexScreener results */}
                  {dexResults.length > 0 && searchTab === "all" && (
                    <>
                      <div className="text-[0.35rem] px-1 mb-1 mt-2" style={{ fontFamily: '"Press Start 2P", monospace', color: theme.warning }}>
                        📋 DEXSCREENER
                      </div>
                      {dexResults.map((dr, i) => (
                        <div key={`dex-${i}`} className="flex items-center gap-2 p-2 rounded-md">
                          <span style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem", color: theme.text }}>{dr.ticker}</span>
                          <span style={{ fontFamily: '"VT323", monospace', fontSize: "1rem", color: theme.text }}>{dr.name}</span>
                          <span style={{ fontFamily: '"VT323", monospace', fontSize: "0.8rem", color: theme.textMuted }}>{dr.chain}</span>
                          {dr.priceUsd && (
                            <span style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem", color: theme.primary, marginLeft: "auto" }}>
                              ${parseFloat(dr.priceUsd).toFixed(6)}
                            </span>
                          )}
                          <button
                            onClick={() => {
                              // Import to ignoshashi
                              const existing = getTokens();
                              const newId = `import-${dr.address.slice(0, 8)}-${Date.now()}`;
                              if (!existing.find((t) => t.tokenAddress === dr.address || t.id === newId)) {
                                addToken({
                                  id: newId,
                                  name: dr.name,
                                  ticker: dr.ticker,
                                  description: `Imported from DexScreener (${dr.chain})`,
                                  supply: 1_000_000_000,
                                  blockchain: dr.chain === "solana" ? "solana" : "ethereum",
                                  image: "",
                                  creator: "dex_import",
                                  marketCap: dr.priceUsd ? parseFloat(dr.priceUsd) * 1_000_000 : 0,
                                  price: dr.priceUsd ? parseFloat(dr.priceUsd) : 0,
                                  volume24h: 0,
                                  priceHistory: [dr.priceUsd ? parseFloat(dr.priceUsd) : 0],
                                  createdAt: Date.now(),
                                  tokenAddress: dr.address,
                                });
                              }
                              setShowResults(false);
                              setSearchQuery("");
                              setSearchOpen(false);
                              setDexResults([]);
                            }}
                            className="text-[0.35rem] px-1.5 py-0.5 rounded"
                            style={{
                              fontFamily: '"Press Start 2P", monospace',
                              background: `${theme.primary}15`,
                              border: `1px solid ${theme.border}`,
                              color: theme.primary,
                            }}
                          >
                            IMPORT
                          </button>
                        </div>
                      ))}
                    </>
                  )}
                  {displayResults.length === 0 && dexResults.length === 0 && !searchingDex && (
                    <p className="text-center py-4" style={{ fontFamily: '"VT323", monospace', fontSize: "1rem", color: theme.textMuted }}>
                      {searchTab === "following" ? "No followed tokens yet" : "No results found"}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div ref={walletRef} className="relative">
              {connected ? (
                <button onClick={() => setWalletOpen(!walletOpen)} className="retro-btn retro-btn-turquoise text-[0.45rem] px-3 py-1.5 flex items-center gap-2 flex-wrap">
                  <span
                    className="w-2 h-2 rounded-full retro-blink inline-block"
                    style={{
                      background: theme.primary,
                      borderColor: theme.border,
                    }}
                  />
                  {solAddress && (
                    <span style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}>
                      ◎ {solBalance !== null ? solBalance.toFixed(2) : "—"} SOL
                    </span>
                  )}
                  {ethAddress && (
                    <span style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}>
                      Ξ {ethBalance !== null ? ethBalance.toFixed(2) : "—"} ETH
                    </span>
                  )}
                </button>
              ) : (
                <button onClick={() => setWalletOpen(!walletOpen)} className="retro-btn retro-btn-orange text-[0.45rem] px-3 py-1.5">
                  CONNECT
                </button>
              )}
              {walletOpen && (
                <div className="absolute top-full right-0 mt-2 retro-card p-3 z-50 min-w-[220px]">
                  {connected ? (
                    <div className="space-y-2">
                      {solAddress && (
                        <div>
                          <div style={{ fontFamily: '"VT323", monospace', fontSize: "1rem", color: theme.text }}>
                            ◎ SOL: {truncateAddress(solAddress)}
                          </div>
                          <div style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem", color: theme.primary }}>
                            Balance: {solBalance !== null ? `◎ ${solBalance.toFixed(4)} SOL` : "—"}
                          </div>
                        </div>
                      )}
                      {ethAddress && (
                        <div>
                          <div style={{ fontFamily: '"VT323", monospace', fontSize: "1rem", color: theme.text }}>
                            Ξ ETH: {truncateAddress(ethAddress)}
                          </div>
                          <div style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem", color: theme.primary }}>
                            Balance: {ethBalance !== null ? `Ξ ${ethBalance.toFixed(4)} ETH` : "—"}
                          </div>
                        </div>
                      )}
                      <div className="flex gap-2">
                        {solAddress && <button onClick={() => { disconnect("solana"); setWalletOpen(false); }} className="retro-btn retro-btn-pink text-[0.4rem] px-2 py-1 flex-1">DISCONNECT SOL</button>}
                        {ethAddress && <button onClick={() => { disconnect("ethereum"); setWalletOpen(false); }} className="retro-btn retro-btn-pink text-[0.4rem] px-2 py-1 flex-1">DISCONNECT ETH</button>}
                      </div>
                      {!solAddress && !ethAddress && <button onClick={() => { disconnect(); setWalletOpen(false); }} className="retro-btn retro-btn-pink text-[0.45rem] px-3 py-1.5 w-full">DISCONNECT ALL</button>}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {/* Mobile-specific: Phantom guidance in wallet dropdown */}
                      {isMobileNoWallet && (
                        <div
                          className="p-2 rounded-md mb-2"
                          style={{
                            background: `${theme.primary}0F`,
                            border: `1px solid ${theme.border}`,
                          }}
                        >
                          <p style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.3rem", color: theme.primary, marginBottom: "0.25rem" }}>
                            📱 BEST ON PHANTOM
                          </p>
                          <p style={{ fontFamily: '"VT323", monospace', fontSize: "0.85rem", color: theme.text, marginBottom: "0.5rem" }}>
                            Open MemeVault in Phantom's built-in browser.
                          </p>
                          <div className="flex gap-1.5">
                            <a
                              href={phantomDeepLink}
                              className="retro-btn retro-btn-orange text-[0.3rem] px-2 py-1 flex-1 text-center"
                              style={{ fontFamily: '"Press Start 2P", monospace' }}
                            >
                              OPEN
                            </a>
                            <a
                              href={phantomDownloadUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="retro-btn retro-btn-outline text-[0.3rem] px-2 py-1 flex-1 text-center"
                              style={{ fontFamily: '"Press Start 2P", monospace' }}
                            >
                              GET APP
                            </a>
                          </div>
                        </div>
                      )}
                      <p style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.4rem", color: theme.text }}>SOLANA</p>
                      {typeof window !== "undefined" && getSolanaWallets().length > 0 ? (
                        getSolanaWallets().map((w) => <button key={w.name} onClick={() => { connect("solana", w.name); setWalletOpen(false); }} className="retro-btn retro-btn-orange text-[0.4rem] px-2 py-1 w-full">{w.name}</button>)
                      ) : (
                        !isMobileNoWallet && <button onClick={() => { connect("solana"); setWalletOpen(false); }} className="retro-btn retro-btn-orange text-[0.45rem] px-3 py-1.5 w-full">◎ SOLANA</button>
                      )}
                      <p style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.4rem", color: theme.text, marginTop: "0.5rem", marginBottom: "0.25rem" }}>ETHEREUM</p>
                      {typeof window !== "undefined" && getEthereumWallets().length > 0 ? (
                        getEthereumWallets().map((w) => <button key={w.name} onClick={() => { connect("ethereum", w.name); setWalletOpen(false); }} className="retro-btn retro-btn-yellow text-[0.4rem] px-2 py-1 w-full">{w.name}</button>)
                      ) : (
                        <button onClick={() => { connect("ethereum"); setWalletOpen(false); }} className="retro-btn retro-btn-yellow text-[0.45rem] px-3 py-1.5 w-full">Ξ ETHEREUM</button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Social icons */}
            <div className="hidden md:flex items-center gap-1.5">
              <NotificationBell />
              <a
                href="https://discord.com/invite/Tu5P7y9Pj"
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded-md transition-colors duration-100"
                style={{ color: theme.textMuted }}
                title="Join our Discord"
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.color = "#5865f2";
                  (e.currentTarget as HTMLElement).style.background = "rgba(88,101,242,0.1)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.color = theme.textMuted;
                  (e.currentTarget as HTMLElement).style.background = "";
                }}
              >
                <span className="text-base">💬</span>
              </a>
              <a
                href="https://x.com/ignoshashi"
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded-md transition-colors duration-100"
                style={{ color: theme.textMuted }}
                title="Follow on X"
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.color = "#1da1f2";
                  (e.currentTarget as HTMLElement).style.background = "rgba(29,161,242,0.1)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.color = theme.textMuted;
                  (e.currentTarget as HTMLElement).style.background = "";
                }}
              >
                <span className="text-base">🐦</span>
              </a>
              <ThemePicker />
              {/* Hamburger menu */}
              <div className="relative">
                <button
                  onClick={() => setHamburgerOpen(!hamburgerOpen)}
                  className="p-1.5 rounded-md transition-colors duration-100"
                  style={{ color: theme.textMuted }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.color = theme.primary;
                    (e.currentTarget as HTMLElement).style.background = `${theme.primary}0F`;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.color = theme.textMuted;
                    (e.currentTarget as HTMLElement).style.background = "";
                  }}
                  title="Menu"
                >
                  <span className="text-base">☰</span>
                </button>
                {hamburgerOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setHamburgerOpen(false)} />
                    <div
                      className="absolute top-full right-0 mt-2 retro-card p-2 z-50 min-w-[180px]"
                      style={{ background: `${theme.bgSecondary}f5` }}
                    >
                      {navCategories.map((cat) => (
                        <div key={cat.label}>
                          <div className="px-3 py-1 text-[0.45rem] opacity-50" style={{ fontFamily: '"Press Start 2P", monospace' }}>{cat.label}</div>
                          {cat.links.map((link) => (
                            <Link
                              key={link.to}
                              to={link.to}
                              onClick={() => setHamburgerOpen(false)}
                              className="block px-5 py-1.5 rounded-md transition-colors duration-100"
                              style={{ fontFamily: '"VT323", monospace', fontSize: "1rem", color: theme.text }}
                              onMouseEnter={(e) => {
                                (e.currentTarget as HTMLElement).style.background = `${theme.primary}15`;
                                (e.currentTarget as HTMLElement).style.color = theme.primary;
                              }}
                              onMouseLeave={(e) => {
                                (e.currentTarget as HTMLElement).style.background = "";
                                (e.currentTarget as HTMLElement).style.color = theme.text;
                              }}
                            >
                              {link.label}
                            </Link>
                          ))}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <button className="md:hidden retro-btn retro-btn-outline text-[0.45rem] p-2" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Toggle menu">
            {mobileOpen ? <HiMiniXMark size={18} /> : <HiMiniBars3 size={18} />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div
          className="md:hidden backdrop-blur-md"
          style={{
            background: `${theme.bg}fa`,
            borderTop: `1px solid ${theme.border}`,
          }}
        >
          <div className="px-4 py-3 space-y-2">
            <div
              className="flex items-center gap-2 rounded-md px-3 py-2 mb-3"
              style={{
                background: theme.bgSecondary + "e6",
                border: `1px solid ${theme.border}`,
              }}
            >
              <HiMiniMagnifyingGlass style={{ color: theme.textMuted }} className="text-sm shrink-0" />
              <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(sanitizeSearch(e.target.value))} placeholder="SEARCH..."
                className="bg-transparent text-sm outline-none w-full"
                style={{
                  fontFamily: '"VT323", monospace',
                  fontSize: "1rem",
                  color: theme.text,
                }}
              />
            </div>
            {navCategories.map((cat) => (
              <div key={cat.label} className="mb-1">
                <div className="px-4 py-1 text-[0.4rem] opacity-40" style={{ fontFamily: '"Press Start 2P", monospace' }}>{cat.label}</div>
                {cat.links.map((link) => (
                  <Link key={link.to} to={link.to} onClick={() => setMobileOpen(false)}
                    className={`block px-4 py-2 rounded-md text-[0.45rem] font-bold transition-colors duration-100 ml-2 ${currentPath === link.to ? "retro-tab-active" : "retro-tab"}`}
                    style={{ fontFamily: '"Press Start 2P", monospace' }}>
                    {link.label}
                  </Link>
                ))}
              </div>
            ))}
            <div className="pt-2 space-y-2">
              {connected ? (
                <div className="space-y-2">
                  {solAddress && (
                    <div className="px-2" style={{ fontFamily: '"VT323", monospace', fontSize: "1rem", color: theme.text }}>
                      ◎ SOL: {truncateAddress(solAddress)}
                    </div>
                  )}
                  {ethAddress && (
                    <div className="px-2" style={{ fontFamily: '"VT323", monospace', fontSize: "1rem", color: theme.text }}>
                      Ξ ETH: {truncateAddress(ethAddress)}
                    </div>
                  )}
                  <button onClick={() => { disconnect(); setMobileOpen(false); }} className="retro-btn retro-btn-pink text-[0.45rem] px-3 py-1.5 w-full">DISCONNECT ALL</button>
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Mobile-specific: Phantom deep link banner */}
                  {isMobileNoWallet && (
                    <div
                      className="p-3 rounded-md mb-2"
                      style={{
                        background: `${theme.primary}0F`,
                        border: `1px solid ${theme.border}`,
                      }}
                    >
                      <p style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.35rem", color: theme.primary, marginBottom: "0.5rem" }}>
                        📱 BEST ON PHANTOM
                      </p>
                      <p style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem", color: theme.text, marginBottom: "0.5rem" }}>
                        For the best experience, open MemeVault inside the Phantom Wallet app browser.
                      </p>
                      <div className="flex gap-2">
                        <a
                          href={phantomDeepLink}
                          className="retro-btn retro-btn-orange text-[0.35rem] px-2 py-1.5 flex-1 text-center"
                          style={{ fontFamily: '"Press Start 2P", monospace' }}
                        >
                          OPEN PHANTOM
                        </a>
                        <a
                          href={phantomDownloadUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="retro-btn retro-btn-outline text-[0.35rem] px-2 py-1.5 flex-1 text-center"
                          style={{ fontFamily: '"Press Start 2P", monospace' }}
                        >
                          GET APP
                        </a>
                      </div>
                    </div>
                  )}

                  {/* In Phantom in-app browser — connect directly */}
                  {isPhantomInApp && (
                    <div
                      className="p-2 rounded-md mb-2 text-center"
                      style={{
                        background: `${theme.primary}15`,
                        border: `1px solid ${theme.border}`,
                      }}
                    >
                      <p style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem", color: theme.primary }}>
                        ✅ You're in Phantom!
                      </p>
                    </div>
                  )}

                  <p style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.4rem", color: theme.text }}>SOLANA</p>
                  {typeof window !== "undefined" && getSolanaWallets().length > 0 ? (
                    getSolanaWallets().map((w) => <button key={w.name} onClick={() => { connect("solana", w.name); setMobileOpen(false); }} className="retro-btn retro-btn-orange text-[0.45rem] px-3 py-1.5 w-full">{w.name}</button>)
                  ) : (
                    !isMobileNoWallet && <button onClick={() => { connect("solana"); setMobileOpen(false); }} className="retro-btn retro-btn-orange text-[0.45rem] px-3 py-1.5 w-full">◎ SOLANA</button>
                  )}
                  <p style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.4rem", color: theme.text, marginTop: "0.5rem" }}>ETHEREUM</p>
                  {typeof window !== "undefined" && getEthereumWallets().length > 0 ? (
                    getEthereumWallets().map((w) => <button key={w.name} onClick={() => { connect("ethereum", w.name); setMobileOpen(false); }} className="retro-btn retro-btn-yellow text-[0.45rem] px-3 py-1.5 w-full">{w.name}</button>)
                  ) : (
                    <button onClick={() => { connect("ethereum"); setMobileOpen(false); }} className="retro-btn retro-btn-yellow text-[0.45rem] px-3 py-1.5 w-full">Ξ ETHEREUM</button>
                  )}
                </div>
              )}
              {/* Mobile theme picker */}
              <div className="pt-2 flex justify-center">
                <ThemePicker />
              </div>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
