import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from "react";

/* ══════════════════════════════════════════
   CoinRain Context — trigger jackpot rain
   ══════════════════════════════════════════ */

interface CoinRainContextValue {
  triggerRain: (options?: { count?: number; duration?: number }) => void;
  active: boolean;
  count: number;
  duration: number;
  /** Incremented each trigger to force remount */
  rainKey: number;
  /** Graduation-specific: gold coins, screen flash */
  triggerGraduation: () => void;
  isGraduation: boolean;
}

const CoinRainContext = createContext<CoinRainContextValue>({
  triggerRain: () => {},
  active: false,
  count: 20,
  duration: 3000,
  rainKey: 0,
  triggerGraduation: () => {},
  isGraduation: false,
});

export function CoinRainProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false);
  const [count, setCount] = useState(20);
  const [duration, setDuration] = useState(3000);
  const [rainKey, setRainKey] = useState(0);
  const [isGraduation, setIsGraduation] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(0);

  const triggerRain = useCallback(
    (options?: { count?: number; duration?: number }) => {
      const c = options?.count ?? 20;
      const d = options?.duration ?? 3000;
      setIsGraduation(false);
      setCount(c);
      setDuration(d);
      setRainKey((k) => k + 1);
      setActive(true);

      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setActive(false);
      }, d + 500);
    },
    [],
  );

  const triggerGraduation = useCallback(() => {
    setIsGraduation(true);
    setCount(120);
    setDuration(4000);
    setRainKey((k) => k + 1);
    setActive(true);

    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setActive(false);
      setIsGraduation(false);
    }, 4500);
  }, []);

  return (
    <CoinRainContext.Provider value={{ triggerRain, active, count, duration, rainKey, triggerGraduation, isGraduation }}>
      {children}
    </CoinRainContext.Provider>
  );
}

export function useCoinRain(): CoinRainContextValue {
  return useContext(CoinRainContext);
}
