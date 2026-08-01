import { useState } from "react";
import { motion } from "framer-motion";

interface SocialSharePanelProps {
  tokenName: string;
  tokenTicker: string;
  tokenUrl: string;
  tokenId: string;
}

export function SocialSharePanel({ tokenName, tokenTicker, tokenUrl, tokenId }: SocialSharePanelProps) {
  const [copied, setCopied] = useState(false);
  const [discordCopied, setDiscordCopied] = useState(false);

  const tweetText = `Just launched $${tokenTicker} on ignoshashi! 🚀\n\n${tokenName}\n\n${tokenUrl}`;
  const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
  const redditUrl = `https://www.reddit.com/submit?url=${encodeURIComponent(tokenUrl)}&title=${encodeURIComponent(`Just launched $${tokenTicker} on ignoshashi! 🚀`)}`;

  const discordMessage = `🚀 **Just launched $${tokenTicker} on ignoshashi!**\n\n**${tokenName}**\n\nCheck it out: ${tokenUrl}\n\nCome ape in! 🦍`;

  const copyLink = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(tokenUrl).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  const copyDiscord = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(discordMessage).then(() => {
        setDiscordCopied(true);
        setTimeout(() => setDiscordCopied(false), 2000);
      });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, duration: 0.3 }}
      className="retro-card p-5 mt-6"
      style={{
        border: "3px solid rgba(0,255,65,0.3)",
        boxShadow: "0 0 20px rgba(0,255,65,0.15), 6px 6px 0 rgba(0,255,65,0.1)",
      }}
    >
      <div className="text-center mb-4">
        <span className="text-3xl mb-2 block">📢</span>
        <h3
          className="text-[#00ff41] font-bold pixel-shadow-sm"
          style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.55rem" }}
        >
          SHARE YOUR TOKEN
        </h3>
        <p
          className="text-[#b0d0b0] mt-1"
          style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
        >
          Spread the word and attract degens!
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Twitter / X */}
        <a
          href={tweetUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="retro-btn flex items-center justify-center gap-2 py-3 text-[0.4rem]"
          style={{
            fontFamily: '"Press Start 2P", monospace',
            background: "rgba(29,161,242,0.15)",
            border: "2px solid rgba(29,161,242,0.4)",
            color: "#1da1f2",
          }}
        >
          <span className="text-lg">🐦</span>
          SHARE ON X
        </a>

        {/* Discord */}
        <button
          onClick={copyDiscord}
          className="retro-btn flex items-center justify-center gap-2 py-3 text-[0.4rem]"
          style={{
            fontFamily: '"Press Start 2P", monospace',
            background: "rgba(88,101,242,0.15)",
            border: "2px solid rgba(88,101,242,0.4)",
            color: "#5865f2",
          }}
        >
          <span className="text-lg">💬</span>
          {discordCopied ? "COPIED! ✅" : "SHARE ON DISCORD"}
        </button>

        {/* Reddit */}
        <a
          href={redditUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="retro-btn flex items-center justify-center gap-2 py-3 text-[0.4rem]"
          style={{
            fontFamily: '"Press Start 2P", monospace',
            background: "rgba(255,69,0,0.15)",
            border: "2px solid rgba(255,69,0,0.4)",
            color: "#ff4500",
          }}
        >
          <span className="text-lg">📱</span>
          SHARE ON REDDIT
        </a>

        {/* Copy link */}
        <button
          onClick={copyLink}
          className="retro-btn flex items-center justify-center gap-2 py-3 text-[0.4rem]"
          style={{
            fontFamily: '"Press Start 2P", monospace',
            background: "rgba(0,255,65,0.1)",
            border: "2px solid rgba(0,255,65,0.3)",
            color: "#00ff41",
          }}
        >
          <span className="text-lg">{copied ? "✅" : "🔗"}</span>
          {copied ? "COPIED!" : "COPY LINK"}
        </button>
      </div>

      {/* Discord copy notice */}
      {discordCopied && (
        <motion.p
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mt-3 text-[#5865f2]"
          style={{ fontFamily: '"VT323", monospace', fontSize: "0.95rem" }}
        >
          📋 Discord message copied! Paste it in your server.
        </motion.p>
      )}
    </motion.div>
  );
}
