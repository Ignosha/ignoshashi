/**
 * Purchase API client — server-side Stripe verification
 * Replaces the old localStorage-based fake unlock flow.
 */

const TOOL_IDS = [
  "profit-calculator",
  "token-scanner",
  "rug-pull-scanner",
  "portfolio-pro",
  // Tool packs
  "pack-10",
  "pack-25",
  "pack-50",
  "pack-100",
] as const;

export type ToolId = (typeof TOOL_IDS)[number];

/** Human-readable tool name for the toolId */
export function getToolName(toolId: string): string {
  const map: Record<string, string> = {
    "profit-calculator": "Profit Calculator",
    "token-scanner": "Token Scanner",
    "rug-pull-scanner": "Rug Pull Scanner",
    "portfolio-pro": "Portfolio Pro",
    "pack-10": "Starter Pack",
    "pack-25": "Scanner Pack",
    "pack-50": "Security Pack",
    "pack-100": "All-Access Pack",
  };
  return map[toolId] || toolId;
}

/** Price in USD for each tool */
export function getToolPrice(toolId: string): string {
  const map: Record<string, string> = {
    "profit-calculator": "$5",
    "token-scanner": "$25",
    "rug-pull-scanner": "$25",
    "portfolio-pro": "$25",
    "pack-10": "$10",
    "pack-25": "$25",
    "pack-50": "$50",
    "pack-100": "$100",
  };
  return map[toolId] || "$?";
}

/** Which tool IDs each pack unlocks */
export const PACK_TOOLS: Record<string, string[]> = {
  "pack-10": ["profit-calculator"],
  "pack-25": ["token-scanner"],
  "pack-50": ["token-scanner", "rug-pull-scanner"],
  "pack-100": ["profit-calculator", "token-scanner", "rug-pull-scanner", "portfolio-pro"],
};

/** Legacy localStorage keys — used for migration only */
export const LEGACY_KEYS: Record<string, string> = {
  "profit-calculator": "ignoshashi_tool_profit",
  "token-scanner": "ignoshashi_tool_scanner",
  "rug-pull-scanner": "ignoshashi_tool_rugpull",
  "portfolio-pro": "ignoshashi_tool_portfolio",
};

/**
 * Check which tools are purchased on the server for a wallet.
 * Returns a Set of tool IDs that have completed purchases.
 */
export async function checkPurchases(wallet: string): Promise<Set<string>> {
  try {
    const res = await fetch(
      `/api/purchases?wallet=${encodeURIComponent(wallet)}`
    );
    if (!res.ok) return new Set();
    const purchases = (await res.json()) as {
      tool_id: string;
      status: string;
      amount_cents: number;
      created_at: string;
    }[];
    return new Set(
      purchases
        .filter((p) => p.status === "completed")
        .map((p) => p.tool_id)
    );
  } catch {
    return new Set();
  }
}

/**
 * Create a Stripe Checkout Session for the given tool and wallet.
 * Returns the Stripe Checkout URL to redirect the user to.
 */
export async function createCheckoutSession(
  toolId: string,
  wallet: string
): Promise<string> {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const res = await fetch("/api/stripe/create-checkout-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tool_id: toolId,
      wallet,
      success_url: `${origin}/buy?purchased=${toolId}`,
      cancel_url: `${origin}/buy`,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err.error || "Failed to create checkout session");
  }

  const data = (await res.json()) as { url: string; sessionId: string };
  return data.url;
}

/**
 * Check if there are legacy localStorage purchases for a wallet.
 * Returns tool IDs that were "purchased" via the old fake flow.
 */
export function getLegacyPurchases(): Set<string> {
  const legacy = new Set<string>();
  for (const [toolId, key] of Object.entries(LEGACY_KEYS)) {
    try {
      if (localStorage.getItem(key) === "true") {
        legacy.add(toolId);
      }
    } catch {
      // localStorage may be unavailable
    }
  }
  return legacy;
}

/**
 * Clear legacy localStorage purchase entries (after migration or discard).
 */
export function clearLegacyPurchases(): void {
  for (const key of Object.values(LEGACY_KEYS)) {
    try {
      localStorage.removeItem(key);
    } catch {
      // localStorage may be unavailable
    }
  }
}
