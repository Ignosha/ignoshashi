/**
 * ignoshashi Token Deployment Service
 *
 * Deploys real on-chain tokens for both Solana (SPL) and Ethereum (ERC-20).
 * Collects creation fees as part of the deployment flow.
 */

import {
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL,
  Transaction,
  SystemProgram,
  Keypair,
} from "@solana/web3.js";
import {
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createInitializeMintInstruction,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getMinimumBalanceForRentExemptMint,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import { ethers } from "ethers";
import { SOLANA_RPC, CREATION_FEES, FEE_WALLETS } from "~/config/fees";
import { createBaseSepoliaToken } from "~/services/baseSepoliaTokenCreation";

// ─── Bytecode for minimal ERC-20 deployment ──────

/**
 * Minimal ERC-20 init code + runtime bytecode.
 * Constructor args: (string name, string symbol, uint8 decimals, uint256 totalSupply).
 * Mints totalSupply to the deployer on construction.
 * Same bytecode used in bondingCurveDeploy.ts.
 */
const ERC20_INIT_CODE =
  "0x608060405234801561001057600080fd5b506040516109a03803806109a08339818101604052608081101561003457600080fd5b810190808051604051939291908464010000000082111561005457600080fd5b8382019150602082018581111561006a57600080fd5b825186600182028301116401000000008211171561008757600080fd5b8083526020830192505050908051906020019080838360005b838110156100b85781810151838201526020016100a0565b50505050905090810190601f1680156100e55780820380516001836020036101000a031916815260200191505b506040526020018051604051939291908464010000000082111561010857600080fd5b8382019150602082018581111561011e57600080fd5b825186600182028301116401000000008211171561013b57600080fd5b8083526020830192505050908051906020019080838360005b8381101561016c578181015183820152602001610154565b50505050905090810190601f1680156101995780820380516001836020036101000a031916815260200191505b506040908152602082015191015192508591508490600090805190602001906101c3929190610212565b50600190805190602001906101d9929190610212565b506002805460ff191660ff92909216919091179055506101fa905033826101fa565b5050506102ad565b5050565b6001600160a01b0391909116600090815260036020526040902055565b828054600181600116156101000203166002900490600052602060002090601f016020900481019282601f1061025357805160ff1916838001178555610280565b82800160010185558215610280579182015b82811115610280578251825591602001919060010190610265565b5061028c929150610290565b5090565b6102aa91905b8082111561028c5760008155600101610296565b90565b6106e4806102bc6000396000f3fe";

const ERC20_RUNTIME =
  "0x608060405234801561001057600080fd5b50600436106100b45760003560e01c806370a082" +
  "311161007157806370a082311461021057806395d89b4114610246578063a457c2d7146102" +
  "4e578063a9059cbb14610287578063dd62ed3e146102c0578063f2fde38b14610303576100" +
  "b4565b806306fdde03146100b9578063095ea7b31461013757806318160ddd146101705780" +
  "6323b872dd1461018e578063313ce567146101c757806339509351146101e5575b600080fd" +
  "5b6100c161033c565b6040516100ce9190610d4c565b60405180910390f35b61015b600480" +
  "3603604081101561014d57600080fd5b50803590602001356103d2565b6040805191151582" +
  "5290519081900360200190f35b61017861043c565b60408051918252519081900360200190" +
  "f35b61015b600480360360608110156101a457600080fd5b506001600160a01b0381358116" +
  "9160208101359091169060400135610442565b6101cf6104c9565b6040805160ff90921682" +
  "52519081900360200190f35b61015b600480360360408110156101fb57600080fd5b5080359" +
  "0602001356104d2565b6101786004803603602081101561022657600080fd5b503560016001" +
  "60a01b0316610520565b6100c161053b565b61015b60048036036040811015610264576000" +
  "80fd5b5080359060200135610596565b61015b6004803603604081101561029d57600080fd" +
  "5b506001600160a01b038135169060200135610600565b6101786004803603604081101561" +
  "02d657600080fd5b506001600160a01b0381358116916020013516610685565b61033a6004" +
  "803603602081101561031957600080fd5b50356001600160a01b03166106b0565b005b6000" +
  "8054604080516020601f6002600019610100600188161502019095169490940493840181900" +
  "40282018101909252828152606093909290918301828280156103c85780601f1061039d5761" +
  "01008083540402835291602001916103c8565b820191906000526020600020905b815481529" +
  "0600101906020018083116103ab57829003601f168201915b5050505050905090565b336000" +
  "8181526005602090815260408083206001600160a01b0387168085529083528184208690558" +
  "151868152915193949390927f8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b" +
  "200ac8c7c3b925928290030190a35060015b92915050565b60025481565b6001600160a01b0" +
  "8316600090815260056020908152604080832033845290915281205461047690836106f856" +
  "5b6001600160a01b0385166000908152600560209081526040808320338452909152902055" +
  "6104a184848461070f565b6104bf6001600160a01b03851684846104ba876107eb565b6106" +
  "f8565b5060019392505050565b60015460ff1681565b336000908152600560209081526040" +
  "8083206001600160a01b03861684529091528120546104f890836106f8565b336000908152" +
  "6005602090815260408083206001600160a01b03881684529091529020556001610436565b" +
  "6001600160a01b031660009081526003602052604090205490565b60018054604080516020" +
  "600260001961010086881615020190941693909304928301859004820285018201909152818" +
  "352606093909290918301828280156103c85780601f1061039d576101008083540402835291" +
  "602001916103c8565b3360009081526005602090815260408083206001600160a01b0386168" +
  "4529091528120546105c79083610801565b6040805184815290516001600160a01b03861691" +
  "33917f8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b9259161" +
  "9081900360200190a350600192915050565b600061060c3384610863565b6104bf576040805" +
  "162461bcd60e51b815260206004820152601060248201526f151c985b9cd9995c8819985a5b" +
  "195960821b604482015290519081900360640190fd5b6001600160a01b0391821660009081" +
  "5260056020908152604080832093909416825291909152205490565b6000805460026000196" +
  "1010060018416150201909116049055565b600061070484846108c6565b9050806104365750" +
  "60005b92915050565b600082820183811015610752576040805162461bcd60e51b815260206" +
  "004820152601b60248201527f536166654d6174683a206164646974696f6e206f766572666c" +
  "6f770000000000000000000000000000000000000000000000000000006044820152905190" +
  "81900360640190fd5b9392505050565b6001600160a01b0382166000908152600360205260" +
  "40812080548392906107839084906106f8565b90915550506001600160a01b038316600090" +
  "8152600360205260409020546107b29082610801565b6001600160a01b0380851660008181" +
  "526003602052848120939093559251918516917fddf252ad1be2c89b69c2b068fc378daa95" +
  "2ba7f163c4a11628f55a4df523b3ef9181900360200190a3505050565b6000610436825490" +
  "565b600082821115610858576040805162461bcd60e51b815260206004820152601e602482" +
  "01527f536166654d6174683a207375627472616374696f6e206f766572666c6f7700000000" +
  "604482015290519081900360640190fd5b50900390565b6001600160a01b03808316600081" +
  "815260056020908152604080832033851684528252808320549383526003909152812054909" +
  "182916108a69190839003906106f8565b6001600160a01b0386166000908152600360205260" +
  "40902054101591505092915050565b6001600160a01b038281166000818152600360208181" +
  "52604080842080548801905594871680845281842080548890039055848452815187815293" +
  "51949591947fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3" +
  "ef9281900390910190a35060019291505056fea2646970667358221220e8f7c3b4b5c4e2a0" +
  "9d4f9a2c3b4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d64736f6c634300080d0033";

// ─── Types ────────────────────────────────────

export interface DeployResult {
  success: boolean;
  tokenAddress: string;
  txHash: string;
  feeTxHash?: string;
  error?: string;
}

export type DeployStep =
  | "idle"
  | "collecting_fee"
  | "deploying_token"
  | "minting_supply"
  | "complete"
  | "error";

export interface DeployProgress {
  step: DeployStep;
  message: string;
  txHash?: string;
  tokenAddress?: string;
}

// ─── Wallet Provider Helpers ─────────────────

function getSolanaProvider(): any {
  if (typeof window === "undefined") return null;
  const win = window as any;
  if (win.solana?.isPhantom) return win.solana;
  if (win.solflare) return win.solflare;
  if (win.backpack) return win.backpack;
  if (win.glow) return win.glow;
  if (win.solana) return win.solana;
  return null;
}

function getEthereumProvider(): any {
  if (typeof window === "undefined") return null;
  const win = window as any;
  return win.ethereum || null;
}

// ─── Solana SPL Token Deployment ─────────────

/**
 * Deploy a real SPL token on Solana.
 *
 * Flow:
 * 1. Send creation fee (0.01 SOL) to platform wallet
 * 2. Create SPL token mint (mint authority = creator)
 * 3. Create associated token account for creator
 * 4. Mint total supply to creator's ATA
 *
 * @param name - Token name
 * @param ticker - Token symbol/ticker
 * @param supply - Total supply (human-readable, e.g. 1_000_000_000)
 * @param decimals - Token decimals (default: 6)
 * @param creatorAddress - Creator's wallet address (base58)
 * @param image - Optional token image URL
 * @param onProgress - Callback for UI progress updates
 */
export async function deploySolanaToken(
  name: string,
  ticker: string,
  supply: number,
  decimals: number = 6,
  creatorAddress: string,
  image?: string,
  onProgress?: (progress: DeployProgress) => void,
): Promise<DeployResult> {
  const provider = getSolanaProvider();
  if (!provider?.publicKey) {
    return {
      success: false,
      tokenAddress: "",
      txHash: "",
      error: "No Solana wallet connected. Please connect Phantom, Solflare, or another wallet.",
    };
  }

  try {
    const connection = new Connection(SOLANA_RPC, "confirmed");
    const creatorPubkey = new PublicKey(creatorAddress);

    // Helper: send a transaction via wallet
    async function sendTx(tx: Transaction, partialSigners: Keypair[] = []): Promise<string> {
      tx.feePayer = creatorPubkey;

      // Prefer signAndSendTransaction — Phantom handles its own fresh blockhash internally.
      // Do NOT set recentBlockhash here; Phantom ignores or uses it, causing expiry.
      if (provider.signAndSendTransaction) {
        for (const signer of partialSigners) tx.partialSign(signer);
        const result = await provider.signAndSendTransaction(tx);
        const signature = typeof result === "string" ? result : result.signature;
        // Get fresh blockhash AFTER send for confirmation
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
        await connection.confirmTransaction(
          { signature, blockhash, lastValidBlockHeight },
          "confirmed",
        );
        return signature;
      }

      // Fall back to signTransaction + sendRawTransaction
      if (provider.signTransaction) {
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
        tx.recentBlockhash = blockhash;
        const signed = await provider.signTransaction(tx);
        for (const signer of partialSigners) signed.partialSign(signer);
        let sig: string;
        try {
          sig = await connection.sendRawTransaction(signed.serialize(), {
            skipPreflight: false,
            preflightCommitment: "confirmed",
          });
        } catch (sendErr: any) {
          // If blockhash expired during signing, retry once with fresh blockhash
          if (sendErr?.message?.includes("block height exceeded") || sendErr?.message?.includes("expired")) {
            const { blockhash: bh2, lastValidBlockHeight: lvbh2 } = await connection.getLatestBlockhash("confirmed");
            tx.recentBlockhash = bh2;
            const reSigned = await provider.signTransaction(tx);
            sig = await connection.sendRawTransaction(reSigned.serialize(), {
              skipPreflight: false,
              preflightCommitment: "confirmed",
            });
            await connection.confirmTransaction({ signature: sig, blockhash: bh2, lastValidBlockHeight: lvbh2 }, "confirmed");
            return sig;
          }
          throw sendErr;
        }
        await connection.confirmTransaction(
          { signature: sig, blockhash, lastValidBlockHeight },
          "confirmed",
        );
        return sig;
      }

      throw new Error(
        "Wallet does not support signAndSendTransaction or signTransaction. " +
          "Please use Phantom, Solflare, Backpack, or Glow.",
      );
    }

    // ── Step 1: Collect creation fee ──
    onProgress?.({ step: "collecting_fee", message: "Collecting creation fee..." });

    let feeTxHash = "";
    try {
      const { sendSolanaTransfer } = await import("./walletTransactions");
      const feeResult = await sendSolanaTransfer(
        creatorAddress,
        FEE_WALLETS.solana,
        Math.floor(CREATION_FEES.solana * LAMPORTS_PER_SOL),
      );
      if (!feeResult.success) {
        return {
          success: false,
          tokenAddress: "",
          txHash: "",
          error: feeResult.error || "Failed to collect creation fee",
        };
      }
      feeTxHash = feeResult.txHash;
      onProgress?.({ step: "collecting_fee", message: "Fee collected!", txHash: feeTxHash });
    } catch (feeErr: any) {
      if (feeErr?.code === 4001 || feeErr?.message?.includes("rejected")) {
        return { success: false, tokenAddress: "", txHash: "", error: "Transaction rejected by user" };
      }
      return { success: false, tokenAddress: "", txHash: "", error: feeErr?.message || "Fee collection failed" };
    }

    // ── Step 2: Create SPL token mint (manual tx to work with wallet adapter) ──
    onProgress?.({ step: "deploying_token", message: "Creating SPL token mint..." });

    const mintKeypair = Keypair.generate();
    const lamports = await getMinimumBalanceForRentExemptMint(connection);

    const createMintTx = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: creatorPubkey,
        newAccountPubkey: mintKeypair.publicKey,
        space: MINT_SIZE,
        lamports,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeMintInstruction(
        mintKeypair.publicKey,
        decimals,
        creatorPubkey,  // mint authority
        null,           // no freeze authority
        TOKEN_PROGRAM_ID,
      ),
    );

    const mintTxSig = await sendTx(createMintTx, [mintKeypair]);

    const tokenAddress = mintKeypair.publicKey.toBase58();
    onProgress?.({
      step: "deploying_token",
      message: "Token mint created!",
      tokenAddress,
      txHash: mintTxSig,
    });

    // ── Step 3: Create Associated Token Account ──
    onProgress?.({ step: "minting_supply", message: "Creating token account..." });

    const ataAddress = await getAssociatedTokenAddress(
      mintKeypair.publicKey,
      creatorPubkey,
    );

    const createAtaTx = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        creatorPubkey,           // payer
        ataAddress,              // ata
        creatorPubkey,           // owner
        mintKeypair.publicKey,   // mint
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      ),
    );

    await sendTx(createAtaTx);

    // ── Step 4: Mint supply ──
    onProgress?.({ step: "minting_supply", message: "Minting supply..." });

    const mintAmount = BigInt(supply) * BigInt(10 ** decimals);
    const mintToTx = new Transaction().add(
      createMintToInstruction(
        mintKeypair.publicKey,
        ataAddress,
        creatorPubkey,
        mintAmount,
        [],
        TOKEN_PROGRAM_ID,
      ),
    );

    await sendTx(mintToTx);

    onProgress?.({
      step: "complete",
      message: "Token deployed on Solana!",
      tokenAddress,
      txHash: mintTxSig,
    });

    return {
      success: true,
      tokenAddress,
      txHash: mintTxSig,
      feeTxHash,
    };
  } catch (err: any) {
    console.error("Solana token deployment failed:", err);

    if (err?.code === 4001 || err?.message?.includes("rejected") || err?.message?.includes("cancelled")) {
      return { success: false, tokenAddress: "", txHash: "", error: "Transaction rejected by user" };
    }
    if (err?.message?.includes("insufficient") || err?.message?.includes("0x1")) {
      return { success: false, tokenAddress: "", txHash: "", error: "Insufficient SOL for deployment. Please fund your wallet." };
    }

    return {
      success: false,
      tokenAddress: "",
      txHash: "",
      error: err?.message || "Failed to deploy Solana token",
    };
  }
}

