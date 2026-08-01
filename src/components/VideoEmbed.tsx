import { useState } from "react";

interface VideoEmbedProps {
  videoUrl: string;
}

/**
 * Validates and extracts embed URL from common video platforms.
 * Supports: YouTube (watch, youtu.be, embed), Vimeo, TikTok, and direct iframe URLs.
 */
function getEmbedUrl(rawUrl: string): { platform: string; embedUrl: string } | null {
  const url = rawUrl.trim();

  // YouTube
  const ytMatch =
    url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch) {
    return {
      platform: "YouTube",
      embedUrl: `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=0&rel=0`,
    };
  }

  // Vimeo
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) {
    return {
      platform: "Vimeo",
      embedUrl: `https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=0`,
    };
  }

  // TikTok
  const tiktokMatch = url.match(/tiktok\.com\/@[\w.-]+\/video\/(\d+)/);
  if (tiktokMatch) {
    return {
      platform: "TikTok",
      embedUrl: `https://www.tiktok.com/embed/v2/${tiktokMatch[1]}`,
    };
  }

  // Already an iframe embed URL (starts with https:// and contains /embed/ or /player/)
  if (
    url.startsWith("https://") &&
    (url.includes("/embed/") || url.includes("/player/") || url.includes("w.soundcloud.com"))
  ) {
    return {
      platform: "Embed",
      embedUrl: url,
    };
  }

  return null;
}

export function VideoEmbed({ videoUrl }: VideoEmbedProps) {
  const [showPolicy, setShowPolicy] = useState(true);

  const embedInfo = getEmbedUrl(videoUrl);

  if (!embedInfo) {
    return (
      <div className="retro-card p-4 mt-4 text-center border-[rgba(255,100,100,0.3)]">
        <p
          className="text-[#ff6b6b] mb-2"
          style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.4rem" }}
        >
          ⚠ INVALID VIDEO URL
        </p>
        <p
          className="text-[#e0ffe0]"
          style={{ fontFamily: '"VT323", monospace', fontSize: "1rem" }}
        >
          The video URL format is not supported. Supported platforms: YouTube, Vimeo, TikTok.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4">
      {/* Content Policy Banner */}
      {showPolicy && (
        <div
          className="retro-card p-3 mb-3 flex items-start gap-3"
          style={{
            borderColor: "rgba(255,180,60,0.4)",
            boxShadow: "0 0 10px rgba(255,180,60,0.1)",
          }}
        >
          <span className="text-xl shrink-0">⚠️</span>
          <div className="flex-1 min-w-0">
            <p
              className="text-[#ffb83c] mb-1 font-bold"
              style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.4rem" }}
            >
              CONTENT POLICY
            </p>
            <p
              className="text-[#e0ffe0] text-xs"
              style={{ fontFamily: '"VT323", monospace', fontSize: "0.95rem" }}
            >
              No nudity, gore, hate speech, cyberbullying, or illegal content. Violations result in token removal.
            </p>
          </div>
          <button
            onClick={() => setShowPolicy(false)}
            className="text-[#b0d0b0] hover:text-[#00ff41] shrink-0 text-sm"
          >
            ✕
          </button>
        </div>
      )}

      {/* Video Embed */}
      <div
        className="retro-card p-2 overflow-hidden relative"
        style={{
          border: "3px solid rgba(0,255,65,0.3)",
          boxShadow: "6px 6px 0 rgba(0,255,65,0.15)",
        }}
      >
        {/* CRT scanline */}
        <div
          className="absolute inset-0 pointer-events-none z-10 rounded-lg overflow-hidden"
          style={{
            background:
              "repeating-linear-gradient(0deg, rgba(0,0,0,0.06) 0px, rgba(0,0,0,0.06) 1px, transparent 1px, transparent 3px)",
          }}
        />
        <div className="relative">
          <div className="flex items-center gap-2 mb-2 px-1">
            <span className="text-sm">🎬</span>
            <span
              className="text-[#00ff41]"
              style={{ fontFamily: '"Press Start 2P", monospace', fontSize: "0.35rem" }}
            >
              {embedInfo.platform} VIDEO
            </span>
          </div>
          <div className="relative aspect-video rounded-lg overflow-hidden">
            <iframe
              src={embedInfo.embedUrl}
              width="100%"
              height="100%"
              frameBorder="0"
              allowFullScreen
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              className="w-full h-full"
              title="Token video"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Validates a raw video URL string against supported platforms.
 */
export function isValidVideoUrl(url: string): boolean {
  if (!url.trim()) return true; // Empty is valid (optional field)
  return getEmbedUrl(url) !== null;
}
