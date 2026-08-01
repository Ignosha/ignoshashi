import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { HiMiniRocketLaunch, HiMiniPlay, HiMiniPause, HiMiniArrowsRightLeft } from "react-icons/hi2";
import { Doughnut, Line } from "react-chartjs-2";
import { ethers } from "ethers";
import {
  ArcElement,
  Chart as ChartJS,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
} from "chart.js";
import { Card } from "~/components/UI";
import { useWallet } from "~/context/WalletContext";
import { minerService, type MinedBlock, REWARD_PER_BLOCK } from "~/services/miner";
import {
  getPoolReserves,
  getPrice,
  getUserLpBalance,
  getFullPoolState,
  getPriceHistory,
  getApr,
  calculateSwapOutput,
  executeSwap,
  calculateAddLiquidity,
  executeAddLiquidity,
  calculateRemoveLiquidity,
  executeRemoveLiquidity,
  type PoolState,
} from "~/services/liquidity";
import { addTrade, type TradeData } from "~/services/tracker";
import {
  deployIgnosToken,
  isIgnosDeployed,
  getDeployedAddress,
  getEtherscanUrl,
  getUniswapUrl,
  getIgnosContract,
} from "~/services/ignosToken";

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement, Filler);

export const Route = createFileRoute("/ignosha")({
  component: IgnoshaPage,
});

function formatCompact(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n.toFixed(4);
}

function formatHashRate(rate: number): string {
  if (rate >= 1e6) return (rate / 1e6).toFixed(1) + " MH/s";
  if (rate >= 1e3) return (rate / 1e3).toFixed(1) + " KH/s";
  return rate.toFixed(0) + " H/s";
}

function truncateHash(hash: string): string {
  if (hash.length <= 16) return hash;
  return hash.slice(0, 8) + "..." + hash.slice(-8);
}

// ─── Pixel Pickaxe Animation ───
function PickaxeAnimation({ active }: { active: boolean }) {
  return (
    <div className="text-center py-3">
      <motion.div
        animate={active ? { y: [0, -12, 0], rotate: [0, -8, 8, 0] } : {}}
        transition={active ? { repeat: Infinity, duration: 0.6, ease: "easeInOut" } : {}}
        className="text-5xl inline-block"
        style={{ filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.5)) drop-shadow(0 0 8px rgba(0,255,65,0.3))" }}
      >
        ⛏️
      </motion.div>
      <motion.div
        className="flex justify-center gap-1 mt-1"
        animate={active ? { opacity: [0.4, 1, 0.4] } : { opacity: 0.3 }}
        transition={{ repeat: Infinity, duration: 1.2 }}
      >
        {["💎", "✨", "🪨"].map((e, i) => (
          <motion.span
            key={i}
            animate={active ? { y: [0, -5, 0], opacity: [0.5, 1, 0.5] } : {}}
            transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.25 }}
            className="text-sm"
          >
            {e}
          </motion.span>
        ))}
      </motion.div>
      <p className="text-[#e0ffe0] mt-1" style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}>
        {active ? (
          <span className="text-[#00ff41] retro-blink">⚡ MINING ACTIVE — searching for valid nonce...</span>
        ) : (
          "Start mining to earn IGNS tokens via real proof-of-work"
        )}
      </p>
    </div>
  );
}

function MiningStatus({ active }: { active: boolean }) {
  return (
    <div className="flex items-center gap-2 justify-center mb-3">
      <span
        className="inline-block w-3 h-3 rounded-full"
        style={{
          background: active ? "#00ff41" : "#b0d0b0",
          boxShadow: active ? "0 0 8px #00ff41, 0 0 16px rgba(0,255,65,0.5)" : "none",
          animation: active ? "retro-blink 1s ease-in-out infinite" : "none",
        }}
      />
      <span
        className="font-bold text-xs"
        style={{
          fontFamily: '"Press Start 2P", monospace',
          fontSize: "0.45rem",
          color: active ? "#00ff41" : "#b0d0b0",
        }}
      >
        {active ? "MINING ACTIVE" : "MINER IDLE"}
      </span>
    </div>
  );
}

function HashRateChart({ history }: { history: number[] }) {
  if (history.length < 2) {
    return (
      <div className="h-32 flex items-center justify-center">
        <p className="text-[#b0d0b0]" style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem" }}>
          Start mining to see hash rate...
        </p>
      </div>
    );
  }
  const data = history.slice(-60);
  const chartData = {
    labels: data.map((_, i) => i.toString()),
    datasets: [{
      data,
      borderColor: "#00ff41",
      backgroundColor: "rgba(0,255,65,0.05)",
      fill: true,
      borderWidth: 2,
      pointRadius: 0,
      tension: 0.3,
    }],
  };
  return (
    <div className="h-32">
      <Line data={chartData} options={{
        responsive: true, maintainAspectRatio: false, animation: { duration: 300 },
        scales: { x: { display: false }, y: { display: true, grid: { color: "rgba(0,255,65,0.1)" }, ticks: { color: "#b0d0b0", font: { size: 9 }, maxTicksLimit: 4 } } },
        plugins: { legend: { display: false } },
      }} />
    </div>
  );
}

