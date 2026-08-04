#!/usr/bin/env node
import solc from "solc";
import { readFileSync } from "fs";
const sources = {
  "PancakeV2GraduationAdapterV1.sol": { content: readFileSync(new URL("./PancakeV2GraduationAdapterV1.sol", import.meta.url), "utf8") },
  "BnbProductionBondingCurveV1.sol": { content: readFileSync(new URL("./BnbProductionBondingCurveV1.sol", import.meta.url), "utf8") }
};
const input = { language: "Solidity", sources, settings: { viaIR: true, optimizer: { enabled: true, runs: 200 }, outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } } };
const out = JSON.parse(solc.compile(JSON.stringify(input)));
for (const e of out.errors ?? []) console[e.severity === "error" ? "error" : "warn"](e.formattedMessage);
if (out.errors?.some(e => e.severity === "error")) process.exit(1);
console.log("Compiled Pancake adapter + BNB production V1:", Object.keys(out.contracts["PancakeV2GraduationAdapterV1.sol"]));
