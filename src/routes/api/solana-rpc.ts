import { createServerFn } from "@tanstack/react-start";

/**
 * Solana RPC Proxy — server function
 *
 * When called from client code via TanStack's RPC mechanism, this proxies
 * the JSON-RPC request to the Solana mainnet RPC.
 *
 * For direct HTTP POST requests to /api/solana-rpc, the Bun server's
 * handleApiRequest (in server-db.ts) handles the request before it
 * reaches TanStack Start, providing a direct proxy path without
 * the RPC serialization overhead.
 */

const SOLANA_PUBLIC_RPC = "https://api.mainnet-beta.solana.com";

export const solanaRpc = createServerFn().handler(async (payload: unknown) => {
  const body = payload as {
    jsonrpc?: string;
    id?: number | string;
    method?: string;
    params?: unknown[];
  };

  if (!body || typeof body !== "object" || body.jsonrpc !== "2.0" || !body.method) {
    return {
      jsonrpc: "2.0",
      id: body?.id ?? null,
      error: { code: -32600, message: "Invalid Request" },
    };
  }

  try {
    const res = await fetch(SOLANA_PUBLIC_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      return {
        jsonrpc: "2.0",
        id: body.id ?? null,
        error: { code: -32000, message: `Upstream RPC returned status ${res.status}` },
      };
    }

    return await res.json();
  } catch (err: any) {
    return {
      jsonrpc: "2.0",
      id: body.id ?? null,
      error: { code: -32000, message: err?.message || "Internal proxy error" },
    };
  }
});
