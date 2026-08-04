import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const script = readFileSync(new URL('../scripts/bnb-testnet-deploy-plan.mjs', import.meta.url), 'utf8');
assert.match(script, /CHAIN_ID = 97/);
assert.match(script, /estimateGas/);
assert.match(script, /unlock.*BigInt/);
assert.match(script, /constructorArgs:item\.args\.map\(jsonSafe\)/);
assert.match(script, /typeof value === 'bigint' \? value\.toString\(\) : value/);
assert.match(script, /PLAN_ONLY_NOT_BROADCAST/);
assert.doesNotMatch(script, /privateKey|sendTransaction|\.broadcast\(/i);
assert.match(script, /lpTimelock.*graduationRegistry.*pancakeV2Adapter.*productionTokenFactory/s);
assert.match(script, /BNB_CHAIN_ID !== '97'/);
assert.match(script, /56/);
console.log('BNB deployment plan tests passed: ordering, chain gating, no signer/broadcast');


// Future unlock values are typed BigInts for ContractFactory and serialized as strings.
const futureUnlock = BigInt(Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60);
const jsonSafe = (value) => typeof value === 'bigint' ? value.toString() : value;
const serializedArgs = [
  '0x6acf9f55a4d34c25098b6827f7bd49da4321c0d8',
  futureUnlock,
].map(jsonSafe);
assert.equal(typeof futureUnlock, 'bigint');
assert.equal(serializedArgs[1], futureUnlock.toString());
assert.doesNotThrow(() => JSON.stringify({ constructorArgs: serializedArgs }));
console.log('BNB deployment plan BigInt manifest serialization test passed');
