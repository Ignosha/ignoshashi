/**
 * Ignosha/ETH Liquidity Pool — Real Constant-Product AMM
 * Formula: x * y = k (Uniswap-style)
 * 
 * Pool state persisted in localStorage under `ignoshashi_ignosha_pool`
 */

export interface PoolState {
  eth: number;
  ignos: number;
  totalLp: number;
  k: number;
  // Accumulated fees (included in pool reserves, tracked separately)
  accumulatedFeesEth: number;
  accumulatedFeesIgns: number;
  // User LP balances keyed by wallet address
  lpBalances: Record<string, number>;
  // Price history for chart
  priceHistory: Array<{ timestamp: number; price: number }>;
  // Trade history
  tradeHistory: Array<{
    id: string;
    type: "BUY" | "SELL" | "ADD_LP" | "REMOVE_LP";
    ethAmount: number;
    ignosAmount: number;
    price: number;
    wallet: string;
    timestamp: number;
  }>;
  // 24h volume tracking
  volume24h: number;
  volumeLastReset: number;
}

const POOL_KEY = "ignoshashi_ignosha_pool";
const FEE_RATE = 0.003; // 0.3%

const INITIAL_POOL: PoolState = {
  eth: 10,
  ignos: 1_000_000,
  totalLp: Math.sqrt(10 * 1_000_000), // ~3162.27766
  k: 10 * 1_000_000,
  accumulatedFeesEth: 0,
  accumulatedFeesIgns: 0,
  lpBalances: {},
  priceHistory: [],
  tradeHistory: [],
  volume24h: 0,
  volumeLastReset: Date.now(),
};

function loadPool(): PoolState {
  if (typeof window === "undefined") return { ...INITIAL_POOL };
  try {
    const raw = localStorage.getItem(POOL_KEY);
    if (!raw) return { ...INITIAL_POOL };
    const parsed = JSON.parse(raw);
    // Merge with initial to handle missing fields from older versions
    return { ...INITIAL_POOL, ...parsed };
  } catch {
    return { ...INITIAL_POOL };
  }
}

function savePool(pool: PoolState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(POOL_KEY, JSON.stringify(pool));
  } catch { /* quota exceeded */ }
}

// Reset volume if more than 24h since last reset
function maybeResetVolume(pool: PoolState): void {
  const now = Date.now();
  if (now - pool.volumeLastReset > 24 * 60 * 60 * 1000) {
    pool.volume24h = 0;
    pool.volumeLastReset = now;
  }
}

/**
 * Get current pool reserves.
 */
export function getPoolReserves(): { eth: number; ignos: number; totalLp: number; k: number } {
  const pool = loadPool();
  return { eth: pool.eth, ignos: pool.ignos, totalLp: pool.totalLp, k: pool.k };
}

/**
 * Get current IGNS price in ETH.
 */
export function getPrice(): number {
  const pool = loadPool();
  if (pool.ignos === 0) return 0;
  return pool.eth / pool.ignos;
}

/**
 * Get user's LP token balance.
 */
export function getUserLpBalance(wallet?: string): number {
  if (!wallet) return 0;
  const pool = loadPool();
  return pool.lpBalances[wallet] || 0;
}

/**
 * Get full pool state for UI display.
 */
export function getFullPoolState(): PoolState {
  const pool = loadPool();
  maybeResetVolume(pool);
  return pool;
}

/**
 * Get price history for chart.
 */
export function getPriceHistory(): Array<{ timestamp: number; price: number }> {
  const pool = loadPool();
  return pool.priceHistory;
}

/**
 * Get trade history.
 */
export function getTradeHistory(): PoolState["tradeHistory"] {
  const pool = loadPool();
  return pool.tradeHistory;
}

/**
 * Calculate swap output using constant-product formula.
 * dy = y - k/(x + dx*(1-fee))
 */
