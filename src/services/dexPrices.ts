/**
 * DEX Price Service — Real price fetching for graduated tokens
 *
 * Solana: Jupiter API (primary), Raydium API (fallback)
 * Ethereum: DexScreener API (primary), Uniswap subgraph (fallback)
 *
 * All responses cached in-memory for 30 seconds to avoid rate limiting.
 */

// ─── Types ─────────────────────────────────────

export interface DexPriceResult {
  price: number;
  source: string;
  priceChange24h?: number;
  fdv?: number;
  volume24h?: number;
  liquidity?: number;
}

interface CacheEntry {
  result: DexPriceResult | null;
  timestamp: number;
}

// ─── Cache ──────────────────────────────────────

const CACHE_TTL_MS = 30_000;
const priceCache = new Map<string, CacheEntry>();

function cacheKey(address: string, chain: string): string {
  return `${chain}:${address}`;
}

function getCached(key: string): DexPriceResult | null | undefined {
  const entry = priceCache.get(key);
  if (!entry) return undefined; // not in cache
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    priceCache.delete(key);
    return undefined; // expired
  }
  return entry.result;
}

function setCache(key: string, result: DexPriceResult | null): void {
  priceCache.set(key, { result, timestamp: Date.now() });
}

// ─── Jupiter API (Solana) ──────────────────────

async function fetchJupiterPrice(mintAddress: string): Promise<DexPriceResult | null> {
  try {
    const url = `https://price.jup.ag/v6/price?ids=${mintAddress}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const tokenData = data?.data?.[mintAddress];
    if (tokenData?.price) {
      return {
        price: parseFloat(tokenData.price),
        source: "Jupiter",
      };
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Raydium API (Solana fallback) ─────────────

async function fetchRaydiumPrice(mintAddress: string): Promise<DexPriceResult | null> {
  try {
    const url = `https://api.raydium.io/v2/main/price?mint=${mintAddress}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    // Raydium returns: { id, mint, price, ... } or an array
    const priceData = Array.isArray(data) ? data[0] : data;
    if (priceData?.price) {
      return {
        price: parseFloat(priceData.price),
        source: "Raydium",
      };
    }
    return null;
  } catch {
    return null;
  }
}

// ─── DexScreener API (Ethereum + universal fallback) ───

async function fetchDexScreenerPrice(tokenAddress: string): Promise<DexPriceResult | null> {
  try {
    const url = `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const pair = data?.pairs?.[0];
    if (pair) {
      return {
        price: parseFloat(pair.priceUsd || "0"),
        source: pair.dexId || "DexScreener",
        priceChange24h: parseFloat(pair.priceChange?.h24 || "0") || undefined,
        fdv: parseFloat(pair.fdv || "0") || undefined,
        volume24h: parseFloat(pair.volume?.h24 || "0") || undefined,
        liquidity: parseFloat(pair.liquidity?.usd || "0") || undefined,
      };
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Uniswap Subgraph (Ethereum fallback) ──────

async function fetchUniswapPrice(tokenAddress: string): Promise<DexPriceResult | null> {
  try {
    const query = {
      query: `{
        token(id: "${tokenAddress.toLowerCase()}") {
          derivedETH
        }
        bundle(id: "1") {
          ethPriceUSD
        }
      }`,
    };
    const res = await fetch("https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v2", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(query),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const token = data?.data?.token;
    const bundle = data?.data?.bundle;
    if (token?.derivedETH && bundle?.ethPriceUSD) {
      const price = parseFloat(token.derivedETH) * parseFloat(bundle.ethPriceUSD);
      return {
        price,
        source: "Uniswap",
      };
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Public API ─────────────────────────────────

/**
 * Fetch the DEX price for a single token.
 * Returns null if all sources fail — caller should handle gracefully.
 */
export async function fetchDexPrice(
  tokenAddress: string,
  chain: "solana" | "ethereum",
): Promise<DexPriceResult | null> {
  const key = cacheKey(tokenAddress, chain);

  // Check cache
  const cached = getCached(key);
  if (cached !== undefined) return cached;

  let result: DexPriceResult | null = null;

  if (chain === "solana") {
    // Primary: Jupiter
    result = await fetchJupiterPrice(tokenAddress);
    // Fallback: Raydium
    if (!result) {
      result = await fetchRaydiumPrice(tokenAddress);
    }
    // Last resort: DexScreener for Solana tokens too
    if (!result) {
      result = await fetchDexScreenerPrice(tokenAddress);
    }
  } else {
    // Ethereum: DexScreener primary
    result = await fetchDexScreenerPrice(tokenAddress);
    // Fallback: Uniswap subgraph
    if (!result) {
      result = await fetchUniswapPrice(tokenAddress);
    }
  }

  setCache(key, result);
  return result;
}

/**
 * Fetch DEX prices for multiple tokens in parallel.
 * Returns a Map of tokenAddress -> DexPriceResult.
 */
export async function fetchDexPricesBulk(
  tokens: Array<{ address: string; chain: string }>,
): Promise<Map<string, DexPriceResult | null>> {
  const results = new Map<string, DexPriceResult | null>();

  // Check cache for all tokens first
  const toFetch: Array<{ address: string; chain: string }> = [];
  for (const t of tokens) {
    const key = cacheKey(t.address, t.chain);
    const cached = getCached(key);
    if (cached !== undefined) {
      results.set(t.address, cached);
    } else {
      toFetch.push(t);
    }
  }

  // Fetch remaining in parallel
  if (toFetch.length > 0) {
    const fetchPromises = toFetch.map(async (t) => {
      const result = await fetchDexPrice(t.address, t.chain as "solana" | "ethereum");
      results.set(t.address, result);
    });
    await Promise.allSettled(fetchPromises);
  }

  return results;
}

/**
 * Formats a DEX price for display, using appropriate precision.
 */
export function formatDexPrice(price: number, chain: "solana" | "ethereum"): string {
  const symbol = chain === "solana" ? "◎" : "Ξ";
  if (price < 0.0001) return `${symbol}${price.toFixed(8)}`;
  if (price < 0.01) return `${symbol}${price.toFixed(6)}`;
  return `${symbol}${price.toFixed(4)}`;
}

/**
 * Formats a USD price for display.
 */
export function formatDexUsdPrice(price: number): string {
  if (price < 0.0001) return `$${price.toFixed(8)}`;
  if (price < 0.01) return `$${price.toFixed(6)}`;
  if (price < 1) return `$${price.toFixed(4)}`;
  return `$${price.toFixed(2)}`;
}
