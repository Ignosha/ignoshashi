/**
 * GraduationModal — Ethereum token graduation confirmation dialog.
 *
 * Shown when an Ethereum token's buy pushes it past the graduation threshold.
 * Displays live gas estimates from Etherscan and lets the creator deploy to Uniswap.
 *
 * For Solana tokens, graduation is handled server-side automatically —
 * this modal is only for Ethereum (creator pays gas).
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HiMiniRocketLaunch, HiMiniXMark, HiMiniArrowTopRightOnSquare } from "react-icons/hi2";
import {
  fetchGasEstimate,
  estimateGraduationGasCost,
  formatGwei,
  formatGasCostRange,
  type GasEstimate,
  type GasCostEstimate,
} from "~/services/gasEstimator";
import type { GraduationEvent } from "~/hooks/useBondingCurveTrade";

export interface GraduationModalProps {
  event: GraduationEvent | null;
  onGraduate: () => void;
  onDismiss: () => void;
  isGraduating: boolean;
}

export function GraduationModal({
  event,
  onGraduate,
  onDismiss,
  isGraduating,
}: GraduationModalProps) {
  const [gasEstimate, setGasEstimate] = useState<GasEstimate | null>(null);
  const [costEstimates, setCostEstimates] = useState<{
    safeLow: GasCostEstimate;
    average: GasCostEstimate;
    fast: GasCostEstimate;
  } | null>(null);
  const [loadingGas, setLoadingGas] = useState(true);

  useEffect(() => {
    if (!event || event.blockchain !== "ethereum") return;

    let cancelled = false;

    async function loadGas() {
      setLoadingGas(true);
      try {
        const estimates = await estimateGraduationGasCost();
        if (!cancelled) {
          setGasEstimate(estimates.gas);
          setCostEstimates(estimates);
        }
      } catch {
        // Keep defaults
      } finally {
        if (!cancelled) setLoadingGas(false);
      }
    }

    loadGas();

    // Refresh every 15 seconds
    const interval = setInterval(loadGas, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [event?.tokenId]);

  return (
    <AnimatePresence>
      {event && event.blockchain === "ethereum" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0, 0, 0, 0.85)" }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            transition={{ duration: 0.2, ease: [0.68, -0.55, 0.265, 1.55] }}
            className="retro-card max-w-md w-full mx-4 p-6"
            style={{
              borderColor: "rgba(255, 215, 0, 0.4)",
              boxShadow: "0 0 30px rgba(255, 215, 0, 0.15)",
            }}
          >
            {/* Close button */}
            <button
              onClick={onDismiss}
              className="absolute top-3 right-3 text-[#b0d0b0] hover:text-[#ffffff] transition-colors"
              aria-label="Close"
            >
              <HiMiniXMark size={18} />
            </button>

            {/* Header */}
            <div className="text-center mb-5">
              <motion.div
                animate={{ rotate: [0, -5, 5, 0] }}
                transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 2 }}
                className="text-5xl mb-3"
              >
                🎓
              </motion.div>
              <h2
                className="text-[#ffd700] pixel-shadow-sm mb-2"
                style={{
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: "0.6rem",
                }}
              >
                TOKEN READY TO GRADUATE!
              </h2>
              <p
                className="text-[#e0ffe0]"
                style={{ fontFamily: '"VT323", monospace', fontSize: "1.15rem" }}
              >
                <span className="text-[#ffd700] font-bold">
                  {event.tokenName}
                </span>{" "}
                (${event.tokenTicker}) has reached the graduation threshold and is
                ready to deploy to Uniswap!
              </p>
            </div>

            {/* Gas Estimate */}
            <div
              className="retro-card p-4 mb-4"
              style={{
                background: "rgba(255, 215, 0, 0.05)",
                borderColor: "rgba(255, 215, 0, 0.2)",
              }}
            >
              <div className="flex items-center gap-2 mb-3">
                <span style={{ fontSize: "1rem" }}>⛽</span>
                <span
                  className="text-[#ffd700]"
                  style={{
                    fontFamily: '"Press Start 2P", monospace',
                    fontSize: "0.4rem",
                  }}
                >
                  LIVE GAS ESTIMATE
                </span>
              </div>

              {loadingGas ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="retro-card p-2 animate-pulse"
                      style={{ background: "rgba(255,215,0,0.03)" }}
                    >
                      <div className="h-4 bg-[#1a1a0a] rounded" />
                    </div>
                  ))}
                </div>
              ) : gasEstimate ? (
                <div className="space-y-2">
                  {/* Gas price row */}
                  <div className="flex items-center justify-between">
                    <span
                      className="text-[#b0d0b0]"
                      style={{ fontFamily: '"VT323", monospace', fontSize: "0.95rem" }}
                    >
                      🐢 Safe Low
                    </span>
                    <span
                      className="text-[#e0ffe0]"
                      style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
                    >
                      {formatGwei(gasEstimate.safeLow)} gwei
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span
                      className="text-[#b0d0b0]"
                      style={{ fontFamily: '"VT323", monospace', fontSize: "0.95rem" }}
                    >
                      🚶 Average
                    </span>
                    <span
                      className="text-[#ffd700]"
                      style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
                    >
                      {formatGwei(gasEstimate.average)} gwei
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span
                      className="text-[#b0d0b0]"
                      style={{ fontFamily: '"VT323", monospace', fontSize: "0.95rem" }}
                    >
                      🚀 Fast
                    </span>
                    <span
                      className="text-[#e0ffe0]"
                      style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
                    >
                      {formatGwei(gasEstimate.fast)} gwei
                    </span>
                  </div>

                  {/* Cost estimate */}
                  {costEstimates && (
                    <div
                      className="mt-3 pt-3"
                      style={{ borderTop: "1px solid rgba(255,215,0,0.15)" }}
                    >
                      <div className="text-center">
                        <span
                          className="text-[#b0d0b0]"
                          style={{
                            fontFamily: '"Press Start 2P", monospace',
                            fontSize: "0.35rem",
                          }}
                        >
                          ESTIMATED GAS COST
                        </span>
                        <div
                          className="text-[#ffd700] mt-1"
                          style={{
                            fontFamily: '"VT323", monospace',
                            fontSize: "1.3rem",
                          }}
                        >
                          {formatGasCostRange(costEstimates.safeLow, costEstimates.fast)}
                        </div>
                        <span
                          className="text-[#b0d0b0]"
                          style={{
                            fontFamily: '"VT323", monospace',
                            fontSize: "0.85rem",
                          }}
                        >
                          ({costEstimates.average.ethCost.toFixed(6)} ETH)
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p
                  className="text-[#b0d0b0] text-center"
                  style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
                >
                  Unable to fetch gas estimates. Try again.
                </p>
              )}
            </div>

            {/* Info */}
            <div
              className="mb-4 p-3 rounded"
              style={{
                background: "rgba(0,255,65,0.05)",
                border: "1px solid rgba(0,255,65,0.1)",
              }}
            >
              <p
                className="text-[#b0d0b0]"
                style={{ fontFamily: '"VT323", monospace', fontSize: "0.95rem" }}
              >
                💡 You (the creator) pay the Ethereum gas fee to deploy the ERC-20
                token contract. After deployment, the token trades on Uniswap.
              </p>
            </div>

            {/* Buttons */}
            <div className="flex flex-col gap-2">
              <button
                onClick={onGraduate}
                disabled={isGraduating}
                className={`retro-btn w-full justify-center text-[0.45rem] py-3 ${
                  isGraduating
                    ? "opacity-50 cursor-not-allowed"
                    : "retro-btn-turquoise neon-glow-turquoise"
                }`}
                style={{ fontFamily: '"Press Start 2P", monospace' }}
              >
                {isGraduating ? (
                  <span className="flex items-center gap-2 justify-center">
                    <motion.span
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      style={{ display: "inline-block" }}
                    >
                      ⚙️
                    </motion.span>
                    DEPLOYING...
                  </span>
                ) : (
                  <>
                    🚀 DEPLOY TO UNISWAP{" "}
                    {costEstimates && `(~$${costEstimates.average.usdCost.toFixed(2)})`}
                  </>
                )}
              </button>
              <button
                onClick={onDismiss}
                disabled={isGraduating}
                className="retro-btn retro-btn-outline w-full justify-center text-[0.4rem] py-2"
                style={{ fontFamily: '"Press Start 2P", monospace' }}
              >
                ⏳ MAYBE LATER
              </button>
            </div>

            {/* Graduation Pending note */}
            <p
              className="text-center mt-3 text-[#b0d0b0]"
              style={{ fontFamily: '"VT323", monospace', fontSize: "0.85rem" }}
            >
              Choosing "Maybe Later" marks this token as "Graduation Pending" —
              you can graduate anytime from the token page.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
