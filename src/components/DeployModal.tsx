import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HiMiniXMark, HiMiniRocketLaunch, HiMiniArrowPath } from "react-icons/hi2";
import type { DeployProgress, DeployStep } from "~/services/bondingCurveDeploy";
import type { BondingCurveState } from "~/services/bondingCurve";

interface DeployModalProps {
  open: boolean;
  onClose: () => void;
  tokenName: string;
  tokenTicker: string;
  tokenSupply: number;
  curve: BondingCurveState;
  onGraduate: (
    onProgress: (progress: DeployProgress) => void,
  ) => Promise<DeployProgress>;
}

const STEP_LABELS: Record<DeployStep, string> = {
  idle: "Preparing...",
  connecting: "Connecting wallet...",
  creating_token: "Creating token...",
  deploying_contract: "Deploying bonding curve...",
  setting_up_dex: "Setting up DEX...",
  graduated: "✅ Graduated!",
  error: "Error",
};

const STEP_ORDER: DeployStep[] = [
  "connecting",
  "creating_token",
  "deploying_contract",
  "setting_up_dex",
  "graduated",
];

export function DeployModal({
  open,
  onClose,
  tokenName,
  tokenTicker,
  tokenSupply,
  curve,
  onGraduate,
}: DeployModalProps) {
  const [currentStep, setCurrentStep] = useState<DeployStep>("idle");
  const [stepMessage, setStepMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [txHash, setTxHash] = useState("");
  const [tokenAddress, setTokenAddress] = useState("");
  const [isDeploying, setIsDeploying] = useState(false);

  const dexName = curve.blockchain === "solana" ? "Raydium" : "Uniswap";
  const chainSymbol = curve.blockchain === "solana" ? "SOL" : "ETH";

  const handleDeploy = async () => {
    setIsDeploying(true);
    setErrorMessage("");
    setCurrentStep("idle");

    const result = await onGraduate((progress) => {
      setCurrentStep(progress.step);
      setStepMessage(progress.message);
      if (progress.txHash) setTxHash(progress.txHash);
      if (progress.tokenAddress) setTokenAddress(progress.tokenAddress);
    });

    if (result.step === "error") {
      setErrorMessage(result.message);
      setCurrentStep("error");
    } else {
      setCurrentStep("graduated");
    }
    setIsDeploying(false);
  };

  const handleRetry = () => {
    setCurrentStep("idle");
    setErrorMessage("");
    handleDeploy();
  };

  const resetAndClose = () => {
    setCurrentStep("idle");
    setStepMessage("");
    setErrorMessage("");
    setTxHash("");
    setTokenAddress("");
    setIsDeploying(false);
    onClose();
  };

  const currentStepIndex = STEP_ORDER.indexOf(currentStep);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !isDeploying) resetAndClose();
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
              boxShadow: "0 0 40px rgba(0, 255, 65, 0.15), 0 8px 32px rgba(0, 0, 0, 0.7)",
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <span className="text-xl">🎓</span>
                <h2
                  className="font-bold text-[#00ff41]"
                  style={{
                    fontFamily: '"Press Start 2P", monospace',
                    fontSize: "0.55rem",
                  }}
                >
                  GRADUATE TOKEN
                </h2>
              </div>
              {!isDeploying && (
                <button
                  onClick={resetAndClose}
                  className="text-[#b0d0b0] hover:text-[#00ff41] transition-colors"
                >
                  <HiMiniXMark size={18} />
                </button>
              )}
            </div>

            {/* Token info */}
            <div className="retro-card p-3 mb-5" style={{ background: "rgba(0,255,65,0.03)" }}>
              <div className="flex items-center justify-between">
                <div>
                  <p
                    className="text-[#ffffff]"
                    style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.45rem" }}
                  >
                    {tokenName}
                  </p>
                  <p
                    className="text-[#00ff41] mt-1"
                    style={{ fontFamily: '"VT323", monospace', fontSize: "1.1rem" }}
                  >
                    ${tokenTicker}
                  </p>
                </div>
                <div className="text-right">
                  <p
                    className="text-[#b0d0b0]"
                    style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem" }}
                  >
                    Supply: {tokenSupply.toLocaleString()}
                  </p>
                  <p
                    className="text-[#00ff41]"
                    style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.35rem" }}
                  >
                    → {dexName}
                  </p>
                </div>
              </div>
            </div>

            {/* Progress steps */}
            <div className="space-y-2 mb-5">
              {STEP_ORDER.filter((s) => s !== "graduated" || currentStep === "graduated").map((step) => {
                const stepIdx = STEP_ORDER.indexOf(step);
                const isComplete = currentStepIndex > stepIdx;
                const isCurrent = currentStep === step;
                const isPending = currentStepIndex < stepIdx && currentStep !== "error";
                const isError = currentStep === "error" && stepIdx >= currentStepIndex;

                return (
                  <div
                    key={step}
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
                        <span className="text-[#00ff41] text-sm">✅</span>
                      ) : isCurrent ? (
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        >
                          <HiMiniArrowPath className="text-[#00ff41]" size={16} />
                        </motion.div>
                      ) : isError ? (
                        <span className="text-[#ff4444] text-sm">❌</span>
                      ) : (
                        <span
                          className="text-[#555]"
                          style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
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
                              : isError
                                ? "#ff4444"
                                : "#555",
                        }}
                      >
                        {STEP_LABELS[step]}
                      </p>
                      {isCurrent && stepMessage && (
                        <p
                          className="text-[#b0d0b0] mt-0.5"
                          style={{ fontFamily: '"VT323", monospace', fontSize: "0.85rem" }}
                        >
                          {stepMessage}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Success details */}
            {currentStep === "graduated" && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-5 p-3 rounded-md"
                style={{
                  background: "rgba(0,255,65,0.06)",
                  border: "1px solid rgba(0,255,65,0.2)",
                }}
              >
                <p className="text-3xl text-center mb-2">🚀</p>
                <p
                  className="text-[#00ff41] text-center font-bold mb-2"
                  style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem" }}
                >
                  GRADUATION COMPLETE!
                </p>
                {tokenAddress && (
                  <p
                    className="text-center break-all"
                    style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem", color: "#e0ffe0" }}
                  >
                    CA: {tokenAddress}
                  </p>
                )}
                {txHash && (
                  <p
                    className="text-center break-all mt-1"
                    style={{ fontFamily: '"VT323", monospace', fontSize: "0.8rem", color: "#b0d0b0" }}
                  >
                    TX: {txHash.slice(0, 20)}...
                  </p>
                )}
              </motion.div>
            )}

            {/* Error message */}
            {currentStep === "error" && (
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
                  style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
                >
                  {errorMessage}
                </p>
              </motion.div>
            )}

            {/* Action buttons */}
            <div className="flex gap-3">
              {currentStep === "idle" && (
                <button
                  onClick={handleDeploy}
                  className="retro-btn retro-btn-orange neon-glow-yellow flex-1 justify-center text-[0.45rem] py-2.5"
                  style={{ fontFamily: '"Press Start 2P", monospace' }}
                >
                  <HiMiniRocketLaunch size={16} />
                  GRADUATE TO {dexName.toUpperCase()}
                </button>
              )}

              {currentStep === "error" && (
                <>
                  <button
                    onClick={resetAndClose}
                    className="retro-btn retro-btn-outline flex-1 justify-center text-[0.45rem] py-2.5"
                    style={{ fontFamily: '"Press Start 2P", monospace' }}
                  >
                    CLOSE
                  </button>
                  <button
                    onClick={handleRetry}
                    className="retro-btn retro-btn-orange flex-1 justify-center text-[0.45rem] py-2.5"
                    style={{ fontFamily: '"Press Start 2P", monospace' }}
                  >
                    <HiMiniArrowPath size={14} />
                    RETRY
                  </button>
                </>
              )}

              {currentStep === "graduated" && (
                <button
                  onClick={resetAndClose}
                  className="retro-btn retro-btn-turquoise flex-1 justify-center text-[0.45rem] py-2.5"
                  style={{ fontFamily: '"Press Start 2P", monospace' }}
                >
                  DONE
                </button>
              )}

              {currentStep !== "idle" && currentStep !== "error" && currentStep !== "graduated" && (
                <div className="flex-1 text-center py-2.5">
                  <p
                    className="text-[#b0d0b0] retro-blink"
                    style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem" }}
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
