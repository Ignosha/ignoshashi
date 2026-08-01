import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import { Card } from "~/components/UI";
import { getTokens, type TokenData } from "~/services/tracker";
import { useTheme } from "~/context/ThemeContext";

export function EmbedWidget() {
  const { theme } = useTheme();
  const [selectedToken, setSelectedToken] = useState<TokenData | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [width, setWidth] = useState(400);
  const [height, setHeight] = useState(300);
  const [showPrice, setShowPrice] = useState(true);
  const [showChart, setShowChart] = useState(true);
  const [showBuy, setShowBuy] = useState(true);
  const [copied, setCopied] = useState(false);

  const allTokens = useMemo(() => {
    if (typeof window === "undefined") return [];
    return getTokens();
  }, []);

  const results = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return allTokens.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.ticker.toLowerCase().includes(q)
    ).slice(0, 5);
  }, [searchQuery, allTokens]);

  const iframeCode = useMemo(() => {
    if (!selectedToken) return "";
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://ignoshashi.ctonew.app";
    const params = new URLSearchParams();
    params.set("token", selectedToken.id);
    if (!showPrice) params.set("noprice", "1");
    if (!showChart) params.set("nochart", "1");
    if (!showBuy) params.set("nobuy", "1");

    return `<iframe
  src="${baseUrl}/embed?${params.toString()}"
  width="${width}"
  height="${height}"
  frameborder="0"
  scrolling="no"
  style="border-radius: 8px; border: 1px solid rgba(0,255,65,0.2);"
></iframe>`;
  }, [selectedToken, width, height, showPrice, showChart, showBuy]);

  const handleCopy = () => {
    if (!iframeCode) return;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(iframeCode);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className="border-[rgba(0,255,65,0.2)] h-full flex flex-col">
      <div className="text-center mb-3">
        <span className="text-2xl">📋</span>
        <h3
          className="text-[0.5rem] font-bold text-[#00ff41]"
          style={{ fontFamily: '"Press Start 2P", monospace' }}
        >
          EMBED WIDGET
        </h3>
      </div>

      {/* Token selection */}
      <div className="relative mb-3">
        <label
          className="text-[0.3rem] text-[#b0d0b0] block mb-0.5"
          style={{ fontFamily: '"Press Start 2P", monospace' }}
        >
          SELECT TOKEN
        </label>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); setShowResults(true); }}
          onFocus={() => setShowResults(true)}
          onBlur={() => setTimeout(() => setShowResults(false), 200)}
          placeholder="Search token by name or ticker..."
          className="retro-input text-sm w-full"
          style={{ fontFamily: '"VT323", monospace', fontSize: "0.85rem", padding: "0.3rem 0.5rem" }}
        />
        {showResults && results.length > 0 && (
          <div
            className="absolute top-full left-0 right-0 z-10 retro-card p-1 max-h-[120px] overflow-y-auto custom-scrollbar"
            style={{ background: theme.bg }}
          >
            {results.map((t) => (
              <button
                key={t.id}
                onClick={() => { setSelectedToken(t); setSearchQuery(t.ticker); setShowResults(false); }}
                className="w-full text-left px-2 py-1 rounded text-xs hover:bg-[rgba(0,255,65,0.05)]"
                style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem", color: theme.text }}
              >
                ${t.ticker} — {t.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedToken && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-3"
        >
          {/* Config */}
          <div
            className="p-2 rounded space-y-2"
            style={{ background: "rgba(0,255,65,0.02)", border: "1px solid rgba(0,255,65,0.1)" }}
          >
            {/* Size */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label
                  className="text-[0.3rem] text-[#b0d0b0] block mb-0.5"
                  style={{ fontFamily: '"Press Start 2P", monospace' }}
                >
                  WIDTH
                </label>
                <input
                  type="number"
                  value={width}
                  onChange={(e) => setWidth(Math.min(800, Math.max(300, parseInt(e.target.value) || 300)))}
                  className="retro-input text-sm w-full"
                  style={{ fontFamily: '"VT323", monospace', fontSize: "0.85rem", padding: "0.2rem 0.4rem" }}
                  min={300}
                  max={800}
                />
              </div>
              <div>
                <label
                  className="text-[0.3rem] text-[#b0d0b0] block mb-0.5"
                  style={{ fontFamily: '"Press Start 2P", monospace' }}
                >
                  HEIGHT
                </label>
                <input
                  type="number"
                  value={height}
                  onChange={(e) => setHeight(Math.min(600, Math.max(200, parseInt(e.target.value) || 200)))}
                  className="retro-input text-sm w-full"
                  style={{ fontFamily: '"VT323", monospace', fontSize: "0.85rem", padding: "0.2rem 0.4rem" }}
                  min={200}
                  max={600}
                />
              </div>
            </div>

            {/* Toggles */}
            <div className="flex gap-3 flex-wrap">
              {[
                { key: "price", label: "PRICE", checked: showPrice, setter: setShowPrice },
                { key: "chart", label: "CHART", checked: showChart, setter: setShowChart },
                { key: "buy", label: "BUY BTN", checked: showBuy, setter: setShowBuy },
              ].map((opt) => (
                <label
                  key={opt.key}
                  className="flex items-center gap-1.5 cursor-pointer"
                  style={{ fontFamily: '"VT323", monospace', fontSize: "0.85rem", color: theme.text }}
                >
                  <input
                    type="checkbox"
                    checked={opt.checked}
                    onChange={(e) => opt.setter(e.target.checked)}
                    className="accent-[#00ff41]"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          {/* Widget preview */}
          <div
            className="p-3 rounded"
            style={{ background: theme.bgSecondary, border: `1px solid ${theme.border}` }}
          >
            <div
              className="text-[0.35rem] mb-2"
              style={{ fontFamily: '"Press Start 2P", monospace', color: theme.textMuted }}
            >
              PREVIEW:
            </div>
            <div
              className="mx-auto p-3 rounded"
              style={{
                background: theme.bg,
                border: `2px solid ${theme.border}`,
                width: Math.min(width, 400),
                height: Math.min(height / 2, 120),
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-6 h-6 rounded flex items-center justify-center shrink-0"
                  style={{
                    background: "#0d120d",
                    border: `2px solid ${theme.border}`,
                    fontFamily: '"Press Start 2P", monospace',
                    fontSize: "0.35rem",
                    color: "#00ff41",
                  }}
                >
                  {selectedToken.ticker.slice(0, 2)}
                </div>
                <div>
                  <div
                    className="font-bold truncate"
                    style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.35rem", color: theme.text }}
                  >
                    {selectedToken.name}
                  </div>
                  <div
                    style={{ fontFamily: '"VT323", monospace', fontSize: "0.85rem", color: theme.primary }}
                  >
                    ${selectedToken.ticker}
                  </div>
                </div>
              </div>
              {showPrice && (
                <div
                  className="text-xs font-bold"
                  style={{ fontFamily: '"VT323", monospace', fontSize: "1rem", color: "#00ff41" }}
                >
                  ${selectedToken.price < 0.001 ? selectedToken.price.toFixed(6) : selectedToken.price.toFixed(4)}
                </div>
              )}
              {showChart && (
                <div
                  className="h-6 mt-1 rounded"
                  style={{ background: "rgba(0,255,65,0.05)" }}
                >
                  <div className="h-full w-full flex items-end gap-0.5 px-1">
                    {selectedToken.priceHistory.slice(-12).map((p, i) => (
                      <div
                        key={i}
                        className="flex-1 rounded-t"
                        style={{
                          height: `${Math.max(10, (p / (selectedToken.price || 1)) * 100)}%`,
                          background: "#00ff41",
                          opacity: 0.5 + (i / 24),
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
              {showBuy && (
                <div
                  className="text-center mt-2 text-[0.3rem] px-2 py-0.5 rounded"
                  style={{
                    fontFamily: '"Press Start 2P", monospace',
                    background: "rgba(0,255,65,0.1)",
                    color: "#00ff41",
                    border: "1px solid rgba(0,255,65,0.2)",
                  }}
                >
                  Trade on ignoshashi
                </div>
              )}
            </div>
          </div>

          {/* Generated code */}
          <div className="relative">
            <textarea
              readOnly
              value={iframeCode}
              rows={6}
              className="retro-textarea text-sm w-full"
              style={{ fontFamily: '"VT323", monospace', fontSize: "0.75rem", padding: "0.4rem" }}
            />
            <button
              onClick={handleCopy}
              className="absolute top-2 right-2 retro-btn retro-btn-outline text-[0.3rem] px-2 py-1"
              style={{ fontFamily: '"Press Start 2P", monospace' }}
            >
              {copied ? "📋 COPIED!" : "📋 COPY"}
            </button>
          </div>
        </motion.div>
      )}

      {!selectedToken && (
        <div className="flex-1 flex items-center justify-center">
          <p
            className="text-[#e0ffe0] text-center"
            style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
          >
            Select a token to generate embed widget code.
          </p>
        </div>
      )}

      <div className="mt-auto pt-3 text-center">
        <span
          className="text-[0.35rem] text-[#e0ffe0] bg-[rgba(0,255,65,0.1)] px-2 py-0.5 rounded"
          style={{ fontFamily: '"Press Start 2P", monospace' }}
        >
          🟢 FREE
        </span>
      </div>
    </Card>
  );
}
