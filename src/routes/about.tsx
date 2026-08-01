import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Card } from "~/components/UI";

export const Route = createFileRoute("/about")({
  component: AboutPage,
});

const monetizationCards = [
  {
    icon: "📺",
    title: "Display Ads",
    desc: "High-CPM crypto ads once we have traffic. Advertisers pay premium rates for crypto-native audiences.",
  },
  {
    icon: "🔗",
    title: "Affiliate Links",
    desc: "Lifetime commission from exchange referrals (Binance, Bybit, MEXC, and more). Earn while your users trade.",
  },
  {
    icon: "📢",
    title: "Sponsored Listings",
    desc: "Projects pay to feature their meme coin in our trending section. Premium visibility for serious launches.",
  },
];

function AboutPage() {
  return (
    <div className="min-h-dvh bg-[#050505] py-10">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="text-center mb-10"
        >
          <h1
            className="text-2xl font-bold text-[#00ff41] mb-3 pixel-shadow-sm"
            style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "1rem" }}
          >
            ABOUT IGNOSHASHI
          </h1>
          <p
            className="text-[#e0ffe0]"
            style={{ fontFamily: '"VT323", monospace', fontSize: "1.15rem" }}
          >
            ⭐ The ultimate meme coin launchpad — built for degens, by degens ⭐
          </p>
        </motion.div>

        {/* Section: What is ignoshashi? */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05, duration: 0.25 }}
          className="mb-10"
        >
          <Card className="p-6">
            <h2
              className="text-[#00ff41] mb-4 pixel-shadow-sm"
              style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.65rem" }}
            >
              WHAT IS IGNOSHASHI?
            </h2>
            <p
              className="text-[#e0ffe0] leading-relaxed"
              style={{ fontFamily: '"VT323", monospace', fontSize: "1.15rem" }}
            >
              ignoshashi is a next-generation meme coin launchpad and trading platform. 
              Create, launch, and track meme coins on Solana and Ethereum in under 60 seconds. 
              Built for degens, by degens.
            </p>
            <div className="flex flex-wrap gap-4 mt-4">
              <div className="flex items-center gap-2">
                <span className="text-[#00ff41]">◎</span>
                <span
                  className="text-[#e0ffe0]"
                  style={{ fontFamily: '"VT323", monospace', fontSize: "1.05rem" }}
                >
                  Solana
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[#00ff41]">Ξ</span>
                <span
                  className="text-[#e0ffe0]"
                  style={{ fontFamily: '"VT323", monospace', fontSize: "1.05rem" }}
                >
                  Ethereum
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span>⚡</span>
                <span
                  className="text-[#e0ffe0]"
                  style={{ fontFamily: '"VT323", monospace', fontSize: "1.05rem" }}
                >
                  Under 60s Deployment
                </span>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* Section: Built to Scale */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.25 }}
          className="mb-10"
        >
          <h2
            className="text-[#00ff41] mb-6 text-center pixel-shadow-sm"
            style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.7rem" }}
          >
            BUILT TO SCALE
          </h2>
          <div className="grid md:grid-cols-3 gap-4">
            {monetizationCards.map((card, i) => (
              <motion.div
                key={card.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.05, duration: 0.25 }}
                whileHover={{ scale: 1.03, y: -3 }}
              >
                <Card className="h-full text-center p-5">
                  <div className="text-3xl mb-3 retro-float">{card.icon}</div>
                  <h3
                    className="text-[#00ff41] mb-3"
                    style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.5rem" }}
                  >
                    {card.title}
                  </h3>
                  <p
                    className="text-[#e0ffe0]"
                    style={{ fontFamily: '"VT323", monospace', fontSize: "1.05rem" }}
                  >
                    {card.desc}
                  </p>
                </Card>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Section: Coming Soon */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.25 }}
          className="mb-10"
        >
          <h2
            className="text-[#00ff41] mb-6 text-center pixel-shadow-sm"
            style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.7rem" }}
          >
            🚧 COMING SOON
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            {[
              {
                icon: "🔗",
                title: "Referral Program",
                desc: "Earn fees when friends launch tokens through your referral link.",
              },
              {
                icon: "🏆",
                title: "Weekly Trading Competitions",
                desc: "Top traders win prizes every week. Compete for the leaderboard.",
              },
              {
                icon: "📱",
                title: "Native Mobile Apps",
                desc: "iOS & Android apps coming. PWA available now for mobile users.",
              },
              {
                icon: "🤖",
                title: "Trading Bot API",
                desc: "Automate your meme coin strategy with our trading bot API.",
              },
              {
                icon: "🎨",
                title: "AI Art Generator",
                desc: "Generate token logos with AI. Coming soon to the create page.",
              },
            ].map((item, i) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.22 + i * 0.04, duration: 0.2 }}
                whileHover={{ scale: 1.02 }}
              >
                <Card className="h-full p-5 flex items-start gap-4">
                  <span className="text-2xl shrink-0">{item.icon}</span>
                  <div>
                    <h3
                      className="text-[#b0d0b0] mb-1"
                      style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.45rem" }}
                    >
                      {item.title}
                    </h3>
                    <p
                      className="text-[#e0ffe0]"
                      style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
                    >
                      {item.desc}
                    </p>
                    <span
                      className="inline-block mt-2 text-[0.3rem] px-2 py-0.5 rounded"
                      style={{
                        fontFamily: '"Press Start 2P", monospace',
                        background: "rgba(0,255,65,0.08)",
                        color: "#00ff41",
                        border: "1px solid rgba(0,255,65,0.2)",
                      }}
                    >
                      🚧 IN DEVELOPMENT
                    </span>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Section: Disclaimer */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.25 }}
        >
          <Card
            className="p-6"
            style={{
              borderColor: "rgba(255,60,60,0.3)",
              boxShadow: "0 0 20px rgba(255,60,60,0.1), 0 4px 20px rgba(0,0,0,0.5)",
            }}
          >
            <div className="flex items-center gap-2 mb-4">
              <span className="text-2xl">⚠️</span>
              <h2
                className="text-[#ff6b6b] pixel-shadow-sm"
                style={{
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: "0.6rem",
                  textShadow: "0 0 10px rgba(255,60,60,0.4)",
                }}
              >
                RISK DISCLAIMER
              </h2>
            </div>
            <p
              className="text-[#e0ffe0] leading-relaxed"
              style={{ fontFamily: '"VT323", monospace', fontSize: "1.1rem" }}
            >
              ignoshashi is a platform for creating and discovering meme coins. We do not endorse, verify, 
              or guarantee any token listed on this platform. Meme coins are extremely high-risk investments — 
              most go to zero. You are solely responsible for your own trading decisions. Always do your own 
              research (DYOR). Never invest more than you can afford to lose. ignoshashi is not liable for any 
              financial losses, rug pulls, or scam tokens. By using this platform, you acknowledge these risks.
            </p>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
