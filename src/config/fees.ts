// ignoshashi Fee Configuration
// Owner: replace these with your actual wallet addresses

export const FEE_WALLETS = {
  solana: "J9mFgKsF9f2eNSrH7FqzBoADsgzU9diDQ3L9WUm9mDh7",
  ethereum: "0x5985a841601aE93D8Ddfec88715C755235490404",
  bnbTestnet: "0x10636e231339e774D0ee150c9CB158836DCcF510",
} as const;

export const CREATION_FEES = {
  solana: 0.01, // SOL
  ethereum: 0.005, // ETH
} as const;

function getSolanaRpcUrl(): string {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/api/solana-rpc`;
  }
  return "https://api.mainnet-beta.solana.com";
}
export const SOLANA_RPC = getSolanaRpcUrl();
export const ETHEREUM_CHAIN_ID = 1; // Ethereum mainnet

/** Public pool addresses for display only. Private keys are server-only runtime secrets. */
export const SELL_POOL_CONFIG = {
  solana: { publicKey: "J9mFgKsF9f2eNSrH7FqzBoADsgzU9diDQ3L9WUm9mDh7" },
  ethereum: { address: "0x5985a841601aE93D8Ddfec88715C755235490404" },
} as const;
