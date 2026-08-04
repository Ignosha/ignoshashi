#!/usr/bin/env node
import assert from "node:assert/strict";

const safeJsonStringify = (value) => JSON.stringify(value, (_key, nested) =>
  typeof nested === "bigint" ? `${nested}n` : nested,
);

class V1 {
  constructor({ supply=1000n, fee=100n, platform=50n, adapter=null, timelock="0x0000000000000000000000000000000000000001" }={}) {
    assert(supply > 0n && supply <= 10n**30n && fee <= 1000n && platform <= fee && adapter && /^0x[0-9a-fA-F]{40}$/.test(timelock) && timelock !== "0x0000000000000000000000000000000000000000", "INVALID_CONFIG");
    this.supply=supply; this.fee=fee; this.platform=platform; this.adapter=adapter; this.minTimelock=timelock.toLowerCase();
    this.current=0n; this.reserve=0n; this.native=0n; this.state="Active"; this.pool=null; this.nonce=0n; this.allowance=0n;
    this.bal=new Map([['curve',supply]]); this.credits=new Map();
  }
  cost(from,n) { const to=from+n; return 10n*n + 2n*(to*to-from*from)/(2n*this.supply); }
  credit(f) { const p=this.fee===0n?0n:f*this.platform/this.fee; this.credits.set('platform',(this.credits.get('platform')??0n)+p); this.credits.set('creator',(this.credits.get('creator')??0n)+f-p); }
  liabilities() { return (this.credits.get('platform')??0n)+(this.credits.get('creator')??0n); }
  buy(who,n) { assert(this.state==='Active','INACTIVE'); const c=this.cost(this.current,n), f=c*this.fee/10000n; this.current+=n; this.reserve+=c; this.native+=c+f; this.bal.set('curve',this.bal.get('curve')-n); this.bal.set(who,(this.bal.get(who)??0n)+n); this.credit(f); return {c,f}; }
  sell(who,n) { assert(this.state==='Active','INACTIVE'); const p=this.cost(this.current-n,n), f=p*this.fee/10000n; assert(this.reserve>=p-f,'RESERVE'); this.current-=n; this.reserve-=p-f; this.native-=p-f; this.bal.set(who,this.bal.get(who)-n); this.bal.set('curve',this.bal.get('curve')+n); this.credit(f); }
  request(p) { assert(this.state==='Active','ACTIVE'); assert(this.adapter,'ADAPTER_NOT_CONFIGURED'); assert(p.tokenAmount>0n&&p.nativeAmount>0n&&p.minTokenAmount<=p.tokenAmount&&p.minNativeAmount<=p.nativeAmount&&p.deadline>=0n,'INVALID_PARAMS'); assert(p.nonce===this.nonce,'INVALID_NONCE'); assert(typeof p.lpTimelock==='string' && /^0x[0-9a-fA-F]{40}$/.test(p.lpTimelock) && p.lpTimelock.toLowerCase()===this.minTimelock,'INVALID_TIMELOCK'); assert(p.nativeAmount<=this.reserve&&p.tokenAmount<=this.bal.get('curve'),'NOT_READY'); this.pending=p; this.state='Pending'; }
  execute(p, {success=true,pool='pool'}={}) { assert(this.state==='Pending'&&safeJsonStringify(p)===safeJsonStringify(this.pending),'NOT_PENDING'); const before={native:this.native,reserve:this.reserve,token:this.bal.get('curve'),liab:this.liabilities()}; this.allowance=p.tokenAmount; if(!success) { this.allowance=0n; assert.deepEqual({native:this.native,reserve:this.reserve,token:this.bal.get('curve'),liab:this.liabilities()},before); throw new Error('ADAPTER_FAILED'); } this.allowance=0n; this.bal.set('curve',before.token-p.tokenAmount); assert.equal(this.bal.get('curve'),before.token-p.tokenAmount); this.reserve-=p.nativeAmount; this.native-=p.nativeAmount; this.pool=pool; this.state='Graduated'; this.nonce++; }
  cancel() { assert(this.state==='Pending','NOT_PENDING'); this.state='Active'; this.pending=null; }
}
const c=new V1({adapter:'configured'}); const q=c.buy('alice',100n); assert.equal(q.c,1010n); c.sell('alice',40n); assert.equal(c.credits.get('platform'),7n); assert.equal(c.credits.get('creator'),7n);
assert.throws(()=>new V1({supply:0n,adapter:'x'}),/INVALID_CONFIG/); assert.throws(()=>new V1(),/INVALID_CONFIG/);
const p={tokenAmount:100n,nativeAmount:100n,minTokenAmount:99n,minNativeAmount:99n,deadline:0n,nonce:0n,lpTimelock:"0x0000000000000000000000000000000000000001"};
assert.throws(()=>c.request({...p,nonce:1n}),/INVALID_NONCE/); c.request(p); assert.equal(c.state,'Pending'); assert.equal(c.pool,null); const before=c.liabilities(); assert.throws(()=>c.execute(p,{success:false}),/ADAPTER_FAILED/); assert.equal(c.state,'Pending'); assert.equal(c.liabilities(),before); assert.equal(c.allowance,0n);
c.execute(p); assert.equal(c.state,'Graduated'); assert.equal(c.pool,'pool'); assert.equal(c.nonce,1n); assert.throws(()=>c.execute(p),/NOT_PENDING/); assert.throws(()=>c.request(p),/ACTIVE/);
const cancel=new V1({adapter:'configured'}); cancel.buy('bob',2n); cancel.request({...p,tokenAmount:2n,nativeAmount:20n,minTokenAmount:2n,minNativeAmount:20n}); cancel.cancel(); assert.equal(cancel.state,'Active'); assert.equal(cancel.reserve,20n); assert.equal(cancel.pool,null);
console.log('BNB production V1 harness passed: invalid params, exact handoff, liabilities, replay/state transitions, cancellation, fail-closed execution');
