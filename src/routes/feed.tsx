import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getEvents, getComments, type PlatformEvent, type CommentData } from "~/services/tracker";

export const Route = createFileRoute("/feed")({
  component: FeedPage,
});

function getTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const typeEmoji: Record<string, string> = {
  launch: "🚀",
  buy: "💰",
  sell: "📉",
  fee: "💎",
  comment: "💬",
};

const typeColors: Record<string, string> = {
  launch: "#00ff41",
  buy: "#00ff41",
  sell: "#00cc33",
  fee: "#ffffff",
  comment: "#00ff41",
};

function FeedPage() {
  const [events, setEvents] = useState<PlatformEvent[]>([]);
  const [comments, setComments] = useState<CommentData[]>([]);
  const [filter, setFilter] = useState<string>("all");
  useEffect(() => {
    const realEvents = getEvents(100);
    const realComments = getComments();
    setEvents(realEvents);
    setComments(realComments);
    const interval = setInterval(() => {
      setEvents(getEvents(100));
      setComments(getComments());
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const filterTabs = ["all", "launch", "buy", "sell", "fee", "comment"];

  const isEmpty = events.length === 0 && comments.length === 0;

  const displayEvents = events;
  const displayComments = comments;

  return (
    <div className="min-h-dvh bg-[#050505] py-8">
      <div className="max-w-3xl mx-auto px-4">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="text-center mb-8"
        >
          <h1
            className="text-2xl font-bold text-[#00ff41] mb-2 pixel-shadow-sm"
            style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "1rem" }}
          >
            ACTIVITY FEED
          </h1>
          <p className="text-[#e0ffe0]" style={{ fontFamily: '"VT323", monospace', fontSize: "1.1rem" }}>
            All platform activity in real-time ⭐
          </p>
        </motion.div>

        {/* Filter tabs */}
        <div className="flex flex-wrap gap-2 mb-6 justify-center">
          {filterTabs.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`retro-tab ${filter === f ? "retro-tab-active" : ""}`}
              style={{ fontFamily: '"Press Start 2P", monospace' }}
            >
              {f === "all" ? "ALL" : `${typeEmoji[f] || ""} ${f.toUpperCase()}`}
            </button>
          ))}
        </div>

        {/* Comments tab view */}
        {filter === "comment" && (
          <div className="space-y-3">
            {displayComments.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-4xl mb-4">💬</p>
                <p className="text-[#e0ffe0] mb-2" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.6rem" }}>
                  NO COMMENTS YET
                </p>
                <p className="text-[#b0d0b0]" style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}>
                  Be the first to comment on a token!
                </p>
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {displayComments.map((comment, i) => (
                  <motion.div
                    key={comment.id}
                    initial={{ opacity: 0, y: -8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.2, delay: Math.min(i * 0.015, 0.2) }}
                  >
                    <div className="retro-card p-3 flex items-start gap-3">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 text-lg"
                        style={{ background: "#00ff4120", border: "2px solid #00ff4140" }}
                      >
                        💬
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className="font-bold text-[#ffffff]"
                            style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.45rem" }}
                          >
                            {comment.wallet.slice(0, 4)}...{comment.wallet.slice(-4)}
                          </span>
                          <span
                            className="px-1.5 py-0.5 rounded text-[0.4rem] font-bold"
                            style={{
                              fontFamily: '"Press Start 2P", monospace',
                              background: "#00ff4120",
                              color: "#00ff41",
                              border: "1px solid #00ff4140",
                            }}
                          >
                            COMMENT
                          </span>
                        </div>
                        <p className="text-[#e0ffe0] mt-1 text-sm" style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}>
                          {comment.message}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <span className="text-[0.45rem] text-[#b0d0b0]" style={{ fontFamily: '"Press Start 2P", monospace' }}>
                          {getTimeAgo(comment.timestamp)}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>
        )}

        {/* Events feed (non-comment tabs) */}
        {filter !== "comment" && (
          <div className="space-y-3">
            <AnimatePresence initial={false}>
              {displayEvents
                .filter((e) => filter === "all" || e.type === filter)
                .map((event, i) => (
                  <motion.div
                    key={event.id}
                    initial={{ opacity: 0, y: -8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.2, delay: Math.min(i * 0.015, 0.2) }}
                  >
                    <div className="retro-card p-3 flex items-start gap-3">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 text-lg"
                        style={{
                          background: `${typeColors[event.type]}15`,
                          border: `2px solid ${typeColors[event.type]}40`,
                        }}
                      >
                        {typeEmoji[event.type] || "📋"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className="font-bold"
                            style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.45rem", color: "#ffffff" }}
                          >
                            {event.tokenTicker || "IGNOSHASHI"}
                          </span>
                          <span
                            className="px-1.5 py-0.5 rounded text-[0.4rem] font-bold"
                            style={{
                              fontFamily: '"Press Start 2P", monospace',
                              background: `${typeColors[event.type]}20`,
                              color: typeColors[event.type],
                              border: `1px solid ${typeColors[event.type]}40`,
                            }}
                          >
                            {event.type.toUpperCase()}
                          </span>
                          {event.blockchain && (
                            <span
                              className="text-[0.4rem]"
                              style={{ fontFamily: '"Press Start 2P", monospace', color: "#8b4513" }}
                            >
                              {event.blockchain.toUpperCase()}
                            </span>
                          )}
                        </div>
                        <p className="text-[#e0ffe0] mt-1 text-sm" style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}>
                          {event.message}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <span className="text-[0.45rem] text-[#b0d0b0]" style={{ fontFamily: '"Press Start 2P", monospace' }}>
                          {getTimeAgo(event.timestamp)}
                        </span>
                        <br />
                        <span className="text-[#b0d0b0] text-xs" style={{ fontFamily: '"VT323", monospace', fontSize: "0.9rem" }}>
                          {event.wallet.slice(0, 12)}...
                        </span>
                      </div>
                    </div>
                  </motion.div>
                ))}
            </AnimatePresence>

            {isEmpty && (
              <div className="text-center py-16">
                <p className="text-5xl mb-4 retro-float">🪙</p>
                <p className="text-[#ffffff] mb-2" style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.7rem" }}>
                  NO ACTIVITY YET
                </p>
                <p className="text-[#e0ffe0]" style={{ fontFamily: '"VT323", monospace', fontSize: "1.1rem" }}>
                  Launch a token to get started! 🚀
                </p>
              </div>
            )}
            {!isEmpty && events.filter((e) => filter === "all" || e.type === filter).length === 0 && (
              <div className="text-center py-12">
                <p className="text-[#e0ffe0]" style={{ fontFamily: '"VT323", monospace', fontSize: "1.1rem" }}>
                  No {filter} activity yet
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
