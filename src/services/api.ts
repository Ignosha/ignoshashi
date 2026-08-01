// ignoshashi API Service
// Real data from DexScreener (primary) and CoinGecko (fallback/metadata)
// No API keys required. Respects rate limits with built-in caching and throttling.

export interface CoinData {
  name: string;
  symbol: string;
  price: number;
  priceChange24h: number;
  volume24h: number;
  marketCap: number;
  liquidity: number;
  pairAddress: string;
  chainId: string;
}

export interface CoinMetadata {
  id: string;
  name: string;
  symbol: string;
  description: string;
  image: string;
  links: { homepage?: string; twitter?: string; telegram?: string };
}

// Known meme coin addresses on Solana for seeding queries
const SEED_ADDRESSES = [
  "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", // BONK
  "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", // WIF
  "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr", // POPCAT
  "MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5", // MEW
  "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU", // SAMO
];

// Cache with TTL
const cache = new Map<string, { data: unknown; timestamp: number }>();

function getCached<T>(key: string, ttlMs: number): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.timestamp < ttlMs) {
    return entry.data as T;
  }
  return null;
}

function setCache(key: string, data: unknown): void {
  cache.set(key, { data, timestamp: Date.now() });
}

// Rate limiter: max 280 req/min for DexScreener (buffer under 300)
const rateLimiter = {
  lastCall: 0,
  minInterval: 215, // ms between calls (~280/min)
};

async function throttle(): Promise<void> {
  const now = Date.now();
  const elapsed = now - rateLimiter.lastCall;
  if (elapsed < rateLimiter.minInterval) {
    await new Promise((r) => setTimeout(r, rateLimiter.minInterval - elapsed));
  }
  rateLimiter.lastCall = Date.now();
}

async function fetchWithRetry(url: string, retries = 2): Promise<Response> {
  await throttle();
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
      if (res.status === 429 && i < retries) {
        await new Promise((r) => setTimeout(r, (i + 1) * 2000));
        continue;
      }
      return res;
    } catch {
      if (i < retries) {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      throw new Error(`Failed to fetch: ${url}`);
    }
  }
  throw new Error(`Failed to fetch after retries: ${url}`);
}

// ─── DexScreener API ────────────────────────────────────────────

interface DexPair {
  chainId: string;
  pairAddress: string;
  baseToken: { name: string; symbol: string };
  priceUsd: string;
  priceChange: { h24: number };
  volume: { h24: number };
  liquidity: { usd: number };
  fdv: number;
}

/** Fetch token pairs for known meme coin addresses */
async function fetchSeedTokens(): Promise<DexPair[]> {
  const cacheKey = "dex:seed-tokens";
  const cached = getCached<DexPair[]>(cacheKey, 30_000);
  if (cached) return cached;

  const addressList = SEED_ADDRESSES.join(",");
  try {
    const res = await fetchWithRetry(
      `https://api.dexscreener.com/latest/dex/tokens/${addressList}`
    );
    const json = await res.json();
    const pairs: DexPair[] = json.pairs || [];
    setCache(cacheKey, pairs);
    return pairs;
  } catch {
    return [];
  }
}

/** Search trending on DexScreener */
async function fetchTrendingSearch(): Promise<DexPair[]> {
  const cacheKey = "dex:trending";
  const cached = getCached<DexPair[]>(cacheKey, 30_000);
  if (cached) return cached;

  try {
    const res = await fetchWithRetry(
      "https://api.dexscreener.com/latest/dex/search?q=SOL"
    );
    const json = await res.json();
    const pairs: DexPair[] = json.pairs || [];
    setCache(cacheKey, pairs);
    return pairs;
  } catch {
    return [];
  }
}

function dexPairToCoin(pair: DexPair): CoinData {
  return {
    name: pair.baseToken?.name || "Unknown",
    symbol: pair.baseToken?.symbol || "???",
    price: parseFloat(pair.priceUsd || "0"),
    priceChange24h: pair.priceChange?.h24 || 0,
    volume24h: pair.volume?.h24 || 0,
    marketCap: pair.fdv || 0,
    liquidity: pair.liquidity?.usd || 0,
    pairAddress: pair.pairAddress,
    chainId: pair.chainId,
  };
}

