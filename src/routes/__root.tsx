import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
  useLocation,
  useRouter,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import appCss from "~/styles/app.css?url";
import themesCss from "~/styles/themes.css?url";
import { Navbar } from "~/components/Navbar";
import { ChatWidget } from "~/components/ChatWidget";
import { ErrorBoundary } from "~/components/ErrorBoundary";
import { CommandPalette } from "~/components/CommandPalette";
import { LaunchAlerts } from "~/components/LaunchAlerts";
import { PriceAlertToast } from "~/components/PriceAlertToast";
import { ShortcutsModal } from "~/components/ShortcutsModal";
import { PixelMascot } from "~/components/PixelMascot";
import { PixelSpaceship } from "~/components/PixelSpaceship";
import { CoinRain } from "~/components/CoinRain";
import { CoinRainProvider, useCoinRain } from "~/context/CoinRainContext";
import { WalletProvider } from "~/context/WalletContext";
import { ThemeProvider, useTheme } from "~/context/ThemeContext";
import { AchievementProvider } from "~/context/AchievementContext";
import { WatchlistProvider } from "~/context/WatchlistContext";
import { AchievementToast } from "~/components/AchievementToast";
import { PWAInstallBanner } from "~/components/PWAInstallBanner";
import { MobileWalletBanner } from "~/components/MobileWalletBanner";
import { initTracker } from "~/services/tracker";
import { checkAndSaveReferral } from "~/services/referrals";
import { initPresence, destroyPresence } from "~/services/presence";
import { initNotificationBroadcastListener } from "~/services/notifications";
import { useKonamiCode } from "~/components/KonamiCode";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "ignoshashi — Launch & Trade Meme Coins" },
      { name: "theme-color", content: "#00ff41" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "ignoshashi" },
      {
        "http-equiv": "Content-Security-Policy",
        content:
          "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https:; frame-src 'self' https:;",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "stylesheet", href: themesCss },
      { rel: "manifest", href: "/manifest.json" },
      { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon-16.png" },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32.png" },
      { rel: "apple-touch-icon", sizes: "192x192", href: "/icon-192.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap",
      },
    ],
  }),
  notFoundComponent: () => (
    <div className="min-h-dvh flex items-center justify-center bg-[var(--color-bg,#050505)]">
      <div className="text-center">
        <div className="text-5xl mb-4 retro-float">🚀</div>
        <h1
          className="text-6xl font-bold text-[var(--color-primary,#00ff41)] mb-4 pixel-shadow"
          style={{ fontFamily: '"Press Start 2P", monospace' }}
        >
          404
        </h1>
        <p className="text-[var(--color-text,#e0ffe0)] text-lg" style={{ fontFamily: '"VT323", monospace' }}>
          SIGNAL LOST — UNABLE TO ESTABLISH CONNECTION
        </p>
      </div>
    </div>
  ),
  component: RootComponent,
});

function PageTransition({ children }: { children: ReactNode }) {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

function RootComponent() {
  useEffect(() => {
    initTracker();
    checkAndSaveReferral();
    initPresence();
    const cleanupNotifBroadcast = initNotificationBroadcastListener();

    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then(() => {
          console.log("[ignoshashi] Service worker registered");
        })
        .catch((err) => {
          console.warn("[ignoshashi] Service worker registration failed:", err);
        });
    }

    return () => {
      destroyPresence();
      cleanupNotifBroadcast();
    };
  }, []);

  return (
    <ThemeProvider>
      <RootDocument>
        <ErrorBoundary>
          <WalletProvider>
            <CoinRainProvider>
              <AchievementProvider>
                <WatchlistProvider>
                  <AppShell />
                </WatchlistProvider>
              </AchievementProvider>
            </CoinRainProvider>
          </WalletProvider>
        </ErrorBoundary>
      </RootDocument>
    </ThemeProvider>
  );
}

