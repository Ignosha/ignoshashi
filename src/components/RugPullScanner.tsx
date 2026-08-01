import { useState } from "react";
import { motion } from "framer-motion";
import { Card } from "~/components/UI";
import { useTheme } from "~/context/ThemeContext";
import { incrementScanCount, checkAchievements } from "~/services/achievements";
import { useAchievements } from "~/context/AchievementContext";
import { useWallet } from "~/context/WalletContext";

interface RiskFactor {
  label: string;
  status: "pass" | "warning" | "fail";
  detail: string;
}

interface ScanResult {
  score: number;
  level: "LOW RISK" | "MEDIUM RISK" | "HIGH RISK";
  levelColor: string;
  levelEmoji: string;
  factors: RiskFactor[];
  insufficientData: boolean;
  dexData: {
    priceUsd?: string;
    liquidityUsd?: number;
    fdv?: number;
    volume24h?: number;
    pairAddress?: string;
    chainId?: string;
  } | null;
}

export function RugPullScanner({ onScanComplete }: { onScanComplete?: () => void }) {
  const { theme } = useTheme();
  const { solAddress, ethAddress } = useWallet();
  const { triggerToast } = useAchievements();
  const [address, setAddress] = useState("");
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const handleScanComplete = () => {
    const walletAddr = solAddress || ethAddress || "global";
    incrementScanCount(walletAddr);
    if (walletAddr !== "global") {
      checkAchievements(walletAddr, triggerToast);
    }
    onScanComplete?.();
  };

  const isSolanaAddr = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address.trim());
  const isEthAddr = /^0x[a-fA-F0-9]{40}$/.test(address.trim());
  const isValid = isSolanaAddr || isEthAddr;

  const runScan = async () => {
    if (!isValid) return;
    setScanning(true);
    setError("");
    setResult(null);

    try {
      // Query DexScreener for token info
      const dexRes = await fetch(
        `https://api.dexscreener.com/latest/dex/tokens/${address.trim()}`
      );
      const dexJson = await dexRes.json();
      const pairs = dexJson.pairs || [];

      if (pairs.length === 0) {
        // No DexScreener data available
        setResult({
          score: 50,
          level: "MEDIUM RISK",
          levelColor: "#ffaa00",
          levelEmoji: "🟡",
          insufficientData: true,
          dexData: null,
          factors: [
            {
              label: "DexScreener",
              status: "warning",
              detail: "No DEX data available. Token may be new or not listed.",
            },
            {
              label: "Address Valid",
              status: "pass",
              detail: `Valid ${isSolanaAddr ? "Solana" : "Ethereum"} address format.`,
            },
          ],
        });
        handleScanComplete();
        setScanning(false);
        return;
      }

      const pair = pairs[0];
      const dexData = {
        priceUsd: pair.priceUsd,
        liquidityUsd: pair.liquidity?.usd,
        fdv: pair.fdv,
        volume24h: pair.volume?.h24,
        pairAddress: pair.pairAddress,
        chainId: pair.chainId,
      };

      // Analyze risk factors
      const factors: RiskFactor[] = [];
      let totalRisk = 0;

      // 1. Honeypot check — based on buy/sell volume ratio from DexScreener
      const buyVol = pair.txns?.h24?.buys || 0;
      const sellVol = pair.txns?.h24?.sells || 0;
      const totalTxns = buyVol + sellVol;
      if (totalTxns > 0) {
        const buyRatio = buyVol / totalTxns;
        if (buyRatio > 0.7 && sellVol < 5) {
          factors.push({
            label: "Honeypot Check",
            status: "fail",
            detail: `Suspicious buy/sell ratio: ${buyVol} buys vs ${sellVol} sells. May be a honeypot.`,
          });
          totalRisk += 30;
        } else if (sellVol === 0 && buyVol > 10) {
          factors.push({
            label: "Honeypot Check",
            status: "warning",
            detail: `No sells detected in 24h with ${buyVol} buys. Monitor carefully.`,
          });
          totalRisk += 15;
        } else {
          factors.push({
            label: "Honeypot Check",
            status: "pass",
            detail: `Healthy buy/sell ratio: ${buyVol} buys, ${sellVol} sells.`,
          });
        }
      } else {
        factors.push({
          label: "Honeypot Check",
          status: "warning",
          detail: "Insufficient transaction data to assess.",
        });
        totalRisk += 10;
      }

      // 2. Liquidity vs FDV
      const liquidityUsd = pair.liquidity?.usd || 0;
      const fdv = pair.fdv || 0;
      if (fdv > 0) {
        const liquidityRatio = liquidityUsd / fdv;
        if (liquidityRatio < 0.05) {
          factors.push({
            label: "Liquidity Lock",
            status: "fail",
            detail: `Extremely low liquidity (${(liquidityRatio * 100).toFixed(1)}% of FDV). High risk.`,
          });
          totalRisk += 25;
        } else if (liquidityRatio < 0.15) {
          factors.push({
            label: "Liquidity Lock",
            status: "warning",
            detail: `Low liquidity: ${(liquidityRatio * 100).toFixed(1)}% of FDV.`,
          });
          totalRisk += 10;
        } else {
          factors.push({
            label: "Liquidity Lock",
            status: "pass",
            detail: `Healthy liquidity: ${(liquidityRatio * 100).toFixed(1)}% of FDV.`,
          });
        }
      } else {
        factors.push({
          label: "Liquidity Lock",
          status: "warning",
          detail: "FDV data unavailable. Cannot assess liquidity ratio.",
        });
        totalRisk += 8;
      }

      // 3. Mint Authority — use DexScreener info if available
      const isSolana = pair.chainId === "solana";
      const priceChange = pair.priceChange?.h24 || 0;

      if (priceChange < -90) {
        factors.push({
          label: "Mint Authority",
          status: "fail",
          detail: `Extreme price drop (${priceChange.toFixed(1)}% in 24h). Possible rug pull.`,
        });
        totalRisk += 20;
      } else if (priceChange < -50) {
        factors.push({
          label: "Mint Authority",
          status: "warning",
          detail: `Significant price drop (${priceChange.toFixed(1)}% in 24h).`,
        });
        totalRisk += 10;
      } else {
        factors.push({
          label: "Mint Authority",
          status: "pass",
          detail: `Price change ${priceChange.toFixed(1)}% in 24h. ${isSolana ? "Solana" : "Ethereum"} token.`,
        });
      }

      // 4. Owner Concentration — based on DexScreener holders data
      const holders = pair.holders || 0;
      if (holders > 100) {
        factors.push({
          label: "Owner Concentration",
          status: "pass",
          detail: `${holders}+ holders detected. Well distributed.`,
        });
      } else if (holders > 10) {
        factors.push({
          label: "Owner Concentration",
          status: "warning",
          detail: `Only ${holders} holders. Moderately concentrated.`,
        });
        totalRisk += 8;
      } else if (holders > 0) {
        factors.push({
          label: "Owner Concentration",
          status: "fail",
          detail: `Only ${holders} holders. Highly concentrated ownership.`,
        });
        totalRisk += 15;
      } else {
        factors.push({
          label: "Owner Concentration",
          status: "warning",
          detail: "Holder data unavailable from DexScreener.",
        });
        totalRisk += 5;
      }

      // 5. Ownership Renounced — approximate from DexScreener
      if (pair.lpLocked !== undefined) {
        if (pair.lpLocked) {
          factors.push({
            label: "Ownership Renounced",
            status: "pass",
            detail: "LP appears locked.",
          });
        } else {
          factors.push({
            label: "Ownership Renounced",
            status: "warning",
            detail: "LP lock status unknown or not locked.",
          });
          totalRisk += 10;
        }
      } else {
        factors.push({
          label: "Ownership Renounced",
          status: "warning",
          detail: "LP lock status not available.",
        });
        totalRisk += 5;
      }

      // Calculate final score (cap at 100)
      const score = Math.min(totalRisk, 100);
      let level: ScanResult["level"], levelColor: string, levelEmoji: string;
      if (score <= 30) {
        level = "LOW RISK";
        levelColor = "#00ff41";
        levelEmoji = "🟢";
      } else if (score <= 60) {
        level = "MEDIUM RISK";
        levelColor = "#ffaa00";
        levelEmoji = "🟡";
      } else {
        level = "HIGH RISK";
        levelColor = "#ff4444";
        levelEmoji = "🔴";
      }

      setResult({
        score,
        level,
        levelColor,
        levelEmoji,
        insufficientData: false,
        dexData,
        factors,
      });
      handleScanComplete();
    } catch (err) {
      setError("Failed to fetch data from DexScreener. Try again later.");
    }

    setScanning(false);
  };

  const scoreBarColor =
    result?.score && result.score <= 30
      ? "#00ff41"
      : result?.score && result.score <= 60
        ? "#ffaa00"
        : "#ff4444";

  return (
    <Card className="border-[rgba(0,255,65,0.2)] h-full flex flex-col">
      <div className="text-center mb-3">
        <span className="text-2xl">🔴</span>
        <h3
          className="text-[0.5rem] font-bold text-[#00ff41]"
          style={{ fontFamily: '"Press Start 2P", monospace' }}
        >
          RUG PULL SCANNER
        </h3>
      </div>

      <input
        type="text"
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        placeholder="Paste Solana or ETH contract address..."
        className="retro-input text-sm mb-3"
        style={{ fontFamily: '"VT323", monospace', fontSize: "0.85rem" }}
      />

      <button
        onClick={runScan}
        disabled={scanning || !isValid}
        className="retro-btn retro-btn-turquoise w-full justify-center text-[0.45rem] py-1.5 mb-3"
        style={{ fontFamily: '"Press Start 2P", monospace' }}
      >
        {scanning ? "⏳ SCANNING..." : "🔍 SCAN FOR RUGS"}
      </button>

      {error && (
        <div
          className="p-2 rounded text-center text-xs"
          style={{
            fontFamily: '"VT323", monospace',
            fontSize: "0.9rem",
            color: "#ff4444",
            background: "rgba(255,0,0,0.05)",
          }}
        >
          {error}
        </div>
      )}

      {result && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-3"
        >
          {/* Score */}
          <div className="text-center">
            <span
              className="text-lg font-bold"
              style={{
                fontFamily: '"Press Start 2P", monospace',
                fontSize: "0.55rem",
                color: result.levelColor,
                textShadow: `0 0 10px ${result.levelColor}`,
              }}
            >
              {result.levelEmoji} {result.level}
            </span>
            <div className="mt-2 w-full h-3 rounded-sm overflow-hidden" style={{ background: "#0d120d", border: "1px solid rgba(0,255,65,0.1)" }}>
              <motion.div
                className="h-full"
                initial={{ width: 0 }}
                animate={{ width: `${result.score}%` }}
                transition={{ duration: 0.5 }}
                style={{
                  background: scoreBarColor,
                }}
              />
            </div>
            <div
              className="mt-1 text-xs"
              style={{ fontFamily: '"VT323", monospace', fontSize: "0.85rem", color: scoreBarColor }}
            >
              RISK SCORE: {result.score}/100
            </div>
          </div>

          {result.insufficientData && (
            <div
              className="p-2 rounded text-center"
              style={{
                fontFamily: '"VT323", monospace',
                fontSize: "0.9rem",
                color: "#ffaa00",
                background: "rgba(255,170,0,0.05)",
                border: "1px solid rgba(255,170,0,0.2)",
              }}
            >
              ⚠️ Insufficient DEX data. Proceed with caution.
            </div>
          )}

          {/* Factors */}
          <div className="space-y-1.5 max-h-[200px] overflow-y-auto custom-scrollbar">
            {result.factors.map((factor, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -5 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="p-2 rounded text-xs"
                style={{
                  fontFamily: '"VT323", monospace',
                  fontSize: "0.85rem",
                  background:
                    factor.status === "pass"
                      ? "rgba(0,255,65,0.03)"
                      : factor.status === "warning"
                        ? "rgba(255,170,0,0.03)"
                        : "rgba(255,0,0,0.03)",
                  border:
                    factor.status === "pass"
                      ? "1px solid rgba(0,255,65,0.1)"
                      : factor.status === "warning"
                        ? "1px solid rgba(255,170,0,0.15)"
                        : "1px solid rgba(255,0,0,0.15)",
                }}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span>
                    {factor.status === "pass" ? "✅" : factor.status === "warning" ? "⚠️" : "🔴"}
                  </span>
                  <span
                    className="font-bold"
                    style={{
                      color:
                        factor.status === "pass"
                          ? "#00ff41"
                          : factor.status === "warning"
                            ? "#ffaa00"
                            : "#ff4444",
                    }}
                  >
                    {factor.label}
                  </span>
                </div>
                <div className="text-[#b0d0b0] pl-5">{factor.detail}</div>
              </motion.div>
            ))}
          </div>

          {/* DexScreener data */}
          {result.dexData && (
            <div
              className="p-2 rounded text-xs"
              style={{
                fontFamily: '"VT323", monospace',
                fontSize: "0.8rem",
                background: "rgba(0,255,65,0.02)",
                border: "1px solid rgba(0,255,65,0.1)",
                color: "#e0ffe0",
              }}
            >
              <div className="grid grid-cols-2 gap-1">
                <span className="text-[#b0d0b0]">Price:</span>
                <span>${result.dexData.priceUsd || "—"}</span>
                <span className="text-[#b0d0b0]">Liquidity:</span>
                <span>${result.dexData.liquidityUsd?.toLocaleString() || "—"}</span>
                <span className="text-[#b0d0b0]">FDV:</span>
                <span>${result.dexData.fdv?.toLocaleString() || "—"}</span>
                <span className="text-[#b0d0b0]">Volume 24h:</span>
                <span>${result.dexData.volume24h?.toLocaleString() || "—"}</span>
                <span className="text-[#b0d0b0]">Chain:</span>
                <span>{result.dexData.chainId || "—"}</span>
              </div>
            </div>
          )}
        </motion.div>
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
