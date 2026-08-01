import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme, type ThemeName } from "~/context/ThemeContext";

const themeOrder: ThemeName[] = ["matrix", "cyberpunk", "ocean", "sunset", "mono", "retroAmber"];

export function ThemePicker() {
  const { theme, themeName, setTheme, themes, mode, toggleMode } = useTheme();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const currentThemeObj = themes.find((t) => t.name === themeName);

  return (
    <div ref={panelRef} className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setOpen(!open)}
        className="p-1.5 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:bg-[color-mix(in_srgb,var(--color-primary)_6%,transparent)] transition-colors duration-100"
        title="Change theme"
        aria-label="Change theme"
      >
        <span className="text-base">🎨</span>
      </button>

      {/* Dropdown panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -8 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="absolute top-full right-0 mt-2 p-3 z-50 min-w-[220px]"
            style={{
              background: theme.cardBg,
              border: `2px solid ${theme.border}`,
              borderRadius: "12px",
              boxShadow: `0 0 20px ${theme.border.replace("0.2)", "0.15)")}, 0 4px 20px rgba(0,0,0,0.5)`,
              backdropFilter: "blur(12px)",
            }}
          >
            {/* Dark/Light Toggle */}
            <div className="flex items-center justify-between mb-3 pb-2" style={{ borderBottom: `1px solid ${theme.border}` }}>
              <span
                style={{
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: "0.4rem",
                  color: theme.textMuted,
                }}
              >
                MODE
              </span>
              <button
                onClick={toggleMode}
                className="px-2 py-1 rounded text-sm transition-all duration-150"
                style={{
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: "0.35rem",
                  background: mode === "dark" ? `${theme.primary}15` : "rgba(255,200,0,0.15)",
                  border: `1px solid ${theme.border}`,
                  color: mode === "dark" ? theme.primary : "#ffb000",
                }}
                title={mode === "dark" ? "Switch to Light" : "Switch to Dark"}
              >
                {mode === "dark" ? "🌙 DARK" : "☀️ LIGHT"}
              </button>
            </div>
            
            <h4
              className="text-center mb-3 pb-2"
              style={{
                fontFamily: '"Press Start 2P", monospace',
                fontSize: "0.4rem",
                color: theme.textMuted,
                borderBottom: `1px solid ${theme.border}`,
              }}
            >
              SELECT PALETTE
            </h4>
            <div className="grid grid-cols-3 gap-2">
              {themeOrder.map((name) => {
                const t = themes.find((tt) => tt.name === name)!;
                const isActive = themeName === name;
                return (
                  <button
                    key={name}
                    onClick={() => {
                      setTheme(name);
                      setOpen(false);
                    }}
                    className="flex flex-col items-center gap-1 p-2 rounded-lg transition-all duration-150"
                    style={{
                      background: isActive
                        ? `${t.primary}18`
                        : "transparent",
                      border: isActive
                        ? `2px solid ${t.primary}`
                        : `2px solid transparent`,
                      boxShadow: isActive
                        ? `0 0 10px ${t.primary}33`
                        : "none",
                    }}
                    title={t.label}
                  >
                    {/* Color swatch — two stacked rectangles */}
                    <div
                      className="w-8 h-5 rounded overflow-hidden flex flex-col"
                      style={{ border: `1px solid ${t.border}` }}
                    >
                      <div style={{ flex: 1, background: t.primary }} />
                      <div style={{ flex: 1, background: t.bg }} />
                    </div>
                    <span
                      className="text-center leading-tight"
                      style={{
                        fontFamily: '"Press Start 2P", monospace',
                        fontSize: "0.3rem",
                        color: isActive ? t.primary : t.textMuted,
                      }}
                    >
                      {t.label.toUpperCase().replace(" ", "\n")}
                    </span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