function AppShell() {
  const router = useRouter();
  const { toggleMode } = useTheme();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [godModeActive, setGodModeActive] = useState(false);
  const { active, count, duration, rainKey, isGraduation } = useCoinRain();

  // Konami code easter egg
  const handleKonami = useCallback(() => {
    setGodModeActive(true);
    setTimeout(() => setGodModeActive(false), 4000);
  }, []);
  useKonamiCode(handleKonami);

  // Keyboard shortcuts handler
  const handleGlobalKeys = useCallback(
    (e: KeyboardEvent) => {
      // Don't fire when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName;
      const isInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      
      // Shift+/ = "?" key
      if (e.key === "?" && !isInput) {
        e.preventDefault();
        setShortcutsOpen((prev) => !prev);
        return;
      }
      // Ctrl+/ to toggle dark/light mode
      if (e.key === "/" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        toggleMode();
        return;
      }
      // Number keys 1-9 for navigation (not in inputs)
      if (!isInput && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const pages: Record<string, string> = {
          "1": "/",
          "2": "/portfolio",
          "3": "/feed",
          "4": "/terminal",
          "5": "/create",
          "6": "/trends",
          "7": "/leaderboard",
          "8": "/analytics",
          "9": "/community",
        };
        const target = pages[e.key];
        if (target) {
          e.preventDefault();
          router.navigate({ to: target });
        }
      }
    },
    [toggleMode, router],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleGlobalKeys);
    return () => window.removeEventListener("keydown", handleGlobalKeys);
  }, [handleGlobalKeys]);

  return (
    <>
      <Navbar />
      <LaunchAlerts />
      <PriceAlertToast />
      <AchievementToast />
      <PageTransition>
        <Outlet />
      </PageTransition>
      <ChatWidget />
      <CommandPalette />
      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <CoinRain key={rainKey} active={active} count={count} duration={duration} isGraduation={isGraduation} />
      <PWAInstallBanner />
      <MobileWalletBanner />

      {/* GOD MODE overlay */}
      {godModeActive && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] pointer-events-none flex items-center justify-center"
          style={{
            background: "rgba(0,255,65,0.15)",
          }}
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: [0, 1.3, 1] }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="text-center"
          >
            <p className="text-6xl mb-4">🎮</p>
            <p
              className="font-bold"
              style={{
                fontFamily: '"Press Start 2P", monospace',
                fontSize: "1.5rem",
                color: "#00ff41",
                textShadow:
                  "0 0 30px rgba(0,255,65,0.8), 0 0 60px rgba(0,255,65,0.4), 0 0 100px rgba(0,255,65,0.2)",
              }}
            >
              GOD MODE ACTIVATED
            </p>
            <p
              className="mt-2"
              style={{
                fontFamily: '"VT323", monospace',
                fontSize: "1.2rem",
                color: "#00ff41",
              }}
            >
              🪙 INFINITE COINS UNLOCKED 🪙
            </p>
          </motion.div>
        </motion.div>
      )}
    </>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  // We need to read the theme to set body bg dynamically via CSS variables.
  // The ThemeProvider sets data-theme on <html>, so we use CSS variables
  // which are available at render time.
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body
        className="min-h-dvh"
        style={{
          background: "var(--color-bg, #050505)",
          color: "var(--color-text, #e0ffe0)",
        }}
      >
        {/* Starfield background */}
        <div className="starfield" />
        {/* Nebula blobs */}
        <div
          className="nebula-blob"
          style={{
            width: "600px",
            height: "600px",
            top: "20%",
            left: "50%",
            background:
              "radial-gradient(circle, color-mix(in srgb, var(--color-primary, #00ff41) 4%, transparent) 0%, transparent 70%)",
            filter: "blur(60px)",
          }}
        />
        <div
          className="nebula-blob"
          style={{
            width: "400px",
            height: "400px",
            top: "60%",
            left: "30%",
            background:
              "radial-gradient(circle, color-mix(in srgb, var(--color-primary, #00ff41) 3%, transparent) 0%, transparent 70%)",
            filter: "blur(50px)",
            animationDelay: "-10s",
          }}
        />
        <div
          className="nebula-blob"
          style={{
            width: "500px",
            height: "500px",
            top: "10%",
            left: "70%",
            background:
              "radial-gradient(circle, color-mix(in srgb, var(--color-primary, #7f00ff) 3%, transparent) 0%, transparent 70%)",
            filter: "blur(70px)",
            animationDelay: "-20s",
          }}
        />
        {/* Decorative planets */}
        <div className="space-planet" style={{ top: "15%", left: "5%", animationDelay: "0s" }}>
          🌙
        </div>
        <div
          className="space-planet"
          style={{ top: "70%", left: "90%", animationDelay: "-4s", fontSize: "2.5rem" }}
        >
          🪐
        </div>
        <div
          className="space-planet"
          style={{ top: "45%", left: "85%", animationDelay: "-8s", fontSize: "1.5rem" }}
        >
          🌍
        </div>
        {/* Shooting stars — staggered positions */}
        <div className="shooting-star" style={{ top: "10%", right: "5%", animationDelay: "0s" }} />
        <div className="shooting-star" style={{ top: "25%", right: "15%", animationDelay: "7s" }} />
        <div className="shooting-star" style={{ top: "40%", right: "8%", animationDelay: "14s" }} />
        {/* Floating space rocket */}
        <div className="space-rocket" style={{ top: "8%", right: "12%" }}>
          🚀
        </div>
        {/* Pixel spaceships — diagonal drift across background */}
        <PixelSpaceship size={52} speed={35} startX={0.15} startY={0.75} direction="bl-tr" />
        <PixelSpaceship size={40} speed={50} startX={0.8} startY={0.2} direction="tl-br" />
        <PixelSpaceship size={60} speed={42} startX={0.6} startY={0.85} direction="br-tl" />
        {/* ignoshashi pixel mascot */}
        <PixelMascot size={72} position={{ bottom: 140, right: 20 }} />
        {children}
        <Scripts />
      </body>
    </html>
  );
}
