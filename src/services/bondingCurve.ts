/**
 * ignoshashi Bonding Curve Engine
 *
 * Each token starts with a bonding curve. Price increases as tokens are bought.
 * When currentSupply reaches 80% of totalSupply, the token "graduates" to a DEX.
 */

// ─── Constants ─────────────────────────────────

export const BASEPRICE_SOL = 0.000001;
export const MAXPRICE_SOL = 0.001;
export const BASEPRICE_ETH = 0.000001;
export const MAXPRICE_ETH = 0.001;

/** 1% fee on all bonding curve trades */
export const BONDING_FEE_PCT = 0.01;

/** Platform gets half the fee, creator gets half */
export const PLATFORM_FEE_SHARE = 0.5;
export const CREATOR_FEE_SHARE = 0.5;

/** Graduation threshold: 80% of total supply sold */
export const GRADUATION_SUPPLY_THRESHOLD = 0.8;

/** Alternative graduation threshold: market cap in SOL/ETH */
export const GRADUATION_MCAP_SOL = 69; // 69 SOL
export const GRADUATION_MCAP_ETH = 100; // ~$100K equivalent in ETH

// ─── Types ─────────────────────────────────────

export interface BondingCurveState {
  tokenId: string;
  currentSupply: number;
  totalSupply: number;
  basePrice: number;
  maxPrice: number;
  blockchain: "solana" | "ethereum";
  bondingCurveActive: boolean;
  graduated: boolean;
  dexAddress: string | null;
  /** Real on-chain bonding curve contract address (Ethereum). When set, buy/sell go through the contract. */
  contractAddress: string | null;
  creatorAddress: string;
  creatorEarnings: number; // in native currency (SOL or ETH)
  platformFees: number; // accumulated platform fees from this token
  lastTradeTimestamp: number;
  tradeHistory: BondingCurveTrade[];
}

export interface BondingCurveTrade {
  type: "BUY" | "SELL";
  amount: number; // number of tokens
  price: number; // price per token
  total: number; // total in native currency
  fee: number; // fee paid
  wallet: string;
  timestamp: number;
}

// ─── Math ──────────────────────────────────────

/**
 * Calculate current price on the bonding curve.
 * price = basePrice + (currentSupply / totalSupply)² * maxPrice
 */
export function getBondingCurvePrice(state: BondingCurveState): number {
  const ratio = state.currentSupply / state.totalSupply;
  return state.basePrice + ratio * ratio * state.maxPrice;
}

/**
 * Calculate the average price for buying `amount` tokens.
 * Uses integral of the bonding curve to find the average price.
 * price(s) = basePrice + (s/totalSupply)² * maxPrice
 * total cost = ∫[current, current+amount] price(s) ds
 *            = basePrice * amount + maxPrice/(3*totalSupply²) * [(current+amount)³ - current³]
 */
export function getBuyPrice(state: BondingCurveState, amount: number): number {
  const cs = state.currentSupply;
  const ts = state.totalSupply;
  const bp = state.basePrice;
  const mp = state.maxPrice;

  // Ensure we don't exceed total supply
  const actualAmount = Math.min(amount, ts - cs);
  if (actualAmount <= 0) return Infinity;

  const totalCost =
    bp * actualAmount +
    (mp / (3 * ts * ts)) * (Math.pow(cs + actualAmount, 3) - Math.pow(cs, 3));

  return totalCost / actualAmount;
}

/**
 * Calculate total cost for buying `amount` tokens (including fee).
 */
export function getBuyTotal(
  state: BondingCurveState,
  amount: number,
): { avgPrice: number; totalCost: number; fee: number; totalWithFee: number } {
  const avgPrice = getBuyPrice(state, amount);
  const actualAmount = Math.min(amount, state.totalSupply - state.currentSupply);
  const totalCost = avgPrice * actualAmount;
  const fee = totalCost * BONDING_FEE_PCT;
  return { avgPrice, totalCost, fee, totalWithFee: totalCost + fee };
}

/**
 * Get sell price (current price, no slippage on sell for simplicity).
 */
export function getSellPrice(state: BondingCurveState): number {
  return getBondingCurvePrice(state);
}

/**
 * Calculate sell total including fee.
 */
