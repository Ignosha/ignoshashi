# BNB Testnet wallet-signed deployment preflight

This is a **read-only** preparation flow for chain ID **97 (BNB Smart Chain Testnet)**. It compiles the production artifacts, checks the live Pancake V2 router dependencies, checks deployer funds, and estimates both deployment transactions. It never signs, submits, or stores a private key.

## Required explicit environment

```sh
export BNB_TESTNET_RPC_URL='https://data-seed-prebsc-1-s1.bnbchain.org:8545'
export BNB_CHAIN_ID='97'
export BNB_DEPLOYER_ADDRESS='0x...'
export BNB_PANCAKE_ROUTER_ADDRESS='0x...'
export BNB_ADAPTER_TIMELOCK_ADDRESS='0x...'
export BNB_GRADUATION_REGISTRY_ADDRESS='0x...'
export BNB_PLATFORM_FEE_RECIPIENT='0x...'
export BNB_FEE_BPS='100'
export BNB_PLATFORM_SHARE_BPS='50'
export BNB_MIN_LP_TIMELOCK_SECONDS='...' 
# Address-shaped placeholder used only to estimate factory deployment. Replace in
# the unsigned factory calldata with the adapter address after adapter confirms.
export BNB_ADAPTER_ADDRESS_FOR_ESTIMATE='0x...'
```

The router must report factory `0xb7926c0430afb07aa7defde6da862ae0bde767bc` and WBNB `0xae13d989dac2f0debff460ac112a837c89baa7cd`; any mismatch aborts. The script refuses absent variables, any chain other than 97, and invalid addresses.

## Run

```sh
node scripts/bnb-testnet-wallet-preflight.mjs > bnb-preflight.json
```

Review the JSON and gas budget. The output contains unsigned deployment calldata with `from`, `chainId`, and estimated gas. In a browser wallet (MetaMask/Rabby), select BNB Testnet, confirm the account exactly matches `BNB_DEPLOYER_ADDRESS`, paste/use the adapter transaction first, wait for confirmation, then replace the factory estimate placeholder with the confirmed adapter address and regenerate the factory calldata (or use the factory calldata only if it was already generated with the confirmed address). Confirm each transaction in the wallet. This repository/environment must not receive a private key.

## Public deployment manifest

Save a reviewed public-only JSON manifest (never seed phrases/private keys):

```json
{
  "schema": "ignoshashi.bnb-testnet-deployment.v1",
  "status": "CONFIRMED",
  "chainId": 97,
  "deployer": "0x...",
  "adapterAddress": "0x...",
  "adapterTxHash": "0x...",
  "factoryAddress": "0x...",
  "factoryTxHash": "0x...",
  "router": "0x...",
  "routerFactory": "0xb7926c0430afb07aa7defde6da862ae0bde767bc",
  "wbnb": "0xae13d989dac2f0debff460ac112a837c89baa7cd",
  "verifiedAt": "YYYY-MM-DDTHH:mm:ssZ"
}
```

Do not mark `CONFIRMED` until receipts have status 1 and runtime bytecode/public constructor configuration have been independently checked. This preflight intentionally does not deploy live transactions.
