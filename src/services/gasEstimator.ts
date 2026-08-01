/**
 * ignoshashi Dynamic Ethereum Gas Estimator
 *
 * Fetches real-time gas prices from Etherscan (no API key needed for free tier)
 * and combines with ETH/USD price for cost estimates.
 *
 * 30-second cache to avoid rate limiting.
 */

// ─── Types ─────────────────────────────────────────

export interface GasEstimate {
  /** Gas price in gwei */
  safeLow: number;
  average: number;
  fast: number;
  baseFee: number;
  /** When this was fetched */
  timestamp: number;
}

export interface GasCostEstimate {
  /** Gas limit for the operation */
  gasLimit: number;
  /** Cost in ETH */
  ethCost: number;
  /** Cost in USD */
  usdCost: number;
  /** Gas price used (gwei) */
  gasPriceGwei: number;
  /** Speed level used */
  speed: "safeLow" | "average" | "fast";
}

// ─── Cache ──────────────────────────────────────────

let cachedGas: GasEstimate | null = null;
const GAS_CACHE_TTL = 30_000; // 30 seconds

let cachedEthPrice: number | null = null;
let ethPriceTimestamp = 0;
const ETH_PRICE_TTL = 60_000; // 60 seconds

// ─── Etherscan API ──────────────────────────────────

const ETHERSCAN_GAS_URL =
  "https://api.etherscan.io/api?module=gastracker&action=gasoracle";

/**
 * Fetch current gas prices from Etherscan.
 * Returns safeLow, average, fast, and baseFee in gwei.
 */
export async function fetchGasEstimate(): Promise<GasEstimate> {
  const now = Date.now();
  if (cachedGas && now - cachedGas.timestamp < GAS_CACHE_TTL) {
    return cachedGas;
  }

  try {
    const res = await fetch(ETHERSCAN_GAS_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = await res.json();
    if (json.status !== "1") throw new Error(json.message || "Etherscan API error");

    const result = json.result;
    const estimate: GasEstimate = {
      safeLow: parseFloat(result.SafeGasPrice) || 5,
      average: parseFloat(result.ProposeGasPrice) || 10,
      fast: parseFloat(result.FastGasPrice) || 15,
      baseFee: parseFloat(result.suggestBaseFee) || 0,
      timestamp: now,
    };

    cachedGas = estimate;
    return estimate;
  } catch {
    // Return stale cache if available, otherwise sensible defaults
    if (cachedGas) return cachedGas;
    return {
      safeLow: 5,
      average: 10,
      fast: 15,
      baseFee: 0,
      timestamp: now,
    };
  }
}

// ─── ETH Price ──────────────────────────────────────

/**
 * Fetch current ETH/USD price.
 * Tries CoinGecko first, falls back to cached value.
 */
export async function fetchEthPrice(): Promise<number> {
  const now = Date.now();
  if (cachedEthPrice !== null && now - ethPriceTimestamp < ETH_PRICE_TTL) {
    return cachedEthPrice;
  }

  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const price = data.ethereum?.usd || 0;
    cachedEthPrice = price;
    ethPriceTimestamp = now;
    return price;
  } catch {
    if (cachedEthPrice !== null) return cachedEthPrice;
    return 2000; // sensible fallback
  }
}

// ─── Cost Estimation ────────────────────────────────

/**
 * Estimate gas cost in ETH and USD for a given gas limit.
 *
 * @param gasLimit - Gas limit for the transaction (e.g., 2_000_000 for ERC-20 deploy)
 * @param speed - Which gas price to use: "safeLow", "average", or "fast"
 */
export async function estimateGasCost(
  gasLimit: number,
  speed: "safeLow" | "average" | "fast" = "average",
): Promise<GasCostEstimate> {
  const [gas, ethPrice] = await Promise.all([
    fetchGasEstimate(),
    fetchEthPrice(),
  ]);

  const gasPriceGwei = gas[speed];
  // gasLimit * gasPriceGwei = cost in gwei
  // 1 gwei = 1e-9 ETH
  const ethCost = (gasLimit * gasPriceGwei) / 1e9;
  const usdCost = ethCost * ethPrice;

  return {
    gasLimit,
    ethCost,
    usdCost,
    gasPriceGwei,
    speed,
  };
}

/**
 * Estimate graduation gas cost for deploying an ERC-20 contract on Ethereum.
 * Typical ERC-20 deployment: ~1.2M to 2.5M gas.
 */
export async function estimateGraduationGasCost(): Promise<{
  safeLow: GasCostEstimate;
  average: GasCostEstimate;
  fast: GasCostEstimate;
  gas: GasEstimate;
}> {
  const DEPLOY_GAS_LIMIT = 2_500_000; // conservative estimate for ERC-20 deploy

  const [gas, ethPrice] = await Promise.all([
    fetchGasEstimate(),
    fetchEthPrice(),
  ]);

  const makeEstimate = (speed: "safeLow" | "average" | "fast"): GasCostEstimate => {
    const gasPriceGwei = gas[speed];
    const ethCost = (DEPLOY_GAS_LIMIT * gasPriceGwei) / 1e9;
    return {
      gasLimit: DEPLOY_GAS_LIMIT,
      ethCost,
      usdCost: ethCost * ethPrice,
      gasPriceGwei,
      speed,
    };
  };

  return {
    safeLow: makeEstimate("safeLow"),
    average: makeEstimate("average"),
    fast: makeEstimate("fast"),
    gas,
  };
}

/**
 * Format gwei value for display.
 */
export function formatGwei(gwei: number): string {
  if (gwei >= 100) return `${Math.round(gwei)}`;
  return gwei.toFixed(1);
}

/**
 * Format gas cost range for display.
 */
export function formatGasCostRange(
  low: GasCostEstimate,
  high: GasCostEstimate,
): string {
  return `$${low.usdCost.toFixed(2)} – $${high.usdCost.toFixed(2)}`;
}
