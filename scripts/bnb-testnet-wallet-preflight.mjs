#!/usr/bin/env node
/** Read-only BNB Testnet deployment/upgrade preflight. Never signs or broadcasts. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import solc from "/home/team/shared/site/node_modules/solc/index.js";
import { Contract, JsonRpcProvider, isAddress, getAddress, formatEther } from "/home/team/shared/site/node_modules/ethers/lib.esm/index.js";
const CHAIN_ID = 97;
const EXPECTED_FACTORY = "0xb7926c0430afb07aa7defde6da862ae0bde767bc";
const EXPECTED_WBNB = "0xae13d989dac2f0debff460ac112a837c89baa7cd";
const ROUTER_ABI = ["function factory() view returns (address)", "function WETH() view returns (address)"];
const ADAPTER_ABI = ["function factory() view returns (address)", "function router() view returns (address)", "function WBNB() view returns (address)", "function lpTimelock() view returns (address)"];
const env = process.env; const fail = (m) => { throw new Error(m); };
const addr = (n) => { const v = env[n]; if (!v || !isAddress(v)) fail(`${n} must be an explicit EVM address`); return getAddress(v); };
for (const n of ["BNB_TESTNET_RPC_URL","BNB_CHAIN_ID","BNB_DEPLOYER_ADDRESS","BNB_PANCAKE_ROUTER_ADDRESS","BNB_ADAPTER_ADDRESS","BNB_FACTORY_ADDRESS","BNB_ADAPTER_TIMELOCK_ADDRESS"]) if (!env[n]) fail(`${n} is required; no defaults are permitted`);
if (env.BNB_CHAIN_ID !== String(CHAIN_ID)) fail("BNB_CHAIN_ID must be explicitly set to 97");
const deployer=addr("BNB_DEPLOYER_ADDRESS"), routerAddress=addr("BNB_PANCAKE_ROUTER_ADDRESS"), adapterAddress=addr("BNB_ADAPTER_ADDRESS"), factoryAddress=addr("BNB_FACTORY_ADDRESS"), timelock=addr("BNB_ADAPTER_TIMELOCK_ADDRESS");
const provider = new JsonRpcProvider(env.BNB_TESTNET_RPC_URL, CHAIN_ID, { staticNetwork: true });
function compile(file, name) { const sourceName=file; const source=readFileSync(resolve(new URL("..", import.meta.url).pathname,"contracts",file),"utf8"); const out=JSON.parse(solc.compile(JSON.stringify({language:"Solidity",sources:{[sourceName]:{content:source}},settings:{optimizer:{enabled:true,runs:200},viaIR:true,outputSelection:{"*":{"*":["abi","evm.bytecode.object"]}}}}))); const errors=out.errors??[]; if(errors.some(e=>e.severity==="error")) fail(`Solidity compilation failed for ${file}: ${errors.filter(e=>e.severity==="error").map(e=>e.formattedMessage).join("\n")}`); const a=out.contracts?.[sourceName]?.[name]; if(!a?.abi||!a.evm?.bytecode?.object) fail(`Missing standard solc artifact for ${name}`); return {abi:a.abi, bytecodeBytes:a.evm.bytecode.object.length/2}; }
const compiled=[{name:"PancakeV2GraduationAdapterV1",...compile("PancakeV2GraduationAdapterV1.sol","PancakeV2GraduationAdapterV1")},{name:"BnbProductionTokenFactoryV1",...compile("BnbProductionBondingCurveV1.sol","BnbProductionTokenFactoryV1")}];
const network=await provider.getNetwork(); if(network.chainId!==BigInt(CHAIN_ID)) fail(`RPC chainId is ${network.chainId}; refusing anything except 97`);
for(const [name,address] of [["router",routerAddress],["adapter",adapterAddress],["factory",factoryAddress]]) if((await provider.getCode(address))==="0x") fail(`${name} has no deployed bytecode at ${address}`);
const router=new Contract(routerAddress,ROUTER_ABI,provider), adapter=new Contract(adapterAddress,ADAPTER_ABI,provider);
const [liveFactory,liveWbnb,adapterFactory,adapterRouter,adapterWbnb,liveTimelock,balance]=await Promise.all([router.factory(),router.WETH(),adapter.factory(),adapter.router(),adapter.WBNB(),adapter.lpTimelock(),provider.getBalance(deployer)]);
if(getAddress(liveFactory)!==EXPECTED_FACTORY) fail(`Router factory mismatch: live ${liveFactory}, expected ${EXPECTED_FACTORY}`);
if(getAddress(liveWbnb)!==EXPECTED_WBNB) fail(`Router WBNB mismatch: live ${liveWbnb}, expected ${EXPECTED_WBNB}`);
if(getAddress(adapterFactory)!==EXPECTED_FACTORY||getAddress(adapterRouter)!==routerAddress||getAddress(adapterWbnb)!==EXPECTED_WBNB) fail("Deployed adapter dependencies do not match live Pancake relationships");
if(getAddress(liveTimelock)!==timelock) fail(`Adapter timelock mismatch: live ${liveTimelock}, expected ${timelock}`);
console.log(JSON.stringify({status:"PLAN_ONLY_NOT_BROADCAST",chainId:CHAIN_ID,deployer,addresses:{router:routerAddress,adapter:adapterAddress,factory:factoryAddress},checks:{routerFactory:liveFactory,routerWbnb:liveWbnb,adapterFactory,adapterRouter,adapterWbnb,adapterTimelock:liveTimelock,deployerBalanceWei:balance.toString(),deployerBalanceTbnb:formatEther(balance),compiled},next:"No transaction data is generated. This check only authorizes a separately reviewed wallet plan."},null,2));
console.error("NO TRANSACTION WAS SIGNED OR SENT.");
