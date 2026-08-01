/**
 * useDexPrice — React hook for fetching DEX prices with auto-polling.
 *
 * Only polls for graduated tokens (verified + has tokenAddress).
 * For bonding curve tokens, returns null and doesn't fetch.
 */
import { useState, useEffect, useRef } from "react";
import { fetchDexPrice, type DexPriceResult } from "~/services/dexPrices";

const POLL_INTERVAL_MS = 30_000;

interface UseDexPriceOptions {
  tokenAddress?: string;
  chain?: "solana" | "ethereum";
  verified?: boolean;
  /** Whether the token has graduated (skip if still on bonding curve) */
  isGraduated?: boolean;
}

/**
 * Fetch DEX price for a single token, with 30s polling.
 * Returns null while loading or if token isn't eligible for DEX pricing.
 */
export function useDexPrice(opts: UseDexPriceOptions): {
  dexPrice: DexPriceResult | null;
  loading: boolean;
  error: boolean;
} {
  const { tokenAddress, chain, verified, isGraduated } = opts;
  const [dexPrice, setDexPrice] = useState<DexPriceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const mountedRef = useRef(true);

  const shouldFetch = !!tokenAddress && !!chain && (verified !== false) && (isGraduated !== false);

  useEffect(() => {
    mountedRef.current = true;

    if (!shouldFetch) {
      setDexPrice(null);
      setLoading(false);
      setError(false);
      return;
    }

    let cancelled = false;

    const doFetch = async () => {
      if (cancelled) return;
      setLoading(true);
      setError(false);
      try {
        const result = await fetchDexPrice(tokenAddress!, chain!);
        if (!cancelled && mountedRef.current) {
          setDexPrice(result);
          if (!result) setError(true);
          setLoading(false);
        }
      } catch {
        if (!cancelled && mountedRef.current) {
          setError(true);
          setLoading(false);
        }
      }
    };

    doFetch();
    const interval = setInterval(doFetch, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [tokenAddress, chain, shouldFetch]);

  return { dexPrice, loading, error };
}

/**
 * Fetch DEX prices for a list of graduated tokens.
 * Returns a Map of tokenAddress -> DexPriceResult.
 */
export function useDexPricesBulk(
  tokens: Array<{ address: string; chain: "solana" | "ethereum"; isGraduated: boolean }>,
): {
  prices: Map<string, DexPriceResult | null>;
  loading: boolean;
} {
  const [prices, setPrices] = useState<Map<string, DexPriceResult | null>>(new Map());
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);

  // Only fetch for graduated tokens
  const eligibleTokens = tokens.filter((t) => t.isGraduated);

  useEffect(() => {
    mountedRef.current = true;

    if (eligibleTokens.length === 0) {
      setPrices(new Map());
      setLoading(false);
      return;
    }

    let cancelled = false;

    const doFetch = async () => {
      if (cancelled) return;
      setLoading(true);
      const results = new Map<string, DexPriceResult | null>();

      const promises = eligibleTokens.map(async (t) => {
        try {
          const result = await fetchDexPrice(t.address, t.chain);
          results.set(t.address, result);
        } catch {
          results.set(t.address, null);
        }
      });

      await Promise.allSettled(promises);

      if (!cancelled && mountedRef.current) {
        setPrices(new Map(results));
        setLoading(false);
      }
    };

    doFetch();
    const interval = setInterval(doFetch, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [tokens.map((t) => `${t.address}:${t.chain}`).join(","), eligibleTokens.length]);

  return { prices, loading };
}
