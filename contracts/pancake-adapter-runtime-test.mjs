#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import solc from "solc";
import { Contract, ContractFactory, JsonRpcProvider, Wallet, getCreateAddress } from "ethers";

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
  submittedTransactionNonces.add(tx.nonce);
  console.log(`[nonce] submitted label=${label} nonce=${tx.nonce} unique=${submittedTransactionNonces.size}`);
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
  assert.ok(receipt, `deployment ${args[0] ?? "contract"} receipt must be available`);
  assert.equal(Number(receipt.status), 1, `deployment ${args[0] ?? "contract"} receipt must succeed`);
  console.log(`[tx] deployed ${args[0] ?? "contract"} address=${await contract.getAddress()} nonce=${nonce} receipt=${receipt.hash}`);
  return contract;
}
async function waitTx(action, label) {
  const nonce = await nextTransactionNonce(activeProvider, await signerAddressFor(activeProvider));
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
  await waitForReceipt(activeProvider, tx.hash, `${label} receipt`);
}
let sharedSignerAddress;
async function signerAddressFor() {
  assert.ok(sharedSignerAddress, "shared signer address must be initialized");
  return sharedSignerAddress;
}
async function expectRevert(action, text) {
  let nonce;
  try {
    nonce = await nextTransactionNonce(activeProvider, sharedSignerAddress);
    const result = await action(nonce);
    // Some revert paths are only detected when the submitted transaction is mined;
    // always drain that receipt so later helpers cannot leave a nonce gap.
    if (result && typeof result.wait === "function") {
      const tx = result;
      assert.equal(tx.nonce, nonce, `expected revert ${text} nonce mismatch`);
      recordSubmitted(tx, `expected revert ${text}`);
      console.log(`[tx] expected revert ${text} hash=${tx.hash} nonce=${tx.nonce} gas=${tx.gasLimit}`);
      await waitForReceipt(activeProvider, tx.hash, `expected revert ${text} receipt`);
    }
    assert.fail(`expected ${text}`);
  } catch (error) {
    if (String(error.message).startsWith("expected ")) throw error;
    const details = String(error.shortMessage ?? error.message);
    // Constructor custom errors may be surfaced by eth_estimateGas without a decoded name.
    if (text === "INVALID_CONFIGURATION" && details === "execution reverted (unknown custom error)") {
      transactionNonce = nonce;
      return;
    }
    if (details.includes("execution reverted") && !details.match(new RegExp(text))) {
      transactionNonce = nonce;
    }
    assert.match(details, new RegExp(text));
  }
}
async function main() {
  console.log("[stage] start adapter runtime harness");
  const A = compile();
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
    await expectRevert(
    async (nonce) => { transactionNonce = nonce; return deploy(A.adapter, signer, await factory.getAddress(), await mismatchedRouter.getAddress(), await wbnb.getAddress(), timelock.address, await registry.getAddress()); },
    "INVALID_CONFIGURATION",
  );
  // The plain wallet has no local nonce reservation to reset after estimation.
  const adapter = await deploy(A.adapter, signer, await factory.getAddress(), await router.getAddress(), await wbnb.getAddress(), timelock.address, await registry.getAddress());
  const token = await deploy(A.token, signer, "TOKEN");
  await waitTx(async (nonce) => registry.set(signerAddress, await token.getAddress(), true, { nonce }), "registry.set");
  const base = [100, 1, 99, 1, 9999999999, 1, timelock.address];

  await expectRevert(async (nonce) => adapter.graduate(await token.getAddress(), base, { value: 1, nonce }), "allowance");
  await waitTx(async (nonce) => token.approve(await adapter.getAddress(), 100, { nonce }), "token.approve adapter");
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
