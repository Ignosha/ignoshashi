/**
 * ignoshashi — Add Token to User's Wallet
 *
 * Supports MetaMask (Ethereum ERC-20) via wallet_watchAsset.
 * Supports Phantom/Solana (SPL) via wallet_watchAsset.
 */

export interface TokenInfo {
  tokenAddress: string;
  ticker: string;
  decimals: number;
  image: string;
  blockchain: "solana" | "ethereum";
}

/**
 * Attempt to add a token to the user's wallet.
 * Returns true if the asset was added or if the user was prompted.
 */
export async function addTokenToWallet(info: TokenInfo): Promise<{
  success: boolean;
  method: "watchAsset" | "explorer" | "none";
}> {
  if (info.blockchain === "ethereum") {
    return addToMetaMask(info);
  } else {
    return addToSolanaWallet(info);
  }
}

async function addToMetaMask(info: TokenInfo): Promise<{
  success: boolean;
  method: "watchAsset" | "explorer" | "none";
}> {
  if (typeof window === "undefined" || !(window as any).ethereum) {
    return { success: false, method: "none" };
  }

  try {
    const wasAdded = await (window as any).ethereum.request({
      method: "wallet_watchAsset",
      params: {
        type: "ERC20",
        options: {
          address: info.tokenAddress,
          symbol: info.ticker,
          decimals: info.decimals,
          image: info.image || undefined,
        },
      },
    });

    return { success: !!wasAdded, method: "watchAsset" };
  } catch (err) {
    console.error("Failed to add token to MetaMask:", err);
    return { success: false, method: "none" };
  }
}

async function addToSolanaWallet(info: TokenInfo): Promise<{
  success: boolean;
  method: "watchAsset" | "explorer" | "none";
}> {
  // Phantom supports wallet_watchAsset for SPL tokens
  if (typeof window === "undefined") {
    return { success: false, method: "none" };
  }

  const win = window as any;
  const provider = win.solana;

  if (!provider?.request) {
    // Fall back to explorer link if no wallet_watchAsset support
    return { success: true, method: "explorer" };
  }

  try {
    const wasAdded = await provider.request({
      method: "wallet_watchAsset",
      params: {
        type: "SPL",
        options: {
          address: info.tokenAddress,
          symbol: info.ticker,
          decimals: info.decimals,
          image: info.image || undefined,
        },
      },
    });

    return { success: !!wasAdded, method: "watchAsset" };
  } catch (err: any) {
    // User rejected or wallet doesn't support it
    console.error("Failed to add SPL token to Phantom:", err);
    return { success: false, method: "none" };
  }
}

/**
 * Quick check: is Phantom's wallet_watchAsset available?
 */
export function isPhantomWatchAssetAvailable(): boolean {
  if (typeof window === "undefined") return false;
  const win = window as any;
  return !!(win.solana?.request);
}

/**
 * Get the explorer URL for a token address.
 */
export function getExplorerUrl(
  tokenAddress: string,
  blockchain: "solana" | "ethereum",
): string {
  if (blockchain === "solana") {
    return `https://solscan.io/token/${tokenAddress}`;
  }
  return `https://etherscan.io/token/${tokenAddress}`;
}
