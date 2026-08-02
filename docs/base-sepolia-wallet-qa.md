# Base Sepolia real-wallet QA (owner confirmation required)

Factory: `0x4Ed3f3925D1cd5fEd721Baf49A8a7f557dA62572` (chain ID `84532`).

Run the read-only checks first:

```bash
bun scripts/base-sepolia-readonly-qa.mjs
```

The script uses only the public RPC and never reads or uses private-key environment
variables. It does not submit transactions.

## Wallet-signed create flow

Use the owner-funded browser wallet, switch to **Base Sepolia (84532)**, and verify
the connected account is exactly `0x10636e231339e774D0ee150c9CB158836DCcF510`.

Encode and present this call to the wallet (the owner must explicitly review and
confirm the transaction; do not call `eth_sendTransaction` before that confirmation):

- `to`: `0x4Ed3f3925D1cd5fEd721Baf49A8a7f557dA62572`
- `value`: `0`
- function: `createToken(string n, string s, uint256 supply, uint256 base, uint256 slope)`
- suggested test args: `Wallet QA Token`, `WQA`, `1000000`, `1000000000000`, `1000000000`
- gas: estimate in the wallet/provider; do not use the deployer key

After the owner confirms, wait for a receipt with status `1`, then verify a
`TokenCreated(address indexed token, address indexed creator, string name, string symbol, uint256 supply)`
event from the factory. Confirm `creator` is the owner wallet, and record only the
public tx hash, receipt status, block, and emitted token address. A rejected,
reverted, or unconfirmed request is not token creation.
