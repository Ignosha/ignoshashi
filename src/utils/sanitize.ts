/**
 * ignoshashi Input Sanitization Utilities
 * Green/Black retro design system
 */

/**
 * Strip HTML tags from a string.
 * Replaces <[^>]*> with empty string, then trims.
 */
export function stripHtml(input: string): string {
  if (typeof input !== "string") return "";
  return input.replace(/<[^>]*>/g, "").trim();
}

/**
 * Escape characters that could break JSON in localStorage.
 * Replaces backslashes and double quotes.
 */
export function escapeJsonSpecial(input: string): string {
  if (typeof input !== "string") return "";
  return input.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Full sanitization for user-generated text.
 * - Strips HTML tags
 * - Trims whitespace
 * - Limits to maxLength characters
 */
export function sanitizeText(input: string, maxLength = 1000): string {
  if (typeof input !== "string") return "";
  let cleaned = input.replace(/<[^>]*>/g, "").trim();
  if (cleaned.length > maxLength) {
    cleaned = cleaned.slice(0, maxLength);
  }
  return cleaned;
}

/**
 * Sanitize a callsign/username.
 * - Strips HTML
 * - Limits to 30 chars
 * - Allows alphanumeric, underscores, hyphens
 */
export function sanitizeCallsign(input: string): string {
  if (typeof input !== "string") return "";
  let cleaned = input.replace(/<[^>]*>/g, "").trim();
  // Remove characters that aren't alphanumeric, underscore, or hyphen
  cleaned = cleaned.replace(/[^a-zA-Z0-9_-]/g, "");
  if (cleaned.length > 30) {
    cleaned = cleaned.slice(0, 30);
  }
  return cleaned;
}

/**
 * Sanitize a search query.
 * - Strips HTML
 * - Limits to 100 chars
 */
export function sanitizeSearch(input: string): string {
  if (typeof input !== "string") return "";
  let cleaned = input.replace(/<[^>]*>/g, "").trim();
  if (cleaned.length > 100) {
    cleaned = cleaned.slice(0, 100);
  }
  return cleaned;
}

/**
 * Sanitize a token name.
 * - Strips HTML
 * - Limits to 30 chars
 */
export function sanitizeTokenName(input: string): string {
  if (typeof input !== "string") return "";
  let cleaned = input.replace(/<[^>]*>/g, "").trim();
  if (cleaned.length > 30) {
    cleaned = cleaned.slice(0, 30);
  }
  return cleaned;
}

/**
 * Sanitize a token ticker.
 * - Strips HTML
 * - Uppercase only
 * - Alphanumeric only
 * - Max 10 chars
 */
export function sanitizeTicker(input: string): string {
  if (typeof input !== "string") return "";
  let cleaned = input.replace(/<[^>]*>/g, "").trim().toUpperCase();
  cleaned = cleaned.replace(/[^A-Z0-9]/g, "");
  if (cleaned.length > 10) {
    cleaned = cleaned.slice(0, 10);
  }
  return cleaned;
}

/**
 * Validate supply is a positive number within range.
 * Returns the parsed number or null if invalid.
 */
export function validateSupply(input: string): number | null {
  const num = Number(input);
  if (!Number.isFinite(num) || num < 1 || num > 1_000_000_000_000) {
    return null;
  }
  return Math.floor(num); // Supply must be an integer
}

/**
 * Validate image base64 data URL.
 * Checks that it starts with data:image/ and is a supported type.
 * Returns true if valid.
 */
export function validateImageDataUrl(url: string): boolean {
  if (typeof url !== "string") return false;
  // Must start with data:image/
  if (!url.startsWith("data:image/")) return false;
  // Extract the MIME type
  const mimeMatch = url.match(/^data:(image\/[a-zA-Z0-9.+-]+);/);
  if (!mimeMatch) return false;
  const mimeType = mimeMatch[1].toLowerCase();
  const allowed = ["image/png", "image/jpeg", "image/gif", "image/webp"];
  return allowed.includes(mimeType);
}

/**
 * Validate a file is actually an image (not SVG or other scriptable format).
 * Checks MIME type string. Supports HEIC/HEIF from Apple devices.
 */
export function isValidImageMime(mimeType: string): boolean {
  const allowed = [
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
    "image/heic",
    "image/heif",
  ];
  return allowed.includes(mimeType.toLowerCase());
}

/**
 * Check if a file is a HEIC/HEIF image (Apple format).
 */
export function isHeicFile(file: File): boolean {
  const mime = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return (
    mime === "image/heic" ||
    mime === "image/heif" ||
    name.endsWith(".heic") ||
    name.endsWith(".heif")
  );
}

/**
 * Convert a HEIC/HEIF file to JPEG using browser canvas.
 * HEIC is natively supported in Safari; other browsers may fail.
 * Falls back to returning the original file as a data URL if conversion fails.
 */
export async function convertHeicToJpeg(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            // Canvas not available — return original as fallback
            resolve(reader.result as string);
            return;
          }
          ctx.drawImage(img, 0, 0);
          const jpegDataUrl = canvas.toDataURL("image/jpeg", 0.9);
          resolve(jpegDataUrl);
        } catch {
          // Conversion failed, return original
          resolve(reader.result as string);
        }
      };
      img.onerror = () => {
        // Browser can't decode HEIC — return original data URL
        resolve(reader.result as string);
      };
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}
