/**
 * ignoshashi Bonding Curve Trade Hook
 *
 * Single reusable hook that handles ALL buy and sell transactions
 * across the entire platform. Every buy and sell must use this hook.
 *
 * Real wallet transactions only — NO simulated fallbacks.
 * Chain enforcement: Solana tokens reject ETH wallets and vice versa.
 *
 * Auto-graduation: When a buy pushes a token past the graduation threshold,
 * Solana tokens trigger server-side graduation via /api/graduate/solana,
 * Ethereum tokens emit a graduation-ready event for the UI to handle.
 */

import { useState, useCallback } from "react";
import { useWallet, truncateAddress } from "~/context/WalletContext";
import {
  getBondingCurveState,
  getBuyFeeBreakdown,
  getSellFeeBreakdown,
  applyBuyToState,
  applySellToState,
  saveBondingCurveState,
  getBondingCurvePrice,
} from "~/services/bondingCurve";
import {
  sendBondingCurveTransaction,
  calculateFeeBreakdown,
  processSellPayout,
  getExplorerUrl,
} from "~/services/walletTransactions";
import {
  addTrade,
  updateTokenPrice,
  getTokenById,
  addPlatformEvent,
} from "~/services/tracker";
import { creditReferrerForTrade } from "~/services/referrals";

// ─── Types ─────────────────────────────────────────

export type TradeStatus =
  | "idle"
  | "preparing"
  | "awaiting_wallet"
  | "confirming"
  | "complete"
  | "graduating"
  | "error";

export interface BuyParams {
  tokenId: string;
  amount: number; // in SOL or ETH
  tokenTicker: string;
}

export interface SellParams {
  tokenId: string;
  amount: number; // token amount (not SOL/ETH)
  tokenTicker: string;
}

export interface TradeResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

export interface GraduationEvent {
  tokenId: string;
  tokenName: string;
  tokenTicker: string;
  blockchain: "solana" | "ethereum";
  txHash: string | null;
  dexAddress: string | null;
  creatorAddress: string;
}

export interface BondingCurveTradeHook {
  buy: (params: BuyParams) => Promise<TradeResult>;
  sell: (params: SellParams) => Promise<TradeResult>;
  status: TradeStatus;
  stepLabel: string;
  txHash: string | null;
  error: string | null;
  /** Emitted when a token is ready to graduate (Ethereum: needs user confirmation, Solana: auto-completed) */
  graduationEvent: GraduationEvent | null;
  reset: () => void;
}

// ─── Hook ──────────────────────────────────────────

