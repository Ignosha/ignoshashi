import { motion } from "framer-motion";
import { HiMiniStar, HiOutlineStar } from "react-icons/hi2";
import { useWatchlist } from "~/context/WatchlistContext";

interface WatchlistToggleProps {
  /** If provided, watches/unwatches this token ID */
  tokenId?: string;
  /** If provided, watches/unwatches this creator wallet address */
  creatorAddress?: string;
  /** Size in pixels (default 18) */
  size?: number;
  /** Additional class name */
  className?: string;
  /** Label text next to the star */
  label?: string;
}

export function WatchlistToggle({
  tokenId,
  creatorAddress,
  size = 18,
  className = "",
  label,
}: WatchlistToggleProps) {
  const { isTokenWatched, isCreatorWatched, toggleToken, toggleCreator } = useWatchlist();

  const isWatched = tokenId
    ? isTokenWatched(tokenId)
    : creatorAddress
      ? isCreatorWatched(creatorAddress)
      : false;

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (tokenId) {
      toggleToken(tokenId);
    } else if (creatorAddress) {
      toggleCreator(creatorAddress);
    }
  };

  return (
    <motion.button
      onClick={handleToggle}
      whileHover={{ scale: 1.2 }}
      whileTap={{ scale: 0.85 }}
      className={`inline-flex items-center gap-1 transition-colors duration-150 ${className}`}
      style={{
        cursor: "pointer",
        background: "transparent",
        border: "none",
        padding: 0,
      }}
      title={isWatched ? "Remove from watchlist" : "Add to watchlist"}
    >
      {isWatched ? (
        <HiMiniStar
          size={size}
          style={{
            color: "#ffd700",
            filter: "drop-shadow(0 0 4px rgba(255,215,0,0.6)) drop-shadow(0 0 8px rgba(255,215,0,0.3))",
          }}
        />
      ) : (
        <HiOutlineStar
          size={size}
          style={{
            color: "#6b6b55",
          }}
          className="hover:text-[#ffd700] transition-colors duration-150"
        />
      )}
      {label && (
        <span
          style={{
            fontFamily: '"Press Start 2P", monospace',
            fontSize: "0.4rem",
            color: isWatched ? "#ffd700" : "#6b6b55",
          }}
        >
          {label}
        </span>
      )}
    </motion.button>
  );
}