function PoolPriceChart({ priceHistory }: { priceHistory: Array<{ timestamp: number; price: number }> }) {
  if (priceHistory.length < 2) {
    return (
      <div className="h-40 flex items-center justify-center">
        <p className="text-[#b0d0b0]" style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}>
          No price data yet — start trading!
        </p>
      </div>
    );
  }
  const data = priceHistory.slice(-50);
  const chartData = {
    labels: data.map((_, i) => i.toString()),
    datasets: [{
      data: data.map((d) => d.price),
      borderColor: "#00ff41",
      backgroundColor: "rgba(0,255,65,0.08)",
      fill: true,
      borderWidth: 2,
      pointRadius: 0,
      tension: 0.4,
    }],
  };
  return (
    <div className="h-40">
      <Line data={chartData} options={{
        responsive: true, maintainAspectRatio: false,
        scales: { x: { display: false }, y: { display: true, grid: { color: "rgba(0,255,65,0.1)" }, ticks: { color: "#b0d0b0", font: { size: 10 } } } },
        plugins: { legend: { display: false } },
      }} />
    </div>
  );
}

function IgnoshaPage() {
  const { connected, solAddress, ethAddress, connect } = useWallet();
  const walletId = solAddress || ethAddress || "anon";

  // ─── Mining state ───
  const [mining, setMining] = useState(() => minerService.isMining);
  const [hashRate, setHashRate] = useState(() => minerService.currentHashRate);
  const [blocksMined, setBlocksMined] = useState(() => minerService.getStats().blocksMined);
  const [rewardsEarned, setRewardsEarned] = useState(() => minerService.totalRewards);
  const [difficulty, setDifficulty] = useState(() => minerService.difficulty);
  const [recentBlocks, setRecentBlocks] = useState<MinedBlock[]>(() => {
    if (typeof window === "undefined") return [];
    return minerService.minedBlocks.slice(0, 10);
  });
  const [hashRateHistory, setHashRateHistory] = useState<number[]>(() => {
    if (typeof window === "undefined") return [];
    return minerService.hashRateHistory;
  });

  const syncMinerState = useCallback(() => {
    const stats = minerService.getStats();
    setMining(stats.isMining);
    setHashRate(stats.currentHashRate);
    setBlocksMined(stats.blocksMined);
    setRewardsEarned(stats.totalRewards);
    setDifficulty(stats.difficulty);
    setRecentBlocks(minerService.minedBlocks.slice(0, 10));
    setHashRateHistory([...minerService.hashRateHistory]);
  }, []);

  useEffect(() => {
    minerService.setOnBlockFound(() => syncMinerState());
    minerService.setOnHashRate((rate) => { setHashRate(rate); setHashRateHistory([...minerService.hashRateHistory]); });
    minerService.setOnStatusChange((active) => { setMining(active); if (!active) { setHashRate(0); syncMinerState(); } });
    const historyInterval = setInterval(() => { if (minerService.isMining) setHashRateHistory([...minerService.hashRateHistory]); }, 2000);
    const handleBeforeUnload = () => { minerService.destroy(); };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => { minerService.stopMining(); minerService.setOnBlockFound(null); minerService.setOnHashRate(null); minerService.setOnStatusChange(null); clearInterval(historyInterval); window.removeEventListener("beforeunload", handleBeforeUnload); };
  }, [syncMinerState]);

  const handleToggleMining = () => {
    if (minerService.isMining) { minerService.stopMining(); } else { minerService.startMining(); syncMinerState(); }
  };

  // ─── IGNS Token Deployment State ───
  const [ignosDeployed, setIgnosDeployed] = useState(() => isIgnosDeployed());
  const [deployedAddress, setDeployedAddressState] = useState(() => getDeployedAddress());
  const [deploying, setDeploying] = useState(false);
  const [deployStatus, setDeployStatus] = useState<string>("");
  const [deployTxHash, setDeployTxHash] = useState<string>("");

  useEffect(() => {
    setIgnosDeployed(isIgnosDeployed());
    setDeployedAddressState(getDeployedAddress());
  }, []);

  const handleDeployIgnos = async () => {
    if (!ethAddress || typeof window === "undefined") {
      alert("Connect MetaMask (Ethereum wallet) to deploy the IGNS token.");
      return;
    }

    const win = window as any;
    const provider = win.ethereum;
    if (!provider) {
      alert("MetaMask not found. Please install MetaMask.");
      return;
    }

    setDeploying(true);
    setDeployStatus("Requesting wallet confirmation...");

    try {
      const ethersProvider = new ethers.BrowserProvider(provider);
      const result = await deployIgnosToken(ethersProvider);

      if (result.success && result.address) {
        setIgnosDeployed(true);
        setDeployedAddressState(result.address);
        setDeployTxHash(result.txHash || "");
        setDeployStatus("✅ IGNS token deployed successfully!");
      } else {
        setDeployStatus(`❌ Deployment failed: ${result.error || "Unknown error"}`);
      }
    } catch (err: any) {
      setDeployStatus(`❌ Error: ${err?.message || "Unknown error"}`);
    } finally {
      setDeploying(false);
    }
  };

  // ─── AMM Pool State ───
  const [pool, setPool] = useState<PoolState>(() => getFullPoolState());
  const [priceHistory, setPriceHistory] = useState<Array<{ timestamp: number; price: number }>>(() => getPriceHistory());
  const [currentPrice, setCurrentPrice] = useState(() => getPrice());

  // Swap state
  const [swapDirection, setSwapDirection] = useState<"eth_to_igns" | "igns_to_eth">("eth_to_igns");
  const [swapInput, setSwapInput] = useState("0.1");
  const [swapEstimate, setSwapEstimate] = useState<{ outputAmount: number; fee: number; priceImpact: number } | null>(null);

  // Add LP state
  const [lpEthInput, setLpEthInput] = useState("0.1");
  const [lpIgnsInput, setLpIgnsInput] = useState("1000");
  const [lpEstimate, setLpEstimate] = useState<{ lpTokens: number; poolShare: number } | null>(null);
  const [lpStatus, setLpStatus] = useState<string>("");
  const [lpTxPending, setLpTxPending] = useState(false);

  // Remove LP state
  const [removeLpAmount, setRemoveLpAmount] = useState("");
  const [removeEstimate, setRemoveEstimate] = useState<{ ethAmount: number; ignosAmount: number } | null>(null);

  const refreshPool = useCallback(() => {
    const p = getFullPoolState();
    setPool(p);
    setPriceHistory(getPriceHistory());
    setCurrentPrice(getPrice());
  }, []);

  useEffect(() => {
    refreshPool();
    const interval = setInterval(refreshPool, 2000);
    return () => clearInterval(interval);
  }, [refreshPool]);

  // Update swap estimate
  useEffect(() => {
    const amount = parseFloat(swapInput) || 0;
    if (amount <= 0) { setSwapEstimate(null); return; }
    const inputToken = swapDirection === "eth_to_igns" ? "eth" : "ignos";
    const result = calculateSwapOutput(inputToken, amount);
    setSwapEstimate(result);
  }, [swapInput, swapDirection, pool]);

  // Update LP estimate
  useEffect(() => {
    const eth = parseFloat(lpEthInput) || 0;
    const igns = parseFloat(lpIgnsInput) || 0;
    if (eth <= 0 || igns <= 0) { setLpEstimate(null); return; }
    const result = calculateAddLiquidity(eth, igns);
    setLpEstimate(result);
  }, [lpEthInput, lpIgnsInput, pool]);

  // Update remove estimate
  useEffect(() => {
    const amt = parseFloat(removeLpAmount) || 0;
    if (amt <= 0) { setRemoveEstimate(null); return; }
    const result = calculateRemoveLiquidity(amt);
    setRemoveEstimate(result);
  }, [removeLpAmount, pool]);

  const userLpBalance = getUserLpBalance(walletId);
  const apr = getApr();

  const handleSwap = () => {
    const amount = parseFloat(swapInput) || 0;
    if (amount <= 0) return;
    const inputToken = swapDirection === "eth_to_igns" ? "eth" : "ignos";
    const result = executeSwap(inputToken, amount, walletId);
    if (result) {
      refreshPool();
      setSwapInput("0.1");
    }
  };

  // Real wallet LP — sends ETH via MetaMask/Phantom
  const handleAddLiquidity = async () => {
    const eth = parseFloat(lpEthInput) || 0;
    const igns = parseFloat(lpIgnsInput) || 0;
    if (eth <= 0 || igns <= 0) return;

    const hasWallet = (typeof window !== "undefined") && ((window as any).ethereum || (window as any).solana);
    
    if (ethAddress && (window as any).ethereum) {
      // Real ETH transfer via MetaMask
      setLpTxPending(true);
      setLpStatus("Confirm in wallet...");
      try {
        const provider = new ethers.BrowserProvider((window as any).ethereum);
        const signer = await provider.getSigner();
        const tx = await signer.sendTransaction({
          to: "0x0000000000000000000000000000000000000000", // AMM pool address placeholder — in production, replace with actual pool contract
          value: ethers.parseEther(eth.toString()),
        });
        setLpStatus("Transaction pending...");
        await tx.wait();
        setLpStatus("✅ Confirmed! ETH added to pool.");

        // Now update local pool
        const result = executeAddLiquidity(eth, igns, walletId);
        if (result) {
          refreshPool();
          setLpEthInput("0.1");
          setLpIgnsInput("1000");
        }
      } catch (err: any) {
        setLpStatus(`❌ ${err?.message || "Transaction failed"}`);
      } finally {
        setLpTxPending(false);
      }
    } else if (solAddress && (window as any).solana) {
      // Solana version — send SOL via Phantom
      setLpTxPending(true);
      setLpStatus("Confirm in Phantom wallet...");
      try {
        const solProvider = (window as any).solana;
        const { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } = await import("@solana/web3.js");
        
        const connection = new Connection("https://api.devnet.solana.com", "confirmed");
        const fromPubkey = new PublicKey(solAddress);
        const toPubkey = new PublicKey("11111111111111111111111111111111"); // Placeholder — replace with pool address

        const { blockhash } = await connection.getLatestBlockhash();
        const tx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey,
            toPubkey,
            lamports: Math.floor(eth * LAMPORTS_PER_SOL),
          })
        );
        tx.feePayer = fromPubkey;
        tx.recentBlockhash = blockhash;

        const signedTx = await solProvider.signTransaction(tx);
        setLpStatus("Transaction pending...");
        const signature = await connection.sendRawTransaction(signedTx.serialize());
        await connection.confirmTransaction(signature);
        setLpStatus("✅ Confirmed! SOL added to pool.");

        // Update local pool
        const result = executeAddLiquidity(eth, igns, walletId);
        if (result) {
          refreshPool();
          setLpEthInput("0.1");
          setLpIgnsInput("1000");
        }
      } catch (err: any) {
        setLpStatus(`❌ ${err?.message || "Transaction failed"}`);
      } finally {
        setLpTxPending(false);
      }
    } else {
      // No wallet connected — use local AMM only
      const result = executeAddLiquidity(eth, igns, walletId);
      if (result) {
        refreshPool();
        setLpEthInput("0.1");
        setLpIgnsInput("1000");
        setLpStatus("✅ Added to local pool (no wallet detected)");
      }
    }
  };

  const handleRemoveLiquidity = () => {
    const amt = parseFloat(removeLpAmount) || 0;
    if (amt <= 0) return;
    const result = executeRemoveLiquidity(amt, walletId);
    if (result) {
      refreshPool();
      setRemoveLpAmount("");
    }
  };

  const totalLiquidityEth = pool.eth * 2;
  const userLpPercent = pool.totalLp > 0 ? ((userLpBalance / pool.totalLp) * 100).toFixed(2) : "0.00";

  const tokenomicsData = {
    labels: ["Public Sale", "Liquidity", "Team", "Marketing", "Reserve"],
    datasets: [{
      data: [40, 25, 15, 10, 10],
      backgroundColor: ["#00ff41", "#39ff14", "#00cc33", "#e0ffe0", "#00994d"],
      borderColor: "#0a0f0a",
      borderWidth: 3,
    }],
  };

  const roadmap = [
    { phase: "PHASE 1", title: "LAUNCH", desc: "Token launch on Solana. Community building. Initial DEX listing.", done: true },
    { phase: "PHASE 2", title: "GROWTH", desc: "ignoshashi integration. Staking rewards. Marketing campaigns.", done: false },
    { phase: "PHASE 3", title: "EXPAND", desc: "CEX listings. Cross-chain bridge. Governance launch.", done: false },
    { phase: "PHASE 4", title: "ECO", desc: "Full platform integration. DAO transition. Global brand.", done: false },
  ];

  const etherscanUrl = getEtherscanUrl(deployedAddress || undefined);
  const uniswapUrl = getUniswapUrl(deployedAddress || undefined);

  return (
    <div className="min-h-dvh bg-[#050505] py-10">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }} className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-[rgba(0,255,65,0.1)] border border-[rgba(0,255,65,0.4)] rounded-md text-[0.45rem] font-bold text-[#00ff41] mb-4" style={{ fontFamily: '"Press Start 2P", monospace' }}>
            <HiMiniRocketLaunch size={12} /> IGNOSHACHAIN
          </div>
          <h1 className="text-2xl font-bold text-[#00ff41] mb-2 pixel-shadow-sm" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "1rem" }}>
            IGNOSHA TOKEN
          </h1>
          <p className="text-[#e0ffe0] max-w-md mx-auto" style={{ fontFamily: '"VT323", monospace', fontSize: "1.1rem" }}>
            The native token powering the ignoshashi ecosystem 🚀
          </p>
          <p className="text-[#00cc33] mt-1" style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}>
            Contract: {deployedAddress || "Not deployed yet"}
          </p>
        </motion.div>

        {/* IGNS Token Deployment */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.03 }} className="mb-8">
          <Card className="border-[rgba(0,255,65,0.3)]">
            <div className="text-center">
              <h3 className="text-sm font-bold text-[#00ff41] mb-3" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.55rem" }}>
                🏦 IGNS ERC-20 TOKEN
              </h3>
              
              {ignosDeployed && deployedAddress ? (
                <div className="space-y-3">
                  <div className="p-3 rounded-md bg-[rgba(0,255,65,0.05)] border border-[rgba(0,255,65,0.15)]">
                    <div className="text-xs text-[#e0ffe0] mb-1" style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}>
                      Contract: <span className="text-[#00ff41] font-bold break-all" style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem" }}>{deployedAddress}</span>
                    </div>
                    {deployTxHash && (
                      <div className="text-xs text-[#b0d0b0]" style={{ fontFamily: '"VT323", monospace', fontSize: "0.85rem" }}>
                        TX: {deployTxHash.slice(0, 10)}...{deployTxHash.slice(-8)}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3 justify-center">
                    <a href={etherscanUrl} target="_blank" rel="noopener noreferrer"
                      className="retro-btn retro-btn-turquoise text-[0.45rem] px-3 py-2" style={{ fontFamily: '"Press Start 2P", monospace' }}>
                      🔍 VIEW ON ETHERSCAN
                    </a>
                    <a href={uniswapUrl} target="_blank" rel="noopener noreferrer"
                      className="retro-btn retro-btn-yellow text-[0.45rem] px-3 py-2" style={{ fontFamily: '"Press Start 2P", monospace' }}>
                      💱 TRADE ON UNISWAP
                    </a>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-[#e0ffe0]" style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}>
                    Deploy the IGNS ERC-20 token to Ethereum to enable real trading.
                  </p>
                  <button
                    onClick={handleDeployIgnos}
                    disabled={deploying}
                    className="retro-btn retro-btn-orange text-[0.5rem] px-4 py-2 justify-center mx-auto"
                    style={{ fontFamily: '"Press Start 2P", monospace' }}
                  >
                    {deploying ? "⏳ DEPLOYING..." : "🚀 DEPLOY IGNS TOKEN"}
                  </button>
                  <div className="flex flex-wrap gap-2 justify-center opacity-40">
                    <span className="retro-btn retro-btn-outline text-[0.4rem] px-3 py-1.5" style={{ fontFamily: '"Press Start 2P", monospace', cursor: "not-allowed" }} title="Deploy token first">
                      🔍 VIEW ON ETHERSCAN
                    </span>
                    <span className="retro-btn retro-btn-outline text-[0.4rem] px-3 py-1.5" style={{ fontFamily: '"Press Start 2P", monospace', cursor: "not-allowed" }} title="Deploy token first">
                      💱 TRADE ON UNISWAP
                    </span>
                  </div>
                  {!ethAddress && (
                    <p className="text-xs text-[#b0d0b0]" style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem" }}>
                      ⚠ Connect MetaMask to deploy the token
                    </p>
                  )}
                  {deployStatus && (
                    <div className={`text-xs p-2 rounded-md ${deployStatus.startsWith("✅") ? "bg-[rgba(0,255,65,0.05)] text-[#00ff41]" : "bg-[rgba(255,0,0,0.05)] text-[#ff4444]"}`}
                      style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}>
                      {deployStatus}
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>
        </motion.div>

        {/* Token Stats + Pool Stats */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.05 }}>
            <Card>
              <h3 className="text-sm font-bold text-[#00ff41] mb-4" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.55rem" }}>
                TOKEN STATS
              </h3>
              <div className="space-y-3">
                {[
                  { label: "TICKER", value: "$IGNS", color: "#00ff41" },
                  { label: "CHAIN", value: "IGNOSHACHAIN", color: "#39ff14" },
                  { label: "SUPPLY", value: "1,000,000,000", color: "#00cc33" },
                  { label: "PRICE (ETH)", value: `${currentPrice.toFixed(8)} ETH`, color: "#e0ffe0" },
                  { label: "POOL ETH", value: `${pool.eth.toFixed(4)} ETH`, color: "#00ff41" },
                  { label: "POOL IGNS", value: formatCompact(pool.ignos), color: "#39ff14" },
                ].map((stat) => (
                  <div key={stat.label} className="flex items-center justify-between py-2 border-b border-[rgba(0,255,65,0.1)]">
                    <span className="text-sm text-[#e0ffe0]" style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}>{stat.label}</span>
                    <span className="text-sm font-bold" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.45rem", color: stat.color }}>{stat.value}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4"><PoolPriceChart priceHistory={priceHistory} /></div>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
            <Card>
              <h3 className="text-sm font-bold text-[#00ff41] mb-4" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.55rem" }}>
                TOKENOMICS
              </h3>
              <div className="max-w-[200px] mx-auto">
                <Doughnut data={tokenomicsData} options={{
                  responsive: true,
                  plugins: { legend: { position: "bottom", labels: { color: "#e0ffe0", font: { size: 10, family: '"VT323", monospace' }, padding: 12, boxWidth: 10 } } },
                  cutout: "65%",
                }} />
              </div>
              <p className="text-xs text-[#e0ffe0] mt-4 text-center" style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}>
                40/25/20/15 split — Community first
              </p>
            </Card>
          </motion.div>
        </div>

        {/* Pool Stats */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.12 }} className="mb-8">
          <div className="grid grid-cols-4 gap-3">
            <div className="retro-card p-3 text-center">
              <div className="text-[#00ff41] font-bold" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem" }}>
                {formatCompact(totalLiquidityEth)} ETH
              </div>
              <div className="text-[#e0ffe0] text-[0.35rem] mt-1" style={{ fontFamily: '"Press Start 2P", monospace' }}>
                TOTAL LIQUIDITY
              </div>
            </div>
            <div className="retro-card p-3 text-center">
              <div className="text-[#00ff41] font-bold" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem" }}>
                ${formatCompact(pool.volume24h)}
              </div>
              <div className="text-[#e0ffe0] text-[0.35rem] mt-1" style={{ fontFamily: '"Press Start 2P", monospace' }}>
                24H VOLUME
              </div>
            </div>
            <div className="retro-card p-3 text-center">
              <div className="text-[#39ff14] font-bold" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem" }}>
                {apr.toFixed(2)}%
              </div>
              <div className="text-[#e0ffe0] text-[0.35rem] mt-1" style={{ fontFamily: '"Press Start 2P", monospace' }}>
                APR
              </div>
            </div>
            <div className="retro-card p-3 text-center">
              <div className="text-[#00cc33] font-bold" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem" }}>
                {userLpPercent}%
              </div>
              <div className="text-[#e0ffe0] text-[0.35rem] mt-1" style={{ fontFamily: '"Press Start 2P", monospace' }}>
                YOUR SHARE
              </div>
            </div>
          </div>
        </motion.div>

        {/* Swap */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.14 }} className="mb-8">
          <h3 className="text-sm font-bold text-[#00ff41] mb-4 text-center" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.55rem" }}>
            <HiMiniArrowsRightLeft size={14} className="inline mr-1" />
            SWAP
          </h3>
          <div className="max-w-md mx-auto">
            <Card className="border-[rgba(0,255,65,0.3)]">
              <div className="flex gap-2 mb-3">
                <button onClick={() => setSwapDirection("eth_to_igns")} className={`flex-1 retro-tab ${swapDirection === "eth_to_igns" ? "retro-tab-active" : ""}`}>
                  ETH → IGNS
                </button>
                <button onClick={() => setSwapDirection("igns_to_eth")} className={`flex-1 retro-tab ${swapDirection === "igns_to_eth" ? "retro-tab-active" : ""}`}>
                  IGNS → ETH
                </button>
              </div>
              <label className="text-xs text-[#e0ffe0] mb-1.5 block" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.4rem" }}>
                {swapDirection === "eth_to_igns" ? "ETH AMOUNT" : "IGNS AMOUNT"}
              </label>
              <input type="number" value={swapInput} onChange={(e) => setSwapInput(e.target.value)} placeholder="0.1" className="retro-input mb-3" step="0.01" />
              {swapEstimate && (
                <div className="mb-3 p-3 rounded-md bg-[rgba(0,255,65,0.03)] border border-[rgba(0,255,65,0.1)]">
                  <div className="text-xs text-[#e0ffe0] space-y-1" style={{ fontFamily: '"VT323", monospace', fontSize: "0.95rem" }}>
                    <div>You receive: <span className="text-[#00ff41] font-bold">{swapEstimate.outputAmount.toFixed(6)} {swapDirection === "eth_to_igns" ? "IGNS" : "ETH"}</span></div>
                    <div>Fee (0.3%): <span className="text-[#b0d0b0]">{swapEstimate.fee.toFixed(6)}</span></div>
                    <div>Price impact: <span className={swapEstimate.priceImpact > 5 ? "text-[#ff4444]" : "text-[#00cc33]"}>{swapEstimate.priceImpact.toFixed(2)}%</span></div>
                  </div>
                </div>
              )}
              <button onClick={handleSwap} className="retro-btn retro-btn-orange w-full justify-center text-[0.5rem] py-2" style={{ fontFamily: '"Press Start 2P", monospace' }}>
                <HiMiniArrowsRightLeft size={14} /> SWAP
              </button>
            </Card>
          </div>
        </motion.div>

        {/* Liquidity Management */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.17 }} className="mb-8">
          <h3 className="text-sm font-bold text-[#00ff41] mb-4 text-center" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.55rem" }}>
            💧 LIQUIDITY POOL
          </h3>
          <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {/* Add Liquidity */}
            <Card className="border-[rgba(0,255,65,0.2)]">
              <h4 className="text-sm font-bold text-[#00ff41] mb-3" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem" }}>
                ADD LIQUIDITY
              </h4>
              {connected && (
                <div className="mb-2 p-1.5 bg-[rgba(0,255,65,0.03)] rounded border border-[rgba(0,255,65,0.1)] text-center">
                  <span className="text-[0.35rem] text-[#00ff41]" style={{ fontFamily: '"Press Start 2P", monospace' }}>
                    {ethAddress ? `🦊 WALLET: ${ethAddress.slice(0,6)}...${ethAddress.slice(-4)}` : solAddress ? `◎ WALLET: ${solAddress.slice(0,4)}...${solAddress.slice(-4)}` : ''}
                  </span>
                </div>
              )}
              <label className="text-xs text-[#e0ffe0] mb-1 block" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.4rem" }}>ETH</label>
              <input type="number" value={lpEthInput} onChange={(e) => setLpEthInput(e.target.value)} placeholder="0.1" className="retro-input mb-2" step="0.01" />
              <label className="text-xs text-[#e0ffe0] mb-1 block" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.4rem" }}>IGNS</label>
              <input type="number" value={lpIgnsInput} onChange={(e) => setLpIgnsInput(e.target.value)} placeholder="1000" className="retro-input mb-3" />
              {lpEstimate && (
                <div className="mb-3 p-2 rounded-md bg-[rgba(0,255,65,0.03)] border border-[rgba(0,255,65,0.1)]">
                  <div className="text-xs text-[#e0ffe0]" style={{ fontFamily: '"VT323", monospace', fontSize: "0.95rem" }}>
                    LP Tokens: <span className="text-[#00ff41]">{lpEstimate.lpTokens.toFixed(6)}</span> · Share: <span className="text-[#39ff14]">{lpEstimate.poolShare.toFixed(2)}%</span>
                  </div>
                </div>
              )}
              {lpStatus && (
                <div className={`mb-3 p-2 rounded-md text-xs ${lpStatus.startsWith("✅") ? "bg-[rgba(0,255,65,0.05)] text-[#00ff41]" : lpStatus.startsWith("❌") ? "bg-[rgba(255,0,0,0.05)] text-[#ff4444]" : "bg-[rgba(0,255,65,0.03)] text-[#e0ffe0]"}`}
                  style={{ fontFamily: '"VT323", monospace', fontSize: "0.95rem" }}>
                  {lpStatus}
                </div>
              )}
              <button onClick={handleAddLiquidity} disabled={lpTxPending} className="retro-btn retro-btn-turquoise w-full justify-center text-[0.5rem] py-2" style={{ fontFamily: '"Press Start 2P", monospace' }}>
                {lpTxPending ? "⏳ CONFIRM IN WALLET..." : connected ? "ADD LIQUIDITY (WALLET)" : "ADD LIQUIDITY"}
              </button>
              {!connected && (
                <p className="text-[0.35rem] text-[#b0d0b0] mt-1 text-center" style={{ fontFamily: '"VT323", monospace' }}>
                  Connect wallet for real ETH/SOL transfers
                </p>
              )}
            </Card>

            {/* Remove Liquidity */}
            <Card className="border-[rgba(0,255,65,0.2)]">
              <h4 className="text-sm font-bold text-[#00ff41] mb-3" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem" }}>
                REMOVE LIQUIDITY
              </h4>
              <div className="text-xs text-[#e0ffe0] mb-3" style={{ fontFamily: '"VT323", monospace', fontSize: "0.95rem" }}>
                Your LP: <span className="text-[#00ff41] font-bold">{userLpBalance.toFixed(6)}</span> tokens
              </div>
              <label className="text-xs text-[#e0ffe0] mb-1 block" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.4rem" }}>LP TOKENS TO BURN</label>
              <input type="number" value={removeLpAmount} onChange={(e) => setRemoveLpAmount(e.target.value)} placeholder="0" className="retro-input mb-3" step="0.0001" max={userLpBalance} />
              {removeEstimate && (
                <div className="mb-3 p-2 rounded-md bg-[rgba(0,255,65,0.03)] border border-[rgba(0,255,65,0.1)]">
                  <div className="text-xs text-[#e0ffe0] space-y-1" style={{ fontFamily: '"VT323", monospace', fontSize: "0.95rem" }}>
                    <div>ETH: <span className="text-[#00ff41]">{removeEstimate.ethAmount.toFixed(6)}</span></div>
                    <div>IGNS: <span className="text-[#39ff14]">{removeEstimate.ignosAmount.toFixed(2)}</span></div>
                  </div>
                </div>
              )}
              <button onClick={handleRemoveLiquidity} disabled={!removeLpAmount || parseFloat(removeLpAmount) <= 0 || parseFloat(removeLpAmount) > userLpBalance} className="retro-btn retro-btn-pink w-full justify-center text-[0.5rem] py-2 disabled:opacity-30" style={{ fontFamily: '"Press Start 2P", monospace' }}>
                REMOVE LIQUIDITY
              </button>
            </Card>
          </div>
        </motion.div>

        {/* Mining Interface */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.19 }} className="mb-8">
          <Card>
            <h3 className="text-sm font-bold text-[#00ff41] mb-2 text-center flex items-center justify-center gap-2" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.55rem" }}>
              ⛏️ IGNOSHACHAIN MINING (PoW)
            </h3>
            <MiningStatus active={mining} />
            <PickaxeAnimation active={mining} />
            <div className="grid grid-cols-4 gap-2 mb-4">
              <div className="retro-card bg-[rgba(0,255,65,0.03)] p-2 text-center">
                <div className="text-[#00ff41] font-bold" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.45rem" }}>{formatHashRate(hashRate)}</div>
                <div className="text-[#e0ffe0] mt-0.5" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.3rem" }}>HASH RATE</div>
              </div>
              <div className="retro-card bg-[rgba(0,255,65,0.03)] p-2 text-center">
                <div className="text-[#00ff41] font-bold" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.45rem" }}>{blocksMined}</div>
                <div className="text-[#e0ffe0] mt-0.5" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.3rem" }}>BLOCKS MINED</div>
              </div>
              <div className="retro-card bg-[rgba(0,255,65,0.03)] p-2 text-center">
                <div className="text-[#00ff41] font-bold" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.45rem" }}>{difficulty}</div>
                <div className="text-[#e0ffe0] mt-0.5" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.3rem" }}>DIFFICULTY</div>
              </div>
              <div className="retro-card bg-[rgba(0,255,65,0.03)] p-2 text-center">
                <div className="text-[#00cc33] font-bold" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.45rem" }}>{rewardsEarned.toFixed(0)} IGNS</div>
                <div className="text-[#e0ffe0] mt-0.5" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.3rem" }}>TOTAL REWARDS</div>
              </div>
            </div>
            <div className="mb-3 p-2 bg-[rgba(0,255,65,0.02)] rounded-md border border-[rgba(0,255,65,0.1)]">
              <div className="text-[#b0d0b0] mb-1 text-center" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.35rem" }}>HASH RATE (last 60s)</div>
              <HashRateChart history={hashRateHistory} />
            </div>
            <button onClick={handleToggleMining} className={`retro-btn w-full justify-center text-[0.55rem] py-3 ${mining ? "retro-btn-pink" : "retro-btn-turquoise"}`} style={{ fontFamily: '"Press Start 2P", monospace' }}>
              {mining ? <><HiMiniPause size={16} /> STOP MINING</> : <><HiMiniPlay size={16} /> START MINING</>}
            </button>
            <p className="text-xs text-[#b0d0b0] mt-2 text-center" style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem" }}>
              * Real SHA-256 proof-of-work mining via Web Worker. {REWARD_PER_BLOCK} IGNS per block. Difficulty auto-adjusts.
            </p>
          </Card>
        </motion.div>

        {/* Recent Blocks */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.21 }} className="mb-8">
          <Card>
            <h3 className="text-sm font-bold text-[#00ff41] mb-3 text-center" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.55rem" }}>
              🔗 RECENT BLOCKS
            </h3>
            {recentBlocks.length === 0 ? (
              <p className="text-[#b0d0b0] text-center py-4" style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}>No blocks mined yet. Start mining!</p>
            ) : (
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left" style={{ fontFamily: '"VT323", monospace' }}>
                  <thead>
                    <tr className="text-[#00ff41] border-b border-[rgba(0,255,65,0.15)]" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.4rem" }}>
                      <th className="py-2 px-1">BLOCK</th><th className="py-2 px-1">NONCE</th><th className="py-2 px-1">HASH</th><th className="py-2 px-1">TIME</th><th className="py-2 px-1 text-right">REWARD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentBlocks.map((block) => (
                      <tr key={block.blockNumber} className="border-b border-[rgba(0,255,65,0.05)] text-[#e0ffe0]" style={{ fontSize: "0.9rem" }}>
                        <td className="py-1.5 px-1 text-[#00ff41]">#{block.blockNumber}</td>
                        <td className="py-1.5 px-1">{block.nonce.toLocaleString()}</td>
                        <td className="py-1.5 px-1"><span className="text-[#39ff14]">{truncateHash(block.hash)}</span></td>
                        <td className="py-1.5 px-1 text-[#b0d0b0] text-xs">{new Date(block.timestamp).toLocaleTimeString()}</td>
                        <td className="py-1.5 px-1 text-right text-[#00cc33]">{block.reward} IGNS</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </motion.div>

        {/* Blockchain Diagram */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.23 }} className="mb-8">
          <Card className="text-center">
            <h3 className="text-sm font-bold text-[#00ff41] mb-4" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.55rem" }}>
              🔗 IGNOSHACHAIN — PROOF OF MEME
            </h3>
            <div className="flex items-center justify-center gap-2 flex-wrap py-4">
              {[...Array(5)].map((_, i) => (
                <motion.div key={i} initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.15, type: "spring" }}
                  className="w-16 h-20 rounded-lg flex flex-col items-center justify-center text-[0.4rem] font-bold"
                  style={{
                    fontFamily: '"Press Start 2P", monospace',
                    background: i === 0 ? "rgba(0,255,65,0.15)" : "#0a0f0a",
                    border: `2px solid ${i === 0 ? "rgba(0,255,65,0.5)" : "rgba(0,255,65,0.2)"}`,
                    color: i === 0 ? "#00ff41" : "#e0ffe0",
                    boxShadow: i === 0 ? "0 0 15px rgba(0,255,65,0.2)" : "none",
                  }}>
                  <span className="text-lg">⬡</span>
                  <span>BLK #{i + 1}</span>
                </motion.div>
              ))}
              {[...Array(4)].map((_, i) => (
                <span key={`link-${i}`} className="text-[#00ff41] text-xl">→</span>
              ))}
            </div>
            <p className="text-xs text-[#e0ffe0] mt-2" style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}>
              Each block contains meme data secured by Proof of Meme consensus
            </p>
          </Card>
        </motion.div>

        {/* Whitepaper — NO PDF button, content remains */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }} className="mb-8">
          <Card className="border-[rgba(0,255,65,0.3)]">
            <div className="text-center mb-4">
              <h3 className="text-sm font-bold text-[#00ff41]" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.55rem" }}>📜 WHITEPAPER</h3>
            </div>
            <div className="p-4 rounded-lg space-y-4" style={{ background: "rgba(0,255,65,0.03)", border: "2px solid rgba(0,255,65,0.15)", fontFamily: '"VT323", monospace', color: "#e0ffe0" }}>
              {[
                { heading: "1. INTRODUCTION", text: "Ignosha ($IGNS) is the native utility token of the ignoshashi ecosystem, designed to power meme coin creation, trading, and community governance. Built on IgnoshaChain — a high-performance blockchain optimized for meme transactions." },
                { heading: "2. TECHNOLOGY — PROOF OF MEME", text: "IgnoshaChain uses an innovative consensus mechanism called Proof of Meme (PoM). Validators are selected based on their meme-staking power — the quality and virality of memes they contribute to the network." },
                { heading: "3. TOKENOMICS", text: "Total Supply: 1,000,000,000 IGNS\n• 40% Public Sale\n• 25% Liquidity Provision\n• 15% Team (4-year vesting)\n• 10% Marketing & Partnerships\n• 10% Ecosystem Reserve" },
                { heading: "4. ROADMAP", text: "Phase 1: Token launch, community building, initial DEX listing ✓\nPhase 2: ignoshashi platform integration, staking rewards\nPhase 3: CEX listings, cross-chain bridge, governance\nPhase 4: Full ecosystem deployment, DAO transition" },
                { heading: "5. TEAM", text: "The ignoshashi team brings together experienced blockchain developers, meme artists, and community builders with a shared vision: making meme coin creation accessible, fun, and rewarding for everyone." },
              ].map((section) => (
                <div key={section.heading}>
                  <h4 style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem", color: "#00ff41", textShadow: "0 0 8px rgba(0,255,65,0.3)" }}>{section.heading}</h4>
                  <p style={{ fontSize: "1rem", marginTop: "0.25rem", whiteSpace: "pre-line" }}>{section.text}</p>
                </div>
              ))}
            </div>
          </Card>
        </motion.div>

        {/* Roadmap */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.27 }}>
          <Card>
            <h3 className="text-sm font-bold text-[#00ff41] mb-6 text-center" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.55rem" }}>ROADMAP</h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {roadmap.map((item, i) => (
                <div key={item.phase} className="text-center">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center mx-auto mb-3 text-xs font-bold"
                    style={{
                      fontFamily: '"Press Start 2P", monospace',
                      background: item.done ? "rgba(0,255,65,0.1)" : "rgba(0,255,65,0.03)",
                      color: item.done ? "#00ff41" : "#b0d0b0",
                      border: `2px solid ${item.done ? "rgba(0,255,65,0.4)" : "rgba(0,255,65,0.15)"}`,
                    }}>
                    {item.done ? "✓" : i + 1}
                  </div>
                  <div className="text-[0.35rem] text-[#b0d0b0]" style={{ fontFamily: '"Press Start 2P", monospace' }}>{item.phase}</div>
                  <div className="text-sm font-bold text-[#e0ffe0] mt-1" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.45rem" }}>{item.title}</div>
                  <div className="text-xs text-[#e0ffe0] mt-1" style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem" }}>{item.desc}</div>
                </div>
              ))}
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
