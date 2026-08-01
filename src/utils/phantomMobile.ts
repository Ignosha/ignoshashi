/**
 * Phantom Mobile Detection & Deep Linking Utilities
 *
 * Handles:
 * 1. Detecting Phantom's mobile in-app browser vs regular mobile browsers
 * 2. Generating deep links for Phantom app
 * 3. Constructing Phantom connect URLs for mobile
 */

// ─── Detection ──────────────────────────────────────

/**
 * Is the user on any mobile device?
 */
export function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|webOS/i.test(navigator.userAgent);
}

/**
 * Is the user inside Phantom's mobile in-app browser?
 *
 * Phantom's in-app browser includes "Phantom" in the user agent on both iOS and Android.
 * Example UA: "...Mobile Safari...Phantom/..." or "...Chrome...Phantom/..."
 */
export function isPhantomInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Phantom/i.test(navigator.userAgent);
}

/**
 * Is the user on Android?
 */
export function isAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent);
}

/**
 * Is the user on iOS?
 */
export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/**
 * Get the mobile platform for store links.
 */
export function getMobilePlatform(): "ios" | "android" | "other" {
  if (isIOS()) return "ios";
  if (isAndroid()) return "android";
  return "other";
}

// ─── Phantom Provider Detection ─────────────────────

/**
 * Phantom mobile in-app browser provides `window.solana` with `isPhantom: true`.
 * However, in some versions the provider is at `window.phantom.solana`.
 *
 * This function checks all known paths and returns the first valid Phantom provider.
 */
export function detectPhantomProvider(): any {
  if (typeof window === "undefined") return null;
  const win = window as any;

  // Path 1: Standard — window.solana with isPhantom flag (desktop + mobile)
  if (win.solana?.isPhantom) {
    console.log("[PhantomDetect] Found via window.solana.isPhantom");
    return win.solana;
  }

  // Path 2: window.phantom.solana (some mobile versions)
  if (win.phantom?.solana?.isPhantom) {
    console.log("[PhantomDetect] Found via window.phantom.solana.isPhantom");
    return win.phantom.solana;
  }

  // Path 3: window.phantom?.solana without isPhantom (older mobile versions)
  if (win.phantom?.solana) {
    console.log("[PhantomDetect] Found via window.phantom.solana (no isPhantom flag)");
    return win.phantom.solana;
  }

  // Path 4: Phantom in-app browser user agent but provider not yet injected
  // Try window.solana even without isPhantom as last resort
  if (isPhantomInAppBrowser() && win.solana) {
    console.log("[PhantomDetect] Phantom UA detected, using window.solana without isPhantom");
    return win.solana;
  }

  return null;
}

// ─── Deep Linking ───────────────────────────────────

/**
 * Generate a Phantom deep link URL for connecting a dApp.
 *
 * Phantom uses the `phantom://` scheme on Android and universal links on iOS.
 *
 * @param redirectUrl - The URL to redirect back to after connecting (your dApp)
 * @param cluster - Solana cluster: "mainnet-beta", "devnet", "testnet"
 */
export function getPhantomDeepLink(
  redirectUrl?: string,
  cluster: string = "mainnet-beta",
): string {
  const dappUrl = redirectUrl || (typeof window !== "undefined" ? window.location.href : "");
  const encodedRedirect = encodeURIComponent(dappUrl);
  const encodedCluster = encodeURIComponent(cluster);

  // Phantom's universal link (preferred — works on both iOS and Android)
  return `https://phantom.app/ul/browse/${encodedRedirect}?ref=${encodedRedirect}`;
}

/**
 * Generate a direct `phantom://` scheme deep link.
 * Falls back to this on Android if universal link fails.
 */
export function getPhantomSchemeDeepLink(
  redirectUrl?: string,
): string {
  const dappUrl = redirectUrl || (typeof window !== "undefined" ? window.location.href : "");
  const encoded = encodeURIComponent(dappUrl);
  return `phantom://browse?url=${encoded}`;
}

/**
 * Get the Phantom app store download URL for the current platform.
 */
export function getPhantomDownloadUrl(): string {
  if (isIOS()) {
    return "https://apps.apple.com/us/app/phantom-solana-wallet/id1598432977";
  }
  if (isAndroid()) {
    return "https://play.google.com/store/apps/details?id=app.phantom";
  }
  // Desktop / fallback
  return "https://phantom.app/download";
}

/**
 * Try to open Phantom app via deep link.
 * Returns true if the deep link was attempted (we can't know if it succeeded).
 *
 * Uses a two-step approach:
 * 1. Try universal link (https://phantom.app/ul/browse/...)
 * 2. Fall back to scheme deep link after a short timeout
 */
export function openPhantomDeepLink(redirectUrl?: string, cluster?: string): boolean {
  if (typeof window === "undefined") return false;

  const dappUrl = redirectUrl || window.location.href;

  // Try universal link first
  const universalLink = getPhantomDeepLink(dappUrl, cluster);

  try {
    // Method 1: Direct navigation (works for universal links)
    window.location.href = universalLink;

    // Method 2: For scheme URLs, set a fallback timer
    // If we're still here after 2 seconds, the deep link probably failed
    // and we should redirect to download page
    setTimeout(() => {
      // If the page is still visible, deep link likely failed
      if (document.visibilityState === "visible") {
        console.log("[PhantomDeepLink] Universal link may have failed, trying scheme...");
        // Don't auto-redirect to app store — let the banner handle it
      }
    }, 2000);

    return true;
  } catch (err) {
    console.error("[PhantomDeepLink] Failed to open:", err);
    return false;
  }
}

// ─── Connection URL for Phantom ────────────────────

/**
 * Generate a Phantom wallet connect URL for external browsers.
 *
 * Uses Phantom's `phantom.app/ul/v1/connect` endpoint.
 * This opens the Phantom app with a connection request.
 *
 * @param dappUrl - Your dApp's URL (for redirect after connect)
 * @param cluster - Solana cluster
 */
export function getPhantomConnectUrl(
  dappUrl?: string,
  cluster: string = "mainnet-beta",
): string {
  const url = dappUrl || (typeof window !== "undefined" ? window.location.origin : "");
  const params = new URLSearchParams({
    dapp_url: url,
    redirect_link: url,
    cluster,
  });
  return `https://phantom.app/ul/v1/connect?${params.toString()}`;
}

// ─── Debug Logger ───────────────────────────────────

/**
 * Log mobile wallet detection info to console for debugging.
 * Call this once on app init.
 */
export function logMobileWalletDebug(): void {
  if (typeof window === "undefined") return;

  const win = window as any;
  console.group("🔍 [PhantomMobile] Wallet Detection Debug");
  console.log("User Agent:", navigator.userAgent);
  console.log("isMobileDevice:", isMobileDevice());
  console.log("isPhantomInAppBrowser:", isPhantomInAppBrowser());
  console.log("Platform:", getMobilePlatform());
  console.log("window.solana:", !!win.solana);
  console.log("window.solana?.isPhantom:", !!win.solana?.isPhantom);
  console.log("window.phantom:", !!win.phantom);
  console.log("window.phantom?.solana:", !!win.phantom?.solana);
  console.log("window.phantom?.solana?.isPhantom:", !!win.phantom?.solana?.isPhantom);
  console.log("window.solflare:", !!win.solflare);
  console.log("window.backpack:", !!win.backpack);
  console.log("window.ethereum:", !!win.ethereum);
  console.log("window.ethereum?.isMetaMask:", !!win.ethereum?.isMetaMask);
  console.log("Detected Phantom Provider:", !!detectPhantomProvider());
  console.groupEnd();
}
