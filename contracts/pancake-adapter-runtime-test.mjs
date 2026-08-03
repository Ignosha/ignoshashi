#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import solc from "solc";
import { Contract, ContractFactory, JsonRpcProvider, Wallet, getCreateAddress, id } from "ethers";

const dir = new URL(".", import.meta.url);
const anvil = "/home/team/shared/tools/anvil/anvil";
// This harness owns a separate, deterministic RPC. The workflow's shared Anvil
// stays on 8545 for the other harnesses; using a fixed port avoids the
// unused-port TOCTOU race and makes disappearance diagnosable.
const ANVIL_PORT = Number(process.env.PANCAKE_ANVIL_PORT ?? 18545);
let anvilProcess;
let activeProvider;
const anvilOutput = [];
let anvilExited = false;

async function waitForRpc(provider) {
  console.log("[stage] wait for owned Anvil RPC");
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const chainId = await provider.send("eth_chainId", []);
      const block = await provider.getBlockNumber();
      console.log(`[stage] owned Anvil ready chainId=${chainId} block=${block}`);
      return;
    } catch {
      await sleep(100);
    }
  }
  throw new Error(`Anvil did not become ready on port ${ANVIL_PORT}; output=${anvilOutput.join("").slice(-2000)}`);
}

const source = (file) => readFileSync(new URL(file, dir), "utf8");
function compile() {
  console.log("[stage] compile adapter (viaIR) and mocks (separate lightweight jobs)");
  const settings = (viaIR) => ({ viaIR, optimizer: { enabled: true, runs: 50 }, outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } });
  const run = (file, viaIR) => {
    const output = JSON.parse(solc.compile(JSON.stringify({ language: "Solidity", sources: { [file]: { content: source(file) } }, settings: settings(viaIR) })));
    const errors = (output.errors ?? []).filter((error) => error.severity === "error");
    if (errors.length) throw new Error(errors.map((error) => error.formattedMessage).join("\n"));
    return output.contracts[file];
  };
  const adapter = run("PancakeV2GraduationAdapterV1.sol", true);
  const mocks = run("PancakeV2AdapterRuntimeMocks.sol", false);
  const artifact = (contracts, name) => ({ abi: contracts[name].abi, bytecode: `0x${contracts[name].evm.bytecode.object}` });
  return { adapter: artifact(adapter, "PancakeV2GraduationAdapterV1"), token: artifact(mocks, "MockERC20"), factory: artifact(mocks, "MockFactory"), router: artifact(mocks, "MockRouter"), registry: artifact(mocks, "MockRegistry"), pair: artifact(mocks, "MockPair") };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const TX_TIMEOUT_MS = 15_000;