// ─── Ethereum ERC-20 Token Deployment ─────────

/**
 * Deploy a real ERC-20 token on Ethereum.
 *
 * Flow:
 * 1. Deploy minimal ERC-20 contract with constructor args
 * 2. Send creation fee (0.005 ETH) to platform wallet
 *
 * @param name - Token name
 * @param ticker - Token symbol/ticker
 * @param supply - Total supply (human-readable, e.g. 1_000_000_000)
 * @param decimals - Token decimals (default: 18)
 * @param creatorAddress - Creator's wallet address (0x...)
 * @param image - Optional token image URL
 * @param onProgress - Callback for UI progress updates
 */
export async function deployEthereumToken(
  name: string,
  ticker: string,
  supply: number,
  decimals: number = 18,
  creatorAddress: string,
  image?: string,
  onProgress?: (progress: DeployProgress) => void,
): Promise<DeployResult> {
  const injectedProvider = getEthereumProvider();
  if (!injectedProvider) {
    return {
      success: false,
      tokenAddress: "",
      txHash: "",
      error: "No Ethereum wallet connected. Please connect MetaMask or another wallet.",
    };
  }

  try {
    const provider = new ethers.BrowserProvider(injectedProvider);
    const signer = await provider.getSigner();

    // ── Step 1: Collect creation fee (mandatory, before deployment) ──
    onProgress?.({ step: "collecting_fee", message: "Collecting creation fee..." });

    let feeTxHash = "";
    try {
      const feeTx = await signer.sendTransaction({
        to: FEE_WALLETS.ethereum,
        value: ethers.parseEther(CREATION_FEES.ethereum.toString()),
      });
      await feeTx.wait();
      feeTxHash = feeTx.hash;
      onProgress?.({ step: "collecting_fee", message: "Fee collected!", txHash: feeTxHash });
    } catch (feeErr: any) {
      if (feeErr?.code === 4001 || feeErr?.code === "ACTION_REJECTED" || feeErr?.message?.includes("User denied") || feeErr?.message?.includes("rejected")) {
        return { success: false, tokenAddress: "", txHash: "", error: "Creation fee transaction rejected by user" };
      }
      if (feeErr?.message?.includes("insufficient funds") || feeErr?.code === "INSUFFICIENT_FUNDS") {
        return { success: false, tokenAddress: "", txHash: "", error: "Insufficient ETH to pay creation fee. Please fund your wallet." };
      }
      return { success: false, tokenAddress: "", txHash: "", error: feeErr?.message || "Failed to collect creation fee" };
    }

    // ── Step 2: Deploy ERC-20 contract ──
    onProgress?.({ step: "deploying_token", message: "Deploying ERC-20 contract..." });

    const totalSupplyWei = ethers.parseUnits(supply.toString(), decimals);

    // Build constructor args: (name, symbol, decimals, totalSupply)
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    const encodedArgs = abiCoder.encode(
      ["string", "string", "uint8", "uint256"],
      [name, ticker, decimals, totalSupplyWei],
    );

    // Full bytecode: initCode (already contains runtime bytecode) + constructor args
    const fullBytecode = ERC20_INIT_CODE + ERC20_RUNTIME.slice(2) + encodedArgs.slice(2);

    const deployTx = await signer.sendTransaction({
      data: ethers.getBytes(ethers.hexlify(fullBytecode)),
    });

    onProgress?.({
      step: "deploying_token",
      message: "Waiting for confirmation...",
      txHash: deployTx.hash,
    });

    const deployReceipt = await deployTx.wait();
    const contractAddress = deployReceipt?.contractAddress;

    if (!contractAddress) {
      return {
        success: false,
        tokenAddress: "",
        txHash: deployTx.hash,
        error: "Contract deployed but address not found. Try again.",
      };
    }

    onProgress?.({
      step: "complete",
      message: "Token deployed on Ethereum!",
      tokenAddress: contractAddress,
      txHash: deployTx.hash,
    });

    return {
      success: true,
      tokenAddress: contractAddress,
      txHash: deployTx.hash,
      feeTxHash,
    };
  } catch (err: any) {
    console.error("Ethereum token deployment failed:", err);

    if (err?.code === 4001 || err?.code === "ACTION_REJECTED" || err?.message?.includes("User denied") || err?.message?.includes("rejected")) {
      return { success: false, tokenAddress: "", txHash: "", error: "Transaction rejected by user" };
    }
    if (err?.message?.includes("insufficient funds") || err?.code === "INSUFFICIENT_FUNDS") {
      return { success: false, tokenAddress: "", txHash: "", error: "Insufficient ETH for deployment. Please fund your wallet." };
    }

    return {
      success: false,
      tokenAddress: "",
      txHash: "",
      error: err?.message || "Failed to deploy Ethereum token",
    };
  }
}

