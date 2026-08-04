import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { HiMiniRocketLaunch, HiMiniPhoto, HiMiniCurrencyDollar } from "react-icons/hi2";
import { Card, Input, Textarea } from "~/components/UI";
import { addToken, saveBondingCurveState, recordFeeCollection, type TokenData } from "~/services/tracker";
import { createBondingCurveState } from "~/services/bondingCurve";
import { checkAchievements } from "~/services/achievements";
import { creditReferrerForTokenCreation } from "~/services/referrals";
import { useAchievements } from "~/context/AchievementContext";
import { useWallet } from "~/context/WalletContext";
import { CREATION_FEES } from "~/config/fees";
import { sanitizeTokenName, sanitizeTicker, sanitizeText, validateSupply, validateImageDataUrl, isValidImageMime, isHeicFile, convertHeicToJpeg } from "~/utils/sanitize";
import { SocialSharePanel } from "~/components/SocialSharePanel";
import { isValidVideoUrl } from "~/components/VideoEmbed";
import { useUsdPrice, formatUsd } from "~/hooks/useUsdPrice";
import { broadcastNewLaunch, sendNewLaunchNotification } from "~/services/notifications";
import { addTokenToWallet, getExplorerUrl, isPhantomWatchAssetAvailable } from "~/services/addToWallet";
import { deployToken, type DeployStep, type DeployProgress } from "~/services/tokenDeploy";
import { getBondingCurveFactoryAddress } from "~/contracts/addresses";
import { BNB_TESTNET_CHAIN_ID, BNB_TESTNET, switchToBnbTestnet } from "~/config/networks";
import { getBnbTestnetFactoryAddress } from "~/services/bnbTestnetTokenCreation";
import { useMetaMaskBnb } from "~/services/metamaskBnb";

export const Route = createFileRoute("/create")({
  component: CreatePage,
});

