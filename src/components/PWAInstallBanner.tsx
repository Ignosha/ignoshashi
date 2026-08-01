import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HiMiniRocketLaunch, HiMiniXMark } from "react-icons/hi2";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

/**
 * PWA Install Banner — retro arcade style
 * Shows when:
 * - The app is not already installed (display-mode !== standalone)
 * - The browser supports beforeinstallprompt
 * - User hasn't dismissed it recently (14 days cooldown)
 * - The PWA criteria are met (manifest, service worker, HTTPS)
 */
export function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [installed, setInstalled] = useState(false);

  // Check if already installed
  useEffect(() => {
    if (typeof window === "undefined") return;
    
    // Check display mode
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setInstalled(true);
      return;
    }

    // Check dismissed cooldown
    const dismissedAt = localStorage.getItem("pwa_install_dismissed");
    if (dismissedAt) {
      const cooldown = 14 * 24 * 60 * 60 * 1000; // 14 days
      if (Date.now() - parseInt(dismissedAt) < cooldown) {
        setDismissed(true);
        return;
      }
    }
  }, []);

  // Listen for beforeinstallprompt
  useEffect(() => {
    if (typeof window === "undefined" || installed || dismissed) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      
      // Show banner after a short delay
      setTimeout(() => setVisible(true), 3000);
    };

    const installedHandler = () => {
      setInstalled(true);
      setVisible(false);
      localStorage.setItem("pwa_installed", "true");
    };

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", installedHandler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, [installed, dismissed]);

  // Also show if the PWA is installable but no beforeinstallprompt (mobile browsers)
  useEffect(() => {
    if (typeof window === "undefined" || installed || dismissed || deferredPrompt) return;
    
    // Check if we have a service worker and manifest
    const hasSW = "serviceWorker" in navigator;
    if (!hasSW) return;

    // For mobile browsers that don't fire beforeinstallprompt,
    // show the banner after a delay if the user visits a few pages
    const pageViews = parseInt(localStorage.getItem("pwa_page_views") || "0") + 1;
    localStorage.setItem("pwa_page_views", pageViews.toString());

    if (pageViews >= 3 && !deferredPrompt) {
      const timer = setTimeout(() => setVisible(true), 5000);
      return () => clearTimeout(timer);
    }
  }, [installed, dismissed, deferredPrompt]);

  const handleInstall = useCallback(async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === "accepted") {
          setInstalled(true);
          setVisible(false);
        }
      } catch {
        // Fallback: show manual instructions
      }
      setDeferredPrompt(null);
    } else {
      // No deferred prompt — show manual install instructions
      // This handles mobile browsers where beforeinstallprompt doesn't fire
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const isAndroid = /Android/.test(navigator.userAgent);
      
      if (isIOS) {
        alert('To install: tap the Share button 📤 in Safari, then "Add to Home Screen"');
      } else if (isAndroid) {
        alert('To install: tap the menu button (⋮) in Chrome, then "Add to Home Screen"');
      } else {
        alert('To install: use the "Install" option in your browser menu');
      }
    }
    
    setVisible(false);
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    setDismissed(true);
    localStorage.setItem("pwa_install_dismissed", Date.now().toString());
  }, []);

  if (!visible) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="pwa-install-banner"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ duration: 0.3, ease: [0.68, -0.55, 0.265, 1.55] }}
      >
        <div className="pwa-install-banner-content">
          {/* Icon */}
          <div
            className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: "linear-gradient(135deg, rgba(0,255,65,0.2), rgba(0,255,65,0.05))",
              border: "2px solid rgba(0,255,65,0.3)",
              boxShadow: "0 0 12px rgba(0,255,65,0.2)",
            }}
          >
            <span className="text-xl retro-float">🚀</span>
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <p
              className="text-[#00ff41] font-bold mb-0.5 pixel-shadow-sm"
              style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "clamp(0.4rem, 2vw, 0.5rem)" }}
            >
              INSTALL IGNOSHASHI
            </p>
            <p
              className="text-[#e0ffe0] hidden sm:block"
              style={{ fontFamily: '"VT323", monospace', fontSize: "0.95rem" }}
            >
              Add to home screen for the best mobile trading experience
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <motion.button
              onClick={handleInstall}
              className="retro-btn retro-btn-orange neon-glow-yellow"
              style={{
                fontFamily: '"Press Start 2P", monospace',
                fontSize: "clamp(0.35rem, 1.8vw, 0.45rem)",
                padding: "0.5rem 0.8rem",
              }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <HiMiniRocketLaunch size={12} />
              INSTALL
            </motion.button>
            <button
              onClick={handleDismiss}
              className="text-[#b0d0b0] hover:text-[#00ff41] transition-colors p-2"
              style={{ minWidth: 44, minHeight: 44 }}
              aria-label="Dismiss install banner"
            >
              <HiMiniXMark size={16} />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
