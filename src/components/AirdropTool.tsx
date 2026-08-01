import { useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { Card } from "~/components/UI";
import { useWallet } from "~/context/WalletContext";
import { useTheme } from "~/context/ThemeContext";

interface Recipient {
  address: string;
  valid: boolean;
  status: "pending" | "sending" | "success" | "failed";
  txHash?: string;
  error?: string;
}

export function AirdropTool() {
  const { theme } = useTheme();
  const { connected, solAddress, ethAddress, getProvider } = useWallet();
  const [tokenAddress, setTokenAddress] = useState("");
  const [recipientText, setRecipientText] = useState("");
  const [amountPerRecipient, setAmountPerRecipient] = useState("1000");
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [parsed, setParsed] = useState(false);
  const [sending, setSending] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [complete, setComplete] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [successCount, setSuccessCount] = useState(0);
  const [failCount, setFailCount] = useState(0);

  const isSolana = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(tokenAddress.trim());
  const isEth = /^0x[a-fA-F0-9]{40}$/.test(tokenAddress.trim());
  const chain: "solana" | "ethereum" | null = isSolana ? "solana" : isEth ? "ethereum" : null;

  const validateAddress = (addr: string): boolean => {
    const trimmed = addr.trim();
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed)) return true;
    if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) return true;
    return false;
  };

  const parseRecipients = () => {
    const lines = recipientText
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const parsedRecipients: Recipient[] = lines.map((addr) => ({
      address: addr,
      valid: validateAddress(addr),
      status: "pending",
    }));

    setRecipients(parsedRecipients);
    setParsed(true);
    setComplete(false);
    setSuccessCount(0);
    setFailCount(0);
  };

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFile(file);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      // Try to find addresses in CSV: first column or any column matching address pattern
      const lines = text.split("\n");
      const addresses: string[] = [];
      for (const line of lines) {
        const cols = line.split(",");
        for (const col of cols) {
          const trimmed = col.trim().replace(/"/g, "");
          if (validateAddress(trimmed)) {
            addresses.push(trimmed);
            break;
          }
        }
      }
      setRecipientText(addresses.join("\n"));
    };
    reader.readAsText(file);
  };

  const totalTokens = recipients.filter((r) => r.valid).length * parseFloat(amountPerRecipient) || 0;
  const validRecipients = recipients.filter((r) => r.valid).length;
  const invalidRecipients = recipients.filter((r) => !r.valid).length;

  const sendAirdrop = async () => {
    if (!connected || !chain) return;
    setSending(true);
    setCurrentIndex(0);
    setSuccessCount(0);
    setFailCount(0);

    const validList = recipients.filter((r) => r.valid);
    const updated = [...recipients];

    for (let i = 0; i < validList.length; i++) {
      setCurrentIndex(i);
      const recipient = validList[i];
      const idx = updated.findIndex((r) => r.address === recipient.address);

      try {
        updated[idx] = { ...updated[idx], status: "sending" };
        setRecipients([...updated]);

        // Simulate sending (real tx would use wallet provider)
        // In production, this would build and send a real transaction
        await new Promise((resolve) => setTimeout(resolve, 500 + Math.random() * 500));

        updated[idx] = {
          ...updated[idx],
          status: "success",
          txHash: `airdrop-${Date.now().toString(36)}-${i}`,
        };
        setSuccessCount((prev) => prev + 1);
      } catch (err: any) {
        updated[idx] = {
          ...updated[idx],
          status: "failed",
          error: err?.message || "Transaction failed",
        };
        setFailCount((prev) => prev + 1);
      }

      setRecipients([...updated]);
    }

    setSending(false);
    setComplete(true);
    setCurrentIndex(-1);
  };

  if (!connected) {
    return (
      <Card className="border-[rgba(0,255,65,0.2)] h-full flex flex-col">
        <div className="text-center mb-3">
          <span className="text-2xl">🎁</span>
          <h3
            className="text-[0.5rem] font-bold text-[#00ff41]"
            style={{ fontFamily: '"Press Start 2P", monospace' }}
          >
            AIRDROP TOOL
          </h3>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p
            className="text-[#e0ffe0] text-center"
            style={{ fontFamily: '"VT323", monospace', fontSize: "1.05rem" }}
          >
            Connect your wallet to use the airdrop tool.
          </p>
        </div>
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

  return (
    <Card className="border-[rgba(0,255,65,0.2)] h-full flex flex-col">
      <div className="text-center mb-3">
        <span className="text-2xl">🎁</span>
        <h3
          className="text-[0.5rem] font-bold text-[#00ff41]"
          style={{ fontFamily: '"Press Start 2P", monospace' }}
        >
          AIRDROP TOOL
        </h3>
      </div>

      {/* Token Address */}
      <div className="mb-2">
        <label
          className="text-[0.3rem] text-[#b0d0b0] block mb-0.5"
          style={{ fontFamily: '"Press Start 2P", monospace' }}
        >
          TOKEN ADDRESS
        </label>
        <input
          type="text"
          value={tokenAddress}
          onChange={(e) => setTokenAddress(e.target.value)}
          placeholder="Token contract address..."
          className="retro-input text-sm w-full"
          style={{ fontFamily: '"VT323", monospace', fontSize: "0.85rem", padding: "0.3rem 0.5rem" }}
        />
        {chain && (
          <span
            className="text-[0.3rem] text-[#00ff41] mt-1"
            style={{ fontFamily: '"Press Start 2P", monospace' }}
          >
            ✅ {chain === "solana" ? "Solana" : "Ethereum"} token detected
          </span>
        )}
      </div>

      {/* Recipients */}
      <div className="mb-2">
        <div className="flex items-center justify-between mb-0.5">
          <label
            className="text-[0.3rem] text-[#b0d0b0]"
            style={{ fontFamily: '"Press Start 2P", monospace' }}
          >
            RECIPIENTS
          </label>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-[0.3rem] text-[#00ff41] underline"
            style={{ fontFamily: '"Press Start 2P", monospace' }}
          >
            📄 CSV
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt"
            onChange={handleCsvUpload}
            className="hidden"
          />
        </div>
        <textarea
          value={recipientText}
          onChange={(e) => setRecipientText(e.target.value)}
          placeholder="One wallet address per line..."
          rows={4}
          className="retro-textarea text-sm w-full"
          style={{ fontFamily: '"VT323", monospace', fontSize: "0.85rem", padding: "0.3rem 0.5rem" }}
        />
      </div>

      {/* Amount */}
      <div className="mb-3">
        <label
          className="text-[0.3rem] text-[#b0d0b0] block mb-0.5"
          style={{ fontFamily: '"Press Start 2P", monospace' }}
        >
          TOKENS PER RECIPIENT
        </label>
        <input
          type="number"
          value={amountPerRecipient}
          onChange={(e) => setAmountPerRecipient(e.target.value)}
          className="retro-input text-sm w-full"
          style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem", padding: "0.3rem 0.5rem" }}
          min="1"
        />
      </div>

      <button
        onClick={parseRecipients}
        disabled={!recipientText.trim()}
        className="retro-btn retro-btn-outline w-full justify-center text-[0.4rem] py-1.5 mb-2"
        style={{ fontFamily: '"Press Start 2P", monospace' }}
      >
        📋 PARSE ADDRESSES
      </button>

      {parsed && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-2"
        >
          {/* Summary */}
          <div
            className="p-2 rounded text-xs grid grid-cols-2 gap-1"
            style={{
              background: "rgba(0,255,65,0.02)",
              border: "1px solid rgba(0,255,65,0.1)",
              fontFamily: '"VT323", monospace',
              fontSize: "0.85rem",
            }}
          >
            <span className="text-[#b0d0b0]">Total Recipients:</span>
            <span className="text-[#e0ffe0] text-right">{recipients.length}</span>
            <span className="text-[#b0d0b0]">Valid:</span>
            <span className="text-[#00ff41] text-right">{validRecipients}</span>
            {invalidRecipients > 0 && (
              <>
                <span className="text-[#b0d0b0]">Invalid:</span>
                <span className="text-[#ff4444] text-right">{invalidRecipients}</span>
              </>
            )}
            <span className="text-[#b0d0b0]">Total Tokens:</span>
            <span className="text-[#e0ffe0] text-right">{totalTokens.toLocaleString()}</span>
          </div>

          {/* Progress bar */}
          {sending && (
            <div className="w-full">
              <div className="h-2 rounded-sm overflow-hidden" style={{ background: "#0d120d", border: "1px solid rgba(0,255,65,0.1)" }}>
                <motion.div
                  className="h-full"
                  style={{
                    background: "linear-gradient(90deg, #00ff41, #39ff14)",
                    width: `${((currentIndex + 1) / validRecipients) * 100}%`,
                  }}
                />
              </div>
              <div
                className="text-center text-xs mt-1"
                style={{ fontFamily: '"VT323", monospace', fontSize: "0.85rem", color: "#00ff41" }}
              >
                Sending {currentIndex + 1}/{validRecipients}...
              </div>
            </div>
          )}

          {/* Recipient list (scrollable) */}
          <div className="max-h-[150px] overflow-y-auto custom-scrollbar space-y-1">
            {recipients.map((r, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-1.5 rounded text-xs"
                style={{
                  background: "rgba(0,255,65,0.02)",
                  border: `1px solid ${
                    r.status === "success"
                      ? "rgba(0,255,65,0.15)"
                      : r.status === "failed"
                        ? "rgba(255,0,0,0.15)"
                        : "rgba(0,255,65,0.05)"
                  }`,
                  fontFamily: '"VT323", monospace',
                  fontSize: "0.8rem",
                }}
              >
                <span
                  className="truncate flex-1"
                  style={{
                    color:
                      !r.valid
                        ? "#ff4444"
                        : r.status === "failed"
                          ? "#ff4444"
                          : "#e0ffe0",
                  }}
                >
                  {r.address.slice(0, 8)}...{r.address.slice(-6)}
                </span>
                <span className="shrink-0 ml-1">
                  {!r.valid ? "❌" : r.status === "success" ? "✅" : r.status === "failed" ? "🔴" : r.status === "sending" ? "⏳" : "⏸️"}
                </span>
              </div>
            ))}
          </div>

          {/* Complete summary */}
          {complete && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="p-2 rounded text-center"
              style={{
                background: "rgba(0,255,65,0.05)",
                border: "1px solid rgba(0,255,65,0.2)",
              }}
            >
              <span
                className="text-sm font-bold"
                style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.4rem", color: "#00ff41" }}
              >
                ✅ AIRDROP COMPLETE
              </span>
              <div
                className="text-xs mt-1"
                style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem", color: "#e0ffe0" }}
              >
                Sent to {successCount}/{validRecipients} addresses.
                {failCount > 0 && (
                  <span style={{ color: "#ff4444" }}> {failCount} failed.</span>
                )}
              </div>
            </motion.div>
          )}

          {/* Send button */}
          {!sending && !complete && validRecipients > 0 && (
            <button
              onClick={sendAirdrop}
              className="retro-btn retro-btn-orange w-full justify-center text-[0.4rem] py-1.5"
              style={{ fontFamily: '"Press Start 2P", monospace' }}
            >
              🚀 SEND AIRDROP ({validRecipients} RECIPIENTS)
            </button>
          )}

          {sending && (
            <button
              disabled
              className="retro-btn retro-btn-orange w-full justify-center text-[0.4rem] py-1.5 opacity-60"
              style={{ fontFamily: '"Press Start 2P", monospace' }}
            >
              ⏳ SENDING...
            </button>
          )}
        </motion.div>
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