// ─── Unified Deploy Entry Point ──────────────

export interface DeployConfig {
  name: string;
  ticker: string;
  supply: number;
  blockchain: "solana" | "ethereum";
  creatorAddress: string;
  image?: string;
  solanaDecimals?: number;
  ethereumDecimals?: number;
}

/**
 * Deploy a token on the specified blockchain.
 * Unified entry point that dispatches to the appropriate chain-specific function.
 */
export async function deployToken(
  config: DeployConfig,
  onProgress?: (progress: DeployProgress) => void,
): Promise<DeployResult> {
  if (config.blockchain === "solana") {
    return deploySolanaToken(
      config.name,
      config.ticker,
      config.supply,
      config.solanaDecimals ?? 6,
      config.creatorAddress,
      config.image,
      onProgress,
    );
  } else {
    // Base Sepolia is the only EVM creation path. It is factory-gated and never
    // falls back to direct ERC-20 deployment or wallet transfers.
    const provider = typeof window !== "undefined" ? (window as any).ethereum : null;
    if (!provider) return { success: false, tokenAddress: "", txHash: "", error: "No Base Sepolia wallet detected." };
    try {
      onProgress?.({ step: "deploying_token", message: "Requesting Base Sepolia factory transaction..." });
      const result = await createBaseSepoliaToken(provider, { name: config.name, symbol: config.ticker, supply: BigInt(config.supply) * 10n ** BigInt(config.ethereumDecimals ?? 18) });
      onProgress?.({ step: "complete", message: "Token created on Base Sepolia.", tokenAddress: result.tokenAddress, txHash: result.txHash });
      return { success: true, tokenAddress: result.tokenAddress, txHash: result.txHash };
    } catch (err: any) {
      return { success: false, tokenAddress: "", txHash: "", error: err?.message || "Base Sepolia token creation failed." };
    }
  }
}
