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
async function sendAndWait(label, txPromise, provider) {
  const tx = await withTimeout(txPromise, `${label} submission timed out`);
  assert.ok(tx?.hash, `${label} did not return a transaction hash`);
  console.error(`[bnb-anvil] SUBMITTED ${label} ${tx.hash}`);
  try {
    const receipt = await withTimeout(tx.wait(), `${label} receipt timed out`);
    assert.equal(receipt?.status, 1, `${label} receipt status was not successful`);
    console.error(`[bnb-anvil] RECEIPT ${label}`);
    return receipt;
  } catch (error) {
    // Keep the receipt assertion strict, but expose whether the hash is pending or failed.
    const status = await withTimeout(provider.getTransactionReceipt(tx.hash), `${label} diagnostic receipt lookup timed out`, 2_000).catch(() => null);
    const pending = status === null;
    const reason = error?.message || error;
    throw new Error(`${label} receipt wait failed: ${reason} (hash ${tx.hash}; ${pending ? "still pending" : `status ${status.status}`})`);
  }
}
async function expectRevert(action, expected, label = `expected ${expected}`) {
  try { await withTimeout(action(), `${label} timed out`); }
  catch (error) { const text = String(error?.shortMessage || error?.reason || error?.message || error); assert.ok(text.includes(expected), `expected ${expected}, got ${text}`); console.error(`[bnb-anvil] ${label}: observed ${expected}`); return; }
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
  const creatorKey = process.env.BNB_TEST_PRIVATE_KEY?.trim() || ANVIL_DEFAULT_KEY;
  // The factory deployer is intentionally the same deterministic creator wallet used for
  // createToken. Reusing this provider-backed wallet avoids silently selecting a different
  // account while supplying the confirmed post-deployment nonce when pending is stale.
  let creatorSigner = new Wallet(creatorKey, provider);
  const deployer = await creatorSigner.getAddress();
  const creator = deployer;
  assert.equal(deployer, creator, "factory deployer and token creator must match");
  console.error(`[bnb-anvil] deployer ${deployer}; creator ${creator}`);
  console.error(`[bnb-anvil] signer identity verified before deployment`);
  const platformSigner = new Wallet(process.env.BNB_TEST_PLATFORM_PRIVATE_KEY?.trim() || ANVIL_PLATFORM_KEY, provider);
  const platform = getAddress(process.env.BNB_TEST_PLATFORM_ADDRESS?.trim() || await platformSigner.getAddress());
  assert.equal(platform, await platformSigner.getAddress(), "BNB_TEST_PLATFORM_ADDRESS must match the supplied local platform key");
  const outsider = Wallet.createRandom().connect(provider);

  let deploymentNonce;
  let deploymentReceipt;
  const factory = await stage("factory deployment", async () => {
    const deployed = await new ContractFactory(factoryArtifact.abi, factoryArtifact.bytecode, creatorSigner).deploy(platform, 100, 5000);
    const deploymentTx = deployed.deploymentTransaction();
    assert.ok(deploymentTx, "factory deployment transaction missing");
    deploymentNonce = deploymentTx.nonce;
    deploymentReceipt = await withTimeout(deploymentTx.wait(), "factory deployment receipt timed out");
    assert.equal(deploymentReceipt?.status, 1, "factory deployment receipt status was not successful");
    return deployed;
  });
  const factoryAddress = await factory.getAddress();
  const actualDeployer = await creatorSigner.getAddress();
  assert.equal(actualDeployer, deployer, "factory signer identity changed unexpectedly");
  const latestNonce = await provider.getTransactionCount(actualDeployer, "latest");
  const pendingNonce = await provider.getTransactionCount(actualDeployer, "pending");
  console.error(`[bnb-anvil] deployer ${actualDeployer}; deployment tx nonce ${deploymentNonce}; latest nonce ${latestNonce}; pending nonce ${pendingNonce}`);
  assert.ok(Number.isSafeInteger(deploymentNonce), `deployment nonce is invalid: ${deploymentNonce}`);
  assert.ok(latestNonce > deploymentNonce, `nonce inconsistent after factory deployment: latest ${latestNonce}, deployment tx ${deploymentNonce}`);
  // Some Anvil environments report a stale pending nonce after a receipt. The
  // confirmed latest nonce is authoritative for this next createToken tx; retain
  // the diagnostic pending value but do not reject it when it lags latest.
  const createNonce = latestNonce > pendingNonce ? latestNonce : pendingNonce;
  assert.ok(Number.isSafeInteger(createNonce), `create nonce is invalid: ${createNonce}`);
  const createFactory = factory.connect(creatorSigner);
  // Do not infer the mined nonce from a post-receipt transaction-count query:
  // some Anvil/RPC combinations cache both latest and pending counts. Inspect the
  // submitted transaction and its confirmed receipt instead.
  const createTx = await withTimeout(createFactory.createToken("Anvil Meme", "ANV", 10_000, 1_000_000_000n, 1_000_000_000n, { nonce: createNonce }), "createToken submission timed out");
  assert.ok(createTx?.hash, "createToken did not return a transaction hash");
  const createReceipt = await stage("token creation", () => sendAndWait("createToken", Promise.resolve(createTx), provider));
  const minedCreateTx = await withTimeout(provider.getTransaction(createTx.hash), "createToken transaction lookup timed out");
  assert.ok(minedCreateTx, `createToken transaction ${createTx.hash} not found after receipt confirmation`);
  assert.equal(createReceipt?.status, 1, "createToken receipt status was not successful");
  assert.equal(getAddress(createReceipt.from), actualDeployer, "createToken receipt sender mismatch");
  assert.equal(getAddress(minedCreateTx.from), actualDeployer, "createToken transaction sender mismatch");
  const minedCreateNonce = minedCreateTx.nonce;
  assert.ok(Number.isSafeInteger(minedCreateNonce), `mined create nonce is invalid: ${minedCreateNonce}`);
  assert.equal(minedCreateNonce, createNonce, "createToken nonce differs from the submitted nonce");
  // Refresh state once more, but use the confirmed transaction nonce as the
  // source of truth. Seed a NonceManager to the next nonce even if pending is
  // stale; all subsequent creator transactions then serialize locally.
  await provider.getBlockNumber();
  const refreshedPendingNonce = Number(await provider.send("eth_getTransactionCount", [actualDeployer, "pending"]));
  const nextCreatorNonce = minedCreateNonce + 1;
  creatorSigner = new NonceManager(new Wallet(creatorKey, provider));
  for (let nonce = refreshedPendingNonce; nonce < nextCreatorNonce; nonce += 1) creatorSigner.increment();
  console.error(`[bnb-anvil] createToken mined nonce ${minedCreateNonce}; refreshed pending nonce ${refreshedPendingNonce}; next creator nonce ${nextCreatorNonce}`);
  const created = createReceipt.logs.map(log => { try { return factory.interface.parseLog(log); } catch { return null; } }).find(event => event?.name === "TokenCreated");
  assert.ok(created, "TokenCreated event missing");
  const tokenAddress = getAddress(created.args.token);
  const token = new Contract(tokenAddress, tokenArtifact.abi, creatorSigner);

  await stage("creation assertions", async () => { assert.equal(await factory.tokenCount(), 1n); assert.equal(await token.balanceOf(tokenAddress), 10_000n); assert.equal(await token.creator(), creator); });
  const amount = 100n;
  const [cost, fee] = await stage("buy quote", () => token.getBuyCost(amount));
  const total = cost + fee;
  await stage("buy", () => sendAndWait("buy", token.buy(amount, total, BigInt(Math.floor(Date.now() / 1000) + 300), { value: total }), provider));
  await stage("buy assertions", async () => { assert.equal(await token.balanceOf(creator), amount); assert.equal(await token.trackedGraduationReserve(), cost); assert.equal(await token.feeCredits(platform), fee / 2n); assert.equal(await token.feeCredits(creator), fee - fee / 2n); });
  await stage("buy revert assertions", async () => { await expectRevert(() => token.buy(1, total, 0, { value: total }), "DEADLINE", "buy deadline revert"); await expectRevert(() => token.buy(1, 0, BigInt(Math.floor(Date.now() / 1000) + 300), { value: total }), "SLIPPAGE", "buy slippage revert"); });
  const sellAmount = 40n;
  const [proceeds, sellFee] = await stage("sell quote", () => token.getSellProceeds(sellAmount));
  const net = proceeds - sellFee;
  await stage("approval", () => sendAndWait("approve", token.approve(tokenAddress, sellAmount), provider));
  await stage("sell", () => sendAndWait("sell", token.sell(sellAmount, net, BigInt(Math.floor(Date.now() / 1000) + 300)), provider));
  await stage("sell assertions", async () => { assert.equal(await token.balanceOf(creator), amount - sellAmount); assert.equal(await token.trackedGraduationReserve(), cost - net); assert.equal(await token.feeCredits(platform), fee / 2n + sellFee / 2n); assert.equal(await token.feeCredits(creator), fee - fee / 2n + sellFee - sellFee / 2n); });
  await stage("sell revert assertions", async () => { await expectRevert(() => token.sell(1, net + 1n, BigInt(Math.floor(Date.now() / 1000) + 300)), "SLIPPAGE", "sell slippage revert"); await expectRevert(() => token.sell(1, 0, 0), "DEADLINE", "sell deadline revert"); });
  await stage("fee withdrawal assertions", async () => { const outsiderToken = token.connect(outsider); await expectRevert(() => outsiderToken.withdrawFees(), "NO_FEES", "outsider fee withdrawal revert"); await sendAndWait("platform fee withdrawal", token.connect(platformSigner).withdrawFees(), provider); assert.equal(await token.feeCredits(platform), 0n); await sendAndWait("creator fee withdrawal", token.withdrawFees(), provider); assert.equal(await token.feeCredits(creator), 0n); });
  await stage("graduation gate assertions", async () => { await expectRevert(() => token.requestGraduation(outsider.address), "BNB_GRADUATION_GATED", "outsider graduation request"); await expectRevert(() => token.executeGraduation(), "BNB_GRADUATION_GATED", "graduation execution"); });
  console.log(`PASS BNB Anvil runtime: chain ${chainId}, factory ${factoryAddress}, token ${tokenAddress}`);
  console.log("PASS create, custody, buy/sell, fee credits/withdrawal, deadline/slippage, and graduation gates");
}

const hardStop = setTimeout(() => { console.error(`FAIL BNB Anvil runtime: overall timeout after ${OVERALL_TIMEOUT}ms (last stage may be stuck in RPC/nonce/receipt handling)`); process.exit(124); }, OVERALL_TIMEOUT);
hardStop.unref();
main().catch(error => { console.error(`FAIL BNB Anvil runtime: ${error.message}`); process.exitCode = 1; }).finally(() => clearTimeout(hardStop));