function CreatePage() {
  const { connected, connect, solAddress, ethAddress, getAddressForChain } = useWallet();
  const bnbWallet = useMetaMaskBnb();
  const { triggerToast } = useAchievements();
  const usdPrices = useUsdPrice();
  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [description, setDescription] = useState("");
  const [supply, setSupply] = useState("1000000000");
  const [blockchain, setBlockchain] = useState<"solana" | "ethereum" | "bnbTestnet">("solana");
  const [imagePreview, setImagePreview] = useState<string>("");
  const [videoUrl, setVideoUrl] = useState("");
  const [deploying, setDeploying] = useState(false);
  const [deployStep, setDeployStep] = useState<DeployStep>("idle");
  const [deployMessage, setDeployMessage] = useState("");
  const [deployError, setDeployError] = useState("");
  const [deployTxHash, setDeployTxHash] = useState("");
  const [deployFeeTxHash, setDeployFeeTxHash] = useState("");
  const [show1Up, setShow1Up] = useState(false);
  const [createdToken, setCreatedToken] = useState<TokenData | null>(null);
  const [walletPrompt, setWalletPrompt] = useState(false);
  const [listOnPhantom, setListOnPhantom] = useState(true);
  const [walletListingAttempted, setWalletListingAttempted] = useState<"success" | "rejected" | "unavailable" | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reject SVGs
    if (file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg")) {
      alert("SVG images are not supported for security reasons.");
      return;
    }
    if (!isValidImageMime(file.type)) {
      alert("Only PNG, JPEG, GIF, WebP, and HEIC images are supported.");
      return;
    }
    // Handle HEIC conversion
    if (isHeicFile(file)) {
      try {
        const jpegDataUrl = await convertHeicToJpeg(file);
        setImagePreview(jpegDataUrl);
      } catch {
        alert("Failed to convert HEIC image. Please try a JPEG or PNG.");
      }
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      if (!validateImageDataUrl(result)) {
        alert("Invalid image data.");
        return;
      }
      setImagePreview(result);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    // Reject SVGs
    if (file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg")) {
      alert("SVG images are not supported for security reasons.");
      return;
    }
    if (!isValidImageMime(file.type)) {
      alert("Only PNG, JPEG, GIF, WebP, and HEIC images are supported.");
      return;
    }
    // Handle HEIC conversion
    if (isHeicFile(file)) {
      try {
        const jpegDataUrl = await convertHeicToJpeg(file);
        setImagePreview(jpegDataUrl);
      } catch {
        alert("Failed to convert HEIC image. Please try a JPEG or PNG.");
      }
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      if (!validateImageDataUrl(result)) {
        alert("Invalid image data.");
        return;
      }
      setImagePreview(result);
    };
    reader.readAsDataURL(file);
  };

  const handleLaunch = async () => {
    const cleanName = sanitizeTokenName(name);
    const cleanTicker = sanitizeTicker(ticker);
    const cleanDesc = sanitizeText(description, 500);
    const supplyNum = validateSupply(supply);
    const cleanVideoUrl = videoUrl.trim();

    if (!cleanName || !cleanTicker) {
      alert("Please enter a valid name and ticker");
      return;
    }

    if (supplyNum === null) {
      alert("Supply must be a positive number between 1 and 1,000,000,000,000");
      return;
    }

    // Validate video URL if provided
    if (cleanVideoUrl && !isValidVideoUrl(cleanVideoUrl)) {
      alert("Invalid video URL. Supported platforms: YouTube, Vimeo, TikTok.");
      return;
    }

    // Validate image preview if present
    if (imagePreview && !validateImageDataUrl(imagePreview)) {
      alert("Invalid image format. Only PNG, JPEG, GIF, and WebP are supported.");
      setImagePreview("");
      return;
    }

    if (!connected) {
      const wantsConnect = confirm("Connect wallet to launch your coin? (This will deploy to the blockchain!)");
      if (wantsConnect) {
        await connect(blockchain);
      }
      return;
    }

    if (blockchain === "bnbTestnet") {
      alert("BNB TESTNET NOT READY: no verified factory is configured. No transaction was sent.");
      return;
    }

    // Check that we have the correct wallet for the selected chain
    const walletAddr = getAddressForChain(blockchain === "bnbTestnet" ? "ethereum" : blockchain);
    if (!walletAddr) {
      alert(`Please connect a ${blockchain === "solana" ? "Solana" : "Ethereum"} wallet first.`);
      return;
    }

    // Reset deploy state
    setDeploying(true);
    setDeployError("");
    setDeployTxHash("");
    setDeployFeeTxHash("");
    setDeployStep("idle");
    setDeployMessage("Starting deployment...");

    try {
      // ── Deploy real on-chain token ──
      const result = await deployToken(
        {
          name: cleanName,
          ticker: cleanTicker,
          supply: supplyNum,
          blockchain,
          creatorAddress: walletAddr,
          image: imagePreview || undefined,
        },
        (progress: DeployProgress) => {
          setDeployStep(progress.step);
          setDeployMessage(progress.message);
          if (progress.txHash) {
            if (progress.step === "collecting_fee") {
              setDeployFeeTxHash(progress.txHash);
            } else {
              setDeployTxHash(progress.txHash);
            }
          }
        },
      );

      if (!result.success) {
        setDeployError(result.error || "Deployment failed");
        setDeploying(false);
        return;
      }

      // ── Record fee collection ──
      recordFeeCollection(blockchain, CREATION_FEES[blockchain]);

      // ── Build token data with real on-chain address ──
      const token: TokenData = {
        id: `token-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: cleanName,
        ticker: cleanTicker,
        description: cleanDesc,
        supply: supplyNum,
        blockchain,
        image: imagePreview,
        creator: walletAddr,
        marketCap: 0,
        price: 0.0001,
        volume24h: 0,
        priceHistory: [0.0001],
        createdAt: Date.now(),
        isDemo: false,
        videoUrl: cleanVideoUrl || undefined,
        tokenAddress: result.tokenAddress,
      };

      addToken(token);

      // Credit referrer if this user was referred
      creditReferrerForTokenCreation(walletAddr, blockchain, token.id);

      // Initialize bonding curve state
      const bcState = createBondingCurveState(
        token.id,
        supplyNum,
        blockchain,
        walletAddr,
      );
      saveBondingCurveState(bcState);

      // Check for newly unlocked achievements
      checkAchievements(walletAddr, triggerToast);

      setDeployTxHash(result.txHash);
      if (result.feeTxHash) setDeployFeeTxHash(result.feeTxHash);
      setDeployStep("complete");
      setDeploying(false);
      setShow1Up(true);
      setCreatedToken(token);

      // Attempt to add token to wallet
      setWalletListingAttempted(null);
      if (isPhantomWatchAssetAvailable() || (blockchain === "ethereum" && (window as any).ethereum)) {
        try {
          const addResult = await addTokenToWallet({
            tokenAddress: result.tokenAddress,
            ticker: cleanTicker,
            decimals: blockchain === "solana" ? 6 : 18,
            image: imagePreview || "",
            blockchain,
          });
          if (addResult.success && addResult.method === "watchAsset") {
            setWalletListingAttempted("success");
          } else {
            setWalletListingAttempted("unavailable");
          }
        } catch {
          setWalletListingAttempted("unavailable");
        }
      }

      setWalletPrompt(true);

      // Broadcast new launch for browser notifications across all tabs
      broadcastNewLaunch({
        tokenId: token.id,
        name: cleanName,
        ticker: cleanTicker,
        blockchain,
        initialPrice: token.price,
      });

      // Also send a notification directly for the creator's tab
      sendNewLaunchNotification({
        tokenId: token.id,
        name: cleanName,
        ticker: cleanTicker,
        blockchain,
        initialPrice: token.price,
      });

      setTimeout(() => {
        setShow1Up(false);
      }, 1500);
    } catch (err: any) {
      console.error("Token creation failed:", err);
      setDeployError(err?.message || "An unexpected error occurred during deployment");
      setDeploying(false);
    }
  };

  const feeLabel = blockchain === "solana"
    ? `${CREATION_FEES.solana} SOL`
    : blockchain === "bnbTestnet" ? "NOT COLLECTED — TESTNET"
    : `${CREATION_FEES.ethereum} ETH`;

  const feeUsd = blockchain === "solana"
    ? CREATION_FEES.solana * usdPrices.sol
    : CREATION_FEES.ethereum * usdPrices.eth;

  const chainConnected = blockchain === "solana" ? !!solAddress : !!ethAddress;
  const baseFactoryConfigured = getBondingCurveFactoryAddress(84532) !== null;
  const bnbFactoryConfigured = getBnbTestnetFactoryAddress() !== null;

  // Show the "List on Phantom?" toggle only when:
  // - On Solana chain
  // - Wallet is connected (solAddress exists)
  // - window.solana.request (wallet_watchAsset) is available
  const showPhantomToggle = blockchain === "solana" && !!solAddress && isPhantomWatchAssetAvailable();

  return (
    <div className="min-h-dvh bg-[#050505] py-10 relative">
      {/* 1-UP notification */}
      {show1Up && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.5 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0 }}
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none"
        >
          <div
            className="retro-card px-8 py-6 text-center neon-glow-yellow bg-[#00ff41]"
            style={{ borderColor: "#c49d00" }}
          >
            <p className="text-4xl mb-2">🪙</p>
            <p
              className="font-bold text-[rgba(0,255,65,0.2)]"
              style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "1rem" }}
            >
              +1 TOKEN
            </p>
            <p
              className="font-bold text-[rgba(0,255,65,0.2)] mt-1"
              style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.6rem" }}
            >
              LAUNCHED!
            </p>
          </div>
        </motion.div>
      )}

      <div className="max-w-2xl mx-auto px-4">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
          <h1
            className="text-2xl font-bold text-[#00ff41] mb-1 pixel-shadow-sm"
            style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "1rem" }}
          >
            LAUNCH A COIN
          </h1>
          <p className="text-[#e0ffe0] mb-8" style={{ fontFamily: '"VT323", monospace', fontSize: "1.15rem" }}>
            Create your meme coin and deploy to the blockchain ⭐
          </p>
        </motion.div>

        <div className="grid md:grid-cols-5 gap-6">
          {/* Form */}
          <div className="md:col-span-3 space-y-5">
            {/* Image upload */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.05 }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
            >
              <label
                className="text-sm font-bold text-[#e0ffe0] mb-2 block"
                style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem" }}
              >
                TOKEN IMAGE
              </label>
              <div
                className="border-2 border-dashed border-[rgba(0,255,65,0.2)] bg-[#0d120d] rounded-xl p-6 flex flex-col items-center gap-3 cursor-pointer hover:border-[#00ff41] transition-colors duration-150"
                onClick={() => fileInputRef.current?.click()}
              >
                {imagePreview ? (
                  <img src={imagePreview} alt="Preview" className="w-20 h-20 rounded-lg object-cover" style={{ border: "2px solid rgba(0,255,65,0.2)" }} />
                ) : (
                  <HiMiniPhoto className="text-[#b0d0b0] text-3xl" />
                )}
                <span className="text-sm text-[#b0d0b0]" style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}>
                  DRAG & DROP OR CLICK TO UPLOAD
                </span>
                <span className="text-xs text-[#6b6b55]" style={{ fontFamily: '"VT323", monospace', fontSize: "0.85rem" }}>
                  Supports PNG, JPEG, GIF, WebP, HEIC
                </span>
                <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/heic,image/heif,.heic,.heif" onChange={handleImageUpload} className="hidden" />
              </div>
            </motion.div>

            {/* Name */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.08 }}>
              <label className="text-sm font-bold text-[#e0ffe0] mb-2 block" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem" }}>
                COIN NAME
              </label>
              <Input value={name} onChange={setName} placeholder="e.g. Doge Mascot" />
            </motion.div>

            {/* Ticker */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.11 }}>
              <label className="text-sm font-bold text-[#e0ffe0] mb-2 block" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem" }}>
                TICKER (MAX 6)
              </label>
              <Input value={ticker} onChange={(v) => setTicker(v.toUpperCase().slice(0, 6))} placeholder="e.g. DOGM" maxLength={6} />
            </motion.div>

            {/* Description */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.14 }}>
              <label className="text-sm font-bold text-[#e0ffe0] mb-2 block" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem" }}>
                DESCRIPTION
              </label>
              <Textarea value={description} onChange={setDescription} placeholder="What makes your coin special?" rows={3} />
            </motion.div>

            {/* Supply */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.17 }}>
              <label className="text-sm font-bold text-[#e0ffe0] mb-2 block" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem" }}>
                TOTAL SUPPLY
              </label>
              <Input value={supply} onChange={setSupply} placeholder="1000000000" type="number" />
            </motion.div>

            {/* Video URL */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.18 }}>
              <label className="text-sm font-bold text-[#e0ffe0] mb-2 block" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem" }}>
                🎬 VIDEO URL (OPTIONAL)
              </label>
              <Input
                value={videoUrl}
                onChange={setVideoUrl}
                placeholder="https://youtube.com/watch?v=... or TikTok URL"
              />
              <div
                className="retro-card p-2 mt-2"
                style={{
                  borderColor: "rgba(255,180,60,0.4)",
                  background: "rgba(255,180,60,0.03)",
                }}
              >
                <p
                  className="text-[#ffb83c] text-xs"
                  style={{ fontFamily: '"VT323", monospace', fontSize: "0.85rem" }}
                >
                  ⚠️ CONTENT POLICY: No nudity, gore, hate speech, cyberbullying, or illegal content. Violations result in token removal.
                </p>
              </div>
            </motion.div>

            {/* Blockchain selector */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
              <label className="text-sm font-bold text-[#e0ffe0] mb-2 block" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem" }}>
                BLOCKCHAIN
              </label>
              <div className="grid grid-cols-2 gap-3">
                {(["solana", "ethereum", "bnbTestnet"] as const).map((chain) => (
                  <button
                    key={chain}
                    onClick={() => setBlockchain(chain)}
                    className={`retro-tab capitalize ${blockchain === chain ? "retro-tab-active" : ""}`}
                    style={{ fontFamily: '"Press Start 2P", monospace' }}
                  >
                    {chain === "solana" ? "◎ SOLANA" : chain === "bnbTestnet" ? "⬡ BNB TESTNET" : "Ξ BASE SEPOLIA"}
                  </button>
                ))}
              </div>
            </motion.div>

            {/* Fee display */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.23 }}>
              <div className="retro-card p-3 flex items-center gap-2 inline-flex">
                <HiMiniCurrencyDollar className="text-[#00ff41]" size={14} />
                <span className="text-xs text-[#e0ffe0]" style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}>
                  CREATION FEE:{" "}
                  <span className="text-[#00ff41] font-bold" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem" }}>
                    {feeLabel}
                  </span>
                  {feeUsd > 0 && (
                    <span className="text-[#b0d0b0] ml-1" style={{ fontFamily: '"VT323", monospace', fontSize: "0.85rem" }}>
                      (~{formatUsd(feeUsd)})
                    </span>
                  )}
                </span>
              </div>
              <p className="text-xs text-[#b0d0b0] mt-1" style={{ fontFamily: '"VT323", monospace', fontSize: "0.85rem" }}>
                + network gas fees. Fee goes to ignoshashi.
              </p>
            </motion.div>

            {/* Wallet status */}
            {blockchain === "solana" && !solAddress && (
              <div className="retro-card bg-[#0d120d] p-2 text-center">
                <p className="text-xs text-[#00ff41]" style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}>
                  ⚠ Connect a Solana wallet (Phantom, Solflare, etc.)
                </p>
              </div>
            )}
            {blockchain !== "solana" && !ethAddress && (
              <div className="retro-card bg-[#0d120d] p-2 text-center">
                <p className="text-xs text-[#00ff41]" style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}>
                  ⚠ Connect a Base Sepolia wallet (MetaMask, Coinbase, etc.)
                </p>
              </div>
            )}

            {/* List on Phantom toggle — only for Solana with Phantom connected */}
            {showPhantomToggle && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.24 }}>
                <label className="retro-toggle">
                  <input
                    type="checkbox"
                    checked={listOnPhantom}
                    onChange={(e) => setListOnPhantom(e.target.checked)}
                  />
                  <span className="retro-toggle-track">
                    <span className="retro-toggle-thumb" />
                  </span>
                  <span className="retro-toggle-label">LIST ON PHANTOM</span>
                </label>
              </motion.div>
            )}

            {blockchain === "ethereum" && !baseFactoryConfigured && (
              <div className="retro-card bg-[#21180d] p-2 text-center">
                <p className="text-xs text-[#ffd23f]" style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}>
                  ⏸ Base Sepolia creation is gated until the verified factory is configured.
                </p>
              </div>
            )}
            {blockchain === "bnbTestnet" && (
              <div className="retro-card bg-[#21180d] p-3 text-center">
                <p className="text-xs text-[#ffd23f]" style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}>
                  🧪 BNB TESTNET QA — CREATION ONLY. Trading, fees, and graduation are disabled.
                </p>
                {!bnbWallet.address ? (
                  <button type="button" onClick={() => void bnbWallet.connect()} className="retro-btn retro-btn-yellow mt-3" style={{ fontFamily: '"Press Start 2P", monospace' }}>
                    🦊 CONNECT METAMASK
                  </button>
                ) : (
                  <div className="mt-3 space-y-2">
                    <p className="text-[#00ff41]" style={{ fontFamily: '"VT323", monospace', fontSize: "1.1rem" }}>CONNECTED: {bnbWallet.shortAddress}</p>
                    {!bnbWallet.isBnbTestnet && <button type="button" onClick={() => void bnbWallet.connect()} className="retro-btn retro-btn-outline" style={{ fontFamily: '"Press Start 2P", monospace' }}>SWITCH TO BNB TESTNET</button>}
                    <p className="text-[#b0d0b0]" style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem" }}>Verified factory: {bnbWallet.factoryAddress}</p>
                  </div>
                )}
                {bnbWallet.error && <p className="text-[#ef476f] mt-2" role="alert" style={{ fontFamily: '"VT323", monospace', fontSize: "0.95rem" }}>{bnbWallet.error}</p>}
              </div>
            )}
            {/* Launch button */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.26 }}>
              <button
                onClick={handleLaunch}
                disabled={deploying || (blockchain === "ethereum" && !baseFactoryConfigured) || blockchain === "bnbTestnet"}
                className="retro-btn retro-btn-orange neon-glow-yellow w-full justify-center text-[0.6rem] py-3"
                style={{ fontFamily: '"Press Start 2P", monospace' }}
              >
                <HiMiniRocketLaunch size={18} />
                {deploying ? "DEPLOYING..." : blockchain === "bnbTestnet" ? "BNB TESTNET NOT READY" : blockchain === "ethereum" && !baseFactoryConfigured ? "BASE SEPOLIA NOT READY" : connected ? "DEPLOY COIN" : "CONNECT & DEPLOY"}
              </button>

              {/* Deploy progress indicator */}
              {deploying && deployStep !== "idle" && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="retro-card p-3 mt-3"
                  style={{ borderColor: "rgba(0,255,65,0.2)" }}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-[#ffb347] animate-pulse" />
                    <span
                      className="text-[#e0ffe0]"
                      style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
                    >
                      {deployMessage}
                    </span>
                  </div>
                  {deployStep !== "complete" && deployStep !== "error" && (
                    <div className="mt-2 h-1 bg-[#0d120d] rounded overflow-hidden">
                      <motion.div
                        className="h-full bg-[#ffb347]"
                        initial={{ width: "0%" }}
                        animate={{
                          width:
                            deployStep === "collecting_fee"
                              ? "25%"
                              : deployStep === "deploying_token"
                                ? "50%"
                                : deployStep === "minting_supply"
                                  ? "75%"
                                  : "90%",
                        }}
                        transition={{ duration: 0.3 }}
                      />
                    </div>
                  )}
                </motion.div>
              )}
            </motion.div>
          </div>

          {/* Live Preview */}
          <motion.div className="md:col-span-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}>
            <label className="text-sm font-bold text-[#e0ffe0] mb-3 block" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem" }}>
              PREVIEW
            </label>
            <Card className="sticky top-20">
              <div className="flex items-start gap-3 mb-3">
                <div
                  className="w-12 h-12 rounded-lg bg-[#0d120d] border-2 border-[rgba(0,255,65,0.2)] flex items-center justify-center shrink-0 text-lg font-bold overflow-hidden"
                  style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.6rem", color: "#00ff41" }}
                >
                  {imagePreview ? (
                    <img src={imagePreview} alt="" className="w-full h-full object-cover" />
                  ) : (
                    (ticker || "??").slice(0, 2)
                  )}
                </div>
                <div>
                  <div className="font-bold text-[#ffffff] text-sm" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem" }}>
                    {name || "COIN NAME"}
                  </div>
                  <div className="text-xs text-[#e0ffe0]" style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}>
                    ${ticker || "TICKER"}
                  </div>
                  <div className="text-sm font-bold text-[#00ff41] mt-1" style={{ fontFamily: '"VT323", monospace', fontSize: "1.1rem" }}>
                    $0.0001
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs mb-3" style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem", color: "#e0ffe0" }}>
                <span>MC: $0</span>
                <span>Vol: $0</span>
              </div>
              {/* Bonding curve progress bar */}
              <div className="mb-3">
                <div className="h-3 rounded-sm overflow-hidden" style={{ background: "#0d120d", border: "1px solid rgba(0,255,65,0.15)" }}>
                  <div className="h-full" style={{ width: "0%", background: "linear-gradient(90deg, #ff6b35, #ffb347)" }} />
                </div>
                <div className="flex justify-between mt-0.5" style={{ fontFamily: '"VT323", monospace', fontSize: "0.8rem", color: "#b0d0b0" }}>
                  <span>0/{supply ? parseInt(supply).toLocaleString() : "?"} tokens</span>
                  <span>0% to 🎓</span>
                </div>
              </div>
              <div className="h-10 bg-[#0d120d] rounded-lg border border-[rgba(0,255,65,0.2)]" />
              <div className="flex items-center justify-between mt-3 pt-2 border-t-2 border-[#0d120d]">
                <span className="text-xs text-[#b0d0b0]" style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem" }}>YOU</span>
                <span className="text-xs text-[#b0d0b0]" style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem" }}>JUST NOW</span>
              </div>
              <div className="flex gap-2 mt-3">
                <button className="flex-1 retro-btn retro-btn-turquoise text-[0.4rem] justify-center" style={{ fontFamily: '"Press Start 2P", monospace' }}>BUY</button>
                <button className="flex-1 retro-btn retro-btn-pink text-[0.4rem] justify-center" style={{ fontFamily: '"Press Start 2P", monospace' }}>SELL</button>
              </div>
            </Card>
          </motion.div>
        </div>

        {/* Social Share Panel — appears after token creation */}
        {createdToken && (
          <SocialSharePanel
            tokenName={createdToken.name}
            tokenTicker={createdToken.ticker}
            tokenUrl={`${typeof window !== "undefined" ? window.location.origin : ""}/token/${createdToken.id}`}
            tokenId={createdToken.id}
          />
        )}

        {/* Wallet prompt — appears after token creation */}
        {walletPrompt && createdToken && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="retro-card p-4 mt-4 text-center"
            style={{
              borderColor: "rgba(0,255,65,0.3)",
              boxShadow: "0 0 20px rgba(0,255,65,0.1)",
            }}
          >
            <p className="text-2xl mb-2">
              {walletListingAttempted === "success" ? "💳" : "🪙"}
            </p>
            <p
              className="text-[#00ff41] font-bold mb-1"
              style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.45rem" }}
            >
              TOKEN DEPLOYED!
            </p>
            <p
              className="text-[#e0ffe0] mb-1"
              style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
            >
              ${createdToken.ticker} is live on {createdToken.blockchain === "solana" ? "Solana" : "Ethereum"}!
            </p>
            {/* Token address */}
            <div className="mb-2">
              <p className="text-xs text-[#b0d0b0] mb-1" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.35rem" }}>
                CONTRACT ADDRESS
              </p>
              <div className="bg-[#0d120d] border border-[rgba(0,255,65,0.2)] rounded px-2 py-1 inline-block">
                <code
                  className="text-[#00ff41] break-all"
                  style={{ fontFamily: '"VT323", monospace', fontSize: "0.85rem" }}
                >
                  {createdToken.tokenAddress}
                </code>
              </div>
            </div>
            {/* Transaction hashes */}
            {deployTxHash && deployTxHash !== createdToken.tokenAddress && (
              <div className="mb-2">
                <p className="text-xs text-[#b0d0b0] mb-1" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.35rem" }}>
                  DEPLOY TX
                </p>
                <a
                  href={getExplorerUrl(createdToken.blockchain === "solana" ? "solana" : "ethereum", deployTxHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#ffb347] hover:underline break-all"
                  style={{ fontFamily: '"VT323", monospace', fontSize: "0.85rem" }}
                >
                  {deployTxHash.slice(0, 20)}...
                </a>
              </div>
            )}
            {deployFeeTxHash && (
              <div className="mb-2">
                <p className="text-xs text-[#b0d0b0] mb-1" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.35rem" }}>
                  FEE TX
                </p>
                <a
                  href={getExplorerUrl(createdToken.blockchain === "solana" ? "solana" : "ethereum", deployFeeTxHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#ffb347] hover:underline break-all"
                  style={{ fontFamily: '"VT323", monospace', fontSize: "0.85rem" }}
                >
                  {deployFeeTxHash.slice(0, 20)}...
                </a>
              </div>
            )}
            {walletListingAttempted === "success" ? (
              <p
                className="text-[#e0ffe0] mt-2"
                style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
              >
                🎉 ${createdToken.ticker} added to your wallet!
              </p>
            ) : walletListingAttempted === "unavailable" ? (
              <p
                className="text-[#e0ffe0] mt-2"
                style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
              >
                Wallet listing wasn't available — you can add it manually.
              </p>
            ) : (
              <p
                className="text-[#e0ffe0] mt-2"
                style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
              >
                Check your wallet to add ${createdToken.ticker} manually.
              </p>
            )}
            <div className="flex gap-2 justify-center flex-wrap mt-3">
              <button
                onClick={() => setWalletPrompt(false)}
                className="retro-btn retro-btn-turquoise text-[0.4rem] px-3 py-1.5"
                style={{ fontFamily: '"Press Start 2P", monospace' }}
              >
                GOT IT
              </button>
              <Link
                to="/token/$id"
                params={{ id: createdToken.id }}
                className="retro-btn retro-btn-orange text-[0.4rem] px-3 py-1.5"
                style={{ fontFamily: '"Press Start 2P", monospace' }}
              >
                VIEW TOKEN
              </Link>
            </div>
          </motion.div>
        )}

        {/* Deploy error */}
        {deployError && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="retro-card p-4 mt-4 text-center"
            style={{
              borderColor: "rgba(239,71,111,0.4)",
              boxShadow: "0 0 20px rgba(239,71,111,0.15)",
            }}
          >
            <p className="text-2xl mb-2">❌</p>
            <p
              className="text-[#ef476f] font-bold mb-2"
              style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.45rem" }}
            >
              DEPLOYMENT FAILED
            </p>
            <p
              className="text-[#e0ffe0] mb-3"
              style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
            >
              {deployError}
            </p>
            <button
              onClick={() => setDeployError("")}
              className="retro-btn retro-btn-pink text-[0.4rem] px-3 py-1.5"
              style={{ fontFamily: '"Press Start 2P", monospace' }}
            >
              DISMISS
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}
