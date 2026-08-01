import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Card } from "~/components/UI";
import { getTokens, getBondingCurveState, type TokenData } from "~/services/tracker";
import { useTheme } from "~/context/ThemeContext";

interface CompareRow {
  label: string;
  valueA: string;
  valueB: string;
  better: "A" | "B" | "tie" | "none";
  numericA: number;
  numericB: number;
}

export function TokenCompare() {
  const { theme } = useTheme();
  const [searchA, setSearchA] = useState("");
  const [searchB, setSearchB] = useState("");
  const [tokenA, setTokenA] = useState<TokenData | null>(null);
  const [tokenB, setTokenB] = useState<TokenData | null>(null);
  const [showResultsA, setShowResultsA] = useState(false);
  const [showResultsB, setShowResultsB] = useState(false);

  const allTokens = useMemo(() => {
    if (typeof window === "undefined") return [];
    return getTokens();
  }, []);

  const resultsA = useMemo(() => {
    if (!searchA.trim()) return [];
    const q = searchA.toLowerCase();
    return allTokens.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.ticker.toLowerCase().includes(q) ||
        (t.tokenAddress && t.tokenAddress.toLowerCase().includes(q))
    ).slice(0, 5);
  }, [searchA, allTokens]);

  const resultsB = useMemo(() => {
    if (!searchB.trim()) return [];
    const q = searchB.toLowerCase();
    return allTokens.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.ticker.toLowerCase().includes(q) ||
        (t.tokenAddress && t.tokenAddress.toLowerCase().includes(q))
    ).slice(0, 5);
  }, [searchB, allTokens]);

  const compareRows = useMemo((): CompareRow[] => {
    if (!tokenA || !tokenB) return [];

    const curveA = getBondingCurveState(tokenA.id);
    const curveB = getBondingCurveState(tokenB.id);

    const rows: CompareRow[] = [
      {
        label: "Price",
        valueA: `$${tokenA.price < 0.001 ? tokenA.price.toFixed(8) : tokenA.price.toFixed(6)}`,
        valueB: `$${tokenB.price < 0.001 ? tokenB.price.toFixed(8) : tokenB.price.toFixed(6)}`,
        numericA: tokenA.price,
        numericB: tokenB.price,
        better: "none", // Price comparison is not straightforward
      },
    ];

    // 24h change
    const histA = tokenA.priceHistory;
    const histB = tokenB.priceHistory;
    const lastA = histA[histA.length - 1] || tokenA.price;
    const prevA = histA[histA.length - 2] || lastA;
    const changeA = prevA > 0 ? ((lastA - prevA) / prevA) * 100 : 0;
    const lastB = histB[histB.length - 1] || tokenB.price;
    const prevB = histB[histB.length - 2] || lastB;
    const changeB = prevB > 0 ? ((lastB - prevB) / prevB) * 100 : 0;

    rows.push({
      label: "24h Change",
      valueA: `${changeA >= 0 ? "+" : ""}${changeA.toFixed(2)}%`,
      valueB: `${changeB >= 0 ? "+" : ""}${changeB.toFixed(2)}%`,
      numericA: changeA,
      numericB: changeB,
      better: changeA > changeB ? "A" : changeB > changeA ? "B" : "tie",
    });

    rows.push({
      label: "Volume",
      valueA: `$${(tokenA.volume24h || 0).toLocaleString()}`,
      valueB: `$${(tokenB.volume24h || 0).toLocaleString()}`,
      numericA: tokenA.volume24h,
      numericB: tokenB.volume24h,
      better: tokenA.volume24h > tokenB.volume24h ? "A" : tokenB.volume24h > tokenA.volume24h ? "B" : "tie",
    });

    rows.push({
      label: "Market Cap",
      valueA: `$${tokenA.marketCap.toLocaleString()}`,
      valueB: `$${tokenB.marketCap.toLocaleString()}`,
      numericA: tokenA.marketCap,
      numericB: tokenB.marketCap,
      better: tokenA.marketCap > tokenB.marketCap ? "A" : tokenB.marketCap > tokenA.marketCap ? "B" : "tie",
    });

    rows.push({
      label: "Liquidity",
      valueA: curveA ? `$${(curveA.raisedSol || 0).toFixed(4)}` : "—",
      valueB: curveB ? `$${(curveB.raisedSol || 0).toFixed(4)}` : "—",
      numericA: curveA?.raisedSol || 0,
      numericB: curveB?.raisedSol || 0,
      better: (curveA?.raisedSol || 0) > (curveB?.raisedSol || 0) ? "A" : (curveB?.raisedSol || 0) > (curveA?.raisedSol || 0) ? "B" : "tie",
    });

    rows.push({
      label: "Holders",
      valueA: curveA ? `${curveA.currentSupply.toLocaleString()}` : "—",
      valueB: curveB ? `${curveB.currentSupply.toLocaleString()}` : "—",
      numericA: curveA?.currentSupply || 0,
      numericB: curveB?.currentSupply || 0,
      better: "none",
    });

    rows.push({
      label: "Age",
      valueA: getTimeAgo(tokenA.createdAt),
      valueB: getTimeAgo(tokenB.createdAt),
      numericA: tokenA.createdAt,
      numericB: tokenB.createdAt,
      better: tokenA.createdAt > tokenB.createdAt ? "A" : tokenB.createdAt > tokenA.createdAt ? "B" : "tie",
    });

    const progressA = curveA ? Math.min((curveA.currentSupply / curveA.totalSupply) * 100, 100) : 0;
    const progressB = curveB ? Math.min((curveB.currentSupply / curveB.totalSupply) * 100, 100) : 0;
    rows.push({
      label: "Bonding Curve %",
      valueA: `${progressA.toFixed(1)}%`,
      valueB: `${progressB.toFixed(1)}%`,
      numericA: progressA,
      numericB: progressB,
      better: progressA > progressB ? "A" : progressB > progressA ? "B" : "tie",
    });

    rows.push({
      label: "Graduated",
      valueA: curveA?.graduated ? "✅ Yes" : "❌ No",
      valueB: curveB?.graduated ? "✅ Yes" : "❌ No",
      numericA: curveA?.graduated ? 1 : 0,
      numericB: curveB?.graduated ? 1 : 0,
      better: (curveA?.graduated ? 1 : 0) > (curveB?.graduated ? 1 : 0) ? "A" : (curveB?.graduated ? 1 : 0) > (curveA?.graduated ? 1 : 0) ? "B" : "tie",
    });

    rows.push({
      label: "Creator Earnings",
      valueA: curveA ? `${(curveA.creatorEarnings || 0).toFixed(4)} SOL` : "—",
      valueB: curveB ? `${(curveB.creatorEarnings || 0).toFixed(4)} SOL` : "—",
      numericA: curveA?.creatorEarnings || 0,
      numericB: curveB?.creatorEarnings || 0,
      better: (curveA?.creatorEarnings || 0) > (curveB?.creatorEarnings || 0) ? "A" : (curveB?.creatorEarnings || 0) > (curveA?.creatorEarnings || 0) ? "B" : "tie",
    });

    return rows;
  }, [tokenA, tokenB]);

  const bothSelected = tokenA && tokenB;

  return (
    <Card className="border-[rgba(0,255,65,0.2)] h-full flex flex-col">
      <div className="text-center mb-3">
        <span className="text-2xl">⚖️</span>
        <h3
          className="text-[0.5rem] font-bold text-[#00ff41]"
          style={{ fontFamily: '"Press Start 2P", monospace' }}
        >
          TOKEN COMPARE
        </h3>
      </div>

      {/* Two search inputs */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="relative">
          <label
            className="text-[0.3rem] text-[#b0d0b0] block mb-0.5"
            style={{ fontFamily: '"Press Start 2P", monospace' }}
          >
            TOKEN A
          </label>
          <input
            type="text"
            value={searchA}
            onChange={(e) => { setSearchA(e.target.value); setShowResultsA(true); }}
            onFocus={() => setShowResultsA(true)}
            onBlur={() => setTimeout(() => setShowResultsA(false), 200)}
            placeholder="Search..."
            className="retro-input text-sm w-full"
            style={{ fontFamily: '"VT323", monospace', fontSize: "0.85rem", padding: "0.3rem 0.5rem" }}
          />
          {showResultsA && resultsA.length > 0 && (
            <div
              className="absolute top-full left-0 right-0 z-10 retro-card p-1 max-h-[120px] overflow-y-auto custom-scrollbar"
              style={{ background: theme.bg }}
            >
              {resultsA.map((t) => (
                <button
                  key={t.id}
                  onClick={() => { setTokenA(t); setSearchA(t.ticker); setShowResultsA(false); }}
                  className="w-full text-left px-2 py-1 rounded text-xs hover:bg-[rgba(0,255,65,0.05)]"
                  style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem", color: theme.text }}
                >
                  ${t.ticker} — {t.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="relative">
          <label
            className="text-[0.3rem] text-[#b0d0b0] block mb-0.5"
            style={{ fontFamily: '"Press Start 2P", monospace' }}
          >
            TOKEN B
          </label>
          <input
            type="text"
            value={searchB}
            onChange={(e) => { setSearchB(e.target.value); setShowResultsB(true); }}
            onFocus={() => setShowResultsB(true)}
            onBlur={() => setTimeout(() => setShowResultsB(false), 200)}
            placeholder="Search..."
            className="retro-input text-sm w-full"
            style={{ fontFamily: '"VT323", monospace', fontSize: "0.85rem", padding: "0.3rem 0.5rem" }}
          />
          {showResultsB && resultsB.length > 0 && (
            <div
              className="absolute top-full left-0 right-0 z-10 retro-card p-1 max-h-[120px] overflow-y-auto custom-scrollbar"
              style={{ background: theme.bg }}
            >
              {resultsB.map((t) => (
                <button
                  key={t.id}
                  onClick={() => { setTokenB(t); setSearchB(t.ticker); setShowResultsB(false); }}
                  className="w-full text-left px-2 py-1 rounded text-xs hover:bg-[rgba(0,255,65,0.05)]"
                  style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem", color: theme.text }}
                >
                  ${t.ticker} — {t.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Comparison table */}
      {bothSelected && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-1 max-h-[260px] overflow-y-auto custom-scrollbar"
        >
          {/* Headers */}
          <div
            className="grid grid-cols-3 gap-1 py-1.5 px-2 rounded-t text-[0.35rem] font-bold"
            style={{
              fontFamily: '"Press Start 2P", monospace',
              background: "rgba(0,255,65,0.05)",
              borderBottom: `1px solid ${theme.border}`,
              color: "#00ff41",
            }}
          >
            <span className="col-span-1">METRIC</span>
            <span className="text-center">A: ${tokenA.ticker}</span>
            <span className="text-center">B: ${tokenB.ticker}</span>
          </div>

          {compareRows.map((row, i) => (
            <div
              key={row.label}
              className="grid grid-cols-3 gap-1 py-1 px-2 text-xs"
              style={{
                fontFamily: '"VT323", monospace',
                fontSize: "0.85rem",
                background: i % 2 === 0 ? "rgba(0,255,65,0.01)" : "rgba(0,255,65,0.03)",
                borderBottom: `1px solid ${theme.border}`,
              }}
            >
              <span style={{ color: theme.textMuted }}>{row.label}</span>
              <span
                className="text-center font-bold"
                style={{
                  color: row.better === "A" ? "#00ff41" : theme.text,
                }}
              >
                {row.valueA}
              </span>
              <span
                className="text-center font-bold"
                style={{
                  color: row.better === "B" ? "#00ff41" : theme.text,
                }}
              >
                {row.valueB}
              </span>
            </div>
          ))}
        </motion.div>
      )}

      {!bothSelected && (
        <div className="flex-1 flex items-center justify-center">
          <p
            className="text-[#e0ffe0] text-center"
            style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
          >
            Select both tokens to compare.
          </p>
        </div>
      )}

      <div className="mt-auto pt-3 text-center">
        <span
          className="text-[0.35rem] text-[#e0ffe0] bg-[rgba(0,255,65,0.1)] px-2 py-0.5 rounded"
          style={{ fontFamily: '"Press Start 2P", monospace' }}
        >
          🟢 FREE
        </span>
      </div>
    </Card>
  );
}

function getTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}