export function getSellTotal(
  state: BondingCurveState,
  amount: number,
): { price: number; total: number; fee: number; totalAfterFee: number } {
  const price = getSellPrice(state);
  // Can't sell more than current supply
  const actualAmount = Math.min(amount, state.currentSupply);
  const total = price * actualAmount;
  const fee = total * BONDING_FEE_PCT;
  return { price, total, fee, totalAfterFee: total - fee };
}

// ─── Actions (Simulated) ─────────────────────────

/**
 * Execute a simulated buy on the bonding curve.
 * Updates state in memory only — caller must persist.
 * Used as fallback when wallet is not connected.
 */
export function executeBuySimulated(
  state: BondingCurveState,
  amount: number,
  wallet: string,
): { newState: BondingCurveState; success: boolean; error?: string } {
  if (state.graduated || !state.bondingCurveActive) {
    return { newState: state, success: false, error: "Bonding curve is closed" };
  }

  const remaining = state.totalSupply - state.currentSupply;
  if (remaining <= 0) {
    return { newState: state, success: false, error: "All tokens sold" };
  }

  const actualAmount = Math.min(amount, remaining);
  const { avgPrice, totalCost, fee } = getBuyTotal(state, actualAmount);

  const newSupply = state.currentSupply + actualAmount;
  const platformCut = fee * PLATFORM_FEE_SHARE;
  const creatorCut = fee * CREATOR_FEE_SHARE;

  const trade: BondingCurveTrade = {
    type: "BUY",
    amount: actualAmount,
    price: avgPrice,
    total: totalCost + fee,
    fee,
    wallet,
    timestamp: Date.now(),
  };

  const newState: BondingCurveState = {
    ...state,
    currentSupply: newSupply,
    creatorEarnings: state.creatorEarnings + creatorCut,
    platformFees: state.platformFees + platformCut,
    lastTradeTimestamp: Date.now(),
    tradeHistory: [...state.tradeHistory.slice(-99), trade],
  };

  // Check graduation
  const supplyRatio = newState.currentSupply / newState.totalSupply;
  const mcap = newState.currentSupply * getBondingCurvePrice(newState);
  const mcapThreshold = newState.blockchain === "solana" ? GRADUATION_MCAP_SOL : GRADUATION_MCAP_ETH;

  if (supplyRatio >= GRADUATION_SUPPLY_THRESHOLD || mcap >= mcapThreshold) {
    newState.graduated = true;
    newState.bondingCurveActive = false;
  }

  return { newState, success: true };
}

/**
 * Execute a simulated sell on the bonding curve.
 */
export function executeSellSimulated(
  state: BondingCurveState,
  amount: number,
  wallet: string,
): { newState: BondingCurveState; success: boolean; error?: string } {
  if (state.graduated || !state.bondingCurveActive) {
    return { newState: state, success: false, error: "Bonding curve is closed" };
  }

  if (state.currentSupply <= 0) {
    return { newState: state, success: false, error: "No tokens to sell" };
  }

  const actualAmount = Math.min(amount, state.currentSupply);
  const { price, total, fee, totalAfterFee } = getSellTotal(state, actualAmount);

  const newSupply = state.currentSupply - actualAmount;
  const platformCut = fee * PLATFORM_FEE_SHARE;
  const creatorCut = fee * CREATOR_FEE_SHARE;

  const trade: BondingCurveTrade = {
    type: "SELL",
    amount: actualAmount,
    price,
    total: totalAfterFee,
    fee,
    wallet,
    timestamp: Date.now(),
  };

  const newState: BondingCurveState = {
    ...state,
    currentSupply: newSupply,
    creatorEarnings: state.creatorEarnings + creatorCut,
    platformFees: state.platformFees + platformCut,
    lastTradeTimestamp: Date.now(),
    tradeHistory: [...state.tradeHistory.slice(-99), trade],
  };

  return { newState, success: true };
}

// ─── Aliases for backward compatibility ────────────

/** @deprecated Use executeBuySimulated instead */
export const executeBuy = executeBuySimulated;
/** @deprecated Use executeSellSimulated instead */
export const executeSell = executeSellSimulated;

// ─── On-Chain Execution ────────────────────────────

/**
 * Execute a buy trade on-chain via wallet provider.
 * Sends real SOL/ETH transactions: user pays (amount + fee),
 * platform fee → owner wallet, creator fee → creator wallet,
 * curve amount → owner wallet (temporary pool).
 *
 * Returns tx result; caller must apply state via applyBuyToState.
 */