export function calculateSwapOutput(
  inputToken: "eth" | "ignos",
  inputAmount: number
): { outputAmount: number; fee: number; priceImpact: number; newPrice: number } {
  const pool = loadPool();
  if (inputAmount <= 0) return { outputAmount: 0, fee: 0, priceImpact: 0, newPrice: getPrice() };

  const inputWithFee = inputAmount * (1 - FEE_RATE);
  const fee = inputAmount * FEE_RATE;

  let outputAmount: number;
  let newEth: number;
  let newIgnos: number;

  if (inputToken === "eth") {
    // Swap ETH for IGNS
    // dy = y - k/(x + dx*(1-f))
    outputAmount = pool.ignos - pool.k / (pool.eth + inputWithFee);
    newEth = pool.eth + inputAmount; // Full amount deposited (fee stays in pool)
    newIgnos = pool.ignos - outputAmount;
  } else {
    // Swap IGNS for ETH
    outputAmount = pool.eth - pool.k / (pool.ignos + inputWithFee);
    newEth = pool.eth - outputAmount;
    newIgnos = pool.ignos + inputAmount;
  }

  // Clamp
  outputAmount = Math.max(0, outputAmount);
  if (outputAmount <= 0) return { outputAmount: 0, fee, priceImpact: 100, newPrice: getPrice() };

  const newPrice = newIgnos > 0 ? newEth / newIgnos : 0;
  const currentPrice = getPrice();
  const priceImpact = currentPrice > 0 ? Math.abs((newPrice - currentPrice) / currentPrice) * 100 : 0;

  return { outputAmount, fee, priceImpact, newPrice };
}

/**
 * Execute a swap. Updates pool state.
 */
export function executeSwap(
  inputToken: "eth" | "ignos",
  inputAmount: number,
  wallet: string
): { outputAmount: number; fee: number } | null {
  const pool = loadPool();
  maybeResetVolume(pool);

  const result = calculateSwapOutput(inputToken, inputAmount);
  if (result.outputAmount <= 0) return null;

  const fee = result.fee;

  if (inputToken === "eth") {
    pool.eth += inputAmount;
    pool.ignos -= result.outputAmount;
    pool.accumulatedFeesEth += fee;
  } else {
    pool.eth -= result.outputAmount;
    pool.ignos += inputAmount;
    pool.accumulatedFeesIgns += fee;
  }

  pool.k = pool.eth * pool.ignos;
  
  // Track volume
  pool.volume24h += inputToken === "eth" ? inputAmount : result.outputAmount;

  // Record price
  const price = pool.eth / pool.ignos;
  pool.priceHistory.push({ timestamp: Date.now(), price });
  if (pool.priceHistory.length > 200) pool.priceHistory = pool.priceHistory.slice(-200);

  // Record trade
  pool.tradeHistory.unshift({
    id: `trade-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: inputToken === "eth" ? "BUY" : "SELL",
    ethAmount: inputToken === "eth" ? inputAmount : result.outputAmount,
    ignosAmount: inputToken === "eth" ? result.outputAmount : inputAmount,
    price,
    wallet,
    timestamp: Date.now(),
  });
  if (pool.tradeHistory.length > 100) pool.tradeHistory = pool.tradeHistory.slice(0, 100);

  savePool(pool);
  return { outputAmount: result.outputAmount, fee };
}

/**
 * Calculate LP tokens for adding liquidity.
 * lpTokens = amount * totalLp / reserve
 */
export function calculateAddLiquidity(
  ethAmount: number,
  ignosAmount: number
): { lpTokens: number; poolShare: number } {
  const pool = loadPool();
  if (pool.totalLp === 0 || pool.eth === 0 || pool.ignos === 0) {
    // First liquidity provider
    const lpTokens = Math.sqrt(ethAmount * ignosAmount);
    return { lpTokens, poolShare: 100 };
  }

  // Use the fair ratio: lpTokens = min(ethShare, ignosShare)
  const ethShare = (ethAmount / pool.eth) * pool.totalLp;
  const ignosShare = (ignosAmount / pool.ignos) * pool.totalLp;
  const lpTokens = Math.min(ethShare, ignosShare);
  const poolShare = (lpTokens / (pool.totalLp + lpTokens)) * 100;

  return { lpTokens, poolShare };
}

/**
 * Execute add liquidity.
 */
export function executeAddLiquidity(
  ethAmount: number,
  ignosAmount: number,
  wallet: string
): { lpTokens: number } | null {
  if (ethAmount <= 0 || ignosAmount <= 0) return null;

  const pool = loadPool();
  const calc = calculateAddLiquidity(ethAmount, ignosAmount);
  if (calc.lpTokens <= 0) return null;

  pool.eth += ethAmount;
  pool.ignos += ignosAmount;
  pool.k = pool.eth * pool.ignos;
  pool.totalLp += calc.lpTokens;
  pool.lpBalances[wallet] = (pool.lpBalances[wallet] || 0) + calc.lpTokens;

  // Record trade
  const price = pool.eth / pool.ignos;
  pool.tradeHistory.unshift({
    id: `lp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: "ADD_LP",
    ethAmount,
    ignosAmount,
    price,
    wallet,
    timestamp: Date.now(),
  });
  if (pool.tradeHistory.length > 100) pool.tradeHistory = pool.tradeHistory.slice(0, 100);

  savePool(pool);
  return { lpTokens: calc.lpTokens };
}

