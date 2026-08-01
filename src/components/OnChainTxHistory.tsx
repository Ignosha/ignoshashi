import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useTheme } from "~/context/ThemeContext";
import { getTrades, getTokens, type TradeData } from "~/services/tracker";

interface OnChainTxHistoryProps {
  tokenId: string;
}

interface TxDisplay {
  type: "BUY" | "SELL";
  wallet: string;
  amount: number;
  price: number;
  time: number;
  txHash: string;
  source: "live" | "local";
}

export function OnChainTxHistory({ tokenId }: OnChainTxHistoryProps) {
  const { theme } = useTheme();
  const [txs, setTxs] = useState<TxDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchOnChainTxs = async () => {
    const token = getTokens().find((t) => t.id === tokenId);
    if (!token) {
      // Fallback to localStorage
      loadLocalTrades();
      return;
    }

    const tokenAddress = token.tokenAddress;
    if (!tokenAddress) {
      loadLocalTrades();
      return;
    }

    try {
      let onChainTxs: TxDisplay[] = [];

      if (token.blockchain === "solana") {
        // Try Solscan public API
        const res = await fetch(
          `https://public-api.solscan.io/account/transactions?account=${tokenAddress}&limit=20`
        );
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            onChainTxs = data.slice(0, 20).map((tx: any) => ({
              type: tx.type === "sell" ? "SELL" : "BUY",
              wallet: tx.signer || tx.owner || "Unknown",
              amount: parseFloat(tx.amount || "0"),
              price: parseFloat(tx.price || "0"),
              time: (tx.blockTime || 0) * 1000,
              txHash: tx.txHash || tx.signature || "",
              source: "live" as const,
            }));
          }
        }
      } else {
        // Try Etherscan API (free tier)
        const res = await fetch(
          `https://api.etherscan.io/api?module=account&action=tokentx&contractaddress=${tokenAddress}&sort=desc&offset=20`
        );
        if (res.ok) {
          const data = await res.json();
          if (data.status === "1" && Array.isArray(data.result)) {
            onChainTxs = data.result.slice(0, 20).map((tx: any) => ({
              type: tx.from.toLowerCase() === tokenAddress.toLowerCase() ? "SELL" : "BUY",
              wallet: tx.from,
              amount: parseFloat(tx.value || "0") / 1e18,
              price: parseFloat(tx.tokenPrice || "0"),
              time: parseInt(tx.timeStamp || "0") * 1000,
              txHash: tx.hash,
              source: "live" as const,
            }));
          }
        }
      }

      if (onChainTxs.length > 0) {
        setTxs(onChainTxs);
        setIsLive(true);
        setLoading(false);
        return;
      }
    } catch {
      // API failed, fall back to localStorage
    }

    loadLocalTrades();
  };

  const loadLocalTrades = () => {
    const trades = getTrades()
      .filter((t) => t.tokenId === tokenId)
      .slice(0, 20)
      .map((t) => ({
        type: t.type,
        wallet: t.wallet,
        amount: t.amount,
        price: t.price,
        time: t.timestamp,
        txHash: t.txHash,
        source: "local" as const,
      }));

    setTxs(trades);
    setIsLive(false);
    setLoading(false);
  };

  useEffect(() => {
    setLoading(true);
    fetchOnChainTxs();
    intervalRef.current = setInterval(fetchOnChainTxs, 30000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenId]);

  const getRelativeTime = (ts: number): string => {
    const diff = Date.now() - ts;
    const s = Math.floor(diff / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
  };

  const getExplorerLink = (txHash: string): string => {
    if (txHash.startsWith("pending-") || txHash.startsWith("airdrop-")) return "";
    // Determine if Solana or Ethereum by length/format
    if (txHash.length > 80) return `https://solscan.io/tx/${txHash}`;
    return `https://etherscan.io/tx/${txHash}`;
  };

  if (loading) {
    return (
      <div className="retro-card p-4 mb-3">
        <div className="flex items-center gap-2 mb-3">
          <h3
            className="text-[0.45rem] font-bold text-[#00ff41]"
            style={{ fontFamily: '"Press Start 2P", monospace' }}
          >
            📜 TX HISTORY
          </h3>
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-8 rounded retro-blink"
              style={{
                background: theme.bgSecondary,
                border: `1px solid ${theme.border}`,
                opacity: 0.15 * i,
                width: `${100 - (i - 1) * 15}%`,
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (txs.length === 0) {
    return (
      <div className="retro-card p-4 mb-3">
        <div className="flex items-center gap-2 mb-3">
          <h3
            className="text-[0.45rem] font-bold text-[#00ff41]"
            style={{ fontFamily: '"Press Start 2P", monospace' }}
          >
            📜 TX HISTORY
          </h3>
        </div>
        <p
          className="text-center py-4 text-sm"
          style={{ fontFamily: '"VT323", monospace', fontSize: "1rem", color: theme.textMuted }}
        >
          No transactions yet. Be the first to trade!
        </p>
      </div>
    );
  }

  return (
    <div className="retro-card p-4 mb-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3
            className="text-[0.45rem] font-bold text-[#00ff41]"
            style={{ fontFamily: '"Press Start 2P", monospace' }}
          >
            📜 TX HISTORY
          </h3>
          {isLive && (
            <motion.span
              className="text-[0.3rem] px-1.5 py-0.5 rounded"
              style={{
                fontFamily: '"Press Start 2P", monospace',
                background: "rgba(0,255,65,0.1)",
                color: "#00ff41",
                border: "1px solid rgba(0,255,65,0.3)",
              }}
              animate={{ opacity: [1, 0.6, 1] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
            >
              📡 LIVE
            </motion.span>
          )}
        </div>
        <span
          className="text-[0.3rem]"
          style={{ fontFamily: '"VT323", monospace', color: theme.textMuted }}
        >
          Auto-refresh 30s
        </span>
      </div>

      {/* Table header */}
      <div
        className="grid grid-cols-6 gap-1 py-1.5 px-2 rounded-t text-[0.35rem] font-bold"
        style={{
          fontFamily: '"Press Start 2P", monospace',
          background: "rgba(0,255,65,0.05)",
          borderBottom: `1px solid ${theme.border}`,
          color: "#00ff41",
        }}
      >
        <span>TYPE</span>
        <span>WALLET</span>
        <span className="text-right">AMOUNT</span>
        <span className="text-right">PRICE</span>
        <span className="text-right">TIME</span>
        <span className="text-center">TX</span>
      </div>

      {/* Table rows */}
      <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
        {txs.map((tx, i) => {
          const explorerLink = getExplorerLink(tx.txHash);
          return (
            <motion.div
              key={tx.txHash + i}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="grid grid-cols-6 gap-1 py-1.5 px-2 text-xs"
              style={{
                fontFamily: '"VT323", monospace',
                fontSize: "0.85rem",
                background: i % 2 === 0 ? "rgba(0,255,65,0.01)" : "rgba(0,255,65,0.03)",
                borderBottom: `1px solid ${theme.border}`,
                color: theme.text,
              }}
            >
              <span
                className="font-bold"
                style={{ color: tx.type === "BUY" ? "#00ff41" : "#ff4444" }}
              >
                {tx.type === "BUY" ? "🟢 BUY" : "🔴 SELL"}
              </span>
              <span className="truncate" style={{ color: theme.textMuted }}>
                {tx.wallet.slice(0, 4)}...{tx.wallet.slice(-4)}
              </span>
              <span className="text-right">{tx.amount.toLocaleString()}</span>
              <span className="text-right">
                ${tx.price < 0.001 ? tx.price.toFixed(6) : tx.price.toFixed(4)}
              </span>
              <span className="text-right" style={{ color: theme.textMuted }}>
                {getRelativeTime(tx.time)}
              </span>
              <span className="text-center">
                {explorerLink ? (
                  <a
                    href={explorerLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#00ff41] hover:underline"
                    title="View on explorer"
                  >
                    →
                  </a>
                ) : (
                  <span style={{ color: theme.textMuted }}>—</span>
                )}
              </span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
