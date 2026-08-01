import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { Card } from "~/components/UI";
import { useWallet, truncateAddress } from "~/context/WalletContext";
import { useTheme } from "~/context/ThemeContext";
import { getTokens, getBondingCurveState, deleteToken, type TokenData } from "~/services/tracker";
import { ReferralPanel } from "~/components/ReferralPanel";
import { HiMiniRocketLaunch } from "react-icons/hi2";

export const Route = createFileRoute("/creator")({
  component: CreatorDashboard,
});

function getTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function CreatorDashboard() {
  const { theme } = useTheme();
  const { connected, solAddress, ethAddress } = useWallet();
  const walletAddress = solAddress || ethAddress;
  const navigate = useNavigate();
  const [tokens, setTokens] = useState<TokenData[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [deleteTokenId, setDeleteTokenId] = useState<string | null>(null);

  useEffect(() => {
    function refresh() {
      const all = getTokens();
      setTokens(all);
      setRefreshKey((k) => k + 1);
    }
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, []);

  const myTokens = useMemo(() => {
    if (!walletAddress) return [];
    return tokens.filter((t) => t.creator === walletAddress);
  }, [tokens, walletAddress, refreshKey]);

  const summary = useMemo(() => {
    let totalEarnings = 0;
    let totalVolume = 0;
    let graduated = 0;
    let earningsChain: "solana" | "ethereum" = "solana";

    for (const token of myTokens) {
      const curve = getBondingCurveState(token.id);
      if (curve) {
        totalEarnings += curve.creatorEarnings || 0;
        totalVolume += curve.raisedSol || 0;
        if (curve.graduated) graduated++;
        earningsChain = token.blockchain;
      }
    }

    return {
      totalCreated: myTokens.length,
      totalGraduated: graduated,
      totalEarnings,
      totalVolume,
      earningsChain,
    };
  }, [myTokens, refreshKey]);

  const chainSymbol = summary.earningsChain === "solana" ? "SOL" : "ETH";

  if (!connected || !walletAddress) {
    return (
      <div className="min-h-dvh bg-[#050505] py-20">
        <div className="max-w-4xl mx-auto px-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center"
          >
            <div className="text-5xl mb-6 retro-float">🎨</div>
            <h1
              className="text-[#00ff41] mb-4 pixel-shadow-sm"
              style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "1rem" }}
            >
              CREATOR DASHBOARD
            </h1>
            <p
              className="text-[#e0ffe0] mb-8"
              style={{ fontFamily: '"VT323", monospace', fontSize: "1.2rem" }}
            >
              Connect your wallet to view your creator dashboard.
            </p>
            <div className="retro-card p-6 max-w-md mx-auto">
              <p
                className="text-[#ffaa00] mb-4"
                style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem" }}
              >
                CONNECT WALLET TO VIEW YOUR DASHBOARD
              </p>
              <p
                className="text-[#e0ffe0]"
                style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
              >
                See your created tokens, earnings, and referral stats.
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }


  const handleDeleteToken = (tokenId: string) => {
    if (!walletAddress) return;
    const success = deleteToken(tokenId, walletAddress);
    if (success) {
      setDeleteTokenId(null);
      setRefreshKey(k => k + 1);
    }
  };

  const tokenToDelete = deleteTokenId ? myTokens.find(t => t.id === deleteTokenId) : null;
  return (
    <div className="min-h-dvh bg-[#050505] py-10">
      <div className="max-w-4xl mx-auto px-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center mb-8"
        >
          <div className="text-5xl mb-4 retro-float">🎨</div>
          <h1
            className="text-[#00ff41] mb-2 pixel-shadow-sm"
            style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "1rem" }}
          >
            CREATOR DASHBOARD
          </h1>
          <div
            className="text-sm"
            style={{ fontFamily: '"VT323", monospace', fontSize: "1.1rem", color: theme.textMuted }}
          >
            Wallet: {truncateAddress(walletAddress)}
          </div>
        </motion.div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
          >
            <Card className="text-center">
              <div className="text-2xl mb-1">🚀</div>
              <div
                className="text-lg font-bold"
                style={{ fontFamily: '"VT323", monospace', fontSize: "1.4rem", color: "#00ff41" }}
              >
                {summary.totalCreated}
              </div>
              <div
                className="text-[0.35rem]"
                style={{ fontFamily: '"Press Start 2P", monospace', color: theme.textMuted }}
              >
                TOKENS CREATED
              </div>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card className="text-center">
              <div className="text-2xl mb-1">🎓</div>
              <div
                className="text-lg font-bold"
                style={{ fontFamily: '"VT323", monospace', fontSize: "1.4rem", color: "#00ff41" }}
              >
                {summary.totalGraduated}
              </div>
              <div
                className="text-[0.35rem]"
                style={{ fontFamily: '"Press Start 2P", monospace', color: theme.textMuted }}
              >
                GRADUATED
              </div>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
          >
            <Card className="text-center">
              <div className="text-2xl mb-1">💰</div>
              <div
                className="text-lg font-bold"
                style={{ fontFamily: '"VT323", monospace', fontSize: "1.4rem", color: "#ffaa00" }}
              >
                {summary.totalEarnings.toFixed(4)}
              </div>
              <div
                className="text-[0.35rem]"
                style={{ fontFamily: '"Press Start 2P", monospace', color: theme.textMuted }}
              >
                EARNED ({chainSymbol})
              </div>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card className="text-center">
              <div className="text-2xl mb-1">📊</div>
              <div
                className="text-lg font-bold"
                style={{ fontFamily: '"VT323", monospace', fontSize: "1.4rem", color: theme.text }}
              >
                {summary.totalVolume.toFixed(2)}
              </div>
              <div
                className="text-[0.35rem]"
                style={{ fontFamily: '"Press Start 2P", monospace', color: theme.textMuted }}
              >
                TOTAL VOL ({chainSymbol})
              </div>
            </Card>
          </motion.div>
        </div>

        {/* Token List */}
        <div className="mb-8">
          <h3
            className="text-[0.5rem] font-bold text-[#00ff41] mb-4"
            style={{ fontFamily: '"Press Start 2P", monospace' }}
          >
            📋 YOUR TOKENS
          </h3>

          {myTokens.length === 0 ? (
            <Card className="text-center p-8">
              <div className="text-4xl mb-3">🪙</div>
              <p
                className="text-[#e0ffe0] mb-4"
                style={{ fontFamily: '"VT323", monospace', fontSize: "1.2rem" }}
              >
                You haven't created any tokens yet.
              </p>
              <Link to="/create">
                <button
                  className="retro-btn retro-btn-orange inline-flex items-center gap-2 text-[0.45rem] px-4 py-2"
                  style={{ fontFamily: '"Press Start 2P", monospace' }}
                >
                  <HiMiniRocketLaunch size={14} />
                  CREATE ONE →
                </button>
              </Link>
            </Card>
          ) : (
            <div className="space-y-2">
              {/* Table header */}
              <div
                className="grid grid-cols-6 gap-2 py-2 px-3 rounded-t text-[0.35rem] font-bold hidden sm:grid"
                style={{
                  fontFamily: '"Press Start 2P", monospace',
                  background: "rgba(0,255,65,0.05)",
                  borderBottom: `1px solid ${theme.border}`,
                  color: "#00ff41",
                }}
              >
                <span>NAME</span>
                <span>TICKER</span>
                <span>STATUS</span>
                <span>PROGRESS</span>
                <span>EARNINGS</span>
                <span>CREATED</span>
                <span>ACTIONS</span>
              </div>

              {myTokens.map((token, i) => {
                const curve = getBondingCurveState(token.id);
                const progress = curve ? Math.min((curve.currentSupply / curve.totalSupply) * 100, 100) : 0;
                const earnings = curve?.creatorEarnings || 0;
                const status = curve?.graduated ? "🎓 Graduated" : "📈 Bonding";
                const chainSym = token.blockchain === "solana" ? "SOL" : "ETH";

                return (
                  <Link key={token.id} to="/token/$id" params={{ id: token.id }}>
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="retro-card p-3 grid grid-cols-2 sm:grid-cols-7 gap-2 items-center text-xs"
                      style={{
                        background: i % 2 === 0 ? "rgba(0,255,65,0.01)" : "rgba(0,255,65,0.02)",
                      }}
                    >
                      <span
                        className="font-bold truncate"
                        style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.4rem", color: theme.text }}
                      >
                        {token.name}
                      </span>
                      <span
                        className="font-bold"
                        style={{ fontFamily: '"VT323", monospace', fontSize: "1rem", color: "#00ff41" }}
                      >
                        ${token.ticker}
                      </span>

                      {/* Status */}
                      <span
                        className="text-xs"
                        style={{
                          fontFamily: '"VT323", monospace',
                          fontSize: "0.9rem",
                          color: curve?.graduated ? "#00ff41" : "#ffaa00",
                        }}
                      >
                        {status}
                      </span>

                      {/* Progress bar */}
                      <div>
                        <div className="h-2 rounded-sm overflow-hidden" style={{ background: "#0d120d", border: "1px solid rgba(0,255,65,0.1)" }}>
                          <div
                            className="h-full transition-all"
                            style={{
                              width: `${progress}%`,
                              background: progress >= 100 ? "#00ff41" : "#ffaa00",
                            }}
                          />
                        </div>
                        <span
                          className="text-[0.6rem]"
                          style={{ fontFamily: '"VT323", monospace', color: theme.textMuted }}
                        >
                          {progress.toFixed(0)}%
                        </span>
                      </div>

                      <span
                        className="font-bold"
                        style={{ fontFamily: '"VT323", monospace', fontSize: "0.95rem", color: "#ffaa00" }}
                      >
                        {earnings.toFixed(4)} {chainSym}
                      </span>

                      <span
                        style={{ fontFamily: '"VT323", monospace', fontSize: "0.85rem", color: theme.textMuted }}
                      >
                        {getTimeAgo(token.createdAt)}
                      </span>
                    </motion.div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Referral Panel */}
        <div className="mb-8">
          <h3
            className="text-[0.5rem] font-bold text-[#00ff41] mb-4"
            style={{ fontFamily: '"Press Start 2P", monospace' }}
          >
            🔗 REFERRALS
          </h3>
          <ReferralPanel />
        </div>

        {/* Create new CTA */}
        <div className="text-center">
          <Link to="/create">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="retro-btn retro-btn-orange inline-flex items-center gap-2 text-[0.5rem] px-6 py-3"
              style={{ fontFamily: '"Press Start 2P", monospace' }}
            >
              <HiMiniRocketLaunch size={16} />
              CREATE NEW TOKEN
            </motion.button>
          </Link>
        </div>

        {/* Delete Confirmation Modal */}
        {deleteTokenId && tokenToDelete && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.7)" }}
            onClick={() => setDeleteTokenId(null)}
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="retro-card p-6 max-w-md mx-4"
              style={{ background: "#0d120d" }}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
            >
              <div className="text-center mb-4">
                <div className="text-4xl mb-3">⚠️</div>
                <h3
                  className="text-[#ff3333] mb-2"
                  style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.55rem" }}
                >
                  DELETE TOKEN
                </h3>
                <p
                  className="text-[#e0ffe0]"
                  style={{ fontFamily: '"VT323", monospace', fontSize: "1.1rem" }}
                >
                  Are you sure you want to delete{" "}
                  <span className="text-[#ffaa00] font-bold">{tokenToDelete.name}</span>?
                </p>
                <p
                  className="text-[#ff6b6b] mt-2"
                  style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
                >
                  This cannot be undone.
                </p>
              </div>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => setDeleteTokenId(null)}
                  className="retro-btn retro-btn-outline text-[0.4rem] px-4 py-2"
                  style={{ fontFamily: '"Press Start 2P", monospace' }}
                >
                  CANCEL
                </button>
                <button
                  onClick={() => handleDeleteToken(tokenToDelete.id)}
                  className="retro-btn retro-btn-pink text-[0.4rem] px-4 py-2"
                  style={{ fontFamily: '"Press Start 2P", monospace' }}
                >
                  🗑️ DELETE
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
}