/**
 * Calculate output for removing liquidity.
 * ethReturned = lpAmount * ethReserve / totalLp
 * ignosReturned = lpAmount * ignosReserve / totalLp
 */
export function calculateRemoveLiquidity(lpAmount: number): { ethAmount: number; ignosAmount: number } {
  const pool = loadPool();
  if (pool.totalLp === 0 || lpAmount <= 0) return { ethAmount: 0, ignosAmount: 0 };

  const ethAmount = (lpAmount / pool.totalLp) * pool.eth;
  const ignosAmount = (lpAmount / pool.totalLp) * pool.ignos;

  return { ethAmount, ignosAmount };
}

/**
 * Execute remove liquidity.
 */
export function executeRemoveLiquidity(
  lpAmount: number,
  wallet: string
): { ethAmount: number; ignosAmount: number } | null {
  const pool = loadPool();
  const userBalance = pool.lpBalances[wallet] || 0;
  if (lpAmount <= 0 || lpAmount > userBalance) return null;

  const result = calculateRemoveLiquidity(lpAmount);

  pool.eth -= result.ethAmount;
  pool.ignos -= result.ignosAmount;
  pool.k = pool.eth * pool.ignos;
  pool.totalLp -= lpAmount;
  pool.lpBalances[wallet] = userBalance - lpAmount;

  // Record trade
  const price = pool.eth / pool.ignos;
  pool.tradeHistory.unshift({
    id: `lp-rm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: "REMOVE_LP",
    ethAmount: result.ethAmount,
    ignosAmount: result.ignosAmount,
    price,
    wallet,
    timestamp: Date.now(),
  });
  if (pool.tradeHistory.length > 100) pool.tradeHistory = pool.tradeHistory.slice(0, 100);

  savePool(pool);
  return result;
}

/**
 * Get APR based on 24h volume (0.3% of volume / total liquidity).
 */
export function getApr(): number {
  const pool = loadPool();
  const totalLiquidityEth = pool.eth * 2; // Both sides
  if (totalLiquidityEth === 0) return 0;
  const dailyFees = pool.volume24h * FEE_RATE;
  const apr = (dailyFees * 365 / totalLiquidityEth) * 100;
  return apr;
}

/**
 * Reset pool to initial state (for debugging).
 */
export function resetPool(): void {
  if (typeof window === "undefined") return;
  savePool({ ...INITIAL_POOL });
}
