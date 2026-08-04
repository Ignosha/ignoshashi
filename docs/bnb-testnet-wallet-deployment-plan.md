# BNB Testnet wallet deployment plan (chain 97 only)

This is a **plan-only** flow. `scripts/bnb-testnet-deploy-plan.mjs` compiles the exact checked-in contracts, validates constructor inputs and bytecode, verifies RPC chain ID 97, estimates gas, and writes unsigned contract-creation calldata. It never imports a private key, creates a signer, calls `sendTransaction`, or broadcasts.

## Reviewed deployment order

1. `BnbLpTimelockV1(beneficiary, unlockTimestamp)` — custody first.
2. `BnbGraduationRegistryV1(deployer)` — registry owner is the browser wallet.
3. `PancakeV2GraduationAdapterV1(pancakeFactory, router, WBNB, lpTimelock, registry)` — dependencies must be confirmed from receipts.
4. `BnbProductionTokenFactoryV1(platformFeeRecipient, totalFeeBps, platformFeeBps, adapter, lpTimelock)` — production factory last.

The registry API is the actual checked-in `isAuthorizedGraduationCurve(curve, token)` mapping and `setAuthorizedGraduationCurve`; no invented interface is used. The adapter constructor verifies router/factory/WBNB relationships on chain.

## Running safely

Provide explicit values in an uncommitted shell. Live Testnet Pancake values are required as `BNB_PANCAKE_FACTORY`, `BNB_PANCAKE_ROUTER`, and `BNB_WBNB`; no defaults are supplied. The first run produces steps 1–2. After each wallet-confirmed receipt, rerun with `BNB_DEPLOYED_LP_TIMELOCK` and `BNB_DEPLOYED_GRADUATION_REGISTRY`; after step 3 also set `BNB_DEPLOYED_PANCAKE_V2_ADAPTER`. This is deliberate: later constructor calldata cannot safely be produced until prior addresses are receipt-confirmed.

```sh
BNB_CHAIN_ID=97 BNB_TESTNET_RPC_URL='https://data-seed-prebsc-1-s1.bnbchain.org:8545' \
BNB_DEPLOYER_ADDRESS='0x6acf9f55a4d34c25098b6827f7bd49da4321c0d8' \
BNB_LP_BENEFICIARY='0x...' BNB_LP_UNLOCK_TIMESTAMP='...' \
BNB_PLATFORM_FEE_RECIPIENT='0x...' BNB_TOTAL_FEE_BPS=100 BNB_PLATFORM_FEE_BPS=50 \
BNB_PANCAKE_FACTORY='0xb7926c0430afb07aa7defde6da862ae0bde767bc' \
BNB_PANCAKE_ROUTER='0x9Ac64Cc6e4415144C455BD8E4837Fea55603e5c3' \
BNB_WBNB='0xae13d989dac2f0debff460ac112a837c89baa7cd' \
node scripts/bnb-testnet-deploy-plan.mjs
```

The browser wallet must be manually switched to BNB Smart Chain Testnet, confirm chain ID **97**, review `to: null`, `value: 0`, constructor arguments and estimated gas, then approve one transaction at a time. Record each receipt and resulting address before the next run. A manifest with `status: PLAN_ONLY_NOT_BROADCAST`, chainId, deployer, order, network addresses, calldata, constructor args, estimates, and instructions is the public schema. Chain 56, Mainnet-looking RPCs, invalid addresses, expired timelocks, invalid fee splits, absent bytecode, and wrong RPC chain are rejected.
