#!/usr/bin/env node
/**
 * Read-only Base Sepolia verification. This script never creates a signer and
 * cannot submit a transaction. It intentionally does not read private-key env vars.
 */
import { Contract, JsonRpcProvider, formatEther } from "ethers";
import artifact from "../src/contracts/abis/BaseSepoliaTokenFactory.json" with { type: "json" };

const RPC_URL = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
const FACTORY = "0x4Ed3f3925D1cd5fEd721Baf49A8a7f557dA62572";
const OWNER = "0x10636e231339e774D0ee150c9CB158836DCcF510";
const DEPLOYMENT_TX = "0x9692e1064036ffdd61939a1370e993a9adb26975a758fdcdfbed390dc2fc703f";

const provider = new JsonRpcProvider(RPC_URL);
const [network, code, balance, receipt] = await Promise.all([
  provider.getNetwork(),
  provider.getCode(FACTORY),
  provider.getBalance(OWNER),
  provider.getTransactionReceipt(DEPLOYMENT_TX),
]);
const factory = new Contract(FACTORY, artifact.abi, provider);
const [deployer, platformFeeRecipient, tokenCount] = await Promise.all([
  factory.owner(),
  factory.platformFeeRecipient(),
  factory.tokenCount(),
]);

console.log(JSON.stringify({
  chainId: network.chainId.toString(),
  factory: FACTORY,
  runtimeByteLength: (code.length - 2) / 2,
  owner: OWNER,
  ownerBalanceWei: balance.toString(),
  ownerBalanceBaseEth: formatEther(balance),
  deployer,
  platformFeeRecipient,
  tokenCount: tokenCount.toString(),
  deployment: {
    tx: DEPLOYMENT_TX,
    status: receipt?.status ?? null,
    block: receipt?.blockNumber ?? null,
    contractAddress: receipt?.contractAddress ?? null,
  },
}, null, 2));
