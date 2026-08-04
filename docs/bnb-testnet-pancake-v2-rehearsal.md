# BNB Testnet PancakeSwap V2 graduation rehearsal

This milestone adds a **read-only, fail-closed diagnostic** for a wallet-signed BNB Smart Chain Testnet rehearsal. It does not deploy contracts, sign transactions, add liquidity, or operate on Mainnet. No PancakeSwap address is embedded because addresses must be independently verified before configuration.

## Configuration

Provide all values through an uncommitted environment (never commit keys or secrets):

```sh
export BNB_TESTNET_RPC_URL='https://<owner-approved-bnb-testnet-rpc>'
export PANCAKE_V2_TESTNET_FACTORY='0x<verified-testnet-factory>'
export PANCAKE_V2_TESTNET_ROUTER='0x<verified-testnet-router>'
export PANCAKE_V2_TESTNET_WBNB='0x<verified-testnet-wbnb>'
export BNB_GRADUATION_ADAPTER='0x<deployed-testnet-adapter>'
export BNB_LP_TIMELOCK='0x<owner-approved-timelock>'
export BNB_GRADUATION_REGISTRY='0x<deployed-testnet-registry>'
# Optional, for bytecode validation only:
export BNB_REHEARSAL_TOKEN='0x<created-testnet-token>'
node scripts/bnb-testnet-pancake-diagnostic.mjs
```

The diagnostic checks RPC `eth_chainId == 97`, runtime bytecode at every configured address, router `factory()` and `WETH()` consistency, and optional token bytecode. It never calls a state-changing method and does not need a private key or funded wallet. It rejects Mainnet-looking RPC configuration and exits nonzero on any missing or inconsistent value.

## Required follow-up for a live rehearsal

A separately reviewed wallet-run procedure must first verify the deployed adapter constructor values, authorized curve/registry binding, and the owner-approved LP timelock. The wallet must then submit the existing `graduate` call with explicit token/native amounts, slippage minima, deadline, nonce, and `lpTimelock`; the adapter's on-chain authorization, exact-transfer, pair verification, LP custody, replay, and chain deployment controls remain authoritative. Capture transaction receipts, pair address, LP balance at the timelock, and post-call adapter/token balances for reconciliation.

No Testnet Pancake factory/router/WBNB addresses were present in this repository at implementation time, so no live configuration or deployment is claimed. Do not add chain 56 defaults, private keys, or a UI enablement until the verified Testnet addresses and funded QA wallet are available and independently reviewed.