// ─── Public API Functions ───────────────────────────────────────

/** Fetch trending coins from both seed tokens and search results */
export async function fetchTrendingCoins(): Promise<CoinData[]> {
  try {
    const [seed, trending] = await Promise.all([
      fetchSeedTokens(),
      fetchTrendingSearch(),
    ]);
    const allPairs = [...seed, ...trending];
    // Deduplicate by pair address
    const seen = new Set<string>();
    const unique: DexPair[] = [];
    for (const p of allPairs) {
      if (!seen.has(p.pairAddress)) {
        seen.add(p.pairAddress);
        unique.push(p);
      }
    }
    return unique
      .map(dexPairToCoin)
      .filter((c) => c.volume24h > 0)
      .sort((a, b) => b.volume24h - a.volume24h);
  } catch {
    return [];
  }
}

/** Fetch top gainers sorted by 24h price change DESC */
export async function fetchTopGainers(limit = 10): Promise<CoinData[]> {
  const coins = await fetchTrendingCoins();
  return coins
    .sort((a, b) => b.priceChange24h - a.priceChange24h)
    .slice(0, limit);
}

/** Get total liquidity from all tracked coins */
export async function fetchTotalLiquidity(): Promise<number> {
  const coins = await fetchTrendingCoins();
  return coins.reduce((sum, c) => sum + c.liquidity, 0);
}

// ─── CoinGecko API ──────────────────────────────────────────────

/** Fetch global crypto market data */
export async function fetchGlobalData(): Promise<{
  totalMarketCap: number;
  totalVolume24h: number;
  btcDominance: number;
} | null> {
  const cacheKey = "cg:global";
  const cached = getCached<ReturnType<typeof fetchGlobalData>>(cacheKey, 120_000);
  if (cached !== null) return cached;

  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/global"
    );
    if (!res.ok) return null;
    const json = await res.json();
    const data = {
      totalMarketCap: json.data?.total_market_cap?.usd || 0,
      totalVolume24h: json.data?.total_volume?.usd || 0,
      btcDominance: json.data?.market_cap_percentage?.btc || 0,
    };
    setCache(cacheKey, data);
    return data;
  } catch {
    return null;
  }
}

/** Fetch coin metadata from CoinGecko */
export async function fetchCoinMetadata(
  coinId: string
): Promise<CoinMetadata | null> {
  const cacheKey = `cg:meta:${coinId}`;
  const cached = getCached<CoinMetadata>(cacheKey, 300_000);
  if (cached) return cached;

  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/${coinId}`
    );
    if (!res.ok) return null;
    const json = await res.json();
    const meta: CoinMetadata = {
      id: json.id,
      name: json.name,
      symbol: json.symbol,
      description: json.description?.en || "",
      image: json.image?.large || "",
      links: {
        homepage: json.links?.homepage?.[0] || "",
        twitter: json.links?.twitter_screen_name
          ? `https://twitter.com/${json.links.twitter_screen_name}`
          : "",
        telegram: json.links?.telegram_channel_identifier
          ? `https://t.me/${json.links.telegram_channel_identifier}`
          : "",
      },
    };
    setCache(cacheKey, meta);
    return meta;
  } catch {
    return null;
  }
}

// ─── Utility ────────────────────────────────────────────────────

/** Format a number for display */
export function formatNumber(n: number, decimals = 2): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(decimals)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(decimals)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(decimals)}K`;
  if (n < 0.01 && n > 0) return `$${n.toFixed(6)}`;
  return `$${n.toFixed(decimals)}`;
}

export function formatPercent(n: number): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

export function formatLargeNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(Math.round(n));
}

/** Estimated gas fees for coin creation */
export function getCreationFees(blockchain: "solana" | "ethereum"): {
  fee: string;
  usdEstimate: string;
} {
  if (blockchain === "solana") {
    return {
      fee: "~0.002 SOL",
      usdEstimate: "~$0.25",
    };
  }
  return {
    fee: "~0.005 ETH",
    usdEstimate: "~$5-15",
  };
}
