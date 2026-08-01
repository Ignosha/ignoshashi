import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import {
  isMobileDevice,
  isPhantomInAppBrowser,
  detectPhantomProvider,
  getPhantomConnectUrl,
  getPhantomDownloadUrl,
  logMobileWalletDebug,
} from "~/utils/phantomMobile";

// ─── localStorage keys for wallet persistence ──────
const LS_SOL_ADDRESS = "ignoshashi_sol_address";
const LS_ETH_ADDRESS = "ignoshashi_eth_address";

export type ChainType = "solana" | "ethereum" | null;

interface WalletInfo {
  address: string;
  chain: "solana" | "ethereum";
}

interface WalletState {
  connected: boolean;
  solAddress: string | null;
  ethAddress: string | null;
  chain: ChainType;
  callsign: string | null;
  connect: (chain: "solana" | "ethereum", walletType?: string) => Promise<void>;
  disconnect: (chain?: "solana" | "ethereum") => void;
  /** Check if wallet is connected for a specific chain */
  isConnectedOnChain: (chain: "solana" | "ethereum") => boolean;
  /** Get the wallet address for a specific chain */
  getAddressForChain: (chain: "solana" | "ethereum") => string | null;
  /** Get the raw wallet provider (Phantom/MetaMask instance) */
  getProvider: (chain: "solana" | "ethereum") => any;
  /** Get wallet balance in native currency (SOL or ETH) */
  getBalance: (chain: "solana" | "ethereum") => Promise<number>;
  /** Set callsign for the connected wallet */
  setCallsign: (callsign: string) => Promise<boolean>;
  /** Get the primary wallet address (first connected) */
  getPrimaryAddress: () => string | null;
  /** Whether the user is on mobile and should see deep link guidance */
  isMobileNoWallet: boolean;
  /** Whether the user is inside Phantom's in-app browser */
  isPhantomInApp: boolean;
  /** Phantom deep link URL for external mobile browsers */
  phantomDeepLink: string;
  /** Phantom download URL */
  phantomDownloadUrl: string;
}

const WalletContext = createContext<WalletState>({
  connected: false,
  solAddress: null,
  ethAddress: null,
  chain: null,
  callsign: null,
  connect: async () => {},
  disconnect: () => {},
  isConnectedOnChain: () => false,
  getAddressForChain: () => null,
  getProvider: () => null,
  getBalance: async () => 0,
  setCallsign: async () => false,
  getPrimaryAddress: () => null,
  isMobileNoWallet: false,
  isPhantomInApp: false,
  phantomDeepLink: "",
  phantomDownloadUrl: "https://phantom.app/download",
});

// Wallet detection helpers
// NOTE: isMobileDevice is imported from ~/utils/phantomMobile above

function detectSolflareProvider(): any {
  if (typeof window === "undefined") return null;
  const win = window as any;
  return win.solflare || null;
}

function getSolanaWallets(): { name: string; detect: () => any }[] {
  if (typeof window === "undefined") return [];
  const win = window as any;
  const wallets: { name: string; detect: () => any }[] = [];

  // Enhanced Phantom detection — covers desktop extension + mobile in-app browser
  const phantomProvider = detectPhantomProvider();
  if (phantomProvider) {
    wallets.push({ name: "Phantom", detect: () => phantomProvider });
  }

  // Solflare
  if (win.solflare) wallets.push({ name: "Solflare", detect: () => win.solflare });
  // Backpack
  if (win.backpack) wallets.push({ name: "Backpack", detect: () => win.backpack });
  // Glow
  if (win.glow) wallets.push({ name: "Glow", detect: () => win.glow });
  // Trust Wallet (Solana)
  if (win.trustwallet?.solana) wallets.push({ name: "Trust Wallet", detect: () => win.trustwallet.solana });

  // Generic solana provider — only if no named wallets found AND not in Phantom in-app
  // (Phantom in-app browser always provides window.solana)
  if (win.solana && !phantomProvider && wallets.length === 0) {
    wallets.push({ name: "Solana Wallet", detect: () => win.solana });
  }

  return wallets;
}