// Every state-changing transaction uses this single allocator and provider.
// Estimation-only reverts rewind the reservation because no transaction was
// submitted; submitted nonces are never reused or skipped.
let transactionNonce;
let lastSubmittedTransactionNonce;
const submittedTransactionNonces = new Set();
async function nextTransactionNonce(provider, address) {
  if (transactionNonce === undefined) {
    const latest = await provider.getTransactionCount(address, "latest");
    const pending = await provider.getTransactionCount(address, "pending");
    transactionNonce = pending > latest ? pending : latest;
    console.log(`[nonce] initialized allocator latest=${latest} pending=${pending} next=${transactionNonce}`);
  }
  const nonce = transactionNonce;
  transactionNonce += 1;
  console.log(`[nonce] reserved nonce=${nonce} next=${transactionNonce}`);
  return nonce;
}
function recordSubmitted(tx, label) {
  assert.equal(tx.nonce, transactionNonce - 1, `${label} nonce must follow allocator`);
  assert.equal(submittedTransactionNonces.has(tx.nonce), false, `duplicate submitted nonce ${tx.nonce} for ${label}`);
  if (lastSubmittedTransactionNonce !== undefined) {
    assert.equal(tx.nonce, lastSubmittedTransactionNonce + 1, `${label} nonce gap after ${lastSubmittedTransactionNonce}`);
  }
  submittedTransactionNonces.add(tx.nonce);
  lastSubmittedTransactionNonce = tx.nonce;
  console.log(`[nonce] submitted label=${label} nonce=${tx.nonce} unique=${submittedTransactionNonces.size} contiguous=true`);
}
function assertMinedReceipt(receipt, label) {
  assert.ok(receipt, `${label} receipt must be available before next nonce`);
  assert.equal(Number(receipt.status), 1, `${label} receipt must succeed`);
  console.log(`[tx] mined label=${label} receipt=${receipt.transactionHash ?? receipt.hash} block=${receipt.blockNumber} txIndex=${receipt.transactionIndex}`);
}
function assertRevertedReceipt(receipt, label) {
  assert.ok(receipt, `${label} receipt must be available before next nonce`);
  assert.equal(Number(receipt.status), 0, `${label} receipt must revert`);
  console.log(`[tx] mined label=${label} receipt=${receipt.transactionHash} block=${receipt.blockNumber} status=${receipt.status}`);
}
async function withTimeout(promise, label) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out after ${TX_TIMEOUT_MS}ms`)), TX_TIMEOUT_MS); })]);
  } finally { clearTimeout(timer); }
}
async function waitForReceipt(provider, hash, label) {
  const deadline = Date.now() + TX_TIMEOUT_MS;
  let nextLivenessCheck = 0;
  while (Date.now() < deadline) {
    const receipt = await provider.send("eth_getTransactionReceipt", [hash]);
    if (receipt) return receipt;
    if (Date.now() >= nextLivenessCheck) {
      nextLivenessCheck = Date.now() + 1000;
      try {
        const [chainId, blockNumber] = await Promise.all([
          provider.send("eth_chainId", []),
          provider.send("eth_blockNumber", []),
        ]);
        console.error(`[diagnostic] ${label} rpc-live chainId=${chainId} block=${blockNumber} anvilExited=${anvilExited}`);
      } catch (error) {
        console.error(`[diagnostic] ${label} rpc-liveness-error=${error.message} anvilExited=${anvilExited}`);
      }
    }
    await sleep(250);
  }
  const [transaction, receipt, blockNumber] = await Promise.all([
    provider.send("eth_getTransactionByHash", [hash]),
    provider.send("eth_getTransactionReceipt", [hash]),
    provider.send("eth_blockNumber", []),
  ]);
  let chainId = "unavailable";
  try { chainId = await provider.send("eth_chainId", []); } catch (error) { chainId = `error:${error.message}`; }
  console.error(`[diagnostic] ${label} hash=${hash} block=${blockNumber} chainId=${chainId} tx=${JSON.stringify(transaction)} receipt=${JSON.stringify(receipt)} anvilExited=${anvilExited} anvil=${anvilOutput.join("").slice(-4000)}`);
  throw new Error(`${label} timed out after ${TX_TIMEOUT_MS}ms`);
}
async function deploy(artifact, signer, ...args) {
  const factory = new ContractFactory(artifact.abi, artifact.bytecode, signer);
  const address = await signer.getAddress();
  // Reserve before estimation so an expected constructor revert cannot reset
  // the nonce boundary for the following transaction.
  const nonce = await nextTransactionNonce(activeProvider, address);
  let gas;
  try {
    gas = await factory.getDeployTransaction(...args).then((tx) => signer.estimateGas({ ...tx, nonce }));
  } catch (error) {
    // Estimation-only constructor reverts do not consume a nonce.
    transactionNonce = nonce;
    throw error;
  }
  const expected = getCreateAddress({ from: address, nonce });
  console.log(`[tx] deploy ${args[0] ?? "contract"} signer=${address} nonce=${nonce} gas=${gas} expected=${expected}`);
  const contract = await withTimeout(factory.deploy(...args, { nonce }), `deploy ${args[0] ?? "contract"}`);
  const tx = contract.deploymentTransaction();
  assert.ok(tx, `deployment ${args[0] ?? "contract"} must expose a transaction`);
  assert.equal(tx.nonce, nonce, `deployment nonce mismatch for ${args[0] ?? "contract"}`);
  recordSubmitted(tx, `deploy ${args[0] ?? "contract"}`);
  console.log(`[tx] deploy ${args[0] ?? "contract"} hash=${tx.hash} nonce=${tx.nonce}`);
  const receipt = await waitForReceipt(activeProvider, tx.hash, `receipt deploy ${args[0] ?? "contract"}`);
  assertMinedReceipt(receipt, `deploy ${args[0] ?? "contract"}`);
  console.log(`[tx] deployed ${args[0] ?? "contract"} address=${await contract.getAddress()} nonce=${nonce} receipt=${receipt.hash}`);
  return contract;
}
async function waitTx(action, label, expectedNonce) {
  const nonce = await nextTransactionNonce(activeProvider, await signerAddressFor(activeProvider));
  if (expectedNonce !== undefined) {
    assert.equal(nonce, expectedNonce, `${label} must use the expected next nonce`);
  }
  let tx;
  try {
    tx = await withTimeout(action(nonce), `${label} submission`);
  } catch (error) {
    // A failed estimate did not submit, so make the nonce available again.
    transactionNonce = nonce;
    throw error;
  }
  assert.equal(tx.nonce, nonce, `${label} nonce mismatch`);
  recordSubmitted(tx, label);
  console.log(`[tx] ${label} hash=${tx.hash} nonce=${tx.nonce} gas=${tx.gasLimit}`);
  const receipt = await waitForReceipt(activeProvider, tx.hash, `${label} receipt`);
  assertMinedReceipt(receipt, label);
}
let sharedSignerAddress;
async function signerAddressFor() {
  assert.ok(sharedSignerAddress, "shared signer address must be initialized");
  return sharedSignerAddress;
}
async function expectConstructorRevert(action, text) {
  try {
    await action();
    assert.fail(`expected ${text}`);
  } catch (error) {
    if (String(error.message).startsWith("expected ")) throw error;
    const details = String(error.shortMessage ?? error.message);
    if (text === "INVALID_CONFIGURATION" && details === "execution reverted (unknown custom error)") return;
    assert.match(details, new RegExp(text));
  }
}
let customErrorSelectors = new Map();
function findRevertData(error) {
  const seen = new Set();
  const found = [];
  const visit = (value) => {
    if (value == null || typeof value === "function") return;
    if (typeof value === "string") {
      const match = value.match(/^0x[0-9a-fA-F]{8,}$/);
      if (match) found.push(match[0].slice(0, 10).toLowerCase());
      return;
    }
    if (typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    // Provider error payloads are nested differently across ethers/RPC clients.
    // Visit revert-specific wrappers before generic data (which can be calldata).
    for (const key of ["error", "info", "cause", "value", "response", "data"]) visit(value[key]);
  };
  visit(error);
  return found;
}
async function expectRevert(action, text) {
  let nonce;
  let submitted = false;
  try {
    nonce = await nextTransactionNonce(activeProvider, sharedSignerAddress);
    const result = await action(nonce);
    // Some revert paths are only detected when the submitted transaction is mined;
    // always drain that receipt so later helpers cannot leave a nonce gap.
    if (result && typeof result.wait === "function") {
      const tx = result;
      assert.equal(tx.nonce, nonce, `expected revert ${text} nonce mismatch`);
      submitted = true;
      recordSubmitted(tx, `expected revert ${text}`);
      console.log(`[tx] expected revert ${text} hash=${tx.hash} nonce=${tx.nonce} gas=${tx.gasLimit}`);
      const receipt = await waitForReceipt(activeProvider, tx.hash, `expected revert ${text} receipt`);
      assertRevertedReceipt(receipt, `expected revert ${text}`);
    }
    assert.fail(`expected ${text}`);
  } catch (error) {
    if (String(error.message).startsWith("expected ")) throw error;
    const details = String(error.shortMessage ?? error.message);
    const expectedSelector = customErrorSelectors.get(text);
    const revertData = findRevertData(error);
    // An estimation-only revert never submits a transaction. Rewind for every
    // such error, not only errors whose text happens to include "execution reverted".
    // This keeps the next ordinary transaction on the reserved nonce.
    if (!submitted) transactionNonce = nonce;
    if (expectedSelector && revertData.includes(expectedSelector)) return;
    assert.match(details, new RegExp(text));
  }
}
async function main() {
  console.log("[stage] start adapter runtime harness");
  const A = compile();
  customErrorSelectors = new Map(A.adapter.abi.filter((item) => item.type === "error").map((item) => [item.name, id(`${item.name}(${item.inputs.map((input) => input.type).join(",")})`).slice(0, 10).toLowerCase()]));
  assert.ok(customErrorSelectors.has("WrongTimelock"), "adapter ABI must expose WrongTimelock");
  console.log(`[stage] loaded ${customErrorSelectors.size} adapter custom-error selectors`);
  console.log(`[stage] start owned RPC on port ${ANVIL_PORT}`);
  // Keep Anvil's stdio detached from the harness. A piped child stream can
  // outlive/close independently on hosted runners and makes the RPC owner
  // disappear without a useful error. We retain the child handle for explicit
  // lifecycle diagnostics and cleanup below.
  anvilProcess = spawn(anvil, ["--host", "127.0.0.1", "--port", String(ANVIL_PORT), "--chain-id", "31337", "--accounts", "2", "--balance", "1000", "--threads", "1", "--silent"], { stdio: "ignore", detached: true });
  anvilProcess.unref();
  anvilProcess.once("error", (error) => console.error(`[stage] Anvil spawn error: ${error.message}`));
  anvilProcess.once("exit", (code, signal) => {
    anvilExited = true;
    console.error(`[stage] owned Anvil exited code=${code} signal=${signal}`);
  });
  anvilProcess.once("close", (code, signal) => {
    console.error(`[stage] owned Anvil closed code=${code} signal=${signal}`);
  });
  await sleep(500);
  const provider = new JsonRpcProvider(`http://127.0.0.1:${ANVIL_PORT}`, 31337, { staticNetwork: true, batchMaxCount: 1 });
  activeProvider = provider;
  await waitForRpc(provider);
  // Use a plain Wallet: provider nonce state is authoritative after constructor
  // estimation reverts, and each deployment reads it afresh.
  const signer = new Wallet("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", provider);
  const timelock = new Wallet("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", provider);
  assert.equal((await provider.getNetwork()).chainId, 31337n);
  const signerAddress = await signer.getAddress();
  sharedSignerAddress = signerAddress;
  assert.ok((await provider.getBalance(signerAddress)) >= 1000n * 10n ** 18n, "fresh Anvil signer must be funded");

  console.log("[stage] deploy mocks and adapter cases");
  const factory = await deploy(A.factory, signer);
  const wbnb = await deploy(A.token, signer, "WBNB");
  const registry = await deploy(A.registry, signer);
  const router = await deploy(A.router, signer, await factory.getAddress(), await wbnb.getAddress());
  const wrongWbnb = await deploy(A.token, signer, "WRONG_WBNB");
  const mismatchedRouter = await deploy(A.router, signer, await factory.getAddress(), await wrongWbnb.getAddress());
    await expectConstructorRevert(
    async () => new ContractFactory(A.adapter.abi, A.adapter.bytecode, signer).getDeployTransaction(await factory.getAddress(), await mismatchedRouter.getAddress(), await wbnb.getAddress(), timelock.address, await registry.getAddress()).then((tx) => signer.estimateGas(tx)),
    "INVALID_CONFIGURATION",
  );
  // The plain wallet has no local nonce reservation to reset after estimation.
  const adapter = await deploy(A.adapter, signer, await factory.getAddress(), await router.getAddress(), await wbnb.getAddress(), timelock.address, await registry.getAddress());
  const token = await deploy(A.token, signer, "TOKEN");
  await waitTx(async (nonce) => registry.set(signerAddress, await token.getAddress(), true, { nonce }), "registry.set");
  const base = [100, 1, 99, 1, 9999999999, 1, timelock.address];

  await expectRevert(async (nonce) => adapter.graduate(await token.getAddress(), base, { value: 1, nonce }), "allowance");
  // The preceding allowance check is estimate-only and must rewind its
  // reservation; the first ordinary transaction after registry.set (nonce 8)
  // therefore must reserve nonce 9 exactly once.
  await waitTx(async (nonce) => token.approve(await adapter.getAddress(), 100, { nonce }), "token.approve adapter", 9);
  await waitTx(async (nonce) => token.mint(signer.address, 1000, { nonce }), "token.mint");
  await expectRevert(async (nonce) => adapter.graduate(await token.getAddress(), [...base.slice(0, 6), signer.address], { value: 1, nonce }), "WrongTimelock");
  await expectRevert(async (nonce) => adapter.graduate(await token.getAddress(), base, { value: 2, nonce }), "NativeAmountMismatch");
  await expectRevert(async (nonce) => adapter.graduate(await token.getAddress(), [100, 1, 101, 1, ...base.slice(4)], { value: 1, nonce }), "InvalidParams");
  await expectRevert(async (nonce) => adapter.graduate(await token.getAddress(), [100, 1, 99, 1, 1, ...base.slice(5)], { value: 1, nonce }), "InvalidParams");

  const wrongPair = await deploy(A.pair, signer, await wbnb.getAddress(), timelock.address);
  await waitTx(async (nonce) => factory.setPair(await wrongPair.getAddress(), { nonce }), "factory.setPair wrong");
  await expectRevert(async (nonce) => adapter.graduate(await token.getAddress(), base, { value: 1, nonce }), "WrongPair");

  const factory2 = await deploy(A.factory, signer);
  const router2 = await deploy(A.router, signer, await factory2.getAddress(), await wbnb.getAddress());
  const adapter2 = await deploy(A.adapter, signer, await factory2.getAddress(), await router2.getAddress(), await wbnb.getAddress(), timelock.address, await registry.getAddress());
  await waitTx(async (nonce) => router2.setLiquidity(0, { nonce }), "router2.setLiquidity");
  await waitTx(async (nonce) => token.approve(await adapter2.getAddress(), 100, { nonce }), "token.approve adapter2");
  await expectRevert(async (nonce) => adapter2.graduate(await token.getAddress(), base, { value: 1, nonce }), "ZeroLiquidity");

  const factory3 = await deploy(A.factory, signer);
  const router3 = await deploy(A.router, signer, await factory3.getAddress(), await wbnb.getAddress());
  const adapter3 = await deploy(A.adapter, signer, await factory3.getAddress(), await router3.getAddress(), await wbnb.getAddress(), timelock.address, await registry.getAddress());
  await waitTx(async (nonce) => token.approve(await adapter3.getAddress(), 100, { nonce }), "token.approve adapter3");
  await waitTx(async (nonce) => adapter3.graduate(await token.getAddress(), base, { value: 1, nonce }), "adapter3.graduate");
  const pairAddress = await factory3.getPair(await token.getAddress(), await wbnb.getAddress());
  const pair = new Contract(pairAddress, A.pair.abi, provider);
  assert.equal(await pair.balanceOf(timelock.address), 1n);
  assert.equal(await token.allowance(await adapter3.getAddress(), await router3.getAddress()), 0n);
  assert.equal(await adapter3.isVerifiedPool(await token.getAddress(), pairAddress), true);
  await expectRevert(async (nonce) => adapter3.graduate(await token.getAddress(), base, { value: 1, nonce }), "Replay");

  const router4 = await deploy(A.router, signer, await factory3.getAddress(), await wbnb.getAddress());
  const adapter4 = await deploy(A.adapter, signer, await factory3.getAddress(), await router4.getAddress(), await wbnb.getAddress(), timelock.address, await registry.getAddress());
  await waitTx(async (nonce) => router4.setActualToken(99, true, { nonce }), "router4.setActualToken");
  await waitTx(async (nonce) => token.approve(await adapter4.getAddress(), 100, { nonce }), "token.approve adapter4");
  await expectRevert(async (nonce) => adapter4.graduate(await token.getAddress(), base, { value: 1, nonce }), "Slippage");

  console.log("[stage] assertions complete");
  console.log("PASS adapter runtime: constructor configuration, authorization, timelock/amount/parameter checks, pair validation, zero liquidity, LP custody, allowance reset, replay, and slippage rollback");
}
main().catch((error) => {
  console.error(`FAIL adapter runtime: ${error.stack ?? error.message}`);
  process.exitCode = 1;
}).finally(() => {
  if (anvilProcess) anvilProcess.kill("SIGTERM");
});
