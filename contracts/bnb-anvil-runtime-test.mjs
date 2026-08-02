#!/usr/bin/env node
/** Real local-EVM runtime harness for the BNB bonding-curve contracts. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Contract, ContractFactory, JsonRpcProvider, Wallet, NonceManager, getAddress } from "ethers";

const root = resolve(import.meta.dirname, "..");
const artifactPath = resolve(root, "src/contracts/abis/BnbSmartChainTestnetTokenFactory.json");
const tokenArtifactPath = resolve(root, "src/contracts/abis/BnbSmartChainTestnetBondingCurve.json");
const ANVIL_DEFAULT_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const ANVIL_PLATFORM_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const rpcUrl = process.env.BNB_TEST_RPC_URL?.trim() || "http://127.0.0.1:8545";
const STEP_TIMEOUT = 10_000;
const OVERALL_TIMEOUT = Number(process.env.BNB_ANVIL_OVERALL_TIMEOUT_MS || 150_000);

function loadArtifact(path, label) {
  let artifact;
  try { artifact = JSON.parse(readFileSync(path, "utf8")); } catch { throw new Error(`${label} artifact missing at ${path}; compile artifacts first`); }
  assert.ok(Array.isArray(artifact.abi), `${label} ABI missing`);
  assert.match(artifact.bytecode, /^0x[0-9a-f]+$/i, `${label} bytecode missing`);
  assert.ok(artifact.bytecode.length > 100, `${label} bytecode is empty`);
  return artifact;
}

async function withTimeout(promise, message, ms = STEP_TIMEOUT) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); })]); }
  finally { clearTimeout(timer); }
}
async function stage(name, action) {
  // stderr is intentionally used for markers: Actions streams it even when a step is killed.
  const startedAt = Date.now();
  console.error(`[bnb-anvil] START ${name}`);
  try {
    const result = await withTimeout(Promise.resolve().then(action), `${name} timed out after ${STEP_TIMEOUT}ms`);
    console.error(`[bnb-anvil] DONE ${name} (+${Date.now() - startedAt}ms)`);
    return result;
  } catch (error) {
    throw new Error(`${name}: ${error?.shortMessage || error?.reason || error?.message || error}`);
  }
}
async function sendAndWait(label, txPromise) {
  const tx = await withTimeout(txPromise, `${label} submission timed out`);
  assert.ok(tx?.hash, `${label} did not return a transaction hash`);
  console.error(`[bnb-anvil] SUBMITTED ${label} ${tx.hash}`);
  const receipt = await withTimeout(tx.wait(), `${label} receipt timed out`);
  console.error(`[bnb-anvil] RECEIPT ${label}`);
  return receipt;
}
async function expectRevert(action, expected, label = `expected ${expected}`) {
  try { await withTimeout(action(), `${label} timed out`); }
  catch (error) { const text = String(error?.shortMessage || error?.reason || error?.message || error); assert.ok(text.includes(expected), `expected ${expected}, got ${text}`); console.log(`[bnb-anvil] ${label}: observed ${expected}`); return; }
  assert.fail(`expected transaction to revert with ${expected}`);
}

async function main() {
  const factoryArtifact = loadArtifact(artifactPath, "BNB factory");
  const tokenArtifact = loadArtifact(tokenArtifactPath, "BNB bonding curve");
  let url; try { url = new URL(rpcUrl); } catch { throw new Error(`BNB_TEST_RPC_URL is not a valid URL: ${rpcUrl}`); }
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "::1"].includes(url.hostname)) throw new Error("refusing non-loopback RPC; this harness is local Anvil-only");
  const provider = new JsonRpcProvider(rpcUrl, undefined, { staticNetwork: false });
  const chainId = BigInt(await stage("RPC chain ID", () => provider.send("eth_chainId", [])));
  assert.equal(chainId, 31337n, `expected Anvil chain ID 31337, got ${chainId}`);
  const signer = new NonceManager(new Wallet(process.env.BNB_TEST_PRIVATE_KEY?.trim() || ANVIL_DEFAULT_KEY, provider));
  const creator = await signer.getAddress();
  const platformSigner = new NonceManager(process.env.BNB_TEST_PLATFORM_PRIVATE_KEY?.trim() ? new Wallet(process.env.BNB_TEST_PLATFORM_PRIVATE_KEY.trim(), provider) : new Wallet(ANVIL_PLATFORM_KEY, provider));
  const platform = getAddress(process.env.BNB_TEST_PLATFORM_ADDRESS?.trim() || await platformSigner.getAddress());
  assert.equal(platform, await platformSigner.getAddress(), "BNB_TEST_PLATFORM_ADDRESS must match the supplied local platform key");
  const outsider = Wallet.createRandom().connect(provider);

  const factory = await stage("factory deployment", async () => {
    const deployed = await new ContractFactory(factoryArtifact.abi, factoryArtifact.bytecode, signer).deploy(platform, 100, 5000);
    await withTimeout(deployed.waitForDeployment(), "factory deployment receipt timed out");
    return deployed;
  });
  const factoryAddress = await factory.getAddress();
  const createReceipt = await stage("token creation", () => sendAndWait("createToken", factory.createToken("Anvil Meme", "ANV", 10_000, 1_000_000_000n, 1_000_000_000n)));
  const created = createReceipt.logs.map(log => { try { return factory.interface.parseLog(log); } catch { return null; } }).find(event => event?.name === "TokenCreated");
  assert.ok(created, "TokenCreated event missing");
  const tokenAddress = getAddress(created.args.token);
  const token = new Contract(tokenAddress, tokenArtifact.abi, signer);

  await stage("creation assertions", async () => { assert.equal(await factory.tokenCount(), 1n); assert.equal(await token.balanceOf(tokenAddress), 10_000n); assert.equal(await token.creator(), creator); });
  const amount = 100n;
  const [cost, fee] = await stage("buy quote", () => token.getBuyCost(amount));
  const total = cost + fee;
  await stage("buy", () => sendAndWait("buy", token.buy(amount, total, BigInt(Math.floor(Date.now() / 1000) + 300), { value: total })));
  await stage("buy assertions", async () => { assert.equal(await token.balanceOf(creator), amount); assert.equal(await token.trackedGraduationReserve(), cost); assert.equal(await token.feeCredits(platform), fee / 2n); assert.equal(await token.feeCredits(creator), fee - fee / 2n); });
  await stage("buy revert assertions", async () => { await expectRevert(() => token.buy(1, total, 0, { value: total }), "DEADLINE", "buy deadline revert"); await expectRevert(() => token.buy(1, 0, BigInt(Math.floor(Date.now() / 1000) + 300), { value: total }), "SLIPPAGE", "buy slippage revert"); });
  const sellAmount = 40n;
  const [proceeds, sellFee] = await stage("sell quote", () => token.getSellProceeds(sellAmount));
  const net = proceeds - sellFee;
  await stage("approval", () => sendAndWait("approve", token.approve(tokenAddress, sellAmount)));
  signer.reset();
  await stage("sell", () => sendAndWait("sell", token.sell(sellAmount, net, BigInt(Math.floor(Date.now() / 1000) + 300))));
  await stage("sell assertions", async () => { assert.equal(await token.balanceOf(creator), amount - sellAmount); assert.equal(await token.trackedGraduationReserve(), cost - net); assert.equal(await token.feeCredits(platform), fee / 2n + sellFee / 2n); assert.equal(await token.feeCredits(creator), fee - fee / 2n + sellFee - sellFee / 2n); });
  await stage("sell revert assertions", async () => { await expectRevert(() => token.sell(1, net + 1n, BigInt(Math.floor(Date.now() / 1000) + 300)), "SLIPPAGE", "sell slippage revert"); await expectRevert(() => token.sell(1, 0, 0), "DEADLINE", "sell deadline revert"); });
  await stage("fee withdrawal assertions", async () => { const outsiderToken = token.connect(outsider); await expectRevert(() => outsiderToken.withdrawFees(), "NO_FEES", "outsider fee withdrawal revert"); await sendAndWait("platform fee withdrawal", token.connect(platformSigner).withdrawFees()); assert.equal(await token.feeCredits(platform), 0n); await sendAndWait("creator fee withdrawal", token.withdrawFees()); assert.equal(await token.feeCredits(creator), 0n); });
  await stage("graduation gate assertions", async () => { await expectRevert(() => token.requestGraduation(outsider.address), "BNB_GRADUATION_GATED", "outsider graduation request"); await expectRevert(() => token.executeGraduation(), "BNB_GRADUATION_GATED", "graduation execution"); });
  console.log(`PASS BNB Anvil runtime: chain ${chainId}, factory ${factoryAddress}, token ${tokenAddress}`);
  console.log("PASS create, custody, buy/sell, fee credits/withdrawal, deadline/slippage, and graduation gates");
}

const hardStop = setTimeout(() => { console.error(`FAIL BNB Anvil runtime: overall timeout after ${OVERALL_TIMEOUT}ms (last stage may be stuck in RPC/nonce/receipt handling)`); process.exit(124); }, OVERALL_TIMEOUT);
hardStop.unref();
main().catch(error => { console.error(`FAIL BNB Anvil runtime: ${error.message}`); process.exitCode = 1; }).finally(() => clearTimeout(hardStop));
