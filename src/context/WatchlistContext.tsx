import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";

/* ─── Cookie helpers ──────────────────────────── */

const COOKIE_NAME = "ignoshashi_watchlist";
const COOKIE_DAYS = 365;

function setCookie(name: string, value: string, days: number): void {
  if (typeof window === "undefined") return;
  const d = new Date();
  d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${d.toUTCString()};path=/;SameSite=Lax`;
}

function getCookie(name: string): string | null {
  if (typeof window === "undefined") return null;
  const nameEq = name + "=";
  const ca = document.cookie.split(";");
  for (let c of ca) {
    c = c.trim();
    if (c.startsWith(nameEq)) {
      return decodeURIComponent(c.substring(nameEq.length));
    }
  }
  return null;
}

interface WatchlistData {
  tokenIds: string[];
  creators: string[];
}

function loadWatchlist(): WatchlistData {
  try {
    const raw = getCookie(COOKIE_NAME);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        tokenIds: Array.isArray(parsed.tokenIds) ? parsed.tokenIds : [],
        creators: Array.isArray(parsed.creators) ? parsed.creators : [],
      };
    }
  } catch { /* corrupted cookie */ }
  return { tokenIds: [], creators: [] };
}

function saveWatchlist(data: WatchlistData): void {
  try {
    setCookie(COOKIE_NAME, JSON.stringify(data), COOKIE_DAYS);
  } catch { /* ignore */ }
}

/* ─── Context ─────────────────────────────────── */

interface WatchlistState {
  /** Watchlisted token IDs */
  watchedTokenIds: string[];
  /** Watchlisted creator wallet addresses */
  watchedCreators: string[];
  /** Check if a token is watched */
  isTokenWatched: (tokenId: string) => boolean;
  /** Check if a creator is watched */
  isCreatorWatched: (creatorAddress: string) => boolean;
  /** Toggle a token in/out of watchlist */
  toggleToken: (tokenId: string) => void;
  /** Toggle a creator in/out of watchlist */
  toggleCreator: (creatorAddress: string) => void;
  /** Total watched items count */
  watchCount: number;
}

const WatchlistContext = createContext<WatchlistState>({
  watchedTokenIds: [],
  watchedCreators: [],
  isTokenWatched: () => false,
  isCreatorWatched: () => false,
  toggleToken: () => {},
  toggleCreator: () => {},
  watchCount: 0,
});

export function WatchlistProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<WatchlistData>(() => {
    return loadWatchlist();
  });

  // Listen for cookie changes from other tabs
  useEffect(() => {
    const checkCookie = () => {
      const fresh = loadWatchlist();
      setData((prev) => {
        if (
          JSON.stringify(fresh.tokenIds.sort()) !== JSON.stringify(prev.tokenIds.sort()) ||
          JSON.stringify(fresh.creators.sort()) !== JSON.stringify(prev.creators.sort())
        ) {
          return fresh;
        }
        return prev;
      });
    };

    // Poll for cookie changes every 2s (cross-tab sync)
    const interval = setInterval(checkCookie, 2000);
    // Also listen for BroadcastChannel events
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel("ignoshashi");
      bc.onmessage = (event) => {
        if (event.data?.type === "watchlist-changed") {
          checkCookie();
        }
      };
    } catch { /* ignore */ }
    return () => {
      clearInterval(interval);
      if (bc) bc.close();
    };
  }, []);

  const isTokenWatched = useCallback(
    (tokenId: string) => data.tokenIds.includes(tokenId),
    [data.tokenIds],
  );

  const isCreatorWatched = useCallback(
    (creatorAddress: string) => data.creators.includes(creatorAddress),
    [data.creators],
  );

  const toggleToken = useCallback((tokenId: string) => {
    setData((prev) => {
      const next: WatchlistData = { ...prev };
      if (next.tokenIds.includes(tokenId)) {
        next.tokenIds = next.tokenIds.filter((id) => id !== tokenId);
      } else {
        next.tokenIds = [...next.tokenIds, tokenId];
      }
      saveWatchlist(next);
      // Broadcast to other tabs
      try {
        const bc = new BroadcastChannel("ignoshashi");
        bc.postMessage({ type: "watchlist-changed" });
        bc.close();
      } catch { /* ignore */ }
      return next;
    });
  }, []);

  const toggleCreator = useCallback((creatorAddress: string) => {
    setData((prev) => {
      const next: WatchlistData = { ...prev };
      if (next.creators.includes(creatorAddress)) {
        next.creators = next.creators.filter((c) => c !== creatorAddress);
      } else {
        next.creators = [...next.creators, creatorAddress];
      }
      saveWatchlist(next);
      try {
        const bc = new BroadcastChannel("ignoshashi");
        bc.postMessage({ type: "watchlist-changed" });
        bc.close();
      } catch { /* ignore */ }
      return next;
    });
  }, []);

  const watchCount = data.tokenIds.length + data.creators.length;

  return (
    <WatchlistContext.Provider
      value={{
        watchedTokenIds: data.tokenIds,
        watchedCreators: data.creators,
        isTokenWatched,
        isCreatorWatched,
        toggleToken,
        toggleCreator,
        watchCount,
      }}
    >
      {children}
    </WatchlistContext.Provider>
  );
}

export function useWatchlist() {
  return useContext(WatchlistContext);
}
