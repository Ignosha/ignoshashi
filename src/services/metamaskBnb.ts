import { useCallback, useEffect, useState } from "react";
import { BNB_TESTNET, BNB_TESTNET_CHAIN_HEX, switchToBnbTestnet, type WalletProvider } from "~/config/networks";

export type Eip1193Provider = WalletProvider & {
  on?: (event: string, listener: (...args: any[]) => void) => void;
  removeListener?: (event: string, listener: (...args: any[]) => void) => void;
};

export const BNB_QA_FACTORY = "0xb194d934830b89b8a83D4048C788592B57926981" as const;

export function shortAddress(address: string): string {
  return address.length > 10 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

export async function connectMetaMaskBnb(provider: Eip1193Provider | null | undefined): Promise<{ address: string; chainId: string }> {
  if (!provider) throw new Error("MetaMask was not detected. Install MetaMask or open this page in its browser.");
  const accounts = await provider.request({ method: "eth_requestAccounts" }) as string[];
  if (!accounts?.[0]) throw new Error("No MetaMask account was returned.");
  let chainId = String(await provider.request({ method: "eth_chainId" }));
  if (chainId.toLowerCase() !== BNB_TESTNET_CHAIN_HEX) {
    await switchToBnbTestnet(provider);
    chainId = String(await provider.request({ method: "eth_chainId" }));
  }
  if (chainId.toLowerCase() !== BNB_TESTNET_CHAIN_HEX) throw new Error("MetaMask must be connected to BNB Smart Chain Testnet (chain ID 97).");
  return { address: accounts[0], chainId };
}

export function useMetaMaskBnb() {
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const provider = typeof window !== "undefined" ? ((window as any).ethereum as Eip1193Provider | undefined) : undefined;

  const reset = useCallback(() => { setAddress(null); setChainId(null); }, []);
  const refresh = useCallback(async () => {
    if (!provider) return reset();
    const accounts = await provider.request({ method: "eth_accounts" }) as string[];
    const nextChain = String(await provider.request({ method: "eth_chainId" }));
    setAddress(accounts?.[0] || null); setChainId(nextChain);
    if (!accounts?.[0]) reset();
  }, [provider, reset]);
  const connect = useCallback(async () => {
    setError("");
    try { const result = await connectMetaMaskBnb(provider); setAddress(result.address); setChainId(result.chainId); return result; }
    catch (e: any) { setError(e?.message || "Unable to connect MetaMask"); throw e; }
  }, [provider]);

  useEffect(() => {
    if (!provider) return;
    void refresh();
    const accountsChanged = (accounts: string[]) => { setAddress(accounts?.[0] || null); if (!accounts?.[0]) setChainId(null); };
    const chainChanged = (next: string) => { setChainId(String(next)); if (String(next).toLowerCase() !== BNB_TESTNET_CHAIN_HEX) setAddress(null); };
    provider.on?.("accountsChanged", accountsChanged); provider.on?.("chainChanged", chainChanged);
    return () => { provider.removeListener?.("accountsChanged", accountsChanged); provider.removeListener?.("chainChanged", chainChanged); };
  }, [provider, refresh]);
  return { address, shortAddress: address ? shortAddress(address) : null, chainId, isBnbTestnet: chainId?.toLowerCase() === BNB_TESTNET_CHAIN_HEX, error, connect, reset, factoryAddress: BNB_QA_FACTORY };
}
