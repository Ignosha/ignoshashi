import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Card } from "~/components/UI";
import { useTheme } from "~/context/ThemeContext";
import { useWallet, truncateAddress } from "~/context/WalletContext";
import { getReferralLink, getLocalReferralStats, type ReferralStats } from "~/services/referrals";

export function ReferralPanel() {
  const { theme } = useTheme();
  const { connected, solAddress, ethAddress } = useWallet();
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [copied, setCopied] = useState(false);

  const walletAddress = solAddress || ethAddress;

  useEffect(() => {
    if (walletAddress && connected) {
      setStats(getLocalReferralStats(walletAddress));
    }
  }, [walletAddress, connected]);

  const referralLink = walletAddress ? getReferralLink(walletAddress) : "";

  const handleCopyLink = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(referralLink);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareOnX = () => {
    const text = encodeURIComponent(
      `🚀 Join me on ignoshashi — the ultimate meme coin launchpad! Trade, create, and earn. Use my referral link: ${referralLink}`
    );
    window.open(`https://twitter.com/intent/tweet?text=${text}`, "_blank");
  };

  const shareOnTelegram = () => {
    const text = encodeURIComponent(
      `🚀 Join me on ignoshashi — the ultimate meme coin launchpad! Trade, create, and earn.\n\n${referralLink}`
    );
    window.open(`https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${text}`, "_blank");
  };

  if (!connected || !walletAddress) {
    return (
      <Card className="border-[rgba(0,255,65,0.2)]">
        <div className="text-center mb-3">
          <span className="text-2xl">🔗</span>
          <h3
            className="text-[0.5rem] font-bold text-[#00ff41]"
            style={{ fontFamily: '"Press Start 2P", monospace' }}
          >
            REFERRAL PROGRAM
          </h3>
        </div>
        <p
          className="text-center text-sm"
          style={{ fontFamily: '"VT323", monospace', fontSize: "1.05rem", color: theme.textMuted }}
        >
          Connect your wallet to access your referral dashboard.
        </p>
      </Card>
    );
  }

  return (
    <Card className="border-[rgba(0,255,65,0.2)]">
      <div className="text-center mb-4">
        <span className="text-2xl">🔗</span>
        <h3
          className="text-[0.5rem] font-bold text-[#00ff41]"
          style={{ fontFamily: '"Press Start 2P", monospace' }}
        >
          REFERRAL PROGRAM
        </h3>
      </div>

      {/* Referral Link */}
      <div className="mb-4">
        <label
          className="text-[0.35rem] text-[#b0d0b0] block mb-1"
          style={{ fontFamily: '"Press Start 2P", monospace' }}
        >
          YOUR REFERRAL LINK
        </label>
        <div className="flex gap-2">
          <input
            readOnly
            value={referralLink}
            className="retro-input text-sm flex-1"
            style={{ fontFamily: '"VT323", monospace', fontSize: "0.8rem", padding: "0.3rem 0.5rem" }}
          />
          <button
            onClick={handleCopyLink}
            className="retro-btn retro-btn-outline text-[0.35rem] px-3"
            style={{ fontFamily: '"Press Start 2P", monospace' }}
          >
            {copied ? "📋 COPIED!" : "📋"}
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="grid grid-cols-3 gap-2 mb-4"
        >
          <div
            className="p-2 rounded text-center"
            style={{ background: "rgba(0,255,65,0.03)", border: "1px solid rgba(0,255,65,0.1)" }}
          >
            <div
              className="text-lg font-bold"
              style={{ fontFamily: '"VT323", monospace', fontSize: "1.3rem", color: "#00ff41" }}
            >
              {stats.totalReferrals}
            </div>
            <div
              className="text-[0.3rem]"
              style={{ fontFamily: '"Press Start 2P", monospace', color: theme.textMuted }}
            >
              TOTAL
            </div>
          </div>
          <div
            className="p-2 rounded text-center"
            style={{ background: "rgba(0,255,65,0.03)", border: "1px solid rgba(0,255,65,0.1)" }}
          >
            <div
              className="text-lg font-bold"
              style={{ fontFamily: '"VT323", monospace', fontSize: "1.3rem", color: "#00ff41" }}
            >
              {stats.tokensCreated}
            </div>
            <div
              className="text-[0.3rem]"
              style={{ fontFamily: '"Press Start 2P", monospace', color: theme.textMuted }}
            >
              TOKENS
            </div>
          </div>
          <div
            className="p-2 rounded text-center"
            style={{ background: "rgba(0,255,65,0.03)", border: "1px solid rgba(0,255,65,0.1)" }}
          >
            <div
              className="text-lg font-bold"
              style={{ fontFamily: '"VT323", monospace', fontSize: "1.3rem", color: "#ffaa00" }}
            >
              {stats.totalRewards.toFixed(4)}
            </div>
            <div
              className="text-[0.3rem]"
              style={{ fontFamily: '"Press Start 2P", monospace', color: theme.textMuted }}
            >
              REWARDS
            </div>
          </div>
        </motion.div>
      )}

      {/* Referred wallets */}
      {stats && stats.referrals.length > 0 && (
        <div className="mb-4">
          <div
            className="text-[0.35rem] text-[#b0d0b0] mb-1"
            style={{ fontFamily: '"Press Start 2P", monospace' }}
          >
            REFERRED WALLETS
          </div>
          <div className="max-h-[120px] overflow-y-auto custom-scrollbar space-y-1">
            {stats.referrals.map((ref, i) => (
              <div
                key={i}
                className="p-1.5 rounded text-xs flex items-center gap-2"
                style={{
                  background: "rgba(0,255,65,0.02)",
                  border: "1px solid rgba(0,255,65,0.05)",
                  fontFamily: '"VT323", monospace',
                  fontSize: "0.9rem",
                  color: theme.text,
                }}
              >
                <span style={{ color: "#00ff41" }}>◎</span>
                {truncateAddress(ref.referredWallet)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Share buttons */}
      <div className="flex gap-2">
        <button
          onClick={shareOnX}
          className="retro-btn retro-btn-outline flex-1 justify-center text-[0.35rem] py-1.5"
          style={{ fontFamily: '"Press Start 2P", monospace' }}
        >
          🐦 X
        </button>
        <button
          onClick={shareOnTelegram}
          className="retro-btn retro-btn-outline flex-1 justify-center text-[0.35rem] py-1.5"
          style={{ fontFamily: '"Press Start 2P", monospace' }}
        >
          ✈️ TG
        </button>
      </div>

      <div className="mt-3 text-center">
        <p
          className="text-xs"
          style={{ fontFamily: '"VT323", monospace', fontSize: "0.85rem", color: theme.success }}
        >
          Earn bonus when your referrals create tokens!
        </p>
      </div>
    </Card>
  );
}
