import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HiMiniXMark, HiMiniArrowPath, HiMiniCheckBadge, HiMiniExclamationTriangle } from "react-icons/hi2";
import type { TxStep } from "~/services/walletTransactions";
import { getExplorerUrl, getExplorerName } from "~/services/walletTransactions";

// ─── Types ─────────────────────────────────────────

export interface TransactionModalState {
  open: boolean;
  type: "BUY" | "SELL";
  tokenTicker: string;
  chain: "solana" | "ethereum";
  amount: string;
  step: TxStep;
  stepMessage: string;
  txHash: string;
  error: string;
}

const initialModalState: TransactionModalState = {
  open: false,
  type: "BUY",
  tokenTicker: "",
  chain: "solana",
  amount: "",
  step: "preparing",
  stepMessage: "",
  txHash: "",
  error: "",
};

const STEP_LABELS: Record<TxStep, string> = {
  preparing: "Preparing transaction...",
  awaiting_wallet: "Awaiting wallet approval...",
  confirming: "Confirming on blockchain...",
  complete: "Trade complete!",
  error: "Transaction failed",
};

const STEP_ORDER: TxStep[] = ["preparing", "awaiting_wallet", "confirming", "complete"];

interface TransactionModalProps {
  state: TransactionModalState;
  onClose: () => void;
  onRetry?: () => void;
}

export { initialModalState };

// ─── Component ─────────────────────────────────────