export function useBondingCurveTrade(): BondingCurveTradeHook {
  const { isConnectedOnChain, getAddressForChain } = useWallet();

  const [status, setStatus] = useState<TradeStatus>("idle");
  const [stepLabel, setStepLabel] = useState("");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [graduationEvent, setGraduationEvent] = useState<GraduationEvent | null>(null);

  const reset = useCallback(() => {
    setStatus("idle");
    setStepLabel("");
    setTxHash(null);
    setError(null);
    setGraduationEvent(null);
  }, []);

  // ─── Buy ───────────────────────────────────────

  const buy = useCallback(
    async (params: BuyParams): Promise<TradeResult> => {
      const { tokenId, amount, tokenTicker } = params;

      // Reset state before starting
      setStatus("preparing");
      setStepLabel("Loading bonding curve...");
      setTxHash(null);
      setError(null);

      try {
        // 1. Get bonding curve state
        const curve = getBondingCurveState(tokenId);
        if (!curve) {
          const msg = `No bonding curve found for token ${tokenTicker}`;
          setStatus("error");
          setError(msg);
          return { success: false, error: msg };
        }

        // 2. Verify curve exists and is active (not graduated)
        if (curve.graduated) {
          const msg = `${tokenTicker} has already graduated — no longer on bonding curve`;
          setStatus("error");
          setError(msg);
          return { success: false, error: msg };
        }
        if (!curve.bondingCurveActive) {
          const msg = `Bonding curve for ${tokenTicker} is not active`;
          setStatus("error");
          setError(msg);
          return { success: false, error: msg };
        }

        // 3. Get token's blockchain from curve state
        const chain = curve.blockchain;
        const chainName = chain === "solana" ? "Solana" : "Ethereum";

        // 4. Verify wallet connected on correct chain
        if (!isConnectedOnChain(chain)) {
          const msg = `This token is on ${chainName}. Please connect your ${chainName} wallet.`;
          setStatus("error");
          setError(msg);
          return { success: false, error: msg };
        }

        const walletAddr = getAddressForChain(chain);
        if (!walletAddr) {
          const msg = `Could not get ${chainName} wallet address`;
          setStatus("error");
          setError(msg);
          return { success: false, error: msg };
        }

        // 5. Calculate fee breakdown
        const breakdown = getBuyFeeBreakdown(curve, amount);
        if (breakdown.actualAmount <= 0) {
          const msg = "Cannot buy 0 tokens — curve may be fully sold";
          setStatus("error");
          setError(msg);
          return { success: false, error: msg };
        }

        setStepLabel(
          `Avg price: ${breakdown.avgPrice.toFixed(8)} ${chain === "solana" ? "SOL" : "ETH"} | Fee: ${breakdown.fee.toFixed(6)}`,
        );

        // 6. Set status to awaiting wallet
        setStatus("awaiting_wallet");
        setStepLabel(
          `Total: ${breakdown.totalWithFee.toFixed(6)} ${chain === "solana" ? "SOL" : "ETH"}. Check wallet...`,
        );

        // 7. Send real transaction via wallet
        const feeBreakdown = calculateFeeBreakdown(breakdown.totalWithFee);
        const result = await sendBondingCurveTransaction(
          chain,
          walletAddr,
          feeBreakdown,
          curve.creatorAddress,
          "BUY",
        );

        if (!result.success) {
          setStatus("error");
          setError(result.error || "Transaction failed");
          return { success: false, error: result.error || "Transaction failed" };
        }

        // 8. Confirm
        setStatus("confirming");
        setTxHash(result.txHash);
        setStepLabel("Confirming on blockchain...");

        // 9. Apply state update
        const newState = applyBuyToState(
          curve,
          breakdown.actualAmount,
          breakdown.avgPrice,
          breakdown.totalWithFee,
          breakdown.fee,
          truncateAddress(walletAddr),
        );
        saveBondingCurveState(newState);

        // 10. Record trade
        const token = getTokenById(tokenId);
        addTrade({
          id: `trade-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          tokenId,
          tokenName: token?.name || tokenTicker,
          tokenTicker,
          type: "BUY",
          amount: breakdown.actualAmount,
          price: breakdown.avgPrice,
          total: breakdown.totalWithFee,
          wallet: truncateAddress(walletAddr),
          txHash: result.txHash,
          timestamp: Date.now(),
        });

        // Credit referrer for this trade (5% of platform fee)
        creditReferrerForTrade(walletAddr, chain, breakdown.fee, tokenId);

        // 11. Update token price
        updateTokenPrice(tokenId, getBondingCurvePrice(newState));

        // 12. Complete — check for graduation
        setStatus("complete");

        if (newState.graduated) {
          // Token graduated! Trigger auto-graduation flow
          setStepLabel(`🎓 Token graduating! Bought ${breakdown.actualAmount.toLocaleString()} ${tokenTicker}!`);

          const token = getTokenById(tokenId);
          const gradEvent: GraduationEvent = {
            tokenId,
            tokenName: token?.name || tokenTicker,
            tokenTicker,
            blockchain: chain,
            txHash: result.txHash,
            dexAddress: null,
            creatorAddress: curve.creatorAddress,
          };

          // For Solana: try server-side auto-graduation
          if (chain === "solana") {
            setStatus("graduating");
            setStepLabel("🎓 Auto-graduating to Raydium...");
            try {
              const gradRes = await fetch("/api/graduate/solana", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  tokenId,
                  tokenName: token?.name || tokenTicker,
                  tokenSymbol: tokenTicker,
                  tokenSupply: curve.totalSupply,
                  creatorAddress: curve.creatorAddress,
                }),
              });
              const gradData = await gradRes.json();
              if (gradData.success) {
                gradEvent.txHash = gradData.txHash;
                gradEvent.dexAddress = gradData.dexAddress;
                setStepLabel(`🎓 Graduated to Raydium! ${breakdown.actualAmount.toLocaleString()} ${tokenTicker}!`);
                // Broadcast graduation across tabs
                try {
                  const bc = new BroadcastChannel("ignoshashi");
                  bc.postMessage({ type: "token-graduated", ...gradEvent });
                  bc.close();
                } catch { /* ignore */ }
                // Add graduation event to feed
                addPlatformEvent({
                  type: "graduation" as any,
                  message: `🎓 ${gradEvent.tokenName} (${gradEvent.tokenTicker}) graduated to Raydium! View on Solscan`,
                  tokenName: gradEvent.tokenName,
                  tokenTicker: gradEvent.tokenTicker,
                  blockchain: "solana",
                  wallet: curve.creatorAddress,
                  timestamp: Date.now(),
                });
                // Update local bonding curve state with dex address
                const updatedCurve = { ...newState, dexAddress: gradData.dexAddress };
                saveBondingCurveState(updatedCurve);
              } else if (gradData.needsManual) {
                // Pool wallet not configured — show manual button
                setStepLabel(`🎓 Token ready to graduate! Bought ${breakdown.actualAmount.toLocaleString()} ${tokenTicker}!`);
              } else {
                setStepLabel(`🎓 Token ready to graduate! (Manual graduation needed) Bought ${breakdown.actualAmount.toLocaleString()} ${tokenTicker}!`);
              }
            } catch {
              // Server graduation failed — still marked graduated, show manual option
              setStepLabel(`🎓 Token ready to graduate! Bought ${breakdown.actualAmount.toLocaleString()} ${tokenTicker}!`);
            }
            setStatus("complete");
          } else {
            // For Ethereum: emit graduation event, UI shows modal for creator to pay gas
            setStepLabel(`🎓 Token ready for Uniswap! Bought ${breakdown.actualAmount.toLocaleString()} ${tokenTicker}!`);
            setGraduationEvent(gradEvent);
          }

          return { success: true, txHash: result.txHash };
        }

        setStepLabel(
          `Bought ${breakdown.actualAmount.toLocaleString()} ${tokenTicker}!`,
        );

        return { success: true, txHash: result.txHash };
      } catch (err: any) {
        const msg = err?.message || "Network error during buy";
        setStatus("error");
        setError(msg);
        return { success: false, error: msg };
      }
    },
    [isConnectedOnChain, getAddressForChain],
  );

  // ─── Sell ──────────────────────────────────────

  const sell = useCallback(
    async (params: SellParams): Promise<TradeResult> => {
      const { tokenId, amount, tokenTicker } = params;

      // Reset state before starting
      setStatus("preparing");
      setStepLabel("Loading bonding curve...");
      setTxHash(null);
      setError(null);

      try {
        // 1. Get bonding curve state
        const curve = getBondingCurveState(tokenId);
        if (!curve) {
          const msg = `No bonding curve found for token ${tokenTicker}`;
          setStatus("error");
          setError(msg);
          return { success: false, error: msg };
        }

        // 2. Verify curve exists and is active (not graduated)
        if (curve.graduated) {
          const msg = `${tokenTicker} has already graduated — no longer on bonding curve`;
          setStatus("error");
          setError(msg);
          return { success: false, error: msg };
        }
        if (!curve.bondingCurveActive) {
          const msg = `Bonding curve for ${tokenTicker} is not active`;
          setStatus("error");
          setError(msg);
          return { success: false, error: msg };
        }

        // 3. Get token's blockchain from curve state
        const chain = curve.blockchain;
        const chainName = chain === "solana" ? "Solana" : "Ethereum";

        // 4. Verify wallet connected on correct chain
        if (!isConnectedOnChain(chain)) {
          const msg = `This token is on ${chainName}. Please connect your ${chainName} wallet.`;
          setStatus("error");
          setError(msg);
          return { success: false, error: msg };
        }

        const walletAddr = getAddressForChain(chain);
        if (!walletAddr) {
          const msg = `Could not get ${chainName} wallet address`;
          setStatus("error");
          setError(msg);
          return { success: false, error: msg };
        }

        // 5. Calculate sell fee breakdown
        const breakdown = getSellFeeBreakdown(curve, amount);
        if (breakdown.actualAmount <= 0) {
          const msg = "Cannot sell 0 tokens";
          setStatus("error");
          setError(msg);
          return { success: false, error: msg };
        }

        setStepLabel(
          `Price: ${breakdown.price.toFixed(8)} ${chain === "solana" ? "SOL" : "ETH"} | Fee: ${breakdown.fee.toFixed(6)}`,
        );

        // 6. Set status to awaiting wallet
        setStatus("awaiting_wallet");
        setStepLabel(
          `You receive: ${breakdown.totalAfterFee.toFixed(6)} ${chain === "solana" ? "SOL" : "ETH"}. Check wallet...`,
        );

        // 7. Process real sell payout via server-side pool wallet
        setStepLabel("Processing payout via server...");

        const payoutResult = await processSellPayout(
          chain,
          walletAddr,
          breakdown.totalAfterFee,
          tokenId,
        );

        let realTxHash: string | null = null;

        if (payoutResult.success && payoutResult.realTx) {
          realTxHash = payoutResult.txHash;
        } else if (payoutResult.success && !payoutResult.realTx) {
          // Pool wallet not configured — no simulated fallback
          const msg =
            "Sell payout is not available right now. Pool wallet not configured. Try again later.";
          setStatus("error");
          setError(msg);
          return { success: false, error: msg };
        } else {
          const msg = payoutResult.error || "Sell payout failed";
          setStatus("error");
          setError(msg);
          return { success: false, error: msg };
        }

        // 8. Confirm
        setStatus("confirming");
        setTxHash(realTxHash);
        setStepLabel("Confirming on blockchain...");

        // 9. Apply state update
        const newState = applySellToState(
          curve,
          breakdown.actualAmount,
          breakdown.price,
          breakdown.totalAfterFee,
          breakdown.fee,
          truncateAddress(walletAddr),
        );
        saveBondingCurveState(newState);

        // 10. Record trade
        const token = getTokenById(tokenId);
        addTrade({
          id: `trade-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          tokenId,
          tokenName: token?.name || tokenTicker,
          tokenTicker,
          type: "SELL",
          amount: breakdown.actualAmount,
          price: breakdown.price,
          total: breakdown.totalAfterFee,
          wallet: truncateAddress(walletAddr),
          txHash: realTxHash,
          timestamp: Date.now(),
        });

        // 11. Update token price
        updateTokenPrice(tokenId, getBondingCurvePrice(newState));

        // 12. Complete
        setStatus("complete");
        setStepLabel(
          `Sold ${breakdown.actualAmount.toLocaleString()} ${tokenTicker} for ${breakdown.totalAfterFee.toFixed(6)} ${chain === "solana" ? "SOL" : "ETH"}`,
        );

        return { success: true, txHash: realTxHash };
      } catch (err: any) {
        const msg = err?.message || "Network error during sell";
        setStatus("error");
        setError(msg);
        return { success: false, error: msg };
      }
    },
    [isConnectedOnChain, getAddressForChain],
  );

  return { buy, sell, status, stepLabel, txHash, error, graduationEvent, reset };
}
