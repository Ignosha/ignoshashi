import { useState } from "react";
import { HiMiniXMark, HiMiniDevicePhoneMobile, HiMiniArrowTopRightOnSquare } from "react-icons/hi2";
import { useWallet } from "~/context/WalletContext";
import { useTheme } from "~/context/ThemeContext";
import {
  getPhantomDeepLink,
  getPhantomDownloadUrl,
  getMobilePlatform,
  isIOS,
} from "~/utils/phantomMobile";

/**
 * MobileWalletBanner
 *
 * Shown to mobile users who are NOT in Phantom's in-app browser.
 * Provides deep link to open in Phantom, and download links if not installed.
 *
 * Dismissible and respects localStorage to avoid annoying repeat visitors.
 */
export function MobileWalletBanner() {
  const { isMobileNoWallet, isPhantomInApp, phantomDeepLink, phantomDownloadUrl } = useWallet();
  const { theme } = useTheme();

  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    const stored = localStorage.getItem("ignoshashi_mobile_banner_dismissed");
    if (!stored) return false;
    // Re-show after 3 days
    const ts = parseInt(stored, 10);
    return Date.now() - ts < 3 * 24 * 60 * 60 * 1000;
  });

  const [showDownloadOptions, setShowDownloadOptions] = useState(false);

  // Don't show if not on mobile, or already in Phantom, or wallet detected
  if (!isMobileNoWallet || isPhantomInApp || dismissed) return null;

  const platform = getMobilePlatform();
  const isIOSDevice = isIOS();

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem("ignoshashi_mobile_banner_dismissed", Date.now().toString());
  };

  const handleOpenPhantom = () => {
    try {
      window.location.href = getPhantomDeepLink();
    } catch {
      setShowDownloadOptions(true);
    }
  };

  return (
    <div
      className="fixed bottom-4 left-4 right-4 z-50 rounded-lg p-4 shadow-lg backdrop-blur-md animate-slide-up"
      style={{
        background: `${theme.bg}f5`,
        border: `2px solid ${theme.border}`,
        boxShadow: `0 0 30px ${theme.primary}33`,
      }}
    >
      {/* Dismiss button */}
      <button
        onClick={handleDismiss}
        className="absolute top-2 right-2 p-1 rounded-full transition-colors duration-100"
        style={{ color: theme.textMuted }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.color = theme.text;
          (e.currentTarget as HTMLElement).style.background = `${theme.primary}15`;
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.color = theme.textMuted;
          (e.currentTarget as HTMLElement).style.background = "";
        }}
      >
        <HiMiniXMark size={20} />
      </button>

      <div className="flex items-start gap-3 pr-6">
        <div
          className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
          style={{ background: `${theme.primary}1A` }}
        >
          <HiMiniDevicePhoneMobile size={22} style={{ color: theme.primary }} />
        </div>

        <div className="flex-1 min-w-0">
          <p
            className="mb-1"
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: "0.45rem",
              color: theme.primary,
            }}
          >
            📱 BEST ON PHANTOM
          </p>
          <p
            className="mb-3 leading-relaxed"
            style={{
              fontFamily: '"VT323", monospace',
              fontSize: "1rem",
              color: theme.text,
            }}
          >
            For the best experience, open MemeVault inside the <strong>Phantom Wallet</strong> app's built-in browser.
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleOpenPhantom}
              className="retro-btn retro-btn-orange text-[0.4rem] px-3 py-2 flex items-center gap-1.5"
              style={{ fontFamily: '"Press Start 2P", monospace' }}
            >
              <HiMiniArrowTopRightOnSquare size={14} />
              OPEN IN PHANTOM
            </button>

            {!showDownloadOptions ? (
              <button
                onClick={() => setShowDownloadOptions(true)}
                className="retro-btn retro-btn-outline text-[0.35rem] px-3 py-2"
                style={{ fontFamily: '"Press Start 2P", monospace' }}
              >
                GET PHANTOM ↓
              </button>
            ) : (
              <a
                href={phantomDownloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="retro-btn retro-btn-yellow text-[0.35rem] px-3 py-2"
                style={{ fontFamily: '"Press Start 2P", monospace' }}
              >
                {isIOSDevice ? "📥 APP STORE" : "📥 GOOGLE PLAY"}
              </a>
            )}
          </div>

          {showDownloadOptions && (
            <p
              className="mt-2"
              style={{
                fontFamily: '"VT323", monospace',
                fontSize: "0.85rem",
                color: theme.textMuted,
              }}
            >
              After installing, open <strong style={{ color: theme.primary }}>ignoshashi</strong> inside the Phantom app browser.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