export function TransactionModal({ state, onClose, onRetry }: TransactionModalProps) {
  const { open, type, tokenTicker, chain, amount, step, stepMessage, txHash, error } =
    state;
  const [showDetails, setShowDetails] = useState(false);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-close on complete after 8 seconds
  useEffect(() => {
    if (step === "complete") {
      closeTimeoutRef.current = setTimeout(() => {
        onClose();
      }, 8000);
      return () => {
        if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
      };
    }
  }, [step, onClose]);

  const currentStepIndex = STEP_ORDER.indexOf(step);
  const currencySymbol = chain === "solana" ? "SOL" : "ETH";
  const explorerUrl = txHash ? getExplorerUrl(chain, txHash) : "";
  const explorerName = getExplorerName(chain);
  const isPending = txHash.startsWith("pending-");

  const handleClose = () => {
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{
            background: "rgba(0,0,0,0.75)",
            backdropFilter: "blur(4px)",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && (step === "complete" || step === "error")) {
              handleClose();
            }
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ duration: 0.2 }}
            className="retro-card p-6 max-w-md w-full crt-effect relative overflow-hidden"
            style={{
              background: "rgba(10, 15, 10, 0.98)",
              border: "2px solid rgba(0, 255, 65, 0.3)",
              boxShadow:
                "0 0 40px rgba(0, 255, 65, 0.15), 0 8px 32px rgba(0, 0, 0, 0.7)",
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <span className="text-xl">
                  {type === "BUY" ? "💰" : "📉"}
                </span>
                <h2
                  className="font-bold text-[#00ff41]"
                  style={{
                    fontFamily: '"Press Start 2P", monospace',
                    fontSize: "0.55rem",
                  }}
                >
                  {type} {tokenTicker}
                </h2>
              </div>
              {(step === "complete" || step === "error") && (
                <button
                  onClick={handleClose}
                  className="text-[#b0d0b0] hover:text-[#00ff41] transition-colors"
                >
                  <HiMiniXMark size={18} />
                </button>
              )}
            </div>

            {/* Trade summary */}
            <div
              className="retro-card p-3 mb-5"
              style={{ background: "rgba(0,255,65,0.03)" }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p
                    className="text-[#b0d0b0]"
                    style={{
                      fontFamily: '"Press Start 2P", monospace',
                      fontSize: "0.35rem",
                    }}
                  >
                    AMOUNT
                  </p>
                  <p
                    className="text-[#e0ffe0] mt-0.5"
                    style={{ fontFamily: '"VT323", monospace', fontSize: "1.1rem" }}
                  >
                    {amount} {tokenTicker}
                  </p>
                </div>
                <div className="text-right">
                  <p
                    className="text-[#b0d0b0]"
                    style={{
                      fontFamily: '"Press Start 2P", monospace',
                      fontSize: "0.35rem",
                    }}
                  >
                    CHAIN
                  </p>
                  <p
                    className="text-[#e0ffe0] mt-0.5"
                    style={{ fontFamily: '"VT323", monospace', fontSize: "1.1rem" }}
                  >
                    {chain === "solana" ? "Solana" : "Ethereum"}
                  </p>
                </div>
              </div>
            </div>

            {/* Progress steps */}
            <div className="space-y-2 mb-5">
              {STEP_ORDER.map((s) => {
                const sIdx = STEP_ORDER.indexOf(s);
                const isComplete = step === "complete" || currentStepIndex > sIdx;
                const isCurrent = step === s && step !== "complete" && step !== "error";
                const isPending = currentStepIndex < sIdx && step !== "error";
                const isFailed = step === "error" && currentStepIndex === sIdx;

                return (
                  <div
                    key={s}
                    className="flex items-center gap-3 p-2 rounded-md transition-all duration-200"
                    style={{
                      background: isCurrent
                        ? "rgba(0,255,65,0.08)"
                        : isComplete
                          ? "rgba(0,255,65,0.03)"
                          : "transparent",
                      border: isCurrent
                        ? "1px solid rgba(0,255,65,0.2)"
                        : "1px solid transparent",
                    }}
                  >
                    {/* Step indicator */}
                    <div className="w-6 h-6 flex items-center justify-center shrink-0">
                      {isComplete ? (
                        <HiMiniCheckBadge className="text-[#00ff41]" size={16} />
                      ) : isCurrent ? (
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        >
                          <HiMiniArrowPath className="text-[#00ff41]" size={16} />
                        </motion.div>
                      ) : isFailed ? (
                        <HiMiniExclamationTriangle className="text-[#ff4444]" size={16} />
                      ) : (
                        <span
                          className="text-[#555]"
                          style={{
                            fontFamily: '"VT323", monospace',
                            fontSize: "1rem",
                          }}
                        >
                          ○
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className="font-bold"
                        style={{
                          fontFamily: '"Press Start 2P", monospace',
                          fontSize: "0.38rem",
                          color: isComplete
                            ? "#00ff41"
                            : isCurrent
                              ? "#e0ffe0"
                              : isFailed
                                ? "#ff4444"
                                : "#555",
                        }}
                      >
                        {isFailed ? error || STEP_LABELS[s] : STEP_LABELS[s]}
                      </p>
                      {isCurrent && stepMessage && (
                        <p
                          className="text-[#b0d0b0] mt-0.5"
                          style={{
                            fontFamily: '"VT323", monospace',
                            fontSize: "0.85rem",
                          }}
                        >
                          {stepMessage}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Success state */}
            {step === "complete" && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-5 p-3 rounded-md"
                style={{
                  background: "rgba(0,255,65,0.06)",
                  border: "1px solid rgba(0,255,65,0.2)",
                }}
              >
                <p className="text-3xl text-center mb-2">
                  {type === "BUY" ? "🚀" : "💸"}
                </p>
                <p
                  className="text-[#00ff41] text-center font-bold mb-2"
                  style={{
                    fontFamily: '"Press Start 2P", monospace',
                    fontSize: "0.5rem",
                  }}
                >
                  {type} COMPLETE!
                </p>

                {/* Tx details */}
                <div
                  className="space-y-1 mt-3 cursor-pointer"
                  onClick={() => setShowDetails(!showDetails)}
                >
                  <p
                    className="text-center text-[#b0d0b0]"
                    style={{
                      fontFamily: '"Press Start 2P", monospace',
                      fontSize: "0.3rem",
                    }}
                  >
                    {showDetails ? "▲ HIDE DETAILS" : "▼ SHOW DETAILS"}
                  </p>

                  {showDetails && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      className="space-y-1 mt-2"
                    >
                      {txHash && (
                        <p
                          className="text-center break-all"
                          style={{
                            fontFamily: '"VT323", monospace',
                            fontSize: "0.85rem",
                            color: "#e0ffe0",
                          }}
                        >
                          <span className="text-[#b0d0b0]">TX: </span>
                          {isPending ? (
                            <span className="text-[#ffb83c]">
                              (pending) {txHash}
                            </span>
                          ) : (
                            <>{txHash.slice(0, 20)}...</>
                          )}
                        </p>
                      )}
                      {explorerUrl && !isPending && (
                        <p className="text-center">
                          <a
                            href={explorerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#00ff41] hover:text-[#39ff14] underline"
                            style={{
                              fontFamily: '"VT323", monospace',
                              fontSize: "0.9rem",
                            }}
                          >
                            ↗ View on {explorerName}
                          </a>
                        </p>
                      )}
                    </motion.div>
                  )}
                </div>
              </motion.div>
            )}

            {/* Error state */}
            {step === "error" && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-5 p-3 rounded-md"
                style={{
                  background: "rgba(255,68,68,0.06)",
                  border: "1px solid rgba(255,68,68,0.2)",
                }}
              >
                <p className="text-2xl text-center mb-1">⚠️</p>
                <p
                  className="text-[#ff4444] text-center"
                  style={{
                    fontFamily: '"VT323", monospace',
                    fontSize: "1rem",
                  }}
                >
                  {error || "An unknown error occurred"}
                </p>
              </motion.div>
            )}

            {/* Action buttons */}
            <div className="flex gap-3">
              {step === "error" && (
                <>
                  <button
                    onClick={handleClose}
                    className="retro-btn retro-btn-outline flex-1 justify-center text-[0.45rem] py-2.5"
                    style={{ fontFamily: '"Press Start 2P", monospace' }}
                  >
                    CLOSE
                  </button>
                  {onRetry && (
                    <button
                      onClick={onRetry}
                      className="retro-btn retro-btn-turquoise flex-1 justify-center text-[0.45rem] py-2.5"
                      style={{ fontFamily: '"Press Start 2P", monospace' }}
                    >
                      RETRY
                    </button>
                  )}
                </>
              )}

              {step === "complete" && (
                <button
                  onClick={handleClose}
                  className="retro-btn retro-btn-turquoise flex-1 justify-center text-[0.45rem] py-2.5"
                  style={{ fontFamily: '"Press Start 2P", monospace' }}
                >
                  DONE
                </button>
              )}

              {step !== "error" && step !== "complete" && (
                <div className="flex-1 text-center py-2.5">
                  <p
                    className="text-[#b0d0b0] retro-blink"
                    style={{
                      fontFamily: '"VT323", monospace',
                      fontSize: "0.9rem",
                    }}
                  >
                    Please wait, do not close...
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
