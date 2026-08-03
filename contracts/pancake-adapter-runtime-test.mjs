#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { readFileSync } from "node:fs";
import solc from "solc";
import { Contract, ContractFactory, JsonRpcProvider, NonceManager, Wallet } from "ethers";

const dir = new URL(".", import.meta.url);
const anvil = "/home/team/shared/tools/anvil/anvil";
let anvilProcess;

async function unusedPort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForRpc(provider) {
  console.log("[stage] wait for owned Anvil RPC");
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await provider.getBlockNumber();
      return;
    } catch {
      await sleep(100);
    }
  }
  throw new Error("Anvil did not become ready");
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
async function deploy(artifact, signer, ...args) {
  const contract = await new ContractFactory(artifact.abi, artifact.bytecode, signer).deploy(...args);
  await contract.waitForDeployment();
  return contract;
}
async function expectRevert(action, text) {
  try {
    await action();
    assert.fail(`expected ${text}`);
  } catch (error) {
    if (String(error.message).startsWith("expected ")) throw error;
    const details = String(error.shortMessage ?? error.message);
    // Constructor custom errors may be surfaced by eth_estimateGas without a decoded name.
    if (text === "INVALID_CONFIGURATION" && details === "execution reverted (unknown custom error)") return;
    assert.match(details, new RegExp(text));
  }
}
async function main() {
  console.log("[stage] start adapter runtime harness");
  const A = compile();
  console.log("[stage] select isolated ephemeral RPC port");
  const port = await unusedPort();
  anvilProcess = spawn(anvil, ["--host", "127.0.0.1", "--port", String(port), "--chain-id", "31337", "--accounts", "2", "--balance", "1000", "--threads", "1", "--silent"], { stdio: "ignore" });
  anvilProcess.once("error", (error) => console.error(`[stage] Anvil spawn error: ${error.message}`));
  anvilProcess.once("exit", (code, signal) => { if (code !== 0 && signal !== "SIGTERM") console.error(`[stage] owned Anvil exited code=${code} signal=${signal}`); });
  await sleep(500);
  const provider = new JsonRpcProvider(`http://127.0.0.1:${port}`, 31337, { staticNetwork: true, batchMaxCount: 1 });
  await waitForRpc(provider);
  const signerWallet = new Wallet("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", provider);
  const signer = new NonceManager(signerWallet);
  const timelock = new Wallet("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", provider);
  assert.equal((await provider.getNetwork()).chainId, 31337n);
  const signerAddress = await signerWallet.getAddress();
  assert.ok((await provider.getBalance(signerAddress)) >= 1000n * 10n ** 18n, "fresh Anvil signer must be funded");

  console.log("[stage] deploy mocks and adapter cases");
  const factory = await deploy(A.factory, signer);
  const wbnb = await deploy(A.token, signer, "WBNB");
  const registry = await deploy(A.registry, signer);
  const router = await deploy(A.router, signer, await factory.getAddress(), await wbnb.getAddress());
  const wrongWbnb = await deploy(A.token, signer, "WRONG_WBNB");
  const mismatchedRouter = await deploy(A.router, signer, await factory.getAddress(), await wrongWbnb.getAddress());
  await expectRevert(
    async () => deploy(A.adapter, signer, await factory.getAddress(), await mismatchedRouter.getAddress(), await wbnb.getAddress(), timelock.address, await registry.getAddress()),
    "INVALID_CONFIGURATION",
  );
  const adapter = await deploy(A.adapter, signer, await factory.getAddress(), await router.getAddress(), await wbnb.getAddress(), timelock.address, await registry.getAddress());
  const token = await deploy(A.token, signer, "TOKEN");
  await (await registry.set(signerAddress, await token.getAddress(), true)).wait();
  const base = [100, 1, 99, 1, 9999999999, 1, timelock.address];

  await expectRevert(async () => adapter.graduate(await token.getAddress(), base, { value: 1 }), "allowance");
  await (await token.approve(await adapter.getAddress(), 100)).wait();
  await (await token.mint(signer.address, 1000)).wait();
  await expectRevert(async () => adapter.graduate(await token.getAddress(), [...base.slice(0, 6), signer.address], { value: 1 }), "WrongTimelock");
  await expectRevert(async () => adapter.graduate(await token.getAddress(), base, { value: 2 }), "NativeAmountMismatch");
  await expectRevert(async () => adapter.graduate(await token.getAddress(), [100, 1, 101, 1, ...base.slice(4)], { value: 1 }), "InvalidParams");
  await expectRevert(async () => adapter.graduate(await token.getAddress(), [100, 1, 99, 1, 1, ...base.slice(5)], { value: 1 }), "InvalidParams");

  const wrongPair = await deploy(A.pair, signer, await wbnb.getAddress(), timelock.address);
  await (await factory.setPair(await wrongPair.getAddress())).wait();
  await expectRevert(async () => adapter.graduate(await token.getAddress(), base, { value: 1 }), "WrongPair");

  const factory2 = await deploy(A.factory, signer);
  const router2 = await deploy(A.router, signer, await factory2.getAddress(), await wbnb.getAddress());
  const adapter2 = await deploy(A.adapter, signer, await factory2.getAddress(), await router2.getAddress(), await wbnb.getAddress(), timelock.address, await registry.getAddress());
  await (await router2.setLiquidity(0)).wait();
  await (await token.approve(await adapter2.getAddress(), 100)).wait();
  await expectRevert(async () => adapter2.graduate(await token.getAddress(), base, { value: 1 }), "ZeroLiquidity");

  const factory3 = await deploy(A.factory, signer);
  const router3 = await deploy(A.router, signer, await factory3.getAddress(), await wbnb.getAddress());
  const adapter3 = await deploy(A.adapter, signer, await factory3.getAddress(), await router3.getAddress(), await wbnb.getAddress(), timelock.address, await registry.getAddress());
  await (await token.approve(await adapter3.getAddress(), 100)).wait();
  await (await adapter3.graduate(await token.getAddress(), base, { value: 1 })).wait();
  const pairAddress = await factory3.getPair(await token.getAddress(), await wbnb.getAddress());
  const pair = new Contract(pairAddress, A.pair.abi, provider);
  assert.equal(await pair.balanceOf(timelock.address), 1n);
  assert.equal(await token.allowance(await adapter3.getAddress(), await router3.getAddress()), 0n);
  assert.equal(await adapter3.isVerifiedPool(await token.getAddress(), pairAddress), true);
  await expectRevert(async () => adapter3.graduate(await token.getAddress(), base, { value: 1 }), "Replay");

  const router4 = await deploy(A.router, signer, await factory3.getAddress(), await wbnb.getAddress());
  const adapter4 = await deploy(A.adapter, signer, await factory3.getAddress(), await router4.getAddress(), await wbnb.getAddress(), timelock.address, await registry.getAddress());
  await (await router4.setActualToken(99, true)).wait();
  await (await token.approve(await adapter4.getAddress(), 100)).wait();
  await expectRevert(async () => adapter4.graduate(await token.getAddress(), base, { value: 1 }), "Slippage");

  console.log("[stage] assertions complete");
  console.log("PASS adapter runtime: constructor configuration, authorization, timelock/amount/parameter checks, pair validation, zero liquidity, LP custody, allowance reset, replay, and slippage rollback");
}

main().catch((error) => {
  console.error(`FAIL adapter runtime: ${error.stack ?? error.message}`);
  process.exitCode = 1;
}).finally(() => {
  if (anvilProcess) anvilProcess.kill("SIGTERM");
});
