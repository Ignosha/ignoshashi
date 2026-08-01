import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from "react";
import type { AchievementDef } from "~/services/achievements";

// ─── Context Types ────────────────────────────

interface AchievementToastItem {
  id: string;
  achievement: AchievementDef;
  createdAt: number;
}

interface AchievementContextValue {
  toasts: AchievementToastItem[];
  /** Trigger a toast for a newly unlocked achievement */
  triggerToast: (achievement: AchievementDef) => void;
  /** Dismiss a specific toast by id */
  dismissToast: (id: string) => void;
}

const AchievementContext = createContext<AchievementContextValue>({
  toasts: [],
  triggerToast: () => {},
  dismissToast: () => {},
});

// ─── Provider ──────────────────────────────────

export function AchievementProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<AchievementToastItem[]>([]);
  const idCounter = useRef(0);

  const triggerToast = useCallback((achievement: AchievementDef) => {
    const id = `achieve-${Date.now()}-${++idCounter.current}`;
    const item: AchievementToastItem = {
      id,
      achievement,
      createdAt: Date.now(),
    };
    setToasts((prev) => [...prev, item]);

    // Auto-dismiss after 4 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <AchievementContext.Provider value={{ toasts, triggerToast, dismissToast }}>
      {children}
    </AchievementContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────

export function useAchievements() {
  return useContext(AchievementContext);
}
