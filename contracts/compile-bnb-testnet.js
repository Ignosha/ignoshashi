#!/usr/bin/env node
import solc from "solc";
import { readFileSync, mkdirSync, writeFileSync } from "fs";
import { resolve } from "path";
const root = resolve(import.meta.dirname, "..");
const source = readFileSync(resolve(root, "contracts/BnbSmartChainTestnetBondingCurve.sol"), "utf8");
const input = { language: "Solidity", sources: { "BnbSmartChainTestnetBondingCurve.sol": { content: source } }, settings: { viaIR: true, optimizer: { enabled: true, runs: 200 }, outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } } };
const out = JSON.parse(solc.compile(JSON.stringify(input)));
if (out.errors?.some((e) => e.severity === "error")) { console.error(out.errors); process.exit(1); }
mkdirSync(resolve(root, "src/contracts/abis"), { recursive: true });
for (const name of ["BnbSmartChainTestnetBondingCurve", "BnbSmartChainTestnetTokenFactory"]) {
  const c = out.contracts["BnbSmartChainTestnetBondingCurve.sol"][name];
  writeFileSync(resolve(root, `src/contracts/abis/${name}.json`), JSON.stringify({ contractName: name, abi: c.abi, bytecode: "0x" + c.evm.bytecode.object }, null, 2));
}
console.log("Compiled BNB Smart Chain Testnet bonding curve and factory (no deployment)");
