#!/usr/bin/env node
/**
 * Read-only BNB Testnet Pancake V2 configuration diagnostic.
 * This script never signs, deploys, or sends a transaction.
 */
const CHAIN_ID = 97n;
const ADDRESS_KEYS = [
  "PANCAKE_V2_TESTNET_FACTORY", "PANCAKE_V2_TESTNET_ROUTER", "PANCAKE_V2_TESTNET_WBNB",
  "BNB_GRADUATION_ADAPTER", "BNB_LP_TIMELOCK", "BNB_GRADUATION_REGISTRY"
];
const address = (key) => {
  const value = process.env[key]?.trim();
  if (!value || !/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error(`${key} must be a 20-byte hex address`);
  return value;
};
const rpcUrl = process.env.BNB_TESTNET_RPC_URL?.trim();
if (!rpcUrl) throw new Error("BNB_TESTNET_RPC_URL is required (read-only RPC endpoint)");
if (/mainnet|chainid\s*[=:]?\s*56/i.test(rpcUrl)) throw new Error("mainnet RPC is forbidden; use BNB Testnet only");
const config = Object.fromEntries(ADDRESS_KEYS.map((key) => [key, address(key)]));
const token = process.env.BNB_REHEARSAL_TOKEN?.trim();
if (token && !/^0x[0-9a-fA-F]{40}$/.test(token)) throw new Error("BNB_REHEARSAL_TOKEN must be a 20-byte hex address");
let id = 0;
async function rpc(method, params) {
  const response = await fetch(rpcUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }) });
  if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
  const body = await response.json();
  if (body.error) throw new Error(`RPC ${body.error.message ?? "error"}`);
  return body.result;
}
const call = (to, data) => rpc("eth_call", [{ to, data }, "latest"]);
try {
  const chain = BigInt(await rpc("eth_chainId", []));
  if (chain !== CHAIN_ID) throw new Error(`RPC chainId is ${chain}; expected 97 (BNB Testnet)`);
  for (const key of ADDRESS_KEYS) {
    const code = await rpc("eth_getCode", [config[key], "latest"]);
    if (!code || code === "0x") throw new Error(`${key} has no runtime bytecode on chain 97`);
  }
  const factoryFromRouter = `0x${(await call(config.PANCAKE_V2_TESTNET_ROUTER, "0xc45a0155")).slice(-40)}`;
  const wbnbFromRouter = `0x${(await call(config.PANCAKE_V2_TESTNET_ROUTER, "0xad5c4648")).slice(-40)}`;
  if (factoryFromRouter.toLowerCase() !== config.PANCAKE_V2_TESTNET_FACTORY.toLowerCase()) throw new Error("router.factory() does not match configured factory");
  if (wbnbFromRouter.toLowerCase() !== config.PANCAKE_V2_TESTNET_WBNB.toLowerCase()) throw new Error("router.WETH() does not match configured WBNB");
  if (token) {
    const tokenCode = await rpc("eth_getCode", [token, "latest"]);
    if (!tokenCode || tokenCode === "0x") throw new Error("BNB_REHEARSAL_TOKEN has no runtime bytecode on chain 97");
  }
  console.log(JSON.stringify({ mode: "read-only-diagnostic", chainId: 97, token: token ?? null, addresses: config, readyForWalletSignedRehearsal: true, warning: "No deployment, signing, liquidity addition, or Mainnet operation was performed." }, null, 2));
} catch (error) {
  console.error(`FAIL CLOSED: ${error.message}`);
  process.exitCode = 1;
}
