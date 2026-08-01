export const BNB_TESTNET_CHAIN_ID = 97;
export const BNB_TESTNET_CHAIN_HEX = "0x61";
export const BNB_TESTNET = {
  chainId: BNB_TESTNET_CHAIN_ID,
  chainIdHex: BNB_TESTNET_CHAIN_HEX,
  label: "BNB Smart Chain Testnet",
  nativeCurrency: { name: "BNB", symbol: "tBNB", decimals: 18 },
  rpcUrl: "https://data-seed-prebsc-1-s1.bnbchain.org:8545",
  explorerUrl: "https://testnet.bscscan.com",
  testnetOnly: true,
} as const;

export type WalletProvider = { request(args: { method: string; params?: unknown[] }): Promise<unknown> };
export async function ensureBnbTestnet(provider: WalletProvider): Promise<void> {
  const chain = String(await provider.request({ method: "eth_chainId" }));
  if (Number(BigInt(chain)) !== BNB_TESTNET_CHAIN_ID) {
    throw new Error("Wallet must be connected to BNB Smart Chain Testnet (chain ID 97). Mainnet is not supported.");
  }
}
export async function switchToBnbTestnet(provider: WalletProvider): Promise<void> {
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: BNB_TESTNET_CHAIN_HEX }] });
  } catch (error: any) {
    if (error?.code !== 4902) throw error;
    await provider.request({ method: "wallet_addEthereumChain", params: [{ chainId: BNB_TESTNET_CHAIN_HEX, chainName: BNB_TESTNET.label, nativeCurrency: BNB_TESTNET.nativeCurrency, rpcUrls: [BNB_TESTNET.rpcUrl], blockExplorerUrls: [BNB_TESTNET.explorerUrl] }] });
  }
}
