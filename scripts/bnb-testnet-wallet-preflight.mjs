#!/usr/bin/env node
/** Read-only BNB Testnet deployment preflight. Never signs or broadcasts. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import solc from "/home/team/shared/site/node_modules/solc/index.js";
import { Contract, ContractFactory, JsonRpcProvider, isAddress, getAddress, formatEther } from "/home/team/shared/site/node_modules/ethers/lib.esm/index.js";

const CHAIN_ID = 97;
const EXPECTED_ROUTER_FACTORY = "0xb7926c0430afb07aa7defde6da862ae0bde767bc";
const EXPECTED_WBNB = "0xae13d989dac2f0debff460ac112a837c89baa7cd";
const ROUTER_ABI = ["function factory() view returns (address)", "function WETH() view returns (address)"];
const required = ["BNB_TESTNET_RPC_URL", "BNB_CHAIN_ID", "BNB_DEPLOYER_ADDRESS", "BNB_PANCAKE_ROUTER_ADDRESS", "BNB_ADAPTER_TIMELOCK_ADDRESS", "BNB_GRADUATION_REGISTRY_ADDRESS", "BNB_PLATFORM_FEE_RECIPIENT", "BNB_FEE_BPS", "BNB_PLATFORM_SHARE_BPS", "BNB_MIN_LP_TIMELOCK_SECONDS", "BNB_ADAPTER_ADDRESS_FOR_ESTIMATE"];
const env = process.env;
const fail = (message) => { throw new Error(message); };
const address = (name) => { const value = env[name]; if (!value || !isAddress(value)) fail(`${name} must be an explicit EVM address`); return getAddress(value); };
for (const name of required) if (!env[name]) fail(`${name} is required; this script has no defaults`);
if (env.BNB_CHAIN_ID !== String(CHAIN_ID)) fail("BNB_CHAIN_ID must be explicitly set to 97");
const deployer = address("BNB_DEPLOYER_ADDRESS");
const routerAddress = address("BNB_PANCAKE_ROUTER_ADDRESS");
const timelock = address("BNB_ADAPTER_TIMELOCK_ADDRESS");
const registry = address("BNB_GRADUATION_REGISTRY_ADDRESS");
const platform = address("BNB_PLATFORM_FEE_RECIPIENT");
const adapterForEstimate = address("BNB_ADAPTER_ADDRESS_FOR_ESTIMATE");
const provider = new JsonRpcProvider(env.BNB_TESTNET_RPC_URL, CHAIN_ID, { staticNetwork: true });

function compile(file, contractName) {
  const sourceName = file.split("/").pop();
  const source = readFileSync(resolve(new URL("..", import.meta.url).pathname, "contracts", file), "utf8");
  const input = { language: "Solidity", sources: { [sourceName]: { content: source } }, settings: { viaIR: true, optimizer: { enabled: true, runs: 200 }, outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } } };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = output.errors ?? [];
  for (const e of errors.filter((e) => e.severity === "error")) console.error(e.formattedMessage);
  if (errors.some((e) => e.severity === "error")) fail(`Solidity compilation failed for ${file}`);
  const artifact = output.contracts[sourceName]?.[contractName];
  if (!artifact?.evm?.bytecode?.object) fail(`Missing bytecode for ${contractName}`);
  return artifact;
}

const adapterArtifact = compile("PancakeV2GraduationAdapterV1.sol", "PancakeV2GraduationAdapterV1");
const factoryArtifact = compile("BnbProductionBondingCurveV1.sol", "BnbProductionTokenFactoryV1");
const network = await provider.getNetwork();
if (network.chainId !== BigInt(CHAIN_ID)) fail(`RPC chainId is ${network.chainId}; refusing anything except 97`);
const liveRouter = new Contract(routerAddress, ROUTER_ABI, provider);
const [liveFactory, liveWbnb, balance, feeData] = await Promise.all([liveRouter.factory(), liveRouter.WETH(), provider.getBalance(deployer), provider.getFeeData()]);
if (getAddress(liveFactory) !== getAddress(EXPECTED_ROUTER_FACTORY)) fail(`Router factory mismatch: live ${liveFactory}, expected ${EXPECTED_ROUTER_FACTORY}`);
if (getAddress(liveWbnb) !== getAddress(EXPECTED_WBNB)) fail(`Router WBNB mismatch: live ${liveWbnb}, expected ${EXPECTED_WBNB}`);

const adapterArgs = [EXPECTED_ROUTER_FACTORY, routerAddress, EXPECTED_WBNB, timelock, registry];
const adapterFactory = new ContractFactory(adapterArtifact.abi, adapterArtifact.evm.bytecode.object);
const adapterTx = adapterFactory.getDeployTransaction(...adapterArgs);
const adapterGas = await provider.estimateGas({ from: deployer, data: adapterTx.data });
const feeBps = env.BNB_FEE_BPS ?? fail("BNB_FEE_BPS is required");
const platformShareBps = env.BNB_PLATFORM_SHARE_BPS ?? fail("BNB_PLATFORM_SHARE_BPS is required");
const lpTimelock = env.BNB_MIN_LP_TIMELOCK_SECONDS ?? fail("BNB_MIN_LP_TIMELOCK_SECONDS is required");
const factoryFactory = new ContractFactory(factoryArtifact.abi, factoryArtifact.evm.bytecode.object);
const factoryTx = factoryFactory.getDeployTransaction(platform, feeBps, platformShareBps, adapterForEstimate, lpTimelock);
const factoryGas = await provider.estimateGas({ from: deployer, data: factoryTx.data });
const gasPrice = feeData.maxFeePerGas ?? feeData.gasPrice;
const gasCost = gasPrice ? (adapterGas + factoryGas) * gasPrice : null;
const manifest = { schema: "ignoshashi.bnb-testnet-deployment.v1", status: "PREPARED_NOT_BROADCAST", chainId: CHAIN_ID, rpcUrl: env.BNB_TESTNET_RPC_URL, deployer, router: routerAddress, expectedRouterFactory: EXPECTED_ROUTER_FACTORY, expectedWbnb: EXPECTED_WBNB, adapterConstructorArgs: adapterArgs, factoryConstructorArgs: [platform, feeBps, platformShareBps, adapterForEstimate, lpTimelock], estimates: { adapterGas: adapterGas.toString(), factoryGas: factoryGas.toString(), gasPriceWei: gasPrice?.toString() ?? null, totalWei: gasCost?.toString() ?? null, totalTbnb: gasCost ? formatEther(gasCost) : null }, results: { adapterAddress: null, factoryAddress: null, adapterTxHash: null, factoryTxHash: null } };
console.log(JSON.stringify({ checks: { chainId: CHAIN_ID, routerFactory: liveFactory, wbnb: liveWbnb, deployerBalanceWei: balance.toString(), deployerBalanceTbnb: formatEther(balance), compiled: ["PancakeV2GraduationAdapterV1", "BnbProductionTokenFactoryV1"] }, unsignedTransactions: { adapter: { to: null, data: adapterTx.data, value: "0x0", from: deployer, chainId: CHAIN_ID, gasLimit: adapterGas.toString() }, factory: { to: null, data: factoryTx.data, value: "0x0", from: deployer, chainId: CHAIN_ID, gasLimit: factoryGas.toString(), note: "Replace ${ADAPTER_ADDRESS_AFTER_SIGNING} with the adapter address before signing." } }, manifest }, null, 2));
console.error("NO TRANSACTION WAS SIGNED OR SENT. Sign each unsigned transaction in a browser wallet on BNB Testnet (chainId 97), wait for confirmation, then fill the manifest with public addresses and tx hashes.");
