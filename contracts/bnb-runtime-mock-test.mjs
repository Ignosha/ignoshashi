#!/usr/bin/env node
import assert from "node:assert/strict";

class Curve {
  constructor({ creator = "alice", platform = "treasury", feeBps = 100, platformBps = 5000, supply = 1000n }) {
    this.creator = creator; this.platform = platform; this.feeBps = BigInt(feeBps); this.platformBps = BigInt(platformBps);
    this.supply = supply; this.current = 0n; this.reserve = 0n; this.balance = new Map([["curve", supply]]);
    this.credits = new Map(); this.entered = false; this.pool = null;
  }
  cost(from, amount) { const to = from + amount; return 10n * amount + (2n * (to * to - from * from)) / (2n * this.supply); }
  guard(fn) { assert.equal(this.entered, false, "REENTRANCY"); this.entered = true; try { return fn(); } finally { this.entered = false; } }
  credit(fee) { const p = fee * this.platformBps / 10000n; this.credits.set(this.platform, (this.credits.get(this.platform) ?? 0n) + p); this.credits.set(this.creator, (this.credits.get(this.creator) ?? 0n) + fee - p); }
  buy(who, amount, max, deadline, now = 1) { return this.guard(() => { assert(now <= deadline, "DEADLINE"); assert(this.current + amount <= this.supply, "INVALID_AMOUNT"); const cost = this.cost(this.current, amount); const fee = cost * this.feeBps / 10000n; assert(cost + fee <= max, "SLIPPAGE"); this.current += amount; this.reserve += cost; this.balance.set("curve", this.balance.get("curve") - amount); this.balance.set(who, (this.balance.get(who) ?? 0n) + amount); this.credit(fee); return { cost, fee }; }); }
  sell(who, amount, min, deadline, now = 1) { return this.guard(() => { assert(now <= deadline, "DEADLINE"); assert((this.balance.get(who) ?? 0n) >= amount, "TOKEN"); const proceeds = this.cost(this.current - amount, amount); const fee = proceeds * this.feeBps / 10000n; const net = proceeds - fee; assert(net >= min, "SLIPPAGE"); assert(this.reserve >= net, "RESERVE"); this.current -= amount; this.reserve -= net; this.balance.set(who, this.balance.get(who) - amount); this.balance.set("curve", this.balance.get("curve") + amount); this.credit(fee); return net; }); }
  graduate() { throw new Error("BNB_GRADUATION_GATED"); }
}
const c = new Curve({});
const bought = c.buy("alice", 100n, 2000n, 5);
assert.equal(bought.cost, 1010n); assert.equal(c.reserve, 1010n); assert.equal(c.balance.get("curve"), 900n);
assert.equal(c.credits.get("treasury"), 5n); assert.equal(c.credits.get("alice"), 5n);
assert.throws(() => c.buy("alice", 1n, 1n, 5), /SLIPPAGE/);
assert.throws(() => c.buy("alice", 1n, 100n, 0), /DEADLINE/);
assert.throws(() => c.guard(() => c.guard(() => {})), /REENTRANCY/);
const paid = c.sell("alice", 40n, 0n, 5); assert.equal(paid, 402n); assert.equal(c.reserve, 608n);
assert.throws(() => c.sell("alice", 1n, 999n, 5), /SLIPPAGE/);
assert.throws(() => c.graduate(), /BNB_GRADUATION_GATED/);
console.log("BNB mock state-machine tests passed: custody, math, fee split, slippage/deadline, reentrancy, gated graduation");
