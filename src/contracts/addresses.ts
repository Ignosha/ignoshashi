/**
 * MemeVault Contract Addresses & Network Configuration
 *
 * Update these when contracts are deployed to different networks.
 * All addresses are placeholder/null until actual deployment.
 */

// ─── Platform Fee Recipients ──────────────────

export const PLATFORM_FEE_RECIPIENTS = {
  ethereum: "0x5985a841601aE93D8Ddfec88715C755235490404" as `0x${string}`,
  solana: "J9mFgKsF9f2eNSrH7FqzBoADsgzU9diDQ3L9WUm9mDh7",
} as const;

// ─── Deployed Contract Addresses ──────────────

/**
 * Factory contract for deploying new bonding curve tokens.
 * NULL = not yet deployed. Set after deploying the factory.
 */
export const BONDING_CURVE_FACTORY: Record<number, `0x${string}` | null> = {
  // Verified Base Sepolia testnet factory deployment.
  84532: "0x4Ed3f3925D1cd5fEd721Baf49A8a7f557dA62572" as `0x${string}`,
  // BNB Smart Chain Testnet only; null until a verified factory deployment is supplied.
  97: null,
};
export function getBondingCurveFactoryAddress(chainId: number): `0x${string}` | null {
  return BONDING_CURVE_FACTORY[chainId] ?? null;
}
/**
 * Track deployed token contracts.
 * Key: tokenId, Value: { chainId, contractAddress }
 * We store this in localStorage at runtime but provide the type here.
 */
export interface DeployedContract {
  tokenId: string;
  chainId: number;
  contractAddress: `0x${string}`;
  deployedAt: number;
}

// ─── Base Sepolia network metadata (no mainnet fallback) ─────────────
export const RPC_URLS = { base_sepolia: "https://sepolia.base.org" } as const;
export const EXPLORER_URLS = { base_sepolia: "https://sepolia.basescan.org" } as const;
export function getContractExplorerUrl(_chainId: number, contractAddress: string): string {
  return `${EXPLORER_URLS.base_sepolia}/address/${contractAddress}`;
}
export function getExplorerName(_chainId: number): string { return "Base Sepolia Explorer"; }
// ─── Deployment Gas Limits ────────────────────

export const DEPLOY_GAS_LIMIT = 3_000_000n; // Gas limit for deploying bonding curve contract
export const BUY_GAS_LIMIT = 300_000n;
export const SELL_GAS_LIMIT = 300_000n;
export const GRADUATE_GAS_LIMIT = 150_000n;