function getEthereumWallets(): { name: string; detect: () => any }[] {
  if (typeof window === "undefined") return [];
  const win = window as any;
  const wallets: { name: string; detect: () => any }[] = [];

  // MetaMask
  if (win.ethereum?.isMetaMask) wallets.push({ name: "MetaMask", detect: () => win.ethereum });
  // Coinbase Wallet
  if (win.coinbaseWalletExtension || win.ethereum?.isCoinbaseWallet) {
    wallets.push({ name: "Coinbase Wallet", detect: () => win.coinbaseWalletExtension || win.ethereum });
  }
  // Trust Wallet
  if (win.ethereum?.isTrust) wallets.push({ name: "Trust Wallet", detect: () => win.ethereum });
  // Rainbow
  if (win.ethereum?.isRainbow) wallets.push({ name: "Rainbow", detect: () => win.ethereum });
  // Generic fallback
  if (win.ethereum && wallets.length === 0) {
    wallets.push({ name: "Ethereum Wallet", detect: () => win.ethereum });
  }

  return wallets;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [solAddress, setSolAddress] = useState<string | null>(null);
  const [ethAddress, setEthAddress] = useState<string | null>(null);
  const [callsign, setCallsignState] = useState<string | null>(null);

  // Mobile detection — computed once, reactive to window
  const [isPhantomInApp, setIsPhantomInApp] = useState(false);
  const [isMobileNoWallet, setIsMobileNoWallet] = useState(false);

  // Re-compute mobile state on mount and when wallets change
  useEffect(() => {
    if (typeof window === "undefined") return;
    const phantomInApp = isPhantomInAppBrowser();
    const mobile = isMobileDevice();
    setIsPhantomInApp(phantomInApp);

    // Show deep link guidance if on mobile, not in Phantom, and not connected
    const hasSolanaWallet = detectPhantomProvider() || (window as any).solflare || (window as any).backpack;
    setIsMobileNoWallet(mobile && !phantomInApp && !hasSolanaWallet);

    // Debug logging
    logMobileWalletDebug();
  }, [solAddress, ethAddress]);

  // Re-evaluate when connection state changes
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mobile = isMobileDevice();
    const phantomInApp = isPhantomInAppBrowser();
    const hasSolanaWallet = !!detectPhantomProvider() || !!(window as any).solflare || !!(window as any).backpack;
    // Only show banner when not connected
    const connected = !!(solAddress || ethAddress);
    setIsMobileNoWallet(mobile && !phantomInApp && !hasSolanaWallet && !connected);
  }, [solAddress, ethAddress]);

  // Fetch callsign from server when wallet address changes
  useEffect(() => {
    const address = solAddress || ethAddress;
    if (!address) {
      setCallsignState(null);
      return;
    }
    fetch(`/api/users/${encodeURIComponent(address)}`)
      .then((res) => {
        if (!res.ok) throw new Error("not found");
        return res.json();
      })
      .then((data: { callsign: string }) => {
        setCallsignState(data.callsign);
      })
      .catch(() => {
        setCallsignState(null);
      });
  }, [solAddress, ethAddress]);

  // Persist wallet addresses to localStorage for auto-reconnect
  useEffect(() => {
    if (solAddress) {
      try { localStorage.setItem(LS_SOL_ADDRESS, solAddress); } catch {}
    } else {
      try { localStorage.removeItem(LS_SOL_ADDRESS); } catch {}
    }
  }, [solAddress]);

  useEffect(() => {
    if (ethAddress) {
      try { localStorage.setItem(LS_ETH_ADDRESS, ethAddress); } catch {}
    } else {
      try { localStorage.removeItem(LS_ETH_ADDRESS); } catch {}
    }
  }, [ethAddress]);

  // Auto-reconnect on page refresh
  useEffect(() => {
    if (typeof window === "undefined") return;

    const savedSol = (() => { try { return localStorage.getItem(LS_SOL_ADDRESS); } catch { return null; } })();
    const savedEth = (() => { try { return localStorage.getItem(LS_ETH_ADDRESS); } catch { return null; } })();

    // If we already have addresses set, no need to reconnect
    if (solAddress || ethAddress) return;

    let cancelled = false;

    async function tryAutoReconnect() {
      // Try Solana first
      if (savedSol) {
        const solProvider = detectPhantomProvider() || (window as any).solflare || (window as any).backpack || (window as any).solana;
        if (solProvider?.connect) {
          try {
            // Try silent reconnect first (onlyIfTrusted)
            const resp = await solProvider.connect({ onlyIfTrusted: true });
            const addr = resp.publicKey?.toString() || null;
            if (addr && !cancelled) {
              console.log("[WalletContext] Auto-reconnected Solana:", addr.slice(0, 8) + "...");
              setSolAddress(addr);
              return; // Successfully reconnected, skip Ethereum
            }
          } catch {
            // Silent reconnect failed — wallet may require explicit user action
            // Don't fall back to saved address; that would show stale state
          }
        }
      }

      // Try Ethereum
      if (savedEth) {
        const ethProvider = (window as any).ethereum;
        if (ethProvider) {
          try {
            const accounts = await ethProvider.request({ method: "eth_accounts" });
            if (accounts && accounts.length > 0 && !cancelled) {
              console.log("[WalletContext] Auto-reconnected Ethereum:", accounts[0].slice(0, 8) + "...");
              setEthAddress(accounts[0]);
            }
          } catch {
            // Silent reconnect failed, user will need to connect manually
          }
        }
      }
    }

    // Delay auto-reconnect slightly to let the page settle
    const timer = setTimeout(tryAutoReconnect, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []); // Run only on mount

  const connect = useCallback(async (targetChain: "solana" | "ethereum", walletType?: string) => {
    try {
      const mobile = isMobileDevice();
      const phantomInApp = isPhantomInAppBrowser();

      if (targetChain === "solana") {
        // ── Enhanced Solana mobile detection ──
        const solWallets = getSolanaWallets();

        // Case 1: In Phantom mobile in-app browser — connect directly
        if (phantomInApp && solWallets.length > 0) {
          console.log("[WalletContext] Phantom in-app browser detected, connecting directly...");
          const phantomProvider = detectPhantomProvider();
          if (phantomProvider?.connect) {
            try {
              const resp = await phantomProvider.connect({ onlyIfTrusted: false });
              const addr = resp.publicKey?.toString() || null;
              if (addr) {
                setSolAddress(addr);
                console.log("[WalletContext] Phantom mobile connected:", addr.slice(0, 8) + "...");
                return;
              }
            } catch (err: any) {
              console.error("[WalletContext] Phantom mobile connect failed:", err);
              if (err?.code === 4001) {
                alert("Connection rejected by user.");
                return;
              }
              // Fall through to generic connect
            }
          }
        }

        // Case 2: On mobile, not in Phantom, no wallet — offer deep link
        if (mobile && !phantomInApp && solWallets.length === 0) {
          const phantomUrl = getPhantomConnectUrl();
          const downloadUrl = getPhantomDownloadUrl();
          const storeName = /iPhone|iPad|iPod/i.test(navigator.userAgent) ? "App Store" : "Google Play";

          const msg =
            "📱 For the best experience, open ignoshashi in Phantom's built-in browser.\n\n" +
            "1️⃣ Install Phantom from the " + storeName + "\n" +
            "2️⃣ Open Phantom and navigate to ignoshashi\n" +
            "3️⃣ Or tap the link below to open directly\n\n" +
            "Direct link: " + phantomUrl;

          // Show a more actionable prompt
          const shouldDeepLink = confirm(
            "📱 Open in Phantom Wallet?\n\n" +
            "For the best experience, use Phantom's built-in browser.\n\n" +
            "👉 Tap OK to try opening in Phantom\n" +
            "👉 Tap Cancel to get download instructions"
          );

          if (shouldDeepLink) {
            window.location.href = phantomUrl;
          } else {
            alert(
              "📱 Get Phantom Wallet:\n\n" +
              "• iOS: " + getPhantomDownloadUrl() + "\n" +
              "• Android: " + getPhantomDownloadUrl() + "\n\n" +
              "After installing, open ignoshashi inside the Phantom app."
            );
          }
          return;
        }

        // Case 3: Desktop or has wallet — standard flow
        if (solWallets.length === 0) {
          if (mobile) {
            alert(
              "📱 Mobile Tip: For Solana, use the Phantom or Solflare app's built-in browser.\n\n" +
              "Or install Phantom from your app store and open ignoshashi inside it.\n\n" +
              "Desktop: Install Phantom, Solflare, Backpack, or Glow browser extension."
            );
          } else {
            alert("No Solana wallet detected. Please install Phantom, Solflare, Backpack, or Glow.");
          }
          return;
        }

        let provider: any;
        if (walletType && solWallets.find((w) => w.name === walletType)) {
          provider = solWallets.find((w) => w.name === walletType)!.detect();
        } else if (solWallets.length === 1) {
          provider = solWallets[0].detect();
        } else {
          // Pick first available
          provider = solWallets[0].detect();
        }

        if (provider?.connect) {
          // On mobile Phantom, use onlyIfTrusted option for auto-reconnect
          const connectOptions = (phantomInApp || mobile) ? { onlyIfTrusted: false } : undefined;
          const resp = await provider.connect(connectOptions);
          const addr = resp.publicKey?.toString() || null;
          if (addr) {
            setSolAddress(addr);
            console.log("[WalletContext] Solana connected:", addr.slice(0, 8) + "...");
          } else {
            throw new Error("No public key returned from wallet");
          }
        } else {
          alert("Selected wallet does not support connect(). Try another.");
        }
      } else if (targetChain === "ethereum") {
        const ethWallets = getEthereumWallets();
        if (ethWallets.length === 0) {
          if (mobile) {
            alert(
              "📱 Mobile Tip: For Ethereum, use MetaMask or Coinbase Wallet app's built-in browser.\n\n" +
              "Open ignoshashi in the MetaMask or Coinbase Wallet app to connect.\n\n" +
              "Desktop: Install MetaMask, Coinbase Wallet, or Rainbow browser extension."
            );
          } else {
            alert("No Ethereum wallet detected. Please install MetaMask, Coinbase Wallet, or Rainbow.");
          }
          return;
        }

        const provider = ethWallets[0].detect();
        if (!provider) {
          alert("Ethereum wallet not found.");
          return;
        }

        const accounts = await provider.request({ method: "eth_requestAccounts" });
        if (accounts && accounts.length > 0) {
          setEthAddress(accounts[0]);
        }
      }
    } catch (err: any) {
      console.error("Wallet connection failed:", err);
      if (err?.code === 4001) {
        alert("Connection rejected by user.");
      } else {
        alert(err?.message || "Failed to connect wallet");
      }
    }
  }, []);

  const disconnect = useCallback((chain?: "solana" | "ethereum") => {
    if (!chain || chain === "solana") setSolAddress(null);
    if (!chain || chain === "ethereum") setEthAddress(null);
  }, []);

  const connected = !!(solAddress || ethAddress);
  const primaryChain: ChainType = ethAddress ? "ethereum" : solAddress ? "solana" : null;

  // ─── New helper methods ────────────────────

  const isConnectedOnChain = useCallback(
    (chain: "solana" | "ethereum"): boolean => {
      return chain === "solana" ? !!solAddress : !!ethAddress;
    },
    [solAddress, ethAddress],
  );

  const getAddressForChain = useCallback(
    (chain: "solana" | "ethereum"): string | null => {
      return chain === "solana" ? solAddress : ethAddress;
    },
    [solAddress, ethAddress],
  );

  const getProvider = useCallback(
    (chain: "solana" | "ethereum"): any => {
      if (typeof window === "undefined") return null;
      const win = window as any;
      if (chain === "solana") {
        // Use enhanced Phantom detection first
        const phantom = detectPhantomProvider();
        if (phantom) return phantom;
        return win.solflare || win.backpack || win.glow || win.solana || null;
      } else {
        return win.ethereum || null;
      }
    },
    [],
  );

  const getBalance = useCallback(
    async (chain: "solana" | "ethereum"): Promise<number> => {
      try {
        if (chain === "solana" && solAddress) {
          // Use @solana/web3.js for balance
          const { Connection, PublicKey, LAMPORTS_PER_SOL } = await import("@solana/web3.js");
          const conn = new Connection("https://api.mainnet-beta.solana.com", "confirmed");
          const pubkey = new PublicKey(solAddress);
          const balance = await conn.getBalance(pubkey);
          return balance / LAMPORTS_PER_SOL;
        } else if (chain === "ethereum" && ethAddress) {
          const { BrowserProvider, formatEther } = await import("ethers");
          const win = window as any;
          const ethProvider = win.ethereum;
          if (!ethProvider) return 0;
          const provider = new BrowserProvider(ethProvider);
          const balance = await provider.getBalance(ethAddress);
          return parseFloat(formatEther(balance));
        }
        return 0;
      } catch {
        return 0;
      }
    },
    [solAddress, ethAddress],
  );

  const setCallsign = useCallback(
    async (newCallsign: string): Promise<boolean> => {
      const address = solAddress || ethAddress;
      if (!address || !newCallsign) return false;
      try {
        const res = await fetch("/api/users/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wallet: address, callsign: newCallsign }),
        });
        if (!res.ok) return false;
        const data = await res.json();
        setCallsignState(data.callsign);
        return true;
      } catch {
        return false;
      }
    },
    [solAddress, ethAddress],
  );

  const getPrimaryAddress = useCallback((): string | null => {
    return solAddress || ethAddress;
  }, [solAddress, ethAddress]);

  const phantomDeepLink = typeof window !== "undefined" ? getPhantomConnectUrl() : "";
  const phantomDownloadUrl = getPhantomDownloadUrl();

  return (
    <WalletContext.Provider
      value={{
        connected,
        solAddress,
        ethAddress,
        chain: primaryChain,
        callsign,
        connect,
        disconnect,
        isConnectedOnChain,
        getAddressForChain,
        getProvider,
        getBalance,
        setCallsign,
        getPrimaryAddress,
        isMobileNoWallet,
        isPhantomInApp,
        phantomDeepLink,
        phantomDownloadUrl,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  return useContext(WalletContext);
}

export function truncateAddress(addr: string): string {
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

export { getSolanaWallets, getEthereumWallets };