export async function executeBuyOnChain(
  state: BondingCurveState,
  amount: number,
  userWalletAddress: string,
  creatorAddress: string,
): Promise<{
  success: boolean;
  txHash: string;
  error?: string;
  breakdown: ReturnType<typeof getBuyFeeBreakdown>;
}> {
  const breakdown = getBuyFeeBreakdown(state, amount);
  if (breakdown.actualAmount <= 0) {
    return { success: false, txHash: "", error: "Cannot buy 0 tokens", breakdown };
  }

  // Dynamic import to avoid circular deps and SSR issues
  const { sendBondingCurveTransaction, calculateFeeBreakdown } = await import("./walletTransactions");
  const feeBreakdown = calculateFeeBreakdown(breakdown.totalWithFee);

  const result = await sendBondingCurveTransaction(
    state.blockchain,
    userWalletAddress,
    feeBreakdown,
    creatorAddress,
    "BUY",
  );

  return { ...result, breakdown };
}

/**
 * Execute a sell trade on-chain via server-side pool wallet payout.
 *
 * Calls /api/sell/payout which signs and sends a real transaction
 * from the pool wallet to the user. Falls back to simulated if the
 * pool wallet private key is not configured server-side.
 *
 * Returns tx result; caller must apply state via applySellToState.
 */
export async function executeSellOnChain(
  state: BondingCurveState,
  amount: number,
  userWalletAddress: string,
  creatorAddress: string,
): Promise<{
  success: boolean;
  txHash: string;
  error?: string;
  breakdown: ReturnType<typeof getSellFeeBreakdown>;
}> {
  const breakdown = getSellFeeBreakdown(state, amount);
  if (breakdown.actualAmount <= 0) {
    return { success: false, txHash: "", error: "Cannot sell 0 tokens", breakdown };
  }

  // Dynamic import to avoid circular deps and SSR issues
  const { processSellPayout } = await import("./walletTransactions");

  const payoutResult = await processSellPayout(
    state.blockchain,
    userWalletAddress,
    breakdown.totalAfterFee,
    state.tokenId,
  );

  return {
    success: payoutResult.success,
    txHash: payoutResult.txHash,
    error: payoutResult.error,
    breakdown,
  };
}

// ─── Real Transaction Helpers ─────────────────────

/**
 * Calculate the total cost for a buy on the bonding curve,
 * including platform and creator fee split.
 */
export function getBuyFeeBreakdown(
  state: BondingCurveState,
  amount: number,
): {
  actualAmount: number;
  avgPrice: number;
  totalCost: number;
  fee: number;
  platformFee: number;
  creatorFee: number;
  curveAmount: number;
  totalWithFee: number;
} {
  const actualAmount = Math.min(amount, state.totalSupply - state.currentSupply);
  const buyTotal = getBuyTotal(state, actualAmount);
  const platformFee = buyTotal.fee * PLATFORM_FEE_SHARE;
  const creatorFee = buyTotal.fee * CREATOR_FEE_SHARE;
  const curveAmount = buyTotal.totalCost;

  return {
    actualAmount,
    avgPrice: buyTotal.avgPrice,
    totalCost: buyTotal.totalCost,
    fee: buyTotal.fee,
    platformFee,
    creatorFee,
    curveAmount,
    totalWithFee: buyTotal.totalWithFee,
  };
}

/**
 * Calculate the sell proceeds from the bonding curve.
 */
export function getSellFeeBreakdown(
  state: BondingCurveState,
  amount: number,
): {
  actualAmount: number;
  price: number;
  total: number;
  fee: number;
  platformFee: number;
  creatorFee: number;
  totalAfterFee: number;
} {
  const actualAmount = Math.min(amount, state.currentSupply);
  const sellTotal = getSellTotal(state, actualAmount);
  const platformFee = sellTotal.fee * PLATFORM_FEE_SHARE;
  const creatorFee = sellTotal.fee * CREATOR_FEE_SHARE;

  return {
    actualAmount,
    price: sellTotal.price,
    total: sellTotal.total,
    fee: sellTotal.fee,
    platformFee,
    creatorFee,
    totalAfterFee: sellTotal.totalAfterFee,
  };
}

