import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";

interface CommandItem {
  id: string;
  label: string;
  icon: string;
  action: () => void;
}

function getSoundPref(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("ignoshashi_sound") !== "off";
}

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const allCommands: CommandItem[] = [
    { id: "home", label: "Go to Home", icon: "🏠", action: () => navigate({ to: "/" }) },
    { id: "create", label: "Go to Create", icon: "🪙", action: () => navigate({ to: "/create" }) },
    { id: "trends", label: "Go to Trends", icon: "📈", action: () => navigate({ to: "/trends" }) },
    { id: "analytics", label: "Go to Analytics", icon: "📊", action: () => navigate({ to: "/analytics" }) },
    { id: "community", label: "Go to Community", icon: "💬", action: () => navigate({ to: "/community" }) },
    { id: "tools", label: "Go to Tools", icon: "🛠️", action: () => navigate({ to: "/buy" }) },
    { id: "about", label: "Go to About", icon: "ℹ️", action: () => navigate({ to: "/about" }) },
    { id: "feed", label: "Go to Feed", icon: "📡", action: () => navigate({ to: "/feed" }) },
    { id: "terminal", label: "Go to Terminal", icon: "🖥️", action: () => navigate({ to: "/terminal" }) },
    { id: "launch", label: "Launch a Coin", icon: "🚀", action: () => navigate({ to: "/create" }) },
    { id: "sound", label: "Toggle Sound", icon: "🔊", action: () => {
      const current = getSoundPref();
      const next = !current;
      localStorage.setItem("ignoshashi_sound", next ? "on" : "off");
      window.dispatchEvent(new Event("ignoshashi_sound_change"));
      setIsOpen(false);
    }},
  ];

  const filtered = search.trim()
    ? allCommands.filter((c) => c.label.toLowerCase().includes(search.toLowerCase()))
    : allCommands;

  // Global keyboard listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // Reset when opening
  useEffect(() => {
    if (isOpen) {
      setSearch("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Close on route change
  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filtered[selectedIndex]) {
          filtered[selectedIndex].action();
          setIsOpen(false);
        }
      } else if (e.key === "Escape") {
        setIsOpen(false);
      }
    },
    [filtered, selectedIndex]
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh]"
          style={{ background: "rgba(0,0,0,0.7)" }}
          onClick={() => setIsOpen(false)}
        >
          <motion.div
            initial={{ scale: 0.95, y: -20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: -20 }}
            transition={{ duration: 0.2, ease: [0.68, -0.55, 0.265, 1.55] }}
            className="retro-card p-0 w-full max-w-md mx-4 overflow-hidden"
            style={{
              borderColor: "rgba(0,255,65,0.4)",
              boxShadow: "0 0 40px rgba(0,255,65,0.2), 0 4px 30px rgba(0,0,0,0.7)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search input */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[rgba(0,255,65,0.15)]">
              <span className="text-[#00ff41] text-lg">⌘</span>
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setSelectedIndex(0);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Type a command..."
                className="flex-1 bg-transparent text-[#e0ffe0] placeholder-[#b0d0b0]/50 outline-none"
                style={{ fontFamily: '"VT323", monospace', fontSize: "1.15rem" }}
              />
              <span
                className="text-[#b0d0b0] text-xs"
                style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.35rem" }}
              >
                ESC
              </span>
            </div>

            {/* Command list */}
            <div className="max-h-64 overflow-y-auto custom-scrollbar p-2">
              {filtered.length === 0 ? (
                <p
                  className="text-center py-6 text-[#b0d0b0]"
                  style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
                >
                  No commands found
                </p>
              ) : (
                filtered.map((cmd, i) => (
                  <button
                    key={cmd.id}
                    onClick={() => {
                      cmd.action();
                      setIsOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2.5 rounded-md flex items-center gap-3 transition-all duration-75 ${
                      i === selectedIndex
                        ? "bg-[rgba(0,255,65,0.1)] border border-[rgba(0,255,65,0.3)]"
                        : "border border-transparent hover:bg-[rgba(0,255,65,0.03)]"
                    }`}
                    onMouseEnter={() => setSelectedIndex(i)}
                  >
                    <span className="text-lg shrink-0">{cmd.icon}</span>
                    <span
                      className="flex-1 text-[#e0ffe0]"
                      style={{ fontFamily: '"VT323", monospace', fontSize: "1.1rem" }}
                    >
                      {cmd.label}
                    </span>
                    {i === selectedIndex && (
                      <span className="text-[#00ff41] text-sm">↵</span>
                    )}
                  </button>
                ))
              )}
            </div>

            {/* Footer hint */}
            <div
              className="px-4 py-2 border-t border-[rgba(0,255,65,0.1)] text-[#b0d0b0]"
              style={{ fontFamily: '"VT323", monospace', fontSize: "0.85rem" }}
            >
              ↑↓ Navigate · ↵ Select · Esc Close · Ctrl+K Toggle
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
