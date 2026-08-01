/**
 * MemeVault Bonding Curve Contract — TypeScript Interface Definition
 *
 * This IDL mirrors the MemeVaultBondingCurve.sol ABI.
 * Use these types when interacting with deployed bonding curve contracts via ethers.js.
 */

// ─── Constructor Params ───────────────────────

export interface BondingCurveConstructorParams {
  name: string;
  symbol: string;
  totalSupply: bigint;
  creator: string;
  platformFeeRecipient: string;
}

// ─── Event Types ──────────────────────────────

export interface TokensPurchasedEvent {
  buyer: string;
  ethAmount: bigint;
  tokenAmount: bigint;
  pricePerToken: bigint;
  fee: bigint;
}

export interface TokensSoldEvent {
  seller: string;
  tokenAmount: bigint;
  ethAmount: bigint;
  pricePerToken: bigint;
  fee: bigint;
}

export interface GraduatedEvent {
  dexAddress: string;
  totalRaised: bigint;
}

export interface TransferEvent {
  from: string;
  to: string;
  amount: bigint;
}

export interface ApprovalEvent {
  owner: string;
  spender: string;
  amount: bigint;
}

// ─── Read Functions ───────────────────────────

export interface BondingCurveReadMethods {
  name(): Promise<string>;
  symbol(): Promise<string>;
  decimals(): Promise<number>;
  totalSupply(): Promise<bigint>;
  balanceOf(account: string): Promise<bigint>;
  allowance(owner: string, spender: string): Promise<bigint>;

  // Bonding curve state
  currentSupply(): Promise<bigint>;
  BASEPRICE(): Promise<bigint>;
  MAXPRICE(): Promise<bigint>;
  FEE_BPS(): Promise<bigint>;
  PLATFORM_FEE_BPS(): Promise<bigint>;
  CREATOR_FEE_BPS(): Promise<bigint>;
  GRADUATION_BPS(): Promise<bigint>;

  creator(): Promise<string>;
  platformFeeRecipient(): Promise<string>;
  graduated(): Promise<boolean>;
  bondingCurveActive(): Promise<boolean>;
  dexAddress(): Promise<string>;

  getCurrentPrice(): Promise<bigint>;
  getBuyCost(tokenAmount: bigint): Promise<{ cost: bigint; fee: bigint }>;
  getSellProceeds(tokenAmount: bigint): Promise<{ proceeds: bigint; fee: bigint }>;
  getGraduationProgress(): Promise<bigint>;
  getTotalRaised(): Promise<bigint>;
}

// ─── Write Functions ──────────────────────────

export interface BondingCurveWriteMethods {
  /** Buy tokens from the bonding curve. Send ETH with this call. */
  buy(options?: { value: bigint }): Promise<ethers.ContractTransactionResponse>;

  /** Sell tokens back to the bonding curve. Must approve first. */
  sell(tokenAmount: bigint): Promise<ethers.ContractTransactionResponse>;

  /** Graduate the token to DEX (callable by anyone when threshold met). */
  graduate(): Promise<ethers.ContractTransactionResponse>;

  // Standard ERC-20
  transfer(to: string, amount: bigint): Promise<ethers.ContractTransactionResponse>;
  approve(spender: string, amount: bigint): Promise<ethers.ContractTransactionResponse>;
  transferFrom(from: string, to: string, amount: bigint): Promise<ethers.ContractTransactionResponse>;
}

// ─── Full Contract Interface ──────────────────

export interface MemeVaultBondingCurveContract
  extends BondingCurveReadMethods,
    BondingCurveWriteMethods {
  // Events
  on(
    event: "TokensPurchased",
    listener: (buyer: string, ethAmount: bigint, tokenAmount: bigint, pricePerToken: bigint, fee: bigint) => void,
  ): void;
  on(
    event: "TokensSold",
    listener: (seller: string, tokenAmount: bigint, ethAmount: bigint, pricePerToken: bigint, fee: bigint) => void,
  ): void;
  on(
    event: "Graduated",
    listener: (dexAddress: string, totalRaised: bigint) => void,
  ): void;
  on(
    event: "Transfer",
    listener: (from: string, to: string, amount: bigint) => void,
  ): void;
  on(
    event: "Approval",
    listener: (owner: string, spender: string, amount: bigint) => void,
  ): void;
}

// ─── Contract Factory ─────────────────────────

import type { ethers } from "ethers";

export interface MemeVaultBondingCurveFactory {
  connect(address: string, signerOrProvider: ethers.Signer | ethers.Provider): MemeVaultBondingCurveContract;
  deploy(
    name: string,
    symbol: string,
    totalSupply: bigint,
    creator: string,
    platformFeeRecipient: string,
  ): Promise<MemeVaultBondingCurveContract>;
}

// ─── Constants (mirroring contract) ───────────

/** basePrice = 0.000001 ETH in wei */
export const CONTRACT_BASEPRICE = BigInt("1000000000000"); // 1e12 wei

/** maxPrice = 0.001 ETH in wei */
export const CONTRACT_MAXPRICE = BigInt("1000000000000000"); // 1e15 wei

/** Fee: 100 bps = 1% */
export const CONTRACT_FEE_BPS = 100n;

/** Platform fee: 50 bps = 0.5% */
export const CONTRACT_PLATFORM_FEE_BPS = 50n;

/** Creator fee: 50 bps = 0.5% */
export const CONTRACT_CREATOR_FEE_BPS = 50n;

/** Graduation threshold: 8000 bps = 80% */
export const CONTRACT_GRADUATION_BPS = 8000n;

/** Bonding curve buy function signature (for raw tx encoding) */
export const BUY_SIGNATURE = "buy()";

/** Bonding curve sell function signature */
export const SELL_SIGNATURE = "sell(uint256)";

/** Bonding curve graduate function signature */
export const GRADUATE_SIGNATURE = "graduate()";
