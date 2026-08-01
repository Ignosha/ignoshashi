import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HiMiniXMark, HiMiniBellAlert } from "react-icons/hi2";
import { addAlert, type PriceAlert } from "~/services/priceAlerts";
import { isSupported, requestPermission, sendNotification, playArcadeBeep } from "~/services/notifications";

interface PriceAlertModalProps {
  open: boolean;
  onClose: () => void;
  tokenId: string;
  tokenName: string;
  ticker: string;
  currentPrice: number;
  blockchain: "solana" | "ethereum";
  currencySymbol: string;
}

export function PriceAlertModal({
  open,
  onClose,
  tokenId,
  tokenName,
  ticker,
  currentPrice,
  blockchain,
  currencySymbol,
}: PriceAlertModalProps) {
  const [targetPrice, setTargetPrice] = useState("");
  const [condition, setCondition] = useState<"above" | "below">("above");
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);
  const [notifPermission, setNotifPermission] = useState<string>(
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "default"
  );

  const handleSave = async () => {
    const price = parseFloat(targetPrice);
    if (isNaN(price) || price <= 0) return;

    addAlert({
      tokenId,
      tokenName,
      ticker,
      targetPrice: price,
      condition,
      note: note.trim() || "",
      blockchain,
    });

    // Request notification permission if not yet granted
    if (isSupported() && notifPermission !== "granted") {
      const result = await requestPermission();
      setNotifPermission(result);
    }

    // Send a test confirmation notification
    if (isSupported() && (notifPermission === "granted" || Notification.permission === "granted")) {
      sendNotification(
        `🔔 Alert Set: ${ticker}`,
        {
          body: `${condition === "above" ? "Above" : "Below"} ${price} ${currencySymbol}. We'll notify you when this price is hit!`,
          tag: `alert-test-${tokenId}`,
          data: { url: `/token/${tokenId}`, type: "alert-test" },
        }
      );
      playArcadeBeep(660, 120);
    }

    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      setTargetPrice("");
      setNote("");
      onClose();
    }, 1200);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          style={{ background: "rgba(0, 0, 0, 0.75)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ duration: 0.2, ease: [0.68, -0.55, 0.265, 1.55] }}
            className="retro-card p-5 w-full max-w-sm relative"
          >
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-3 right-3 text-[#b0d0b0] hover:text-[#00ff41] transition-colors"
              aria-label="Close"
            >
              <HiMiniXMark size={18} />
            </button>

            {/* Header */}
            <div className="mb-4">
              <h3
                className="text-[#00ff41] mb-1 flex items-center gap-2"
                style={{
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: "0.55rem",
                }}
              >
                <HiMiniBellAlert size={14} />
                SET PRICE ALERT
              </h3>
              <p
                className="text-[#e0ffe0]"
                style={{ fontFamily: '"VT323", monospace', fontSize: "1.1rem" }}
              >
                {tokenName} (${ticker})
              </p>
              <p
                className="text-[#b0d0b0]"
                style={{ fontFamily: '"VT323", monospace', fontSize: "0.95rem" }}
              >
                Current: {currentPrice < 0.0001 ? currentPrice.toFixed(8) : currentPrice.toFixed(6)} {currencySymbol}
              </p>
            </div>

            {/* Alert type */}
            <div className="mb-3">
              <label
                className="text-[#b0d0b0] mb-1 block"
                style={{
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: "0.4rem",
                }}
              >
                CONDITION
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setCondition("above")}
                  className={`flex-1 py-1.5 rounded font-bold text-[0.4rem] ${
                    condition === "above" ? "retro-tab-active" : "retro-tab"
                  }`}
                  style={{ fontFamily: '"Press Start 2P", monospace' }}
                >
                  ▲ PRICE ABOVE
                </button>
                <button
                  onClick={() => setCondition("below")}
                  className={`flex-1 py-1.5 rounded font-bold text-[0.4rem] ${
                    condition === "below" ? "retro-tab-active" : "retro-tab"
                  }`}
                  style={{ fontFamily: '"Press Start 2P", monospace' }}
                >
                  ▼ PRICE BELOW
                </button>
              </div>
            </div>

            {/* Target price */}
            <div className="mb-3">
              <label
                className="text-[#b0d0b0] mb-1 block"
                style={{
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: "0.4rem",
                }}
              >
                TARGET PRICE ({currencySymbol})
              </label>
              <input
                type="number"
                value={targetPrice}
                onChange={(e) => setTargetPrice(e.target.value)}
                placeholder={`e.g. ${(currentPrice * 1.5).toFixed(6)}`}
                step="any"
                min="0"
                className="retro-input w-full"
                style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
              />
            </div>

            {/* Optional note */}
            <div className="mb-4">
              <label
                className="text-[#b0d0b0] mb-1 block"
                style={{
                  fontFamily: '"Press Start 2P", monospace',
                  fontSize: "0.4rem",
                }}
              >
                NOTE (OPTIONAL)
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 100))}
                placeholder="E.g. Take profit target"
                maxLength={100}
                className="retro-input w-full"
                style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
              />
            </div>

            {/* Notification note */}
            {isSupported() && (
              <p
                className="text-[#b0d0b0] mb-3 text-center"
                style={{
                  fontFamily: '"VT323", monospace',
                  fontSize: "0.85rem",
                }}
              >
                💡 You'll get a push notification when this price is hit
              </p>
            )}

            {/* Save button */}
            <button
              onClick={handleSave}
              disabled={!targetPrice || isNaN(parseFloat(targetPrice)) || parseFloat(targetPrice) <= 0 || saved}
              className={`retro-btn w-full justify-center text-[0.45rem] py-2 ${
                saved ? "retro-btn-turquoise" : "retro-btn-orange neon-glow-yellow"
              }`}
              style={{ fontFamily: '"Press Start 2P", monospace' }}
            >
              {saved ? "✅ ALERT SET!" : "🔔 SET ALERT"}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
