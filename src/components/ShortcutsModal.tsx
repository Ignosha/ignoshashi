import { useEffect } from "react";
import { motion } from "framer-motion";
import { useTheme } from "~/context/ThemeContext";

interface ShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

const shortcuts = [
  { keys: "Ctrl + K", desc: "Command Palette" },
  { keys: "?", desc: "Keyboard Shortcuts" },
  { keys: "Esc", desc: "Close Modal / Overlay" },
  { keys: "Ctrl + /", desc: "Toggle Dark / Light Mode" },
  { keys: "1", desc: "Home" },
  { keys: "2", desc: "Portfolio" },
  { keys: "3", desc: "Feed" },
  { keys: "4", desc: "Terminal" },
  { keys: "5", desc: "Create" },
  { keys: "6", desc: "Trends" },
  { keys: "7", desc: "Leaderboard" },
  { keys: "8", desc: "Analytics" },
  { keys: "9", desc: "Community" },
];

export function ShortcutsModal({ open, onClose }: ShortcutsModalProps) {
  const { theme } = useTheme();

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: -10 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="relative z-10 w-full max-w-md overflow-hidden"
        style={{
          background: theme.cardBg,
          border: `2px solid ${theme.border}`,
          borderRadius: "12px",
          boxShadow: `0 0 30px ${theme.primary}1A, 0 8px 32px rgba(0,0,0,0.6)`,
          backdropFilter: "blur(16px)",
        }}
      >
        {/* Header */}
        <div
          className="px-5 py-4 flex items-center justify-between"
          style={{ borderBottom: `1px solid ${theme.border}` }}
        >
          <h3
            className="font-bold"
            style={{
              fontFamily: '"Press Start 2P", monospace',
              fontSize: "0.5rem",
              color: theme.primary,
            }}
          >
            ⌨️ KEYBOARD SHORTCUTS
          </h3>
          <button
            onClick={onClose}
            className="text-lg leading-none"
            style={{ color: theme.textMuted }}
          >
            ✕
          </button>
        </div>
        {/* Shortcuts Table */}
        <div className="px-5 py-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
          <table className="w-full">
            <tbody>
              {shortcuts.map((s, i) => (
                <tr
                  key={s.keys}
                  style={{
                    borderBottom:
                      i < shortcuts.length - 1
                        ? `1px solid ${theme.border}`
                        : "none",
                  }}
                >
                  <td className="py-2.5 pr-4">
                    <kbd
                      className="px-2 py-1 rounded font-bold"
                      style={{
                        fontFamily: '"Courier New", monospace',
                        fontSize: "0.8rem",
                        background: `${theme.primary}12`,
                        border: `1px solid ${theme.border}`,
                        color: theme.primary,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {s.keys}
                    </kbd>
                  </td>
                  <td
                    className="py-2.5 text-right"
                    style={{
                      fontFamily: '"VT323", monospace',
                      fontSize: "1.15rem",
                      color: theme.text,
                    }}
                  >
                    {s.desc}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Footer hint */}
        <div
          className="px-5 py-3 text-center"
          style={{
            borderTop: `1px solid ${theme.border}`,
            fontFamily: '"VT323", monospace',
            fontSize: "0.9rem",
            color: theme.textMuted,
          }}
        >
          Press <span style={{ color: theme.primary }}>?</span> to open this anytime
        </div>
      </motion.div>
    </div>
  );
}
