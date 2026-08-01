/**
 * ignoshashi USD Price Hook
 * Fetches live SOL/USD and ETH/USD prices from CoinGecko free API.
 * Caches for 60 seconds to avoid rate limits.
 */

import { useState, useEffect } from "react";

interface UsdPrices {
  sol: number;
  eth: number;
  loading: boolean;
  error: string | null;
}

// Global cache shared across all hook instances
let cachedPrices: { sol: number; eth: number } | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60_000; // 60 seconds

async function fetchPrices(): Promise<{ sol: number; eth: number }> {
  const now = Date.now();
  if (cachedPrices && now - cacheTimestamp < CACHE_TTL) {
    return cachedPrices;
  }

  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=solana,ethereum&vs_currencies=usd"
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const prices = {
      sol: data.solana?.usd || 0,
      eth: data.ethereum?.usd || 0,
    };
    cachedPrices = prices;
    cacheTimestamp = now;
    return prices;
  } catch {
    // Return stale cache if available, otherwise zeros
    if (cachedPrices) return cachedPrices;
    return { sol: 0, eth: 0 };
  }
}

export function useUsdPrice(): UsdPrices {
  const [prices, setPrices] = useState<{ sol: number; eth: number }>(
    cachedPrices || { sol: 0, eth: 0 }
  );
  const [loading, setLoading] = useState(!cachedPrices);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const p = await fetchPrices();
        if (!cancelled) {
          setPrices(p);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError("Failed to fetch USD prices");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    // Refresh every 60 seconds
    const interval = setInterval(load, CACHE_TTL);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return { ...prices, loading, error };
}

/** Convert a crypto amount to USD using the current price */
export function toUsd(amount: number, price: number): number {
  return amount * price;
}

/** Format USD value for display */
export function formatUsd(value: number): string {
  if (value === 0) return "$0.00";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  if (value >= 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(6)}`;
}
