# BNB Smart Chain Testnet execution milestone

`contracts/BnbSmartChainTestnetBondingCurve.sol` is a chain-neutral native-EVM implementation intended for BNB Smart Chain Testnet (chain ID 97). The factory constructor accepts a public platform recipient, total fee basis points, and platform share basis points; it has no network-specific address or secret. Each create deploys an isolated curve with contract-held token and BNB reserves. Wallet callers invoke `createToken`, `buy`, `sell`, and `withdrawFees` directly.

Safety controls include checked arithmetic, reentrancy guards around factory/create, buys, sells, and withdrawals, caller-supplied slippage and deadline checks, explicit token allowance for sells, and on-chain fee credits. The curve tracks only cost reserves; fees remain liabilities and cannot be withdrawn by other callers. `pool` remains zero and both graduation methods revert with `BNB_GRADUATION_GATED`: no DEX integration or graduation claim is present.

## Compile and tests

```sh
node contracts/compile-bnb-testnet.js
node contracts/bnb-runtime-mock-test.mjs
```

Compilation writes `src/contracts/abis/BnbSmartChainTestnetBondingCurve.json` and `BnbSmartChainTestnetTokenFactory.json`. The mock test is deterministic and does not use RPC, deployment, credentials, or private keys.

## Remaining gates

No BNB deployment or fees have occurred. Before enabling the site's wallet action, deploy only to BNB Testnet with a controlled test wallet, verify source and constructor values (platform recipient must be the owner-approved public address), perform real-wallet create/buy/approve/sell/withdraw QA, and configure the factory address only after verification. A real DEX adapter, pool creation, reserve/token verification, and security review are still required before any graduation path is added. The site factory address intentionally remains `null`.
