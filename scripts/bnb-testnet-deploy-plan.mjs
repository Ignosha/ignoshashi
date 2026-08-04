#!/usr/bin/env node
/** Plan-only chain-97 deployment. Produces unsigned wallet actions; never signs or broadcasts. */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import solc from '/home/team/shared/site/node_modules/solc/index.js';
import { ContractFactory, JsonRpcProvider, getAddress, isAddress } from '/home/team/shared/site/node_modules/ethers/lib.esm/index.js';
const env = process.env, CHAIN_ID = 97;
// Keep ethers' typed constructor values for encoding, but expose JSON-safe strings in the plan.
const jsonSafe = (value) => typeof value === 'bigint' ? value.toString() : value;
const fail = (m) => { throw new Error(m); };
const required = ['BNB_TESTNET_RPC_URL','BNB_CHAIN_ID','BNB_DEPLOYER_ADDRESS','BNB_LP_BENEFICIARY','BNB_LP_UNLOCK_TIMESTAMP','BNB_PLATFORM_FEE_RECIPIENT','BNB_TOTAL_FEE_BPS','BNB_PLATFORM_FEE_BPS'];
for (const n of required) if (!env[n]) fail(`${n} is required; no defaults or placeholders are permitted`);
if (env.BNB_CHAIN_ID !== '97' || /mainnet|chain[-_ ]?56|bscscan\.com(?!.*testnet)/i.test(env.BNB_TESTNET_RPC_URL)) fail('refusing non-Testnet/Mainnet-looking configuration; chain 97 is required');
const address = (name) => { if (!isAddress(env[name])) fail(`${name} must be an explicit address`); return getAddress(env[name]); };
const deployer=address('BNB_DEPLOYER_ADDRESS'), beneficiary=address('BNB_LP_BENEFICIARY'), platform=address('BNB_PLATFORM_FEE_RECIPIENT');
const unlock=BigInt(env.BNB_LP_UNLOCK_TIMESTAMP); if (unlock <= BigInt(Math.floor(Date.now()/1000))) fail('BNB_LP_UNLOCK_TIMESTAMP must be in the future');
const fee=BigInt(env.BNB_TOTAL_FEE_BPS), platformFee=BigInt(env.BNB_PLATFORM_FEE_BPS); if(fee>1000n||platformFee>fee) fail('fee basis points are invalid');
const root=resolve(new URL('..', import.meta.url).pathname,'contracts');
function compile(file,name){const source=readFileSync(resolve(root,file),'utf8');const out=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources:{[file]:{content:source}},settings:{optimizer:{enabled:true,runs:200},viaIR:true,outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}})));if((out.errors||[]).some(e=>e.severity==='error')) fail(`compile failed for ${file}`);const a=out.contracts?.[file]?.[name];if(!a?.abi||!a.evm.bytecode.object)fail(`missing bytecode for ${name}`);return a;}
const artifacts={timelock:compile('BnbLpTimelockV1.sol','BnbLpTimelockV1'),registry:compile('BnbGraduationRegistryV1.sol','BnbGraduationRegistryV1'),adapter:compile('PancakeV2GraduationAdapterV1.sol','PancakeV2GraduationAdapterV1'),factory:compile('BnbProductionBondingCurveV1.sol','BnbProductionTokenFactoryV1')};
for (const n of ['BNB_PANCAKE_FACTORY','BNB_PANCAKE_ROUTER','BNB_WBNB']) address(n);
const router=address('BNB_PANCAKE_ROUTER'), pancakeFactory=address('BNB_PANCAKE_FACTORY'), wbnb=address('BNB_WBNB');
const provider=new JsonRpcProvider(env.BNB_TESTNET_RPC_URL,CHAIN_ID,{staticNetwork:true});
if((await provider.getNetwork()).chainId!==97n) fail('RPC chainId is not 97');
const dependency = (name) => { const key = `BNB_DEPLOYED_${name}`; if (!env[key]) fail(`${key} is required after the prior wallet deployment; rerun plan-only (no broadcast)`); return address(key); };
const args=[
 {name:'lpTimelock',artifact:artifacts.timelock,args:[beneficiary,unlock]},
 {name:'graduationRegistry',artifact:artifacts.registry,args:[deployer]}
];
if (env.BNB_DEPLOYED_LP_TIMELOCK && env.BNB_DEPLOYED_GRADUATION_REGISTRY) args.push({name:'pancakeV2Adapter',artifact:artifacts.adapter,args:[pancakeFactory,router,wbnb,dependency('LP_TIMELOCK'),dependency('GRADUATION_REGISTRY')]});
if (env.BNB_DEPLOYED_PANCAKE_V2_ADAPTER && env.BNB_DEPLOYED_LP_TIMELOCK) args.push({name:'productionTokenFactory',artifact:artifacts.factory,args:[platform,fee,platformFee,dependency('PANCAKE_V2_ADAPTER'),dependency('LP_TIMELOCK')]});
const actions=[]; for(const item of args){const factory=new ContractFactory(item.artifact.abi,item.artifact.evm.bytecode.object);const tx=await factory.getDeployTransaction(...item.args);let estimatedGas;try{estimatedGas=(await provider.estimateGas({from:deployer,data:tx.data})).toString();}catch(error){fail(`gas estimation failed for ${item.name}: ${error.shortMessage||error.message}`);}actions.push({step:actions.length+1,name:item.name,to:null,value:'0',data:tx.data,estimatedGas,constructorArgs:item.args.map(jsonSafe)});}
const manifest={schemaVersion:1,status:'PLAN_ONLY_NOT_BROADCAST',chainId:97,deployer,order:['lpTimelock','graduationRegistry','pancakeV2Adapter','productionTokenFactory'],network:{router,pancakeFactory,wbnb},actions,manualSigning:['Switch the browser wallet to BNB Smart Chain Testnet (chain ID 97).','For each step, copy the unsigned data into the wallet or reviewed deployment tool.','Set `to` to null (contract creation), use value 0, review constructor arguments, then approve each transaction manually.','Wait for a confirmed receipt and record the resulting contract address before substituting the next `${dependency}`.','Never use this manifest on BNB Mainnet (chain ID 56); no private key is required or accepted.'],publicManifestSchema:{schemaVersion:'number',status:'PLAN_ONLY_NOT_BROADCAST',chainId:'97',deployer:'address',order:'string[]',network:'addresses',actions:'[{step,name,to,value,data,estimatedGas,constructorArgs}]'}};
const output=env.BNB_DEPLOYMENT_MANIFEST||'bnb-testnet-deployment-manifest.json';writeFileSync(output,JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify({status:manifest.status,chainId:97,order:manifest.order,manifest:output,actions:actions.map(({name,estimatedGas})=>({name,estimatedGas}))},null,2));console.error('NO TRANSACTION WAS SIGNED OR SENT.');
