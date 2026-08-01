import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from "react";

/* ══════════════════════════════════════════
   Theme definitions — 6 color palettes
   ══════════════════════════════════════════ */

export interface ThemeColors {
  name: string;
  label: string;
  icon: string;
  bg: string;
  bgSecondary: string;
  primary: string;
  text: string;
  textMuted: string;
  border: string;
  cardBg: string;
  danger: string;
  success: string;
  warning: string;
}

export type ThemeName = "matrix" | "cyberpunk" | "ocean" | "sunset" | "mono" | "retroAmber";

export const themeDefs: Record<ThemeName, Omit<ThemeColors, "name">> = {
  matrix: {
    label: "Matrix Green",
    icon: "🟢",
    bg: "#050505",
    bgSecondary: "#0a0f0a",
    primary: "#00ff41",
    text: "#e0ffe0",
    textMuted: "#80b080",
    border: "rgba(0,255,65,0.2)",
    cardBg: "rgba(0,20,0,0.8)",
    danger: "#ff3333",
    success: "#00ff41",
    warning: "#ffaa00",
  },
  cyberpunk: {
    label: "Cyberpunk Neon",
    icon: "💜",
    bg: "#0a0010",
    bgSecondary: "#100020",
    primary: "#ff00ff",
    text: "#f0e0ff",
    textMuted: "#a080c0",
    border: "rgba(255,0,255,0.2)",
    cardBg: "rgba(20,0,40,0.8)",
    danger: "#ff0044",
    success: "#00ff88",
    warning: "#ffaa00",
  },
  ocean: {
    label: "Ocean Blue",
    icon: "🔵",
    bg: "#000a14",
    bgSecondary: "#001020",
    primary: "#00aaff",
    text: "#d0e8ff",
    textMuted: "#6090b0",
    border: "rgba(0,170,255,0.2)",
    cardBg: "rgba(0,10,30,0.8)",
    danger: "#ff4444",
    success: "#00cc66",
    warning: "#ffaa00",
  },
  sunset: {
    label: "Sunset Orange",
    icon: "🟠",
    bg: "#0a0505",
    bgSecondary: "#150a05",
    primary: "#ff6600",
    text: "#ffe8d0",
    textMuted: "#b08060",
    border: "rgba(255,102,0,0.2)",
    cardBg: "rgba(20,8,0,0.8)",
    danger: "#ff2222",
    success: "#44cc44",
    warning: "#ffcc00",
  },
  mono: {
    label: "Monochrome",
    icon: "⚪",
    bg: "#0a0a0a",
    bgSecondary: "#151515",
    primary: "#ffffff",
    text: "#d0d0d0",
    textMuted: "#808080",
    border: "rgba(255,255,255,0.15)",
    cardBg: "rgba(20,20,20,0.8)",
    danger: "#ff4444",
    success: "#66ff66",
    warning: "#ffcc00",
  },
  retroAmber: {
    label: "Retro Amber",
    icon: "🟡",
    bg: "#080804",
    bgSecondary: "#101008",
    primary: "#ffb000",
    text: "#ffe8b0",
    textMuted: "#b09050",
    border: "rgba(255,176,0,0.2)",
    cardBg: "rgba(20,16,0,0.8)",
    danger: "#ff3333",
    success: "#88cc00",
    warning: "#ff8800",
  },
};

const STORAGE_KEY = "ignoshashi_theme";
const MODE_KEY = "ignoshashi_mode";
const DEFAULT_THEME: ThemeName = "matrix";

function getInitialTheme(): ThemeName {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && stored in themeDefs) return stored as ThemeName;
  } catch {
    // localStorage unavailable
  }
  return DEFAULT_THEME;
}

function getInitialMode(): "dark" | "light" {
  if (typeof window === "undefined") return "dark";
  try {
    const stored = localStorage.getItem(MODE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch { /* ignore */ }
  return "dark";
}

export const LIGHT_OVERRIDES = {
  bg: "#f0f5f0",
  bgSecondary: "#e0e8e0",
  text: "#1a2a1a",
  textMuted: "#507050",
  cardBg: "rgba(255,255,255,0.9)",
  border: "rgba(0,100,0,0.15)",
} as const;

function getThemeColors(name: ThemeName, mode: "dark" | "light" = "dark"): ThemeColors {
  const base = { name, ...themeDefs[name] };
  if (mode === "light") {
    return {
      ...base,
      bg: LIGHT_OVERRIDES.bg,
      bgSecondary: LIGHT_OVERRIDES.bgSecondary,
      text: LIGHT_OVERRIDES.text,
      textMuted: LIGHT_OVERRIDES.textMuted,
      cardBg: LIGHT_OVERRIDES.cardBg,
      border: LIGHT_OVERRIDES.border,
      primary: base.primary, // Keep accent but darken slightly
    };
  }
  return base;
}

export type ModeType = "dark" | "light";

interface ThemeContextValue {
  theme: ThemeColors;
  themeName: ThemeName;
  setTheme: (name: ThemeName) => void;
  themes: ThemeColors[];
  mode: ModeType;
  toggleMode: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeName, setThemeName] = useState<ThemeName>(getInitialTheme);
  const [mode, setMode] = useState<ModeType>(getInitialMode);
  
  const theme = useMemo(() => getThemeColors(themeName, mode), [themeName, mode]);
  const themes: ThemeColors[] = useMemo(() => 
    Object.keys(themeDefs).map((key) => getThemeColors(key as ThemeName, mode)),
    [mode]
  );

  const setTheme = useCallback((name: ThemeName) => {
    setThemeName(name);
    try {
      localStorage.setItem(STORAGE_KEY, name);
    } catch {
      // ignore
    }
  }, []);

  const toggleMode = useCallback(() => {
    setMode((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(MODE_KEY, next);
      } catch { /* ignore */ }
      return next;
    });
  }, []);

  // Sync data-theme attribute on <html>
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", themeName);
    document.documentElement.setAttribute("data-mode", mode);
  }, [themeName, mode]);

  // Listen for cross-tab storage changes
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue && e.newValue in themeDefs) {
        setThemeName(e.newValue as ThemeName);
      }
      if (e.key === MODE_KEY && (e.newValue === "light" || e.newValue === "dark")) {
        setMode(e.newValue);
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, themeName, setTheme, themes, mode, toggleMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}
