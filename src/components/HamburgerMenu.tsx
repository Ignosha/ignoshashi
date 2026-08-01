import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useLocation } from "@tanstack/react-router";
import { HiMiniBars3, HiMiniXMark } from "react-icons/hi2";

const navLinks = [
  { to: "/", label: "🏠 Home" },
  { to: "/portfolio", label: "📊 Portfolio" },
  { to: "/feed", label: "📡 Feed" },
  { to: "/terminal", label: "💻 Terminal" },
  { to: "/create", label: "🚀 Create" },
  { to: "/battles", label: "⚔️ Battles" },
  { to: "/trends", label: "📈 Trends" },
  { to: "/leaderboard", label: "🏆 Ranks" },
  { to: "/analytics", label: "📉 Analytics" },
  { to: "/community", label: "💬 Community" },
  { to: "/buy", label: "🧰 Tools" },
  { to: "/about", label: "ℹ️ About" },
];

export function HamburgerMenu() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const currentPath = location.pathname;

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClick);
    }
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close on navigation
  useEffect(() => {
    setOpen(false);
  }, [currentPath]);

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="p-1.5 rounded-md text-[#00ff41] hover:bg-[rgba(0,255,65,0.1)] transition-colors duration-100 border-2 border-[rgba(0,255,65,0.25)]"
        style={{
          boxShadow: "3px 3px 0 rgba(0,255,65,0.2)",
        }}
        aria-label="Toggle menu"
      >
        {open ? <HiMiniXMark size={18} /> : <HiMiniBars3 size={18} />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -10 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="absolute top-full right-0 mt-2 z-50 w-64 retro-card p-3"
            style={{
              border: "3px solid rgba(0,255,65,0.3)",
              boxShadow: "0 0 20px rgba(0,255,65,0.2), 6px 6px 0 rgba(0,255,65,0.15)",
            }}
          >
            {/* CRT scanline effect */}
            <div
              className="absolute inset-0 pointer-events-none rounded-lg overflow-hidden"
              style={{
                background: "repeating-linear-gradient(0deg, rgba(0,255,65,0.02) 0px, rgba(0,255,65,0.02) 1px, transparent 1px, transparent 3px)",
              }}
            />
            <div className="relative z-[2] space-y-1">
              <p
                className="text-[#00ff41] text-center mb-2 pixel-shadow-sm"
                style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.45rem" }}
              >
                📋 NAVIGATION
              </p>
              {navLinks.map((link, i) => {
                const isActive = currentPath === link.to || (link.to === "/" && currentPath === "/");
                return (
                  <motion.div
                    key={link.to}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                  >
                    <Link
                      to={link.to}
                      className={`block px-3 py-2.5 rounded-md text-[0.45rem] font-bold transition-all duration-100 ${
                        isActive
                          ? "bg-[rgba(0,255,65,0.12)] text-[#00ff41] border-2 border-[rgba(0,255,65,0.3)]"
                          : "text-[#e0ffe0] hover:bg-[rgba(0,255,65,0.06)] border-2 border-transparent"
                      }`}
                      style={{
                        fontFamily: '"Press Start 2P", monospace',
                        boxShadow: isActive ? "0 0 8px rgba(0,255,65,0.2)" : "none",
                      }}
                    >
                      {link.label}
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
