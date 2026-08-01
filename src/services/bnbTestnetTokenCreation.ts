import { ethers } from "ethers";
import { BNB_TESTNET_CHAIN_ID, ensureBnbTestnet, type WalletProvider } from "~/config/networks";
import { getBondingCurveFactoryAddress } from "~/contracts/addresses";

export const BNB_TESTNET_FACTORY_ADDRESS: `0x${string}` | null = null;
export function getBnbTestnetFactoryAddress(): `0x${string}` | null {
  return getBondingCurveFactoryAddress(BNB_TESTNET_CHAIN_ID) ?? BNB_TESTNET_FACTORY_ADDRESS;
}
export async function createBnbTestnetToken(provider: WalletProvider, args: { name: string; symbol: string; supply: bigint; factoryAddress?: string | null }): Promise<never> {
  await ensureBnbTestnet(provider);
  const factory = args.factoryAddress === undefined ? getBnbTestnetFactoryAddress() : args.factoryAddress;
  if (!factory) throw new Error("BNB Testnet token creation is not ready: factory address is not configured.");
  if (!ethers.isAddress(factory)) throw new Error("Configured BNB Testnet factory address is invalid.");
  throw new Error("BNB Testnet token creation is not enabled until the verified factory is configured.");
}