/**
 * Apply a buy result (from real or simulated tx) to bonding curve state.
 * Returns updated state. Caller must persist with saveBondingCurveState.
 */
export function applyBuyToState(
  state: BondingCurveState,
  actualAmount: number,
  avgPrice: number,
  totalWithFee: number,
  fee: number,
  wallet: string,
): BondingCurveState {
  const platformCut = fee * PLATFORM_FEE_SHARE;
  const creatorCut = fee * CREATOR_FEE_SHARE;

  const trade: BondingCurveTrade = {
    type: "BUY",
    amount: actualAmount,
    price: avgPrice,
    total: totalWithFee,
    fee,
    wallet,
    timestamp: Date.now(),
  };

  const newState: BondingCurveState = {
    ...state,
    currentSupply: state.currentSupply + actualAmount,
    creatorEarnings: state.creatorEarnings + creatorCut,
    platformFees: state.platformFees + platformCut,
    lastTradeTimestamp: Date.now(),
    tradeHistory: [...state.tradeHistory.slice(-99), trade],
  };

  const supplyRatio = newState.currentSupply / newState.totalSupply;
  const mcap = newState.currentSupply * getBondingCurvePrice(newState);
  const mcapThreshold = newState.blockchain === "solana" ? GRADUATION_MCAP_SOL : GRADUATION_MCAP_ETH;

  if (supplyRatio >= GRADUATION_SUPPLY_THRESHOLD || mcap >= mcapThreshold) {
    newState.graduated = true;
    newState.bondingCurveActive = false;
  }

  return newState;
}

/**
 * Apply a sell result to bonding curve state.
 */
export function applySellToState(
  state: BondingCurveState,
  actualAmount: number,
  price: number,
  totalAfterFee: number,
  fee: number,
  wallet: string,
): BondingCurveState {
  const platformCut = fee * PLATFORM_FEE_SHARE;
  const creatorCut = fee * CREATOR_FEE_SHARE;

  const trade: BondingCurveTrade = {
    type: "SELL",
    amount: actualAmount,
    price,
    total: totalAfterFee,
    fee,
    wallet,
    timestamp: Date.now(),
  };

  return {
    ...state,
    currentSupply: state.currentSupply - actualAmount,
    creatorEarnings: state.creatorEarnings + creatorCut,
    platformFees: state.platformFees + platformCut,
    lastTradeTimestamp: Date.now(),
    tradeHistory: [...state.tradeHistory.slice(-99), trade],
  };
}

/**
 * Get graduation progress as a percentage (0-100).
 */
export function getGraduationProgress(state: BondingCurveState): number {
  if (state.graduated) return 100;
  const supplyRatio = (state.currentSupply / state.totalSupply) * 100;
  return Math.min(supplyRatio, 100);
}

/**
 * Create initial bonding curve state for a newly created token.
 */
export function createBondingCurveState(
  tokenId: string,
  totalSupply: number,
  blockchain: "solana" | "ethereum",
  creatorAddress: string,
): BondingCurveState {
  return {
    tokenId,
    currentSupply: 0,
    totalSupply,
    basePrice: blockchain === "solana" ? BASEPRICE_SOL : BASEPRICE_ETH,
    maxPrice: blockchain === "solana" ? MAXPRICE_SOL : MAXPRICE_ETH,
    blockchain,
    bondingCurveActive: true,
    graduated: false,
    dexAddress: null,
    contractAddress: null,
    creatorAddress,
    creatorEarnings: 0,
    platformFees: 0,
    lastTradeTimestamp: Date.now(),
    tradeHistory: [],
  };
}

/**
 * Generate mock bonding curve chart data points.
 * Returns array of {supply, price} points for charting the full curve.
 */
// Re-export bonding curve state management from tracker for hook compatibility
export { getBondingCurveState, saveBondingCurveState } from "./tracker";

export function getBondingCurveChartData(
  state: BondingCurveState,
  numPoints: number = 50,
): { supply: number; price: number }[] {
  const points: { supply: number; price: number }[] = [];
  for (let i = 0; i <= numPoints; i++) {
    const supply = (state.totalSupply * i) / numPoints;
    const ratio = supply / state.totalSupply;
    const price = state.basePrice + ratio * ratio * state.maxPrice;
    points.push({ supply, price });
  }
  return points;
}
