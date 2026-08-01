/**
 * ignoshashi Wallet Transaction Service
 *
 * Builds and sends real blockchain transactions via Phantom (Solana) or MetaMask (Ethereum).
 *
 * Two modes:
 * 1. NO CONTRACT (legacy): Funds sent to owner wallet as temporary holder.
 * 2. WITH CONTRACT: Calls MemeVaultBondingCurve contract's buy()/sell() on-chain.
 */

import {
  Connection,
  Transaction,
  SystemProgram,
  PublicKey,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { SOLANA_RPC } from "~/config/fees";
import { BrowserProvider, Contract, parseEther, formatEther, type TransactionRequest } from "ethers";
// ─── Owner Fee Recipient Addresses ─────────────────

export const OWNER_SOLANA = "J9mFgKsF9f2eNSrH7FqzBoADsgzU9diDQ3L9WUm9mDh7";
export const OWNER_ETHEREUM = "0x5985a841601aE93D8Ddfec88715C755235490404";

// ─── Types ─────────────────────────────────────────

export interface TxResult {
  success: boolean;
  txHash: string;
  error?: string;
}

export interface FeeBreakdown {
  totalAmount: number;   // In native currency (SOL or ETH)
  platformFee: number;   // 0.5% to owner
  creatorFee: number;    // 0.5% to creator
  curveAmount: number;   // Remaining for bonding curve
}

export type TxStep = "preparing" | "awaiting_wallet" | "confirming" | "complete" | "error";

// ─── Fee Calculation ───────────────────────────────

/**
 * Calculate the fee breakdown for a bonding curve trade.
 * Platform fee (0.5%) goes to owner wallet.
 * Creator fee (0.5%) goes to creator wallet.
 */
export function calculateFeeBreakdown(totalAmount: number): FeeBreakdown {
  const platformFee = totalAmount * 0.005;  // 0.5%
  const creatorFee = totalAmount * 0.005;   // 0.5%
  const curveAmount = totalAmount - platformFee - creatorFee;
  return { totalAmount, platformFee, creatorFee, curveAmount };
}

// ─── Solana Helpers ────────────────────────────────

function getSolanaProvider(): any {
  if (typeof window === "undefined") return null;
  const win = window as any;

  // Prefer Phantom, then any solana provider
  if (win.solana?.isPhantom) return win.solana;
  if (win.solflare) return win.solflare;
  if (win.backpack) return win.backpack;
  if (win.glow) return win.glow;
  if (win.solana) return win.solana;
  return null;
}

/**
 * Get the Solana connection using the configured RPC endpoint.
 * In the browser this uses the /api/solana-rpc proxy; on the server it uses the public RPC.
 */
function getSolanaConnection(): Connection {
  return new Connection(SOLANA_RPC, "confirmed");
}

/**
 * Send a Solana transaction from the user's wallet.
 *
 * For a BUY:
 *   - platformFee (0.5%) → owner wallet
 *   - creatorFee (0.5%) → creator wallet
 *   - curveAmount → owner wallet (temporary holder until bonding curve contract is deployed)
 *
 * For a SELL:
 *   - Since funds are held in owner wallet (no smart contract), we simulate the return.
 *     The sell flow simply updates local state and generates a mock tx hash.
 */
export async function sendSolTransaction(
  fromAddress: string,
  feeBreakdown: FeeBreakdown,
  creatorAddress: string,
  type: "BUY" | "SELL",
): Promise<TxResult> {
  const provider = getSolanaProvider();
  if (!provider) {
    return { success: false, txHash: "", error: "No Solana wallet detected" };
  }

  try {
    if (type === "SELL") {
      // Sell transactions must go through the server-side pool wallet payout.
      // Direct wallet-to-wallet sells are not supported — use processSellPayout() instead.
      return {
        success: false,
        txHash: "",
        error: "Sell transactions must use processSellPayout(). Direct wallet sells are not supported.",
      };
    }

    const fromPubkey = new PublicKey(fromAddress);
    const ownerPubkey = new PublicKey(OWNER_SOLANA);
    const creatorPubkey = new PublicKey(creatorAddress);

    const connection = getSolanaConnection();

    // Get latest blockhash
    // Build transaction (no blockhash yet — Phantom sets its own for signAndSendTransaction)
    const transaction = new Transaction({ feePayer: fromPubkey });

    // Transfer platform fee to owner
    if (feeBreakdown.platformFee > 0) {
      transaction.add(
        SystemProgram.transfer({
          fromPubkey,
          toPubkey: ownerPubkey,
          lamports: Math.floor(feeBreakdown.platformFee * LAMPORTS_PER_SOL),
        }),
      );
    }

    // Transfer creator fee to creator
    if (feeBreakdown.creatorFee > 0 && creatorAddress !== fromAddress) {
      transaction.add(
        SystemProgram.transfer({
          fromPubkey,
          toPubkey: creatorPubkey,
          lamports: Math.floor(feeBreakdown.creatorFee * LAMPORTS_PER_SOL),
        }),
      );
    }

    // Transfer curve amount to owner (temporary holder)
    if (feeBreakdown.curveAmount > 0) {
      transaction.add(
        SystemProgram.transfer({
          fromPubkey,
          toPubkey: ownerPubkey,
          lamports: Math.floor(feeBreakdown.curveAmount * LAMPORTS_PER_SOL),
        }),
      );
    }

    // Sign and send — Phantom's signAndSendTransaction handles its own fresh blockhash
    let signature: string;
    let blockhash: string;
    let lastValidBlockHeight: number;
    if (provider.signAndSendTransaction) {
      const result = await provider.signAndSendTransaction(transaction);
      signature = typeof result === "string" ? result : result.signature;
      // Get fresh blockhash for confirmation only
      const bh = await connection.getLatestBlockhash("confirmed");
      blockhash = bh.blockhash;
      lastValidBlockHeight = bh.lastValidBlockHeight;
    } else if (provider.signTransaction) {
      const bh = await connection.getLatestBlockhash("confirmed");
      blockhash = bh.blockhash;
      lastValidBlockHeight = bh.lastValidBlockHeight;
      transaction.recentBlockhash = blockhash;
      transaction.lastValidBlockHeight = lastValidBlockHeight;
      const signed = await provider.signTransaction(transaction);
      try {
        signature = await connection.sendRawTransaction(signed.serialize(), {
          skipPreflight: false,
          preflightCommitment: "confirmed",
        });
      } catch (sendErr: any) {
        if (sendErr?.message?.includes("block height exceeded") || sendErr?.message?.includes("expired")) {
          const bh2 = await connection.getLatestBlockhash("confirmed");
          transaction.recentBlockhash = bh2.blockhash;
          transaction.lastValidBlockHeight = bh2.lastValidBlockHeight;
          const reSigned = await provider.signTransaction(transaction);
          signature = await connection.sendRawTransaction(reSigned.serialize(), {
            skipPreflight: false,
            preflightCommitment: "confirmed",
          });
          blockhash = bh2.blockhash;
          lastValidBlockHeight = bh2.lastValidBlockHeight;
        } else {
          throw sendErr;
        }
      }
    } else {
      throw new Error(
        "Wallet does not support signAndSendTransaction or signTransaction. " +
          "Please use Phantom, Solflare, Backpack, or Glow.",
      );
    }

    // Wait for confirmation
    const confirmation = await connection.confirmTransaction(
      { signature: signature!, blockhash: blockhash!, lastValidBlockHeight: lastValidBlockHeight! },
      "confirmed",
    );

    if (confirmation.value.err) {
      return {
        success: false,
        txHash: signature,
        error: `Transaction failed: ${JSON.stringify(confirmation.value.err)}`,
      };
    }

    return { success: true, txHash: signature };
  } catch (err: any) {
    console.error("Solana transaction failed:", err);

    // Detect user rejection
    if (err?.code === 4001 || err?.message?.includes("User rejected") || err?.message?.includes("cancelled")) {
      return { success: false, txHash: "", error: "Transaction rejected by user" };
    }

    // Detect insufficient funds
    if (err?.message?.includes("insufficient") || err?.message?.includes("0x1")) {
      return { success: false, txHash: "", error: "Insufficient funds for transaction" };
    }

    return { success: false, txHash: "", error: err?.message || "Network error" };
  }
}

// ─── Ethereum Helpers ──────────────────────────────

function getEthereumProvider(): any {
  if (typeof window === "undefined") return null;
  const win = window as any;
  if (win.ethereum?.isMetaMask) return win.ethereum;
  if (win.ethereum?.isCoinbaseWallet) return win.ethereum;
  if (win.ethereum?.isTrust) return win.ethereum;
  if (win.ethereum?.isRainbow) return win.ethereum;
  if (win.ethereum) return win.ethereum;
  return null;
}

/**
 * Send an Ethereum transaction from the user's wallet.
 *
 * For a BUY:
 *   - platformFee (0.5%) → owner wallet
 *   - creatorFee (0.5%) → creator wallet
 *   - curveAmount → owner wallet (temporary holder until bonding curve contract is deployed)
 *
 * For a SELL:
 *   - Simulates the return transfer (funds are in owner wallet, not a smart contract).
 */
export async function sendEthTransaction(
  fromAddress: string,
  feeBreakdown: FeeBreakdown,
  creatorAddress: string,
  type: "BUY" | "SELL",
): Promise<TxResult> {
  const injectedProvider = getEthereumProvider();
  if (!injectedProvider) {
    return { success: false, txHash: "", error: "No Ethereum wallet detected" };
  }

  try {
    if (type === "SELL") {
      // Sell transactions must go through the server-side pool wallet payout.
      // Direct wallet-to-wallet sells are not supported — use processSellPayout() instead.
      return {
        success: false,
        txHash: "",
        error: "Sell transactions must use processSellPayout(). Direct wallet sells are not supported.",
      };
    }

    const provider = new BrowserProvider(injectedProvider);
    const signer = await provider.getSigner();

    // Convert amounts to wei strings
    const platformFeeWei = parseEther(feeBreakdown.platformFee.toFixed(18));
    const creatorFeeWei = parseEther(feeBreakdown.creatorFee.toFixed(18));
    const curveAmountWei = parseEther(feeBreakdown.curveAmount.toFixed(18));

    // Build transactions array
    const txs: TransactionRequest[] = [];

    // Platform fee to owner
    if (feeBreakdown.platformFee > 0) {
      txs.push({
        to: OWNER_ETHEREUM,
        value: platformFeeWei,
      });
    }

    // Creator fee to creator
    if (feeBreakdown.creatorFee > 0 && creatorAddress.toLowerCase() !== fromAddress.toLowerCase()) {
      txs.push({
        to: creatorAddress,
        value: creatorFeeWei,
      });
    }

    // Curve amount to owner (temporary holder)
    if (feeBreakdown.curveAmount > 0) {
      txs.push({
        to: OWNER_ETHEREUM,
        value: curveAmountWei,
      });
    }

    // If only one transfer, send it directly
    if (txs.length === 1) {
      const tx = await signer.sendTransaction(txs[0]);
      await tx.wait();
      return { success: true, txHash: tx.hash };
    }

    // Multiple transfers: send sequentially
    let lastHash = "";
    for (const txReq of txs) {
      const tx = await signer.sendTransaction(txReq);
      await tx.wait();
      lastHash = tx.hash;
    }

    return { success: true, txHash: lastHash };
  } catch (err: any) {
    console.error("Ethereum transaction failed:", err);

    // Detect user rejection
    if (err?.code === 4001 || err?.code === "ACTION_REJECTED" || err?.message?.includes("User denied") || err?.message?.includes("rejected")) {
      return { success: false, txHash: "", error: "Transaction rejected by user" };
    }

    // Detect insufficient funds
    if (err?.message?.includes("insufficient funds") || err?.code === "INSUFFICIENT_FUNDS") {
      return { success: false, txHash: "", error: "Insufficient funds for transaction" };
    }

    return { success: false, txHash: "", error: err?.message || "Network error" };
  }
}

// ─── Unified Transaction Sender ────────────────────

/**
 * Send a bonding curve trade transaction on the appropriate chain.
 */
export async function sendBondingCurveTransaction(
  chain: "solana" | "ethereum",
  fromAddress: string,
  feeBreakdown: FeeBreakdown,
  creatorAddress: string,
  type: "BUY" | "SELL",
): Promise<TxResult> {
  if (chain === "solana") {
    return sendSolTransaction(fromAddress, feeBreakdown, creatorAddress, type);
  } else {
    return sendEthTransaction(fromAddress, feeBreakdown, creatorAddress, type);
  }
}

// ─── Block Explorer URLs ───────────────────────────

export function getExplorerUrl(
  chain: "solana" | "ethereum",
  txHash: string,
): string {
  // Pending payouts have no on-chain tx yet — no explorer link
  if (txHash.startsWith("pending-")) {
    return "";
  }

  if (chain === "solana") {
    return `https://solscan.io/tx/${txHash}`;
  } else {
    return `https://etherscan.io/tx/${txHash}`;
  }
}

export function getExplorerName(chain: "solana" | "ethereum"): string {
  return chain === "solana" ? "Solscan" : "Etherscan";
}

// ─── Simple Solana Transfer ────────────────────────

/**
 * Send a simple SOL transfer from the connected wallet to a recipient.
 * Signature: sendSolanaTransfer(fromPubkey, toPubkey, lamports)
 * Uses window.solana provider to sign and send.
 */
export async function sendSolanaTransfer(
  fromPubkey: string,
  toPubkey: string,
  lamports: number,
): Promise<TxResult> {
  const provider = getSolanaProvider();
  if (!provider) {
    return { success: false, txHash: "", error: "No Solana wallet detected" };
  }

  try {
    const from = new PublicKey(fromPubkey);
    const to = new PublicKey(toPubkey);
    const connection = getSolanaConnection();

    const transaction = new Transaction({ feePayer: from });

    transaction.add(
      SystemProgram.transfer({ fromPubkey: from, toPubkey: to, lamports }),
    );

    // Phantom's signAndSendTransaction handles its own fresh blockhash
    let signature: string;
    let blockhash: string;
    let lastValidBlockHeight: number;
    if (provider.signAndSendTransaction) {
      const result = await provider.signAndSendTransaction(transaction);
      signature = typeof result === "string" ? result : result.signature;
      const bh = await connection.getLatestBlockhash("confirmed");
      blockhash = bh.blockhash;
      lastValidBlockHeight = bh.lastValidBlockHeight;
    } else {
      const bh = await connection.getLatestBlockhash("confirmed");
      blockhash = bh.blockhash;
      lastValidBlockHeight = bh.lastValidBlockHeight;
      transaction.recentBlockhash = blockhash;
      transaction.lastValidBlockHeight = lastValidBlockHeight;
      const signed = await provider.signTransaction(transaction);
      try {
        signature = await connection.sendRawTransaction(signed.serialize(), {
          skipPreflight: false,
          preflightCommitment: "confirmed",
        });
      } catch (sendErr: any) {
        if (sendErr?.message?.includes("block height exceeded") || sendErr?.message?.includes("expired")) {
          const bh2 = await connection.getLatestBlockhash("confirmed");
          transaction.recentBlockhash = bh2.blockhash;
          transaction.lastValidBlockHeight = bh2.lastValidBlockHeight;
          const reSigned = await provider.signTransaction(transaction);
          signature = await connection.sendRawTransaction(reSigned.serialize(), {
            skipPreflight: false,
            preflightCommitment: "confirmed",
          });
          blockhash = bh2.blockhash;
          lastValidBlockHeight = bh2.lastValidBlockHeight;
        } else {
          throw sendErr;
        }
      }
    }

    const confirmation = await connection.confirmTransaction(
      { signature: signature!, blockhash: blockhash!, lastValidBlockHeight: lastValidBlockHeight! },
      "confirmed",
    );

    if (confirmation.value.err) {
      return {
        success: false,
        txHash: signature,
        error: `Transaction failed: ${JSON.stringify(confirmation.value.err)}`,
      };
    }

    return { success: true, txHash: signature };
  } catch (err: any) {
    console.error("Solana transfer failed:", err);
    if (err?.code === 4001 || err?.message?.includes("User rejected") || err?.message?.includes("cancelled")) {
      return { success: false, txHash: "", error: "Transaction rejected by user" };
    }
    if (err?.message?.includes("insufficient") || err?.message?.includes("0x1")) {
      return { success: false, txHash: "", error: "Insufficient funds for transaction" };
    }
    return { success: false, txHash: "", error: err?.message || "Network error" };
  }
}

// ─── Wallet Balance ────────────────────────────────

/**
 * Get SOL balance for an address.
 */
export async function getSolBalance(address: string): Promise<number> {
  try {
    const connection = getSolanaConnection();
    const pubkey = new PublicKey(address);
    const balance = await connection.getBalance(pubkey);
    return balance / LAMPORTS_PER_SOL;
  } catch {
    return 0;
  }
}

/**
 * Get ETH balance for an address.
 */
export async function getEthBalance(address: string): Promise<number> {
  try {
    const injectedProvider = getEthereumProvider();
    if (!injectedProvider) return 0;
    const provider = new BrowserProvider(injectedProvider);
    const balance = await provider.getBalance(address);
    return parseFloat(formatEther(balance));
  } catch {
    return 0;
  }
}

// ─── Real Contract Interactions ───────────────────

/**
 * Load the MemeVaultBondingCurve contract ABI from the compiled artifact.
 */
async function getBondingCurveAbi(): Promise<any[]> {
  try {
    const artifact = await import("~/contracts/abis/MemeVaultBondingCurve.json");
    return artifact.default?.abi || artifact.abi;
  } catch {
    // Fallback: minimal ABI for buy/sell/graduate
    return [
      "function buy() payable",
      "function sell(uint256 tokenAmount)",
      "function graduate()",
      "function getCurrentPrice() view returns (uint256)",
      "function getBuyCost(uint256 tokenAmount) view returns (uint256 cost, uint256 fee)",
      "function getSellProceeds(uint256 tokenAmount) view returns (uint256 proceeds, uint256 fee)",
      "function getGraduationProgress() view returns (uint256)",
      "function getTotalRaised() view returns (uint256)",
      "function currentSupply() view returns (uint256)",
      "function totalSupply() view returns (uint256)",
      "function graduated() view returns (bool)",
      "function bondingCurveActive() view returns (bool)",
      "function approve(address spender, uint256 amount) returns (bool)",
      "function allowance(address owner, address spender) view returns (uint256)",
      "event TokensPurchased(address indexed buyer, uint256 ethAmount, uint256 tokenAmount, uint256 pricePerToken, uint256 fee)",
      "event TokensSold(address indexed seller, uint256 tokenAmount, uint256 ethAmount, uint256 pricePerToken, uint256 fee)",
      "event Graduated(address indexed dexAddress, uint256 totalRaised)",
    ];
  }
}

/**
 * Buy tokens from a deployed MemeVaultBondingCurve contract.
 * Calls the contract's payable buy() function.
 *
 * @param contractAddress - The deployed bonding curve contract address
 * @param ethAmountWei - Amount of ETH to spend (in wei, as bigint)
 * @returns Transaction result with tx hash
 */
export async function buyFromBondingCurve(
  contractAddress: string,
  ethAmountWei: bigint,
): Promise<TxResult> {
  const injectedProvider = getEthereumProvider();
  if (!injectedProvider) {
    return { success: false, txHash: "", error: "No Ethereum wallet detected" };
  }

  try {
    const provider = new BrowserProvider(injectedProvider);
    const signer = await provider.getSigner();
    const abi = await getBondingCurveAbi();
    const contract = new Contract(contractAddress, abi, signer);

    const tx = await contract.buy({ value: ethAmountWei });
    const receipt = await tx.wait();

    return { success: true, txHash: receipt.hash };
  } catch (err: any) {
    console.error("Contract buy failed:", err);

    if (err?.code === 4001 || err?.code === "ACTION_REJECTED" || err?.message?.includes("User denied")) {
      return { success: false, txHash: "", error: "Transaction rejected by user" };
    }
    if (err?.message?.includes("insufficient funds") || err?.code === "INSUFFICIENT_FUNDS") {
      return { success: false, txHash: "", error: "Insufficient funds for transaction" };
    }
    if (err?.message?.includes("Bonding curve is closed")) {
      return { success: false, txHash: "", error: "Bonding curve is closed or graduated" };
    }
    if (err?.message?.includes("All tokens sold")) {
      return { success: false, txHash: "", error: "All tokens have been sold" };
    }

    return { success: false, txHash: "", error: err?.message || "Contract interaction failed" };
  }
}

/**
 * Sell tokens back to a deployed MemeVaultBondingCurve contract.
 * First approves the contract to spend tokens, then calls sell().
 *
 * @param contractAddress - The deployed bonding curve contract address
 * @param tokenAmountWei - Amount of tokens to sell (in wei units, as bigint)
 * @returns Transaction result with tx hash
 */
export async function sellFromBondingCurve(
  contractAddress: string,
  tokenAmountWei: bigint,
): Promise<TxResult> {
  const injectedProvider = getEthereumProvider();
  if (!injectedProvider) {
    return { success: false, txHash: "", error: "No Ethereum wallet detected" };
  }

  try {
    const provider = new BrowserProvider(injectedProvider);
    const signer = await provider.getSigner();
    const abi = await getBondingCurveAbi();
    const contract = new Contract(contractAddress, abi, signer);

    // Step 1: Approve contract to spend tokens
    const approveTx = await contract.approve(contractAddress, tokenAmountWei);
    await approveTx.wait();

    // Step 2: Sell tokens
    const sellTx = await contract.sell(tokenAmountWei);
    const receipt = await sellTx.wait();

    return { success: true, txHash: receipt.hash };
  } catch (err: any) {
    console.error("Contract sell failed:", err);

    if (err?.code === 4001 || err?.code === "ACTION_REJECTED" || err?.message?.includes("User denied")) {
      return { success: false, txHash: "", error: "Transaction rejected by user" };
    }
    if (err?.message?.includes("insufficient")) {
      return { success: false, txHash: "", error: "Insufficient token balance" };
    }
    if (err?.message?.includes("Bonding curve is closed")) {
      return { success: false, txHash: "", error: "Bonding curve is closed or graduated" };
    }

    return { success: false, txHash: "", error: err?.message || "Contract interaction failed" };
  }
}

/**
 * Call graduate() on a deployed contract when the curve threshold is met.
 */
export async function graduateFromBondingCurve(
  contractAddress: string,
): Promise<TxResult> {
  const injectedProvider = getEthereumProvider();
  if (!injectedProvider) {
    return { success: false, txHash: "", error: "No Ethereum wallet detected" };
  }

  try {
    const provider = new BrowserProvider(injectedProvider);
    const signer = await provider.getSigner();
    const abi = await getBondingCurveAbi();
    const contract = new Contract(contractAddress, abi, signer);

    const tx = await contract.graduate();
    const receipt = await tx.wait();

    return { success: true, txHash: receipt.hash };
  } catch (err: any) {
    console.error("Contract graduate failed:", err);

    if (err?.code === 4001 || err?.code === "ACTION_REJECTED" || err?.message?.includes("User denied")) {
      return { success: false, txHash: "", error: "Transaction rejected by user" };
    }
    if (err?.message?.includes("Already graduated")) {
      return { success: false, txHash: "", error: "Token already graduated" };
    }
    if (err?.message?.includes("threshold not met")) {
      return { success: false, txHash: "", error: "Graduation threshold not yet met (80% supply)" };
    }

    return { success: false, txHash: "", error: err?.message || "Contract interaction failed" };
  }
}

/**
 * Get real-time contract state from a deployed bonding curve contract.
 */
export async function getContractState(contractAddress: string): Promise<{
  currentSupply: bigint;
  totalSupply: bigint;
  currentPrice: bigint;
  graduated: boolean;
  active: boolean;
  totalRaised: bigint;
  progressBps: bigint;
} | null> {
  const injectedProvider = getEthereumProvider();
  if (!injectedProvider) return null;

  try {
    const provider = new BrowserProvider(injectedProvider);
    const abi = await getBondingCurveAbi();
    const contract = new Contract(contractAddress, abi, provider);

    const [currentSupply, totalSupply, currentPrice, graduated, active, totalRaised, progressBps] =
      await Promise.all([
        contract.currentSupply(),
        contract.totalSupply(),
        contract.getCurrentPrice(),
        contract.graduated(),
        contract.bondingCurveActive(),
        contract.getTotalRaised(),
        contract.getGraduationProgress(),
      ]);

    return {
      currentSupply,
      totalSupply,
      currentPrice,
      graduated,
      active,
      totalRaised,
      progressBps,
    };
  } catch (err) {
    console.error("Failed to fetch contract state:", err);
    return null;
  }
}

/**
 * Get the buy cost quote from the contract for a given token amount.
 * Used for displaying estimated cost before submitting the transaction.
 */
export async function getContractBuyQuote(
  contractAddress: string,
  tokenAmountWei: bigint,
): Promise<{ cost: bigint; fee: bigint; total: bigint } | null> {
  const injectedProvider = getEthereumProvider();
  if (!injectedProvider) return null;

  try {
    const provider = new BrowserProvider(injectedProvider);
    const abi = await getBondingCurveAbi();
    const contract = new Contract(contractAddress, abi, provider);

    const [cost, fee] = await contract.getBuyCost(tokenAmountWei);
    return { cost, fee, total: cost + fee };
  } catch {
    return null;
  }
}

// ─── Aliases ────────────────────────────────────────

/** Alias for getSolBalance — quick balance check before attempting trade. */
export const getSolanaBalance = getSolBalance;

// ─── Sell Payout ─────────────────────────────────

/**
 * Process a sell payout by calling the server-side /api/sell/payout endpoint.
 * The server signs and sends the transaction from the pool wallet to the user.
 *
 * Falls back gracefully when the pool wallet is not configured:
 * the sell is queued and marked as "pending" for manual processing.
 */
export async function processSellPayout(
  chain: "solana" | "ethereum",
  toAddress: string,
  amount: number,
  tokenId: string,
): Promise<{
  success: boolean;
  txHash: string;
  realTx: boolean;
  error?: string;
}> {
  try {
    const res = await fetch("/api/sell/payout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chain,
        toAddress,
        amount,
        tokenId,
        userId: toAddress,
      }),
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      return {
        success: false,
        txHash: "",
        realTx: false,
        error: data.error || "Payout failed",
      };
    }

    return {
      success: true,
      txHash: data.txHash,
      realTx: data.realTx,
    };
  } catch (err: any) {
    console.error("Sell payout request failed:", err);
    return {
      success: false,
      txHash: "",
      realTx: false,
      error: err?.message || "Network error",
    };
  }
}
