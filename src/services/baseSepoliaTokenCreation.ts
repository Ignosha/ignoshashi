import { ethers } from "ethers";
import factoryArtifact from "~/contracts/abis/BaseSepoliaTokenFactory.json";
import { getBondingCurveFactoryAddress } from "~/contracts/addresses";

export const BASE_SEPOLIA_CHAIN_ID = 84532;
export const BASE_SEPOLIA_CHAIN_LABEL = "Base Sepolia";
const FACTORY_ABI = (factoryArtifact as { abi: ethers.InterfaceAbi }).abi;
export type Eip1193Provider = { request(args: { method: string; params?: unknown[] }): Promise<unknown> };
export type CreateTokenResult = { success: true; tokenAddress: string; txHash: string };
export function encodeBaseSepoliaCreateToken(name: string, symbol: string, supply: bigint, base = 1n, slope = 0n) {
  return new ethers.Interface(FACTORY_ABI).encodeFunctionData("createToken", [name, symbol, supply, base, slope]);
}
export function parseCreatedTokenAddress(receipt: { logs?: readonly unknown[] }): string | null {
  const iface = new ethers.Interface(FACTORY_ABI);
  for (const log of receipt.logs ?? []) {
    try { const parsed = iface.parseLog(log as ethers.LogDescription); if (parsed?.name === "TokenCreated") return parsed.args.token as string; } catch { /* unrelated log */ }
  }
  return null;
}
export async function createBaseSepoliaToken(provider: Eip1193Provider, args: { name: string; symbol: string; supply: bigint; factoryAddress?: string | null }): Promise<CreateTokenResult> {
  const chain = await provider.request({ method: "eth_chainId" });
  if (Number(BigInt(String(chain))) !== BASE_SEPOLIA_CHAIN_ID) throw new Error("Wallet must be connected to Base Sepolia.");
  const factory = args.factoryAddress === undefined ? getBondingCurveFactoryAddress(BASE_SEPOLIA_CHAIN_ID) : args.factoryAddress;
  if (!factory) throw new Error("Base Sepolia token creation is not ready: factory address is not configured.");
  if (!ethers.isAddress(factory)) throw new Error("Configured Base Sepolia factory address is invalid.");
  const accounts = await provider.request({ method: "eth_accounts" }) as string[];
  if (!accounts?.[0]) throw new Error("No wallet account connected.");
  const data = encodeBaseSepoliaCreateToken(args.name, args.symbol, args.supply);
  const txHash = String(await provider.request({ method: "eth_sendTransaction", params: [{ from: accounts[0], to: factory, data }] }));
  let receipt: any;
  do { receipt = await provider.request({ method: "eth_getTransactionReceipt", params: [txHash] }); if (!receipt) await new Promise(r => setTimeout(r, 500)); } while (!receipt);
  if (receipt.status !== "0x1" && receipt.status !== 1 && receipt.status !== true) throw new Error("Base Sepolia token creation transaction reverted.");
  const tokenAddress = parseCreatedTokenAddress({ logs: receipt.logs });
  if (!tokenAddress) throw new Error("Creation receipt did not contain a TokenCreated event.");
  return { success: true, tokenAddress, txHash };
}
